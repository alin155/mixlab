# Admin Preprocess Maintenance Window Smoke

- Generated at: 2026-06-29T20:09:55.232Z
- Execution mode: execute
- Status: failed
- Mutates NAS files: true
- Source videos: V005615, V002357, V001843, V005166, V002985, V006161, V005104, V006260, V005167, V006278, V006180, V006276, V006160, V006185, V006277, V006183, V006176, V006158, V006194, V006191, V006178, V002428, V002049, V002054, V002089
- Batch size: 5
- Max batches: 5
- Expected ready count: 10471
- Expected index version: v010471
- Stop on failure: true
- Blockers: batch-1:V005615:post-smoke-nas-file-persistence

## Write Boundary

- Publish allowed: false
- Docker deploy allowed: false
- Automatic worker allowed: false
- Allowed POST paths: /api/admin/preprocess/supervisor/start

## Batches

batch | source_video_ids | status | ready_before | queued_before | index_required_before | ready_after | queued_after | index_required_after | blockers | json
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
1 | V005615, V002357, V001843, V005166, V002985 | failed | 10471 | 884 | 39 | 10471 | 883 | 40 | batch-1:V005615:post-smoke-nas-file-persistence | docs/acceptance/artifacts/admin-preprocess-small-batch-smoke-20260629T201055Z.json
