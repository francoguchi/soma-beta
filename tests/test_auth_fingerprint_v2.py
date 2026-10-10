"""V2 receipt resistance, exact legacy replay and native key/restore failures."""
import hashlib
import os

import pytest

from soma.foundation.errors import SomaError, SecurityNotReady
from soma.foundation.identifiers import new_uuid4
from soma.security.crypto.auth_fingerprint import AuthenticationFingerprintKey


@pytest.fixture
def app(tmp_path):
    if os.name != "nt":
        pytest.skip("native Windows authentication composition")
    pytest.importorskip("sqlcipher3")
    from soma.application import SourceApplication
    from soma.security.runtime.windows import WindowsAclProvider
    root = tmp_path / "instance"
    WindowsAclProvider().ensure_owner_only_directory(root)
    application = SourceApplication(root)
    application.host.start()
    try:
        yield application
    finally:
        if application.host.state in {"READY", "QUIESCING", "LISTENING_NOT_READY"}:
            application.host.shutdown(grace_seconds=10)


def body():
    return {"command_id": new_uuid4(), "password": "isolated fingerprint password",
            "password_confirmation": "isolated fingerprint password"}


def rows(app, table):
    # Test-only inspection of fixed owning tables; no operational/user database.
    assert table in {"command_receipts", "command_receipt_results", "audit_events"}
    connection = app.factory.open_authoritative(read_only=True)
    try:
        return connection.execute(f"SELECT * FROM {table} ORDER BY 1").fetchall()
    finally:
        connection.close()


def forbid_hash(*_args):
    pytest.fail("immutable replay or rejection performed Argon2 work")


def test_new_receipt_resists_database_only_v1_guessing_and_replays_before_owner_reads(app, monkeypatch):
    request = body()
    first, _ = app.auth.setup(request)
    provider = app.security.auth_fingerprint
    secret = provider.load()
    from soma.security.runtime.control import read_owned_file
    reset = app.security.dpapi.unprotect_current_user(read_owned_file(
        app.security.root / "security/admin-reset.dpapi", app.security.file_security),
        "admin_password_reset", app.security.installation_id)
    assert len({secret, reset, app.security.cipher.unwrap_live_dek()}) == 3
    receipts = rows(app, "command_receipts")
    setup = next(row for row in receipts if row[0] == request["command_id"])
    for guess in [request["password"], "different fingerprint password"]:
        assert setup[2] != app.auth._legacy_setup_envelope(request["command_id"], guess.encode()).request_hash()
    evidence = repr(receipts + rows(app, "command_receipt_results") + rows(app, "audit_events"))
    assert request["password"] not in evidence and "$argon2id$" not in evidence
    assert secret.hex() not in evidence and repr(secret) not in evidence
    before = receipts, rows(app, "command_receipt_results"), rows(app, "audit_events")
    monkeypatch.setattr(app.auth.passwords, "hash", forbid_hash)
    monkeypatch.setattr(app.auth, "_credential", lambda: pytest.fail("replay read mutable credential state"))
    replay, _ = app.auth.setup(request)
    assert replay["actor_id"] == first["actor_id"]
    assert before == (rows(app, "command_receipts"), rows(app, "command_receipt_results"), rows(app, "audit_events"))


