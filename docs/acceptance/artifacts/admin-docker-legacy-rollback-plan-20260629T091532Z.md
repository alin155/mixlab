# Admin Docker Legacy Rollback Plan

Generated: 2026-06-29T09:15:32.825Z
Mode: admin-docker-legacy-rollback-plan
Result: blocked
Exception plan ready: no
Release execution allowed: no
Docker deploy allowed: no

## Observations

- Current image tag: 9c015b9105e97954240020781f79daae3f954bde
- Target image tag: be81398b3ade1b591122ee36a0a9566a889b1b2a
- Current proof blockers: none
- Workflow pushes latest: no
- Compose defaults latest: no
- Reason: Current evidence is not sufficient to consider a legacy latest rollback exception.

## Gates

| Gate | Status | Blocks Exception Plan | Blocks Release Decision | Evidence |
| --- | --- | --- | --- | --- |
| legacy-rollback-plan-no-side-effects | pass | no | no | This report reads archived evidence and local deployment templates only; it does not contact NAS, Docker, GHCR, GitHub, Admin API, or Cutter. |
| nas-image-proof-provided | pass | no | yes | docs/acceptance/artifacts/admin-docker-nas-image-proof-20260629T080002Z.json |
| current-state-is-legacy-latest | blocked | yes | yes | env=9c015b9105e97954240020781f79daae3f954bde, service_tags=9c015b9105e97954240020781f79daae3f954bde |
| only-stable-rollback-tag-blocker | blocked | yes | yes | image proof status=accepted, blockers=none |
| github-candidate-ready | pass | no | yes | github_candidate_artifact_ready=true, target=be81398b3ade1b591122ee36a0a9566a889b1b2a |
| target-tag-immutable | pass | no | yes | target=be81398b3ade1b591122ee36a0a9566a889b1b2a |
| workflow-does-not-push-latest | pass | no | yes | pushes_sha_tag=true, pushes_latest=false |
| compose-requires-explicit-target-tag | pass | no | yes | explicit_tag=true, defaults_latest=false |
| explicit-legacy-rollback-exception-approval | blocked | no | yes | This plan intentionally does not approve using latest as rollback; it only makes the exception reviewable. |

## Plan

### Pre-Push Proof
- Archive the current NAS image proof, worker env proof, disk proof, live-readonly report, and this legacy rollback plan.
- Record that the current production Admin stack is legacy latest and that no immutable rollback tag exists.
- Do not edit NAS .env, pull images, restart containers, enable workers, or run preprocess during this proof step.

### Push Candidate
- After explicit approval only, run the Admin Docker workflow with push_images=true for immutable candidate be81398b3ade1b591122ee36a0a9566a889b1b2a.
- Do not pass latest as the target image tag; the candidate images must be published with the Git SHA tag only.
- Recollect GitHub run artifact/readiness after the push workflow completes.

### Stage Candidate
- Set MIXLAB_IMAGE_TAG=be81398b3ade1b591122ee36a0a9566a889b1b2a only in the NAS staging .env copy.
- Keep MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=0 and MIXLAB_ENABLE_READY_PUBLISH_WORKER=0 for initial staging.
- Run the normal staging runbook only after release inputs, disk proof, and explicit approval gates are satisfied.

### Rollback
- Rollback exception candidate: restore the prior staging .env value MIXLAB_IMAGE_TAG=latest only if the release owner accepted this one-time legacy rollback path.
- After rollback, rerun live-readonly and Cutter compatibility proof before declaring service restored.
- Do not use latest as a continuing steady-state tag after MVP v0.1; replace it with immutable current/rollback tags in the next release cycle.

### Post-Stage Acceptance
- Rerun GET-only live-readonly and version/API parity against the staged Admin target.
- Collect accepted admin-worker env proof with standalone workers disabled and /data/PublicLibrary roots.
- Run Windows Cutter staged-candidate compatibility proof, including windows_acceptance and real_cut_smoke.
- Verify ready count remains 10471 and current index remains v010471 before any final acceptance.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-legacy-rollback-plan-20260629T091532Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-legacy-rollback-plan-20260629T091532Z.md
