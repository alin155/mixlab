# Admin Docker MVP v0.1 Phase 4.11 - CI Release Gate Artifacts

Date: 2026-06-27

## Objective

Make the Admin Docker CI run produce the same release-gate evidence chain that the local/staging runbook expects.

Before this phase, the GitHub workflow could run local Docker smoke and conditionally push images, but it did not generate the staging runbook and release readiness summary artifacts. That left the operator with separate pieces of evidence instead of one CI artifact bundle explaining whether the candidate is actually ready for staging/release review.

## Scope

Implemented:

- `.github/workflows/docker-admin.yml`
  - Added `workflow_dispatch` inputs for `current_image_tag` and `rollback_image_tag`.
  - Generates pre-staging release-gate evidence:
    - `validate:admin-docker-candidate-contract-proof`
    - `validate:admin-docker-release-live-readonly`
    - `validate:admin-docker-version-parity-plan`
    - `validate:admin-worker-env-proof`
    - `validate:admin-cutter-compatibility-proof`
  - Builds and optionally pushes images exactly as before: push only when `workflow_dispatch` and `push_images=true`.
  - Generates:
    - `validate:admin-docker-staging-runbook`
    - `validate:admin-docker-release-readiness-summary`
  - Uploads `mixlab-admin-docker-release-gates` containing candidate, live, parity, worker, Cutter, staging, and readiness reports.
- `scripts/acceptance/delivery-readiness.ts`
  - Audits the new CI release-gate artifact chain.
  - Requires staging target tag binding to `github.sha`.
  - Requires explicit `workflow_dispatch:push_images=true` approval to be wired into the runbook environment.
- `scripts/acceptance/target-evidence.test.ts`
  - Verifies the Admin Docker workflow uploads release-gate reports and keeps image push behind explicit manual approval.
- `scripts/acceptance/admin-docker-release-live-readonly.ts`
  - Fixed CLI handling of `MIXLAB_ACCEPTANCE_OUTPUT_DIR`.
- `scripts/acceptance/admin-docker-release-live-readonly.test.ts`
  - Added coverage that blocked live-readonly artifacts are written to the configured output directory.

Not implemented:

- No Docker image was pushed.
- No Docker container was started on this Mac.
- No NAS Docker target was contacted.
- No NAS file, Cutter release/index, or worker flag was changed.

## Generated Evidence

Latest generated artifacts:

- Local Docker smoke: `docs/acceptance/artifacts/admin-docker-local-smoke-20260627T194719Z.json`
- Candidate contract proof: `docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T194726Z.json`
- Live readonly: `docs/acceptance/artifacts/admin-docker-release-live-readonly-20260627T194734Z.json`
- Version/API parity plan: `docs/acceptance/artifacts/admin-docker-version-parity-plan-20260627T194743Z.json`
- Worker env proof: `docs/acceptance/artifacts/admin-worker-env-proof-20260627T194749Z.json`
- Cutter compatibility proof: `docs/acceptance/artifacts/admin-cutter-compatibility-proof-20260627T194754Z.json`
- Staging runbook: `docs/acceptance/artifacts/admin-docker-staging-runbook-20260627T194800Z.json`
- Release readiness summary: `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260627T194805Z.json`

Key result:

- `release_review_ready=false`
- `docker_upload_allowed=false`
- `staging_review_ready=false`
- `docker_deploy_allowed=false`

The CI/local evidence chain now reaches a complete blocked readiness summary instead of stopping at isolated smoke reports.

## Current Blockers

The latest readiness summary remains blocked by:

- `local-docker-smoke-passed`
- `live-readonly-blockers-clear`
- `parity-plan-blockers-clear`
- `worker-proof-accepted`
- `cutter-proof-accepted`
- `staging-runbook-ready`

The concrete next actions reported by the summary are:

- Run local Docker smoke on a Docker-capable machine or GitHub runner.
- Provide/stage an Admin Docker target exposing the current Admin API contract.
- Collect NAS admin-worker env/inspect evidence.
- Run Windows Cutter compatibility proof after a staged candidate exists.
- Manually dispatch the Admin Docker workflow with `push_images=true` only after smoke passes.
- Set the staging target tag to the exact `build_identity.image_tag`.
- Provide current, target, and rollback image tags before release review.

## Verification

Passed:

```bash
node --test --import tsx scripts/acceptance/admin-docker-release-live-readonly.test.ts scripts/acceptance/admin-docker-local-smoke.test.ts scripts/acceptance/admin-docker-staging-runbook.test.ts scripts/acceptance/admin-docker-release-readiness-summary.test.ts scripts/acceptance/target-evidence.test.ts
npm run audit:delivery-readiness
npm run typecheck
git diff --check
```

Additional non-destructive simulation:

```bash
MIXLAB_ACCEPTANCE_OUTPUT_DIR=<tmp> npm run validate:admin-docker-candidate-contract-proof
MIXLAB_ACCEPTANCE_OUTPUT_DIR=<tmp> npm run validate:admin-docker-release-live-readonly
MIXLAB_ACCEPTANCE_OUTPUT_DIR=<tmp> MIXLAB_ACCEPTANCE_ARTIFACT_DIR=<tmp> npm run validate:admin-docker-version-parity-plan
MIXLAB_ACCEPTANCE_OUTPUT_DIR=<tmp> npm run validate:admin-worker-env-proof
MIXLAB_ACCEPTANCE_OUTPUT_DIR=<tmp> npm run validate:admin-cutter-compatibility-proof
```

Simulation result:

- Exit code `0`.
- All required pre-staging reports were generated into the temporary output directory.
- Reports remained blocked because external NAS/Windows evidence was intentionally not supplied.

## Release Position

This phase improves CI release observability and prevents fragmented evidence. It does not make the Docker MVP deployable by itself.

The next meaningful step is to run the Admin Docker workflow on GitHub or another Docker-capable runner and inspect the `mixlab-admin-docker-release-gates` artifact. If local Docker smoke passes there, the next release gate becomes a staged NAS target plus worker/Cutter external proofs.
