# SOMA Beta UI V2 — Settings, Authentication and Brand

**Canonical development branch:** `feat/beta-ui-v2`, **single draft PR:** #80.
**Last refreshed:** 2026-10-10. See [CONTINUE.md](CONTINUE.md) for live source/asset build and verification gates. Historical task branches/PRs were consolidated; do not use them for continuation.

## Real source composition

- `SettingsDialog` presents `/settings`, `/settings/appearance`, `/settings/communications` as route-backed modal over the preserved workbench. Settings has focus trapping, Escape/close, background inert, browser-history restoration. Manual browser acceptance is required.
- The General tab contains `ObjectiveSettings` and an entry to expanded Reference Manager; the latter owns the larger `ReferenceSettings` and `SlaCatalogSettings` directories. **No new owner mutations are implied.**
- Objective timezone: `/api/v1/settings/OBJECTIVE_TIMEZONE_V1` (real LLD-02 Settings routing). The result is a full 7-field `SettingValue` envelope: `setting_key`, `contract_name`, `contract_version`, `semantic_owner`, `value`, `source`, `revision`. Value defaults to `America/Guayaquil`; there is no synthetic `iana_timezone` DTO.
- Product-line/Contract/CPL/Classification catalog owners return `items`, `next_cursor`, `exact_count` (not `continuation`). Respect owner validation and cursor fingerprint in `settings-intent.ts`. Real unpopulated catalogs show zero accepted records, not a red projection error.
- `src/soma/ui/auth_shell.py` still renders the Beta pre-React authentication page, using the original Beta endpoints, CSRF, password semantics, security session and strict CSP. No credentials or session material moved to React.
- SOMA artwork: original canonical blue mark `soma-mark.svg`, original lockup `soma-lockup.svg` for light display, and identical artwork with light lettering `soma-lockup-dark.svg` for dark header. A closed frozen manifest and same-origin SVG serving are mandatory.

## Screenshot-driven UI repairs, not yet operator certified

User screenshots showed a compact but incomplete Tickets page, the Settings modal with visibly red owner errors, vertically stacked General/Appearance/Communications navigation, and the SOMA letters nearly invisible against the dark shell.

Corrected wrong Settings endpoint/DTO expectations; corrected catalog paging fields; reduced General clutter; forced horizontal Settings tab navigation; supplied dark-header lockup; added explicit real-empty register explanation. All must be rebuilt and inspected in the running Beta app.

## Verification

`npm.cmd --prefix src/web test`, focused pytest `tests/test_ui_settings_owner_shapes.py tests/test_ui_assets.py tests/test_auth_shell_presentation.py`, Vite `npm.cmd --prefix src/web run build`, `py -3.14 tools\\verify_ui_build.py`, and Playwright `settings-owner-bindings-v2.spec.mjs settings-modal-ui-v2.spec.mjs settings-return.spec.mjs`. Other owner/browser integration gates are listed in `CONTINUE.md`. **Do not merge PR #80 until these pass.**
