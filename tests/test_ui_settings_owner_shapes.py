"""Protect the exact Settings owner DTO shapes consumed by React UI V2."""
from dataclasses import asdict

from soma.objectives_tasks.settings import (
    OBJECTIVE_TIMEZONE_KEY,
    build_objective_timezone_setting_registry,
)
from soma.product_line_sla.queries.catalog import ProductLineSlaCatalogQueryService
from soma.product_line_sla.queries.classification import ProductLineSlaClassificationQueryService
from soma.reference.application.settings_service import SettingService


def test_objective_timezone_setting_uses_actual_owner_setting_envelope(initialized_database):
    path, factory_for_path = initialized_database
    factory = factory_for_path(path)
    value = SettingService(factory, build_objective_timezone_setting_registry()).get(OBJECTIVE_TIMEZONE_KEY)
    data = asdict(value)
    data.pop("replayed")
    data.pop("no_change")
    assert set(data) == {
        "setting_key", "contract_name", "contract_version", "value",
        "revision", "source", "semantic_owner",
    }
    assert data == {
        "setting_key": "OBJECTIVE_TIMEZONE_V1",
        "contract_name": "OBJECTIVE_TIMEZONE_V1",
        "contract_version": 1,
        "value": "America/Guayaquil",
        "revision": None,
        "source": "DEFAULT",
        "semantic_owner": "LLD-05",
    }


def test_sla_settings_catalogs_report_owner_next_cursor_and_counts(initialized_database):
    path, factory_for_path = initialized_database
    factory = factory_for_path(path)
    owner = ProductLineSlaCatalogQueryService(factory)
    classification = ProductLineSlaClassificationQueryService(factory)
    pages = (
        owner.list_product_lines(limit=200),
        owner.list_contracts(limit=200),
        owner.list_contract_product_lines(limit=200),
        classification.list_mappings(limit=200),
    )
    for page in pages:
        data = asdict(page)
        assert set(data) == {"items", "next_cursor", "exact_count"}
        assert data["items"] == ()
        assert data["next_cursor"] is None
        assert data["exact_count"] == 0
