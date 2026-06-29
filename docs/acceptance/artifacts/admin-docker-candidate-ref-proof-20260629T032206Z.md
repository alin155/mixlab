# Admin Docker Candidate Ref Proof

Generated: 2026-06-29T03:22:06.095Z
Mode: admin-docker-candidate-ref-proof
Result: accepted
Candidate ref proof accepted: yes
Docker deploy allowed: no

## Sources

- Artifact dir: .local-dev/admin-docker-github-runs/28346369749/mixlab-admin-docker-release-gates
- Local smoke report: .local-dev/admin-docker-github-runs/28346369749/mixlab-admin-docker-release-gates/admin-docker-local-smoke-20260629T031851Z.json
- Staging runbook report: .local-dev/admin-docker-github-runs/28346369749/mixlab-admin-docker-release-gates/admin-docker-staging-runbook-20260629T032051Z.json
- GitHub run id: 28346369749
- Remote tag ref: refs/tags/admin-docker-candidate-73ab7b355051d7325174111f955cd8356d42787d

## Candidate

- Expected SHA: 73ab7b355051d7325174111f955cd8356d42787d
- Expected tag: admin-docker-candidate-73ab7b355051d7325174111f955cd8356d42787d
- Remote tag SHA: 73ab7b355051d7325174111f955cd8356d42787d
- Tag points to expected SHA: yes

## GitHub Run

- Run URL: https://github.com/alin155/mixlab/actions/runs/28346369749
- Head branch: admin-docker-candidate-73ab7b355051d7325174111f955cd8356d42787d
- Head SHA: 73ab7b355051d7325174111f955cd8356d42787d
- Status: completed
- Conclusion: success

## Observations

- Local smoke passed: true
- Local smoke image tag: 73ab7b355051d7325174111f955cd8356d42787d
- Local smoke build SHA: 73ab7b355051d7325174111f955cd8356d42787d
- Staging target image tag: 73ab7b355051d7325174111f955cd8356d42787d
- Image push approval accepted: false
- Staging Docker deploy allowed: false

## Gates

| Gate | Category | Status | Blocks Ref Proof | Blocks Deploy | Evidence |
| --- | --- | --- | --- | --- | --- |
candidate-ref-proof-no-side-effects | safety | pass | no | no | Reads git tag, GitHub run metadata, and downloaded artifacts only; does not push images, contact NAS, restart containers, enable workers, or write NAS data.
candidate-sha-provided | candidate-ref | pass | no | yes | 73ab7b355051d7325174111f955cd8356d42787d
candidate-tag-pins-sha-name | candidate-ref | pass | no | yes | tag=admin-docker-candidate-73ab7b355051d7325174111f955cd8356d42787d, expected=admin-docker-candidate-73ab7b355051d7325174111f955cd8356d42787d
remote-tag-points-to-candidate-sha | candidate-ref | pass | no | yes | remote_tag_sha=73ab7b355051d7325174111f955cd8356d42787d, expected=73ab7b355051d7325174111f955cd8356d42787d
github-run-succeeded | github-run | pass | no | yes | status=completed, conclusion=success, run=https://github.com/alin155/mixlab/actions/runs/28346369749
github-run-head-matches-candidate-tag | github-run | pass | no | yes | run.headBranch=admin-docker-candidate-73ab7b355051d7325174111f955cd8356d42787d, expected_tag=admin-docker-candidate-73ab7b355051d7325174111f955cd8356d42787d
github-run-head-matches-candidate-sha | github-run | pass | no | yes | run.headSha=73ab7b355051d7325174111f955cd8356d42787d, expected_sha=73ab7b355051d7325174111f955cd8356d42787d
local-docker-smoke-passed | smoke | pass | no | yes | local_smoke_passed=true
local-smoke-identity-matches-candidate | smoke | pass | no | yes | image_tag=73ab7b355051d7325174111f955cd8356d42787d, build_sha=73ab7b355051d7325174111f955cd8356d42787d, expected=73ab7b355051d7325174111f955cd8356d42787d
staging-target-matches-candidate | release-boundary | pass | no | yes | staging_target=73ab7b355051d7325174111f955cd8356d42787d, expected=73ab7b355051d7325174111f955cd8356d42787d
tag-dry-run-does-not-approve-push-or-deploy | release-boundary | pass | yes | yes | image_push_approval.accepted=false, staging.docker_deploy_allowed=false

## Summary

- Candidate ref blockers: none
- Docker deploy blockers: none

## Next Actions

- Candidate release ref admin-docker-candidate-73ab7b355051d7325174111f955cd8356d42787d is pinned to 73ab7b355051d7325174111f955cd8356d42787d and has a successful push_images=false dry-run.
- Do not run push_images=true until NAS image proof, current/rollback tags, disk proof, worker proof, Cutter proof, and explicit release approval are present.
- After any push_images=true run, regenerate GitHub run artifact, staging runbook, live-readonly, admin-worker env proof, and Cutter compatibility proof.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260629T032206Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260629T032206Z.md
