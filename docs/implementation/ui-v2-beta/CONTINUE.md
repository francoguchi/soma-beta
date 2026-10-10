# SOMA Beta UI V2 — CONTINUE (single source of UI-lane truth)

**Updated:** 2026-10-10. Read this file first in every new chat or coding-agent session.
**Canonical repo:** `francoguchi/soma-beta` · **SOLE UI branch:** `feat/beta-ui-v2` · **one draft PR:** #80.
**Protected donor:** `feat/beta-1.0-implementation`; no new UI topic branches or PRs. Do not reset the instance, modify production DB state or bypass SQLCipher, DPAPI, audit, or frozen-asset checks.
**Most recent operator frozen-asset push:** `62598e984e78d95021c686f052e917a443c15013` (`freeze verified SR selection and pagination assets`). Source has advanced since then. The next asset build is NOT yet frozen; always fetch current branch HEAD first.

## Authority — keep these separate

1. Current Beta owner models and invariants; repository `AGENTS.md`, `docs/implementation/current-state.json`, `docs/implementation/continuation-workflow.md`.
2. **Operator-approved Study 30** visual direction (see `START_HERE.md`): neutral btop/Zeus, 5-icon dock, single contextual rail, selection-gated Details and Context, compact modals, SVG branding, support dark/light. It is a design reference, not authorized fake data.
3. **Study 29** supplemental *offline prototype* (SHA-256 `d24a699129a325b571a8535829200c654d383695643b9ee3d6543db9504119ba`). Prototype-only Infrastructure Apply-view fixes: undefined `k`, 200% zoom footer visibility, focus recovery. Must still be implemented and tested against Beta owner adapters. Do not copy prototypes' sample records as accepted facts.
4. Owner read contracts: `docs/implementation/ui-v2-beta/SR_OWNER_READ_CHECKPOINT.md`.

## What is implemented in the single UI branch

| Slice | Owner-backed source / behavior | Qualification |
| --- | --- | --- |
| UI-SHELL-01 | React V2 chrome, five workspace destinations, route-owned context, branded lockup/favicon, dark/light groundwork | Real UI screenshot and browser acceptance pending |
| SETTINGS/AUTH | Route-backed Settings modal, focused compact General, owner-driven expanded Reference Manager, styled Beta auth shell; fixed real `OBJECTIVE_TIMEZONE_V1` LLD-02 envelope and catalog `next_cursor/exact_count` DTO shapes | **User screenshot showed red errors before corrections; browser/runtime acceptance pending** |
| UI-BRAND-DARK | Kept canonical blue SOMA mark, light original lockup; uses color-corrected dark lockup with light lettering and new frozen SVG allowlist; Settings nav explicitly horizontal | Browser contrast and theme-switch checks pending |
| UI-EMPTY | SR/RFC register displays truthful empty-owner state without invented demo data; import UI not yet composed | Empty state is not an import workflow |
| UI-SR-01/02 | Authenticated SR exact ID point, RFC point, bounded Working Notes, SR8/LSR lookup; 25-row SR keyset register, accepted source summary/status with explicit clipping and point-in-time count | Source observation is **not** operational lifecycle |
| UI-SR-03 | SR Details only on explicit row selection, cleared on page/refresh; 51-entry moving cursor history; Node/browser coverage | Operator's prior frozen push includes this |
| **UI-RFC-02 (new)** | Exact RFC number lookup `GET /api/v1/tickets/rfcs/by-business-id/{NC14}` reuses `RfcQueryService.get(rfc_no=...)`; strict case-sensitive ASCII validation and explicit full RFC workbench opening | No fuzzy search, no new RFC-number domain authority |
| **UI-RFC-01 (new)** | `GET /api/v1/tickets/rfcs?limit=25`: deterministic descending updated/UUID owner register (1..100 backend bound). RFC canonical ID, local archive, hierarchy role, counts and evidence-supported source status/summary; direct RFC workbench opening | Local RFC archive **is** an owner fact; not source-status lifecycle |
| **UI-REL-01 (new)** | SR workbench RFC tab: `GetServiceRequestRfcBranches` through existing `ServiceRequestRfcQueryService.list_branches()`; selects root/subordinate, fetches current selected RFC point; no duplicated relationship SQL | Governing root and subordinate cannot be conflated |
| **UI-REL-02 (new)** | RFC Related RFCs: existing `RfcBranchQueryService.get()`; RFC effective SRs: existing `ServiceRequestRfcQueryService.effective_context_for_rfc()`; each selection-gated, paged, and navigable to actual workbench | Subordinate-only branch root lookup not inferred from labels; device membership remains uncomposed |
| **UI-OV-01 (new)** | Overview shows genuine independent SR/RFC total_count_at_read, routes to registries. Explicitly not synchronized weekly counts or a fabricated operational timeline | Full LLD-11 timeline/MW/warehouse attention still pending |

