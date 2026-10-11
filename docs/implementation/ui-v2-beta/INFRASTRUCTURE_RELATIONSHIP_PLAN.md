# Infrastructure physical and logical relationship plan — 2026-10-11

Status: **user-approved product direction; new backend read DTOs remain DESIGN PROPOSALS**, not existing normative LLD-08 contracts. Keep Study30 primary and Study29 as interaction support.

## Accepted choices

- Two distinct but linked relationship views: physical **Customer → Site → Room → Rack → Network Element**; logical **Site-scoped Cloud Deployment assignment** and **Network Element containment**. Cloud Type is a reusable reference identity, not a Site parent. Explicitly unracked Network Elements still belong to a Site.
- Comprehensive Room and Cloud Deployment workbenches, delivered incrementally after authoritative point-read contracts exist.
- Expand hierarchy with **lazy, parent-filtered, cursor-paginated owner queries**, never by fetching all descendants or guessing from the flat owner explorer.
- Keep Structure Apply and current-page physical/logical lens as **document-session presentation preferences**, not persisted Settings or domain changes.

## Current implementation authority

Pinned LLD-08 `ui/workspace-state.json` distinguishes Rack placement, Cloud assignment and containment. `schema/site-placement.json` owns Site, Room, Rack and NE physical identity; `schema/relationships.json` owns Cloud Type, Site-scoped Cloud Deployment, Cloud assignments and containment. `queries/v2/explorer.json` is a flat, cursor-paginated contextual projection with exact Customer/Site/kind/lifecycle filters. Existing point reads: Site details, Rack occupancy, Network Element details. **No normative current Room/Cloud Deployment detail GET currently exists.** Historical events must not be presented as current entity metadata.

## Proposed LLD-08 new read contracts (NOT yet implemented)

**RoomDetailQuery**: exact Room UUID4; accepted Room ID/name/state/revision; parent Site ID and derived Customer ID; indexed current Rack count. Read in one stable snapshot, return owner not-found if target missing. Revisions and byte bounds from owning schema.

**CloudDeploymentDetailQuery**: exact Deployment UUID4; accepted Deployment ID/name/state/revision, Cloud Type ID, Site ID and derived Customer ID; count of directly assigned Network Elements from `cloud_assignment_current`. Cloud is **not** a physical ancestor.

**Parent-scoped children query family**: Customer → Sites, Site → Rooms and explicitly unracked NEs, Room → Racks, Rack → current placed NEs, Cloud Deployment → currently assigned NEs, NE → directly contained children. These are different owner relationships; no invented inheritance. Each proposed query requires exact parent UUID/kind, deterministic ordering with UUID tie-breaker, bounded page ≤200, exact query/filter-bound cursor and controlled snapshot consistency. Use already declared indexes where possible and inspect actual plans; do not create migrations without allocation authority. Return navigation stores only bounded identity and cursor intent, never owner DTO.

Design authority work required before new routes: add accepted LLD-08 query/type/route leaves and module-map/provenance, review correctness and security, test stale/foreign cursors, dense parent collections, cross-Site guards, archived targets, missing IDs, unexpected order and performance. This proposal does **not** authorize transport changes or database writes.

## Safe current UI delivery

Real exact Site/Customer explorer filters; read-only NE → accepted Site point, Rack occupancy, Cloud history and containment parent NE; Rack occupancy → occupant NE; independent physical vs logical current-owner-page lens, Study29 presentation view and focus/return state. All target detail reads validate their own owner responses. A user may expand only pages actually fetched; empty current page does not prove globally empty membership.

Do not claim native Windows certification for source changes after prior verified HEAD `39963ad2`. Draft PR #80 and protected implementation donor remain unchanged.
