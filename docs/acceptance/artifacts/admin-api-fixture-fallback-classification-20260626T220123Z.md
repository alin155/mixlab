# Admin API Fixture/Fallback Classification

Generated: 2026-06-26T22:01:23.081Z

Mode: admin-api-fixture-fallback-classification

Result: blocked

Cleanup allowed: no

This report is evidence-only. It does not delete, move, rewrite, or refactor Admin Web API code.

## Summary

- Target file: apps/admin-web/src/api.ts
- Lines scanned: 2714
- Occurrences: 173
- Fixture client boundary: 165
- Route loading fallback contract: 1
- Runtime fallback contract: 3
- Usage metrics field: 4
- Test or mock boundary: 0
- Legacy debt candidate: 0

## Gates

| Gate | Status | Blocks Cleanup | Evidence |
| --- | --- | --- | --- |
classification-no-side-effects | pass | no | The classification reads Admin Web api.ts and writes acceptance artifacts only.
fixture-client-boundary-classified | blocked | yes | 165 fixture-client occurrences need a module ownership decision before extraction or cleanup.
fallback-contracts-preserved | blocked | yes | 4 fallback contract occurrences must be preserved or replaced with tests before cleanup.
api-hotspot-cleanup-still-targeted | pass | no | No mock/legacy/debt candidates were detected.

## Classified Occurrences