## Current gate / execution reality

**Important:** UI-RFC, UI-REL, UI-OV and the screenshot-driven Settings/branding/empty-state corrections were pushed **after `62598e98`**. `src/soma/ui/static/**` needs a fresh deterministic Windows build and commit. The full GitHub Actions run `38043199108` on the previous source head **failed** predominantly because the frozen manifest still referred to old frontend source; Windows Python CI also exposed a **SECURITY_NOT_READY ACL inheritance test** which must be investigated independently without weakening security. **None** of this batch's full test, Playwright or operator visual gates is confirmed green. Keep PR #80 draft.

Relevant new test inputs:
- Python: `tests/test_rfc_collection_owner.py`, `tests/test_sr_rfc_ui_branch_routes.py`, `tests/test_rfc_workbench_owner_routes.py`, `tests/test_ticket_ui_read_routes.py`, `tests/test_sr_collection_owner.py`.
- Node: `src/web/tests/owner-page-history.test.mjs`, `src/web/tests/workspace-navigation.test.mjs` (includes exact RFC grammar).
- Playwright: `src/web/browser-tests/settings-owner-bindings-v2.spec.mjs`, `settings-return.spec.mjs`, `tickets-empty-owner-register-v2.spec.mjs`, `tickets-rfc-identity-v2.spec.mjs`, `tickets-rfc-register-v2.spec.mjs`, `tickets-sr-rfc-branches-v2.spec.mjs`, `tickets-rfc-relations-v2.spec.mjs`, `overview-owner-counts-v2.spec.mjs`, plus existing Tickets and Settings tests.

**One consolidated Windows verification (not per-commit rebuild):**
```powershell
cd D:\DEV\soma-beta-ui-v2
git status -sb
git pull --ff-only origin feat/beta-ui-v2

npm.cmd --prefix src/web test
$base = Join-Path $env:TEMP ("soma-ui-v2-" + [guid]::NewGuid().ToString("N"))
.\.venv\Scripts\python.exe -m pytest tests/test_rfc_collection_owner.py tests/test_sr_rfc_ui_branch_routes.py tests/test_rfc_workbench_owner_routes.py tests/test_sr_collection_owner.py tests/test_ticket_ui_read_routes.py tests/test_ticket_point_queries.py tests/test_ui_assets.py tests/test_auth_shell_presentation.py tests/test_ui_settings_owner_shapes.py -q --basetemp "$base"
Write-Host "pytest exit: $LASTEXITCODE"

npm.cmd --prefix src/web run build
py -3.14 tools\verify_ui_build.py
git status --short
```
If any test fails: stop and preserve the logs. If green: stage **only `src/soma/ui/static/**`**, inspect `git diff --cached --check` + `--stat`, commit/push **same branch**. Then check full CI and Playwright + real local UI. Do not cherry-pick another branch or overwrite local edits.

## Still open / owner boundaries

- Source imports (RFC/WFM/Advanced Search), operational MW timeline, Inventory Operations Desk/Stock/LSUs, Infrastructure Structure projection/Apply, detailed devices/tasks/RMA views, appearance Vibrant and cross-workspace search need genuine owner contracts and explicit UI design implementation. Do not promote Study 29 sample records.
- RFC hierarchy is exactly two levels; only root RFC can be directly related to SR. Subordinate effective SR links derive through root and must be sourced from the existing owner.
- SQLCipher production, DPAPI, one outer UoW, immutable imports, audit append-only and exact evidence/review authority remain unchanged.
- SR status observation ≠ local archive lifecycle; inventory RMA creation ≠ LSU physical receipt; warehouse received ≠ final acceptance; spare-response 24h ≠ customer SLA.
- Never claim green CI just because prior Node or a few focused Python tests passed. Recheck latest workflow results and frozen manifest bytes.
- **Next after this combined verification:** finish owner-backed device references/Tasks UI and real Source Imports, then Infrastructure Structure Apply and Inventory Operations Desk; do not invent placeholder writes.

