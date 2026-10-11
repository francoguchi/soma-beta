"""Owner-approved read-only Room/Cloud LLD-08 extension regressions.

Use the normal local encrypted/test DB fixture and declared domain commands.
Corruption injections are test-only and must fail a whole owner query.
"""
import pytest

from soma.foundation.errors import SomaError, ValidationError
from soma.foundation.identifiers import new_uuid4
from soma.foundation.persistence.uow import UnitOfWork
from soma.infrastructure.api.routes_infrastructure import (
    build_owner_route_adapter, resolve_route,
)
from soma.infrastructure.contracts.infrastructure import REGISTRY, validate_value
from soma.infrastructure.queries.core import InfrastructureQueries
from test_infrastructure_relationships import element
from test_infrastructure_services import infra, command, site


def _query(service, name, **payload):
    return InfrastructureQueries(service).execute(name, payload)


def _child(service, kind, parent, relation, **options):
    return _query(
        service, "InfrastructureRelationshipChildrenQuery",
        parent_kind=kind, parent_id=parent, relationship=relation, **options,
    )


def test_approved_read_registry_is_additive_typed_and_authenticated(infra):
    service, _, customer = infra
    assert len(REGISTRY["queries"]) == 18
    assert len(REGISTRY["routes"]) == 52
    rack_site = site(service, customer)
    room = command(service, "CreateRoom", site_id=rack_site, name="Room A")["target"]["id"]
    route = resolve_route("GET", "/api/v1/infrastructure/rooms/" + room)
    assert route is not None and route.spec.handler == "RoomDetailQuery"
    adapter = build_owner_route_adapter(service, actor_kind="local_user", actor_id="admin")
    response = adapter.dispatch("GET", "/api/v1/infrastructure/rooms/" + room)
    assert response.status == 200 and response.body["room_id"] == room
    assert response.body["rack_count"] == 0
    assert response.response_type == "INFRA_ROOM_DETAIL_RESPONSE_V1"
    with pytest.raises(ValidationError):
        adapter.dispatch("GET", "/api/v1/infrastructure/rooms/" + room, {"unknown": True})
    with pytest.raises(ValidationError):
        adapter.dispatch("GET", "/api/v1/infrastructure/rooms/" + room,
                         {"room_id": new_uuid4()})
    with pytest.raises(ValidationError):
        adapter.dispatch("GET", "/api/v1/infrastructure/rooms/NOT-UUID")
    with pytest.raises(ValidationError):
        validate_value(response.response_type, {**response.body, "synthetic": True})


def test_room_point_is_exact_and_counts_archived_racks(infra):
    service, _, customer = infra
    s = site(service, customer)
    room = command(service, "CreateRoom", site_id=s, name="Room A")["target"]["id"]
    other = command(service, "CreateRoom", site_id=s, name="Room A")["target"]["id"]
    rack = command(service, "CreateRack", room_id=room, name="Rack", height_u=42)["target"]["id"]
    command(service, "ChangeRackLifecycle", rack_id=rack, base_revision=1,
            target_state="archived")
    command(service, "ChangeRoomLifecycle", room_id=room, base_revision=1,
            target_state="archived")
    detail = _query(service, "RoomDetailQuery", room_id=room)
    assert detail == {
        "room_id": room, "site_id": s, "customer_org_id": customer,
        "name": "Room A", "lifecycle": "archived", "revision": 2,
        "rack_count": 1,
    }
    assert _query(service, "RoomDetailQuery", room_id=other)["rack_count"] == 0
    with pytest.raises(SomaError) as error:
        _query(service, "RoomDetailQuery", room_id=new_uuid4())
    assert error.value.code == "INFRA_NOT_FOUND"


def test_cloud_current_assignment_count_and_reusable_type(infra):
    service, _, customer = infra
    s1, s2 = site(service, customer), site(service, customer)
    cloud_type = command(service, "CreateCloudType", name="Shared Type")["target"]["id"]
    c1 = command(service, "CreateCloudDeployment", site_id=s1,
                 cloud_type_id=cloud_type, name="Cloud A")["target"]["id"]
    c2 = command(service, "CreateCloudDeployment", site_id=s2,
                 cloud_type_id=cloud_type, name="Cloud B")["target"]["id"]
    node = element(service, s1)
    command(service, "SetCloudDeploymentAssignment", network_element_id=node,
            base_revision=0, cloud_deployment_id=c1, reason_code="reviewed")
    detail = _query(service, "CloudDeploymentDetailQuery", cloud_deployment_id=c1)
    assert detail["assigned_network_element_count"] == 1
    assert detail["cloud_type_id"] == cloud_type
    assert detail["site_id"] == s1 and detail["customer_org_id"] == customer
    assert _query(service, "CloudDeploymentDetailQuery",
                  cloud_deployment_id=c2)["assigned_network_element_count"] == 0
    assert _child(service, "cloud_deployment", c1, "cloud_assigned_elements")["items"][0]["id"] == node
    with pytest.raises(SomaError) as missing:
        _query(service, "CloudDeploymentDetailQuery", cloud_deployment_id=new_uuid4())
    assert missing.value.code == "INFRA_NOT_FOUND"


