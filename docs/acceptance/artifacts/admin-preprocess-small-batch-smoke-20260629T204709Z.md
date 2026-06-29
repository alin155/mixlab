# Admin Preprocess Small Batch Smoke

- Generated at: 2026-06-29T20:47:09.656Z
- Execution mode: execute
- Status: passed
- Mutates NAS files: true
- Source videos: V005166, V002985, V006161, V005104, V006260
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
V005166 | passed | true | true | index-required | 10471 | v010471 | 42 | false | docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T204710Z.json
V002985 | passed | true | true | index-required | 10471 | v010471 | 42 | false | docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T204711Z.json
V006161 | passed | true | true | index-required | 10471 | v010471 | 42 | false | docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T204712Z.json
V005104 | passed | true | true | index-required | 10471 | v010471 | 42 | false | docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T204713Z.json
V006260 | passed | true | true | index-required | 10471 | v010471 | 42 | false | docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T204714Z.json
