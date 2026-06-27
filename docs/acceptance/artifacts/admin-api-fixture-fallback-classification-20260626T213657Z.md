# Admin API Fixture/Fallback Classification

Generated: 2026-06-26T21:36:57.015Z

Mode: admin-api-fixture-fallback-classification

Result: blocked

Cleanup allowed: no

This report is evidence-only. It does not delete, move, rewrite, or refactor Admin Web API code.

## Summary

- Target file: apps/admin-web/src/api.ts
- Lines scanned: 3325
- Occurrences: 261
- Fixture client boundary: 253
- Route loading fallback contract: 1
- Runtime fallback contract: 3
- Usage metrics field: 4
- Test or mock boundary: 0
- Legacy debt candidate: 0

## Gates

| Gate | Status | Blocks Cleanup | Evidence |
| --- | --- | --- | --- |
classification-no-side-effects | pass | no | The classification reads Admin Web api.ts and writes acceptance artifacts only.
fixture-client-boundary-classified | blocked | yes | 253 fixture-client occurrences need a module ownership decision before extraction or cleanup.
fallback-contracts-preserved | blocked | yes | 4 fallback contract occurrences must be preserved or replaced with tests before cleanup.
api-hotspot-cleanup-still-targeted | pass | no | No mock/legacy/debt candidates were detected.

## Classified Occurrences

