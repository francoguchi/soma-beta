"""The UI device surface delegates to the accepted LLD-03 Device Reference owner."""
import pytest

from soma.foundation.errors import SomaError, ValidationError
from soma.foundation.identifiers import new_uuid4
from soma.tickets.api.routes_ui_read import TicketReadRouteAdapter
from soma.tickets.device_references import DeviceReferenceService
from soma.tickets.relationships import TicketDeviceReferenceRelationshipService
from soma.tickets.rfcs import RfcService
from soma.tickets.service_requests import ServiceRequestService


def test_ui_devices_are_direct_owner_links_not_inferred_network_elements(initialized_database):
    path, factory_for_path = initialized_database
    factory = factory_for_path(path)
    sr = ServiceRequestService(factory).create_manual_service_request(command_id=new_uuid4())
    rfc = RfcService(factory).create_or_adopt_identity(
        command_id=new_uuid4(), rfc_no="NC20261010000333", creation_context="manual"
    )
    device = DeviceReferenceService(factory).create(
        command_id=new_uuid4(), operational_name="rack-switch-01"
    )
    links = TicketDeviceReferenceRelationshipService(factory)
    adapter = TicketReadRouteAdapter(factory)
    sr_url = f"/api/v1/tickets/service_request/{sr.service_request_id}/devices"
    rfc_url = f"/api/v1/tickets/rfc/{rfc.rfc_id}/devices"
    assert adapter.dispatch("GET", sr_url, {"limit":25}).body == {"items":[],"continuation":None}
    assert adapter.dispatch("GET", rfc_url, {"limit":25}).body == {"items":[],"continuation":None}
    links.link(command_id=new_uuid4(),ticket_type="service_request",ticket_id=sr.service_request_id,
        device_reference_id=device.device_reference_id,target_base_revision=sr.revision)
    sr_page = adapter.dispatch("GET", sr_url, {"limit":25})
    assert sr_page.status == 200
    assert sr_page.body == {"items":[{
        "device_reference_id":device.device_reference_id,
        "operational_name":"rack-switch-01","revision":1,
        "registered_network_element_id":None,
    }],"continuation":None}
    # Direct SR membership cannot be used to invent a direct RFC link.
    assert adapter.dispatch("GET", rfc_url, {"limit":25}).body["items"] == []
    links.link(command_id=new_uuid4(),ticket_type="rfc",ticket_id=rfc.rfc_id,
        device_reference_id=device.device_reference_id,target_base_revision=rfc.revision)
    assert adapter.dispatch("GET", rfc_url, {"limit":25}).body == sr_page.body
    assert adapter.dispatch("GET", sr_url, {"limit":25}).body == sr_page.body


def test_ui_device_reads_are_strictly_bounded_and_read_only(initialized_database):
    path, factory_for_path = initialized_database
    factory = factory_for_path(path)
    sr = ServiceRequestService(factory).create_manual_service_request(command_id=new_uuid4())
    url = f"/api/v1/tickets/service_request/{sr.service_request_id}/devices"
    adapter = TicketReadRouteAdapter(factory)
    for method,route,query in [
        ("POST",url,{}),("DELETE",url,{}),("GET",url,{"limit":0}),
        ("GET",url,{"limit":True}),("GET",url,{"limit":26}),
        ("GET",url,{"search":"free text"}),("GET",url,{"cursor":"untrusted"}),
        ("GET",url,{"cursor":{}}),("GET",url.replace(sr.service_request_id,"not-uuid"),{}),
    ]:
        with pytest.raises((ValidationError,SomaError)):
            adapter.dispatch(method,route,query)
    assert adapter.dispatch("GET",url,{"limit":25}).body["items"] == []
    assert adapter.dispatch("GET",url+"/unsupported",{}) is None
