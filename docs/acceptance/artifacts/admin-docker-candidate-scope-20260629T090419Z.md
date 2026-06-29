# Admin Docker Candidate Scope

Generated: 2026-06-29T09:04:19.985Z
Mode: admin-docker-candidate-scope
Branch: codex/windows-first-run-autostart-20260615104835
HEAD: 8421248e3d359dd2975e68af527822c412d09fa9

## Decision

- Total changed paths: 98
- Current worktree clean: no
- Candidate scope review ready: yes
- Selective candidate commit ready: yes
- Remote workflow proof possible from current worktree: no
- Blockers: current-worktree-dirty

## Buckets

| Bucket | Severity | Count | Omitted |
| --- | --- | ---: | ---: |
| mvp_candidate_code | candidate | 15 | 0 |
| planning_docs | evidence | 2 | 0 |
| acceptance_evidence | evidence | 81 | 0 |
| local_generated_artifact | exclude | 0 | 0 |
| cutter_impact_review | review | 0 | 0 |
| unknown_review | review | 0 | 0 |

## Path Samples

### mvp_candidate_code

-  M apps/admin-web/src/admin-app.test.ts
-  M apps/admin-web/src/features/dashboard/DashboardPage.tsx
-  M package.json
-  M scripts/acceptance/admin-cutter-compatibility-proof.test.ts
-  M scripts/acceptance/admin-cutter-compatibility-proof.ts
-  M scripts/acceptance/admin-docker-push-decision-package.test.ts
-  M scripts/acceptance/admin-docker-push-decision-package.ts
-  M scripts/acceptance/admin-docker-release-live-readonly.test.ts
-  M scripts/acceptance/admin-docker-release-live-readonly.ts
-  M scripts/acceptance/admin-docker-release-readiness-summary.test.ts
-  M scripts/acceptance/admin-docker-release-readiness-summary.ts
- ?? scripts/acceptance/admin-docker-post-release-smoke.test.ts
- ?? scripts/acceptance/admin-docker-post-release-smoke.ts
- ?? scripts/acceptance/admin-docker-release-owner-runbook.test.ts
- ?? scripts/acceptance/admin-docker-release-owner-runbook.ts


### planning_docs

-  M docs/architecture/admin-docker-mvp-v0.1-plan.md
-  M docs/operations/mixlab-environment-registry.md


### acceptance_evidence

