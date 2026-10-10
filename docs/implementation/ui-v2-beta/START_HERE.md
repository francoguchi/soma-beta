# SOMA Beta — UI V2 integration lane

**Status:** active implementation preparation; no application/UI source modified by this checkpoint.  
**Target repository:** `francoguchi/soma-beta`  
**Protected donor branch:** `feat/beta-1.0-implementation` @ `fbe3821ac0b52802ba8265f979590e75c3ac1209`  
**Working branch:** `feat/beta-ui-v2` (created from the pin above)  
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

## Supplied .bat files from the newer `soma` repo

The source `soma_setup.bat`, `soma_run.bat`, `soma_run_console.bat`, `soma_stop.bat` delegate to `tools/source_launcher.py`. **Beta already has the same trusted delegation architecture.** The supplied `run` and `run_console` wrappers add `pause` on failures, including missing environment, which may hang existing noninteractive Windows launcher tests; do not wholesale overwrite Beta's wrappers. The supplied `soma_reset_dev.bat` calls `source_launcher.py reset`, **but the Beta launcher currently only accepts setup/run/console/stop/host**. Do not introduce an unverified reset command, purge data, or route around DPAPI/runtime-control ownership. Review future launcher ergonomics as a separately tested safety change.

## Certification status at lane start

- GitHub branch contents and file contracts inspected read-only: **yes**.
- Windows native runtime / keyed SQLCipher wheel: **not executed in this environment**.
- Beta's full TypeScript/React build and frozen asset verification: **not executed in this environment**.
- Current CI: combined commit status exposed no status entries; **not proof of green**.
- User approval of visual language: **yes**; exact production token sheet and all domain interactions still require owner and operator acceptance.
- Backend/schema/data changes authorized by this checkpoint: **none**.

**Next implementation checkpoint:** UI V2 shared-shell skeleton on `feat/beta-ui-v2`, retaining existing Beta workbench integrations and test gates. Do not merge into the implementation donor branch without an explicitly reviewed PR.
