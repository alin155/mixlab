# Admin Docker NAS UGOS API Preflight

Generated: 2026-06-28T20:54:00.003Z
Mode: admin-docker-nas-ugos-api-preflight
Result: blocked
Direct UGOS collection available: no
Push execution allowed: no
Docker deploy allowed: no
Docker runtime touched: no

This preflight is read-only and does not log in. Auth header values, if supplied through environment variables, are not written to artifacts.

## Target

- Base URL: http://192.168.1.27:9999
- Desktop version: 1.15.0.77682
- Desktop build: 4/23/2026
- Cookie present: no
- Query token present: yes
- X-Ugreen-Auth present: no
- Authorization present: no

## Probes

| Probe | HTTP | API Code | Message | Shape | Duration | Error |
| --- | --- | --- | --- | --- | --- | --- |
| desktop_html | 200 | n/a | none | html | 37ms | none |
| verify_is_login | 200 | 200 | success | object(avatar,need_bind,support_biometric,wallpaper) | 42.1ms | none |
| current_user | 200 | 200 | success | object(account_type,auth_list,cloud_backup,clusterId,date_format,deny_change_pwd,description,dir_quota,edev,email,enable_change_pwd,enable_home_dir) | 26ms | none |
| docker_app_uid | 200 | 200 | success | object(result) | 17.5ms | none |
| docker_container_list | 200 | 9405 | none | object(no-keys) | 35.4ms | none |
| filemgr_share_list | 200 | 200 | success | object(result) | 163.1ms | none |
| machine_common | 200 | 200 | success | object(common,hardware) | 514.5ms | none |

## Gates

| Gate | Category | Status | Blocks Browserless Collection | Blocks Staging Review | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| ugos-api-preflight-no-side-effects | safety | pass | no | no | Only GET requests are used; no login, upload, Docker mutation, container exec, compose edit, or PublicLibrary write is attempted. | n/a |
| ugos-auth-inputs-not-recorded | safety | pass | no | no | cookie_present=false, query_token_present=true, x_ugreen_auth_present=false, authorization_present=false; values are not written to artifacts. | n/a |
| ugos-desktop-reachable | desktop | pass | yes | no | http=200, bytes=3618, error=none | NAS desktop /desktop/ must be reachable before trying UGOS API collection. |
| ugos-api-json-reachable | api | pass | yes | no | verify_is_login:http=200 code=200, current_user:http=200 code=200, docker_app_uid:http=200 code=200, docker_container_list:http=200 code=9405, filemgr_share_list:http=200 code=200, machine_common:http=200 code=200 | At least one UGOS JSON API endpoint should return HTTP 200. |
| ugos-session-authenticated | auth | pass | yes | no | verify_is_login code=200, message=success | Provide an authenticated UGOS session through a temporary Cookie/X-Ugreen-Auth header; do not store NAS password in files or reports. |
| docker-app-context-ready | docker | pass | yes | no | docker_app_uid code=200, message=success, shape=object(result) | UGOS Docker app uid/context must be readable before browserless Docker evidence collection can replace SSH/desktop handoff. |
| docker-container-list-readable | docker | blocked | yes | yes | docker_container_list code=9405, message=none, shape=object(no-keys) | Container list must be readable before UGOS API can collect current-image and worker proof. |
| ugos-api-does-not-approve-deploy | safety | pass | no | no | push_execution_allowed=false, docker_deploy_allowed=false, docker_runtime_touched=false | n/a |

## Summary

- Browserless collection blockers: docker-container-list-readable
- Staging review blockers: docker-container-list-readable

## Next Actions

- Keep using the portable NAS handoff kit as the primary evidence path until an authenticated UGOS API session is available.
- Do not put NAS passwords in scripts, reports, shell history, or committed files.
- If UGOS API stays blocked, run the already-transferred handoff kit from the NAS desktop or NAS shell and return admin-docker-release-inputs/.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-nas-ugos-api-preflight-20260628T205400Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-nas-ugos-api-preflight-20260628T205400Z.md
