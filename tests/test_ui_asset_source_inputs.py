"""Regression: frozen browser source authority must include presentation modules.

The production Vite graph imports presentation/* directly. Omitting these
sources from source_sha256 can falsely certify a bundle after an owner guard,
cursor or display-projection source has changed.
"""
import hashlib
from pathlib import Path

from tools.build_ui_asset_manifest import source_inputs


def test_frozen_browser_source_manifest_covers_presentation_helpers():
    root = Path(__file__).resolve().parents[1] / 'src' / 'web'
    sources = source_inputs()
    for name in (
        'presentation/infrastructure-context-intent.ts',
        'presentation/infrastructure-component-filters.ts',
        'presentation/infrastructure-relationships.ts',
        'presentation/infrastructure-structure.ts',
    ):
        raw = (root / name).read_bytes().replace(b'\r\n', b'\n')
        assert name in sources, f'Missing production browser source: {name}'
        assert sources[name] == hashlib.sha256(raw).hexdigest()
    assert 'tests/infrastructure-structure.test.mjs' not in sources
    assert 'browser-tests/infrastructure-context-v2.spec.mjs' not in sources