| Line | Term | Kind | Text | Cleanup Policy |
| --- | --- | --- | --- | --- |
5 | fixture | fixture-client-boundary | import { createAdminFixtureDataLoadingPlan } from "./fixtures/admin-data-loading-plan.ts"; | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
20 | fixture | fixture-client-boundary | normalizeFixtureSourceFolder, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
28 | fixture | fixture-client-boundary | } from "./fixtures/admin-fixture-data.ts"; | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
401 | fallback | usage-metrics-field | fallback_search_count: number; | Do not rename or remove without backend usage-metrics compatibility and dashboard contract tests.
410 | fallback | usage-metrics-field | core_fallback_search_count: number; | Do not rename or remove without backend usage-metrics compatibility and dashboard contract tests.
745 | fallback | route-loading-fallback-contract | fallback: string; | Keep as route-local loading/error contract unless replaced by the data-loading plan contract and page tests.
1886 | fixture | fixture-client-boundary | function fixtureDataLoadingPlan(): AdminDataLoadingPlan { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1887 | fixture | fixture-client-boundary | return createAdminFixtureDataLoadingPlan({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1892 | fixture | fixture-client-boundary | export function createFixtureAdminApiClient(): AdminApiClient { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1893 | fixture | fixture-client-boundary | let fixtureStatus: AdminLibraryStatus = { ...status }; | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1894 | fixture | fixture-client-boundary | let fixturePathChecks: AdminPathCheck[] = pathChecks.map((item) => ({ ...item })); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1895 | fixture | fixture-client-boundary | let fixtureSourceVideos: AdminSourceVideo[] = sourceVideos.map((video) => ({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1899 | fixture | fixture-client-boundary | let fixtureJobs: AdminPreprocessJobsResponse = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1903 | fixture | fixture-client-boundary | let fixtureProcessHistory = clonePreprocessProcessHistory(processHistory); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1904 | fixture | fixture-client-boundary | let fixtureIndexes: AdminIndexVersionsResponse = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1908 | fixture | fixture-client-boundary | let fixtureDoctor: MixlabDoctorReport = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1913 | fixture | fixture-client-boundary | let fixtureSettings = cloneSettings(settings); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1914 | fixture | fixture-client-boundary | let fixtureMetrics = cloneDashboardMetrics(dashboardMetrics); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1915 | fixture | fixture-client-boundary | let fixtureCutterUsers = cutterUsers.map(cloneCutterUser); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1918 | fixture | fixture-client-boundary | fixtureStatus = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1919 | fixture | fixture-client-boundary | ...fixtureStatus, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1920 | fixture | fixture-client-boundary | ready_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "ready").length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1921 | fixture | fixture-client-boundary | processing_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "processing").length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1922 | fixture | fixture-client-boundary | queued_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "queued").length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1923 | fixture | fixture-client-boundary | unprocessed_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "unprocessed").length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1924 | fixture | fixture-client-boundary | failed_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "failed").length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1925 | fixture | fixture-client-boundary | index_required_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "index-required").length | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1927 | fixture | fixture-client-boundary | fixtureMetrics = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1928 | fixture | fixture-client-boundary | ...fixtureMetrics, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1930 | fixture | fixture-client-boundary | ...fixtureMetrics.material, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1931 | fixture | fixture-client-boundary | video_count: fixtureSourceVideos.length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1932 | fixture | fixture-client-boundary | ready_video_count: fixtureStatus.ready_video_count, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1933 | fixture | fixture-client-boundary | unprocessed_duration_ms: fixtureSourceVideos | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1938 | fixture | fixture-client-boundary | failed_video_count: fixtureStatus.failed_video_count, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1939 | fixture | fixture-client-boundary | index_required_video_count: fixtureStatus.index_required_video_count | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1949 | fixture | fixture-client-boundary | const affected = fixtureSourceVideos.filter((video) => | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1954 | fixture | fixture-client-boundary | fixtureSourceVideos = fixtureSourceVideos.map((video) => | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1970 | fixture | fixture-client-boundary | const existing = fixtureJobs.jobs.find((job) => job.job_id === jobId); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1981 | fixture | fixture-client-boundary | estimated_remaining_ms: fixtureMetrics.production.average_video_process_ms, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1984 | fixture | fixture-client-boundary | queue_position: fixtureJobs.jobs.filter((job) => job.status === "queued").length + 1, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1989 | fixture | fixture-client-boundary | fixtureJobs = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1990 | fixture | fixture-client-boundary | ...fixtureJobs, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1992 | fixture | fixture-client-boundary | ? fixtureJobs.jobs.map((job) => job.job_id === jobId ? nextJob : job) | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1993 | fixture | fixture-client-boundary | : [nextJob, ...fixtureJobs.jobs] | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2006 | fixture | fixture-client-boundary | const primarySourceFolder = fixtureSettings.source_folders.find((folder) => folder.enabled) | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2007 | fixture | fixture-client-boundary | ?? fixtureSettings.source_folders[0]; | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2008 | fixture | fixture-client-boundary | fixtureStatus = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2009 | fixture | fixture-client-boundary | ...fixtureStatus, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2010 | fixture | fixture-client-boundary | name: fixtureSettings.library_name, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2011 | fixture | fixture-client-boundary | source_videos_path: primarySourceFolder?.path ?? fixtureStatus.source_videos_path | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2015 | fixture | fixture-client-boundary | function saveFixtureSettings(settingsUpdate: AdminSettingsConfigUpdate): AdminSettingsConfig { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2020 | fixture | fixture-client-boundary | const currentById = new Map(fixtureSettings.source_folders.map((folder) => [folder.id, folder])); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2021 | fixture | fixture-client-boundary | fixtureSettings = cloneSettings({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2022 | fixture | fixture-client-boundary | ...fixtureSettings, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2025 | fixture | fixture-client-boundary | normalizeFixtureSourceFolder(currentById.get(folder.id), folder) | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2031 | fixture | fixture-client-boundary | return cloneSettings(fixtureSettings); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2034 | fixture | fixture-client-boundary | function addFixtureSourceFolder(folder: AdminSourceFolderCreate): AdminSettingsConfig { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2037 | fixture | fixture-client-boundary | id: nextSourceFolderId(fixtureSettings.source_folders), | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2042 | fixture | fixture-client-boundary | fixtureSettings = cloneSettings({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2043 | fixture | fixture-client-boundary | ...fixtureSettings, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2044 | fixture | fixture-client-boundary | source_folders: [...fixtureSettings.source_folders, nextFolder], | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2048 | fixture | fixture-client-boundary | return cloneSettings(fixtureSettings); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2051 | fixture | fixture-client-boundary | function updateFixtureSourceFolder( | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2056 | fixture | fixture-client-boundary | fixtureSettings = cloneSettings({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2057 | fixture | fixture-client-boundary | ...fixtureSettings, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2058 | fixture | fixture-client-boundary | source_folders: fixtureSettings.source_folders.map((folder) => { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2064 | fixture | fixture-client-boundary | return normalizeFixtureSourceFolder(folder, { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2077 | fixture | fixture-client-boundary | return cloneSettings(fixtureSettings); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2080 | fixture | fixture-client-boundary | function removeFixtureSourceFolder(sourceFolderId: string): AdminSettingsConfig { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2085 | fixture | fixture-client-boundary | const sourceFolders = fixtureSettings.source_folders.filter((folder) => folder.id !== sourceFolderId); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2086 | fixture | fixture-client-boundary | if (sourceFolders.length === fixtureSettings.source_folders.length) { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2090 | fixture | fixture-client-boundary | fixtureSettings = cloneSettings({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2091 | fixture | fixture-client-boundary | ...fixtureSettings, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2096 | fixture | fixture-client-boundary | return cloneSettings(fixtureSettings); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2099 | fixture | fixture-client-boundary | function fixtureOperationsOverview(): AdminOperationsOverview { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2101 | fixture | fixture-client-boundary | line_count: fixtureMetrics.usage.event_store.line_count, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2102 | fixture | fixture-client-boundary | valid_line_count: fixtureMetrics.usage.event_store.valid_line_count, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2103 | fixture | fixture-client-boundary | malformed_line_count: fixtureMetrics.usage.event_store.malformed_line_count, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2104 | fixture | fixture-client-boundary | malformed_lines: [...fixtureMetrics.usage.event_store.malformed_lines], | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2105 | fixture | fixture-client-boundary | warning: fixtureMetrics.usage.event_store.warning | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.

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

- JSON: docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T213657Z.json
- Markdown: docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T213657Z.md
