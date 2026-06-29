# Admin Preprocess Maintenance Window Smoke

- Generated at: 2026-06-29T19:40:11.083Z
- Execution mode: dry-run
- Status: dry-run-ready
- Mutates NAS files: false
- Source videos: V000428, V000435, V000462, V000465, V000474, V000475, V000483, V000488, V000489, V000492
- Batch size: 5
- Max batches: 2
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
1 | V000428, V000435, V000462, V000465, V000474 | dry-run-ready | 10471 | 894 | 29 | 10471 | 894 | 29 | none | docs/acceptance/artifacts/admin-preprocess-small-batch-smoke-20260629T194111Z.json
2 | V000475, V000483, V000488, V000489, V000492 | dry-run-ready | 10471 | 894 | 29 | 10471 | 894 | 29 | none | docs/acceptance/artifacts/admin-preprocess-small-batch-smoke-20260629T194211Z.json
