# Admin Docker Candidate Ref Proof

Generated: 2026-06-28T20:39:00.116Z
Mode: admin-docker-candidate-ref-proof
Result: accepted
Candidate ref proof accepted: yes
Docker deploy allowed: no

## Sources

- Artifact dir: .local-dev/admin-docker-github-runs/28335143445/mixlab-admin-docker-release-gates
- Local smoke report: .local-dev/admin-docker-github-runs/28335143445/mixlab-admin-docker-release-gates/admin-docker-local-smoke-20260628T203603Z.json
- Staging runbook report: .local-dev/admin-docker-github-runs/28335143445/mixlab-admin-docker-release-gates/admin-docker-staging-runbook-20260628T203811Z.json
- GitHub run id: 28335143445
- Remote tag ref: refs/tags/admin-docker-candidate-25fe2264de7b391a56e770a8acb6bf40ebec3863

## Candidate

- Expected SHA: 25fe2264de7b391a56e770a8acb6bf40ebec3863
- Expected tag: admin-docker-candidate-25fe2264de7b391a56e770a8acb6bf40ebec3863
- Remote tag SHA: 25fe2264de7b391a56e770a8acb6bf40ebec3863
- Tag points to expected SHA: yes

## GitHub Run

- Run URL: https://github.com/alin155/mixlab/actions/runs/28335143445
- Head branch: admin-docker-candidate-25fe2264de7b391a56e770a8acb6bf40ebec3863
- Head SHA: 25fe2264de7b391a56e770a8acb6bf40ebec3863
- Status: completed
- Conclusion: success

## Observations

- Local smoke passed: true
- Local smoke image tag: 25fe2264de7b391a56e770a8acb6bf40ebec3863
- Local smoke build SHA: 25fe2264de7b391a56e770a8acb6bf40ebec3863
- Staging target image tag: 25fe2264de7b391a56e770a8acb6bf40ebec3863
- Image push approval accepted: false
- Staging Docker deploy allowed: false

## Gates

| Gate | Category | Status | Blocks Ref Proof | Blocks Deploy | Evidence |
| --- | --- | --- | --- | --- | --- |
candidate-ref-proof-no-side-effects | safety | pass | no | no | Reads git tag, GitHub run metadata, and downloaded artifacts only; does not push images, contact NAS, restart containers, enable workers, or write NAS data.
candidate-sha-provided | candidate-ref | pass | no | yes | 25fe2264de7b391a56e770a8acb6bf40ebec3863
candidate-tag-pins-sha-name | candidate-ref | pass | no | yes | tag=admin-docker-candidate-25fe2264de7b391a56e770a8acb6bf40ebec3863, expected=admin-docker-candidate-25fe2264de7b391a56e770a8acb6bf40ebec3863
remote-tag-points-to-candidate-sha | candidate-ref | pass | no | yes | remote_tag_sha=25fe2264de7b391a56e770a8acb6bf40ebec3863, expected=25fe2264de7b391a56e770a8acb6bf40ebec3863
github-run-succeeded | github-run | pass | no | yes | status=completed, conclusion=success, run=https://github.com/alin155/mixlab/actions/runs/28335143445
github-run-head-matches-candidate-tag | github-run | pass | no | yes | run.headBranch=admin-docker-candidate-25fe2264de7b391a56e770a8acb6bf40ebec3863, expected_tag=admin-docker-candidate-25fe2264de7b391a56e770a8acb6bf40ebec3863
github-run-head-matches-candidate-sha | github-run | pass | no | yes | run.headSha=25fe2264de7b391a56e770a8acb6bf40ebec3863, expected_sha=25fe2264de7b391a56e770a8acb6bf40ebec3863
local-docker-smoke-passed | smoke | pass | no | yes | local_smoke_passed=true
local-smoke-identity-matches-candidate | smoke | pass | no | yes | image_tag=25fe2264de7b391a56e770a8acb6bf40ebec3863, build_sha=25fe2264de7b391a56e770a8acb6bf40ebec3863, expected=25fe2264de7b391a56e770a8acb6bf40ebec3863
staging-target-matches-candidate | release-boundary | pass | no | yes | staging_target=25fe2264de7b391a56e770a8acb6bf40ebec3863, expected=25fe2264de7b391a56e770a8acb6bf40ebec3863
tag-dry-run-does-not-approve-push-or-deploy | release-boundary | pass | yes | yes | image_push_approval.accepted=false, staging.docker_deploy_allowed=false

## Summary

- Candidate ref blockers: none
- Docker deploy blockers: none

## Next Actions

- Candidate release ref admin-docker-candidate-25fe2264de7b391a56e770a8acb6bf40ebec3863 is pinned to 25fe2264de7b391a56e770a8acb6bf40ebec3863 and has a successful push_images=false dry-run.
- Do not run push_images=true until NAS image proof, current/rollback tags, disk proof, worker proof, Cutter proof, and explicit release approval are present.
- After any push_images=true run, regenerate GitHub run artifact, staging runbook, live-readonly, admin-worker env proof, and Cutter compatibility proof.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260628T203900Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260628T203900Z.md
