"""Runtime LLD-07 query registrations must be actually composed, not merely declared.

These are read-only endpoints; writes and unassembled LLD-07 commands retain
their fail-closed behavior. This catches fixture-only UI passing against a
source host whose inventory handler mapping lacks the owner query.
"""
from types import SimpleNamespace

import pytest

from soma.foundation.errors import SomaError, ValidationError
from soma.runtime_domains import DomainRoutes


def test_source_runtime_binds_existing_inventory_need_request_and_rma_read_owners(
    initialized_database, tmp_path
) -> None:
    database_path, factory_builder = initialized_database
    factory = factory_builder(database_path)
    domains = DomainRoutes(factory, SimpleNamespace(root=tmp_path))
    needs = domains.inventory.dispatch("GET", "/api/v1/inventory/needs", {"limit": 25})
    assert needs is not None and needs.status == 200
    assert needs.body["items"] == []
    assert needs.body["exact_total"] == 0

    requests = domains.inventory.dispatch(
        "GET", "/api/v1/inventory/requests", {"limit": 25, "as_of_utc": 100}
    )
    assert requests is not None and requests.status == 200
    assert requests.body["items"] == []
    assert requests.body["exact_total"] == 0
    assert requests.body["as_of_utc"] == 100

    missing = "11111111-1111-4111-8111-111111111111"
    for route in (
        "/api/v1/inventory/requests/" + missing,
        "/api/v1/inventory/rmas/" + missing,
    ):
        with pytest.raises(SomaError) as exc:
            domains.inventory.dispatch("GET", route, {})
        assert exc.value.code == "NOT_FOUND"
        with pytest.raises(ValidationError):
            domains.inventory.dispatch("GET", route, {"unaccepted_field": "no"})

    for kind in ("spare_need", "spare_request", "rma"):
        history = domains.inventory.dispatch(
            "GET", f"/api/v1/inventory/history/{kind}/{missing}", {"limit": 25}
        )
        assert history is not None and history.status == 200
        assert history.body == {"items": [], "continuation": None}
        # Neither unknown query fields nor values that shadow owner-scoped
        # path parameters may reach the Python owner as stray **kwargs.
        for forbidden in (
            {"unaccepted_field": "no"},
            {"target_kind": "rma"},
            {"target_id": missing},
        ):
            with pytest.raises(ValidationError, match="Inventory history query fields"):
                domains.inventory.dispatch(
                    "GET",
                    f"/api/v1/inventory/history/{kind}/{missing}",
                    forbidden,
                )

    # Declared mutation routes remain uncomposed; no accidental write handler.
    with pytest.raises(Exception, match="not assembled"):
        domains.inventory.dispatch("POST", "/api/v1/inventory/requests", {})

def test_fault_tag_registry_is_composed_without_mutation_routes(initialized_database, tmp_path):
    from soma.foundation.errors import IntegrityFailure

    path, builder = initialized_database
    domains = DomainRoutes(builder(path), SimpleNamespace(root=tmp_path))
    page = domains.fault_tags.dispatch("GET", "/api/v1/inventory/fault-tags", {"limit": 25})
    assert page is not None and page.status == 200
    assert page.body == {"items": [], "continuation": None, "exact_total": 0}
    with pytest.raises(ValidationError):
        domains.fault_tags.dispatch("GET", "/api/v1/inventory/fault-tags", {"unsupported": 1})
    with pytest.raises(ValidationError):
        domains.fault_tags.dispatch("GET", "/api/v1/inventory/fault-tags", {"archived": 1})
    missing = "11111111-1111-4111-8111-111111111111"
    with pytest.raises(SomaError) as exc:
        domains.fault_tags.dispatch("GET", "/api/v1/inventory/fault-tags/" + missing, {})
    assert exc.value.code == "NOT_FOUND"
    with pytest.raises(ValidationError):
        domains.fault_tags.dispatch("GET", "/api/v1/inventory/fault-tags/" + missing, {"wrong": True})
    eligible = domains.fault_tags.dispatch(
        "GET", "/api/v1/inventory/fault-tag-memberships/eligible", {"limit": 25}
    )
    assert eligible is not None and eligible.status == 200
    assert eligible.body == {"items": [], "continuation": None}
    queue = domains.fault_tags.dispatch(
        "GET", "/api/v1/inventory/warehouse/queue", {"limit": 25}
    )
    assert queue is not None and queue.status == 200
    assert queue.body == {"items": [], "continuation": None}
    for endpoint, name in (
        ("/api/v1/inventory/fault-tag-memberships/eligible", "after_rma_id"),
        ("/api/v1/inventory/warehouse/queue", "after_membership_id"),
    ):
        for rejected in (
            {"unsupported": "foreign"},
            {"target_id": missing},
            {name: "not-a-uuid"},
            {"limit": 0},
        ):
            with pytest.raises(ValidationError):
                domains.fault_tags.dispatch("GET", endpoint, rejected)
    lineage = domains.fault_tags.dispatch(
        "GET", "/api/v1/inventory/fault-tags/" + missing + "/lineage", {}
    )
    assert lineage is not None and lineage.status == 200
    assert lineage.body == {"fault_tag_id": missing, "edges": []}
    for forbidden in ({"unexpected": "input"}, {"fault_tag_id": missing}):
        with pytest.raises(ValidationError):
            domains.fault_tags.dispatch(
                "GET", "/api/v1/inventory/fault-tags/" + missing + "/lineage",
                forbidden,
            )
    with pytest.raises(IntegrityFailure, match="not assembled"):
        domains.fault_tags.dispatch("POST", "/api/v1/inventory/fault-tags", {})
    for endpoint in (
        "/api/v1/inventory/fault-tag-memberships/warehouse-receipt",
        "/api/v1/inventory/fault-tag-memberships/final-decision",
    ):
        with pytest.raises(IntegrityFailure, match="not assembled"):
            domains.fault_tags.dispatch("POST", endpoint, {})
