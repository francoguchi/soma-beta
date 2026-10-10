"""HTTP composition uses existing ticket snapshot-query owners, never write commands."""
from types import SimpleNamespace

import pytest

from soma.foundation.errors import SomaError, ValidationError
from soma.foundation.identifiers import new_uuid4
from soma.runtime_domains import DomainRoutes
from soma.tickets.api.routes_ui_read import TicketReadRouteAdapter
from soma.tickets.rfcs import RfcService
from soma.tickets.service_requests import ServiceRequestService


def test_ticket_ui_owner_read_routes_are_live_bounded_and_closed(initialized_database):
    path, factory_for_path = initialized_database
    factory = factory_for_path(path)
    sr = ServiceRequestService(factory).create_manual_service_request(
        command_id=new_uuid4(), official_sr_no="82937461"
    )
    rfc = RfcService(factory).create_or_adopt_identity(
        command_id=new_uuid4(), rfc_no="NC20261010000001", creation_context="manual"
    )
    adapter = TicketReadRouteAdapter(factory)
    sr_detail = adapter.dispatch(
        "GET", f"/api/v1/tickets/service-requests/{sr.service_request_id}", {}
    )
    assert sr_detail.status == 200
    assert sr_detail.body["service_request_id"] == sr.service_request_id
    assert sr_detail.body["identity"]["official_sr_no"] == "82937461"
    assert sr_detail.body["source_projection"] is None
    official_lookup = adapter.dispatch(
        "GET", "/api/v1/tickets/service-requests/by-business-id/82937461", {}
    )
    assert official_lookup.body == sr_detail.body
    rfc_detail = adapter.dispatch("GET", f"/api/v1/tickets/rfcs/{rfc.rfc_id}", {})
    assert rfc_detail.status == 200
    assert rfc_detail.body["rfc_id"] == rfc.rfc_id
    assert rfc_detail.body["rfc_no"] == "NC20261010000001"
    rfc_page = adapter.dispatch("GET", "/api/v1/tickets/rfcs", {"limit": 25})
    assert rfc_page.status == 200
    assert rfc_page.body["total_count_at_read"] == 1
    assert rfc_page.body["items"][0]["rfc_id"] == rfc.rfc_id
    assert rfc_page.body["items"][0]["hierarchy_role"] == "standalone"
    assert rfc_page.body["items"][0]["local_archive_state"] == "active"
    assert rfc_page.body["continuation"] is None

    sr_notes = adapter.dispatch(
        "GET", f"/api/v1/tickets/service_request/{sr.service_request_id}/notes", {"limit": 10}
    )
    rfc_notes = adapter.dispatch(
        "GET", f"/api/v1/tickets/rfc/{rfc.rfc_id}/notes", {"limit": 10}
    )
    assert sr_notes.body == rfc_notes.body == {"items": [], "continuation": None}
    collection = adapter.dispatch("GET", "/api/v1/tickets/service-requests", {"limit": 10})
    assert collection.status == 200
    assert collection.body["sort_registry_id"] == "SR_UPDATED_ID_DESC_V1"
    assert collection.body["total_count_at_read"] == 1
    assert len(collection.body["items"]) == 1
    assert collection.body["items"][0]["service_request_id"] == sr.service_request_id
    assert collection.body["continuation"] is None
    assert adapter.dispatch("GET", "/api/v1/tickets/service-requests/by-business-id", {}) is None
    assert adapter.dispatch("GET", "/api/v1/tickets/nonexistent", {}) is None
    assert adapter.dispatch("GET", "/api/v1/tickets/rfcs/not-a-valid-id/extra", {}) is None


def test_ticket_ui_read_routes_never_accept_mutations_unbounded_notes_or_unknown_queries(initialized_database):
    path, factory_for_path = initialized_database
    adapter = TicketReadRouteAdapter(factory_for_path(path))
    sr = ServiceRequestService(factory_for_path(path)).create_manual_service_request(
        command_id=new_uuid4()
    )
    point = f"/api/v1/tickets/service-requests/{sr.service_request_id}"
    notes = f"/api/v1/tickets/service_request/{sr.service_request_id}/notes"
    for method, route, values in [
        ("POST", point, {}), ("DELETE", notes, {}), ("GET", point, {"search": "abc"}),
        ("GET", point.replace(sr.service_request_id, "invalid"), {}),
        ("GET", notes, {"limit": True}), ("GET", notes, {"limit": 11}),
        ("GET", notes, {"limit": 0}), ("GET", notes, {"other": 1}),
        ("GET", notes, {"cursor": "fake"}), ("GET", notes, {"cursor": {}}),
        ("GET", "/api/v1/tickets/service-requests/by-business-id/bad-id", {}),
        ("GET", "/api/v1/tickets/service-requests/by-business-id/12345678", {"limit": 2}),
        ("POST", "/api/v1/tickets/service-requests", {}),
        ("POST", "/api/v1/tickets/rfcs", {}),
        ("GET", "/api/v1/tickets/rfcs", {"limit": False}),
        ("GET", "/api/v1/tickets/rfcs", {"limit": 101}),
        ("GET", "/api/v1/tickets/rfcs", {"filter": "active"}),
        ("GET", "/api/v1/tickets/rfcs", {"cursor": {"untrusted": True}}),
        ("GET", "/api/v1/tickets/service-requests", {"limit": True}),
        ("GET", "/api/v1/tickets/service-requests", {"limit": 101}),
        ("GET", "/api/v1/tickets/service-requests", {"order": "any"}),
        ("GET", "/api/v1/tickets/service-requests", {"cursor": {"unreviewed": True}}),
    ]:
        with pytest.raises((ValidationError, SomaError)):
            adapter.dispatch(method, route, values)


def test_owner_session_validation_precedes_ticket_adapter_queries():
    class Denied:
        def validate_request(self, _request, *, mutation):
            assert mutation is False
            raise SomaError("UNAUTHENTICATED", "no authenticated local user")

    class ShouldNotBeCalled:
        def dispatch(self, *_args, **_kwargs):
            raise AssertionError("Untrusted request reached owner query adapter")

    runtime = DomainRoutes.__new__(DomainRoutes)
    runtime.security = Denied()
    runtime.tickets = ShouldNotBeCalled()
    request = SimpleNamespace(
        method="GET",
        url=SimpleNamespace(path=f"/api/v1/tickets/service-requests/{new_uuid4()}", query=""),
        query_params=SimpleNamespace(multi_items=lambda: []),
    )
    with pytest.raises(SomaError, match="no authenticated local user"):
        runtime.dispatch(request, {})
