# Admin Docker Candidate Ref Proof

Generated: 2026-06-29T09:13:50.647Z
Mode: admin-docker-candidate-ref-proof
Result: accepted
Candidate ref proof accepted: yes
Docker deploy allowed: no

## Sources

- Artifact dir: .local-dev/admin-docker-github-runs/28361098922/mixlab-admin-docker-release-gates
- Local smoke report: .local-dev/admin-docker-github-runs/28361098922/mixlab-admin-docker-release-gates/admin-docker-local-smoke-20260629T091051Z.json
- Staging runbook report: .local-dev/admin-docker-github-runs/28361098922/mixlab-admin-docker-release-gates/admin-docker-staging-runbook-20260629T091257Z.json
- GitHub run id: 28361098922
- Remote tag ref: refs/tags/admin-docker-candidate-be81398b3ade1b591122ee36a0a9566a889b1b2a

## Candidate

- Expected SHA: be81398b3ade1b591122ee36a0a9566a889b1b2a
- Expected tag: admin-docker-candidate-be81398b3ade1b591122ee36a0a9566a889b1b2a
- Remote tag SHA: be81398b3ade1b591122ee36a0a9566a889b1b2a
- Tag points to expected SHA: yes

## GitHub Run

- Run URL: https://github.com/alin155/mixlab/actions/runs/28361098922
- Head branch: admin-docker-candidate-be81398b3ade1b591122ee36a0a9566a889b1b2a
- Head SHA: be81398b3ade1b591122ee36a0a9566a889b1b2a
- Status: completed
- Conclusion: success

## Observations

- Local smoke passed: true
- Local smoke image tag: be81398b3ade1b591122ee36a0a9566a889b1b2a
- Local smoke build SHA: be81398b3ade1b591122ee36a0a9566a889b1b2a
- Staging target image tag: be81398b3ade1b591122ee36a0a9566a889b1b2a
- Image push approval accepted: false
- Staging Docker deploy allowed: false

## Gates

| Gate | Category | Status | Blocks Ref Proof | Blocks Deploy | Evidence |
| --- | --- | --- | --- | --- | --- |
candidate-ref-proof-no-side-effects | safety | pass | no | no | Reads git tag, GitHub run metadata, and downloaded artifacts only; does not push images, contact NAS, restart containers, enable workers, or write NAS data.
candidate-sha-provided | candidate-ref | pass | no | yes | be81398b3ade1b591122ee36a0a9566a889b1b2a
candidate-tag-pins-sha-name | candidate-ref | pass | no | yes | tag=admin-docker-candidate-be81398b3ade1b591122ee36a0a9566a889b1b2a, expected=admin-docker-candidate-be81398b3ade1b591122ee36a0a9566a889b1b2a
remote-tag-points-to-candidate-sha | candidate-ref | pass | no | yes | remote_tag_sha=be81398b3ade1b591122ee36a0a9566a889b1b2a, expected=be81398b3ade1b591122ee36a0a9566a889b1b2a
github-run-succeeded | github-run | pass | no | yes | status=completed, conclusion=success, run=https://github.com/alin155/mixlab/actions/runs/28361098922
github-run-head-matches-candidate-tag | github-run | pass | no | yes | run.headBranch=admin-docker-candidate-be81398b3ade1b591122ee36a0a9566a889b1b2a, expected_tag=admin-docker-candidate-be81398b3ade1b591122ee36a0a9566a889b1b2a
github-run-head-matches-candidate-sha | github-run | pass | no | yes | run.headSha=be81398b3ade1b591122ee36a0a9566a889b1b2a, expected_sha=be81398b3ade1b591122ee36a0a9566a889b1b2a
local-docker-smoke-passed | smoke | pass | no | yes | local_smoke_passed=true
local-smoke-identity-matches-candidate | smoke | pass | no | yes | image_tag=be81398b3ade1b591122ee36a0a9566a889b1b2a, build_sha=be81398b3ade1b591122ee36a0a9566a889b1b2a, expected=be81398b3ade1b591122ee36a0a9566a889b1b2a
staging-target-matches-candidate | release-boundary | pass | no | yes | staging_target=be81398b3ade1b591122ee36a0a9566a889b1b2a, expected=be81398b3ade1b591122ee36a0a9566a889b1b2a
tag-dry-run-does-not-approve-push-or-deploy | release-boundary | pass | yes | yes | image_push_approval.accepted=false, staging.docker_deploy_allowed=false

## Summary

- Candidate ref blockers: none
- Docker deploy blockers: none

## Next Actions

- Candidate release ref admin-docker-candidate-be81398b3ade1b591122ee36a0a9566a889b1b2a is pinned to be81398b3ade1b591122ee36a0a9566a889b1b2a and has a successful push_images=false dry-run.
- Do not run push_images=true until NAS image proof, current/rollback tags, disk proof, worker proof, Cutter proof, and explicit release approval are present.
- After any push_images=true run, regenerate GitHub run artifact, staging runbook, live-readonly, admin-worker env proof, and Cutter compatibility proof.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260629T091350Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260629T091350Z.md
