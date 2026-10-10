"""Read-only ticket HTTP presentation bindings to existing LLD-03 query owners.

No SQL, domain mutations or mutable source authority live in this adapter.
Paths are closed: never advertise an unsupported ticket collection query.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
import re
from typing import Any

from soma.foundation.errors import ValidationError
from soma.foundation.identifiers import require_uuid4
from soma.tickets.queries.rfcs import RfcQueryService
from soma.tickets.queries.service_requests import ServiceRequestQueryService
from soma.tickets.queries.working_notes import WorkingNoteQueryService
from soma.tickets.queries.service_request_collection import ServiceRequestCollectionQuery
from soma.tickets.queries.rfc_collection import RfcCollectionQuery
from soma.tickets.queries.relationships import ServiceRequestRfcQueryService

_DETAIL = re.compile(r"^/api/v1/tickets/(service-requests|rfcs)/([^/]+)$")
_IDENTITY = re.compile(r"^/api/v1/tickets/service-requests/by-business-id/([^/]+)$")
_NOTES = re.compile(r"^/api/v1/tickets/(service_request|rfc)/([^/]+)/notes$")
_SR_RFCS = re.compile(r"^/api/v1/tickets/service-requests/([^/]+)/rfcs$")
_NOTES_ALLOWED = frozenset({"limit", "cursor"})


@dataclass(frozen=True, slots=True)
class TicketReadResponse:
    status: int
    body: object


class TicketReadRouteAdapter:
    """Compose existing snapshot-backed ticket queries under session-security dispatch."""

    def __init__(self, factory: Any) -> None:
        self._service_requests = ServiceRequestQueryService(factory)
        self._collection = ServiceRequestCollectionQuery(factory)
        self._rfcs = RfcQueryService(factory)
        self._rfc_collection = RfcCollectionQuery(factory)
        self._sr_rfcs = ServiceRequestRfcQueryService(factory)
        self._notes = WorkingNoteQueryService(factory)

    def dispatch(self, method: str, path: str, values: dict[str, Any]) -> TicketReadResponse | None:
        # A missing business identifier is not a Service Request UUID.
        # Keep the lookup namespace disjoint from ordinary point routes.
        if path == "/api/v1/tickets/service-requests/by-business-id":
            return None
        if path == "/api/v1/tickets/service-requests":
            if method != "GET":
                raise ValidationError("Service Request collection is read-only")
            if not isinstance(values, dict) or not set(values).issubset({"limit", "cursor"}):
                raise ValidationError("Service Request collection filters are invalid")
            result = self._collection.list_service_requests(
                limit=values.get("limit", 50), cursor=values.get("cursor")
            )
            return TicketReadResponse(200, result)
        if path == "/api/v1/tickets/rfcs":
            if method != "GET":
                raise ValidationError("RFC collection is read-only")
            if not isinstance(values, dict) or not set(values).issubset({"limit", "cursor"}):
                raise ValidationError("RFC collection filters are invalid")
            return TicketReadResponse(200, self._rfc_collection.list_rfcs(
                limit=values.get("limit", 25), cursor=values.get("cursor")
            ))
        relation = _SR_RFCS.fullmatch(path)
        if relation is not None:
            if method != "GET":
                raise ValidationError("SR relationships are read-only")
            if not isinstance(values, dict) or not set(values).issubset({"limit", "cursor"}):
                raise ValidationError("SR RFC relationship query fields are invalid")
            limit = values.get("limit", 25)
            if type(limit) is not int or not 1 <= limit <= 25:
                raise ValidationError("SR RFC branch HTTP page size must be 1..25")
            return TicketReadResponse(200, self._sr_rfcs.list_branches(
                service_request_id=require_uuid4(relation.group(1)),
                limit=limit, cursor=values.get("cursor")
            ).to_response())
        point = _DETAIL.fullmatch(path)
        identity = _IDENTITY.fullmatch(path)
        notes = _NOTES.fullmatch(path)
        if point is None and identity is None and notes is None:
            return None
        if method != "GET":
            raise ValidationError("Ticket presentation routes are read-only")
        if not isinstance(values, dict):
            raise ValidationError("Ticket query fields are invalid")

        if identity is not None:
            if values:
                raise ValidationError("Business identity query does not accept filters")
            business_id = identity.group(1)
            # The owner query validates the exact official/local ID grammar.
            return TicketReadResponse(
                200, asdict(self._service_requests.get(business_identity=business_id))
            )

        if point is not None:
            if values:
                raise ValidationError("Ticket point query does not accept filters")
            ticket_id = require_uuid4(point.group(2))
            result = (
                self._service_requests.get(service_request_id=ticket_id)
                if point.group(1) == "service-requests"
                else self._rfcs.get(rfc_id=ticket_id)
            )
            return TicketReadResponse(200, asdict(result))

        assert notes is not None
        if not set(values).issubset(_NOTES_ALLOWED):
            raise ValidationError("Working Note query fields are invalid")
        ticket_type, raw_id = notes.groups()
        ticket_id = require_uuid4(raw_id)
        limit = values.get("limit", 10)
        # The UI response must stay bounded: each note can contain up to 64KiB.
        if type(limit) is not int or not 1 <= limit <= 10:
            raise ValidationError("Ticket workbench Working Note limit must be 1..10")
        cursor = values.get("cursor")
        if cursor is not None and not isinstance(cursor, dict):
            raise ValidationError("Working Note cursor must be an owner-defined object")
        result = self._notes.list_notes(
            ticket_type=ticket_type, ticket_id=ticket_id, limit=limit, cursor=cursor
        )
        return TicketReadResponse(200, result.to_response())
