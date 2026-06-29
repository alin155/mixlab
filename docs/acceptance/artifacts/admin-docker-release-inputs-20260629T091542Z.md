# Admin Docker Release Inputs

Generated: 2026-06-29T09:15:42.050Z
Mode: admin-docker-release-inputs
Result: ready-for-release-decision
Release inputs ready: yes
Push execution allowed: no
Docker deploy allowed: no
Release decision required: yes

## Sources

- Pre-staging handoff: docs/acceptance/artifacts/admin-docker-prestaging-handoff-20260629T091502Z.json
- Candidate ref proof: docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260629T091350Z.json
- NAS image proof: docs/acceptance/artifacts/admin-docker-nas-image-proof-20260629T080002Z.json
- Legacy rollback plan: <not provided>
- Legacy rollback exception review: <not provided>

## Workflow Inputs

- target_image_tag: be81398b3ade1b591122ee36a0a9566a889b1b2a
- current_image_tag: 9c015b9105e97954240020781f79daae3f954bde
- rollback_image_tag: 9c015b9105e97954240020781f79daae3f954bde
- branch: admin-docker-candidate-be81398b3ade1b591122ee36a0a9566a889b1b2a
- workflow_ref: admin-docker-candidate-be81398b3ade1b591122ee36a0a9566a889b1b2a
- release_ref_setup_command: git tag admin-docker-candidate-be81398b3ade1b591122ee36a0a9566a889b1b2a be81398b3ade1b591122ee36a0a9566a889b1b2a && git push origin refs/tags/admin-docker-candidate-be81398b3ade1b591122ee36a0a9566a889b1b2a:refs/tags/admin-docker-candidate-be81398b3ade1b591122ee36a0a9566a889b1b2a
- command: gh workflow run docker-admin.yml --repo alin155/mixlab --ref admin-docker-candidate-be81398b3ade1b591122ee36a0a9566a889b1b2a -f push_images=true -f current_image_tag=9c015b9105e97954240020781f79daae3f954bde -f rollback_image_tag=9c015b9105e97954240020781f79daae3f954bde

## Gates

