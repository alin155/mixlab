# Admin Docker Staging/Update Runbook

Generated: 2026-06-27T19:48:00.726Z

Mode: admin-docker-staging-runbook

Result: blocked

Staging review ready: no

Docker deploy allowed: no

This report does not run Docker, push images, restart containers, write NAS files, enable workers, repair usage-events, recover jobs, publish indexes, or change Cutter protocols.

## Sources

- Local Docker smoke: docs/acceptance/artifacts/admin-docker-local-smoke-20260627T194719Z.json
- Parity plan: docs/acceptance/artifacts/admin-docker-version-parity-plan-20260627T194743Z.json
- Candidate contract proof: docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T194726Z.json
- Worker env proof: docs/acceptance/artifacts/admin-worker-env-proof-20260627T194749Z.json
- Cutter compatibility proof: docs/acceptance/artifacts/admin-cutter-compatibility-proof-20260627T194754Z.json

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
- Target tag matches local smoke: no
- Parity status: blocked
- Docker image update required: true
- Parity blockers: live-artifact-targeted, admin-web-root-observed, admin-api-proxy-observed, current-admin-api-contract-parity, version-health-parity-contract, admin-worker-env-proof-contract, cutter-compatibility-proof-contract, docker-library-root-parity, admin-worker-env-external-proof, cutter-compatibility-external-proof
- Unresolved parity blockers: live-artifact-targeted, admin-web-root-observed, admin-api-proxy-observed, current-admin-api-contract-parity, version-health-parity-contract, admin-worker-env-proof-contract, cutter-compatibility-proof-contract, docker-library-root-parity, admin-worker-env-external-proof, cutter-compatibility-external-proof
- Resolved external parity blockers: none
- Candidate contract status: blocked
- Candidate contract ready: false
- Candidate contract blockers: candidate-target-configured, candidate-target-shape, candidate-api-target-shape, candidate-admin-web-root, candidate-current-admin-api-contract, candidate-version-health-contract, candidate-disk-protection-contract, candidate-usage-events-repair-contract, candidate-processing-recovery-contract, candidate-admin-worker-env-proof-contract, candidate-cutter-compatibility-proof-contract
- Worker env status: blocked
- Worker proof accepted: false
- Worker blockers: env-file-provided, inspect-json-provided, env-file-worker-flags-disabled, inspect-worker-flags-disabled, admin-worker-library-roots, admin-worker-image-observed
- Cutter compatibility status: blocked
- Cutter proof accepted: false
- Cutter blockers: windows-acceptance-report-provided, windows-acceptance-passed, reviewed-auth-mode, public-library-ready-count, public-library-first-page-readable, search-protocol-readable, transcript-detail-readable, real-cut-report-provided, real-cut-smoke-passed, real-cut-output-produced, real-cut-core-phases-done

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

| Gate | Category | Status | Blocks Staging | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- |
runbook-no-side-effects | safety | pass | no | This report reads archived artifacts and env inputs only; it does not run Docker, push images, restart containers, or write NAS files. | n/a
current-image-tag-provided | input | blocked | yes | MIXLAB_DOCKER_CURRENT_IMAGE_TAG is not provided. | Set MIXLAB_DOCKER_CURRENT_IMAGE_TAG before producing a staging runbook.
target-image-tag-provided | input | blocked | yes | MIXLAB_DOCKER_TARGET_IMAGE_TAG is not provided. | Set MIXLAB_DOCKER_TARGET_IMAGE_TAG before producing a staging runbook.
rollback-image-tag-provided | input | blocked | yes | MIXLAB_DOCKER_ROLLBACK_IMAGE_TAG is not provided. | Set MIXLAB_DOCKER_ROLLBACK_IMAGE_TAG before producing a staging runbook.
target-differs-from-current | input | blocked | yes | current=missing, target=missing | Target tag must differ from current tag so the staging action is explicit.
rollback-tag-matches-current | rollback | blocked | yes | current=missing, rollback=missing | Rollback tag must match the current deployed tag before staging.
image-push-explicitly-approved | input | blocked | yes | MIXLAB_DOCKER_PUSH_APPROVAL is not provided. | Set MIXLAB_DOCKER_PUSH_APPROVAL=workflow_dispatch:push_images=true only after the GitHub Admin Docker workflow was manually dispatched with push_images=true and its smoke gate passed.
local-docker-smoke-passed | evidence | blocked | yes | local smoke blockers: explicit-run-requested, docker-cli-available, docker-compose-available | Run validate:admin-docker-local-smoke with MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_RUN=1 and require local_smoke_passed:true before staging.
target-tag-matches-smoked-image | input | blocked | yes | target=missing, smoked_image_tag=local-admin-docker-mvp-v0.1 | Set MIXLAB_DOCKER_TARGET_IMAGE_TAG to the exact build_identity.image_tag from the accepted local Docker smoke report.
parity-report-present | evidence | pass | no | docs/acceptance/artifacts/admin-docker-version-parity-plan-20260627T194743Z.json | Provide the Docker version/API parity plan artifact.
parity-report-blockers-clear | evidence | blocked | yes | Unresolved parity blockers: live-artifact-targeted, admin-web-root-observed, admin-api-proxy-observed, current-admin-api-contract-parity, version-health-parity-contract, admin-worker-env-proof-contract, cutter-compatibility-proof-contract, docker-library-root-parity, admin-worker-env-external-proof, cutter-compatibility-external-proof; resolved external blockers: none | Resolve current API contract parity and disk blockers, and provide accepted worker/Cutter external proof for their external-proof blockers.
candidate-contract-proof-accepted | evidence | blocked | yes | candidate proof status=blocked, blockers=candidate-target-configured, candidate-target-shape, candidate-api-target-shape, candidate-admin-web-root, candidate-current-admin-api-contract, candidate-version-health-contract, candidate-disk-protection-contract, candidate-usage-events-repair-contract, candidate-processing-recovery-contract, candidate-admin-worker-env-proof-contract, candidate-cutter-compatibility-proof-contract | Run validate:admin-docker-candidate-contract-proof against the local or staged candidate and require candidate_contract_ready:true.
worker-env-proof-accepted | evidence | blocked | yes | worker proof status=blocked, blockers=env-file-provided, inspect-json-provided, env-file-worker-flags-disabled, inspect-worker-flags-disabled, admin-worker-library-roots, admin-worker-image-observed | Run validate:admin-worker-env-proof with exported NAS evidence and require proof_accepted:true.
cutter-compatibility-proof-accepted | evidence | blocked | yes | cutter proof status=blocked, blockers=windows-acceptance-report-provided, windows-acceptance-passed, reviewed-auth-mode, public-library-ready-count, public-library-first-page-readable, search-protocol-readable, transcript-detail-readable, real-cut-report-provided, real-cut-smoke-passed, real-cut-output-produced, real-cut-core-phases-done | Run validate:admin-cutter-compatibility-proof with staged-candidate Windows reports and require proof_accepted:true.
current-api-update-needed-is-known | runtime-risk | pass | no | docker_image_update_required=true | Run Docker version/API parity plan before staging.
parity-result-remains-nondeploy | safety | pass | no | parity_result=blocked | The parity plan should remain a non-deploy gate; actual staging needs a separate release decision.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-staging-runbook-20260627T194800Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-staging-runbook-20260627T194800Z.md
