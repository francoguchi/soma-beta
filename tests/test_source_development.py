"""Guarded development maintenance and native encrypted reset regressions."""
import importlib.util
import os
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("source_development", ROOT / "tools/source_development.py")
development = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(development)


@pytest.mark.parametrize("confirmation", ["NO", "reset", "", None])
def test_reset_refuses_without_confirmation_before_stop_or_files(tmp_path, monkeypatch, confirmation):
    monkeypatch.setattr(development, "canonical_source_instance", lambda: tmp_path)
    monkeypatch.setattr(development, "WindowsAclProvider", lambda: pytest.fail("must not inspect/mutate before confirmation"))
    def confirm(prompt):
        if confirmation is None:
            raise EOFError
        return confirmation
    assert development.reset_development(confirm=confirm) == 10
    assert not list(tmp_path.iterdir())


def test_reset_never_rebuilds_after_failed_stop(tmp_path, monkeypatch):
    from soma.security.runtime.source_control import SourceControlResult, SourceOutcome
    monkeypatch.setattr(development, "canonical_source_instance", lambda: tmp_path)
    monkeypatch.setattr(development, "WindowsAclProvider", lambda: object())
    monkeypatch.setattr(development, "stop", lambda *args: SourceControlResult(SourceOutcome.FAILED, 32, "timeout"))
    monkeypatch.setattr(development, "rebuild_database", lambda *args: pytest.fail("failed stop cannot reset"))
    assert development.reset_development(confirm=lambda prompt: "RESET") == 32


@pytest.mark.skipif(os.name != "nt", reason="native encrypted development instance")
def test_native_reset_preserves_encrypted_previous_database_and_leaves_stopped(tmp_path):
    pytest.importorskip("sqlcipher3")
    from soma.application import SourceApplication
    from soma.foundation.identifiers import new_uuid4
    from soma.foundation.persistence.connections import ConnectionFactory
    from soma.foundation.queries.data_instance_identity import DataInstanceIdentityReader
    from soma.security.runtime.installation import SourceInstallationSecurity
    from soma.security.runtime.windows import WindowsAclProvider
    files = WindowsAclProvider()
    root = tmp_path / "instance"
    files.ensure_owner_only_directory(root)
    app = SourceApplication(root)
    health = app.host.start()
    try:
        with pytest.raises(Exception, match="owns|Stop|stop"):
            development.rebuild_database(root, files)
        app.auth.setup({"command_id": new_uuid4(), "password": "test native password", "password_confirmation": "test native password"})
    finally:
        app.host.shutdown(grace_seconds=10)
    keys = {name: (root / "security" / name).read_bytes() for name in ("installation-id", "live-data-key.dpapi")}
    previous = development.rebuild_database(root, files)
    assert previous.read_bytes()[:16] != b"SQLite format 3\0"
    assert not (root / "runtime/runtime.json").exists()
    assert all((root / "security" / name).read_bytes() == raw for name, raw in keys.items())
    security = SourceInstallationSecurity(root)
    from soma.foundation.runtime.instance_lock import DataInstanceLock
    with DataInstanceLock.acquire(root / "data/soma.instance.lock", create=False) as lock:
        security.prepare_storage(lambda: lock.held)
        for path, expected_credentials in ((previous, 1), (root / "data/soma.db", 0)):
            connection = ConnectionFactory(path, security).open_authoritative(read_only=True, require_wal=False)
            try:
                identity = DataInstanceIdentityReader.get(connection)
                assert (identity == health.data_instance_id) == (expected_credentials == 1)
                assert connection.execute("SELECT count(*) FROM security_auth_credentials").fetchone() == (expected_credentials,)
                assert connection.execute("SELECT count(*) FROM schema_migrations").fetchone() == (19,)
            finally:
                connection.close()
    restarted = SourceApplication(root)
    try:
        restarted.host.start()
        restarted.auth.setup({"command_id": new_uuid4(), "password": "new native password", "password_confirmation": "new native password"})
    finally:
        restarted.host.shutdown(grace_seconds=10)


@pytest.mark.skipif(os.name != "nt", reason="native encrypted development instance")
def test_reset_build_failure_preserves_live_database(tmp_path, monkeypatch):
    pytest.importorskip("sqlcipher3")
    from soma.application import SourceApplication
    from soma.security.runtime.windows import WindowsAclProvider
    files = WindowsAclProvider()
    root = tmp_path / "instance"
    files.ensure_owner_only_directory(root)
    app = SourceApplication(root)
    app.host.start()
    app.host.shutdown(grace_seconds=10)
    before = (root / "data/soma.db").read_bytes()
    def failure(self):
        raise RuntimeError("injected migration failure")
    monkeypatch.setattr(development.MigrationRunner, "initialize_or_migrate", failure)
    with pytest.raises(RuntimeError, match="injected"):
        development.rebuild_database(root, files)
    assert (root / "data/soma.db").read_bytes() == before


@pytest.mark.skipif(os.name != "nt", reason="native Windows ACLs")
def test_database_acl_inheritance_does_not_weaken_secret_file_checks(tmp_path):
    from soma.security.runtime.windows import WindowsAclProvider
    from soma.foundation.errors import SecurityNotReady
    files = WindowsAclProvider()
    root = tmp_path / "protected"
    files.ensure_owner_only_directory(root)
    database = root / "soma.db"
    database.write_bytes(b"inherited protected parent ACL")
    files.verify_data_file(database)
    with pytest.raises(SecurityNotReady):
        files.ensure_owner_only_file(database)
    foreign = tmp_path / "foreign.db"
    foreign.write_bytes(b"unrestricted source ACL")
    os.replace(foreign, database)
    with pytest.raises(SecurityNotReady):
        files.verify_data_file(database)