## New chat quick command

“Continue SOMA Beta UI V2. Read `docs/implementation/ui-v2-beta/CONTINUE.md`, check live HEAD/CI of **`feat/beta-ui-v2`** and PR #80, preserve Study 30 and owner invariants; work in cohesive, tested batches on the same branch, no extra branches, and provide one consolidated Windows frozen-asset gate.”

## User screenshot checkpoint — 2026-10-10

- Screenshot #1: Tickets register had zero real SR identities, so empty table was truthful but UX bare. Added explicit empty-owner state, retained exact identity lookup; **did not seed demo data** or claim import UI exists.
- Screenshot #2: Settings modal overlay was functional but General was cluttered; timezone showed query unavailable because `/api/v1/settings/objective-timezone` was not a registered setting key and frontend expected a non-owner DTO. Fixed query path to `/api/v1/settings/OBJECTIVE_TIMEZONE_V1` and consumed the complete LLD-02 `SettingValue` envelope. SLA catalog render errors were caused by frontend expecting `continuation` rather than owner `next_cursor` and `exact_count`. Corrected, moved catalogs behind expanded Reference Manager.
- Settings tabs vertically stacked because global `nav{flex-direction:column}` leaked into modal tab nav; explicitly set `flex-direction:row`.
- Canonical SOMA lockup text used dark SVG fill on dark shell; introduced dark recolor variant with original blue mark intact, light original preserved. New brand SVG must be frozen in manifest before runtime.
- Updated Settings Back/Forward mocked DTO fixtures, added UI/owner tests. **Rebuild and test these; do not assume screenshot problems are fixed in the currently running old bundle.**

**Continuation discipline:** no historical side branch or #81, no fresh PR. Read this document, the latest GitHub HEAD/CI, and one relevant owner file, then implement a cohesive source batch and collect one operator verification checkpoint.


## UI-IMPORT-READ-01 — latest source continuation (2026-10-10)
- Reconciled live HEAD `f0b5f9805c01` before writing. Its CI #38066745090 was **not green**: Ubuntu Python 3.14 returned 2 UI asset integrity failures (2129 passed, 68 skipped); Windows UI typecheck and 44 Node tests passed but reproducible build detected committed frozen-asset drift. Windows Python jobs were still running when checked. **No updated assets were committed**, no runtime browser certification.
- Genuine additional composition defect: accepted LLD-04 `TicketImportQueryRouteAdapter` existed and had owner-level tests, but `DomainRoutes` omitted it. Added it **only as an authenticated read adapter**, after session validation; uncomposed import POST commands remain unexposed.
- Added a Tickets → Source Imports monitoring surface for **three owner-backed source statuses**, accepted checkpoint presence, latest run state, and bounded 25-row run history with cursor navigation. Real empty states are explicit; no mock rows, implicit imports, acceptance, automatic source scanning, or lifecycle inference.
- Coverage added: `tests/test_ui_import_source_reads.py`, browser `src/web/browser-tests/source-import-owner-monitor-v2.spec.mjs`, and navigation unit assertions. These are committed source/tests **without claiming execution**. Next validated Windows build must include this slice and regenerate `src/soma/ui/static/**` once, after tests.
- Next authority gate: explicitly bind import start/check, proposal review, finalize and recovery through the existing LLD-04 mutation adapter with correct LLD-12 session/CSRF enforcement and the accepted owner participants. Do **not** expose a UI import button that cannot enforce these contracts.

