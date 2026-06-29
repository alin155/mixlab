# Admin Preprocess Small Batch Smoke

- Generated at: 2026-06-29T19:41:25.523Z
- Execution mode: execute
- Status: passed
- Mutates NAS files: true
- Source videos: V000428, V000435, V000462, V000465, V000474
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
V000428 | passed | true | true | index-required | 10471 | v010471 | 30 | true | docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T194126Z.json
V000435 | passed | true | true | index-required | 10471 | v010471 | 31 | true | docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T194127Z.json
V000462 | passed | true | true | index-required | 10471 | v010471 | 32 | true | docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T194128Z.json
V000465 | passed | true | true | index-required | 10471 | v010471 | 33 | true | docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T194129Z.json
V000474 | passed | true | true | index-required | 10471 | v010471 | 34 | true | docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T194130Z.json
