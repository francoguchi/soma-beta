# SOMA Beta UI V2 — Canonical continuation (compact)

**Updated:** 2026-10-10. **This is the first stop for a fresh chat or coding session.**
**Target:** `francoguchi/soma-beta` · **SOLE active UI branch:** `feat/beta-ui-v2` · **ONE draft PR:** #80.
Keep donor `feat/beta-1.0-implementation` unchanged. No new task branches, no DB reset, no wholesale UI rollback. Latest head MUST be read from GitHub before any work. Previous source checkpoint before this handoff: `805b225a80d9feda15541056bac0222cede2dc9d`.

## Authority order (do not confuse these)
1. Installed Beta domain owners, current `AGENTS.md`, `docs/implementation/current-state.json`, `docs/implementation/continuation-workflow.md`, migration/audit rules.
2. **Operator's UI direction:** approved *visual language* of Study 30 recorded in `START_HERE.md` (neutral btop/Zeus, not old Beta V1). Exact production tokens, full screen coverage and manual accessibility still need acceptance.
3. **Study 29 supporting audit** (2026-10-10, SHA256 of supplied ZIP `d24a699129a325b571a8535829200c654d383695643b9ee3d6543db9504119ba`) is an offline prototype, NOT a Beta API source or an implementation authorization. It repairs *prototype-only* Infrastructure Structure Apply: undefined `k`, 200% zoom footer reachability and focus restoration. Use to plan real UI interaction tests, not copy fake records. The user's **explicit decision to implement in SOMA Beta** supersedes Study 29's historical "choose Beta or new SOMA" open question.
4. `docs/implementation/ui-v2-beta/SR_OWNER_READ_CHECKPOINT.md` for actual SR owner reads.

## Implemented source, still subject to verification
- React V2 shell: five icon-only dock destinations, route-selected contextual nav, restrained gray and blue chrome, theme foundation; canonical SOMA SVG lockup/favicon.
- Settings now uses modal presentation with an expanded Reference Manager; legacy Beta pre-React auth HTML is restyled, without changing credential/session owners.
- Tickets point reads: SR, RFC, bounded Working Notes and exact SR8/LSR business-ID lookup; all through authenticated owner adapter.
- Tickets register: `GET /api/v1/tickets/service-requests?limit=25&cursor=<encoded-owner-object>` uses owner `ReadSnapshot`, update-time/UUID deterministic keyset, point-in-time count, accepted source status/summary with explicit clipping. No invented Active/Archived classification.
- New **UI-SR-03 presentation correction** after last frozen-assets push: Details are only shown after an explicit row selection; paging/refresh clears selection; 51-key *moving* history can advance beyond page 51 without growing memory. Pure state module `src/web/state/sr-page-history.ts` + unit/browser regressions. **This source is not yet frozen into production assets.**

## Actual verification / status
- Last operator frozen-asset push at `e34029a69862ef1f95a1aa65c7fa82de0fde04d4` ("freeze verified Service Request register assets"). Do not equate this with the later UI-SR-03 source.
- At this check, GitHub Actions for the latest pushes were **queued**; no claimed full CI/Playwright or Windows runtime certification. Previous operator runs passed 37 frontend Node tests and a smaller focused Python suite on earlier commits; those are **not** UI-SR-03 acceptance.
- `src/soma/ui/static/` is intentionally **stale relative to newly edited frontend source**, until operator regenerates exact JS/CSS/manifest. No forced asset hash bypass.
- Study 29's 44 standalone Chromium checks, design sample screens, and mock receive/send/import/stock behavior do not count as authenticated Beta integration tests.

## Next ONE checkpoint — before further feature work
On Windows worktree `D:\DEV\soma-beta-ui-v2`: inspect `git status -sb` FIRST, then `git pull --ff-only origin feat/beta-ui-v2` only if safe. With the existing venv and node/npm.cmd:
```powershell
npm.cmd --prefix src/web test
$base = Join-Path $env:TEMP ("soma-ui-v2-" + [guid]::NewGuid().ToString("N"))
.\.venv\Scripts\python.exe -m pytest tests/test_sr_collection_owner.py tests/test_ticket_ui_read_routes.py tests/test_ticket_point_queries.py tests/test_ui_assets.py tests/test_auth_shell_presentation.py -q --basetemp "$base"
npm.cmd --prefix src/web run build
py -3.14 tools\verify_ui_build.py
git status --short
```
Require clean exit codes and focused browser runs for `tickets-sr-register-v2.spec.mjs`, `tickets-owner-lookup-v2.spec.mjs`, `settings-modal-ui-v2.spec.mjs` and `settings-return.spec.mjs` before declaring ready. Stage only the intentionally regenerated `src/soma/ui/static/**` after inspection; commit and push to the SAME branch. No silent `git add .`. PR #80 remains draft until full CI, runtime/visual acceptance.

## Critical owner boundaries / next design obligations
- SR status observation != archive lifecycle; count at read != immutable cross-page snapshot; current record may move under concurrent updates. Authenticated server queries, no client-derived authority.
- Stock quantities != registered LSUs; RMA authorization != receipt; receipt != warehouse final acceptance. Spare Request response attention (24h from accepted warning start) != Product Line SLA.
- Source Imports (RFC/WFM/Advanced Search), Inventory Management, Device References, Infrastructure Structure projection, SLA/cohort attention, all-time MW grid need separately composed real owner DTOs/queries and cautious browser validation. Study 29 proposes UX; it does not implement those capabilities.
- Infrastructure Structure Apply must preserve *canonical lineage*, change *display projection only*, work under 200% zoom and return keyboard focus. Test in Beta before claiming fixed.
- Resumability: read **this file + current branch HEAD + latest CI + the ONE relevant owner file**, not every repository branch or historical chat. Record concise verified checkpoints here after each successful asset build.
