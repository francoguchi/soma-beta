"""LLD-04 browser read composition uses accepted import owners after authentication."""
from types import SimpleNamespace

import pytest

from soma.foundation.errors import SomaError, ValidationError
from soma.runtime_domains import DomainRoutes
from soma.ticket_import.http.routes import TicketImportQueryRouteAdapter


class _NoMatch:
    def dispatch(self, *_args, **_kwargs):
        return None


class _Communications:
    def routes(self, **_kwargs):
        return _NoMatch()


class _Allowed:
    def validate_request(self, _request, *, mutation):
        assert mutation is False
        return SimpleNamespace(actor_id="local-admin")


def _request(path, params=()):
    return SimpleNamespace(
        method="GET",
        url=SimpleNamespace(path=path, query="&".join(k+"="+v for k,v in params)),
        query_params=SimpleNamespace(multi_items=lambda: list(params)),
    )


def _runtime(factory, security):
    runtime=DomainRoutes.__new__(DomainRoutes)
    runtime.security=security
    runtime.import_reads=TicketImportQueryRouteAdapter(factory)
    runtime.communications=_Communications()
    for name in ("tickets","infrastructure","reference","inventory","sla","objective_routes"):
        setattr(runtime,name,_NoMatch())
    return runtime


def test_source_status_and_bounded_run_history_are_real_owner_queries(initialized_database):
    path, factory_builder=initialized_database
    runtime=_runtime(factory_builder(path),_Allowed())
    for family in ("advanced_search_sr","rfc_enhanced","wfm_service_provider"):
        response=runtime.dispatch(_request("/api/v1/imports/sources/"+family),{})
        assert response.status==200
        assert response.body["source_family"]==family
        assert response.body["configured"] is False
        assert response.body["checkpoint"] is None
        assert response.body["latest_run"] is None
    runs=runtime.dispatch(_request("/api/v1/imports/runs",(("limit","25"),)),{})
    assert runs.status==200
    assert dict(runs.body)=={"items":[],"next_cursor":None}


def test_import_query_bridge_is_closed_to_unreviewed_query_fields(initialized_database):
    path, factory_builder=initialized_database
    runtime=_runtime(factory_builder(path),_Allowed())
    with pytest.raises(ValidationError):
        runtime.dispatch(_request("/api/v1/imports/runs",(("limit","101"),)),{})
    with pytest.raises(ValidationError):
        runtime.dispatch(_request("/api/v1/imports/runs",(("surprise","bad"),)),{})


def test_unauthenticated_import_reads_do_not_enter_owner_adapter(initialized_database):
    path, factory_builder=initialized_database
    class Denied:
        def validate_request(self, _request, *, mutation):
            assert mutation is False
            raise SomaError("UNAUTHENTICATED","session required")
    runtime=_runtime(factory_builder(path),Denied())
    class MustNotRead:
        def dispatch(self,*_args,**_kwargs):
            raise AssertionError("Import owner queried before authentication")
    runtime.import_reads=MustNotRead()
    with pytest.raises(SomaError,match="session required"):
        runtime.dispatch(_request("/api/v1/imports/runs",(("limit","25"),)),{})
