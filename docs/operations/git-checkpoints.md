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

## Planned Migration Checkpoints

| Order | Planned tag | Batch |
| --- | --- | --- |
| 004 | `checkpoint/ui-foundation-shell-migration` | Migrate shared shell/sidebar/workspace and remove outer app frame in production surfaces |
| 005 | `checkpoint/ui-foundation-low-risk-pages` | Migrate settings, cache, users, preprocess, and library pages |
| 006 | `checkpoint/ui-foundation-cut-tasks` | Migrate cut task tables, detail panels, and status/action semantics |
| 007 | `checkpoint/ui-foundation-material-search` | Migrate material search workbench, transcript panel, and floating cut action |
