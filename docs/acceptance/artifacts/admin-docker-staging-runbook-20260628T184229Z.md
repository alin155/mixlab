# Admin Docker Staging/Update Runbook

Generated: 2026-06-28T18:42:29.629Z

Mode: admin-docker-staging-runbook

Result: blocked

Staging execution ready: no

Staging review ready: no

Docker deploy allowed: no

This report does not run Docker, push images, restart containers, write NAS files, enable workers, repair usage-events, recover jobs, publish indexes, or change Cutter protocols.

## Sources

- Local Docker smoke: docs/acceptance/artifacts/admin-docker-local-smoke-20260627T194719Z.json
- GitHub artifact readiness: docs/acceptance/artifacts/admin-docker-github-artifact-readiness-20260628T184114Z.json
- Parity plan: docs/acceptance/artifacts/admin-docker-version-parity-plan-20260628T182253Z.json
- Candidate contract proof: docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T195510Z.json
- Worker env proof: docs/acceptance/artifacts/admin-worker-env-proof-20260627T194749Z.json
- Cutter compatibility proof: docs/acceptance/artifacts/admin-cutter-compatibility-proof-20260627T194754Z.json
- Release inputs: docs/acceptance/artifacts/admin-docker-release-inputs-20260628T184215Z.json
- NAS disk proof: not provided

## Image Tags

- Current: missing
- Target: missing
- Rollback: missing
- Image push approval: missing/blocked (missing)

## Observations

- Local smoke status: blocked
- Local smoke passed: false
- Local smoke blockers: explicit-run-requested, docker-cli-available, docker-compose-available
- Smoked image tag: local-admin-docker-mvp-v0.1
- GitHub candidate artifact ready: true
- GitHub candidate contract ready: true
- GitHub staging handoff ready: false
- GitHub candidate image tag: 97f2d513a4a27315929b4d964320d4170b4b4631
- GitHub candidate build sha: 97f2d513a4a27315929b4d964320d4170b4b4631
- Target tag matches smoked image: no
- Parity status: blocked
- Docker image update required: true
- Parity blockers: current-admin-api-contract-parity, version-health-parity-contract, admin-worker-env-proof-contract, cutter-compatibility-proof-contract, nas-disk-risk, admin-worker-env-external-proof, cutter-compatibility-external-proof
- Staging execution parity blockers: nas-disk-risk
- Unresolved parity blockers: current-admin-api-contract-parity, version-health-parity-contract, admin-worker-env-proof-contract, cutter-compatibility-proof-contract, nas-disk-risk, admin-worker-env-external-proof, cutter-compatibility-external-proof
- Resolved external parity blockers: none
- Candidate contract status: blocked
- Candidate contract ready: false
- Candidate contract blockers: candidate-proof-source-accepted, candidate-admin-web-root, candidate-current-admin-api-contract, candidate-version-health-contract, candidate-disk-protection-contract, candidate-usage-events-repair-contract, candidate-processing-recovery-contract, candidate-admin-worker-env-proof-contract, candidate-cutter-compatibility-proof-contract
- Worker env status: blocked
- Worker proof accepted: false
- Worker blockers: env-file-provided, inspect-json-provided, env-file-worker-flags-disabled, inspect-worker-flags-disabled, admin-worker-library-roots, admin-worker-image-observed
- Cutter compatibility status: blocked
- Cutter proof accepted: false
- Cutter blockers: windows-acceptance-report-provided, windows-acceptance-passed, reviewed-auth-mode, public-library-ready-count, public-library-first-page-readable, search-protocol-readable, transcript-detail-readable, real-cut-report-provided, real-cut-smoke-passed, real-cut-output-produced, real-cut-core-phases-done
- Release inputs status: blocked
- Release inputs ready: false
- Release input blockers: nas-image-proof-provided, nas-image-proof-accepted, nas-proof-does-not-approve-deploy, current-and-rollback-tags-present, rollback-tag-matches-current, target-tag-differs-from-current, workflow-command-has-no-placeholders
- Release input handoff staging blockers: nas-disk-risk-carried-forward, explicit-push-approval-required, current-and-rollback-tags-required, staged-live-readonly-required, admin-worker-env-proof-required, cutter-compatibility-proof-required
- NAS disk proof status: not provided
- NAS disk proof accepted: unknown
- NAS disk proof blockers: none
- Cleared pre-staging execution blockers: none
- Carried pre-staging execution blockers: nas-disk-risk-carried-forward

## Preflight

- Confirm a current backup exists for admin-users, cutter-users, usage-events, current index, and .mixlab-library admin state.
- Confirm candidate API/version contract proof is accepted for the target image before staging.
- Confirm NAS disk gate is not blocked and RAID/storage warnings are resolved or explicitly accepted by the release gate.
- Confirm admin-worker env proof is accepted with standalone workers disabled.
- Confirm Windows Cutter compatibility smoke is ready to run after staging.

## Stage Update

- Set MIXLAB_IMAGE_TAG=<target-tag> in the NAS Docker .env staging copy.
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

- Set MIXLAB_IMAGE_TAG=<rollback-tag> in the NAS Docker .env rollback copy.
- Run docker compose up -d admin-api admin-web admin-worker using the rollback tag.
- Re-run GET-only live-readonly probe and Cutter compatibility smoke after rollback.
- Do not run scan/apply, recovery, publish, or worker-enable commands as part of rollback unless separately approved.

## Gates

