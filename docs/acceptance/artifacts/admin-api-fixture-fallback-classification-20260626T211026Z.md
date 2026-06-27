# Admin API Fixture/Fallback Classification

Generated: 2026-06-26T21:10:26.599Z

Mode: admin-api-fixture-fallback-classification

Result: blocked

Cleanup allowed: no

This report is evidence-only. It does not delete, move, rewrite, or refactor Admin Web API code.

## Summary

- Target file: apps/admin-web/src/api.ts
- Lines scanned: 4532
- Occurrences: 262
- Fixture client boundary: 252
- Route loading fallback contract: 1
- Runtime fallback contract: 3
- Usage metrics field: 6
- Test or mock boundary: 0
- Legacy debt candidate: 0

## Gates

| Gate | Status | Blocks Cleanup | Evidence |
| --- | --- | --- | --- |
classification-no-side-effects | pass | no | The classification reads Admin Web api.ts and writes acceptance artifacts only.
fixture-client-boundary-classified | blocked | yes | 252 fixture-client occurrences need a module ownership decision before extraction or cleanup.
fallback-contracts-preserved | blocked | yes | 4 fallback contract occurrences must be preserved or replaced with tests before cleanup.
api-hotspot-cleanup-still-targeted | pass | no | No mock/legacy/debt candidates were detected.

## Classified Occurrences

