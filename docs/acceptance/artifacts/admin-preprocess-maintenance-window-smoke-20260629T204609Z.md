# Admin Preprocess Maintenance Window Smoke

- Generated at: 2026-06-29T20:46:09.656Z
- Execution mode: execute
- Status: passed
- Mutates NAS files: true
- Source videos: V005166, V002985, V006161, V005104, V006260
- Batch size: 5
- Max batches: 1
- Expected ready count: 10471
- Expected index version: v010471
- Stop on failure: true
- Blockers: none

## Write Boundary

- Publish allowed: false
- Docker deploy allowed: false
- Automatic worker allowed: false
- Allowed POST paths: /api/admin/preprocess/supervisor/start

## Batches

batch | source_video_ids | status | ready_before | queued_before | index_required_before | ready_after | queued_after | index_required_after | blockers | json
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
1 | V005166, V002985, V006161, V005104, V006260 | passed | 10471 | 881 | 42 | 10471 | 876 | 47 | none | docs/acceptance/artifacts/admin-preprocess-small-batch-smoke-20260629T204709Z.json
