# Admin Docker MVP Browser QA

Generated: 2026-06-29T15:58:17.492Z

Target: http://192.168.1.27:18080

Image tag: 5a50922bc82f1b6728f247ed33e5885ab8cf6bef

Result: ready

Mutates NAS files: false

## Pages
- pass: #/dashboard - Logged-in dashboard rendered with /data/PublicLibrary, v010471, ready 10471, preprocess idle. (docs/acceptance/artifacts/admin-docker-mvp-browser-qa-20260629T155802Z/dashboard.png)
- pass: #/cutter-users - Cutter users page rendered user table: 16 users, 15 approved, 1 disabled, 0 pending. (docs/acceptance/artifacts/admin-docker-mvp-browser-qa-20260629T155802Z/cutter-users.png)
- pass: #/preprocess-jobs - Preprocess page rendered queue and index status: 904 queued, 0 processing, 0 failed, v010471 current index. (docs/acceptance/artifacts/admin-docker-mvp-browser-qa-20260629T155802Z/preprocess-jobs.png)
- pass: #/source-videos - Source videos page rendered read-model paginated list: 11394 total, 10471 searchable, first 20 loaded. (docs/acceptance/artifacts/admin-docker-mvp-browser-qa-20260629T155802Z/source-videos.png)

JSON: docs/acceptance/artifacts/admin-docker-mvp-browser-qa-20260629T155802Z/report.json
Markdown: docs/acceptance/artifacts/admin-docker-mvp-browser-qa-20260629T155802Z/summary.md