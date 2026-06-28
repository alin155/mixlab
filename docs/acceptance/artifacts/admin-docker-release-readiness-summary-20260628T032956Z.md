# Admin Docker Release Readiness Summary

Generated: 2026-06-28T03:29:56.466Z

Mode: admin-docker-release-readiness-summary

Result: blocked

Release review ready: no

Docker upload allowed: no

This summary reads archived artifacts only. It does not contact Docker, NAS, Windows Runner, Admin API, or Cutter API, and it does not approve Docker upload.

## Sources

- Local Docker smoke: .local-dev/admin-docker-github-runs/28309759979/mixlab-admin-docker-release-gates/admin-docker-local-smoke-20260628T031519Z.json
- Live readonly: docs/acceptance/artifacts/admin-docker-release-live-readonly-20260628T032524Z.json
- Parity plan: .local-dev/admin-docker-github-runs/28309759979/mixlab-admin-docker-release-gates/admin-docker-version-parity-plan-20260628T031627Z.json
- Worker proof: .local-dev/admin-docker-github-runs/28309759979/mixlab-admin-docker-release-gates/admin-worker-env-proof-20260628T031628Z.json
- Cutter proof: .local-dev/admin-docker-github-runs/28309759979/mixlab-admin-docker-release-gates/admin-cutter-compatibility-proof-20260628T031628Z.json
- Release inputs intake: docs/acceptance/artifacts/admin-docker-nas-release-inputs-intake-20260628T032932Z.json
- Staging runbook: .local-dev/admin-docker-github-runs/28309759979/mixlab-admin-docker-release-gates/admin-docker-staging-runbook-20260628T031730Z.json

## Observations

- Local Docker smoke passed: true; blockers: none
- Live blockers: current-admin-api-contract-live, auth-context-live, build-version-health, version-health-parity-contract-live, preprocess-disk, disk-space-protection-contract-live, usage-events-tolerance, usage-events-repair-contract-live, processing-recovery, processing-recovery-contract-live, current-index, data-loading-contract-live, admin-worker-env-proof-contract-live, admin-worker-live-flags, cutter-compatibility-proof-contract-live, cutter-release-compatibility-live
- Parity blockers: live-artifact-targeted, admin-web-root-observed, admin-api-proxy-observed, current-admin-api-contract-parity, version-health-parity-contract, admin-worker-env-proof-contract, cutter-compatibility-proof-contract, docker-library-root-parity, admin-worker-env-external-proof, cutter-compatibility-external-proof
- Worker accepted: false; blockers: env-file-provided, inspect-json-provided, env-file-worker-flags-disabled, inspect-worker-flags-disabled, admin-worker-library-roots, admin-worker-image-observed
- Cutter accepted: false; blockers: windows-acceptance-report-provided, windows-acceptance-passed, reviewed-auth-mode, public-library-ready-count, public-library-first-page-readable, release-version-matches-expected, search-protocol-readable, transcript-detail-readable, real-cut-report-provided, real-cut-smoke-passed, real-cut-output-produced, real-cut-core-phases-done
- Release-inputs intake complete: false; blockers: returned-dir-provided, returned-files-complete, nas-image-proof-accepted, admin-worker-proof-accepted, nas-disk-proof-accepted, release-inputs-generated, staging-runbook-generated
- Release inputs ready: false; blockers: returned-dir-provided, returned-files-complete, nas-image-proof-accepted, release-inputs-generated, release-inputs-ready
- Staging ready: false; blockers: current-image-tag-provided, rollback-image-tag-provided, target-differs-from-current, rollback-tag-matches-current, image-push-explicitly-approved, parity-report-blockers-clear, worker-env-proof-accepted, cutter-compatibility-proof-accepted
- Unresolved parity blockers: live-artifact-targeted, admin-web-root-observed, admin-api-proxy-observed, current-admin-api-contract-parity, version-health-parity-contract, admin-worker-env-proof-contract, cutter-compatibility-proof-contract, docker-library-root-parity, admin-worker-env-external-proof, cutter-compatibility-external-proof
- Resolved external parity blockers: none

## Gates

