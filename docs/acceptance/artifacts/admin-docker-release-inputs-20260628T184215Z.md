# Admin Docker Release Inputs

Generated: 2026-06-28T18:42:15.971Z
Mode: admin-docker-release-inputs
Result: blocked
Release inputs ready: no
Push execution allowed: no
Docker deploy allowed: no
Release decision required: yes

## Sources

- Pre-staging handoff: docs/acceptance/artifacts/admin-docker-prestaging-handoff-20260628T184208Z.json
- Candidate ref proof: docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260628T184119Z.json
- NAS image proof: <missing>

## Workflow Inputs

- target_image_tag: <blocked>
- current_image_tag: <blocked>
- rollback_image_tag: <blocked>
- branch: admin-docker-candidate-97f2d513a4a27315929b4d964320d4170b4b4631
- workflow_ref: <blocked>
- release_ref_setup_command: <blocked>
- command: <blocked>

## Gates

| Gate | Category | Status | Blocks Inputs | Blocks Push | Blocks Deploy | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
release-inputs-no-side-effects | safety | pass | no | no | no | This report reads prestaging handoff, candidate-ref proof, and NAS image proof JSON only; it does not contact NAS, Docker, GitHub, Admin API, or Cutter.
prestaging-handoff-provided | handoff | pass | no | yes | yes | docs/acceptance/artifacts/admin-docker-prestaging-handoff-20260628T184208Z.json
candidate-ref-proof-provided | candidate-ref | pass | no | yes | yes | docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260628T184119Z.json
nas-image-proof-provided | image-proof | blocked | yes | yes | yes | No MIXLAB_ADMIN_DOCKER_NAS_IMAGE_PROOF_REPORT path provided.
handoff-ready-to-request-release-inputs | handoff | pass | no | yes | yes | ready_to_request_release_inputs=true
handoff-does-not-approve-staging-or-deploy | safety | pass | yes | yes | yes | staging_execution_ready=false, docker_deploy_allowed=false
candidate-ref-proof-accepted | candidate-ref | pass | no | yes | yes | candidate_ref_proof_accepted=true
candidate-ref-proof-does-not-approve-deploy | safety | pass | yes | yes | yes | candidate_ref_proof.docker_deploy_allowed=false
candidate-ref-target-matches-handoff | candidate-ref | pass | no | yes | yes | candidate_ref.expected_sha=97f2d513a4a27315929b4d964320d4170b4b4631, handoff.target=97f2d513a4a27315929b4d964320d4170b4b4631
candidate-ref-tag-matches-workflow-ref | candidate-ref | pass | no | yes | yes | candidate_ref.expected_tag=admin-docker-candidate-97f2d513a4a27315929b4d964320d4170b4b4631, workflow_ref=admin-docker-candidate-97f2d513a4a27315929b4d964320d4170b4b4631
handoff-staging-blockers-carried-forward | handoff | blocked | no | no | yes | staging blockers=nas-disk-risk-carried-forward, explicit-push-approval-required, current-and-rollback-tags-required, staged-live-readonly-required, admin-worker-env-proof-required, cutter-compatibility-proof-required
nas-image-proof-accepted | image-proof | blocked | yes | yes | yes | proof blockers=unknown
nas-proof-does-not-approve-deploy | safety | blocked | yes | yes | yes | nas_image_proof.docker_deploy_allowed=null
target-image-tag-present | release-input | pass | no | yes | yes | target_image_tag=97f2d513a4a27315929b4d964320d4170b4b4631
workflow-ref-pins-target-image | release-input | pass | no | yes | yes | workflow_ref=admin-docker-candidate-97f2d513a4a27315929b4d964320d4170b4b4631, target=97f2d513a4a27315929b4d964320d4170b4b4631
release-ref-setup-command-ready | release-input | pass | no | yes | yes | git tag admin-docker-candidate-97f2d513a4a27315929b4d964320d4170b4b4631 97f2d513a4a27315929b4d964320d4170b4b4631 && git push origin refs/tags/admin-docker-candidate-97f2d513a4a27315929b4d964320d4170b4b4631:refs/tags/admin-docker-candidate-97f2d513a4a27315929b4d964320d4170b4b4631
current-and-rollback-tags-present | release-input | blocked | yes | yes | yes | current=missing, rollback=missing
rollback-tag-matches-current | release-input | blocked | yes | yes | yes | current=missing, rollback=missing
target-tag-differs-from-current | release-input | blocked | yes | yes | yes | target=97f2d513a4a27315929b4d964320d4170b4b4631, current=missing
workflow-command-has-no-placeholders | release-input | blocked | yes | yes | yes | Workflow command still contains placeholders.
explicit-release-approval-required | release-decision | blocked | no | yes | yes | This report prepares release inputs only; it is not approval to run push_images=true.

## Summary

- Release input blockers: nas-image-proof-provided, nas-image-proof-accepted, nas-proof-does-not-approve-deploy, current-and-rollback-tags-present, rollback-tag-matches-current, target-tag-differs-from-current, workflow-command-has-no-placeholders
- Push execution blockers: nas-image-proof-provided, nas-image-proof-accepted, nas-proof-does-not-approve-deploy, current-and-rollback-tags-present, rollback-tag-matches-current, target-tag-differs-from-current, workflow-command-has-no-placeholders, explicit-release-approval-required
- Docker deploy blockers: nas-image-proof-provided, handoff-staging-blockers-carried-forward, nas-image-proof-accepted, nas-proof-does-not-approve-deploy, current-and-rollback-tags-present, rollback-tag-matches-current, target-tag-differs-from-current, workflow-command-has-no-placeholders, explicit-release-approval-required
- Handoff staging execution blockers: nas-disk-risk-carried-forward, explicit-push-approval-required, current-and-rollback-tags-required, staged-live-readonly-required, admin-worker-env-proof-required, cutter-compatibility-proof-required
- Candidate ref blockers: none

## Next Actions

- Keep push_images=false until release inputs are ready.
- Run validate:admin-docker-nas-image-proof with a sanitized NAS MIXLAB_IMAGE_TAG evidence file and docker inspect evidence.
- Resolve release input blockers: nas-image-proof-provided, nas-image-proof-accepted, nas-proof-does-not-approve-deploy, current-and-rollback-tags-present, rollback-tag-matches-current, target-tag-differs-from-current, workflow-command-has-no-placeholders.
- Preserved pre-staging execution blockers: nas-disk-risk-carried-forward, explicit-push-approval-required, current-and-rollback-tags-required, staged-live-readonly-required, admin-worker-env-proof-required, cutter-compatibility-proof-required.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-release-inputs-20260628T184215Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-release-inputs-20260628T184215Z.md
