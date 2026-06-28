# Admin Docker NAS UGOS API Preflight

Generated: 2026-06-28T22:39:14.754Z
Mode: admin-docker-nas-ugos-api-preflight
Result: browserless-collection-ready
Direct UGOS collection available: yes
Push execution allowed: no
Docker deploy allowed: no
Docker runtime touched: no

This preflight is Docker/runtime read-only. It may create a temporary UGOS session when username/password environment variables are supplied, but auth values are not written to artifacts.

## Target

- Base URL: http://192.168.1.27:9999
- Desktop version: 1.15.0.77682
- Desktop build: 4/23/2026
- Cookie present: yes
- Query token present: yes
- X-Ugreen-Auth present: no
- Authorization present: no
- Username/password present: yes
- Password login attempted: yes
- Password login succeeded: yes
- Password login code: 200
- Password login message: success
- Password login token present: yes
- Password login cookie present: yes

## Probes

| Probe | HTTP | API Code | Message | Shape | Duration | Error |
| --- | --- | --- | --- | --- | --- | --- |
| desktop_html | 200 | n/a | none | html | 6.8ms | none |
| verify_is_login | 200 | 1114 | Illegal operation, unauthorized user | object(no-keys) | 11.7ms | none |
| current_user | 200 | 1114 | Illegal operation, unauthorized user | object(no-keys) | 14.9ms | none |
| docker_app_uid | 200 | 200 | success | object(result) | 29.4ms | none |
| docker_container_list | 200 | 9405 | none | object(no-keys) | 27.6ms | none |
| docker_container_list_v2 | 200 | 200 | success | object(originalTotal,result,total) | 29.5ms | none |
| docker_overview | 200 | 1114 | Illegal operation, unauthorized user | object(no-keys) | 29ms | none |
| filemgr_share_list | 200 | 1114 | Illegal operation, unauthorized user | object(no-keys) | 13.6ms | none |
| machine_common | 200 | 1114 | Illegal operation, unauthorized user | object(no-keys) | 28.1ms | none |

## Gates

| Gate | Category | Status | Blocks Browserless Collection | Blocks Staging Review | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| ugos-api-preflight-no-side-effects | safety | pass | no | no | Only optional session login plus GET requests and Docker UI read-list POST requests are used; password_login_attempted=true. No upload, Docker mutation, container exec, compose edit, or PublicLibrary write is attempted. | n/a |
| ugos-auth-inputs-not-recorded | safety | pass | no | no | cookie_present=true, query_token_present=true, x_ugreen_auth_present=false, authorization_present=false, username_password_present=true, password_login_succeeded=true, password_login_code=200, password_login_token_present=true, password_login_cookie_present=true; values are not written to artifacts. | n/a |
| ugos-desktop-reachable | desktop | pass | yes | no | http=200, bytes=3618, error=none | NAS desktop /desktop/ must be reachable before trying UGOS API collection. |
| ugos-api-json-reachable | api | pass | yes | no | verify_is_login:http=200 code=1114, current_user:http=200 code=1114, docker_app_uid:http=200 code=200, docker_container_list:http=200 code=9405, docker_container_list_v2:http=200 code=200, docker_overview:http=200 code=1114, filemgr_share_list:http=200 code=1114, machine_common:http=200 code=1114 | At least one UGOS JSON API endpoint should return HTTP 200. |
| ugos-session-authenticated | auth | pass | yes | no | verify_is_login code=1114, message=Illegal operation, unauthorized user, password_login_succeeded=true | Provide an authenticated UGOS session or successful in-memory username/password login; do not store NAS password in files or reports. |
| docker-app-context-ready | docker | pass | yes | no | docker_app_uid code=200, message=success, shape=object(result) | UGOS Docker app uid/context must be readable before browserless Docker evidence collection can replace SSH/desktop handoff. |
| docker-container-list-readable | docker | pass | yes | yes | docker_container_list_v2 code=200, message=success, shape=object(originalTotal,result,total); legacy docker_container_list code=9405 | Docker app ContainerListV2 must be readable before UGOS API can collect current-image and worker proof. |
| docker-overview-readable | docker | blocked | no | no | docker_overview code=1114, message=Illegal operation, unauthorized user, shape=object(no-keys) | Docker overview is useful for desktop parity observation, but returned evidence collection only requires Docker app uid and ContainerListV2/GetContainerById reads. |
| ugos-api-does-not-approve-deploy | safety | pass | no | no | push_execution_allowed=false, docker_deploy_allowed=false, docker_runtime_touched=false | n/a |

## Summary

- Browserless collection blockers: none
- Staging review blockers: none

## Next Actions

- Use the authenticated UGOS API path to implement a browserless NAS Docker evidence collector.
- Keep Docker deploy disabled until returned release inputs, disk proof, worker proof, and Cutter proof are accepted.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-nas-ugos-api-preflight-20260628T223914Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-nas-ugos-api-preflight-20260628T223914Z.md
