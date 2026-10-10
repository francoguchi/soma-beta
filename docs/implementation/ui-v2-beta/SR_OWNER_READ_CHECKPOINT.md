# UI-SR-01 — First live Tickets owner reads (UI V2)

**Branch:** `feat/beta-ui-v2` ONLY. **PR:** #80, draft. **Status:** SR identity + bounded SR register implemented; CI, operator build and browser/runtime verification pending. No schema/security/audit writes made.

## Why this slice exists

The Beta React `TicketWorkbench` was already requesting read-only Service Request, RFC, and Working Note URLs, but `DomainRoutes` composed no Tickets adapter. Opening a ticket could therefore produce an unimplemented owner endpoint even when its domain query existed. The Tickets landing page also lacked an actual list owner.

## Added authenticated owner reads

`src/soma/tickets/api/routes_ui_read.py` composes the existing snapshot-backed `ServiceRequestQueryService`, `RfcQueryService` and `WorkingNoteQueryService` and registers them through `DomainRoutes` **after session validation**:

- `GET /api/v1/tickets/service-requests/{uuid4}` returns the existing exact SR point projection.
- `GET /api/v1/tickets/rfcs/{uuid4}` returns the existing exact RFC point projection.
- `GET /api/v1/tickets/{service_request|rfc}/{uuid4}/notes?limit=10[&cursor=...]` returns existing owner Working Notes with an explicit 1–10 limit, exact cursor and ticket scoping.
- `GET /api/v1/tickets/service-requests/by-business-id/{SR8|LSR-########}` uses the existing SR owner's exact-identity lookup. There is **no fuzzy matching** and no alternative ownership logic.

Unknown routes are still uncomposed; mutation attempts and unexpected query keys are rejected. Source evidence, revisions, warning semantics and tickets hierarchy remain domain-owned.

## UI

`/tickets` now provides an honest exact SR lookup. Its one accepted result displays only safely interpreted owner fields and can open the real `/tickets/sr/{uuid4}` workbench.

**NOT a complete collection.** Active/All/Archived list, filters, totals and chronological summary still require a *separately accepted bounded LLD-03 collection DTO and query*. Avoid fake rows and status assumptions; the visual Study 30 remains the eventual layout authority.

## Test + build gate

- New `tests/test_ticket_ui_read_routes.py` checks real manual SR/RFC owner creation, notes, invalid cursors, read-only rules and auth-before-adapter.
- Updated `src/web/tests/workspace-navigation.test.mjs` verifies strict ID grammar.
- Added `src/web/browser-tests/tickets-owner-lookup-v2.spec.mjs` for owner JSON interaction and safe route opening.
- **Not yet executed by assistant**; GitHub CI jobs may be queued. The user previously reproduced the previous frozen assets on Windows.
- Because `src/web/app/main.tsx`, `src/web/app/TicketCollection.tsx` and `src/web/styles/soma.css` changed, **regenerate + commit** exact `src/soma/ui/static/` Vite JS/CSS/manifest bytes before the app can be deployed; do not bypass `verify_ui_build.py`.
- Suggested focused local commands from repository root:
  ```powershell
  npm.cmd --prefix src/web test
  .\.venv\Scripts\python.exe -m pytest tests/test_ticket_ui_read_routes.py tests/test_ticket_point_queries.py tests/test_ui_assets.py -q
  npm.cmd --prefix src/web run build
  py -3.14 tools\verify_ui_build.py
  git status --short
  ```
  Review and stage **only** `src/soma/ui/static/`, then commit and push on **the same** branch. CI/browser + local runtime testing remain mandatory.

## Next owner-backed slice

After the above passes and operator validates Settings/branding first, obtain/approve a bounded, deterministic Service Request collection query in the Tickets owner, then replace exact-lookup-only landing with Study 30 Collection → Details/Context while retaining owner evidence and no fabricated counts. Never broaden SR identity acceptance as a shortcut.

## UI-SR-02 continuation — real bounded owner collection

After the initial exact lookup, `src/soma/tickets/queries/service_request_collection.py` now exposes a **read-only** SR register, composed in `src/soma/tickets/api/routes_ui_read.py`:

- `GET /api/v1/tickets/service-requests?limit=25[&cursor=...]`, strict 1–100 item limit, exact server-validated cursor (`version=1`, sort `SR_UPDATED_ID_DESC_V1`, `updated_at_utc`, canonical SR UUID4), and descending SR-update/UUID keyset order.
- Uses one `ReadSnapshot` per page; projects current identity, revision, timestamp, currently pointed accepted source summary/status, bounded text/truncation signals, and `total_count_at_read`.
- This **does not** imply stable repeatable multi-request snapshot, operational lifecycle/archival classification, inferred SLA, Source Import, or full-text search. Owner status values are *source observations* only.
- The existing `/tickets` React landing page now displays a bounded SR table, selected Details context, 25-item Next/Previous pages and exact lookup. Direct Open goes to the existing SR workbench. No mock production rows.
- Regression tests: `tests/test_sr_collection_owner.py`, updated `tests/test_ticket_ui_read_routes.py`, `src/web/browser-tests/tickets-sr-register-v2.spec.mjs` and existing exact-SR tests.
- **IMPORTANT**: CI and local tests of this added slice have *not yet run*; the frontend frozen asset bundle is **stale** relative to the latest source. Do not launch Beta or merge PR until rebuild/test success. Perform the verification commands below and add only `src/soma/ui/static/**` to the canonical branch after green checks.

Suggested Windows commands from the canonical checkout:

```powershell
git status -sb
git pull --ff-only origin feat/beta-ui-v2
npm.cmd --prefix src/web test
.\.venv\Scripts\python.exe -m pytest tests/test_sr_collection_owner.py tests/test_ticket_ui_read_routes.py tests/test_ticket_point_queries.py tests/test_ui_assets.py -q --basetemp "$env:TEMP\soma-ui-v2-ticket-owner"
npm.cmd --prefix src/web run build
py -3.14 tools\verify_ui_build.py
git status --short
```

Do not erase local modifications. Verify the staged asset paths, then commit and push *once* after all tests pass. This remains one UI branch and one draft PR.
