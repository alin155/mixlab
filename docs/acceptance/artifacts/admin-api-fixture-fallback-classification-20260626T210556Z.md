# Admin API Fixture/Fallback Classification

Generated: 2026-06-26T21:05:56.104Z

Mode: admin-api-fixture-fallback-classification

Result: blocked

Cleanup allowed: no

This report is evidence-only. It does not delete, move, rewrite, or refactor Admin Web API code.

## Summary

- Target file: apps/admin-web/src/api.ts
- Lines scanned: 4937
- Occurrences: 293
- Fixture client boundary: 273
- Route loading fallback contract: 11
- Runtime fallback contract: 3
- Usage metrics field: 6
- Test or mock boundary: 0
- Legacy debt candidate: 0

## Gates

| Gate | Status | Blocks Cleanup | Evidence |
| --- | --- | --- | --- |
classification-no-side-effects | pass | no | The classification reads Admin Web api.ts and writes acceptance artifacts only.
fixture-client-boundary-classified | blocked | yes | 273 fixture-client occurrences need a module ownership decision before extraction or cleanup.
fallback-contracts-preserved | blocked | yes | 14 fallback contract occurrences must be preserved or replaced with tests before cleanup.
api-hotspot-cleanup-still-targeted | pass | no | No mock/legacy/debt candidates were detected.

## Classified Occurrences