| Gate | Category | Status | Blocks Release Review | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- |
summary-no-side-effects | safety | pass | no | This summary reads archived artifacts only; it does not contact Docker, NAS, Windows Runner, Admin API, or Cutter API. | n/a
local-docker-smoke-passed | local-smoke | pass | no | Local Docker smoke passed with local images, compose stack, endpoint probes, and admin-worker env proof. | Run validate:admin-docker-local-smoke with MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_RUN=1 on a Docker-capable machine and require local_smoke_passed:true.
live-readonly-blockers-clear | live-nas | blocked | yes | Live blockers: current-admin-api-contract-live, auth-context-live, build-version-health, version-health-parity-contract-live, preprocess-disk, disk-space-protection-contract-live, usage-events-tolerance, usage-events-repair-contract-live, processing-recovery, processing-recovery-contract-live, current-index, data-loading-contract-live, admin-worker-env-proof-contract-live, admin-worker-live-flags, cutter-compatibility-proof-contract-live, cutter-release-compatibility-live | Rerun the GET-only live-readonly probe after the staged target exposes current endpoints and live gates pass.
parity-plan-blockers-clear | parity | blocked | yes | Parity blockers: live-artifact-targeted, admin-web-root-observed, admin-api-proxy-observed, current-admin-api-contract-parity, version-health-parity-contract, admin-worker-env-proof-contract, cutter-compatibility-proof-contract, docker-library-root-parity, admin-worker-env-external-proof, cutter-compatibility-external-proof | Current Admin API contract, disk risk, worker proof, and Cutter proof blockers must be cleared.
worker-proof-accepted | worker | blocked | yes | worker status=blocked, blockers=env-file-provided, inspect-json-provided, env-file-worker-flags-disabled, inspect-worker-flags-disabled, admin-worker-library-roots, admin-worker-image-observed | Provide accepted NAS admin-worker env and inspect proof.
cutter-proof-accepted | cutter | blocked | yes | cutter status=blocked, blockers=windows-acceptance-report-provided, windows-acceptance-passed, reviewed-auth-mode, public-library-ready-count, public-library-first-page-readable, release-version-matches-expected, search-protocol-readable, transcript-detail-readable, real-cut-report-provided, real-cut-smoke-passed, real-cut-output-produced, real-cut-core-phases-done | Provide accepted staged-candidate Windows Cutter compatibility proof.
nas-release-inputs-intake-complete | release-inputs | blocked | yes | intake blockers: returned-dir-provided, returned-files-complete, nas-image-proof-accepted, admin-worker-proof-accepted, nas-disk-proof-accepted, release-inputs-generated, staging-runbook-generated | Run the NAS collector, copy admin-docker-release-inputs/ back locally, then run intake:admin-docker-nas-release-inputs until intake_complete=true.
release-inputs-ready | release-inputs | blocked | yes | release input blockers: returned-dir-provided, returned-files-complete, nas-image-proof-accepted, release-inputs-generated, release-inputs-ready | Release inputs must be regenerated from accepted pre-staging, candidate-ref, and NAS current-image proof.
staging-runbook-ready | runbook | blocked | yes | staging blockers: current-image-tag-provided, rollback-image-tag-provided, target-differs-from-current, rollback-tag-matches-current, image-push-explicitly-approved, parity-report-blockers-clear, worker-env-proof-accepted, cutter-compatibility-proof-accepted | Regenerate the staging runbook after explicit tags and evidence gates are satisfied.
summary-does-not-approve-upload | safety | pass | no | staging_runbook.docker_deploy_allowed=false, release_inputs_intake.push_execution_allowed=false, release_inputs_intake.docker_deploy_allowed=false | Docker upload must remain a separate release decision even when evidence gates are ready.

## Next Actions

- Update or stage a NAS Docker image exposing the current Admin API contract endpoints, then rerun the GET-only live-readonly probe and parity plan.
- Update or stage a NAS Docker image exposing admin_worker_env_proof from /api/admin/release-gates, then rerun the GET-only live-readonly probe and parity plan.
- Update or stage a NAS Docker image exposing cutter_compatibility_proof from /api/admin/release-gates, then rerun the GET-only live-readonly probe and parity plan.
- Resolve NAS disk pressure before staging; do not treat low free space as a cosmetic warning.
- Collect NAS-exported admin-worker env and inspect evidence, then rerun validate:admin-worker-env-proof.
- After a separately gated staged candidate exists, run Windows Cutter windows_acceptance and real_cut_smoke, then rerun validate:admin-cutter-compatibility-proof.
- Run the NAS release-inputs collector, copy admin-docker-release-inputs/ back to the Mac repo, then rerun intake:admin-docker-nas-release-inputs. Current intake blockers: returned-dir-provided, returned-files-complete, nas-image-proof-accepted, admin-worker-proof-accepted, nas-disk-proof-accepted, release-inputs-generated, staging-runbook-generated.
- Regenerate release inputs from accepted pre-staging, candidate-ref, and NAS current-image proof before release review. Current release-input blockers: returned-dir-provided, returned-files-complete, nas-image-proof-accepted, release-inputs-generated, release-inputs-ready.
- Run the Admin Docker GitHub workflow manually with push_images=true after local Docker smoke passes, then set MIXLAB_DOCKER_PUSH_APPROVAL=workflow_dispatch:push_images=true for the staging runbook.
- Provide explicit current, target, and rollback Docker image tags before release review.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T032956Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T032956Z.md
