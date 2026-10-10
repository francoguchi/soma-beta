"""Bounded current RFC register from LLD-03 canonical identities.

No external status is promoted into local archive state. Each page is one
read snapshot; continuity across changed pages is not asserted.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any

from soma.foundation.errors import SomaError, ValidationError
from soma.foundation.identifiers import require_uuid4
from soma.foundation.persistence.connections import ConnectionFactory
from soma.foundation.persistence.uow import ReadSnapshot

_SORT = "RFC_UPDATED_ID_DESC_V1"


@dataclass(frozen=True, slots=True)
class RfcRegisterItem:
    rfc_id: str
    rfc_no: str
    revision: int
    updated_at_utc: int
    local_archive_state: str
    hierarchy_role: str
    subordinate_count: int
    direct_service_request_count: int
    customer_org_id: str | None
    source_summary: str | None
    source_summary_truncated: bool
    source_status: str | None
    source_status_truncated: bool
    source_status_class: str


class RfcCollectionQuery:
    def __init__(self, factory: ConnectionFactory) -> None:
        self._factory = factory

    def list_rfcs(self, *, limit: int = 25,
                  cursor: dict[str, Any] | None = None) -> dict[str, object]:
        if type(limit) is not int or not 1 <= limit <= 100:
            raise ValidationError("RFC collection limit must be an integer from 1 through 100")
        after = None
        if cursor is not None:
            if not isinstance(cursor, dict) or set(cursor) != {
                "version", "sort_registry_id", "updated_at_utc", "rfc_id"
            }:
                raise ValidationError("RFC collection cursor fields are invalid")
            stamp = cursor["updated_at_utc"]
            if type(cursor["version"]) is not int or cursor["version"] != 1 or cursor["sort_registry_id"] != _SORT:
                raise ValidationError("RFC collection cursor version or sort is stale")
            if type(stamp) is not int or stamp < 0:
                raise ValidationError("RFC collection cursor timestamp is invalid")
            after = (stamp, require_uuid4(cursor["rfc_id"]))

        with ReadSnapshot(self._factory) as snapshot:
            connection = snapshot.connection
            total = int(connection.execute("SELECT COUNT(*) FROM rfcs").fetchone()[0])
            where = ""
            params: tuple[object, ...] = ()
            if after is not None:
                where = "WHERE (r.updated_at_utc < ? OR (r.updated_at_utc = ? AND r.rfc_id < ?))"
                params = (after[0], after[0], after[1])
            rows = connection.execute(
                "SELECT r.rfc_id, r.rfc_no, r.revision, r.updated_at_utc, r.local_archive_state, r.customer_org_id,"
                "(SELECT COUNT(*) FROM rfc_hierarchy_edges p WHERE p.child_rfc_id=r.rfc_id AND p.edge_state='active'),"
                "(SELECT COUNT(*) FROM rfc_hierarchy_edges c WHERE c.parent_rfc_id=r.rfc_id AND c.edge_state='active'),"
                "(SELECT COUNT(*) FROM sr_rfc_links s WHERE s.rfc_id=r.rfc_id AND s.link_state='active'),"
                "sp.summary_text,sp.summary_evidence_id,sp.status_text,sp.status_evidence_id,sp.status_class "
                "FROM rfcs r LEFT JOIN rfc_current_source_projection sp ON sp.rfc_id=r.rfc_id "
                + where + " ORDER BY r.updated_at_utc DESC,r.rfc_id DESC LIMIT ?",
                (*params, limit + 1),
            ).fetchall()
            items: list[RfcRegisterItem] = []
            for row in rows[:limit]:
                parent_count = int(row[6])
                children = int(row[7])
                if parent_count > 1 or parent_count and children:
                    raise SomaError("PERSISTENCE_FAILURE", "RFC hierarchy violates two-level forest invariant")
                # Source display requires its accepted evidence pointer.
                if (row[9] is None) != (row[10] is None) or (row[11] is None) != (row[12] is None):
                    raise SomaError("PERSISTENCE_FAILURE", "RFC source text is not supported by accepted evidence")
                summary = None if row[9] is None else str(row[9])
                status = None if row[11] is None else str(row[11])
                items.append(RfcRegisterItem(
                    rfc_id=str(row[0]), rfc_no=str(row[1]), revision=int(row[2]),
                    updated_at_utc=int(row[3]), local_archive_state=str(row[4]),
                    hierarchy_role="subordinate" if parent_count else "root" if children else "standalone",
                    subordinate_count=children, direct_service_request_count=int(row[8]),
                    customer_org_id=None if row[5] is None else str(row[5]),
                    source_summary=None if summary is None else summary[:512],
                    source_summary_truncated=summary is not None and len(summary) > 512,
                    source_status=None if status is None else status[:96],
                    source_status_truncated=status is not None and len(status) > 96,
                    source_status_class=str(row[13]) if row[13] is not None else "unknown",
                ))
            last = items[-1] if len(rows) > limit else None
            return {
                "items": [asdict(item) for item in items],
                "total_count_at_read": total,
                "sort_registry_id": _SORT,
                "continuation": None if last is None else {
                    "version": 1, "sort_registry_id": _SORT,
                    "updated_at_utc": last.updated_at_utc, "rfc_id": last.rfc_id,
                },
            }