| Gate | Category | Status | Blocks Staging Execution | Blocks Final Review | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- |
runbook-no-side-effects | safety | pass | no | no | This report reads archived artifacts and env inputs only; it does not run Docker, push images, restart containers, or write NAS files. | n/a
current-image-tag-provided | input | blocked | yes | yes | MIXLAB_DOCKER_CURRENT_IMAGE_TAG is not provided. | Set MIXLAB_DOCKER_CURRENT_IMAGE_TAG before producing a staging runbook.
target-image-tag-provided | input | blocked | yes | yes | MIXLAB_DOCKER_TARGET_IMAGE_TAG is not provided. | Set MIXLAB_DOCKER_TARGET_IMAGE_TAG before producing a staging runbook.
rollback-image-tag-provided | input | blocked | yes | yes | MIXLAB_DOCKER_ROLLBACK_IMAGE_TAG is not provided. | Set MIXLAB_DOCKER_ROLLBACK_IMAGE_TAG before producing a staging runbook.
target-differs-from-current | input | blocked | yes | yes | current=missing, target=missing | Target tag must differ from current tag so the staging action is explicit.
rollback-tag-matches-current | rollback | blocked | yes | yes | current=missing, rollback=missing | Rollback tag must match the current deployed tag before staging.
image-push-explicitly-approved | input | blocked | yes | yes | MIXLAB_DOCKER_PUSH_APPROVAL is not provided. | Set MIXLAB_DOCKER_PUSH_APPROVAL=workflow_dispatch:push_images=true only after the GitHub Admin Docker workflow was manually dispatched with push_images=true and its smoke gate passed.
local-docker-smoke-passed | evidence | pass | no | no | local_smoke_passed=false, github_candidate_artifact_ready=true, image_tag=97f2d513a4a27315929b4d964320d4170b4b4631 | Run validate:admin-docker-local-smoke on a Docker-capable machine, or archive an Admin Docker GitHub artifact readiness report with github_candidate_artifact_ready=true before staging.
target-tag-matches-smoked-image | input | blocked | yes | yes | target=missing, smoked_image_tag=97f2d513a4a27315929b4d964320d4170b4b4631 | Set MIXLAB_DOCKER_TARGET_IMAGE_TAG to the exact image tag from the accepted local smoke or GitHub candidate artifact.
parity-report-present | evidence | pass | no | no | docs/acceptance/artifacts/admin-docker-version-parity-plan-20260628T182253Z.json | Provide the Docker version/API parity plan artifact.
release-inputs-ready-for-decision | evidence | blocked | yes | yes | release input blockers: nas-image-proof-provided, nas-image-proof-accepted, nas-proof-does-not-approve-deploy, current-and-rollback-tags-present, rollback-tag-matches-current, target-tag-differs-from-current, workflow-command-has-no-placeholders | Provide an accepted admin-docker-release-inputs report before using it to constrain staging.
nas-disk-proof-accepted | runtime-risk | blocked | yes | yes | disk proof status=missing, blockers=none | Run validate:admin-docker-nas-disk-proof with sanitized NAS df evidence and require proof_accepted:true.
pre-staging-execution-blockers-carried-forward | runtime-risk | blocked | yes | yes | carried pre-staging execution blockers=nas-disk-risk-carried-forward | Clear or explicitly re-prove NAS disk safety before staging execution.
parity-report-staging-execution-safe | runtime-risk | blocked | yes | no | Pre-update parity blockers still prevent staging execution: nas-disk-risk. | Before staging execution, live target/proxy/root/disk blockers must be clear. Current API and proof-contract blockers may remain only when docker_image_update_required=true because staging is the update that should resolve them.
parity-report-blockers-clear | evidence | blocked | no | yes | Unresolved parity blockers: current-admin-api-contract-parity, version-health-parity-contract, admin-worker-env-proof-contract, cutter-compatibility-proof-contract, nas-disk-risk, admin-worker-env-external-proof, cutter-compatibility-external-proof; resolved external blockers: none | Resolve current API contract parity and disk blockers, and provide accepted worker/Cutter external proof for their external-proof blockers.
candidate-contract-proof-accepted | evidence | pass | no | no | candidate_contract_ready=false, github_candidate_artifact_ready=true, github_candidate_contract_ready=true | Run validate:admin-docker-candidate-contract-proof against the local or staged candidate, or archive an Admin Docker GitHub artifact readiness report with github_candidate_artifact_ready=true.
worker-env-proof-accepted | evidence | blocked | no | yes | worker proof status=blocked, blockers=env-file-provided, inspect-json-provided, env-file-worker-flags-disabled, inspect-worker-flags-disabled, admin-worker-library-roots, admin-worker-image-observed | Run validate:admin-worker-env-proof with exported NAS evidence after staging and require proof_accepted:true before final MVP acceptance.
cutter-compatibility-proof-accepted | evidence | blocked | no | yes | cutter proof status=blocked, blockers=windows-acceptance-report-provided, windows-acceptance-passed, reviewed-auth-mode, public-library-ready-count, public-library-first-page-readable, search-protocol-readable, transcript-detail-readable, real-cut-report-provided, real-cut-smoke-passed, real-cut-output-produced, real-cut-core-phases-done | Run validate:admin-cutter-compatibility-proof with staged-candidate Windows reports and require proof_accepted:true before final MVP acceptance.
current-api-update-needed-is-known | runtime-risk | pass | no | no | docker_image_update_required=true | Run Docker version/API parity plan before staging.
parity-result-remains-nondeploy | safety | pass | no | no | parity_result=blocked | The parity plan should remain a non-deploy gate; actual staging needs a separate release decision.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-staging-runbook-20260628T184229Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-staging-runbook-20260628T184229Z.md

