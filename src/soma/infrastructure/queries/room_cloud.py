"""Accepted LLD-08 additive Room/Cloud direct read owners (no writer UoW).

All identities come from typed owner requests and all SQL/table names are
constant. Each query is executed inside InfrastructureQueries' ReadSnapshot.
"""
from __future__ import annotations

from heapq import merge

from soma.foundation.errors import SomaError, ValidationError
from soma.foundation.identifiers import require_uuid4
from soma.infrastructure.repositories.core import count, fingerprint, get, one, rows

QUERY_NAMES = frozenset({
    "RoomDetailQuery",
    "CloudDeploymentDetailQuery",
    "InfrastructureRelationshipChildrenQuery",
})

RELATIONS = {
    "site_unracked_elements": ("site", "network_element"),
    "room_racks": ("room", "rack"),
    "cloud_assigned_elements": ("cloud_deployment", "network_element"),
    "element_contained_elements": ("network_element", "network_element"),
}
_CURSOR_KEYS = frozenset({
    "version", "query_id", "sort_registry_id", "last_key_tuple",
    "filter_fingerprint", "null_order",
})
_QUERY = "InfrastructureRelationshipChildrenQuery"


def _corrupt(message: str):
    raise SomaError("INFRA_STALE", message)


def _checked_cloud(reader, deployment):
    # A foreign Site assignment is an integrity error for both the point
    # count and paged child read, including if the corrupt row is not on
    # the requested page. Never silently hide it in a WHERE Site filter.
    corrupt = one(
        reader,
        "SELECT 1 found FROM cloud_assignment_current a "
        "LEFT JOIN network_elements n USING(network_element_id) "
        "WHERE a.cloud_deployment_id=? "
        "AND (n.network_element_id IS NULL OR n.site_id<>?) LIMIT 1",
        (deployment["cloud_deployment_id"], deployment["site_id"]),
    )
    if corrupt is not None:
        _corrupt("Cloud Deployment assignment contradicts owner Site")
    get(reader, "sites", deployment["site_id"])
    get(reader, "cloud_types", deployment["cloud_type_id"])


def _room_detail(reader, p):
    room = get(reader, "rooms", p["room_id"])
    site = get(reader, "sites", room["site_id"])
    return dict(
        room_id=room["room_id"], site_id=room["site_id"],
        customer_org_id=site["customer_org_id"], name=room["name"],
        lifecycle=room["lifecycle_state"], revision=room["revision"],
        rack_count=count(reader, "SELECT count(*) FROM racks WHERE room_id=?",
                         (room["room_id"],)),
    )


def _cloud_detail(reader, p):
    cloud = get(reader, "cloud_deployments", p["cloud_deployment_id"])
    _checked_cloud(reader, cloud)
    site = get(reader, "sites", cloud["site_id"])
    return dict(
        cloud_deployment_id=cloud["cloud_deployment_id"],
        cloud_type_id=cloud["cloud_type_id"], site_id=cloud["site_id"],
        customer_org_id=site["customer_org_id"], name=cloud["name"],
        lifecycle=cloud["lifecycle_state"], revision=cloud["revision"],
        assigned_network_element_count=count(
            reader, "SELECT count(*) FROM cloud_assignment_current "
            "WHERE cloud_deployment_id=?", (cloud["cloud_deployment_id"],),
        ),
    )


def _cursor(p, scope):
    candidate = p.get("cursor")
    if candidate is None:
        return None
    valid = (
        type(candidate) is dict
        and frozenset(candidate) == _CURSOR_KEYS
        and type(candidate.get("version")) is int
        and candidate["version"] == 1
        and candidate["query_id"] == _QUERY
        and candidate["sort_registry_id"] == _QUERY + "_ORDER_V1"
        and candidate["null_order"] == "NOT_APPLICABLE"
        and candidate["filter_fingerprint"] == fingerprint(scope)
        and type(candidate["last_key_tuple"]) is list
        and len(candidate["last_key_tuple"]) == 1
    )
    if not valid:
        raise SomaError("CURSOR_INVALID", "Invalid related-child owner cursor")
    try:
        return require_uuid4(candidate["last_key_tuple"][0])
    except ValidationError:
        raise SomaError("CURSOR_INVALID", "Invalid related-child identity cursor") from None


def _next_cursor(key, scope):
    return dict(
        version=1, query_id=_QUERY, sort_registry_id=_QUERY + "_ORDER_V1",
        last_key_tuple=[key], filter_fingerprint=fingerprint(scope),
        null_order="NOT_APPLICABLE",
    )


