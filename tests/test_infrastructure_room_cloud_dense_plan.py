"""10,000+ direct-child SQL plan gate against production owner statements.

This is a deliberately isolated SQL planner fixture, not authoritative SOMA
data, a mutation, a full SQLCipher benchmark, or a substitute for owner
integration tests. Index DDL comes directly from runtime migration 0014.
The production _children owner builds and executes every page statement.
"""
from __future__ import annotations

import re
import sqlite3
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

import pytest

from soma.infrastructure.queries import room_cloud
from soma.infrastructure.repositories.core import rows as owner_rows


DENSITY = 10_017
PAGE_LIMIT = 100
INDEXES = ("infra_004", "infra_005", "infra_013", "infra_018")


def _id(number: int) -> str:
    return str(UUID(int=number, version=4))


@pytest.fixture
def dense_indexed_reader():
    connection = sqlite3.connect(":memory:")
    try:
        connection.executescript(
            """
            CREATE TABLE sites (
                site_id TEXT PRIMARY KEY, customer_org_id TEXT NOT NULL
            ) STRICT;
            CREATE TABLE rooms (
                room_id TEXT PRIMARY KEY, site_id TEXT NOT NULL,
                name TEXT NOT NULL, lifecycle_state TEXT NOT NULL,
                revision INTEGER NOT NULL
            ) STRICT;
            CREATE TABLE racks (
                rack_id TEXT PRIMARY KEY, room_id TEXT NOT NULL,
                name TEXT NOT NULL, lifecycle_state TEXT NOT NULL
            ) STRICT;
            CREATE TABLE network_elements (
                network_element_id TEXT PRIMARY KEY, site_id TEXT NOT NULL,
                operational_name TEXT NOT NULL, lifecycle_state TEXT NOT NULL
            ) STRICT;
            CREATE TABLE network_element_placement_current (
                network_element_id TEXT PRIMARY KEY, rack_id TEXT NULL
            ) STRICT;
            CREATE TABLE cloud_types (cloud_type_id TEXT PRIMARY KEY) STRICT;
            CREATE TABLE cloud_deployments (
                cloud_deployment_id TEXT PRIMARY KEY,
                cloud_type_id TEXT NOT NULL, site_id TEXT NOT NULL,
                name TEXT NOT NULL, lifecycle_state TEXT NOT NULL,
                revision INTEGER NOT NULL
            ) STRICT;
            CREATE TABLE cloud_assignment_current (
                network_element_id TEXT PRIMARY KEY,
                cloud_deployment_id TEXT NOT NULL
            ) STRICT;
            CREATE TABLE network_element_containment_current (
                child_network_element_id TEXT PRIMARY KEY,
                parent_network_element_id TEXT NOT NULL
            ) STRICT;
            """
        )
        migration = (
            Path(__file__).resolve().parents[1]
            / "src/soma/migrations/0014_infrastructure.sql"
        ).read_text(encoding="utf-8")
        for name in INDEXES:
            match = re.search(rf"CREATE INDEX {name} ON [^;]+;", migration)
            assert match, f"Missing accepted Infrastructure index {name}"
            connection.execute(match.group(0))

        site_id, room_id = _id(600_000), _id(700_000)
        cloud_type_id, cloud_id = _id(800_000), _id(900_000)
        ne_ids = [_id(2_000_000 + index) for index in range(DENSITY)]
        # A parent-selective count requires at least one unrelated Cloud
        # partition. If every assignment belongs to the target Cloud,
        # SQLite can rationally prefer a table scan over an index lookup.
        foreign_cloud = _id(900_001)
        foreign_ne_ids = [_id(4_000_000 + index) for index in range(DENSITY)]
        connection.execute(
            "INSERT INTO sites VALUES (?,?)", (site_id, _id(500_000))
        )
        connection.execute(
            "INSERT INTO rooms VALUES (?,?,?,?,?)",
            (room_id, site_id, "Dense Room", "active", 1),
        )
        connection.execute("INSERT INTO cloud_types VALUES (?)", (cloud_type_id,))
        connection.execute(
            "INSERT INTO cloud_deployments VALUES (?,?,?,?,?,?)",
            (cloud_id, cloud_type_id, site_id, "Dense Cloud", "active", 1),
        )
        connection.execute(
            "INSERT INTO cloud_deployments VALUES (?,?,?,?,?,?)",
            (foreign_cloud, cloud_type_id, site_id, "Unrelated Cloud", "active", 1),
        )
        connection.executemany(
            "INSERT INTO racks VALUES (?,?,?,?)",
            (
                (_id(1_000_000 + i), room_id, f"Rack {i}",
                 "active" if i % 2 else "archived")
                for i in range(DENSITY)
            ),
        )
        connection.executemany(
            "INSERT INTO network_elements VALUES (?,?,?,?)",
            (
                (node, site_id, f"Node {i}",
                 "active" if i % 2 else "archived")
                for i, node in enumerate(ne_ids)
            ),
        )
        connection.executemany(
            "INSERT INTO network_element_placement_current VALUES (?,NULL)",
            ((node,) for node in ne_ids),
        )
        connection.executemany(
            "INSERT INTO cloud_assignment_current VALUES (?,?)",
            ((node, cloud_id) for node in ne_ids),
        )
        connection.executemany(
            "INSERT INTO network_elements VALUES (?,?,?,?)",
            (
                (node, site_id, f"Unrelated Node {i}",
                 "active" if i % 2 else "archived")
                for i, node in enumerate(foreign_ne_ids)
            ),
        )
        connection.executemany(
            "INSERT INTO network_element_placement_current VALUES (?,NULL)",
            ((node,) for node in foreign_ne_ids),
        )
        connection.executemany(
            "INSERT INTO cloud_assignment_current VALUES (?,?)",
            ((node, foreign_cloud) for node in foreign_ne_ids),
        )
        connection.executemany(
            "INSERT INTO network_element_containment_current VALUES (?,?)",
            ((node, ne_ids[0]) for node in ne_ids[1:]),
        )
        connection.commit()
        connection.execute("ANALYZE")
        yield SimpleNamespace(
            connection=connection, site=site_id, room=room_id,
            cloud=cloud_id, foreign_cloud=foreign_cloud, parent=ne_ids[0],
        )
    finally:
        connection.close()


