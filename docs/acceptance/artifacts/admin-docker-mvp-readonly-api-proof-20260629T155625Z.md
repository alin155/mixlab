# Admin Docker MVP Readonly API Proof

Generated: 2026-06-29T15:56:25.316Z
Target: http://192.168.1.27:18080
Image tag: 5a50922bc82f1b6728f247ed33e5885ab8cf6bef
Result: ready
Mutates NAS files: false
Preprocess execution allowed: false

## Observed
- library_root: /data/PublicLibrary
- ready_video_count: 10471
- total_video_count: 11394
- processing_video_count: 0
- current_index_version: v010471
- preprocess_safety_status: healthy
- preprocess_supervisor_state: idle
- queued_first_page_count: 5
- index_required_first_page_count: 5
- processing_first_page_count: 0
- cutter_user_count: 16
- data_loading_strategy: shell-first-route-owned-v1
- slowest_request_ms: 273.9

## Gates
- pass: all-readonly-api-endpoints-200 - 12/12 protected GET probes returned ok:true
- pass: library-baseline-preserved - root=/data/PublicLibrary, ready=10471, current_index=v010471
- pass: processing-list-empty - processing list count=0, library processing=0
- pass: preprocess-supervisor-idle - supervisor state=idle
- pass: preprocess-safety-readable - preprocess safety status=healthy, safe_to_start=true
- pass: preprocess-jobs-readable - jobs first page count=20
- pass: source-video-status-lists-readable - queued first page=5, index-required first page=5
- pass: cutter-users-readable - cutter user count=16
- pass: data-loading-plan-live - strategy=shell-first-route-owned-v1, hidden_full_scan_allowed=false

## Requests
- auth_status: HTTP 200, ok=true, 11.1ms, /api/admin/auth/status
- library_status: HTTP 200, ok=true, 6.4ms, /api/admin/library/status
- preprocess_safety: HTTP 200, ok=true, 16.5ms, /api/admin/preprocess/safety
- preprocess_supervisor_status: HTTP 200, ok=true, 5.6ms, /api/admin/preprocess/supervisor/status
- preprocess_jobs: HTTP 200, ok=true, 273.9ms, /api/admin/preprocess/jobs?limit=20
- source_videos_queued: HTTP 200, ok=true, 15.1ms, /api/admin/source-videos?status=queued&limit=5
- source_videos_index_required: HTTP 200, ok=true, 14.4ms, /api/admin/source-videos?status=index-required&limit=5
- source_videos_processing: HTTP 200, ok=true, 18.9ms, /api/admin/source-videos?status=processing&limit=5
- source_videos_default: HTTP 200, ok=true, 21.7ms, /api/admin/source-videos?limit=5
- cutter_users: HTTP 200, ok=true, 15.5ms, /api/admin/cutter-users
- data_loading_plan: HTTP 200, ok=true, 9.6ms, /api/admin/data-loading/plan
- release_gates: HTTP 200, ok=true, 71.2ms, /api/admin/release-gates

JSON: docs/acceptance/artifacts/admin-docker-mvp-readonly-api-proof-20260629T155625Z.json
Markdown: docs/acceptance/artifacts/admin-docker-mvp-readonly-api-proof-20260629T155625Z.md