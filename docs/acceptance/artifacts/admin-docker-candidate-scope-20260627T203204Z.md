# Admin Docker Candidate Scope

Generated: 2026-06-27T20:32:04.215Z
Mode: admin-docker-candidate-scope
Branch: codex/windows-first-run-autostart-20260615104835
HEAD: 8060f31b9a4e582f23db4962f371550e5bf267ab

## Decision

- Total changed paths: 1126
- Current worktree clean: no
- Candidate scope review ready: yes
- Selective candidate commit ready: yes
- Remote workflow proof possible from current worktree: no
- Blockers: current-worktree-dirty

## Buckets

| Bucket | Severity | Count | Omitted |
| --- | --- | ---: | ---: |
| mvp_candidate_code | candidate | 365 | 245 |
| planning_docs | evidence | 7 | 0 |
| acceptance_evidence | evidence | 754 | 634 |
| local_generated_artifact | exclude | 0 | 0 |
| cutter_impact_review | review | 0 | 0 |
| unknown_review | review | 0 | 0 |

## Path Samples

### mvp_candidate_code

- M  .github/workflows/docker-admin.yml
- M  .gitignore
- M  apps/admin-web/index.html
- M  apps/admin-web/src/admin-app.test.ts
- A  apps/admin-web/src/admin-auth-client.test.ts
- A  apps/admin-web/src/admin-auth-client.ts
- A  apps/admin-web/src/admin-http.test.ts
- A  apps/admin-web/src/admin-http.ts
- A  apps/admin-web/src/admin-operations-client.test.ts
- A  apps/admin-web/src/admin-operations-client.ts
- A  apps/admin-web/src/admin-source-video-client.test.ts
- A  apps/admin-web/src/admin-source-video-client.ts
- A  apps/admin-web/src/admin-source-video-media.ts
- M  apps/admin-web/src/api.test.ts
- M  apps/admin-web/src/api.ts
- M  apps/admin-web/src/app/AdminApp.tsx
- A  apps/admin-web/src/app/command-cancellation-policy.test.ts
- A  apps/admin-web/src/app/command-cancellation-policy.ts
- M  apps/admin-web/src/app/navigation.ts
- A  apps/admin-web/src/app/route-loading-runtime.ts
- A  apps/admin-web/src/app/runtime-observability-labels.ts
- M  apps/admin-web/src/features/admin-ui-contract.test.ts
- M  apps/admin-web/src/features/admin-ui-contract.ts
- M  apps/admin-web/src/features/cutter-users/CutterUsersPage.tsx
- M  apps/admin-web/src/features/dashboard/DashboardPage.tsx
- M  apps/admin-web/src/features/doctor/DoctorPage.tsx
- M  apps/admin-web/src/features/index-publish/IndexPublishPage.tsx
- A  apps/admin-web/src/features/operation-log/OperationLogPage.tsx
- M  apps/admin-web/src/features/preprocess-jobs/PreprocessJobsPage.tsx
- A  apps/admin-web/src/features/protection/ProtectionCenterPage.tsx
- A  apps/admin-web/src/features/protection/api.test.ts
- A  apps/admin-web/src/features/protection/api.ts
- M  apps/admin-web/src/features/settings/SettingsPage.tsx
- M  apps/admin-web/src/features/source-videos/SourceVideosPage.tsx
- A  apps/admin-web/src/fixtures/admin-data-loading-plan.ts
- A  apps/admin-web/src/fixtures/admin-fixture-clone.ts
- A  apps/admin-web/src/fixtures/admin-fixture-data.ts
- A  apps/admin-web/src/fixtures/admin-fixture-operation-log.ts
- A  apps/admin-web/src/fixtures/admin-fixture-operations-overview.ts
- A  apps/admin-web/src/fixtures/admin-fixture-process-history.ts
- A  apps/admin-web/src/fixtures/admin-fixture-read-model-status.ts
- A  apps/admin-web/src/fixtures/admin-fixture-source-data.ts
- A  apps/admin-web/src/fixtures/admin-fixture-source-video-detail.ts
- A  apps/admin-web/src/fixtures/admin-fixture-source-video-mutations.ts
- A  apps/admin-web/src/fixtures/admin-fixture-system-data.ts
- A  apps/admin-web/src/fixtures/admin-fixture-usage-data.ts
- M  apps/admin-web/src/styles.css
- M  deploy/nas/mixlab/.env.example
- M  deploy/nas/mixlab/docker-compose.yml
- M  docker/admin-runtime.Dockerfile
- M  docker/admin-web.Dockerfile
- M  package.json
- A  packages/admin-api/src/admin-auth-commands.test.ts
- A  packages/admin-api/src/admin-auth-commands.ts
- A  packages/admin-api/src/admin-auth-route-deps.test.ts
- A  packages/admin-api/src/admin-auth-route-deps.ts
- A  packages/admin-api/src/admin-auth-routes.test.ts
- A  packages/admin-api/src/admin-auth-routes.ts
- A  packages/admin-api/src/admin-command-audit.test.ts
- A  packages/admin-api/src/admin-command-audit.ts
- A  packages/admin-api/src/admin-command-guard.test.ts
- A  packages/admin-api/src/admin-command-guard.ts
- A  packages/admin-api/src/admin-command-restore-plan.test.ts
- A  packages/admin-api/src/admin-command-restore-plan.ts
- A  packages/admin-api/src/admin-command-restore-route-deps.test.ts
- A  packages/admin-api/src/admin-command-restore-route-deps.ts
- A  packages/admin-api/src/admin-command-restore-routes.test.ts
- A  packages/admin-api/src/admin-command-restore-routes.ts
- A  packages/admin-api/src/admin-command-restore.test.ts
- A  packages/admin-api/src/admin-command-restore.ts
- A  packages/admin-api/src/admin-command-runtime.test.ts
- A  packages/admin-api/src/admin-command-runtime.ts
- A  packages/admin-api/src/admin-command-snapshot.test.ts
- A  packages/admin-api/src/admin-command-snapshot.ts
- A  packages/admin-api/src/admin-current-index-query.test.ts
- A  packages/admin-api/src/admin-current-index-query.ts
- A  packages/admin-api/src/admin-cutter-user-command-route-deps.test.ts
- A  packages/admin-api/src/admin-cutter-user-command-route-deps.ts
- A  packages/admin-api/src/admin-cutter-user-command-routes.test.ts
- A  packages/admin-api/src/admin-cutter-user-command-routes.ts
- A  packages/admin-api/src/admin-cutter-user-commands.test.ts
- A  packages/admin-api/src/admin-cutter-user-commands.ts
- A  packages/admin-api/src/admin-dashboard-metrics-cache.test.ts
- A  packages/admin-api/src/admin-dashboard-metrics-cache.ts
- A  packages/admin-api/src/admin-dashboard-metrics-query.test.ts
- A  packages/admin-api/src/admin-dashboard-metrics-query.ts
- A  packages/admin-api/src/admin-dashboard-read-facade.test.ts
- A  packages/admin-api/src/admin-dashboard-read-facade.ts
- A  packages/admin-api/src/admin-dashboard-read-services.test.ts
- A  packages/admin-api/src/admin-dashboard-read-services.ts
- A  packages/admin-api/src/admin-data-loading-plan.test.ts
- A  packages/admin-api/src/admin-data-loading-plan.ts
- A  packages/admin-api/src/admin-file-fact-readers.test.ts
- A  packages/admin-api/src/admin-file-fact-readers.ts
- A  packages/admin-api/src/admin-health-query.test.ts
- A  packages/admin-api/src/admin-health-query.ts
- A  packages/admin-api/src/admin-health-read-services.test.ts
- A  packages/admin-api/src/admin-health-read-services.ts
- A  packages/admin-api/src/admin-http-session.test.ts
- A  packages/admin-api/src/admin-http-session.ts
- A  packages/admin-api/src/admin-index-command-route-deps.test.ts
- A  packages/admin-api/src/admin-index-command-route-deps.ts
- A  packages/admin-api/src/admin-index-command-routes.test.ts
- A  packages/admin-api/src/admin-index-command-routes.ts
- A  packages/admin-api/src/admin-index-versions-query.test.ts
- A  packages/admin-api/src/admin-index-versions-query.ts
- A  packages/admin-api/src/admin-json-route-dispatcher.test.ts
- A  packages/admin-api/src/admin-json-route-dispatcher.ts
- A  packages/admin-api/src/admin-library-command-route-deps.test.ts
- A  packages/admin-api/src/admin-library-command-route-deps.ts
- A  packages/admin-api/src/admin-library-command-routes.test.ts
- A  packages/admin-api/src/admin-library-command-routes.ts
- A  packages/admin-api/src/admin-library-commands.test.ts
- A  packages/admin-api/src/admin-library-commands.ts
- A  packages/admin-api/src/admin-library-paths.test.ts
- A  packages/admin-api/src/admin-library-paths.ts
- A  packages/admin-api/src/admin-library-status-query.test.ts
- A  packages/admin-api/src/admin-library-status-query.ts
- A  packages/admin-api/src/admin-operation-log.test.ts
- A  packages/admin-api/src/admin-operation-log.ts
- ... 245 more omitted

