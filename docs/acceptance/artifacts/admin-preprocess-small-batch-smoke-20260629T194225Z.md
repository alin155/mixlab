# Admin Preprocess Small Batch Smoke

- Generated at: 2026-06-29T19:42:25.523Z
- Execution mode: execute
- Status: passed
- Mutates NAS files: true
- Source videos: V000475, V000483, V000488, V000489, V000492
- Expected ready count: 10471
- Expected index version: v010471
- Stop on failure: true
- Blockers: none

## Write Boundary

- Publish allowed: false
- Docker deploy allowed: false
- Automatic worker allowed: false
- Allowed POST paths: /api/admin/preprocess/supervisor/start

## Items

source_video_id | status | dry_run_ready | passed | source_after | ready_after | index_after | direct_index_required | refreshed | json
--- | --- | --- | --- | --- | --- | --- | --- | --- | ---
V000475 | passed | true | true | index-required | 10471 | v010471 | 35 | true | docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T194226Z.json
V000483 | passed | true | true | index-required | 10471 | v010471 | 36 | true | docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T194227Z.json
V000488 | passed | true | true | index-required | 10471 | v010471 | 37 | true | docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T194228Z.json
V000489 | passed | true | true | index-required | 10471 | v010471 | 38 | true | docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T194229Z.json
V000492 | passed | true | true | index-required | 10471 | v010471 | 39 | true | docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T194230Z.json
