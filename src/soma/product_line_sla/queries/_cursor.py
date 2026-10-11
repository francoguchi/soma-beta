from __future__ import annotations

from soma.foundation.errors import ValidationError


def select_keyset_page(reader, *, columns, source, clauses=(), parameters=(),
                       order, key=None, descending=False, limit):
    """Read a bounded page and its full filtered count in the caller's snapshot.

    SQL fragments are owning-query constants; only values are bound parameters.
    Cursor identity and key types must already be validated by the owning query.
    """
    filters = list(clauses)
    values = tuple(parameters)
    if key is not None and any(type(value) is int and not -(1 << 63) <= value < (1 << 63) for value in key):
        raise ValidationError("cursor integer is outside the database ordering range")
    where = " WHERE " + " AND ".join(filters) if filters else ""
    total = int(reader.execute(f"SELECT COUNT(*) FROM {source}{where}", values).fetchone()[0])
    if key is not None:
        comparison = "<" if descending else ">"
        filters.append(f"({','.join(order)}) {comparison} ({','.join('?' for _ in order)})")
        values += tuple(key)
    where = " WHERE " + " AND ".join(filters) if filters else ""
    direction = " DESC" if descending else " ASC"
    ordering = ",".join(column + direction for column in order)
    rows = reader.execute(
        f"SELECT {columns} FROM {source}{where} ORDER BY {ordering} LIMIT ?",
        (*values, limit + 1),
    ).fetchall()
    return rows, total


def cursor_envelope(
    *,
    query_id: str,
    sort_id: str,
    last_key: list[object],
    filter_fingerprint: str,
) -> dict[str, object]:
    """Build the shared Product-Line/SLA CursorV1 envelope only.

    Query-specific validation, key typing, filter fingerprints and sort registries
    remain owned by each query module.
    """
    return {
        "version": 1,
        "query_id": query_id,
        "sort_registry_id": sort_id,
        "last_key_tuple": last_key,
        "filter_fingerprint": filter_fingerprint,
        "null_order": "none",
    }
