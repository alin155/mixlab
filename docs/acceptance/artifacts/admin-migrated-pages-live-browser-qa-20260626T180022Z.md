# Admin Migrated Pages Live Browser QA 2026-06-26T18:00:22.197Z

## Scope

This R.113 report validates migrated Admin production-console pages against a live local Admin API pointed at the real NAS-mounted public library. It is GET-only API probing plus browser rendering. It does not run scan, scan-apply, reconcile, restore, publish, settings save, ASR test, user mutation, workers, Docker, or Cutter package validation.

## Environment

- API base URL: `http://127.0.0.1:3893`
- Web base URL: `http://127.0.0.1:5187`
- Expected library root: `/Volumes/MixLab/PublicLibrary`
- Actual library root: `/Volumes/MixLab/PublicLibrary`
- Auth mode: `disabled`
- Authenticated: `true`
- Current index: `v010471`
- Counts: total `11394`, ready `10471`
- Admin read model: freshness `fresh`, safe `true`, scan `no-scan`

## Routes

| Page | Route | Browser | Load Phase | Endpoint Contracts | Screenshots |
| --- | --- | --- | --- | --- | --- |
| 发布与索引 | `index-publish` | passed | route-entry | /api/admin/source-videos (paged-list / admin-read-model)<br>/api/admin/index/versions (paged-list / index-version-packages) | desktop: `docs/acceptance/artifacts/admin-index-publish-browser-qa-20260626T180022Z-desktop.png`<br>mobile: `docs/acceptance/artifacts/admin-index-publish-browser-qa-20260626T180022Z-mobile.png` |
| 素材库 | `source-videos` | failed | route-entry | /api/admin/source-videos (paged-list / admin-read-model) | desktop: `docs/acceptance/artifacts/admin-source-videos-browser-qa-20260626T180022Z-desktop.png`<br>mobile: `docs/acceptance/artifacts/admin-source-videos-browser-qa-20260626T180022Z-mobile.png` |
| 剪辑师 | `cutter-users` | failed | route-entry | /api/admin/cutter-users (no-scan / user-store) | desktop: `docs/acceptance/artifacts/admin-cutter-users-browser-qa-20260626T180022Z-desktop.png`<br>mobile: `docs/acceptance/artifacts/admin-cutter-users-browser-qa-20260626T180022Z-mobile.png` |
| 系统检查 | `doctor` | passed | route-entry | /api/admin/doctor/report (status-scan / doctor-probes) | desktop: `docs/acceptance/artifacts/admin-doctor-browser-qa-20260626T180022Z-desktop.png`<br>mobile: `docs/acceptance/artifacts/admin-doctor-browser-qa-20260626T180022Z-mobile.png` |
| 设置 | `settings` | passed | route-entry | /api/admin/settings/config (no-scan / admin-settings)<br>/api/admin/settings/runtime (no-scan / runtime-secrets)<br>/api/admin/library/path-checks (no-scan / path-checks) | desktop: `docs/acceptance/artifacts/admin-settings-browser-qa-20260626T180022Z-desktop.png`<br>mobile: `docs/acceptance/artifacts/admin-settings-browser-qa-20260626T180022Z-mobile.png` |

## Direct API Probes

| Name | Path | Status | Result | Duration | Bytes |
| --- | --- | ---: | --- | ---: | ---: |
| health | `/health` | 200 | ok | 344.7ms | 792 |
| auth_status | `/api/admin/auth/status` | 200 | ok | 330.5ms | 133 |
| library_status | `/api/admin/library/status` | 200 | ok | 340.6ms | 732 |
| data_loading_plan | `/api/admin/data-loading/plan` | 200 | ok | 8.2ms | 12615 |
| read_model_status | `/api/admin/read-model/status` | 200 | ok | 374.5ms | 1459 |
| source_videos_first_page | `/api/admin/source-videos?limit=20` | 200 | ok | 429.9ms | 9776 |
| source_videos_index_required | `/api/admin/source-videos?status=index-required&limit=20` | 200 | ok | 406.5ms | 7824 |
| index_versions | `/api/admin/index/versions?limit=8` | 200 | ok | 3861.1ms | 2420 |
| cutter_users | `/api/admin/cutter-users` | 200 | ok | 337.3ms | 26535 |
| doctor_report | `/api/admin/doctor/report` | 200 | ok | 7598.6ms | 2091 |
| settings_config | `/api/admin/settings/config` | 200 | ok | 330.4ms | 629 |
| settings_runtime | `/api/admin/settings/runtime` | 200 | ok | 370.3ms | 545 |
| path_checks | `/api/admin/library/path-checks` | 200 | ok | 374.0ms | 557 |

## Gates

| Gate | Result | Detail |
| --- | --- | --- |
| direct-api-probes-pass | pass | all direct live API probes passed |
| isolated-auth-disabled | pass | auth_mode=disabled, authenticated=true |
| live-library-root | pass | actual=/Volumes/MixLab/PublicLibrary, expected=/Volumes/MixLab/PublicLibrary |
| live-library-counts | pass | total=11394, ready=10471, current_index=v010471 |
| admin-read-model-page-safe | pass | freshness=fresh, safe=true, scan=no-scan |
| data-loading-plan-no-hidden-full-scan | pass | hidden_full_scan_allowed=false |
| migrated-route-contracts | fail | settings:missing-route-endpoint:/api/admin/settings/config |
| migrated-browser-reports-pass | fail | source-videos:result=failed, cutter-users:result=failed |

## Result

- Status: `failed`
- Summary: migrated Admin pages live browser QA failed one or more gates
