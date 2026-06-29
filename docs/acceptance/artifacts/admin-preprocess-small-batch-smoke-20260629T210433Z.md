# Admin Preprocess Small Batch Smoke

- Generated at: 2026-06-29T21:04:33.875Z
- Execution mode: execute
- Status: failed
- Mutates NAS files: true
- Source videos: V005167, V006278, V006180, V006276, V006160
- Expected ready count: 10471
- Expected index version: v010471
- Stop on failure: true
- Blockers: V006180:single-video-execution-succeeded, V006180:post-smoke-baseline-preserved, V006180:post-smoke-nas-file-persistence

## Write Boundary

- Publish allowed: false
- Docker deploy allowed: false
- Automatic worker allowed: false
- Allowed POST paths: /api/admin/preprocess/supervisor/start

## Items

source_video_id | status | dry_run_ready | passed | source_after | ready_after | index_after | direct_index_required | refreshed | json
--- | --- | --- | --- | --- | --- | --- | --- | --- | ---
V005167 | passed | true | true | index-required | 10471 | v010471 | 47 | false | docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T210434Z.json
V006278 | passed | true | true | index-required | 10471 | v010471 | 47 | false | docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T210435Z.json
V006180 | failed | true | false | failed | 10471 | v010471 | 47 | false | docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T210436Z.json
