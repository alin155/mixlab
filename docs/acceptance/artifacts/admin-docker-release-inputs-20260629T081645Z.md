# Admin Docker Release Inputs

Generated: 2026-06-29T08:16:45.535Z
Mode: admin-docker-release-inputs
Result: blocked
Release inputs ready: no
Push execution allowed: no
Docker deploy allowed: no
Release decision required: yes

## Sources

- Pre-staging handoff: docs/acceptance/artifacts/admin-docker-prestaging-handoff-20260629T034627Z.json
- Candidate ref proof: docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260629T034610Z.json
- NAS image proof: docs/acceptance/artifacts/admin-docker-nas-image-proof-20260629T080002Z.json
- Legacy rollback plan: <not provided>
- Legacy rollback exception review: docs/acceptance/artifacts/admin-docker-legacy-rollback-exception-review-20260629T034655Z.json

## Workflow Inputs

- target_image_tag: <blocked>
- current_image_tag: <blocked>
- rollback_image_tag: <blocked>
- branch: admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde
- workflow_ref: <blocked>
- release_ref_setup_command: <blocked>
- command: <blocked>

## Gates

| Gate | Category | Status | Blocks Inputs | Blocks Push | Blocks Deploy | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
release-inputs-no-side-effects | safety | pass | no | no | no | This report reads prestaging handoff, candidate-ref proof, and NAS image proof JSON only; it does not contact NAS, Docker, GitHub, Admin API, or Cutter.
prestaging-handoff-provided | handoff | pass | no | yes | yes | docs/acceptance/artifacts/admin-docker-prestaging-handoff-20260629T034627Z.json
candidate-ref-proof-provided | candidate-ref | pass | no | yes | yes | docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260629T034610Z.json
nas-image-proof-provided | image-proof | pass | no | yes | yes | docs/acceptance/artifacts/admin-docker-nas-image-proof-20260629T080002Z.json
handoff-ready-to-request-release-inputs | handoff | pass | no | yes | yes | ready_to_request_release_inputs=true
handoff-does-not-approve-staging-or-deploy | safety | pass | yes | yes | yes | staging_execution_ready=false, docker_deploy_allowed=false
candidate-ref-proof-accepted | candidate-ref | pass | no | yes | yes | candidate_ref_proof_accepted=true
candidate-ref-proof-does-not-approve-deploy | safety | pass | yes | yes | yes | candidate_ref_proof.docker_deploy_allowed=false
candidate-ref-target-matches-handoff | candidate-ref | pass | no | yes | yes | candidate_ref.expected_sha=9c015b9105e97954240020781f79daae3f954bde, handoff.target=9c015b9105e97954240020781f79daae3f954bde
candidate-ref-tag-matches-workflow-ref | candidate-ref | pass | no | yes | yes | candidate_ref.expected_tag=admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde, workflow_ref=admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde
handoff-staging-blockers-carried-forward | handoff | blocked | no | no | yes | staging blockers=nas-disk-risk-carried-forward, explicit-push-approval-required, current-and-rollback-tags-required
legacy-rollback-plan-provided | legacy-rollback | pass | no | no | yes | not required
legacy-rollback-exception-ready | legacy-rollback | pass | no | no | yes | not required
legacy-rollback-plan-does-not-approve-release-or-deploy | safety | pass | yes | yes | yes | not provided
legacy-rollback-exception-review-accepted | legacy-rollback | pass | no | no | yes | accepted=true, role=release-manager, current=latest, target=9c015b9105e97954240020781f79daae3f954bde, blockers=none
legacy-rollback-exception-review-does-not-approve-release-or-deploy | safety | pass | yes | yes | yes | release_execution_allowed=false, docker_deploy_allowed=false
legacy-rollback-exception-approved | release-decision | pass | no | no | yes | not required
nas-image-proof-accepted | image-proof | pass | no | yes | yes | proof_accepted=true
nas-proof-does-not-approve-deploy | safety | pass | yes | yes | yes | nas_image_proof.docker_deploy_allowed=false
target-image-tag-present | release-input | pass | no | yes | yes | target_image_tag=9c015b9105e97954240020781f79daae3f954bde
workflow-ref-pins-target-image | release-input | pass | no | yes | yes | workflow_ref=admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde, target=9c015b9105e97954240020781f79daae3f954bde
release-ref-setup-command-ready | release-input | pass | no | yes | yes | git tag admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde 9c015b9105e97954240020781f79daae3f954bde && git push origin refs/tags/admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde:refs/tags/admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde
current-and-rollback-tags-present | release-input | pass | no | yes | yes | current=9c015b9105e97954240020781f79daae3f954bde, rollback=9c015b9105e97954240020781f79daae3f954bde
rollback-tag-matches-current | release-input | pass | no | yes | yes | current=9c015b9105e97954240020781f79daae3f954bde, rollback=9c015b9105e97954240020781f79daae3f954bde
target-tag-differs-from-current | release-input | blocked | yes | yes | yes | target=9c015b9105e97954240020781f79daae3f954bde, current=9c015b9105e97954240020781f79daae3f954bde
workflow-command-has-no-placeholders | release-input | pass | no | yes | yes | gh workflow run docker-admin.yml --repo alin155/mixlab --ref admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde -f push_images=true -f current_image_tag=9c015b9105e97954240020781f79daae3f954bde -f rollback_image_tag=9c015b9105e97954240020781f79daae3f954bde
explicit-release-approval-required | release-decision | blocked | no | yes | yes | This report prepares release inputs only; it is not approval to run push_images=true.

## Summary

- Release input blockers: target-tag-differs-from-current
- Push execution blockers: target-tag-differs-from-current, explicit-release-approval-required
- Docker deploy blockers: handoff-staging-blockers-carried-forward, target-tag-differs-from-current, explicit-release-approval-required
- Handoff staging execution blockers: nas-disk-risk-carried-forward, explicit-push-approval-required, current-and-rollback-tags-required
- Candidate ref blockers: none
- Legacy rollback exception: ready=false, accepted=true, review_accepted=true, review_role=release-manager, blockers=none

## Next Actions

- Keep push_images=false until release inputs are ready.
- Resolve release input blockers: target-tag-differs-from-current.
- Preserved pre-staging execution blockers: nas-disk-risk-carried-forward, explicit-push-approval-required, current-and-rollback-tags-required.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-release-inputs-20260629T081645Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-release-inputs-20260629T081645Z.md
