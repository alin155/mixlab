# Admin Docker Release Owner Runbook

Generated: 2026-06-29T09:28:58.155Z

Mode: admin-docker-release-owner-runbook

Result: ready-for-release-owner-review

Runbook ready: yes

Release decision required: yes

Push execution allowed: no

Docker deploy allowed: no

Preprocess execution allowed: no

MVP completion allowed: no

This runbook reads archived evidence only. It does not call GitHub, push images, edit NAS runtime, pull/restart containers, enable workers, run preprocessing, or write PublicLibrary.

## Sources

- Push decision package: docs/acceptance/artifacts/admin-docker-push-decision-package-20260629T091720Z.json
- Staging runbook: docs/acceptance/artifacts/admin-docker-staging-runbook-20260629T091737Z.json
- Release inputs: docs/acceptance/artifacts/admin-docker-release-inputs-20260629T091542Z.json
- Readiness summary: docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260629T091747Z.json

## Key Commands

### Image Push After Explicit Approval

```sh
gh workflow run docker-admin.yml --repo alin155/mixlab --ref admin-docker-candidate-be81398b3ade1b591122ee36a0a9566a889b1b2a -f push_images=true -f current_image_tag=9c015b9105e97954240020781f79daae3f954bde -f rollback_image_tag=9c015b9105e97954240020781f79daae3f954bde
```

### Final URL Read-only Smoke After Deploy

```sh
MIXLAB_ADMIN_DOCKER_POST_RELEASE_BASE_URL="http://<nas-ip>:<admin-web-port>" \
MIXLAB_ADMIN_DOCKER_POST_RELEASE_EXPECT_TARGET_IMAGE_TAG="be81398b3ade1b591122ee36a0a9566a889b1b2a" \
MIXLAB_ADMIN_DOCKER_POST_RELEASE_EXPECT_READY_COUNT="10471" \
MIXLAB_ADMIN_DOCKER_POST_RELEASE_EXPECT_INDEX_VERSION="v010471" \
MIXLAB_ADMIN_DOCKER_POST_RELEASE_SESSION_TOKEN="<temporary-admin-session-token>" \
npm run validate:admin-docker-post-release-smoke
```

## Observations

- Current image tag: 9c015b9105e97954240020781f79daae3f954bde
- Target image tag: be81398b3ade1b591122ee36a0a9566a889b1b2a
- Rollback image tag: 9c015b9105e97954240020781f79daae3f954bde
- Push decision package ready: true
- Readiness ready: false
- Readiness ready for release-owner review: true
- Staging execution ready: false
- Staging review ready: false
- Staging ready for release-owner review: true
- Staging only awaits explicit image-push approval: true
- Release inputs ready: true
- Source push/deploy allowed: false

## Runbook

### Pre-release Review
- Confirm the latest release-readiness summary is ready-for-release-decision with zero release review blockers.
- Confirm the push decision package is ready-for-external-release-decision and still reports push_execution_allowed=false.
- Confirm current=9c015b9105e97954240020781f79daae3f954bde, target=be81398b3ade1b591122ee36a0a9566a889b1b2a, rollback=9c015b9105e97954240020781f79daae3f954bde.
- Confirm the current worktree has not introduced runtime/web build inputs that should replace the immutable target candidate.
- Confirm the release owner explicitly accepts this one release decision before any push_images=true workflow dispatch.

### Image Push
- Run the workflow command exactly as prepared by the push decision package, only after release-owner approval:
- gh workflow run docker-admin.yml --repo alin155/mixlab --ref admin-docker-candidate-be81398b3ade1b591122ee36a0a9566a889b1b2a -f push_images=true -f current_image_tag=9c015b9105e97954240020781f79daae3f954bde -f rollback_image_tag=9c015b9105e97954240020781f79daae3f954bde
- Do not edit NAS .env, pull/restart containers, enable workers, or run preprocessing as part of image push.

### After Image Push Refresh
- Archive the completed GitHub run artifact for the push_images=true workflow.
- Regenerate admin-docker-image-push-proof and require proof_accepted=true.
- Regenerate staging runbook with MIXLAB_DOCKER_PUSH_APPROVAL=workflow_dispatch:push_images=true and the accepted image-push proof.
- Regenerate release-readiness summary before any NAS runtime action.

### NAS Deploy
- Only after a separate NAS runtime/deploy approval, set the NAS Docker staging .env image tag to the target candidate.
- Pull admin-web, admin-api, and admin-worker images.
- Restart only admin-web, admin-api, and admin-worker with MVP worker flags still controlled.
- Do not enable library preprocess worker or ready publish worker during the initial deploy smoke.

