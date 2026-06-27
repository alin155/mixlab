# Admin Docker MVP v0.1 Phase 4.9 - Staging Push Approval Gate

Date: 2026-06-27

## Objective

Add a release-review gate that prevents the Admin Docker candidate from being treated as staging-ready unless image push was explicitly approved through the GitHub Admin Docker workflow dispatch input.

This closes the remaining gap after Phase 4.8: the workflow no longer pushes images on ordinary `main` pushes, and the staging runbook now also requires evidence that the target image was pushed intentionally.

## Scope

Implemented:

- `scripts/acceptance/admin-docker-staging-runbook.ts`
  - Added `MIXLAB_DOCKER_PUSH_APPROVAL`.
  - Requires the exact value `workflow_dispatch:push_images=true`.
  - Adds the blocking gate `image-push-explicitly-approved`.
  - Records approval state in JSON and Markdown reports.
- `scripts/acceptance/admin-docker-staging-runbook.test.ts`
  - Keeps ready scenarios explicitly approved.
  - Adds coverage for missing push approval.
- `scripts/acceptance/admin-docker-release-readiness-summary.ts`
  - Converts the staging blocker into a concrete next action.
- `scripts/acceptance/admin-docker-release-readiness-summary.test.ts`
  - Verifies the readiness summary tells the operator to run the workflow manually with `push_images=true`.

Not implemented:

- No Docker image was pushed.
- No NAS container was restarted.
- No NAS file or live library data was written.
- No Cutter release/index/search protocol was changed.
- No worker flag was enabled.

## Generated Evidence

Latest staging runbook:

- JSON: `docs/acceptance/artifacts/admin-docker-staging-runbook-20260627T193104Z.json`
- Markdown: `docs/acceptance/artifacts/admin-docker-staging-runbook-20260627T193104Z.md`

Latest release readiness summary:

- JSON: `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260627T193110Z.json`
- Markdown: `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260627T193110Z.md`

Key result:

- `staging_review_ready=false`
- `docker_deploy_allowed=false`
- `release_review_ready=false`
- `docker_upload_allowed=false`
- Staging blocker includes `image-push-explicitly-approved`.

## Current Blockers

The candidate is intentionally still blocked by:

- `local-docker-smoke-passed`: local Docker smoke has not passed on a Docker-capable machine.
- `live-readonly-blockers-clear`: live NAS Docker read-only probe still sees old API/runtime blockers.
- `parity-plan-blockers-clear`: current NAS Docker contract parity is still blocked.
- `worker-proof-accepted`: NAS admin-worker env proof has not been accepted.
- `cutter-proof-accepted`: staged-candidate Windows Cutter compatibility proof has not been accepted.
- `staging-runbook-ready`: staging runbook still lacks explicit tags, push approval, and external evidence.

The new staging-specific blocker is:

- `image-push-explicitly-approved`: requires `MIXLAB_DOCKER_PUSH_APPROVAL=workflow_dispatch:push_images=true` after the GitHub Admin Docker workflow is manually dispatched with `push_images=true` and its smoke gate passes.

## Verification

Passed:

```bash
node --test --import tsx scripts/acceptance/admin-docker-staging-runbook.test.ts scripts/acceptance/admin-docker-release-readiness-summary.test.ts scripts/acceptance/target-evidence.test.ts
npm run validate:admin-docker-staging-runbook
npm run validate:admin-docker-release-readiness-summary
npm run audit:delivery-readiness
npm run typecheck
git diff --check
```

Verification notes:

- Focused tests: 80 passed.
- Delivery readiness audit: `ok=true`, remaining target gates are `ACC-008` and `ACC-009`.
- TypeScript typecheck passed.
- `git diff --check` passed.

## Release Position

This phase improves the release gate only. It does not make the Admin Docker MVP deployable by itself.

The next safe implementation step is to close the Docker-capable local smoke and staging evidence path without touching live NAS state:

1. Run local Admin Docker smoke on a machine with Docker CLI and Compose.
2. Produce explicit current, target, and rollback image tags.
3. Manually dispatch the Admin Docker workflow with `push_images=true` only after the local smoke passes.
4. Rerun the staging runbook with `MIXLAB_DOCKER_PUSH_APPROVAL=workflow_dispatch:push_images=true`.
5. Stage the candidate separately, then collect live readonly, worker env, and Windows Cutter compatibility proof.