def _children(reader, p):
    parent_kind, parent_id, relation = (
        p["parent_kind"], p["parent_id"], p["relationship"]
    )
    if RELATIONS.get(relation, (None,))[0] != parent_kind:
        raise ValidationError("Infrastructure parent and relationship disagree")
    limit = p.get("limit") or 100
    lifecycle = p.get("lifecycle")
    scope = dict(parent_kind=parent_kind, parent_id=parent_id,
                 relationship=relation, lifecycle=lifecycle, limit=limit)
    after = _cursor(p, scope)
    extra = "" if after is None else " AND id > ?"
    after_values = () if after is None else (after,)

    if relation == "room_racks":
        room = get(reader, "rooms", parent_id)
        site = get(reader, "sites", room["site_id"])
        sql = ("SELECT r.rack_id id,r.name label,r.lifecycle_state lifecycle,"
               " ? site_id FROM racks r WHERE r.room_id=?")
        bind = (site["site_id"], parent_id)
        child_kind = "rack"
        split_lifecycle = True
    elif relation == "site_unracked_elements":
        get(reader, "sites", parent_id)
        # Current placement must exist for every active NE. Absence is not
        # evidence that the NE is explicitly unracked.
        absent = one(
            reader, "SELECT 1 found FROM network_elements n "
            "LEFT JOIN network_element_placement_current p USING(network_element_id) "
            "WHERE n.site_id=? AND n.lifecycle_state='active' "
            "AND p.network_element_id IS NULL LIMIT 1", (parent_id,),
        )
        if absent:
            _corrupt("Active Network Element missing current placement")
        sql = ("SELECT n.network_element_id id,n.operational_name label,"
               "n.lifecycle_state lifecycle,n.site_id site_id "
               "FROM network_elements n "
               "JOIN network_element_placement_current p USING(network_element_id) "
               "WHERE n.site_id=? AND p.rack_id IS NULL")
        bind = (parent_id,)
        child_kind = "network_element"
        split_lifecycle = True
    elif relation == "cloud_assigned_elements":
        cloud = get(reader, "cloud_deployments", parent_id)
        _checked_cloud(reader, cloud)
        sql = ("SELECT n.network_element_id id,n.operational_name label,"
               "n.lifecycle_state lifecycle,n.site_id site_id "
               "FROM cloud_assignment_current a "
               "JOIN network_elements n USING(network_element_id) "
               "WHERE a.cloud_deployment_id=?")
        bind = (parent_id,)
        child_kind = "network_element"
        # The relationship FK key equals the joined NE identity, but using
        # the indexed FK key retains UUID order without a whole-parent sort.
        ordered_child_key = "a.network_element_id"
        split_lifecycle = False
    else:
        get(reader, "network_elements", parent_id)
        sql = ("SELECT n.network_element_id id,n.operational_name label,"
               "n.lifecycle_state lifecycle,n.site_id site_id "
               "FROM network_element_containment_current c "
               "JOIN network_elements n ON n.network_element_id=c.child_network_element_id "
               "WHERE c.parent_network_element_id=?")
        bind = (parent_id,)
        child_kind = "network_element"
        ordered_child_key = "c.child_network_element_id"
        split_lifecycle = False

    # The historical FK indexes for Site/Room are keyed by lifecycle *then*
    # child UUID. For the unfiltered request, bounded two-stream merge keeps
    # child UUID ordering index-friendly even with >10,000 children. A single
    # read pulls at most (limit+1), never the entire parent collection.
    if split_lifecycle:
        states = (lifecycle,) if lifecycle is not None else ("active", "archived")
        streams = []
        for state in states:
            source = sql + " AND lifecycle_state=?"+extra
            values = (*bind, state, *after_values, limit + 1)
            # SQL joins never expose caller-provided sort column/identifier.
            source = source.replace(" AND id > ?", " AND " +
                ("r.rack_id" if child_kind == "rack" else "n.network_element_id") + " > ?")
            source = source.replace(" AND lifecycle_state=?", " AND " +
                ("r.lifecycle_state" if child_kind == "rack" else "n.lifecycle_state") + "=?")
            source += " ORDER BY " + ("r.rack_id" if child_kind == "rack" else "n.network_element_id") + " ASC LIMIT ?"
            streams.append(rows(reader, source, values))
        result = list(merge(*streams, key=lambda record: record["id"]))[:limit + 1]
    else:
        source = sql
        values = list(bind)
        if lifecycle is not None:
            source += " AND n.lifecycle_state=?"
            values.append(lifecycle)
        if after is not None:
            source += " AND " + ordered_child_key + ">?"
            values.append(after)
        source += " ORDER BY " + ordered_child_key + " ASC LIMIT ?"
        result = rows(reader, source, (*values, limit + 1))

    if any(result[i - 1]["id"] >= result[i]["id"] for i in range(1, len(result))):
        _corrupt("Duplicated or unordered Infrastructure relationship owner rows")
    for record in result:
        if (record["lifecycle"] not in ("active", "archived")
                or record["site_id"] is None or not record["label"]):
            _corrupt("Invalid relationship child owner row")
        if relation == "cloud_assigned_elements" and record["site_id"] != cloud["site_id"]:
            _corrupt("Cloud relationship crosses Sites")
    item_rows = [dict(
        kind=child_kind, id=record["id"], label=record["label"],
        lifecycle=record["lifecycle"], site_id=record["site_id"],
        parent_id=parent_id, relationship=relation,
    ) for record in result[:limit]]
    return dict(items=item_rows,
                next_cursor=_next_cursor(result[limit - 1]["id"], scope)
                if len(result) > limit else None)


def execute(service, reader, query, p):
    if query == "RoomDetailQuery":
        return _room_detail(reader, p)
    if query == "CloudDeploymentDetailQuery":
        return _cloud_detail(reader, p)
    if query == "InfrastructureRelationshipChildrenQuery":
        return _children(reader, p)
    raise ValidationError("Unknown Room/Cloud owner query")