| Gate | Category | Status | Blocks Inputs | Blocks Push | Blocks Deploy | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
release-inputs-no-side-effects | safety | pass | no | no | no | This report reads prestaging handoff, candidate-ref proof, and NAS image proof JSON only; it does not contact NAS, Docker, GitHub, Admin API, or Cutter.
prestaging-handoff-provided | handoff | pass | no | yes | yes | docs/acceptance/artifacts/admin-docker-prestaging-handoff-20260629T091502Z.json
candidate-ref-proof-provided | candidate-ref | pass | no | yes | yes | docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260629T091350Z.json
nas-image-proof-provided | image-proof | pass | no | yes | yes | docs/acceptance/artifacts/admin-docker-nas-image-proof-20260629T080002Z.json
handoff-ready-to-request-release-inputs | handoff | pass | no | yes | yes | ready_to_request_release_inputs=true
handoff-does-not-approve-staging-or-deploy | safety | pass | yes | yes | yes | staging_execution_ready=false, docker_deploy_allowed=false
candidate-ref-proof-accepted | candidate-ref | pass | no | yes | yes | candidate_ref_proof_accepted=true
candidate-ref-proof-does-not-approve-deploy | safety | pass | yes | yes | yes | candidate_ref_proof.docker_deploy_allowed=false
candidate-ref-target-matches-handoff | candidate-ref | pass | no | yes | yes | candidate_ref.expected_sha=be81398b3ade1b591122ee36a0a9566a889b1b2a, handoff.target=be81398b3ade1b591122ee36a0a9566a889b1b2a
candidate-ref-tag-matches-workflow-ref | candidate-ref | pass | no | yes | yes | candidate_ref.expected_tag=admin-docker-candidate-be81398b3ade1b591122ee36a0a9566a889b1b2a, workflow_ref=admin-docker-candidate-be81398b3ade1b591122ee36a0a9566a889b1b2a
handoff-staging-blockers-carried-forward | handoff | blocked | no | no | yes | staging blockers=legacy-live-target-not-mistaken-for-staged-candidate, explicit-push-approval-required, current-and-rollback-tags-required
legacy-rollback-plan-provided | legacy-rollback | pass | no | no | yes | not required
legacy-rollback-exception-ready | legacy-rollback | pass | no | no | yes | not required
legacy-rollback-plan-does-not-approve-release-or-deploy | safety | pass | yes | yes | yes | not provided
legacy-rollback-exception-review-accepted | legacy-rollback | pass | no | no | yes | not provided
legacy-rollback-exception-review-does-not-approve-release-or-deploy | safety | pass | yes | yes | yes | not provided
legacy-rollback-exception-approved | release-decision | pass | no | no | yes | not required
nas-image-proof-accepted | image-proof | pass | no | yes | yes | proof_accepted=true
nas-proof-does-not-approve-deploy | safety | pass | yes | yes | yes | nas_image_proof.docker_deploy_allowed=false
target-image-tag-present | release-input | pass | no | yes | yes | target_image_tag=be81398b3ade1b591122ee36a0a9566a889b1b2a
workflow-ref-pins-target-image | release-input | pass | no | yes | yes | workflow_ref=admin-docker-candidate-be81398b3ade1b591122ee36a0a9566a889b1b2a, target=be81398b3ade1b591122ee36a0a9566a889b1b2a
release-ref-setup-command-ready | release-input | pass | no | yes | yes | git tag admin-docker-candidate-be81398b3ade1b591122ee36a0a9566a889b1b2a be81398b3ade1b591122ee36a0a9566a889b1b2a && git push origin refs/tags/admin-docker-candidate-be81398b3ade1b591122ee36a0a9566a889b1b2a:refs/tags/admin-docker-candidate-be81398b3ade1b591122ee36a0a9566a889b1b2a
current-and-rollback-tags-present | release-input | pass | no | yes | yes | current=9c015b9105e97954240020781f79daae3f954bde, rollback=9c015b9105e97954240020781f79daae3f954bde
rollback-tag-matches-current | release-input | pass | no | yes | yes | current=9c015b9105e97954240020781f79daae3f954bde, rollback=9c015b9105e97954240020781f79daae3f954bde
target-tag-differs-from-current | release-input | pass | no | yes | yes | target=be81398b3ade1b591122ee36a0a9566a889b1b2a, current=9c015b9105e97954240020781f79daae3f954bde
workflow-command-has-no-placeholders | release-input | pass | no | yes | yes | gh workflow run docker-admin.yml --repo alin155/mixlab --ref admin-docker-candidate-be81398b3ade1b591122ee36a0a9566a889b1b2a -f push_images=true -f current_image_tag=9c015b9105e97954240020781f79daae3f954bde -f rollback_image_tag=9c015b9105e97954240020781f79daae3f954bde
explicit-release-approval-required | release-decision | blocked | no | yes | yes | This report prepares release inputs only; it is not approval to run push_images=true.

## Summary

- Release input blockers: none
- Push execution blockers: explicit-release-approval-required
- Docker deploy blockers: handoff-staging-blockers-carried-forward, explicit-release-approval-required
- Handoff staging execution blockers: legacy-live-target-not-mistaken-for-staged-candidate, explicit-push-approval-required, current-and-rollback-tags-required
- Candidate ref blockers: none
- Legacy rollback exception: ready=false, accepted=false, review_accepted=null, review_role=none, blockers=none

## Next Actions

- Review this report and the NAS image proof report before any release decision.
- Before staging execution, clear handoff staging blockers: legacy-live-target-not-mistaken-for-staged-candidate, explicit-push-approval-required, current-and-rollback-tags-required.
- Before running push_images=true, create or verify the candidate release ref: git tag admin-docker-candidate-be81398b3ade1b591122ee36a0a9566a889b1b2a be81398b3ade1b591122ee36a0a9566a889b1b2a && git push origin refs/tags/admin-docker-candidate-be81398b3ade1b591122ee36a0a9566a889b1b2a:refs/tags/admin-docker-candidate-be81398b3ade1b591122ee36a0a9566a889b1b2a
- After explicit release approval only, run: gh workflow run docker-admin.yml --repo alin155/mixlab --ref admin-docker-candidate-be81398b3ade1b591122ee36a0a9566a889b1b2a -f push_images=true -f current_image_tag=9c015b9105e97954240020781f79daae3f954bde -f rollback_image_tag=9c015b9105e97954240020781f79daae3f954bde
- Do not edit NAS .env, restart NAS containers, or enable workers until the pushed-image workflow succeeds and staging proof is collected.
- After the push workflow succeeds, regenerate GitHub run artifact, staging runbook, live-readonly, admin-worker env proof, and Cutter compatibility proof.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-release-inputs-20260629T091542Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-release-inputs-20260629T091542Z.md