| Line | Term | Kind | Text | Cleanup Policy |
| --- | --- | --- | --- | --- |
5 | fixture | fixture-client-boundary | import { createAdminFixtureDataLoadingPlan } from "./fixtures/admin-data-loading-plan.ts"; | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
17 | fixture | fixture-client-boundary | fixtureCommandSnapshotRestorePlan, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
18 | fixture | fixture-client-boundary | fixtureCommandSnapshotRestoreResult, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
19 | fixture | fixture-client-boundary | fixtureOperationLog, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
20 | fixture | fixture-client-boundary | fixtureOperationsOverview, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
21 | fixture | fixture-client-boundary | fixtureReadModelReconcileStatus, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
25 | fixture | fixture-client-boundary | normalizeFixtureSourceFolder, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
27 | fixture | fixture-client-boundary | publishFixtureSourceVideos, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
29 | fixture | fixture-client-boundary | queueFixtureSourceVideos, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
30 | fixture | fixture-client-boundary | recountFixtureSourceVideoState, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
36 | fixture | fixture-client-boundary | updateFixtureSourceVideoCover, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
37 | fixture | fixture-client-boundary | updateFixtureSourceVideoMetadata | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
38 | fixture | fixture-client-boundary | } from "./fixtures/admin-fixture-data.ts"; | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
411 | fallback | usage-metrics-field | fallback_search_count: number; | Do not rename or remove without backend usage-metrics compatibility and dashboard contract tests.
420 | fallback | usage-metrics-field | core_fallback_search_count: number; | Do not rename or remove without backend usage-metrics compatibility and dashboard contract tests.
755 | fallback | route-loading-fallback-contract | fallback: string; | Keep as route-local loading/error contract unless replaced by the data-loading plan contract and page tests.
1896 | fixture | fixture-client-boundary | function fixtureDataLoadingPlan(): AdminDataLoadingPlan { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1897 | fixture | fixture-client-boundary | return createAdminFixtureDataLoadingPlan({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1902 | fixture | fixture-client-boundary | export function createFixtureAdminApiClient(): AdminApiClient { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1903 | fixture | fixture-client-boundary | let fixtureStatus: AdminLibraryStatus = { ...status }; | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1904 | fixture | fixture-client-boundary | let fixturePathChecks: AdminPathCheck[] = pathChecks.map((item) => ({ ...item })); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1905 | fixture | fixture-client-boundary | let fixtureSourceVideos: AdminSourceVideo[] = sourceVideos.map((video) => ({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1909 | fixture | fixture-client-boundary | let fixtureJobs: AdminPreprocessJobsResponse = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1913 | fixture | fixture-client-boundary | let fixtureProcessHistory = clonePreprocessProcessHistory(processHistory); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1914 | fixture | fixture-client-boundary | let fixtureIndexes: AdminIndexVersionsResponse = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1918 | fixture | fixture-client-boundary | let fixtureDoctor: MixlabDoctorReport = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1923 | fixture | fixture-client-boundary | let fixtureSettings = cloneSettings(settings); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1924 | fixture | fixture-client-boundary | let fixtureMetrics = cloneDashboardMetrics(dashboardMetrics); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1925 | fixture | fixture-client-boundary | let fixtureCutterUsers = cutterUsers.map(cloneCutterUser); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1928 | fixture | fixture-client-boundary | const counted = recountFixtureSourceVideoState({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1929 | fixture | fixture-client-boundary | sourceVideos: fixtureSourceVideos, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1930 | fixture | fixture-client-boundary | status: fixtureStatus, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1931 | fixture | fixture-client-boundary | metrics: fixtureMetrics | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1933 | fixture | fixture-client-boundary | fixtureStatus = counted.status; | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1934 | fixture | fixture-client-boundary | fixtureMetrics = counted.metrics; | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1942 | fixture | fixture-client-boundary | const mutation = queueFixtureSourceVideos( | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1944 | fixture | fixture-client-boundary | sourceVideos: fixtureSourceVideos, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1945 | fixture | fixture-client-boundary | jobs: fixtureJobs, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1946 | fixture | fixture-client-boundary | indexes: fixtureIndexes, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1947 | fixture | fixture-client-boundary | status: fixtureStatus, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1948 | fixture | fixture-client-boundary | metrics: fixtureMetrics | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1952 | fixture | fixture-client-boundary | fixtureSourceVideos = mutation.state.sourceVideos; | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1953 | fixture | fixture-client-boundary | fixtureJobs = mutation.state.jobs; | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1954 | fixture | fixture-client-boundary | fixtureStatus = mutation.state.status; | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1955 | fixture | fixture-client-boundary | fixtureMetrics = mutation.state.metrics; | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1959 | fixture | fixture-client-boundary | function publishFixtureSourceVideosAndSave(input: { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1963 | fixture | fixture-client-boundary | const mutation = publishFixtureSourceVideos( | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1965 | fixture | fixture-client-boundary | sourceVideos: fixtureSourceVideos, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1966 | fixture | fixture-client-boundary | jobs: fixtureJobs, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1967 | fixture | fixture-client-boundary | indexes: fixtureIndexes, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1968 | fixture | fixture-client-boundary | status: fixtureStatus, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1969 | fixture | fixture-client-boundary | metrics: fixtureMetrics | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1973 | fixture | fixture-client-boundary | fixtureSourceVideos = mutation.state.sourceVideos; | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1974 | fixture | fixture-client-boundary | fixtureIndexes = mutation.state.indexes; | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1975 | fixture | fixture-client-boundary | fixtureStatus = mutation.state.status; | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1976 | fixture | fixture-client-boundary | fixtureMetrics = mutation.state.metrics; | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1981 | fixture | fixture-client-boundary | const primarySourceFolder = fixtureSettings.source_folders.find((folder) => folder.enabled) | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1982 | fixture | fixture-client-boundary | ?? fixtureSettings.source_folders[0]; | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1983 | fixture | fixture-client-boundary | fixtureStatus = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1984 | fixture | fixture-client-boundary | ...fixtureStatus, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1985 | fixture | fixture-client-boundary | name: fixtureSettings.library_name, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1986 | fixture | fixture-client-boundary | source_videos_path: primarySourceFolder?.path ?? fixtureStatus.source_videos_path | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1990 | fixture | fixture-client-boundary | function saveFixtureSettings(settingsUpdate: AdminSettingsConfigUpdate): AdminSettingsConfig { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1995 | fixture | fixture-client-boundary | const currentById = new Map(fixtureSettings.source_folders.map((folder) => [folder.id, folder])); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1996 | fixture | fixture-client-boundary | fixtureSettings = cloneSettings({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1997 | fixture | fixture-client-boundary | ...fixtureSettings, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2000 | fixture | fixture-client-boundary | normalizeFixtureSourceFolder(currentById.get(folder.id), folder) | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2006 | fixture | fixture-client-boundary | return cloneSettings(fixtureSettings); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2009 | fixture | fixture-client-boundary | function addFixtureSourceFolder(folder: AdminSourceFolderCreate): AdminSettingsConfig { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2012 | fixture | fixture-client-boundary | id: nextSourceFolderId(fixtureSettings.source_folders), | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2017 | fixture | fixture-client-boundary | fixtureSettings = cloneSettings({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2018 | fixture | fixture-client-boundary | ...fixtureSettings, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2019 | fixture | fixture-client-boundary | source_folders: [...fixtureSettings.source_folders, nextFolder], | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2023 | fixture | fixture-client-boundary | return cloneSettings(fixtureSettings); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2026 | fixture | fixture-client-boundary | function updateFixtureSourceFolder( | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2031 | fixture | fixture-client-boundary | fixtureSettings = cloneSettings({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2032 | fixture | fixture-client-boundary | ...fixtureSettings, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2033 | fixture | fixture-client-boundary | source_folders: fixtureSettings.source_folders.map((folder) => { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2039 | fixture | fixture-client-boundary | return normalizeFixtureSourceFolder(folder, { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2052 | fixture | fixture-client-boundary | return cloneSettings(fixtureSettings); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.

## Required Evidence For Cleanup

- backend/admin dashboard compatibility tests for usage metric fields
- data-loading plan contract still names fallback behavior
- failure-mode test proving runtime fallback behavior after refactor
- fixture client behavior parity tests
- focused Admin Web API tests
- post-change fixture/fallback classification artifact
- replacement module path or explicit decision to keep fixture client in api.ts
- route loader/page tests proving local loading and error behavior
- typecheck

## Artifacts

- JSON: docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T220123Z.json
- Markdown: docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T220123Z.md
