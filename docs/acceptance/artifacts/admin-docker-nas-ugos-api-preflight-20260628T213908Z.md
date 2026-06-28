# Admin Docker NAS UGOS API Preflight

Generated: 2026-06-28T21:39:08.267Z
Mode: admin-docker-nas-ugos-api-preflight
Result: browserless-collection-ready
Direct UGOS collection available: yes
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
| desktop_html | 200 | n/a | none | html | 4.3ms | none |
| verify_is_login | 200 | 200 | success | object(avatar,need_bind,support_biometric,wallpaper) | 53.9ms | none |
| current_user | 200 | 200 | success | object(account_type,auth_list,cloud_backup,clusterId,date_format,deny_change_pwd,description,dir_quota,edev,email,enable_change_pwd,enable_home_dir) | 22.2ms | none |
| docker_app_uid | 200 | 200 | success | object(result) | 11.3ms | none |
| docker_container_list | 200 | 9405 | none | object(no-keys) | 32.8ms | none |
| docker_container_list_v2 | 200 | 200 | success | object(originalTotal,result,total) | 15ms | none |
| docker_overview | 200 | 200 | success | object(containerCount,containerCpuUsed,containerMemory,containerTotalMemory,cpuUsed,dataVolume,imageCount,memoryUsed,overviewContainers,projectCounr,runContainerCount,runProjectCounr) | 39.1ms | none |
| filemgr_share_list | 200 | 200 | success | object(result) | 43.2ms | none |
| machine_common | 200 | 200 | success | object(common,hardware) | 199ms | none |

## Gates

| Gate | Category | Status | Blocks Browserless Collection | Blocks Staging Review | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| ugos-api-preflight-no-side-effects | safety | pass | no | no | Only GET requests and Docker UI read-list POST requests are used; no login, upload, Docker mutation, container exec, compose edit, or PublicLibrary write is attempted. | n/a |
| ugos-auth-inputs-not-recorded | safety | pass | no | no | cookie_present=false, query_token_present=true, x_ugreen_auth_present=false, authorization_present=false; values are not written to artifacts. | n/a |
| ugos-desktop-reachable | desktop | pass | yes | no | http=200, bytes=3618, error=none | NAS desktop /desktop/ must be reachable before trying UGOS API collection. |
| ugos-api-json-reachable | api | pass | yes | no | verify_is_login:http=200 code=200, current_user:http=200 code=200, docker_app_uid:http=200 code=200, docker_container_list:http=200 code=9405, docker_container_list_v2:http=200 code=200, docker_overview:http=200 code=200, filemgr_share_list:http=200 code=200, machine_common:http=200 code=200 | At least one UGOS JSON API endpoint should return HTTP 200. |
| ugos-session-authenticated | auth | pass | yes | no | verify_is_login code=200, message=success | Provide an authenticated UGOS session through a temporary Cookie/X-Ugreen-Auth header; do not store NAS password in files or reports. |
| docker-app-context-ready | docker | pass | yes | no | docker_app_uid code=200, message=success, shape=object(result) | UGOS Docker app uid/context must be readable before browserless Docker evidence collection can replace SSH/desktop handoff. |
| docker-container-list-readable | docker | pass | yes | yes | docker_container_list_v2 code=200, message=success, shape=object(originalTotal,result,total); legacy docker_container_list code=9405 | Docker app ContainerListV2 must be readable before UGOS API can collect current-image and worker proof. |
| docker-overview-readable | docker | pass | yes | no | docker_overview code=200, message=success, shape=object(containerCount,containerCpuUsed,containerMemory,containerTotalMemory,cpuUsed,dataVolume,imageCount,memoryUsed,overviewContainers,projectCounr,runContainerCount,runProjectCounr) | Docker overview should be readable before browserless Docker evidence collection replaces desktop observation. |
| ugos-api-does-not-approve-deploy | safety | pass | no | no | push_execution_allowed=false, docker_deploy_allowed=false, docker_runtime_touched=false | n/a |

## Summary

- Browserless collection blockers: none
- Staging review blockers: none

## Next Actions

- Use the authenticated UGOS API path to implement a browserless NAS Docker evidence collector.
- Keep Docker deploy disabled until returned release inputs, disk proof, worker proof, and Cutter proof are accepted.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-nas-ugos-api-preflight-20260628T213908Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-nas-ugos-api-preflight-20260628T213908Z.md
