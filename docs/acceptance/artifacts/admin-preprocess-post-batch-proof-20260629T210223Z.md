# Admin Preprocess Post-Batch Proof

Generated: 2026-06-29T21:02:23.437Z

Status: passed-with-follow-up

Mutates NAS files: no

Next small batch allowed: yes

Scale-up allowed: no

This proof is read-only. It sends GET requests to Admin API, optionally reads direct SMB files, optionally reads a Windows acceptance report, and writes only local acceptance artifacts.

## Target

- Base URL: http://192.168.1.27:18080
- Normalized base URL: http://192.168.1.27:18080
- Safe to probe: yes
- Classification: Target URL shape is compatible with the NAS Docker admin-web root.
- Session token present: yes
- Source videos: V005166, V002985, V006161, V005104, V006260
- Expected root: /data/PublicLibrary
- Expected ready count: 10471
- Expected index version: v010471
- Expected queued count: 876
- Expected index-required count: 47
- Library mount root: /Volumes/MixLab/PublicLibrary
- Windows acceptance report: docs/acceptance/artifacts/windows_acceptance-20260629T205152Z-e24dbadd/report.json

## Observed

- Library: root=/data/PublicLibrary, ready=10471, queued=876, processing=0, index_required=47, index=v010471
- Supervisor: idle
- Processing list count: 0
- Windows: status=passed, runner=0.1.32, available=10471, release=v010471, search_index=v010471

## Source Items

| Source Video | API OK | API Status | API Visible | API Passed | SMB Status | SMB Source | SMB Job | SMB NUL |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
V005166 | yes | index-required | false | yes | stale-follow-up | index-required | index-required | false
V002985 | yes | index-required | false | yes | stale-follow-up | index-required | index-required | false
V006161 | yes | index-required | false | yes | stale-follow-up | index-required | index-required | false
V005104 | yes | index-required | false | yes | stale-follow-up | index-required | index-required | false
V006260 | yes | index-required | false | yes | stale-follow-up | index-required | index-required | false

## Gates

| Gate | Category | Status | Blocks Next Small Batch | Blocks Scale-Up | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- |
source-video-ids-provided | scope | pass | yes | yes | source_video_ids=V005166, V002985, V006161, V005104, V006260. | n/a
nas-docker-admin-target | target | pass | yes | yes | Target URL shape is compatible with the NAS Docker admin-web root. | n/a
api-library-baseline-preserved | api | pass | yes | yes | root=/data/PublicLibrary, ready=10471, queued=876, processing=0, index_required=47, index=v010471. | n/a
api-selected-sources-index-required-hidden | api | pass | yes | yes | V005166:index-required/visible=false, V002985:index-required/visible=false, V006161:index-required/visible=false, V005104:index-required/visible=false, V006260:index-required/visible=false | n/a
api-processing-list-empty | api | pass | yes | yes | processing_list_count=0. | n/a
api-supervisor-idle | api | pass | yes | yes | state=idle, running=null. | n/a
smb-direct-post-files | smb | needs-follow-up | no | yes | V005166:stale-follow-up,source=index-required,job=index-required,nul=false, V002985:stale-follow-up,source=index-required,job=index-required,nul=false, V006161:stale-follow-up,source=index-required,job=index-required,nul=false, V005104:stale-follow-up,source=index-required,job=index-required,nul=false, V006260:stale-follow-up,source=index-required,job=index-required,nul=false | Mac SMB direct view appears stale while Admin API is safe. Recheck through a fresh SMB/container-side view before increasing batch size.
windows-cutter-acceptance | windows-cutter | pass | no | no | status=passed, runner=0.1.32, available=10471, release=v010471, search_index=v010471. | n/a

## Requests

| Probe | Request | HTTP | OK | Duration | Error |
| --- | --- | --- | --- | --- | --- |
auth_status | GET /api/admin/auth/status | 200 | yes | 38.3ms | none
library_status | GET /api/admin/library/status | 200 | yes | 14.1ms | none
supervisor_status | GET /api/admin/preprocess/supervisor/status | 200 | yes | 12.0ms | none
source_videos_processing | GET /api/admin/source-videos?status=processing&limit=20 | 200 | yes | 39.7ms | none
source_video:V005166 | GET /api/admin/source-videos/V005166 | 200 | yes | 8.2ms | none
source_video:V002985 | GET /api/admin/source-videos/V002985 | 200 | yes | 8.0ms | none
source_video:V006161 | GET /api/admin/source-videos/V006161 | 200 | yes | 6.8ms | none
source_video:V005104 | GET /api/admin/source-videos/V005104 | 200 | yes | 7.4ms | none
source_video:V006260 | GET /api/admin/source-videos/V006260 | 200 | yes | 8.0ms | none

## Summary

- Passed: 7
- Failed: 0
- Blocked: 0
- Needs follow-up: 1
- Not provided: 0
- Next small batch blockers: none
- Scale-up blockers: smb-direct-post-files

## Artifacts

- JSON: docs/acceptance/artifacts/admin-preprocess-post-batch-proof-20260629T210223Z.json
- Markdown: docs/acceptance/artifacts/admin-preprocess-post-batch-proof-20260629T210223Z.md
