"""A read-only UI uses LLD-03 branch-device owner evidence, not inferred membership."""
import pytest

from soma.foundation.errors import SomaError, ValidationError
from soma.foundation.identifiers import new_uuid4
from soma.tickets.api.routes_ui_read import TicketReadRouteAdapter
from soma.tickets.device_references import DeviceReferenceService
from soma.tickets.relationships import TicketDeviceReferenceRelationshipService
from soma.tickets.rfc_hierarchy import RfcHierarchyService
from soma.tickets.rfcs import RfcService


def test_rfc_branch_devices_show_exact_owner_and_page_by_owning_rfc(initialized_database):
    path, factory_for_path = initialized_database
    factory = factory_for_path(path)
    rfcs = RfcService(factory)
    root = rfcs.create_or_adopt_identity(command_id=new_uuid4(),
        rfc_no="NC20261010000401", creation_context="manual")
    child = rfcs.create_or_adopt_identity(command_id=new_uuid4(),
        rfc_no="NC20261010000402", creation_context="manual")
    branch = RfcHierarchyService(factory).add_subordinate(
        command_id=new_uuid4(),parent_rfc_id=root.rfc_id,child_rfc_id=child.rfc_id,
        base_revisions={root.rfc_id:root.revision, child.rfc_id:child.revision},
        reason_category="reviewed_hierarchy",
    )
    devices = DeviceReferenceService(factory)
    droot = devices.create(command_id=new_uuid4(),operational_name="root-device")
    dchild = devices.create(command_id=new_uuid4(),operational_name="child-device")
    links = TicketDeviceReferenceRelationshipService(factory)
    links.link(command_id=new_uuid4(),ticket_type="rfc",ticket_id=root.rfc_id,
        device_reference_id=droot.device_reference_id,target_base_revision=branch.root.revision)
    links.link(command_id=new_uuid4(),ticket_type="rfc",ticket_id=child.rfc_id,
        device_reference_id=dchild.device_reference_id,target_base_revision=branch.subordinates[0].revision)
    adapter=TicketReadRouteAdapter(factory)
    url=f"/api/v1/tickets/rfcs/{root.rfc_id}/branch-devices"
    full=adapter.dispatch("GET",url,{"limit":25})
    assert full.status == 200
    assert full.body["continuation"] is None
    rows=full.body["items"]
    assert len(rows)==2
    by_owner={row["owning_rfc_id"]:row for row in rows}
    assert by_owner[root.rfc_id]["role"] == "root"
    assert by_owner[root.rfc_id]["device_reference_id"] == droot.device_reference_id
    assert by_owner[child.rfc_id]["role"] == "subordinate"
    assert by_owner[child.rfc_id]["device_reference_id"] == dchild.device_reference_id
    assert all(row["registered_network_element_id"] is None for row in rows)
    first=adapter.dispatch("GET",url,{"limit":1}).body
    assert len(first["items"]) == 1
    assert first["continuation"]["query_id"] == "GetRfcDeviceContextForBranch"
    next_page=adapter.dispatch("GET",url,{"limit":1,"cursor":first["continuation"]}).body
    assert len(next_page["items"]) == 1
    assert next_page["continuation"] is None
    assert first["items"]+next_page["items"] == rows
    # The owner must not permit a subordinate to impersonate its governing root.
    with pytest.raises((ValidationError,SomaError)):
        adapter.dispatch("GET",f"/api/v1/tickets/rfcs/{child.rfc_id}/branch-devices",{"limit":25})


def test_rfc_branch_device_adapter_rejects_writes_unknown_filters_and_oversized_pages(initialized_database):
    path, factory_for_path = initialized_database
    factory=factory_for_path(path)
    root=RfcService(factory).create_or_adopt_identity(command_id=new_uuid4(),
        rfc_no="NC20261010000403",creation_context="manual")
    route=f"/api/v1/tickets/rfcs/{root.rfc_id}/branch-devices"
    adapter=TicketReadRouteAdapter(factory)
    for method,url,values in [
        ("POST",route,{}),("PATCH",route,{}),
        ("GET",route,{"limit":0}),("GET",route,{"limit":True}),
        ("GET",route,{"limit":26}),("GET",route,{"cursor":"bad"}),
        ("GET",route,{"cursor":{}}),("GET",route,{"search":"unreviewed"}),
        ("GET",route.replace(root.rfc_id,"invalid"),{}),
    ]:
        with pytest.raises((ValidationError,SomaError)):
            adapter.dispatch(method,url,values)
    assert adapter.dispatch("GET",route,{"limit":25}).body=={"items":[],"continuation":None}
    assert adapter.dispatch("GET",route+"/extra",{}) is None
