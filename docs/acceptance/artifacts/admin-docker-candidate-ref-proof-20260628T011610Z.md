# Admin Docker Candidate Ref Proof

Generated: 2026-06-28T01:16:10.539Z
Mode: admin-docker-candidate-ref-proof
Result: accepted
Candidate ref proof accepted: yes
Docker deploy allowed: no

## Sources

- Artifact dir: /tmp/mixlab-gh-run-28307173676-tag-e94a5bd/mixlab-admin-docker-release-gates
- Local smoke report: /tmp/mixlab-gh-run-28307173676-tag-e94a5bd/mixlab-admin-docker-release-gates/admin-docker-local-smoke-20260628T010837Z.json
- Staging runbook report: /tmp/mixlab-gh-run-28307173676-tag-e94a5bd/mixlab-admin-docker-release-gates/admin-docker-staging-runbook-20260628T011038Z.json
- GitHub run id: 28307173676
- Remote tag ref: refs/tags/admin-docker-candidate-e94a5bdd8fc981b8112cc372df6f18204bb47528

## Candidate

- Expected SHA: e94a5bdd8fc981b8112cc372df6f18204bb47528
- Expected tag: admin-docker-candidate-e94a5bdd8fc981b8112cc372df6f18204bb47528
- Remote tag SHA: e94a5bdd8fc981b8112cc372df6f18204bb47528
- Tag points to expected SHA: yes

## GitHub Run

- Run URL: https://github.com/alin155/mixlab/actions/runs/28307173676
- Head branch: admin-docker-candidate-e94a5bdd8fc981b8112cc372df6f18204bb47528
- Head SHA: e94a5bdd8fc981b8112cc372df6f18204bb47528
- Status: completed
- Conclusion: success

## Observations

- Local smoke passed: true
- Local smoke image tag: e94a5bdd8fc981b8112cc372df6f18204bb47528
- Local smoke build SHA: e94a5bdd8fc981b8112cc372df6f18204bb47528
- Staging target image tag: e94a5bdd8fc981b8112cc372df6f18204bb47528
- Image push approval accepted: false
- Staging Docker deploy allowed: false

## Gates

| Gate | Category | Status | Blocks Ref Proof | Blocks Deploy | Evidence |
| --- | --- | --- | --- | --- | --- |
candidate-ref-proof-no-side-effects | safety | pass | no | no | Reads git tag, GitHub run metadata, and downloaded artifacts only; does not push images, contact NAS, restart containers, enable workers, or write NAS data.
candidate-sha-provided | candidate-ref | pass | no | yes | e94a5bdd8fc981b8112cc372df6f18204bb47528
candidate-tag-pins-sha-name | candidate-ref | pass | no | yes | tag=admin-docker-candidate-e94a5bdd8fc981b8112cc372df6f18204bb47528, expected=admin-docker-candidate-e94a5bdd8fc981b8112cc372df6f18204bb47528
remote-tag-points-to-candidate-sha | candidate-ref | pass | no | yes | remote_tag_sha=e94a5bdd8fc981b8112cc372df6f18204bb47528, expected=e94a5bdd8fc981b8112cc372df6f18204bb47528
github-run-succeeded | github-run | pass | no | yes | status=completed, conclusion=success, run=https://github.com/alin155/mixlab/actions/runs/28307173676
github-run-head-matches-candidate-tag | github-run | pass | no | yes | run.headBranch=admin-docker-candidate-e94a5bdd8fc981b8112cc372df6f18204bb47528, expected_tag=admin-docker-candidate-e94a5bdd8fc981b8112cc372df6f18204bb47528
github-run-head-matches-candidate-sha | github-run | pass | no | yes | run.headSha=e94a5bdd8fc981b8112cc372df6f18204bb47528, expected_sha=e94a5bdd8fc981b8112cc372df6f18204bb47528
local-docker-smoke-passed | smoke | pass | no | yes | local_smoke_passed=true
local-smoke-identity-matches-candidate | smoke | pass | no | yes | image_tag=e94a5bdd8fc981b8112cc372df6f18204bb47528, build_sha=e94a5bdd8fc981b8112cc372df6f18204bb47528, expected=e94a5bdd8fc981b8112cc372df6f18204bb47528
staging-target-matches-candidate | release-boundary | pass | no | yes | staging_target=e94a5bdd8fc981b8112cc372df6f18204bb47528, expected=e94a5bdd8fc981b8112cc372df6f18204bb47528
tag-dry-run-does-not-approve-push-or-deploy | release-boundary | pass | yes | yes | image_push_approval.accepted=false, staging.docker_deploy_allowed=false

## Summary

- Candidate ref blockers: none
- Docker deploy blockers: none

## Next Actions

- Candidate release ref admin-docker-candidate-e94a5bdd8fc981b8112cc372df6f18204bb47528 is pinned to e94a5bdd8fc981b8112cc372df6f18204bb47528 and has a successful push_images=false dry-run.
- Do not run push_images=true until NAS image proof, current/rollback tags, disk proof, worker proof, Cutter proof, and explicit release approval are present.
- After any push_images=true run, regenerate GitHub run artifact, staging runbook, live-readonly, admin-worker env proof, and Cutter compatibility proof.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260628T011610Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260628T011610Z.md