@pytest.mark.parametrize("retain_key", [False, True])
def test_legacy_exact_and_changed_replay_preserve_historical_rows(app, monkeypatch, retain_key):
    request = body()
    original = app.auth._setup_envelope
    # Construct an exact historical V1 receipt through the real atomic command;
    # never rewrite an accepted receipt/hash/result to synthesize compatibility.
    monkeypatch.setattr(app.auth, "_setup_envelope", lambda command_id, password, _secret:
        app.auth._legacy_setup_envelope(command_id, password))
    first, _ = app.auth.setup(request)
    monkeypatch.setattr(app.auth, "_setup_envelope", original)
    key = app.security.auth_fingerprint
    if not retain_key:
        assert app.security.file_security.remove_exact_file(key.path, key.path.read_bytes())
    before = rows(app, "command_receipts"), rows(app, "command_receipt_results"), rows(app, "audit_events")
    monkeypatch.setattr(app.auth.passwords, "hash", forbid_hash)
    replay, _ = app.auth.setup(request)
    assert replay["actor_id"] == first["actor_id"]
    with pytest.raises(SomaError) as error:
        app.auth.setup({**request, "password": "different fingerprint password",
                       "password_confirmation": "different fingerprint password"})
    assert error.value.code == "IDEMPOTENCY_CONFLICT"
    with pytest.raises(SomaError) as error:
        app.auth.setup({**request, "command_id": new_uuid4()})
    assert error.value.code == "AUTH_ALREADY_CONFIGURED"
    assert before == (rows(app, "command_receipts"), rows(app, "command_receipt_results"), rows(app, "audit_events"))
    assert key.path.exists() == retain_key


def test_missing_v2_key_cannot_be_regenerated_or_replayed_after_restart(app, monkeypatch):
    request = body()
    app.auth.setup(request)
    provider = app.security.auth_fingerprint
    assert app.security.file_security.remove_exact_file(provider.path, provider.path.read_bytes())
    app.host.shutdown(grace_seconds=10)
    from soma.application import SourceApplication
    restarted = SourceApplication(app.security.root)
    try:
        restarted.host.start()
        monkeypatch.setattr(restarted.auth.passwords, "hash", forbid_hash)
        with pytest.raises(SomaError) as error:
            restarted.auth.setup(request)
        assert error.value.code == "IDEMPOTENCY_CONFLICT"
        with pytest.raises(SomaError) as error:
            restarted.auth.setup({**request, "command_id": new_uuid4()})
        assert error.value.code == "AUTH_ALREADY_CONFIGURED"
        assert not provider.path.exists()
        # Fingerprinting is separate from the DEK and login verifier. Losing the
        # external key denies setup replay without silently locking out login.
        assert restarted.auth.login({"password": request["password"]})[0]["authenticated"]
    finally:
        if restarted.host.state == "READY":
            restarted.host.shutdown(grace_seconds=10)


@pytest.mark.parametrize("damage", ["tamper", "purpose", "installation", "acl", "length"])
def test_invalid_key_fails_closed_without_replacement(app, monkeypatch, damage):
    request = body()
    app.auth.setup(request)
    provider = app.security.auth_fingerprint
    protected = provider.path.read_bytes()
    if damage == "acl":
        import subprocess
        result = subprocess.run(["icacls", str(provider.path), "/grant", "*S-1-1-0:R"], capture_output=True)
        assert result.returncode == 0
    elif damage == "length":
        original = provider.dpapi.unprotect_current_user
        monkeypatch.setattr(provider.dpapi, "unprotect_current_user", lambda blob, purpose, installation:
            b"x" * 31 if purpose == "auth_command_fingerprint" else original(blob, purpose, installation))
    else:
        if damage == "tamper":
            protected = protected[:-1] + bytes([protected[-1] ^ 1])
        else:
            protected = provider.dpapi.protect_current_user(os.urandom(32),
                "live_data_dek" if damage == "purpose" else "auth_command_fingerprint",
                new_uuid4() if damage == "installation" else app.security.installation_id)
        assert app.security.file_security.remove_exact_file(provider.path, provider.path.read_bytes())
        from soma.security.runtime.control import publish_owned_file
        publish_owned_file(provider.path, protected, app.security.file_security)
    before = rows(app, "command_receipts"), rows(app, "audit_events")
    monkeypatch.setattr(app.auth.passwords, "hash", forbid_hash)
    with pytest.raises(SecurityNotReady):
        app.auth.setup(request)
    assert provider.path.read_bytes() == protected
    assert before == (rows(app, "command_receipts"), rows(app, "audit_events"))


