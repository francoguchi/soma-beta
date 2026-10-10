# SOMA Beta — UI V2 integration lane

**Status:** UI V2 shell + Settings/branding/auth presentation implemented in React/Python source on the canonical UI branch; production frozen-assets rebuild and browser validation pending. Do not deploy or merge yet.  
**Target repository:** `francoguchi/soma-beta`  
**Protected donor branch:** `feat/beta-1.0-implementation` @ `fbe3821ac0b52802ba8265f979590e75c3ac1209`  
**Sole working branch:** `feat/beta-ui-v2`. Keep all UI implementation, documentation, validation fixes and asset builds on THIS branch—**do not open per-task branches**. Draft PR: #80.  
**Owner goal:** deliver the user-reviewed SOMA UI V2 visual language *on the existing Beta backend*, replacing the unsuccessful current React presentation **without losing working domain integrations**.

## Read order

1. Read repo `AGENTS.md`, `docs/implementation/current-state.json` and `docs/implementation/continuation-workflow.md`. Respect the pinned Beta design packet and owner boundaries. This lane does not supersede those documents.
2. Read this file and the operator-supplied **Study 30 Navigation Verified** handoff. The operator-selected visual direction, not the Beta V1 CSS, is the new presentation reference. The handoff is a design baseline, **not** evidence that its sample data/actions are implemented.
3. Inspect current web sources: `src/web/components/SomaShell.tsx`, `src/web/app/main.tsx`, `src/web/app/router.ts`, `src/web/components/WorkbenchShell.tsx`, `src/web/styles/soma.css`, `src/web/state/appearance.ts`, and domain workbenches.
4. Inspect trusted build/host gates: `src/web/package.json`, `src/soma/ui/static/manifest.json`, `tools/build_ui_asset_manifest.py`, `tools/verify_ui_build.py`, `tools/source_launcher.py`. Do not modify frozen source bytes without rebuilding and verifying assets.

## Visual baseline fingerprint

The user-supplied file `soma_ui_v2_study30_handoff.zip` has SHA-256
`6e1ef0d7901730ced470cdc2833b72e0264d5fd8fb446b1a3345043d8fa50d65`.
Contained `prototype/soma_ui_v2_study30_full.html` has SHA-256
`f540a528fa97c5d73496a1f66bf930a51120aab5cb58344b91e8b67a57ae47cd`.
Store the handoff outside the production app; never copy its fictional example records as authoritative backend data.

Accepted **direction**: neutral dark, restrained blue; three looks Default Dark, Light, Vibrant; exact densities and tokens as candidate measured design values; five-icon workspace dock and **one centrally owned workspace/context navigation state**; 42px header, 52px dock, 182px context rail, 26px footer at baseline desktop; square gray borders; selected-only Details/Context; compact Reference Manager modal; SVG offset pixel granulation (not emoji/Unicode shade glyphs); Stock quantities separate from individually registered LSU Physical Units; all-time MW contribution grid represents *started windows, not execution completion*; Infrastructure custom projection changes only the display hierarchy.

## Safe implementation slices

1. **Beta baseline verification.** Establish clean worktree, current CI, production UI/fixture behavior and runtime test availability on Windows. Snapshot baseline before modifying anything. Report unknown rather than invent passing tests.
2. **Shared shell + central route/navigation state.** Replace `SomaShell` chrome/typography carefully, preserve route/controller API, all existing owner query bindings and dirty-edit protection. One route-selected dock; one contextual sidebar; keyboard + compact switcher; truthful footer. Implement only one slice before touching domain panels.
3. **Theme foundation and shared primitives.** Port tokens and SVG grain. Respect existing two-axis persisted appearance contract until owning settings revision reconciles Default Dark/Light/Vibrant. Do NOT force old `terminal_violet` semantics into the new theme.
4. **Reference + Tickets.** Compare real Owner DTOs to Study 30 views. Migrate collection/selection/Details/Context without fake data. Keep RFC hierarchy, Device References, Source Monitoring and Import operations distinct.
5. **Objectives, Stock/Inventory Management, Infrastructure and Overview.** Integrate real owner queries, cursor pagination, projection provenance, safe review commands, and owner-evidence-based SLA/attention. No invented deadlines or mutations.
6. **Launchers/security/packaging and live acceptance.** Rebuild the frontend, regenerate frozen asset manifest and run original + new tests including start/stop, SQLCipher, source imports, 200% zoom, responsive, forced colors, interactions, failure recovery.

Each slice: focused tests + browser screenshot comparison against Study 30, explicit remaining gaps, narrow commit and rollback, no promotion based solely on prototype behavior.

## Launcher status and local safety

The canonical UI branch now contains a separate approved/implemented Windows source-launcher correction, including setup, run, console, stop, and **explicitly guarded** `soma_reset_dev.bat`. The `reset` command is **not** required for UI testing and must not be used on an existing instance unless the operator independently authorizes an isolated destructive reset. Source launchers remain adapters to the trusted Beta host, not a bypass of DPAPI/SQLCipher/runtime identity.

## Current single-branch checkpoint — 2026-10-10

- `feat/beta-ui-v2` contained source commit `94d3b0944470aa48863fbf24400fd48656d7768c` when the consolidation was verified. Always check the current head first; do not pin future work to that SHA.
- The former temporary `feat/ui-v2-settings-brand-auth` pointed to **exactly the same SHA**: comparison status `identical`, ahead `0`, behind `0`. All **20** extra commits were incorporated by a non-forced fast-forward. PR #81 was closed, while draft PR #80 remains the **only** UI implementation PR.
- Brand lockup, favicon, server-generated pre-auth setup/login appearance, Settings modal, Reference Manager and updated tests are now in the **canonical branch source**. Existing credential/session/domain/backend owners are unchanged.
- **Frozen asset blocker**: `src/soma/ui/static/` JS/CSS/SVG and `manifest.json` must be built from this new source and committed together. An older frozen bundle may satisfy its own digest but is **not** current relative to source. Use `npm.cmd --prefix src/web ci --ignore-scripts --no-audit --no-fund`, `npm.cmd --prefix src/web test`, `npm.cmd --prefix src/web run build`, `py -3.14 tools/verify_ui_build.py`, then inspect `git status --short`. Stage **only** generated `src/soma/ui/static` outputs if full tests pass; verify determinism, run UI/browser/owner checks and push a normal commit to the same branch. Preserve any other developer work.
- **No production rollout is certified yet**. Do not merge PR #80 or recreate a separate working branch to address a CI failure. Collect screenshots against the operator-approved Study 30 after passing the frozen-assets gate.
- **Local checkout is not remotely controllable**. Before deleting any redundant branch, the Windows operator must first verify a clean `D:\\DEV\\soma-beta-ui-v2` worktree and fetch/pull `feat/beta-ui-v2` via `git pull --ff-only`. The remote head being current does *not* prove a local checkout is synchronized.

## Immediate next actions

1. Get the canonical UI branch checkout to the newest commit without overwriting local work.
2. Build, test, and freeze its production frontend assets on that **same branch**.
3. Run CI and operator-local Settings modal, 200%-zoom, brand favicon and unauthenticated login verification, followed by existing workbench regressions. Distinguish old inherited UI contracts from intentionally revised modal tests and fix genuine regressions, never weaken tests.
4. Continue design-to-owner integration under PR #80 using narrow **commits**, not branches.

**One repository + one UI branch + one PR + one next checkpoint.**
