# Admin Preprocess Maintenance Window Smoke

- Generated at: 2026-06-29T21:03:21.758Z
- Execution mode: dry-run
- Status: dry-run-ready
- Mutates NAS files: false
- Source videos: V005167, V006278, V006180, V006276, V006160
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
- Allowed POST paths: none

## Batches

batch | source_video_ids | status | ready_before | queued_before | index_required_before | ready_after | queued_after | index_required_after | blockers | json
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
1 | V005167, V006278, V006180, V006276, V006160 | dry-run-ready | 10471 | 876 | 47 | 10471 | 876 | 47 | none | docs/acceptance/artifacts/admin-preprocess-small-batch-smoke-20260629T210421Z.json