@pytest.mark.parametrize(
    "parent_kind,relationship,parent_field,lifecycle,index",
    [
        ("room", "room_racks", "room", None, "infra_004"),
        ("room", "room_racks", "room", "active", "infra_004"),
        ("site", "site_unracked_elements", "site", None, "infra_005"),
        ("cloud_deployment", "cloud_assigned_elements", "cloud", None, "infra_018"),
        ("cloud_deployment", "cloud_assigned_elements", "cloud", "archived", "infra_018"),
        ("network_element", "element_contained_elements", "parent", None, "infra_013"),
        ("network_element", "element_contained_elements", "parent", "active", "infra_013"),
    ],
)
def test_dense_related_child_pages_use_indexed_bounded_sort(
    dense_indexed_reader, monkeypatch,
    parent_kind, relationship, parent_field, lifecycle, index,
):
    """Exercise first and cursor pages with production SQL at >10,000 children."""
    reader = dense_indexed_reader
    captured = []

    def observed_rows(snapshot, sql, arguments=()):
        # Measure just the bounded paged SELECT. Global corruption guards
        # are separate queries and have not been certified O(page limit).
        plans = tuple(
            line[3] for line in reader.connection.execute(
                "EXPLAIN QUERY PLAN " + sql, arguments
            ).fetchall()
        )
        steps = 0

        def progress():
            nonlocal steps
            steps += 100
            return 0

        reader.connection.set_progress_handler(progress, 100)
        try:
            items = owner_rows(snapshot, sql, arguments)
        finally:
            reader.connection.set_progress_handler(None, 0)
        captured.append((plans, steps))
        return items

    monkeypatch.setattr(room_cloud, "rows", observed_rows)
    request = {
        "parent_kind": parent_kind,
        "parent_id": getattr(reader, parent_field),
        "relationship": relationship,
        "limit": PAGE_LIMIT,
    }
    if lifecycle is not None:
        request["lifecycle"] = lifecycle

    first = room_cloud.execute(
        None, reader, "InfrastructureRelationshipChildrenQuery", request
    )
    assert len(first["items"]) == PAGE_LIMIT
    assert first["next_cursor"] is not None
    second = room_cloud.execute(
        None, reader, "InfrastructureRelationshipChildrenQuery",
        {**request, "cursor": first["next_cursor"]},
    )
    assert len(second["items"]) == PAGE_LIMIT
    assert second["next_cursor"] is not None
    identities = [item["id"] for item in first["items"] + second["items"]]
    assert identities == sorted(identities)
    assert len(set(identities)) == 2 * PAGE_LIMIT
    assert all(item["parent_id"] == request["parent_id"] for item in first["items"])

    assert len(captured) in (2, 4)  # 1 indexed SELECT per lifecycle stream/page
    for plans, steps in captured:
        assert any(index in detail for detail in plans), plans
        assert not any("USE TEMP B-TREE" in detail for detail in plans), plans
        # Structural VM-work bound for one page at 10,017 children. This
        # catches the previous full-parent sort (100k+ VM opcodes).
        assert steps < 30_000, (relationship, lifecycle, steps, plans)


def test_dense_point_counts_use_declared_relationship_indexes(dense_indexed_reader):
    reader = dense_indexed_reader
    room = room_cloud.execute(None, reader, "RoomDetailQuery", {"room_id": reader.room})
    cloud = room_cloud.execute(
        None, reader, "CloudDeploymentDetailQuery",
        {"cloud_deployment_id": reader.cloud},
    )
    assert room["rack_count"] == DENSITY
    assert cloud["assigned_network_element_count"] == DENSITY
    assert reader.connection.execute(
        "SELECT count(*) FROM cloud_assignment_current WHERE cloud_deployment_id=?",
        (reader.foreign_cloud,),
    ).fetchone()[0] == DENSITY
    for sql, args, index in (
        ("SELECT count(*) FROM racks WHERE room_id=?", (reader.room,), "infra_004"),
        (
            "SELECT count(*) FROM cloud_assignment_current WHERE cloud_deployment_id=?",
            (reader.cloud,), "infra_018",
        ),
    ):
        details = [
            row[3] for row in reader.connection.execute(
                "EXPLAIN QUERY PLAN " + sql, args
            )
        ]
        assert any(index in item for item in details), details
