# Admin Docker Staging/Update Runbook

Generated: 2026-06-29T08:17:17.992Z

Mode: admin-docker-staging-runbook

Result: ready-for-staging-review

Staging execution ready: yes

Staging review ready: yes

Docker deploy allowed: no

This report does not run Docker, push images, restart containers, write NAS files, enable workers, repair usage-events, recover jobs, publish indexes, or change Cutter protocols.

## Sources

- Local Docker smoke: docs/acceptance/artifacts/admin-docker-local-smoke-20260629T031851Z.json
- GitHub artifact readiness: docs/acceptance/artifacts/admin-docker-github-artifact-readiness-20260629T064229Z.json
- Parity plan: docs/acceptance/artifacts/admin-docker-version-parity-plan-20260629T080730Z.json
- Candidate contract proof: docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260629T031953Z.json
- Worker env proof: docs/acceptance/artifacts/admin-worker-env-proof-20260629T080002Z.json
- Cutter compatibility proof: docs/acceptance/artifacts/admin-cutter-compatibility-proof-20260629T081635Z.json
- Release inputs: docs/acceptance/artifacts/admin-docker-release-inputs-20260629T035458Z.json
- NAS disk proof: docs/acceptance/artifacts/admin-docker-nas-disk-proof-20260629T080002Z.json
- Image push proof: docs/acceptance/artifacts/admin-docker-image-push-proof-20260629T064248Z.json

## Image Tags

- Current: latest
- Target: 9c015b9105e97954240020781f79daae3f954bde
- Rollback: latest
- Image push approval: accepted (workflow_dispatch:push_images=true)
- Image push proof: accepted (docs/acceptance/artifacts/admin-docker-image-push-proof-20260629T064248Z.json)

## Observations

- Local smoke status: accepted
- Local smoke passed: true
- Local smoke blockers: none
- Smoked image tag: 73ab7b355051d7325174111f955cd8356d42787d
- GitHub candidate artifact ready: true
- GitHub candidate contract ready: true
- GitHub staging handoff ready: false
- GitHub candidate image tag: 9c015b9105e97954240020781f79daae3f954bde
- GitHub candidate build sha: 9c015b9105e97954240020781f79daae3f954bde
- Target tag matches smoked image: yes
- Parity status: blocked
- Docker image update required: false
- Parity blockers: admin-worker-env-external-proof, cutter-compatibility-external-proof
- Staging execution parity blockers: none
- Unresolved parity blockers: none
- Resolved external parity blockers: admin-worker-env-external-proof, cutter-compatibility-external-proof
- Candidate contract status: ready-for-candidate-review
- Candidate contract ready: true
- Candidate contract blockers: none
- Worker env status: accepted
- Worker proof accepted: true
- Worker blockers: none
- Cutter compatibility status: accepted
- Cutter proof accepted: true
- Cutter blockers: none
- Release inputs status: ready-for-release-decision
- Release inputs ready: true
- Release inputs current tag: latest
- Release inputs target tag: 9c015b9105e97954240020781f79daae3f954bde
- Release inputs rollback tag: latest
- Current tag matches release inputs: yes
- Target tag matches release inputs: yes
- Rollback tag matches release inputs: yes
- Release input blockers: none
- Release input handoff staging blockers: nas-disk-risk-carried-forward, explicit-push-approval-required, current-and-rollback-tags-required
- NAS disk proof status: accepted
- NAS disk proof accepted: true
- NAS disk proof blockers: none
- Image push proof status: accepted
- Image push proof accepted: true
- Image push proof blockers: none
- Cleared pre-staging execution blockers: nas-disk-risk-carried-forward
- Carried pre-staging execution blockers: none

## Preflight

- Confirm a current backup exists for admin-users, cutter-users, usage-events, current index, and .mixlab-library admin state.
- Confirm candidate API/version contract proof is accepted for the target image before staging.
- Confirm NAS disk gate is not blocked and RAID/storage warnings are resolved or explicitly accepted by the release gate.
- Confirm admin-worker env proof is accepted with standalone workers disabled.
- Confirm Windows Cutter compatibility smoke is ready to run after staging.

