# Admin Docker MVP v0.1 Phase 4.13 - Delivery Readiness Gate Hardening

Date: 2026-06-27

## Objective

Make the general delivery readiness audit protect the Admin Docker MVP release-gate chain, not just the focused Admin Docker tests.

Phase 4.12 added local-smoke-derived candidate contract proof. This phase makes that contract part of `npm run audit:delivery-readiness`, so future workflow or package-script drift is caught by the standard delivery audit before a Docker release attempt.

## Scope

Implemented:

- `scripts/acceptance/delivery-readiness.ts`
  - Added Admin Docker release-gate scripts to `REQUIRED_FILES`.
  - Added Admin Docker release-gate npm scripts to `REQUIRED_SCRIPTS`.
  - Requires `.github/workflows/docker-admin.yml` to set `MIXLAB_ADMIN_DOCKER_CANDIDATE_FROM_LOCAL_SMOKE=1` before GHCR login/push.
  - Requires `package.json` to expose:
    - `validate:admin-docker-release-gate-dry-run`
    - `validate:admin-docker-release-live-readonly`
    - `validate:admin-docker-version-parity-plan`
    - `validate:admin-docker-candidate-contract-proof`
    - `validate:admin-docker-local-smoke`
    - `validate:admin-worker-env-proof`
    - `validate:admin-docker-staging-runbook`
    - `validate:admin-cutter-compatibility-proof`
    - `validate:admin-docker-release-readiness-summary`

Not implemented:

- No NAS Docker probe was run.
- No Docker image was built or pushed on this Mac.
- No worker was started.
- No Cutter release/index or ready asset state was changed.

## Why This Matters

The Admin Docker MVP is now dependent on a multi-report release-gate chain:

```text
local Docker smoke
candidate contract proof
live-readonly proof
version/API parity plan
admin-worker env proof
Cutter compatibility proof
staging runbook
release readiness summary
```

If one validator script, package command, or workflow environment switch is accidentally omitted from a future commit, the GitHub workflow could look structurally valid while producing incomplete evidence. This phase makes the standard delivery audit catch that class of drift.

## Verification

Passed:

```bash
npm run audit:delivery-readiness
node --test --import tsx scripts/acceptance/target-evidence.test.ts
node --test --import tsx scripts/acceptance/target-evidence.test.ts scripts/acceptance/admin-docker-candidate-contract-proof.test.ts scripts/acceptance/admin-docker-local-smoke.test.ts scripts/acceptance/admin-docker-staging-runbook.test.ts scripts/acceptance/admin-docker-release-readiness-summary.test.ts
npm run typecheck
git diff --check
```

Key result:

- `audit:delivery-readiness` remains `ok: true`.
- Accepted delivery checks remain `41`.
- Real target gates remain `ACC-008` and `ACC-009`.
- Docker upload remains unapproved and blocked by external runtime evidence, as intended.

## Release Position

This phase does not make the Docker MVP deployable by itself. It makes the path to deployment harder to accidentally weaken.

The next external blocker remains unchanged: run the Admin Docker workflow on a Docker-capable GitHub runner or staging machine, then inspect whether:

- `local_smoke_passed=true`
- local-smoke-derived `candidate_contract_ready=true`
- release-gate artifacts are uploaded in `mixlab-admin-docker-release-gates`

After that, the remaining gates are staged/NAS live-readonly, NAS admin-worker env proof, Cutter compatibility proof, explicit image tags, rollback tag, and manual release approval.
