# Admin Docker Release Inputs

Generated: 2026-06-28T01:02:48.839Z
Mode: admin-docker-release-inputs
Result: blocked
Release inputs ready: no
Push execution allowed: no
Docker deploy allowed: no
Release decision required: yes

## Sources

- Pre-staging handoff: docs/acceptance/artifacts/admin-docker-prestaging-handoff-20260628T010239Z.json
- NAS image proof: <missing>

## Workflow Inputs

- target_image_tag: <blocked>
- current_image_tag: <blocked>
- rollback_image_tag: <blocked>
- branch: admin-docker-candidate-e94a5bdd8fc981b8112cc372df6f18204bb47528
- workflow_ref: <blocked>
- release_ref_setup_command: <blocked>
- command: <blocked>

## Gates

| Gate | Category | Status | Blocks Inputs | Blocks Push | Blocks Deploy | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
release-inputs-no-side-effects | safety | pass | no | no | no | This report reads prestaging handoff and NAS image proof JSON only; it does not contact NAS, Docker, GitHub, Admin API, or Cutter.
prestaging-handoff-provided | handoff | pass | no | yes | yes | docs/acceptance/artifacts/admin-docker-prestaging-handoff-20260628T010239Z.json
nas-image-proof-provided | image-proof | blocked | yes | yes | yes | No MIXLAB_ADMIN_DOCKER_NAS_IMAGE_PROOF_REPORT path provided.
handoff-ready-to-request-release-inputs | handoff | pass | no | yes | yes | ready_to_request_release_inputs=true
handoff-does-not-approve-staging-or-deploy | safety | pass | yes | yes | yes | staging_execution_ready=false, docker_deploy_allowed=false
handoff-staging-blockers-carried-forward | handoff | blocked | no | no | yes | staging blockers=nas-disk-risk-carried-forward, explicit-push-approval-required, current-and-rollback-tags-required, staged-live-readonly-required, admin-worker-env-proof-required, cutter-compatibility-proof-required
nas-image-proof-accepted | image-proof | blocked | yes | yes | yes | proof blockers=unknown
nas-proof-does-not-approve-deploy | safety | blocked | yes | yes | yes | nas_image_proof.docker_deploy_allowed=null
target-image-tag-present | release-input | pass | no | yes | yes | target_image_tag=e94a5bdd8fc981b8112cc372df6f18204bb47528
workflow-ref-pins-target-image | release-input | pass | no | yes | yes | workflow_ref=admin-docker-candidate-e94a5bdd8fc981b8112cc372df6f18204bb47528, target=e94a5bdd8fc981b8112cc372df6f18204bb47528
release-ref-setup-command-ready | release-input | pass | no | yes | yes | git tag admin-docker-candidate-e94a5bdd8fc981b8112cc372df6f18204bb47528 e94a5bdd8fc981b8112cc372df6f18204bb47528 && git push origin refs/tags/admin-docker-candidate-e94a5bdd8fc981b8112cc372df6f18204bb47528:refs/tags/admin-docker-candidate-e94a5bdd8fc981b8112cc372df6f18204bb47528
current-and-rollback-tags-present | release-input | blocked | yes | yes | yes | current=missing, rollback=missing
rollback-tag-matches-current | release-input | blocked | yes | yes | yes | current=missing, rollback=missing
target-tag-differs-from-current | release-input | blocked | yes | yes | yes | target=e94a5bdd8fc981b8112cc372df6f18204bb47528, current=missing
workflow-command-has-no-placeholders | release-input | blocked | yes | yes | yes | Workflow command still contains placeholders.
explicit-release-approval-required | release-decision | blocked | no | yes | yes | This report prepares release inputs only; it is not approval to run push_images=true.

## Summary

- Release input blockers: nas-image-proof-provided, nas-image-proof-accepted, nas-proof-does-not-approve-deploy, current-and-rollback-tags-present, rollback-tag-matches-current, target-tag-differs-from-current, workflow-command-has-no-placeholders
- Push execution blockers: nas-image-proof-provided, nas-image-proof-accepted, nas-proof-does-not-approve-deploy, current-and-rollback-tags-present, rollback-tag-matches-current, target-tag-differs-from-current, workflow-command-has-no-placeholders, explicit-release-approval-required
- Docker deploy blockers: nas-image-proof-provided, handoff-staging-blockers-carried-forward, nas-image-proof-accepted, nas-proof-does-not-approve-deploy, current-and-rollback-tags-present, rollback-tag-matches-current, target-tag-differs-from-current, workflow-command-has-no-placeholders, explicit-release-approval-required
- Handoff staging execution blockers: nas-disk-risk-carried-forward, explicit-push-approval-required, current-and-rollback-tags-required, staged-live-readonly-required, admin-worker-env-proof-required, cutter-compatibility-proof-required

## Next Actions

- Keep push_images=false until release inputs are ready.
- Run validate:admin-docker-nas-image-proof with a sanitized NAS MIXLAB_IMAGE_TAG evidence file and docker inspect evidence.
- Resolve release input blockers: nas-image-proof-provided, nas-image-proof-accepted, nas-proof-does-not-approve-deploy, current-and-rollback-tags-present, rollback-tag-matches-current, target-tag-differs-from-current, workflow-command-has-no-placeholders.
- Preserved pre-staging execution blockers: nas-disk-risk-carried-forward, explicit-push-approval-required, current-and-rollback-tags-required, staged-live-readonly-required, admin-worker-env-proof-required, cutter-compatibility-proof-required.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-release-inputs-20260628T010248Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-release-inputs-20260628T010248Z.md
