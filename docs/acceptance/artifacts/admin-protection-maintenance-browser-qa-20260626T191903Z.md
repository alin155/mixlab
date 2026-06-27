# Admin Protection Maintenance Browser QA

Generated: 2026-06-26T19:19:03.933Z
Result: passed
Summary: Protection Center maintenance controls posted only isolated read-model reconcile start/cancel commands

## Scope

This R.120 report starts an isolated mock Admin API and a temporary Admin Web dev server. It proves the real Protection Center controls send only `POST /api/admin/read-model/reconcile` and `POST /api/admin/read-model/reconcile/cancel` to the mock API. It does not touch NAS data, Docker, Cutter protocols, live reconcile, scan, restore, publish, settings save, or user mutations.

## Environment

- API base URL: `http://127.0.0.1:58310`
- Web base URL: `http://127.0.0.1:58311`
- Output dir: `docs/acceptance/artifacts`
- Final hash: `#/protection`
- Screenshot: `docs/acceptance/artifacts/admin-protection-maintenance-browser-qa-20260626T191903Z-desktop.png`

## Gates

| Gate | Result | Detail |
| --- | --- | --- |
| isolated-local-mock-api | pass | api=http://127.0.0.1:58310, web=http://127.0.0.1:58311, nas_mutation_allowed=false |
| protection-controls-visible | pass | final_hash=#/protection |
| start-command-posted-once | pass | start_post_count=1 |
| cancel-command-posted-once | pass | cancel_post_count=1 |
| no-forbidden-command-posts | pass | only read-model reconcile start/cancel command posts observed |
| status-and-overview-read-locally | pass | status_get_count=3, operations_overview_get_count=3 |
| button-state-contract | pass | initial_start_disabled=false, initial_cancel_disabled=true, cancel_enabled_after_start=true, cancel_disabled_after_cancel=true, cancel_requested=true |
| no-console-errors | pass | console_errors=0 |
| no-failed-admin-api-requests | pass | no failed Admin API requests |

## Command Posts

| Endpoint | Count |
| --- | ---: |
| `/api/admin/read-model/reconcile` | 1 |
| `/api/admin/read-model/reconcile/cancel` | 1 |
| forbidden command posts | 0 |

## Browser State

| Field | Value |
| --- | --- |
| Initial start disabled | `false` |
| Initial cancel disabled | `true` |
| Cancel enabled after start | `true` |
| Cancel disabled after cancel | `true` |
| Body contains cancel requested | `true` |

## Mock API Requests

| # | Method | Path | Search | Status | Duration |
| ---: | --- | --- | --- | ---: | ---: |
| 1 | GET | `/api/admin/auth/status` | `` | 200 | 1.2 |
| 2 | GET | `/api/admin/operations/overview` | `` | 200 | 0.7 |
| 3 | GET | `/api/admin/read-model/reconcile/status` | `` | 200 | 0.1 |
| 4 | GET | `/api/admin/library/status` | `` | 200 | 0.2 |
| 5 | GET | `/api/admin/settings/config` | `` | 200 | 0.2 |
| 6 | GET | `/api/admin/preprocess/supervisor/status` | `` | 200 | 0.2 |
| 7 | GET | `/api/admin/data-loading/plan` | `` | 200 | 0.2 |
| 8 | GET | `/api/admin/dashboard/metrics` | `` | 200 | 0.3 |
| 9 | POST | `/api/admin/read-model/reconcile` | `` | 200 | 0.3 |
| 10 | GET | `/api/admin/library/status` | `` | 200 | 0.3 |
| 11 | GET | `/api/admin/operations/overview` | `` | 200 | 0.4 |
| 12 | GET | `/api/admin/read-model/reconcile/status` | `` | 200 | 0.1 |
| 13 | GET | `/api/admin/dashboard/metrics` | `` | 200 | 0.1 |
| 14 | GET | `/api/admin/settings/config` | `` | 200 | 0.1 |
| 15 | GET | `/api/admin/preprocess/supervisor/status` | `` | 200 | 0.2 |
| 16 | GET | `/api/admin/data-loading/plan` | `` | 200 | 0.3 |
| 17 | POST | `/api/admin/read-model/reconcile/cancel` | `` | 200 | 0.2 |
| 18 | GET | `/api/admin/library/status` | `` | 200 | 0.1 |
| 19 | GET | `/api/admin/operations/overview` | `` | 200 | 0.2 |
| 20 | GET | `/api/admin/read-model/reconcile/status` | `` | 200 | 0.1 |
| 21 | GET | `/api/admin/dashboard/metrics` | `` | 200 | 0.1 |
| 22 | GET | `/api/admin/settings/config` | `` | 200 | 0.1 |
| 23 | GET | `/api/admin/preprocess/supervisor/status` | `` | 200 | 0 |
| 24 | GET | `/api/admin/data-loading/plan` | `` | 200 | 0.1 |
