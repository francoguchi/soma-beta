"""A transport cleanup failure must not poison a reusable request worker."""
from concurrent.futures import ThreadPoolExecutor
import sqlite3

import pytest

from soma.foundation.errors import PersistenceRollbackFailure
from soma.foundation.persistence.connections import WriteAdmissionGate
from soma.foundation.persistence.uow import ReadSnapshot, UnitOfWork


class FaultConnection:
    def __init__(self, fail_statement=None, fail_close=False):
        self.raw = sqlite3.connect(":memory:", isolation_level=None)
        self.fail_statement = fail_statement
        self.fail_close = fail_close

    @property
    def in_transaction(self):
        return self.raw.in_transaction

    def execute(self, statement):
        if statement == self.fail_statement:
            raise sqlite3.OperationalError("injected statement failure")
        return self.raw.execute(statement)

    def close(self):
        self.raw.close()
        if self.fail_close:
            raise RuntimeError("injected close failure")


class FaultFactory:
    def __init__(self, fail_statement=None, fail_close=False):
        self.gate = WriteAdmissionGate()
        self.fail_statement = fail_statement
        self.fail_close = fail_close

    def open_authoritative(self, **_kwargs):
        return FaultConnection(self.fail_statement, self.fail_close)

    def enter_authoritative_write(self):
        self.gate.enter()
        return True

    def exit_authoritative_write(self, admitted):
        if admitted:
            self.gate.exit()


@pytest.mark.parametrize("stage", ["begin", "exit", "rollback"])
def test_close_failure_releases_context_and_writer_admission(stage):
    factory = FaultFactory(
        fail_statement={"begin": "BEGIN IMMEDIATE", "rollback": "ROLLBACK"}.get(stage),
        fail_close=True,
    )

    def failing_request():
        with UnitOfWork(factory):
            if stage == "rollback":
                raise ValueError("injected command failure")

    def following_request():
        with UnitOfWork(FaultFactory()) as uow:
            assert uow.connection.execute("SELECT 1").fetchone() == (1,)

    with ThreadPoolExecutor(max_workers=1) as worker:
        failure = worker.submit(failing_request)
        with pytest.raises(Exception):
            failure.result()
        assert factory.gate.active == 0
        assert factory.gate.wait_for_drain(0)
        worker.submit(following_request).result()
    if stage == "rollback":
        assert isinstance(failure.exception(), PersistenceRollbackFailure)


@pytest.mark.parametrize("fail_begin", [False, True])
def test_read_snapshot_cannot_expose_connection_after_close_failure(fail_begin):
    snapshot = ReadSnapshot(FaultFactory("BEGIN" if fail_begin else None, True))
    with pytest.raises(Exception):
        with snapshot:
            pass
    with pytest.raises(RuntimeError, match="has not been entered"):
        _ = snapshot.connection


def test_failed_driver_close_does_not_report_closed_connection_or_transaction(initialized_database, security_provider):
    from soma.foundation.persistence.connections import ConnectionFactory
    path, _ = initialized_database
    class CloseOnce:
        def __init__(self, connection):
            self.connection, self.fail_close = connection, True
        def close(self):
            if self.fail_close:
                self.fail_close = False
                raise RuntimeError("injected close failure before transport release")
            self.connection.close()
        def __getattr__(self, name):
            return getattr(self.connection, name)
    class Driver:
        def connect(self, *args, **kwargs):
            return CloseOnce(sqlite3.connect(*args, **kwargs))
    factory = ConnectionFactory(path, security_provider, driver=Driver())
    connection = factory.open_authoritative()
    connection.execute("BEGIN IMMEDIATE")
    with pytest.raises(RuntimeError, match="before transport release"):
        connection.close()
    metrics = factory.metrics.snapshot()
    assert metrics.open_authoritative_connections == 1 and metrics.active_transactions == 1
    connection.execute("ROLLBACK")
    connection.close()
    assert factory.metrics.snapshot().open_authoritative_connections == 0
    assert factory.metrics.snapshot().active_transactions == 0


def test_host_does_not_release_security_or_ownership_while_keyed_connection_remains(tmp_path, migration_directory, security_provider):
    from test_foundation_runtime_host import _runtime
    from soma.foundation.runtime.instance_lock import DataInstanceLock
    from soma.foundation.errors import SomaError
    runtime, paths, _, security, _ = _runtime(tmp_path, migration_directory, security_provider)
    runtime.start()
    connection = runtime.connection_factory.open_authoritative(read_only=True)
    try:
        with pytest.raises(SomaError) as failure:
            runtime.shutdown(grace_seconds=5)
        assert failure.value.code == "INTERNAL_ERROR"
        assert paths.registry.exists() and not security.closed
        with pytest.raises(SomaError):
            DataInstanceLock.acquire(paths.lock)
    finally:
        connection.close()
        if runtime.state in {"READY", "QUIESCING"}:
            runtime.shutdown(grace_seconds=5)
    assert runtime.state == "STOPPED" and not paths.registry.exists()
