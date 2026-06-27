# Admin Redundancy Governance Audit

Generated: 2026-06-27T09:12:06.687Z

Mode: admin-redundancy-governance-audit

Result: blocked

Cleanup ready: no

Cleanup allowed: no

This audit is evidence-only. It does not delete, move, rewrite, or refactor production code.

## Scope

- Scan roots: apps/admin-web/src, packages/admin-api/src, packages/library-fs/src
- Large file threshold: 700 lines
- Governance terms: fixture, fallback, legacy, mock, deprecated, TODO

## Summary

- Files scanned: 302
- CSS files scanned: 2
- Duplicate selector candidates: 40
- Large file candidates: 19
- Term hotspot candidates: 28
- Cleanup blockers: css-duplicate-selectors-reviewed, large-admin-files-reviewed, fixture-fallback-legacy-hotspots-reviewed

## Gates

| Gate | Category | Status | Blocks Cleanup | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- |
audit-no-side-effects | safety | pass | no | This report reads source files and writes acceptance artifacts only; it does not delete, move, or rewrite production code. | n/a
cleanup-remains-targeted | governance | pass | no | The audit records cleanup candidates but does not authorize broad deletion without replacement paths and tests. | n/a
css-duplicate-selectors-reviewed | css | blocked | yes | 40 duplicate CSS selector candidates require review. | For each selected CSS duplicate cleanup, provide the replacement selector/component path and run Admin Web visual or browser QA.
large-admin-files-reviewed | code-size | blocked | yes | 19 files meet or exceed 700 lines and need targeted ownership decisions. | Large files should be split only along established query/command/page/component boundaries with focused tests.
fixture-fallback-legacy-hotspots-reviewed | fallbacks | blocked | yes | 28 files contain fixture/fallback/legacy/mock/deprecated/TODO terms and need classification before cleanup. | Classify each cleanup candidate as test fixture, safe fallback, legacy compatibility, or removable dead code before editing.

## Duplicate Selectors

- selector: .admin-app .ml-inspector; count: 19; files: apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css
- selector: .admin-shell; count: 17; files: apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css
- selector: .admin-content-split; count: 15; files: apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css
- selector: .admin-metric-tile; count: 15; files: apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css
- selector: .admin-app .ml-sidebar; count: 14; files: apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css
- selector: .admin-app .ml-source-table th; count: 13; files: apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css
- selector: .admin-smart-scan-card; count: 13; files: apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css
- selector: body; count: 13; files: apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css
- selector: .admin-app .ml-sidebar-item; count: 12; files: apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css
- selector: .admin-app; count: 11; files: apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css
- selector: .admin-console-statusbar; count: 11; files: apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css
- selector: .admin-list-panel; count: 11; files: apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css
- selector: .admin-workspace; count: 11; files: apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css
- selector: .admin-core-path-card; count: 10; files: apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css
- selector: .admin-kpi-grid; count: 10; files: apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css
- selector: .admin-app .admin-primary-button; count: 9; files: apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css
- selector: .admin-app .admin-secondary-button; count: 9; files: apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css
- selector: .admin-app .ml-sidebar-footer; count: 9; files: apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css
- selector: .admin-app .ml-sidebar-item.is-active; count: 9; files: apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css
- selector: .admin-list-panel h2; count: 9; files: apps/admin-web/src/admin-reference.css, apps/admin-web/src/styles.css

## Large Files

- path: apps/admin-web/src/styles.css; line_count: 6160
- path: packages/admin-api/src/index.test.ts; line_count: 4448
- path: apps/admin-web/src/admin-app.test.ts; line_count: 2762
- path: packages/admin-api/src/admin-read-model-store.ts; line_count: 2683
- path: apps/admin-web/src/api.ts; line_count: 2480
- path: apps/admin-web/src/app/AdminApp.tsx; line_count: 2472
- path: packages/admin-api/src/admin-read-model-store.test.ts; line_count: 2176
- path: apps/admin-web/src/api.test.ts; line_count: 1574
- path: packages/library-fs/src/usage-events.ts; line_count: 1355
- path: apps/admin-web/src/admin-reference.css; line_count: 1184
- path: packages/library-fs/src/cutter-release.ts; line_count: 1120
- path: packages/library-fs/src/cutter-users.test.ts; line_count: 1077
- path: packages/admin-api/src/index.ts; line_count: 1050
- path: apps/admin-web/src/features/dashboard/DashboardPage.tsx; line_count: 940
- path: packages/library-fs/src/cutter-source-library.ts; line_count: 921
- path: packages/library-fs/src/cutter-users.ts; line_count: 890
- path: apps/admin-web/src/features/preprocess-jobs/PreprocessJobsPage.tsx; line_count: 854
- path: packages/library-fs/src/usage-events.test.ts; line_count: 796
- path: apps/admin-web/src/features/operation-log/OperationLogPage.tsx; line_count: 786

## Term Hotspots

- path: apps/admin-web/src/fixtures/admin-data-loading-plan.ts; count: 35; terms: fixture, fallback
- path: apps/admin-web/src/api.test.ts; count: 32; terms: fixture, fallback
- path: apps/admin-web/src/admin-app.test.ts; count: 18; terms: fixture, fallback, legacy
- path: apps/admin-web/src/fixtures/admin-fixture-operation-log.ts; count: 17; terms: fixture
- path: apps/admin-web/src/api.ts; count: 13; terms: fixture, fallback
- path: packages/admin-api/src/admin-data-loading-plan.ts; count: 12; terms: fallback
- path: apps/admin-web/src/fixtures/admin-fixture-data.ts; count: 10; terms: fixture
- path: apps/admin-web/src/fixtures/admin-fixture-operations-overview.ts; count: 10; terms: fixture
- path: packages/admin-api/src/admin-source-video-list-query.test.ts; count: 6; terms: fallback
- path: packages/library-fs/src/cutter-source-library.ts; count: 6; terms: fallback
- path: packages/admin-api/src/admin-preprocess-jobs-read-services.test.ts; count: 5; terms: fallback
- path: packages/admin-api/src/admin-preprocess-read-routes.ts; count: 5; terms: fallback
- path: packages/library-fs/src/usage-events.ts; count: 5; terms: fallback
- path: packages/library-fs/src/usage-events.test.ts; count: 4; terms: fallback
- path: apps/admin-web/src/features/preprocess-jobs/PreprocessJobsPage.tsx; count: 3; terms: fallback
- path: packages/admin-api/src/admin-source-video-status-page-query.test.ts; count: 3; terms: fallback
- path: packages/library-fs/src/cutter-source-library.test.ts; count: 3; terms: fallback
- path: packages/library-fs/src/scanner.test.ts; count: 3; terms: legacy
- path: packages/admin-api/src/admin-preprocess-jobs-read-facade.test.ts; count: 2; terms: fallback
- path: packages/admin-api/src/admin-primary-source-videos-path.test.ts; count: 2; terms: fallback

## Artifacts

- JSON: docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T091206Z.json
- Markdown: docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T091206Z.md
