"""Freeze the local Vite output; no runtime Node or remote resources."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'src/soma/ui/static'
def source_inputs():
    web = ROOT.parents[2] / 'web'
    paths = [path for directory in ('app', 'components', 'data', 'interactions', 'layout', 'presentation', 'state', 'styles', 'working-copy')
             for path in sorted((web / directory).rglob('*')) if path.is_file()]
    paths += [web / name for name in ('package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.mjs', 'index.html', 'env.d.ts')]
    paths += sorted(path for path in (web / 'public' / 'brand').glob('*.svg') if path.is_file())
    # Source text is Git-normalized UTF-8/LF; shipped assets remain exact bytes.
    return {path.relative_to(web).as_posix(): hashlib.sha256(path.read_bytes().replace(b'\r\n', b'\n')).hexdigest() for path in paths}

if __name__ == '__main__':
    files = {}
    for path in sorted(ROOT.rglob('*')):
        if not path.is_file() or path.name == 'manifest.json':
            continue
        relative = path.relative_to(ROOT).as_posix()
        allowed_brand = relative in {'brand/soma-lockup.svg', 'brand/soma-lockup-dark.svg', 'brand/soma-mark.svg'}
        if (path.suffix not in {'.html', '.js', '.css'} and not allowed_brand) or relative.startswith('fixtures/'):
            raise SystemExit('Unexpected production UI resource')
        raw = path.read_bytes()
        if allowed_brand:
            # Vite copies public SVGs byte-for-byte. Windows may materialize the
            # source SVGs with CRLF, but Git stores the shipped files as LF.
            # Canonicalize the *shipped bytes* before freezing their exact hash.
            canonical = raw.replace(b'\r\n', b'\n')
            if b'\r' in canonical:
                raise SystemExit('Noncanonical SVG line ending')
            if canonical != raw:
                path.write_bytes(canonical)
            raw = canonical
        files[relative] = {'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)}
    if 'index.html' not in files:
        raise SystemExit('Production UI entry is missing')
    (ROOT / 'manifest.json').write_text(json.dumps({'schema': 'SOMA_UI_STATIC_ASSETS_V1', 'files': files,
        'source_input_format': 'utf8-lf', 'source_sha256': source_inputs()}, indent=2, sort_keys=True) + '\n', encoding='utf8', newline='\n')
