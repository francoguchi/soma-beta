"""Runtime LLD-07 query registrations must be actually composed, not merely declared.

These are read-only endpoints; writes and unassembled LLD-07 commands retain
their fail-closed behavior. This catches fixture-only UI passing against a
source host whose inventory handler mapping lacks the owner query.
"""
from types import SimpleNamespace

import pytest

from soma.foundation.errors import SomaError, ValidationError
from soma.runtime_domains import DomainRoutes


def test_source_runtime_binds_existing_inventory_need_request_and_rma_read_owners(
    initialized_database, tmp_path
) -> None:
    database_path, factory_builder = initialized_database
    factory = factory_builder(database_path)
    domains = DomainRoutes(factory, SimpleNamespace(root=tmp_path))
    needs = domains.inventory.dispatch("GET", "/api/v1/inventory/needs", {"limit": 25})
    assert needs is not None and needs.status == 200
    assert needs.body["items"] == []
    assert needs.body["exact_total"] == 0

    requests = domains.inventory.dispatch(
        "GET", "/api/v1/inventory/requests", {"limit": 25, "as_of_utc": 100}
    )
    assert requests is not None and requests.status == 200
    assert requests.body["items"] == []
    assert requests.body["exact_total"] == 0
    assert requests.body["as_of_utc"] == 100

    missing = "11111111-1111-4111-8111-111111111111"
    for route in (
        "/api/v1/inventory/requests/" + missing,
        "/api/v1/inventory/rmas/" + missing,
    ):
        with pytest.raises(SomaError) as exc:
            domains.inventory.dispatch("GET", route, {})
        assert exc.value.code == "NOT_FOUND"
        with pytest.raises(ValidationError):
            domains.inventory.dispatch("GET", route, {"unaccepted_field": "no"})

    for kind in ("spare_need", "spare_request", "rma"):
        history = domains.inventory.dispatch(
            "GET", f"/api/v1/inventory/history/{kind}/{missing}", {"limit": 25}
        )
        assert history is not None and history.status == 200
        assert history.body == {"items": [], "continuation": None}
        with pytest.raises(ValidationError):
            domains.inventory.dispatch(
                "GET",
                f"/api/v1/inventory/history/{kind}/{missing}",
                {"unaccepted_field": "no"},
            )

    # Declared mutation routes remain uncomposed; no accidental write handler.
    with pytest.raises(Exception, match="not assembled"):
        domains.inventory.dispatch("POST", "/api/v1/inventory/requests", {})
