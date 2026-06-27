# Admin Docker MVP v0.1 Phase 1 Surface And Gate Evidence

Generated at: 2026-06-27T18:37:54Z

## Scope

Phase 1 completed the local candidate slice for:

- Admin Web Docker MVP surface mode.
- Admin Web MVP route/navigation contract.
- Admin API Docker MVP command gate.
- Focused tests for UI contract, AdminApp wiring, command policy, command runtime, and source-video command route error mapping.

This is a local code and test evidence record only.

## What Changed

Frontend:

- Added `docker-mvp-v0.1` Admin surface mode.
- Added `ADMIN_DOCKER_MVP_NAV_ITEMS` with five core entries: 总览, 素材库, 预处理, 剪辑师, 系统检查.
- Added route fallback so hidden MVP routes such as 设置 and 发布与索引 resolve back to 总览 in MVP mode.
- Added MVP UI control contract that keeps core login/cutter/preprocess controls and disables or hides high-risk operations.
- Wired `AdminApp` so MVP mode does not pass high-risk handlers to pages.

Backend:

- Added `MIXLAB_ADMIN_DOCKER_MVP_MODE=v0.1`.
- Added `admin_mvp_command_blocked` policy and error.
- Added runtime blocking before writer lease acquisition.
- Allowed core MVP commands: admin auth, cutter user management, controlled preprocess transitions, and worker lifecycle writes.
- Blocked high-risk commands: settings/source-folder changes, library init/scan apply, source-video publish, bulk publish, cover/metadata writes, index repair, read-model reconcile, and command snapshot restore.
- Preserved 409 API responses for MVP blocks, including source-video cover routes with local catches.

## Explicit Non-Actions

- Did not write NAS data.
- Did not upload Docker images.
- Did not start NAS Docker containers or workers.
- Did not change Cutter release/catalog/search read protocols.
- Did not reprocess ready videos.
- Did not migrate the NAS library layout.

## Verification

Passed:

```text
node --test --import tsx apps/admin-web/src/features/admin-ui-contract.test.ts packages/admin-api/src/admin-command-guard.test.ts packages/admin-api/src/admin-command-runtime.test.ts
tests 24, pass 24
```

```text
node --test --import tsx apps/admin-web/src/admin-app.test.ts
tests 68, pass 68
```

```text
node --test --import tsx packages/admin-api/src/admin-source-video-command-routes.test.ts packages/admin-api/src/admin-settings-command-routes.test.ts packages/admin-api/src/admin-library-command-routes.test.ts packages/admin-api/src/admin-index-command-routes.test.ts
tests 24, pass 24
```

```text
node --test --import tsx packages/admin-api/src/admin-source-video-command-routes.test.ts
tests 9, pass 9
```

```text
npm run typecheck
tsc -p tsconfig.json --noEmit passed
```

```text
git diff --check -- <phase-1-files>
passed
```

## Known Boundary

This completes Phase 1 only. It does not prove Docker runtime readiness. Docker upload remains blocked until Phase 2 and Phase 3 pass, and until the NAS release gates from Phase 0 are addressed: old NAS API version, disk pressure, version/health parity, and no live-write rehearsal.
