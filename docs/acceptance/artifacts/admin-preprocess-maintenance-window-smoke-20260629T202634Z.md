# Admin Preprocess Maintenance Window Smoke

- Generated at: 2026-06-29T20:26:34.919Z
- Execution mode: execute
- Status: failed
- Mutates NAS files: true
- Source videos: V001843
- Batch size: 1
- Max batches: 1
- Expected ready count: 10471
- Expected index version: v010471
- Stop on failure: true
- Blockers: batch-1:V001843:post-smoke-nas-file-persistence

## Write Boundary

- Publish allowed: false
- Docker deploy allowed: false
- Automatic worker allowed: false
- Allowed POST paths: /api/admin/preprocess/supervisor/start

## Batches

batch | source_video_ids | status | ready_before | queued_before | index_required_before | ready_after | queued_after | index_required_after | blockers | json
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
1 | V001843 | failed | 10471 | 882 | 41 | 10471 | 881 | 42 | batch-1:V001843:post-smoke-nas-file-persistence | docs/acceptance/artifacts/admin-preprocess-small-batch-smoke-20260629T202734Z.json
