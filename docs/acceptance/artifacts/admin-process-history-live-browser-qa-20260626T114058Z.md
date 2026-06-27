# Admin Process History Live Browser QA 2026-06-26T11:40:58.777Z

## Scope

This R.84 report validates the live NAS-backed Admin Web `#/preprocess-jobs` page against the corrected process-history read-model hit state. It is browser QA plus GET-only API probes; it does not run reconcile, scan, apply, publish, Docker upload, or Cutter protocol work.

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

## Browser Evidence

| viewport | size | load | rows | overflow | screenshot |
| --- | ---: | ---: | ---: | ---: | --- |
| desktop | 1440x960 | 8254.5ms | 20 | 0px | `docs/acceptance/artifacts/admin-process-history-live-browser-qa-20260626T114058Z-desktop.png` |
| mobile | 390x844 | 6934.3ms | 20 | 0px | `docs/acceptance/artifacts/admin-process-history-live-browser-qa-20260626T114058Z-mobile.png` |

## Direct API Probes

| path | status | result | duration | bytes |
| --- | ---: | --- | ---: | ---: |
| `/api/admin/library/status` | 200 | ok | 71.2ms | 732 |
| `/api/admin/preprocess/process-history/readiness` | 200 | ok | 306.2ms | 789 |
| `/api/admin/preprocess/process-history?limit=20&window_days=30` | 200 | ok | 2949.3ms | 6686 |

## Gates

| gate | result | detail |
| --- | --- | --- |
| api-request-success | pass | all direct API probes passed |
| library-root | pass | actual=/Volumes/MixLab/PublicLibrary, expected=/Volumes/MixLab/PublicLibrary |
| process-history-api-hit | pass | available=true, source=admin-read-model, cache=hit, scan=no-scan, item_count=20 |
| process-history-readiness-ready | pass | ready=true, reason=ready |
| browser-visible-read-model-hit | pass | all required process-history labels visible |
| browser-renders-history-rows | pass | rows=desktop:20, mobile:20 |
| browser-no-console-errors | pass | no browser console errors |
| browser-no-failed-api-requests | pass | no failed Admin API requests observed by browser |
| browser-no-mobile-horizontal-overflow | pass | desktop and mobile document widths fit viewport |

## Result

- Status: `passed`
- Summary: browser QA passed with admin-read-model/no-scan/hit and 20 process-history rows
- Failed gates: none

## Notes

- R.84 validates the Admin Web route with live NAS-backed data after the R.83 read-model rebuild.
- The process-history panel must render read-model hit evidence; a safe miss is not accepted for this browser QA slice.
- This script performs direct API GET probes and browser rendering checks only. It does not run reconcile, scan, apply, publish, Docker, or Cutter commands.
- The admin.sqlite read model is a rebuildable query projection; source-video manifests, preprocess-job files and release/index outputs remain the durable facts.
