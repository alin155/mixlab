# Admin Preprocess Maintenance Window Smoke

- Generated at: 2026-06-29T20:14:18.374Z
- Execution mode: dry-run
- Status: dry-run-ready
- Mutates NAS files: false
- Source videos: V002357, V001843, V005166, V002985, V006161, V005104, V006260, V005167, V006278, V006180, V006276, V006160, V006185, V006277, V006183, V006176, V006158, V006194, V006191, V006178, V002428, V002049, V002054, V002089
- Batch size: 5
- Max batches: 5
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
1 | V002357, V001843, V005166, V002985, V006161 | dry-run-ready | 10471 | 883 | 40 | 10471 | 883 | 40 | none | docs/acceptance/artifacts/admin-preprocess-small-batch-smoke-20260629T201518Z.json
2 | V005104, V006260, V005167, V006278, V006180 | dry-run-ready | 10471 | 883 | 40 | 10471 | 883 | 40 | none | docs/acceptance/artifacts/admin-preprocess-small-batch-smoke-20260629T201618Z.json
3 | V006276, V006160, V006185, V006277, V006183 | dry-run-ready | 10471 | 883 | 40 | 10471 | 883 | 40 | none | docs/acceptance/artifacts/admin-preprocess-small-batch-smoke-20260629T201718Z.json
4 | V006176, V006158, V006194, V006191, V006178 | dry-run-ready | 10471 | 883 | 40 | 10471 | 883 | 40 | none | docs/acceptance/artifacts/admin-preprocess-small-batch-smoke-20260629T201818Z.json
5 | V002428, V002049, V002054, V002089 | dry-run-ready | 10471 | 883 | 40 | 10471 | 883 | 40 | none | docs/acceptance/artifacts/admin-preprocess-small-batch-smoke-20260629T201918Z.json
