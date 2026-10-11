"""Explicit developer maintenance, never a product command or HTTP capability."""
from pathlib import Path
import os

from soma.foundation.errors import SecurityNotReady, SomaError
from soma.foundation.identifiers import new_uuid4
from soma.foundation.migrations.manifest import MigrationManifest
from soma.foundation.migrations.runner import MigrationRunner
from soma.foundation.persistence.backup_snapshot import BackupSnapshotProvider
from soma.foundation.persistence.connections import ConnectionFactory
from soma.foundation.persistence.uow import ReadSnapshot
from soma.foundation.runtime.instance_lock import DataInstanceLock
from soma.security.runtime.installation import (
    SourceInstallationSecurity, canonical_source_instance, read_installation_id,
)
from soma.security.runtime.source_control import stop
from soma.security.runtime.windows import WindowsAclProvider, reject_redirects


def _close_wal(factory):
    connection = factory.open_authoritative(read_only=False, require_wal=False)
    try:
        if connection.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()[0] != 0:
            raise SecurityNotReady("development reset checkpoint is busy; data preserved")
        if connection.execute("PRAGMA journal_mode=DELETE").fetchone()[0].lower() != "delete":
            raise SecurityNotReady("development reset requires a sidecar-free database")
    finally:
        connection.close()
    if any(Path(str(factory.database_path) + suffix).exists() for suffix in ("-wal", "-shm", "-journal")):
        raise SecurityNotReady("development reset sidecars remain; data preserved")


def rebuild_database(root, files):
    """Build first, preserve an encrypted snapshot, then atomically replace one DB."""
    root = reject_redirects(Path(root))
    files.verify(root)
    database = reject_redirects(root / "data/soma.db")
    files.verify_data_file(database)
    files.verify_data_file(root / "data/soma.instance.lock")
    files.ensure_owner_only_file(root / "security/live-data-key.dpapi")
    if read_installation_id(root, files) is None:
        raise SecurityNotReady("development reset requires an existing source installation")
    with DataInstanceLock.acquire(root / "data/soma.instance.lock", create=False) as lock:
        if (root / "runtime/runtime.json").exists():
            raise SecurityNotReady("stop the source runtime before development reset")
        security = SourceInstallationSecurity(root)
        security.prepare_storage(lambda: lock.held)
        factory = lambda path: ConnectionFactory(path, security)
        workspace = root / "data" / ("dev-reset-" + new_uuid4())
        files.ensure_owner_only_directory(workspace)
        staged = workspace / "new.soma.db"
        manifest = MigrationManifest.load(Path(__file__).resolve().parents[1] / "src/soma/migrations")
        MigrationRunner(canonical_database_path=staged, manifest=manifest,
            factory_for_path=factory, app_version="1.0.0.dev0",
            ownership_assertion=lambda: lock.held).initialize_or_migrate()
        _close_wal(factory(staged))
        files.verify_data_file(staged)
        # Snapshot contains all committed records, including any WAL content.
        backup = BackupSnapshotProvider(live_database_path=database,
            snapshot_factory_builder=factory, restore_factory_builder=lambda path, key: factory(path),
            ownership_assertion=lambda: lock.held)
        with ReadSnapshot(factory(database)) as snapshot:
            previous = backup.create_consistent_backup_snapshot(snapshot, workspace / "previous.soma.db")
        files.verify_data_file(previous.path)
        _close_wal(factory(database))
        before = database.stat(follow_symlinks=False)
        if before.st_nlink != 1:
            raise SecurityNotReady("development reset refuses linked databases")
        reject_redirects(database)
        files.verify_data_file(database)
        after = database.stat(follow_symlinks=False)
        if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns):
            raise SecurityNotReady("development database changed; reset refused")
        # A crash before replace leaves the old DB; after replace leaves the fully
        # migrated new DB. Installation/key/backup artifacts remain available.
        os.replace(staged, database)
        files.verify_data_file(database)
        return previous.path


def reset_development(*, confirm=input):
    try:
        root = canonical_source_instance()
        print(f"Source-development database reset target: {root}", flush=True)
        print("This clears ALL current records and administrator setup. An encrypted copy will be preserved; existing key files are required to read it.", flush=True)
        if confirm("Type RESET to rebuild and leave SOMA stopped: ") != "RESET":
            print("Reset cancelled; data and running host preserved.")
            return 10
        files = WindowsAclProvider()
        result = stop(root, files)
        if result.exit_code:
            print(result.message)
            return result.exit_code
        preserved = rebuild_database(root, files)
        print(f"Development database rebuilt; SOMA remains stopped. Previous encrypted database: {preserved}")
        return 0
    except EOFError:
        print("Reset requires interactive RESET confirmation; data preserved.")
        return 10
    except SomaError as exc:
        print(f"Development reset refused: {exc.code}; inspect source runtime/security prerequisites.")
        return 31
    except (OSError, RuntimeError) as exc:
        print(f"Development reset operation failed ({type(exc).__name__}); preserved staging/snapshot files under the displayed target require review. No automatic cleanup was performed.")
        return 11