def test_relation_page_is_direct_bounded_and_cursors_bind_all_filters(infra):
    service, _, customer = infra
    s = site(service, customer)
    room = command(service, "CreateRoom", site_id=s, name="A")["target"]["id"]
    elsewhere = command(service, "CreateRoom", site_id=s, name="B")["target"]["id"]
    own = [command(service, "CreateRack", room_id=room, name=f"R{i}",
                   height_u=42)["target"]["id"] for i in range(4)]
    foreign = command(service, "CreateRack", room_id=elsewhere, name="Else",
                      height_u=42)["target"]["id"]
    seen, cursor = [], None
    for _ in range(5):
        value = _child(service, "room", room, "room_racks", limit=2,
                       **({"cursor": cursor} if cursor else {}))
        seen += [record["id"] for record in value["items"]]
        assert all(record["parent_id"] == room and record["kind"] == "rack"
                   and record["site_id"] == s for record in value["items"])
        cursor = value["next_cursor"]
        if cursor is None:
            break
    assert seen == sorted(own)
    assert foreign not in seen
    assert len(seen) == len(set(seen)) == 4
    first = _child(service, "room", room, "room_racks", limit=1)
    cursor = first["next_cursor"]
    assert cursor is not None and len(cursor["last_key_tuple"]) == 1
    for bad in (
        {"limit": 2}, {"lifecycle": "active"},
        {"parent_id": elsewhere},
    ):
        request = dict(parent_kind="room", parent_id=room,
                       relationship="room_racks", limit=1, cursor=cursor)
        request.update(bad)
        # The proposed override intentionally changes scope and/or exact limit.
        with pytest.raises(SomaError) as error:
            _query(service, "InfrastructureRelationshipChildrenQuery", **request)
        assert error.value.code == "CURSOR_INVALID"
    with pytest.raises(ValidationError):
        _child(service, "site", s, "room_racks")


def test_unracked_placement_requires_explicit_null_and_containment_is_one_hop(infra):
    service, factory, customer = infra
    s = site(service, customer)
    room = command(service, "CreateRoom", site_id=s, name="Room")["target"]["id"]
    rack = command(service, "CreateRack", room_id=room,
                   name="Rack", height_u=42)["target"]["id"]
    parent = element(service, s)
    child = element(service, s)
    placed = element(service, s, placement={"rack_id": rack, "u_start": 1, "u_span": 1})
    command(service, "SetContainmentParent", child_network_element_id=child,
            parent_network_element_id=parent, base_revision=0, reason_code="review")
    command(service, "SetContainmentParent", child_network_element_id=placed,
            parent_network_element_id=child, base_revision=0, reason_code="review")
    expected = _child(service, "site", s, "site_unracked_elements")
    assert {r["id"] for r in expected["items"]} == {parent, child}
    direct = _child(service, "network_element", parent,
                    "element_contained_elements")
    assert [item["id"] for item in direct["items"]] == [child]
    assert placed not in [item["id"] for item in direct["items"]]
    # Test-only physical corruption: an active NE with no required current
    # placement must never be silently interpreted as explicitly unracked.
    with UnitOfWork(factory) as uow:
        uow.connection.execute(
            "DELETE FROM network_element_placement_current WHERE network_element_id=?",
            (parent,),
        )
    with pytest.raises(SomaError) as corrupt:
        _child(service, "site", s, "site_unracked_elements")
    assert corrupt.value.code == "INFRA_STALE"


def test_cloud_cross_site_owner_corruption_fails_entire_point_and_page(infra):
    service, factory, customer = infra
    s1, s2 = site(service, customer), site(service, customer)
    ct = command(service, "CreateCloudType", name="Type")["target"]["id"]
    c1 = command(service, "CreateCloudDeployment", site_id=s1,
                 cloud_type_id=ct, name="One")["target"]["id"]
    c2 = command(service, "CreateCloudDeployment", site_id=s2,
                 cloud_type_id=ct, name="Two")["target"]["id"]
    ne = element(service, s1)
    command(service, "SetCloudDeploymentAssignment", network_element_id=ne,
            base_revision=0, cloud_deployment_id=c1, reason_code="reviewed")
    # Deliberate test-only corruption bypasses guarded command checks.
    with UnitOfWork(factory) as uow:
        uow.connection.execute(
            "UPDATE cloud_assignment_current SET cloud_deployment_id=? WHERE network_element_id=?",
            (c2, ne),
        )
    for operation in (
        lambda: _query(service, "CloudDeploymentDetailQuery", cloud_deployment_id=c2),
        lambda: _child(service, "cloud_deployment", c2, "cloud_assigned_elements"),
    ):
        with pytest.raises(SomaError) as error:
            operation()
        assert error.value.code == "INFRA_STALE"
