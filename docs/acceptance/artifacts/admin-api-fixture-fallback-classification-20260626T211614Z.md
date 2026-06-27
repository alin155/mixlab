# Admin API Fixture/Fallback Classification

Generated: 2026-06-26T21:16:14.724Z

Mode: admin-api-fixture-fallback-classification

Result: blocked

Cleanup allowed: no

This report is evidence-only. It does not delete, move, rewrite, or refactor Admin Web API code.

## Summary

- Target file: apps/admin-web/src/api.ts
- Lines scanned: 3746
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
18 | fixture | fixture-client-boundary | } from "./fixtures/admin-fixture-data.ts"; | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
391 | fallback | usage-metrics-field | fallback_search_count: number; | Do not rename or remove without backend usage-metrics compatibility and dashboard contract tests.
400 | fallback | usage-metrics-field | core_fallback_search_count: number; | Do not rename or remove without backend usage-metrics compatibility and dashboard contract tests.
735 | fallback | route-loading-fallback-contract | fallback: string; | Keep as route-local loading/error contract unless replaced by the data-loading plan contract and page tests.
1909 | fixture | fixture-client-boundary | function normalizeFixtureSourceFolder( | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1964 | fixture | fixture-client-boundary | function fixtureDataLoadingPlan(): AdminDataLoadingPlan { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
1965 | fixture | fixture-client-boundary | return createAdminFixtureDataLoadingPlan({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2313 | fixture | fixture-client-boundary | export function createFixtureAdminApiClient(): AdminApiClient { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2314 | fixture | fixture-client-boundary | let fixtureStatus: AdminLibraryStatus = { ...status }; | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2315 | fixture | fixture-client-boundary | let fixturePathChecks: AdminPathCheck[] = pathChecks.map((item) => ({ ...item })); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2316 | fixture | fixture-client-boundary | let fixtureSourceVideos: AdminSourceVideo[] = sourceVideos.map((video) => ({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2320 | fixture | fixture-client-boundary | let fixtureJobs: AdminPreprocessJobsResponse = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2324 | fixture | fixture-client-boundary | let fixtureProcessHistory = clonePreprocessProcessHistory(processHistory); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2325 | fixture | fixture-client-boundary | let fixtureIndexes: AdminIndexVersionsResponse = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2329 | fixture | fixture-client-boundary | let fixtureDoctor: MixlabDoctorReport = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2334 | fixture | fixture-client-boundary | let fixtureSettings = cloneSettings(settings); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2335 | fixture | fixture-client-boundary | let fixtureMetrics = cloneDashboardMetrics(dashboardMetrics); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2336 | fixture | fixture-client-boundary | let fixtureCutterUsers = cutterUsers.map(cloneCutterUser); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2339 | fixture | fixture-client-boundary | fixtureStatus = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2340 | fixture | fixture-client-boundary | ...fixtureStatus, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2341 | fixture | fixture-client-boundary | ready_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "ready").length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2342 | fixture | fixture-client-boundary | processing_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "processing").length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2343 | fixture | fixture-client-boundary | queued_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "queued").length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2344 | fixture | fixture-client-boundary | unprocessed_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "unprocessed").length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2345 | fixture | fixture-client-boundary | failed_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "failed").length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2346 | fixture | fixture-client-boundary | index_required_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "index-required").length | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2348 | fixture | fixture-client-boundary | fixtureMetrics = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2349 | fixture | fixture-client-boundary | ...fixtureMetrics, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2351 | fixture | fixture-client-boundary | ...fixtureMetrics.material, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2352 | fixture | fixture-client-boundary | video_count: fixtureSourceVideos.length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2353 | fixture | fixture-client-boundary | ready_video_count: fixtureStatus.ready_video_count, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2354 | fixture | fixture-client-boundary | unprocessed_duration_ms: fixtureSourceVideos | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2359 | fixture | fixture-client-boundary | failed_video_count: fixtureStatus.failed_video_count, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2360 | fixture | fixture-client-boundary | index_required_video_count: fixtureStatus.index_required_video_count | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2370 | fixture | fixture-client-boundary | const affected = fixtureSourceVideos.filter((video) => | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2375 | fixture | fixture-client-boundary | fixtureSourceVideos = fixtureSourceVideos.map((video) => | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2391 | fixture | fixture-client-boundary | const existing = fixtureJobs.jobs.find((job) => job.job_id === jobId); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2402 | fixture | fixture-client-boundary | estimated_remaining_ms: fixtureMetrics.production.average_video_process_ms, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2405 | fixture | fixture-client-boundary | queue_position: fixtureJobs.jobs.filter((job) => job.status === "queued").length + 1, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2410 | fixture | fixture-client-boundary | fixtureJobs = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2411 | fixture | fixture-client-boundary | ...fixtureJobs, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2413 | fixture | fixture-client-boundary | ? fixtureJobs.jobs.map((job) => job.job_id === jobId ? nextJob : job) | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2414 | fixture | fixture-client-boundary | : [nextJob, ...fixtureJobs.jobs] | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2427 | fixture | fixture-client-boundary | const primarySourceFolder = fixtureSettings.source_folders.find((folder) => folder.enabled) | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2428 | fixture | fixture-client-boundary | ?? fixtureSettings.source_folders[0]; | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2429 | fixture | fixture-client-boundary | fixtureStatus = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2430 | fixture | fixture-client-boundary | ...fixtureStatus, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2431 | fixture | fixture-client-boundary | name: fixtureSettings.library_name, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2432 | fixture | fixture-client-boundary | source_videos_path: primarySourceFolder?.path ?? fixtureStatus.source_videos_path | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2436 | fixture | fixture-client-boundary | function saveFixtureSettings(settingsUpdate: AdminSettingsConfigUpdate): AdminSettingsConfig { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2441 | fixture | fixture-client-boundary | const currentById = new Map(fixtureSettings.source_folders.map((folder) => [folder.id, folder])); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2442 | fixture | fixture-client-boundary | fixtureSettings = cloneSettings({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2443 | fixture | fixture-client-boundary | ...fixtureSettings, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2446 | fixture | fixture-client-boundary | normalizeFixtureSourceFolder(currentById.get(folder.id), folder) | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2452 | fixture | fixture-client-boundary | return cloneSettings(fixtureSettings); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2455 | fixture | fixture-client-boundary | function addFixtureSourceFolder(folder: AdminSourceFolderCreate): AdminSettingsConfig { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2458 | fixture | fixture-client-boundary | id: nextSourceFolderId(fixtureSettings.source_folders), | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2463 | fixture | fixture-client-boundary | fixtureSettings = cloneSettings({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2464 | fixture | fixture-client-boundary | ...fixtureSettings, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2465 | fixture | fixture-client-boundary | source_folders: [...fixtureSettings.source_folders, nextFolder], | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2469 | fixture | fixture-client-boundary | return cloneSettings(fixtureSettings); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2472 | fixture | fixture-client-boundary | function updateFixtureSourceFolder( | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2477 | fixture | fixture-client-boundary | fixtureSettings = cloneSettings({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2478 | fixture | fixture-client-boundary | ...fixtureSettings, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2479 | fixture | fixture-client-boundary | source_folders: fixtureSettings.source_folders.map((folder) => { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2485 | fixture | fixture-client-boundary | return normalizeFixtureSourceFolder(folder, { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2498 | fixture | fixture-client-boundary | return cloneSettings(fixtureSettings); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2501 | fixture | fixture-client-boundary | function removeFixtureSourceFolder(sourceFolderId: string): AdminSettingsConfig { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2506 | fixture | fixture-client-boundary | const sourceFolders = fixtureSettings.source_folders.filter((folder) => folder.id !== sourceFolderId); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2507 | fixture | fixture-client-boundary | if (sourceFolders.length === fixtureSettings.source_folders.length) { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2511 | fixture | fixture-client-boundary | fixtureSettings = cloneSettings({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2512 | fixture | fixture-client-boundary | ...fixtureSettings, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2517 | fixture | fixture-client-boundary | return cloneSettings(fixtureSettings); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2520 | fixture | fixture-client-boundary | function fixtureOperationsOverview(): AdminOperationsOverview { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2522 | fixture | fixture-client-boundary | line_count: fixtureMetrics.usage.event_store.line_count, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2523 | fixture | fixture-client-boundary | valid_line_count: fixtureMetrics.usage.event_store.valid_line_count, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2524 | fixture | fixture-client-boundary | malformed_line_count: fixtureMetrics.usage.event_store.malformed_line_count, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2525 | fixture | fixture-client-boundary | malformed_lines: [...fixtureMetrics.usage.event_store.malformed_lines], | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2526 | fixture | fixture-client-boundary | warning: fixtureMetrics.usage.event_store.warning | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.

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

- JSON: docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T211614Z.json
- Markdown: docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T211614Z.md
