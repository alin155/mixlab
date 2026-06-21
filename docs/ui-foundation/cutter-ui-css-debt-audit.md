# Cutter UI/CSS Debt Audit

Date: 2026-06-19
Owner: MixLab UI Foundation migration
Scope: `apps/cutter-web`, shared by local web cutter and desktop cutter WebView

## Purpose

This document is the control point for the Cutter UI cleanup. The goal is not to keep adding page-specific fixes. The goal is to make visual ownership explicit, migrate pages to shared UI Foundation contracts, and delete redundant legacy CSS after each batch.

The user-facing target is:

- Similar controls have the same position, size, typography, spacing, radius, border, shadow, and state behavior across Cutter pages.
- Pages keep business layout only.
- Shared visual primitives live in `packages/ui-foundation` or the Cutter shell layer.
- Old route-specific visual overrides are removed as pages migrate.

## Batch 5.180 Progress: Temporary Lab Cleanup And Shell CSS Closeout Audit

Date: 2026-06-21.

Routes/components in scope:

- Temporary UI comparison app directories.
- Root workspace/package script references.
- Cutter runtime shell stylesheet boundary.

Layer classification:

- Temporary UI comparison labs are no longer product code and must not be kept as a second UI source of truth.
- Archived comparison documentation may remain under `docs/ui-comparison/*`, but it is historical reference only.
- `apps/cutter-web/src/styles.css` is now classified as Cutter Shell/runtime CSS, not page visual-system CSS.
- UI Foundation owns visual tokens, Cutter theme variables, reusable entry surfaces, buttons, form/focus base rules, split workbench primitives, and shared layout primitives.
- Cutter Shell keeps only viewport containment, hidden-scrollbar policy, Material Search content lock, and route scroll ownership.
- Search, cut, cache, auth, API, desktop runtime, and NAS data behavior were not changed.

Current state observed:

- `apps/antd-ui-lab` does not exist.
- `apps/ui-foundation-lab` does not exist.
- Root `package.json` workspaces are generic `packages/*` and `apps/*`; no lab-specific workspace entry exists.
- Root scripts have no `antd-ui-lab`, `ui-foundation-lab`, or comparison-lab script.
- Production `apps`, `packages`, `scripts`, `.github`, `package.json`, and `package-lock.json` have no `@mixlab/antd-ui-lab`, `@mixlab/ui-foundation-lab`, `apps/antd-ui-lab`, or `apps/ui-foundation-lab` references.
- Remaining `docs/ui-comparison/*` references are archived documentation and should not be imported or executed.

Visual ownership result:

- The real product UI has one current implementation path: `packages/ui-foundation` plus the Cutter Shell/runtime boundary.
- The temporary UI labs are not active code and no longer need a deletion task.
- `apps/cutter-web/src/styles.css` remains at `70` lines and contains only:
  - launch/body fallback
  - root viewport containment
  - app/workspace overflow containment
  - semantic page wrapper horizontal containment
  - hidden-scrollbar policy
  - material-search content lock
  - normal-page content scrolling

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 34 tests, 34 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 128 tests, 128 passed.
- `npm run build:cutter-web` passed: CSS bundle `64.69 kB`, gzip `11.39 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cache-management.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/source-detail.png`
- `git diff --check` passed.
- Production residual-reference search returned no matches for:
  - `@mixlab/antd-ui-lab`
  - `@mixlab/ui-foundation-lab`
  - `apps/antd-ui-lab`
  - `apps/ui-foundation-lab`
  - old route-owned login/desktop entry visual selectors
  - old Cutter theme/sidebar/workbench variable owners in `apps/cutter-web/src/styles.css`
  - old app-level native form/focus owners in `apps/cutter-web/src/styles.css`
- The only remaining matches for old video/form selectors are negative regression-test assertions inside `apps/cutter-web/src/cutter-app.test.ts`, not production CSS.

Remaining debt moved forward:

- The current batch closes the temporary-lab cleanup item.
- Local web closeout evidence is now complete for the current Cutter UI Foundation migration.
- Windows desktop packaging remains a separate acceptance step if the user wants packaged-app proof after local web closeout.

## Batch 5.179 Progress: Shell Runtime CSS Deduplication

Date: 2026-06-21.

Routes/components in scope:

- Foundation base token reset.
- Cutter shell runtime CSS.
- Cutter workbench scroll rules.

Layer classification:

- UI Foundation token/base layer owns cross-surface box sizing:
  - `*`
  - `*::before`
  - `*::after`
- Cutter Shell keeps viewport containment and route scroll ownership.
- Cutter Shell no longer carries duplicated pseudo-element box sizing or a redundant ready-shell padding rule.
- Search, cut, cache, auth, API, desktop runtime, and NAS data behavior were not changed.

Change made:

- Expanded Foundation box-sizing reset to pseudo-elements.
- Removed duplicate `*::before` / `*::after` box-sizing from Cutter CSS.
- Removed redundant `.cutter-app[data-cutter-web-ready] { padding: 0; }` because `.cutter-app { padding: 0; }` already owns it.
- Removed duplicate generic ready workbench-content scrolling; normal routes keep the explicit route scroll rule, while Material Search keeps the content-lock rule.
- Updated tests so they prove the duplicate rules are absent while route scroll ownership remains covered.

Visual ownership result:

- Cutter CSS is now a small runtime shell stylesheet rather than a visual system stylesheet.
- `apps/cutter-web/src/styles.css` decreased from `88` lines after Batch 5.178 to `70`.
- `packages/ui-foundation/src/tokens.css` increased from `350` lines after Batch 5.178 to `352`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 34 tests, 34 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 128 tests, 128 passed.

Remaining debt moved forward:

- `apps/cutter-web/src/styles.css` now contains only:
  - launch/body fallback
  - root viewport containment
  - app/workspace overflow containment
  - semantic page wrapper horizontal containment
  - hidden-scrollbar policy
  - material-search content lock
  - normal-page content scrolling
- Any further reduction should be treated as shell/runtime architecture work, not page visual cleanup.
- Temporary comparison labs remain pending for deletion after full UI Foundation acceptance.

## Batch 5.178 Progress: Cutter Theme Token Ownership Cleanup

Date: 2026-06-21.

Routes/components in scope:

- Cutter workbench root.
- Foundation Cutter theme preset.
- Cutter-ready sidebar/page/workbench variables.

Layer classification:

- UI Foundation token/base layer owns the named Cutter theme preset:
  - `.ml-theme-cutter`
- `.ml-theme-cutter` owns Cutter-specific visual tokens and shell variables:
  - sidebar width
  - Cutter text/canvas/surface/control/accent colors
  - page inset variables
  - sidebar brand/nav rhythm variables
  - workbench background variable
- Cutter Shell keeps only runtime containment and scroll-switching rules.
- Search, cut, cache, auth, API, desktop runtime, and NAS data behavior were not changed.

Change made:

- Added `.ml-theme-cutter` to `packages/ui-foundation/src/tokens.css`.
- Applied `.ml-theme-cutter` to the Cutter workbench root and desktop auto-starting shell root.
- Removed duplicated Cutter-ready color/sidebar/page/workbench variable blocks from `apps/cutter-web/src/styles.css`.
- Removed stale historical gradient/padding shell remnants that were already overridden by the final app shell.
- Updated tests so theme variables are proven in Foundation tokens rather than Cutter CSS.

Visual ownership result:

- Cutter theme variables are now Foundation-owned instead of app-stylesheet-owned.
- `apps/cutter-web/src/styles.css` decreased from `130` lines after Batch 5.177 to `88`.
- `packages/ui-foundation/src/tokens.css` increased from `317` lines after Batch 5.177 to `350`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 34 tests, 34 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 128 tests, 128 passed.
- Residual selector check found no Cutter theme variables, old gradients, entry private selectors, or form/focus private ownership in `apps/cutter-web/src/styles.css`.

Remaining debt moved forward:

- `apps/cutter-web/src/styles.css` now contains only Cutter shell/runtime categories:
  - initial body fallback
  - desktop viewport containment
  - pseudo-element box sizing fallback
  - app/workspace max-width and overflow containment
  - hidden-scrollbar policy
  - material-search content lock
  - normal-page content scroll
- The next cleanup decision should classify which of these are truly app-runtime rules versus Foundation base viewport rules.
- Temporary comparison labs remain pending for deletion after full UI Foundation acceptance.

## Batch 5.177 Progress: Foundation Base Form And Focus Ownership Cleanup

Date: 2026-06-21.

Routes/components in scope:

- Foundation token/base layer.
- Cutter native form fallback controls.
- Global keyboard focus visibility.

Layer classification:

- UI Foundation token/base layer owns cross-surface native element defaults:
  - fallback input/select/textarea visual styling under `[data-appearance-mode]`
  - base keyboard focus ring for native interactive elements
- UI Foundation component layer continues to own component-specific focus refinements:
  - `.ml-button`
  - `.ml-search-box-input`
  - `.ml-focus-inset`
  - `.ml-field-input`
  - `.ml-field-select`
- Cutter Shell no longer owns native form fallback styling or global focus styling.
- Search, cut, cache, auth, API, desktop runtime, and NAS data behavior were not changed.

Change made:

- Moved fallback native form-control styling from `apps/cutter-web/src/styles.css` to `packages/ui-foundation/src/tokens.css`.
- Moved global focus-visible fallback from Cutter CSS to Foundation token/base CSS.
- Tightened tests so Cutter CSS cannot regain `.cutter-app input...` or `.cutter-app button:focus-visible...` ownership.

Visual ownership result:

- Unmigrated native controls still receive a consistent fallback style through Foundation.
- Fully migrated controls continue to use `.ml-field-input`, `.ml-field-select`, `.ml-button`, and `.ml-search-box-input`.
- `apps/cutter-web/src/styles.css` decreased from `149` lines after Batch 5.176 to `130`.
- `packages/ui-foundation/src/tokens.css` increased from `302` lines after Batch 5.176 to `317`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 34 tests, 34 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 128 tests, 128 passed.

Remaining debt moved forward:

- `apps/cutter-web/src/styles.css` now contains only Cutter shell/runtime categories:
  - initial body background fallback
  - Cutter-ready design-reference palette and sidebar/page variables
  - desktop viewport containment
  - hidden-scrollbar policy
  - content-scroll switching for material search versus normal pages
- The next cleanup decision should classify whether the Cutter-ready palette variables stay app-specific or move into a named Foundation theme preset.
- Temporary comparison labs remain pending for deletion after full UI Foundation acceptance.

## Batch 5.176 Progress: Entry Surface Visual Ownership Cleanup

Date: 2026-06-21.

Routes/components in scope:

- Login gate.
- Windows desktop first-run setup surface.
- Doctor check list and diagnostics panel.
- Foundation entry/auth/setup primitives.

Layer classification:

- UI Foundation owns entry/auth/setup visual primitives:
  - `.ml-auth-gate`
  - `.ml-auth-panel`
  - `.ml-entry-surface`
  - `.ml-entry-shell`
  - `.ml-entry-header`
  - `.ml-entry-step-grid`
  - `.ml-entry-step-card`
  - `.ml-check-list`
  - `.ml-check-row`
  - `.ml-diagnostics-panel`
  - `.ml-entry-actions`
- Cutter entry classes remain semantic hooks only:
  - `.cutter-login-*`
  - `.cutter-desktop-*`
- Cutter Shell keeps global runtime and workbench scroll rules only.
- Auth, desktop setup, Doctor, engine startup, search, cut, cache, API, and NAS data behavior were not changed.

Change made:

- Added Foundation entry/auth/setup primitives.
- Composed login and desktop first-run JSX with Foundation primitives.
- Removed private `.cutter-login-*` and `.cutter-desktop-*` visual CSS from Cutter stylesheet.
- Added regression tests proving Foundation owns entry visuals and Cutter CSS cannot regain these private selectors.

Visual ownership result:

- Login and Windows first-run no longer carry page-local panel/card/check-list/diagnostic visual rules.
- `apps/cutter-web/src/styles.css` decreased from `371` lines after Batch 5.175 to `149`.
- `packages/ui-foundation/src/layout.css` increased to `3250` lines.
- `npm run build:cutter-web` passed with CSS bundle `65.07 kB`, gzip `11.59 kB`, down from `65.60 kB`, gzip `11.60 kB` after Batch 5.175.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 34 tests, 34 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 128 tests, 128 passed.
- `npm run build:cutter-web` passed: CSS bundle `65.07 kB`, gzip `11.59 kB`.
- `npm run visual:cutter-web` passed and refreshed workbench route screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Login and desktop entry states are covered by SSR DOM/style ownership tests in this batch; the existing route screenshot script does not yet capture non-workbench entry states.
- `git diff --check` passed.

Remaining debt moved forward:

- `apps/cutter-web/src/styles.css` now mostly contains Cutter app/shell runtime rules: raw native form fallback, focus ring, ready shell palette, viewport containment, page inset, scrollbar policy, content scroll switching.
- Legacy raw select/textarea fallback remains for unmigrated native controls.
- Cutter Shell ready-state palette overrides remain app-specific by design until admin/cutter shared theming is tackled together.
- Temporary comparison labs remain pending for deletion after full UI Foundation acceptance.

## Batch 5.175 Progress: Appearance Token Ownership Cleanup

Date: 2026-06-21.

Routes/components in scope:

- Foundation token layer.
- Cutter dark/light/system appearance modes.
- Cutter Shell ready overrides.

Layer classification:

- UI Foundation owns reusable appearance-mode tokens:
  - `[data-appearance-mode="dark"]`
  - `[data-appearance-mode="system"]`
  - `[data-appearance-mode="light"]`
  - `[data-appearance-mode]` color/background/font application.
- Cutter Shell keeps only product-specific ready-state overrides:
  - Cutter sidebar width.
  - Cutter web-ready color palette override.
  - Cutter workbench/page inset variables.
  - Cutter scroll switching.
- Search flow, cut flow, cache behavior, auth behavior, API behavior, desktop runtime, and NAS data behavior were not changed.

Change made:

- Moved dark/light/system appearance token definitions from `apps/cutter-web/src/styles.css` to `packages/ui-foundation/src/tokens.css`.
- Removed the duplicate `.cutter-app`, `.cutter-app[data-appearance-mode="dark"]`, `.cutter-app[data-appearance-mode="system"]`, and `.cutter-app[data-appearance-mode="light"]` token blocks from Cutter CSS.
- Added regression coverage proving appearance tokens live in Foundation and do not return to Cutter app CSS.

Visual ownership result:

- Appearance token ownership is now centralized in UI Foundation instead of the Cutter app stylesheet.
- Cutter CSS now starts from page/auth/setup special cases and Shell runtime rules, rather than carrying a large theme-token block.
- `apps/cutter-web/src/styles.css` decreased from `481` lines after Batch 5.174 to `371`.
- `packages/ui-foundation/src/tokens.css` increased to `302` lines.
- `npm run build:cutter-web` passed with CSS bundle `65.60 kB`, gzip `11.60 kB`, down from `65.71 kB`, gzip `11.80 kB` after Batch 5.174.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 33 tests, 33 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 128 tests, 128 passed.
- `npm run build:cutter-web` passed: CSS bundle `65.60 kB`, gzip `11.60 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- `git diff --check` passed.

Remaining debt moved forward:

- Login gate and Windows first-run setup still own special-entry layout CSS; these should be reviewed as a separate entry-surface batch instead of mixed into normal workbench pages.
- Cutter Shell ready-state palette overrides remain app-specific by design until admin/cutter shared theming is tackled together.
- Legacy raw select/textarea fallback remains for unmigrated native controls.
- Temporary comparison labs remain pending for deletion after full UI Foundation acceptance.

## Batch 5.174 Progress: Route Semantic Container CSS Cleanup

Date: 2026-06-21.

Routes/components in scope:

- Generic `.cutter-page` route container.
- Route semantic hooks:
  - `.cutter-cut-queue`
  - `.cutter-local-library`
  - `.cutter-public-library`
  - `.cutter-cache-management`
  - `.cutter-settings`
- Foundation workbench composition classes already paired with these routes.

Layer classification:

- `.cutter-page` owns only the minimal route wrapper containment shared by all Cutter pages.
- Route semantic classes remain available in markup and tests, but must not become generic geometry owners.
- UI Foundation continues to own page composition through `.ml-workbench-main`, `.ml-split-workbench`, and related workbench primitives.
- Search flow, cut flow, cache behavior, auth behavior, API behavior, desktop runtime, and NAS data behavior were not changed.

Change made:

- Removed the specific route classes from the generic max-width/min-width/overflow-x containment selector.
- Kept the same containment behavior through the shared `.cutter-page` route wrapper.
- Added regression coverage preventing these route semantic classes from returning as top-level production CSS owners.

Visual ownership result:

- Route-specific page classes are less likely to drift into independent layout systems.
- The shared Cutter page wrapper now carries the small remaining containment rule once.
- `apps/cutter-web/src/styles.css` decreased from `486` lines after Batch 5.173 to `481`.
- `packages/ui-foundation/src/layout.css` remained `3042` lines.
- `npm run build:cutter-web` passed with CSS bundle `65.71 kB`, gzip `11.80 kB`, down from `65.81 kB`, gzip `11.85 kB` after Batch 5.173.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 33 tests, 33 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 128 tests, 128 passed.
- `npm run build:cutter-web` passed: CSS bundle `65.71 kB`, gzip `11.80 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- `git diff --check` passed.

Remaining debt moved forward:

- Desktop first-run setup layout remains route-owned intentionally until final desktop setup polish.
- Legacy raw select/textarea fallback remains for unmigrated native controls.
- Remaining route semantic selectors should be reviewed only when they own visual behavior, not merely because they exist as DOM/test hooks.
- Temporary comparison labs remain pending for deletion after full UI Foundation acceptance.

## Batch 5.173 Progress: Page Main Composition Guard

Date: 2026-06-21.

Routes/components in scope:

- Cutter semantic hook `.cutter-page-main`.
- Foundation `.ml-workbench-main`.
- Foundation `.ml-split-workbench`.
- All current Cutter page components.

Layer classification:

- `.cutter-page-main` remains only a semantic/test hook.
- UI Foundation owns page main layout through:
  - `.ml-workbench-main`
  - `.ml-workbench-main--project-home`
  - `.ml-workbench-main--library`
  - `.ml-workbench-main--rows-list`
  - `.ml-workbench-main--rows-list-footer`
  - `.ml-workbench-main--rows-dashboard`
  - `.ml-workbench-main--task-flow`
  - `.ml-workbench-main--stack`
  - `.ml-split-workbench`
- Cutter Shell owns the route wrapper and content slot only.
- Search flow, cut flow, cache behavior, auth behavior, API behavior, desktop runtime, and NAS data behavior were not changed.

Change made:

- Removed `.cutter-page-main` from the remaining generic Cutter max-width/overflow-x containment selector.
- Added regression coverage that reads all current Cutter page files and requires every `cutter-page-main` wrapper to include either `.ml-workbench-main` or `.ml-split-workbench`.
- Added regression coverage proving `.cutter-page-main` cannot return as a production CSS owner.

Visual ownership result:

- Page main layout is now explicitly Foundation-owned across current Cutter pages.
- Cutter page components can keep `cutter-page-main` only for route semantics and test readability.
- `apps/cutter-web/src/styles.css` decreased from `487` lines after Batch 5.172 to `486`.
- `packages/ui-foundation/src/layout.css` remained `3042` lines.
- `npm run build:cutter-web` passed with CSS bundle `65.81 kB`, gzip `11.85 kB`, down from `65.83 kB`, gzip `11.86 kB` after Batch 5.172.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 33 tests, 33 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 128 tests, 128 passed.
- `npm run build:cutter-web` passed: CSS bundle `65.81 kB`, gzip `11.85 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- `git diff --check` passed.

Remaining debt moved forward:

- Shell/content/page-main geometry is now mostly centralized. The next cleanup target should be generic route container selectors such as `.cutter-cut-queue`, `.cutter-local-library`, `.cutter-public-library`, `.cutter-cache-management`, and `.cutter-settings`.
- Desktop first-run setup layout remains route-owned intentionally until final desktop setup polish.
- Legacy raw select/textarea fallback remains for unmigrated native controls.
- Temporary comparison labs remain pending for deletion after full UI Foundation acceptance.

## Batch 5.172 Progress: Workbench Content Slot Ownership

Date: 2026-06-21.

Routes/components in scope:

- Foundation `.ml-workbench-content`.
- Cutter semantic hook `.cutter-content`.
- Normal page scroll switching.
- Material Search locked content mode.
- Desktop engine-starting workbench content.

Layer classification:

- UI Foundation owns the workbench content slot:
  - content slot width and max-width
  - content slot min-size
  - border/radius/padding reset
  - default overflow
  - shadow reset
- Cutter Shell owns only runtime scroll switching:
  - app-ready content overflow axes
  - locked content overflow for dense split-workbench routes
  - normal-route overscroll containment
- `.cutter-content` remains only as a semantic/test hook in JSX and must not own production CSS.
- Search flow, cut flow, cache behavior, auth behavior, API behavior, desktop runtime, and NAS data behavior were not changed.

Change made:

- Added `.ml-workbench-content` to UI Foundation.
- Applied `.ml-workbench-content` beside `.cutter-content` in Cutter AppShell content sections.
- Removed Cutter's standalone `.cutter-content` visual/geometry rule.
- Removed Cutter's `.cutter-content` border/radius/padding/shadow reset.
- Re-targeted Cutter route scroll switching from `.cutter-content` to `.ml-workbench-content`.
- Added regression coverage proving `.cutter-content` cannot regain padding or overflow ownership.

Visual ownership result:

- The AppShell content slot is now Foundation-owned instead of Cutter-owned.
- Cutter pages keep `.cutter-content` only for semantics while visual behavior comes from `.ml-workbench-content`.
- Material Search still locks the outer content slot while its inner panes scroll independently.
- `apps/cutter-web/src/styles.css` decreased from `508` lines after Batch 5.171 to `487`.
- `packages/ui-foundation/src/layout.css` increased from `3030` lines to `3042`.
- `npm run build:cutter-web` passed with CSS bundle `65.83 kB`, gzip `11.86 kB`, down from `66.01 kB`, gzip `11.86 kB` after Batch 5.171.

Verification:

- `rg -n "\\.cutter-content\\s*\\{|ml-workbench-content|cutter-workspace\\.is-content-locked|data-cutter-route\\]:not\\(\\[data-cutter-route=\\\"material-locator\\\"\\]\\) \\.ml-workbench-content" apps/cutter-web/src/styles.css packages/ui-foundation/src/layout.css apps/cutter-web/src/app/CutterApp.tsx apps/cutter-web/src/cutter-app.test.ts packages/ui-foundation/src/components.test.ts` shows no `.cutter-content { ... }` visual rule and shows the Foundation content slot plus Cutter scroll-switching rules.
- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 33 tests, 33 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 127 tests, 127 passed.
- `npm run build:cutter-web` passed: CSS bundle `65.83 kB`, gzip `11.86 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- `git diff --check` passed.

Remaining debt moved forward:

- `.cutter-page-main` should be the next audit target. It is currently expected to be paired with Foundation `.ml-workbench-main` or `.ml-split-workbench` and should not own production CSS.
- Desktop first-run setup layout remains route-owned intentionally until final desktop setup polish.
- Legacy raw select/textarea fallback remains for unmigrated native controls.
- Temporary comparison labs remain pending for deletion after full UI Foundation acceptance.

## Batch 5.171 Progress: Route Page Inset Rule Consolidation

Date: 2026-06-21.

Routes/components in scope:

- Cutter route page wrapper `.cutter-page`.
- Normal Cutter pages.
- Material Search split workbench page.
- Route page inset variables.

Layer classification:

- Cutter Shell owns the route page wrapper because it applies runtime route insets before page composition begins.
- UI Foundation owns page composition after the wrapper:
  - `.ml-workbench-page`
  - `.ml-workbench-main`
  - `.ml-split-workbench-page`
  - `.ml-scroll-region`
- Page components own business structure only.
- Search flow, cut flow, cache behavior, auth behavior, API behavior, desktop runtime, and NAS data behavior were not changed.

Change made:

- Removed the earlier normal-page `.cutter-page` overflow fallback.
- Merged route page height, min-height, inset padding, and overflow containment into the final Shell route page rule.
- Added regression coverage proving the old `:not([data-cutter-route="material-locator"]) .cutter-page` fallback cannot return.

Visual ownership result:

- `.cutter-page` wrapper geometry now has one route-wide owner in Cutter Shell.
- Material Search keeps its independent inner pane scroll behavior through Foundation split-workbench primitives.
- Normal pages keep workbench-content scrolling through `.cutter-content` and `.ml-scroll-region`.
- `apps/cutter-web/src/styles.css` decreased from `519` lines after Batch 5.170 to `508`.
- `packages/ui-foundation/src/layout.css` remained `3030` lines.
- `npm run build:cutter-web` passed with CSS bundle `66.01 kB`, gzip `11.86 kB`, down from `66.14 kB`, gzip `11.87 kB` after Batch 5.170.

Verification:

- `rg -n "data-cutter-route\\]:not\\(\\[data-cutter-route=\\\"material-locator\\\"\\]\\) \\.cutter-page|\\.cutter-app\\[data-cutter-web-ready\\]\\[data-cutter-route\\] \\.cutter-page|\\.cutter-page\\s*\\{" apps/cutter-web/src/styles.css apps/cutter-web/src/cutter-app.test.ts` shows only the consolidated route page rule and regression assertions.
- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 33 tests, 33 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 127 tests, 127 passed.
- `npm run build:cutter-web` passed: CSS bundle `66.01 kB`, gzip `11.86 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- `git diff --check` passed.

Remaining debt moved forward:

- `.cutter-content` still owns app scroll switching and should be reviewed next for whether a Foundation content-slot primitive is warranted.
- `.cutter-page-main` is currently expected to be paired with Foundation `.ml-workbench-main`; remaining checks should ensure no page-local main wrapper styles return.
- Desktop first-run setup layout remains route-owned intentionally until final desktop setup polish.
- Legacy raw select/textarea fallback remains for unmigrated native controls.
- Temporary comparison labs remain pending for deletion after full UI Foundation acceptance.

## Batch 5.170 Progress: Workbench Content Geometry Ownership

Date: 2026-06-21.

Routes/components in scope:

- Foundation `.ml-workbench`.
- Cutter `.cutter-workspace` compatibility host.
- Cutter `.cutter-content` scroll region.
- Cutter route page inset rules.
- Normal pages and Material Search split workbench scroll separation.

Layer classification:

- UI Foundation owns the right workbench viewport region:
  - workbench grid row containment
  - workbench min-size
  - workbench overflow lock
  - workbench background through `--ml-workbench-background`
- Cutter app shell owns only:
  - `--ml-workbench-background: var(--ml-color-window)`
  - page inset variables
  - route-agnostic `.cutter-content` scroll switching
  - locked-content override for dense split-workbench pages
  - host containment for `.cutter-app` and `.cutter-workspace`
- Cutter pages still own business composition only.
- Search flow, cut flow, cache behavior, auth behavior, API behavior, desktop runtime, and NAS data behavior were not changed.

Change made:

- Added workbench grid and background-variable ownership to UI Foundation `.ml-workbench`.
- Removed Cutter's standalone `.cutter-workspace` grid rule.
- Removed Cutter's app-ready `.ml-workbench.cutter-workspace` background override.
- Removed Cutter's app-ready route-level `.cutter-workspace` reset block for width, height, radius, shadow, border, overflow, and background.
- Preserved `.cutter-content` as the shell scroll region and kept Material Search locked-content behavior.
- Added regression coverage proving Cutter cannot reintroduce app-ready `.ml-workbench.cutter-workspace` or route-level `.cutter-workspace` geometry ownership.

Visual ownership result:

- Workbench geometry is now Foundation-owned instead of duplicated in Cutter CSS.
- Cutter sets the accepted production workbench color through `--ml-workbench-background` rather than styling `.ml-workbench` directly.
- Host containment remains in Cutter only for the runtime boundary, not for page visual layout.
- `apps/cutter-web/src/styles.css` decreased from `546` lines after Batch 5.169 to `519`.
- `packages/ui-foundation/src/layout.css` increased from `3028` lines to `3030`.
- `npm run build:cutter-web` passed with CSS bundle `66.14 kB`, gzip `11.87 kB`, down from `66.53 kB`, gzip `11.90 kB` after Batch 5.169.

Verification:

- `rg -n "\\.cutter-workspace\\s*\\{|ml-workbench\\.cutter-workspace|\\[data-cutter-route\\] \\.cutter-workspace|--ml-workbench-background|\\.ml-workbench\\s*\\{" apps/cutter-web/src/styles.css packages/ui-foundation/src/layout.css apps/cutter-web/src/cutter-app.test.ts packages/ui-foundation/src/components.test.ts` shows only the host containment rule, the Foundation workbench rule, the workbench token, and regression assertions.
- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 33 tests, 33 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 127 tests, 127 passed.
- `npm run build:cutter-web` passed: CSS bundle `66.14 kB`, gzip `11.87 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- `git diff --check` passed.

Remaining debt moved forward:

- `.cutter-content` still owns the shell scroll region and should be kept route-agnostic until a later Shell content wrapper can absorb it.
- `.cutter-page` and `.cutter-page-main` still need final ownership classification after the Workbench/Page inset contract is reviewed against screenshots.
- Desktop first-run setup layout remains route-owned intentionally until final desktop setup polish.
- Legacy raw select/textarea fallback remains for unmigrated native controls.
- Temporary comparison labs remain pending for deletion after full UI Foundation acceptance.

## Batch 5.169 Progress: AppShell Viewport Geometry Ownership

Date: 2026-06-21.

Routes/components in scope:

- Cutter production AppShell.
- `.cutter-shell-v1` compatibility class.
- Foundation `.ml-app-shell`.
- Foundation `.ml-workbench`.
- Cutter viewport host containment.

Layer classification:

- UI Foundation owns AppShell internals:
  - grid layout
  - sidebar/workbench columns
  - shell width
  - shell viewport height
  - shell overflow containment
  - shell canvas background
  - workbench min-size and overflow containment
- Cutter app shell owns only the runtime host boundary:
  - `html`, `body`, `#root`
  - `.cutter-app`
  - app-ready theme tokens
  - page inset variables
  - route-agnostic content scroll switching
- `.cutter-shell-v1` remains only as a production compatibility class in JSX and must not own visual or geometry CSS.
- Search flow, cut flow, cache behavior, auth behavior, API behavior, desktop runtime, and NAS data behavior were not changed.

Change made:

- Removed duplicate Cutter production CSS for `.cutter-shell-v1`.
- Removed duplicate Cutter production CSS for `.cutter-shell-v1 > .ml-sidebar`.
- Removed duplicate Cutter production CSS for `.cutter-shell-v1 > .ml-sidebar .ml-sidebar-footer`.
- Removed duplicate app-ready CSS for `.cutter-shell-v1`.
- Added Foundation regression coverage proving `.ml-app-shell` owns viewport geometry.
- Added Cutter regression coverage proving `.cutter-shell-v1` cannot reappear as a production CSS owner.

Visual ownership result:

- AppShell geometry is now owned by UI Foundation instead of duplicated in Cutter CSS.
- Cutter keeps only host containment and app-specific variables, making shell geometry less likely to drift between pages.
- `apps/cutter-web/src/styles.css` decreased from `592` lines after Batch 5.168 to `546`.
- `packages/ui-foundation/src/layout.css` remained `3028` lines.
- `npm run build:cutter-web` passed with CSS bundle `66.53 kB`, gzip `11.90 kB`, down from `67.38 kB`, gzip `12.00 kB` after Batch 5.168.

Verification:

- `rg -n "\\.cutter-app(?:\\[data-cutter-web-ready\\])? \\.cutter-shell-v1|\\.cutter-app \\.cutter-shell-v1|\\.cutter-app\\[data-cutter-web-ready\\] \\.cutter-shell-v1" apps/cutter-web/src/styles.css` returned no matches.
- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 33 tests, 33 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 127 tests, 127 passed.
- `npm run build:cutter-web` passed: CSS bundle `66.53 kB`, gzip `11.90 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- `git diff --check` passed.

Remaining debt moved forward:

- Cutter content scroll switching and page inset variables remain in app CSS and should be the next Shell audit target.
- `.cutter-workspace`, `.cutter-content`, `.cutter-page`, and `.cutter-page-main` still need final ownership classification.
- Desktop first-run setup layout remains route-owned intentionally until final desktop setup polish.
- Legacy raw select/textarea fallback remains for unmigrated native controls.
- Temporary comparison labs remain pending for deletion after full UI Foundation acceptance.

## Batch 5.168 Progress: Sidebar Brand/Nav Ownership Tokenized

Date: 2026-06-21.

Routes/components in scope:

- Cutter production AppShell.
- Cutter Sidebar brand block.
- Cutter Sidebar navigation items.
- Cutter Sidebar icon sizing and active item state.

Layer classification:

- UI Foundation owns Sidebar component internals:
  - `.ml-sidebar-brand`
  - `.ml-sidebar-brand-mark`
  - `.ml-sidebar-nav`
  - `.ml-sidebar-item`
  - `.ml-sidebar-item.is-active`
  - `.ml-sidebar-icon`
  - `.ml-sidebar-icon svg`
- Cutter Shell owns only app-level shell tokens and viewport geometry:
  - `--ml-sidebar-brand-margin`
  - `--ml-sidebar-brand-mark-background`
  - `--ml-sidebar-nav-margin-top`
  - `.cutter-shell-v1`
  - `.cutter-content`
  - route-agnostic page insets and scroll containment
- Cutter pages own no Sidebar visual CSS.
- Search flow, cut flow, cache behavior, auth behavior, API behavior, desktop runtime, and NAS data behavior were not changed.

Change made:

- Added Sidebar customization variables to UI Foundation:
  - `--ml-sidebar-brand-margin`
  - `--ml-sidebar-brand-mark-background`
  - `--ml-sidebar-nav-margin-top`
- Moved Cutter's brand mark color and sidebar spacing into app-level variables on `.cutter-app[data-cutter-web-ready]`.
- Removed direct Cutter production CSS overrides for:
  - `.ml-sidebar-brand`
  - `.ml-sidebar-brand-mark`
  - `.ml-sidebar-brand strong`
  - `.ml-sidebar-brand small`
  - `.ml-sidebar-nav`
  - `.ml-sidebar-item`
  - `.ml-sidebar-item:hover`
  - `.ml-sidebar-item.is-active`
  - `.ml-sidebar-icon`
  - `.ml-sidebar-icon svg`
- Added regression coverage so Cutter cannot reintroduce app-level `.ml-sidebar-brand/item/icon` visual overrides.

Visual ownership result:

- Sidebar brand, item density, active item color, icon sizing, and navigation rhythm are now owned by UI Foundation.
- Cutter still preserves the accepted production visual through variables rather than component-internal overrides.
- `apps/cutter-web/src/styles.css` decreased from `666` lines after Batch 5.167 to `592`.
- `packages/ui-foundation/src/layout.css` increased from `3027` lines to `3028` to expose the Sidebar variables.
- `npm run build:cutter-web` passed with CSS bundle `67.38 kB`, gzip `12.00 kB`, down from `68.58 kB`, gzip `12.13 kB` after Batch 5.167.

Verification:

- `rg -n "\\.cutter-app\\[data-cutter-web-ready\\] \\.ml-sidebar-(brand|brand-mark|nav|item|icon)|\\.cutter-app \\.ml-sidebar-(brand|item|icon)" apps/cutter-web/src/styles.css` returned no matches.
- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 32 tests, 32 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 127 tests, 127 passed.
- `npm run build:cutter-web` passed: CSS bundle `67.38 kB`, gzip `12.00 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- `git diff --check` passed.

Remaining debt moved forward:

- Cutter Shell still owns viewport/background/page inset/scroll containment and should remain the next audit target.
- Desktop first-run setup layout remains route-owned intentionally until final desktop setup polish.
- Legacy raw select/textarea fallback remains for unmigrated native controls.
- Temporary comparison labs remain pending for deletion after full UI Foundation acceptance.

## Batch 5.167 Progress: Material Search CSS Ownership Gate

Date: 2026-06-21.

Routes/components in scope:

- Material Search split workbench.
- Candidate material list.
- Transcript review panel.
- Video preview and selected-copy inspector.
- Floating cut action.
- Recent cut task queue.

Layer classification:

- UI Foundation owns the reusable visual and layout primitives:
  - `.ml-split-workbench-page`
  - `.ml-split-workbench`
  - `.ml-command-row`
  - `.ml-list-panel`
  - `.ml-pane-scroll`
  - `.ml-media-row`
  - `.ml-transcript-panel`
  - `.ml-transcript-row`
  - `.ml-floating-action-bar`
  - `.ml-pane-shell`
  - `.ml-pane-section`
  - `.ml-media-frame`
  - `.ml-compact-table`
- Material Search owns runtime workflow state only:
  - search query and loading state
  - candidate groups and focused material
  - transcript window, current hit, and selected row ids
  - drag selection and time-click start/end selection state
  - video current time and preview wiring
  - recent cut task data
- Existing `cutter-*` classes in Material Search are allowed only as semantic, behavior, or test hooks.
- `cutter-*` Material Search selectors must not reappear as production visual CSS owners.
- Search flow, cut flow, cache behavior, auth behavior, API behavior, desktop runtime, and NAS data behavior were not changed.

Change made:

- Added a direct regression assertion that Material Search `cutter-*` visual selectors cannot return to production `apps/cutter-web/src/styles.css`.
- Confirmed production Cutter CSS has no Material Search route-owned visual rules for:
  - `.cutter-material-locator`
  - `.cutter-locator*`
  - `.cutter-natural-transcript`
  - `.cutter-transcript*`
  - `.cutter-video-panel`
  - `.cutter-selection-bar`
- Documented Material Search ownership as a workflow page whose behavior remains local to the route while reusable visuals belong to UI Foundation.

Visual ownership result:

- Material Search remains a high-risk workflow page, but its current production visual ownership has been pulled into UI Foundation and Shell primitives.
- Page-level JSX still carries semantic `cutter-*` hooks where needed for behavior and tests, but those hooks no longer own production visual CSS.
- `apps/cutter-web/src/styles.css` remains `666` lines.
- `packages/ui-foundation/src/layout.css` remains `3027` lines.

Verification:

- `rg -n "cutter-material-locator|cutter-locator|cutter-transcript|cutter-selection|cutter-video-panel|cutter-hit|cutter-natural" apps/cutter-web/src/styles.css` returned no matches.
- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 31 tests, 31 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 127 tests, 127 passed.
- `npm run build:cutter-web` passed: CSS bundle `68.58 kB`, gzip `12.13 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- `git diff --check` passed.

Remaining debt moved forward:

- Material Search still needs final visual QA for typography density, pane alignment, transcript readability, selection highlight, floating cut action behavior, and desktop scroll behavior.
- JSX semantic hook cleanup can happen only after final visual QA proves tests and behavior do not need those hooks.
- Legacy raw select/textarea fallback remains for unmigrated native controls.
- Temporary comparison labs remain pending for deletion after full UI Foundation acceptance.

## Batch 5.166 Progress: Dead Media Panel Compatibility Layer Removed

Date: 2026-06-21.

Routes/components in scope:

- Legacy `.ml-media-panel` compatibility selector in Cutter production CSS.
- Source Detail / library / Material Search media surface ownership checks.

Layer classification:

- UI Foundation owns active media display primitives through:
  - `.ml-media-frame`
  - `.ml-media-frame--16x9`
  - `.ml-media-frame--fill`
  - `.ml-media-frame--dark`
  - `.ml-document-media-panel`
  - `.ml-document-media-video`
- Cutter pages own only page composition and media source wiring.
- `.ml-media-panel` is not part of UI Foundation v1 and is not used by current Cutter production markup.
- Search flow, cut flow, cache behavior, auth behavior, API behavior, desktop runtime, and NAS data behavior were not changed.

Change made:

- Removed the dead `.cutter-app .ml-media-panel` production CSS block from `apps/cutter-web/src/styles.css`.
- Updated regression coverage so `.cutter-app .ml-media-panel` cannot return as a route-level compatibility surface.
- Kept existing tests that prove current media surfaces use Foundation-owned media primitives instead.

Visual ownership result:

- Cutter production CSS no longer contains a Foundation-looking class that is not part of the approved v1 component set.
- Active media surfaces remain owned by documented Foundation primitives:
  - Source Detail uses `.ml-document-media-panel` / `.ml-document-media-video`.
  - Material Search video preview uses `.ml-media-frame` / `.ml-media-frame--fill`.
  - Library and project media use `.ml-media-frame` variants.
- `apps/cutter-web/src/styles.css` decreased from `673` lines after Batch 5.165 to `666`.
- `packages/ui-foundation/src/layout.css` remained `3027` lines.
- `npm run build:cutter-web` passed with CSS bundle `68.58 kB`, gzip `12.13 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 31 tests, 31 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 127 tests, 127 passed.
- `npm run build:cutter-web` passed: CSS bundle `68.58 kB`, gzip `12.13 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- `git diff --check` passed.
- Targeted ownership check confirms `.ml-media-panel` remains only in tests that prevent reintroduction and in the Foundation export denylist.

Remaining debt moved forward:

- Legacy raw select/textarea fallback remains for unmigrated native controls.
- Desktop first-run internal setup layout remains route-owned intentionally.
- Material Search remains the last high-risk workflow page and should be migrated as a dedicated batch rather than folded into cleanup.

## Batch 5.165 Progress: Login Panel Surface Rejoined Foundation Card

Date: 2026-06-21.

Routes/components in scope:

- Cutter login/register gate.
- Login panel outer surface.
- Runtime gate form container.

Layer classification:

- UI Foundation `Card` owns the reusable panel surface through `.ml-card`.
- Cutter login gate owns only:
  - viewport centering
  - panel width
  - internal grid gap
  - login/register copy and form composition
- Login/register/auth behavior, pending approval behavior, API behavior, session storage, search flow, cut flow, cache behavior, desktop runtime, and NAS data behavior were not changed.

Change made:

- Updated `CutterLoginGate.tsx` so the login/register panel renders:
  - `cutter-login-panel ml-card`
- Removed login-panel-owned surface styling from `apps/cutter-web/src/styles.css`:
  - border
  - border radius
  - background
  - box shadow
- Removed `.cutter-login-panel` from the legacy media-panel compatibility grouping.
- Added regression coverage so login panel inputs/buttons stay Foundation-owned and login panel surface chrome cannot return unnoticed.

Visual ownership result:

- Login panel now shares the same Foundation card primitive as migrated setup, cache, settings, and workbench panels.
- Login page CSS keeps only page composition: gate centering, panel width, padding, paragraph text, form gap, and helper text.
- `apps/cutter-web/src/styles.css` decreased from `678` lines after Batch 5.164 to `673`.
- `packages/ui-foundation/src/layout.css` remained `3027` lines.
- `npm run build:cutter-web` passed with CSS bundle `68.72 kB`, gzip `12.14 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 31 tests, 31 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 127 tests, 127 passed.
- `npm run build:cutter-web` passed: CSS bundle `68.72 kB`, gzip `12.14 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- `git diff --check` passed.
- Targeted selector review confirms production CSS no longer contains:
  - `.cutter-login-panel, .cutter-app .ml-media-panel`
  - `.cutter-login-panel` with `border`
  - `.cutter-login-panel` with `background`
  - `.cutter-login-panel` with `box-shadow`

Remaining debt moved forward:

- `.cutter-app .ml-media-panel` remained as the last legacy media-panel compatibility surface at the end of this batch and is removed by Batch 5.166.
- Desktop first-run internal setup layout remains route-owned intentionally.
- Legacy raw select/textarea fallback remains for unmigrated native controls.
- Material Search remains the last high-risk workflow page.

## Batch 5.164 Progress: Desktop First-Run Surfaces Rejoined Foundation Cards

Date: 2026-06-21.

Routes/components in scope:

- Desktop first-run setup page.
- Desktop first-run header surface.
- Setup-step cards.
- Doctor/check-list result surface.
- Diagnostics side panel surface.

Layer classification:

- UI Foundation `Card` owns the reusable card surface through `.ml-card`.
- Desktop first-run owns only page composition:
  - first-run setup flow layout
  - setup-step sequence
  - diagnostics content and copy
  - checklist rows and state text
- Login/register/auth behavior, desktop runtime boot behavior, Doctor behavior, API behavior, search flow, cut flow, cache behavior, and NAS data behavior were not changed.

Change made:

- Updated `DesktopFirstRunPage.tsx` so first-run surfaces use Foundation card chrome:
  - `cutter-desktop-first-run-header ml-card`
  - `cutter-desktop-setup-card ml-card`
  - `cutter-desktop-check-list ml-card`
  - `cutter-desktop-check-list ml-card is-empty`
  - `cutter-desktop-diagnostics ml-card`
- Removed the combined private surface rule from `apps/cutter-web/src/styles.css`:
  - `.cutter-desktop-first-run-header`
  - `.cutter-desktop-setup-card`
  - `.cutter-desktop-check-list`
  - `.cutter-desktop-diagnostics`
- Removed Desktop First Run from the legacy dark-panel compatibility override, leaving only the still-unmigrated login panel and media panel exceptions.
- Added regression coverage so the desktop first-run page cannot silently reintroduce private card chrome.

Visual ownership result:

- Desktop First Run no longer owns border, radius, background, and panel surface styling for its setup cards and diagnostics panels.
- Desktop First Run still owns internal setup-page grid, typography rhythm, and checklist row composition.
- `apps/cutter-web/src/styles.css` decreased from `689` lines after Batch 5.163 to `678`.
- `packages/ui-foundation/src/layout.css` remained `3027` lines.
- `npm run build:cutter-web` passed with CSS bundle `68.88 kB`, gzip `12.17 kB`.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 127 tests, 127 passed.
- `npm run build:cutter-web` passed: CSS bundle `68.88 kB`, gzip `12.17 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Selector ownership check passed:
  - no private combined `.cutter-desktop-first-run-header, .cutter-desktop-setup-card, .cutter-desktop-check-list, .cutter-desktop-diagnostics` surface rule remains in production CSS.
  - no legacy `.cutter-desktop-setup-card, .cutter-desktop-diagnostics` dark-panel grouping remains in production CSS.
- Screenshot coverage note:
  - the visual script covers the authenticated Cutter workbench routes;
  - Desktop First Run is a desktop setup gate and is not entered by the fixture web visual route, so specific proof for this batch is render regression plus CSS ownership checks.

Remaining debt moved forward:

- Login panel outer surface was still custom at the end of this batch and is addressed by Batch 5.165.
- Desktop first-run internal layout and checklist row composition remain route-owned intentionally.
- Legacy raw select/textarea fallback remains for unmigrated native controls.
- Material Search remains the last high-risk workflow page.

## Batch 5.162 Progress: Cut List Table Sizing Moved Out Of Route CSS

Date: 2026-06-21.

Routes/components in scope:

- Cut List table column sizing.
- Cut List selected transcript preview truncation.
- UI Foundation table and utility class contract.

Layer classification:

- UI Foundation `Table` owns column width application through `TableColumn.width`.
- UI Foundation owns reusable one-line text truncation through `.ml-truncate-line`.
- Cut List page owns only business column composition:
  - column order
  - column labels
  - row actions
  - submit settings inspector
- Search flow, cut flow, cache behavior, auth behavior, API behavior, desktop runtime, and NAS data behavior were not changed.

Change made:

- Kept Cut List fixed-width intent in `CutListPage.tsx` through existing `TableColumn.width` values for:
  - order: `72`
  - mode: `112`
  - actions: `180`
- Moved selected transcript one-line truncation from route CSS `td:nth-child(4)` to the semantic table column class:
  - `className: "ml-truncate-line"`
- Removed stale Cut List route CSS from `apps/cutter-web/src/styles.css`:
  - `.cutter-cut-list .ml-source-table`
  - `.cutter-cut-list .ml-source-table th:nth-child(...)`
  - `.cutter-cut-list .ml-source-table td`
  - `.cutter-cut-list .ml-table td:nth-child(4)`
  - `.cutter-cut-list .ml-table-wrap`
- Added regression coverage so Cut List cannot silently reintroduce route-owned table sizing or nth-child truncation.

Visual ownership result:

- Cut List no longer sizes table columns by route-level `nth-child` CSS.
- Cut List text truncation now uses the shared Foundation utility already used by other table/problem cells.
- `apps/cutter-web/src/styles.css` decreased from `767` lines after Batch 5.161 to `732`.
- `packages/ui-foundation/src/layout.css` remained `3012` lines.
- `npm run build:cutter-web` passed with CSS bundle `69.54 kB`, gzip `12.24 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 31 tests, 31 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 126 tests, 126 passed.
- `npm run build:cutter-web` passed: CSS bundle `69.54 kB`, gzip `12.24 kB`.
- `git diff --check` passed.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Screenshot coverage note:
  - the visual script covers the main Cutter workbench routes currently exposed in navigation, including `cut-tasks.png`;
  - `CutListPage` is no longer a standalone navigable route because legacy `#/cut-list` maps to `cut-tasks`, so this batch's Cut List-specific proof is component render regression plus CSS ownership checks.

Remaining debt moved forward:

- Cut Tasks table remains the user-facing table route and should continue to be the primary screenshot acceptance surface for table density and sticky-header behavior.
- Continue reviewing page-level one-off CSS that targets Foundation table/card/panel internals instead of semantic page composition.
- Material Search remains the last high-risk page and should not be pulled into this table cleanup batch.

## Batch 5.163 Progress: Login Controls Rejoined Foundation Form And Segmented Primitives

Date: 2026-06-21.

Routes/components in scope:

- Cutter login/register gate.
- Shared segmented control primitive.
- Shared form field/input primitive.
- Legacy global raw input fallback.

Layer classification:

- UI Foundation owns segmented-control visuals:
  - base segmented surface
  - equal-width segmented layout
  - centered segmented buttons
  - active segmented button state
- UI Foundation owns form field and text input visuals:
  - `.ml-form-field`
  - `.ml-field-input`
- Cutter login page owns only login/register composition and copy.
- The legacy raw input fallback may still style unmigrated native controls, but it must not override Foundation form inputs or search inputs.
- Login/register/auth behavior, API behavior, session storage, cache behavior, search flow, cut flow, desktop runtime, and NAS data behavior were not changed.

Change made:

- Updated `CutterLoginGate.tsx` so the login/register switch uses:
  - `ml-segmented-control`
  - `ml-segmented-control--equal`
- Updated login username/password fields to use:
  - `ml-form-field`
  - `ml-field-input`
- Added Foundation segmented rules in `packages/ui-foundation/src/layout.css`:
  - `.ml-segmented-control--equal`
  - `.ml-segmented-control > .ml-button`
  - `.ml-segmented-control > .ml-button.is-active`
  - `.ml-segmented-control > .ml-button[aria-pressed="true"]`
- Removed login-owned visual CSS from `apps/cutter-web/src/styles.css`:
  - `.cutter-login-tabs .ml-button`
  - `.cutter-login-tabs .ml-button.is-active`
  - `.cutter-login-panel input`
  - `.cutter-login-panel input:disabled`
  - `.cutter-login-panel label`
- Narrowed the legacy raw input fallback so it no longer matches:
  - `.ml-field-input`
  - `.ml-search-box-input`

Visual ownership result:

- Login/register segmented controls now share the same visual primitive as settings and library segmented controls.
- Login form inputs now share the same Foundation field/input primitive as project/settings form inputs.
- Global raw input CSS no longer overrides Foundation-managed input controls.
- `apps/cutter-web/src/styles.css` decreased from `732` lines after Batch 5.162 to `689`.
- `packages/ui-foundation/src/layout.css` increased from `3012` lines after Batch 5.162 to `3027` because segmented equal/active behavior moved upward.
- `npm run build:cutter-web` passed with CSS bundle `69.17 kB`, gzip `12.20 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 31 tests, 31 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 126 tests, 126 passed.
- `npm run build:cutter-web` passed: CSS bundle `69.17 kB`, gzip `12.20 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- `git diff --check` passed before this documentation append.
- Screenshot coverage note:
  - the visual script covers the main authenticated Cutter workbench routes;
  - login-gate-specific proof for this batch is render regression plus CSS ownership checks, because the visual fixture mode bypasses login.

Remaining debt moved forward:

- Desktop first-run still carries route-specific setup card and diagnostic CSS; keep it as a separate non-workbench surface batch.
- Legacy raw select/textarea fallback remains for unmigrated native controls; remove or narrow it further only after those controls are migrated.
- Material Search remains a high-risk workflow page and should remain last.

## Batch 5.161 Progress: Material Search Thumbnail Placeholder Moved To Foundation

Date: 2026-06-21.

Routes/components in scope:

- Material Search candidate list.
- Media row thumbnail empty/placeholder state.

Layer classification:

- UI Foundation owns reusable media-row visual primitives:
  - `.ml-media-row`
  - `.ml-media-row-thumb`
  - `.ml-media-row-thumb.is-placeholder`
- Material Search keeps route semantics:
  - candidate result identity
  - selected material key
  - source grouping
  - search and cut behavior
- Search flow, cut flow, cache behavior, auth behavior, API behavior, desktop runtime, and NAS data behavior were not changed.

Change made:

- Added `.ml-media-row-thumb.is-placeholder` to `packages/ui-foundation/src/layout.css`.
- Updated Material Search candidate markup so missing covers render as:
  - `ml-media-row-thumb is-placeholder`
- Removed page-owned `.cutter-cover-placeholder` visual CSS from `apps/cutter-web/src/styles.css`.
- Added regression coverage so `cutter-cover-placeholder` cannot return as a page-owned visual rule.

Visual ownership result:

- Candidate thumbnail sizing, radius, object-fit, and placeholder background now live in Foundation.
- Material Search no longer owns a one-off thumbnail placeholder style.
- `apps/cutter-web/src/styles.css` decreased from `776` lines after Batch 5.160 to `767`.
- `packages/ui-foundation/src/layout.css` increased from `3001` lines after Batch 5.160 to `3012` because the reusable placeholder state moved upward.
- `npm run build:cutter-web` passed with CSS bundle `70.17 kB`, gzip `12.34 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 31 tests, 31 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 125 tests, 125 passed.
- `npm run build:cutter-web` passed: CSS bundle `70.17 kB`, gzip `12.34 kB`.
- `git diff --check` passed.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`

Remaining debt moved forward:

- Continue identifying page-level one-off visual hooks inside production workbench pages.
- Login and desktop first-run still carry route-specific visual CSS; keep them out of the main workbench cleanup unless a later batch intentionally migrates those non-workbench surfaces.
- Cut List still has route-specific source-table column sizing and should be reviewed as a separate page-composition decision.

## Batch 5.160 Progress: Viewport Containment Rule Consolidated

Date: 2026-06-21.

Routes/components in scope:

- Cutter shell viewport root.
- Cutter workspace root.
- Desktop/WebView scroll containment.

Layer classification:

- Shell layer owns viewport containment:
  - `html`
  - `body`
  - `#root`
  - `.cutter-app`
  - `.cutter-workspace`
- UI Foundation owns the app-shell component structure.
- Pages own only their internal scroll regions and business composition.
- Search flow, cut flow, cache behavior, auth behavior, API behavior, desktop runtime, and NAS data behavior were not changed.

Change made:

- Consolidated duplicate `html, body, #root` rules into one viewport root rule.
- Consolidated `.cutter-app` base viewport behavior so the exact `.cutter-app` rule is declared once.
- Kept `.cutter-app, .cutter-workspace` as the shared width/min-size/overflow owner.
- Preserved existing desktop/WebView containment behavior:
  - root width/height `100%`
  - root `min-width: 0`
  - root `min-height: 0`
  - root `margin: 0`
  - root `overflow: hidden`
  - app `height: 100vh`
  - app `padding: 0`
- Added regression coverage so duplicate root/app viewport rules cannot return unnoticed.

Visual ownership result:

- The viewport layer now has one explicit source instead of two stacked shell blocks.
- This reduces the risk of future page-level or route-level fixes accidentally changing desktop scroll ownership.
- `apps/cutter-web/src/styles.css` decreased from `791` lines after Batch 5.159 to `776`.
- `packages/ui-foundation/src/layout.css` stayed at `3001` lines.
- `npm run build:cutter-web` passed with CSS bundle `70.09 kB`, gzip `12.30 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 31 tests, 31 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 125 tests, 125 passed.
- `npm run build:cutter-web` passed: CSS bundle `70.09 kB`, gzip `12.30 kB`.
- `git diff --check` passed.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`

Remaining debt moved forward:

- Continue scanning for route-specific selectors that still carry generic visual decisions.
- The next cleanup should decide whether login/desktop-first-run visual primitives should stay Cutter-specific or move into Foundation primitives later.
- Material Search still needs to remain protected as the highest-risk workflow page while generic visual debt is removed around it.

## Batch 5.159 Progress: Obsolete Theme Layers Removed

Date: 2026-06-21.

Routes/components in scope:

- Global Cutter app appearance contract.
- Global heading reset residue.
- Legacy segmented-control residue.
- Obsolete Material Design 3 transition theme block.

Layer classification:

- Cutter app shell owns the current app-level appearance contract:
  - `body`
  - `.cutter-app`
  - `.cutter-app[data-appearance-mode="light"]`
  - `.cutter-app[data-cutter-web-ready]`
- UI Foundation owns reusable segmented-control visuals through:
  - `.ml-segmented-control`
- Page files own only semantic hooks and business layout.
- The old top-level theme blocks were not allowed to remain because they created duplicate visual ownership before the current Spectrum and design-reference shell layers.
- Search flow, cut flow, cache behavior, auth behavior, API behavior, desktop runtime, and NAS data behavior were not changed.

Change made:

- Removed the obsolete first-generation Cutter appearance block from `apps/cutter-web/src/styles.css`:
  - top-level `body` min-width/background
  - global `h1`, `h2`, `p` margin/font-size rules
  - old `.cutter-app` padding/background rule
  - old `dark`, `light`, and `system` appearance token blocks
  - old `prefers-color-scheme: dark` system fallback
  - old `.ml-segmented` / `.ml-segmented-item` overrides
- Removed the obsolete Material Design 3 transition contract:
  - `/* Google Material Design 3 cutter contract. */`
  - MD3 `body` and `.cutter-app` typography/background rule
  - MD3 light/system token mapping
  - MD3 dark token mapping
  - unused `/* Material compact variant for the search-select-cut workbench. */` marker
- Updated regression coverage so production CSS now rejects:
  - old theme colors `#14161a`, `#b8c0cc`, `#f6f8fb`
  - old global `h1`, `h2`, `p` ownership
  - old `.cutter-app .ml-segmented*` ownership
  - old Material transition comments
- The canonical dark/system appearance layer is now the current MixLab Spectrum block:
  - `--ml-color-canvas: #101318`
  - `--ml-color-text: #f3f6fa`
  - `--ml-color-text-secondary: #a9b4c3`
  - `--ml-color-text-tertiary: #748194`
- The canonical light appearance layer remains:
  - `--ml-color-canvas: #f7f8fa`
  - `--ml-color-text: #151a21`

Visual ownership result:

- Cutter no longer carries three overlapping app-level theme generations in one production stylesheet.
- Global typography is less likely to override Foundation/page typography contracts by accident.
- Segmented controls are protected as a Foundation-owned primitive instead of a route/app override.
- `apps/cutter-web/src/styles.css` decreased from `1013` lines after Batch 5.158 to `791`.
- `packages/ui-foundation/src/layout.css` stayed at `3001` lines because this batch deleted obsolete Cutter layers instead of adding new Foundation API.
- `npm run build:cutter-web` passed with CSS bundle `70.21 kB`, gzip `12.31 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 31 tests, 31 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 124 tests, 124 passed.
- Targeted residual selector check found no old theme colors, old Material markers, old global heading ownership, or old `.cutter-app .ml-segmented*` rules in `apps/cutter-web/src/styles.css`.
- `npm run build:cutter-web` passed: CSS bundle `70.21 kB`, gzip `12.31 kB`.
- `git diff --check` passed.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`

Remaining debt moved forward:

- Continue scanning for duplicated app/shell/global rules after the final shell block.
- The next cleanup should focus on route-specific selectors that still encode generic layout, typography, or button/card/table visuals.
- Do not start a new redesign direction until the remaining Cutter CSS is either Foundation-owned, Shell-owned, or clearly page-composition-only.

## Batch 5.158 Progress: Generic Action And Text Helpers Retired

Date: 2026-06-21.

Routes/components in scope:

- Cut List page header action group.
- Cut List reorder/delete row actions.
- Project Home hero search form.
- Project Home and Local Library short note/notice text.
- Dead `cutter-section-heading` CSS residue.

Layer classification:

- UI Foundation owns reusable generic visual primitives:
  - `ml-control-cluster`
  - `ml-toolbar-list`
  - `ml-workbench-hero-actions`
  - `ml-control-row--hero`
  - `ml-page-description`
  - `ml-section-heading`
  - `ml-section-title`
- Cutter app keeps semantic/business hooks where useful for route meaning and tests:
  - `cutter-button-group`
  - `cutter-row-actions`
  - `cutter-search-form`
  - `cutter-note`
- `cutter-section-heading` is no longer a live production visual owner and must not return to `apps/cutter-web/src/styles.css`.
- Cut list ordering, delete behavior, submit behavior, project home search/new-project behavior, local-library directory notice behavior, search flow, cut flow, cache behavior, auth behavior, API behavior, desktop runtime, and NAS data behavior were not changed.

Change made:

- Updated Local Library action notice so `cutter-note` composes `ml-page-description`.
- Kept Cut List semantic hooks while composing existing Foundation visual owners:
  - `cutter-button-group ml-control-cluster`
  - `cutter-row-actions ml-toolbar-list`
- Removed page-owned CSS for:
  - `.cutter-note`
  - `.cutter-section-heading span`
- Verified that production CSS now has no visual rules for:
  - `.cutter-button-group`
  - `.cutter-row-actions`
  - `.cutter-search-form`
  - `.cutter-section-heading`
  - `.cutter-note`
- Added regression coverage so these generic action/search/text helpers cannot quietly regain page-level visual ownership.

Visual ownership result:

- Generic button clusters, inline row actions, hero search control density, section headings, and short descriptive text are now Foundation/Shell-owned rather than page-owned.
- Semantic Cutter hooks remain only as business/test identifiers.
- `apps/cutter-web/src/styles.css` decreased from `1064` lines after Batch 5.157 to `1013`.
- `packages/ui-foundation/src/layout.css` stayed at `3001` lines because this batch reused existing Foundation primitives instead of adding new ones.
- `npm run build:cutter-web` passed with CSS bundle `76.37 kB`, gzip `13.24 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 31 tests, 31 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 124 tests, 124 passed.
- Targeted residual selector check found no page-owned `.cutter-button-group`, `.cutter-row-actions`, `.cutter-search-form`, `.cutter-section-heading`, or `.cutter-note` visual rules in `apps/cutter-web/src/styles.css`.
- `npm run build:cutter-web` passed: CSS bundle `76.37 kB`, gzip `13.24 kB`.
- `git diff --check` passed.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`

Remaining debt moved forward:

- This batch closes the obvious generic helper residue named in Batch 5.157.
- Next cleanup should scan for remaining page-owned generic surface/selectors in `apps/cutter-web/src/styles.css` before opening any new visual redesign work.
- Material Search remains highest risk and should still be handled as an isolated workflow batch if further visual debt is found there.

## Batch 5.157 Progress: Settings Security And Doctor Row Residuals Moved To Foundation

Date: 2026-06-21.

Routes/components in scope:

- Settings account-security card spacing.
- Settings environment-check / Doctor rows in the right inspector.

Layer classification:

- UI Foundation owns reusable Settings-compatible primitives:
  - `ml-card-section-offset`
  - `ml-data-row--compact-check`
- Settings keeps semantic/business hooks:
  - `cutter-settings-security`
  - `cutter-settings-doctor-row`
- Password-change form behavior, current-user display, doctor check labels, doctor status tone mapping, runtime settings values, and inspector content were not changed.
- No search, cut, cache, auth, API, desktop runtime, or NAS data behavior changed.

Change made:

- Updated Settings markup so `cutter-settings-security` composes `ml-card-section-offset`.
- Updated Doctor row markup so `cutter-settings-doctor-row` composes `ml-data-row--compact-check`.
- Removed page-owned CSS for:
  - `.cutter-settings-security`
  - `.cutter-settings-doctor-row`
- Added regression coverage so these residual Settings visuals must now be owned by Foundation.

Visual ownership result:

- Settings no longer owns account-security card top spacing or compact doctor row grid geometry in page CSS.
- The page still owns Settings business content and doctor status semantics.
- `apps/cutter-web/src/styles.css` decreased from `1074` lines after Batch 5.156 to `1064`.
- `packages/ui-foundation/src/layout.css` increased from `2991` lines after Batch 5.156 to `3001`.
- `npm run build:cutter-web` passed with CSS bundle `77.31 kB`, gzip `13.37 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 31 tests, 31 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 123 tests, 123 passed.
- Targeted residual selector check found no page-owned `.cutter-settings-security` or `.cutter-settings-doctor-row` visual rules in `apps/cutter-web/src/styles.css`.
- `npm run build:cutter-web` passed: CSS bundle `77.31 kB`, gzip `13.37 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`

Remaining debt moved forward:

- Settings has no remaining obvious page-owned security/doctor row visual block in `apps/cutter-web/src/styles.css`.
- Remaining low-risk cleanup should now focus on shared generic control leftovers such as `cutter-button-group`, `cutter-row-actions`, `cutter-search-form`, `cutter-section-heading`, or evaluate whether these are still live before moving into Cut Tasks.
- Desktop first-run remains a separate desktop setup surface and should not be mixed into ordinary page migration.

## Batch 5.156 Progress: Sidebar Footer Status And User Cache Moved To Foundation

Date: 2026-06-21.

Routes/components in scope:

- Cutter shared left Sidebar footer status summary.
- Current project / library / cut task / local service rows.
- Current user entry.
- Sidebar cache-size button and cache clear menu.

Layer classification:

- UI Foundation owns Sidebar footer visual primitives:
  - `ml-sidebar-status`
  - `ml-sidebar-status-card`
  - `ml-sidebar-status-row`
  - `ml-sidebar-status-label`
  - `ml-sidebar-status-value`
  - `ml-sidebar-status-health`
  - `ml-sidebar-user-entry`
  - `ml-sidebar-user-icon`
  - `ml-sidebar-user-name`
  - `ml-sidebar-cache-button`
  - `ml-sidebar-menu`
  - `ml-sidebar-menu-action`
- Cutter app keeps semantic/business hooks:
  - `cutter-sidebar-footer`
  - `cutter-sidebar-engine-card`
  - `cutter-sidebar-user-entry`
  - `cutter-sidebar-user-icon`
  - `cutter-sidebar-cache-button`
  - `cutter-sidebar-cache-menu`
  - `cutter-sidebar-cache-menu-action`
- Current project label, public/local count order, active task count, local service ready state, cache-byte formatting, and local UI cache clearing behavior were not changed.
- No search, cut, cache runtime, auth, API, desktop runtime, or NAS data behavior changed.

Change made:

- Updated `CutterSidebarFooter` markup so the existing semantic hooks compose Foundation-owned `ml-sidebar-*` visual primitives.
- Moved Sidebar footer status card, status rows, ready/failed dot, user icon, user-name truncation, cache button density, and cache menu placement from `apps/cutter-web/src/styles.css` into `packages/ui-foundation/src/layout.css`.
- Removed page-owned CSS for:
  - `.cutter-sidebar-footer`
  - `.cutter-sidebar-engine-card`
  - `.cutter-sidebar-engine-card div/span/strong`
  - `.cutter-sidebar-engine-card .is-ready/.is-failed`
  - `.cutter-sidebar-user-entry`
  - `.cutter-sidebar-user-icon`
  - `.cutter-sidebar-cache-button`
  - `.cutter-sidebar-cache-menu`
  - `.cutter-sidebar-cache-menu-action`
  - route-scoped `data-cutter-web-ready` variants of the same selectors.
- Updated regression coverage so the Cutter app CSS must not reintroduce these page-local Sidebar footer selectors.
- Added Foundation coverage that proves the `ml-sidebar-*` primitives own this footer/status/user/cache visual contract.

Visual ownership result:

- Sidebar footer no longer owns status-card layout, text rhythm, service status dot, user-entry geometry, or cache-menu placement in page CSS.
- The app still owns the business meaning and data source of each footer value.
- `apps/cutter-web/src/styles.css` decreased from `1251` lines after Batch 5.155 to `1074`.
- `packages/ui-foundation/src/layout.css` increased from `2846` lines after Batch 5.155 to `2991`.
- `npm run build:cutter-web` passed with CSS bundle `77.31 kB`, gzip `13.38 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 31 tests, 31 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 123 tests, 123 passed.
- Targeted residual selector check found no page-owned `.cutter-sidebar-footer`, `.cutter-sidebar-engine-card`, `.cutter-sidebar-user-entry`, `.cutter-sidebar-user-icon`, `.cutter-sidebar-cache-button`, `.cutter-sidebar-cache-menu`, or `.cutter-sidebar-cache-menu-action` visual rules in `apps/cutter-web/src/styles.css`.
- `npm run build:cutter-web` passed: CSS bundle `77.31 kB`, gzip `13.38 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`

Remaining debt moved forward:

- Sidebar footer semantic hooks remain in Cutter app markup for test targeting and product meaning, but visual ownership is now Foundation-level.
- Remaining low-risk cleanup should continue with small repeated page controls or form/detail fragments, then proceed to the cut-tasks-specific table/detail migration only after the easy residual hooks are exhausted.
- Material Search remains the highest-risk page and should not be reopened for broad visual simplification until the lower-risk private CSS debt is largely cleared.

## Batch 5.155 Progress: Local Library Control Cluster Moved To Foundation

Date: 2026-06-21.

Routes/components in scope:

- Local Library page title-bar control group.
- Local Library current/all view segmented control.
- Local Library orientation segmented control.

Layer classification:

- UI Foundation owns reusable right-aligned control-cluster rhythm:
  - `ml-control-cluster`
- Local Library keeps semantic/business hooks:
  - `cutter-local-library-controls`
  - `cutter-local-view-toggle`
- View-mode filtering, orientation filtering, local clip grouping, load-more behavior, selected clip detail, and directory actions were not changed.
- No search, cut, cache, auth, API, desktop runtime, or NAS data behavior changed.

Change made:

- Updated Local Library markup so `cutter-local-library-controls` composes `ml-control-cluster`.
- Added Foundation primitive `ml-control-cluster` for wrapped, right-aligned page-header control groups.
- Removed page-owned CSS for:
  - `.cutter-local-library-controls`
  - `.cutter-app[data-cutter-web-ready][data-cutter-route="local-library"] .cutter-local-library-controls`
- Updated regression coverage so this control group alignment must now be owned by Foundation.
- This supersedes the older audit note that kept `.cutter-local-library-controls` as page composition; the semantic hook remains, but its visual rhythm no longer lives in page CSS.

Visual ownership result:

- Local Library no longer owns the title-bar control-group alignment, gap, wrapping, or self-alignment in page CSS.
- The page still owns the meaning and state of the current/all and orientation filters.
- `apps/cutter-web/src/styles.css` decreased from `1264` lines after Batch 5.154 to `1251`.
- `packages/ui-foundation/src/layout.css` increased from `2836` lines after Batch 5.154 to `2846`.
- `npm run build:cutter-web` passed with CSS bundle `78.56 kB`, gzip `13.47 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 30 tests, 30 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 123 tests, 123 passed.
- Targeted residual selector check found no page-owned `.cutter-local-library-controls` visual rules.
- `npm run build:cutter-web` passed: CSS bundle `78.56 kB`, gzip `13.47 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
- `git diff --check` passed after this documentation append.

Remaining debt moved forward:

- Sidebar footer/user/cache menu rules remain Shell-level work and should be handled as a deliberate Shell cleanup batch, not mixed into page migration.
- Desktop first-run setup styles are desktop-specific and should be handled as a separate desktop setup surface.
- Settings security/doctor rows are small page hooks; review only if their pattern repeats outside Settings.
- Cut Tasks and Material Search remain higher-risk surfaces and should not be reopened for broad visual changes until the small residual low-risk hooks are exhausted.

## Batch 5.154 Progress: Cache Management Layout Rows Moved To Foundation

Date: 2026-06-21.

Routes/components in scope:

- Cache Management page metric grid.
- Cache Management test-result and cache-detail panels.
- Cache Management status-check rows and detail rows.
- Cache Management right-side cache-location inspector body stack.

Layer classification:

- UI Foundation owns reusable operational-page visual primitives:
  - `ml-metric-grid`
  - `ml-panel-grid`
  - `ml-panel-card`
  - `ml-data-list--stacked-detail`
  - `ml-data-row--check`
  - `ml-data-row--wide-detail`
  - `ml-inspector--stacked-body`
- Cache Management keeps semantic/business hooks:
  - `cutter-cache-stats`
  - `cutter-cache-panels`
  - `cutter-cache-panel`
  - `cutter-cache-check-list`
  - `cutter-cache-check-row`
  - `cutter-cache-detail-list`
  - `cutter-cache-detail-row`
  - `cutter-cache-inspector`
- Runtime cache values, release status, search index status, source preflight, source-video cache status, localStorage clearing, and inspector content were not changed.
- No search, cut, cache, auth, API, desktop runtime, or NAS data behavior changed.

Change made:

- Updated Cache Management markup to compose existing `cutter-cache-*` semantic hooks with the new Foundation primitives.
- Moved metric grid, panel grid, panel alignment, check-row rhythm, detail-row rhythm, stacked detail values, and inspector body stack rules from `apps/cutter-web/src/styles.css` to `packages/ui-foundation/src/layout.css`.
- Removed page-owned CSS for:
  - `.cutter-cache-stats`
  - `.cutter-cache-panels`
  - `.cutter-cache-panel`
  - `.cutter-cache-check-list`
  - `.cutter-cache-check-row`
  - `.cutter-cache-detail-row`
  - `.cutter-cache-detail-list dt`
  - `.cutter-cache-detail-list dd`
  - `.cutter-cache-inspector .ml-inspector-body`
- Updated regression coverage so these cache-management visuals must now be owned by Foundation.

Visual ownership result:

- Cache Management no longer owns metric/panel/check/detail row visual rhythm in page CSS.
- The page still owns business content, status labels, values, and cache-clearing behavior.
- `apps/cutter-web/src/styles.css` decreased from `1314` lines after Batch 5.153 to `1264`.
- `packages/ui-foundation/src/layout.css` increased from `2791` lines after Batch 5.153 to `2836`.
- Cutter private CSS audit reports `classes 42 unused 0`.
- `npm run build:cutter-web` passed with CSS bundle `78.67 kB`, gzip `13.48 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 29 tests, 29 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- Cutter private CSS audit passed: `classes 42 unused 0`.
- `npm run build:cutter-web` passed: CSS bundle `78.67 kB`, gzip `13.48 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/cache-management.png`
- Residual selector check found no page-owned cache metric/panel/check/detail row visual rules.
- `git diff --check` passed before this documentation append.

Remaining debt moved forward:

- Cache Management still owns the semantic names and content of cache sections; this is page/business composition.
- `cutter-cache-location-section` remains a semantic hook over `ml-detail-section` and has no visual rule in page CSS.
- Remaining low-risk cleanup should review small page-specific layout hooks like local-library controls, settings doctor rows, and desktop first-run surfaces before the cut-task and material-search phases.

## Batch 5.153 Progress: Settings Info Rows Moved To Foundation

Date: 2026-06-21.

Routes/components in scope:

- Settings page information groups.
- Shared label/value row rhythm used by settings status and workspace panels.

Layer classification:

- UI Foundation owns the reusable information group and label/value row visuals:
  - `ml-info-groups`
  - `ml-info-row`
- Settings keeps semantic/business hooks:
  - `cutter-info-groups`
  - `cutter-info-row`
  - `cutter-info-list`
  - `cutter-info-group`
- Runtime settings data, password-change behavior, doctor checks, cache values, source preflight status, and selection controls were not changed.
- No search, cut, cache, auth, API, desktop runtime, or NAS data behavior changed.

Change made:

- Updated Settings info groups to compose `cutter-info-groups` with `ml-info-groups`.
- Updated Settings label/value rows to compose `cutter-info-row` with `ml-info-row`.
- Moved the reusable group gap and row grid/padding/min-height rules from `apps/cutter-web/src/styles.css` to `packages/ui-foundation/src/layout.css`.
- Removed page-owned CSS for:
  - `.cutter-info-groups`
  - `.cutter-info-row`
- Updated regression coverage so settings info-row visuals must now be owned by Foundation.

Visual ownership result:

- Settings page information rows now share the same Foundation visual owner as future dense label/value surfaces.
- `apps/cutter-web/src/styles.css` decreased from `1326` lines after Batch 5.152 to `1314`.
- `packages/ui-foundation/src/layout.css` increased from `2779` lines after Batch 5.152 to `2791`.
- Cutter private CSS audit reports `classes 50 unused 0`.
- `npm run build:cutter-web` passed with CSS bundle `78.71 kB`, gzip `13.49 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 29 tests, 29 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- Cutter private CSS audit passed: `classes 50 unused 0`.
- `npm run build:cutter-web` passed: CSS bundle `78.71 kB`, gzip `13.49 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
- Residual selector check found no page-owned `.cutter-info-groups` or `.cutter-info-row` visual rules.
- `git diff --check` passed before this documentation append.

Remaining debt moved forward:

- Settings page still owns the content composition of security/password, doctor rows, and control groups.
- `cutter-settings-security` and `cutter-settings-doctor-row` should be reviewed only if their pattern repeats outside Settings.
- Continue reducing real rendered low-risk surfaces before touching Material Search.

## Batch 5.152 Progress: Library Grouping And Grid Visuals Moved To Foundation

Date: 2026-06-21.

Routes/components in scope:

- Shared `LibraryGallery`.
- Local Library project grouping list.
- Public Library and Local Library gallery grid rhythm.

Layer classification:

- UI Foundation owns reusable library grouping and gallery grid visuals:
  - `ml-library-group-list`
  - `ml-library-group`
  - `ml-library-group-header`
  - `ml-library-grid`
  - `ml-library-grid--three`
- Cutter pages keep only semantic/business hooks:
  - `cutter-library-group-list`
  - `cutter-library-group`
  - `cutter-library-group-header`
  - `cutter-library-grid`
- Which clips appear, grouping order, orientation filters, pagination, selected source detail, and item metadata remain page/runtime behavior and were not changed.
- No search, cut, cache, auth, API, desktop runtime, or NAS data behavior changed.

Change made:

- Updated `LibraryGallery` so its root grid composes `cutter-library-grid` with `ml-library-grid ml-library-grid--three`.
- Updated Local Library grouped view to compose the existing `cutter-library-group-*` hooks with Foundation `ml-library-group-*` classes.
- Moved the reusable grid and group spacing/header visual rules from `apps/cutter-web/src/styles.css` into `packages/ui-foundation/src/layout.css`.
- Removed page-owned CSS for:
  - `.cutter-library-group-list`
  - `.cutter-library-group`
  - `.cutter-library-group-header`
  - `.cutter-library-group-header span`
  - `.cutter-library-grid`
  - route-specific local/public library `cutter-library-grid` column overrides
- Updated regression coverage so library grouping/grid visuals must now be owned by Foundation.

Visual ownership result:

- Public and local library card grids now use Foundation-owned gallery rhythm.
- Local Library project grouping no longer carries page-local visual spacing and header styling.
- `apps/cutter-web/src/styles.css` decreased from `1364` lines after Batch 5.151 to `1326`.
- `packages/ui-foundation/src/layout.css` increased from `2743` lines after Batch 5.151 to `2779`.
- Cutter private CSS audit reports `classes 52 unused 0`.
- `npm run build:cutter-web` passed with CSS bundle `78.72 kB`, gzip `13.49 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 29 tests, 29 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- Cutter private CSS audit passed: `classes 52 unused 0`.
- `npm run build:cutter-web` passed: CSS bundle `78.72 kB`, gzip `13.49 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`
- Residual selector check found no page-owned `.cutter-library-group-*` or `.cutter-library-grid` visual rules.
- `git diff --check` passed before this documentation append.

Remaining debt moved forward:

- `LibraryGallery` still owns business markup for title, meta, tags, description, action link, thumbnail, and click selection.
- Library detail inspector content and media tile behavior remain stable from earlier batches; do not promote a full `MediaCard` component until the approved UI Foundation v1 scope is intentionally expanded.
- Remaining low-risk cleanup should continue on real rendered surfaces only, with page CSS decreasing rather than adding overrides.

## Batch 5.150 Progress: Dead Grouped Search Page Removed

Date: 2026-06-21.

Routes/components in scope:

- Legacy grouped `SearchPage` component.
- Legacy `#/search` visual screenshot route.
- Mistaken `ml-result-*` Foundation result-card primitives that were only serving the dead grouped Search page.

Layer classification:

- Production routing maps legacy `#/search` and `#search` hashes into the real `material-locator` search-select-cut workbench.
- The grouped `SearchPage` component had no production route/import ownership outside direct tests, so it was dead UI code rather than a Foundation migration candidate.
- `ml-result-*` did not belong in UI Foundation because its only consumer was the dead page.
- The correct layer decision was deletion plus legacy route compatibility coverage, not another visual extraction.
- No material-search, search query parsing, transcript loading, cut creation, cache, auth, API, desktop runtime, or NAS data behavior changed.

Change made:

- Deleted `apps/cutter-web/src/features/search/SearchPage.tsx`.
- Removed the dead `SearchPage` import and direct-render tests from `apps/cutter-web/src/cutter-app.test.ts`.
- Kept the route compatibility tests proving `#/search?...` resolves to `material-locator`.
- Removed the non-production `search.png` route and `route === "search"` assertions from `scripts/visual/check-cutter-web-screenshots.ts`.
- Removed the temporary `ml-result-list`, `ml-result-card`, `ml-result-cover`, `ml-result-body`, `ml-result-header`, `ml-result-meta`, `ml-result-description`, and `ml-context-list` CSS from `packages/ui-foundation/src/layout.css`.
- Removed `ml-result-*` component-test assertions from `packages/ui-foundation/src/components.test.ts`.
- Kept the old `.cutter-search-groups`, `.cutter-search-group`, and `.cutter-context-list` CSS absent because no current production component owns them.

Visual ownership result:

- The only production search surface remains Material Search (`material-locator`).
- UI Foundation no longer exposes result-card primitives for a deleted page.
- `apps/cutter-web/src/styles.css` is `1456` lines in the current tree, and the cutter-only private class audit reports `classes 62 unused 0`.
- `packages/ui-foundation/src/layout.css` is `2645` lines after removing the temporary `ml-result-*` block.
- `npm run build:cutter-web` passed with CSS bundle `78.93 kB`, gzip `13.53 kB`.

Verification:

- Residual search returned only the intentional navigation compatibility owner:
  - `apps/cutter-web/src/app/navigation.ts: route === "search" || route === "material-locator"`
- `rg -n "SearchPage|features/search|cutter-search-groups|cutter-search-group|cutter-context-list|ml-result-|data-page='search'|route === \"search\"|search.png" apps/cutter-web/src packages/ui-foundation/src scripts/visual/check-cutter-web-screenshots.ts` returned no production/test matches except the intentional navigation compatibility line.
- Cutter private CSS audit passed: `classes 62 unused 0`.
- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 29 tests, 29 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `78.93 kB`, gzip `13.53 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
- `git diff --check` passed before this documentation append.

Remaining debt moved forward:

- Do not migrate standalone grouped Search again unless a real production route is intentionally restored.
- Material Search remains the real search workflow and should continue to be migrated last as planned.
- Next cleanup should target a true rendered surface, not a test-only legacy component.

## Batch 5.151 Progress: Source Detail Document Panels Moved To Foundation

Date: 2026-06-21.

Routes/components in scope:

- `source-detail` route.
- Source Detail video preview panel.
- Source Detail full transcript document panel.
- Source Detail selectable transcript segment list.

Layer classification:

- UI Foundation owns the reusable visual rules for document media panels, document transcript panels, full-text blocks, and selectable segment rows.
- Source Detail keeps only business structure and semantic hooks:
  - `cutter-video-panel`
  - `cutter-transcript`
  - `cutter-full-text`
  - `cutter-segment-list`
  - `cutter-segment`
- The media URL, transcript content, selected segment state, highlighted segment state, and add-to-cut behavior remain page/runtime behavior and were not changed.
- No search, cut, cache, auth, API, desktop runtime, or NAS data behavior changed.

Change made:

- Added Foundation-owned document/detail primitives:
  - `ml-document-media-panel`
  - `ml-document-media-video`
  - `ml-document-media-meta`
  - `ml-document-panel`
  - `ml-document-panel-header`
  - `ml-document-panel-meta`
  - `ml-document-full-text`
  - `ml-segment-list`
  - `ml-segment-row`
  - `ml-segment-time`
  - `ml-segment-text`
  - `ml-segment-action`
- Updated `SourceDetailPage` markup to compose these Foundation classes with existing `cutter-*` business hooks.
- Removed Source Detail page-owned CSS for:
  - video sizing and media metadata row
  - transcript panel header and meta text
  - full-text block spacing/color/background
  - segment list grid
  - selectable segment row layout, text rhythm, and selected/highlighted state
- Removed Source Detail from older shared page panel/text selector groups where it no longer belongs.
- Updated regression coverage so Source Detail cannot reintroduce page-owned visual selectors unnoticed.

Visual ownership result:

- `apps/cutter-web/src/styles.css` decreased from `1456` lines after Batch 5.150 to `1364`.
- `packages/ui-foundation/src/layout.css` increased from `2645` lines after Batch 5.150 to `2743`.
- Cutter private CSS audit passed with `classes 56 unused 0`.
- `npm run build:cutter-web` passed with CSS bundle `78.94 kB`, gzip `13.49 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 29 tests, 29 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `78.94 kB`, gzip `13.49 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/source-detail.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
- Residual selector scan found only negative regression-test references for:
  - `.cutter-source-detail .cutter-video-panel`
  - `.cutter-source-detail .cutter-transcript`
  - `.cutter-source-detail .cutter-full-text`
  - `.cutter-segment`
  - `.cutter-segment-list`
- `git diff --check` passed before this documentation append.

Remaining debt moved forward:

- Source Detail now has no page-owned media/document/segment visual CSS; remaining Source Detail concerns are business composition and route content only.
- The next useful cleanup target should be another true rendered low-risk surface with page-owned visual rules, likely library grouping, cache detail rows, or desktop first-run setup panels.
- Material Search remains intentionally last because its transcript and selection workflow is higher-risk.

## Batch 5.149 Progress: Generic Empty State Visuals Moved To Foundation

Date: 2026-06-21.

Routes/components in scope:

- Project Home empty project list and empty project detail states.
- Legacy grouped Search empty result state.
- Global `.cutter-empty-state` visual rules in `apps/cutter-web/src/styles.css`.

Layer classification:

- Empty-state visuals are shared UI primitives, not page-owned styling.
- `packages/ui-foundation/src/layout.css` already owns the reusable `ml-empty-panel` family:
  - `ml-empty-panel`
  - `ml-empty-panel--plain`
  - `ml-empty-panel--subtle`
  - `ml-empty-panel--fill`
- Project Home and grouped Search now keep only route-specific business hooks:
  - `cutter-project-empty-state`
  - `cutter-search-empty-state`
- No search, project, routing, cache, cut, auth, API, or desktop runtime behavior changed.

Change made:

- Replaced Project Home empty states from `.cutter-empty-state` to `cutter-project-empty-state ml-empty-panel`.
- Replaced grouped Search empty state from `.cutter-empty-state` to `cutter-search-empty-state ml-empty-panel`.
- Removed global `.cutter-empty-state` and `.cutter-empty-state span` visual CSS from `apps/cutter-web/src/styles.css`.
- Updated regression coverage so empty-state visuals must remain Foundation-owned.

Visual ownership result:

- `apps/cutter-web/src/styles.css` decreased from `1527` lines after Batch 5.148 to `1506`.
- `packages/ui-foundation/src/layout.css` stayed at `2645` lines.
- `npm run build:cutter-web` output CSS changed from `80.12 kB` after Batch 5.148 to `79.75 kB`, gzip `13.64 kB`.
- The current TS/TSX usage audit for non-Foundation Cutter classes reports `unused 0`.

Verification:

- CSS usage audit passed: `classes 65 unused 0`.
- `rg -n "cutter-empty-state" apps/cutter-web/src/styles.css apps/cutter-web/src/features apps/cutter-web/src/app` returned no matches.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 123 tests, 123 passed.
- `npm run build:cutter-web` passed: CSS bundle `79.75 kB`, gzip `13.64 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator-empty.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
- `git diff --check` passed.

Remaining debt moved forward:

- Empty-state visuals are now Foundation-owned across the migrated low-risk and search-adjacent surfaces checked in this batch.
- Route-specific empty-state class names remain only as semantic/business hooks and have no visual CSS ownership.
- Next batch should continue CSS ownership mapping on true remaining visual islands:
  - source-detail transcript/media panel CSS;
  - old grouped Search result CSS;
  - or desktop first-run CSS if it remains outside the shared shell contract.

## Batch 5.148 Progress: Dead Cutter Layout Residue Removed

Date: 2026-06-21.

Routes/components in scope:

- Global Cutter production stylesheet.
- Legacy layout utility selectors with no current TS/TSX DOM ownership.

Layer classification:

- `.cutter-search-options`, `.cutter-queue-top-action`, and `.cutter-local-toolbar` had no current component usage in `apps/cutter-web/src`.
- These selectors were legacy residue, not Foundation candidates:
  - they did not represent a currently rendered business layout hook;
  - they did not have a reusable visual contract worth migrating;
  - keeping them would make future UI cleanup harder by preserving false ownership.
- No token, Foundation component, Shell geometry, runtime state, search, cut, cache, auth, or API behavior changed.

Change made:

- Removed unused CSS blocks for:
  - `.cutter-search-options`
  - `.cutter-search-options summary`
  - `.cutter-search-options summary::-webkit-details-marker`
  - `.cutter-search-options summary::after`
  - `.cutter-search-options[open] summary::after`
  - `.cutter-search-options > div`
  - `.cutter-queue-top-action`
  - `.cutter-local-toolbar`
- Updated the dead-style regression test so these selectors cannot silently return to `apps/cutter-web/src/styles.css`.

Visual ownership result:

- `apps/cutter-web/src/styles.css` decreased from `1588` lines after Batch 5.147 to `1527`.
- `packages/ui-foundation/src/layout.css` stayed at `2645` lines.
- `npm run build:cutter-web` output CSS changed from `81.18 kB` after Batch 5.147 to `80.12 kB`, gzip `13.69 kB`.
- The current TS/TSX usage audit for non-Foundation Cutter classes reports `unused 0`, so this batch closes the obvious dead-selector residue discovered in the global stylesheet.

Verification:

- CSS usage audit passed: `classes 66 unused 0`.
- `rg -n "cutter-search-options|cutter-queue-top-action|cutter-local-toolbar" apps/cutter-web/src/styles.css` returned no matches.
- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 29 tests, 29 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `80.12 kB`, gzip `13.69 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
- `git diff --check` passed.

Remaining debt moved forward:

- This batch intentionally did not migrate new visual primitives; it removed confirmed dead CSS before the next ownership migration.
- The next highest-value cleanup is not another page-specific tweak. It should continue the owner map through the remaining `apps/cutter-web/src/styles.css` blocks and pick the next true shared surface:
  - generic empty/loading/error state ownership;
  - remaining source-detail/search legacy blocks;
  - or remaining library/cache/task primitives that still use route-local visual selectors.
- The broader goal is still active: similar controls across Cutter pages must continue converging to Foundation or Shell ownership, with old page-private CSS removed.

## Batch 5.147 Progress: Project Dialog And Switcher Visuals Moved To Foundation

Date: 2026-06-21.

Routes/components in scope:

- Project Home create, rename, and delete dialogs.
- Project delete choice list.
- Project rename/create text field.
- Cutter project switcher menu in the app chrome.

Layer classification:

- `packages/ui-foundation/src/layout.css` now owns reusable dialog, modal-backdrop, choice-list, form-field, and compact menu-popover primitives:
  - `ml-modal-backdrop`
  - `ml-dialog`
  - `ml-dialog-header`
  - `ml-dialog-title`
  - `ml-dialog-description`
  - `ml-dialog-footer`
  - `ml-choice-list`
  - `ml-choice-option`
  - `ml-choice-option--danger`
  - `ml-choice-option-body`
  - `ml-menu-popover`
  - `ml-menu-popover-trigger`
  - `ml-menu-popover-content`
  - `ml-menu-popover-action`
- `ProjectHomePage.tsx` keeps project-specific dialog semantics, labels, delete modes, validation, and event handlers.
- `CutterApp.tsx` keeps project-switcher routing and action behavior.
- `apps/cutter-web/src/styles.css` no longer owns the project dialog, project delete choice, project rename field, modal backdrop, or project switcher menu visuals.
- No project create, rename, delete, navigation, search, cache, auth, API, or desktop runtime behavior changed.

Change made:

- Added Foundation primitives for modal backdrops, dialogs, dialog typography, dialog footers, choice lists, danger choice rows, compact details/summary popover menus, and popover action density.
- Updated `ProjectHomePage.tsx` to compose project dialogs from those primitives while preserving project business class names for semantic tests and future feature hooks.
- Updated `CutterApp.tsx` so the project switcher uses the shared menu-popover classes.
- Removed route/global CSS for:
  - `.cutter-project-switcher`
  - `.cutter-project-switcher summary`
  - `.cutter-project-switcher > div`
  - `.cutter-project-switcher .cutter-project-switcher-action`
  - `.cutter-modal-backdrop`
  - `.cutter-project-delete-dialog`
  - `.cutter-project-dialog`
  - `.cutter-project-delete-options`
  - `.cutter-project-rename-field`
  - `.cutter-project-rename-field input`
  - project-dialog footer button width overrides
- Updated regression coverage so these visual rules cannot silently return to page-owned CSS.

Visual ownership result:

- Project dialogs and the project switcher no longer form a separate route-local styling island.
- Project Home retains business composition only; dialog/menu visuals are Foundation-owned.
- `apps/cutter-web/src/styles.css` decreased from `1774` lines after Batch 5.146 to `1588`.
- `packages/ui-foundation/src/layout.css` increased from `2503` lines to `2645`.
- `npm run build:cutter-web` output CSS changed from `82.19 kB` after Batch 5.146 to `81.18 kB`, gzip `13.83 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 29 tests, 29 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `81.18 kB`, gzip `13.83 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
- `git diff --check` passed.
- `rg -n "cutter-project-switcher|cutter-project-delete-dialog|cutter-project-dialog|cutter-project-delete-options|cutter-project-rename-field|cutter-modal-backdrop" apps/cutter-web/src/styles.css` returned no matches.

Remaining debt moved forward:

- Project Home still has business class names for dialogs and project-switcher actions. Those are acceptable as behavior hooks as long as they do not own visual CSS.
- Empty-state placement and any remaining generic `.cutter-empty-state` ownership should be reviewed in a separate primitive cleanup batch.
- The next cleanup should audit the remaining top-level `apps/cutter-web/src/styles.css` blocks by owner: app theme/reset, runtime shell, legacy compatibility, and true page composition. The goal is to keep reducing broad global selectors without breaking existing low-risk pages.
- The broader goal is still active: similar controls across Cutter pages must continue converging to Foundation or Shell ownership, with old page-private CSS removed.

## Batch 5.146 Progress: Project Home Card And Detail Internals Moved To Foundation

Date: 2026-06-21.

Routes/components in scope:

- `project-home`
- Recent project media cards.
- Project card fill action, cover fill, and overlay action row.
- Project detail panel, cover frame, metadata rows, and sticky action stack.

Layer classification:

- `packages/ui-foundation/src/layout.css` now owns reusable media-card and detail-panel internals:
  - `ml-media-card--fixed`
  - `ml-media-card-fill-action`
  - `ml-media-card-cover-fill`
  - `ml-media-card-action-row`
  - `ml-detail-panel`
  - `ml-detail-cover`
  - `ml-data-list--detail`
  - `ml-data-row--detail`
  - `ml-action-stack--detail`
- `ProjectHomePage.tsx` keeps the project-specific business class names, project selection, project actions, and project metadata content.
- `apps/cutter-web/src/styles.css` no longer owns Project Home card/detail visual internals.
- No project data, search navigation, create/rename/delete project behavior, cache, auth, API, or desktop runtime behavior changed.

Change made:

- Added fixed media-card, fill-action, fill-cover, overlay-action-row, detail-panel, detail-cover, detail-data-list, detail-data-row, and detail-action-stack variants to `packages/ui-foundation/src/layout.css`.
- Updated `ProjectHomePage.tsx` so recent project cards and project detail internals use the new Foundation classes while retaining business-specific class names for tests and route semantics.
- Removed route-local CSS for:
  - `.cutter-project-card`
  - `.cutter-project-card-main`
  - `.cutter-project-cover`
  - `.cutter-project-card-actions`
  - `.cutter-project-detail`
  - `.cutter-project-detail-cover`
  - `.cutter-project-detail-list`
  - `.cutter-project-detail-row`
  - `.cutter-project-detail-controls`
- Added regression coverage so those card/detail internals cannot silently return to page-owned CSS.

Visual ownership result:

- Project Home no longer owns media-card visual dimensions or detail-panel internal rhythm through route CSS.
- The page now composes shared Foundation primitives instead of keeping a private card/detail styling island.
- `apps/cutter-web/src/styles.css` decreased from `1863` lines after Batch 5.145 to `1774`.
- `packages/ui-foundation/src/layout.css` increased from `2415` lines to `2503`.
- `npm run build:cutter-web` output CSS changed from `82.20 kB` after Batch 5.145 to `82.19 kB`, gzip `13.93 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 29 tests, 29 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `82.19 kB`, gzip `13.93 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
- `git diff --check` passed after this documentation append.
- `rg -n "cutter-project-(card|card-main|cover|card-actions|detail|detail-cover|detail-list|detail-row|detail-controls)" apps/cutter-web/src/styles.css packages/ui-foundation/src/layout.css apps/cutter-web/src/features/project-home/ProjectHomePage.tsx` confirmed Project Home card/detail business class names now remain only in JSX, not in production route CSS.

Remaining debt moved forward:

- Project Home still has route-specific project dialog classes and project action class names, but their button visuals are already Foundation-owned.
- Empty-state placement in Project Home should be reviewed with shared empty/loading primitives rather than through card/detail internals.
- The next UI Foundation cleanup should either close remaining Project Home dialog/form residue or move to the next low-risk family with the same rule: Foundation owns visual primitives, pages own business composition.
- The broader goal is still active: similar controls across Cutter pages must continue converging to Foundation or Shell ownership, with old page-private CSS removed.

## Batch 5.145 Progress: Project Home Composition Skeleton Moved To Foundation

Date: 2026-06-21.

Routes/components in scope:

- `project-home`
- Project Home hero/search entry composition.
- Project Home board/list/detail panel skeleton.
- Project Home fixed recent-project grid.

Layer classification:

- `packages/ui-foundation/src/layout.css` now owns reusable workbench page-composition skeletons:
  - `ml-workbench-hero`
  - `ml-workbench-hero-copy`
  - `ml-workbench-hero-actions`
  - `ml-workbench-board`
  - `ml-workbench-panel`
  - `ml-workbench-panel--list`
  - `ml-fixed-media-grid`
- `ProjectHomePage.tsx` keeps project-specific business class names and project/card/detail rendering behavior.
- `apps/cutter-web/src/styles.css` still owns Project Home business-specific dimensions for project cards and the detail inspector internals because those are not yet proven reusable across pages.
- No project data, search navigation, create/rename/delete project behavior, cache, auth, API, or desktop runtime behavior changed.

Change made:

- Added shared workbench hero, board, transparent panel, list-panel, and fixed-media-grid primitives to `packages/ui-foundation/src/layout.css`.
- Added 1180px and 1320px responsive behavior for the new Foundation workbench composition primitives.
- Updated `ProjectHomePage.tsx` so the hero, search action row, board, list panel, grid, and detail panel use Foundation-owned classes.
- Removed route-local CSS for:
  - `.cutter-project-hero`
  - `.cutter-project-hero > div:first-child`
  - `.cutter-project-search-form`
  - `.cutter-project-search-box`
  - `.cutter-project-board`
  - shared `.cutter-project-list-panel` / `.cutter-project-detail` surface chrome
  - `.cutter-project-list-panel`
  - `.cutter-project-grid`
  - Project Home hero/board responsive overrides
- Added regression coverage so those route-local skeleton rules cannot return silently.

Visual ownership result:

- Project Home page skeleton is no longer a route-local CSS island.
- The remaining Project Home route CSS is narrower: project card sizing/positioning and project detail internals only.
- `apps/cutter-web/src/styles.css` decreased from `1958` lines after Batch 5.144 to `1863`.
- `packages/ui-foundation/src/layout.css` increased from `2322` lines to `2415`.
- `npm run build:cutter-web` output CSS changed from `82.65 kB` after Batch 5.144 to `82.20 kB`, gzip `13.85 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 29 tests, 29 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `82.20 kB`, gzip `13.85 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
- `git diff --check` passed before this documentation append.

Remaining debt moved forward:

- Project Home card internals are still route-owned: `.cutter-project-card`, `.cutter-project-card-main`, `.cutter-project-cover`, and `.cutter-project-card-actions`.
- Project Home detail internals are still route-owned: detail grid rows, detail cover dimensions, data-list width, and action-stack width.
- The next UI Foundation polish batch should decide whether those card/detail internals are reusable `MediaCard`/`InspectorPanel` variants or genuinely Project Home business layout.
- The broader goal is still active: all similar controls across Cutter pages must eventually have Foundation or Shell ownership, with old page-private CSS removed.

## Batch 5.144 Progress: Project Home Root Geometry Moved To Foundation

Date: 2026-06-21.

Routes/components in scope:

- `project-home`
- Project Home root page container.
- Project Home main content container.
- Legacy bare `.cutter-page` and `.cutter-page-main` base geometry rules.

Layer classification:

- `packages/ui-foundation/src/layout.css` owns the Project Home root workbench contract via `ml-workbench-page--project-home`.
- `packages/ui-foundation/src/layout.css` owns the Project Home main row contract via `ml-workbench-main--project-home`.
- `ProjectHomePage.tsx` keeps the project-specific hero, search entry, recent project board, project cards, and details composition.
- `apps/cutter-web/src/styles.css` should not own bare `.cutter-page` or `.cutter-page-main` global geometry after every primary page is attached to a Foundation page/main primitive or split-workbench primitive.
- No project data, search navigation, create/rename/delete project behavior, cache, auth, API, or desktop runtime behavior changed.

Change made:

- Added `ml-workbench-page--project-home` and `ml-workbench-main--project-home` to `packages/ui-foundation/src/layout.css`.
- Updated `ProjectHomePage.tsx` so its root and main containers use the Foundation workbench classes.
- Deleted the old bare `.cutter-page` / `.cutter-page-main` base geometry rules from `apps/cutter-web/src/styles.css`.
- Deleted the route-local Project Home root/page-main geometry block because the same responsibility now lives in Foundation.
- Added regression coverage for Project Home Foundation classes and for the absence of bare `.cutter-page` / `.cutter-page-main` global rules.

Visual ownership result:

- Project Home now shares the same root page/main ownership model as the other migrated Cutter pages.
- Project-specific CSS remains only for the hero, board, project-card layout, detail layout, and responsive page composition.
- `apps/cutter-web/src/styles.css` decreased from `1998` lines after Batch 5.143 to `1958`.
- `packages/ui-foundation/src/layout.css` increased from `2312` lines to `2322`.
- `npm run build:cutter-web` output CSS changed from `83.30 kB` after Batch 5.143 to `82.65 kB`, gzip `13.75 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 29 tests, 29 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `82.65 kB`, gzip `13.75 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
- `git diff --check` passed after this documentation append.

Remaining debt moved forward:

- Project Home still has route-specific hero, project-board, card sizing, detail cover/list, and action placement rules. These are now page composition rules rather than shell geometry, but the next polish batch can decide which of them should become reusable Foundation primitives.
- The remaining route-scoped `.cutter-page` padding/containment rules are shell-level ready-state containment and should be audited separately from page composition.
- Dialog and project switcher styles still use route/page-specific names and should be reviewed only when modal/form primitives are in scope.

## Batch 5.143 Progress: Standard Workbench Header And Fallback Cleanup

Date: 2026-06-21.

Routes/components in scope:

- Standard workbench page header composition.
- `settings`, `cache-management`, `local-library`, `public-library`, `source-detail`, `cut-tasks`, and compatibility-rendered `search` / `cut-list` page components.
- Legacy ready-state fallback rules for non-Foundation `.cutter-page` and `.cutter-page-main`.

Layer classification:

- `packages/ui-foundation/src/layout.css` owns standard workbench header layout via `ml-workbench-header`.
- `packages/ui-foundation/src/layout.css` owns the title block rhythm inside standard workbench headers.
- `apps/cutter-web/src/styles.css` should not define bare `.cutter-page-header` or `.cutter-page-header > div:first-child` visual rules after pages opt into `ml-workbench-header`.
- `SearchPage.tsx`, `CutListPage.tsx`, and `SourceDetailPage.tsx` now use the same `ml-workbench-page`, `ml-workbench-main`, `ml-workbench-header`, and `ml-workbench-inspector` contracts as the low-risk workbench pages.
- No search, cut-list, source-detail data behavior, search hash compatibility, cut task state, cache, auth, API, or desktop runtime behavior changed.

Change made:

- Moved the standard workbench header layout to `packages/ui-foundation/src/layout.css`: flex alignment, spacing, title-block grid, and narrow-width column behavior.
- Deleted repeated global `.cutter-page-header` and `.cutter-page-header > div:first-child` rules from `apps/cutter-web/src/styles.css`.
- Deleted the legacy ready-state fallback rules:
  - `.cutter-app[data-cutter-web-ready] .cutter-page:not(.cutter-material-locator):not(.ml-workbench-page)`
  - `.cutter-app[data-cutter-web-ready] .cutter-page-main:not(.ml-workbench-main)`
- Added regression coverage so cutter production CSS cannot silently reintroduce those global header/fallback selectors.

Visual ownership result:

- Standard workbench header geometry is owned by UI Foundation, not page/global app CSS.
- `apps/cutter-web/src/styles.css` decreased from `2051` lines after Batch 5.142 to `1998`.
- `packages/ui-foundation/src/layout.css` increased from `2298` lines to `2312` because the shared header behavior moved there.
- `npm run build:cutter-web` output CSS changed from `83.87 kB` after Batch 5.142 to `83.30 kB`, gzip `13.79 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 29 tests, 29 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `83.30 kB`, gzip `13.79 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/source-detail.png`
- `git diff --check` passed after this documentation append.

Verification limitation:

- The product router maps legacy `#/search` and `#/cut-list` hashes into the primary `material-locator` and `cut-tasks` routes. Their standalone component migration is covered by direct render tests, while primary route screenshots are covered by `material-locator.png` and `cut-tasks.png`.

Remaining debt moved forward:

- Project Home still has product-specific page composition CSS and should be handled as its own page-composition cleanup batch if the user wants its card sizing, empty state, and hero/search spacing moved further into Foundation.
- Source Detail still has route-scoped media/transcript panel styles; the shell/header geometry is now Foundation-owned, but transcript/video detail primitives can be audited in a follow-up batch.
- The remaining generic `.cutter-page` and `.cutter-page-main` base rules should be removed only after Project Home no longer depends on legacy class geometry.

## Batch 5.142 Progress: Material Search Transcript Action Residue Removed

Date: 2026-06-21.

Routes/components in scope:

- `material-locator`
- Transcript header hit navigation action group.
- Shared transcript panel/action ownership.

Layer classification:

- `packages/ui-foundation/src/layout.css` owns transcript action layout via `ml-transcript-actions`.
- `MaterialLocatorPage.tsx` keeps the hit navigation controls and search workflow behavior only.
- The old `.cutter-transcript-actions` rule in `apps/cutter-web/src/styles.css` was a leftover visual owner that duplicated the Foundation action layout.
- No search, hit navigation, transcript selection, time-click selection, floating cut action, video preview, queue, cache, auth, API, or desktop runtime behavior changed.

Change made:

- Deleted the old `.cutter-transcript-actions` CSS rule from `apps/cutter-web/src/styles.css`.
- Added regression coverage so the route cannot silently reintroduce a page-owned transcript action layout after `ml-transcript-actions` is already present.

Visual ownership result:

- Material Search transcript actions are now owned only by the Foundation transcript action primitive.
- `apps/cutter-web/src/styles.css` decreased from `2059` lines after Batch 5.141 to `2051`.
- `packages/ui-foundation/src/layout.css` remained `2298` lines.
- `npm run build:cutter-web` output CSS changed from `83.99 kB` after Batch 5.141 to `83.87 kB`, gzip `13.86 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 29 tests, 29 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `83.87 kB`, gzip `13.86 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator-empty.png`
- `git diff --check` passed before this documentation append.

Remaining debt moved forward:

- The current CSS audit found no remaining `material-locator`/`cutter-locator` route-owned visual selectors in `apps/cutter-web/src/styles.css`; remaining Material Search work should be a final acceptance audit rather than broad CSS migration.
- Source Detail still has route-scoped transcript/video panel styles and should not be mixed into Material Search cleanup without a separate source-detail batch.
- Project Home remains visually product-specific and has its own page composition rules; it should not block the Material Search completion audit unless shared shell geometry regresses.

## Batch 5.141 Progress: Cut Tasks Workflow Composition Moved To Foundation

Date: 2026-06-21.

Routes/components in scope:

- `cut-tasks`
- Cut task filter toolbar.
- Cut task pipeline summary card.
- Cut task table one-line text/action cells.
- Cut task detail inspector data rows.

Layer classification:

- `packages/ui-foundation/src/layout.css` owns task-flow workbench rows via `ml-workbench-main--task-flow`.
- `packages/ui-foundation/src/layout.css` owns reusable toolbar, summary, truncation, table action, inline empty, data-list grid, detail-pair row, and detail-panel stack primitives.
- `CutQueuePage.tsx` keeps task state rendering, table columns, selected job details, and handler wiring only.
- `apps/cutter-web/src/styles.css` should not own cut-task card body, table text, action status, detail-row, button-icon, or status-color visuals.
- No search, transcript selection, cut creation, queue refresh, cache runtime, auth, API, or desktop sidecar behavior changed.

Change made:

- Added `ml-workbench-main--task-flow`, `ml-toolbar-card-body`, `ml-toolbar-list`, `ml-toolbar-action`, `ml-summary-card-body`, `ml-truncate-line`, `ml-table-action-cell`, `ml-table-primary-text`, `ml-table-muted-text`, `ml-empty-inline`, `ml-data-list--grid`, `ml-data-row--detail-pair`, `ml-detail-panel-stack`, and `ml-detail-status` to `packages/ui-foundation/src/layout.css`.
- Migrated `CutQueuePage` to the shared task-flow, toolbar, summary, table text/action, and detail inspector primitives.
- Removed route-owned cut-task page geometry, filter card body, pipeline body, table text/action, empty state, and detail inspector row styles from `apps/cutter-web/src/styles.css`.
- Updated regression coverage so cut-task visual ownership is tested in Foundation and so remaining cut-task route selectors cannot reintroduce hard-coded color values.

Visual ownership result:

- Cut tasks now uses the same workbench, card, table, status, detail, and button hierarchy as the rest of the migrated Cutter pages.
- `apps/cutter-web/src/styles.css` decreased from `2168` lines after Batch 5.140 to `2059`.
- `packages/ui-foundation/src/layout.css` increased from `2207` lines to `2298` because the reusable task-flow and detail/table primitives moved there.
- `npm run build:cutter-web` output CSS changed from `85.49 kB` after Batch 5.140 to `83.99 kB`, gzip `13.88 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 29 tests, 29 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `83.99 kB`, gzip `13.88 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
- `git diff --check` passed before this documentation append.

Remaining debt moved forward:

- Cut tasks still has business-specific table columns and selected-task semantics in the page component, which is correct page responsibility.
- Remaining route-level cut-task CSS should be limited to page-specific data semantics and not card/table/button/badge geometry.
- Material Search remains the final high-risk migration batch because it has independent pane scrolling, transcript selection, floating cut action, video preview, and recent-task composition.

## Batch 5.140 Progress: Low-Risk Workbench Page Composition Moved To Foundation

Date: 2026-06-21.

Routes/components in scope:

- `local-library`
- `public-library`
- `cache-management`
- `settings`
- Shared ordinary workbench page/header/main/inspector/scroll primitives.

Layer classification:

- `packages/ui-foundation/src/layout.css` owns ordinary workbench page composition via `ml-workbench-page`, `ml-workbench-main`, `ml-workbench-header`, `ml-workbench-inspector`, and `ml-scroll-region`.
- Cutter app CSS keeps only the shell inset and the non-migrated fallback page-main/page grid rules.
- Page files keep business-specific DOM and data rendering only.
- No search, transcript selection, cut creation, cache runtime, auth, API, or desktop sidecar behavior changed.

Change made:

- Added standard workbench composition primitives to `packages/ui-foundation/src/layout.css`.
- Migrated `LocalLibraryPage`, `PublicLibraryPage`, `CacheManagementPage`, and `SettingsPage` to the shared `ml-workbench-*` classes.
- Scoped the old ready-state `.cutter-page` and `.cutter-page-main` fallback rules so they no longer override migrated workbench pages.
- Removed route-owned page-main/header/scroll/inspector geometry rules for the low-risk ordinary pages from `apps/cutter-web/src/styles.css`.
- Updated regression coverage so ordinary workbench layout ownership is tested in Foundation rather than protected as route-local cutter CSS.

Visual ownership result:

- Ordinary low-risk pages now share one workbench composition contract.
- `apps/cutter-web/src/styles.css` decreased from `2298` lines after Batch 5.139 to `2168`.
- `packages/ui-foundation/src/layout.css` increased from `2112` lines to `2207` because the reusable ordinary-workbench primitive moved there.
- `npm run build:cutter-web` output CSS changed from `87.73 kB` after Batch 5.139 to `85.49 kB`, gzip `13.98 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 28 tests, 28 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `85.49 kB`, gzip `13.98 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cache-management.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
- `git diff --check` passed before this documentation append.

Remaining debt moved forward:

- Low-risk ordinary pages still retain business-specific content CSS for cards, lists, cache rows, and settings form groups; those should be reviewed as smaller component/content batches, not as shell geometry.
- Project home still has page-specific composition and should be reviewed separately from low-risk pages because its project card board and detail inspector have product-specific layout behavior.
- Cut tasks remains the next major migration batch because it has table density, sticky header, semantic status, and detail inspector requirements.
- Material Search remains last because it has independent pane scrolling, transcript selection, floating cut action, video preview, and recent-task composition.

## Current Evidence

Measured from the current worktree on 2026-06-19:

| Item | Current size |
| --- | ---: |
| `apps/cutter-web/src/styles.css` | 6,470 lines |
| `apps/cutter-web/src/app/CutterApp.tsx` | 3,578 lines |
| `apps/cutter-web/src/features/material-locator/MaterialLocatorPage.tsx` | 1,587 lines |
| `packages/ui-foundation/src/layout.css` | 579 lines |
| `packages/ui-foundation/src/tokens.css` | 177 lines |
| `packages/ui-foundation/src/components.tsx` | 664 lines |

Selector/declaration pressure inside `apps/cutter-web/src/styles.css`:

| Signal | Count |
| --- | ---: |
| Route/page related selector hits | 449 |
| `font-size` declarations | 160 |
| `padding` declarations | 194 |
| `border-radius` declarations | 138 |
| `box-shadow` declarations | 66 |
| Button-related rule hits | 57 |
| Card/panel/table/badge-related rule hits | 251 |

This is enough to explain the observed UI drift: multiple layers define the same visual concepts, and later route-specific overrides can silently win over shared component rules.

## Root Cause

The current Cutter UI has too many visual owners:

1. `packages/ui-foundation` owns part of the intended design system.
2. `apps/cutter-web/src/styles.css` still owns large portions of shell, page, card, table, button, badge, search, and inspector styling.
3. Individual route blocks such as `project-home`, `material-locator`, `cut-tasks`, `local-library`, `public-library`, `cache-management`, and `settings` override the same primitives differently.
4. Old shell experiments remain in the CSS file, including app-frame, workbench, sidebar, and content overrides from several migration moments.
5. Some page-level rules are layout rules, but others are actually component rules disguised as page rules.

The failure mode is predictable: fixing one page changes local symptoms while the shared system stays inconsistent.

## Visual Ownership Contract

Every UI rule must belong to exactly one of these layers.

### Token Layer

Owner: `packages/ui-foundation/src/tokens.css`

Owns:

- Color
- Type scale
- Spacing scale
- Radius scale
- Border color hierarchy
- Shadow hierarchy
- Status colors
- Focus ring values

Must not own:

- Page-specific grid layouts
- Business-specific widths
- Route-specific exceptions

### Component Layer

Owner: `packages/ui-foundation/src/components.tsx` and `packages/ui-foundation/src/layout.css`

Owns:

- `AppShell`
- `Sidebar`
- `Button`
- `SearchBox`
- `Card`
- `Table`
- `Badge`
- `InspectorPanel`

Target additions after v1 stabilizes:

- `EmptyState`
- `LoadingState`
- `MediaCard`
- `StatusBadge` alias if needed

Must not own:

- Material-search transcript selection business behavior
- Public/local library data fetching
- Cut queue state transitions

### Cutter Shell Layer

Owner: a small Cutter shell section in `apps/cutter-web/src/styles.css`, later preferably extracted.

Owns:

- Cutter app background
- Sidebar width and persistent geometry
- Workbench geometry
- Content scroll ownership
- Desktop WebView containment
- Page route shell constraints only when truly structural

Must not own:

- Button colors
- Card border/radius/shadow
- Table row styling
- Page-specific typography

### Page Composition Layer

Owner: page files under `apps/cutter-web/src/features/*`.

Owns:

- Business layout areas, such as candidate list / transcript / preview / inspector columns
- Data ordering
- Conditional rendering
- Page-specific empty/error/loading copy
- Which shared component is used where

Must not own:

- Private button visual styles
- Private table visual styles
- Private badge/status colors
- Private card shadows or radii
- Private sidebar variants

### Runtime State Layer

Owner: API/state modules under `apps/cutter-web/src/state`, `packages/cutter-api`, and `packages/cutter-local`.

Owns:

- Search, cut, cache, auth, runtime status, project data

Must not be changed during UI cleanup unless it blocks UI verification.

## Keep

Keep these as stable or near-stable foundations:

- `packages/ui-foundation/src/tokens.css`
- `packages/ui-foundation/src/layout.css`
- `packages/ui-foundation/src/components.tsx`
- `apps/cutter-web/src/features/*` business rendering and data wiring
- `apps/cutter-web/src/state/*` runtime logic
- Current route list and workflow structure
- Material search drag selection and time-click selection behavior
- Existing auth/search/cut/cache API flows

## Migrate

Migrate these from page-local CSS to shared UI Foundation or shell contracts:

| Current concept | Target owner | Notes |
| --- | --- | --- |
| `.cutter-primary-button`, `.cutter-secondary-button`, `.cutter-danger-button` | `Button` | Pages should use shared button variants. |
| Page search controls and `.cutter-search-box` variants | `SearchBox` | Only width/grid belongs to page composition. |
| Status pills/tags | `Badge` | One status color map for pending/running/done/failed/cancelled. |
| Table wrappers/headers/rows | `Table` | Cut tasks and cache tables should share density and sticky-header behavior. |
| Repeated white panels/cards | `Card` / `InspectorPanel` | Panels should not invent shadows/radii locally. |
| Sidebar footer cards/user entry | `Sidebar` or Cutter shell | Geometry and visual treatment must be shared across all routes. |
| Library media cards | Future `MediaCard` or shared page pattern | Public/local library should remain visually identical. |
| Empty/loading/error blocks | Future `EmptyState`/`LoadingState` | Page copy can differ; visual skeleton should not. |

## Delete

Delete only after the matching migrated component/page is verified:

- Old app-frame rules targeting `.ml-window` and `.ml-window-chrome` when no current DOM uses them.
- Route-specific sidebar overrides after the shared sidebar contract is verified.
- Route-specific button color/height/radius rules after shared `Button` migration.
- Route-specific card/panel shadows and radii after shared `Card`/`InspectorPanel` migration.
- Duplicate workbench/content padding and scroll rules after Shell migration is verified.
- Temporary comparison app code after production UI Foundation is stable and accepted.

Deletion rule: no CSS deletion is accepted unless the changed route is screenshot-verified and build-verified in the same batch.

## Needs Confirmation

These are product/design decisions that should not be guessed during cleanup:

- Whether the Cutter content area should keep a small internal padding on all normal pages, or be fully edge-to-edge with only page sections adding spacing.
- Whether project-home cards should have a fixed pixel size across all viewport sizes or a token-based responsive size.
- Whether material search should visually match normal pages or intentionally use a denser tool-workbench layout.
- Whether desktop Cutter should share exactly the same Shell geometry as web Cutter, or use a slightly more compact density for smaller WebView windows.

Until confirmed, preserve existing business layout behavior and only remove accidental outer-frame or duplicated component styling.

## Batch Plan

### Batch 1: Audit And Shell Contract

Deliverables:

- This audit document.
- A single Cutter shell contract for:
  - App background
  - Sidebar width and active state
  - Workbench geometry
  - Content scroll ownership
  - No artificial outer frame
- Route screenshots:
  - `/project-home`
  - `/settings`
  - `/cache-management`
  - `/local-library`
  - `/public-library`
  - `/cut-tasks`
  - `/material-locator`

Verification:

- `npm run build:cutter-web`
- `git diff --check`
- Local screenshots under `docs/acceptance/artifacts/ui-foundation-css-cleanup/`

### Batch 2: Low-Risk Pages

Routes:

- Settings
- Cache management
- Local library
- Public library

Cleanup targets:

- Buttons
- Search controls
- Card/panel/inspector treatment
- Table/list density
- Empty/loading/error state visuals

Do not touch:

- Data loading
- Cache operations
- Source library API calls
- Directory actions

### Batch 3: Cut Tasks

Route:

- Cut tasks

Cleanup targets:

- Table component usage
- Sticky header
- One-line selected transcript cell
- Status badge semantics
- Problem/action mapping
- Inspector panel hierarchy

Do not touch:

- Queue creation
- Retry behavior
- Open-directory behavior
- Cut state transitions

### Batch 4: Material Search

Route:

- Material locator

Cleanup targets:

- Search bar density and alignment
- Candidate result row visual grammar
- Transcript row typography and selection highlight
- Floating cut action visual and dismissal rules
- Video preview and side panel alignment
- Recent tasks state colors
- Internal pane scroll only

Do not touch:

- Search backend
- Transcript matching
- Drag selection logic
- Time-click selection logic
- Cut submission logic

### Batch 5: CSS Deletion And Lab Cleanup

Deliverables:

- Remove dead `.ml-window`/old shell rules if unused.
- Remove migrated page-local visual rules.
- Remove temporary comparison labs only after current production screenshots are accepted.
- Update checkpoint documentation if a new checkpoint is created.

## Acceptance Gates

A batch can be called complete only when:

- The correct layer owns each changed visual rule.
- No page-local replacement recreates the old duplicated style.
- Build passes.
- `git diff --check` passes.
- Screenshot artifacts prove all affected routes still render.
- Real data paths are not changed.

The whole UI cleanup goal is complete only when:

- Same-type controls no longer have page-specific visual definitions.
- Shell geometry is consistent on all Cutter routes.
- Old redundant CSS has been removed, not merely overridden.
- Local web screenshots pass for all Cutter routes.
- Windows desktop verification passes after local web proof.

## Commands Used For This Audit

```bash
wc -l apps/cutter-web/src/styles.css apps/cutter-web/src/app/CutterApp.tsx apps/cutter-web/src/features/*/*.tsx packages/ui-foundation/src/*.css packages/ui-foundation/src/components.tsx
rg -n "data-cutter-route|:has\\(\\.cutter-material-locator\\)|project-home|material-locator|cut-tasks|local-library|public-library|cache-management|settings" apps/cutter-web/src/styles.css | wc -l
rg -n "font-size:" apps/cutter-web/src/styles.css | wc -l
rg -n "padding:" apps/cutter-web/src/styles.css | wc -l
rg -n "border-radius:" apps/cutter-web/src/styles.css | wc -l
rg -n "box-shadow:" apps/cutter-web/src/styles.css | wc -l
rg -n "button|primary-button|secondary-button|danger-button|inline-action|ml-button" apps/cutter-web/src/styles.css | wc -l
rg -n "card|panel|inspector|gallery|table|badge|tag" apps/cutter-web/src/styles.css | wc -l
```

## Batch 1 Progress: Shell Dead CSS Removal

Date: 2026-06-19.

Change made:

- Removed obsolete `.ml-window`, `.ml-window-chrome`, and `.ml-window-meta` product CSS from `apps/cutter-web/src/styles.css`.
- Verified current `packages/ui-foundation` `AppShell` renders `.ml-app-shell`, `.ml-sidebar`, and `.ml-workbench`; it does not render the old `.ml-window` chrome.
- Confirmed remaining `.ml-window-chrome` reference is only the `packages/ui-foundation/src/components.test.ts` assertion that old chrome should not render.

Local web screenshot artifacts:

- `docs/acceptance/artifacts/ui-foundation-css-cleanup/project-home.png`
- `docs/acceptance/artifacts/ui-foundation-css-cleanup/settings.png`
- `docs/acceptance/artifacts/ui-foundation-css-cleanup/cache-management.png`
- `docs/acceptance/artifacts/ui-foundation-css-cleanup/local-library.png`
- `docs/acceptance/artifacts/ui-foundation-css-cleanup/public-library.png`
- `docs/acceptance/artifacts/ui-foundation-css-cleanup/cut-tasks.png`
- `docs/acceptance/artifacts/ui-foundation-css-cleanup/material-locator.png`
- `docs/acceptance/artifacts/ui-foundation-css-cleanup/shell-metrics.json`

Observed from `shell-metrics.json`:

- `.cutter-app` and `.cutter-shell-v1` occupy the full 1440 x 920 viewport on all checked cutter routes.
- No body-level vertical scroll was observed in the checked viewport.
- `.cutter-content` padding is still inconsistent: most routes use `17px 22px 31px 22px`, while cache management uses `20px 44px 34px 46px`.

Next cleanup target:

- Move remaining route-specific shell/content spacing into one shared shell rule.
- Keep page components responsible only for business layout after that rule is stable.
- Do not adjust individual card/list controls until Shell geometry and scroll ownership are centralized.

## Batch 1.1 Progress: Shell Content And Scroll Ownership

Date: 2026-06-19.

Change made:

- Centralized Cutter workbench/content geometry in the Shell layer.
- Made `.cutter-content` a full-bleed workbench region with no padding, border, radius, shadow, or route-specific outer spacing.
- Moved shared route inset ownership to `.cutter-page` with one rule: `17px 22px 31px`.
- Set normal routes to workbench-content vertical scroll and locked `material-locator` to internal pane scrolling.
- Removed older route-level workbench/content overrides that used negative shell margins, route-specific content padding, route-specific content shadows, or fake card-like workbench styling.

Local web screenshot artifacts:

- `docs/acceptance/artifacts/ui-foundation-shell-content/project-home.png`
- `docs/acceptance/artifacts/ui-foundation-shell-content/settings.png`
- `docs/acceptance/artifacts/ui-foundation-shell-content/cache-management.png`
- `docs/acceptance/artifacts/ui-foundation-shell-content/local-library.png`
- `docs/acceptance/artifacts/ui-foundation-shell-content/public-library.png`
- `docs/acceptance/artifacts/ui-foundation-shell-content/cut-tasks.png`
- `docs/acceptance/artifacts/ui-foundation-shell-content/material-locator.png`
- `docs/acceptance/artifacts/ui-foundation-shell-content/shell-content-metrics.json`

Observed from `shell-content-metrics.json`:

- `.cutter-app` and `.cutter-shell-v1` occupy the full 1440 x 920 viewport on all checked cutter routes.
- `.cutter-workspace` is consistently `1148 x 920` at `x = 292, y = 0` on all checked cutter routes.
- `.cutter-content` padding is consistently `0px 0px 0px 0px` on all checked cutter routes.
- `.cutter-page` padding is consistently `17px 22px 31px 22px` on all checked cutter routes.
- Normal routes report `.cutter-content` overflow as `hidden auto`.
- `material-locator` reports `.cutter-content` overflow as `hidden hidden`, preserving independent candidate/transcript/side-panel scrolling.
- Body-level scroll remains absent in the checked viewport: `920 / 920`.

Verification:

- `npm run build:cutter-web` passed.
- `git diff --check` passed.
- Seven local web screenshots were captured for the checked Cutter routes.

Remaining debt moved to next batch:

- The remaining `margin-left: -14px` rules are inside project-home page composition and sidebar footer positioning, not Shell geometry.
- Project-home still has page-local button, search, card, and detail-panel visual definitions that should move into UI Foundation or shared page-composition rules in a later page migration batch.
- The next UI batch should target Sidebar footer/status and low-risk page composition, not reopen Shell outer geometry.

## Batch 1.2 Progress: Sidebar Route-Specific Cleanup

Date: 2026-06-19.

Change made:

- Removed old `project-home` route-specific sidebar rules that changed sidebar padding, brand offset, active icon spacing, footer width, footer gap, status-card padding, user-entry grid, and sidebar card shadow.
- Promoted the previously verified non-home sidebar geometry to the shared Cutter sidebar rule.
- Removed redundant `project-home` selectors from final sidebar normalization rules.
- Kept remaining project-home route styles scoped to page composition: hero, search row, project board, project cards, and detail panel.

Verification:

- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `npm run build:cutter-web` passed.
- `git diff --check` passed.
- Search confirmed no remaining `project-home` route-specific selectors for `.ml-sidebar` or `.cutter-sidebar`.

Observed result:

- Project home and material search now share the same sidebar geometry, menu spacing, footer status-card positioning, and user-entry structure.
- CSS asset size dropped from `305.83 kB` before Batch 1.1 to `299.54 kB` after Batch 1.2.

Remaining debt moved to next batch:

- Project-home still has internal page-composition offsets: project search, project board, and detail panel.
- Low-risk pages still contain page-local card/table/search/button visual rules that should be migrated toward `packages/ui-foundation`.
- The next batch should target low-risk page composition and shared component use, starting with settings/cache/local-library/public-library.

## Batch 2 Progress: Low-Risk Page Component Convergence

Date: 2026-06-19.

Routes in scope:

- Settings
- Cache management
- Local library
- Public library

Change made:

- Added `cache-management` to the Cutter visual screenshot matrix so this low-risk page is verified with the rest of the migrated route family.
- Migrated cache management status pills from page-local `.cutter-cache-status` styles to shared `Badge`.
- Migrated cache management stat cards, test-result panel, and cache-detail panel to shared `Card`.
- Migrated the cache-detail "清除界面缓存" action to shared `Button`.
- Migrated the cache location side panel to shared `InspectorPanel`.
- Removed obsolete cache panel header/button rules that were recreating card and action styling locally.
- Migrated local/public library view toggles and load-more/open-directory actions to shared `Button` variants.
- Removed obsolete `.cutter-local-view-toggle button*` and `.cutter-public-library-load-more*` CSS selectors so foundation buttons are not overridden by page-local button styling.
- Removed dead legacy `.ml-gallery*` and `.ml-tag*` CSS selectors from `apps/cutter-web/src/styles.css`; production route code no longer renders those old gallery/tag primitives.
- Confirmed local/public library pages already route through `LibraryGallery`, which uses shared `Card` and `Badge` for the visible media-card and tag primitives.

Local web screenshot artifacts:

- `docs/acceptance/artifacts/m4-cutter-workbench/cache-management.png`
- `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
- `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
- `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`

Verification:

- `npm run visual:cutter-web` passed and now includes `cache-management`.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `290.59 kB` gzip `35.03 kB`.
- `git diff --check` passed.
- Manual screenshot review found no artificial outer app frame on the checked low-risk routes.
- Manual screenshot review found cache management using the shared Shell, shared status badge treatment, shared card panels, and shared inspector panel.
- Manual screenshot review found local/public library filter controls still aligned after moving to shared `Button`.

Remaining debt moved forward:

- Settings still has page-composition form rows, cut-mode toggle, doctor rows, and account-security layout styles. These are acceptable for this batch because the visible panel/card/badge/button primitives are already shared, but the form/toggle primitives should be revisited after `Button` and a future form-control primitive stabilize.
- Cache management still has business-specific meter, detail-list, and check-list composition rules. These are page composition rather than global component rules, but they may become candidates for future `ProgressMeter` or `StatusList` components if repeated elsewhere.
- Local and public library still have route-specific pagination, view-toggle container, and layout rules. The media cards and controls now compose shared foundation primitives, but the segmented-control container itself should move into a future shared primitive if it repeats elsewhere.
- Cut tasks and material search remain out of scope for this low-risk batch and should not be silently changed while finishing low-risk page acceptance.

## Batch 3 Progress: Cut Tasks Component Convergence

Date: 2026-06-19.

Route in scope:

- Cut tasks

Change made:

- Confirmed the cut tasks page composes the production task table from shared `Table`, task state pills from shared `Badge`, task filters/actions from shared `Button`, pipeline summary from shared `Card`, and the right-side detail surface from shared `InspectorPanel`.
- Migrated the remaining "加载更多" task-list action from a page-local inline button to shared `Button`.
- Updated the scroll contract test from the removed `.cutter-task-table-wrap` wrapper to the new `.cutter-queue-table.ml-table-wrap` shared table wrapper.
- Updated library orientation-control tests to match the shared `Button` markup, where visible labels are rendered inside `.ml-button-label`.
- Removed obsolete `.cutter-task-*`, `.cutter-task-table-wrap`, and `.cutter-pipeline-card` selectors from `apps/cutter-web/src/styles.css`; search now confirms those legacy task styles are absent.
- Kept only route-scoped `cutter-queue-*` page-composition rules that describe table density, text truncation, problem/action semantics, selected-row behavior, and task-detail field layout around shared primitives.

Local web screenshot artifact:

- `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `268.44 kB`, gzip `32.50 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed before this documentation update.
- Search confirmed no remaining `.cutter-task-*`, `.cutter-task-table-wrap`, or `.cutter-pipeline-card` selectors in the cut task page, cutter test, or cutter CSS.
- Manual screenshot review found the cut tasks page using one stable Shell, shared table rows, fixed table header styling, semantic status colors, one-line problem/selected-text cells, and shared inspector hierarchy.

Remaining debt moved forward:

- The current `pending` badge tone is semantically correct but visually heavier than the other task states; this should be handled in a token/component polish pass, not as a page-local override.
- `cutter-queue-*` route-scoped styles still exist for task-specific column widths, one-line truncation, source button layout, problem text colors, and detail `dl` layout. These are acceptable page composition for this batch because the visual primitives are now shared.
- Settings still has an old page-local cut-mode toggle. It was intentionally left out of this cut tasks batch and should be revisited in a low-risk form/toggle cleanup after a shared form-control primitive exists.
- Material search task snippets and recent-task rows remain out of scope for this batch; they should be handled only in the final material search migration phase.

## Batch 4 Progress: Material Search CSS Consolidation

Date: 2026-06-19.

Route in scope:

- Material locator

Change made:

- Consolidated material-search styling into the terminal `UI Foundation material search migration` block in `apps/cutter-web/src/styles.css`.
- Removed the older duplicated material/search/transcript CSS rules that appeared before the terminal migration block: 878 selector hits across 529 CSS rules were deleted.
- Kept material-search workflow-specific controls as page composition where they are not generic reusable primitives yet:
  - Candidate result rows use button semantics because they select a source material.
  - Transcript time controls use button semantics because they implement start/end time selection.
  - Floating cut action uses shared `Button`, but its anchored position and visibility remain material-search workflow composition.
- Updated material-search tests to target the consolidated terminal rules and shared UI Foundation markup instead of old legacy selectors.
- Fixed the material-search three-column workbench geometry at the page-composition layer. The route no longer inherits the normal page `main + inspector` two-column grid; `.cutter-page-main` now owns the full material-search workbench width before placing candidate, transcript, and side-panel columns.

Local web screenshot artifacts:

- `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
- `output/playwright/material-locator-after-grid-fix.png`

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `178.23 kB`, gzip `23.17 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed after the material-search geometry fix and this documentation update.

Observed during local geometric verification:

- Before the fix, `.cutter-page-main` was only `762px` wide while it tried to place `256px + 480px + 360px` columns, causing the right side panel to render outside the parent and be clipped by `overflow: hidden`.
- After the fix, `.cutter-page-main` is `1200px` wide in a `1536 x 1024` viewport and places the material-search columns as `256px / 584px / 360px`, with the side panel fully inside the page.

Remaining debt moved forward:

- Material search still has route-scoped composition rules for candidate rows, transcript row density, time-selection highlight, floating cut action placement, side-panel section heights, and recent-task queue rows. These rules are intentionally retained for this batch because they encode the specialized search-select-cut workflow.
- Future component candidates after this migration stabilizes: `TranscriptPanel`, `FloatingCutAction`, `MediaCandidateList`, and a compact `StatusList`.
- The page should receive another manual visual pass after the verification commands refresh the official screenshot artifact, because material search is the highest-risk Cutter route.

## Batch 4.1 Progress: Project Home Button/Search Convergence

Date: 2026-06-19.

Route in scope:

- Project home

Change made:

- Migrated project-home search from hand-authored `.cutter-search-box` markup to shared `SearchBox`.
- Migrated project-home primary, secondary, and danger actions to shared `Button`.
- Migrated project create, rename, and delete dialog footer actions to shared `Button`.
- Removed 54 legacy project-home button/search selector overrides, including old project-card action button selectors, project search button overrides, project search-box/icon overrides, project detail control button overrides, and project delete dialog danger-button overrides.
- Added a small route-scoped layout bridge for project-home only:
  - Search area is now `SearchBox + 新建项目` instead of three independent columns.
  - Project-card action buttons retain their business placement while Button owns visual treatment.
  - Project-detail controls stretch shared Buttons to the detail panel width.

Local web screenshot artifact:

- `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `172.43 kB`, gzip `22.47 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed after removing the remaining project-home old button/search selectors.

Remaining debt moved forward:

- Project-home still has page-composition card and detail-panel geometry rules. These are layout-specific and acceptable for this batch, but repeated card/detail treatments should be evaluated for future `MediaCard` and stronger `InspectorPanel` adoption.

## Batch 4.2 Progress: Legacy Button Class Removal

Date: 2026-06-19.

Routes/components in scope:

- Source detail
- Legacy search page
- Cut list
- Shared Cutter CSS

Change made:

- Migrated the source-detail "加入待剪清单" inspector action to shared `Button`.
- Migrated the legacy search page query form to shared `SearchBox`.
- Migrated cut-list header actions and row actions to shared `Button`.
- Removed the obsolete `.cutter-primary-button`, `.cutter-secondary-button`, `.cutter-danger-button`, `.cutter-row-actions button`, and `.cutter-button-group button` visual selector rules from `apps/cutter-web/src/styles.css`.
- Kept `.cutter-row-actions` and `.cutter-button-group` as page-composition layout containers only; they no longer style button visuals.
- Updated the material-search selected-copy regression assertion so tests no longer reference a deleted old button class.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `169.20 kB`, gzip `22.15 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed after removing the remaining legacy button selector rules.

Observed cleanup result:

- Search confirmed there are no remaining `.cutter-primary-button`, `.cutter-secondary-button`, `.cutter-danger-button`, `.cutter-row-actions button`, or `.cutter-button-group button` references in `apps/cutter-web/src`.

Remaining debt moved forward:

- Some route-level page/card/detail geometry remains intentionally page-composition owned; this should be reduced only when a repeated pattern emerges strongly enough for a new shared primitive.

## Batch 4.3 Progress: Link-Action Convergence

Date: 2026-06-19.

Routes/components in scope:

- Public library inspector action
- Legacy search grouped result action
- Material search recent-task navigation
- UI Foundation `Button`
- Shared Cutter CSS

Change made:

- Extended UI Foundation `Button` so the same component can render an anchor when `href` is provided.
- Replaced the remaining `cutter-inline-action` JSX usage in public library, legacy search, and material search with shared `Button`.
- Removed the obsolete `cutter-inline-action` visual selector rules from `apps/cutter-web/src/styles.css`.
- Added a UI Foundation regression test proving `Button` can render a link without leaving the v1 component contract.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 8 tests, 8 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `168.13 kB`, gzip `22.06 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed after removing the obsolete link-action selector rules.

Observed cleanup result:

- Search confirmed there are no remaining `cutter-inline-action` references in `apps/cutter-web/src` after this migration.

Remaining debt moved forward:

- Route-level page/card/detail geometry still contains repeated rules and should be audited as the next visual ownership batch.
- Some route-scoped `.ml-button` overrides remain where material-search hit navigation and queue surfaces need page-specific placement. These should be kept only if they are layout/state rules rather than visual primitives.

## Batch 4.4 Progress: Library Inspector Geometry Convergence

Date: 2026-06-19.

Routes/components in scope:

- Local library
- Public library
- Shared library inspector/detail panel styling
- Shared Cutter CSS

Change made:

- Added a shared `cutter-library-inspector` class to the local-library and public-library `InspectorPanel` instances.
- Merged duplicate local/public library page grid, page-main, page-header, filter-toggle, inspector, inspector header/title/body, detail player, and detail text rules.
- Removed the duplicated public-library inspector visual block after proving it matched the local-library detail-panel treatment.
- Moved local/public library inspector height and scroll ownership from route-specific `.ml-inspector` selectors to the shared `cutter-library-inspector` selector.

Visual ownership result:

- Local and public library pages now share one material-library detail panel geometry.
- The two pages still own their business data, filtering behavior, and list content independently.
- The shared class remains page-composition scoped because it represents a material-library detail pattern, not a new UI Foundation v1 primitive.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `166.16 kB`, gzip `21.96 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed after the shared inspector consolidation.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 7,263 lines after this consolidation.
- Search confirmed there are no remaining local/public route-specific `.ml-inspector`, `.ml-inspector-header`, `.ml-inspector-title`, or `.ml-inspector-body` visual rules for these two library pages.

Remaining debt moved forward:

- Cache management and settings still have route-specific `.ml-inspector` visual rules that should be compared next.
- Project-home still owns bespoke project card/detail geometry and should remain separate until a `MediaCard`/project-card primitive is explicitly accepted.

## Batch 4.5 Progress: Operational Page Geometry Convergence

Date: 2026-06-19.

Routes/components in scope:

- Settings
- Cache management
- Shared operational page grid/header/inspector shell
- Shared Cutter CSS

Change made:

- Added `cutter-operational-page` to the settings and cache-management route roots.
- Added `cutter-operational-inspector` to the settings Doctor inspector and cache location inspector.
- Consolidated the duplicated settings/cache page grid, page-main reset, page-header rhythm, inspector header/title/body, inspector height, and inspector scrolling into one shared operational-page block.
- Removed the route-specific cache-management page grid and cache-header typography block after cache-management started using the shared operational-page rule.
- Removed the settings route-specific inspector visual block after settings started using the shared operational inspector rule.
- Removed dead settings `.ml-status-row` / `.ml-status-dot` CSS that no current Cutter settings DOM renders.

Visual ownership result:

- Settings and cache management now share one normal operational-page geometry contract.
- The two pages still own only their business composition: settings form rows/security form/Doctor row content, and cache stats/meters/check-list/detail-list/cache-root rows.
- The shared class remains Cutter shell/page-composition scoped because it represents a recurring page family, while visual primitives still come from `Card`, `Badge`, `Button`, and `InspectorPanel`.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `164.51 kB`, gzip `21.86 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cache-management.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 7,196 lines.
- Search confirmed there are no remaining settings/cache-management route-specific `.ml-inspector` visual rules.
- Search confirmed the old settings `.ml-status-row` / `.ml-status-dot` CSS is absent.

Remaining debt moved forward:

- Settings still has route-scoped form-row, select, cut-mode toggle, and account-security form styles. These should move only after a future form-control/segmented-control primitive is accepted.
- Cache management still has page-composition meter, check-list, and detail-list rules. These remain business-specific until the pattern repeats enough to justify `ProgressMeter` or `StatusList`.

## Batch 5.0 Progress: Material Search Pre-Migration Audit And Specificity Cleanup

Date: 2026-06-19.

Route in scope:

- Material locator / material search

Why this batch exists:

- Material search is the highest-risk Cutter page because search, candidate focus, transcript virtualization, drag selection, time-click selection, video preview, selection summary, and recent cut jobs are all coupled in one dense workbench.
- The correct first move is not to restyle the whole page. It is to remove contradictory CSS ownership so the later material-search migration has one visible source of truth.

Current layer map:

| Surface | Current owner | Keep / migrate decision |
| --- | --- | --- |
| Search bar | `SearchBox` plus material-locator width/density CSS | Keep shared `SearchBox`; page may own full-width placement and compact density. |
| Candidate list | Material-locator page composition CSS | Keep for now; candidate row density and thumbnail sizing are workflow-specific. |
| Candidate thumbnails | Material-locator page composition CSS | Keep `64 x 38` thumbnail contract; remove old `88px` placeholder overrides. |
| Transcript body | Material-locator page composition CSS and transcript-selection state | Keep; this is workflow behavior and virtualized text layout. |
| Hit navigation | Shared `Button` with material-locator placement CSS | Keep shared `Button`; page may own ghost/compact positioning. |
| Floating cut action | Shared `Button` inside material-locator floating selection bar | Keep; page owns anchored popover geometry and dismissal behavior. |
| Video preview | Material-locator page composition CSS | Keep; real video and static poster need page-specific object-fit and fixed pane behavior. |
| Static poster chrome | Material-locator visual helper CSS | Keep low-specificity poster controls only; do not let it own panel sizing. |
| Selection information | Material-locator page composition CSS | Keep until `InspectorPanel` can represent this dense side-panel pattern without changing workflow. |
| Recent cut tasks | Shared `Badge` plus material-locator compact table CSS | Keep status badges; page owns compact row geometry. |
| Page scroll | Cutter shell plus material-locator internal pane CSS | Keep internal candidate/transcript/side-panel scrolling; no full-page scroll. |

Change made:

- Audited `MaterialLocatorPage.tsx` and confirmed the page already uses shared `SearchBox`, `Button`, and `Badge` for reusable controls.
- Found an older material-locator reference block with higher-specificity selectors such as:
  - `data-cutter-route="material-locator" .cutter-cover-placeholder`
  - `data-cutter-route="material-locator" .cutter-video-panel`
  - `data-cutter-route="material-locator" .cutter-queue-all-action`
- Removed the old high-specificity candidate-placeholder, video-panel, video-frame, video-element, and queue action declarations that could override the newer material-locator main layout block.
- Preserved static poster chrome, but lowered its selector specificity to `.cutter-material-locator ...` so it no longer owns panel sizing or workbench geometry.

Visual ownership result:

- Material search now has fewer contradictory style owners.
- The later main material-locator block is the owner of candidate thumbnail size, video panel sizing, and queue action styling.
- The static poster block owns only poster-only chrome: fake controls, overlay gradient, play icon, time label, volume/fullscreen/menu icons, and progress track.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `162.53 kB`, gzip `21.73 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 7,155 lines.
- Search confirmed the old high-specificity material-locator selectors for `cutter-video-panel`, `cutter-cover-placeholder`, and `cutter-queue-all-action` are absent.
- The remaining `data-cutter-route="material-locator"` selectors are route shell/content locks, page root placement, or compact recent-task status color rules.

Remaining debt moved forward:

- Material locator still has many page-composition rules because this page is a dense tool workspace. They should not be blindly moved into generic `Card` or `InspectorPanel`.
- Candidate results, transcript rows, side panel, selected-copy block, and recent-task compact table should be migrated in sub-batches, each with screenshot proof.
- Route-specific status badge colors for recent jobs should eventually use the same semantic status token map as cut tasks, but only after preserving the compact queue row behavior.

## Batch 5.1 Progress: Material Search Candidate Footer Button Convergence

Date: 2026-06-19.

Route/components in scope:

- Material locator / material search
- Candidate list section footer
- UI Foundation `Button`

Change made:

- Migrated the public-source "load more candidates" footer action from a native page-local `button.cutter-locator-expand-button` to shared UI Foundation `Button`.
- Kept the non-action footer status as plain page-composition text because it is static status text, not a control.
- Removed the page-private `button.cutter-locator-expand-button` visual contract. The new `.cutter-locator-load-more.ml-button` rule owns only list placement: width, margin, and left alignment.

Visual ownership result:

- Button typography, height, radius, color, disabled state, hover state, and focus state now come from UI Foundation.
- Material locator only controls where the load-more action sits inside the candidate list.
- This reduces another page-local button variant before the deeper material-search migration.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `162.16 kB`, gzip `21.69 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 7,139 lines.
- Search confirmed `button.cutter-locator-expand-button` is absent from Cutter CSS.
- The regression test confirms `.cutter-locator-load-more.ml-button` contains no `background`, `border`, or `color` declarations.

Remaining debt moved forward:

- Candidate result rows remain workflow-specific selectable rows and are intentionally not generic `Button` yet.
- Candidate empty/loading states remain page-local until a shared `EmptyState` / `LoadingState` primitive is accepted for UI Foundation.

## Batch 5.2 Progress: Material Search Floating Cut Button Ownership

Date: 2026-06-19.

Route/components in scope:

- Material locator / material search
- Floating text-selection cut action
- UI Foundation `Button`

Change made:

- Removed the old `.cutter-selection-bar button` / `.cutter-selection-bar .ml-button` page-level button sizing override.
- Kept the floating selection bar container styles because the page still owns mouse-anchored placement, popover shape, selected-duration label, and dismissal context.
- Left the action itself on shared UI Foundation `Button` with `size="sm"` and `variant="primary"`.

Visual ownership result:

- Floating cut button height, padding, typography, primary color, hover, disabled, and focus behavior now come from UI Foundation.
- Material locator owns only the floating container geometry and the selected-duration text label.
- This removes another historic page-local button selector from the highest-risk Cutter workflow page.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `162.00 kB`, gzip `21.67 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 7,132 lines.
- Search confirmed `.cutter-selection-bar button` and `.cutter-selection-bar .ml-button` are absent from Cutter CSS.

Remaining debt moved forward:

- Floating selection bar container remains page-specific because its position follows the mouse/text selection and is not a reusable Dialog/Popover primitive yet.
- Transcript row selection visuals remain workflow-specific until the transcript panel has its own shared primitive.

## Batch 5.3 Progress: Material Search Recent Tasks Action Button

Date: 2026-06-19.

Route/components in scope:

- Material locator / material search
- Recent cut tasks panel header action
- UI Foundation `Button`

Change made:

- Changed the recent-tasks "查看全部任务" action from `variant="secondary"` to `variant="ghost"` so it matches its quiet header-link role.
- Removed the page-level `.cutter-queue-all-action` visual rule that had redefined min-height, padding, color, font weight, line height, border, and background.
- Kept the `cutter-queue-all-action` class only as a semantic hook on the button element, not as a visual style owner.

Visual ownership result:

- The recent-tasks header action now gets button visual behavior from UI Foundation `Button`.
- Material locator keeps ownership of the queue panel header layout only.
- This removes another local button visual fork from the material-search workflow.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `161.74 kB`, gzip `21.63 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 7,116 lines.
- Search confirmed `.cutter-queue-all-action` is absent from Cutter CSS.
- The regression test confirms the rendered action includes `ml-button--ghost` and `ml-button--sm`.

Remaining debt moved forward:

- Recent cut task rows still use a compact workflow-specific grid because they summarize queue state inside a fixed side panel.
- The row status badges already use shared `Badge`, but route-specific compact status composition should be revisited after candidate/transcript cleanup.

## Batch 5.4 Progress: Material Search Hit Navigation Buttons

Date: 2026-06-19.

Route/components in scope:

- Material locator / material search
- Transcript hit navigation actions
- UI Foundation `Button`

Change made:

- Removed the page-level `.cutter-hit-navigation button` / `.cutter-hit-nav-button.ml-button` visual override.
- Kept `.cutter-hit-navigation` as a layout-only flex container for the "上一个 / 下一个" actions.
- Left both navigation actions on shared UI Foundation `Button` with `size="sm"` and `variant="ghost"`.

Visual ownership result:

- Hit navigation button height, padding, color, disabled state, focus, hover, and typography now come from UI Foundation.
- Material locator only owns the small horizontal grouping between the two actions.
- This removes another page-local Button fork from the material-search transcript header.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `161.51 kB`, gzip `21.60 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 7,106 lines.
- Search confirmed `.cutter-hit-navigation button` and `.cutter-hit-nav-button.ml-button` are absent from Cutter CSS.
- The regression test confirms the rendered actions include `ml-button--ghost` and `ml-button--sm`.

Visual note:

- The hit navigation actions now appear as standard small ghost buttons. If this feels too prominent in later review, the correct fix is a Foundation-level light action variant or accepted compact button token, not a material-search-only override.

Remaining debt moved forward:

- Transcript row timing buttons remain workflow-specific because they represent text-range selection anchors, not normal UI actions.
- Transcript row highlight, selected range, and time-click start marker remain page-composition state until a shared transcript primitive exists.

## Batch 5.5 Progress: Remove Legacy Compact Selection Bar

Date: 2026-06-19.

Route/components in scope:

- Material locator / material search
- Floating text-selection cut action
- Legacy global `.cutter-compact-selection-bar`

Change made:

- Removed `cutter-compact-selection-bar` from the material-search floating selection bar DOM.
- Deleted the old global `.cutter-compact-selection-bar`, `.cutter-compact-selection-bar strong`, `.cutter-compact-selection-bar button`, and responsive `.cutter-compact-selection-bar.is-anchored` CSS rules.
- Kept the current material-search `.cutter-selection-bar` rule as the single owner of mouse-anchored floating container geometry.

Visual ownership result:

- Floating selection container is now owned by the material-search page-composition rule that exists near the rest of the material-search layout.
- Floating cut button visuals remain owned by UI Foundation `Button`.
- The old global compact-selection styling no longer competes with the current material-search-specific selection bar contract.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `160.90 kB`, gzip `21.49 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 7,074 lines.
- Search confirmed `.cutter-compact-selection-bar` is absent from Cutter CSS.
- The regression test confirms `.cutter-compact-selection-bar` remains absent while `.cutter-selection-bar` keeps the floating container contract.

Remaining debt moved forward:

- The floating selection container is still page-specific because it is mouse-positioned and tied to transcript selection state.
- A future Foundation `Popover` or `FloatingAction` primitive could replace the container only after preserving dismissal behavior and desktop viewport constraints.

## Batch 5.6 Progress: Material Search Queue Badge Tone Ownership

Date: 2026-06-19.

Route/components in scope:

- Material locator / material search
- Recent cut task status badges
- UI Foundation `Badge`

Change made:

- Deleted material-search route-specific `.cutter-locator-queue-row.is-* .ml-badge` color overrides.
- Kept the existing `queueStatusTone` mapping in TypeScript so each queue state still renders a semantic UI Foundation `Badge` tone.
- Updated regression coverage so the material-search page must render Foundation badge tone classes and must not redefine badge colors in route CSS.

Visual ownership result:

- Badge color, background, radius, typography, and status semantics are now owned by UI Foundation `Badge`.
- Material locator owns only the compact recent-task row grid and text truncation.
- This removes another page-local visual fork from a shared primitive.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `160.14 kB`, gzip `21.39 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 7,049 lines.
- Search confirmed material-locator route-specific `.cutter-locator-queue-row.is-* .ml-badge` overrides are absent from Cutter CSS.
- The regression test confirms recent task statuses render Foundation `Badge` tone classes: `is-warning`, `is-info`, `is-success`, and `is-danger`.

Remaining debt moved forward:

- Recent task rows still use a page-specific compact grid. A future shared compact task-list primitive may be useful only if the same pattern repeats outside material search.
- Cut-task problem/status text still has page-specific status composition and should stay in the cut-task phase unless it is promoted into Foundation status primitives.

## Batch 5.7 Progress: Material Search Load-More Status Naming Cleanup

Date: 2026-06-19.

Route/components in scope:

- Material locator / material search
- Candidate-list footer
- UI Foundation `Button`

Change made:

- Renamed the non-interactive candidate-list footer from `cutter-locator-expand-button` to `cutter-locator-load-more-status`.
- Kept the interactive public-library continuation action as UI Foundation `Button` with `cutter-locator-load-more`.
- Updated regression coverage so the old `cutter-locator-expand-button` class cannot silently return.

Visual ownership result:

- The actual load-more action remains owned by UI Foundation `Button`.
- The passive "all loaded" footer is now correctly named as page-composition status text instead of an old button.
- This removes a misleading legacy class from material-search CSS and DOM.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `160.15 kB`, gzip `21.39 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.

Observed cleanup result:

- `apps/cutter-web/src/styles.css` remains 7,049 lines.
- Search confirmed old `cutter-locator-expand-button` class is absent from Cutter app source.
- `cutter-locator-load-more-status` remains a passive text style, not a shared control override.

Remaining debt moved forward:

- Candidate rows and footer text are still page-specific because they are tied to material-search result density.
- If the same "load more / all loaded" footer repeats in library pages, promote the pattern later into a small Foundation pagination/footer primitive.

## Batch 5.8 Progress: Material Search SearchBox Visual Ownership

Date: 2026-06-19.

Route/components in scope:

- Material locator / material search
- Search command row
- UI Foundation `SearchBox`
- UI Foundation `Button`

Change made:

- Removed the old `cutter-search-form`, `cutter-search-box`, and `cutter-locator-search-input` classes from the material-search `SearchBox`.
- Deleted material-search-specific `.cutter-search-box`, nested `input`, `:focus-within`, and `.cutter-locator-search-form .ml-button` overrides.
- Kept only `.cutter-locator-search-form { width: 100%; }` as page composition so the Foundation `SearchBox` can own input and submit-button visuals.
- Updated regression coverage so material search must render `ml-search-box cutter-locator-search-form` and must not render `cutter-search-box`.

Visual ownership result:

- SearchBox border, radius, background, focus ring, input typography, and submit button visuals now come from UI Foundation.
- Material search owns only placement and width.
- This removes a major source of page-local search-control drift and moves the page closer to the shared control system.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `159.27 kB`, gzip `21.29 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 7,003 lines.
- Search confirmed material-search JSX no longer uses `cutter-search-box` or `cutter-locator-search-input`.
- Search confirmed material-search CSS no longer defines `.cutter-material-locator .cutter-search-box` or `.cutter-material-locator .cutter-locator-search-form .ml-button`.

Remaining debt moved forward:

- Older `.cutter-search-box` rules still exist for other routes and compatibility. They should be removed only when those pages migrate or when evidence proves no route needs them.
- If the Foundation `SearchBox` needs a denser material-search variant, that should be added as a Foundation variant rather than a route override.

## Batch 5.9 Progress: Material Search Poster Frame Rule Consolidation

Date: 2026-06-19.

Route/components in scope:

- Material locator / material search
- Video preview poster frame
- Static poster fallback chrome

Change made:

- Consolidated duplicated `.cutter-video-poster-frame` base declarations into one material-search rule.
- Moved width, height, inherited radius, background position, and background sizing into the existing poster-frame owner near the static poster chrome.
- Deleted the later duplicate base selector from the main material-search layout block.
- Added regression coverage requiring exactly one base `.cutter-video-poster-frame` rule.

Visual ownership result:

- Static poster-frame behavior now has one CSS owner.
- Main layout still owns panel/frame sizing around the video area.
- Reference poster behavior remains unchanged through `.is-reference-poster`.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `159.21 kB`, gzip `21.28 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 7,000 lines.
- Search confirmed there is one base `.cutter-material-locator .cutter-video-poster-frame` rule.

Remaining debt moved forward:

- Video preview is still a material-search-specific composition because it mixes real video playback with static poster fallback. Promote it only if the same preview chrome appears on another page.

## Batch 5.10 Progress: Material Search Right Panel Specificity Cleanup

Date: 2026-06-19.

Route/components in scope:

- Material locator / material search
- Right-side video / selection / recent-task panels
- Video frame and video element sizing

Change made:

- Removed duplicate app-level `:has(.cutter-material-locator)` selectors for the material-search side panel, right-column panels, video frame, and video element.
- Kept direct `.cutter-material-locator ...` page-composition owners for the same layout responsibilities.
- Updated regression coverage so these app-level `:has` right-panel overrides cannot return.

Visual ownership result:

- Right-column panel geometry is now owned by the material-search page composition layer, not by a higher-specificity app-level route override.
- The video frame and video object-fit rules now have a single direct material-search owner.
- This reduces selector specificity and makes future layout changes easier to reason about.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `158.66 kB`, gzip `21.24 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 6,989 lines.
- Search confirmed app-level `:has(.cutter-material-locator)` right-panel/video overrides are absent.

Remaining debt moved forward:

- Material-search still needs independent pane scroll rules and dense page-composition layout. Those should stay page-owned unless the same pattern appears on another dense workbench page.

## Batch 5.11 Progress: Material Search Root Layout Specificity Cleanup

Date: 2026-06-19.

Route/components in scope:

- Material locator / material search
- Page root
- Page-main grid layout

Change made:

- Removed the duplicate route-level `[data-cutter-route="material-locator"] .cutter-material-locator.cutter-page` selector from the material-search root layout rule.
- Removed the duplicate route-level `[data-cutter-route="material-locator"] .cutter-material-locator .cutter-page-main` selector from the page-main grid rule.
- Kept direct `.cutter-material-locator` and `.cutter-material-locator .cutter-page-main` as the single page-composition owners.
- Excluded `.cutter-material-locator` from the older shared two-column `.cutter-page` rule so the material-search page root no longer inherits the normal main/inspector grid.
- Added regression coverage so the route-level root/page-main selectors cannot return.

Visual ownership result:

- Material-search page root and page-main grid now have direct page-composition owners instead of higher-specificity route duplicates.
- The dense material-search workbench is no longer clipped by the generic two-column page layout; candidate list, transcript, and right-side review panel stay inside one 1200px internal grid at the checked desktop viewport.
- Shell remains responsible for route-level content overflow; material search owns only its internal dense grid and pane composition.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `158.47 kB`, gzip `21.23 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 6,987 lines.
- Search confirmed route-level material-search root/page-main duplicate selectors are absent.
- Playwright geometry check confirmed `.cutter-page-main` is `1200px` wide at `1536 x 1024`, with columns `256px / 536px / 360px`.

Remaining debt moved forward:

- Route-level shell/content overflow rules for material search still remain because they govern shell scroll behavior rather than page-main visual styling.

## Batch 5.12 Progress: Material Search Candidate Panel Specificity Cleanup

Date: 2026-06-19.

Route/components in scope:

- Material locator / material search
- Candidate material panel

Change made:

- Removed the duplicate app-level `.cutter-app:has(.cutter-material-locator) .cutter-locator-candidates` visual override.
- Kept direct `.cutter-material-locator .cutter-locator-candidates` as the single owner for candidate panel border/background/shadow reset.
- Added regression coverage so the app-level candidate panel override cannot return.

Visual ownership result:

- Candidate panel visuals are now owned by the material-search page composition layer instead of a higher-specificity app-level selector.
- This continues the material-search cleanup path without changing search, selection, cut, cache, or auth behavior.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `158.36 kB`, gzip `21.23 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 6,981 lines.
- Search confirmed `.cutter-app:has(.cutter-material-locator) .cutter-locator-candidates` is absent.

Remaining debt moved forward:

- Other material-search page-composition rules still need to be audited for app-level route ownership versus direct page ownership.

## Batch 5.13 Progress: Shell Content Lock Specificity Cleanup

Date: 2026-06-19.

Route/components in scope:

- Cutter shell
- Workbench surface reset
- Content scrolling contract
- Material locator / material search locked-content behavior

Change made:

- Removed redundant project-home and material-search selectors from the workbench surface reset because `[data-cutter-route] .cutter-workspace` already covers routed workbench surfaces.
- Removed redundant project-home and material-search selectors from the content reset because `[data-cutter-route] .cutter-content` already covers routed content surfaces.
- Removed the route-specific `[data-cutter-route="material-locator"] .cutter-content { overflow: hidden; }` rule.
- Kept the unified `.cutter-workspace.is-content-locked .cutter-content { overflow: hidden; }` contract as the owner for dense split-workbench pages such as material search.
- Added regression coverage so those redundant project-home/material-search Shell selectors cannot return.

Visual ownership result:

- Shell scroll behavior now depends on the explicit `is-content-locked` state instead of a material-search route exception.
- Workbench/content reset rules have fewer route-specific exceptions while preserving the material-search locked layout.
- This keeps the responsibility boundary cleaner: Shell owns scroll locking, material search owns its internal pane layout.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `157.92 kB`, gzip `21.19 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 6,973 lines.
- Search confirmed the redundant project-home/material-search workbench/content reset selectors are absent.

Remaining debt moved forward:

- Continue auditing remaining legacy shell and page rules that reference old `.cutter-shell` selectors, especially where production already uses `.cutter-shell-v1`.

## Batch 5.14 Progress: Material Search Responsive Shell Residue Cleanup

Date: 2026-06-19.

Route/components in scope:

- Material locator / material search
- Responsive material-search breakpoint
- Legacy Shell selector residue

Change made:

- Removed the responsive `.cutter-app:has(.cutter-material-locator) .cutter-shell` rule inside the `max-width: 1180px` material-search media block.
- Verified current production Cutter app renders `cutter-shell-v1`, not `cutter-shell`, so the removed rule was legacy Shell residue rather than an active layout contract.
- Kept responsive page-composition rules on `.cutter-material-locator .cutter-page-main` and related material-search panes.
- Updated regression coverage so the old `:has(.cutter-material-locator) .cutter-shell` selector cannot return.
- Corrected the responsive test to assert the actual `.cutter-material-locator .cutter-page-main` owner instead of the stale `.cutter-locator-workbench` selector.

Visual ownership result:

- Material-search responsive behavior now has no active app-level `:has(.cutter-material-locator)` selector.
- Shell responsive ownership no longer points at a dead `.cutter-shell` class.
- Material-search responsive stacking remains page-composition-owned through `.cutter-page-main` and pane selectors.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `157.83 kB`, gzip `21.17 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 6,969 lines.
- Search confirmed no production CSS rule still uses `:has(.cutter-material-locator)`.

Remaining debt moved forward:

- There are still older `.cutter-shell` rules outside material search. They should be audited in a Shell cleanup batch to distinguish dead legacy selectors from still-relevant fallback selectors.

## Batch 5.15 Progress: Legacy Cutter Shell Selector Cleanup

Date: 2026-06-19.

Route/components in scope:

- Cutter Shell
- Legacy `.cutter-shell` selectors
- UI Foundation `AppShell` / `.cutter-shell-v1`

Change made:

- Removed standalone legacy `.cutter-shell` CSS blocks that no production JSX can match.
- Removed `.cutter-shell` from responsive combined selector lists while preserving active `.cutter-page` / `.cutter-project-board` behavior.
- Kept `.cutter-shell-v1` as the active Shell class owned by UI Foundation AppShell integration.
- Added regression coverage so `.cutter-shell` selectors cannot return while `.cutter-shell-v1` remains.

Visual ownership result:

- The Cutter shell no longer has dead old-shell CSS competing with `.cutter-shell-v1`.
- Shell ownership is clearer: production shell styling goes through UI Foundation AppShell plus `.cutter-shell-v1` integration rules.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `156.90 kB`, gzip `21.06 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 6,914 lines.
- Search confirmed no legacy `.cutter-shell` selectors remain in production CSS.

Remaining debt moved forward:

- Continue auditing old migration-layer Shell/sidebar/workbench blocks that duplicate `.cutter-shell-v1`, `.ml-sidebar`, `.ml-workbench`, or UI Foundation ownership.

## Batch 5.16 Progress: Legacy Sidebar Visual Block Cleanup

Date: 2026-06-19.

Route/components in scope:

- Cutter Sidebar
- Sidebar brand and navigation item styling
- Sidebar footer status card and user entry
- UI Foundation Shell terminal block

Change made:

- Removed an early `data-cutter-web-ready` Sidebar visual block that duplicated later Shell ownership for `.ml-sidebar`, `.ml-sidebar-brand`, `.ml-sidebar-item`, `.ml-sidebar-footer`, `.cutter-sidebar-engine-card`, and `.cutter-sidebar-user-entry`.
- Preserved the `data-cutter-web-ready` design tokens and the generic non-material page grid rule because those still own separate responsibilities.
- Moved the missing user-avatar icon display details into the current route-ready sidebar user-entry rule instead of restoring the old visual block.

Visual ownership result:

- Sidebar brand, nav item, footer card, and user-entry appearance now rely more directly on the final UI Foundation Shell polish layer.
- The removed old block can no longer compete with the terminal Shell rules for sidebar padding, active item style, card border, radius, shadow, and footer spacing.
- The user avatar icon remains correctly rendered through the current sidebar user-entry rule.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `153.87 kB`, gzip `20.66 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 6,759 lines.
- Route/page selector pressure is now 1,192 hits.
- The built CSS asset dropped from `156.90 kB` after Batch 5.15 to `153.87 kB`.

Remaining debt moved forward:

- There are still later duplicate `data-cutter-web-ready` sidebar normalization rules around the route-ready user/cache area and the terminal final-polish block.
- Next cleanup should consolidate repeated `.ml-sidebar` padding and active-icon rules without changing route-level user/cache menu behavior.

## Batch 5.17 Progress: Sidebar Geometry Override Cleanup

Date: 2026-06-19.

Route/components in scope:

- Cutter Sidebar
- UI Foundation `AppShell` / `.cutter-shell-v1`
- Sidebar active icon sizing

Change made:

- Removed duplicate `data-cutter-web-ready .ml-sidebar` padding overrides that were already superseded by `.cutter-shell-v1 > .ml-sidebar`.
- Removed duplicate `data-cutter-web-ready .ml-sidebar-item.is-active .ml-sidebar-icon` and active icon SVG sizing overrides.
- Added regression coverage so route-ready sidebar geometry cannot be reintroduced through plain `.ml-sidebar` or active-icon overrides; Shell geometry must flow through `.cutter-shell-v1 > .ml-sidebar`.

Visual ownership result:

- Sidebar padding is now owned by the Shell integration selector `.cutter-shell-v1 > .ml-sidebar`.
- Active navigation icon size/color now follows the shared sidebar icon and active item rules instead of a separate route-ready active-icon override.
- Route-ready user/cache menu rules remain in place because they still own user-entry layout and cache menu behavior.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `153.17 kB`, gzip `20.59 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 6,702 lines.
- Route/page selector pressure is now 1,183 hits.
- The built CSS asset dropped from `153.87 kB` after Batch 5.16 to `153.17 kB`.

Remaining debt moved forward:

- Continue consolidating route-ready sidebar footer/user/cache rules into one Shell-owned section, but keep cache menu behavior route-aware until it is represented as a UI Foundation popover/menu component.

## Batch 5.18 Progress: Route-Ready Sidebar Override Cleanup

Date: 2026-06-19.

Route/components in scope:

- Cutter Sidebar navigation items
- Sidebar footer status and user-entry surfaces
- UI Foundation Shell terminal polish block

Change made:

- Removed the duplicate `data-cutter-web-ready .ml-sidebar-footer` width and margin reset that was already handled by the Shell footer contract.
- Removed the duplicate `data-cutter-web-ready .cutter-sidebar-engine-card, .cutter-sidebar-user-entry` glossy border/radius/background/shadow rule that was superseded by the final UI Foundation Shell polish block.
- Removed the route-ready `.ml-sidebar-item` gap and padding override so Sidebar navigation spacing is owned by the shared Shell item rule instead of per-route CSS.
- Added regression coverage so `.cutter-app[data-cutter-web-ready][data-cutter-route] .ml-sidebar-item` cannot return as a route-level Sidebar spacing override.

Visual ownership result:

- Sidebar item spacing is now owned by the shared `.cutter-app[data-cutter-web-ready] .ml-sidebar-item` rule.
- Sidebar footer/card visual hierarchy is owned by the terminal Shell polish block rather than an earlier migration block.
- User-entry layout, user icon, and cache menu behavior remain in the route-ready section because those still represent concrete sidebar footer interaction structure.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `152.74 kB`, gzip `20.53 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 6,679 lines.
- Route/page selector pressure is now 449 hits under the audit command recorded above.
- The built CSS asset dropped from `153.17 kB` after Batch 5.17 to `152.74 kB`.

Remaining debt moved forward:

- Continue reducing older `.cutter-app .ml-sidebar-item`, `.ml-sidebar-footer`, and `.cutter-sidebar-engine-card` blocks that predate `data-cutter-web-ready`, but only after confirming they do not affect login/first-run or non-ready states.
- Keep cache menu behavior route-aware until a shared UI Foundation popover/menu primitive exists.

## Batch 5.19 Progress: Base Sidebar Footer Visual Ownership Cleanup

Date: 2026-06-19.

Route/components in scope:

- Cutter Sidebar footer status card
- Cutter Sidebar user/cache entry
- Base footer/card layout rules
- Ready-state Shell footer/card visual rules

Change made:

- Removed unscoped `.cutter-sidebar-engine-card` border/radius/background declarations while keeping its layout, row spacing, and text overflow behavior.
- Removed unscoped `.cutter-sidebar-user-entry` border/radius/background declarations while keeping its grid layout, padding, and text behavior.
- Removed older Open Design / Material-era footer visual overrides that reintroduced border/radius/background/padding on `.cutter-sidebar-footer`, `.cutter-sidebar-engine-card`, and `.cutter-sidebar-user-entry`.
- Added regression coverage so unscoped base footer card and user-entry rules cannot silently regain `border`, `background`, or `box-shadow` visual ownership.

Visual ownership result:

- Base sidebar footer rules now describe structure and text behavior only.
- Ready-state visual treatment remains owned by Shell-level selectors:
  - `.cutter-app .ml-sidebar-footer, .cutter-app .cutter-sidebar-footer`
  - `.cutter-app[data-cutter-web-ready] .cutter-sidebar-engine-card, .cutter-app[data-cutter-web-ready] .cutter-sidebar-user-entry`
- The sidebar footer still renders with the same visual hierarchy in project home, material search, settings, and cut tasks screenshots.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `151.94 kB`, gzip `20.48 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 6,652 lines.
- The built CSS asset dropped from `152.74 kB` after Batch 5.18 to `151.94 kB`.
- Border-radius declarations dropped from 148 to 143 under the audit command.

Remaining debt moved forward:

- The next safe cleanup area is the older generic `.cutter-app .ml-sidebar-item` and `.ml-sidebar-icon` visual blocks. Those may affect loading/engine-starting states, so they should be handled with an explicit non-ready AppShell visual check rather than deleted blindly.

## Batch 5.20 Progress: Generic Sidebar Item/Icon Ownership Cleanup

Date: 2026-06-19.

Route/components in scope:

- UI Foundation Sidebar
- Cutter Shell ready-state Sidebar item/icon rules
- Loading/engine-starting AppShell navigation
- Legacy Open Design / Material-era Sidebar navigation rules

Change made:

- Removed generic `.cutter-app .ml-sidebar-item` and `.cutter-app .ml-sidebar-icon` visual rules from older Open Design / Material migration blocks.
- Kept Cutter-specific Sidebar item/icon behavior only under `.cutter-app[data-cutter-web-ready] ...` ready-state selectors.
- Left UI Foundation base Sidebar item/icon styling in `packages/ui-foundation/src/layout.css`.
- Added regression coverage blocking unscoped `.cutter-app .ml-sidebar-item` and `.cutter-app .ml-sidebar-icon` selectors from returning to Cutter CSS.

Visual ownership result:

- UI Foundation owns base Sidebar item/icon structure and default visual treatment.
- Cutter Shell owns ready-state Sidebar item/icon differences.
- Legacy Open Design / Material navigation styles no longer compete with the active Shell.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `149.83 kB`, gzip `20.27 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 6,550 lines.
- The built CSS asset dropped from `151.94 kB` after Batch 5.19 to `149.83 kB`.
- `font-size` declarations dropped from 166 to 162.
- `padding` declarations dropped from 200 to 198.
- `border-radius` declarations dropped from 143 to 139.
- Search confirmed no unscoped `.cutter-app .ml-sidebar-item` or `.cutter-app .ml-sidebar-icon` selectors remain in production Cutter CSS.

Remaining debt moved forward:

- The next safe cleanup area is the generic `.cutter-app .ml-sidebar`, `.ml-sidebar-brand`, and `.ml-sidebar-footer` duplication across older Shell blocks.
- Before deleting those, verify non-ready AppShell states and desktop first-run states so loading/setup navigation does not lose required structure.
- Workbench, Card, Table, Button, form, and page-content visual ownership are still incomplete and must not be treated as solved by this Sidebar cleanup.

## Batch 5.21 Progress: Direct Sidebar Shell/Brand Override Cleanup

Date: 2026-06-19.

Route/components in scope:

- UI Foundation Sidebar
- Cutter `AppShell` / `.cutter-shell-v1`
- Non-ready engine-starting AppShell navigation
- Legacy Open Design / Material compact Sidebar shell and brand rules

Change made:

- Removed direct `.cutter-app .ml-sidebar` override blocks from old Open Design and Material migration layers.
- Removed direct `.cutter-app .ml-sidebar-brand`, `.ml-sidebar-brand-mark`, `.ml-sidebar-brand strong`, and `.ml-sidebar-brand small` overrides from older Material-era rules.
- Removed the old responsive `.cutter-app .ml-sidebar` rule that could override UI Foundation's small-screen Sidebar behavior.
- Kept structural Shell ownership in `.cutter-app .cutter-shell-v1 > .ml-sidebar`.
- Kept ready-state visual differences in `.cutter-app[data-cutter-web-ready] ...`.
- Added regression coverage blocking direct `.cutter-app .ml-sidebar` and `.cutter-app .ml-sidebar-brand...` selectors from returning.

Visual ownership result:

- UI Foundation owns base Sidebar and brand visuals.
- `.cutter-shell-v1 > .ml-sidebar` owns Cutter Shell containment for both loading and ready AppShell states.
- `data-cutter-web-ready` owns Cutter ready-state Sidebar visual differences.
- Old Open Design / Material direct Sidebar shell/brand overrides no longer compete with the active Shell.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `148.56 kB`, gzip `20.08 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 6,470 lines.
- The built CSS asset dropped from `149.83 kB` after Batch 5.20 to `148.56 kB`.
- `font-size` declarations dropped from 162 to 160.
- `padding` declarations dropped from 198 to 194.
- `border-radius` declarations dropped from 139 to 138.
- Search confirmed no direct `.cutter-app .ml-sidebar` or `.cutter-app .ml-sidebar-brand...` selectors remain in production Cutter CSS.

Remaining debt moved forward:

- Sidebar footer/card/user-entry still has older broad `.cutter-app .ml-sidebar-footer`, `.cutter-app .cutter-sidebar-footer`, `.cutter-app .cutter-sidebar-engine-card`, and `.cutter-app .cutter-sidebar-user-entry` blocks.
- Those should be consolidated next into base structural rules plus `data-cutter-web-ready` visual rules, but cache menu/user-entry interaction must be preserved.
- Workbench/Card/Table/Button/Form visual ownership remains the larger incomplete layer after Sidebar cleanup.

## Batch 5.22 Progress: Sidebar Footer/User/Cache Ownership Cleanup

Date: 2026-06-19.

Route/components in scope:

- Cutter Sidebar footer status card
- Cutter Sidebar user/cache entry
- UI Foundation AppShell / Sidebar footer slot
- Ready-state cache menu interaction

Change made:

- Removed older Open Design / Material duplicate `.cutter-sidebar-footer` blocks.
- Removed broad `.cutter-app .ml-sidebar-footer` and `.cutter-app .cutter-sidebar-*` footer/card/user visual overrides.
- Moved persistent footer sticky structure to `.cutter-app .cutter-shell-v1 > .ml-sidebar .ml-sidebar-footer`.
- Kept base `.cutter-sidebar-*` rules structural only and moved text truncation into the base engine-card strong rule.
- Kept ready-state visual treatment and cache menu interaction under `data-cutter-web-ready` selectors.
- Added regression coverage blocking broad `.cutter-app .ml-sidebar-footer` and `.cutter-app .cutter-sidebar-(footer|engine-card|user-entry)` selectors from returning.

Visual ownership result:

- UI Foundation owns the Sidebar slot and base Sidebar geometry.
- Cutter base footer rules own structure and text overflow only.
- Cutter Shell owns sticky footer placement.
- Ready-state rules own footer card, user entry, and cache menu visual treatment.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `147.44 kB`, gzip `19.91 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 6,394 lines.
- The built CSS asset dropped from `148.56 kB` after Batch 5.21 to `147.44 kB`.
- `font-size` declarations dropped from 160 to 159.
- `border-radius` declarations dropped from 138 to 136.
- `box-shadow` declarations dropped from 66 to 65.
- Search confirmed no broad `.cutter-app .ml-sidebar-footer` or `.cutter-app .cutter-sidebar-(footer|engine-card|user-entry)` selectors remain in production Cutter CSS.

Remaining debt moved forward:

- The next cleanup target should be repeated Workbench/content/page geometry rules that still cause page-specific alignment drift.
- Card, table, button, form, and inspector visual ownership still needs consolidation after Shell geometry is stable.
- Material search remains the highest-risk page and should still be left until the shared Shell/content and lower-risk page rules are cleaner.

## Batch 5.23 Progress: Workbench/Content/Page Geometry Ownership Cleanup

Date: 2026-06-19.

Route/components in scope:

- Cutter Workbench shell geometry
- `.cutter-content` scroll and padding ownership
- `.cutter-page` / `.cutter-page-main` outer page geometry
- Older Open Design / Material generic layout layers

Change made:

- Removed old Open Design convergence/fidelity generic `.cutter-content`, `.cutter-page`, and `.cutter-page-main` geometry overrides.
- Removed old Material Design generic `.cutter-workspace`, `.cutter-content`, `.cutter-page`, and `.cutter-page-main` geometry overrides.
- Removed a stale responsive `.cutter-content` padding block and broad responsive `.cutter-page` grid override from an older compact layout layer.
- Consolidated the base `.cutter-content` structure into one unscoped rule and moved duplicate width/min-size ownership out of a later selector list.
- Added regression coverage so old generic content/page padding, max-width, and height/overflow/padding combinations cannot silently return.

Visual ownership result:

- Base `.cutter-content` is now structural only and has a single unscoped owner.
- Ready-state Shell rules own Workbench reset, content padding reset, and route-family scroll behavior.
- Page-specific rules still own business composition, but old generic layout layers no longer compete with the Shell for outer spacing.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `146.21 kB`, gzip `19.74 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 6,295 lines.
- The built CSS asset dropped from `147.44 kB` after Batch 5.22 to `146.21 kB`.
- `padding` declarations dropped from 196 to 189.
- Search confirmed only one unscoped `.cutter-content` rule remains.
- Search confirmed old `22px 24px 32px`, `28px 32px 44px`, `18px 16px 28px`, and `.cutter-page` `max-width: 1360px` geometry fragments no longer remain.

Remaining debt moved forward:

- A broad `.cutter-app .cutter-content` / `.cutter-app .ml-workbench.cutter-workspace` Shell block still exists and should be evaluated next against the newer `data-cutter-web-ready` Shell rules.
- Page-specific project-home, library, settings, and cut-tasks composition rules still contain repeated card/table/button/form visual details.
- Material search remains intentionally deferred until Shell/content and lower-risk page ownership are cleaner.

## Batch 5.24 Progress: Shell Ready-State Geometry Ownership Cleanup

Date: 2026-06-19.

Route/components in scope:

- Cutter ready-state Workbench viewport
- `.cutter-content` scroll ownership
- content-locked overflow ownership
- old non-ready Shell geometry layer

Change made:

- Removed the broad old `.cutter-app .ml-workbench.cutter-workspace` rule that duplicated Workbench width, height, overflow, and background ownership.
- Removed the broad old `.cutter-app .cutter-content` rule that duplicated content width, height, scroll, and overscroll ownership.
- Removed the broad old `.cutter-app .cutter-workspace.is-content-locked .cutter-content` rule that duplicated locked-content overflow.
- Removed a stale unscoped `.cutter-workspace.is-content-locked .cutter-content { padding: 14px; }` rule that could reintroduce hidden inner whitespace before the ready-state reset.
- Moved explicit `min-height: 0` and `overflow: hidden` into the ready-state Workbench surface reset, so the terminal Shell rule owns the final viewport boundary.
- Updated regression tests so the deleted broad selectors and locked-content padding cannot silently return.

Visual ownership result:

- Base rules remain structural only.
- Ready-state Shell rules now own final Workbench viewport geometry, content padding reset, route-family scroll, and locked-content overflow.
- Page composition rules still own page-specific layout, but the old app-wide Workbench/content layer no longer competes with the terminal Shell block.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `145.82 kB`, gzip `19.70 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 6,271 lines.
- The built CSS asset dropped from `146.21 kB` after Batch 5.23 to `145.82 kB`.
- `padding` declarations dropped from 189 to 188.
- Search confirmed no `.cutter-app .ml-workbench.cutter-workspace`, `.cutter-app .cutter-content`, or `.cutter-app .cutter-workspace.is-content-locked .cutter-content` selectors remain.
- Search confirmed no locked-content padding rule remains.

Remaining debt moved forward:

- Project home, library, settings, and cut-tasks composition rules still contain page-specific card, table, button, and form visual details.
- The next cleanup target should be low-risk page card/table/control ownership rather than more Shell geometry, because the Shell/content layer now has a clearer owner.
- Material search remains intentionally deferred until lower-risk page controls and card/table patterns are consolidated.

## Batch 5.25 Progress: Project Home Legacy Route Visual Layer Cleanup

Date: 2026-06-19.

Route/components in scope:

- Project home route-specific legacy visual layer
- Project cards
- Project detail controls
- Project list/detail panel styling

Change made:

- Removed the old `.cutter-app[data-cutter-route="project-home"] ...` visual block for project search form, project board, project list panel, project detail, project cards, card overlays, card summaries, card actions, detail cover, detail table rows, and detail buttons.
- Kept the newer `.cutter-app[data-cutter-web-ready][data-cutter-route="project-home"] ...` terminal project-home rules as the current owner.
- Added regression coverage so the deleted non-ready project-card and detail-button visual selectors cannot return.

Visual ownership result:

- Project home still has ready-state page composition rules, but the old non-ready route visual layer no longer competes with them.
- Project card sizing is now governed by the terminal ready-state grid/card rules rather than by an older route block.
- Project detail controls no longer have a legacy raw `button` rule competing with UI Foundation button classes.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 98 tests, 98 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `141.70 kB`, gzip `19.27 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 6,081 lines.
- The built CSS asset dropped from `145.82 kB` after Batch 5.24 to `141.70 kB`.
- `padding` declarations dropped from 188 to 182.
- `border-radius` declarations dropped from 136 to 130.
- `box-shadow` declarations dropped from 65 to 62.
- Search confirmed no `.cutter-app[data-cutter-route="project-home"] .cutter-project-card...` rules remain.

Remaining debt moved forward:

- There are still older generic project-card rules outside the ready-state project-home owner; they should be evaluated in a separate pass against actual non-ready/desktop setup states before deletion.
- Library, settings, cache management, and cut-task page-specific card/table/control visual rules remain the next low-risk consolidation targets.
- Material search remains deferred until lower-risk page control ownership is cleaner.

## Batch 5.26 Progress: Cache Management Card Body Ownership Cleanup

Date: 2026-06-19.

Route/components in scope:

- Cache management page
- UI Foundation `Card`
- cache stat cards
- cache test-result and detail panels

Change made:

- Updated `CacheManagementPage` to pass explicit `bodyClassName` values to UI Foundation `Card`.
- Replaced `.cutter-cache-stat .ml-card-body` with `.cutter-cache-stat-body`.
- Replaced `.cutter-cache-panel .ml-card-body` with `.cutter-cache-panel-body`.
- Added regression coverage so cache management cannot style UI Foundation Card internals through `.ml-card-body` selectors.

Visual ownership result:

- UI Foundation `Card` keeps ownership of the shared card body element.
- Cache management owns only its business body layout classes.
- The page no longer reaches through `.ml-card-body` for cache stat/panel layout.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 99 tests, 99 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `141.68 kB`, gzip `19.27 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/cache-management.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` remains 6,081 lines, but cache management no longer has `.cutter-cache-* .ml-card-body` selectors.
- The built CSS asset dropped from `141.70 kB` after Batch 5.25 to `141.68 kB`.
- `font-size` declarations are now 153.
- Remaining `.ml-card-body` references are now concentrated in library card, settings form group, and cut-task pipeline card rules.

Remaining debt moved forward:

- Library card selectors still use `.cutter-library-card > .ml-card-body`.
- Settings still has `.cutter-info-group .ml-card-body`.
- Cut tasks still has `.cutter-queue-pipeline-card .ml-card-body`.
- These should be migrated in small batches using `bodyClassName` or shared UI Foundation variants before moving into the more complex material-search page.

## Batch 5.27 Progress: Library Card Body Ownership Cleanup

Date: 2026-06-19.

Route/components in scope:

- Public library
- Local library
- Shared `LibraryGallery`
- UI Foundation `Card`

Change made:

- Removed the stale `.cutter-library-card > .ml-card-body` selector.
- Kept the existing `bodyClassName="cutter-library-card-body"` contract in `LibraryGallery`.
- Added regression coverage so library cards must use their own body class instead of styling Card internals.

Visual ownership result:

- Library card body layout is now addressed through the explicit `cutter-library-card-body` business layout class.
- UI Foundation `Card` internals are no longer reached through `.cutter-library-card > .ml-card-body`.
- Public and local library card rendering stays shared through `LibraryGallery`.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 100 tests, 100 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `141.61 kB`, gzip `19.26 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cache-management.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 6,079 lines.
- The built CSS asset dropped from `141.68 kB` after Batch 5.26 to `141.61 kB`.
- `.ml-card-body` references in Cutter CSS dropped from 5 to 3.
- Search confirmed no `cutter-library-card > .ml-card-body` selector remains.

Remaining debt moved forward:

- Settings still has `.cutter-info-group .ml-card-body`.
- Cut tasks still has `.cutter-queue-pipeline-card .ml-card-body`.
- These are the next Card-body ownership cleanup targets.

## Batch 5.28 Progress: Settings Card Body Ownership Cleanup

Date: 2026-06-19.

Route/components in scope:

- Settings
- `CutterInfoGroups`
- UI Foundation `Card`

Change made:

- Added `bodyClassName="cutter-info-group-body"` to Settings info group cards.
- Replaced `.cutter-info-group .ml-card-body` with `.cutter-info-group-body`.
- Added regression coverage so Settings info groups cannot style UI Foundation Card internals through `.ml-card-body`.

Visual ownership result:

- Settings owns only the page body layout class for its info-list rows.
- UI Foundation `Card` keeps ownership of the shared card body element.
- The Settings page no longer reaches through `.ml-card-body` for info group layout.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 101 tests, 101 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset stayed at `141.61 kB`, gzip `19.26 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cache-management.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`

Observed cleanup result:

- Settings no longer has `.cutter-info-group .ml-card-body`.
- Remaining `.ml-card-body` style debt in `apps/cutter-web/src/styles.css` moved down to cut-tasks pipeline card selectors only.

## Batch 5.29 Progress: Cut Tasks Pipeline Card Body Ownership Cleanup

Date: 2026-06-19.

Route/components in scope:

- Cut tasks
- Local cutting pipeline summary card
- UI Foundation `Card`

Change made:

- Added `bodyClassName="cutter-queue-pipeline-card-body"` to the cut-tasks pipeline card.
- Replaced `.cutter-queue-pipeline-card .ml-card-body` and `.cutter-queue-pipeline-card .ml-card-body > div` with explicit `.cutter-queue-pipeline-card-body` selectors.
- Added regression coverage so cut-tasks pipeline card cannot style UI Foundation Card internals through `.ml-card-body`.

Visual ownership result:

- The cut-tasks pipeline summary owns its own page body layout class.
- UI Foundation `Card` internals are no longer reached by production cutter CSS.
- Card body ownership cleanup is complete for the currently known cutter-web production CSS selectors.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 102 tests, 102 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `141.59 kB`, gzip `19.25 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` remains 6,079 lines.
- Search confirmed no production `.ml-card-body` selector remains in Cutter CSS.
- `.ml-card-body` strings now remain only in regression tests that prevent this style debt from returning.

Remaining debt moved forward:

- Continue auditing page-local table, badge, button, input, and inspector selectors that duplicate UI Foundation responsibilities.
- Material search should remain last; its transcript/candidate/video panes need a separate interaction-oriented pass.

## Batch 5.30 Progress: Project Detail Raw Button Selector Cleanup

Date: 2026-06-19.

Route/components in scope:

- Project home
- Project detail action controls
- UI Foundation `Button`

Change made:

- Replaced the remaining project-detail raw `button` selector with `.cutter-project-detail-controls .ml-button`.
- Added regression coverage so this control group cannot reintroduce raw button element styling.

Visual ownership result:

- Project detail controls continue to use shared UI Foundation Button visuals.
- The page owns only route-specific sizing for the Foundation button instance.
- The selector no longer applies to arbitrary native buttons inside the detail control area.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 103 tests, 103 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset remains `141.59 kB`, gzip `19.25 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`

Observed cleanup result:

- Search confirmed old `.cutter-primary-button`, `.cutter-secondary-button`, `.cutter-danger-button`, `.cutter-row-actions button`, and `.cutter-button-group button` selectors remain absent.
- The next button-related debt is concentrated in pre-ready/login/desktop setup controls and sidebar cache menu controls, not the normal migrated page buttons.

## Batch 5.31 Progress: Settings Cut Mode Foundation Button Cleanup

Date: 2026-06-19.

Route/components in scope:

- Settings
- Default cut-mode segmented control
- UI Foundation `Button`

Change made:

- Migrated the Settings default cut-mode choices from raw native `button` elements to UI Foundation `Button`.
- Removed the global `.cutter-cut-mode-toggle button` and `.cutter-cut-mode-toggle button.is-active` visual rules.
- Removed the Settings route-specific `.cutter-cut-mode-toggle button` and `.cutter-cut-mode-toggle button.is-active` visual rules.
- Removed the broad `.cutter-app .ml-button` rule that was overriding Foundation Button background, border, color, radius, padding, and font.
- Added regression coverage so Foundation Button visuals cannot be globally re-overridden by cutter app CSS and the Settings cut-mode control cannot reintroduce raw button styling.

Visual ownership result:

- Button color, border, radius, active state, font weight, and sizing now come from UI Foundation `Button`.
- Settings owns only the cut-mode group container layout.
- The active default cut mode now uses the shared `primary` button semantics instead of a page-local blue pill.
- The app no longer globally overrides `.ml-button`, so Foundation variants can behave consistently across pages.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 104 tests, 104 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `140.62 kB`, gzip `19.12 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 6,031 lines.
- Search confirmed production Cutter source has no `.cutter-app .ml-button`, `.cutter-cut-mode-toggle button`, `.ml-card-body`, `.cutter-primary-button`, `.cutter-secondary-button`, `.cutter-danger-button`, `.cutter-row-actions button`, or `.cutter-button-group button` selectors.
- The built CSS asset dropped from `141.59 kB` after Batch 5.30 to `140.62 kB`.

Remaining debt moved forward:

- Pre-ready/login and desktop first-run still use native button selectors and should be handled as a separate state-surface migration, not mixed into normal page controls.
- Sidebar cache menu still uses native menu buttons and should be reviewed under Sidebar/footer ownership.
- Settings still uses native `select` controls; decide later whether v1 needs a small Foundation Select or whether native selects remain acceptable for now.

## Batch 5.32 Progress: Sidebar Cache Button Foundation Cleanup

Date: 2026-06-20.

Route/components in scope:

- Cutter shell sidebar footer
- Cache summary entry
- Cache clear menu action
- UI Foundation `Button`

Layer classification:

- Component + sidebar shell.
- This is a persistent shell/status surface, not a normal page body control.
- The page routes should not own this cache button's visual treatment.

Change made:

- Migrated the sidebar cache summary toggle from a raw native `button` to UI Foundation `Button`.
- Migrated the cache menu clear action from a raw native `button` to UI Foundation `Button` with the shared danger variant.
- Removed the cache button's private border, background, hover, expanded, radius, color, and font styling.
- Removed the cache menu's raw `button` visual selector.
- Kept only shell-specific sizing and menu placement rules.
- Added regression coverage so the sidebar cache controls cannot reintroduce raw menu button styling.

Visual ownership result:

- Cache button variant, focus, text color, radius, disabled behavior, and danger action semantics now come from UI Foundation.
- Sidebar owns only the compact placement of the cache control inside the footer.
- Normal migrated pages no longer carry sidebar cache menu button debt forward.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 104 tests, 104 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `140.00 kB`, gzip `19.03 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 6,002 lines.
- Search confirmed old `.cutter-sidebar-cache-menu button`, `.cutter-sidebar-cache-button:hover`, and `.cutter-sidebar-cache-button[aria-expanded="true"]` selectors are absent.
- The built CSS asset dropped from `140.62 kB` after Batch 5.31 to `140.00 kB`.

Remaining debt moved forward:

- Pre-ready/login and desktop first-run controls still use raw native button selectors; handle them as a separate state-surface migration.
- Project switcher and project-card action areas should be audited next for route-specific native button/icon selectors.
- Settings native `select` controls remain a later component decision, not a blocker for button cleanup.

## Batch 5.33 Progress: Project Shell Action Cleanup

Date: 2026-06-20.

Route/components in scope:

- Project home shell-adjacent controls
- Cutter project switcher dropdown
- Removed legacy project action surfaces
- UI Foundation `Button`

Layer classification:

- Component + shell/page composition cleanup.
- The project switcher dropdown belongs to the workbench chrome, not an individual page.
- The removed project action/recent-search selectors were dead CSS debt: no production component referenced them.

Change made:

- Removed unused `.cutter-project-actions`, `.cutter-project-detail-actions`, and `.cutter-recent-searches` styles.
- Migrated the project switcher dropdown actions from raw `button`/`a` visual styling to UI Foundation `Button`.
- Removed `.cutter-project-switcher a, .cutter-project-switcher button` and hover rules.
- Kept only shell-specific dropdown action sizing via `.cutter-project-switcher-action`.
- Added regression coverage so these legacy project surfaces and project switcher raw button styles cannot return silently.

Visual ownership result:

- Project switcher action states now inherit Foundation Button variant, focus, typography, and hover behavior.
- CSS no longer carries unused project home action panels from older UI iterations.
- Project home retains business layout while shedding obsolete visual rules.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 105 tests, 105 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `138.78 kB`, gzip `18.89 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 5,937 lines.
- Search confirmed old `.cutter-project-actions`, `.cutter-project-detail-actions`, `.cutter-recent-searches`, `.cutter-project-switcher a,`, and `.cutter-project-switcher button` selectors are absent from production Cutter CSS.
- The built CSS asset dropped from `140.00 kB` after Batch 5.32 to `138.78 kB`.

Remaining debt moved forward:

- Project cards still have multiple historical rule blocks and should be consolidated only when the card/list visual model is reviewed as a whole.
- Login and desktop first-run state surfaces still use raw native button selectors; handle separately from normal app routes.
- Sidebar theme switch remains a shell state control with native button styling and is a good future shell cleanup candidate.

## Batch 5.34 Progress: Removed Dead Sidebar Theme Switch CSS

Date: 2026-06-20.

Route/components in scope:

- Cutter shell sidebar CSS
- Removed sidebar theme switch remnants

Layer classification:

- Shell cleanup.
- `cutter-sidebar-theme-switch` no longer exists in production JSX and should not be migrated.
- Keeping unused shell CSS creates false styling surfaces and makes future Shell work harder to reason about.

Change made:

- Removed the original `.cutter-sidebar-theme-switch` container and raw button styles.
- Removed the duplicated Material-style `.cutter-sidebar-theme-switch button` rules.
- Removed the later combined toggle rule entry that grouped `.cutter-sidebar-theme-switch` with active local view/cut mode controls.
- Added regression coverage so the deleted sidebar theme switch selector cannot return silently.

Visual ownership result:

- Sidebar CSS no longer contains a phantom theme switch surface.
- Active theme/display selection remains in Settings, where it currently belongs.
- The Shell style surface is smaller and easier to audit.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 105 tests, 105 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `137.42 kB`, gzip `18.71 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 5,875 lines.
- Search confirmed `.cutter-sidebar-theme-switch` is absent from production Cutter source except the regression test.
- The built CSS asset dropped from `138.78 kB` after Batch 5.33 to `137.42 kB`.

Remaining debt moved forward:

- Project card rules still have multiple historical layers and should be consolidated as a dedicated card-model cleanup.
- Login and desktop first-run state surfaces still need a separate Foundation Button migration.
- Material locator still has the largest page-specific styling surface and should remain a final dedicated batch.

## Batch 5.35 Progress: Project Card Rule Consolidation

Date: 2026-06-20.

Route/components in scope:

- Cutter project home
- Project card list and selected project card visuals
- Project card CSS regression coverage

Layer classification:

- Page composition cleanup with component-boundary guardrails.
- No React structure, data loading, search, cut, cache, or auth behavior changed.
- The card sizing rule belongs to the `project-home` route-scoped composition layer until a reusable project/media card primitive is promoted into UI Foundation.

Change made:

- Removed dead `.cutter-project-card-body` and `.cutter-project-metrics` CSS. These classes no longer exist in the current project home JSX.
- Removed unused project-card typography references from older Material/Open Design style groups.
- Consolidated the current project-home card grid rule so it owns `repeat(auto-fill, 262px)`, `justify-content: start`, `align-content: start`, and right scrollbar gutter padding in one route-scoped block.
- Consolidated the current project-home card size rule so card width and aspect ratio are fixed by the route-scoped block instead of late-file overrides.
- Removed the `nth-of-type(3)` project-card special case that made card position depend on item order.
- Removed `design-home-card-*` `:has()` special cases that were only for old visual reference captures and should not affect production card behavior.
- Added regression coverage to prevent dead project-card body/metrics selectors, design-reference image special cases, and ordinal card transforms from returning.

Visual ownership result:

- Project card dimensions no longer depend on card count or ordinal position.
- The active project-home card model is easier to inspect because sizing no longer requires reading a late-file override.
- Production CSS no longer carries project-card classes that have no JSX owner.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 105 tests, 105 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `134.18 kB`, gzip `18.39 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 5,769 lines.
- Search confirmed `.cutter-project-card-body`, `.cutter-project-metrics`, `design-home-card-`, and `.cutter-project-card:nth-of-type(3)` are absent from production Cutter CSS. They appear only in regression assertions.
- The built CSS asset dropped from `137.42 kB` after Batch 5.34 to `134.18 kB`.

Remaining debt moved forward:

- Earlier global project-card fallback rules still exist and should be removed only after verifying there is no non-ready/desktop first-run dependence on them.
- Project detail panel still has several route-scoped composition rules and should be reviewed as part of the next project-home cleanup pass.
- Login and desktop first-run state surfaces still need a separate Foundation Button migration.
- Material locator still has the largest page-specific styling surface and should remain a final dedicated batch.

## Batch 5.36 Progress: Removed Legacy Non-Ready Project Home Route Rules

Date: 2026-06-20.

Route/components in scope:

- Cutter project home Shell/page composition
- Legacy non-`data-cutter-web-ready` project-home route CSS

Layer classification:

- Shell/page composition cleanup.
- The production Cutter Shell now uses `data-cutter-web-ready` route-scoped geometry and shared UI Foundation shell rules.
- The older `.cutter-app[data-cutter-route="project-home"]` block was a stale route-level fallback that duplicated tokens, app background, hero spacing, project-home width, and note typography.

Change made:

- Removed the old `.cutter-app[data-cutter-route="project-home"]` route block.
- Removed legacy non-ready project-home rules for `.cutter-project-home`, `.cutter-page-main`, `.cutter-project-hero`, `.cutter-eyebrow`, `.cutter-project-hero h1`, and `.cutter-note`.
- Strengthened regression coverage so production Cutter CSS cannot reintroduce `.cutter-app[data-cutter-route="project-home"]` rules; project-home styling must stay under the current ready-state Shell layer.

Visual ownership result:

- Project-home background, spacing, and hero typography now have one active route-scoped owner in the ready-state Shell path.
- The page no longer carries a second token/background system that could silently affect first render or future route-specific overrides.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 105 tests, 105 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `132.39 kB`, gzip `18.28 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 5,694 lines.
- Search confirmed `.cutter-app[data-cutter-route="project-home"]` is absent from production Cutter CSS and appears only in regression assertions/documentation.
- The built CSS asset dropped from `134.18 kB` after Batch 5.35 to `132.39 kB`.

Remaining debt moved forward:

- Project detail panel still has multiple ready-state route-scoped adjustment blocks and should be consolidated next.
- Earlier global project-home fallback rules still exist for base rendering and should be audited carefully before removal.
- Login and desktop first-run state surfaces still need a separate Foundation Button migration.
- Material locator still has the largest page-specific styling surface and should remain a final dedicated batch.

## Batch 5.37 Progress: Project Detail Ready-State Rule Consolidation

Date: 2026-06-20.

Route/components in scope:

- Cutter project home
- Project detail inspector panel
- Project list/detail shared surface
- Project grid scroll ownership

Layer classification:

- Page composition cleanup with Shell scroll-ownership guardrails.
- No React structure, project data, search, cut, cache, or auth behavior changed.
- Project detail remains route-scoped composition until a reusable `InspectorPanel` or media-detail primitive is promoted into UI Foundation.

Change made:

- Consolidated the current project-home list/detail surface rule so both panels share one soft surface definition: fixed height, light border, radius, background, and elevation.
- Consolidated `.cutter-project-detail` geometry into the main ready-state route block: static positioning, explicit grid rows, contained vertical scrolling, stable scrollbar gutter, and sticky footer controls.
- Moved detail cover max-height, detail definition-list min-height, row separator color, text color/weight, sticky controls, and full-width Foundation button sizing into the main ready-state detail block.
- Removed the late "Desktop shell containment" duplicate detail blocks that redefined cover, list, controls, button width, and scroll behavior.
- Removed the generic route selector that styled `.cutter-project-detail dl div`; project detail row styling now belongs to the project-home route owner.
- Consolidated `.cutter-project-grid` layout and scroll ownership into one route-scoped rule. The grid no longer needs a later duplicate block only to add `overflow` and `scrollbar-gutter`.
- Added regression coverage to prevent the removed duplicated selectors and comments from returning.

Visual ownership result:

- Project detail panel no longer requires reading multiple late-file overrides to understand its size, scrolling, and control behavior.
- Project grid sizing and scroll ownership now have one active project-home owner.
- The homepage detail inspector is still page-specific, but its current CSS is now localized and ready for a later `InspectorPanel` extraction.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 105 tests, 105 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `130.70 kB`, gzip `18.19 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 5,639 lines.
- Search confirmed the project-home route-scoped `.cutter-project-grid` rule appears once in production CSS.
- Search confirmed the removed `Desktop shell containment` production comment and generic `.cutter-app[data-cutter-web-ready][data-cutter-route] .cutter-project-detail dl div` selector are absent from production CSS and appear only in regression assertions.
- The built CSS asset dropped from `132.39 kB` after Batch 5.36 to `130.70 kB`.

Remaining debt moved forward:

- Earlier global project-home fallback rules still exist for `.cutter-project-board`, `.cutter-project-grid`, `.cutter-project-card`, and related base selectors. They should be removed only after verifying there is no non-ready or desktop first-run dependency on them.
- Project hero/search/board sizing still carries route-specific composition values and should be audited as the next project-home cleanup pass.
- Login and desktop first-run state surfaces still need a separate Foundation Button migration.
- Material locator remains the largest page-specific styling surface and should remain a final dedicated batch.

## Batch 5.38 Progress: Project Home Legacy Global Layer Cleanup

Date: 2026-06-20.

Route/components in scope:

- Cutter project home
- Legacy global `.cutter-project-*` page composition rules
- Open Design / Material / compact / Spectrum-era project-home selector remnants

Layer classification:

- CSS ownership cleanup for project-home page composition.
- No React structure, project data, search, cut, cache, auth, or runtime behavior changed.
- The route-scoped `data-cutter-web-ready` project-home rules are now the production visual owner for homepage layout and surfaces.

Change made:

- Removed the early unscoped project-home base layer for `.cutter-project-home`, `.cutter-project-hero`, `.cutter-project-board`, `.cutter-project-grid`, `.cutter-project-card`, `.cutter-project-cover`, `.cutter-project-detail`, `.cutter-project-detail-cover`, `.cutter-project-search-form`, and related subselectors.
- Removed project-home selectors from the old Open Design convergence/fidelity groups so they no longer restyle homepage headings, surfaces, search controls, boards, cards, media covers, and responsive behavior from a second layer.
- Removed project-home selectors from Material, compact, and Spectrum-like legacy groups.
- Removed project-home selectors from generic ready-state width, overflow, surface, and scroll fallback groups.
- Left route-scoped ready-state project-home rules in place as the current single production owner.
- Added regression coverage to prevent unscoped/global project-home selectors and generic ready-state project list/detail fallbacks from returning.

Visual ownership result:

- Project home no longer has a hidden global visual layer competing with the route-scoped ready-state owner.
- The homepage CSS is smaller and more readable: future changes should now happen in the project-home route owner or a promoted UI Foundation component, not in broad legacy fallback groups.
- The current screenshot shows no obvious homepage structure regression after the cleanup.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 105 tests, 105 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `121.43 kB`, gzip `17.09 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 5,093 lines.
- Search confirmed no unscoped/global selectors remain for `.cutter-project-home`, `.cutter-project-hero`, `.cutter-project-board`, `.cutter-project-grid`, `.cutter-project-card`, `.cutter-project-cover`, `.cutter-project-detail`, `.cutter-project-detail-cover`, or `.cutter-project-search-form`.
- The built CSS asset dropped from `130.70 kB` after Batch 5.37 to `121.43 kB`.

Remaining debt moved forward:

- Route-scoped project-home still contains page-specific hero, search, board, list, detail, and responsive composition rules; these should be consolidated further before extracting durable primitives.
- Late route-scoped project-home search and button sizing rules should be audited in a future project-home control migration.
- Login and desktop first-run state surfaces still need a separate Foundation Button migration.
- Material locator remains the largest page-specific styling surface and should remain a final dedicated batch.

## Batch 5.39 Progress: Project Home Route-Scoped Override Consolidation

Date: 2026-06-20.

Route/components in scope:

- Cutter project home
- Project-home hero/search/board/list responsive composition
- Project-home SearchBox and card action button sizing

Layer classification:

- Page composition cleanup inside the existing route-scoped project-home owner.
- No React structure, project data, search, cut, cache, auth, or runtime behavior changed.
- This batch removed late-file route-specific overrides instead of changing the UI direction.

Change made:

- Moved the final project-home page-main containment values into the main project-home route block: full-height grid rows and hidden overflow.
- Moved the final hero, search, and board grid values into the main project-home route block.
- Moved project-home SearchBox width and project-home control height rules into the route owner.
- Moved project-home card action button height into the route owner.
- Moved project-home responsive rules next to the route block so the homepage layout has one readable ownership section.
- Removed the later duplicate project-home blocks from the shared scroll/containment section, desktop containment section, and material-search migration section.
- Added regression coverage for project-home rule counts so future late-file overrides are easier to catch.
- Restored the cache-management responsive breakpoint to its original `1180px` scope while cleaning up adjacent project-home rules.

Visual ownership result:

- Project-home layout values no longer require reading a main route block plus later overrides around the shared scroll section, desktop containment section, and material-search section.
- The homepage still has page-specific composition rules, but they now live together under the route owner instead of being scattered through unrelated migration layers.
- The current screenshot shows no obvious homepage structure regression after consolidation.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 105 tests, 105 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `120.23 kB`, gzip `17.00 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 5,060 lines.
- Project-home route-scoped selectors now appear only in the route owner block and its nearby responsive rules.
- The built CSS asset dropped from `121.43 kB` after Batch 5.38 to `120.23 kB`.

Remaining debt moved forward:

- Project-home still has a large page-specific visual block for hero, cards, detail, and empty states; the next cleanup should extract or normalize reusable primitives only after comparing with low-risk pages.
- Dialog, login, and desktop first-run state surfaces still need a separate Foundation Button/Form cleanup.
- Low-risk pages should be the next migration area before touching material search again.
- Material locator remains the largest and riskiest page-specific styling surface and should remain a final dedicated batch.

## Batch 5.40 Progress: Low-Risk Page Legacy SearchBox Cleanup

Date: 2026-06-20.

Route/components in scope:

- Cutter low-risk page family audit: settings, cache management, local library, public library.
- Shared SearchBox styling after migration to `@mixlab/ui-foundation`.
- Dead legacy `.cutter-search-box` CSS selectors.

Layer classification:

- Component ownership cleanup.
- `SearchBox` visual behavior belongs to UI Foundation `ml-search-box`.
- Page CSS may keep route/layout wrappers such as `.cutter-search-form` or `.cutter-project-search-box`, but must not keep the old `.cutter-search-box` component styling entry.
- No React structure, project data, search, cut, cache, auth, or runtime behavior changed.

Change made:

- Removed the early legacy `.cutter-search-box` base rule and input rule.
- Removed legacy responsive `.cutter-search-box` width handling.
- Removed `.cutter-search-box` from Open Design, Material-like, compact, Spectrum-like, and shared ready-state styling groups.
- Removed the route-wide ready-state `.cutter-search-box` focus/background override.
- Kept actual production layout classes that are still used, including `.cutter-search-form` and project-home search composition classes.
- Added regression coverage asserting production CSS no longer contains `.cutter-search-box`.

Visual ownership result:

- SearchBox styling now has a clearer ownership boundary: reusable control styling comes from UI Foundation, while pages only provide layout composition.
- The deletion removes one of the clearest examples of three historical style layers competing over the same control.
- Low-risk page screenshots show no obvious regression after the cleanup.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 105 tests, 105 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `118.58 kB`, gzip `16.79 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cache-management.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 4,973 lines.
- Search confirmed production CSS contains no `.cutter-search-box` selectors.
- The built CSS asset dropped from `120.23 kB` after Batch 5.39 to `118.58 kB`.

Remaining debt moved forward:

- `.cutter-local-empty-state`, `.cutter-public-library-pagination`, `.ml-inspector`, `.ml-form-group`, and related form/inspector rules still have multiple historical layers. They are actively used and should be consolidated in a larger low-risk page surface batch rather than removed opportunistically.
- Local/public library empty, loading, and pagination states should be normalized against UI Foundation `Card`, `Button`, `Badge`, and `InspectorPanel` ownership.
- Settings form rows and cache-management cards still contain page-specific density and row styling that should be reduced after the shared form/table/card layer is stable.
- Material locator remains out of scope for this batch and should remain the final dedicated migration area.

## Batch 5.41 Progress: Library Empty And Pagination Surface Consolidation

Date: 2026-06-20.

Route/components in scope:

- Cutter local library
- Cutter public library
- Shared library empty state class `.cutter-local-empty-state`
- Public library pagination class `.cutter-public-library-pagination`

Layer classification:

- Low-risk page state surface cleanup.
- These states are still page composition, but their visual owner should be the local/public library route block, not scattered historical global layers.
- No React structure, project data, search, cut, cache, auth, or runtime behavior changed.

Change made:

- Added route-scoped visual owners for local/public library empty states.
- Added a route-scoped visual owner for public-library pagination.
- Removed the early global `.cutter-local-empty-state` and `.cutter-public-library-pagination` blocks.
- Removed `.cutter-local-empty-state` from Open Design, Material-like, compact, and Spectrum-like global surface groups.
- Removed the old public-pagination min-height/color/border/background overrides from historical layers.
- Removed the route-wide pagination border override now that the public-library route owner owns its border.
- Added regression coverage requiring exactly one production visual owner for `.cutter-local-empty-state` and `.cutter-public-library-pagination`.

Visual ownership result:

- Local/public library empty states no longer inherit shape, border, and background from several unrelated design-era layers.
- Public-library pagination no longer depends on a base rule plus later ready-state overrides.
- The current screenshots show no obvious regression in library empty state or public library grid/inspector layout.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 106 tests, 106 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `118.88 kB`, gzip `16.77 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cache-management.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 4,963 lines.
- Search confirmed `.cutter-local-empty-state` and `.cutter-public-library-pagination` production visual owners are route-scoped.
- The built CSS asset is `118.88 kB`; the small increase from Batch 5.40 is expected because the new route owner contains the full state definition instead of inheriting it from several unrelated historical layers.

Remaining debt moved forward:

- `.ml-inspector`, `.ml-inspector-header`, `.ml-inspector-body`, `.ml-form-group`, `.ml-form-group-title`, and `.ml-form-row` still have broad global and route-scoped overrides. They should be the next low-risk consolidation target.
- Settings and cache-management still contain page-specific form/card row density styling that should be reduced only after the shared inspector/form surface cleanup.
- Generic `.cutter-empty-state` and `.cutter-video-empty` are still used by non-library pages and material locator; they should be handled separately to avoid cross-page regressions.
- Material locator remains out of scope and should remain the final dedicated migration area.

## Batch 5.42 Progress: Dead Form Surface And Early Inspector Cleanup

Date: 2026-06-20.

Route/components in scope:

- Cutter settings page CSS audit.
- Shared low-risk page inspector/form surface cleanup.
- Dead `ml-form-*` and `ml-grouped-form` production CSS selectors.

Layer classification:

- CSS debt deletion.
- `ml-form-*` was not an active production component contract in cutter web; settings now uses `Card` plus `cutter-info-*` rows instead.
- InspectorPanel remains an active UI Foundation component, but cutter web still has route-specific inspector overrides that require a later, safer consolidation batch.
- No React structure, project data, search, cut, cache, auth, or runtime behavior changed.

Change made:

- Removed the remaining dead settings `.ml-grouped-form` scroll selector.
- Removed previously unused `.ml-form-row`, `.ml-form-group`, `.ml-form-group-title`, and `.ml-form-label` style ownership from cutter production CSS.
- Removed an early duplicate `.cutter-app .ml-inspector` color/background rule and `.ml-inspector-header` background rule; active inspector surfaces are still covered by later route and UI Foundation rules.
- Added regression coverage asserting cutter production CSS no longer contains `ml-form` or `ml-grouped-form`.

Visual ownership result:

- Cutter settings no longer carries a hidden form-surface layer that has no matching production markup.
- Low-risk page CSS has one fewer historical style layer competing with current `Card` and `InspectorPanel` surfaces.
- Inspector consolidation is intentionally not complete in this batch because active cut-task, library, cache, and operational inspector panes still need a route-by-route owner decision.

Verification:

- `rg -n "ml-form|ml-grouped-form" apps/cutter-web/src/styles.css` returned no matches.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 107 tests, 107 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `116.75 kB`, gzip `16.53 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cache-management.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 4,868 lines.
- The built CSS asset decreased from Batch 5.41's `118.88 kB` to `116.75 kB`.
- Dead form selectors now have automated test coverage so they should not silently return during later settings/cache migrations.

Remaining debt moved forward:

- `.ml-inspector`, `.ml-inspector-header`, and `.ml-inspector-body` still have multiple real route-specific layers. The next cleanup should classify each active inspector owner by route before deleting more.
- Settings still has page-specific `cutter-info-*`, password form, and appearance-control styling; these should be normalized only after the shared `Card`, `Button`, and form-control contracts are stable.
- Cache-management cards and tables still need a shared Card/Table density pass.
- Generic `.cutter-empty-state` and `.cutter-video-empty` are still used by multiple non-library surfaces and should be handled separately.

## Batch 5.43 Progress: Inspector Base Surface Ownership Cleanup

Date: 2026-06-20.

Route/components in scope:

- UI Foundation `InspectorPanel`.
- Cutter inspector usage in settings, cache management, public library, local library, cut tasks, source detail, search, cut list, and app loading/error states.
- Historical cutter CSS surface groups that still included `.ml-inspector`.

Layer classification:

- Component base surface ownership.
- `packages/ui-foundation/src/layout.css` owns the reusable `InspectorPanel` base: border, radius, surface, shadow, overflow structure, header, title, subtitle, body, and footer.
- Cutter route CSS may still own page-specific inspector placement, max-height, internal scrolling, and contextual content density.
- No React structure, project data, search, cut, cache, auth, or runtime behavior changed.

Change made:

- Removed `.cutter-app .ml-inspector` from an old Material-like surface group.
- Removed `.cutter-app .ml-inspector` from an old generic cutter surface group.
- Removed a remaining broad `.cutter-app .ml-inspector { background: ... }` duplicate.
- Kept active route/layout rules such as cut-task inspector height, library inspector body scroll, cache inspector content spacing, and route-ready soft surface treatment.
- Updated regression coverage so Inspector base visuals do not re-enter the old broad surface groups.

Visual ownership result:

- InspectorPanel base border/background/radius/shadow now has less competition from historical design-era groups.
- The still-active route-scoped inspector rules are now more clearly page composition and scroll rules, rather than hidden component restyling.
- Material locator remains untouched; this batch avoids the high-risk search/cut workflow surface.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 107 tests, 107 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `116.64 kB`, gzip `16.53 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cache-management.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/source-detail.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 4,862 lines.
- The built CSS asset decreased from Batch 5.42's `116.75 kB` to `116.64 kB`.
- InspectorPanel remains active across several pages, so this batch deliberately reduces duplicate base ownership without deleting route-specific layout rules.

Remaining debt moved forward:

- `.cutter-app .ml-inspector-header`, `.cutter-app .ml-inspector-title`, and `.cutter-app .ml-inspector-body` still have broad historical overrides. They need a separate header/body density audit because changing them affects multiple pages at once.
- `cutter-library-inspector`, `cutter-operational-inspector`, and `cutter-cache-inspector` still encode page-specific inspector variants; the next batch should classify which of those are true layout/content needs and which can move to Foundation tokens or be removed.
- Source detail, search, and cut-list use InspectorPanel but are not part of the current low-risk page family; they should be checked before broad inspector header/body cleanup.

## Batch 5.44 Progress: Inspector Header And Body Foundation Handoff

Date: 2026-06-20.

Route/components in scope:

- UI Foundation `InspectorPanel` header, title, and body primitives.
- Broad cutter CSS overrides for `.ml-inspector-header`, `.ml-inspector-title`, and `.ml-inspector-body`.
- Representative InspectorPanel consumers: settings, cache management, public library, local library, cut tasks, and source detail.

Layer classification:

- Component primitive handoff.
- Header/title/body spacing and typography belong to UI Foundation unless a route has an explicit density/layout reason.
- Page CSS may still own route-specific inspector grid rows, fixed widths, scroll containment, and dense content rows.
- No React structure, project data, search, cut, cache, auth, or runtime behavior changed.

Change made:

- Removed broad `.cutter-app .ml-inspector-header` from the old section-heading visual group.
- Removed broad `.cutter-app .ml-inspector-title` from the old section-heading typography group.
- Removed broad `.cutter-app .ml-inspector-body` padding overrides.
- Removed broad `.cutter-app .ml-inspector-body` from the generic overflow containment group.
- Kept route-scoped inspector rules for cut tasks, library, operational, and cache inspectors where they still encode actual page layout or content density.
- Added regression coverage forbidding broad `.cutter-app .ml-inspector-header/title/body` production rules.

Visual ownership result:

- Base InspectorPanel header/title/body now come from `packages/ui-foundation/src/layout.css`.
- Cutter production CSS has fewer page-era overrides competing with the shared component contract.
- Route-specific inspector variants are now easier to audit because remaining selectors are scoped by route or inspector variant.

Verification:

- `rg -n "\\.cutter-app \\.ml-inspector-(header|title|body)\\s*\\{" apps/cutter-web/src/styles.css` returned no matches.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 107 tests, 107 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `116.31 kB`, gzip `16.48 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cache-management.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/source-detail.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 4,841 lines.
- The built CSS asset decreased from Batch 5.43's `116.64 kB` to `116.31 kB`.
- Remaining `ml-inspector-header/title/body` selectors are route or variant scoped, not broad component restyling.

Remaining debt moved forward:

- `cutter-library-inspector`, `cutter-operational-inspector`, and `cutter-cache-inspector` still have their own title/header/body density. Next batch should decide whether these variants can share a smaller set of semantic inspector density classes.
- Cut tasks still has a route-specific InspectorPanel size and margin. That should be handled in the dedicated cut-tasks phase, not hidden in low-risk cleanup.
- Source detail and search use Foundation defaults now but should still be included in broad screenshot checks before declaring Inspector migration complete.

## Batch 5.45 Progress: Low-Risk Inspector Title Handoff

Date: 2026-06-20.

Route/components in scope:

- UI Foundation `InspectorPanel` title primitive.
- Low-risk Cutter inspector variants used by settings, cache management, public library, and local library:
  - `.cutter-library-inspector`
  - `.cutter-operational-inspector`
- Representative screenshot routes: settings, cache management, public library, local library, cut tasks, and source detail.

Layer classification:

- Component typography handoff.
- Inspector title typography belongs to `packages/ui-foundation/src/layout.css`.
- Page CSS may still own inspector placement, fixed widths, grid rows, scroll containment, and body content density.
- No React structure, project data, search, cut, cache, auth, or runtime behavior changed.

Change made:

- Removed the route-scoped `.cutter-library-inspector .ml-inspector-title` typography override.
- Removed the route-scoped `.cutter-operational-inspector .ml-inspector-title` typography override.
- Kept library and operational inspector header/body rules for now because they still encode page density and scroll/layout behavior.
- Added regression coverage to prevent those low-risk inspector variants from reintroducing page-local `.ml-inspector-title` typography overrides.

Visual ownership result:

- Library, settings, and cache inspector titles now inherit the shared UI Foundation `InspectorPanel` title scale and color.
- The remaining inspector variant CSS is more clearly limited to geometry, scroll containment, and dense body content.
- Cut-task inspector title rules remain untouched because cut tasks are handled as a dedicated high-risk page family.

Verification:

- `rg -n "cutter-library-inspector \\.ml-inspector-title|cutter-operational-inspector \\.ml-inspector-title|\\.cutter-app \\.ml-inspector-title|\\.cutter-app \\.ml-inspector-header\\s*\\{|\\.cutter-app \\.ml-inspector-body\\s*\\{" apps/cutter-web/src/styles.css apps/cutter-web/src/cutter-app.test.ts` returned no matches.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 107 tests, 107 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `115.99 kB`, gzip `16.46 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cache-management.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/source-detail.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` is now 4,827 lines.
- The built CSS asset decreased from Batch 5.44's `116.31 kB` to `115.99 kB`.
- Low-risk inspector variants no longer own their title typography locally.

Remaining debt moved forward:

- `.cutter-library-inspector` and `.cutter-operational-inspector` still own header/body geometry and should be audited next for shared density tokens or a smaller semantic inspector variant contract.
- `.cutter-cache-inspector` still owns body gap and section divider rules; this should be folded into the same low-risk inspector density pass.
- Cut-task inspector still has route-specific title/spacing rules and remains reserved for the dedicated cut-tasks migration phase.

## Batch 5.46 Progress: Library Inspector Content Token Handoff

Date: 2026-06-20.

Route/components in scope:

- UI Foundation text color tokens.
- Public library and local library detail inspectors using `.cutter-library-inspector`.
- Representative screenshot routes: public library, local library, settings, and cache management.

Layer classification:

- Token handoff.
- Library inspector content text should use UI Foundation text tokens instead of page-local hex colors.
- This batch does not change layout, card geometry, route data, search, cut, cache, auth, or runtime behavior.

Change made:

- Replaced `.cutter-library-inspector .cutter-inspector-stack` hard-coded secondary text color with `var(--ml-color-text-secondary)`.
- Replaced `.cutter-library-inspector .cutter-inspector-stack > strong` hard-coded primary text color with `var(--ml-color-text)`.
- Replaced `.cutter-library-inspector .cutter-inspector-stack > span/p` hard-coded secondary text color with `var(--ml-color-text-secondary)`.
- Added regression coverage to keep library inspector content colors tied to Foundation tokens.

Visual ownership result:

- Library detail content now follows the same theme token path as `InspectorPanel` title typography.
- Light/dark/system theme changes no longer need separate library-inspector content color edits.
- The remaining library inspector CSS is limited to layout, player sizing, and detail content density.

Verification:

- `rg -n "cutter-library-inspector \\.cutter-inspector-stack[\\s\\S]*#111827|cutter-library-inspector \\.cutter-inspector-stack[\\s\\S]*#667085|cutter-library-inspector \\.ml-inspector-title|cutter-operational-inspector \\.ml-inspector-title" apps/cutter-web/src/styles.css apps/cutter-web/src/cutter-app.test.ts` returned no matches.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 107 tests, 107 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `116.05 kB`, gzip `16.46 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cache-management.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` remains 4,827 lines.
- CSS asset size increased slightly from Batch 5.45's `115.99 kB` to `116.05 kB` because token references are longer than short hex literals, but ownership moved to the correct token layer.

Remaining debt moved forward:

- Cache management still contains several hard-coded text and status colors. It should get a dedicated tokenization pass because it includes metric cards, meters, checks, detail rows, and inspector content.
- Library inspector player background still uses a dark media placeholder color. It should be classified with media-player tokens rather than text tokens.
- Operational inspector header/body geometry still needs a density-contract decision before more deletion.

## Batch 5.47 Progress: Cache Management Color Token Handoff

Date: 2026-06-20.

Route/components in scope:

- Cache management page visual styles.
- UI Foundation text and status color tokens.
- Cache metric cards, cache meters, test result rows, cache detail rows, and cache inspector content.

Layer classification:

- Token handoff.
- Cache page layout density, grid rows, row heights, and scroll ownership remain page composition.
- Cache text colors and status meter colors belong to UI Foundation tokens.
- No cache data model, cache clearing behavior, runtime status, API calls, search, cut, auth, or desktop sidecar behavior changed.

Change made:

- Replaced cache secondary text color hard-coding with `var(--ml-color-text-secondary)`.
- Replaced cache primary metric/detail text color hard-coding with `var(--ml-color-text)`.
- Replaced cache meter default/syncing color with `var(--ml-color-accent)`.
- Replaced cache meter ready color with `var(--ml-color-ready)`.
- Replaced cache meter warning color with `var(--ml-color-warning)`.
- Replaced cache meter failed color with `var(--ml-color-failed)`.
- Replaced cache meter track background with a token-derived `color-mix(... var(--ml-color-border) ...)`.
- Added regression coverage so the cache management CSS slice cannot reintroduce hard-coded cache text/status colors.

Visual ownership result:

- Cache management now follows the same theme token path as the rest of the low-risk inspector and Card surfaces.
- Cache metric and meter colors can now be adjusted globally through tokens instead of page-local hex values.
- Page CSS still owns cache-specific layout density because the Foundation Card/Table contracts are not yet broad enough to absorb those rows safely.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 108 tests, 108 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `116.25 kB`, gzip `16.42 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/cache-management.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` remains 4,827 lines.
- The built CSS asset increased from Batch 5.46's `116.05 kB` to `116.25 kB` because token references and `color-mix(...)` are longer than short hex literals, while the visual ownership moved to the correct token layer.
- `apps/cutter-web/src/cutter-app.test.ts` now has 108 tests, adding explicit cache color ownership coverage.

Remaining debt moved forward:

- Cache management still owns row layout, card body density, panel grid, and detail-list separators locally. These should be handled by a future Card/Table density pass rather than tokenization.
- Several low-risk pages still use page-local border colors and soft surfaces. The next cleanup should decide whether these can be replaced with shared border/elevation tokens or should remain page composition.
- Operational inspector header/body geometry still needs a density-contract decision before more deletion.

## Batch 5.48 Progress: Cache Management Separator Token Handoff

Date: 2026-06-20.

Route/components in scope:

- Cache management page row separators.
- Cache test-result rows, cache detail rows, and cache inspector sections.
- UI Foundation subtle border token.

Layer classification:

- Token handoff.
- Cache row heights, grid columns, panel scroll ownership, and inspector content density remain page composition.
- No cache runtime, cache clearing, search, cut, auth, API, or desktop sidecar behavior changed.

Change made:

- Replaced `.cutter-cache-check-list > div` hard-coded separator color with `var(--ml-border-subtle)`.
- Replaced `.cutter-cache-detail-list div` hard-coded separator color with `var(--ml-border-subtle)`.
- Replaced `.cutter-cache-inspector section` hard-coded separator color with `var(--ml-border-subtle)`.
- Added regression coverage so the cache management CSS slice cannot reintroduce `rgba(118, 134, 159, 0.08)` separators.

Visual ownership result:

- Cache management now follows the same subtle-border token path as the shared UI Foundation surfaces.
- Page CSS still owns cache-specific layout density only; separator color ownership moved to the token layer.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 109 tests, 109 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `116.26 kB`, gzip `16.43 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/cache-management.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`.

Observed cleanup result:

- `apps/cutter-web/src/styles.css` remains 4,827 lines.
- `apps/cutter-web/src/cutter-app.test.ts` now has 109 tests, adding explicit cache separator token ownership coverage.
- The cache management CSS slice no longer contains `rgba(118, 134, 159, 0.08)` separators.

Remaining debt moved forward:

- Several library and cut-task page-local `rgba(118, 134, 159, ...)` border/surface rules remain and need separate classification before migration.
- Cache management still owns row layout and panel density locally; that should move only after the shared Table/Card density contract is broad enough.

## Batch 5.49 Progress: Library Empty And Pagination Token Handoff

Date: 2026-06-20.

Route/components in scope:

- Local library empty state.
- Public library empty state.
- Public library pagination/load-more strip.
- UI Foundation subtle border and surface tokens.

Layer classification:

- Token handoff for border and translucent surface ownership.
- Empty-state size, centering, copy layout, and pagination flex layout remain page composition until a shared EmptyState component contract exists.
- Public/local library data, filters, pagination behavior, inspector selection, search, cut, cache, auth, and desktop behavior were not changed.

Change made:

- Replaced library empty-state hard-coded border color with `var(--ml-border-subtle)`.
- Replaced public-library pagination hard-coded border color with `var(--ml-border-subtle)`.
- Replaced library empty-state hard-coded translucent white background with `color-mix(in srgb, var(--ml-color-surface) 62%, transparent)`.
- Replaced public-library pagination hard-coded translucent white background with `color-mix(in srgb, var(--ml-color-surface) 62%, transparent)`.
- Updated regression coverage so the route-scoped empty and pagination visual-owner test expects Foundation token-derived values.

Visual ownership result:

- Local/public library empty states and public-library pagination now inherit their border and surface tone from the shared Foundation theme.
- The page still owns the existence and layout of these regions, which is correct until a shared EmptyState primitive is introduced.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 109 tests, 109 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `116.36 kB`, gzip `16.42 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cache-management.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`.

Observed cleanup result:

- `apps/cutter-web/src/styles.css` remains 4,827 lines.
- Local/public library empty-state and public-library pagination styling no longer hard-code the target border/surface colors.
- The existing library visual-owner regression test now checks token-derived border and surface ownership.

Remaining debt moved forward:

- Library view toggles and inspector panels still have page-local border/surface/elevation values and need a separate component-vs-token classification before migration.
- Cut-task and material-locator page-local borders remain out of this batch because they belong to higher-risk route families.

## Batch 5.50 Progress: Library View Toggle Shell Token Handoff

Date: 2026-06-20.

Route/components in scope:

- Local library view-mode toggle.
- Local library orientation toggle.
- Public library orientation toggle.
- The shared `.cutter-local-view-toggle` segmented-control shell used by library pages.

Layer classification:

- Component/token handoff for the segmented-control shell border and surface color.
- The toggle options already use UI Foundation `Button`; no button implementation changed.
- The library page still owns placement, grouping, and which filters appear. That is page composition.
- No public/local library data, filtering behavior, selection, inspector detail, search, cut, cache, auth, or desktop behavior changed.

Change made:

- Replaced library route-specific `.cutter-local-view-toggle` hard-coded border color with `var(--ml-border-subtle)`.
- Replaced library route-specific `.cutter-local-view-toggle` hard-coded translucent white background with `color-mix(in srgb, var(--ml-color-surface) 70%, transparent)`.
- Removed `.cutter-local-view-toggle` from the later all-route border-color override so the library toggle shell is not silently pushed back to a page-local border color.
- Added regression coverage verifying the library toggle shell uses Foundation token-derived values and is no longer part of the broad route override.

Visual ownership result:

- The segmented-control shell now follows the same Foundation border/surface path as library empty states, pagination, and cache separators.
- The internal buttons remain Foundation `Button` instances.
- This reduces one layer of CSS cascade conflict for a repeated low-risk control.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 110 tests, 110 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `116.33 kB`, gzip `16.42 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cache-management.png`.

Observed cleanup result:

- `apps/cutter-web/src/styles.css` remains 4,827 lines.
- `apps/cutter-web/src/cutter-app.test.ts` now has 110 tests, adding explicit library segmented-control shell ownership coverage.
- The library-specific `.cutter-local-view-toggle` rule no longer hard-codes the target border/surface colors.
- `.cutter-local-view-toggle` is no longer included in the later broad all-route border-color override.

Remaining debt moved forward:

- Library inspector panels still have page-local border/surface/elevation values and should be handled as an InspectorPanel density/variant decision.
- Existing generic `.cutter-local-view-toggle` definitions remain because they also provide pre-route and settings-compatible baseline geometry; a later component extraction can collapse them further once the shared segmented-control contract exists.

## Batch 5.51 Progress: Library Inspector Shell Token Handoff

Date: 2026-06-20.

Route/components in scope:

- Local library material detail inspector.
- Public library source detail inspector.
- Shared `InspectorPanel` shell styling on cutter routes.

Layer classification:

- Component/shell token handoff for the inspector panel border, surface, and elevation.
- Library pages still own which metadata appears and the internal detail stack spacing. That is page composition.
- Library video/player preview styling remains media-specific page composition and is intentionally out of this batch.
- No source-video data, filtering, search, cut, cache, auth, or desktop behavior changed.

Change made:

- Removed the library-specific inspector shell's page-local `display: grid`, row template, border, radius, translucent background, and shadow.
- Kept only the library inspector width and content-density rules required by the existing page layout.
- Removed the library inspector header's hard-coded separator color so the shared `InspectorPanel` header owns the divider.
- Replaced the broad cutter-route `.ml-inspector` hard-coded border/background/shadow values with `var(--ml-border-subtle)`, `color-mix(in srgb, var(--ml-color-surface) 72%, transparent)`, and `var(--ml-shadow-panel)`.
- Added regression coverage proving the library inspector shell no longer redefines its own visual frame and that the shared inspector override is token-derived.

Visual ownership result:

- The library detail panels now use the same shared `InspectorPanel` shell path as other migrated pages.
- Page CSS no longer redraws a second inspector card inside the Foundation component.
- This removes one more source of inconsistent border, shadow, and radius behavior between local/public library and other low-risk pages.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 110 tests, 110 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `116.18 kB`, gzip `16.43 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cache-management.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`

Observed cleanup result:

- `apps/cutter-web/src/styles.css` no longer gives `.cutter-library-inspector` its own panel frame.
- The shared cutter-route `.ml-inspector` override now uses Foundation/Shell tokens instead of raw rgba values.
- `apps/cutter-web/src/cutter-app.test.ts` keeps 110 tests and now guards against library inspector frame styles returning.

Remaining debt moved forward:

- Cut-task inspector density/elevation remains route-specific and should be handled with the dedicated cut-task migration batch.
- Library media preview still uses a page-local dark player background; that should become a media token or media component decision in a later cleanup batch.

## Batch 5.52 Progress: Operational Control And Sidebar Token Handoff

Date: 2026-06-20.

Route/components in scope:

- Settings page operational controls:
  - Appearance select.
  - Default cut-mode segmented shell.
  - Settings doctor/status panel shell.
- Shared cutter sidebar footer:
  - Engine/status card separators.
  - User entry name/icon color.
  - Cache action popover shell.
- Shared quiet route-surface overrides for low-risk pages.

Layer classification:

- Shell/token handoff for repeated border, surface, text, and popover elevation values.
- Settings still owns which preferences appear and how they are grouped. That is page composition.
- Sidebar footer still owns current-project/cache/status content. Sidebar geometry and visual tokens remain shell responsibility.
- No settings persistence, cache clearing, login, search, cut, or runtime behavior changed.

Change made:

- Replaced settings page hard-coded control borders with `var(--ml-border-subtle)`.
- Replaced settings select/control text and surface colors with `var(--ml-color-text)` and `color-mix(... var(--ml-color-surface) ...)`.
- Replaced settings doctor panel border with `var(--ml-border-subtle)`.
- Replaced sidebar status-card separators, user-name color, and user-icon color/background with shared tokens.
- Replaced sidebar cache popover border, background, and shadow with `var(--ml-border-subtle)`, `color-mix(... var(--ml-color-surface) ...)`, and `var(--ml-shadow-panel)`.
- Replaced the broad cutter-route quiet-control border override with `var(--ml-border-subtle)`.
- Added regression coverage proving these low-risk shared controls no longer depend on local rgba/hex values.

Visual ownership result:

- Settings controls and sidebar footer no longer create a separate local palette.
- Sidebar cache popover now follows the same shell elevation token path as migrated panels.
- This reduces the chance that changing one page's border/contrast causes sidebar or settings drift.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 110 tests, 110 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `116.39 kB`, gzip `16.39 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cache-management.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`

Observed cleanup result:

- Settings operational controls no longer carry their own hard-coded border/surface/text palette.
- Sidebar footer status and cache popover now use shared tokens for separators, surface, icon color, and elevation.
- A targeted search still finds hard-coded colors in later route families, but not in the migrated settings/sidebar-footer control slice. Those remaining hits belong to project-home, cut-tasks, and material-locator follow-up batches.

Remaining debt moved forward:

- Password form inputs still use page-local form styling because `ui-foundation` v1 does not yet include a general `Input` component.
- Cut-task and material-locator route-specific dense surfaces remain out of this low-risk cleanup batch.

## Batch 5.53 Progress: Cut Tasks Surface Token Handoff

Date: 2026-06-20.

Route/components in scope:

- Cut tasks page header and summary text.
- Cut tasks filter card, pipeline card, queue table, and detail inspector.
- Shared library/operational header color leftovers that were still visible in the same ready-state CSS region.
- Project-home panel/detail color leftovers that represented the same legacy route-local palette drift.

Layer classification:

- Token layer owns text, secondary text, subtle borders, and panel shadow values.
- `Table`, `Badge`, `Button`, and `InspectorPanel` still own their component states through `packages/ui-foundation`.
- Cut tasks page keeps only business composition: task filters, pipeline summary, table columns, detail fields, and action availability.
- No search, cut execution, cache, auth, project, or task runtime behavior changed.

Change made:

- Replaced cut-task header title and summary colors with `var(--ml-color-text)` and `var(--ml-color-text-secondary)`.
- Removed cut-task route ownership of the inspector frame: no route-local inspector border, radius, surface, shadow, or grid display remains.
- Kept only the cut-task inspector's layout sizing (`width`, `min-height`, `margin-top`) in route CSS.
- Replaced cut-task filter/pipeline/table surface border, background, and shadow with `var(--ml-border-subtle)`, `color-mix(... var(--ml-color-surface) ...)`, and `var(--ml-shadow-panel)`.
- Replaced cut-task detail dividers with `var(--ml-border-subtle)`.
- Replaced shared local/public library header title and summary hard-coded colors with text tokens.
- Replaced shared operational page header title hard-coded color with the text token.
- Replaced project-home note, section/detail heading, detail tools, panel border, panel shadow, and detail dividers with shared text/border/shadow tokens.
- Added regression coverage proving the cut-task slice no longer carries the legacy `#101828`, `#111827`, `#667085`, `rgba(118, 134, 159, ...)`, or `rgba(83, 103, 132, ...)` palette outside token declarations.

Visual ownership result:

- Cut tasks no longer has a private card/table/inspector palette.
- Low-risk shared page headers no longer leak old hard-coded text colors into the ready-state CSS region.
- Project-home panels now share the shell shadow token instead of carrying a private elevation value.
- Remaining cut-task route CSS is structural density and page composition, not component skinning.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 110 tests, 110 passed.
- `npm run build:cutter-web` passed; the built cutter CSS asset is now `116.27 kB`, gzip `16.33 kB`.
- `npm run visual:cutter-web` passed and refreshed `docs/acceptance/artifacts/m4-cutter-workbench/`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`

Remaining debt moved forward:

- A remaining direct hard-coded dark background exists in non-current legacy/media regions and should become a media/background token in a later cleanup batch.
- Project-home still has page-specific panel geometry and a visually heavy split between list and detail regions. The next Shell/Project Home surface cleanup should decide whether those panels should remain cards or become flatter workbench sections.
- Material-locator remains the highest-risk route and is intentionally not migrated in this batch.

## Batch 5.54 Audit: Shell Geometry And Project Home Surface Ownership

Date: 2026-06-20.

Observed current-state facts:

- `cutter-content` is already reset to `padding: 0` in the ready-state shell reset.
- The visible inset around normal pages currently comes from the shared ready-state `.cutter-page { padding: 17px 22px 31px; }`, not from `cutter-content`.
- `ml-workbench.cutter-workspace` is already treated as a viewport region beside the sidebar: `height: 100vh`, `border-radius: 0`, `box-shadow: none`, `overflow: hidden`.
- Normal routes use `cutter-content` as the scroll owner; material search keeps content locked so its internal panes can scroll.
- Project home still carries large route-local surface decisions for `cutter-project-list-panel`, `cutter-project-detail`, project card sizing, cover sizing, and project board geometry.
- Earlier shell/page rules still exist above the ready-state blocks and are mostly neutralized by later selectors. They are cleanup candidates, but they should be deleted only after screenshots prove the ready-state rules fully cover the production routes.

Layer classification:

- Workbench fill, sidebar width, content scroll ownership, and normal-page inset belong to the Cutter Shell layer.
- Page-specific project grid, project detail information, and project action placement belong to page composition.
- Panel border/radius/shadow treatment belongs to `Card`/`InspectorPanel`/Shell tokens, not project-home private CSS.

Next recommended batch:

- Do not change `cutter-content`; it is already the correct zero-padding shell region.
- Decide and encode one normal-page inset contract on `.cutter-page`, then test it explicitly.
- Move project-home list/detail visual surface closer to shared `Card`/`InspectorPanel` tokens or flatten it if the accepted direction is a full workbench surface.
- Delete obsolete pre-ready or superseded shell/page padding rules only after `project-home`, `settings`, `cache-management`, `public-library`, `local-library`, and `cut-tasks` screenshots still pass.
- Keep material search out of this cleanup unless a Shell rule directly breaks its locked-pane scrolling.

## Batch 5.54 Progress: Shell Inset Contract And Project Home Panel Token Handoff

Date: 2026-06-20.

Route/components in scope:

- Cutter ready-state shell.
- Shared normal-page `.cutter-page` inset.
- Project home list/detail panel frame.

Layer classification:

- `cutter-content` remains Shell-owned and has no padding.
- Normal-page inset is a Shell contract exposed as CSS variables on `.cutter-app[data-cutter-web-ready]`.
- Project home still owns the project grid, hero, card positions, details, and actions as page composition.
- Project home list/detail panel border, radius, surface, and shadow now use shared shell/foundation tokens instead of private values.
- No project creation, search, selection, delete, rename, cache, auth, search, or cut behavior changed.

Change made:

- Added Shell variables:
  - `--cutter-page-inset-block-start: 17px`
  - `--cutter-page-inset-inline: 22px`
  - `--cutter-page-inset-block-end: 31px`
- Replaced the terminal ready-state `.cutter-page` literal padding with those variables.
- Replaced project-home list/detail panel `border-radius: 14px` with `var(--ml-radius-panel)`.
- Replaced project-home panel `rgba(255, 255, 255, 0.72)` background with `color-mix(... var(--ml-color-surface) ...)`.
- Kept project-home panel size, grid, scroll, and internal layout unchanged.
- Added regression coverage proving:
  - `cutter-content` stays padding-free.
  - normal-page inset is controlled through Shell variables.
  - project-home panel frame values are token-based, not local rgba/hard-coded radius/shadow values.

Visual ownership result:

- The workbench remains the full right-side viewport region.
- The page inset is now one Shell-level contract instead of an unexplained hard-coded terminal padding.
- Project-home panels no longer define an independent visual surface palette.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 110 tests, 110 passed.
- `npm run build:cutter-web` passed: CSS bundle `116.53 kB`, gzip `16.37 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
- `git diff --check` passed.

Remaining debt moved forward:

- Project-home still uses page-specific card/media layout rules because project cards are a business/media composition, not part of UI Foundation v1 yet.
- Some legacy pre-ready shell rules remain earlier in `styles.css`; delete them only after proving the terminal ready-state shell block fully covers production routes.

## Batch 5.55 Progress: Remove Superseded Open Design Shell Experiment Blocks

Date: 2026-06-20.

Route/components in scope:

- Cutter production CSS shell history.
- Shared page header, inspector, empty-state, and gallery experiment blocks.

Layer classification:

- Deleted rules were obsolete Shell/Page visual experiment layers, not current business layout.
- Current Shell authority remains the terminal `.cutter-app[data-cutter-web-ready]` block.
- Current route-specific composition remains in the route-scoped ready-state blocks.
- No project creation, search, selection, delete, rename, cache, auth, search, or cut behavior changed.

Change made:

- Removed the old `Open Design convergence layer: project-first cutter workspace` block.
- Removed the old `Open Design shell fidelity: project-first app shell and search workbench` block.
- Added regression coverage proving those old experiment markers cannot reappear.
- Kept the later Google Material/Spectrum/token blocks for now because they still carry active theme and component contracts.

Visual ownership result:

- Page header, content scroll ownership, and shell geometry are no longer split across those Open Design transition blocks.
- The CSS bundle got smaller instead of gaining another override layer.
- Remaining visible card/table/inspector polish belongs to low-risk page component migration, not Shell cleanup.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 110 tests, 110 passed.
- `npm run build:cutter-web` passed: CSS bundle `112.70 kB`, gzip `15.94 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
- `git diff --check` passed.

Remaining debt moved forward:

- Earlier base `.cutter-page`, `.cutter-page-header`, and Spectrum-era route rules still overlap with ready-state route rules; remove only after proving each selector is no longer an active visual owner.
- Settings, cache management, local library, and public library still need low-risk page migration to eliminate page-local card/table/inspector visual rules.
- Material locator remains intentionally excluded until lower-risk surfaces are stable.

## Batch 5.56 Progress: Low-Risk Content Row Pattern Handoff

Date: 2026-06-20.

Route/components in scope:

- Settings info groups and environment-check rows.
- Cache management test-result rows and cache-detail rows.
- Shared low-risk-page row separators, row typography, and flush card bodies.

Layer classification:

- `cutter-card-body-flush`, `cutter-data-list`, and `cutter-data-row` are shared Cutter content-pattern rules.
- Settings/cache pages now keep only page composition values such as columns, row height, row padding, and local form layout.
- Row borders, row typography, row text truncation, and flush card-body padding no longer belong to settings/cache private selectors.
- Settings page scroll ownership belongs to `settings .cutter-page-main`, not to an inner `cutter-info-groups` mini-scroll container.
- No cache, search, cut, auth, project, or runtime behavior changed.

Change made:

- Added shared content classes:
  - `.cutter-card-body-flush`
  - `.cutter-data-list`
  - `.cutter-data-row`
- Migrated settings info rows to `cutter-data-list cutter-info-list` and `cutter-data-row cutter-info-row`.
- Migrated settings doctor rows to `cutter-data-row cutter-settings-doctor-row`.
- Migrated cache test-result rows to `cutter-data-row cutter-cache-check-row`.
- Migrated cache detail rows to `cutter-data-row cutter-cache-detail-row`.
- Removed private settings/cache row border and font-weight ownership.
- Removed `settings .cutter-info-groups` as an inner scroll owner.
- Adjusted operational page header copy so `.cutter-eyebrow` is not treated as the normal description paragraph.
- Added regression coverage proving:
  - settings/cache use shared row classes in rendered HTML.
  - shared row separators come from `var(--ml-border-subtle)`.
  - settings/cache no longer own row border or row font-weight rules privately.
  - settings main content, not `cutter-info-groups`, owns settings-page scrolling.

Visual ownership result:

- Settings and cache management now share the same low-risk detail-row visual grammar.
- Settings information cards expand naturally instead of being clipped by an accidental inner scroll region.
- Cache management keeps the same card/table density while row separators and typography are centralized.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 110 tests, 110 passed.
- `npm run build:cutter-web` passed: CSS bundle `112.47 kB`, gzip `15.95 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cache-management.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
- `git diff --check` passed.

Remaining debt moved forward:

- Settings password form inputs still have page-local visual styling; migrate to a shared `Input`/form field only after UI Foundation v1 expands beyond the current approved component set.
- Cache stat cards still use page-local metric-card composition; keep for now because v1 does not yet include a metric component.
- Library media cards still use route-local media composition; public/local libraries are visually aligned but should eventually move to a shared `MediaCard` pattern after v1 stabilizes.
- Material locator remains intentionally excluded from this batch.

## Batch 5.57 Progress: Library Shared Empty And Detail Surface Handoff

Date: 2026-06-20.

Route/components in scope:

- Cutter local library.
- Cutter public library.
- Shared library empty state.
- Public-library pagination/load-more strip.
- Library detail inspector stack and video/player preview.

Layer classification:

- `LibraryGallery` remains a shared Cutter page pattern that composes UI Foundation `Card` and `Badge`.
- `.cutter-library-empty-state`, `.cutter-library-pagination`, `.cutter-library-detail-stack`, and `.cutter-library-detail-player` are shared low-risk library visual owners.
- Local/public library pages still own data mapping, project filtering, orientation filtering, selection state, and pagination availability.
- `cutter-public-library-pagination` remains only as a semantic page hook alongside `cutter-library-pagination`; it no longer owns a visual rule.
- No public/local library data loading, filtering, pagination behavior, search, cut, cache, auth, or desktop runtime behavior changed.

Change made:

- Replaced local-library and public-library empty state markup with the shared `cutter-library-empty-state` class.
- Added the shared `cutter-library-pagination` class to the public-library pagination strip and moved its visual rule there.
- Replaced `cutter-inspector-stack` in library inspectors with `cutter-library-detail-stack`.
- Replaced `cutter-local-detail-player` in local/public library detail previews with `cutter-library-detail-player`.
- Removed the old `cutter-local-empty-state` and `cutter-local-detail-player` production visual ownership.
- Removed the standalone `.cutter-public-library-pagination { ... }` visual owner.
- Updated screenshot validation to look for `cutter-library-empty-state` on local-library empty routes.
- Added regression coverage proving the shared library empty state, pagination, detail stack, and detail player are now the active visual owners.

Visual ownership result:

- Local and public library empty states now use one shared class instead of a local-library-named class reused by both pages.
- Public-library pagination no longer has its own page-private visual rule.
- Library inspector detail text and preview media now use library-specific shared detail classes instead of generic inspector-stack or local-library-only names.
- The remaining library visual rules are clearer page-pattern rules and no longer imply that public-library styling is inheriting from local-library implementation details.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 110 tests, 110 passed.
- `npm run build:cutter-web` passed: CSS bundle `111.18 kB`, gzip `15.83 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`
- `git diff --check` passed.

Remaining debt moved forward:

- `LibraryGallery` is still a shared Cutter page pattern inside `apps/cutter-web/src/features/library-gallery.tsx`; it should not be promoted to `packages/ui-foundation` until the approved component set expands to include `MediaCard`.
- Local project grouping was still using local-only visual names at this point; Batch 5.58 renames that pattern to shared library grouping classes while preserving the business grouping logic.
- Library grid, filter placement, and pagination availability remain page composition constraints.
- Material locator remains intentionally excluded from this low-risk library batch.

## Batch 5.58 Progress: Library Grouping Semantic Owner Cleanup

Date: 2026-06-20.

Route/components in scope:

- Local library "all materials" grouped-by-project view.
- Shared library grouping container and group header classes.

Layer classification:

- Local library still owns the grouping algorithm, project ordering, and which clips belong to each group. That is page business composition.
- The visual grouping container and group header should not use local-only names because the pattern is a library media grouping pattern, not a local-library control.
- No local clip data, project sorting, filtering, selection, source media, search, cut, cache, auth, or desktop runtime behavior changed.

Change made:

- Replaced `cutter-local-project-groups` with `cutter-library-group-list`.
- Replaced `cutter-local-project-group` with `cutter-library-group`.
- Added explicit `cutter-library-group-header` markup and moved the header text styling to that shared library grouping owner.
- Added regression coverage proving local library grouped view renders the new shared grouping classes and the old local-only class names do not return.

Visual ownership result:

- The local-library grouped view no longer exposes a local-only visual naming contract for a reusable library grouping pattern.
- The old `cutter-local-project-*` classes now exist only as negative regression assertions in tests.
- This keeps local/public library cleanup moving toward page-pattern ownership without prematurely promoting a `MediaCard` or grouped-media component into `packages/ui-foundation` v1.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 111 tests, 111 passed.
- `npm run build:cutter-web` passed: CSS bundle `111.16 kB`, gzip `15.83 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- `git diff --check` passed.

Remaining debt moved forward:

- Library media cards still remain a shared Cutter page pattern, not a Foundation component, until `MediaCard` is approved for a later UI Foundation version.
- Library grid width, orientation filters, and load-more availability remain page composition.
- Cut tasks is now the next meaningful page batch before returning to the highest-risk material-search page.

## Batch 5.59 Progress: Cut Tasks Superseded Reference Layer Cleanup

Date: 2026-06-20.

Route/components in scope:

- Cutter cut tasks page.
- Cut task table and detail inspector shell.
- Superseded cut-task reference CSS left from the old screenshot-matching pass.

Layer classification:

- Cut tasks still owns workflow layout: page grid, table density, pipeline-card body layout, text truncation, and right-side inspector column width.
- `Table`, `Badge`, `Button`, `Card`, and `InspectorPanel` remain the component owners for table structure, status tags, actions, pipeline card shell, and detail panel shell.
- `cutter-queue-inspector` and `cutter-queue-inspector-body` are cut-task page composition classes for the task-detail inspector's scroll ownership, not new Foundation components.
- No cut job data, retry behavior, refresh behavior, pipeline state, search, cache, auth, or desktop runtime behavior changed.

Change made:

- Deleted the superseded `Cut Tasks reference implementation for /Users/huaqihang/Desktop/Mixlab/3.png` CSS block.
- Removed the old cut-task-specific `.ml-inspector-header`, `.ml-inspector-title`, and `.ml-inspector-body` visual ownership from that block.
- Added `className="cutter-queue-inspector"` and `bodyClassName="cutter-queue-inspector-body"` to the cut-task `InspectorPanel`.
- Moved cut-task inspector max-height/scroll ownership from generic cut-task `.ml-inspector` selectors to the explicit queue inspector classes.
- Updated regression coverage so:
  - the old reference marker cannot return.
  - cut-task header color is not owned by route-specific typography rules.
  - the detail inspector layout width is proven by the page grid column, not a private inspector width rule.
  - cut-task inspector scrolling uses `cutter-queue-inspector-body` instead of broad `.ml-inspector-body`.

Visual ownership result:

- Cut tasks no longer has two stacked route-specific CSS layers fighting over the same page header and inspector surface.
- The detail panel remains a shared Foundation `InspectorPanel`; cut tasks only declares the scroll/layout class it actually needs.
- The built Cutter CSS dropped from Batch 5.58's `111.16 kB` to `109.71 kB`, which confirms this batch removed old CSS rather than adding another override layer.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 111 tests, 111 passed.
- `npm run build:cutter-web` passed: CSS bundle `109.71 kB`, gzip `15.74 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
- `git diff --check` passed.

Remaining debt moved forward:

- Cut-task filter count chips and action checkmark still use page composition CSS because UI Foundation v1 does not yet include segmented counters or icon-only status buttons.
- Cut-task source button and one-line text cells remain workflow-specific table cell composition.
- Material locator is still the highest-risk remaining page family and should stay isolated as the next major migration/audit batch.

## Batch 5.60 Progress: Material Search Empty-State Ownership Cleanup

Date: 2026-06-20.

Route/components in scope:

- Material locator / material search.
- Candidate-list empty/loading/no-results states.
- Video-preview empty/loading state.
- Generic legacy `.cutter-empty-state` and `.cutter-video-empty` dependency inside the material-search workbench.

Layer classification:

- Material-search empty states are page-composition state surfaces until `packages/ui-foundation` grows an approved `EmptyState` / `LoadingState` primitive.
- Candidate empty states and video empty states must not depend on old generic Cutter empty-state CSS because that class still has multiple historical owners.
- No search backend, transcript matching, drag selection, time-click selection, cut submission, cache, auth, or runtime behavior changed.

Change made:

- Replaced material-search candidate empty state markup from `cutter-empty-state` to `cutter-locator-empty-state`.
- Replaced material-search video empty state markup from `cutter-video-empty` to `cutter-locator-video-empty`.
- Replaced the material-search CSS override for generic `.cutter-empty-state` / `.cutter-video-empty` with a direct material-search page-composition owner.
- Renamed the old material-search reference comment to describe the remaining static poster chrome instead of pointing at an old screenshot reference.
- Added regression coverage so material search cannot silently reintroduce generic `cutter-empty-state` / `cutter-video-empty` dependencies or local overrides.

Visual ownership result:

- Material search no longer relies on global empty-state CSS that is still shared by project home and the legacy search page.
- The candidate and video empty states now have one direct owner in the material-search block.
- This reduces one more cascade conflict before deeper candidate/transcript/video layout cleanup.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 111 tests, 111 passed.
- `npm run build:cutter-web` passed: CSS bundle `110.38 kB`, gzip `15.79 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
- `git diff --check` passed.

Remaining debt moved forward:

- Generic `.cutter-empty-state` still exists for project-home and the legacy search page; remove or promote it only after those surfaces are migrated to a shared EmptyState primitive.
- Material-search candidate rows, transcript rows, side-panel sizing, and recent-task compact table remain workflow-specific page composition.

## Batch 5.61 Progress: Generic Empty-State Single Owner Cleanup

Date: 2026-06-20.

Route/components in scope:

- Project home empty project/detail states.
- Legacy grouped search page empty state.
- Generic `.cutter-empty-state` CSS used outside material search.

Layer classification:

- `.cutter-empty-state` remains a Cutter shared page-pattern class until `packages/ui-foundation` gets an approved `EmptyState` primitive.
- Material search must stay independent and continue using `cutter-locator-empty-state` / `cutter-locator-video-empty`.
- No project data, search data, material search, cut, cache, auth, runtime, or desktop behavior changed.

Change made:

- Consolidated `.cutter-empty-state` from multiple historical CSS owners into one token-based visual owner.
- Removed the earlier search-area empty-state block that used legacy spacing/separator tokens.
- Removed the old Material Design variable empty-state block.
- Removed `.cutter-empty-state` from broad shared panel selector groups so it no longer inherits visual styling by cascade side effect.
- Added regression coverage proving `.cutter-empty-state` and `.cutter-empty-state span` each have exactly one production CSS owner and use MixLab token variables, not `md-sys` variables.

Visual ownership result:

- Project home and legacy search empty states now depend on one explicit Cutter shared page-pattern rule.
- Material search remains decoupled from generic empty-state CSS.
- This removes a high-risk cascade pattern where empty-state appearance was determined by whichever duplicated block appeared later in `styles.css`.
- The built Cutter CSS dropped from Batch 5.60's `110.38 kB` to `109.98 kB`, confirming duplicate CSS was removed.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 112 tests, 112 passed.
- `npm run build:cutter-web` passed: CSS bundle `109.98 kB`, gzip `15.74 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
- `git diff --check` passed.

Remaining debt moved forward:

- `.cutter-empty-state` is still not a `packages/ui-foundation` component. It should either be promoted to an approved `EmptyState` primitive in a later Foundation version or retired when project home/search are migrated to a different shared state component.
- The project-home screenshot-reference CSS marker still exists and should be cleaned in a later project-home cleanup batch, separately from the material-search workflow.
- Material-search candidate rows, transcript rows, side-panel sizing, and recent-task compact table remain workflow-specific page composition.

## Batch 5.62 Progress: Project Home Reference Layer Token Cleanup

Date: 2026-06-20.

Route/components in scope:

- Cutter project home.
- Project-home stale screenshot-reference marker.
- Low-risk project-home typography and detail text color rules.

Layer classification:

- Project-home layout, hero composition, project-card media overlays, and project-detail action grouping remain page composition.
- App font ownership belongs to UI Foundation/body tokens, not a route-scoped project-home reference block.
- Eyebrow, hero title, and project-detail text color should use MixLab token variables instead of hard-coded screenshot-match values.
- No project data, project creation/rename/delete behavior, search, cut, cache, auth, runtime, or desktop behavior changed.

Change made:

- Replaced the old `Project Home reference implementation` comment with a neutral project-home composition marker.
- Removed the stale local screenshot path reference from production CSS.
- Removed the misplaced global `.cutter-app[data-cutter-web-ready]` font/smoothing rule from the project-home block.
- Tokenized project-home eyebrow text to `--ml-color-text-tertiary`.
- Tokenized project-home hero title color to `--ml-color-text` and display font to `--ml-font-display`.
- Tokenized project-detail definition text to `--ml-color-text-secondary`.
- Added regression coverage proving the stale reference marker/path and old explicit font stack cannot return to production CSS.

Visual ownership result:

- Project home no longer carries an old screenshot-reference layer marker.
- Low-risk project-home text styling now follows the shared MixLab token contract.
- The route no longer owns global app font smoothing from inside a page-composition block.
- Project-card media overlays, hard-coded overlay colors/gradients, card dimensions, and detail action composition remain intentionally out of this batch because they are larger page-composition decisions.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 112 tests, 112 passed.
- `npm run build:cutter-web` passed: CSS bundle `109.73 kB`, gzip `15.57 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
- `git diff --check` passed.

Remaining debt moved forward:

- Project-home still has visually heavy split panels, shadows, and page-specific media card overlays. A later project-home surface batch should decide whether these stay as page composition or flatten further into the shared workbench contract.
- Project-card cover overlays still use media-specific hard-coded overlay styling and should not be promoted to Foundation until a `MediaCard` primitive is approved.
- Material-search candidate rows, transcript rows, side-panel sizing, and recent-task compact table remain workflow-specific page composition.

## Batch 5.63 Progress: Project Home Surface Container Flattening

Date: 2026-06-20.

Route/components in scope:

- Cutter project home.
- Recent-projects area container.
- Project-detail area container.
- Project-home shell geometry regression coverage.

Layer classification:

- The project-home board, recent-projects area, and project-detail area are page layout composition.
- They should not recreate a second workbench card with their own fixed height, panel border, panel radius, shadow, or negative overlap.
- Actual project cards, empty-state cards, detail media preview, and detail action stack remain page composition and are intentionally not migrated in this batch.
- No project data, project selection, project open-directory action, create/rename/delete behavior, search, cut, cache, auth, runtime, or desktop behavior changed.

Change made:

- Changed the shared project-home list/detail panel rule from fixed `655px` height to `height: 100%`.
- Removed panel-level border, radius, background, and shadow from the recent-projects and project-detail containers.
- Removed the project-detail negative `margin-left` offset so the detail area aligns with the board grid instead of visually overlapping the list area.
- Updated shell regression coverage that was still protecting the old panel-card contract.
- Added explicit project-home CSS assertions so these two containers remain layout containers instead of returning to floating workbench cards.

Visual ownership result:

- Project home no longer creates two large card-like surfaces inside the already-owned workbench region.
- The shell/workbench visual hierarchy is flatter and closer to the shared Cutter shell contract.
- The built Cutter CSS dropped from Batch 5.62's `109.73 kB` to `109.58 kB`, confirming this removed route-local surface styling rather than adding another override layer.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 112 tests, 112 passed.
- `npm run build:cutter-web` passed: CSS bundle `109.58 kB`, gzip `15.56 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
- `git diff --check` passed.

Remaining debt moved forward:

- Project-home empty-state cards still have their own card-like shape because the approved UI Foundation v1 set does not yet include a formal `EmptyState` component.
- Project-card media overlays, hard-coded white overlay text, gradients, cover dimensions, and selected-project action placement remain page-specific media composition.
- Project-detail cover and sticky controls still carry page-specific sizing and background treatment.
- Material-search candidate rows, transcript rows, side-panel sizing, and recent-task compact table remain workflow-specific page composition.

## Batch 5.64 Progress: Foundation Media Token Handoff For Project Home

Date: 2026-06-20.

Route/components in scope:

- Cutter project home.
- Project-card media placeholder, media overlay, media text, and media shadow.
- Project-detail cover placeholder.
- UI Foundation media-related token additions.

Layer classification:

- Project cards are still page-specific media composition because `packages/ui-foundation` v1 does not yet include an approved `MediaCard` primitive.
- Reusable media colors, overlay, and shadows belong in the token layer so future library/detail media surfaces can converge without copying hard-coded values.
- The actual card dimensions, cover placement, selected-project action placement, and detail-cover sizing remain project-home page composition.
- No project data, project selection, search, cut, cache, auth, runtime, or desktop behavior changed.

Change made:

- Added Foundation media tokens:
  - `--ml-color-media-placeholder`
  - `--ml-color-on-media`
  - `--ml-color-on-media-secondary`
  - `--ml-color-media-overlay`
  - `--ml-shadow-media`
  - `--ml-shadow-media-strong`
- Replaced project-card hard-coded white text, placeholder blue-gray, overlay gradient, and card shadows with the new media tokens.
- Replaced project-detail cover placeholder color with `--ml-color-media-placeholder`.
- Added regression coverage proving the project-home media card path uses token variables instead of `#ffffff`, `#d8e3f3`, and the old hard-coded rgba media shadows/overlay.

Visual ownership result:

- Project-home media visual constants now have a shared token entry point instead of living as page-local literals.
- The page still owns media-card layout, but it no longer owns the reusable media color/shadow vocabulary.
- This creates a cleaner migration path for later public/local library media cards without prematurely expanding UI Foundation v1 with `MediaCard`.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 112 tests, 112 passed.
- `npm run build:cutter-web` passed: CSS bundle `110.24 kB`, gzip `15.66 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `captures/cutter-design-reference/01-project-home.actual.png`
- `git diff --check` passed.
- Note: `scripts/visual/cutter-design-reference-capture.ts` produced the project-home design-state screenshot but timed out later while waiting for the material-locator transcript timestamp. The project-home screenshot was still usable for this batch's media-card visual check.

Remaining debt moved forward:

- Project-card dimensions, media overlay text placement, selected-project action placement, and more-menu visual remain page composition.
- Project-detail cover sizing and sticky detail controls remain page-specific visual rules.
- A later Foundation version can decide whether `MediaCard` should be promoted; this batch intentionally stops at token ownership.
- Material-search candidate rows, transcript rows, side-panel sizing, and recent-task compact table remain workflow-specific page composition.

## Batch 5.65 Progress: Project Home Detail Surface Token Cleanup

Date: 2026-06-20.

Route/components in scope:

- Cutter project home.
- Project-card and project-detail media radius.
- Project-detail sticky action surface.
- Project-detail action buttons inside the sticky controls.

Layer classification:

- Media radius and sticky-surface color treatment are reusable visual-system values, so they belong in the token layer.
- The sticky detail action container remains project-home page composition because its placement, width, and sticky behavior are tied to the detail inspector layout.
- The action buttons remain shared Foundation `Button` instances; the page should not privately redefine button radius.
- No project data, project selection, open-directory, create/rename/delete, search, cut, cache, auth, runtime, or desktop behavior changed.

Change made:

- Added Foundation tokens:
  - `--ml-color-sticky-surface`
  - `--ml-color-sticky-surface-fade`
  - `--ml-radius-media`
- Replaced project-home card and detail-cover hard-coded `12px` / `10px` radius with `--ml-radius-media`.
- Replaced the project-detail sticky-controls hard-coded white `rgba(...)` fade/background with sticky-surface tokens.
- Removed the page-local `border-radius: 9px` override from project-detail action buttons so the shared `Button` component owns button shape.
- Added regression coverage proving these project-home detail/media surfaces use token variables and do not reintroduce the old hard-coded white rgba background or `9px` / `10px` / `12px` local radii.

Visual ownership result:

- Project home still owns detail-panel layout, but no longer owns the reusable sticky-surface and media-radius vocabulary.
- Foundation now has a token path for sticky action surfaces that can be reused by later inspector/detail pages without copying page-local gradients.
- Button shape stays centralized in UI Foundation instead of drifting through page-specific overrides.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 112 tests, 112 passed.
- `npm run build:cutter-web` passed: CSS bundle `110.57 kB`, gzip `15.69 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
- `git diff --check` passed before the audit-note update.
- Note: the refreshed project-home fixture screenshot is an empty-project state. It verifies shell and empty-state stability, but a later real-data or design-reference capture is still needed before claiming final project-card visual acceptance.

Remaining debt moved forward:

- Project-card dimensions, media overlay text placement, selected-project action placement, and more-menu visual remain page composition.
- Project-detail cover sizing, detail `dl` sizing, and sticky-controls placement remain project-home page composition.
- Project-home still needs a later pass to decide which empty-state and media-card pieces should become formal Foundation components after v1 stabilizes.
- Material-search candidate rows, transcript rows, side-panel sizing, and recent-task compact table remain workflow-specific page composition.

## Batch 5.66 Progress: Shared Library Radius Token Cleanup

Date: 2026-06-20.

Route/components in scope:

- Cutter local library.
- Cutter public library.
- Shared library empty state.
- Shared library pagination.
- Shared library view toggle.
- Shared library detail player.

Layer classification:

- The library pages remain page composition for data layout, filters, cards, and inspector content.
- Empty/pagination/control/media corner radius is reusable visual vocabulary, so it must come from Foundation tokens.
- Shared local/public library selectors should stay shared; local-only and public-only visual forks should not be introduced.
- No library loading, source-video selection, pagination behavior, filters, search, cut, cache, auth, runtime, or desktop behavior changed.

Change made:

- Replaced shared library empty-state and pagination hard-coded `10px` radius with `--ml-radius-panel`.
- Replaced shared local/public library view-toggle hard-coded `8px` radius with `--ml-radius-panel`.
- Replaced shared library detail-player hard-coded `8px` radius with `--ml-radius-media`.
- Added regression coverage proving these shared library surfaces use Foundation radius tokens and remain shared between local and public library routes.

Visual ownership result:

- Local and public library pages now share the same token-owned radius rules for low-risk support surfaces.
- The detail player now uses the same media radius vocabulary as project-home media surfaces.
- This reduces one more class of page-local hard-coded radii without changing library card layout or data behavior.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 112 tests, 112 passed.
- `npm run build:cutter-web` passed: CSS bundle `110.64 kB`, gzip `15.71 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`
- `git diff --check` passed before the audit-note update.
- Note: the local-library fixture screenshot is an empty-list state. It verifies empty-state and inspector stability, while the public-library screenshot verifies populated shared library card/detail behavior.

Remaining debt moved forward:

- Library card media overlays, card metadata density, and inspector detail hierarchy remain page composition.
- Settings and cache-management still have some route-specific control/panel radii that need later low-risk-page cleanup.
- Material-search candidate rows, transcript rows, side-panel sizing, and recent-task compact table remain workflow-specific page composition.

## Batch 5.67 Progress: Settings Control Radius Token Cleanup

Date: 2026-06-20.

Route/components in scope:

- Cutter settings page.
- Appearance select.
- Cut-mode segmented control container.
- Settings doctor panel.

Layer classification:

- Settings remains a low-risk page composition surface: it owns which preference groups and doctor rows are shown.
- Field/control/panel corner radii are reusable Foundation visual rules, not route-specific style decisions.
- The appearance select uses field radius; the cut-mode segmented container and doctor panel use panel radius.
- No settings data loading, appearance persistence, cut-mode preference behavior, doctor checks, cache, auth, search, cut, runtime, or desktop behavior changed.

Change made:

- Replaced settings appearance select hard-coded `8px` radius with `--ml-radius-field`.
- Replaced settings cut-mode toggle hard-coded `9px` radius with `--ml-radius-panel`.
- Replaced settings doctor panel hard-coded `10px` radius with `--ml-radius-panel`.
- Added regression coverage proving these settings controls use Foundation radius tokens and do not reintroduce `8px` / `9px` / `10px` page-local radii inside the settings control block.

Visual ownership result:

- The settings page still owns layout and content, but not the visual vocabulary for fields, segmented containers, or info panels.
- This removes another low-risk page-local control-style fork before moving to larger page groups.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 112 tests, 112 passed.
- `npm run build:cutter-web` passed: CSS bundle `110.70 kB`, gzip `15.72 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
- `git diff --check` passed before the audit-note update.

Remaining debt moved forward:

- Cache-management still has route-specific layout/data-list sizing that should be reviewed separately before migrating more.
- Sidebar cache menu and user-entry overlay still have some shell-level radius values that should be handled in a shell/sidebar cleanup batch, not a settings page batch.
- Material-search candidate rows, transcript rows, side-panel sizing, and recent-task compact table remain workflow-specific page composition.

## Batch 5.68 Progress: Card Body Flush Contract Cleanup

Date: 2026-06-20.

Routes/components in scope:

- UI Foundation `Card`.
- Cutter cache management test-result and cache-detail cards.
- Cutter settings info-group cards.

Layer classification:

- Card body spacing is a component concern, not a Cutter page utility.
- Cache management and settings pages should declare whether a card body is flush, but should not own the `padding: 0` visual rule.
- Cache management rows, settings rows, cache data, settings data, search, cut, auth, runtime, and desktop behavior were not changed.

Change made:

- Added `bodyFlush` to the UI Foundation `Card` component.
- Added `.ml-card-body.is-flush { padding: 0; }` to `packages/ui-foundation/src/layout.css`.
- Migrated cache management cards from `cutter-card-body-flush cutter-cache-panel-body` to `bodyFlush` plus `cutter-cache-panel-body`.
- Migrated settings info cards from `cutter-card-body-flush cutter-info-group-body` to `bodyFlush` plus `cutter-info-group-body`.
- Removed the old app-level `.cutter-card-body-flush` CSS rule.
- Added Foundation regression coverage for `Card bodyFlush`.
- Updated Cutter tests to reject the removed `cutter-card-body-flush` class while accepting the Foundation-owned `ml-card-body is-flush` class.

Visual ownership result:

- The visual rule for flush card bodies now lives in UI Foundation with the `Card` component.
- Cutter pages keep only page-specific body hooks such as `cutter-cache-panel-body` and `cutter-info-group-body` for business layout.
- This removes one more app-local component-style utility instead of preserving it as hidden CSS debt.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 9 tests, 9 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 112 tests, 112 passed.
- `npm run build:cutter-web` passed: CSS bundle `110.69 kB`, gzip `15.71 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/cache-management.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
- `git diff --check` passed before this audit-note update.

Remaining debt moved forward:

- `.cutter-data-list` and `.cutter-data-row` are shared between cache management and settings, but still live in Cutter app CSS rather than a first-class Foundation primitive.
- Cache management still owns route-specific grid sizing and meter composition. That is acceptable for now because the page owns business layout, but repeated status-list patterns should be revisited before material search migration.
- Settings form controls still have page-composition selectors that should eventually move to a field/form primitive if repeated across admin and cutter.

## Batch 5.69 Progress: Library View Toggle Duplicate Rule Removal

Date: 2026-06-20.

Routes/components in scope:

- Cutter local library view/source controls.
- Cutter public library orientation controls.
- Shared `.cutter-local-view-toggle` page-composition selector.

Layer classification:

- Local/public library pages own which filters and view toggles appear.
- The shared view-toggle container should have one visual owner for both library pages.
- Early global `.cutter-local-view-toggle` rules and legacy combined `.cutter-local-view-toggle, .cutter-cut-mode-toggle` rules were duplicate component-style ownership.
- No library loading, filtering, selection, source details, cache, auth, search, cut, runtime, or desktop behavior changed.

Change made:

- Removed the old top-level `.cutter-local-view-toggle` rule that still carried hard-coded `8px` radius and old border/background tokens.
- Removed `.cutter-local-view-toggle` from the older combined `.cutter-local-view-toggle, .cutter-cut-mode-toggle` rule so library controls no longer inherit settings-toggle layout by accident.
- Promoted the already accepted local/public library route rule to be the single owner for the shared library toggle container, including `display: inline-flex` and `align-items: center`.
- Added regression coverage proving:
  - The library toggle uses `--ml-border-subtle`, `--ml-radius-panel`, and tokenized surface color.
  - No top-level `.cutter-local-view-toggle { ... }` rule remains.
  - No combined `.cutter-local-view-toggle, .cutter-cut-mode-toggle` selector remains.

Visual ownership result:

- Local and public library pages now share one toggle-container rule instead of relying on early CSS plus route overrides.
- This directly reduces the class of drift where a generic old selector silently changes multiple pages before a later route-specific selector corrects only one visual state.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 112 tests, 112 passed.
- `npm run build:cutter-web` passed: CSS bundle `110.53 kB`, gzip `15.69 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`
- `git diff --check` passed before this audit-note update.

Remaining debt moved forward:

- The library pages still have page-specific header typography and media-card layout rules. These are page composition for now, but should be audited when media-card/list density is migrated.
- `.cutter-cut-mode-toggle` remains a settings-specific segmented container and should be handled in a form/control primitive pass, not by sharing with library controls.
- Material-search and cut-task compact controls still have route-specific row/button count badges that need their own later batches.

## Batch 5.70 Progress: Dead Layout Utility CSS Removal

Date: 2026-06-20.

Routes/components in scope:

- Legacy Cutter layout utilities in `apps/cutter-web/src/styles.css`.
- Visual screenshot matrix for project home, source detail, and material locator.

Layer classification:

- Rules with no production DOM owner are CSS debt, not page composition.
- Removing unused CSS is a cleanup-layer change; it must not alter runtime state, data loading, search, cut, cache, auth, or desktop behavior.
- The deleted selectors were not migrated because no current page renders them.

Change made:

- Removed unused `.cutter-filter-select` and child rules.
- Removed unused `.cutter-video-empty` and child rules.
- Removed unused `.cutter-gallery` rules from multiple legacy CSS sections, including responsive variants.
- Added regression coverage proving these dead selectors do not remain in production CSS.

Visual ownership result:

- The Cutter CSS no longer carries dead layout primitives that can accidentally affect future pages or be mistaken for active Foundation contracts.
- This reduces one more source of hidden drift: old generic rules that are not tied to any current component.

Verification:

- `rg -n "cutter-gallery|cutter-filter-select|cutter-video-empty" apps/cutter-web/src/styles.css` returned no matches.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 113 tests, 113 passed.
- `npm run build:cutter-web` passed: CSS bundle `109.28 kB`, gzip `15.54 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/source-detail.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
- `git diff --check` passed before this audit-note update.

Remaining debt moved forward:

- Several old raw-button/input rules remain for login and desktop first-run surfaces. They should be separated from the main Cutter workbench migration because they are runtime gate surfaces.
- Source detail still uses `cutter-video-panel`, `cutter-transcript`, and `cutter-segment` page-composition rules. These should be handled as a source-detail/media/transcript batch, not silently deleted.
- Material-search still owns candidate rows, transcript rows, video preview, queue rows, and floating action composition and remains the final high-risk migration phase.

## Batch 5.71 Progress: Runtime Gate Button Foundation Migration

Date: 2026-06-20.

Routes/components in scope:

- Cutter login gate.
- Windows desktop first-run setup gate.
- The shared UI Foundation `Button` component.

Layer classification:

- Login/register submission, public-library selection, workspace selection, Doctor, engine start, retry, copy diagnostics, and open-log-directory behavior are runtime/application logic and were not changed.
- The button surface is a component-layer concern and should come from `packages/ui-foundation`.
- Login tabs remain page composition for now, but their rendered action surface now uses Foundation `Button` instead of raw page-local button styling.

Change made:

- Replaced login gate tab and submit `<button>` elements with `Button` from `@mixlab/ui-foundation`.
- Replaced desktop first-run setup and diagnostic action `<button>` elements with `Button`.
- Removed page-local button visual selectors:
  - `.cutter-login-panel button`
  - `.cutter-login-tabs button`
  - `.cutter-desktop-setup-card button`
  - `.cutter-desktop-diagnostic-actions button`
- Kept layout-only classes for the login gate and desktop first-run panels.
- Added regression coverage proving the old page-local button selectors are absent and the rendered gates use Foundation button classes.

Visual ownership result:

- Runtime gate action buttons now share the same button component contract as the migrated workbench pages.
- This removes another hidden drift source where entrance surfaces could keep older radius, size, padding, and disabled-state rules after the main workbench had already migrated.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 114 tests, 114 passed.
- `npm run build:cutter-web` passed: CSS bundle `107.85 kB`, gzip `15.35 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Runtime gate screenshots were captured:
  - `docs/acceptance/artifacts/ui-foundation-css-cleanup/login-gate-foundation-buttons.png`
  - `docs/acceptance/artifacts/ui-foundation-css-cleanup/desktop-first-run-foundation-buttons.png`
- Manual screenshot review passed for both runtime gate screenshots and spot-checked:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`

Remaining debt moved forward:

- Login inputs still have page-local input styling. They should migrate only after the Foundation input/search/form control contract is ready; this batch intentionally did not introduce a new form primitive.
- Desktop first-run cards and diagnostics still own their special dark setup layout. They are runtime gate composition, not normal workbench pages.
- Source detail and material-search still carry media/transcript-specific page composition rules and should be migrated in their planned later batches.

## Batch 5.72 Progress: Source Detail Transcript Segment CSS Owner Cleanup

Date: 2026-06-20.

Routes/components in scope:

- Source detail route.
- Complete transcript segment rows.
- Cutter production CSS.

Layer classification:

- Segment selection behavior, highlighted segment IDs, continuous range display, and add-to-cut-list behavior are page/runtime state and were not changed.
- Segment-row structure and visual states are page composition for source detail, but they should have one CSS owner.
- Duplicate early `.cutter-segment` structural rules were CSS debt because a later tokenized source-detail section already owned the row grid, gap, radius, border, and selected/highlighted states.

Change made:

- Removed the earlier duplicate `.cutter-segment-list` structural rule.
- Removed the earlier duplicate `.cutter-segment` base structure.
- Removed the earlier old selected/highlighted state rules, including the hard-coded `#f5a524` inset highlight.
- Kept the segment text sub-element rules for time, text, and action label.
- Added regression coverage proving `.cutter-segment-list` and `.cutter-segment` each have one structural CSS owner.

Visual ownership result:

- Source detail transcript rows now have one structural owner instead of being shaped twice by different sections of `styles.css`.
- The selected/highlighted state now comes from the tokenized source-detail state rule, reducing the risk that old row separators or old highlight colors leak back into complete transcript pages.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 115 tests, 115 passed.
- `npm run build:cutter-web` passed: CSS bundle `107.32 kB`, gzip `15.29 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/source-detail.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`

Remaining debt moved forward:

- Source detail still owns media-player panel and transcript card composition. That is acceptable until the media/transcript page primitive is formalized.
- Material locator has its own transcript implementation and remains a separate high-risk migration phase.
- Library card, project card, transcript segment, and queue source rows still render semantic `<button>` wrappers where the whole row/card is clickable; these should not be mechanically converted to `Button`.

## Batch 5.73 Progress: Source Detail Media/Transcript Scope Cleanup

Date: 2026-06-20.

Routes/components in scope:

- Source detail media panel.
- Source detail transcript panel.
- Material locator video panel guardrail.
- Cutter production CSS.

Layer classification:

- Video playback, selected segments, highlighted segments, material search, and cut behavior are runtime/page state and were not changed.
- Source-detail media/transcript panel styling is page composition until a shared media/transcript primitive exists.
- Global `.cutter-video-panel`, `.cutter-transcript`, and `.cutter-full-text` rules were CSS debt because the same class names are also used near the material-search surface, which has a different layout contract.

Change made:

- Scoped source-detail video panel rules to `.cutter-source-detail .cutter-video-panel`.
- Scoped source-detail video element and video caption rules to `.cutter-source-detail .cutter-video-panel video` and `.cutter-source-detail .cutter-video-panel div`.
- Scoped source-detail transcript panel rules to `.cutter-source-detail .cutter-transcript`.
- Scoped source-detail full-text typography and panel rules to `.cutter-source-detail .cutter-full-text`.
- Added regression coverage proving the unscoped media/transcript selectors no longer exist while source-detail and material-locator scoped video rules remain.

Visual ownership result:

- Source detail and material locator no longer share an accidental global media-panel selector.
- This reduces the risk that future source-detail polish changes the material-search video frame or that material-search fixes leak back into source-detail.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 116 tests, 116 passed.
- `npm run build:cutter-web` passed: CSS bundle `107.63 kB`, gzip `15.31 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/source-detail.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`

Remaining debt moved forward:

- Source detail still uses page-specific media/transcript composition. That is now intentionally scoped page composition, not global CSS.
- Material locator keeps its own specialized video/transcript rules and remains the final high-risk migration surface.
- The broader theme compatibility sections still contain grouped panel/input/focus rules that should be audited in later passes.

## Batch 5.74 Progress: Legacy Material Form/Focus Override Cleanup

Date: 2026-06-20.

Routes/components in scope:

- Cutter production form controls.
- Project rename/create/delete dialog inputs.
- Settings select controls.
- Runtime/login gate controls.
- Global focus-visible ring.

Layer classification:

- Form values, auth flow, desktop first-run setup, project creation/rename/delete, search, and cut behavior are business/runtime state and were not changed.
- The remaining `--md-sys-*` variables still act as a theme compatibility token layer in parts of the current CSS and were not globally removed in this batch.
- The removed grouped form/focus selectors were CSS debt because they imposed an older Material-shaped control contract after the Foundation-tokenized control rule already existed later in the file.

Change made:

- Removed the legacy grouped form rule that targeted `.cutter-project-switcher summary`, login inputs, project rename inputs, and every `.cutter-app input/select/textarea` with `--md-sys-color-outline`, `--md-sys-shape-corner-extra-small`, and old surface-container colors.
- Removed the legacy grouped focus rule that used a 3px `--md-sys-color-primary` focus outline.
- Kept the later Foundation-tokenized form rule using:
  - `border: 1px solid var(--ml-color-border-strong)`
  - `border-radius: 8px`
  - `background: var(--ml-color-control)`
- Kept the later Foundation-tokenized focus rule using a 2px `--ml-color-accent` focus outline.
- Added regression coverage proving the old grouped selectors and old 3px Material focus outline are absent while the Foundation-tokenized control/focus rules remain.

Visual ownership result:

- Cutter form controls now have one active production-level form/focus owner instead of being shaped by both an older Material compatibility block and the later Foundation-tokenized block.
- This reduces cross-page drift risk for settings selects, project dialog inputs, login fields, and search inputs without changing the runtime behavior of those controls.
- Theme compatibility tokens remain explicitly separate from page-level control styling; they should be removed only when the token layer itself is migrated, not as a side effect of deleting old page overrides.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 117 tests, 117 passed.
- `npm run build:cutter-web` passed: CSS bundle `106.97 kB`, gzip `15.24 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`

Remaining debt moved forward:

- The theme compatibility layer still contains `--md-sys-*` variables and several Material-named sections. Those need a later token-layer migration, not ad hoc deletion.
- Login inputs and project dialog inputs still do not have a dedicated Foundation `Input` primitive; they are stable under the shared production form rule for now.
- Search and material-locator controls remain high-risk and should be migrated only after the lower-risk pages and table/card primitives are fully stable.

## Batch 5.75 Progress: Legacy Material Panel Override Cleanup

Date: 2026-06-20.

Routes/components in scope:

- Source detail transcript/media panels.
- Login panel surface.
- Project create/rename/delete dialogs.
- Desktop first-run setup and diagnostics panels.
- Foundation media panel bridge.

Layer classification:

- Dialog open/close behavior, login state, first-run setup state, source-detail video playback, and transcript selection are runtime/page state and were not changed.
- The affected selectors are shared surface styling for panels and dialogs. In the current migration stage they belong to the Foundation-tokenized production CSS owner, not the old Material compatibility owner.
- Remaining route-specific composition for source-detail and desktop setup is intentionally left in place until those surfaces get a dedicated component primitive.

Change made:

- Removed the older `md-sys` panel rule that styled the shared panel/dialog selector group with:
  - `border: 1px solid var(--md-sys-color-outline-variant)`
  - `border-radius: var(--md-sys-shape-corner-medium)`
  - `background: var(--md-sys-color-surface-container-lowest)`
- Removed the older `md-sys` source-detail video-panel radius override.
- Kept the later Foundation-tokenized panel rule using:
  - `border: 1px solid var(--ml-color-border)`
  - `border-radius: 8px`
  - `background: var(--ml-color-surface)`
- Added regression coverage proving the old Material panel declarations are absent and the Foundation-tokenized panel rule remains.

Visual ownership result:

- Shared panel and dialog surfaces no longer have two competing visual owners in production CSS.
- Source detail, login, project dialogs, desktop first-run setup, diagnostics, and media panel bridge now resolve through the same active Foundation-tokenized surface rule.
- CSS bundle size dropped again, which is a useful signal that this is deletion/migration rather than another overlay.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 118 tests, 118 passed.
- `npm run build:cutter-web` passed: CSS bundle `105.89 kB`, gzip `15.14 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/source-detail.png`

Remaining debt moved forward:

- There are still earlier/later duplicate typography and source-detail composition rules in the CSS; the next cleanup pass should target duplicate text/page-header owners carefully.
- The remaining `--md-sys-*` theme variables are still token-layer compatibility, not panel-level overrides.
- Desktop first-run and login surfaces still need fuller visual screenshots before their final migration acceptance, because the standard workbench visual script does not cover every runtime gate state.

## Batch 5.76 Progress: Compact Text And Source Detail Base Owner Cleanup

Date: 2026-06-20.

Routes/components in scope:

- Generic Cutter page header helper text.
- Notes and inspector stack text.
- Source detail full-text typography.
- Section heading secondary text.
- Source detail video/transcript panel base styling.

Layer classification:

- Page content, source-detail playback, complete transcript, segment selection, and add-to-cut-list behavior are runtime/page state and were not changed.
- Text scale and secondary text color are shared typography concerns and should resolve through the later Foundation-tokenized production owner.
- Source-detail video controls, transcript header layout, full-text padding, and segment rows remain page composition until a dedicated transcript/media primitive is introduced.

Change made:

- Removed the older compact text rule that applied 12px/1.5 text to `.cutter-page-header p`, `.cutter-note`, `.cutter-inspector-stack`, and `.cutter-source-detail .cutter-full-text`.
- Removed the older 11px `.cutter-eyebrow` rule.
- Removed the older source-detail video-panel base rule that set separator border, panel radius, and old dark background.
- Removed the older source-detail transcript base rule that set separator border, panel radius, and surface background.
- Kept the later Foundation-tokenized typography rule using 14px/22px secondary text.
- Kept source-detail inner composition rules for video children, transcript header, full-text padding, and segment rows.
- Added regression coverage proving the old compact text/source-detail base owners are absent while the current Foundation-tokenized text and panel rules remain.

Visual ownership result:

- Generic page helper text now has one shared typography owner instead of an early compact 12px rule being overwritten later by the Foundation-tokenized rule.
- Source-detail panel base styling is no longer split between an early page-specific panel owner and the later shared panel/video owners.
- The cleanup keeps page composition intact while reducing the amount of route-level visual drift that can leak into future low-risk page migration.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 119 tests, 119 passed.
- `npm run build:cutter-web` passed: CSS bundle `105.31 kB`, gzip `15.08 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/source-detail.png`

Remaining debt moved forward:

- There are still route-specific page-header overrides for library, operational, and cut-task pages. Those should be normalized in page-family migration batches rather than removed blindly.
- Source-detail still has page composition rules for transcript header, video metadata row, and segment rows; those can move only after a shared transcript/media primitive exists.
- The material-search transcript remains intentionally separate and should still be migrated last.

## Batch 5.77 Progress: Source Detail Video Panel Owner Consolidation

Date: 2026-06-20.

Routes/components in scope:

- Source detail video panel.
- Source detail screenshot/visual regression route.

Layer classification:

- Video loading/playback behavior and source-detail transcript behavior are runtime/page state and were not changed.
- The video panel base box styling is page composition for source detail until a shared media primitive exists.
- Multiple identical selectors for the same video panel were CSS debt because they split overflow, border, radius, and background across separate owners.

Change made:

- Removed the separate `.cutter-source-detail .cutter-video-panel` rule that only owned `border-radius` and background.
- Merged `overflow`, `border`, `border-radius`, and background into one remaining `.cutter-source-detail .cutter-video-panel` rule.
- Strengthened regression coverage so the source-detail video panel has exactly one base CSS owner.

Visual ownership result:

- Source-detail video panel base styling is now controlled by one selector block.
- This makes future media-panel migration safer because the current owner is easier to identify and delete when a shared media primitive is introduced.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 119 tests, 119 passed.
- `npm run build:cutter-web` passed: CSS bundle `105.25 kB`, gzip `15.06 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/source-detail.png`

Remaining debt moved forward:

- Source-detail transcript header, segment row, and full-text layout remain page composition.
- A future shared `TranscriptPanel`/`MediaPanel` primitive should absorb these remaining page-local rules, but that should happen as a planned component migration rather than a blind CSS deletion.

## Batch 5.78 Progress: Low-Risk Page Header Typography Unification

Date: 2026-06-20.

Routes/components in scope:

- Local library page header.
- Public library page header.
- Operational page headers for settings and cache management.
- Cut tasks page header.

Layer classification:

- Page data, filters, tables, inspectors, cache state, library cards, and cut-task workflow behavior are business/page state and were not changed.
- Page header typography and header surface reset are shared shell/page-composition styling and should not be maintained separately by each low-risk page family.
- Cut-task table density and operational page scrolling remain page-specific layout concerns and were not changed.

Change made:

- Merged local-library, public-library, operational-page, and cut-tasks page headers into one shared CSS owner for:
  - header min-height, transparent background, no border/shadow
  - `h1` typography: 30px size, 40px line-height, 780 weight
  - summary paragraph typography: 15px size, 23px line-height, 10px top margin
- Removed the previous cut-tasks-only page-header overrides:
  - 68px header height
  - 28px/36px title
  - 6px/22px summary text
- Updated regression coverage so these page families share the same page-header typography owner and cut-tasks no longer carries the old route-specific title rules.

Visual ownership result:

- Low-risk workbench pages and the cut-task page now share the same page-title scale instead of drifting by route family.
- This directly reduces the class of UI inconsistency where similar pages appeared to have different typography and vertical rhythm.
- The migration still leaves page-specific body/table/card layout intact, avoiding unintended business workflow or dense-table changes.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 120 tests, 120 passed.
- `npm run build:cutter-web` passed: CSS bundle `104.89 kB`, gzip `15.02 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`

Remaining debt moved forward:

- Project home still has a product-specific hero/header rhythm and should be handled as its own page-family pass.
- Material search remains intentionally separate and should not inherit this low-risk page header contract until its dedicated final migration.
- Page body cards, table surfaces, and inspector panels still need continued migration to Foundation components/tokens.

## Batch 5.79 Progress: Library Grid And Scroll Owner Consolidation

Date: 2026-06-20.

Routes/components in scope:

- Local library card grid and scroll pane.
- Public library card grid and scroll pane.
- Cutter shell scroll-regression test coverage for library pages.

Layer classification:

- Library filtering, pagination, source-video detail selection, and card rendering data were page/business state and were not changed.
- Library grid column count and scroll-pane containment are page-composition rules shared by the local and public library pages.
- Duplicate route-scoped grid and scroll rules were CSS debt because the same local/public library selectors were owned in two separated parts of `styles.css`.

Change made:

- Removed the later duplicate `.cutter-local-library-scroll` / `.cutter-public-library-scroll` scroll rule.
- Removed the library scroll panes from the generic late scroll helper so local/public library scroll behavior has one route-family owner.
- Removed the separate late gallery-align rule and folded `align-content: start` into the single local/public library grid owner.
- Strengthened regression coverage so:
  - the local/public library grid owner appears exactly once
  - the local/public library scroll-pane owner appears exactly once
  - the shared grid owner owns both three-column layout and `align-content: start`
  - the shared scroll owner explicitly hides horizontal overflow and owns vertical scrolling

Visual ownership result:

- Local library and public library now share one grid owner and one scroll-pane owner instead of relying on a later override block.
- This reduces route drift risk for library pages and makes future migration to a `MediaCard`/library-grid primitive easier because there is one selector pair to delete or replace.
- The batch intentionally did not touch card markup, filters, pagination behavior, inspector behavior, or material search.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 120 tests, 120 passed.
- `npm run build:cutter-web` passed: CSS bundle `104.38 kB`, gzip `14.99 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`

Remaining debt moved forward:

- Library cards still have page-level copy/tag/media styling until a shared `MediaCard` or library card primitive is introduced in `packages/ui-foundation`.
- Library empty and pagination states are already shared within the library page family but still live in cutter CSS rather than a reusable EmptyState/Pagination primitive.
- Material search remains intentionally out of scope and should be migrated last.

## Batch 5.80 Progress: Cache Panel Scroll And Grid Owner Consolidation

Date: 2026-06-20.

Routes/components in scope:

- Cache management page.
- Cache panel grid and scroll container.
- Cache management CSS regression coverage.

Layer classification:

- Cache status values, clear-cache actions, test-result data, and runtime cache semantics are business/runtime state and were not changed.
- Cache stats, detail rows, check rows, and inspector content remain page composition.
- `.cutter-cache-panels` grid and scroll behavior is a page-composition owner and should not be split across multiple late overrides.

Change made:

- Consolidated `.cutter-cache-panels` from three CSS owner blocks into one block.
- Moved the final responsive `auto-fit` column behavior into the main cache-panel rule.
- Moved horizontal overflow hiding, vertical scroll ownership, overscroll containment, and stable scrollbar gutter into that same rule.
- Deleted the later generic scroll override and the later grid-template override for `.cutter-cache-panels`.
- Strengthened regression coverage so `.cutter-cache-panels` appears exactly once and owns:
  - `repeat(auto-fit, minmax(min(100%, 320px), 1fr))`
  - `overflow-x: hidden`
  - `overflow-y: auto`
  - `scrollbar-gutter: stable`

Visual ownership result:

- Cache management no longer relies on late CSS blocks to correct its panel columns or scroll behavior.
- This continues the low-risk page migration pattern: one page-family owner per structural concern, with card internals owned by page body classes or UI Foundation components.
- The change preserves the current final responsive behavior while deleting the obsolete `0.9fr / 1.1fr` intermediate column rule.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 120 tests, 120 passed.
- `npm run build:cutter-web` passed: CSS bundle `104.25 kB`, gzip `14.97 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/cache-management.png`

Remaining debt moved forward:

- Cache stats and cache detail/check row composition still live in cutter CSS until a broader stats/list primitive exists.
- Cache inspector section typography and separators are shared-token based but still page-local.
- Settings page still has a remaining normal-page scroll owner to audit after cache management.

## Batch 5.81 Progress: Settings Control Owner Consolidation

Date: 2026-06-20.

Routes/components in scope:

- Settings page display/source/orientation selects.
- Settings page default cut-mode segmented control.
- Settings page environment-check panel.
- Settings control CSS regression coverage.

Layer classification:

- Settings values, auth/session data, password-change behavior, environment-check data, and API/runtime state were not changed.
- Select styling, cut-mode segmented-control shell, and settings doctor panel surface are settings page-composition/control styling.
- Old global `.cutter-appearance-select`, `.cutter-cut-mode-toggle`, and `.cutter-settings-doctor` rules were CSS debt because these classes are settings-only but were styled by unscoped early rules plus a later route-wide border-color patch.

Change made:

- Removed early unscoped `.cutter-cut-mode-toggle` rules.
- Removed early unscoped `.cutter-appearance-select` and `.cutter-settings-doctor` rules.
- Removed `.cutter-appearance-select` from the generic input/select/textarea rule because it is already a `<select>` and has a settings-specific owner.
- Removed the route-wide border-color patch for `.cutter-cut-mode-toggle`, `.cutter-appearance-select`, and `.cutter-settings-doctor`.
- Moved the currently effective doctor-panel spacing into the single settings route owner.
- Strengthened regression coverage so:
  - settings appearance select, cut-mode toggle, and doctor panel each have exactly one settings route owner
  - no unscoped owner remains for those settings-only classes
  - no route-wide border-color patch remains for those settings controls

Visual ownership result:

- Settings controls are now owned by the settings route composition layer rather than early global CSS plus later overrides.
- The change preserves the existing rendered behavior while making it much clearer where future settings-control migration should occur.
- This reduces one more source of cross-page style leakage before moving into the higher-risk cut-task and material-search pages.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 120 tests, 120 passed.
- `npm run build:cutter-web` passed: CSS bundle `103.17 kB`, gzip `14.87 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`

Remaining debt moved forward:

- Settings info-group and password-form layout still live in cutter CSS until a shared form/list primitive exists.
- Settings page main scroll owner is already route-scoped but still should be watched during final shell cleanup.
- Material search remains intentionally out of scope.

## Batch 5.82 Progress: Cut Task Surface Reset Owner Cleanup

Date: 2026-06-20.

Routes/components in scope:

- Cut tasks filter card.
- Cut tasks pipeline card.
- Cut tasks queue table shell.
- Generic ready-state surface reset at the end of cutter CSS.
- Cut tasks CSS regression coverage.

Layer classification:

- Cut task data, status transitions, retry/open-directory behavior, selected transcript text, and detail inspector content are business/workflow state and were not changed.
- Table density, one-line truncation, sticky header behavior, status color semantics, and detail composition remain cut-task page composition.
- `.ml-card`, `.ml-inspector`, and `.ml-table-wrap` are shared surface primitives.
- `.cutter-queue-filter-card`, `.cutter-queue-pipeline-card`, and `.cutter-queue-table` are cut-task page composition classes. They should not also be explicitly listed in the generic shared surface reset.

Change made:

- Removed `.cutter-queue-filter-card`, `.cutter-queue-pipeline-card`, and `.cutter-queue-table` from the generic `.cutter-app[data-cutter-web-ready]` surface reset.
- Kept the cut-task route owner as the single place that sets the cut-task filter, pipeline, and queue-table surface color/border/shadow.
- Strengthened regression coverage so the generic ready-state surface reset cannot explicitly include cut-task queue classes again.

Visual ownership result:

- Cut-task surfaces are no longer declared in both the generic surface reset and the cut-task route block.
- Shared surface primitives remain covered by the generic reset, while cut-task page composition remains route-scoped.
- This reduces hidden cascade coupling before the next cut-task table cleanup pass.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 120 tests, 120 passed.
- `npm run build:cutter-web` passed: CSS bundle `102.99 kB`, gzip `14.86 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`

Remaining debt moved forward:

- Cut-task table column sizing, row density, status/action semantics, and inspector hierarchy still need a final polish pass against the migration checklist.
- Cut-task table/detail styles still live in cutter CSS until a shared `Table`/`InspectorPanel` contract is strong enough to absorb more of the visual styling.
- Material search remains intentionally out of scope.

## Batch 5.83 Progress: Cut Task Layout Owner Consolidation

Date: 2026-06-20.

Routes/components in scope:

- Cut tasks page root layout.
- Cut tasks page main grid.
- Low-risk page shared height/scroll group.
- Cut tasks CSS regression coverage.

Layer classification:

- Cut task queue data, status semantics, detail content, output-directory behavior, and retry/cut actions were not changed.
- Cut-task page root height, grid columns, gap, and overflow are cut-task page composition.
- Low-risk route-family height/scroll rules should not own cut-task page geometry once cut tasks is in its own migration phase.

Change made:

- Removed cut tasks from the low-risk route-family `.cutter-cut-queue` height/overflow group.
- Removed cut tasks from the low-risk route-family `.cutter-page-main` height/overflow group.
- Moved the same final height, min-height, align, and overflow behavior into the single cut-task migration owner.
- Strengthened regression coverage so cut tasks cannot be reintroduced before local/public/cache/settings in those shared low-risk groups.

Visual ownership result:

- `.cutter-cut-queue` now has one route-specific owner for its height, overflow, grid columns, and gap.
- `.cutter-cut-queue .cutter-page-main` now has one route-specific owner for its height, row template, gap, and overflow.
- This makes the cut-task page easier to reason about before the final table/detail polish pass.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 120 tests, 120 passed.
- `npm run build:cutter-web` passed: CSS bundle `102.78 kB`, gzip `14.86 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`

Remaining debt moved forward:

- Cut-task inspector scroll remains grouped with library inspector scroll and should be reviewed separately.
- Cut-task table/detail styling still lives in route CSS until `Table` and `InspectorPanel` absorb more shared visual contract.
- Material search remains intentionally out of scope.

## Batch 5.84 Progress: Cut Task Detail Row Shared Primitive Migration

Date: 2026-06-20.

Routes/components in scope:

- Cut tasks detail inspector rows.
- Shared cutter data-list/data-row primitive.
- Cut tasks detail CSS regression coverage.

Layer classification:

- Selected job data, retry behavior, open-directory behavior, status mapping, and inspector content were not changed.
- Detail-row label/value typography and separators are shared page-composition primitives already used by settings and cache management.
- Cut-task detail row column width and minimum row height remain cut-task page composition.

Change made:

- Updated cut-task detail markup to use `cutter-data-list` and `cutter-data-row`.
- Removed cut-task-private `dl div`, `dt`, and `dd` visual ownership for separators, typography, and base row structure.
- Kept only cut-task-specific detail list layout and row column/min-height rules.
- Added `line-height: 20px` to the shared `.cutter-data-row dd` value style so settings, cache, and cut-task details share the same value rhythm.
- Strengthened regression coverage so:
  - cut-task detail DOM uses shared `cutter-data-list`/`cutter-data-row`
  - old `.cutter-queue-detail dl div` and private `dt/dd` selectors do not return
  - shared data-row value line-height is covered

Visual ownership result:

- Cut-task detail rows now share the same data-row primitive as settings and cache management.
- The cut-task page no longer owns its own detail-row text/separator system.
- This narrows cut-task CSS to workflow-specific layout and table density before moving toward material search.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 120 tests, 120 passed.
- `npm run build:cutter-web` passed: CSS bundle `102.19 kB`, gzip `14.83 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`

Remaining debt moved forward:

- Cut-task inspector scroll is still grouped with library inspector scroll and should be reviewed separately.
- Cut-task table source/action cell styling remains route-specific until a stronger `Table` slot contract exists.
- Material search remains intentionally out of scope.

## Batch 5.85 Progress: InspectorPanel Scroll Ownership Lift

Date: 2026-06-20.

Routes/components in scope:

- UI Foundation `InspectorPanel` base CSS.
- Cut tasks detail inspector.
- Local/public library inspector.
- Cutter-web inspector scroll regression coverage.

Layer classification:

- Inspector content, selected job data, library detail data, and page workflows were not changed.
- Max-height, hidden outer overflow, body scroll, and overscroll containment are `InspectorPanel` component behavior.
- Route-specific inspector width, media/detail content layout, and task detail row layout remain page composition.

Change made:

- Moved inspector `max-height: 100%` and body `overscroll-behavior: contain` into `packages/ui-foundation/src/layout.css`.
- Removed the cross-page cutter-web selector that grouped `.cutter-queue-inspector` with `.cutter-library-inspector`.
- Removed the cross-page cutter-web selector that grouped `.cutter-queue-inspector-body` with library `.ml-inspector-body`.
- Added UI Foundation component tests covering inspector scroll containment.
- Strengthened cutter-web tests so route CSS cannot reintroduce the cut-task/library inspector combination owner.

Visual ownership result:

- Inspector scroll containment is now owned by `InspectorPanel`, not by cut-tasks or library page CSS.
- Cut-tasks and library inspectors are no longer coupled through a shared page selector.
- This reduces page-specific inspector styling and moves one more reusable behavior into the component layer.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 10 tests, 10 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 120 tests, 120 passed.
- `npm run build:cutter-web` passed: CSS bundle `101.77 kB`, gzip `14.81 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- `git diff --check` passed.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`

Remaining debt moved forward:

- Cut-task table source/action cell styling remains route-specific until a stronger `Table` slot contract exists.
- Old global `.cutter-app .ml-inspector` compatibility styling still exists earlier in cutter CSS and should be reviewed during final shell cleanup.
- Material search remains intentionally out of scope.

## Batch 5.86 Progress: Legacy Global Inspector Compatibility Cleanup

Date: 2026-06-20.

Routes/components in scope:

- Legacy cutter-web `.ml-inspector` compatibility rules.
- UI Foundation `InspectorPanel` ownership guardrails.
- Cut tasks, public library, and settings screenshot representatives.

Layer classification:

- Inspector data, route layouts, selected task/library content, and operational page workflows were not changed.
- Inspector panel frame, max-height, overflow, header, body, and footer behavior remain `packages/ui-foundation` component behavior.
- Route-specific inspector variants such as library detail content and operational page placement remain page composition.

Change made:

- Removed the plain app-level `.ml-inspector { align-self: stretch; }` rule from cutter-web CSS.
- Removed the old broad `.cutter-app .ml-inspector` sticky/max-height/overflow compatibility rule.
- Removed duplicated responsive `.cutter-app .ml-inspector` overrides that forced inspectors back to `position: static`.
- Added a cutter-web regression test forbidding legacy global `.ml-inspector` and `.cutter-app .ml-inspector` compatibility overrides.

Visual ownership result:

- Cutter pages no longer have a pre-Foundation global inspector owner competing with `InspectorPanel`.
- Inspector position and scroll behavior are now governed by Foundation plus explicit page-composition classes only.
- The cleanup reduces another source of route-to-route geometry drift without changing business content.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 121 tests, 121 passed.
- `rg -n "^\\.ml-inspector\\s*\\{|^\\.cutter-app\\s+\\.ml-inspector\\b|\\.cutter-app\\s+\\.ml-inspector\\s*\\{" apps/cutter-web/src/styles.css` returned no matches.
- `npm run build:cutter-web` passed: CSS bundle `101.57 kB`, gzip `14.77 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`

Remaining debt moved forward:

- The route-ready broad surface rule for `.ml-card`, `.ml-inspector`, and `.ml-table-wrap` still exists near the final polish layer and should be classified next as either a shell surface token rule or moved into Foundation.
- Library and operational inspector header/body density variants still exist and need one more pass to decide whether a semantic density class belongs in Foundation.
- Material search remains intentionally out of scope until the shared Shell/component cleanup is finished.

## Batch 5.87 Progress: Quiet Surface Defaults Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- UI Foundation `Card`, `Table`, and `InspectorPanel` base surfaces.
- Cutter-web final polish surface reset.
- Project home, cut tasks, and public library screenshot representatives.

Layer classification:

- Card/table/inspector base border weight and default shadow are Foundation component behavior.
- Route-specific selected states, media cards, cut-task table density, and library card content remain page composition.
- No business data, search, cut, cache, auth, or runtime behavior changed.

Change made:

- Moved quiet surface defaults into `packages/ui-foundation/src/layout.css`:
  - `.ml-card` now uses the shared 58% border mix and `box-shadow: none`.
  - `.ml-table-wrap` explicitly owns `box-shadow: none`.
  - `.ml-inspector` now uses the shared 58% border mix and `box-shadow: none`.
- Removed the cutter-web final polish rule that broadly overrode `.ml-card`, `.ml-inspector`, and `.ml-table-wrap`.
- Added UI Foundation tests proving quiet surface defaults belong to the component package.
- Added cutter-web tests proving the app CSS no longer overrides those Foundation surface defaults.

Visual ownership result:

- Reusable surface quietness now comes from `packages/ui-foundation`, not from cutter-web route/global CSS.
- Cutter pages keep only page-specific content layout and interaction states.
- This reduces the chance that future pages drift by reintroducing local card/table/inspector shadows or border weights.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 11 tests, 11 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `rg -n "\\.cutter-app\\[data-cutter-web-ready\\] \\.ml-card,|\\.cutter-app\\[data-cutter-web-ready\\] \\.ml-table-wrap\\s*\\{|\\.cutter-app\\[data-cutter-web-ready\\] \\.ml-card\\s*\\{" apps/cutter-web/src/styles.css` returned no matches.
- `npm run build:cutter-web` passed: CSS bundle `101.32 kB`, gzip `14.75 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`

Remaining debt moved forward:

- Library and operational inspector header/body density variants still exist and should be consolidated into either a Foundation density option or a smaller page-composition class set.
- `cutter-data-list` and `cutter-data-row` still live in cutter CSS even though they now behave like shared content primitives.
- Material search remains intentionally last because it has independent panes, transcript selection, and floating cut-action behavior.

## Batch 5.88 Progress: Shared Data Row Primitive Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- UI Foundation shared data-list/data-row CSS primitive.
- Settings info rows and environment check rows.
- Cache management test-result rows and cache-detail rows.
- Cut-task detail rows in the task inspector.

Layer classification:

- Data-list margin, data-row grid display, baseline alignment, separators, label/value typography, and value truncation are shared Foundation content rhythm.
- Page-specific row column templates, gaps, min-height, and padding remain page composition.
- No settings, cache, task, search, cut, auth, or runtime behavior changed.

Change made:

- Added `.ml-data-list` and `.ml-data-row` shared CSS primitives to `packages/ui-foundation/src/layout.css`.
- Replaced production markup from `cutter-data-list`/`cutter-data-row` to `ml-data-list`/`ml-data-row` in:
  - `SettingsPage`
  - `CacheManagementPage`
  - `CutQueuePage`
- Removed the old shared `cutter-data-list`/`cutter-data-row` CSS block from `apps/cutter-web/src/styles.css`.
- Updated cutter-web tests so page markup uses `ml-data-*` while Foundation owns the base separator and typography rules.
- Added UI Foundation tests for data-list/data-row rhythm.

Visual ownership result:

- Shared label/value row rhythm no longer lives in the cutter app stylesheet.
- Settings, cache management, and cut-task details now consume the same Foundation primitive.
- Page CSS is reduced to business layout classes such as `cutter-info-row`, `cutter-cache-detail-row`, and `cutter-queue-detail-row`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 12 tests, 12 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `rg -n "cutter-data-list|cutter-data-row|^\\.ml-data-list\\s*\\{|^\\.ml-data-row\\s*\\{" apps/cutter-web/src packages/ui-foundation/src` showed:
  - no old `cutter-data-*` production classes
  - `.ml-data-list` and `.ml-data-row` only in `packages/ui-foundation/src/layout.css`
- `npm run build:cutter-web` passed: CSS bundle `101.25 kB`, gzip `14.77 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cache-management.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`

Remaining debt moved forward:

- Library and operational inspector header/body density variants still need a final consolidation pass.
- Several material-search-specific content primitives remain intentionally isolated until the material search batch.
- Historical audit notes still mention `cutter-data-*` because they describe older migration batches; production source no longer uses those classes.

## Batch 5.89 Progress: Inspector Density Variants Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- UI Foundation `InspectorPanel` compact and operational density variants.
- Public library and local library detail inspectors.
- Settings environment-check inspector.
- Cache management cache-location inspector.

Layer classification:

- Inspector header/body density, vertical grid rows, body scroll containment, and compact inspector padding are Foundation component variants.
- Library inspector width, settings inspector vertical offset, and cache inspector internal content grouping remain page composition.
- No public-library, local-library, settings, cache, search, cut, auth, or runtime behavior changed.

Change made:

- Added `.ml-inspector--compact` to `packages/ui-foundation/src/layout.css` for library-style detail inspectors:
  - compact header height
  - compact header horizontal padding
  - compact body padding
- Added `.ml-inspector--operational` to `packages/ui-foundation/src/layout.css` for operational right-side inspectors:
  - fixed header/body grid rhythm
  - borderless operational header
  - contained body scrolling
  - operational body padding
- Updated public library, local library, settings, and cache management pages to consume the Foundation variants.
- Removed the page-level `.cutter-library-inspector .ml-inspector-header/body` and `.cutter-operational-inspector .ml-inspector-header/body` rules from `apps/cutter-web/src/styles.css`.
- Added UI Foundation tests proving the density variants are component-owned.
- Added cutter-web tests preventing the migrated header/body rules from returning to page CSS.

Visual ownership result:

- Reusable Inspector density is now owned by `packages/ui-foundation`.
- Cutter page CSS keeps only page layout and business-specific content structure.
- `apps/cutter-web/src/styles.css` decreased from `3993` lines after Batch 5.88 to `3966` lines after Batch 5.89.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 13 tests, 13 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `101.07 kB`, gzip `14.78 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cache-management.png`
- `git diff --check` passed.
- `rg -n "cutter-library-inspector \\.ml-inspector-(header|body)|cutter-operational-inspector \\.ml-inspector-(header|body)|ml-inspector--compact|ml-inspector--operational" apps/cutter-web/src packages/ui-foundation/src` showed:
  - no page CSS header/body density rules
  - `.ml-inspector--compact` and `.ml-inspector--operational` only in Foundation CSS, tests, and production component class usage

Remaining debt moved forward:

- Cutter-web still has route-scoped `.ml-inspector` surface color/border overrides in the final polish layer; this should be classified next as shell theme glue or moved into Foundation tokens.
- Material-search-specific panel/list/transcript primitives remain intentionally isolated until the material search batch.
- The next low-risk cleanup should target shared media-card/list detail primitives before touching the material search page.

## Batch 5.90 Progress: Workbench Inspector Surface Variant Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- UI Foundation `InspectorPanel` workbench surface variant.
- Cutter workbench inspectors on source detail, cut list, cut tasks, search, public library, local library, settings, and cache management.

Layer classification:

- Workbench inspector border tint, translucent surface background, panel shadow, and header separator color are Foundation component variant behavior.
- Whether a specific page uses the workbench inspector variant is page composition.
- Library compact density and operational density continue to be Foundation variants.
- No source detail, cut list, cut tasks, search, library, settings, cache, material search, auth, cut, or runtime behavior changed.

Change made:

- Added `.ml-inspector--workbench` to `packages/ui-foundation/src/layout.css`:
  - `border-color: var(--ml-border-subtle)`
  - translucent workbench background
  - `box-shadow: var(--ml-shadow-panel)`
  - header separator color
- Updated all cutter workbench `InspectorPanel` usages to opt into `ml-inspector--workbench`.
- Removed the route-scoped `.cutter-app[data-cutter-web-ready][data-cutter-route] .ml-inspector` and `.ml-inspector-header` overrides from `apps/cutter-web/src/styles.css`.
- Added a UI Foundation test proving the workbench inspector surface variant is component-owned.
- Updated cutter-web tests so route-scoped `.ml-inspector` surface overrides cannot return.

Visual ownership result:

- Cutter inspector surface styling is no longer hidden in a route-wide app CSS override.
- `InspectorPanel` now has three explicit Foundation variants used by production cutter pages:
  - `ml-inspector--workbench`
  - `ml-inspector--compact`
  - `ml-inspector--operational`
- `apps/cutter-web/src/styles.css` decreased from `3966` lines after Batch 5.89 to `3953` lines after Batch 5.90.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 14 tests, 14 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `101.06 kB`, gzip `14.81 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/source-detail.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cache-management.png`
- `git diff --check` passed.
- `rg -n '\\.cutter-app\\[data-cutter-web-ready\\]\\[data-cutter-route\\] \\.ml-inspector|\\.cutter-app\\[data-cutter-web-ready\\]\\[data-cutter-route\\] \\.ml-inspector-header|ml-inspector--workbench' apps/cutter-web/src packages/ui-foundation/src` showed:
  - no route-scoped cutter CSS overrides for `.ml-inspector` or `.ml-inspector-header`
  - `ml-inspector--workbench` only in Foundation CSS/tests and production Inspector usages

Remaining debt moved forward:

- Shared media-card/list detail primitives are the next low-risk cleanup target.
- Material-search-specific pane/list/transcript primitives remain intentionally isolated until the material search batch.
- Admin-web still contains its own `.ml-inspector` overrides, but admin migration is outside the current cutter-focused batch.

## Batch 5.91 Progress: Shared Media Frame And Detail Stack Primitives Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- UI Foundation shared CSS primitives for media frames and detail stacks.
- Public library and local library card thumbnails.
- Public library and local library inspector media previews and metadata stacks.

Layer classification:

- 16:9 media frame shape, media fill behavior, media radius, dark media preview background, and inspector detail text rhythm are Foundation visual primitives.
- Library grid density, card copy fields, tags, selection behavior, pagination, and which metadata appears remain page/business composition.
- No public-library, local-library, search, cut, cache, auth, NAS, or runtime behavior changed.

Change made:

- Added Foundation primitives to `packages/ui-foundation/src/layout.css`:
  - `.ml-media-frame`
  - `.ml-media-frame--16x9`
  - `.ml-media-frame--dark`
  - `.ml-media-fill`
  - `.ml-detail-stack`
- Updated `LibraryGallery` thumbnail images to use the Foundation media-frame classes.
- Updated public and local library inspector previews to use Foundation media-frame classes.
- Updated public and local library inspector metadata stacks to use `.ml-detail-stack`.
- Removed the page-level `.cutter-library-detail-stack`, `.cutter-library-detail-player`, and `.cutter-library-card img` visual rules from `apps/cutter-web/src/styles.css`.
- Added UI Foundation tests proving the shared media/detail primitives are Foundation-owned.
- Added cutter-web regression coverage preventing the removed library media/detail selectors from returning.

Visual ownership result:

- Library pages no longer own reusable media-frame sizing or detail-stack typography.
- Cutter page CSS keeps library-specific grid, copy, tag, and business layout only.
- `apps/cutter-web/src/styles.css` decreased from `3953` lines after Batch 5.90 to `3909` lines after Batch 5.91.
- `packages/ui-foundation/src/layout.css` increased from `700` lines after Batch 5.90 to `756` lines after Batch 5.91.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 15 tests, 15 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `101.11 kB`, gzip `14.87 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
- `git diff --check` passed.
- `rg -n "cutter-library-detail-stack|cutter-library-detail-player|cutter-library-card img|cutter-local-detail-player" apps/cutter-web/src packages/ui-foundation/src -S` returned only regression-test references, confirming the old production selectors are gone.

Remaining debt moved forward:

- `cutter-inspector-stack` still exists for source detail/search/cut inspector copy; classify next whether it should become `.ml-detail-stack` or stay as page-specific content rhythm.
- Project-home media cards still own project-specific overlay/content placement; only reusable media fill behavior should be considered for extraction, not project-card business layout.
- Material-search-specific candidate thumbnails, transcript rows, and side-panel primitives remain intentionally isolated until the material search batch.

## Batch 5.92 Progress: Remaining Inspector Copy Stack Migrated To Foundation Detail Stack

Date: 2026-06-20.

Routes/components in scope:

- Source detail inspector copy stack.
- Search page inspector copy stack.
- Cut list submit-settings inspector copy stack.
- Shared Foundation `.ml-detail-stack` primitive introduced in Batch 5.91.

Layer classification:

- Inspector copy stack spacing, primary line color, secondary line color, and text rhythm are Foundation detail-stack visual rules.
- Source detail selection copy, search rule copy, and cut-list submission copy remain page/business content.
- No source-detail selection behavior, search behavior, cut-list submission behavior, cache, auth, or runtime behavior changed.

Change made:

- Replaced remaining production `cutter-inspector-stack` usages with `ml-detail-stack` in:
  - `SourceDetailPage`
  - `SearchPage`
  - `CutListPage`
- Removed the page-level `.cutter-inspector-stack` rules from `apps/cutter-web/src/styles.css`.
- Removed `.cutter-inspector-stack` from the shared page-text selector group.
- Updated cutter-web regression coverage so `.cutter-inspector-stack` cannot return to production CSS.

Visual ownership result:

- All migrated low-risk and cut-list inspector copy stacks now use the same Foundation detail stack.
- Production cutter code no longer contains `cutter-inspector-stack`; the only remaining references are regression-test assertions.
- `apps/cutter-web/src/styles.css` decreased from `3909` lines after Batch 5.91 to `3893` lines after Batch 5.92.
- `packages/ui-foundation/src/layout.css` remained `756` lines because this batch reused the existing Foundation primitive instead of adding new CSS.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 15 tests, 15 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `100.87 kB`, gzip `14.83 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/source-detail.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
- `git diff --check` passed.
- `rg -n "cutter-inspector-stack" apps/cutter-web/src packages/ui-foundation/src -S` returned only regression-test references.

Remaining debt moved forward:

- Project-home media cards still own project-specific overlay/content placement; classify only reusable media fill behavior for possible extraction.
- Material-search-specific candidate thumbnails, transcript rows, floating cut action, side panel, and pane scrolling remain intentionally isolated until the material search batch.
- Source-detail video/transcript panels still have route-scoped structural styling; classify later whether those are page composition or Foundation panel primitives.

## Batch 5.93 Progress: Project Home Media Fill Ownership Cleanup

Date: 2026-06-20.

Routes/components in scope:

- Cutter project home project cards.
- Cutter project home detail cover.
- Shared Foundation `.ml-media-fill` primitive introduced in Batch 5.91.

Layer classification:

- Media image fill behavior, including full-size image box and `object-fit: cover`, is a Foundation primitive.
- Project card dimensions, overlay, action placement, project stats, detail panel geometry, and selected-project business state remain project-home page composition.
- No project selection, search, open-directory, create, rename, delete, queue, cache, auth, or runtime behavior changed.

Change made:

- Added `ml-media-fill` to project-home cover images rendered by `ProjectCover`.
- Removed page-owned `.cutter-project-cover img` and `.cutter-project-detail-cover img` fill rules from `apps/cutter-web/src/styles.css`.
- Kept `.cutter-project-cover` itself as page composition because the project card still owns absolute cover placement inside the card overlay.
- Added cutter-web regression coverage that project-home images use the Foundation media fill primitive and that the removed private image selectors cannot return.

Visual ownership result:

- Project home no longer owns reusable media image fill behavior.
- Page CSS now owns only the project-specific container placement and overlay/card composition.
- This keeps the migration aligned with the goal: repeated media behavior moves to Foundation; page CSS does not accumulate another private image rule.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 15 tests, 15 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `100.48 kB`, gzip `14.81 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`.
- `git diff --check` passed.
- `rg -n "cutter-project-cover img|cutter-project-detail-cover img|object-fit:\s*cover" apps/cutter-web/src/styles.css apps/cutter-web/src/features/project-home/ProjectHomePage.tsx packages/ui-foundation/src/layout.css -S` showed:
  - no project-home private image selectors
  - media fill ownership in Foundation
  - remaining `object-fit` rules only in other still-unmigrated page/route surfaces.

Remaining debt moved forward:

- Project-home still owns business-specific card overlay, detail cover geometry, project grid density, hero rhythm, and sticky detail controls.
- Material-search-specific media/thumb/transcript primitives remain intentionally deferred until the material search batch.

## Batch 5.94 Progress: Project Home Detail Cover Media Frame Handoff

Date: 2026-06-20.

Routes/components in scope:

- Cutter project home detail cover.
- Shared Foundation `.ml-media-frame` primitive.

Layer classification:

- Detail cover `width`, `height`, and responsive `max-height` are project-home page composition because they express the detail inspector layout.
- Detail cover clipping, media radius, border reset, and placeholder background are Foundation media-frame visual rules.
- Project card overlay, project grid, detail metadata list, sticky detail controls, and project actions remain project-home page composition.
- No project selection, search, open-directory, create, rename, delete, queue, cache, auth, or runtime behavior changed.

Change made:

- Added `ml-media-frame` to the project-home detail cover container.
- Removed page-owned `overflow`, `border-radius`, `border`, and media placeholder background from `.cutter-project-detail-cover`.
- Kept `.cutter-project-detail-cover` as a page composition class for sizing only.
- Added regression coverage that the detail cover uses `ml-media-frame` and that the page-level detail-cover rule no longer owns background, radius, or overflow.

Visual ownership result:

- Project-home detail cover now shares the same Foundation media-frame visual contract as public/local library media previews.
- Project-home CSS owns only detail-cover sizing and placement, reducing duplicated media-frame styling.
- `apps/cutter-web/src/styles.css` decreased from `3880` lines after Batch 5.93 to `3876` lines after Batch 5.94.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 15 tests, 15 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `100.37 kB`, gzip `14.80 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`.
- `git diff --check` passed.
- `rg -n "cutter-project-detail-cover|ml-media-frame" apps/cutter-web/src/features/project-home/ProjectHomePage.tsx apps/cutter-web/src/styles.css apps/cutter-web/src/cutter-app.test.ts packages/ui-foundation/src/layout.css -S` confirmed:
  - project-home detail cover uses `ml-media-frame`
  - the page-level detail-cover CSS owns sizing only
  - media-frame visuals remain in Foundation.

Remaining debt moved forward:

- Project-home still owns project-card overlay/content/action placement and the detail control stack because those are route-specific business layout decisions.
- Project-home detail metadata list still contains route-specific sizing and divider rules; classify later whether a future Foundation description-list primitive is warranted.
- Material-search-specific media/thumb/transcript primitives remain intentionally deferred until the material search batch.

## Batch 5.95 Progress: Project Home Detail Metadata Data Row Handoff

Date: 2026-06-20.

Routes/components in scope:

- Cutter project home detail metadata list.
- Shared Foundation `.ml-data-list` and `.ml-data-row`.

Layer classification:

- Detail metadata content, list width/height/padding, and row label/value column width remain project-home page composition.
- Detail-row display rhythm, divider ownership, dt/dd text color/size/line-height, and margin reset are Foundation data-row visual rules.
- Sticky detail controls and project-card overlay remain project-home page composition.
- No project selection, search, open-directory, create, rename, delete, queue, cache, auth, or runtime behavior changed.

Change made:

- Added `ml-data-list` to the project-home detail `<dl>`.
- Added `ml-data-row` to each project-home detail metadata row.
- Replaced route-private `dl`/`dl div` selectors with explicit `cutter-project-detail-list` / `cutter-project-detail-row` page-composition selectors.
- Removed route-private `dt` / `dd` typography and margin rules from `apps/cutter-web/src/styles.css`.
- Added regression coverage proving the detail list uses Foundation data primitives and that page CSS no longer owns dt/dd typography, row divider, or row font-size.

Visual ownership result:

- Project-home detail metadata now shares the same Foundation data-row visual contract as settings, cache management, and cut-task detail panels.
- Project-home CSS owns only the detail metadata list sizing/padding and label/value column layout.
- `apps/cutter-web/src/styles.css` decreased from `3876` lines after Batch 5.94 to `3858` lines after Batch 5.95.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 15 tests, 15 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `99.82 kB`, gzip `14.76 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`.
- `git diff --check` passed.
- `rg -n "cutter-project-detail (dl|dt|dd)|cutter-project-detail-list|cutter-project-detail-row|ml-data-list cutter-project-detail-list" apps/cutter-web/src packages/ui-foundation/src docs/ui-foundation -S` confirmed no production route-private project-home dt/dd metadata typography selectors remain.

Remaining debt moved forward:

- Project-home sticky detail controls still own sticky surface/background/blur/action stack sizing; classify next whether a Foundation sticky action surface primitive is warranted.
- Project-card overlay/content/action placement remains route-specific business layout.
- Material-search-specific media/thumb/transcript primitives remain deferred until the material search batch.

## Batch 5.96 Progress: Project Home Sticky Action Stack Handoff

Date: 2026-06-20.

Routes/components in scope:

- Cutter project home detail action stack.
- Shared Foundation `.ml-action-stack` and `.ml-sticky-action-stack`.

Layer classification:

- Project-detail action stack width and `margin-top` remain project-home page composition because they place the action stack inside the project detail layout.
- Action-stack display rhythm, button full-width density, sticky bottom behavior, sticky surface background, and backdrop blur are Foundation visual rules.
- Button labels, click handlers, project open, directory open, rename, and delete behavior remain unchanged.
- No project selection, search, open-directory, create, rename, delete, queue, cache, auth, or runtime behavior changed.

Change made:

- Added `ml-action-stack ml-sticky-action-stack` to the project-home detail controls container.
- Added Foundation-owned `.ml-action-stack`, `.ml-action-stack > .ml-button`, and `.ml-sticky-action-stack` rules to `packages/ui-foundation/src/layout.css`.
- Removed project-home route-owned sticky positioning, action-stack gap, sticky surface background, backdrop blur, and detail-control button sizing from `apps/cutter-web/src/styles.css`.
- Kept `.cutter-project-detail-controls` as a page-composition class for width and margin only.
- Added regression coverage proving the project-home detail controls use Foundation action-stack classes and that page CSS no longer owns nested detail-control button visuals.

Visual ownership result:

- Sticky action stack behavior now has one Foundation owner instead of a project-home-only visual implementation.
- Project-home CSS owns only the action stack's placement in the detail panel.
- `apps/cutter-web/src/styles.css` decreased from `3858` lines after Batch 5.95 to `3842` lines after Batch 5.96.
- `packages/ui-foundation/src/layout.css` increased from `756` lines after Batch 5.95 to `778` lines after Batch 5.96.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 16 tests, 16 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `99.78 kB`, gzip `14.77 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`.
- `git diff --check` passed.
- `rg -n "cutter-project-detail-controls \\.(ml-button|button)|cutter-project-detail-controls|ml-action-stack|ml-sticky-action-stack" apps/cutter-web/src packages/ui-foundation/src -S` confirmed:
  - the project-home detail controls render Foundation action-stack classes
  - project-home CSS contains only the detail-controls placement rule
  - Foundation owns sticky action stack and full-width button density.

Remaining debt moved forward:

- Project-home detail header star/more icons remain route-private decorative chrome; classify later whether they should become a reusable icon-button/tool cluster primitive or be removed.
- Project-card overlay/content/action placement remains route-specific business layout.
- Material-search-specific media/thumb/transcript primitives remain deferred until the material search batch.

## Batch 5.97 Progress: Project Home Detail Header Decorative Tools Removed

Date: 2026-06-20.

Routes/components in scope:

- Cutter project home detail header.
- Route-private decorative `star` / `more` header chrome.

Layer classification:

- Project detail title and header alignment remain project-home page composition.
- The previous star and more glyphs had no click handler, no route state, no aria label, and were explicitly `aria-hidden`; they were decorative route-private chrome, not a Foundation component candidate.
- Because the controls had no product function, the correct UI-system action was removal rather than adding a new Foundation tool-button primitive.
- No project selection, search, open-directory, create, rename, delete, queue, cache, auth, or runtime behavior changed.

Change made:

- Removed the `cutter-project-detail-tools` wrapper and the two `cutter-project-detail-tool` decorative spans from `ProjectHomePage`.
- Removed route-private CSS for `.cutter-project-detail-tools`, `.cutter-project-detail-tool`, `.is-star::before`, and `.is-more::before`.
- Simplified the project-detail header rule by removing layout properties that only existed to position the decorative tool cluster.
- Added regression coverage proving the decorative tool markup and CSS do not return.

Visual ownership result:

- Project-home detail header now contains only meaningful page content.
- No new Foundation component was introduced for non-functional decorative chrome.
- `apps/cutter-web/src/styles.css` decreased from `3842` lines after Batch 5.96 to `3809` lines after Batch 5.97.
- `packages/ui-foundation/src/layout.css` remained `778` lines because this batch removed page-private chrome instead of moving it to Foundation.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 16 tests, 16 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `98.97 kB`, gzip `14.70 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`.
- `git diff --check` passed.
- `rg -n "cutter-project-detail-tools|cutter-project-detail-tool|is-star|is-more" apps/cutter-web/src packages/ui-foundation/src docs/ui-foundation/cutter-ui-css-debt-audit.md -S` confirmed the removed production markup and CSS are absent; only regression assertions and this audit note remain.

Remaining debt moved forward:

- Project-card overlay/content/action placement remains route-specific business layout.
- Project-home header/search/board composition still has route-specific layout rules; continue classifying whether any remaining repeated rhythm belongs to Foundation or the Shell layer.
- Material-search-specific media/thumb/transcript primitives remain deferred until the material search batch.

## Batch 5.98 Progress: Project Home Hero Search Control Density Handoff

Date: 2026-06-20.

Routes/components in scope:

- Cutter project home hero search/action row.
- Shared Foundation hero control-row density.

Layer classification:

- Project-home search form grid, column split, width, and hero placement remain page composition because they place the search affordance inside the project-home hero.
- Search input height, internal SearchBox button height, and adjacent hero action button height are reusable Foundation control density.
- Search submit, create-project click handling, selected-project placeholder, project creation, project search, cache, auth, queue, and runtime behavior remain unchanged.

Change made:

- Added `ml-control-row--hero` to the project-home search form wrapper.
- Added Foundation-owned `.ml-control-row--hero` density rules for `.ml-search-box-input`, SearchBox's internal `.ml-button`, and a direct adjacent `.ml-button`.
- Removed project-home route-owned child control height selectors for `.cutter-project-search-box .ml-search-box-input`, `.cutter-project-search-box .ml-button`, and `.cutter-project-search-form > .ml-button`.
- Added regression coverage proving the hero search row uses the Foundation density class and that page CSS no longer owns those child control heights.

Visual ownership result:

- Project-home CSS now owns only the hero search row layout and placement.
- Foundation now owns the reusable 45px hero search/action density.
- `apps/cutter-web/src/styles.css` decreased from `3809` lines after Batch 5.97 to `3803` lines after Batch 5.98.
- `packages/ui-foundation/src/layout.css` increased from `778` lines after Batch 5.97 to `784` lines after Batch 5.98.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 17 tests, 17 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `98.76 kB`, gzip `14.69 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`.
- `rg -n "cutter-project-search-box \\.ml-search-box-input|cutter-project-search-box \\.ml-button|cutter-project-search-form > \\.ml-button|ml-control-row--hero" apps/cutter-web/src packages/ui-foundation/src docs/ui-foundation/cutter-ui-css-debt-audit.md -S` confirmed the production child-height selectors are gone and the Foundation density selector is the remaining owner.

Remaining debt moved forward:

- Project-home hero typography and project-card overlay/content/action placement remain route-specific and need further classification before moving any rules to Foundation.
- Project-home board/list/detail composition remains page-owned; only reusable control and surface rules should continue moving upward.
- Material-search-specific media/thumb/transcript primitives remain deferred until the material search batch.

## Batch 5.99 Progress: Project Home Overlay Action Button Density Handoff

Date: 2026-06-20.

Routes/components in scope:

- Cutter project home selected project card actions.
- Shared Foundation overlay action row button density.

Layer classification:

- Project-card action row position, z-index, bottom/left anchoring, and gap remain project-home page composition because they place actions over the selected project media card.
- The nested action button height is reusable control density and belongs in Foundation, not a route-private `.cutter-project-card-actions .ml-button` override.
- Project selection, entering a project, opening a project directory, project-card rendering, cache, search, queue, auth, and runtime behavior remain unchanged.

Change made:

- Added `ml-overlay-action-row` to the selected project-card action wrapper.
- Added Foundation-owned `.ml-overlay-action-row > .ml-button` density rule.
- Removed project-home route-owned `.cutter-project-card-actions .ml-button` height override.
- Added regression coverage proving selected project-card actions use the Foundation overlay action row class and that page CSS no longer owns the nested button height.

Visual ownership result:

- Project-home CSS now owns only the selected project-card action row placement.
- Foundation owns the reusable 42px overlay action button density.
- `apps/cutter-web/src/styles.css` decreased from `3803` lines after Batch 5.98 to `3799` lines after Batch 5.99.
- `packages/ui-foundation/src/layout.css` increased from `784` lines after Batch 5.98 to `788` lines after Batch 5.99.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 18 tests, 18 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `98.69 kB`, gzip `14.69 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`; the current visual fixture renders the empty project-home state, while selected-card action coverage is provided by SSR markup and CSS ownership tests.
- `rg -n "cutter-project-card-actions \\.ml-button|ml-overlay-action-row|cutter-project-card-actions" apps/cutter-web/src packages/ui-foundation/src docs/ui-foundation/cutter-ui-css-debt-audit.md -S` confirmed the route-private nested button rule is gone and the Foundation overlay action row is the remaining density owner.

Remaining debt moved forward:

- Project-card summary typography, media overlay, and stat icon drawing remain project-home-specific; continue classifying whether they become a future Foundation media-card primitive or stay route-local until the material/media component batch.
- Project-home hero typography and board/detail layout remain page-owned for now.
- Material-search-specific media/thumb/transcript primitives remain deferred until the material search batch.

## Batch 5.100 Progress: Project Home Card Decorative More Removed

Date: 2026-06-20.

Routes/components in scope:

- Cutter project home project-card decorative chrome.

Layer classification:

- The previous `cutter-project-card-more` span had no click handler, no product action, no route state, no aria label, and was explicitly `aria-hidden`.
- Because it was non-functional decorative chrome, the correct UI-system action was deletion rather than creating a Foundation icon-button/menu primitive.
- Project selection, entering a project, opening a project directory, project-card rendering, cache, search, queue, auth, and runtime behavior remain unchanged.

Change made:

- Removed the `cutter-project-card-more` markup from `ProjectHomePage`.
- Removed the route-private `.cutter-project-card-more` CSS rule.
- Removed the reserved right-side gap in `.cutter-project-card-summary` by changing `right: 54px` to `right: 22px`.
- Added regression coverage proving the decorative markup and CSS do not return.

Visual ownership result:

- Project cards no longer render an inert three-dot affordance that implies an unavailable menu.
- Project-card title/summary area now uses the normal right inset instead of reserving space for removed chrome.
- `apps/cutter-web/src/styles.css` decreased from `3799` lines after Batch 5.99 to `3787` lines after Batch 5.100.
- `packages/ui-foundation/src/layout.css` remained `788` lines because this batch removed non-functional page chrome instead of creating a new shared primitive.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 18 tests, 18 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `98.44 kB`, gzip `14.66 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`; the current visual fixture renders the empty project-home state, while selected-card decorative chrome removal is covered by SSR markup and CSS ownership tests.
- `rg -n "cutter-project-card-more|right:\\s*54px|right:\\s*22px" apps/cutter-web/src/features/project-home/ProjectHomePage.tsx apps/cutter-web/src/styles.css apps/cutter-web/src/cutter-app.test.ts docs/ui-foundation/cutter-ui-css-debt-audit.md` confirmed production markup/CSS no longer contain `cutter-project-card-more` and the remaining summary inset is `right: 22px`.

Remaining debt moved forward:

- Project-card summary typography, stat icon drawing, and media overlay still need a broader media-card primitive decision.
- Project-home hero typography and board/detail layout remain page-owned for now.
- Material-search-specific media/thumb/transcript primitives remain deferred until the material search batch.

## Batch 5.101 Progress: Project Home Card Stat Glyphs Removed

Date: 2026-06-20.

Routes/components in scope:

- Cutter project home project-card completed/pending count display.

Layer classification:

- The `已剪` / `待剪` text is business content and remains in the project-card markup.
- The preceding CSS-drawn square/circle glyphs were decorative page-private chrome, not a functional status control or a reusable Foundation primitive.
- Project selection, project entry, directory opening, project-card rendering, cache, search, queue, auth, and runtime behavior remain unchanged.

Change made:

- Removed the route-private `.cutter-project-card-stats span` visual override.
- Removed `.cutter-project-card-stats span::before` and `span:nth-child(2)::before` CSS-drawn glyphs.
- Kept the project-card stats container layout and the actual `已剪` / `待剪` text.
- Added regression coverage proving the text remains and the stats pseudo-glyph selectors do not return.

Visual ownership result:

- Project-card counts are now simple readable text instead of mixed text plus CSS-drawn decoration.
- The page keeps only the project-card stats container rhythm.
- `apps/cutter-web/src/styles.css` decreased from `3787` lines after Batch 5.100 to `3761` lines after Batch 5.101.
- `packages/ui-foundation/src/layout.css` remained `788` lines because this batch removed route-private decorative chrome instead of creating a new Foundation primitive.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 18 tests, 18 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `97.72 kB`, gzip `14.59 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`; the current visual fixture renders the empty project-home state, while selected-card stats are covered by SSR markup and CSS ownership tests.
- `rg -n "cutter-project-card-stats span::before|cutter-project-card-stats span:nth-child|cutter-project-card-stats span\\s*\\{" apps/cutter-web/src/styles.css apps/cutter-web/src/cutter-app.test.ts docs/ui-foundation/cutter-ui-css-debt-audit.md` confirmed production CSS no longer contains the stats pseudo-glyph selectors.

Remaining debt moved forward:

- Project-card summary typography and media overlay still need a broader media-card primitive decision.
- Project-home hero typography and board/detail layout remain page-owned for now.
- Material-search-specific media/thumb/transcript primitives remain deferred until the material search batch.

## Batch 5.102 Progress: Project Home Dead Card Before Layer Removed

Date: 2026-06-20.

Routes/components in scope:

- Cutter project home project-card legacy pseudo-layer cleanup.

Layer classification:

- The `.cutter-project-card::before { display: none; }` rule had no remaining visual output and only existed as a route-private cancellation of an older pseudo-layer.
- Because the rule did not express a token, reusable component primitive, shell rule, page composition need, or runtime state, the correct action was deletion rather than migration.
- Project selection, project entry, directory opening, project-card rendering, cache, search, queue, auth, and runtime behavior remain unchanged.

Change made:

- Removed the dead project-home `.cutter-project-card::before` override from production CSS.
- Added regression coverage proving the dead pseudo-layer selector does not return.
- Kept the active `.cutter-project-card::after` media overlay because it still renders the intentional media contrast layer.

Visual ownership result:

- Project-home CSS no longer carries a no-op pseudo-layer cancellation.
- The remaining project-card pseudo-element is now the intentional media overlay only.
- `apps/cutter-web/src/styles.css` decreased from `3761` lines after Batch 5.101 to `3757` lines after Batch 5.102.
- `packages/ui-foundation/src/layout.css` remained `788` lines because this batch removed dead CSS instead of creating a new Foundation primitive.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 18 tests, 18 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `97.62 kB`, gzip `14.58 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`; the current visual fixture renders the empty project-home state, while selected-card pseudo-layer ownership is covered by CSS tests.
- `git diff --check` passed.
- `rg -n "cutter-project-card::before|cutter-project-card::after|cutter-project-card-more|cutter-project-card-stats span::before|cutter-project-card-stats span:nth-child" apps/cutter-web/src/styles.css apps/cutter-web/src/cutter-app.test.ts docs/ui-foundation/cutter-ui-css-debt-audit.md` confirmed production CSS no longer contains the dead `::before` rule and only keeps the active `::after` media overlay.

Remaining debt moved forward:

- Project-card summary typography and media overlay still need a broader media-card primitive decision.
- Project-home hero typography and board/detail layout remain page-owned for now.
- The route-private `.cutter-project-card-main:focus-visible { outline: 0; }` was promoted to the focused accessibility/Foundation ownership batch documented in Batch 5.103.
- Material-search-specific media/thumb/transcript primitives remain deferred until the material search batch.

## Batch 5.103 Progress: Project Home Card Focus Ring Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- Cutter project home project-card keyboard focus state.
- UI Foundation focus-state primitives for clipped interactive surfaces.

Layer classification:

- The project-card main button is a page composition element because it selects a project and fills the media card.
- The visual focus ring is not page composition; it is a reusable interaction state and belongs in Foundation.
- The previous page-private `.cutter-project-card-main:focus-visible { outline: 0; }` removed keyboard focus feedback and kept a control state inside a route override.
- Because the project card clips overflow, a normal outside `outline-offset` can be hidden by the media-card clipping; the correct shared primitive is an inset focus ring.
- Project selection, project entry, directory opening, project-card rendering, cache, search, queue, auth, and runtime behavior remain unchanged.

Change made:

- Added Foundation-owned `.ml-focus-inset.ml-focus-inset:focus-visible` with a tokenized 2px accent outline and inset `outline-offset: -3px`.
- Added `ml-focus-inset` to the project-card main button.
- Removed the project-home route-owned `.cutter-project-card-main:focus-visible { outline: 0; }` override.
- Added regression coverage proving Project Home uses the Foundation focus class and production page CSS no longer suppresses the project-card focus outline.

Visual ownership result:

- Project-card keyboard focus feedback is restored and owned by Foundation.
- Project-home CSS no longer owns a private focus-state override for the card button.
- `apps/cutter-web/src/styles.css` decreased from `3757` lines after Batch 5.102 to `3753` lines after Batch 5.103.
- `packages/ui-foundation/src/layout.css` increased from `788` lines after Batch 5.102 to `793` lines because the shared inset focus primitive was added.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 19 tests, 19 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `97.64 kB`, gzip `14.60 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`; the static screenshot does not show keyboard focus state, while CSS ownership and markup are covered by tests.
- `git diff --check` passed.
- `rg -n "ml-focus-inset|cutter-project-card-main:focus-visible|Batch 5.103" packages/ui-foundation/src apps/cutter-web/src docs/ui-foundation/cutter-ui-css-debt-audit.md` confirmed the Foundation focus primitive exists, the Project Home button uses it, and production route CSS no longer contains the route-private focus override.

Remaining debt moved forward:

- Project-card summary typography and media overlay still need a broader media-card primitive decision.
- Project-home hero typography and board/detail layout remain page-owned for now.
- The app-wide compatibility focus rule in `apps/cutter-web/src/styles.css` remains tokenized but is still outside Foundation; it should be revisited when the remaining raw controls are migrated.
- Material-search-specific media/thumb/transcript primitives remain deferred until the material search batch.

## Batch 5.104 Progress: Project Home Media Card Visuals Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- Cutter project home recent-project media cards.
- UI Foundation media-card visual primitives.

Layer classification:

- Project-card dimensions, grid placement, project selection, and action placement remain Project Home page composition.
- Media-card radius, shadow, hover/selected elevation, dark overlay, on-media title, on-media meta text, and stacked meta rhythm are reusable visual primitives and belong in Foundation.
- The previous page-private `cutter-project-card` visual rules duplicated media tokens that already existed in Foundation, so keeping them in route CSS would keep visual ownership split.
- Project selection, project entry, directory opening, project-card rendering, cache, search, queue, auth, and runtime behavior remain unchanged.

Change made:

- Added Foundation-owned `ml-media-card`, `ml-media-card-caption`, `ml-media-card-caption--top`, `ml-media-card-title`, `ml-media-card-meta`, and `ml-media-card-meta-stack` utilities.
- Moved media-card radius, background, shadow, hover/selected elevation, overlay, caption position, title typography, meta typography, and stats rhythm into Foundation.
- Updated Project Home project cards to use `ml-media-card` and media-caption classes.
- Removed route-private project-card hover/selected, `::after` overlay, summary typography, summary meta, and stats rhythm rules from `apps/cutter-web/src/styles.css`.
- Added regression coverage proving the media-card visual rules are owned by Foundation and production Project Home CSS no longer contains the removed route-private selectors.

Visual ownership result:

- Project Home now owns only project-card size and business layout.
- Foundation owns the shared media-card visual language for overlay cards.
- `apps/cutter-web/src/styles.css` decreased from `3753` lines after Batch 5.103 to `3688` lines after Batch 5.104.
- `packages/ui-foundation/src/layout.css` increased from `793` lines after Batch 5.103 to `864` lines because the media-card utilities were centralized.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 19 tests, 19 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `97.13 kB`, gzip `14.58 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`; the current visual fixture renders the empty project-home state, while selected-card media-card ownership is covered by SSR markup and CSS tests.
- `git diff --check` passed.
- `rg -n "ml-media-card|cutter-project-card::after|cutter-project-card:hover|cutter-project-card-summary strong|cutter-project-card-summary span|Batch 5.104" packages/ui-foundation/src apps/cutter-web/src docs/ui-foundation/cutter-ui-css-debt-audit.md` confirmed the Foundation media-card utilities exist, Project Home uses them, and production route CSS no longer contains the removed media-card visual selectors.

Remaining debt moved forward:

- Project-home hero typography and board/detail layout remain page-owned for now.
- Project detail cover still uses `ml-media-frame` plus route-local sizing; decide later whether a reusable detail-media sizing utility is needed.
- The app-wide compatibility focus rule in `apps/cutter-web/src/styles.css` remains tokenized but is still outside Foundation; it should be revisited when the remaining raw controls are migrated.
- Material-search-specific media/thumb/transcript primitives remain deferred until the material search batch.

## Batch 5.105 Progress: Project Home Hero Typography Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- Cutter project home hero title area.
- UI Foundation page typography utilities.

Layer classification:

- Project Home still owns the hero grid, the search-form placement, and project-board composition because those are page layout decisions.
- Kicker text, page title typography, and description typography are reusable visual primitives and belong in Foundation.
- Search, project selection, project creation, project entry, project directory opening, cache, queue, auth, and runtime behavior remain unchanged.

Change made:

- Added Foundation-owned `ml-page-kicker`, `ml-page-kicker--hero`, `ml-page-title`, `ml-page-title--hero`, `ml-page-description`, and `ml-page-description--hero` utilities.
- Updated Project Home hero markup to use the new Foundation typography utilities.
- Removed the project-home route-owned `.cutter-eyebrow`, `.cutter-project-hero h1`, and `.cutter-note` typography rules from `apps/cutter-web/src/styles.css`.
- Added regression coverage proving Project Home uses the Foundation typography classes and the route CSS no longer owns those hero typography selectors.

Visual ownership result:

- Project Home no longer owns hero typography through route-private CSS.
- Foundation now owns the reusable page-title hierarchy used by the hero area and ready for later low-risk page header migration.
- `apps/cutter-web/src/styles.css` decreased from `3688` lines after Batch 5.104 to `3663` lines after Batch 5.105.
- `packages/ui-foundation/src/layout.css` increased from `864` lines after Batch 5.104 to `909` lines because the shared typography utilities were centralized.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 20 tests, 20 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `97.17 kB`, gzip `14.64 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`; hero title, description, and search alignment remained stable after moving typography ownership.
- `git diff --check` passed.
- `rg -n "cutter-project-hero h1|cutter-eyebrow|ml-page-title|Batch 5.105" packages/ui-foundation/src apps/cutter-web/src docs/ui-foundation/cutter-ui-css-debt-audit.md` can confirm the Foundation typography utilities exist, Project Home uses them, and production route CSS no longer contains the removed project-home hero typography selectors.

Remaining debt moved forward:

- General low-risk page headers still have route-group header typography selectors in `apps/cutter-web/src/styles.css`; migrate them to the same Foundation page typography utilities in a later low-risk page batch.
- Project Home board/detail layout remains page-owned; this is correct for now, but detail panel typography should be revisited when InspectorPanel migration continues.
- The app-wide compatibility focus rule in `apps/cutter-web/src/styles.css` remains tokenized but is still outside Foundation; it should be revisited when the remaining raw controls are migrated.
- Material-search-specific transcript and candidate typography remain deferred until the material search batch.

## Batch 5.106 Progress: Simple Page Header Typography Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- Settings page header.
- Cache management page header.
- Public library page header.
- Local library page header.
- Cut tasks header typography only.
- Cut list, search, source-detail, and desktop first-run simple headers.
- UI Foundation page typography utilities.

Layer classification:

- Header geometry, route grids, filters, inspectors, tables, cards, and page-specific content remain page composition.
- Kicker text, page title typography, and header description typography are reusable visual primitives and belong in Foundation.
- Cut-tasks table layout, status cells, detail inspector, search workflow, source details, cache data, auth, runtime, and NAS-backed data behavior remain unchanged.

Change made:

- Raised the specificity of `ml-page-kicker`, `ml-page-title`, and `ml-page-description` utilities so Foundation remains the typography owner even though `apps/cutter-web/src/styles.css` imports after Foundation CSS.
- Updated simple page headers to use `ml-page-kicker`, `ml-page-title`, and `ml-page-description`.
- Removed the global `.cutter-eyebrow`, `.cutter-page-header h1`, `.cutter-page-header p`, and `.cutter-page-header span` typography owners from production CSS.
- Removed the route-group header typography rules for local library, public library, operational pages, and cut tasks.
- Kept non-header text rules for `.cutter-note`, source-detail full text, and section-heading span because those are outside this header batch.
- Added and updated regression coverage proving header typography is Foundation-owned and route CSS no longer contains the removed header typography selectors.

Visual ownership result:

- Simple page headers now share one Foundation-owned typography hierarchy.
- `apps/cutter-web/src/styles.css` decreased from `3663` lines after Batch 5.105 to `3618` lines after Batch 5.106.
- `packages/ui-foundation/src/layout.css` remains `909` lines; this batch tightened existing typography utility selectors instead of adding new utility families.
- `npm run build:cutter-web` output CSS decreased from `97.17 kB` after Batch 5.105 to `95.91 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 20 tests, 20 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `95.91 kB`, gzip `14.48 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
- `git diff --check` passed.
- `rg -n "\\.cutter-eyebrow\\s*\\{|\\.cutter-page-header h1\\s*\\{|\\.cutter-page-header p,|data-cutter-route=\\\"local-library\\\"\\] \\.cutter-page-header h1|data-cutter-route=\\\"local-library\\\"\\] \\.cutter-page-header p|data-cutter-route=\\\"cut-tasks\\\"\\] \\.cutter-page-header h1|data-cutter-route=\\\"cut-tasks\\\"\\] \\.cutter-page-header p" apps/cutter-web/src/styles.css || true` returned no production CSS matches.

Remaining debt moved forward:

- Library empty states and pagination still use route-owned visual styles; decide whether they should move to Foundation empty/loading primitives in the low-risk page batch.
- Library view toggles are tokenized but still page-owned; they should move to a shared segmented-control primitive only if the same pattern appears elsewhere.
- Project Home board/detail layout remains page-owned; detail panel typography should be revisited with InspectorPanel migration.
- Cut-tasks table/status/detail visual migration remains its own batch; only the header typography was touched here.
- Material-search-specific transcript and candidate typography remain deferred until the material search batch.

## Batch 5.107 Progress: Library Empty, Pagination, And View Toggle Visuals Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- Public library empty state, pagination strip, and orientation segmented control.
- Local library empty state and segmented controls.
- UI Foundation shared visual utilities for segmented controls, empty panels, and pagination bars.

Layer classification:

- Public/local library pages still own data loading, filters, selected item state, gallery composition, inspector content, and pagination behavior.
- Segmented-control shell visuals, empty-state panel visuals, and pagination-bar visuals are reusable primitives and belong in Foundation.
- `cutter-local-view-toggle`, `cutter-library-empty-state`, `cutter-library-pagination`, and `cutter-public-library-pagination` remain semantic/business hooks only; they no longer own the visual shell.
- Search, cut, cache, auth, runtime, NAS-backed data, and source-video behavior remain unchanged.

Change made:

- Added Foundation-owned `ml-segmented-control`, `ml-empty-panel`, and `ml-pagination-bar` utilities.
- Updated public-library and local-library markup to compose the semantic page classes with the matching `ml-*` Foundation utility classes.
- Removed the remaining production CSS visual owners for `.cutter-local-view-toggle`, `.cutter-library-empty-state`, `.cutter-library-empty-state strong/span`, `.cutter-library-pagination`, and `.cutter-library-pagination span`.
- Kept `.cutter-local-library-controls` as page composition because it only positions the page-specific control group.
- Added regression coverage proving Foundation owns the shared visual rules and production page CSS does not reintroduce the removed route-owned selectors.

Visual ownership result:

- Public and local library empty states now share the same Foundation empty-panel visual contract.
- Public library pagination now shares the Foundation pagination-bar visual contract.
- Public and local library segmented controls now share the same Foundation segmented-control visual contract.
- `apps/cutter-web/src/styles.css` decreased from `3618` lines after Batch 5.106 to `3566` lines after Batch 5.107.
- `packages/ui-foundation/src/layout.css` increased from `909` lines after Batch 5.106 to `964` lines because the shared visual primitives were centralized.
- `npm run build:cutter-web` output CSS decreased from `95.91 kB` after Batch 5.106 to `95.75 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 21 tests, 21 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `95.75 kB`, gzip `14.52 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
- `git diff --check` passed.
- `rg -n "\\.cutter-library-empty-state\\s*\\{|\\.cutter-library-empty-state\\s+(strong|span)|\\.cutter-library-pagination\\s*\\{|\\.cutter-library-pagination\\s+span|\\.cutter-local-view-toggle\\s*\\{|data-cutter-route=\\\"local-library\\\"\\] \\.cutter-local-view-toggle|data-cutter-route=\\\"public-library\\\"\\] \\.cutter-local-view-toggle" apps/cutter-web/src/styles.css || true` returned no production CSS matches.

Remaining debt moved forward:

- Library card/grid composition still remains page-owned where it describes business layout; any remaining card-body visual rules should be evaluated in the next low-risk cleanup pass.
- Settings cut-mode toggle still has its own page-local visual shell; decide whether it should adopt `ml-segmented-control` in a focused settings/control cleanup batch.
- Project Home board/detail layout remains page-owned; detail panel typography should be revisited with InspectorPanel migration.
- Cut-tasks table/status/detail visual migration remains its own batch.
- Material-search-specific transcript and candidate typography remain deferred until the material search batch.

## Batch 5.108 Progress: Settings Cut Mode Toggle Moved To Foundation Segmented Control

Date: 2026-06-20.

Routes/components in scope:

- Settings page default cut-mode toggle.
- UI Foundation `ml-segmented-control`.

Layer classification:

- Settings page still owns the settings form rows, runtime values, select inputs, account form, doctor data, and cut-mode change callback.
- The cut-mode segmented shell is a reusable visual primitive and belongs in Foundation.
- `cutter-cut-mode-toggle` and `cutter-settings-cut-mode-toggle` remain semantic settings hooks only; they no longer own display, gap, border, radius, padding, or background.
- Auth, cache, runtime, source filters, orientation filters, default mode persistence, and cut behavior remain unchanged.

Change made:

- Added `ml-segmented-control` to the settings default cut-mode toggle markup.
- Removed the settings route-owned `.cutter-cut-mode-toggle` visual rule from production CSS.
- Updated regression coverage so settings renders the Foundation segmented-control class and production CSS cannot reintroduce a settings-specific `.cutter-cut-mode-toggle` visual shell.

Visual ownership result:

- Settings cut-mode toggle now shares the same Foundation segmented-control contract as public/local library view toggles.
- `apps/cutter-web/src/styles.css` decreased from `3566` lines after Batch 5.107 to `3556` lines after Batch 5.108.
- `packages/ui-foundation/src/layout.css` remained `964` lines because this batch reused the existing Foundation primitive.
- `npm run build:cutter-web` output CSS decreased from `95.75 kB` after Batch 5.107 to `95.45 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 21 tests, 21 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `95.45 kB`, gzip `14.47 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings-cut-mode-toggle.png`
- `git diff --check` passed.
- `rg -n "data-cutter-route=\\\"settings\\\"\\] \\.cutter-cut-mode-toggle|\\.cutter-cut-mode-toggle\\s*\\{|\\.cutter-cut-mode-toggle button|cutter-settings-cut-mode-toggle ml-segmented-control" apps/cutter-web/src packages/ui-foundation/src || true` confirmed the production CSS visual rule is gone and only semantic markup/test references remain.

Remaining debt moved forward:

- Appearance/source/orientation select controls still use route-owned select styling; decide whether they should become a Foundation select/field primitive in a later controls batch.
- Settings doctor panel still has a page-local shell because it is not yet an `InspectorPanel`/data-list-only composition; revisit with InspectorPanel cleanup.
- Library card/grid composition remains page-owned where it describes business layout.
- Project Home board/detail layout remains page-owned.
- Cut-tasks table/status/detail visual migration remains its own batch.
- Material-search-specific transcript and candidate typography remain deferred until the material search batch.

## Batch 5.109 Progress: Settings Selects And Doctor Surface Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- Settings page source/orientation/display select controls.
- Settings environment-check doctor surface.
- UI Foundation field-select and data-surface utilities.

Layer classification:

- Settings page still owns settings values, option lists, callbacks, doctor check data, form grouping, and row composition.
- Select field visual chrome is a reusable control primitive and belongs in Foundation.
- Bordered data-list surface chrome is a reusable visual primitive and belongs in Foundation.
- `cutter-appearance-select` and `cutter-settings-doctor` remain semantic settings hooks only; they no longer own border, radius, background, typography, display, gap, or overflow shell styling.
- Password form styling remains page-owned for now because it is a larger form migration and should be handled as a separate controls batch.
- Auth, cache, runtime, default filter persistence, default orientation persistence, display-mode persistence, and doctor behavior remain unchanged.

Change made:

- Added Foundation-owned `ml-field-select` and `ml-data-surface` utilities.
- Updated all Settings select controls to compose `cutter-appearance-select ml-field-select`.
- Updated Settings doctor surface to compose `cutter-settings-doctor ml-data-surface`.
- Removed the settings route-owned `.cutter-appearance-select` and `.cutter-settings-doctor` visual rules from production CSS.
- Updated regression coverage so settings renders the Foundation field/data-surface classes and production CSS cannot reintroduce route-owned settings select or doctor surface shells.

Visual ownership result:

- Settings select controls now share a Foundation field-select visual contract instead of a settings-only route rule.
- Settings doctor panel now shares a Foundation data-surface visual contract instead of a settings-only route rule.
- `apps/cutter-web/src/styles.css` decreased from `3556` lines after Batch 5.108 to `3537` lines after Batch 5.109.
- `packages/ui-foundation/src/layout.css` increased from `964` lines after Batch 5.108 to `983` lines because the field and data-surface utilities were centralized.
- `npm run build:cutter-web` output CSS decreased from `95.45 kB` after Batch 5.108 to `95.31 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 21 tests, 21 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `95.31 kB`, gzip `14.48 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings-cut-mode-toggle.png`
- `git diff --check` passed.
- `rg -n "data-cutter-route=\\\"settings\\\"\\] \\.cutter-appearance-select|data-cutter-route=\\\"settings\\\"\\] \\.cutter-settings-doctor|\\.cutter-appearance-select\\s*\\{|\\.cutter-settings-doctor\\s*\\{|ml-field-select|ml-data-surface" apps/cutter-web/src packages/ui-foundation/src || true` confirmed the production CSS visual rules are gone and only semantic markup/test/Foundation references remain.

Remaining debt moved forward:

- Settings password form inputs and messages still own form-control visual styling; migrate them in a focused form-controls batch if Foundation field/input primitives are accepted.
- Cache management check/detail list surfaces still have some page-owned list shell and detail styling; evaluate whether `ml-data-surface` can replace part of that without changing cache semantics.
- Library card/grid composition remains page-owned where it describes business layout.
- Project Home board/detail layout remains page-owned.
- Cut-tasks table/status/detail visual migration remains its own batch.
- Material-search-specific transcript and candidate typography remain deferred until the material search batch.

## Batch 5.110 Progress: Settings Password Form Visuals Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- Settings account-security password form.
- UI Foundation form stack, summary row, field, input, and form-message utilities.
- Settings main-column scroll composition.

Layer classification:

- Settings page still owns account-security copy, form field order, submit handler, password state, validation messages, and auth API callback wiring.
- Form stack rhythm, summary-row typography, label rhythm, input chrome, focus/disabled state, and success/error message colors are reusable form-control visuals and now belong in Foundation.
- `cutter-password-*` classes remain semantic settings hooks only; they no longer own display, gap, input border/radius/background, focus outline, disabled color, or message color styling.
- Settings main-column scroll containment is page composition. It must allow content-flow rows to remain reachable inside the workbench scroll area.
- Password change business logic, auth flow, API contract, runtime status, and persistence remain unchanged.

Change made:

- Added Foundation-owned `ml-form-stack`, `ml-form-summary-row`, `ml-form-field`, `ml-field-input`, `ml-form-message`, `ml-form-message--danger`, and `ml-form-message--success` utilities.
- Updated the Settings password form to compose semantic `cutter-password-*` hooks with those Foundation utilities.
- Removed the settings route-owned `.cutter-password-form`, `.cutter-password-current-user`, `.cutter-password-form label`, `.cutter-password-form input`, and `.cutter-password-message` visual rules from production CSS.
- Added settings page composition rules so the Settings main column uses content-sized grid rows and the password form is reachable through the page's own scroll container.
- Updated regression coverage so the Settings page renders Foundation form classes and production CSS cannot reintroduce the old password-form visual selectors.

Visual ownership result:

- Settings password inputs now share the same Foundation field/input visual contract as future form controls.
- Success and error message colors now come from Foundation state utilities instead of settings-only selectors.
- Settings no longer clips the account-security card to a 2px grid row; the page main scroll area now includes the full password card.
- `apps/cutter-web/src/styles.css` decreased from `3537` lines after Batch 5.109 to `3476` lines after Batch 5.110, even after adding the settings scroll-composition guard.
- `packages/ui-foundation/src/layout.css` increased from `983` lines after Batch 5.109 to `1046` lines because the reusable form utilities were centralized.
- `npm run build:cutter-web` output CSS changed from `95.31 kB` after Batch 5.109 to `95.26 kB`, gzip `14.43 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 21 tests, 21 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `95.26 kB`, gzip `14.43 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings-password-form.png`
- Settings scroll proof after the fix:
  - `.cutter-page-main` reported `scrollTop: 735`, `scrollHeight: 1711`, `clientHeight: 976`.
  - `.cutter-settings-security` reported a visible `402px` card height instead of the earlier clipped `2px` grid row.
- `git diff --check` passed.
- `rg -n "^\\.cutter-password-form\\s*\\{|^\\.cutter-password-current-user\\s*\\{|\\.cutter-password-current-user strong|\\.cutter-password-form label|\\.cutter-password-form input|^\\.cutter-password-message\\s*\\{|\\.cutter-password-message\\.is-error|\\.cutter-password-message\\.is-success|ml-form-stack|ml-form-summary-row|ml-form-field|ml-field-input|ml-form-message" apps/cutter-web/src packages/ui-foundation/src` confirmed old production CSS visual rules are gone and only semantic markup/test/Foundation references remain.

Remaining debt moved forward:

- Settings still has route-owned row composition for `cutter-info-row` and `cutter-settings-doctor-row`; keep only if those remain page-specific layout after the low-risk batch completes.
- Cache management check/detail list surfaces still need evaluation for `ml-data-surface` or a stronger data-list primitive.
- Library card/grid composition remains page-owned where it describes business layout.
- Project Home board/detail layout remains page-owned.
- Cut-tasks table/status/detail visual migration remains its own batch.
- Material-search-specific transcript and candidate typography remain deferred until the material search batch.

## Batch 5.111 Progress: Cache Management Metric And Detail Visuals Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- Cache management metric stat cards.
- Cache management meter/progress bars.
- Cache location inspector sections.
- UI Foundation metric, meter, and detail-section utilities.

Layer classification:

- Cache management page still owns cache data, runtime status mapping, card order, clear-cache action, panel grid layout, row column widths, and scroll composition.
- Metric-card rhythm, metric value typography, metric description typography, meter shell/fill/tone colors, and inspector detail-section title/copy/separator styling are reusable visual primitives and now belong in Foundation.
- `cutter-cache-*` classes remain semantic route hooks and page-composition hooks only; they no longer own the metric value, metric description, meter fill, or inspector detail-section visual treatment.
- Cache behavior, runtime API usage, local-storage cache clearing, cache-size calculations, and cache-status tone mapping remain unchanged.

Change made:

- Added Foundation-owned `ml-metric-card-body`, `ml-metric-summary`, `ml-metric-value`, `ml-metric-description`, `ml-meter`, `ml-meter-fill`, `ml-detail-section`, `ml-detail-section-title`, and `ml-detail-section-copy` utilities.
- Updated cache metric cards to compose existing semantic cache classes with Foundation metric/meter classes.
- Updated cache location inspector sections to use Foundation detail-section primitives.
- Removed cache route-owned metric card body, summary, value, description, meter, meter tone, inspector section, inspector title, and inspector copy visual rules from production CSS.
- Updated regression coverage so cache management renders Foundation metric/detail classes and production CSS cannot reintroduce old cache metric/meter/detail-section visual selectors.

Visual ownership result:

- Cache stats now share a reusable Foundation metric visual contract instead of cache-only typography and progress-bar rules.
- Cache inspector paths now share a reusable Foundation detail-section visual contract instead of cache-only section/h3/p rules.
- Page CSS still owns cache stats grid, panels grid, row column layouts, and inspector body layout because those are page composition.
- `apps/cutter-web/src/styles.css` decreased from `3476` lines after Batch 5.110 to `3393` lines after Batch 5.111.
- `packages/ui-foundation/src/layout.css` increased from `1046` lines after Batch 5.110 to `1133` lines because metric, meter, and detail-section utilities were centralized.
- `npm run build:cutter-web` output CSS changed from `95.26 kB` after Batch 5.110 to `95.23 kB`, gzip `14.43 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 22 tests, 22 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `95.23 kB`, gzip `14.43 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/cache-management.png`
- `git diff --check` passed.
- `rg -n "^\\.cutter-cache-stat-body\\s*\\{|^\\.cutter-cache-stat-summary\\s*\\{|\\.cutter-cache-stat strong\\s*\\{|\\.cutter-cache-stat p\\s*\\{|^\\.cutter-cache-meter\\s*\\{|\\.cutter-cache-meter span|\\.cutter-cache-inspector section\\s*\\{|\\.cutter-cache-inspector h3\\s*\\{|\\.cutter-cache-inspector p\\s*\\{|ml-metric-card-body|ml-metric-summary|ml-metric-value|ml-meter|ml-detail-section" apps/cutter-web/src packages/ui-foundation/src` confirmed old production CSS visual rules are gone and only semantic markup/test/Foundation references remain.

Remaining debt moved forward:

- Cache management still owns stats-grid, panels-grid, and data-row column widths as page composition.
- Cache management check/detail rows still use route-specific column templates; keep them unless a repeated operational-list pattern emerges across settings/cache/cut-tasks.
- Settings still has route-owned row composition for `cutter-info-row` and `cutter-settings-doctor-row`; keep only if those remain page-specific layout after the low-risk batch completes.
- Library card/grid composition remains page-owned where it describes business layout.
- Project Home board/detail layout remains page-owned.
- Cut-tasks table/status/detail visual migration remains its own batch.
- Material-search-specific transcript and candidate typography remain deferred until the material search batch.

## Batch 5.112 Progress: Library Gallery Media Tile Visuals Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- Public library gallery cards.
- Local library gallery cards.
- Shared `LibraryGallery` media tile markup.
- UI Foundation media tile visual primitives.

Layer classification:

- Public and local library pages still own material filtering, grouping, selected item state, load-more behavior, inspector data, and the route-specific grid column layout.
- `LibraryGallery` still owns business markup for source video fields: title, meta, tags, description, action link, thumbnail, and click selection.
- Card overflow, body/action grid behavior, button reset, focus ring, copy spacing, title typography, meta typography, description clamping, link color, and tag wrapping are reusable media-tile visuals and now belong in Foundation.
- `cutter-library-card`, `cutter-library-card-body`, `cutter-library-card-button`, `cutter-library-card-copy`, and `cutter-library-card-tags` remain semantic route hooks only; they no longer own visual card, button, text, or tag styling.
- Source video data, filters, pagination, selection, and inspector behavior remain unchanged.

Change made:

- Added Foundation-owned `ml-media-tile-card`, `ml-media-tile-body`, `ml-media-tile-action`, `ml-media-tile-copy`, `ml-media-tile-title`, `ml-media-tile-meta`, `ml-media-tile-description`, `ml-media-tile-link`, and `ml-media-tile-tags` utilities.
- Updated `LibraryGallery` to compose semantic `cutter-library-*` hooks with Foundation media tile classes.
- Kept `bodyFlush` on the Foundation `Card` so media tiles do not need a page-owned `Card` internals selector.
- Removed route-owned library card overflow, card body layout, button reset, focus ring, copy spacing, title/meta/description text rules, link rule, and tag wrapping from production CSS.
- Updated regression coverage so library cards render Foundation media tile primitives and production CSS cannot reintroduce the removed page-owned visual selectors.

Visual ownership result:

- Public and local library media cards now share a reusable Foundation media tile contract.
- The page CSS still owns `.cutter-library-grid` and route-specific grid density because that describes page composition, not reusable card visuals.
- The search for removed selectors confirms that no production rule remains for `.cutter-library-card`, `.cutter-library-card-body`, `.cutter-library-card-button`, `.cutter-library-card-button:focus-visible`, `.cutter-library-card-copy`, `.cutter-library-card-copy strong/span/p`, `.cutter-library-card-tags`, or `.cutter-library-card img`.
- `apps/cutter-web/src/styles.css` decreased from `3393` lines after Batch 5.111 to `3314` lines after Batch 5.112.
- `packages/ui-foundation/src/layout.css` increased from `1133` lines after Batch 5.111 to `1208` lines because media tile utilities were centralized.
- `npm run build:cutter-web` output CSS changed from `95.23 kB` after Batch 5.111 to `95.10 kB`, gzip `14.41 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 22 tests, 22 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `95.10 kB`, gzip `14.41 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
- `git diff --check` passed.
- `rg -n "^\\.cutter-library-card\\s*\\{|^\\.cutter-library-card-body\\s*\\{|^\\.cutter-library-card-button\\s*\\{|\\.cutter-library-card-button:focus-visible|^\\.cutter-library-card-copy\\s*\\{|\\.cutter-library-card-copy (?:strong|span|p)|^\\.cutter-library-card-tags\\s*\\{|ml-media-tile-card|ml-media-tile-body|ml-media-tile-action|ml-media-tile-copy|ml-media-tile-title|ml-media-tile-meta|ml-media-tile-description|ml-media-tile-link|ml-media-tile-tags" apps/cutter-web/src packages/ui-foundation/src` confirmed old production CSS visual rules are gone and only semantic markup/test/Foundation references remain.

Remaining debt moved forward:

- Library grid layout remains page-owned until a repeated gallery grid pattern appears across non-library pages.
- Library empty, segmented, pagination, inspector, and media frame primitives are already Foundation-owned from earlier batches; continue watching for page-level overrides.
- Settings still has route-owned row composition for `cutter-info-row` and `cutter-settings-doctor-row`; keep only if those remain page-specific layout after the low-risk batch completes.
- Cache management still owns stats-grid, panels-grid, and data-row column widths as page composition.
- Project Home board/detail layout remains page-owned.
- Cut-tasks table/status/detail visual migration remains its own batch.
- Material-search-specific transcript and candidate typography remain deferred until the material search batch.

## Batch 5.113 Progress: Cut Tasks Button Count And Status Icon Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- Cut tasks status-filter count chips.
- Cut tasks completed-action check icon.
- UI Foundation button-count and status-icon primitives.

Layer classification:

- Cut tasks page still owns task filtering, status counts, action availability, retry behavior, table columns, pipeline state, and selected task detail data.
- Filter count chip geometry/color and the circular completed check indicator are reusable control/status visuals and now belong in Foundation.
- `cutter-queue-filter-button` remains a semantic cut-task hook for the filter button's route-specific density only.
- The completed action no longer uses a cut-task-specific `cutter-queue-action-check` visual class.
- No cut job runtime, retry handler, table data, status mapping, search, cache, auth, or desktop behavior changed.

Change made:

- Added Foundation-owned `ml-button-count` and `ml-status-icon` primitives.
- Added Foundation active count styling for `.ml-button.is-active .ml-button-count` and `.ml-button[aria-pressed="true"] .ml-button-count`.
- Updated cut-task filter counts to render `className="ml-button-count"`.
- Updated the completed task action to render `className="ml-status-icon ml-status-icon--ready"`.
- Removed cut-task route-owned `.cutter-queue-filter-button .ml-button-label`, `.cutter-queue-filter-button strong`, `.cutter-queue-filter-button.is-active strong`, `.cutter-queue-action-check`, and `.cutter-queue-action-check svg` visual rules from production CSS.
- Updated regression coverage so cut tasks must use the Foundation classes and production CSS cannot reintroduce the old page-owned selectors.

Visual ownership result:

- Filter count chips are now a shared button sub-primitive instead of a cut-task-only strong tag styling rule.
- Completed action indicators are now a shared status-icon primitive instead of a cut-task-only circular icon rule.
- Cut-task CSS still owns route layout, table density, table-cell truncation, and filter-row composition because those are workflow/page composition.
- `apps/cutter-web/src/styles.css` decreased from `3314` lines after Batch 5.112 to `3274` lines after Batch 5.113.
- `packages/ui-foundation/src/layout.css` increased from `1208` lines after Batch 5.112 to `1252` lines because button-count and status-icon utilities were centralized.
- `npm run build:cutter-web` output CSS changed from `95.10 kB` after Batch 5.112 to `94.80 kB`, gzip `14.43 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 23 tests, 23 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `94.80 kB`, gzip `14.43 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
- `git diff --check` passed.
- `rg -n "cutter-queue-filter-button \\.ml-button-label|cutter-queue-filter-button strong|cutter-queue-filter-button\\.is-active strong|cutter-queue-action-check|ml-button-count|ml-status-icon" apps/cutter-web/src packages/ui-foundation/src` confirmed old production CSS visual rules are gone and only semantic markup/test/Foundation references remain.

Remaining debt moved forward:

- Cut-task filter row layout, pipeline-card body layout, table column density, table-cell truncation, and detail-row column width remain page composition.
- Cut-task problem/status text colors still use workflow-specific text classes; keep until deciding whether the problem text should become a Foundation status-text primitive.
- Project Home board/detail layout remains page-owned.
- Material-search-specific transcript and candidate typography remain deferred until the material search batch.

## Batch 5.114 Progress: Cut Tasks Problem Status Text Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- Cut tasks problem column status text.
- UI Foundation semantic status-text primitives.

Layer classification:

- Cut tasks owns problem text content, mapping job status to problem text, table column width, and one-line truncation.
- Status text font weight and semantic colors are reusable and belong in Foundation.
- No cut job runtime, retry handler, table data, status mapping, search, cache, auth, or desktop behavior changed.

Change made:

- Added `ml-status-text` and `ml-status-text--pending/running/done/failed/cancelled`.
- Updated cut-task problem cells to compose `cutter-queue-problem` with Foundation status-text classes.
- Removed route-owned `.cutter-queue-problem` font-weight and `.cutter-queue-problem.is-*` color rules.
- Updated regression coverage so rendered cut-task rows must use Foundation status text classes and production CSS cannot reintroduce the old selectors.

Visual ownership result:

- Problem/status text colors now share the same Foundation semantic status contract as future status text.
- Cut-task CSS still owns one-line truncation, table density, columns, and detail layout as page composition.
- `apps/cutter-web/src/styles.css` decreased from `3274` lines after Batch 5.113 to `3250` after Batch 5.114.
- `packages/ui-foundation/src/layout.css` increased from `1252` to `1276`.
- `npm run build:cutter-web` output CSS changed from `94.80 kB` after Batch 5.113 to `94.37 kB`, gzip `14.42 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 24 tests, 24 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `94.37 kB`, gzip `14.42 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
- `git diff --check` passed.
- `rg -n "cutter-queue-problem\\.is-|cutter-queue-problem\\s*\\{[^}]*font-weight|ml-status-text" apps/cutter-web/src packages/ui-foundation/src` confirmed old production CSS visual rules are gone and only semantic markup/test/Foundation references remain.

Remaining debt moved forward:

- Cut-task action status colors (`cutter-queue-actions.is-running/is-done`) still use route-specific text colors unless migrated in the next cut-task batch.
- Cut-task source button typography and pipeline text typography still need classification.
- Project Home board/detail layout remains page-owned.
- Material-search-specific transcript and candidate typography remain deferred until the material search batch.

## Batch 5.115 Progress: Cut Tasks Action Status Text Reused Foundation

Date: 2026-06-20.

Routes/components in scope:

- Cut tasks action column passive status text.
- UI Foundation semantic status-text primitives from Batch 5.114.

Layer classification:

- Cut tasks owns action availability, retry behavior, done icon decision, failed retry button, action column width, and inline-flex alignment.
- Passive action text color and weight for pending/running/cancelled states are semantic status text and should reuse Foundation.
- Failed actions remain a danger `Button`; completed actions remain a Foundation `ml-status-icon`.
- No cut job runtime, retry handler, table data, status mapping, search, cache, auth, or desktop behavior changed.

Change made:

- Removed `is-${job.status}` from the action cell wrapper.
- Rendered passive action text as `ml-status-text ml-status-text--${job.status}`.
- Removed route-owned `.cutter-queue-actions.is-running` and `.cutter-queue-actions.is-done` color rules.
- Removed route-owned `color` and `font-weight` from `.cutter-queue-actions`; the wrapper now owns layout only.
- Updated regression coverage so rendered action text must use Foundation status text classes and production CSS cannot reintroduce action-status color classes.

Visual ownership result:

- Problem column and action column now share the same Foundation status-text contract.
- Cut-task CSS still owns action cell alignment, button size override for dense table rows, and table/action column layout.
- `apps/cutter-web/src/styles.css` decreased from `3250` lines after Batch 5.114 to `3240` after Batch 5.115.
- `packages/ui-foundation/src/layout.css` stayed at `1276` because this batch reused existing Foundation primitives.
- `npm run build:cutter-web` output CSS changed from `94.37 kB` after Batch 5.114 to `94.07 kB`, gzip `14.39 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 24 tests, 24 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `94.07 kB`, gzip `14.39 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
- `git diff --check` passed.
- `rg -n "cutter-queue-actions\\.is-|cutter-queue-actions\\s*\\{[^}]*(?:color|font-weight)|ml-status-text" apps/cutter-web/src packages/ui-foundation/src` confirmed old action status CSS is gone and only semantic markup/test/Foundation references remain.

Remaining debt moved forward:

- Cut-task source button typography still needs classification: reset/link-like button behavior may become a Foundation table-link/action primitive or remain page composition.
- Cut-task pipeline card text typography still needs classification.
- Cut-task filter row layout, table column density, table-cell truncation, and detail-row column width remain page composition.
- Project Home board/detail layout remains page-owned.
- Material-search-specific transcript and candidate typography remain deferred until the material search batch.

## Batch 5.116 Progress: Cut Tasks Source Text Button And Pipeline Summary Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- Cut tasks source column text button.
- Cut tasks local pipeline summary card text hierarchy.
- UI Foundation table text button and inline summary primitives.

Layer classification:

- Cut tasks owns source selection behavior, selected job state, table columns, pipeline state text, and pipeline card grid layout.
- A reset/link-like text button inside table cells is a reusable table action primitive and belongs in Foundation.
- Inline label/value summary typography and supporting text typography are reusable information hierarchy primitives and belong in Foundation.
- No cut job runtime, retry handler, table data, status mapping, search, cache, auth, or desktop behavior changed.

Change made:

- Added `ml-table-text-button` with truncation, button reset, hover color, and focus-visible ring.
- Added `ml-inline-summary` for compact label/value rows.
- Added `ml-supporting-text` for secondary explanatory text.
- Updated the cut-task source button to compose `cutter-queue-source-button ml-table-text-button`.
- Updated the cut-task pipeline summary to use `ml-inline-summary` and `ml-supporting-text`.
- Removed route-owned `.cutter-queue-source-button` visual rules.
- Removed route-owned pipeline text hierarchy rules for `.cutter-queue-pipeline-card-body > div`, `.cutter-queue-pipeline-card span/p`, and `.cutter-queue-pipeline-card strong`.
- Updated regression coverage so cut tasks must render Foundation classes and production CSS cannot reintroduce the removed route-owned selectors.

Visual ownership result:

- Source text buttons can now be reused by other dense table pages without another page-local reset.
- Pipeline summary text now shares a reusable inline-summary/supporting-text hierarchy.
- Cut-task CSS still owns pipeline card grid, filter row layout, table column density, table-cell truncation, and detail-row column width as page composition.
- `apps/cutter-web/src/styles.css` decreased from `3240` lines after Batch 5.115 to `3203` after Batch 5.116.
- `packages/ui-foundation/src/layout.css` increased from `1276` to `1330` because table text button and inline summary utilities were centralized.
- `npm run build:cutter-web` output CSS changed from `94.07 kB` after Batch 5.115 to `93.99 kB`, gzip `14.41 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 25 tests, 25 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `93.99 kB`, gzip `14.41 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
- `git diff --check` passed.
- `rg -n "cutter-queue-source-button\\s*\\{|cutter-queue-pipeline-card-body > div|cutter-queue-pipeline-card (?:span|p)|cutter-queue-pipeline-card strong|ml-table-text-button|ml-inline-summary|ml-supporting-text" apps/cutter-web/src packages/ui-foundation/src` confirmed old production CSS visual rules are gone and only semantic markup/test/Foundation references remain.

Remaining debt moved forward:

- Cut-task filter row layout, table column density, table-cell truncation, action-cell alignment, dense retry-button sizing, pipeline card grid, and detail-row column width remain page composition.
- Cut-task table header route overrides still need one more classification pass before considering the cut-task page visually migrated.
- Project Home board/detail layout remains page-owned.
- Material-search-specific transcript and candidate typography remain deferred until the material search batch.

## Batch 5.117 Progress: Cut Tasks Workbench Table Variant Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- Cut tasks workbench table scroll containment.
- Cut tasks fitted table layout and compact header density.
- UI Foundation workbench table variant.

Layer classification:

- Cut tasks owns visible columns, column widths, selected row behavior, load-more behavior, and which table data appears.
- Scroll containment, fixed table layout, stable scrollbar gutter, compact responsive cell padding, and centered sticky workbench table headers are reusable table behavior/visual rules and belong in Foundation.
- No cut job runtime, retry handler, table data, status mapping, search, cache, auth, or desktop behavior changed.

Change made:

- Added Foundation-owned `.ml-table-wrap.is-workbench`.
- Moved table scroll containment, `table-layout: fixed`, compact responsive cell padding, sticky header z-index, header background, and centered header alignment into the Foundation workbench table variant.
- Updated the cut-task table to render `className="cutter-queue-table is-workbench"`.
- Removed route-owned `.cutter-queue-table.ml-table-wrap`, `.cutter-queue-table .ml-table`, `.cutter-queue-table .ml-table th/td`, and `.cutter-queue-table .ml-table th` rules.
- Updated shell/scroll regression coverage so cut-task table scrolling is proven through Foundation instead of route CSS.

Visual ownership result:

- Dense workbench tables now have one reusable Foundation variant instead of route-specific table internals.
- Cut-task CSS still owns filter row layout, action-cell alignment, dense retry-button sizing, pipeline card grid, table-cell text truncation, and detail-row column width as page composition.
- `apps/cutter-web/src/styles.css` decreased from `3203` lines after Batch 5.116 to `3177` after Batch 5.117.
- `packages/ui-foundation/src/layout.css` increased from `1330` to `1355` because workbench table utilities were centralized.
- `npm run build:cutter-web` output CSS changed from `93.99 kB` after Batch 5.116 to `93.66 kB`, gzip `14.40 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 26 tests, 26 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `93.66 kB`, gzip `14.40 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
- `git diff --check` passed.
- `rg -n "cutter-queue-table\\.ml-table-wrap\\s*\\{|cutter-queue-table \\.ml-table\\s*\\{|cutter-queue-table \\.ml-table th|ml-table-wrap\\.is-workbench" apps/cutter-web/src packages/ui-foundation/src` confirmed old production CSS table internals are gone and only Foundation/test references remain.

Remaining debt moved forward:

- Cut-task filter row layout, action-cell alignment, dense retry-button sizing, pipeline card grid, text truncation, and detail-row column width remain page composition unless reused by another page.
- Cut-task page is close to visually migrated; next pass should decide whether to stop cut-task migration or extract a small Foundation action-cell/dense-button utility.
- Project Home board/detail layout remains page-owned.
- Material-search-specific transcript and candidate typography remain deferred until the material search batch.

## Batch 5.118 Progress: Cut Tasks Workbench Surface And Button Icon Rules Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- Cut tasks filter card, pipeline card, and workbench table surface.
- Cut tasks filter buttons and retry action button density.
- Cut tasks directory buttons with leading icons.
- UI Foundation workbench card/table surface and Button icon sizing.

Layer classification:

- Cut tasks owns filter choices, selected status, project output directory action placement, pipeline state text, table columns, table-cell truncation, action-cell alignment, and detail-row column widths.
- Workbench surface treatment for cards/tables is reusable visual hierarchy and belongs in Foundation.
- Button icon sizing and standard small-button density belong in Foundation/Button, not in a cut-task route selector.
- No cut job runtime, retry handler, table data, status mapping, search, cache, auth, or desktop behavior changed.

Change made:

- Added Foundation-owned `.ml-card.is-workbench` surface rules.
- Extended Foundation-owned `.ml-table-wrap.is-workbench` to own border color, translucent surface background, and panel shadow.
- Added Foundation-owned `.ml-button-icon svg` sizing.
- Updated cut-task filter and pipeline cards to render `is-workbench`.
- Updated cut-task filter buttons to use Foundation `size="sm"` instead of route-owned sizing.
- Removed route-owned cut-task workbench surface rule for filter card, pipeline card, and table.
- Removed route-owned `.cutter-queue-filter-button.ml-button` sizing.
- Removed route-owned directory button SVG sizing.
- Removed route-owned `.cutter-queue-actions .ml-button--sm` sizing.
- Updated regression coverage so page CSS cannot reintroduce those removed visual rules.

Visual ownership result:

- Workbench card/table hierarchy is now shared by Foundation instead of duplicated in the cut-task route.
- Button icon size and small-button rhythm now come from the shared Button primitive.
- Cut-task CSS now primarily contains page composition: route grid, page-main rows, filter layout, pipeline body grid, table-cell truncation, action-cell alignment, empty text color, and detail panel layout.
- `apps/cutter-web/src/styles.css` decreased from `3177` lines after Batch 5.117 to `3152` after Batch 5.118.
- `packages/ui-foundation/src/layout.css` increased from `1355` to `1369` because workbench surface and button icon sizing moved into Foundation.
- `npm run build:cutter-web` output CSS changed from `93.66 kB` after Batch 5.117 to `93.10 kB`, gzip `14.34 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 26 tests, 26 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `93.10 kB`, gzip `14.34 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
- `git diff --check` passed.
- `rg -n "cutter-queue-filter-button\\.ml-button|cutter-queue-actions \\.ml-button--sm|cutter-queue-directory-action svg|cutter-queue-detail-directory svg|cutter-queue-filter-card,|cutter-queue-pipeline-card," apps/cutter-web/src/styles.css packages/ui-foundation/src/layout.css apps/cutter-web/src/cutter-app.test.ts` confirmed the removed route-owned rules are absent from production CSS; only negative regression tests remain for SVG selectors.

Cut tasks closeout classification:

- Keep as page composition:
  - `.cutter-cut-queue` route grid and inspector column width.
  - `.cutter-cut-queue .cutter-page-main` row stack and overflow ownership.
  - `.cutter-queue-filter-card-body` and `.cutter-queue-filter-list` filter toolbar layout.
  - `.cutter-queue-directory-action` flex behavior inside that toolbar.
  - `.cutter-queue-pipeline-card-body` two-column pipeline body layout.
  - `.cutter-queue-time-range`, `.cutter-queue-selected-text`, and `.cutter-queue-problem` table-cell truncation tied to this table's column model.
  - `.cutter-queue-actions` action-cell alignment and minimum width.
  - `.cutter-queue-detail`, `.cutter-queue-detail-list`, `.cutter-queue-detail-row`, and detail `dd` wrapping for the task inspector content model.
- Already moved to Foundation:
  - Page typography.
  - Card/table/inspector surface hierarchy.
  - Workbench table scroll and sticky header density.
  - Badge/status color semantics.
  - Status text colors.
  - Status success icon.
  - Table text button.
  - Inline summary and supporting text.
  - Button count and button icon sizing.

Remaining debt moved forward:

- Cut-task page can now be considered visually migrated enough to leave the page-owned composition rules in place.
- Next UI Foundation batch should move to the low-risk page family closeout or Project Home board/detail layout cleanup, before starting the high-risk material-search page.
- Material-search-specific transcript and candidate typography remain deferred until the material search batch.

## Batch 5.119 Progress: Low-Risk Page Scroll Ownership Moved To Shell

Date: 2026-06-20.

Routes/components in scope:

- Settings page main content.
- Cache management panel grid.
- Local library list area.
- Public library list area.
- Cutter Shell internal scroll contract.

Layer classification:

- The Shell owns generic internal scroll containment for named route content regions.
- Low-risk pages own their business composition: settings form rows, cache panel grid, library gallery/list layout, empty-state placement, and inspector/content column relationships.
- Foundation data-row utilities own cache detail/check text hierarchy and secondary text color.
- No runtime, cache, search, cut, auth, API, source-video, or desktop sidecar behavior changed.

Change made:

- Added the shared Shell rule `.cutter-app[data-cutter-web-ready][data-cutter-route] .ml-scroll-region`.
- Added `ml-scroll-region` to the settings main area, cache management panel area, local library scroll area, and public library scroll area.
- Removed route-owned overflow, overscroll, and scrollbar-gutter rules from local library, public library, settings, and cache management.
- Removed the redundant cache detail/check secondary-text selector because the same hierarchy is already owned by Foundation data-row utilities.
- Updated cutter-web regression tests so the scroll contract is proven through the shared Shell selector instead of page-private overflow selectors.

Visual ownership result:

- Low-risk pages now use one internal scroll contract instead of page-by-page overflow rules.
- The page files still own data-specific layout and empty-state placement, but no longer own generic scroll behavior for these regions.
- `apps/cutter-web/src/styles.css` decreased from `3152` lines after Batch 5.118 to `3137` after Batch 5.119.
- `npm run build:cutter-web` output CSS changed from `93.10 kB` after Batch 5.118 to `92.69 kB`, gzip `14.32 kB`.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `92.69 kB`, gzip `14.32 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/cache-management.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`
- `git diff --check` passed after the documentation append.
- `rg -n "cutter-local-library-scroll\\s*\\{|cutter-public-library-scroll\\s*\\{|cutter-cache-panels\\s*\\{[^}]*overflow|cutter-settings \\\\.cutter-page-main\\s*\\{[^}]*overflow|cutter-cache-detail-list dt,|cutter-cache-check-list p" apps/cutter-web/src/styles.css apps/cutter-web/src/cutter-app.test.ts apps/cutter-web/src/features` confirmed the removed production CSS selectors are gone; only negative regression coverage remains.

Remaining debt moved forward:

- Settings still owns settings-specific row/grid composition and form grouping.
- Cache management still owns cache metric grid, check-list composition, and cache-detail row layout.
- Public and local library pages still own library-specific gallery/list composition and inspector relationships.
- Project Home board/detail layout remains page-owned and should be the next cleanup target before the high-risk Material Search batch.
- Material Search remains intentionally deferred because transcript, candidate list, video preview, and floating cut action need a dedicated workflow-level migration pass.

## Batch 5.120 Progress: Project Home Section Headings And Internal Scroll Moved To Foundation/Shell

Date: 2026-06-20.

Routes/components in scope:

- Project Home recent-project section heading.
- Project Home detail heading.
- Project Home project grid internal scroll.
- Project Home detail panel internal scroll.
- UI Foundation section heading/title primitives.

Layer classification:

- Foundation owns reusable section-heading rhythm and title typography.
- The Shell owns generic internal scroll containment through `.ml-scroll-region`.
- Project Home still owns its business-specific hero grid, project board columns, fixed project-card dimensions, detail media dimensions, and detail data-row columns.
- No project selection, search, create, rename, delete, open-directory, cache, auth, API, or desktop behavior changed.

Change made:

- Added Foundation-owned `.ml-section-heading` and `.ml-section-title`.
- Updated Project Home markup to use Foundation section heading/title primitives for "最近项目" and "项目详情".
- Added `ml-scroll-region` to the Project Home project grid and project detail panel.
- Removed Project Home route-owned section heading typography and detail-header styling.
- Removed Project Home route-owned `overflow`, `overscroll-behavior`, and `scrollbar-gutter` from the project grid and detail panel.
- Updated regression coverage so Project Home scroll behavior is proven through the shared Shell selector and section heading typography is proven through Foundation.

Visual ownership result:

- Project Home no longer owns section title font size/weight/line-height.
- Project Home no longer owns generic scroll behavior for its internal project grid or detail panel.
- Project Home CSS now keeps only page composition for the hero, board, list panel, card size, detail media size, data-row columns, and action-stack width.
- `apps/cutter-web/src/styles.css` decreased from `3137` lines after Batch 5.119 to `3106` after Batch 5.120.
- `packages/ui-foundation/src/layout.css` increased from `1369` to `1385` because section heading/title primitives moved into Foundation.
- `npm run build:cutter-web` output CSS changed from `92.69 kB` after Batch 5.119 to `92.15 kB`, gzip `14.23 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 26 tests, 26 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `92.15 kB`, gzip `14.23 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
- `git diff --check` passed after this documentation append.
- `rg -n "cutter-project-grid\\s*\\{[^}]*overflow|cutter-project-detail\\s*\\{[^}]*overflow|cutter-project-detail-header\\s*\\{|data-cutter-route=\\\"project-home\\\"\\] \\.cutter-section-heading|data-cutter-route=\\\"project-home\\\"\\] \\.cutter-project-detail-header h2|ml-section-heading|ml-section-title" apps/cutter-web/src/styles.css apps/cutter-web/src/features/project-home/ProjectHomePage.tsx apps/cutter-web/src/cutter-app.test.ts packages/ui-foundation/src/layout.css packages/ui-foundation/src/components.test.ts` confirmed removed route-owned heading/scroll rules are absent from production CSS; only Foundation, JSX, and regression-test references remain.

Remaining debt moved forward:

- Project Home still owns board/grid geometry, fixed project card dimensions, detail cover dimensions, detail data row columns, and action-stack width as page composition.
- Project Home empty-state layout still uses the shared empty-state primitive inside page-owned placement.
- Material Search remains the next large migration target and should be handled as a dedicated workflow page batch, not mixed with more Project Home polish.

## Batch 5.121 Progress: Material Search Dense Section Titles Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- Material Search candidate panel heading and status meta.
- Material Search transcript panel heading.
- Material Search video preview heading and status meta.
- Material Search selection-info heading and status meta.
- Material Search recent-cut-task heading.
- UI Foundation dense section title and section meta primitives.

Layer classification:

- Foundation owns reusable dense section title typography and compact section status/meta text.
- Material Search still owns workflow-specific geometry: search bar placement, candidate/transcript/video/selection/queue pane composition, candidate result rows, transcript row model, video preview, selection/floating cut action, and recent queue row grid.
- No runtime, search, cut, cache, auth, API, source-video, or desktop behavior changed.

Change made:

- Added Foundation-owned `.ml-section-title.ml-section-title--dense`.
- Added Foundation-owned `.ml-section-meta` for compact secondary status text with truncation.
- Updated Material Search markup to use the dense section title primitive for candidates, transcript, video preview, selection info, and recent cut tasks.
- Updated candidate summary, video preview label, and selection duration/no-selection text to use the shared section meta primitive.
- Removed Material Search route-owned heading typography selector group for candidate/transcript/video/selection/queue headings.
- Removed Material Search route-owned header meta span selector group for candidates, selection info, and recent queue panels.
- Updated Foundation and cutter-web regression coverage so the page CSS cannot reintroduce these removed visual rules.

Visual ownership result:

- Material Search panel heading typography is now shared with Foundation instead of repeated inside the route stylesheet.
- Material Search compact status/meta text now has one reusable visual owner.
- The workflow layout remains untouched because this batch deliberately avoided candidate row, transcript, video, selection, and queue behavior.
- `apps/cutter-web/src/styles.css` decreased from `3106` lines after Batch 5.120 to `3082` after Batch 5.121.
- `packages/ui-foundation/src/layout.css` increased from `1385` to `1400` because dense section title and section meta primitives moved into Foundation.
- `npm run build:cutter-web` output CSS changed from `92.15 kB` after Batch 5.120 to `91.69 kB`, gzip `14.21 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 26 tests, 26 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `91.69 kB`, gzip `14.21 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
- Residual selector check passed for the removed production CSS selector groups; only Foundation definitions, JSX usage, and regression-test references remain.
- `git diff --check` passed after this documentation append.
- `rg -n "cutter-locator-candidates h2,|cutter-natural-transcript h2|cutter-locator-queue-panel h2|cutter-locator-candidates > header span," apps/cutter-web/src/styles.css apps/cutter-web/src/features/material-locator/MaterialLocatorPage.tsx packages/ui-foundation/src/layout.css` returned no production matches.

Remaining debt moved forward:

- Material Search candidate result row typography/card density remains page-owned and workflow-specific.
- Material Search transcript row/time/highlight/selection model remains page-owned and workflow-specific.
- Material Search empty/video-empty/preview chrome remains page-owned and should be migrated only after screenshot review.
- Material Search floating selection bar and cut action remain page-owned because they are interaction-critical.
- Material Search recent queue row grid remains page-owned until the queue table can be safely matched against the cut-task status semantics.
- The next Material Search pass should choose one narrow migration slice: candidate result row visual ownership, transcript text rhythm, or empty-state/video-empty plain variants.

## Batch 5.122 Progress: Material Search Candidate Rows Moved To Foundation Compact Media Rows

Date: 2026-06-20.

Routes/components in scope:

- Material Search candidate result row.
- Candidate thumbnail/placeholder sizing.
- Candidate title and meta text rhythm.
- Candidate selected and hover visual state.
- UI Foundation compact media row primitives.

Layer classification:

- Foundation owns compact media row visuals: row grid, row height, radius, hover, selected state, thumbnail size, title typography, meta spacing, and secondary text truncation.
- Material Search owns candidate-list page composition: candidate section grouping, result-list padding, load-more placement, search result order, selected material state, and click behavior.
- The existing `cutter-locator-result` class remains only as a behavior/test anchor, while visual styling comes from `ml-media-row`.
- No search, candidate selection, transcript focus, cut creation, cache, auth, API, source-video, or desktop behavior changed.

Change made:

- Added Foundation-owned `.ml-media-row-list`.
- Added Foundation-owned `.ml-media-row`, `.ml-media-row-thumb`, `.ml-media-row-body`, `.ml-media-row-title`, `.ml-media-row-meta`, and `.ml-media-row-subtle`.
- Updated Material Search candidate result markup to use the Foundation compact media row primitives.
- Removed Material Search route-owned candidate result row, hover, selected, thumbnail, body, title, meta, and small-text CSS.
- Kept only route-owned candidate list padding because it is page composition.
- Updated regression coverage so route CSS cannot reintroduce the removed candidate-row visual rules.

Visual ownership result:

- Candidate rows now share a reusable compact media row primitive instead of owning a one-off row system inside Material Search.
- The candidate list keeps the same page geometry and scroll behavior.
- `apps/cutter-web/src/styles.css` decreased from `3082` lines after Batch 5.121 to `3012` after Batch 5.122.
- `packages/ui-foundation/src/layout.css` increased from `1400` to `1476` because compact media row primitives moved into Foundation.
- `npm run build:cutter-web` output CSS changed from `91.69 kB` after Batch 5.121 to `91.40 kB`, gzip `14.23 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 26 tests, 26 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `91.40 kB`, gzip `14.23 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
- Residual selector check passed for the removed production CSS selector groups; only Foundation definitions, JSX usage, and regression-test references remain.
- `git diff --check` passed after this documentation append.
- `rg -n "cutter-locator-result-body|cutter-locator-result-meta|cutter-locator-result img|cutter-locator-result\\.is-selected\\s*\\{|cutter-locator-result\\s*\\{" apps/cutter-web/src/styles.css apps/cutter-web/src/features/material-locator/MaterialLocatorPage.tsx packages/ui-foundation/src/layout.css apps/cutter-web/src/cutter-app.test.ts packages/ui-foundation/src/components.test.ts` confirmed the removed production CSS selectors are gone; only negative regression coverage remains.

Remaining debt moved forward:

- Material Search section label typography (`⌄ 公共原素材`) remains page-owned; it may become a Foundation dense group label if another route needs it.
- Material Search empty/video-empty states remain page-owned and are the next low-risk visual primitive candidate.
- Material Search transcript row/time/highlight/selection rhythm remains the highest-value but higher-risk next slice.
- Material Search floating selection and recent queue table remain interaction-critical and should stay deferred until after transcript rhythm stabilizes.

## Batch 5.123 Progress: Material Search Plain Empty States Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- Material Search candidate empty/searching/no-result states.
- Material Search video preview empty/loading state.
- UI Foundation empty-panel plain and fill modifiers.

Layer classification:

- Foundation owns reusable empty-state visual treatment: centered grid, text hierarchy, padding, plain/no-border variant, and fill-height variant.
- Material Search owns empty-state business copy, which state is shown, candidate/video pane placement, and transcript empty-state behavior.
- Transcript empty state remains page-owned because it belongs to the transcript pane rhythm and has a subtle filled background, unlike the plain candidate/video empty states.
- No search, candidate loading, preview loading, transcript focus, cut creation, cache, auth, API, source-video, or desktop behavior changed.

Change made:

- Added Foundation-owned `.ml-empty-panel--plain`.
- Added Foundation-owned `.ml-empty-panel--fill`.
- Updated Material Search candidate empty states to use `ml-empty-panel ml-empty-panel--plain`.
- Updated Material Search video empty state to use `ml-empty-panel ml-empty-panel--plain ml-empty-panel--fill`.
- Removed Material Search route-owned candidate/video empty-state visual rules, including strong/span typography and video empty min-height.
- Updated regression coverage so route CSS cannot reintroduce those empty-state visual rules.

Visual ownership result:

- Candidate and video empty states now use the same Foundation empty-state primitive and plain modifier.
- The empty states keep the same business copy and route placement.
- `apps/cutter-web/src/styles.css` decreased from `3012` lines after Batch 5.122 to `2975` after Batch 5.123.
- `packages/ui-foundation/src/layout.css` increased from `1476` to `1492` because plain/fill empty modifiers moved into Foundation.
- `npm run build:cutter-web` output CSS changed from `91.40 kB` after Batch 5.122 to `90.79 kB`, gzip `14.21 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 26 tests, 26 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `90.79 kB`, gzip `14.21 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator-empty.png`
- Residual selector check passed for the removed production CSS selector groups; only Foundation definitions, JSX usage, and regression-test references remain.
- `git diff --check` passed after this documentation append.
- `rg -n "cutter-locator-empty-state,|cutter-locator-video-empty\\s*\\{|cutter-locator-empty-state strong|cutter-locator-empty-state span|cutter-locator-video-empty strong|cutter-locator-video-empty span" apps/cutter-web/src/styles.css apps/cutter-web/src/features/material-locator/MaterialLocatorPage.tsx apps/cutter-web/src/cutter-app.test.ts packages/ui-foundation/src/layout.css packages/ui-foundation/src/components.test.ts` confirmed the removed production CSS selectors are gone; only negative regression coverage remains.

Remaining debt moved forward:

- Material Search transcript empty state still owns a page-specific subtle filled background and should be handled together with transcript pane rhythm.
- Material Search transcript row/time/highlight/selection rhythm is now the next highest-value migration target.
- Material Search section group label (`⌄ 公共原素材`) remains page-owned until a reusable dense group label emerges.
- Floating cut action and recent queue table remain deferred because they are interaction-critical.

## Batch 5.124 Progress: Material Search Transcript Empty State Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- Material Search transcript empty/loading state.
- UI Foundation empty-panel subtle modifier.

Layer classification:

- Foundation owns reusable subtle empty-state visual treatment: no border, no radius, subtle surface background, and no shadow.
- Material Search owns the transcript empty-state business copy, when it appears, and the transcript pane placement.
- Transcript row/time/highlight/selection behavior remains page-owned and was not changed.
- No search, preview loading, transcript virtualization, selection, cut creation, cache, auth, API, source-video, or desktop behavior changed.

Change made:

- Added Foundation-owned `.ml-empty-panel--subtle`.
- Updated Material Search transcript empty state to use `ml-empty-panel ml-empty-panel--subtle ml-empty-panel--fill`.
- Removed Material Search route-owned `.cutter-transcript-empty` background rule.
- Updated regression coverage so route CSS cannot reintroduce the removed transcript empty visual rule.

Visual ownership result:

- Candidate, video, and transcript empty states now all share the Foundation empty-state base primitive.
- Candidate/video use the plain modifier; transcript uses the subtle modifier because it belongs to the central transcript pane.
- The transcript pane remains visually quiet and no longer owns one-off background styling.
- `apps/cutter-web/src/styles.css` decreased from `2975` lines after Batch 5.123 to `2969` after Batch 5.124.
- `packages/ui-foundation/src/layout.css` increased from `1492` to `1499` because the subtle empty modifier moved into Foundation.
- `npm run build:cutter-web` output CSS changed from `90.79 kB` after Batch 5.123 to `90.78 kB`, gzip `14.21 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 26 tests, 26 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `90.78 kB`, gzip `14.21 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator-empty.png`
- Residual selector check passed for the removed production CSS selector groups; only Foundation definitions, JSX usage, and regression-test references remain.
- `git diff --check` passed after this documentation append.
- `rg -n "cutter-transcript-empty\\s*\\{|cutter-transcript-empty strong|cutter-transcript-empty span" apps/cutter-web/src/styles.css apps/cutter-web/src/features/material-locator/MaterialLocatorPage.tsx apps/cutter-web/src/cutter-app.test.ts packages/ui-foundation/src/layout.css packages/ui-foundation/src/components.test.ts` returned no production matches.

Remaining debt moved forward:

- Material Search transcript row/time/highlight/selection rhythm is now the next large migration target and should be handled carefully because it touches selection perception.
- Material Search section group label (`⌄ 公共原素材`) remains page-owned.
- Floating cut action remains interaction-critical and should stay deferred until transcript row rhythm is stable.
- Recent queue table remains page-owned until it can be reconciled with cut-task table/status primitives.

## Batch 5.125 Progress: Material Search Transcript Base Row Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- Material Search transcript base row rhythm.
- Material Search transcript time button base visual.
- Material Search hidden transcript index.
- Material Search transcript text base typography.
- UI Foundation transcript row/time/text/index primitives.

Layer classification:

- Foundation owns reusable transcript base row structure: grid columns, gap, radius, padding, hidden index, time button base treatment, and text font size/line height.
- Material Search still owns transcript body scroll/virtualization, keyword mark highlight, hover/current/selected/drag-preview/time-start interaction states, and selection/floating cut behavior.
- Interaction states were intentionally not migrated in this batch because they directly affect search review and cut-selection perception.
- No search, candidate loading, preview loading, transcript focus, selection model, cut creation, cache, auth, API, source-video, or desktop behavior changed.

Change made:

- Added Foundation-owned `.ml-transcript-row`, `.ml-transcript-index`, `.ml-transcript-time`, and `.ml-transcript-text`.
- Updated Material Search transcript JSX to keep business/semantic `cutter-*` classes while adding Foundation `ml-transcript-*` visual classes.
- Removed Material Search route-owned base rules for `.cutter-transcript-row`, `.cutter-transcript-index`, `.cutter-transcript-time`, and `.cutter-transcript-text`.
- Kept Material Search route-owned interaction rules for mark highlight, hover/current/selected/drag-preview, and time-selection-start.
- Updated regression coverage so base transcript row/time/text/index styles cannot be reintroduced as route-owned visual CSS.

Visual ownership result:

- Transcript base row density is now owned by UI Foundation instead of the Material Search page.
- Material Search keeps only interaction-specific transcript styling.
- The rendered transcript time control now carries both `cutter-transcript-time` and `ml-transcript-time`, preserving route semantics while moving visual ownership.
- `apps/cutter-web/src/styles.css` decreased from `2969` lines after Batch 5.124 to `2931` after Batch 5.125.
- `packages/ui-foundation/src/layout.css` increased from `1499` to `1537` because transcript base primitives moved into Foundation.
- `npm run build:cutter-web` output CSS changed from `90.78 kB` after Batch 5.124 to `90.66 kB`, gzip `14.20 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 26 tests, 26 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `90.66 kB`, gzip `14.20 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
- Residual selector check passed for removed base transcript selector groups:
  - `.cutter-material-locator .cutter-transcript-row {`
  - `.cutter-material-locator .cutter-transcript-index {`
  - `.cutter-material-locator .cutter-transcript-time {`
  - `.cutter-material-locator .cutter-transcript-text {`
- `git diff --check` passed before this documentation append.

Remaining debt moved forward:

- Material Search transcript interaction states remain page-owned: mark highlight, hover/current/selected/drag-preview, and time-selection-start.
- Material Search floating selection bar remains interaction-critical and should be migrated only after transcript state primitives stabilize.
- Material Search recent queue table remains page-owned until it can be reconciled with shared table/status primitives.
- Material Search section group label (`⌄ 公共原素材`) remains page-owned until a reusable dense group label primitive is justified.

## Batch 5.126 Progress: Material Search Transcript Interaction States Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- Material Search transcript keyword mark highlight.
- Material Search transcript hover state.
- Material Search transcript current-hit state.
- Material Search transcript selected and drag-preview states.
- Material Search transcript time-selection-start row and time button states.
- UI Foundation transcript state primitives.

Layer classification:

- Foundation owns reusable transcript interaction visual states for mark, hover, current hit, selected/drag-preview, and time-start affordance.
- Material Search owns only the behavior and state assignment: which row is selected, current, drag-previewed, or marked as the time-selection start.
- Material Search still owns transcript pane composition, scroll/virtualization, hit navigation, floating cut action behavior, and selected-text side-panel copy.
- No search, candidate loading, transcript windowing, selection model, time-click selection, cut creation, cache, auth, API, source-video, or desktop behavior changed.

Change made:

- Added Foundation-owned transcript state rules:
  - `.ml-transcript-text mark`
  - `.ml-transcript-row:hover`
  - `.ml-transcript-row.is-current-hit`
  - `.ml-transcript-row.is-selected, .ml-transcript-row.is-drag-preview`
  - `.ml-transcript-row.is-time-selection-start`
  - `.ml-transcript-row.is-time-selection-start .ml-transcript-time`
- Removed the matching Material Search route-owned `cutter-transcript-*` state visual rules.
- Updated UI Foundation regression coverage for transcript state primitives.
- Updated Cutter Web regression coverage to verify route CSS no longer owns transcript state visuals.

Visual ownership result:

- Transcript base rows and interaction states now share one Foundation-owned visual language.
- Material Search retains semantic `cutter-*` classes and behavior-specific state classes, but no longer owns the visual treatment for those states.
- `apps/cutter-web/src/styles.css` decreased from `2931` lines after Batch 5.125 to `2901` after Batch 5.126.
- `packages/ui-foundation/src/layout.css` increased from `1537` to `1567` because transcript state primitives moved into Foundation.
- `npm run build:cutter-web` output CSS changed from `90.66 kB` after Batch 5.125 to `90.45 kB`, gzip `14.18 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 26 tests, 26 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `90.45 kB`, gzip `14.18 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
- Residual selector check returned no route-owned production matches for:
  - `.cutter-material-locator .cutter-transcript-text mark`
  - `.cutter-material-locator .cutter-transcript-row:hover`
  - `.cutter-material-locator .cutter-transcript-row.is-current-hit`
  - `.cutter-material-locator .cutter-transcript-row.is-selected`
  - `.cutter-material-locator .cutter-transcript-row.is-time-selection-start`
- `git diff --check` passed before this documentation append.

Remaining debt moved forward:

- Material Search floating selection bar remains page-owned and should be migrated only after confirming its fixed positioning, dismissal behavior, and dark-mode contrast.
- Material Search recent queue table remains page-owned and should be reconciled with shared table/status primitives.
- Material Search section group label (`⌄ 公共原素材`) remains page-owned until a reusable dense group label primitive is justified.
- Material Search pane composition and independent scroll rules remain page-owned because they are layout/workflow-specific, not generic transcript styling.

## Batch 5.127 Progress: Material Search Candidate Group Header Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- Material Search candidate section group wrapper.
- Material Search candidate section header.
- Material Search candidate section group title (`⌄ 公共原素材（n）`, `⌄ 本地素材（n）`).
- UI Foundation section group primitives.

Layer classification:

- Foundation owns reusable section group rhythm: group align-content, header height/padding, and compact accent title typography.
- Material Search owns the candidate section data, labels, item counts, public/local grouping, and load-more behavior.
- Material Search still owns candidate result pane scrolling, result list padding, and load-more/status footer placement because those are page composition details.
- No search, candidate loading, pagination, selection, transcript, cut creation, cache, auth, API, source-video, or desktop behavior changed.

Change made:

- Added Foundation-owned `.ml-section-group`, `.ml-section-group > header`, and `.ml-section-group-title`.
- Updated Material Search candidate sections to use `cutter-locator-section ml-section-group`.
- Updated candidate group heading to use `ml-section-group-title`.
- Removed Material Search route-owned candidate group header and h2 visual rules.
- Collapsed the duplicate `.cutter-locator-results` CSS block so remaining route-owned results layout is not fragmented.
- Updated regression coverage so route CSS cannot reintroduce candidate group header/title visual ownership.

Visual ownership result:

- Candidate group headings now share a Foundation primitive instead of a page-private `section > header h2` rule.
- The `公共原素材` and `本地素材` headings keep their current density, accent color, and placement.
- `apps/cutter-web/src/styles.css` decreased from `2901` lines after Batch 5.126 to `2883` after Batch 5.127.
- `packages/ui-foundation/src/layout.css` increased from `1567` to `1585` because section group primitives moved into Foundation.
- `npm run build:cutter-web` output CSS changed from `90.45 kB` after Batch 5.126 to `90.33 kB`, gzip `14.18 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 26 tests, 26 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `90.33 kB`, gzip `14.18 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
- Residual selector check returned no route-owned production matches for:
  - `.cutter-material-locator .cutter-locator-section > header`
  - `.cutter-material-locator .cutter-locator-section > header h2`
  - `.cutter-material-locator .cutter-locator-results, .cutter-material-locator .cutter-locator-section`
- `git diff --check` passed before this documentation append.

Remaining debt moved forward:

- Material Search floating selection bar remains page-owned and should be migrated only after confirming its fixed positioning, dismissal behavior, and dark-mode contrast.
- Material Search recent queue table remains page-owned and should be reconciled with shared table/status primitives.
- Material Search transcript heading/body composition remains page-owned because it controls pane scroll and hit navigation placement.
- Material Search side-panel and video composition remain page-owned until a broader workbench-pane primitive is justified.

## Batch 5.128 Progress: Material Search Floating Cut Action Visual Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- Material Search floating selection/cut action shell.
- Floating selected-duration label.
- UI Foundation floating action bar primitive.

Layer classification:

- Foundation owns reusable floating action visual treatment: inline-flex layout, max width, height, gap, border, pill radius, padding, text color, surface background, shadow, and label truncation.
- Material Search owns floating action behavior: when it appears, anchor coordinates, outside-click dismissal, keyboard shortcut handling, and cut action execution.
- Material Search still owns only the fixed positioning wrapper for this control: `position`, `z-index`, and transform relative to the selection anchor.
- No selection model, drag behavior, time-click selection, outside-click dismissal, cut creation, cache, auth, API, source-video, or desktop behavior changed.

Change made:

- Added Foundation-owned `.ml-floating-action-bar`.
- Added Foundation-owned `.ml-floating-action-label`.
- Updated Material Search floating selection bar to use `ml-floating-action-bar`.
- Updated selected-duration text to use `ml-floating-action-label`.
- Removed Material Search route-owned floating action visual rules.
- Kept route-owned positioning rules on `.cutter-selection-bar`.
- Updated regression coverage so route CSS cannot reintroduce floating action visual ownership.

Visual ownership result:

- Floating cut action visual style is now centralized in UI Foundation.
- The page keeps only anchor-based positioning and business behavior.
- The button inside the floating action remains the existing Foundation `Button` component; no route-local button styling was introduced.
- `apps/cutter-web/src/styles.css` decreased from `2883` lines after Batch 5.127 to `2863` after Batch 5.128.
- `packages/ui-foundation/src/layout.css` increased from `1585` to `1608` because floating action primitives moved into Foundation.
- `npm run build:cutter-web` output CSS changed from `90.33 kB` after Batch 5.127 to `90.32 kB`, gzip `14.17 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 26 tests, 26 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `90.32 kB`, gzip `14.17 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
- Residual selector check returned no route-owned production matches for:
  - `.cutter-material-locator .cutter-selection-bar strong`
  - route-owned floating action display/background/shadow rules
- `git diff --check` passed before this documentation append.

Remaining debt moved forward:

- Material Search recent queue table remains page-owned and should be reconciled with shared table/status primitives next.
- Material Search transcript heading/body composition remains page-owned because it controls pane scroll and hit navigation placement.
- Material Search side-panel and video composition remain page-owned until a broader workbench-pane primitive is justified.

## Batch 5.129 Progress: Material Search Recent Queue Table Visual Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- Material Search right-side `最近剪切任务` compact task table.
- UI Foundation compact table/list primitive.

Layer classification:

- Foundation owns reusable compact table/list visual treatment: grid rhythm, three-column density, row height, subtle divider, text color, font sizing, and title/duration truncation.
- Material Search owns page-specific queue panel placement, recent-task data selection, cut notice copy, task link, and status tone mapping.
- Existing Foundation `Badge` continues to own queue status colors.
- No queue state, cut task creation, source-video, search, cache, auth, API, or desktop behavior changed.

Change made:

- Added Foundation-owned `.ml-compact-table`.
- Added Foundation-owned `.ml-compact-table-head`.
- Added Foundation-owned `.ml-compact-table-row`.
- Updated Material Search recent queue table to use the Foundation compact table classes.
- Removed Material Search route-owned queue row/head visual rules for columns, row height, divider, padding, font, and text truncation.
- Kept a page-owned `width: 100%` fill rule on `.cutter-locator-queue-table` because it is container composition, not the table visual contract.
- Updated regression coverage so route CSS cannot reintroduce recent-task table row visual ownership.

Visual ownership result:

- Recent cut task table rhythm is now centralized in UI Foundation.
- Material Search keeps only panel composition and queue business behavior.
- Queue status colors remain centralized through Foundation `Badge` tones.
- `apps/cutter-web/src/styles.css` decreased from `2863` lines after Batch 5.128 to `2828` after Batch 5.129.
- `packages/ui-foundation/src/layout.css` increased from `1608` to `1647` because compact table primitives moved into Foundation.
- `npm run build:cutter-web` output CSS changed from `90.32 kB` after Batch 5.128 to `90.21 kB`, gzip `14.18 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 26 tests, 26 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `90.21 kB`, gzip `14.18 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
- Residual selector check returned no production matches for:
  - `.cutter-material-locator .cutter-locator-queue-head, .cutter-material-locator .cutter-locator-queue-row`
  - `.cutter-material-locator .cutter-locator-queue-row strong`
  - `.cutter-material-locator .cutter-locator-queue-row small`
- `git diff --check` passed before this documentation append.

Remaining debt moved forward:

- Material Search transcript heading/body composition remains page-owned because it controls pane scroll and hit navigation placement.
- Material Search side-panel and video composition remain page-owned until a broader workbench-pane primitive is justified.
- Candidate result list container and load-more composition remain page-owned; only the media-row visual primitive has already moved to Foundation.

## Batch 5.130 Progress: Material Search Transcript Panel Shell Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- Material Search `视频文案` panel shell.
- Transcript title/header row.
- Hit navigation action row spacing.
- Transcript scroll body container.

Layer classification:

- Foundation owns reusable transcript panel visual treatment: panel grid, header height/padding, heading flex rhythm, action gap, scroll containment, overscroll containment, and transcript body padding.
- Material Search owns page placement in the search/select/cut grid and all transcript behavior: data loading, virtualized windows, hit navigation callbacks, autoscroll data attributes, drag selection, time-click selection, and floating cut action.
- Existing Foundation transcript row/time/text/highlight primitives continue to own row-level readability and selection states.
- No search, transcript fetch, virtualized rendering, hit navigation, selection, cut creation, cache, auth, API, or desktop behavior changed.

Change made:

- Added Foundation-owned `.ml-transcript-panel`.
- Added Foundation-owned `.ml-transcript-panel-header`.
- Added Foundation-owned `.ml-transcript-heading`.
- Added Foundation-owned `.ml-transcript-actions`.
- Added Foundation-owned `.ml-transcript-body`.
- Updated Material Search transcript section/header/heading/actions/body to use the Foundation transcript panel classes.
- Removed Material Search route-owned transcript header, heading, hit-navigation, and body visual rules.
- Kept Material Search route-owned transcript grid placement: `grid-column: 2` and `grid-row: 2`.
- Updated regression coverage so route CSS cannot reintroduce transcript panel/header/body visual ownership.

Visual ownership result:

- Transcript panel shell and scrolling rhythm are centralized in UI Foundation.
- Material Search keeps only its workbench grid placement and transcript workflow behavior.
- `apps/cutter-web/src/styles.css` decreased from `2828` lines after Batch 5.129 to `2790` after Batch 5.130.
- `packages/ui-foundation/src/layout.css` increased from `1647` to `1688` because transcript panel primitives moved into Foundation.
- `npm run build:cutter-web` output CSS changed from `90.21 kB` after Batch 5.129 to `90.12 kB`, gzip `14.20 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 26 tests, 26 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `90.12 kB`, gzip `14.20 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
- Residual selector check returned no production matches for:
  - `.cutter-material-locator .cutter-natural-transcript > header`
  - `.cutter-material-locator .cutter-transcript-heading`
  - `.cutter-material-locator .cutter-hit-navigation {`
  - `.cutter-material-locator .cutter-transcript-body`
- `git diff --check` passed before this documentation append.

Remaining debt moved forward:

- Material Search side-panel and video composition remain page-owned until a broader workbench-pane primitive is justified.
- Candidate result list container and load-more composition remain page-owned; only the media-row visual primitive has already moved to Foundation.
- Selected copy panel remains page-specific because it is tightly tied to cut-selection text density and full-text scroll behavior.

## Batch 5.131 Progress: Material Search Right-Side Panel Visuals Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- Material Search right-side video preview pane shell.
- Material Search cut-selection detail pane shell.
- Material Search selected-copy text panel.
- Material Search recent queue panel header shell.
- Media frame fill behavior for the right-side video preview.

Layer classification:

- Foundation owns reusable transparent pane shells, pane section layout, pane header rhythm, pane body padding, media-frame fill, media-frame inner fill, and selected-copy typography/scroll treatment.
- Material Search owns right-side grid placement, side-panel row heights, page-specific subtle background, queue notice copy, recent task data, static poster chrome, video source handling, selected text value, and cut behavior.
- No source-video loading, search, transcript selection, cut creation, cache, auth, API, or desktop runtime behavior changed.

Change made:

- Added Foundation-owned `.ml-media-frame--fill`.
- Added Foundation-owned `.ml-media-frame-inner`.
- Added Foundation-owned `.ml-pane-shell`.
- Added Foundation-owned `.ml-pane-section`.
- Added Foundation-owned `.ml-pane-section--media`.
- Added Foundation-owned `.ml-pane-section--detail`.
- Added Foundation-owned `.ml-pane-header`.
- Added Foundation-owned `.ml-pane-header--compact`.
- Added Foundation-owned `.ml-pane-header--split`.
- Added Foundation-owned `.ml-pane-body`.
- Added Foundation-owned `.ml-selected-copy`.
- Updated Material Search right-side visual, cut panel, selected-copy panel, and recent queue header markup to use the Foundation pane primitives.
- Removed Material Search route-owned visual rules for the video panel shell, video frame fill, cut-panel header, cut-selection body, selected-copy text panel, and recent queue header.
- Kept Material Search route-owned side-panel grid composition and queue notice because they are workflow/page-specific.
- Updated regression coverage so route CSS cannot reintroduce the removed right-side panel visual ownership.

Visual ownership result:

- Video preview pane, cut-selection pane, selected-copy copy block, and queue panel header now share Foundation visual primitives instead of page-local panel styling.
- Material Search keeps only its right-side workbench composition and workflow behavior.
- `apps/cutter-web/src/styles.css` decreased from `2790` lines after Batch 5.130 to `2686` after Batch 5.131.
- `packages/ui-foundation/src/layout.css` increased from `1688` to `1777` because pane/media/selected-copy primitives moved into Foundation.
- `npm run build:cutter-web` output CSS changed from `90.12 kB` after Batch 5.130 to `89.38 kB`, gzip `14.15 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 26 tests, 26 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `89.38 kB`, gzip `14.15 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
- Residual selector check returned no production matches for:
  - `.cutter-material-locator .cutter-video-panel {`
  - `.cutter-material-locator .cutter-video-panel video`
  - `.cutter-material-locator .cutter-video-frame {`
  - `.cutter-material-locator .cutter-locator-selected-copy {`
  - `.cutter-material-locator .cutter-locator-selected-copy p`
  - `.cutter-material-locator .cutter-locator-cut-panel > header`
  - `.cutter-material-locator .cutter-locator-cut-selection {`
- `git diff --check` passed before this documentation append.

Remaining debt moved forward:

- Material Search queue notice remains page-owned because its copy and success tone are workflow-specific; it can become a shared status notice only if repeated elsewhere.
- Static poster chrome remains page-owned because it is fixture/material-search preview-specific.
- Side-panel grid row heights and background remain page-owned because they are Material Search workbench composition, not a generic pane primitive.
- Candidate result list container and load-more composition remain page-owned.

## Batch 5.132 Progress: Material Search Candidate List Scroll And Footer Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- Material Search candidate results scroll container.
- Material Search candidate result list inset spacing.
- Material Search candidate section footer note.
- Material Search candidate load-more button layout.

Layer classification:

- Foundation owns reusable scroll-pane containment, compact list inset spacing, list footer note typography, and list footer action button width/alignment.
- Material Search owns candidate data grouping, empty/searching/no-result decisions, public/local section selection, load-more behavior, and the candidate pane's grid placement.
- No search, result pagination, candidate selection, transcript loading, video preview, cut creation, cache, auth, API, or desktop runtime behavior changed.

Change made:

- Added Foundation-owned `.ml-pane-scroll`.
- Added Foundation-owned `.ml-list-body--compact-inset`.
- Added Foundation-owned `.ml-list-footer-note`.
- Added Foundation-owned `.ml-list-footer-action`.
- Updated Material Search candidate results, result list, load-more button, and footer status markup to use the Foundation list primitives.
- Removed Material Search route-owned visual rules for candidate results scroll containment, result-list padding, load-more status typography, and load-more button width/alignment.
- Updated regression coverage so route CSS cannot reintroduce candidate list scroll/footer visual ownership.

Visual ownership result:

- Candidate list scroll and footer density now come from UI Foundation instead of Material Search page CSS.
- Material Search keeps only candidate panel placement and workflow behavior.
- `apps/cutter-web/src/styles.css` decreased from `2686` lines after Batch 5.131 to `2660` after Batch 5.132.
- `packages/ui-foundation/src/layout.css` increased from `1777` to `1803` because list scroll/footer primitives moved into Foundation.
- `npm run build:cutter-web` output CSS changed from `89.38 kB` after Batch 5.131 to `89.26 kB`, gzip `14.17 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 26 tests, 26 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `89.26 kB`, gzip `14.17 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
- Residual selector check returned no production matches for:
  - `.cutter-material-locator .cutter-locator-results {`
  - `.cutter-material-locator .cutter-locator-result-list {`
  - `.cutter-material-locator .cutter-locator-load-more-status {`
  - `.cutter-material-locator .cutter-locator-load-more.ml-button {`
- `git diff --check` passed before this documentation append.

Remaining debt moved forward:

- Material Search root/page-main/command/candidate/transcript/side-panel grid placement remains page-owned because it is the workflow composition.
- Material Search search command shell remains a candidate for a shared toolbar/command-row primitive if another dense workbench uses the same pattern.
- Material Search queue notice remains page-owned because its copy and tone are workflow-specific.
- Static poster chrome remains page-owned because it is fixture/material-search preview-specific.

## Batch 5.133 Progress: Material Search Candidate Panel Shell Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- Material Search candidate panel shell.
- Material Search candidate panel header.
- Material Search candidate panel heading row.

Layer classification:

- Foundation owns reusable list-panel shell visuals: internal grid, header height, header padding, heading baseline alignment, transparent background, no-border/no-shadow treatment, and overflow containment.
- Material Search owns only the candidate panel's workbench placement: first column, second row.
- Material Search continues to own candidate data grouping, search state, load-more behavior, and selection behavior.
- No search, pagination, candidate selection, transcript loading, video preview, cut creation, cache, auth, API, or desktop runtime behavior changed.

Change made:

- Added Foundation-owned `.ml-list-panel`.
- Added Foundation-owned `.ml-list-panel-header`.
- Added Foundation-owned `.ml-list-panel-heading`.
- Updated Material Search candidate panel markup to use the Foundation list-panel primitives.
- Removed Material Search route-owned visual rules for candidate panel display/grid rows/background/border/shadow/overflow and candidate header/heading alignment.
- Updated regression coverage so route CSS cannot reintroduce candidate panel shell/header visual ownership.

Visual ownership result:

- Candidate panel shell and heading rhythm now come from UI Foundation.
- Material Search keeps only the candidate panel grid placement.
- `apps/cutter-web/src/styles.css` decreased from `2660` lines after Batch 5.132 to `2637` after Batch 5.133.
- `packages/ui-foundation/src/layout.css` increased from `1803` to `1829` because list-panel primitives moved into Foundation.
- `npm run build:cutter-web` output CSS changed from `89.26 kB` after Batch 5.132 to `89.19 kB`, gzip `14.15 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 26 tests, 26 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `89.19 kB`, gzip `14.15 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
- Residual selector check returned no production matches for:
  - `.cutter-material-locator .cutter-locator-candidates > header {`
  - `.cutter-material-locator .cutter-locator-candidates > header > div {`
  - route-owned candidate panel border/background/overflow visual declarations
- `git diff --check` passed before this documentation append.

Remaining debt moved forward:

- Material Search root/page-main/workbench side-panel grid geometry remains page-owned because it defines the search-review-cut workflow composition.
- Material Search search command shell remains page-owned and is the next low-risk candidate for a reusable dense workbench command-row primitive.
- Material Search queue notice remains page-owned because its copy and tone are workflow-specific.
- Static poster chrome remains page-owned because it is fixture/material-search preview-specific.

## Batch 5.134 Progress: Material Search Command Row Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- Material Search top search command row.
- Material Search command row inner header wrapper.
- Material Search `SearchBox` form width inside the command row.

Layer classification:

- Foundation owns reusable dense command-row visuals: row min-height, horizontal padding, no-border/no-shadow transparent treatment, header grid rhythm, and form width.
- Material Search owns only command-row workbench placement: first row spanning the candidate and transcript columns.
- `SearchBox` continues to own the actual search input/button visuals.
- No search submission, query state, hash routing, candidate fetch, transcript loading, cache, auth, API, or desktop runtime behavior changed.

Change made:

- Added Foundation-owned `.ml-command-row`.
- Added Foundation-owned `.ml-command-row-header`.
- Added Foundation-owned `.ml-command-row-form`.
- Updated Material Search command row markup to use the Foundation command primitives.
- Removed Material Search route-owned visual rules for command row padding/background/border/shadow, command header grid/spacing, and search form width.
- Updated regression coverage so route CSS cannot reintroduce command-row/header/search-form visual ownership.

Visual ownership result:

- Material Search top command row now shares Foundation workbench command-row primitives.
- Material Search keeps only the command row grid placement.
- `apps/cutter-web/src/styles.css` decreased from `2637` lines after Batch 5.133 to `2616` after Batch 5.134.
- `packages/ui-foundation/src/layout.css` increased from `1829` to `1853` because command-row primitives moved into Foundation.
- `npm run build:cutter-web` output CSS changed from `89.19 kB` after Batch 5.133 to `89.15 kB`, gzip `14.17 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 26 tests, 26 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `89.15 kB`, gzip `14.17 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
- Residual selector check returned no production matches for:
  - `.cutter-material-locator .cutter-locator-command-header {`
  - `.cutter-material-locator .cutter-locator-search-form {`
  - route-owned command-row padding/background/border visual declarations
- `git diff --check` passed before this documentation append.

Remaining debt moved forward:

- Material Search root/page-main/workbench side-panel grid geometry remains page-owned because it defines the search-review-cut workflow composition.
- Static poster chrome remains page-owned because it is fixture/material-search preview-specific.
- The next low-risk Material Search candidate is the queue notice/status-note primitive if repeated elsewhere, otherwise continue with composition-only cleanup and poster chrome review.

## Batch 5.135 Progress: Material Search Queue Notice Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- Material Search recent cut task notice.
- Reusable pane notice/status note styling.

Layer classification:

- Foundation owns reusable pane notice visuals: margin, border, radius, padding, typography, and success tone.
- Material Search owns only when the notice appears, the cut notice copy, and its placement inside the recent cut task panel.
- No cut creation, queue state, task polling, search, transcript loading, cache, auth, API, or desktop runtime behavior changed.

Change made:

- Added Foundation-owned `.ml-pane-notice`.
- Added Foundation-owned `.ml-pane-notice--success`.
- Updated Material Search queue notice markup to use the Foundation pane notice primitive.
- Removed Material Search route-owned visual rules for queue notice border, radius, padding, background, color, font size, and font weight.
- Updated regression coverage so route CSS cannot reintroduce queue notice visual ownership.

Visual ownership result:

- Recent cut task notices now use Foundation pane notice styling.
- Material Search keeps only queue notice workflow state and panel placement.
- `apps/cutter-web/src/styles.css` decreased from `2616` lines after Batch 5.134 to `2605` after Batch 5.135.
- `packages/ui-foundation/src/layout.css` increased from `1853` to `1871` because pane notice primitives moved into Foundation.
- `npm run build:cutter-web` output CSS changed from `89.15 kB` after Batch 5.134 to `89.33 kB`, gzip `14.18 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 26 tests, 26 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `89.33 kB`, gzip `14.18 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
- Residual selector check returned no production matches for:
  - `.cutter-material-locator .cutter-locator-queue-notice {`
  - route-owned queue notice border/background/font-size visual declarations
- `git diff --check` passed before this documentation append.

Remaining debt moved forward:

- Material Search root/page-main/workbench side-panel grid geometry remains page-owned because it defines the search-review-cut workflow composition.
- Material Search side panel, queue panel, and table width composition remain page-owned until the split-workbench composition is reviewed as a whole.
- Static poster chrome remains page-owned because it is fixture/material-search preview-specific.
- Material Search responsive composition remains page-owned and should be reviewed after desktop split-workbench composition stabilizes.

## Batch 5.136 Progress: Material Search Static Poster Chrome Moved To Foundation

Date: 2026-06-20.

Routes/components in scope:

- Material Search static video poster fallback.
- Poster overlay controls used when a real video source is not available.

Layer classification:

- Foundation owns reusable static video poster visuals: poster sizing, background image rendering, reference-poster mode, gradient overlay, fake control row, icon glyphs, and progress track.
- Material Search owns only the poster image URL, whether the design reference poster is used, and whether the fallback poster or real `<video>` renders.
- No video source resolution, media metadata, search, transcript loading, cut creation, cache, auth, API, or desktop runtime behavior changed.

Change made:

- Added Foundation-owned `.ml-video-poster`.
- Added Foundation-owned `.ml-video-poster--reference`.
- Added Foundation-owned `.ml-video-poster-controls` and control icon/progress classes.
- Updated Material Search poster fallback markup to use the Foundation poster classes.
- Changed the inline poster custom property from route-owned `--cutter-video-poster` to Foundation-owned `--ml-video-poster`.
- Removed Material Search route-owned visual rules for poster frame, reference mode, overlay gradient, controls, icons, and progress track.
- Updated regression coverage so route CSS cannot reintroduce poster chrome visual ownership.

Visual ownership result:

- Static poster fallback chrome now comes from UI Foundation instead of Material Search page CSS.
- Material Search keeps only fallback-vs-video rendering state and poster image data.
- `apps/cutter-web/src/styles.css` decreased from `2605` lines after Batch 5.135 to `2460` after Batch 5.136.
- `packages/ui-foundation/src/layout.css` increased from `1871` to `2012` because video poster primitives moved into Foundation.
- `npm run build:cutter-web` output CSS changed from `89.33 kB` after Batch 5.135 to `88.84 kB`, gzip `14.13 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 26 tests, 26 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `88.84 kB`, gzip `14.13 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
- Residual selector check returned no production matches for:
  - `.cutter-material-locator .cutter-video-poster*`
  - `.cutter-material-locator .cutter-video-play/time/volume/fullscreen/menu*`
  - `--cutter-video-poster`
- `git diff --check` passed before this documentation append.

Remaining debt moved forward:

- Material Search root/page-main/workbench side-panel grid geometry remains page-owned because it defines the search-review-cut workflow composition.
- Material Search side panel, queue panel, and table width composition remain page-owned until the split-workbench composition is reviewed as a whole.
- The remaining route-level video rules are now mostly legacy/source-detail or real-video playback compatibility; do not collapse them until the source-detail and material-search media paths are reviewed together.
- Material Search responsive composition remains page-owned and should be reviewed after desktop split-workbench composition stabilizes.

## Batch 5.139 Progress: Material Search Split Workbench Composition Moved To Foundation

Date: 2026-06-21.

Routes/components in scope:

- Cutter Material Search page.
- Shared split workbench composition primitives in `packages/ui-foundation/src/layout.css`.

Layer classification:

- UI Foundation now owns reusable split-workbench page/main/command/left/center/right composition, right-side queue stacking, queue table fit, floating selection anchoring, and responsive single-column fallback.
- Material Search owns only the business composition: search command, candidates, transcript, preview, selected text, and recent queue data.
- No search, transcript, preview, cut creation, cache, auth, API, desktop runtime, or project state behavior changed.

Change made:

- Added `ml-split-workbench-page`, `ml-split-workbench`, `ml-split-workbench-command`, `ml-split-workbench-flow`, `ml-split-workbench-left`, `ml-split-workbench-center`, `ml-split-workbench-side`, `ml-floating-selection-anchor`, `ml-queue-panel-stack`, and `ml-queue-table-fit` to UI Foundation.
- Updated Material Search DOM to use these shared Foundation classes.
- Removed page-owned CSS for `.cutter-material-locator`, `.cutter-page-main`, workbench grid placement, side-panel grid rows, queue stacking, queue-table width, floating selection positioning, and the route-owned `1180px` responsive block.
- Updated regression coverage so split-workbench geometry cannot return to page-private CSS unnoticed.

Visual ownership result:

- Material Search three-column layout is no longer a route-local CSS island.
- `apps/cutter-web/src/styles.css` decreased from `2392` lines after Batch 5.138 to `2298`.
- `packages/ui-foundation/src/layout.css` increased from `2012` lines to `2112` because the reusable split-workbench primitive moved there.
- `npm run build:cutter-web` output CSS changed from `87.89 kB` after Batch 5.138 to `87.73 kB`, gzip `14.01 kB`.

Verification:

- `node --test --import tsx packages/ui-foundation/src/components.test.ts` passed: 27 tests, 27 passed.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `87.73 kB`, gzip `14.01 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
- Residual selector check found only a negative regression-test reference for old route-owned page-main geometry.

Remaining debt moved forward:

- Material Search still has business-specific class names in DOM, but the layout owner is now Foundation.
- Remaining cutter CSS debt should focus on route-specific content spacing and legacy page wrappers, not on the split-workbench geometry.
- The next cleanup should be a small review pass over ordinary page `cutter-page-main`/header private positioning before touching complex transcript behavior again.

## Batch 5.138 Progress: Dead Legacy Video Chrome Removed

Date: 2026-06-20.

Routes/components in scope:

- Legacy cutter video overlay chrome.
- Material Search video frame wrapper class.

Layer classification:

- Foundation-owned `.ml-media-frame-inner` now owns the material-search video inner wrapper sizing.
- Foundation-owned `.ml-video-poster*` now owns static poster fallback chrome.
- The old `.cutter-video-frame`, `.cutter-video-scrim`, `.cutter-video-time`, and `.cutter-video-progress` rules no longer had production DOM ownership.
- No search, transcript, preview data, real video playback source, cut creation, cache, auth, API, or desktop runtime behavior changed.

Change made:

- Removed the old `.cutter-video-frame` CSS rule.
- Removed unused `.cutter-video-scrim`, `.cutter-video-time`, and `.cutter-video-progress` CSS rules.
- Removed `cutter-video-frame` from the Material Search video inner wrapper DOM.
- Updated regression coverage so these dead selectors cannot return without a test failure.

Visual ownership result:

- Material Search video inner wrapper now uses only `ml-media-frame-inner`.
- Old custom overlay/time/progress chrome no longer exists in production CSS.
- `apps/cutter-web/src/styles.css` decreased from `2456` lines after Batch 5.137 to `2392` after Batch 5.138.
- `packages/ui-foundation/src/layout.css` remained `2012` lines.
- `npm run build:cutter-web` output CSS changed from `88.74 kB` after Batch 5.137 to `87.89 kB`, gzip `13.95 kB`.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `87.89 kB`, gzip `13.95 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
- Residual selector check found only regression-test references for:
  - `.cutter-video-frame`
  - `.cutter-video-scrim`
  - `.cutter-video-time`
  - `.cutter-video-progress`
- `git diff --check` passed before this documentation append.

Remaining debt moved forward:

- Material Search root/page-main/workbench side-panel grid geometry remains page-owned because it defines the search-review-cut workflow composition.
- Material Search side panel, queue panel, and table width composition remain page-owned until the split-workbench composition is reviewed as a whole.
- Remaining media-related route CSS should be reviewed with source-detail and material-search real-video playback together, not as isolated selector cleanup.
- Material Search responsive composition remains page-owned and should be reviewed after desktop split-workbench composition stabilizes.

## Batch 5.137 Progress: Material Search Sidebar Width Override Removed

Date: 2026-06-20.

Routes/components in scope:

- Cutter shell sidebar width.
- Material Search route-specific shell override.

Layer classification:

- Shell/global Cutter ready layer owns sidebar width.
- Material Search must not own or override sidebar width.
- Material Search still owns its three-column search/review/cut workbench composition.
- No search, transcript, preview, cut creation, cache, auth, API, or desktop runtime behavior changed.

Change made:

- Removed the redundant route-level `.cutter-app[data-cutter-web-ready][data-cutter-route="material-locator"] { --ml-sidebar-width: 292px; }` override.
- Kept the existing global Cutter ready shell `--ml-sidebar-width: 292px` owner.
- Added regression coverage so Material Search cannot reintroduce a route-level sidebar-width override.

Visual ownership result:

- Sidebar width is no longer overrideable by the Material Search route.
- `apps/cutter-web/src/styles.css` decreased from `2460` lines after Batch 5.136 to `2456` after Batch 5.137.
- `packages/ui-foundation/src/layout.css` remained `2012` lines.

Verification:

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` passed: 122 tests, 122 passed.
- `npm run build:cutter-web` passed: CSS bundle `88.74 kB`, gzip `14.13 kB`.
- `npm run visual:cutter-web` passed and refreshed screenshots in `docs/acceptance/artifacts/m4-cutter-workbench`.
- Manual screenshot review passed for:
  - `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
- Residual selector check confirmed only the global Cutter ready shell still sets `--ml-sidebar-width: 292px`.
- `git diff --check` passed before this documentation append.

Remaining debt moved forward:

- Material Search root/page-main/workbench side-panel grid geometry remains page-owned because it defines the search-review-cut workflow composition.
- Material Search side panel, queue panel, and table width composition remain page-owned until the split-workbench composition is reviewed as a whole.
- The remaining route-level video rules are now mostly legacy/source-detail or real-video playback compatibility; do not collapse them until the source-detail and material-search media paths are reviewed together.
- Material Search responsive composition remains page-owned and should be reviewed after desktop split-workbench composition stabilizes.