def test_first_setup_rollback_retains_verified_orphan_for_retry(app, monkeypatch):
    request = body()
    original = app.auth.profiles.ensure_singleton_local_administrator
    def fail(*args, **kwargs):
        original(*args, **kwargs)
        raise SomaError("INJECTED_FAILURE", "first setup rollback")
    monkeypatch.setattr(app.auth.profiles, "ensure_singleton_local_administrator", fail)
    with pytest.raises(SomaError, match="first setup rollback"):
        app.auth.setup(request)
    provider = app.security.auth_fingerprint
    captured, secret = provider.path.read_bytes(), provider.load()
    assert app.auth._credential() is None and rows(app, "command_receipts") == []
    monkeypatch.setattr(app.auth.profiles, "ensure_singleton_local_administrator", original)
    assert app.auth.setup(request)[0]["authenticated"]
    assert provider.path.read_bytes() == captured and provider.load() == secret


def test_key_publication_verification_failure_precedes_argon2_and_mutation(app, monkeypatch):
    request = body()
    original = app.security.dpapi.unprotect_current_user
    monkeypatch.setattr(app.security.dpapi, "unprotect_current_user", lambda blob, purpose, installation:
        b"x" * 32 if purpose == "auth_command_fingerprint" else original(blob, purpose, installation))
    monkeypatch.setattr(app.auth.passwords, "hash", forbid_hash)
    with pytest.raises(SecurityNotReady, match="did not verify"):
        app.auth.setup(request)
    assert app.auth._credential() is None and rows(app, "command_receipts") == []
    monkeypatch.setattr(app.security.dpapi, "unprotect_current_user", original)
    assert len(app.security.auth_fingerprint.load()) == 32


def test_confirmation_and_lost_ownership_reject_before_fingerprinting(app, monkeypatch):
    request = body()
    monkeypatch.setattr(app.security.auth_fingerprint, "ownership", lambda: False)
    monkeypatch.setattr(app.auth.passwords, "hash", forbid_hash)
    with pytest.raises(SomaError) as error:
        app.auth.setup({**request, "password_confirmation": "mismatched confirmation"})
    assert error.value.code == "AUTH_PASSWORD_POLICY"
    with pytest.raises(SecurityNotReady, match="instance ownership"):
        app.auth.setup(request)
    assert not app.security.auth_fingerprint.path.exists()


def test_unavailable_committed_result_is_not_reconstructed(app, monkeypatch):
    request = body()
    app.auth.setup(request)
    monkeypatch.setattr(app.auth.passwords, "hash", forbid_hash)
    monkeypatch.setattr(app.auth.boundary._receipt_store, "get_exact_result", lambda *_args: None)
    with pytest.raises(SomaError) as error:
        app.auth.setup(request)
    assert error.value.code == "IDEMPOTENCY_RESULT_UNAVAILABLE"


def test_missing_key_with_history_cannot_regenerate_if_credential_state_is_unavailable(app, monkeypatch):
    request = body()
    app.auth.setup(request)
    provider = app.security.auth_fingerprint
    assert app.security.file_security.remove_exact_file(provider.path, provider.path.read_bytes())
    monkeypatch.setattr(app.auth, "_credential", lambda: None)
    monkeypatch.setattr(app.auth.passwords, "hash", forbid_hash)
    before = rows(app, "command_receipts")
    with pytest.raises(SecurityNotReady, match="committed setup history"):
        app.auth.setup({**request, "command_id": new_uuid4()})
    assert not provider.path.exists() and rows(app, "command_receipts") == before