## UI-BROWSER-RECONCILE-01 — Windows Edge evidence and repair source (2026-10-10)
- Browser environment: preinstalled Microsoft Edge works with `SOMA_TEST_BROWSER`; no Chromium download needed. Focused Playwright tests **4/4 passed**; whole prior browser suite **127/147 passed and 20 failed**, with 20 remaining divided between obsolete assertions, stale owner reads, modal focus and responsive/layout cases.
- App repair: a return from the Settings overlay now invalidates mounted owner queries without discarding working-copy context; the Settings dialog restores keyboard focus when its expanded invoker disappears and supports Escape while focus is temporarily absent; compact navigation chooses the correct layout before the first width measurement. Working Notes focus restoration waits until post-return readers enter loading, preventing a stale Next control from being restored too early.
- Updated legacy tests to use expanded Reference Manager, actual LLD-02 Objective timezone setting DTO, owner SLA `next_cursor`/`exact_count`, scoped Communications Jobs alert, currently supported RFC branch and SR register wording. Infrastructure horizontal-scroll test runs at a narrow viewport where horizontal overflow can be assessed.
- **Not certified:** these changes were pushed directly to the same sole branch / draft PR #80. CI and the new full Playwright suite must be checked on this source. Previous frozen assets in `src/soma/ui/static/**` remain stale until one reviewed Windows build and same-branch commit; the operator already has uncommitted generated assets locally. Do not clean/reset them. Do not modify owner endpoints or weaken security for the tests.

## UI-BROWSER-CLOSE-02 — production route repair / 2026-10-10
- Windows Edge full browser evidence at `609b9f5`: **143 passed / 4 failed**, up from 127/147. Frontend Node **45/45** passed; TypeScript/Vite and `verify_ui_build.py` passed; six focused Python modules passed (**18 tests**). Generated static assets remain operator-local/uncommitted; preserve them.
- Root cause of two failing RFC tests: `src/web/app/router.ts` accepts `/tickets/rfcs`, but the **server-side closed SPA fallback** in `src/soma/ui/registry.json` omitted the route. The same omission affected direct loads of `/tickets/imports`. Registered both approved owner read surfaces in the existing `ui/client-routes.json` leaf (no API/auth/domain owner changes); added Python route checks and Source Imports browser reload assertion.
- Remaining two browser failures were obsolete assertions: branding introduced two legitimate `<img>` tags, so XSS test now inspects only Contact channels for an injected image; Settings desktop sidebar test now sets an explicit desktop viewport (compact viewport intentionally shows Tickets sections instead).
- **Gate:** rerun four affected Playwright specs, full suite (now includes direct import reload), focused Python owner/asset tests, Node typecheck/unit tests, build/manifest verification, and inspect `git status`. Do not claim 147/147 or frozen CI green until run. Do not reset existing uncommitted static assets; freeze only after the full gate and verify compatibility with protected donor.

## UI-BROWSER-CLOSE-03 — modal isolation assertion (2026-10-10)
- Operator Edge focused suite on `bfd072a`: **21/22 passed, one remaining failure** in Settings modal check. RFC deep-link routing fix, brand/XSS scoping, and Source Imports reload all passed. Node/Vite and frozen build verification also passed locally.
- Last failing assertion incorrectly demanded the Tickets navigation DOM node vanish when Settings opens. The implementation deliberately leaves the workbench mounted to preserve drafts and instead marks its application ancestor `inert`, isolating keyboard/pointer interactions. Corrected the test to assert the Tickets navigation is a descendant of `[inert]` during the modal and is **no longer inert** after closing; no weakening of the actual Settings focus-trap or route contracts.
- Browser run is not yet 147/147: rerun focused Settings modal test and the full Edge suite. Once all tests, affected Python, source/build manifest verification are green, inspect and freeze only `src/soma/ui/static/**` generated assets on the same branch; keep PR #80 draft pending full CI and visuals.

