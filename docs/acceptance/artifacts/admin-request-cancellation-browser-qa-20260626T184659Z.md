# Admin Request Cancellation Browser QA

Generated: 2026-06-26T18:46:59.707Z
Result: passed
Summary: Admin Web route-owned request cancellation was observed before the delayed mock API response

## Scope

This R.117 report starts an isolated mock Admin API and a temporary Admin Web dev server. It proves the real Admin Web route-owned `GET /api/admin/source-videos` request is cancelled when the browser navigates away from `#/source-videos`. It does not touch NAS data, Docker, Cutter protocols, scan, scan-apply, reconcile, restore, publish, settings save, or user mutations.

## Environment

- API base URL: `http://127.0.0.1:56789`
- Web base URL: `http://127.0.0.1:56790`
- Output dir: `docs/acceptance/artifacts`
- Delayed response: `5000ms`
- Final hash: `#/dashboard`

## Gates

| Gate | Result | Detail |
| --- | --- | --- |
| isolated-local-mock-api | pass | api=http://127.0.0.1:56789, web=http://127.0.0.1:56790 |
| delayed-source-videos-request-started | pass | GET /api/admin/source-videos?limit=20 |
| route-change-returned-to-dashboard | pass | final_hash=#/dashboard, has_overview=true |
| delayed-request-aborted-before-response | pass | aborted=true, response_sent_at=none, duration_ms=38.4 |
| no-console-errors | pass | console_errors=0 |
| no-unexpected-request-failures | pass | no unexpected browser request failures |

## Delayed Request

| Field | Value |
| --- | --- |
| Started | `2026-06-26T18:47:00.216Z` |
| Closed | `2026-06-26T18:47:00.254Z` |
| Response Sent | `none` |
| Aborted Before Response | `true` |
| Duration ms | `38.4` |

## Mock API Requests

| # | Method | Path | Search | Aborted Before Response | Status | Duration |
| ---: | --- | --- | --- | --- | ---: | ---: |
| 1 | GET | `/api/admin/auth/status` | `` | no | 200 | 1.1 |
| 2 | GET | `/api/admin/library/status` | `` | no | 200 | 0.4 |
| 3 | GET | `/api/admin/settings/config` | `` | no | 200 | 0.1 |
| 4 | GET | `/api/admin/preprocess/supervisor/status` | `` | no | 200 | 0.2 |
| 5 | GET | `/api/admin/data-loading/plan` | `` | no | 200 | 0.1 |
| 6 | GET | `/api/admin/preprocess/jobs` | `?limit=20` | no | 200 | 0.2 |
| 7 | GET | `/api/admin/library/status` | `` | no | 200 | 0.1 |
| 8 | GET | `/api/admin/dashboard/metrics` | `` | no | 200 | 0.1 |
| 9 | GET | `/api/admin/source-videos` | `?limit=20` | yes | n/a | 38.4 |
| 10 | GET | `/api/admin/dashboard/metrics` | `` | no | 200 | 0.1 |
| 11 | GET | `/api/admin/library/status` | `` | no | 200 | 0.1 |
| 12 | GET | `/api/admin/preprocess/jobs` | `?limit=20` | no | 200 | 0.1 |
| 13 | GET | `/api/admin/dashboard/metrics` | `` | no | 200 | 0.1 |
