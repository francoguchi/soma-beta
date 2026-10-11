from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from soma.foundation.errors import SomaError, ValidationError
from soma.foundation.identifiers import require_uuid4
from soma.foundation.persistence.connections import ConnectionFactory
from soma.foundation.persistence.uow import ReadSnapshot
from soma.reference.domain.matching import normalize_match_key, require_persisted_matching_profile

CandidateState = Literal["UNRESOLVED", "UNIQUE_CANDIDATE", "AMBIGUOUS"]


@dataclass(frozen=True, slots=True)
class CandidateResult:
    state: CandidateState
    explanation: str
    candidate_count: int
    candidate_ids: tuple[str, ...]
    continuation_after_id: str | None


class ReferenceMatcher:
    """LLD-02 pure reader-bound matcher usable by Snapshots or the caller's current UnitOfWork."""

    @staticmethod
    def _require_profile(connection: Any) -> None:
        try:
            require_persisted_matching_profile(connection)
        except ValidationError as exc:
            raise SomaError(
                "MATCH_PROFILE_UNSUPPORTED",
                "stored reference matching profile is not supported by this build",
            ) from exc

    @staticmethod
    def _validate_paging(after_candidate_id, limit):
        if type(limit) is not int or limit < 1 or limit > 200:
            raise SomaError("FIELD_BOUND_EXCEEDED", "candidate page limit must be in 1..200")
        if after_candidate_id is not None:
            require_uuid4(after_candidate_id)

    @staticmethod
    def _result(reader, queries, *, after_candidate_id, limit, explanation):
        sql = " UNION ".join(query for query, _ in queries)
        parameters = tuple(value for _, values in queries for value in values)
        count = int(reader.execute(f"SELECT COUNT(*) FROM ({sql})", parameters).fetchone()[0])
        seek = ""
        if after_candidate_id is not None:
            seek = " WHERE candidate_id>?"
            parameters += (after_candidate_id,)
        rows = reader.execute(f"SELECT candidate_id FROM ({sql}){seek} ORDER BY candidate_id LIMIT ?",
            (*parameters, limit + 1)).fetchall()
        visible = tuple(str(row[0]) for row in rows[:limit])
        continuation = visible[-1] if len(rows) > limit and visible else None
        state = "UNRESOLVED" if count == 0 else "UNIQUE_CANDIDATE" if count == 1 else "AMBIGUOUS"
        return CandidateResult(state, explanation(count), count, visible, continuation)

    @classmethod
    def match_customer_org(
        cls,
        reader: Any,
        *,
        raw_account_code: str | None = None,
        raw_name: str | None = None,
        after_candidate_id: str | None = None,
        limit: int = 50,
    ) -> CandidateResult:
        cls._validate_paging(after_candidate_id, limit)
        if raw_account_code is None and raw_name is None:
            raise SomaError("MATCH_INPUT_INVALID", "at least one Customer match value is required")
        code_key = (
            None
            if raw_account_code is None
            else normalize_match_key(raw_account_code, raw_max_utf8_bytes=512)
        )
        name_key = (
            None
            if raw_name is None
            else normalize_match_key(raw_name, raw_max_utf8_bytes=1024)
        )
        cls._require_profile(reader)
        code_query = ("SELECT DISTINCT i.customer_org_id AS candidate_id FROM customer_org_identifiers i "
                    "JOIN customer_organizations c ON c.customer_org_id=i.customer_org_id "
                    "WHERE i.identifier_type='customer_account_code' AND i.match_key=? "
                    "AND i.lifecycle_state='active' AND c.lifecycle_state='active'", (code_key,))
        name_query = ("SELECT customer_org_id AS candidate_id FROM customer_organizations "
                      "WHERE lifecycle_state='active' AND name_match_key=?", (name_key,))
        code_count = 0 if code_key is None else int(reader.execute(
            f"SELECT COUNT(*) FROM ({code_query[0]})", code_query[1]).fetchone()[0])
        if code_key is not None and code_count == 1:
            sole_code = reader.execute(code_query[0] + " LIMIT 1", code_query[1]).fetchone()[0]
            differing_name = name_key is not None and reader.execute(
                f"SELECT 1 FROM ({name_query[0]}) WHERE candidate_id<>? LIMIT 1",
                (*name_query[1], sole_code)).fetchone() is not None
            if differing_name:
                queries = (code_query, name_query)
                explanation = "ACCOUNT_CODE_NAME_CONFLICT"
            else:
                queries = (code_query,)
                explanation = "ACCOUNT_CODE_MATCH"
        elif code_key is not None and code_count > 1:
            queries = (code_query, name_query) if name_key is not None else (code_query,)
            explanation = "ACCOUNT_CODE_MULTIPLE_CLAIMS"
        elif code_key is not None:
            queries = (name_query,) if name_key is not None else (code_query,)
            def unresolved_explanation(count):
                return ("NO_CANONICAL_CANDIDATE" if count == 0 else "ACCOUNT_CODE_UNRESOLVED_NAME_CANDIDATE"
                        if count == 1 else "ACCOUNT_CODE_UNRESOLVED_NAME_AMBIGUOUS")
            return cls._result(reader, queries, after_candidate_id=after_candidate_id, limit=limit,
                               explanation=unresolved_explanation)
        else:
            return cls._result(reader, (name_query,), after_candidate_id=after_candidate_id, limit=limit,
                               explanation=lambda count: "NAME_MATCH" if count else "NO_CANONICAL_CANDIDATE")
        return cls._result(reader, queries, after_candidate_id=after_candidate_id, limit=limit,
                           explanation=lambda _count: explanation)

    @classmethod
    def match_contact(
        cls,
        reader: Any,
        *,
        scope: str,
        raw_name: str | None = None,
        raw_email: str | None = None,
        after_candidate_id: str | None = None,
        limit: int = 50,
    ) -> CandidateResult:
        cls._validate_paging(after_candidate_id, limit)
        if not isinstance(scope, str) or not scope:
            raise SomaError("MATCH_INPUT_INVALID", "Contact match scope is required")
        if raw_name is None and raw_email is None:
            raise SomaError("MATCH_INPUT_INVALID", "at least one Contact match value is required")
        name_key = (
            None
            if raw_name is None
            else normalize_match_key(raw_name, raw_max_utf8_bytes=1024)
        )
        email_key = (
            None
            if raw_email is None
            else normalize_match_key(raw_email, raw_max_utf8_bytes=2048)
        )
        cls._require_profile(reader)
        if scope != "UNBOUND":
            customer = reader.execute(
                "SELECT lifecycle_state FROM customer_organizations WHERE customer_org_id=?",
                (scope,),
            ).fetchone()
            if customer is None:
                raise SomaError("NOT_FOUND", "Customer Organization scope does not exist")
            if str(customer[0]) != "active":
                raise SomaError("CUSTOMER_ORG_INACTIVE", "Customer Organization scope is archived")

        where_scope = (
            "NOT EXISTS (SELECT 1 FROM contact_affiliations a WHERE a.contact_id=c.contact_id AND a.is_current=1)"
            if scope == "UNBOUND"
            else "EXISTS (SELECT 1 FROM contact_affiliations a WHERE a.contact_id=c.contact_id "
            "AND a.is_current=1 AND a.customer_org_id=?)"
        )
        scope_params: tuple[object, ...] = () if scope == "UNBOUND" else (scope,)
        queries = []
        if name_key is not None:
            queries.append((
                "SELECT c.contact_id AS candidate_id FROM contacts c WHERE c.lifecycle_state='active' "
                f"AND c.name_match_key=? AND {where_scope}",
                (name_key, *scope_params),
            ))
        if email_key is not None:
            queries.append((
                "SELECT DISTINCT c.contact_id AS candidate_id FROM contacts c "
                "JOIN contact_channels ch ON ch.contact_id=c.contact_id "
                "WHERE c.lifecycle_state='active' AND ch.lifecycle_state='active' "
                "AND ch.channel_kind='email' AND ch.match_key=? AND "
                f"{where_scope}",
                (email_key, *scope_params),
            ))
        return cls._result(reader, queries, after_candidate_id=after_candidate_id, limit=limit,
                           explanation=lambda count: "EXACT_SCOPED_REFERENCE_MATCH" if count else "NO_CANONICAL_CANDIDATE")


class ReferenceMatchingQueries:
    """Snapshot convenience facade over the LLD-02 pure ReferenceMatcher."""

    def __init__(self, connection_factory: ConnectionFactory) -> None:
        self._factory = connection_factory

    def match_customer_organization(
        self,
        *,
        raw_account_code: str | None = None,
        raw_name: str | None = None,
        after_candidate_id: str | None = None,
        limit: int = 50,
    ) -> CandidateResult:
        with ReadSnapshot(self._factory) as snapshot:
            return ReferenceMatcher.match_customer_org(
                snapshot.connection,
                raw_account_code=raw_account_code,
                raw_name=raw_name,
                after_candidate_id=after_candidate_id,
                limit=limit,
            )

    def match_contact(
        self,
        *,
        scope: str,
        raw_name: str | None = None,
        raw_email: str | None = None,
        after_candidate_id: str | None = None,
        limit: int = 50,
    ) -> CandidateResult:
        with ReadSnapshot(self._factory) as snapshot:
            return ReferenceMatcher.match_contact(
                snapshot.connection,
                scope=scope,
                raw_name=raw_name,
                raw_email=raw_email,
                after_candidate_id=after_candidate_id,
                limit=limit,
            )
