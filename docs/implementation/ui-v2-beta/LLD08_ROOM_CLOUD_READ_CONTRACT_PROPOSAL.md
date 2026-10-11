# LLD-08 Room and Cloud Deployment owner-read contract — proposal for approval

**Status:** PROPOSAL ONLY — NOT an accepted LLD-08 design revision and NOT an implemented API. This document is the human review surface for [the exact machine-readable draft](LLD08_ROOM_CLOUD_READ_CONTRACT_PROPOSAL.json). It is intentionally stored under `docs/implementation/ui-v2-beta/`, *not* under authoritative `spec/lld/`.

**Baseline:** `francoguchi/soma-beta`, UI branch `feat/beta-ui-v2` at tested/frozen `7c263a80e850f353eb1f8ed50ea75bdd3acbd50b`. **Inspected design pin:** `design/beta-1.0-hld-lld` `9a0e891127a771251afccca1a281b7ef7dde9e5f`. Keep PR #80 draft against `feat/beta-1.0-implementation`. No accepted owner authority is silently amended by this proposal.

## Why this is a new contract

Accepted `spec/lld/infrastructure/_index.json` names **15** canonical LLD-08 queries. In those query leaves, SiteDetailQuery, RackOccupancyQuery, NetworkElementDetailQuery, InfrastructureExplorerQuery and InfrastructureHistoryQuery exist, but **RoomDetailQuery and CloudDeploymentDetailQuery do not**. `routes/site-placement.json` exposes Room create/lifecycle but not current Room GET; `routes/relationships-models.json` exposes Cloud Deployment create/lifecycle but not current Deployment GET. Thus the presently implemented UI correctly labels Room/Cloud as **historical context**, never current facts. The accepted Study30 direction wants comprehensive workbenches; authoring their DTO and relationship-read authority comes first.

## Proposed minimal read surface

| Owner query | Proposed GET | Authoritative fields and read |
| --- | --- | --- |
| `RoomDetailQuery` | `/api/v1/infrastructure/rooms/{room_id}` | Room UUID4, Site UUID4, derived Customer UUID4, name, lifecycle, revision, indexed direct Rack count. |
| `CloudDeploymentDetailQuery` | `/api/v1/infrastructure/cloud-deployments/{cloud_deployment_id}` | Deployment UUID4, Site/derived Customer UUID4, Cloud Type UUID4, name, lifecycle, revision, indexed direct assigned NE count. |
| `InfrastructureRelationshipChildrenQuery` | `/api/v1/infrastructure/related-children?parent_kind=…&parent_id=…&relationship=…&limit=…` | One relation-family page, explicit child kind/identity/name/lifecycle/current Site, exact parent identity and relation. **Limit ≤200**, server-owned cursor. |

All three reads are authenticated local-admin GETs through LLD-12 and stable LLD-01 ReadSnapshot; they perform **no mutations**, start no writer UoW, increment no revision and fabricate no event/audit/identity. Archived owner records remain readable. Strings, revisions, UUID4 and enumerations must follow the existing `bounds.json`, `types/queries.json` and `types/common.json`. These request/response type names and route paths are **candidate names**, not active endpoints.

### Avoid duplicating existing owners

**Use the existing filtered explorer** for Customer→Sites, Site→Rooms, Site→Cloud Deployments and Site→Network Elements. Keep **RackOccupancyQuery** for Rack U placement and occupant navigation; it already returns a strictly bounded (up to 4,096 occupancy records) single owner snapshot, not a 200-row paginated query. Keep **InfrastructureHistoryQuery** for historical Room/Cloud events. Do not create a second contradictory children contract merely to make the UI feel like a tree.

**The four gaps proposed for one explicit relation-family children query** are:

1. **Site→explicitly unracked Network Elements:** authoritative Site membership **and** an existing `network_element_placement_current` row with `rack_id IS NULL`. Missing placement is corruption, not "unracked."
2. **Room→Racks:** exact Rack `room_id` FK only.
3. **Cloud Deployment→directly assigned Network Elements:** exact `cloud_assignment_current` edge; Cloud parent and NE must belong to the same Site or the entire owner page is untrusted.
4. **Network Element→direct containment children:** exact `network_element_containment_current` edge, **one hop only**. Current schema does not itself prohibit cross-Site containment; never invent that guard from Cloud assignment rules.

