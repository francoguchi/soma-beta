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