def test_setup_verifier_and_fingerprint_share_the_validated_password_capture(app, monkeypatch):
    request = body()
    captured = request["password"]
    provider = app.security.auth_fingerprint
    original = provider.load
    def mutate_caller_dto_during_file_preparation():
        request.update(password="mutated preparation password", password_confirmation="mutated preparation password")
        return original()
    monkeypatch.setattr(provider, "load", mutate_caller_dto_during_file_preparation)
    first, _ = app.auth.setup(request)
    assert app.auth.login({"password": captured})[0]["actor_id"] == first["actor_id"]
    with pytest.raises(SomaError) as error:
        app.auth.login({"password": "mutated preparation password"})
    assert error.value.code == "AUTH_INVALID_CREDENTIALS"
    replay = {"command_id": request["command_id"], "password": captured, "password_confirmation": captured}
    monkeypatch.setattr(app.auth.passwords, "hash", forbid_hash)
    assert app.auth.setup(replay)[0]["actor_id"] == first["actor_id"]


def test_fingerprint_exact_bytes_key_and_installation_separation(tmp_path):
    first = AuthenticationFingerprintKey(tmp_path, new_uuid4(), ownership_assertion=lambda: False,
        file_security=None, dpapi=None)
    second = AuthenticationFingerprintKey(tmp_path, new_uuid4(), ownership_assertion=lambda: False,
        file_security=None, dpapi=None)
    key = bytes(range(32))
    digest = first.setup_digest(key, " exact é password ".encode())
    assert digest != first.setup_digest(key, "exact é password".encode())
    assert digest != first.setup_digest(key, " exact e\u0301 password ".encode())
    assert digest != first.setup_digest(b"x" * 32, " exact é password ".encode())
    assert digest != second.setup_digest(key, " exact é password ".encode())
    assert len(first.setup_digest(key, b"\0" * 256)) == 64


def test_same_installation_encrypted_restore_preserves_key_and_exact_replay(app, monkeypatch):
    from soma.foundation.persistence.backup_snapshot import BackupSnapshotProvider, RecoveryMarker
    from soma.foundation.persistence.connections import ConnectionFactory
    from soma.foundation.persistence.uow import ReadSnapshot
    from soma.foundation.runtime.instance_lock import DataInstanceLock
    from soma.security.runtime.installation import SourceInstallationSecurity
    from soma.application import SourceApplication
    request = body()
    first, _ = app.auth.setup(request)
    key_path = app.security.auth_fingerprint.path
    captured = key_path.read_bytes()
    historical = rows(app, "command_receipts"), rows(app, "command_receipt_results"), rows(app, "audit_events")
    stage = app.security.root / "data/restore-stage.db"
    snapshots = BackupSnapshotProvider(live_database_path=app.paths.database,
        snapshot_factory_builder=lambda path: ConnectionFactory(path, app.security),
        restore_factory_builder=lambda path, _key: ConnectionFactory(path, app.security),
        ownership_assertion=app.security.ownership)
    with ReadSnapshot(app.factory) as snapshot:
        snapshots.create_consistent_backup_snapshot(snapshot, stage)
    app.host.shutdown(grace_seconds=10)
    lock = DataInstanceLock.acquire(app.paths.lock)
    try:
        security = SourceInstallationSecurity(app.security.root)
        security.prepare_storage(lambda: lock.held)
        restore = BackupSnapshotProvider(live_database_path=app.paths.database,
            snapshot_factory_builder=lambda path: ConnectionFactory(path, security),
            restore_factory_builder=lambda path, _key: ConnectionFactory(path, security),
            ownership_assertion=lambda: lock.held)
        verified = restore.verify_restored_database(stage, None)
        restore.replace_live_database_from_verified_stage(verified,
            RecoveryMarker(app.security.root / "data/emergency-before-restore.db"))
    finally:
        lock.release()
    restarted = SourceApplication(app.security.root)
    try:
        restarted.host.start()
        monkeypatch.setattr(restarted.auth.passwords, "hash", forbid_hash)
        replay, _ = restarted.auth.setup(request)
        assert replay["actor_id"] == first["actor_id"]
        assert key_path.read_bytes() == captured
        assert historical == (rows(restarted, "command_receipts"), rows(restarted, "command_receipt_results"), rows(restarted, "audit_events"))
    finally:
        if restarted.host.state == "READY":
            restarted.host.shutdown(grace_seconds=10)
