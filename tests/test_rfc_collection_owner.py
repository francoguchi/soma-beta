"""Read-only RFC register uses accepted canonical identity, hierarchy and archive facts."""
import pytest

from soma.foundation.errors import SomaError, ValidationError
from soma.foundation.identifiers import new_uuid4
from soma.tickets.queries.rfc_collection import RfcCollectionQuery
from soma.tickets.rfcs import RfcService


def test_rfc_register_keyset_returns_exact_identities_and_no_phantom_status(initialized_database):
    path, factory_for_path = initialized_database
    factory = factory_for_path(path)
    service = RfcService(factory)
    ids = {}
    for index in range(6):
        number = f"NC{20261010000000 + index:014d}"
        created = service.create_or_adopt_identity(
            command_id=new_uuid4(), rfc_no=number, creation_context="manual"
        )
        ids[created.rfc_id] = number
    owner = RfcCollectionQuery(factory)
    first = owner.list_rfcs(limit=2)
    assert first["total_count_at_read"] == 6
    visited = []
    page = first
    while True:
        for item in page["items"]:
            assert item["rfc_no"] == ids[item["rfc_id"]]
            assert item["hierarchy_role"] == "standalone"
            assert item["local_archive_state"] == "active"
            assert item["source_summary"] is None
            assert item["source_status"] is None
            assert item["source_status_class"] == "unknown"
            assert item["source_status_truncated"] is False
            assert item["subordinate_count"] == 0
            assert item["direct_service_request_count"] == 0
            visited.append(item["rfc_id"])
        cursor = page["continuation"]
        if cursor is None:
            break
        assert cursor["sort_registry_id"] == "RFC_UPDATED_ID_DESC_V1"
        assert len(visited) <= 6
        page = owner.list_rfcs(limit=2, cursor=cursor)
    assert len(visited) == 6
    assert len(set(visited)) == 6
    assert set(visited) == set(ids)
    whole = owner.list_rfcs(limit=6)
    assert [item["rfc_id"] for item in whole["items"]] == visited
    assert whole["continuation"] is None


def test_rfc_register_rejects_unbounded_page_size_and_untrusted_cursor(initialized_database):
    path, factory_for_path = initialized_database
    owner = RfcCollectionQuery(factory_for_path(path))
    for limit in [0, -1, True, False, "25", 101, 1.5]:
        with pytest.raises(ValidationError):
            owner.list_rfcs(limit=limit)
    for cursor in [[], {}, {"version": True}, {"version": 1},
        {"version": 1, "sort_registry_id": "RFC_UPDATED_ID_DESC_V1",
         "updated_at_utc": 1, "rfc_id": new_uuid4(), "extra": True},
        {"version": True, "sort_registry_id": "RFC_UPDATED_ID_DESC_V1",
         "updated_at_utc": 1, "rfc_id": new_uuid4()},
        {"version": 1, "sort_registry_id": "WRONG",
         "updated_at_utc": 1, "rfc_id": new_uuid4()},
        {"version": 1, "sort_registry_id": "RFC_UPDATED_ID_DESC_V1",
         "updated_at_utc": -1, "rfc_id": new_uuid4()},
        {"version": 1, "sort_registry_id": "RFC_UPDATED_ID_DESC_V1",
         "updated_at_utc": 1, "rfc_id": "not-an-id"}]:
        with pytest.raises((ValidationError, SomaError)):
            owner.list_rfcs(cursor=cursor)
    assert owner.list_rfcs(limit=25) == {
        "items": [], "total_count_at_read": 0,
        "sort_registry_id": "RFC_UPDATED_ID_DESC_V1", "continuation": None
    }
