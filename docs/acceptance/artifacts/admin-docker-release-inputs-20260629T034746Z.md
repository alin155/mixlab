# Admin Docker Release Inputs

Generated: 2026-06-29T03:47:46.444Z
Mode: admin-docker-release-inputs
Result: ready-for-release-decision
Release inputs ready: yes
Push execution allowed: no
Docker deploy allowed: no
Release decision required: yes

## Sources

- Pre-staging handoff: docs/acceptance/artifacts/admin-docker-prestaging-handoff-20260629T034627Z.json
- Candidate ref proof: docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260629T034610Z.json
- NAS image proof: docs/acceptance/artifacts/admin-docker-nas-image-proof-20260629T034746Z.json
- Legacy rollback plan: docs/acceptance/artifacts/admin-docker-legacy-rollback-plan-20260629T034654Z.json
- Legacy rollback exception review: docs/acceptance/artifacts/admin-docker-legacy-rollback-exception-review-20260629T034655Z.json

## Workflow Inputs

- target_image_tag: 9c015b9105e97954240020781f79daae3f954bde
- current_image_tag: latest
- rollback_image_tag: latest
- branch: admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde
- workflow_ref: admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde
- release_ref_setup_command: git tag admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde 9c015b9105e97954240020781f79daae3f954bde && git push origin refs/tags/admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde:refs/tags/admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde
- command: gh workflow run docker-admin.yml --repo alin155/mixlab --ref admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde -f push_images=true -f current_image_tag=latest -f rollback_image_tag=latest

## Gates

| Gate | Category | Status | Blocks Inputs | Blocks Push | Blocks Deploy | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
release-inputs-no-side-effects | safety | pass | no | no | no | This report reads prestaging handoff, candidate-ref proof, and NAS image proof JSON only; it does not contact NAS, Docker, GitHub, Admin API, or Cutter.
prestaging-handoff-provided | handoff | pass | no | yes | yes | docs/acceptance/artifacts/admin-docker-prestaging-handoff-20260629T034627Z.json
candidate-ref-proof-provided | candidate-ref | pass | no | yes | yes | docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260629T034610Z.json
nas-image-proof-provided | image-proof | pass | no | yes | yes | docs/acceptance/artifacts/admin-docker-nas-image-proof-20260629T034746Z.json
handoff-ready-to-request-release-inputs | handoff | pass | no | yes | yes | ready_to_request_release_inputs=true
handoff-does-not-approve-staging-or-deploy | safety | pass | yes | yes | yes | staging_execution_ready=false, docker_deploy_allowed=false
candidate-ref-proof-accepted | candidate-ref | pass | no | yes | yes | candidate_ref_proof_accepted=true
candidate-ref-proof-does-not-approve-deploy | safety | pass | yes | yes | yes | candidate_ref_proof.docker_deploy_allowed=false
candidate-ref-target-matches-handoff | candidate-ref | pass | no | yes | yes | candidate_ref.expected_sha=9c015b9105e97954240020781f79daae3f954bde, handoff.target=9c015b9105e97954240020781f79daae3f954bde
candidate-ref-tag-matches-workflow-ref | candidate-ref | pass | no | yes | yes | candidate_ref.expected_tag=admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde, workflow_ref=admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde
handoff-staging-blockers-carried-forward | handoff | blocked | no | no | yes | staging blockers=nas-disk-risk-carried-forward, explicit-push-approval-required, current-and-rollback-tags-required
legacy-rollback-plan-provided | legacy-rollback | pass | no | no | yes | docs/acceptance/artifacts/admin-docker-legacy-rollback-plan-20260629T034654Z.json
legacy-rollback-exception-ready | legacy-rollback | pass | no | no | yes | exception_plan_ready=true, current=latest, target=9c015b9105e97954240020781f79daae3f954bde, blockers=explicit-legacy-rollback-exception-approval
legacy-rollback-plan-does-not-approve-release-or-deploy | safety | pass | yes | yes | yes | release_execution_allowed=false, docker_deploy_allowed=false
legacy-rollback-exception-review-accepted | legacy-rollback | pass | no | no | yes | accepted=true, role=release-manager, current=latest, target=9c015b9105e97954240020781f79daae3f954bde, blockers=none
legacy-rollback-exception-review-does-not-approve-release-or-deploy | safety | pass | yes | yes | yes | release_execution_allowed=false, docker_deploy_allowed=false
legacy-rollback-exception-approved | release-decision | pass | no | no | yes | approval=accepted, review=accepted
nas-image-proof-accepted | image-proof | pass | no | yes | yes | proof blocked by legacy latest; exception_accepted=true
nas-proof-does-not-approve-deploy | safety | pass | yes | yes | yes | nas_image_proof.docker_deploy_allowed=false
target-image-tag-present | release-input | pass | no | yes | yes | target_image_tag=9c015b9105e97954240020781f79daae3f954bde
workflow-ref-pins-target-image | release-input | pass | no | yes | yes | workflow_ref=admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde, target=9c015b9105e97954240020781f79daae3f954bde
release-ref-setup-command-ready | release-input | pass | no | yes | yes | git tag admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde 9c015b9105e97954240020781f79daae3f954bde && git push origin refs/tags/admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde:refs/tags/admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde
current-and-rollback-tags-present | release-input | pass | no | yes | yes | current=latest, rollback=latest
rollback-tag-matches-current | release-input | pass | no | yes | yes | current=latest, rollback=latest
target-tag-differs-from-current | release-input | pass | no | yes | yes | target=9c015b9105e97954240020781f79daae3f954bde, current=latest
workflow-command-has-no-placeholders | release-input | pass | no | yes | yes | gh workflow run docker-admin.yml --repo alin155/mixlab --ref admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde -f push_images=true -f current_image_tag=latest -f rollback_image_tag=latest
explicit-release-approval-required | release-decision | blocked | no | yes | yes | This report prepares release inputs only; it is not approval to run push_images=true.

## Summary

- Release input blockers: none
- Push execution blockers: explicit-release-approval-required
- Docker deploy blockers: handoff-staging-blockers-carried-forward, explicit-release-approval-required
- Handoff staging execution blockers: nas-disk-risk-carried-forward, explicit-push-approval-required, current-and-rollback-tags-required
- Candidate ref blockers: none
- Legacy rollback exception: ready=true, accepted=true, review_accepted=true, review_role=release-manager, blockers=none

## Next Actions

- Review this report and the NAS image proof report before any release decision.
- Before staging execution, clear handoff staging blockers: nas-disk-risk-carried-forward, explicit-push-approval-required, current-and-rollback-tags-required.
- Before running push_images=true, create or verify the candidate release ref: git tag admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde 9c015b9105e97954240020781f79daae3f954bde && git push origin refs/tags/admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde:refs/tags/admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde
- After explicit release approval only, run: gh workflow run docker-admin.yml --repo alin155/mixlab --ref admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde -f push_images=true -f current_image_tag=latest -f rollback_image_tag=latest
- Do not edit NAS .env, restart NAS containers, or enable workers until the pushed-image workflow succeeds and staging proof is collected.
- After the push workflow succeeds, regenerate GitHub run artifact, staging runbook, live-readonly, admin-worker env proof, and Cutter compatibility proof.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-release-inputs-20260629T034746Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-release-inputs-20260629T034746Z.md
