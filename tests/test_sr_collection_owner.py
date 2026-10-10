"""Read-only SR register proves deterministic owner identities and bounded paging."""
from __future__ import annotations

import pytest

from soma.foundation.errors import ValidationError
from soma.foundation.identifiers import new_uuid4
from soma.tickets.queries.service_request_collection import ServiceRequestCollectionQuery
from soma.tickets.service_requests import ServiceRequestService


def _query(initialized_database):
    database_path, factory_for_path = initialized_database
    factory = factory_for_path(database_path)
    return factory, ServiceRequestCollectionQuery(factory)


def test_service_request_register_pages_complete_set_without_duplicates(initialized_database):
    factory, queries = _query(initialized_database)
    service = ServiceRequestService(factory)
    identities = {}
    for number in range(1, 6):
        sr = service.create_manual_service_request(
            command_id=new_uuid4(), official_sr_no=f"294600{number:02d}"
        )
        identities[sr.service_request_id] = sr.official_sr_no

    page = queries.list_service_requests(limit=2)
    assert page["total_count_at_read"] == 5
    seen = []
    while True:
        assert page["sort_registry_id"] == "SR_UPDATED_ID_DESC_V1"
        for item in page["items"]:
            assert item["official_sr_no"] == identities[item["service_request_id"]]
            assert item["summary"] is None
            assert item["status"] is None
            assert item["revision"] == 1
            seen.append(item["service_request_id"])
        if page["continuation"] is None:
            break
        assert len(seen) <= 5
        page = queries.list_service_requests(limit=2, cursor=page["continuation"])
    assert len(seen) == len(set(seen)) == 5
    assert set(seen) == set(identities)
    assert seen == sorted(
        seen,
        key=lambda identity: (
            queries.list_service_requests(limit=5)["items"][
                next(i for i, item in enumerate(queries.list_service_requests(limit=5)["items"])
                     if item["service_request_id"] == identity)
            ]["updated_at_utc"], identity,
        ),
        reverse=True,
    )


def test_service_request_register_rejects_untrusted_page_size_and_cursor(initialized_database):
    _factory, query = _query(initialized_database)
    for size in [0, -1, 101, True, "20", 3.5]:
        with pytest.raises(ValidationError):
            query.list_service_requests(limit=size)
    for cursor in [
        [], {}, {"version": True}, {"version": 1, "sort_registry_id": "SR_UPDATED_ID_DESC_V1",
            "updated_at_utc": 0, "service_request_id": new_uuid4(), "unsafe": True},
        {"version": 1, "sort_registry_id": "WRONG", "updated_at_utc": 0,
            "service_request_id": new_uuid4()},
        {"version": 1, "sort_registry_id": "SR_UPDATED_ID_DESC_V1",
            "updated_at_utc": -1, "service_request_id": new_uuid4()},
        {"version": 1, "sort_registry_id": "SR_UPDATED_ID_DESC_V1",
            "updated_at_utc": 0, "service_request_id": "unknown"},
    ]:
        with pytest.raises(ValidationError):
            query.list_service_requests(cursor=cursor)
    assert query.list_service_requests(limit=2) == {
        "items": [], "continuation": None, "sort_registry_id": "SR_UPDATED_ID_DESC_V1",
        "total_count_at_read": 0,
    }
