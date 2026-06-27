# Admin Docker MVP v0.1 Phase 4.5 Local Docker Smoke

Date: 2026-06-27

## Objective

Add a repeatable local Docker smoke gate for the Admin Docker MVP v0.1 candidate.

This phase does not upload images, deploy to NAS, restart NAS containers, write NAS files, publish indexes, or change Cutter protocols.

## Implemented

- Added `scripts/acceptance/admin-docker-local-smoke.ts`.
- Added `scripts/acceptance/admin-docker-local-smoke.test.ts`.
- Added `npm run validate:admin-docker-local-smoke`.
- The smoke has two layers:
  - Static contract checks always run.
  - Docker build/up/probe/env/down runs only when `MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_RUN=1` is explicitly set.
- The full smoke, when Docker is available, builds:
  - `mixlab-admin-runtime:local-mvp-smoke`
  - `mixlab-admin-web:local-mvp-smoke`
- The full smoke starts an isolated local compose stack using:
  - local web URL `http://127.0.0.1:18081/` by default
  - isolated library root `.local-dev/admin-docker-local-smoke/<timestamp>/PublicLibrary`
  - Docker container root `/data/PublicLibrary`
  - `MIXLAB_ADMIN_DOCKER_MVP_MODE=v0.1`
  - standalone preprocess and publish workers disabled by default
- The full smoke probes:
  - `GET /`
  - `GET /api/admin/auth/status`
  - `GET /api/admin/library/status`
  - `GET /api/admin/release-gates`
  - `GET /api/admin/data-loading/plan`
  - `docker compose exec -T admin-worker env`

## Current Mac Result

Current Mac result: blocked, not failed.

Reason:

- Static Docker contract passed.
- `docker --version` failed with `spawn docker ENOENT`.
- Docker Compose was therefore unavailable.
- No images were built.
- No containers were started.
- No endpoint probes were run.
- No NAS writes occurred.

Generated evidence:

- `docs/acceptance/artifacts/admin-docker-local-smoke-20260627T191424Z.json`
- `docs/acceptance/artifacts/admin-docker-local-smoke-20260627T191424Z.md`

Key gate state from the generated report:

- `static-contract-ready`: pass
- `docker-cli-available`: blocked
- `docker-compose-available`: blocked
- `local-smoke-not-nas-live-evidence`: blocked for Docker upload, by design

## Verification

Passed:

- `node --test --import tsx scripts/acceptance/admin-docker-local-smoke.test.ts`
- `node --test --import tsx scripts/acceptance/nas-docker-compose-static.test.ts scripts/acceptance/admin-docker-candidate-contract-proof.test.ts scripts/acceptance/admin-worker-env-proof.test.ts scripts/acceptance/admin-docker-local-smoke.test.ts`
- `npm run validate:admin-docker-local-smoke`
- `npm run typecheck`
- `npm run validate:nas-docker-compose-static`
- `git diff --check`

Notes:

- `npm run validate:admin-docker-local-smoke` exits successfully while reporting `blocked`, matching the existing release-proof pattern for missing external evidence.
- Node printed the existing `DEP0205 module.register()` warning from the `tsx` test loader; it did not fail the tests.

## Next Required Evidence

On a Docker-capable machine, run:

```bash
MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_RUN=1 MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_WEB_PORT=18081 npm run validate:admin-docker-local-smoke
```

The result must show:

- `local_smoke_passed=true`
- both local images built
- local compose stack started
- all five web/API probes passed
- admin-worker env has:
  - `MIXLAB_ADMIN_DOCKER_MVP_MODE=v0.1`
  - `MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=0`
  - `MIXLAB_ENABLE_READY_PUBLISH_WORKER=0`
  - `MIXLAB_ADMIN_LIBRARY_ROOT=/data/PublicLibrary`
  - `MIXLAB_PREPROCESS_LIBRARY_ROOT=/data/PublicLibrary`
- compose stack was stopped by the script

Even after this local smoke passes, Docker upload remains blocked until the staged/NAS gates pass:

- NAS live-readonly current API proof
- NAS admin-worker env proof from the running NAS host
- Cutter compatibility proof
- disk-space protection gate
- rollback/staging approval gate
