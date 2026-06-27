# Admin Process History Live Browser QA 2026-06-26T16:23:58.921Z

## Scope

This R.106 report validates the live NAS-backed Admin Web `#/preprocess-jobs` page against the corrected process-history read-model hit state and the R.105 filter controls. It is browser QA plus GET-only API probes; it does not run reconcile, scan, apply, publish, Docker upload, or Cutter protocol work.

## Environment

- Web URL: `http://127.0.0.1:5186/#/preprocess-jobs`
- API base URL: `http://127.0.0.1:3892`
- Expected library root: `/Volumes/MixLab/PublicLibrary`
- Actual library root: `/Volumes/MixLab/PublicLibrary`
- Current index: `v010471`
- Counts: total `11394`, ready `10471`

## Process History

- Available: `true`
- Actual data source: `admin-read-model`
- Cache status: `hit`
- Scan mode: `no-scan`
- Returned count: `20`
- Item count: `20`
- Readiness: `true`
- Readiness reason: `ready`

## Filtered Process History

- API path: `/api/admin/preprocess/process-history?limit=20&window_days=30&source_folder_name=%E9%99%88%E6%B0%B8%E4%BA%AE&preprocess_status=queued&event_type=claimed`
- Selected source folder: `陈永亮`
- Selected status: `queued`
- Selected event: `claimed`
- Available: `true`
- Actual data source: `admin-read-model`
- Cache status: `hit`
- Scan mode: `no-scan`
- Returned count: `11`
- Item count: `11`
- Echoed filters: `{"source_folder_name":"陈永亮","preprocess_status":"queued","event_type":"claimed"}`
- Rows match filters: `true`
- Filter options include selected values: `true`
- Row match failures: none

## Browser Evidence

| viewport | size | load | rows | filtered rows | controls | filtered request | overflow | screenshot |
| --- | ---: | ---: | ---: | ---: | --- | --- | ---: | --- |
| desktop | 1440x960 | 5766.0ms | 11 | 11 | visible | yes | 0px | `docs/acceptance/artifacts/admin-process-history-live-browser-qa-20260626T162358Z-desktop.png` |
| mobile | 390x844 | 7256.5ms | 11 | 11 | visible | yes | 0px | `docs/acceptance/artifacts/admin-process-history-live-browser-qa-20260626T162358Z-mobile.png` |

## Direct API Probes

| path | status | result | duration | bytes |
| --- | ---: | --- | ---: | ---: |
| `/api/admin/library/status` | 200 | ok | 102.7ms | 732 |
| `/api/admin/preprocess/process-history/readiness` | 200 | ok | 327.6ms | 789 |
| `/api/admin/preprocess/process-history?limit=20&window_days=30` | 200 | ok | 2836.8ms | 10109 |
| `/api/admin/preprocess/process-history?limit=20&window_days=30&source_folder_name=%E9%99%88%E6%B0%B8%E4%BA%AE&preprocess_status=queued&event_type=claimed` | 200 | ok | 2839.5ms | 5166 |

## Gates

| gate | result | detail |
| --- | --- | --- |
| api-request-success | pass | all direct API probes passed |
| library-root | pass | actual=/Volumes/MixLab/PublicLibrary, expected=/Volumes/MixLab/PublicLibrary |
| process-history-api-hit | pass | available=true, source=admin-read-model, cache=hit, scan=no-scan, item_count=20 |
| process-history-readiness-ready | pass | ready=true, reason=ready |
| process-history-filter-selected | pass | source=陈永亮, status=queued, event=claimed |
| process-history-filtered-api-hit | pass | available=true, source=admin-read-model, cache=hit, scan=no-scan, item_count=11, echoed=true, rows_match=true, options=true, failures=none |
| browser-visible-read-model-hit | pass | all required process-history labels visible |
| browser-renders-history-rows | pass | rows=desktop:11, mobile:11 |
| browser-filter-interaction | pass | all viewports applied filters and rendered filtered rows |
| browser-observed-filtered-request | pass | observed=desktop, mobile |
| browser-no-console-errors | pass | no browser console errors |
| browser-no-failed-api-requests | pass | no failed Admin API requests observed by browser |
| browser-no-mobile-horizontal-overflow | pass | desktop and mobile document widths fit viewport |

## Result

- Status: `passed`
- Summary: browser QA passed with admin-read-model/no-scan/hit, 20 baseline rows, and 11 filtered rows
- Failed gates: none

## Notes

- R.106 extends the R.84 Admin Web route QA with live R.105 process-history filter proof.
- The process-history panel must render read-model hit evidence and the selected source/status/event filters must stay admin-read-model/no-scan/hit.
- This script performs direct API GET probes and browser rendering checks only. It does not run reconcile, scan, apply, publish, Docker, or Cutter commands.
- The admin.sqlite read model is a rebuildable query projection; source-video manifests, preprocess-job files and release/index outputs remain the durable facts.
