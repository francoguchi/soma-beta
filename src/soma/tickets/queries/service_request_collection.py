"""Bounded current Service Request collection, composed from LLD-03 owners only.

Sort is accepted SR update time DESC + UUID DESC. Page totals are point-in-time
read counts, not a repeatable historical snapshot across separate requests.
Status/summary display only accepted, pointed source observations.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from soma.foundation.errors import IntegrityFailure, ValidationError
from soma.foundation.identifiers import require_uuid4
from soma.foundation.persistence.connections import ConnectionFactory
from soma.foundation.persistence.uow import ReadSnapshot

_MAX_LIMIT = 100
_SORT = "SR_UPDATED_ID_DESC_V1"


@dataclass(frozen=True, slots=True)
class ServiceRequestCollectionItem:
    service_request_id: str
    official_sr_no: str | None
    local_sr_no: str | None
    revision: int
    updated_at_utc: int
    summary: str | None
    status: str | None
    summary_truncated: bool
    status_truncated: bool


class ServiceRequestCollectionQuery:
    def __init__(self, factory: ConnectionFactory) -> None:
        self._factory = factory

    def list_service_requests(self, *, limit: int = 50,
                              cursor: dict[str, Any] | None = None) -> dict[str, object]:
        if type(limit) is not int or not 1 <= limit <= _MAX_LIMIT:
            raise ValidationError("Service Request collection limit must be an integer from 1 to 100")
        after: tuple[int, str] | None = None
        if cursor is not None:
            if not isinstance(cursor, dict) or set(cursor) != {"version", "sort_registry_id", "updated_at_utc", "service_request_id"}:
                raise ValidationError("Service Request cursor fields are invalid")
            if type(cursor["version"]) is not int or cursor["version"] != 1 or cursor["sort_registry_id"] != _SORT:
                raise ValidationError("Service Request collection cursor is stale")
            updated = cursor["updated_at_utc"]
            if type(updated) is not int or updated < 0:
                raise ValidationError("Service Request continuation timestamp is invalid")
            after = updated, require_uuid4(cursor["service_request_id"])

        with ReadSnapshot(self._factory) as snapshot:
            connection = snapshot.connection
            total = int(connection.execute("SELECT COUNT(*) FROM service_requests").fetchone()[0])
            where = ""
            parameters: tuple[object, ...] = ()
            if after is not None:
                where = "WHERE (sr.updated_at_utc < ? OR (sr.updated_at_utc = ? AND sr.service_request_id < ?))"
                parameters = (after[0], after[0], after[1])
            rows = connection.execute(
                "SELECT sr.service_request_id,sr.official_sr_no,sr.local_sr_no,sr.revision,sr.updated_at_utc,"
                "sp.problem_summary_observation_id,summary.field_key,summary.value_state,summary.text_value,"
                "sp.status_observation_id,status.field_key,status.value_state,status.text_value "
                "FROM service_requests sr "
                "LEFT JOIN sr_current_source_projection sp ON sp.service_request_id=sr.service_request_id "
                "LEFT JOIN sr_source_field_observations summary ON summary.sr_source_field_observation_id=sp.problem_summary_observation_id "
                "AND summary.service_request_id=sr.service_request_id AND summary.field_key='problem_summary' "
                "LEFT JOIN sr_source_field_observations status ON status.sr_source_field_observation_id=sp.status_observation_id "
                "AND status.service_request_id=sr.service_request_id AND status.field_key='status' "
                + where + " ORDER BY sr.updated_at_utc DESC,sr.service_request_id DESC LIMIT ?",
                (*parameters, limit + 1),
            ).fetchall()
            items: list[ServiceRequestCollectionItem] = []
            for row in rows[:limit]:
                if row[5] is not None and row[6] != "problem_summary":
                    raise IntegrityFailure("Service Request summary points to invalid evidence")
                if row[9] is not None and row[10] != "status":
                    raise IntegrityFailure("Service Request status points to invalid evidence")
                full_summary = str(row[8]) if row[7] == "usable" and row[8] is not None else None
                full_status = str(row[12]) if row[11] == "usable" and row[12] is not None else None
                # Read DTOs have a strict byte budget even when an imported
                # observation contains a very long value. Surface clipping.
                items.append(ServiceRequestCollectionItem(
                    service_request_id=str(row[0]),
                    official_sr_no=None if row[1] is None else str(row[1]),
                    local_sr_no=None if row[2] is None else str(row[2]),
                    revision=int(row[3]), updated_at_utc=int(row[4]),
                    summary=None if full_summary is None else full_summary[:512],
                    status=None if full_status is None else full_status[:96],
                    summary_truncated=full_summary is not None and len(full_summary) > 512,
                    status_truncated=full_status is not None and len(full_status) > 96,
                ))
            has_more = len(rows) > limit
            last = items[-1] if has_more and items else None
            continuation = ({
                "version": 1, "sort_registry_id": _SORT,
                "updated_at_utc": last.updated_at_utc,
                "service_request_id": last.service_request_id,
            } if last is not None else None)
            return {
                "items": [asdict(item) for item in items],
                "total_count_at_read": total,
                "continuation": continuation,
                "sort_registry_id": _SORT,
            }
