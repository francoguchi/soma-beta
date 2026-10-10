# UI-V2-AUTH-SETTINGS-BRAND — operator correction checkpoint

Status: **source implemented, deployment gated by frozen browser asset regeneration and browser/owner tests**. Draft PR #81 -> `feat/beta-ui-v2`; base pin `ecd487c603d93b211b27b67b683b29043af69abb` (preserves launcher repair).

## User-reported screenshots
- Beta Settings was a full-page preference form, unlike approved Study 30 modal.
- The canonical SOMA mark/lockup and browser favicon were missing.
- Beta's pre-auth first-run form was unstyled compared with the dark centered newer SOMA card.

## Implemented (no security or owner behavior changes)
- Live `SomaShell` uses `/static/ui/brand/soma-lockup.svg`, Settings is a distinct header action.
- Settings routes `/settings`, `/settings/appearance`, `/settings/communications` render inside a focus-trapping route-backed `SettingsDialog` above the preserved workbench; Reference Manager expands the same dialog rather than changing underlying hierarchy or owner.
- Separate route-return capture for live workbenches versus modal settings; Settings body is the scroll restoration owner. Test current Back/Forward and focus semantics, especially while Reference Manager is expanded.
- App's HTML entry includes `/static/ui/brand/soma-mark.svg` as favicon; Vite `public/brand/` contains two canonical SVGs from newer `soma` source. Added them explicitly to source hashes, allowable frozen asset list, HTTP SVG content types and startup manifest trust bounds.
- `SourceApplication.auth_shell` delegates rendering to `soma.ui.auth_shell.render_auth_shell`: polished dark login/setup, existing Beta auth/status endpoints, body keys, cookie and throttle unchanged. CSP keeps nonced JS/CSS, self-only images. No admin password handling moved client-side.
- Added/reconciled Python/browser tests, no weakening of owner-driven pagination/recovery assertions.

## Remaining verification
1. In an **isolated worktree** check out `feat/ui-v2-settings-brand-auth`.
2. `npm.cmd --prefix src/web ci --ignore-scripts --no-audit --no-fund`; `npm.cmd --prefix src/web test`; `npm.cmd --prefix src/web run build`.
3. `py -3.14 tools/verify_ui_build.py` from repository root.
4. Commit **only** generated `src/soma/ui/static/` files (including the two brand SVGs and source/bytes manifest) on this same branch. The current branch intentionally has stale frozen assets; do **not** deploy before this step. No temporary CI exporter or alternate uncontrolled static host.
5. The PR's existing Windows CI runs `npm test`, determinism check `git diff --exit-code -- src/soma/ui/static`, hash manifest, browser scenarios and backend suites. Review any failures and repair code/tests according to accepted behavior.
6. For first-run/login inspect on a disposable development instance only; do **not** reset, purge or expose real administrator credentials. Verify login existing cookie sessions, CSRF/security boundaries, and that unauthenticated SVG brand assets are served from the allowlist. Verify Settings overlay at desktop, compact, 200% zoom, focus trap, Escape and Back, and all five workspaces.

Current caveat: Visual design is operator-approved direction, but pixels and authenticated Beta runtime have **not** been rechecked after this change. Do not claim deployed/CI green or merge into donor lane yet.
