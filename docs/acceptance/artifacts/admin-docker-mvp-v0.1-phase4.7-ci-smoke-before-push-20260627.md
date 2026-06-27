# Admin Docker MVP v0.1 Phase 4.7 CI Smoke Before Push

Date: 2026-06-27

## Objective

Prevent the Admin Docker image workflow from pushing GHCR images before the Docker MVP candidate has passed a real container smoke.

This phase changes CI/release verification only. It does not contact NAS Docker, write NAS files, start NAS containers, publish indexes, or change Cutter protocols.

## Implemented

- Updated `.github/workflows/docker-admin.yml`.
- Updated `scripts/acceptance/admin-docker-local-smoke.ts`.
- Updated `scripts/acceptance/admin-docker-local-smoke.test.ts`.
- Updated `scripts/acceptance/target-evidence.test.ts`.
- Updated `scripts/acceptance/delivery-readiness.ts`.

The Admin Docker workflow now runs before GHCR login/push:

```bash
MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_RUN=1 \
MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_REQUIRE_PASS=1 \
MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_WEB_PORT=18081 \
npm run validate:admin-docker-local-smoke
```

The workflow also uploads local smoke reports as:

```text
mixlab-admin-docker-local-smoke
```

Report paths:

```text
docs/acceptance/artifacts/admin-docker-local-smoke-*.json
docs/acceptance/artifacts/admin-docker-local-smoke-*.md
```

## Behavior

- Local/manual default remains evidence-friendly:
  - if Docker is unavailable and `MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_REQUIRE_PASS` is not set, the script writes a blocked report and exits 0.
- CI release mode is strict:
  - if `MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_REQUIRE_PASS=1` and `local_smoke_passed=false`, the script exits nonzero.
- This means the GitHub Admin Docker workflow must prove:
  - admin-runtime image builds;
  - admin-web image builds;
  - isolated local compose stack starts;
  - admin-web root responds;
  - `/api/admin/auth/status` responds;
  - `/api/admin/library/status` responds;
  - `/api/admin/release-gates` responds;
  - `/api/admin/data-loading/plan` responds;
  - admin-worker env has MVP mode and safe worker flags.

## Current Mac Evidence

Current Mac still has no Docker CLI, so local smoke remains blocked locally:

- `docs/acceptance/artifacts/admin-docker-local-smoke-20260627T192218Z.json`
- `docs/acceptance/artifacts/admin-docker-local-smoke-20260627T192218Z.md`

Refreshed release readiness summary:

- `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260627T192227Z.json`
- `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260627T192227Z.md`

Current release readiness remains blocked by:

- `local-docker-smoke-passed`
- `live-readonly-blockers-clear`
- `parity-plan-blockers-clear`
- `worker-proof-accepted`
- `cutter-proof-accepted`
- `staging-runbook-ready`

## Verification

Passed:

- `node --test --import tsx scripts/acceptance/admin-docker-local-smoke.test.ts scripts/acceptance/target-evidence.test.ts`
- `npm run audit:delivery-readiness`
- `npm run validate:admin-docker-local-smoke`
- `npm run validate:admin-docker-release-readiness-summary`
- `npm run typecheck`

Notes:

- Node printed the existing `DEP0205 module.register()` warning from the `tsx` test loader; it did not fail tests.
- Current Mac local smoke is blocked by `spawn docker ENOENT`, which is expected until Docker is available.

## Remaining Required Evidence

The full MVP still requires:

- GitHub workflow or another Docker-capable environment runs the local smoke with `MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_REQUIRE_PASS=1`.
- NAS staged/live candidate exposes the current Admin API contract.
- NAS admin-worker env proof is collected from the running NAS host.
- Cutter compatibility proof passes against a staged candidate.
- Current, target, and rollback Docker image tags are provided.
- NAS disk pressure is resolved or explicitly protected before any production staging or upload decision.
