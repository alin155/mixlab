# Admin Docker Candidate Ref Proof

Generated: 2026-06-29T09:37:21.185Z
Mode: admin-docker-candidate-ref-proof
Result: accepted
Candidate ref proof accepted: yes
Docker deploy allowed: no

## Sources

- Artifact dir: .local-dev/admin-docker-github-runs/28362489637/mixlab-admin-docker-release-gates
- Local smoke report: .local-dev/admin-docker-github-runs/28362489637/mixlab-admin-docker-release-gates/admin-docker-local-smoke-20260629T093417Z.json
- Staging runbook report: .local-dev/admin-docker-github-runs/28362489637/mixlab-admin-docker-release-gates/admin-docker-staging-runbook-20260629T093624Z.json
- GitHub run id: 28362489637
- Remote tag ref: refs/tags/admin-docker-candidate-8a7939c1e8b2220d45d52c5fe329692516c32e4d

## Candidate

- Expected SHA: 8a7939c1e8b2220d45d52c5fe329692516c32e4d
- Expected tag: admin-docker-candidate-8a7939c1e8b2220d45d52c5fe329692516c32e4d
- Remote tag SHA: 8a7939c1e8b2220d45d52c5fe329692516c32e4d
- Tag points to expected SHA: yes

## GitHub Run

- Run URL: https://github.com/alin155/mixlab/actions/runs/28362489637
- Head branch: admin-docker-candidate-8a7939c1e8b2220d45d52c5fe329692516c32e4d
- Head SHA: 8a7939c1e8b2220d45d52c5fe329692516c32e4d
- Status: completed
- Conclusion: success

## Observations

- Local smoke passed: true
- Local smoke image tag: 8a7939c1e8b2220d45d52c5fe329692516c32e4d
- Local smoke build SHA: 8a7939c1e8b2220d45d52c5fe329692516c32e4d
- Staging target image tag: 8a7939c1e8b2220d45d52c5fe329692516c32e4d
- Image push approval accepted: false
- Staging Docker deploy allowed: false

## Gates

| Gate | Category | Status | Blocks Ref Proof | Blocks Deploy | Evidence |
| --- | --- | --- | --- | --- | --- |
candidate-ref-proof-no-side-effects | safety | pass | no | no | Reads git tag, GitHub run metadata, and downloaded artifacts only; does not push images, contact NAS, restart containers, enable workers, or write NAS data.
candidate-sha-provided | candidate-ref | pass | no | yes | 8a7939c1e8b2220d45d52c5fe329692516c32e4d
candidate-tag-pins-sha-name | candidate-ref | pass | no | yes | tag=admin-docker-candidate-8a7939c1e8b2220d45d52c5fe329692516c32e4d, expected=admin-docker-candidate-8a7939c1e8b2220d45d52c5fe329692516c32e4d
remote-tag-points-to-candidate-sha | candidate-ref | pass | no | yes | remote_tag_sha=8a7939c1e8b2220d45d52c5fe329692516c32e4d, expected=8a7939c1e8b2220d45d52c5fe329692516c32e4d
github-run-succeeded | github-run | pass | no | yes | status=completed, conclusion=success, run=https://github.com/alin155/mixlab/actions/runs/28362489637
github-run-head-matches-candidate-tag | github-run | pass | no | yes | run.headBranch=admin-docker-candidate-8a7939c1e8b2220d45d52c5fe329692516c32e4d, expected_tag=admin-docker-candidate-8a7939c1e8b2220d45d52c5fe329692516c32e4d
github-run-head-matches-candidate-sha | github-run | pass | no | yes | run.headSha=8a7939c1e8b2220d45d52c5fe329692516c32e4d, expected_sha=8a7939c1e8b2220d45d52c5fe329692516c32e4d
local-docker-smoke-passed | smoke | pass | no | yes | local_smoke_passed=true
local-smoke-identity-matches-candidate | smoke | pass | no | yes | image_tag=8a7939c1e8b2220d45d52c5fe329692516c32e4d, build_sha=8a7939c1e8b2220d45d52c5fe329692516c32e4d, expected=8a7939c1e8b2220d45d52c5fe329692516c32e4d
staging-target-matches-candidate | release-boundary | pass | no | yes | staging_target=8a7939c1e8b2220d45d52c5fe329692516c32e4d, expected=8a7939c1e8b2220d45d52c5fe329692516c32e4d
tag-dry-run-does-not-approve-push-or-deploy | release-boundary | pass | yes | yes | image_push_approval.accepted=false, staging.docker_deploy_allowed=false

## Summary

- Candidate ref blockers: none
- Docker deploy blockers: none

## Next Actions

- Candidate release ref admin-docker-candidate-8a7939c1e8b2220d45d52c5fe329692516c32e4d is pinned to 8a7939c1e8b2220d45d52c5fe329692516c32e4d and has a successful push_images=false dry-run.
- Do not run push_images=true until NAS image proof, current/rollback tags, disk proof, worker proof, Cutter proof, and explicit release approval are present.
- After any push_images=true run, regenerate GitHub run artifact, staging runbook, live-readonly, admin-worker env proof, and Cutter compatibility proof.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260629T093721Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260629T093721Z.md