### planning_docs

- A  docs/architecture/admin-architecture-v1-next-implementation-plan.md
- A  docs/architecture/admin-architecture-v1-phase-0-audit.md
- A  docs/architecture/admin-architecture-v1-requirements-traceability.md
- A  docs/architecture/admin-architecture-v1.md
- A  docs/architecture/admin-docker-mvp-scope-inventory.md
- A  docs/architecture/admin-docker-mvp-v0.1-plan.md
- M  docs/operations/mixlab-environment-registry.md


### acceptance_evidence

- A  docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T210556Z.json
- A  docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T210556Z.md
- A  docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T211026Z.json
- A  docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T211026Z.md
- A  docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T211614Z.json
- A  docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T211614Z.md
- A  docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T212209Z.json
- A  docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T212209Z.md
- A  docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T212653Z.json
- A  docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T212653Z.md
- A  docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T212738Z.json
- A  docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T212738Z.md
- A  docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T213300Z.json
- A  docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T213300Z.md
- A  docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T213657Z.json
- A  docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T213657Z.md
- A  docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T214120Z.json
- A  docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T214120Z.md
- A  docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T214807Z.json
- A  docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T214807Z.md
- A  docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T215351Z.json
- A  docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T215351Z.md
- A  docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T220123Z.json
- A  docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T220123Z.md
- A  docs/acceptance/artifacts/admin-confirm-dialog-css-cleanup-20260627T0828Z.json
- A  docs/acceptance/artifacts/admin-confirm-dialog-css-cleanup-20260627T0828Z.md
- A  docs/acceptance/artifacts/admin-css-governance-classification-20260626T204735Z.json
- A  docs/acceptance/artifacts/admin-css-governance-classification-20260626T204735Z.md
- A  docs/acceptance/artifacts/admin-css-governance-classification-20260626T205258Z.json
- A  docs/acceptance/artifacts/admin-css-governance-classification-20260626T205258Z.md
- A  docs/acceptance/artifacts/admin-css-governance-classification-20260627T082409Z.json
- A  docs/acceptance/artifacts/admin-css-governance-classification-20260627T082409Z.md
- A  docs/acceptance/artifacts/admin-css-governance-classification-20260627T082531Z.json
- A  docs/acceptance/artifacts/admin-css-governance-classification-20260627T082531Z.md
- A  docs/acceptance/artifacts/admin-cutter-compatibility-proof-20260626T202110Z.json
- A  docs/acceptance/artifacts/admin-cutter-compatibility-proof-20260626T202110Z.md
- A  docs/acceptance/artifacts/admin-cutter-compatibility-proof-20260626T202518Z.json
- A  docs/acceptance/artifacts/admin-cutter-compatibility-proof-20260626T202518Z.md
- A  docs/acceptance/artifacts/admin-cutter-compatibility-proof-20260627T152927Z.json
- A  docs/acceptance/artifacts/admin-cutter-compatibility-proof-20260627T152927Z.md
- A  docs/acceptance/artifacts/admin-cutter-compatibility-proof-20260627T194754Z.json
- A  docs/acceptance/artifacts/admin-cutter-compatibility-proof-20260627T194754Z.md
- A  docs/acceptance/artifacts/admin-cutter-users-browser-qa-20260626T171853Z-desktop.png
- A  docs/acceptance/artifacts/admin-cutter-users-browser-qa-20260626T171853Z-mobile.png
- A  docs/acceptance/artifacts/admin-cutter-users-browser-qa-20260626T171853Z.json
- A  docs/acceptance/artifacts/admin-cutter-users-browser-qa-20260626T171853Z.md
- A  docs/acceptance/artifacts/admin-cutter-users-browser-qa-20260626T180022Z-desktop.png
- A  docs/acceptance/artifacts/admin-cutter-users-browser-qa-20260626T180022Z-mobile.png
- A  docs/acceptance/artifacts/admin-cutter-users-browser-qa-20260626T180022Z.json
- A  docs/acceptance/artifacts/admin-cutter-users-browser-qa-20260626T180022Z.md
- A  docs/acceptance/artifacts/admin-cutter-users-browser-qa-20260626T180453Z-desktop.png
- A  docs/acceptance/artifacts/admin-cutter-users-browser-qa-20260626T180453Z-mobile.png
- A  docs/acceptance/artifacts/admin-cutter-users-browser-qa-20260626T180453Z.json
- A  docs/acceptance/artifacts/admin-cutter-users-browser-qa-20260626T180453Z.md
- A  docs/acceptance/artifacts/admin-dashboard-material-summary-single-connection-20260627T102045Z.json
- A  docs/acceptance/artifacts/admin-dashboard-material-summary-single-connection-20260627T102045Z.md
- A  docs/acceptance/artifacts/admin-dashboard-production-summary-query-plan-20260627T101631Z.json
- A  docs/acceptance/artifacts/admin-dashboard-production-summary-query-plan-20260627T101631Z.md
- A  docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T155835Z.json
- A  docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T155835Z.md
- A  docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T155900Z.json
- A  docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T155900Z.md
- A  docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T160602Z.json
- A  docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T160602Z.md
- A  docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T161306Z.json
- A  docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T161306Z.md
- A  docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T161407Z.json
- A  docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T161407Z.md
- A  docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T190102Z.json
- A  docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T190102Z.md
- A  docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T190148Z.json
- A  docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T190148Z.md
- A  docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T194726Z.json
- A  docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T194726Z.md
- A  docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T195510Z.json
- A  docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T195510Z.md
- A  docs/acceptance/artifacts/admin-docker-candidate-scope-20260627T202649Z.json
- A  docs/acceptance/artifacts/admin-docker-candidate-scope-20260627T202649Z.md
- A  docs/acceptance/artifacts/admin-docker-candidate-scope-20260627T202717Z.json
- A  docs/acceptance/artifacts/admin-docker-candidate-scope-20260627T202717Z.md
- A  docs/acceptance/artifacts/admin-docker-candidate-scope-20260627T202831Z.json
- A  docs/acceptance/artifacts/admin-docker-candidate-scope-20260627T202831Z.md
- A  docs/acceptance/artifacts/admin-docker-candidate-scope-20260627T203033Z.json
- A  docs/acceptance/artifacts/admin-docker-candidate-scope-20260627T203033Z.md
- A  docs/acceptance/artifacts/admin-docker-candidate-scope-20260627T203114Z.json
- A  docs/acceptance/artifacts/admin-docker-candidate-scope-20260627T203114Z.md
- A  docs/acceptance/artifacts/admin-docker-github-artifact-readiness-20260627T201432Z.json
- A  docs/acceptance/artifacts/admin-docker-github-artifact-readiness-20260627T201432Z.md
- A  docs/acceptance/artifacts/admin-docker-local-smoke-20260627T191424Z.json
- A  docs/acceptance/artifacts/admin-docker-local-smoke-20260627T191424Z.md
- A  docs/acceptance/artifacts/admin-docker-local-smoke-20260627T192218Z.json
- A  docs/acceptance/artifacts/admin-docker-local-smoke-20260627T192218Z.md
- A  docs/acceptance/artifacts/admin-docker-local-smoke-20260627T193625Z.json
- A  docs/acceptance/artifacts/admin-docker-local-smoke-20260627T193625Z.md
- A  docs/acceptance/artifacts/admin-docker-local-smoke-20260627T194719Z.json
- A  docs/acceptance/artifacts/admin-docker-local-smoke-20260627T194719Z.md
- A  docs/acceptance/artifacts/admin-docker-mvp-v0.1-phase0-readonly-20260627.md
- A  docs/acceptance/artifacts/admin-docker-mvp-v0.1-phase1-surface-gate-20260627.md
- A  docs/acceptance/artifacts/admin-docker-mvp-v0.1-phase2-auth-cutter-users-20260627.md
- A  docs/acceptance/artifacts/admin-docker-mvp-v0.1-phase3-controlled-preprocess-20260627.md
- A  docs/acceptance/artifacts/admin-docker-mvp-v0.1-phase4-docker-candidate-20260627.md
- A  docs/acceptance/artifacts/admin-docker-mvp-v0.1-phase4.10-smoke-tag-binding-20260627.md
- A  docs/acceptance/artifacts/admin-docker-mvp-v0.1-phase4.11-ci-release-gate-artifacts-20260627.md
- A  docs/acceptance/artifacts/admin-docker-mvp-v0.1-phase4.12-local-smoke-derived-candidate-proof-20260627.md
- A  docs/acceptance/artifacts/admin-docker-mvp-v0.1-phase4.13-delivery-readiness-gate-hardening-20260627.md
- A  docs/acceptance/artifacts/admin-docker-mvp-v0.1-phase4.14-github-artifact-readiness-20260627.md
- A  docs/acceptance/artifacts/admin-docker-mvp-v0.1-phase4.15-github-run-artifact-collection-20260627.md
- A  docs/acceptance/artifacts/admin-docker-mvp-v0.1-phase4.16-candidate-scope-audit-20260627.md
- A  docs/acceptance/artifacts/admin-docker-mvp-v0.1-phase4.5-local-docker-smoke-20260627.md
- A  docs/acceptance/artifacts/admin-docker-mvp-v0.1-phase4.6-release-readiness-summary-20260627.md
- A  docs/acceptance/artifacts/admin-docker-mvp-v0.1-phase4.7-ci-smoke-before-push-20260627.md
- A  docs/acceptance/artifacts/admin-docker-mvp-v0.1-phase4.8-explicit-image-push-gate-20260627.md
- A  docs/acceptance/artifacts/admin-docker-mvp-v0.1-phase4.9-staging-push-approval-gate-20260627.md
- A  docs/acceptance/artifacts/admin-docker-release-gate-dry-run-20260626T193919Z.json
- A  docs/acceptance/artifacts/admin-docker-release-gate-dry-run-20260626T193919Z.md
- A  docs/acceptance/artifacts/admin-docker-release-gate-dry-run-20260627T143231Z.json
- A  docs/acceptance/artifacts/admin-docker-release-gate-dry-run-20260627T143231Z.md
- A  docs/acceptance/artifacts/admin-docker-release-gate-dry-run-20260627T144209Z.json
- A  docs/acceptance/artifacts/admin-docker-release-gate-dry-run-20260627T144209Z.md
- A  docs/acceptance/artifacts/admin-docker-release-gate-dry-run-20260627T145208Z.json
- ... 634 more omitted

### local_generated_artifact

- none


### cutter_impact_review

- none


### unknown_review

- none


## Next Actions

- Create a selective candidate commit from mvp_candidate_code plus intentional planning/evidence docs, then run the GitHub Docker workflow on that commit.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-candidate-scope-20260627T203204Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-candidate-scope-20260627T203204Z.md
