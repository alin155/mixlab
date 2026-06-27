# Admin Docker MVP v0.1 Phase 3 Controlled Preprocess Evidence

Generated at: 2026-06-27T18:54:23Z

## Scope

Phase 3 completed the local candidate slice for controlled preprocessing:

- Docker MVP preprocessing can run without hidden library scan.
- Docker MVP preprocessing does not auto publish `index-required` videos to Cutter.
- Worker claim paths stay queued-only in Docker MVP mode.
- Ready videos are not claimed, downgraded, or made invisible by the MVP worker path.
- Standalone worker scripts no longer bypass the Admin lifecycle command boundary for short status writes.
- Ready publish worker is blocked in Docker MVP mode even if accidentally enabled.

This is a local code and test evidence record only.

## What Changed

Admin pipeline:

- Added `resolveAdminControlledPreprocessPolicy`.
- In `MIXLAB_ADMIN_DOCKER_MVP_MODE=v0.1`, the pipeline forces:
  - `auto_scan_enabled=false`
  - `auto_publish_index_enabled=false`
  - worker `scan_before_claim=false`
  - worker `claim_statuses=["queued"]`
- Preserved non-MVP behavior, including existing auto scan, auto queue, and auto publish tests.

Docker worker loop/config:

- Added Docker MVP mode detection in `packages/runtime-config/src/docker-worker.ts`.
- Kept the preprocess worker opt-in flag behavior unchanged.
- Forced the ready publish worker disabled in Docker MVP mode even when `MIXLAB_ENABLE_READY_PUBLISH_WORKER=1`.

Standalone preprocess worker:

- Routes short lifecycle writes through `createAdminWorkerLifecycleCommands`.
- Adds Admin command audit/snapshot coverage for claim, stage, complete, fail, and count refresh.
- In Docker MVP mode, runs without scan and claims only queued rows.

Standalone ready publish worker:

- Exits before publishing when Docker MVP mode is active.
- Keeps publication blocked from changing Cutter release/index during MVP.

Worker write-path audit:

- Updated the audit contract to reflect the closed standalone preprocess worker gap.
- Kept remaining non-MVP publication risk explicit and blocked in MVP.

## Explicit Non-Actions

- Did not write NAS data.
- Did not upload Docker images.
- Did not start NAS Docker containers or workers.
- Did not run real ASR/FFmpeg preprocessing on production assets.
- Did not change Cutter release/catalog/search read protocols.
- Did not change current NAS `v010471` release/index.
- Did not enable the Docker worker flags in live NAS `.env`.

## Verification

Passed:

```text
node --test --import tsx packages/admin-api/src/admin-preprocess-pipeline.test.ts packages/admin-api/src/admin-worker-lifecycle-commands.test.ts packages/admin-api/src/admin-worker-write-path-audit.test.ts packages/runtime-config/src/docker-worker.test.ts
tests 27, pass 27
```

```text
node --test --import tsx packages/library-fs/src/preprocess-safety.test.ts packages/preprocess-core/src/library-worker.test.ts packages/admin-api/src/admin-preprocess-command-routes.test.ts
tests 21, pass 21
```

```text
node --test --import tsx packages/admin-api/src/admin-command-guard.test.ts packages/admin-api/src/admin-command-runtime.test.ts packages/admin-api/src/admin-transition-commands.test.ts packages/admin-api/src/admin-publish-commands.test.ts packages/admin-api/src/admin-source-video-command-routes.test.ts
tests 32, pass 32
```

```text
npm run typecheck
tsc -p tsconfig.json --noEmit passed
```

```text
node --test --import tsx scripts/acceptance/nas-docker-compose-static.test.ts
tests 3, pass 3
```

```text
npm run validate:nas-docker-compose-static
ok true
```

```text
npm run build:admin-web
Vite production build passed
```

```text
git diff --check
passed
```

## Known Boundary

This completes the local Phase 3 controlled-preprocess candidate. It does not prove the NAS Docker staging deployment yet.

Before uploading/replacing Docker, Phase 4 must still verify:

- Docker image version and build SHA parity.
- NAS staging endpoint is the new Admin Web/API, not the old `18080` deployment.
- Docker path is `/data/PublicLibrary`.
- Worker flags remain disabled by default in live `.env`.
- Live read-only ready count remains at or above the Phase 0 baseline of `10471`.
- Current Cutter index remains `v010471` unless a later explicit publish phase is approved.
