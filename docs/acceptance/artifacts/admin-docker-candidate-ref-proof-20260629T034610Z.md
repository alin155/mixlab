# Admin Docker Candidate Ref Proof

Generated: 2026-06-29T03:46:10.028Z
Mode: admin-docker-candidate-ref-proof
Result: accepted
Candidate ref proof accepted: yes
Docker deploy allowed: no

## Sources

- Artifact dir: .local-dev/admin-docker-github-runs/28347083834/mixlab-admin-docker-release-gates
- Local smoke report: .local-dev/admin-docker-github-runs/28347083834/mixlab-admin-docker-release-gates/admin-docker-local-smoke-20260629T034230Z.json
- Staging runbook report: .local-dev/admin-docker-github-runs/28347083834/mixlab-admin-docker-release-gates/admin-docker-staging-runbook-20260629T034436Z.json
- GitHub run id: 28347083834
- Remote tag ref: refs/tags/admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde

## Candidate

- Expected SHA: 9c015b9105e97954240020781f79daae3f954bde
- Expected tag: admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde
- Remote tag SHA: 9c015b9105e97954240020781f79daae3f954bde
- Tag points to expected SHA: yes

## GitHub Run

- Run URL: https://github.com/alin155/mixlab/actions/runs/28347083834
- Head branch: admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde
- Head SHA: 9c015b9105e97954240020781f79daae3f954bde
- Status: completed
- Conclusion: success

## Observations

- Local smoke passed: true
- Local smoke image tag: 9c015b9105e97954240020781f79daae3f954bde
- Local smoke build SHA: 9c015b9105e97954240020781f79daae3f954bde
- Staging target image tag: 9c015b9105e97954240020781f79daae3f954bde
- Image push approval accepted: false
- Staging Docker deploy allowed: false

## Gates

| Gate | Category | Status | Blocks Ref Proof | Blocks Deploy | Evidence |
| --- | --- | --- | --- | --- | --- |
candidate-ref-proof-no-side-effects | safety | pass | no | no | Reads git tag, GitHub run metadata, and downloaded artifacts only; does not push images, contact NAS, restart containers, enable workers, or write NAS data.
candidate-sha-provided | candidate-ref | pass | no | yes | 9c015b9105e97954240020781f79daae3f954bde
candidate-tag-pins-sha-name | candidate-ref | pass | no | yes | tag=admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde, expected=admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde
remote-tag-points-to-candidate-sha | candidate-ref | pass | no | yes | remote_tag_sha=9c015b9105e97954240020781f79daae3f954bde, expected=9c015b9105e97954240020781f79daae3f954bde
github-run-succeeded | github-run | pass | no | yes | status=completed, conclusion=success, run=https://github.com/alin155/mixlab/actions/runs/28347083834
github-run-head-matches-candidate-tag | github-run | pass | no | yes | run.headBranch=admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde, expected_tag=admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde
github-run-head-matches-candidate-sha | github-run | pass | no | yes | run.headSha=9c015b9105e97954240020781f79daae3f954bde, expected_sha=9c015b9105e97954240020781f79daae3f954bde
local-docker-smoke-passed | smoke | pass | no | yes | local_smoke_passed=true
local-smoke-identity-matches-candidate | smoke | pass | no | yes | image_tag=9c015b9105e97954240020781f79daae3f954bde, build_sha=9c015b9105e97954240020781f79daae3f954bde, expected=9c015b9105e97954240020781f79daae3f954bde
staging-target-matches-candidate | release-boundary | pass | no | yes | staging_target=9c015b9105e97954240020781f79daae3f954bde, expected=9c015b9105e97954240020781f79daae3f954bde
tag-dry-run-does-not-approve-push-or-deploy | release-boundary | pass | yes | yes | image_push_approval.accepted=false, staging.docker_deploy_allowed=false

## Summary

- Candidate ref blockers: none
- Docker deploy blockers: none

## Next Actions

- Candidate release ref admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde is pinned to 9c015b9105e97954240020781f79daae3f954bde and has a successful push_images=false dry-run.
- Do not run push_images=true until NAS image proof, current/rollback tags, disk proof, worker proof, Cutter proof, and explicit release approval are present.
- After any push_images=true run, regenerate GitHub run artifact, staging runbook, live-readonly, admin-worker env proof, and Cutter compatibility proof.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260629T034610Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260629T034610Z.md
