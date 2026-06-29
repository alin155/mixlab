# Admin Preprocess Post-Batch Proof

Generated: 2026-06-29T21:18:24.285Z

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
- Source videos: V005167, V006278
- Expected root: /data/PublicLibrary
- Expected ready count: 10471
- Expected index version: v010471
- Expected queued count: 873
- Expected index-required count: 49
- Library mount root: /Volumes/MixLab/PublicLibrary
- Windows acceptance report: docs/acceptance/artifacts/windows_acceptance-20260629T211810Z-bf821d39/report.json

## Observed

- Library: root=/data/PublicLibrary, ready=10471, queued=873, processing=0, index_required=49, index=v010471
- Supervisor: idle
- Processing list count: 0
- Windows: status=passed, runner=0.1.32, available=10471, release=v010471, search_index=v010471

## Source Items

| Source Video | API OK | API Status | API Visible | API Passed | SMB Status | SMB Source | SMB Job | SMB NUL |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
V005167 | yes | index-required | false | yes | stale-follow-up | index-required | index-required | false
V006278 | yes | index-required | false | yes | stale-follow-up | index-required | index-required | false

## Gates

| Gate | Category | Status | Blocks Next Small Batch | Blocks Scale-Up | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- |
source-video-ids-provided | scope | pass | yes | yes | source_video_ids=V005167, V006278. | n/a
nas-docker-admin-target | target | pass | yes | yes | Target URL shape is compatible with the NAS Docker admin-web root. | n/a
api-library-baseline-preserved | api | pass | yes | yes | root=/data/PublicLibrary, ready=10471, queued=873, processing=0, index_required=49, index=v010471. | n/a
api-selected-sources-index-required-hidden | api | pass | yes | yes | V005167:index-required/visible=false, V006278:index-required/visible=false | n/a
api-processing-list-empty | api | pass | yes | yes | processing_list_count=0. | n/a
api-supervisor-idle | api | pass | yes | yes | state=idle, running=null. | n/a
smb-direct-post-files | smb | needs-follow-up | no | yes | V005167:stale-follow-up,source=index-required,job=index-required,nul=false, V006278:stale-follow-up,source=index-required,job=index-required,nul=false | Mac SMB direct view appears stale while Admin API is safe. Recheck through a fresh SMB/container-side view before increasing batch size.
windows-cutter-acceptance | windows-cutter | pass | no | no | status=passed, runner=0.1.32, available=10471, release=v010471, search_index=v010471. | n/a

## Requests

| Probe | Request | HTTP | OK | Duration | Error |
| --- | --- | --- | --- | --- | --- |
auth_status | GET /api/admin/auth/status | 200 | yes | 33.6ms | none
library_status | GET /api/admin/library/status | 200 | yes | 14.4ms | none
supervisor_status | GET /api/admin/preprocess/supervisor/status | 200 | yes | 16.4ms | none
source_videos_processing | GET /api/admin/source-videos?status=processing&limit=20 | 200 | yes | 64.7ms | none
source_video:V005167 | GET /api/admin/source-videos/V005167 | 200 | yes | 7.4ms | none
source_video:V006278 | GET /api/admin/source-videos/V006278 | 200 | yes | 7.4ms | none

## Summary

- Passed: 7
- Failed: 0
- Blocked: 0
- Needs follow-up: 1
- Not provided: 0
- Next small batch blockers: none
- Scale-up blockers: smb-direct-post-files

## Artifacts

- JSON: docs/acceptance/artifacts/admin-preprocess-post-batch-proof-20260629T211824Z.json
- Markdown: docs/acceptance/artifacts/admin-preprocess-post-batch-proof-20260629T211824Z.md
