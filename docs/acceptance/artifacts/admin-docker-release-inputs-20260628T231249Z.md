# Admin Docker Release Inputs

Generated: 2026-06-28T23:12:49.078Z
Mode: admin-docker-release-inputs
Result: blocked
Release inputs ready: no
Push execution allowed: no
Docker deploy allowed: no
Release decision required: yes

## Sources

- Pre-staging handoff: docs/acceptance/artifacts/admin-docker-prestaging-handoff-20260628T231236Z.json
- Candidate ref proof: docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260628T231223Z.json
- NAS image proof: docs/acceptance/artifacts/admin-docker-nas-image-proof-20260628T225559Z.json

## Workflow Inputs

- target_image_tag: <blocked>
- current_image_tag: <blocked>
- rollback_image_tag: <blocked>
- branch: admin-docker-candidate-4cb5b18262e49894d4272b0fc940be6c1d2102b4
- workflow_ref: <blocked>
- release_ref_setup_command: <blocked>
- command: <blocked>

## Gates

| Gate | Category | Status | Blocks Inputs | Blocks Push | Blocks Deploy | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
release-inputs-no-side-effects | safety | pass | no | no | no | This report reads prestaging handoff, candidate-ref proof, and NAS image proof JSON only; it does not contact NAS, Docker, GitHub, Admin API, or Cutter.
prestaging-handoff-provided | handoff | pass | no | yes | yes | docs/acceptance/artifacts/admin-docker-prestaging-handoff-20260628T231236Z.json
candidate-ref-proof-provided | candidate-ref | pass | no | yes | yes | docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260628T231223Z.json
nas-image-proof-provided | image-proof | pass | no | yes | yes | docs/acceptance/artifacts/admin-docker-nas-image-proof-20260628T225559Z.json
handoff-ready-to-request-release-inputs | handoff | pass | no | yes | yes | ready_to_request_release_inputs=true
handoff-does-not-approve-staging-or-deploy | safety | pass | yes | yes | yes | staging_execution_ready=false, docker_deploy_allowed=false
candidate-ref-proof-accepted | candidate-ref | pass | no | yes | yes | candidate_ref_proof_accepted=true
candidate-ref-proof-does-not-approve-deploy | safety | pass | yes | yes | yes | candidate_ref_proof.docker_deploy_allowed=false
candidate-ref-target-matches-handoff | candidate-ref | pass | no | yes | yes | candidate_ref.expected_sha=4cb5b18262e49894d4272b0fc940be6c1d2102b4, handoff.target=4cb5b18262e49894d4272b0fc940be6c1d2102b4
candidate-ref-tag-matches-workflow-ref | candidate-ref | pass | no | yes | yes | candidate_ref.expected_tag=admin-docker-candidate-4cb5b18262e49894d4272b0fc940be6c1d2102b4, workflow_ref=admin-docker-candidate-4cb5b18262e49894d4272b0fc940be6c1d2102b4
handoff-staging-blockers-carried-forward | handoff | blocked | no | no | yes | staging blockers=nas-disk-risk-carried-forward, explicit-push-approval-required, current-and-rollback-tags-required
nas-image-proof-accepted | image-proof | blocked | yes | yes | yes | proof blockers=current-tag-stable-for-rollback
nas-proof-does-not-approve-deploy | safety | pass | yes | yes | yes | nas_image_proof.docker_deploy_allowed=false
target-image-tag-present | release-input | pass | no | yes | yes | target_image_tag=4cb5b18262e49894d4272b0fc940be6c1d2102b4
workflow-ref-pins-target-image | release-input | pass | no | yes | yes | workflow_ref=admin-docker-candidate-4cb5b18262e49894d4272b0fc940be6c1d2102b4, target=4cb5b18262e49894d4272b0fc940be6c1d2102b4
release-ref-setup-command-ready | release-input | pass | no | yes | yes | git tag admin-docker-candidate-4cb5b18262e49894d4272b0fc940be6c1d2102b4 4cb5b18262e49894d4272b0fc940be6c1d2102b4 && git push origin refs/tags/admin-docker-candidate-4cb5b18262e49894d4272b0fc940be6c1d2102b4:refs/tags/admin-docker-candidate-4cb5b18262e49894d4272b0fc940be6c1d2102b4
current-and-rollback-tags-present | release-input | blocked | yes | yes | yes | current=missing, rollback=missing
rollback-tag-matches-current | release-input | blocked | yes | yes | yes | current=missing, rollback=missing
target-tag-differs-from-current | release-input | blocked | yes | yes | yes | target=4cb5b18262e49894d4272b0fc940be6c1d2102b4, current=missing
workflow-command-has-no-placeholders | release-input | blocked | yes | yes | yes | Workflow command still contains placeholders.
explicit-release-approval-required | release-decision | blocked | no | yes | yes | This report prepares release inputs only; it is not approval to run push_images=true.

## Summary

- Release input blockers: nas-image-proof-accepted, current-and-rollback-tags-present, rollback-tag-matches-current, target-tag-differs-from-current, workflow-command-has-no-placeholders
- Push execution blockers: nas-image-proof-accepted, current-and-rollback-tags-present, rollback-tag-matches-current, target-tag-differs-from-current, workflow-command-has-no-placeholders, explicit-release-approval-required
- Docker deploy blockers: handoff-staging-blockers-carried-forward, nas-image-proof-accepted, current-and-rollback-tags-present, rollback-tag-matches-current, target-tag-differs-from-current, workflow-command-has-no-placeholders, explicit-release-approval-required
- Handoff staging execution blockers: nas-disk-risk-carried-forward, explicit-push-approval-required, current-and-rollback-tags-required
- Candidate ref blockers: none

## Next Actions

- Keep push_images=false until release inputs are ready.
- Run validate:admin-docker-nas-image-proof with a sanitized NAS MIXLAB_IMAGE_TAG evidence file and docker inspect evidence.
- Resolve release input blockers: nas-image-proof-accepted, current-and-rollback-tags-present, rollback-tag-matches-current, target-tag-differs-from-current, workflow-command-has-no-placeholders.
- Preserved pre-staging execution blockers: nas-disk-risk-carried-forward, explicit-push-approval-required, current-and-rollback-tags-required.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-release-inputs-20260628T231249Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-release-inputs-20260628T231249Z.md
