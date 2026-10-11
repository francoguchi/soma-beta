# SOMA Beta UI V2 — Candidate visual baseline (Study 30)

**Status:** operator-approved visual **direction**, design measurements still subject to explicit production-token acceptance. No code-binding authorization, no UI mock-data authority. The [integration start document](START_HERE.md) is the executable handoff entry.

## Three looks / measured tokens

| CSS role | Default Dark | Light | Vibrant |
| --- | --- | --- | --- |
| `--canvas` | `#0a0c0e` | `#edf1f4` | `#0b1119` |
| `--shell` | `#0d1012` | `#e5ebef` | `#0d1620` |
| `--surface` | `#111518` | `#ffffff` | `#12202c` |
| `--surface2` | `#161b1f` | `#f2f5f7` | `#192b38` |
| `--line` | `#363c43` | `#b6c0c9` | `#3c5362` |
| `--line-soft` | `#262d33` | `#d8dfe5` | `#283b49` |
| `--text` | `#e6eaee` | `#182732` | `#edf5fa` |
| `--secondary` | `#b2bbc4` | `#374954` | `#c0d3df` |
| `--dim` | `#929da7` | `#5a6b77` | `#9bafbb` |
| `--current` | `#9abbe0` | `#145e95` | `#8bc7ff` |
| `--current-bg` | `#1b2a3b` | `#d7e8f7` | `#183d57` |
| `--current-edge` | `#80a8d0` | `#2c6ea5` | `#5eb1f2` |
| `--success` | `#90bba0` | `#267349` | `#8fd0a0` |
| `--warning` | `#d6b47b` | `#866115` | `#f0c879` |
| `--danger` | `#df9294` | `#b13d46` | `#f393a0` |

Local font stack `"Cascadia Mono", "Cascadia Code", Consolas, "Liberation Mono", monospace`. Do not embed or redistribute font binaries. Keyboard focus must remain distinct from the selected-row fill. Honor forced colors and reduced motion.

## Layout metrics (observed browser output; candidate)

- Baseline desktop 1440x900: header `42px`, five-icon dock `52px`, contextual sidebar `182px`, factual footer `26px`.
- 1040x800: same desktop metrics if enough horizontal space.
- 390x844: header `42px`, dock `43px`, contextual sidebar collapsed; collection/details/context become compact selector regions; footer `26px`.
- 200% CSS zoom at 1440x900: header `84px`, dock `86px`, context sidebar collapsed, footer `52px`; no clipped dialog Apply/Cancel.
- Candidate component metrics: 1px square borders, 30px controls, 34px tabs, 37px collection rows; compact Settings 520px and Reference Manager up to 1130px width / 736px height, clamped to viewport.

## Structural invariants

1. **One central workspace/navigation owner**. Five dock destinations: Overview, Tickets, Objectives, Inventory, Infrastructure. Settings is reached through a separate gear. Do not leave an Overview sidebar active when returning to Tickets.
2. **One desktop contextual nav**, not additional redundant top tabs; reserved nonfunctional command region at sidebar bottom, above the full-width factual status footer.
3. **Collection → Details / Context**. One upper list. Lower panes appear when a record is selected, are adjustable, and maintain correct focus/scroll on navigation. Note that read-only source evidence does not imply an accepted domain state.
4. **Inventory:** Stock part/location quantities ≠ registered LSU Physical Unit identities, and management obligations have a distinct action queue. Unassigned LSU records are still discoverable. No RMA-created ghost LSU.
5. **RFC:** direct SR relation only to the governing root; subordinate children are revealed on expansion, not flattened into direct SR links. RFC, Tasks and Spare Parts tabs display relevant counts. Avoid duplicate RFC hierarchy in Context.
6. **Objectives/Overview:** maintenance window time occupancy ≠ percent complete. GitHub-style MW grid counts windows by accepted start date, with global total across all known windows. Use staggered square-pixel **embedded SVG** texture for empty time cells; no round-dots or Unicode shade glyph.
7. **Infrastructure:** operator can hide/reorder intermediate display levels; Customer first / Network Element last. Actual canonical Customer→Cloud→Site→Room→Rack→Network Element→Component parentage is untouched. Preserve clickable breadcrumbs and a consistently reachable Apply button at 200% zoom.
8. **Governed review:** staged prepare/review/consequence, present missing proof and stale/unknown explicitly; never enable destructive/acceptance actions solely from layout-local checks. Preserve source/owner transaction semantics.
9. **Time:** UTC may remain backend authority; operator-facing presentation is readable local time with declared timezone semantics.
10. **All examples in Study 30 are illustrative**. No synthetic SR/LSU/Customer/receipt should leak into Beta production queries or app default state.

## Verification envelope

For every shell/theme/layout change, compare against Study 30:
- 1440x900 Default Dark + Light + Vibrant, 1040x800, 390x844, and 200% CSS zoom;
- five dock destinations, active dock/sidebar continuity, refresh/back, Settings modal, reference modal, modal focus, Structure Apply/Cancel;
- compile `src/web`, rerun `src/web` interaction tests, rebuild frozen production artifacts, run `tools/verify_ui_build.py` and domain-specific Python test owners;
- capture actual Beta UI screenshots **against Study 30 screenshots**, not against historical Beta V1 or a synthetic fixture alone.

Do not assume the source prototype and current Beta persisted appearance enum agree: today Beta stores mode system/light/dark and skins soma_core/terminal_green/terminal_amber/terminal_violet. An explicit owner-aligned migration decision is required for a persisted third `Vibrant` look; a new skin ID must not bypass existing revisions or settings authority.

**This page intentionally contains NO React/JS code and makes no claims of completed live integration.**
