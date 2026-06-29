# Admin Preprocess Small Batch Smoke

- Generated at: 2026-06-29T19:32:02.627Z
- Execution mode: execute
- Status: passed
- Mutates NAS files: true
- Source videos: V000421, V000383, V000406, V000409, V000411
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
V000421 | passed | true | true | index-required | 10471 | v010471 | 25 | true | docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T193203Z.json
V000383 | passed | true | true | index-required | 10471 | v010471 | 26 | true | docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T193204Z.json
V000406 | passed | true | true | index-required | 10471 | v010471 | 27 | true | docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T193205Z.json
V000409 | passed | true | true | index-required | 10471 | v010471 | 28 | true | docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T193206Z.json
V000411 | passed | true | true | index-required | 10471 | v010471 | 29 | true | docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T193207Z.json
