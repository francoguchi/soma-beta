"""Trusted source launch/control orchestration; Foundation is the sole host owner."""
from dataclasses import dataclass
from enum import Enum
import os
from pathlib import Path
import subprocess
import sys
import time

from soma.foundation.errors import SomaError, SecurityNotReady
from soma.foundation.identifiers import new_uuid4
from soma.security.crypto.dpapi import WindowsDpapiProvider
from soma.security.runtime.control import direct_request
from soma.security.runtime.installation import canonical_source_instance, read_installation_id, prepare_instance_directories
from soma.security.runtime.trust import TrustedInstanceVerifier
from soma.security.runtime.windows import WindowsAclProvider, process_identity, process_is_absent, VerifiedProcessWait, open_verified_origin


class SourceOutcome(str, Enum):
    STOPPED = "stopped"
    NO_VALID_INSTANCE = "no_valid_instance"
    OPENED = "opened"
    FAILED = "failed"


@dataclass(frozen=True, slots=True)
class SourceControlResult:
    outcome: SourceOutcome
    exit_code: int
    message: str


def verifier(root, files):
    if not root.exists():
        return None
    files.verify(root)
    identifier = read_installation_id(root, files)
    if identifier is None:
        if (root / "runtime" / "runtime.json").exists():
            raise SecurityNotReady("runtime registry has no installation binding")
        return None
    return TrustedInstanceVerifier(root, Path(sys._base_executable), identifier,
        file_security=files, dpapi=WindowsDpapiProvider())


def verified_instance(root, files, *, require_ready=True):
    reader = verifier(root, files)
    return None if reader is None else reader.verify(require_ready=require_ready)


def foreground(root, *, open_browser=False):
    from soma.application import SourceApplication
    application = SourceApplication(root)
    try:
        health = application.host.start()
        origin = application.security.control._origin
        print(f"SOMA READY: {origin} (encrypted schema {health.migration_sequence})", flush=True)
        print("Open this origin to set up/sign in. Ctrl+C performs owned graceful shutdown.", flush=True)
        if open_browser:
            instance = verified_instance(root, application.security.file_security)
            if instance is None or instance.registry.run_id != health.run_id:
                raise SecurityNotReady("console readiness identity changed")
            open_verified_origin(instance.registry.origin)
        while application.host.state == "READY" and not application.server.is_stopped():
            time.sleep(0.05)
        if application.host.state == "READY":
            raise SomaError("INTERNAL_ERROR", "source server stopped unexpectedly")
    except KeyboardInterrupt:
        print("SOMA: graceful shutdown requested.", flush=True)
    finally:
        if application.host.state in {"READY", "LISTENING_NOT_READY", "QUIESCING"}:
            application.host.shutdown(grace_seconds=10)
        elif application.host.state == "FAILED":
            application.host.retry_failed_cleanup(grace_seconds=10)
    print("SOMA: stopped.", flush=True)
    return SourceControlResult(SourceOutcome.STOPPED, 0, "SOMA source console: stopped")


def stop(root, files):
    try:
        instance = verified_instance(root, files, require_ready=False)
    except SecurityNotReady:
        return cleanup_stopped_run(root, files)
    if instance is None:
        return SourceControlResult(SourceOutcome.NO_VALID_INSTANCE, 0, "SOMA source stop: nothing is running")
    record = instance.registry
    identity = process_identity(record.pid)
    if identity.process_birth_id != record.process_birth_id or identity.image != Path(sys._base_executable).resolve():
        raise SecurityNotReady("shutdown process identity changed")
    retained = VerifiedProcessWait(identity)
    try:
        deadline = time.monotonic() + 10
        response = direct_request(record.origin, instance.secret, "POST", "/api/v1/runtime/shutdown",
            body={"run_id": record.run_id, "data_instance_id": record.data_instance_id, "command_id": new_uuid4()}, timeout=10)
        if set(response) != {"shutdown_state", "run_id", "data_instance_id"} or response["run_id"] != record.run_id or response["data_instance_id"] != record.data_instance_id or response["shutdown_state"] not in {"QUIESCING", "ALREADY_QUIESCING"}:
            raise SecurityNotReady("shutdown acceptance identity mismatch")
        if not retained.wait(max(0, deadline - time.monotonic())):
            return SourceControlResult(SourceOutcome.FAILED, 32, "SOMA source stop: graceful shutdown timed out; no process was terminated")
    finally:
        retained.close()
    # Foundation cleans exact-owned artifacts. Unknown leftovers are preserved.
    if (root / "runtime" / "runtime.json").exists() or (root / "runtime" / record.readiness_locator).exists():
        return SourceControlResult(SourceOutcome.FAILED, 32, "SOMA source stop: process stopped, but runtime artifacts require review; nothing was deleted")
    return SourceControlResult(SourceOutcome.STOPPED, 0, "SOMA source stop: graceful shutdown complete")


