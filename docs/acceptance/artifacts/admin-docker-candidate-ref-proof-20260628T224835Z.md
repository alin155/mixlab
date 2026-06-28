# Admin Docker Candidate Ref Proof

Generated: 2026-06-28T22:48:35.940Z
Mode: admin-docker-candidate-ref-proof
Result: accepted
Candidate ref proof accepted: yes
Docker deploy allowed: no

## Sources

- Artifact dir: .local-dev/admin-docker-github-runs/28338518625/mixlab-admin-docker-release-gates
- Local smoke report: .local-dev/admin-docker-github-runs/28338518625/mixlab-admin-docker-release-gates/admin-docker-local-smoke-20260628T224526Z.json
- Staging runbook report: .local-dev/admin-docker-github-runs/28338518625/mixlab-admin-docker-release-gates/admin-docker-staging-runbook-20260628T224730Z.json
- GitHub run id: 28338518625
- Remote tag ref: refs/tags/admin-docker-candidate-b945418df2a447fd39bb9c88f781322594fc11c0

## Candidate

- Expected SHA: b945418df2a447fd39bb9c88f781322594fc11c0
- Expected tag: admin-docker-candidate-b945418df2a447fd39bb9c88f781322594fc11c0
- Remote tag SHA: b945418df2a447fd39bb9c88f781322594fc11c0
- Tag points to expected SHA: yes

## GitHub Run

- Run URL: https://github.com/alin155/mixlab/actions/runs/28338518625
- Head branch: admin-docker-candidate-b945418df2a447fd39bb9c88f781322594fc11c0
- Head SHA: b945418df2a447fd39bb9c88f781322594fc11c0
- Status: completed
- Conclusion: success

## Observations

- Local smoke passed: true
- Local smoke image tag: b945418df2a447fd39bb9c88f781322594fc11c0
- Local smoke build SHA: b945418df2a447fd39bb9c88f781322594fc11c0
- Staging target image tag: b945418df2a447fd39bb9c88f781322594fc11c0
- Image push approval accepted: false
- Staging Docker deploy allowed: false

## Gates

| Gate | Category | Status | Blocks Ref Proof | Blocks Deploy | Evidence |
| --- | --- | --- | --- | --- | --- |
candidate-ref-proof-no-side-effects | safety | pass | no | no | Reads git tag, GitHub run metadata, and downloaded artifacts only; does not push images, contact NAS, restart containers, enable workers, or write NAS data.
candidate-sha-provided | candidate-ref | pass | no | yes | b945418df2a447fd39bb9c88f781322594fc11c0
candidate-tag-pins-sha-name | candidate-ref | pass | no | yes | tag=admin-docker-candidate-b945418df2a447fd39bb9c88f781322594fc11c0, expected=admin-docker-candidate-b945418df2a447fd39bb9c88f781322594fc11c0
remote-tag-points-to-candidate-sha | candidate-ref | pass | no | yes | remote_tag_sha=b945418df2a447fd39bb9c88f781322594fc11c0, expected=b945418df2a447fd39bb9c88f781322594fc11c0
github-run-succeeded | github-run | pass | no | yes | status=completed, conclusion=success, run=https://github.com/alin155/mixlab/actions/runs/28338518625
github-run-head-matches-candidate-tag | github-run | pass | no | yes | run.headBranch=admin-docker-candidate-b945418df2a447fd39bb9c88f781322594fc11c0, expected_tag=admin-docker-candidate-b945418df2a447fd39bb9c88f781322594fc11c0
github-run-head-matches-candidate-sha | github-run | pass | no | yes | run.headSha=b945418df2a447fd39bb9c88f781322594fc11c0, expected_sha=b945418df2a447fd39bb9c88f781322594fc11c0
local-docker-smoke-passed | smoke | pass | no | yes | local_smoke_passed=true
local-smoke-identity-matches-candidate | smoke | pass | no | yes | image_tag=b945418df2a447fd39bb9c88f781322594fc11c0, build_sha=b945418df2a447fd39bb9c88f781322594fc11c0, expected=b945418df2a447fd39bb9c88f781322594fc11c0
staging-target-matches-candidate | release-boundary | pass | no | yes | staging_target=b945418df2a447fd39bb9c88f781322594fc11c0, expected=b945418df2a447fd39bb9c88f781322594fc11c0
tag-dry-run-does-not-approve-push-or-deploy | release-boundary | pass | yes | yes | image_push_approval.accepted=false, staging.docker_deploy_allowed=false

## Summary

- Candidate ref blockers: none
- Docker deploy blockers: none

## Next Actions

- Candidate release ref admin-docker-candidate-b945418df2a447fd39bb9c88f781322594fc11c0 is pinned to b945418df2a447fd39bb9c88f781322594fc11c0 and has a successful push_images=false dry-run.
- Do not run push_images=true until NAS image proof, current/rollback tags, disk proof, worker proof, Cutter proof, and explicit release approval are present.
- After any push_images=true run, regenerate GitHub run artifact, staging runbook, live-readonly, admin-worker env proof, and Cutter compatibility proof.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260628T224835Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260628T224835Z.md