For all four, identity-based **UUID4 ascending** keyset pagination is proposed, with `CURSOR_V1` (six closed fields), `last_key_tuple=[child_id]`, `null_order=NOT_APPLICABLE` and exact SHA-256 scope fingerprint binding parent kind, identity, relation kind, lifecycle filter **including explicit null**, and page limit. First-page/continuation paths must be validated, bounded to 4,096 UTF-8 bytes and re-read on return. **Every fetched page is a fresh stable snapshot, not a frozen multi-page database view**. A page's emptiness makes no claim about unfetched pages or different relationships.

## Correctness and execution gates

- **No fabricated topology:** physical Customer→Site→Room→Rack→NE is separate from Site-scoped Cloud assignments and from independent NE containment. Cloud Type is reusable reference knowledge; Cloud is never a physical ancestor. An unracked NE has an authoritative Site but no current Rack.
- **No untrusted projection:** missing parent, invalid UUID4, cursor tampering, duplicate rows, out-of-order IDs, mismatched parent/child Site where the accepted Cloud rule requires a match, missing placement records and corrupted owner data fail closed. Exact error codes need reconciliation against the accepted `errors.json` and transport families before promotion.
- **Bounded work:** use existing parent and FK indexes; prove dense-parent (10,000+) keyset plans with `EXPLAIN QUERY PLAN`, query-count checks and synthetic stress fixtures. If the exact sort order requires a new index, request **a centrally allocated forward migration**; no ad-hoc index or manifest-history rewrite.
- **UI workbenches after acceptance:** Room gets current Summary / lazy Racks / historical activity. Cloud Deployment gets current Summary / lazy directly assigned NEs / historical activity. Each child selection invokes the existing exact Rack/NE owner point; display may hide/reorder Structure levels but never changes actual owner ancestry, browser return state stores intent only.
- **Owner tests:** exact active/archived records and counts, missing/foreign source, forged cursor, first/last page, dense paging, cross-Site Cloud corruption, explicit-null placement, direct-only containment, Back/Forward re-fetch, responsive/200%/keyboard, unknown-field rejection and genuine loader/error retry. The JSON draft contains the acceptance matrix.

## Acceptance decisions needed before backend code

**D1. Counts:** prefer all current persisted direct children/assignments **including archived records** (matching existing Site count semantics), but the owner must confirm whether archived records belong in these two counts.

**D2. Route ownership:** prefer two dedicated point GETs plus a single closed relation-family GET for four missing direct-child edges, while reusing explorer and RackOccupancy as above. Confirm unified route vs separate family endpoints.

**D3. Cursor/index:** approve child-UUID ordering, fingerprint fields and the per-request snapshot limitation. Measure source indexes; allocate a migration only if required.

**D4. Errors/types:** ratify DTO version names, response bounds and `INFRA_NOT_FOUND` / `CURSOR_INVALID` / `INFRA_STALE` mapping in accepted query, types and routes.

**After owner acceptance**, the design owner must add three normative query leaves, response/request DTOs, GET route declarations, `_index.json`, module map, traceability and acceptance/failure-injection tests, then update the implementation design pin through the normal reconciliation/integrity workflow. Until then **do not expose these candidate GET routes or advertise their current data in the React interface**.

## Evidence that motivated this proposal

Inspected on the exact pinned design: `spec/lld/infrastructure/{_index.json,types/{queries,common}.json,bounds.json,schema/{site-placement,relationships}.json,queries/v2/{explorer,site-detail,rack-occupancy,network-element-detail,history}.json,routes/{site-placement,relationships-models}.json,ui/workspace-state.json,implementation/module-map.json}`. Existing runtime integration inspected: `src/soma/infrastructure/queries/{details,explorer}.py` and `src/web/app/{InfrastructureWorkspace,InfrastructureContextHistory,InfrastructureSiteDetails,InfrastructureRackOccupancy}.tsx`. Current focused Windows operator evidence is **85/85 Node, 7/7 Infrastructure Python, 81/81 Edge**, before a clean static asset freeze `7c263a80e850f353eb1f8ed50ea75bdd3acbd50b`; **that proves current UI features, not proposed endpoints**.
