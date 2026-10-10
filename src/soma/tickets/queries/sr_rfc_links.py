"""Current accepted Service Request -> RFC relationships; no graph inferred from labels."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from soma.foundation.errors import SomaError, ValidationError
from soma.foundation.identifiers import require_uuid4
from soma.foundation.persistence.connections import ConnectionFactory
from soma.foundation.persistence.uow import ReadSnapshot

_SORT = "SR_RFC_LINK_OPENED_ID_DESC_V1"


@dataclass(frozen=True, slots=True)
class LinkedRfcItem:
    sr_rfc_link_id: str
    rfc_id: str
    rfc_no: str
    local_archive_state: str
    hierarchy_role: str
    opened_at_utc: int
    reason_category: str | None


class ServiceRequestRfcLinksQuery:
    def __init__(self, factory: ConnectionFactory) -> None:
        self._factory = factory

    def list_linked_rfcs(self, *, service_request_id: str, limit: int = 25,
                         cursor: dict[str, Any] | None = None) -> dict[str, object]:
        owner_id = require_uuid4(service_request_id)
        if type(limit) is not int or not 1 <= limit <= 100:
            raise ValidationError("Linked RFC page size must be 1 through 100")
        after = None
        if cursor is not None:
            required = {"version", "sort_registry_id", "service_request_id",
                        "opened_at_utc", "sr_rfc_link_id"}
            if not isinstance(cursor, dict) or set(cursor) != required:
                raise ValidationError("SR linked RFC cursor fields are invalid")
            if type(cursor["version"]) is not int or cursor["version"] != 1 or cursor["sort_registry_id"] != _SORT:
                raise ValidationError("SR linked RFC cursor version is stale")
            if require_uuid4(cursor["service_request_id"]) != owner_id:
                raise ValidationError("SR linked RFC cursor belongs to another owner")
            stamp = cursor["opened_at_utc"]
            if type(stamp) is not int or stamp < 0:
                raise ValidationError("SR linked RFC cursor time is invalid")
            after = stamp, require_uuid4(cursor["sr_rfc_link_id"])

        with ReadSnapshot(self._factory) as snapshot:
            connection = snapshot.connection
            if connection.execute(
                "SELECT 1 FROM service_requests WHERE service_request_id=?", (owner_id,)
            ).fetchone() is None:
                raise SomaError("NOT_FOUND", "Service Request does not exist")
            total = int(connection.execute(
                "SELECT COUNT(*) FROM sr_rfc_links WHERE service_request_id=? AND link_state='active'",
                (owner_id,),
            ).fetchone()[0])
            after_sql = ""
            params: tuple[object, ...] = (owner_id,)
            if after is not None:
                after_sql = "AND (ln.opened_at_utc<? OR (ln.opened_at_utc=? AND ln.sr_rfc_link_id<?)) "
                params += (after[0], after[0], after[1])
            rows = connection.execute(
                "SELECT ln.sr_rfc_link_id,ln.rfc_id,r.rfc_no,r.local_archive_state,ln.opened_at_utc,ln.reason_category,"
                "(SELECT COUNT(*) FROM rfc_hierarchy_edges p WHERE p.child_rfc_id=r.rfc_id AND p.edge_state='active'),"
                "(SELECT COUNT(*) FROM rfc_hierarchy_edges c WHERE c.parent_rfc_id=r.rfc_id AND c.edge_state='active') "
                "FROM sr_rfc_links ln JOIN rfcs r ON r.rfc_id=ln.rfc_id "
                "WHERE ln.service_request_id=? AND ln.link_state='active' " + after_sql +
                "ORDER BY ln.opened_at_utc DESC,ln.sr_rfc_link_id DESC LIMIT ?",
                (*params,limit+1),
            ).fetchall()
            items: list[LinkedRfcItem] = []
            for row in rows[:limit]:
                parent_count, subordinate_count = int(row[6]),int(row[7])
                if parent_count > 1 or parent_count and subordinate_count:
                    raise SomaError("PERSISTENCE_FAILURE", "RFC linkage violates the two-level forest")
                items.append(LinkedRfcItem(
                    sr_rfc_link_id=str(row[0]), rfc_id=str(row[1]),rfc_no=str(row[2]),
                    local_archive_state=str(row[3]),opened_at_utc=int(row[4]),
                    reason_category=None if row[5] is None else str(row[5]),
                    hierarchy_role="subordinate" if parent_count else "root" if subordinate_count else "standalone",
                ))
            last=items[-1] if len(rows)>limit else None
            return {
                "service_request_id":owner_id, "items":[asdict(item) for item in items],
                "total_count_at_read":total, "sort_registry_id":_SORT,
                "continuation": None if last is None else {
                    "version":1,"sort_registry_id":_SORT,
                    "service_request_id":owner_id,
                    "opened_at_utc":last.opened_at_utc,
                    "sr_rfc_link_id":last.sr_rfc_link_id,
                },
            }
