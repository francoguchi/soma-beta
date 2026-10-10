"""RFC workbench is backed by existing LLD-03 root and effective-SR queries."""
import pytest

from soma.foundation.errors import SomaError, ValidationError
from soma.foundation.identifiers import new_uuid4
from soma.tickets.api.routes_ui_read import TicketReadRouteAdapter
from soma.tickets.rfcs import RfcService
from soma.tickets.service_requests import ServiceRequestService
from soma.tickets.relationships import ServiceRequestRfcRelationshipService


def test_rfc_related_views_obey_governing_root_and_effective_sr_owner(initialized_database):
    path, factory_for_path = initialized_database
    factory = factory_for_path(path)
    sr = ServiceRequestService(factory).create_manual_service_request(command_id=new_uuid4())
    rfc = RfcService(factory).create_or_adopt_identity(
        command_id=new_uuid4(), rfc_no="NC20261010000120", creation_context="manual"
    )
    ServiceRequestRfcRelationshipService(factory).link(
        command_id=new_uuid4(),service_request_id=sr.service_request_id,
        rfc_id=rfc.rfc_id,sr_base_revision=sr.revision,rfc_base_revision=rfc.revision,
    )
    adapter=TicketReadRouteAdapter(factory)
    branch=adapter.dispatch("GET",f"/api/v1/tickets/rfcs/{rfc.rfc_id}/branch",{"limit":25})
    assert branch.status==200
    assert branch.body["root"]["rfc_no"]==rfc.rfc_no
    assert branch.body["subordinates"]==[]
    assert branch.body["continuation"] is None
    assert len(branch.body["branch_fingerprint"])==64

    relations=adapter.dispatch("GET",f"/api/v1/tickets/rfcs/{rfc.rfc_id}/effective-srs",{"limit":25})
    assert relations.status==200
    assert relations.body["continuation"] is None
    assert len(relations.body["items"])==1
    row=relations.body["items"][0]
    assert row["requested_rfc_id"]==rfc.rfc_id
    assert row["governing_root_rfc_id"]==rfc.rfc_id
    assert row["service_request_id"]==sr.service_request_id
    assert row["inherited_via_root"] is None


def test_rfc_workbench_owner_routes_are_read_only_closed_and_bounded(initialized_database):
    path,factory_for_path=initialized_database
    factory=factory_for_path(path)
    rfc=RfcService(factory).create_or_adopt_identity(
        command_id=new_uuid4(),rfc_no="NC20261010000121",creation_context="manual"
    )
    adapter=TicketReadRouteAdapter(factory)
    for suffix in ["branch","effective-srs"]:
        url=f"/api/v1/tickets/rfcs/{rfc.rfc_id}/{suffix}"
        for method,values in [
            ("POST",{}),("PATCH",{}),("GET",{"limit":True}),
            ("GET",{"limit":0}),("GET",{"limit":26}),
            ("GET",{"filters":"unbound"}),("GET",{"cursor":{}}),
        ]:
            with pytest.raises((SomaError,ValidationError)):
                adapter.dispatch(method,url,values)
        with pytest.raises((SomaError,ValidationError)):
            adapter.dispatch("GET",f"/api/v1/tickets/rfcs/bad-id/{suffix}",{})
    assert adapter.dispatch("GET",f"/api/v1/tickets/rfcs/{rfc.rfc_id}/not-composed",{}) is None