## UI-CI-NOTES-FOCUS-04 — Windows CI race investigation (2026-10-10)
- Operator's exact-source frozen build at `32e04d9` passed **147/147 Edge scenarios with one worker** (45 seconds), frontend Node 45/45, and local asset verification. New workflow #38071333532 passed build/asset stage and 146/147 Windows Chromium browser scenarios but **failed** `ticket-notes-return.spec.mjs` removed-continuation focus fallback; three Python jobs were still in progress when checked.
- Actual race: `OwnerProjection` deliberately retains the same owner-path accepted render while requerying. After returning from Settings, this temporarily left a stale `Next notes` control in the DOM; `TicketWorkbench` focus restoration can find that stale control, disconnect its observer, and miss its removal when the fresh page has no continuation. This is not a timeout-only test defect.
- Scoped source fix: `Notes` consumes `OwnerReturnRefresh` and keys **only** the `OwnerProjection` by return generation. On Settings return it starts a clean owner read rather than preserving stale Notes controls, while retaining cursor path, workbench tabs, drafts and owner identity. No domain mutation or expanded persistence contract.
- Hardened the same browser scenario with a controlled pending notes response: assert the old Next control is absent **before** releasing the fresh read; then assert return notice and workbench focus. This makes the prior race reproducible regardless of runner speed.
- **Re-certification needed:** this source change changes the Vite bundle. The previous frozen assets must be rebuilt on Windows, `verify_ui_build.py` rerun, focused + complete Playwright and Python asset checks rerun, and only reviewed `src/soma/ui/static/**` regenerated assets committed after tests. CI at this commit is expected to flag frozen asset drift until operator updates it. Keep PR #80 draft and donor untouched; do not assert full CI green.

## UI-BROWSER-WORKERS-04 — parallel execution default (2026-10-10)
- Operator verified the Working Notes CI race fix at `eab337f` locally: frontend Node **45/45**, Vite/TypeScript and source-frozen verification, controlled removed-continuation browser stress **10/10**, whole Edge browser suite **147/147 in 46.4 s** at one worker, and Python asset checks **3/3**. These establish a serial baseline; **parallel green is not yet verified**.
- Operator requests **four Playwright workers for runs containing four or more cases**. `src/web/playwright.config.mjs` now sets `workers: 4` by default, including CI. Playwright schedules no more workers than runnable test cases, so shorter selections naturally use fewer. Operators may explicitly override with `--workers=1` to diagnose a parallel-only failure. The two local fixture hosts remain single instances serving independent Playwright contexts.
- The four-worker setting changes test execution only; it is **not** included in the frozen Vite source-input list and should not require a second bundle rebuild. The operator has **uncommitted regenerated JS `index-B1kvrGYe.js`** (old `index-DDZIXaRr.js` deleted), plus generated HTML and asset manifest. Keep them intact, rerun the full suite with default four workers and verify assets, then stage/review/commit only `src/soma/ui/static/**` to the same `feat/beta-ui-v2` branch. Do not claim GitHub CI green or close PR #80 until checks finish.

## UI-FROZEN-BRAND-LF-05 — Windows/Linux integrity reconciliation (2026-10-10)
- The operator's `eab337f` build passed locally: Node 45/45, targeted notes focus stress 10/10, full browser **147/147 at one worker**, and Python UI assets 3/3. A later four-worker suite was requested/reported done, but the exact outcome has not been provided in logs in this handover. At this point the operator has locally generated, uncommitted JS `index-B1kvrGYe.js`, updated `index.html`, and updated `manifest.json`; **do not reset or clean these**.
- GitHub Ubuntu Python on the prior frozen build failed only 2 asset integrity tests (2132 passed, 68 skipped): branded SVG manifest entries recorded Windows CRLF byte lengths `7674/6986`, whereas committed `src/soma/ui/static/brand/*.svg` blobs contain normalized LF lengths `7669/6982`. The existing `.gitattributes` already enforces `src/soma/ui/static/** text eol=lf`. This is an actual cross-platform hash disagreement, not a laxity in tests.
- **Source fix:** `tools/build_ui_asset_manifest.py` converts copied *allowed branding SVGs* from CRLF to LF on disk **before** freezing their exact byte counts/hashes; rejects isolated CR characters. An additional Python UI asset assertion requires shipped SVG bytes contain no CR. No runtime integrity or owner policy is loosened; byte-exact checks remain.
- **Mandatory next operator gate:** ff-only pull on `feat/beta-ui-v2`, regenerate once with `npm.cmd --prefix src/web run build` (which now normalizes brand bytes), run `py -3.14 tools/verify_ui_build.py`, frontend Node suite, four-worker full browser suite, Python `tests/test_ui_assets.py` and targeted owner tests. Inspect `git diff --check`, stage and review **only** `src/soma/ui/static/**`, commit/push once. Frozen manifest must record **LF SVG sizes 7669/7669/6982**, not 7674/7674/6986. Then inspect the new GitHub CI job matrix before any PR merge; keep PR #80 draft pending Study 30 visual approval.