| Line | Term | Kind | Text | Cleanup Policy |
| --- | --- | --- | --- | --- |
6 | fixture | fixture-client-boundary | import { createAdminFixtureDataLoadingPlan } from "./fixtures/admin-data-loading-plan.ts"; | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
379 | fallback | usage-metrics-field | fallback_search_count: number; | Do not rename or remove without backend usage-metrics compatibility and dashboard contract tests.
388 | fallback | usage-metrics-field | core_fallback_search_count: number; | Do not rename or remove without backend usage-metrics compatibility and dashboard contract tests.
723 | fallback | route-loading-fallback-contract | fallback: string; | Keep as route-local loading/error contract unless replaced by the data-loading plan contract and page tests.
2461 | fallback | usage-metrics-field | fallback_search_count: 1, | Do not rename or remove without backend usage-metrics compatibility and dashboard contract tests.
2470 | fallback | usage-metrics-field | core_fallback_search_count: 0, | Do not rename or remove without backend usage-metrics compatibility and dashboard contract tests.
2695 | fixture | fixture-client-boundary | function normalizeFixtureSourceFolder( | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2750 | fixture | fixture-client-boundary | function fixtureDataLoadingPlan(): AdminDataLoadingPlan { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2751 | fixture | fixture-client-boundary | return createAdminFixtureDataLoadingPlan({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3099 | fixture | fixture-client-boundary | export function createFixtureAdminApiClient(): AdminApiClient { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3100 | fixture | fixture-client-boundary | let fixtureStatus: AdminLibraryStatus = { ...status }; | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3101 | fixture | fixture-client-boundary | let fixturePathChecks: AdminPathCheck[] = pathChecks.map((item) => ({ ...item })); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3102 | fixture | fixture-client-boundary | let fixtureSourceVideos: AdminSourceVideo[] = sourceVideos.map((video) => ({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3106 | fixture | fixture-client-boundary | let fixtureJobs: AdminPreprocessJobsResponse = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3110 | fixture | fixture-client-boundary | let fixtureProcessHistory = clonePreprocessProcessHistory(processHistory); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3111 | fixture | fixture-client-boundary | let fixtureIndexes: AdminIndexVersionsResponse = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3115 | fixture | fixture-client-boundary | let fixtureDoctor: MixlabDoctorReport = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3120 | fixture | fixture-client-boundary | let fixtureSettings = cloneSettings(settings); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3121 | fixture | fixture-client-boundary | let fixtureMetrics = cloneDashboardMetrics(dashboardMetrics); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3122 | fixture | fixture-client-boundary | let fixtureCutterUsers = cutterUsers.map(cloneCutterUser); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3125 | fixture | fixture-client-boundary | fixtureStatus = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3126 | fixture | fixture-client-boundary | ...fixtureStatus, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3127 | fixture | fixture-client-boundary | ready_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "ready").length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3128 | fixture | fixture-client-boundary | processing_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "processing").length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3129 | fixture | fixture-client-boundary | queued_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "queued").length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3130 | fixture | fixture-client-boundary | unprocessed_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "unprocessed").length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3131 | fixture | fixture-client-boundary | failed_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "failed").length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3132 | fixture | fixture-client-boundary | index_required_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "index-required").length | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3134 | fixture | fixture-client-boundary | fixtureMetrics = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3135 | fixture | fixture-client-boundary | ...fixtureMetrics, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3137 | fixture | fixture-client-boundary | ...fixtureMetrics.material, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3138 | fixture | fixture-client-boundary | video_count: fixtureSourceVideos.length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3139 | fixture | fixture-client-boundary | ready_video_count: fixtureStatus.ready_video_count, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3140 | fixture | fixture-client-boundary | unprocessed_duration_ms: fixtureSourceVideos | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3145 | fixture | fixture-client-boundary | failed_video_count: fixtureStatus.failed_video_count, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3146 | fixture | fixture-client-boundary | index_required_video_count: fixtureStatus.index_required_video_count | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3156 | fixture | fixture-client-boundary | const affected = fixtureSourceVideos.filter((video) => | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3161 | fixture | fixture-client-boundary | fixtureSourceVideos = fixtureSourceVideos.map((video) => | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3177 | fixture | fixture-client-boundary | const existing = fixtureJobs.jobs.find((job) => job.job_id === jobId); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3188 | fixture | fixture-client-boundary | estimated_remaining_ms: fixtureMetrics.production.average_video_process_ms, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3191 | fixture | fixture-client-boundary | queue_position: fixtureJobs.jobs.filter((job) => job.status === "queued").length + 1, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3196 | fixture | fixture-client-boundary | fixtureJobs = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3197 | fixture | fixture-client-boundary | ...fixtureJobs, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3199 | fixture | fixture-client-boundary | ? fixtureJobs.jobs.map((job) => job.job_id === jobId ? nextJob : job) | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3200 | fixture | fixture-client-boundary | : [nextJob, ...fixtureJobs.jobs] | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3213 | fixture | fixture-client-boundary | const primarySourceFolder = fixtureSettings.source_folders.find((folder) => folder.enabled) | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3214 | fixture | fixture-client-boundary | ?? fixtureSettings.source_folders[0]; | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3215 | fixture | fixture-client-boundary | fixtureStatus = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3216 | fixture | fixture-client-boundary | ...fixtureStatus, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3217 | fixture | fixture-client-boundary | name: fixtureSettings.library_name, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3218 | fixture | fixture-client-boundary | source_videos_path: primarySourceFolder?.path ?? fixtureStatus.source_videos_path | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3222 | fixture | fixture-client-boundary | function saveFixtureSettings(settingsUpdate: AdminSettingsConfigUpdate): AdminSettingsConfig { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3227 | fixture | fixture-client-boundary | const currentById = new Map(fixtureSettings.source_folders.map((folder) => [folder.id, folder])); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3228 | fixture | fixture-client-boundary | fixtureSettings = cloneSettings({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3229 | fixture | fixture-client-boundary | ...fixtureSettings, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3232 | fixture | fixture-client-boundary | normalizeFixtureSourceFolder(currentById.get(folder.id), folder) | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3238 | fixture | fixture-client-boundary | return cloneSettings(fixtureSettings); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3241 | fixture | fixture-client-boundary | function addFixtureSourceFolder(folder: AdminSourceFolderCreate): AdminSettingsConfig { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3244 | fixture | fixture-client-boundary | id: nextSourceFolderId(fixtureSettings.source_folders), | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3249 | fixture | fixture-client-boundary | fixtureSettings = cloneSettings({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3250 | fixture | fixture-client-boundary | ...fixtureSettings, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3251 | fixture | fixture-client-boundary | source_folders: [...fixtureSettings.source_folders, nextFolder], | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3255 | fixture | fixture-client-boundary | return cloneSettings(fixtureSettings); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3258 | fixture | fixture-client-boundary | function updateFixtureSourceFolder( | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3263 | fixture | fixture-client-boundary | fixtureSettings = cloneSettings({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3264 | fixture | fixture-client-boundary | ...fixtureSettings, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3265 | fixture | fixture-client-boundary | source_folders: fixtureSettings.source_folders.map((folder) => { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3271 | fixture | fixture-client-boundary | return normalizeFixtureSourceFolder(folder, { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3284 | fixture | fixture-client-boundary | return cloneSettings(fixtureSettings); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3287 | fixture | fixture-client-boundary | function removeFixtureSourceFolder(sourceFolderId: string): AdminSettingsConfig { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3292 | fixture | fixture-client-boundary | const sourceFolders = fixtureSettings.source_folders.filter((folder) => folder.id !== sourceFolderId); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3293 | fixture | fixture-client-boundary | if (sourceFolders.length === fixtureSettings.source_folders.length) { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3297 | fixture | fixture-client-boundary | fixtureSettings = cloneSettings({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3298 | fixture | fixture-client-boundary | ...fixtureSettings, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3303 | fixture | fixture-client-boundary | return cloneSettings(fixtureSettings); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3306 | fixture | fixture-client-boundary | function fixtureOperationsOverview(): AdminOperationsOverview { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3308 | fixture | fixture-client-boundary | line_count: fixtureMetrics.usage.event_store.line_count, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3309 | fixture | fixture-client-boundary | valid_line_count: fixtureMetrics.usage.event_store.valid_line_count, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3310 | fixture | fixture-client-boundary | malformed_line_count: fixtureMetrics.usage.event_store.malformed_line_count, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3311 | fixture | fixture-client-boundary | malformed_lines: [...fixtureMetrics.usage.event_store.malformed_lines], | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.

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

- JSON: docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T211026Z.json
- Markdown: docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T211026Z.md
