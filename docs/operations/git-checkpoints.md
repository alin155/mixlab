# MixLab Git Checkpoints

This file tracks rollback checkpoints for larger MixLab delivery batches.

## Rollback Rules

- Create a checkpoint before high-risk migrations.
- Use an annotated tag for every checkpoint.
- Keep each migration batch small enough to verify and revert independently.
- Do not mix UI migration, auth changes, runtime/cache changes, and Windows packaging changes in one checkpoint unless the batch explicitly requires it.
- Prefer reverting to a tag or branch created from a tag instead of manually undoing files.
- Treat isolated UI comparison apps as temporary scaffolding. After `packages/ui-foundation v1` becomes stable, delete `apps/antd-ui-lab` and `apps/ui-foundation-lab` instead of maintaining them as product code.

## Restore Commands

Inspect a checkpoint:

```bash
git show --stat <tag-or-commit>
```

Create a new branch from a checkpoint:

```bash
git switch -c restore/<name> <tag-or-commit>
```

Hard reset the current branch to a checkpoint only after explicit approval:

```bash
git reset --hard <tag-or-commit>
```

## Checkpoint Table

| Order | Tag | Purpose | Scope | Verification |
| --- | --- | --- | --- | --- |
| 001 | `checkpoint/ui-foundation-pre-v1-migration` | UI Foundation v1 migration baseline before touching production三端 | Current source/docs baseline, AntD comparison lab, UI Foundation isolated lab, environment records | `npm run build -w @mixlab/ui-foundation-lab` |
| 002 | `checkpoint/ui-foundation-v1-package` | Real UI Foundation v1 component package baseline | `packages/ui-foundation` v1 components, v1 fixture screenshots, deleted isolated UI labs, package-lock cleanup | `node --test --import tsx packages/ui-foundation/src/*.test.ts`; `npm run typecheck`; `npm run build:admin-web`; `npm run build:cutter-web`; `npm run build:ui-fixtures`; `npm run visual:ui-foundation` |
| 003 | `checkpoint/ui-foundation-lab-cleanup` | Isolated comparison labs removed after real package started | Deleted `apps/antd-ui-lab` and `apps/ui-foundation-lab`; archived comparison README files | same as 002 |
| 004 | `checkpoint/ui-foundation-shell-migration` | Production shell migration to UI Foundation | Admin web and cutter web now use shared `AppShell`; artificial outer app frames removed; sidebar/workbench/scroll ownership unified; visual scripts updated for the new shell contract | `node --test --import tsx packages/ui-foundation/src/*.test.ts apps/admin-web/src/admin-app.test.ts apps/cutter-web/src/cutter-app.test.ts`; `npm run typecheck`; `npm run build:admin-web`; `npm run build:cutter-web`; `npm run visual:admin-web`; `npm run visual:cutter-web`; `git diff --check`; GitHub Windows package run `27786632391`; Windows Runner `install_latest_and_smoke-20260618T204224Z-d71043e2`; Windows Runner `windows_acceptance-20260618T204405Z-39423b3c` |
| 005 | `checkpoint/ui-foundation-low-risk-pages` | UI Foundation v1 API cleanup and low-risk page migration | `packages/ui-foundation` exports only v1 components; old fixture pages removed; admin user/settings/preprocess/index/source detail pages use `Table`, `Badge`, `InspectorPanel`, and page info groups; cutter settings/local/public library/cut-list use v1 table/card/badge composition; visual screenshot scripts updated for v1 library grids | `node --test --import tsx packages/ui-foundation/src/*.test.ts apps/admin-web/src/admin-app.test.ts apps/cutter-web/src/cutter-app.test.ts`; `npm run typecheck`; `npm run build:admin-web`; `npm run build:cutter-web`; `npm run build:ui-fixtures`; `npm run visual:ui-foundation`; `npm run visual:admin-web`; `npm run visual:cutter-web`; `git diff --check`; GitHub Windows package run `27791103017`; Windows Runner `install_latest_and_smoke-20260618T220257Z-6ffbebb7`; Windows Runner `windows_acceptance-20260618T220518Z-885837c2` |
| 006 | `checkpoint/ui-foundation-cut-tasks` | Cut task page migration to UI Foundation | Cutter cut tasks now uses shared `Card`, `Table`, `Badge`, `Button`, and `InspectorPanel`; selected transcript and problem columns are one-line dense cells; status colors and retry/check actions follow semantic state rules; table body owns scroll with sticky header | `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts packages/ui-foundation/src/components.test.ts`; `npm run typecheck`; `npm run build:cutter-web`; `npm run visual:cutter-web`; `git diff --check`; GitHub Windows package run `27793165132`; Windows Runner `install_latest_and_smoke-20260618T224828Z-e96cf5e9`; Windows Runner `windows_acceptance-20260618T225023Z-5c8b298c` |
| 007 | `checkpoint/ui-foundation-material-search` | Material search page migration to UI Foundation | Cutter material search now uses shared `SearchBox`, `Button`, and `Badge`; candidate list, transcript, floating cut action, selection preview, and recent task states follow the shared visual contract; Cutter API uses existing local release cache while background NAS sync continues, preventing cold-start public-library slow reads during Windows validation | `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts packages/ui-foundation/src/components.test.ts`; `node --test --import tsx packages/cutter-api/src/index.test.ts`; `npm run typecheck`; `npm run build:cutter-web`; `npm run visual:cutter-web`; `git diff --check`; GitHub Windows package run `27796580795`; Windows Runner `install_latest_and_smoke-20260619T001008Z-b2ecb85c`; Windows Runner `windows_acceptance-20260619T001310Z-b2aa6a21` |
| 008 | `checkpoint/ui-foundation-windows-final` | Cutter UI Foundation final Windows acceptance and count correction | Cutter sidebar footer always renders stable `本地 <local> / 公共 <public>` counts; Cutter release catalog aligned from stale `v007950 / 7950` to current `v010471 / 10471`; shared Windows installer updated to `fee7184` | `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts`; `node --test --import tsx packages/ui-foundation/src/components.test.ts`; `npm run build:cutter-web`; `npm run typecheck`; `node --test --import tsx scripts/desktop/windows-runtime.test.ts packages/cutter-api/src/desktop-sidecar.test.ts packages/desktop-runtime/src/index.test.ts apps/cutter-web/src/desktop-bridge.test.ts apps/cutter-desktop/src/tauri-config.test.ts`; `npm run visual:cutter-web`; `git diff --check`; GitHub Windows package run `27915627515`; Windows Runner `install_latest_and_smoke-20260621T200636Z-0db14ade`; Windows Runner `real_cut_smoke-20260621T200740Z-504436ad` |

## Planned Migration Checkpoints

| Order | Planned tag | Batch |
| --- | --- | --- |
| 009 | `checkpoint/ui-foundation-polish-or-cleanup` | Final UI Foundation polish or cleanup temporary validation artifacts after user review |