### Post-deploy Read-only Smoke
- Run the final URL read-only smoke command:
- MIXLAB_ADMIN_DOCKER_POST_RELEASE_BASE_URL="http://<nas-ip>:<admin-web-port>" \
MIXLAB_ADMIN_DOCKER_POST_RELEASE_EXPECT_TARGET_IMAGE_TAG="be81398b3ade1b591122ee36a0a9566a889b1b2a" \
MIXLAB_ADMIN_DOCKER_POST_RELEASE_EXPECT_READY_COUNT="10471" \
MIXLAB_ADMIN_DOCKER_POST_RELEASE_EXPECT_INDEX_VERSION="v010471" \
MIXLAB_ADMIN_DOCKER_POST_RELEASE_SESSION_TOKEN="<temporary-admin-session-token>" \
npm run validate:admin-docker-post-release-smoke
- Run or refresh live-readonly, version parity, worker proof, Cutter compatibility proof, and readiness summary from post-deploy evidence.
- Do not mark MVP complete unless the final URL smoke, Cutter invariants, ready count, and current index are proven.

### Controlled Preprocess Smoke
- Only after explicit production small-batch preprocess approval, record before ready count, current index, queue counts, disk safety, and worker env.
- Use a tiny non-ready-only batch; do not run scan apply, index repair, ready publish, or broad recovery.
- Verify ready materials cannot be queued/retried/recovered and remain immutable.
- Record after ready count, current index, Cutter smoke, and audit log.

### Rollback
- Set the NAS Docker image tag back to rollback=9c015b9105e97954240020781f79daae3f954bde.
- Restart admin-api, admin-web, and admin-worker using the rollback image tag.
- Re-run final URL read-only smoke and Cutter compatibility smoke after rollback.
- Do not run scan/apply, index repair, recovery, publish, worker-enable, or preprocessing during rollback unless separately approved.

## Summary

- Passed: 8
- Blocked: 4
- Failed: 0
- Runbook blockers: none
- Push execution blockers: external-release-decision-required
- Docker deploy blockers: external-release-decision-required, separate-nas-runtime-approval-required
- MVP completion blockers: external-release-decision-required, separate-nas-runtime-approval-required, post-release-smoke-required, controlled-preprocess-smoke-requires-approval

## Gates

| Gate | Category | Status | Blocks Runbook | Blocks Push | Blocks Deploy | Blocks MVP | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
release-owner-runbook-no-side-effects | safety | pass | no | no | no | no | This report reads archived JSON reports only; it does not call GitHub, GHCR, NAS, Docker, Admin API, Cutter API, or Windows Runner. | n/a
source-reports-remain-nondeploy | safety | pass | yes | yes | yes | yes | source_push_or_deploy_allowed=false | All source reports must keep push_execution_allowed/docker_upload_allowed/docker_deploy_allowed false.
readiness-ready-for-release-decision | evidence | pass | yes | yes | yes | yes | release_review_ready=false, release_owner_review_ready=true, blockers=staging-runbook-ready | Provide a release-readiness summary with no blockers except the staging runbook waiting for explicit image-push approval.
push-decision-package-ready | release-decision | pass | yes | yes | yes | yes | push_decision_package_ready=true, blockers=none | Provide a ready admin-docker-push-decision-package artifact.
staging-runbook-ready | staging | pass | yes | yes | yes | yes | staging_execution_ready=false, staging_review_ready=false, release_owner_review_ready=true, blockers=image-push-explicitly-approved | Provide a staging runbook with no blockers except the explicit image-push approval that this release-owner runbook prepares.
release-inputs-ready | evidence | pass | yes | yes | yes | yes | release_inputs_ready=true, blockers=none | Provide a release-inputs artifact with current, target, rollback, and workflow command.
image-tags-ready | rollback | pass | yes | yes | yes | yes | current=9c015b9105e97954240020781f79daae3f954bde, target=be81398b3ade1b591122ee36a0a9566a889b1b2a, rollback=9c015b9105e97954240020781f79daae3f954bde | Current, target, and rollback image tags must be present.
workflow-command-ready | release-decision | pass | yes | yes | yes | yes | gh workflow run docker-admin.yml --repo alin155/mixlab --ref admin-docker-candidate-be81398b3ade1b591122ee36a0a9566a889b1b2a -f push_images=true -f current_image_tag=9c015b9105e97954240020781f79daae3f954bde -f rollback_image_tag=9c015b9105e97954240020781f79daae3f954bde | Workflow command must be placeholder-free and match the accepted image tags.
external-release-decision-required | release-decision | blocked | no | yes | yes | yes | This runbook prepares release-owner review; it does not approve or execute push_images=true. | Release owner must explicitly approve the workflow dispatch before push execution.
separate-nas-runtime-approval-required | staging | blocked | no | no | yes | yes | Image push approval does not by itself approve NAS .env edits, image pull, or container restart. | After image push proof is accepted, separately approve NAS runtime deployment.
post-release-smoke-required | post-release | blocked | no | no | no | yes | Final deployed Admin URL has not been proven by admin-docker-post-release-smoke in this runbook. | Run validate:admin-docker-post-release-smoke against the final Admin URL after deploy.
controlled-preprocess-smoke-requires-approval | post-release | blocked | no | no | no | yes | Production small-batch preprocessing is not part of this release-owner runbook execution. | Explicitly approve production small-batch preprocessing, then record before/after ready count, index, Cutter smoke, and audit log.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-release-owner-runbook-20260629T092858Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-release-owner-runbook-20260629T092858Z.md