## Stage Update

- Set MIXLAB_IMAGE_TAG=9c015b9105e97954240020781f79daae3f954bde in the NAS Docker .env staging copy.
- Run docker compose pull for admin-web, admin-api, and admin-worker images.
- Run docker compose up -d admin-api admin-web admin-worker with standalone worker flags still disabled.
- Do not enable MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER or MIXLAB_ENABLE_READY_PUBLISH_WORKER during initial staging.

## Post Update Validation

- Run GET-only live-readonly probe against the staged Admin Web target.
- Run candidate contract proof against the staged Admin Web target and require candidate_contract_ready=true.
- Run Docker version/API parity plan and require current Admin API contract endpoints to pass.
- Run admin-worker env proof against exported staged container evidence.
- Run Cutter release/index/search compatibility smoke and archive the report.
- Keep Docker upload/release blocked if any gate reports blocked or needs external proof.

## Rollback

- Set MIXLAB_IMAGE_TAG=latest in the NAS Docker .env rollback copy.
- Run docker compose up -d admin-api admin-web admin-worker using the rollback tag.
- Re-run GET-only live-readonly probe and Cutter compatibility smoke after rollback.
- Do not run scan/apply, recovery, publish, or worker-enable commands as part of rollback unless separately approved.

## Gates

| Gate | Category | Status | Blocks Staging Execution | Blocks Final Review | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- |
runbook-no-side-effects | safety | pass | no | no | This report reads archived artifacts and env inputs only; it does not run Docker, push images, restart containers, or write NAS files. | n/a
current-image-tag-provided | input | pass | no | no | MIXLAB_DOCKER_CURRENT_IMAGE_TAG=latest | Set MIXLAB_DOCKER_CURRENT_IMAGE_TAG before producing a staging runbook.
target-image-tag-provided | input | pass | no | no | MIXLAB_DOCKER_TARGET_IMAGE_TAG=9c015b9105e97954240020781f79daae3f954bde | Set MIXLAB_DOCKER_TARGET_IMAGE_TAG before producing a staging runbook.
rollback-image-tag-provided | input | pass | no | no | MIXLAB_DOCKER_ROLLBACK_IMAGE_TAG=latest | Set MIXLAB_DOCKER_ROLLBACK_IMAGE_TAG before producing a staging runbook.
target-differs-from-current | input | pass | no | no | current=latest, target=9c015b9105e97954240020781f79daae3f954bde | Target tag must differ from current tag so the staging action is explicit.
rollback-tag-matches-current | rollback | pass | no | no | current=latest, rollback=latest | Rollback tag must match the current deployed tag before staging.
image-push-explicitly-approved | input | pass | no | no | MIXLAB_DOCKER_PUSH_APPROVAL=workflow_dispatch:push_images=true | Set MIXLAB_DOCKER_PUSH_APPROVAL=workflow_dispatch:push_images=true only after the GitHub Admin Docker workflow was manually dispatched with push_images=true and its smoke gate passed.
image-push-proof-accepted | evidence | pass | no | no | image_push_proof=docs/acceptance/artifacts/admin-docker-image-push-proof-20260629T064248Z.json, proof_accepted=true, blockers=none | After workflow_dispatch push_images=true succeeds, run validate:admin-docker-image-push-proof and pass MIXLAB_ADMIN_DOCKER_IMAGE_PUSH_PROOF_REPORT to the staging runbook.
local-docker-smoke-passed | evidence | pass | no | no | local_smoke_passed=true, github_candidate_artifact_ready=true, image_tags=73ab7b355051d7325174111f955cd8356d42787d, 9c015b9105e97954240020781f79daae3f954bde | Run validate:admin-docker-local-smoke on a Docker-capable machine, or archive an Admin Docker GitHub artifact readiness report with github_candidate_artifact_ready=true before staging.
target-tag-matches-smoked-image | input | pass | no | no | target=9c015b9105e97954240020781f79daae3f954bde, smoked_image_tags=73ab7b355051d7325174111f955cd8356d42787d, 9c015b9105e97954240020781f79daae3f954bde | Set MIXLAB_DOCKER_TARGET_IMAGE_TAG to the exact image tag from the accepted local smoke or GitHub candidate artifact.
parity-report-present | evidence | pass | no | no | docs/acceptance/artifacts/admin-docker-version-parity-plan-20260629T080730Z.json | Provide the Docker version/API parity plan artifact.
release-inputs-ready-for-decision | evidence | pass | no | no | release_inputs_ready=true | Provide an accepted admin-docker-release-inputs report before using it to constrain staging.
current-tag-matches-release-inputs | input | pass | no | no | runbook current=latest, release_inputs current=latest | Set MIXLAB_DOCKER_CURRENT_IMAGE_TAG from the accepted admin-docker-release-inputs report.
target-tag-matches-release-inputs | input | pass | no | no | runbook target=9c015b9105e97954240020781f79daae3f954bde, release_inputs target=9c015b9105e97954240020781f79daae3f954bde | Set MIXLAB_DOCKER_TARGET_IMAGE_TAG from the accepted admin-docker-release-inputs report.
rollback-tag-matches-release-inputs | rollback | pass | no | no | runbook rollback=latest, release_inputs rollback=latest | Set MIXLAB_DOCKER_ROLLBACK_IMAGE_TAG from the accepted admin-docker-release-inputs report.
nas-disk-proof-accepted | runtime-risk | pass | no | no | disk proof accepted: docs/acceptance/artifacts/admin-docker-nas-disk-proof-20260629T080002Z.json | Run validate:admin-docker-nas-disk-proof with sanitized NAS df evidence and require proof_accepted:true.
pre-staging-execution-blockers-carried-forward | runtime-risk | pass | no | no | handoff_staging_blockers=nas-disk-risk-carried-forward, explicit-push-approval-required, current-and-rollback-tags-required | Clear or explicitly re-prove NAS disk safety before staging execution.
parity-report-staging-execution-safe | runtime-risk | pass | no | no | Only post-update parity proof remains before final review: none. | Before staging execution, live target/proxy/root/disk blockers must be clear. Current API and proof-contract blockers may remain only when docker_image_update_required=true because staging is the update that should resolve them.
parity-report-blockers-clear | evidence | pass | no | no | No unresolved parity upload blockers after external proof normalization. Resolved external blockers: admin-worker-env-external-proof, cutter-compatibility-external-proof | Resolve current API contract parity and disk blockers, and provide accepted worker/Cutter external proof for their external-proof blockers.
candidate-contract-proof-accepted | evidence | pass | no | no | candidate_contract_ready=true, github_candidate_artifact_ready=true, github_candidate_contract_ready=true | Run validate:admin-docker-candidate-contract-proof against the local or staged candidate, or archive an Admin Docker GitHub artifact readiness report with github_candidate_artifact_ready=true.
worker-env-proof-accepted | evidence | pass | no | no | worker proof status=accepted, blockers=none | Run validate:admin-worker-env-proof with exported NAS evidence after staging and require proof_accepted:true before final MVP acceptance.
cutter-compatibility-proof-accepted | evidence | pass | no | no | cutter proof status=accepted, blockers=none | Run validate:admin-cutter-compatibility-proof with staged-candidate Windows reports and require proof_accepted:true before final MVP acceptance.
current-api-update-needed-is-known | runtime-risk | pass | no | no | docker_image_update_required=false | Run Docker version/API parity plan before staging.
parity-result-remains-nondeploy | safety | pass | no | no | parity_result=blocked | The parity plan should remain a non-deploy gate; actual staging needs a separate release decision.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-staging-runbook-20260629T081717Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-staging-runbook-20260629T081717Z.md
