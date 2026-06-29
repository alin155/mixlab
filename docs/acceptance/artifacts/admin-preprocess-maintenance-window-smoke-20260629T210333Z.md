# Admin Preprocess Maintenance Window Smoke

- Generated at: 2026-06-29T21:03:33.875Z
- Execution mode: execute
- Status: failed
- Mutates NAS files: true
- Source videos: V005167, V006278, V006180, V006276, V006160
- Batch size: 5
- Max batches: 1
- Expected ready count: 10471
- Expected index version: v010471
- Stop on failure: true
- Blockers: batch-1:V006180:single-video-execution-succeeded, batch-1:V006180:post-smoke-baseline-preserved, batch-1:V006180:post-smoke-nas-file-persistence

## Write Boundary

- Publish allowed: false
- Docker deploy allowed: false
- Automatic worker allowed: false
- Allowed POST paths: /api/admin/preprocess/supervisor/start

## Batches

batch | source_video_ids | status | ready_before | queued_before | index_required_before | ready_after | queued_after | index_required_after | blockers | json
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
1 | V005167, V006278, V006180, V006276, V006160 | failed | 10471 | 876 | 47 | 10471 | 873 | 49 | batch-1:V006180:single-video-execution-succeeded, batch-1:V006180:post-smoke-baseline-preserved, batch-1:V006180:post-smoke-nas-file-persistence | docs/acceptance/artifacts/admin-preprocess-small-batch-smoke-20260629T210433Z.json