- ?? docs/acceptance/artifacts/admin-cutter-compatibility-proof-20260629T081456Z.json
- ?? docs/acceptance/artifacts/admin-cutter-compatibility-proof-20260629T081456Z.md
- ?? docs/acceptance/artifacts/admin-cutter-compatibility-proof-20260629T081635Z.json
- ?? docs/acceptance/artifacts/admin-cutter-compatibility-proof-20260629T081635Z.md
- ?? docs/acceptance/artifacts/admin-docker-candidate-scope-20260629T082906Z.json
- ?? docs/acceptance/artifacts/admin-docker-candidate-scope-20260629T082906Z.md
- ?? docs/acceptance/artifacts/admin-docker-candidate-scope-20260629T084652Z.json
- ?? docs/acceptance/artifacts/admin-docker-candidate-scope-20260629T084652Z.md
- ?? docs/acceptance/artifacts/admin-docker-candidate-scope-20260629T085930Z.json
- ?? docs/acceptance/artifacts/admin-docker-candidate-scope-20260629T085930Z.md
- ?? docs/acceptance/artifacts/admin-docker-github-artifact-readiness-20260629T064229Z.json
- ?? docs/acceptance/artifacts/admin-docker-github-artifact-readiness-20260629T064229Z.md
- ?? docs/acceptance/artifacts/admin-docker-github-run-artifact-20260629T064229Z.json
- ?? docs/acceptance/artifacts/admin-docker-github-run-artifact-20260629T064229Z.md
- ?? docs/acceptance/artifacts/admin-docker-image-push-proof-20260629T064248Z.json
- ?? docs/acceptance/artifacts/admin-docker-image-push-proof-20260629T064248Z.md
- ?? docs/acceptance/artifacts/admin-docker-nas-disk-proof-20260629T075816Z.json
- ?? docs/acceptance/artifacts/admin-docker-nas-disk-proof-20260629T075816Z.md
- ?? docs/acceptance/artifacts/admin-docker-nas-disk-proof-20260629T080002Z.json
- ?? docs/acceptance/artifacts/admin-docker-nas-disk-proof-20260629T080002Z.md
- ?? docs/acceptance/artifacts/admin-docker-nas-image-proof-20260629T075752Z.json
- ?? docs/acceptance/artifacts/admin-docker-nas-image-proof-20260629T075752Z.md
- ?? docs/acceptance/artifacts/admin-docker-nas-image-proof-20260629T080002Z.json
- ?? docs/acceptance/artifacts/admin-docker-nas-image-proof-20260629T080002Z.md
- ?? docs/acceptance/artifacts/admin-docker-nas-release-inputs-intake-20260629T075934Z.json
- ?? docs/acceptance/artifacts/admin-docker-nas-release-inputs-intake-20260629T075934Z.md
- ?? docs/acceptance/artifacts/admin-docker-nas-release-inputs-intake-20260629T080002Z.json
- ?? docs/acceptance/artifacts/admin-docker-nas-release-inputs-intake-20260629T080002Z.md
- ?? docs/acceptance/artifacts/admin-docker-push-decision-package-20260629T082516Z.json
- ?? docs/acceptance/artifacts/admin-docker-push-decision-package-20260629T082516Z.md
- ?? docs/acceptance/artifacts/admin-docker-push-decision-package-20260629T082616Z.json
- ?? docs/acceptance/artifacts/admin-docker-push-decision-package-20260629T082616Z.md
- ?? docs/acceptance/artifacts/admin-docker-release-inputs-20260629T080002Z.json
- ?? docs/acceptance/artifacts/admin-docker-release-inputs-20260629T080002Z.md
- ?? docs/acceptance/artifacts/admin-docker-release-inputs-20260629T081645Z.json
- ?? docs/acceptance/artifacts/admin-docker-release-inputs-20260629T081645Z.md
- ?? docs/acceptance/artifacts/admin-docker-release-live-readonly-20260629T075414Z.json
- ?? docs/acceptance/artifacts/admin-docker-release-live-readonly-20260629T075414Z.md
- ?? docs/acceptance/artifacts/admin-docker-release-live-readonly-20260629T080600Z.json
- ?? docs/acceptance/artifacts/admin-docker-release-live-readonly-20260629T080600Z.md
- ?? docs/acceptance/artifacts/admin-docker-release-live-readonly-20260629T080718Z.json
- ?? docs/acceptance/artifacts/admin-docker-release-live-readonly-20260629T080718Z.md
- ?? docs/acceptance/artifacts/admin-docker-release-owner-runbook-20260629T084515Z.json
- ?? docs/acceptance/artifacts/admin-docker-release-owner-runbook-20260629T084515Z.md
- ?? docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260629T080121Z.json
- ?? docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260629T080121Z.md
- ?? docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260629T080741Z.json
- ?? docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260629T080741Z.md
- ?? docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260629T081511Z.json
- ?? docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260629T081511Z.md
- ?? docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260629T081730Z.json
- ?? docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260629T081730Z.md
- ?? docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260629T081908Z.json
- ?? docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260629T081908Z.md
- ?? docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260629T082636Z.json
- ?? docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260629T082636Z.md
- ?? docs/acceptance/artifacts/admin-docker-staging-runbook-20260629T064325Z.json
- ?? docs/acceptance/artifacts/admin-docker-staging-runbook-20260629T064325Z.md
- ?? docs/acceptance/artifacts/admin-docker-staging-runbook-20260629T080002Z.json
- ?? docs/acceptance/artifacts/admin-docker-staging-runbook-20260629T080002Z.md
- ?? docs/acceptance/artifacts/admin-docker-staging-runbook-20260629T081717Z.json
- ?? docs/acceptance/artifacts/admin-docker-staging-runbook-20260629T081717Z.md
- ?? docs/acceptance/artifacts/admin-docker-version-parity-plan-20260629T075922Z.json
- ?? docs/acceptance/artifacts/admin-docker-version-parity-plan-20260629T075922Z.md
- ?? docs/acceptance/artifacts/admin-docker-version-parity-plan-20260629T080730Z.json
- ?? docs/acceptance/artifacts/admin-docker-version-parity-plan-20260629T080730Z.md
- ?? docs/acceptance/artifacts/admin-real-nas-performance-20260629T090042Z.json
- ?? docs/acceptance/artifacts/admin-real-nas-performance-20260629T090042Z.md
- ?? docs/acceptance/artifacts/admin-real-nas-performance-20260629T090104Z.json
- ?? docs/acceptance/artifacts/admin-real-nas-performance-20260629T090104Z.md
- ?? docs/acceptance/artifacts/admin-real-nas-performance-20260629T090135Z.json
- ?? docs/acceptance/artifacts/admin-real-nas-performance-20260629T090135Z.md
- ?? docs/acceptance/artifacts/admin-real-nas-performance-isolated-20260629T090041Z.json
- ?? docs/acceptance/artifacts/admin-real-nas-performance-isolated-20260629T090041Z.md
- ?? docs/acceptance/artifacts/admin-worker-env-proof-20260629T075751Z.json
- ?? docs/acceptance/artifacts/admin-worker-env-proof-20260629T075751Z.md
- ?? docs/acceptance/artifacts/admin-worker-env-proof-20260629T080002Z.json
- ?? docs/acceptance/artifacts/admin-worker-env-proof-20260629T080002Z.md
- ?? docs/acceptance/artifacts/desktop_incident_diagnostics-20260629T081206Z-bd79fd9c/
- ?? docs/acceptance/artifacts/real_cut_smoke-20260629T081035Z-a7f1268a/
- ?? docs/acceptance/artifacts/windows_acceptance-20260629T080956Z-fb782766/


### local_generated_artifact

- none


### cutter_impact_review

- none


### unknown_review

- none


## Next Actions

- Create a selective candidate commit from mvp_candidate_code plus intentional planning/evidence docs, then run the GitHub Docker workflow on that commit.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-candidate-scope-20260629T090419Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-candidate-scope-20260629T090419Z.md
