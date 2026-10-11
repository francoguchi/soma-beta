# SOMA UI V2 — Study 29 Structure interaction integration

Status: **implemented in `feat/beta-ui-v2` as source, NOT YET verified in the Windows operator bundle**.
Study 30 remains the primary visual/interaction design; Study 29 is supporting prototype interaction evidence.

## Implemented on real Infrastructure surface

- The existing `GET /api/v1/infrastructure/tree?limit=200` remains the **sole owner** of explorer rows, their identities, source parent reference, pagination and snapshots.
- Real `InfrastructureWorkspace` now has a `Structure` trigger and a native accessible modal. The modal has Study 29's **Full structure**, **Site → Cloud**, and **Direct to Network Element** quick views.
- Customer is pinned first, Network Element pinned last **in the presentation-path guide**. The four currently available intermediate owner node kinds are Cloud Deployment, Site, Room, and Rack. The backend explorer does **not** return a full Customer ancestry tree or a separate Cloud Type row. **Never invent customer nodes, Cloud Types or cross-page parentage** to fill the picture.
- Intermediate levels support hide/reveal and reorder using **keyboard/pointer arrow controls** and optional pointer drag. Cancel, Close and Escape discard edits. **Apply view** commits only a `StructureView` presentation order/visibility choice.
- `projectStructureRows` produces a stable display permutation of the **currently fetched bounded owner page**: it uses the same row objects, preserves parent IDs, retains both NE and containment-context owner rows, and never changes the authoritative cursor or any domain relationship.
- The visible Structure-path is labeled an **example display projection**, not the historical/physical lineage of any specific Network Element. Actual physical placement, Cloud assignments and containment remain separately owned facts.
- Applied display state survives browser Back/Forward as a strictly validated, frozen `infrastructureStructure` **interaction intent** (order/visible arrays, no domain DTO/cache). Missing/foreign/duplicate keys are rejected by `NavigationHistory.remember`.
- Structure modal uses native `<dialog>.showModal()`, Escape/Cancellation handling, explicit trigger refocus after Apply/Cancel/Escape, and a fixed-max-height grid with a **scrollable central body and reachable fixed footer**. It is intended to work at 200% browser zoom without losing Apply controls or keyboard focus.

## Tests added (source only)

- `src/web/tests/infrastructure-structure.test.mjs`: 5 Node unit tests for presets, projections/source parent identity, hide/reorder/reveal, closed/bounded shape, immutable Back/Forward intent, and drag semantics.
- `src/web/browser-tests/infrastructure-structure-v2.spec.mjs`: 7 Edge cases for Apply/actual bounded explorer, Direct/Full, checkbox/arrow reordering, Cancel/Escape, zoom 200% and Tab focus containment, Back/Forward/current owner refetch, and pointer drag.
- Regression suite must include the preceding **48 owner Infrastructure+Ticket Edge scenarios**, because this changes the same Infrastructure explorer and ReturnState router.
- Expected next operator targets after this addition: frontend **65 Node tests**, focused Edge **55 cases across 13 specs**; strict production build, exact `tools/verify_ui_build.py`, and optional LLD-08 focused Python. **Do not claim these green before operator's logs.**

## Known limitation and next design boundary

This is the authorized **Structure interaction and presentational projection**, not a complete parent-linked navigable domain tree: the current LLD-08 explorer returns up to 200 flattened typed rows per source-ordered owner page, not a complete ancestry DTO. A true cross-page Customer → Cloud → Site → Room → Rack → Network Element grouping hierarchy would require an explicit read-only owner contract with trustworthy parent/scope evidence and bounded paging; it **must not** be simulated with guessed parent nodes, merged SQL projections or UI-produced domain revisions.

No Infrastructure mutation endpoint, database model, security policy, migration, audit record, frozen UI asset or physical placement was changed here. Continue using one draft PR #80, no full CI/merge before complete UI acceptance.
