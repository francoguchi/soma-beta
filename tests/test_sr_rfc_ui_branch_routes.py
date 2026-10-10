"""SR RFC workbench reads the existing LLD-03 branch owner, never a parallel SQL model."""
import pytest

from soma.foundation.errors import SomaError, ValidationError
from soma.foundation.identifiers import new_uuid4
from soma.tickets.api.routes_ui_read import TicketReadRouteAdapter
from soma.tickets.service_requests import ServiceRequestService
from soma.tickets.rfcs import RfcService
from soma.tickets.relationships import ServiceRequestRfcRelationshipService


def test_sr_rfc_http_branch_matches_authoritative_link_owner(initialized_database):
    path, factory_for_path = initialized_database
    factory = factory_for_path(path)
    sr = ServiceRequestService(factory).create_manual_service_request(
        command_id=new_uuid4(), official_sr_no="20456879"
    )
    rfc = RfcService(factory).create_or_adopt_identity(
        command_id=new_uuid4(), rfc_no="NC20261010000090", creation_context="manual"
    )
    route = f"/api/v1/tickets/service-requests/{sr.service_request_id}/rfcs"
    adapter = TicketReadRouteAdapter(factory)
    empty = adapter.dispatch("GET", route, {"limit": 25})
    assert empty.status == 200
    assert empty.body == {"items": [], "continuation": None}

    ServiceRequestRfcRelationshipService(factory).link(
        command_id=new_uuid4(),service_request_id=sr.service_request_id,
        rfc_id=rfc.rfc_id,sr_base_revision=sr.revision,rfc_base_revision=rfc.revision,
    )
    page = adapter.dispatch("GET", route, {"limit": 25})
    assert page.status == 200
    assert page.body["continuation"] is None
    assert len(page.body["items"]) == 1
    member = page.body["items"][0]
    assert member["root_rfc_id"] == member["member_rfc_id"] == rfc.rfc_id
    assert member["role"] == "root"
    assert member["direct_link_id"]
    assert adapter.dispatch("GET", route, {"limit": 25}).body == page.body


def test_sr_rfc_http_branch_rejects_mutations_and_invalid_cursors(initialized_database):
    path, factory_for_path = initialized_database
    factory = factory_for_path(path)
    sr = ServiceRequestService(factory).create_manual_service_request(command_id=new_uuid4())
    adapter = TicketReadRouteAdapter(factory)
    url = f"/api/v1/tickets/service-requests/{sr.service_request_id}/rfcs"
    for method, route, values in [
        ("POST", url, {}),("PATCH",url,{}),("GET",url,{"limit":0}),
        ("GET",url,{"limit":True}),("GET",url,{"limit":26}),
        ("GET",url,{"search":"anything"}),("GET",url,{"cursor":{}}),
        ("GET",url,{"cursor":{"service_request_id":new_uuid4()}}),
        ("GET",url.replace(sr.service_request_id,"invalid"),{}),
    ]:
        with pytest.raises((ValidationError,SomaError)):
            adapter.dispatch(method,route,values)
