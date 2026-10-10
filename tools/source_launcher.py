"""Source-development bootstrap. Never an installer or authoritative host owner."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import venv

PREREQUISITE_FAILED = 10
SETUP_FAILED = 11
SUPPORTED = {(3, 13), (3, 14)}


class PrerequisiteError(Exception):
    pass


def hidden_probe_options():
    # A background venv interpreter may otherwise allocate a console for each
    # captured prerequisite child. Foreground/setup output stays attached.
    return {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}


def check_python(version=None, platform=None):
    version = sys.version_info[:2] if version is None else version
    platform = os.name if platform is None else platform
    if platform != "nt":
        raise PrerequisiteError("These source launchers require Windows; Ubuntu package imports remain supported.")
    if tuple(version) not in SUPPORTED:
        raise PrerequisiteError("Install supported Python 3.13 or 3.14 with the Windows py launcher.")


def check_path(path: Path):
    # Check ancestors before resolve(), so redirection cannot disappear in normalization.
    for candidate in (path, *path.parents):
        if candidate.is_symlink():
            raise PrerequisiteError("Source/environment paths must not contain symlinks or reparse points.")
        if candidate.exists():
            attributes = getattr(candidate.stat(follow_symlinks=False), "st_file_attributes", 0)
            if attributes & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0):
                raise PrerequisiteError("Source/environment paths must not contain reparse points.")


def checkout_root() -> Path:
    root = Path(__file__).absolute().parents[1]
    check_path(root)
    if not (root / "pyproject.toml").is_file() or not (root / "src/soma").is_dir():
        raise PrerequisiteError("Run this adapter from a SOMA source checkout.")
    return root


def environment_python(root: Path) -> Path:
    environment = root / ".venv"
    interpreter = environment / "Scripts/python.exe"
    check_path(interpreter)
    if environment.exists() and not environment.is_dir():
        raise PrerequisiteError(".venv must be a directory; nothing was replaced.")
    return interpreter


def validate_environment(root: Path, *, run=subprocess.run) -> Path:
    interpreter = environment_python(root)
    if not interpreter.is_file():
        raise PrerequisiteError("Repository environment is missing/incomplete. Run soma_setup.bat; nothing was erased.")
    result = run(
        [str(interpreter), "-I", "-c", "import json,sys; print(json.dumps([list(sys.version_info[:2]),sys.prefix,sys.base_prefix]))"],
        capture_output=True, text=True, timeout=10, check=False, **hidden_probe_options(),
    )
    try:
        version, prefix, base_prefix = json.loads(result.stdout)
        if result.returncode or tuple(version) not in SUPPORTED:
            raise ValueError
        if Path(prefix).resolve() != (root / ".venv").resolve() or prefix == base_prefix:
            raise ValueError
    except (ValueError, TypeError):
        raise PrerequisiteError(".venv is not a supported repository-local Python environment; nothing was erased.") from None
    return interpreter


def development_wheel(root):
    evidence_path = root / "docs/implementation/lld12_sqlcipher_development.json"
    try:
        evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
        wheel = root / "dist/source-development/sqlcipher3-0.6.2-cp314-cp314-win_amd64.whl"
        check_path(wheel)
        if evidence["schema"] != "SOMA-LOCAL-SQLCIPHER-DEVELOPMENT-V1" or evidence["wheel"]["path"] != wheel.relative_to(root).as_posix():
            raise ValueError
        if hashlib.sha256(wheel.read_bytes()).hexdigest() != evidence["wheel"]["sha256"]:
            raise ValueError
        return wheel
    except (OSError, KeyError, ValueError, TypeError):
        raise PrerequisiteError("The hash-verified local SQLCipher 4.17.0 development wheel is missing/changed. See docs/implementation/lld12_source_launchers.md; a public 0.6.2 wheel is not accepted.") from None


def validate_runtime_environment(root, interpreter, *, run=subprocess.run):
    probe = run([str(interpreter), "-I", "-c",
                 "import importlib.util,sys; sys.exit(0 if importlib.util.find_spec('sqlcipher3') else 1)"],
                cwd=root, capture_output=True, text=True, timeout=10, check=False, **hidden_probe_options())
    if probe.returncode:
        raise PrerequisiteError("SQLCipher driver sqlcipher3 is missing. Run soma_setup.bat; setup requires the hash-verified local wheel at dist/source-development/sqlcipher3-0.6.2-cp314-cp314-win_amd64.whl. See docs/implementation/lld12_source_launchers.md.")
    # Ephemeral keyed memory probe, never a plaintext/live database substitute.
    code = "import secrets,sqlcipher3; from soma.security.crypto.sqlcipher_provider import SqlCipherConnectionSecurityProvider as P; c=sqlcipher3.connect(':memory:'); p=P(None); p.key_connection(c,secrets.token_bytes(32)); p.verify_cipher_connection(c); c.close()"
    for arguments, message in (
        ([str(interpreter), "-I", "-c", code], "SQLCipher 4.17.0/profile verification failed. Run soma_setup.bat and review its diagnostics."),
        ([str(interpreter), "-I", "-c", "import runpy,sys; sys.path.insert(0,sys.argv[1]); runpy.run_path(sys.argv[2],run_name='__main__')", str(root / "tools"), str(root / "tools/verify_ui_build.py")], "Frozen web-assets verification failed. Run tools/verify_ui_build.py for build diagnostics."),
    ):
        result = run(arguments, cwd=root, capture_output=True, text=True, timeout=30, check=False, **hidden_probe_options())
        if result.returncode:
            raise PrerequisiteError(message)


def prepare_runtime_environment(root, interpreter, *, run=subprocess.run):
    wheel = development_wheel(root)
    result = run([str(interpreter), "-I", "-m", "pip", "--disable-pip-version-check", "--no-input", "install",
        "--no-index", "--no-deps", "--no-cache-dir", "--force-reinstall", str(wheel)], cwd=root, check=False)
    if result.returncode:
        raise PrerequisiteError("Local SQLCipher development wheel installation failed; this artifact requires CPython 3.14 Windows x64.")
    validate_runtime_environment(root, interpreter, run=run)
    result = run([str(interpreter), "-I", "-c", "from soma.security.runtime.installation import canonical_source_instance; from soma.security.runtime.windows import WindowsAclProvider; p=canonical_source_instance(); WindowsAclProvider().verify(p) if p.exists() else None"],
        cwd=root, capture_output=True, text=True, timeout=10, check=False, **hidden_probe_options())
    if result.returncode:
        raise PrerequisiteError("Canonical Windows instance directory is unsafe or unavailable; nothing was replaced.")


def build_frontend(root, *, run=subprocess.run):
    # Explicit development build, using the same pinned toolchain/commands as CI.
    node, npm = shutil.which("node.exe"), shutil.which("npm.cmd")
    if node is None or npm is None:
        raise PrerequisiteError("UI build requires Node 24.21.0/npm; ordinary setup can verify frozen assets without Node.")
    version = run([node, "--version"], capture_output=True, text=True, timeout=10, check=False, **hidden_probe_options())
    if version.returncode or version.stdout.strip() != "v24.21.0":
        raise PrerequisiteError("UI build requires the CI-pinned Node 24.21.0.")
    sys.path.insert(0, str(root / "src"))
    from soma.security.runtime.installation import canonical_source_instance
    from soma.security.runtime.source_control import _instance_owned
    from soma.security.runtime.windows import WindowsAclProvider
    instance = canonical_source_instance()
    if instance.exists() and _instance_owned(instance, WindowsAclProvider()):
        raise PrerequisiteError("Stop SOMA before rebuilding browser assets with soma_setup.bat --build-ui.")
    for arguments in ([npm, "ci", "--ignore-scripts", "--no-audit", "--no-fund"], [npm, "run", "build"]):
        if run(arguments, cwd=root / "src/web", check=False).returncode:
            raise PrerequisiteError("UI dependency installation/build failed; review the build output.")


def setup(root: Path, *, run=subprocess.run, builder=None, prepare=prepare_runtime_environment, build_ui=False) -> int:
    print("SOMA source-development setup (not the production installer).", flush=True)
    interpreter = environment_python(root)
    if not interpreter.parent.parent.exists():
        (builder or venv.EnvBuilder(with_pip=True)).create(root / ".venv")
    interpreter = validate_environment(root, run=run)
    result = run(
        [str(interpreter), "-I", "-m", "pip", "--disable-pip-version-check", "--no-input", "install", "-e", ".[test]"],
        cwd=root, check=False,
    )
    if result.returncode:
        print("Source setup failed: check pip output and dependency access, then rerun soma_setup.bat.", file=sys.stderr)
        return SETUP_FAILED
    if build_ui:
        build_frontend(root, run=run)
    prepare(root, interpreter, run=run)
    print("Source environment verified: SQLCipher 4.17.0 and frozen web assets. Run soma_run_console.bat for the first live test.")
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("setup", "run", "console", "stop", "reset", "host"))
    parser.add_argument("--build-ui", action="store_true", help="setup only: install locked frontend dependencies and rebuild with the CI-pinned Node")
    args = parser.parse_args(argv)
    try:
        check_python()
        root = checkout_root()
        if args.build_ui and args.action != "setup":
            raise PrerequisiteError("--build-ui is valid only for setup.")
        if args.action == "setup":
            return setup(root, build_ui=True) if args.build_ui else setup(root)
        # Runtime actions never install dependencies.
        interpreter = validate_environment(root)
        if args.action != "stop":
            validate_runtime_environment(root, interpreter)
        sys.path.insert(0, str(root / "src"))
        if args.action == "reset":
            sys.path.insert(0, str(root / "tools"))
            from source_development import reset_development
            return reset_development()
        from soma.security.runtime.source_control import source_action
        result = source_action(args.action)
        print(result.message, file=sys.stderr)
        return result.exit_code
    except PrerequisiteError as exc:
        print(f"Source launcher prerequisite failed: {exc}", file=sys.stderr)
        return PREREQUISITE_FAILED
    except (OSError, subprocess.SubprocessError) as exc:
        print(f"Source launcher operation failed ({type(exc).__name__}); check the environment and rerun setup.", file=sys.stderr)
        return SETUP_FAILED


if __name__ == "__main__":
    raise SystemExit(main())
