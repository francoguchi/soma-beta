"""Source environment and fail-closed adapter tests; native lifecycle is separate."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from types import SimpleNamespace

import pytest

from soma.security.runtime.source_control import SourceOutcome, source_action

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("source_launcher", ROOT / "tools/source_launcher.py")
launcher = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(launcher)


class Environment:
    def __init__(self, root, install_status=0):
        self.root = root
        self.calls = []
        self.creations = 0
        self.install_status = install_status

    def create(self, path):
        self.creations += 1
        interpreter = path / "Scripts/python.exe"
        interpreter.parent.mkdir(parents=True)
        interpreter.write_bytes(b"test executable placeholder")

    def run(self, arguments, **kwargs):
        self.calls.append((arguments, kwargs))
        if "-c" in arguments:
            return SimpleNamespace(returncode=0, stdout=json.dumps([[3, 14], str(self.root / ".venv"), "base"]))
        return SimpleNamespace(returncode=self.install_status)


def test_setup_rerun_reuses_environment_and_preserves_data(tmp_path, capsys):
    data = tmp_path / "data/soma.db"
    data.parent.mkdir()
    data.write_bytes(b"authoritative data must remain byte identical")
    runtime = tmp_path / "runtime/runtime.json"
    runtime.parent.mkdir()
    runtime.write_bytes(b"untrusted/stale registry must not be erased")
    env = Environment(tmp_path)
    assert launcher.setup(tmp_path, run=env.run, builder=env, prepare=lambda *args, **kwargs: None) == 0
    assert launcher.setup(tmp_path, run=env.run, builder=env, prepare=lambda *args, **kwargs: None) == 0
    assert env.creations == 1
    assert data.read_bytes() == b"authoritative data must remain byte identical"
    assert runtime.read_bytes() == b"untrusted/stale registry must not be erased"
    installs = [call for call in env.calls if "pip" in call[0]]
    assert len(installs) == 2
    assert all(call[0][-3:] == ["install", "-e", ".[test]"] for call in installs)
    assert all(call[1]["cwd"] == tmp_path and "shell" not in call[1] for call in installs)
    assert "not the production installer" in capsys.readouterr().out


@pytest.mark.parametrize("version,platform", [((3, 12), "nt"), ((3, 15), "nt"), ((3, 14), "posix")])
def test_unsupported_prerequisites_are_explicit(version, platform):
    with pytest.raises(launcher.PrerequisiteError, match="require|Install"):
        launcher.check_python(version, platform)


@pytest.mark.parametrize("version", [(3, 13), (3, 14)])
def test_supported_python(version):
    launcher.check_python(version, "nt")


@pytest.mark.parametrize("statuses, message, count", [
    ([1], "driver sqlcipher3 is missing", 1),
    ([0, 1], "SQLCipher 4.17.0/profile verification failed", 2),
    ([0, 0, 1], "Frozen web-assets verification failed", 3),
    ([0, 0, 0], None, 3),
])
def test_runtime_prerequisites_identify_failed_stage_without_raw_output(tmp_path, statuses, message, count):
    calls = []
    def run(arguments, **kwargs):
        if os.name == "nt":
            assert kwargs["creationflags"] == subprocess.CREATE_NO_WINDOW
        calls.append(arguments)
        return SimpleNamespace(returncode=statuses[len(calls) - 1], stderr="sensitive detail")
    if message:
        with pytest.raises(launcher.PrerequisiteError, match=message) as caught:
            launcher.validate_runtime_environment(tmp_path, tmp_path / "python.exe", run=run)
        assert "sensitive detail" not in str(caught.value)
    else:
        launcher.validate_runtime_environment(tmp_path, tmp_path / "python.exe", run=run)
    assert len(calls) == count


def test_environment_probe_does_not_create_a_console(tmp_path):
    env = Environment(tmp_path)
    env.create(tmp_path / ".venv")
    launcher.validate_environment(tmp_path, run=env.run)
    if os.name == "nt":
        assert env.calls[0][1]["creationflags"] == subprocess.CREATE_NO_WINDOW
    else:
        assert "creationflags" not in env.calls[0][1]


def test_console_reuses_verified_host_and_opens_browser(tmp_path, monkeypatch):
    import soma.security.runtime.source_control as control
    opened = []
    monkeypatch.setattr(control, "canonical_source_instance", lambda: tmp_path)
    monkeypatch.setattr(control, "WindowsAclProvider", lambda: object())
    monkeypatch.setattr(control, "verified_instance", lambda *args, **kwargs: SimpleNamespace(registry=SimpleNamespace(origin="http://127.0.0.1:12345")))
    monkeypatch.setattr(control, "open_verified_origin", opened.append)
    monkeypatch.setattr(control, "foreground", lambda *args: pytest.fail("existing host must be reused"))
    assert control.source_action("console").exit_code == 0
    assert opened == ["http://127.0.0.1:12345"]


def test_ready_wait_accepts_owned_prepublication_startup(tmp_path, monkeypatch):
    import soma.security.runtime.source_control as control
    instance = SimpleNamespace(registry=SimpleNamespace(origin="http://127.0.0.1:12345"))
    observations = iter([None, instance])
    opened = []
    monkeypatch.setattr(control, "verified_instance", lambda *a, **k: next(observations))
    monkeypatch.setattr(control, "_instance_owned", lambda *a: True)
    monkeypatch.setattr(control.time, "sleep", lambda seconds: None)
    monkeypatch.setattr(control, "open_verified_origin", opened.append)
    assert control._await_ready(tmp_path, object()).exit_code == 0
    assert opened == [instance.registry.origin]


def test_console_losing_start_waits_for_winning_host(tmp_path, monkeypatch):
    import soma.security.runtime.source_control as control
    from soma.foundation.errors import SomaError
    monkeypatch.setattr(control, "canonical_source_instance", lambda: tmp_path)
    monkeypatch.setattr(control, "WindowsAclProvider", lambda: object())
    monkeypatch.setattr(control, "verified_instance", lambda *a, **k: None)
    def losing(*a, **k):
        raise SomaError("INSTANCE_OWNED", "concurrent host owns instance")
    monkeypatch.setattr(control, "foreground", losing)
    expected = control.SourceControlResult(control.SourceOutcome.OPENED, 0, "winning host")
    monkeypatch.setattr(control, "_await_ready", lambda *a: expected)
    assert control.source_action("console") == expected


def test_foreground_server_failure_is_not_reported_as_success(tmp_path, monkeypatch):
    import soma.application as application
    import soma.security.runtime.source_control as control
    from soma.foundation.errors import SomaError
    closed = []
    host = SimpleNamespace(state="READY", start=lambda: SimpleNamespace(migration_sequence=19),
                           shutdown=lambda **k: closed.append(True))
    fake = SimpleNamespace(host=host, server=SimpleNamespace(is_stopped=lambda: True),
                           security=SimpleNamespace(control=SimpleNamespace(_origin="http://127.0.0.1:12345")))
    monkeypatch.setattr(application, "SourceApplication", lambda root: fake)
    with pytest.raises(SomaError, match="stopped unexpectedly"):
        control.foreground(tmp_path)
    assert closed == [True]


def test_ui_build_uses_pinned_toolchain_and_locked_commands(tmp_path, monkeypatch):
    import soma.security.runtime.installation as installation
    monkeypatch.setattr(launcher.shutil, "which", lambda name: name)
    monkeypatch.setattr(installation, "canonical_source_instance", lambda: tmp_path / "absent")
    calls = []
    def run(arguments, **kwargs):
        calls.append((arguments, kwargs))
        return SimpleNamespace(returncode=0, stdout="v24.21.0\n")
    launcher.build_frontend(tmp_path, run=run)
    assert calls[1][0] == ["npm.cmd", "ci", "--ignore-scripts", "--no-audit", "--no-fund"]
    assert calls[2][0] == ["npm.cmd", "run", "build"]
    assert calls[1][1]["cwd"] == tmp_path / "src/web"
    with pytest.raises(launcher.PrerequisiteError, match="CI-pinned"):
        launcher.build_frontend(tmp_path, run=lambda *a, **k: SimpleNamespace(returncode=0, stdout="v22.0.0"))


def test_build_flag_cannot_install_during_runtime(monkeypatch):
    monkeypatch.setattr(launcher, "check_python", lambda: None)
    assert launcher.main(["run", "--build-ui"]) == 10


def test_incomplete_environment_is_preserved(tmp_path):
    environment = tmp_path / ".venv"
    environment.mkdir()
    marker = environment / "keep"
    marker.write_text("keep")
    env = Environment(tmp_path)
    with pytest.raises(launcher.PrerequisiteError, match="missing/incomplete"):
        launcher.setup(tmp_path, run=env.run, builder=env, prepare=lambda *args, **kwargs: None)
    assert env.creations == 0 and marker.read_text() == "keep"
    assert env.calls == []


@pytest.mark.parametrize("payload", ["invalid", "[]", '[[3,12],"wrong","base"]', '[[3,14],"wrong","base"]'])
def test_wrong_environment_rejected_before_pip(tmp_path, payload):
    env = Environment(tmp_path)
    env.create(tmp_path / ".venv")
    def run(*args, **kwargs):
        return SimpleNamespace(returncode=0, stdout=payload)
    with pytest.raises(launcher.PrerequisiteError):
        launcher.setup(tmp_path, run=run, builder=env, prepare=lambda *args, **kwargs: None)
    assert env.creations == 1


def test_setup_dependency_failure_is_actionable(tmp_path, capsys):
    env = Environment(tmp_path, install_status=7)
    assert launcher.setup(tmp_path, run=env.run, builder=env, prepare=lambda *args, **kwargs: None) == 11
    assert "rerun soma_setup.bat" in capsys.readouterr().err


@pytest.mark.parametrize("action", ["run", "console", "stop"])
def test_untrusted_instance_cannot_open_start_stop_or_delete(action, tmp_path, monkeypatch):
    import soma.security.runtime.source_control as control
    from soma.foundation.errors import SecurityNotReady
    def forbidden(*args, **kwargs):
        pytest.fail("untrusted control attempted external authority")
    def untrusted(*args, **kwargs):
        raise SecurityNotReady("untrusted registry")
    monkeypatch.setattr(control, "canonical_source_instance", lambda: tmp_path)
    monkeypatch.setattr(control, "WindowsAclProvider", lambda: object())
    monkeypatch.setattr(control, "verified_instance", untrusted)
    monkeypatch.setattr(control, "open_verified_origin", forbidden)
    monkeypatch.setattr(control, "foreground", forbidden)
    monkeypatch.setattr(subprocess, "Popen", forbidden)
    monkeypatch.setattr(Path, "unlink", forbidden)
    result = source_action(action)
    assert result.outcome is SourceOutcome.FAILED and result.exit_code == 31


@pytest.mark.parametrize("action", ["run", "console", "stop"])
def test_runtime_cli_propagates_control_status_without_installing(action, monkeypatch, capsys):
    import soma.security.runtime.source_control as control
    monkeypatch.setattr(launcher, "check_python", lambda: None)
    monkeypatch.setattr(launcher, "validate_environment", lambda root: root / ".venv/Scripts/python.exe")
    monkeypatch.setattr(launcher, "validate_runtime_environment", lambda *args: None)
    monkeypatch.setattr(launcher, "setup", lambda *args: pytest.fail("runtime cannot install dependencies"))
    monkeypatch.setattr(control, "source_action", lambda action: control.SourceControlResult(SourceOutcome.FAILED, 31, "untrusted registry"))
    assert launcher.main([action]) == 31
    assert "untrusted registry" in capsys.readouterr().err


def test_cli_propagates_prerequisite_and_operation_failures(monkeypatch, capsys):
    def unsupported():
        raise launcher.PrerequisiteError("Install supported Python")
    monkeypatch.setattr(launcher, "check_python", unsupported)
    assert launcher.main(["console"]) == 10
    assert "Install supported Python" in capsys.readouterr().err
    monkeypatch.setattr(launcher, "check_python", lambda: None)
    def broken(root):
        raise OSError("sensitive environment detail")
    monkeypatch.setattr(launcher, "setup", broken)
    assert launcher.main(["setup"]) == 11
    assert "sensitive" not in capsys.readouterr().err


def test_unknown_control_action_cannot_dispatch():
    with pytest.raises(ValueError):
        source_action("kill")


def test_runtime_import_in_fresh_process():
    result = subprocess.run(
        [sys.executable, "-I", "-c", "import sys; sys.path.insert(0, sys.argv[1]); from soma.security.runtime.source_control import SourceOutcome; assert SourceOutcome.FAILED.value == 'failed'", str(ROOT / "src")],
        capture_output=True, text=True, timeout=10,
    )
    assert result.returncode == 0, result.stderr


def test_setup_rejects_file_in_place_of_environment(tmp_path):
    (tmp_path / ".venv").write_bytes(b"preserve this file")
    with pytest.raises(launcher.PrerequisiteError, match="directory"):
        launcher.setup(tmp_path)
    assert (tmp_path / ".venv").read_bytes() == b"preserve this file"


def test_environment_redirect_is_rejected_before_interpreter_execution(tmp_path):
    environment = tmp_path / ".venv"
    environment.mkdir()
    original = Path.is_symlink
    def redirected(path):
        return path == environment or original(path)
    from unittest.mock import patch
    with patch.object(Path, "is_symlink", redirected):
        with pytest.raises(launcher.PrerequisiteError, match="reparse"):
            launcher.setup(tmp_path)


@pytest.mark.skipif(os.name != "nt", reason="Windows BAT integration; imports tested on Ubuntu")
def test_real_bat_adapters_propagate_missing_environment_status(tmp_path):
    # Exercise quoting and anchoring from another working directory.
    root = tmp_path / "source checkout & spaces"
    (root / "tools").mkdir(parents=True)
    shutil.copy2(ROOT / "tools/source_launcher.py", root / "tools/source_launcher.py")
    shutil.copy2(ROOT / "pyproject.toml", root / "pyproject.toml")
    shutil.copytree(ROOT / "src/soma", root / "src/soma", ignore=shutil.ignore_patterns("__pycache__"))
    names = ["soma_run.bat", "soma_run_console.bat", "soma_stop.bat", "soma_reset_dev.bat"]
    for name in names:
        shutil.copy2(ROOT / name, root / name)
        result = subprocess.run(f'cmd.exe /d /s /c ""{root / name}" --no-pause"', cwd=tmp_path, capture_output=True, text=True, timeout=15)
        assert result.returncode == 10, result.stderr
        assert "soma_setup.bat" in result.stderr
    import venv
    venv.EnvBuilder(with_pip=False).create(root / ".venv")
    for name in names[:2]:
        result = subprocess.run(f'cmd.exe /d /s /c ""{root / name}" --no-pause"', cwd=tmp_path, capture_output=True, text=True, timeout=15)
        assert result.returncode == 10, result.stderr
        assert "verification failed" in result.stderr or "soma_setup.bat" in result.stderr
    assert not (root / "runtime").exists()
    assert not (root / "data").exists()


@pytest.mark.skipif(os.name != "nt", reason="Windows BAT integration")
@pytest.mark.parametrize("name", ["soma_run.bat", "soma_run_console.bat", "soma_stop.bat", "soma_reset_dev.bat"])
def test_run_bat_keeps_failure_visible_and_preserves_exit_code(tmp_path, name):
    shutil.copy2(ROOT / name, tmp_path / name)
    result = subprocess.run(f'cmd.exe /d /s /c ""{tmp_path / name}""',
                            input="\n", capture_output=True, text=True, timeout=15)
    assert result.returncode == 10
    assert "exit code 10" in result.stderr + result.stdout
    assert "Press any key" in result.stdout
