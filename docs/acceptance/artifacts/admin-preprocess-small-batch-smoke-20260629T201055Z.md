# Admin Preprocess Small Batch Smoke

- Generated at: 2026-06-29T20:10:55.232Z
- Execution mode: execute
- Status: failed
- Mutates NAS files: true
- Source videos: V005615, V002357, V001843, V005166, V002985
- Expected ready count: 10471
- Expected index version: v010471
- Stop on failure: true
- Blockers: V005615:post-smoke-nas-file-persistence

## Write Boundary

- Publish allowed: false
- Docker deploy allowed: false
- Automatic worker allowed: false
- Allowed POST paths: /api/admin/preprocess/supervisor/start

## Items

source_video_id | status | dry_run_ready | passed | source_after | ready_after | index_after | direct_index_required | refreshed | json
--- | --- | --- | --- | --- | --- | --- | --- | --- | ---
V005615 | failed | true | false | index-required | 10471 | v010471 | 39 | false | docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T201056Z.json
