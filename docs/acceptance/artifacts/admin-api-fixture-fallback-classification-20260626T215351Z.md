# Admin API Fixture/Fallback Classification

Generated: 2026-06-26T21:53:51.472Z

Mode: admin-api-fixture-fallback-classification

Result: blocked

Cleanup allowed: no

This report is evidence-only. It does not delete, move, rewrite, or refactor Admin Web API code.

## Summary

- Target file: apps/admin-web/src/api.ts
- Lines scanned: 2874
- Occurrences: 178
- Fixture client boundary: 170
- Route loading fallback contract: 1
- Runtime fallback contract: 3
- Usage metrics field: 4
- Test or mock boundary: 0
- Legacy debt candidate: 0

## Gates

| Gate | Status | Blocks Cleanup | Evidence |
| --- | --- | --- | --- |
classification-no-side-effects | pass | no | The classification reads Admin Web api.ts and writes acceptance artifacts only.
fixture-client-boundary-classified | blocked | yes | 170 fixture-client occurrences need a module ownership decision before extraction or cleanup.
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
33 | fixture | fixture-client-boundary | } from "./fixtures/admin-fixture-data.ts"; | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
406 | fallback | usage-metrics-field | fallback_search_count: number; | Do not rename or remove without backend usage-metrics compatibility and dashboard contract tests.
415 | fallback | usage-metrics-field | core_fallback_search_count: number; | Do not rename or remove without backend usage-metrics compatibility and dashboard contract tests.
750 | fallback | route-loading-fallback-contract | fallback: string; | Keep as route-local loading/error contract unless replaced by the data-loading plan contract and page tests.
1891 | fixture | fixture-client-boundary | function fixtureDataLoadingPlan(): AdminDataLoadingPlan { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1892 | fixture | fixture-client-boundary | return createAdminFixtureDataLoadingPlan({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1897 | fixture | fixture-client-boundary | export function createFixtureAdminApiClient(): AdminApiClient { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1898 | fixture | fixture-client-boundary | let fixtureStatus: AdminLibraryStatus = { ...status }; | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1899 | fixture | fixture-client-boundary | let fixturePathChecks: AdminPathCheck[] = pathChecks.map((item) => ({ ...item })); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1900 | fixture | fixture-client-boundary | let fixtureSourceVideos: AdminSourceVideo[] = sourceVideos.map((video) => ({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1904 | fixture | fixture-client-boundary | let fixtureJobs: AdminPreprocessJobsResponse = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1908 | fixture | fixture-client-boundary | let fixtureProcessHistory = clonePreprocessProcessHistory(processHistory); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1909 | fixture | fixture-client-boundary | let fixtureIndexes: AdminIndexVersionsResponse = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1913 | fixture | fixture-client-boundary | let fixtureDoctor: MixlabDoctorReport = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1918 | fixture | fixture-client-boundary | let fixtureSettings = cloneSettings(settings); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1919 | fixture | fixture-client-boundary | let fixtureMetrics = cloneDashboardMetrics(dashboardMetrics); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1920 | fixture | fixture-client-boundary | let fixtureCutterUsers = cutterUsers.map(cloneCutterUser); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1923 | fixture | fixture-client-boundary | fixtureStatus = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1924 | fixture | fixture-client-boundary | ...fixtureStatus, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1925 | fixture | fixture-client-boundary | ready_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "ready").length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1926 | fixture | fixture-client-boundary | processing_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "processing").length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1927 | fixture | fixture-client-boundary | queued_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "queued").length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1928 | fixture | fixture-client-boundary | unprocessed_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "unprocessed").length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1929 | fixture | fixture-client-boundary | failed_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "failed").length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1930 | fixture | fixture-client-boundary | index_required_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "index-required").length | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1932 | fixture | fixture-client-boundary | fixtureMetrics = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1933 | fixture | fixture-client-boundary | ...fixtureMetrics, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1935 | fixture | fixture-client-boundary | ...fixtureMetrics.material, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1936 | fixture | fixture-client-boundary | video_count: fixtureSourceVideos.length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1937 | fixture | fixture-client-boundary | ready_video_count: fixtureStatus.ready_video_count, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1938 | fixture | fixture-client-boundary | unprocessed_duration_ms: fixtureSourceVideos | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1943 | fixture | fixture-client-boundary | failed_video_count: fixtureStatus.failed_video_count, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1944 | fixture | fixture-client-boundary | index_required_video_count: fixtureStatus.index_required_video_count | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1954 | fixture | fixture-client-boundary | const affected = fixtureSourceVideos.filter((video) => | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1959 | fixture | fixture-client-boundary | fixtureSourceVideos = fixtureSourceVideos.map((video) => | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1975 | fixture | fixture-client-boundary | const existing = fixtureJobs.jobs.find((job) => job.job_id === jobId); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1986 | fixture | fixture-client-boundary | estimated_remaining_ms: fixtureMetrics.production.average_video_process_ms, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1989 | fixture | fixture-client-boundary | queue_position: fixtureJobs.jobs.filter((job) => job.status === "queued").length + 1, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1994 | fixture | fixture-client-boundary | fixtureJobs = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1995 | fixture | fixture-client-boundary | ...fixtureJobs, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1997 | fixture | fixture-client-boundary | ? fixtureJobs.jobs.map((job) => job.job_id === jobId ? nextJob : job) | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1998 | fixture | fixture-client-boundary | : [nextJob, ...fixtureJobs.jobs] | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2011 | fixture | fixture-client-boundary | const primarySourceFolder = fixtureSettings.source_folders.find((folder) => folder.enabled) | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2012 | fixture | fixture-client-boundary | ?? fixtureSettings.source_folders[0]; | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2013 | fixture | fixture-client-boundary | fixtureStatus = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2014 | fixture | fixture-client-boundary | ...fixtureStatus, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2015 | fixture | fixture-client-boundary | name: fixtureSettings.library_name, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2016 | fixture | fixture-client-boundary | source_videos_path: primarySourceFolder?.path ?? fixtureStatus.source_videos_path | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2020 | fixture | fixture-client-boundary | function saveFixtureSettings(settingsUpdate: AdminSettingsConfigUpdate): AdminSettingsConfig { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2025 | fixture | fixture-client-boundary | const currentById = new Map(fixtureSettings.source_folders.map((folder) => [folder.id, folder])); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2026 | fixture | fixture-client-boundary | fixtureSettings = cloneSettings({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2027 | fixture | fixture-client-boundary | ...fixtureSettings, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2030 | fixture | fixture-client-boundary | normalizeFixtureSourceFolder(currentById.get(folder.id), folder) | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2036 | fixture | fixture-client-boundary | return cloneSettings(fixtureSettings); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2039 | fixture | fixture-client-boundary | function addFixtureSourceFolder(folder: AdminSourceFolderCreate): AdminSettingsConfig { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2042 | fixture | fixture-client-boundary | id: nextSourceFolderId(fixtureSettings.source_folders), | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2047 | fixture | fixture-client-boundary | fixtureSettings = cloneSettings({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2048 | fixture | fixture-client-boundary | ...fixtureSettings, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2049 | fixture | fixture-client-boundary | source_folders: [...fixtureSettings.source_folders, nextFolder], | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2053 | fixture | fixture-client-boundary | return cloneSettings(fixtureSettings); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2056 | fixture | fixture-client-boundary | function updateFixtureSourceFolder( | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2061 | fixture | fixture-client-boundary | fixtureSettings = cloneSettings({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2062 | fixture | fixture-client-boundary | ...fixtureSettings, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2063 | fixture | fixture-client-boundary | source_folders: fixtureSettings.source_folders.map((folder) => { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2069 | fixture | fixture-client-boundary | return normalizeFixtureSourceFolder(folder, { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2082 | fixture | fixture-client-boundary | return cloneSettings(fixtureSettings); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2085 | fixture | fixture-client-boundary | function removeFixtureSourceFolder(sourceFolderId: string): AdminSettingsConfig { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2090 | fixture | fixture-client-boundary | const sourceFolders = fixtureSettings.source_folders.filter((folder) => folder.id !== sourceFolderId); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2091 | fixture | fixture-client-boundary | if (sourceFolders.length === fixtureSettings.source_folders.length) { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2095 | fixture | fixture-client-boundary | fixtureSettings = cloneSettings({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2096 | fixture | fixture-client-boundary | ...fixtureSettings, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2101 | fixture | fixture-client-boundary | return cloneSettings(fixtureSettings); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2140 | fixture | fixture-client-boundary | session_token: "fixture-admin-session", | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.

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

- JSON: docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T215351Z.json
- Markdown: docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T215351Z.md
