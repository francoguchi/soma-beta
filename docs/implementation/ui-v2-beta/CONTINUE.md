# SOMA Beta UI V2 — CONTINUE (single source of UI-lane truth)

**Updated:** 2026-10-10. Read this file first in every new chat or coding-agent session.
**Canonical repo:** `francoguchi/soma-beta` · **SOLE UI branch:** `feat/beta-ui-v2` · **one draft PR:** #80.
**Protected donor:** `feat/beta-1.0-implementation`; no new UI topic branches or PRs. Do not reset the instance, modify production DB state or bypass SQLCipher, DPAPI, audit, or frozen-asset checks.
**Recent verified operator frozen-asset push:** `62598e984e78d95021c686f052e917a443c15013` (`freeze verified SR selection and pagination assets`). **Latest source HEAD must be read live**, never infer from this page; code has changed since this frozen build.

## Authority — keep these separate

1. Current Beta owner models and invariants; repository `AGENTS.md`, `docs/implementation/current-state.json`, `docs/implementation/continuation-workflow.md`.
2. **Operator-approved Study 30** visual direction (see `START_HERE.md`): neutral btop/Zeus, 5-icon dock, single contextual rail, selection-gated Details and Context, compact modals, SVG branding, support dark/light. It is a design reference, not authorized fake data.
3. **Study 29** supplemental *offline prototype* (SHA-256 `d24a699129a325b571a8535829200c654d383695643b9ee3d6543db9504119ba`). Prototype-only Infrastructure Apply-view fixes: undefined `k`, 200% zoom footer visibility, focus recovery. Must still be implemented and tested against Beta owner adapters. Do not copy prototypes' sample records as accepted facts.
4. Owner read contracts: `docs/implementation/ui-v2-beta/SR_OWNER_READ_CHECKPOINT.md`.

## What is implemented in the single UI branch

| Slice | Owner-backed source / behavior | Qualification |
| --- | --- | --- |
| UI-SHELL-01 | React V2 chrome, five workspace destinations, route-owned context, branded lockup/favicon, dark/light groundwork | Real UI screenshot and browser acceptance pending |
| SETTINGS/AUTH | Route-backed Settings modal, expanded Reference Manager; Beta server-generated login/setup restyled, same security/cookie authority | Manual login/Settings interaction and accessibility acceptance pending |
| UI-SR-01/02 | Authenticated SR exact ID point, RFC point, bounded Working Notes, SR8/LSR lookup; 25-row SR keyset register, accepted source summary/status with explicit clipping and point-in-time count | Source observation is **not** operational lifecycle |
| UI-SR-03 | SR Details only on explicit row selection, cleared on page/refresh; 51-entry moving cursor history; Node/browser coverage | Operator's prior frozen push includes this |
| **UI-RFC-01 (new)** | `GET /api/v1/tickets/rfcs?limit=25`: deterministic descending updated/UUID owner register (1..100 backend bound). RFC canonical ID, local archive, hierarchy role, counts and evidence-supported source status/summary; direct RFC workbench opening | Local RFC archive **is** an owner fact; not source-status lifecycle |
| **UI-REL-01 (new)** | SR workbench RFC tab: `GetServiceRequestRfcBranches` through existing `ServiceRequestRfcQueryService.list_branches()`; selects root/subordinate, fetches current selected RFC point; no duplicated relationship SQL | Governing root and subordinate cannot be conflated |
| **UI-REL-02 (new)** | RFC Related RFCs: existing `RfcBranchQueryService.get()`; RFC effective SRs: existing `ServiceRequestRfcQueryService.effective_context_for_rfc()`; each selection-gated, paged, and navigable to actual workbench | Subordinate-only branch root lookup not inferred from labels; device membership remains uncomposed |
| **UI-OV-01 (new)** | Overview shows genuine independent SR/RFC total_count_at_read, routes to registries. Explicitly not synchronized weekly counts or a fabricated operational timeline | Full LLD-11 timeline/MW/warehouse attention still pending |

## Current gate / execution reality

**Important:** New UI-RFC, UI-REL and UI-OV source code has been pushed **after `62598e98`**. `src/soma/ui/static/**` production JS/CSS/manifest needs another deterministic build. The new regressions have **NOT** yet passed operator/CI verification. Last GitHub Actions checks were still **queued**, not successful. PR #80 must stay draft until complete CI/browser/runtime testing and operator visual review.

Relevant new test inputs:
- Python: `tests/test_rfc_collection_owner.py`, `tests/test_sr_rfc_ui_branch_routes.py`, `tests/test_rfc_workbench_owner_routes.py`, `tests/test_ticket_ui_read_routes.py`, `tests/test_sr_collection_owner.py`.
- Node: `src/web/tests/owner-page-history.test.mjs`, `src/web/tests/workspace-navigation.test.mjs`.
- Playwright: `src/web/browser-tests/tickets-rfc-register-v2.spec.mjs`, `tickets-sr-rfc-branches-v2.spec.mjs`, `tickets-rfc-relations-v2.spec.mjs`, `overview-owner-counts-v2.spec.mjs`, plus existing Tickets and Settings tests.

**One consolidated Windows verification (not per-commit rebuild):**
```powershell
cd D:\DEV\soma-beta-ui-v2
git status -sb
git pull --ff-only origin feat/beta-ui-v2

npm.cmd --prefix src/web test
$base = Join-Path $env:TEMP ("soma-ui-v2-" + [guid]::NewGuid().ToString("N"))
.\.venv\Scripts\python.exe -m pytest tests/test_rfc_collection_owner.py tests/test_sr_rfc_ui_branch_routes.py tests/test_rfc_workbench_owner_routes.py tests/test_sr_collection_owner.py tests/test_ticket_ui_read_routes.py tests/test_ticket_point_queries.py tests/test_ui_assets.py tests/test_auth_shell_presentation.py -q --basetemp "$base"
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
