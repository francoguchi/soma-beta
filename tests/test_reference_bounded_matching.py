"""Bound candidate materialization without suppressing distinct identities."""
import pytest

from soma.foundation.errors import ValidationError
from soma.foundation.identifiers import new_uuid4
from soma.reference.application.contact_service import ContactReferenceService
from soma.reference.application.customer_service import CustomerReferenceService
from soma.reference.queries.matching import ReferenceMatchingQueries
from test_sla_bounded_paging import MeasuredFactory


def _walk(query, measured, count, explanation):
    seen, after = [], None
    while True:
        measured.measurements.clear()
        result = query(limit=3, after_candidate_id=after)
        assert result.candidate_count == count and result.state == "AMBIGUOUS"
        assert result.explanation == explanation
        expansions = [size for sql, size in measured.measurements if "SELECT candidate_id FROM" in sql]
        assert expansions and max(expansions) <= 4
        seen.extend(result.candidate_ids)
        after = result.continuation_after_id
        if after is None:
            break
    assert len(seen) == count and len(set(seen)) == count and seen == sorted(seen)


def test_customer_match_pages_keep_account_code_conflicts_and_exact_ambiguity(initialized_database):
    path, builder = initialized_database
    factory = builder(path)
    customers = CustomerReferenceService(factory)
    for _ in range(12):
        customers.create_customer_organization(command_id=new_uuid4(), name="Paged customer")
    owner = customers.create_customer_organization(command_id=new_uuid4(), name="Code owner", account_code="CODE-1")
    measured = MeasuredFactory(factory)
    matcher = ReferenceMatchingQueries(measured)
    _walk(lambda **args: matcher.match_customer_organization(raw_account_code="CODE-1", raw_name="Paged customer", **args),
          measured, 13, "ACCOUNT_CODE_NAME_CONFLICT")
    _walk(lambda **args: matcher.match_customer_organization(raw_account_code="UNKNOWN", raw_name="Paged customer", **args),
          measured, 12, "ACCOUNT_CODE_UNRESOLVED_NAME_AMBIGUOUS")
    unique = matcher.match_customer_organization(raw_account_code="CODE-1", raw_name="Does not match")
    assert unique.state == "UNIQUE_CANDIDATE" and unique.candidate_ids == (owner.customer_org_id,)
    assert unique.explanation == "ACCOUNT_CODE_MATCH"
    with pytest.raises(ValidationError):
        matcher.match_customer_organization(raw_name="Paged customer", after_candidate_id=123)


def test_contact_union_pages_deduplicate_keys_and_keep_scope_isolation(initialized_database):
    path, builder = initialized_database
    factory = builder(path)
    contacts = ContactReferenceService(factory)
    for index in range(12):
        contacts.create_contact(command_id=new_uuid4(), name="Paged contact" if index < 10 else "Email only",
            initial_email="same@example.com" if index < 5 or index >= 10 else None)
    customer = CustomerReferenceService(factory).create_customer_organization(command_id=new_uuid4(), name="Other scope")
    contacts.create_contact(command_id=new_uuid4(), name="Paged contact", initial_email="same@example.com",
        initial_customer_org_id=customer.customer_org_id)
    measured = MeasuredFactory(factory)
    matcher = ReferenceMatchingQueries(measured)
    _walk(lambda **args: matcher.match_contact(scope="UNBOUND", raw_name="Paged contact", raw_email="same@example.com", **args),
          measured, 12, "EXACT_SCOPED_REFERENCE_MATCH")
    scoped = matcher.match_contact(scope=customer.customer_org_id, raw_name="Paged contact", raw_email="same@example.com")
    assert scoped.state == "UNIQUE_CANDIDATE" and scoped.candidate_count == 1
