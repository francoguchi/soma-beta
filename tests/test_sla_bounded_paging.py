"""Paging must bound row expansion, not merely truncate the response."""
import pytest

from soma.foundation.errors import ValidationError
from soma.foundation.identifiers import new_uuid4
from soma.product_line_sla.queries.catalog import ProductLineSlaCatalogQueryService
from soma.product_line_sla.queries.classification import ProductLineSlaClassificationQueryService
from soma.product_line_sla.queries.reports import ProductLineSlaReportQueryService
from soma.product_line_sla.services.catalog import ProductLineSlaCatalogService
from soma.product_line_sla.services.classification import ProductLineSlaClassificationService
from soma.product_line_sla.services.policy import ProductLineSlaPolicyService
from soma.reference.application.customer_service import CustomerReferenceService


class MeasuredCursor:
    def __init__(self, cursor, sql, measurements):
        self.cursor, self.sql, self.measurements = cursor, sql, measurements

    def fetchall(self):
        rows = self.cursor.fetchall()
        self.measurements.append((self.sql, len(rows)))
        return rows

    def __iter__(self):
        return iter(self.cursor)

    def __getattr__(self, name):
        return getattr(self.cursor, name)


class MeasuredConnection:
    def __init__(self, connection, measurements):
        self.connection, self.measurements = connection, measurements

    def execute(self, sql, *args):
        return MeasuredCursor(self.connection.execute(sql, *args), sql, self.measurements)

    def __getattr__(self, name):
        return getattr(self.connection, name)


class MeasuredFactory:
    def __init__(self, factory):
        self.factory, self.measurements = factory, []

    def open_authoritative(self, **kwargs):
        return MeasuredConnection(self.factory.open_authoritative(**kwargs), self.measurements)


def walk(query, measurements, *, expected, identity, page_source):
    seen, cursor = [], None
    while True:
        measurements.clear()
        page = query(limit=3, cursor=cursor)
        assert page.exact_count == expected
        assert 0 < len(page.items) <= 3
        expanded = [count for sql, count in measurements if "FROM " + page_source in sql]
        assert expanded and max(expanded) <= 4
        seen.extend(item[identity] for item in page.items)
        cursor = page.next_cursor
        if cursor is None:
            break
        if len(seen) == 3:
            changed = {**cursor, "filter_fingerprint": "0" * 64}
            with pytest.raises(ValidationError):
                query(limit=3, cursor=changed)
            with pytest.raises(ValidationError):
                query(limit=3, cursor={**cursor, "version": True})
    assert len(seen) == expected and len(set(seen)) == expected
    return seen


def test_catalog_policy_and_mapping_pages_bound_expansion(initialized_database):
    path, builder = initialized_database
    factory = builder(path)
    customer = CustomerReferenceService(factory).create_customer_organization(command_id=new_uuid4(), name="Paging audit")
    catalog = ProductLineSlaCatalogService(factory)
    policy = ProductLineSlaPolicyService(factory)
    classification = ProductLineSlaClassificationService(factory)
    cpls = []
    for index in range(12):
        product = catalog.create_product_line(command_id=new_uuid4(), name=f"Product {index:02}")
        contract = catalog.create_contract(command_id=new_uuid4(), customer_org_id=customer.customer_org_id,
            name=f"Contract {index}", contract_reference=f"REF-{index:02}")
        cpl = catalog.create_contract_product_line(command_id=new_uuid4(), contract_id=contract.target_id,
            product_line_id=product.target_id, initial_policy_name="Initial", initial_template_source="IT_DEFAULT_V1")
        cpls.append(cpl)
        classification.create_mapping(command_id=new_uuid4(), customer_org_id=customer.customer_org_id,
            customer_account_code=f"ACCOUNT-{index:02}", contract_product_line_id=cpl.target_id)
    for revision in range(1, 12):
        policy.revise_policy(command_id=new_uuid4(), contract_product_line_id=cpls[0].target_id,
            base_revision=revision, policy_name=f"Revision {revision + 1}",
            template_source="IT_DEFAULT_V1", reason_category="contract_policy_revision")
    measured = MeasuredFactory(factory)
    reads = ProductLineSlaCatalogQueryService(measured)
    walk(reads.list_contracts, measured.measurements, expected=12, identity="contract_id", page_source="contracts")
    walk(reads.list_contract_product_lines, measured.measurements, expected=12,
         identity="contract_product_line_id", page_source="contract_product_lines")
    walk(lambda **args: reads.get_policy_history(contract_product_line_id=cpls[0].target_id, **args),
         measured.measurements, expected=12, identity="policy_revision_id", page_source="sla_policy_revisions")
    walk(ProductLineSlaClassificationQueryService(measured).list_mappings, measured.measurements,
         expected=12, identity="mapping_id", page_source="sla_classification_mappings")
    first = reads.list_contracts(customer_org_id=customer.customer_org_id, limit=3)
    assert first.exact_count == 12
    with pytest.raises(ValidationError):
        reads.list_contracts(cursor=first.next_cursor, limit=3)

    products, product_cursor = [], None
    while True:
        page = reads.list_product_lines(limit=3, cursor=product_cursor)
        assert page.exact_count == 12
        products.extend(item["name"] for item in page.items)
        product_cursor = page.next_cursor
        if product_cursor is None:
            break
    assert products == [f"Product {index:02}" for index in range(12)]


