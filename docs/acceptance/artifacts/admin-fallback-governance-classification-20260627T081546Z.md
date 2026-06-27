# Admin Fallback Governance Classification

Generated: 2026-06-27T08:15:46.330Z

Mode: admin-fallback-governance-classification

Result: classified

Cleanup allowed: no

This report classifies fixture/fallback/legacy hotspots before any cleanup. It does not delete, move, rewrite, or refactor production code.

## Summary

- Files scanned: 293
- Term hotspots: 28
- Test fixtures: 14
- Fixture runtime boundaries: 6
- Safe fallbacks: 5
- Legacy compatibility: 1
- Removable candidates: 2

## Gates

| Gate | Status | Blocks Cleanup | Evidence |
| --- | --- | --- | --- |
| classification-no-side-effects | pass | no | This report reads source files and writes acceptance artifacts only; it does not delete, move, or rewrite production code. |
| all-term-hotspots-classified | pass | no | 28 term hotspots classified. |
| broad-cleanup-still-blocked | blocked | yes | Cleanup remains targeted only; 2 removable candidates still require line-level proof before edits. |

## Classified Hotspots

| Path | Count | Terms | Classification | Cleanup Policy | Required Evidence |
| --- | ---: | --- | --- | --- | --- |
| apps/admin-web/src/fixtures/admin-data-loading-plan.ts | 35 | fixture, fallback | fixture-runtime-boundary | Keep as the deterministic fixture/runtime boundary until the Admin fixture client or fixture data contract is replaced and tested. | replacement fixture/runtime contract<br>Admin Web fixture tests and at least one browser QA route |
| apps/admin-web/src/api.test.ts | 32 | fixture, fallback | test-fixture | Keep as test-only coverage unless the owning test is replaced with equivalent assertions. | replacement test assertions or approved test deletion<br>focused test run for the owning package |
| apps/admin-web/src/admin-app.test.ts | 18 | fixture, fallback, legacy | test-fixture | Keep as test-only coverage unless the owning test is replaced with equivalent assertions. | replacement test assertions or approved test deletion<br>focused test run for the owning package |
| apps/admin-web/src/fixtures/admin-fixture-operation-log.ts | 17 | fixture | fixture-runtime-boundary | Keep as the deterministic fixture/runtime boundary until the Admin fixture client or fixture data contract is replaced and tested. | replacement fixture/runtime contract<br>Admin Web fixture tests and at least one browser QA route |
| apps/admin-web/src/api.ts | 13 | fixture, fallback | fixture-runtime-boundary | Keep as the deterministic fixture/runtime boundary until the Admin fixture client or fixture data contract is replaced and tested. | replacement fixture/runtime contract<br>Admin Web fixture tests and at least one browser QA route |
| packages/admin-api/src/admin-data-loading-plan.ts | 12 | fallback | safe-fallback | Keep as a production tolerance or compatibility fallback; do not remove without a measured replacement path and regression tests. | runtime metric or compatibility proof showing the fallback is no longer needed<br>focused production-path tests covering missing/malformed/old data<br>rollback note |
| apps/admin-web/src/fixtures/admin-fixture-data.ts | 10 | fixture | fixture-runtime-boundary | Keep as the deterministic fixture/runtime boundary until the Admin fixture client or fixture data contract is replaced and tested. | replacement fixture/runtime contract<br>Admin Web fixture tests and at least one browser QA route |
| apps/admin-web/src/fixtures/admin-fixture-operations-overview.ts | 10 | fixture | fixture-runtime-boundary | Keep as the deterministic fixture/runtime boundary until the Admin fixture client or fixture data contract is replaced and tested. | replacement fixture/runtime contract<br>Admin Web fixture tests and at least one browser QA route |
| packages/admin-api/src/admin-source-video-list-query.test.ts | 6 | fallback | test-fixture | Keep as test-only coverage unless the owning test is replaced with equivalent assertions. | replacement test assertions or approved test deletion<br>focused test run for the owning package |
| packages/library-fs/src/cutter-source-library.ts | 6 | fallback | safe-fallback | Keep as a production tolerance or compatibility fallback; do not remove without a measured replacement path and regression tests. | runtime metric or compatibility proof showing the fallback is no longer needed<br>focused production-path tests covering missing/malformed/old data<br>rollback note |
| packages/admin-api/src/admin-preprocess-jobs-read-services.test.ts | 5 | fallback | test-fixture | Keep as test-only coverage unless the owning test is replaced with equivalent assertions. | replacement test assertions or approved test deletion<br>focused test run for the owning package |
| packages/admin-api/src/admin-preprocess-read-routes.ts | 5 | fallback | safe-fallback | Keep as a production tolerance or compatibility fallback; do not remove without a measured replacement path and regression tests. | runtime metric or compatibility proof showing the fallback is no longer needed<br>focused production-path tests covering missing/malformed/old data<br>rollback note |
| packages/library-fs/src/usage-events.ts | 5 | fallback | safe-fallback | Keep as a production tolerance or compatibility fallback; do not remove without a measured replacement path and regression tests. | runtime metric or compatibility proof showing the fallback is no longer needed<br>focused production-path tests covering missing/malformed/old data<br>rollback note |
| packages/library-fs/src/usage-events.test.ts | 4 | fallback | test-fixture | Keep as test-only coverage unless the owning test is replaced with equivalent assertions. | replacement test assertions or approved test deletion<br>focused test run for the owning package |
| apps/admin-web/src/features/preprocess-jobs/PreprocessJobsPage.tsx | 3 | fallback | safe-fallback | Keep as a production tolerance or compatibility fallback; do not remove without a measured replacement path and regression tests. | runtime metric or compatibility proof showing the fallback is no longer needed<br>focused production-path tests covering missing/malformed/old data<br>rollback note |
| packages/admin-api/src/admin-source-video-status-page-query.test.ts | 3 | fallback | test-fixture | Keep as test-only coverage unless the owning test is replaced with equivalent assertions. | replacement test assertions or approved test deletion<br>focused test run for the owning package |
| packages/library-fs/src/cutter-source-library.test.ts | 3 | fallback | test-fixture | Keep as test-only coverage unless the owning test is replaced with equivalent assertions. | replacement test assertions or approved test deletion<br>focused test run for the owning package |
| packages/library-fs/src/scanner.test.ts | 3 | legacy | test-fixture | Keep as test-only coverage unless the owning test is replaced with equivalent assertions. | replacement test assertions or approved test deletion<br>focused test run for the owning package |
| packages/admin-api/src/admin-preprocess-jobs-read-facade.test.ts | 2 | fallback | test-fixture | Keep as test-only coverage unless the owning test is replaced with equivalent assertions. | replacement test assertions or approved test deletion<br>focused test run for the owning package |
| packages/admin-api/src/admin-primary-source-videos-path.test.ts | 2 | fallback | test-fixture | Keep as test-only coverage unless the owning test is replaced with equivalent assertions. | replacement test assertions or approved test deletion<br>focused test run for the owning package |
| packages/admin-api/src/admin-source-video-status-page-query.ts | 2 | fallback | removable-candidate | Candidate for a future targeted cleanup only after owner review proves the code is unreachable or fully replaced. | line-level owner review<br>replacement path or unreachable-code proof<br>focused tests plus targeted browser/API QA when user-facing |
| packages/admin-api/src/index.test.ts | 2 | fixture | test-fixture | Keep as test-only coverage unless the owning test is replaced with equivalent assertions. | replacement test assertions or approved test deletion<br>focused test run for the owning package |
| apps/admin-web/src/admin-reference.css | 1 | legacy | legacy-compatibility | Keep until the legacy compatibility contract is retired with explicit migration evidence. | explicit migration or deprecation decision<br>tests proving old data/routes/users are no longer supported or are safely migrated |
| apps/admin-web/src/features/source-videos/SourceVideosPage.tsx | 1 | fallback | removable-candidate | Candidate for a future targeted cleanup only after owner review proves the code is unreachable or fully replaced. | line-level owner review<br>replacement path or unreachable-code proof<br>focused tests plus targeted browser/API QA when user-facing |
| apps/admin-web/src/fixtures/admin-fixture-usage-data.ts | 1 | fixture | fixture-runtime-boundary | Keep as the deterministic fixture/runtime boundary until the Admin fixture client or fixture data contract is replaced and tested. | replacement fixture/runtime contract<br>Admin Web fixture tests and at least one browser QA route |
| packages/admin-api/src/admin-auth-routes.test.ts | 1 | fallback | test-fixture | Keep as test-only coverage unless the owning test is replaced with equivalent assertions. | replacement test assertions or approved test deletion<br>focused test run for the owning package |
| packages/admin-api/src/admin-source-video-default-page-query.test.ts | 1 | fallback | test-fixture | Keep as test-only coverage unless the owning test is replaced with equivalent assertions. | replacement test assertions or approved test deletion<br>focused test run for the owning package |
| packages/admin-api/src/admin-source-video-read-facade.test.ts | 1 | fallback | test-fixture | Keep as test-only coverage unless the owning test is replaced with equivalent assertions. | replacement test assertions or approved test deletion<br>focused test run for the owning package |

## Artifacts

- JSON: docs/acceptance/artifacts/admin-fallback-governance-classification-20260627T081546Z.json
- Markdown: docs/acceptance/artifacts/admin-fallback-governance-classification-20260627T081546Z.md