def cleanup_stopped_run(root, files):
    """Explicit stop only: exact-owned, authenticated dead-run artifacts, never PID reuse."""
    from soma.foundation.runtime.instance_lock import DataInstanceLock
    from soma.foundation.runtime.registry import RuntimeRegistry
    from soma.foundation.persistence.connections import ConnectionFactory
    from soma.foundation.queries.data_instance_identity import DataInstanceIdentityReader
    from soma.security.runtime.installation import SourceInstallationSecurity
    from soma.security.runtime.control import read_owned_file
    from soma.security.runtime.windows import reject_redirects
    registry = reject_redirects(root / "runtime/runtime.json")
    if not registry.is_file():
        raise SecurityNotReady("stopped runtime registry cannot be verified")
    raw = read_owned_file(registry, files, limit=16384)
    record = RuntimeRegistry._parse(raw)
    if not process_is_absent(record.pid):
        raise SecurityNotReady("runtime process identity mismatch; live or reused PID preserved")
    files.verify_data_file(root / "data/soma.instance.lock")
    with DataInstanceLock.acquire(root / "data/soma.instance.lock", create=False) as lock:
        if read_owned_file(registry, files, limit=16384) != raw or not process_is_absent(record.pid):
            raise SecurityNotReady("stopped runtime ownership changed")
        installation = read_installation_id(root, files)
        if installation is None:
            raise SecurityNotReady("stopped runtime has no installation identity")
        credential = root / "runtime" / record.readiness_locator
        protected = read_owned_file(credential, files)
        secret = WindowsDpapiProvider().unprotect_current_user(protected, "run_control", installation)
        if not isinstance(secret, bytes) or len(secret) != 32:
            raise SecurityNotReady("stopped runtime credential is invalid")
        security = SourceInstallationSecurity(root)
        files.verify_data_file(root / "data/soma.db")
        files.ensure_owner_only_file(root / "security/live-data-key.dpapi")
        security.prepare_storage(lambda: lock.held)
        connection = ConnectionFactory(root / "data/soma.db", security).open_authoritative(read_only=True, require_wal=False)
        try:
            if DataInstanceIdentityReader.get(connection) != record.data_instance_id:
                raise SecurityNotReady("stopped runtime database identity mismatch")
        finally:
            connection.close()
        if not process_is_absent(record.pid) or read_owned_file(credential, files) != protected:
            raise SecurityNotReady("stopped runtime ownership changed")
        if not files.remove_exact_file(registry, raw):
            raise SecurityNotReady("stopped runtime registry changed")
        if not files.remove_exact_file(credential, protected):
            raise SecurityNotReady("stopped runtime credential changed")
    return SourceControlResult(SourceOutcome.STOPPED, 0, "SOMA source stop: cleaned exact-owned dead-run registration; database preserved")


def _instance_owned(root, files):
    from soma.foundation.runtime.instance_lock import DataInstanceLock
    from soma.security.runtime.windows import reject_redirects
    path = reject_redirects(root / "data" / "soma.instance.lock")
    if not path.exists():
        return False
    files.verify(path.parent)
    try:
        ownership = DataInstanceLock.acquire(path, create=False)
    except SomaError as exc:
        if exc.code == "INSTANCE_OWNED":
            return True
        raise
    ownership.release()
    return False


def _await_ready(root, files, *, child=None, log=None):
    deadline = time.monotonic() + 30
    last_error = None
    while time.monotonic() < deadline:
        try:
            instance = verified_instance(root, files)
            if instance is not None:
                # Fresh complete proof is the only browser-opening authority.
                open_verified_origin(instance.registry.origin)
                return SourceControlResult(SourceOutcome.OPENED, 0, "SOMA source run: opened verified READY instance")
        except SomaError as exc:
            last_error = exc.code
        if child is not None and child.poll() is not None and not _instance_owned(root, files):
            return SourceControlResult(SourceOutcome.FAILED, 30, f"SOMA source run: startup failed; see {log}")
        if child is None and not (root / "runtime" / "runtime.json").exists() and not _instance_owned(root, files):
            return SourceControlResult(SourceOutcome.FAILED, 30, "SOMA source run: verified instance stopped before READY; rerun the launcher")
        time.sleep(0.1)
    detail = f"; see {log}" if log is not None else ""
    return SourceControlResult(SourceOutcome.FAILED, 30, f"SOMA source run: authenticated READY timed out ({last_error or 'no registry'}){detail}")


def detached(root, files):
    existing = verified_instance(root, files, require_ready=False)
    if existing is not None:
        result = _await_ready(root, files)
        if result.exit_code == 0:
            return SourceControlResult(SourceOutcome.OPENED, 0, "SOMA source run: opened verified existing instance")
        return result
    prepare_instance_directories(root, files)
    log = root / "diagnostics" / f"source-startup-{new_uuid4()}.log"
    checkout = Path(__file__).resolve().parents[4]
    with files.create_file(log) as output:
        child = subprocess.Popen([sys.executable, "-I", "-u", str(checkout / "tools" / "source_launcher.py"), "host"],
            cwd=checkout, stdin=subprocess.DEVNULL, stdout=output, stderr=output,
            creationflags=subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP, close_fds=True)
    return _await_ready(root, files, child=child, log=log)


def source_action(action):
    if action not in {"run", "console", "stop", "host"}:
        raise ValueError("unknown source runtime action")
    try:
        root = canonical_source_instance()
        files = WindowsAclProvider()
        if action == "stop":
            return stop(root, files)
        if action == "run":
            return detached(root, files)
        if action == "console":
            existing = verified_instance(root, files, require_ready=False)
            if existing is not None:
                return _await_ready(root, files)
        return foreground(root, open_browser=True) if action == "console" else foreground(root)
    except SomaError as exc:
        if action == "console" and exc.code == "INSTANCE_OWNED":
            try:
                return _await_ready(root, files)
            except SomaError as retry_error:
                return SourceControlResult(SourceOutcome.FAILED, 31, f"SOMA source console: {retry_error.code}: {retry_error.message}")
        return SourceControlResult(SourceOutcome.FAILED, 31, f"SOMA source {action}: {exc.code}: {exc.message}")
    except (OSError, RuntimeError) as exc:
        return SourceControlResult(SourceOutcome.FAILED, 30, f"SOMA source {action}: startup/control failed ({type(exc).__name__})")