def test_report_attempt_page_expands_only_selected_attempts(initialized_database, monkeypatch):
    from soma.product_line_sla.services.report_orchestration import SlaReportOrchestrationService
    from soma.product_line_sla.repositories.reports import ReportRepository
    path, builder = initialized_database
    factory = builder(path)
    for index in range(12):
        SlaReportOrchestrationService(factory).start_monthly(command_id=new_uuid4(),
            calendar_month="2026-09", as_of_utc=1_790_000_000 + index,
            customer_org_id=None, destination_request_token=f"{index:064x}")
    original, expanded = ReportRepository.get_attempt, []
    def load(reader, identity):
        expanded.append(identity)
        return original(reader, identity)
    monkeypatch.setattr(ReportRepository, "get_attempt", load)
    measured = MeasuredFactory(factory)
    reads = ProductLineSlaReportQueryService(measured)
    cursor, seen = None, []
    while True:
        expanded.clear()
        page = reads.list_attempts(limit=3, cursor=cursor)
        assert len(expanded) <= 4 and page.exact_count == 12
        seen.extend((item["created_at_utc"], item["report_attempt_id"]) for item in page.items)
        cursor = page.next_cursor
        if cursor is None:
            break
    assert len(set(seen)) == 12 and seen == sorted(seen, reverse=True)


def test_report_member_pages_bound_reads_and_reject_storage_overflow(initialized_database):
    from test_product_line_sla_reporting import _member_row, _start_and_claim
    from soma.product_line_sla.services.report_worker import SlaReportWorkerService
    from soma.tickets.service_requests import ServiceRequestService
    path, builder = initialized_database
    factory = builder(path)
    members = []
    for index in range(12):
        sr = ServiceRequestService(factory).create_manual_service_request(command_id=new_uuid4(),
            official_sr_no=f"9100{index:04}")
        members.append({**_member_row(sr.service_request_id), "member_ordinal": index + 1})
    attempt, _, _, token = _start_and_claim(factory)
    report_id = attempt["report_attempt_id"]
    worker = SlaReportWorkerService(factory)
    worker.stage_batch(command_id=new_uuid4(), report_attempt_id=report_id,
        snapshot_generation_token=token, batch_ordinal=1, expected_attempt_revision=1,
        batch_payload_sha256=worker.batch_payload_hash(member_rows=tuple(members), tier_rows=(), cohort_rows=(), section_rows=()),
        member_rows=tuple(members))
    measured = MeasuredFactory(factory)
    reads = ProductLineSlaReportQueryService(measured)
    walk(lambda **args: reads.list_members(report_attempt_id=report_id, allow_in_progress_diagnostic=True, **args),
        measured.measurements, expected=12, identity="report_member_snapshot_id", page_source="sla_report_member_snapshots")
    with pytest.raises(Exception) as error:
        reads.list_members(report_attempt_id=report_id, limit=3)
    assert error.value.code == "SLA_REPORT_ATTEMPT_STATE"
    page = reads.list_members(report_attempt_id=report_id, allow_in_progress_diagnostic=True, limit=3)
    with pytest.raises(ValidationError):
        reads.list_members(report_attempt_id=report_id, allow_in_progress_diagnostic=True, limit=3,
            cursor={**page.next_cursor, "last_key_tuple": [1 << 90]})
