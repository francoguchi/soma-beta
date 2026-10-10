import hashlib
import json
from importlib.resources import files

from soma.ui.assets import UiAssets


def test_closed_spa_and_asset_routes_never_capture_api_or_untrusted_paths():
    assets = UiAssets()
    assert assets.resolve('GET', '/tickets/sr/synthetic-id').content_type.startswith('text/html')
    for path in ('/api/v1/tickets', '/api/v1/no-such-route', '/static/ui/../registry.json',
                 '/static/ui/assets/missing.js', '/tickets/sr/a%2fb', '/unknown', '/tickets/sr/a/b'):
        assert assets.resolve('GET', path) is None
    assert assets.resolve('POST', '/tickets') is None


def test_production_asset_hashes_and_offline_entry_match_frozen_manifest():
    root = files('soma.ui').joinpath('static')
    manifest = json.loads(root.joinpath('manifest.json').read_text(encoding='utf8'))
    assets = UiAssets()
    for name, entry in manifest['files'].items():
        resource = assets.resolve('GET', '/static/ui/' + name)
        assert resource.sha256 == entry['sha256'] == hashlib.sha256(resource.body).hexdigest()
        assert len(resource.body) == entry['bytes']
        assert 'fixtures/' not in name and not name.endswith('.map')
    entry = assets.resolve('GET', '/').body.decode('utf8')
    assert 'https://' not in entry and 'http://' not in entry


def test_canonical_brand_assets_are_manifested_and_delivered_as_image_svg():
    assets = UiAssets()
    for name in ('soma-mark.svg', 'soma-lockup.svg'):
        url = '/static/ui/brand/' + name
        asset = assets.resolve('GET', url)
        assert asset is not None
        assert asset.content_type == 'image/svg+xml'
        assert asset.body.startswith(b'<?xml version="1.0"')
    assert assets.resolve('GET', '/static/ui/brand/unknown.svg') is None
    assert assets.resolve('GET', '/static/ui/brand/../registry.json') is None
    entry = assets.resolve('GET', '/').body.decode('utf8')
    assert '/static/ui/brand/soma-mark.svg' in entry
