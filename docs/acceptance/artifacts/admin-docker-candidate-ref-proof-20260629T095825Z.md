# Admin Docker Candidate Ref Proof

Generated: 2026-06-29T09:58:25.775Z
Mode: admin-docker-candidate-ref-proof
Result: accepted
Candidate ref proof accepted: yes
Docker deploy allowed: no

## Sources

- Artifact dir: .local-dev/admin-docker-github-runs/28363633436/mixlab-admin-docker-release-gates
- Local smoke report: .local-dev/admin-docker-github-runs/28363633436/mixlab-admin-docker-release-gates/admin-docker-local-smoke-20260629T095505Z.json
- Staging runbook report: .local-dev/admin-docker-github-runs/28363633436/mixlab-admin-docker-release-gates/admin-docker-staging-runbook-20260629T095711Z.json
- GitHub run id: 28363633436
- Remote tag ref: refs/tags/admin-docker-candidate-5a50922bc82f1b6728f247ed33e5885ab8cf6bef

## Candidate

- Expected SHA: 5a50922bc82f1b6728f247ed33e5885ab8cf6bef
- Expected tag: admin-docker-candidate-5a50922bc82f1b6728f247ed33e5885ab8cf6bef
- Remote tag SHA: 5a50922bc82f1b6728f247ed33e5885ab8cf6bef
- Tag points to expected SHA: yes

## GitHub Run

- Run URL: https://github.com/alin155/mixlab/actions/runs/28363633436
- Head branch: admin-docker-candidate-5a50922bc82f1b6728f247ed33e5885ab8cf6bef
- Head SHA: 5a50922bc82f1b6728f247ed33e5885ab8cf6bef
- Status: completed
- Conclusion: success

## Observations

- Local smoke passed: true
- Local smoke image tag: 5a50922bc82f1b6728f247ed33e5885ab8cf6bef
- Local smoke build SHA: 5a50922bc82f1b6728f247ed33e5885ab8cf6bef
- Staging target image tag: 5a50922bc82f1b6728f247ed33e5885ab8cf6bef
- Image push approval accepted: false
- Staging Docker deploy allowed: false

## Gates

| Gate | Category | Status | Blocks Ref Proof | Blocks Deploy | Evidence |
| --- | --- | --- | --- | --- | --- |
candidate-ref-proof-no-side-effects | safety | pass | no | no | Reads git tag, GitHub run metadata, and downloaded artifacts only; does not push images, contact NAS, restart containers, enable workers, or write NAS data.
candidate-sha-provided | candidate-ref | pass | no | yes | 5a50922bc82f1b6728f247ed33e5885ab8cf6bef
candidate-tag-pins-sha-name | candidate-ref | pass | no | yes | tag=admin-docker-candidate-5a50922bc82f1b6728f247ed33e5885ab8cf6bef, expected=admin-docker-candidate-5a50922bc82f1b6728f247ed33e5885ab8cf6bef
remote-tag-points-to-candidate-sha | candidate-ref | pass | no | yes | remote_tag_sha=5a50922bc82f1b6728f247ed33e5885ab8cf6bef, expected=5a50922bc82f1b6728f247ed33e5885ab8cf6bef
github-run-succeeded | github-run | pass | no | yes | status=completed, conclusion=success, run=https://github.com/alin155/mixlab/actions/runs/28363633436
github-run-head-matches-candidate-tag | github-run | pass | no | yes | run.headBranch=admin-docker-candidate-5a50922bc82f1b6728f247ed33e5885ab8cf6bef, expected_tag=admin-docker-candidate-5a50922bc82f1b6728f247ed33e5885ab8cf6bef
github-run-head-matches-candidate-sha | github-run | pass | no | yes | run.headSha=5a50922bc82f1b6728f247ed33e5885ab8cf6bef, expected_sha=5a50922bc82f1b6728f247ed33e5885ab8cf6bef
local-docker-smoke-passed | smoke | pass | no | yes | local_smoke_passed=true
local-smoke-identity-matches-candidate | smoke | pass | no | yes | image_tag=5a50922bc82f1b6728f247ed33e5885ab8cf6bef, build_sha=5a50922bc82f1b6728f247ed33e5885ab8cf6bef, expected=5a50922bc82f1b6728f247ed33e5885ab8cf6bef
staging-target-matches-candidate | release-boundary | pass | no | yes | staging_target=5a50922bc82f1b6728f247ed33e5885ab8cf6bef, expected=5a50922bc82f1b6728f247ed33e5885ab8cf6bef
tag-dry-run-does-not-approve-push-or-deploy | release-boundary | pass | yes | yes | image_push_approval.accepted=false, staging.docker_deploy_allowed=false

## Summary

- Candidate ref blockers: none
- Docker deploy blockers: none

## Next Actions

- Candidate release ref admin-docker-candidate-5a50922bc82f1b6728f247ed33e5885ab8cf6bef is pinned to 5a50922bc82f1b6728f247ed33e5885ab8cf6bef and has a successful push_images=false dry-run.
- Do not run push_images=true until NAS image proof, current/rollback tags, disk proof, worker proof, Cutter proof, and explicit release approval are present.
- After any push_images=true run, regenerate GitHub run artifact, staging runbook, live-readonly, admin-worker env proof, and Cutter compatibility proof.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260629T095825Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260629T095825Z.md