| Line | Term | Kind | Text | Cleanup Policy |
| --- | --- | --- | --- | --- |
378 | fallback | usage-metrics-field | fallback_search_count: number; | Do not rename or remove without backend usage-metrics compatibility and dashboard contract tests.
387 | fallback | usage-metrics-field | core_fallback_search_count: number; | Do not rename or remove without backend usage-metrics compatibility and dashboard contract tests.
722 | fallback | route-loading-fallback-contract | fallback: string; | Keep as route-local loading/error contract unless replaced by the data-loading plan contract and page tests.
2460 | fallback | usage-metrics-field | fallback_search_count: 1, | Do not rename or remove without backend usage-metrics compatibility and dashboard contract tests.
2469 | fallback | usage-metrics-field | core_fallback_search_count: 0, | Do not rename or remove without backend usage-metrics compatibility and dashboard contract tests.
2694 | fixture | fixture-client-boundary | function normalizeFixtureSourceFolder( | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2749 | fixture | fixture-client-boundary | function fixtureDataLoadingPlan(): AdminDataLoadingPlan { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2770 | fixture | fixture-client-boundary | notes: "Fixture shell status" | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2783 | fixture | fixture-client-boundary | notes: "Fixture shell settings" | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2796 | fixture | fixture-client-boundary | notes: "Fixture supervisor status" | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2809 | fixture | fixture-client-boundary | notes: "Fixture route loading contract" | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2824 | fixture | fixture-client-boundary | notes: "Fixture source-video route list; non-ready status filters use source-video-status-read-model-v1" | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2837 | fixture | fixture-client-boundary | notes: "Fixture selected source-video detail" | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2852 | fixture | fixture-client-boundary | notes: "Fixture preprocess route list; candidates use source-video-status-read-model-v1" | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2867 | fixture | fixture-client-boundary | notes: "Fixture process-history route reads admin-read-model-v1 and must not enumerate job files." | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2881 | fixture | fixture-client-boundary | notes: "Fixture process-history readiness diagnostic" | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2895 | fixture | fixture-client-boundary | notes: "Fixture read-model freshness status" | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2909 | fixture | fixture-client-boundary | notes: "Fixture read-model reconciler status" | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2923 | fixture | fixture-client-boundary | notes: "Fixture protection center aggregate" | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2936 | fixture | fixture-client-boundary | notes: "Fixture admin operation log tail" | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2949 | fixture | fixture-client-boundary | notes: "Fixture command snapshot restore preflight" | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2962 | fixture | fixture-client-boundary | notes: "Fixture command snapshot restore execution" | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2976 | fixture | fixture-client-boundary | notes: "Fixture index-version route list" | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
2989 | fixture | fixture-client-boundary | notes: "Fixture Doctor route report" | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3002 | fixture | fixture-client-boundary | notes: "Fixture cutter-user route table" | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3015 | fixture | fixture-client-boundary | notes: "Fixture path checks" | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3028 | fixture | fixture-client-boundary | notes: "Fixture settings runtime probe" | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3041 | fixture | fixture-client-boundary | notes: "Fixture explicit scan command" | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3055 | fixture | fixture-client-boundary | notes: "Fixture explicit background read-model reconcile command" | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3069 | fixture | fixture-client-boundary | notes: "Fixture explicit background read-model reconcile cancel command" | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3083 | fallback | route-loading-fallback-contract | fallback: "Use shell placeholders until route panels ask for heavy data." | Keep as route-local loading/error contract unless replaced by the data-loading plan contract and page tests.
3090 | fallback | route-loading-fallback-contract | fallback: "Show route-local loading." | Keep as route-local loading/error contract unless replaced by the data-loading plan contract and page tests.
3097 | fallback | route-loading-fallback-contract | fallback: "Show selected-source error without replacing shell data." | Keep as route-local loading/error contract unless replaced by the data-loading plan contract and page tests.
3109 | fallback | route-loading-fallback-contract | fallback: "Use summary counts until route data resolves." | Keep as route-local loading/error contract unless replaced by the data-loading plan contract and page tests.
3116 | fallback | route-loading-fallback-contract | fallback: "Show route-local pending-publish and index-version loading." | Keep as route-local loading/error contract unless replaced by the data-loading plan contract and page tests.
3126 | fallback | route-loading-fallback-contract | fallback: "Show shell library counts until protection details resolve." | Keep as route-local loading/error contract unless replaced by the data-loading plan contract and page tests.
3133 | fallback | route-loading-fallback-contract | fallback: "Show route-local operation log loading." | Keep as route-local loading/error contract unless replaced by the data-loading plan contract and page tests.
3140 | fallback | route-loading-fallback-contract | fallback: "Keep route-local user loading/errors isolated from dashboard shell." | Keep as route-local loading/error contract unless replaced by the data-loading plan contract and page tests.
3147 | fallback | route-loading-fallback-contract | fallback: "Use placeholder Doctor summary from shell until explicit report loads." | Keep as route-local loading/error contract unless replaced by the data-loading plan contract and page tests.
3154 | fallback | route-loading-fallback-contract | fallback: "Settings form can render from shell settings before path/runtime probes finish." | Keep as route-local loading/error contract unless replaced by the data-loading plan contract and page tests.
3504 | fixture | fixture-client-boundary | export function createFixtureAdminApiClient(): AdminApiClient { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3505 | fixture | fixture-client-boundary | let fixtureStatus: AdminLibraryStatus = { ...status }; | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3506 | fixture | fixture-client-boundary | let fixturePathChecks: AdminPathCheck[] = pathChecks.map((item) => ({ ...item })); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3507 | fixture | fixture-client-boundary | let fixtureSourceVideos: AdminSourceVideo[] = sourceVideos.map((video) => ({ | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3511 | fixture | fixture-client-boundary | let fixtureJobs: AdminPreprocessJobsResponse = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3515 | fixture | fixture-client-boundary | let fixtureProcessHistory = clonePreprocessProcessHistory(processHistory); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3516 | fixture | fixture-client-boundary | let fixtureIndexes: AdminIndexVersionsResponse = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3520 | fixture | fixture-client-boundary | let fixtureDoctor: MixlabDoctorReport = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3525 | fixture | fixture-client-boundary | let fixtureSettings = cloneSettings(settings); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3526 | fixture | fixture-client-boundary | let fixtureMetrics = cloneDashboardMetrics(dashboardMetrics); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3527 | fixture | fixture-client-boundary | let fixtureCutterUsers = cutterUsers.map(cloneCutterUser); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3530 | fixture | fixture-client-boundary | fixtureStatus = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3531 | fixture | fixture-client-boundary | ...fixtureStatus, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3532 | fixture | fixture-client-boundary | ready_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "ready").length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3533 | fixture | fixture-client-boundary | processing_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "processing").length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3534 | fixture | fixture-client-boundary | queued_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "queued").length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3535 | fixture | fixture-client-boundary | unprocessed_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "unprocessed").length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3536 | fixture | fixture-client-boundary | failed_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "failed").length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3537 | fixture | fixture-client-boundary | index_required_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "index-required").length | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3539 | fixture | fixture-client-boundary | fixtureMetrics = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3540 | fixture | fixture-client-boundary | ...fixtureMetrics, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3542 | fixture | fixture-client-boundary | ...fixtureMetrics.material, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3543 | fixture | fixture-client-boundary | video_count: fixtureSourceVideos.length, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3544 | fixture | fixture-client-boundary | ready_video_count: fixtureStatus.ready_video_count, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3545 | fixture | fixture-client-boundary | unprocessed_duration_ms: fixtureSourceVideos | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3550 | fixture | fixture-client-boundary | failed_video_count: fixtureStatus.failed_video_count, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3551 | fixture | fixture-client-boundary | index_required_video_count: fixtureStatus.index_required_video_count | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3561 | fixture | fixture-client-boundary | const affected = fixtureSourceVideos.filter((video) => | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3566 | fixture | fixture-client-boundary | fixtureSourceVideos = fixtureSourceVideos.map((video) => | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3582 | fixture | fixture-client-boundary | const existing = fixtureJobs.jobs.find((job) => job.job_id === jobId); | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3593 | fixture | fixture-client-boundary | estimated_remaining_ms: fixtureMetrics.production.average_video_process_ms, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3596 | fixture | fixture-client-boundary | queue_position: fixtureJobs.jobs.filter((job) => job.status === "queued").length + 1, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3601 | fixture | fixture-client-boundary | fixtureJobs = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3602 | fixture | fixture-client-boundary | ...fixtureJobs, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3604 | fixture | fixture-client-boundary | ? fixtureJobs.jobs.map((job) => job.job_id === jobId ? nextJob : job) | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3605 | fixture | fixture-client-boundary | : [nextJob, ...fixtureJobs.jobs] | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3618 | fixture | fixture-client-boundary | const primarySourceFolder = fixtureSettings.source_folders.find((folder) => folder.enabled) | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3619 | fixture | fixture-client-boundary | ?? fixtureSettings.source_folders[0]; | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3620 | fixture | fixture-client-boundary | fixtureStatus = { | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.
3621 | fixture | fixture-client-boundary | ...fixtureStatus, | Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.

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

- JSON: docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T210556Z.json
- Markdown: docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T210556Z.md
