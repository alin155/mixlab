# M18.5 Windows Cutter UI Foundation Final Acceptance

Date: 2026-06-21

## Scope

This acceptance record covers the Windows desktop package produced after the UI Foundation cutter cleanup and the sidebar library-count fix.

It also records the public-library release correction from `v007950` to `v010471`, because the cutter desktop reads the fast release catalog before falling back to slower NAS/index reads.

## Package

| Field | Value |
| --- | --- |
| Product | MixLab Cutter |
| Version | 0.18.10 |
| Commit | `e58b0c0c52dfe77cfec030dbd5bd98f1e4559cd7` |
| GitHub Actions run | `27926100937` |
| Installer | `/Users/huaqihang/Public/MixLabWindowsBuilds/MixLab Cutter_0.18.10_x64-setup-e58b0c0.exe` |
| SHA-256 | `616ef8e82580c422d0088fbeae1fcdbbc2335de397f9fe67d23396b7d29bea03` |
| Shared latest metadata | `/Users/huaqihang/Public/MixLabWindowsBuilds/latest.json` |

## Data Correction

Before this acceptance pass, the admin/library index had advanced to `v010471` with `10471` ready videos, while the cutter release catalog still pointed to `v007950` with `7950` ready videos.

`publishCutterRelease` was run for `v010471`, producing:

- `.mixlab-library/current-release.json` -> `v010471`
- `.mixlab-library/releases/v010471/release.json`
- `.mixlab-library/releases/v010471/catalog.sqlite`
- `.mixlab-library/releases/v010471/source-path-map.json`
- `.mixlab-library/releases/v010471/search-index/source-transcript-index/v010471/index.sqlite`

The Windows cutter runtime then synchronized the local release cache and reported `10471` available public videos.

## Verification

### Local

- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts`
- `node --test --import tsx packages/ui-foundation/src/components.test.ts`
- `npm run build:cutter-web`
- `npm run typecheck`
- `node --test --import tsx scripts/desktop/windows-runtime.test.ts packages/cutter-api/src/desktop-sidecar.test.ts packages/desktop-runtime/src/index.test.ts apps/cutter-web/src/desktop-bridge.test.ts apps/cutter-desktop/src/tauri-config.test.ts`
- `npm run visual:cutter-web`
- `git diff --check`

### Windows Runner

Runner: main `0.1.13` at `http://192.168.1.20:3799`.

Shared Runner package updated during this pass:

- Active shared Runner: `0.1.31`
- Commit: `810d1e5`
- GitHub Actions run: `27929551191`
- Shared latest: `/Users/huaqihang/Public/MixLabWindowsBuilds/runner/latest.json`
- SHA-256: `3a73c75ac5f11d30e978cb509daf84556215523ed6b72bd999cd40fbf0bff550`
- Purpose: capture clean Windows desktop UI screenshots and dismiss the Windows Security / Firewall prompt that appeared when launching a backup Node Runner.

Install smoke:

- Run: `install_latest_and_smoke-20260622T033101Z-e47cfbf7`
- Report: `/Users/huaqihang/Public/MixLabWindowsBuilds/reports/install_latest_and_smoke-20260622T033101Z-e47cfbf7/report.json`
- Result: passed
- Install exit code: `0`
- Install elapsed: `7135ms`
- Installed SHA-256: `616ef8e82580c422d0088fbeae1fcdbbc2335de397f9fe67d23396b7d29bea03`
- Runtime available videos: `10471`
- Source library first page: `20 / 10471`
- Auth mode: `reviewed`, `local_trusted=false`
- Auth source: credential login, no session token leaked into the report

Stable Windows acceptance:

- Run: `windows_acceptance-20260622T033351Z-a641ee2c`
- Report: `/Users/huaqihang/Public/MixLabWindowsBuilds/reports/windows_acceptance-20260622T033351Z-a641ee2c/report.json`
- Result: passed
- Runtime status: `276ms`
- Source library first page: `20 / 10471`, `53ms`
- Search query: `第一场`
- Search result: `51ms` elapsed, `8ms` search time, `searchd`
- Full transcript detail: `31ms`
- Cut jobs: `158ms`, `14` jobs, `12` done, `2` failed

Real cut smoke:

- Run: `real_cut_smoke-20260622T033449Z-ab051386`
- Report: `/Users/huaqihang/Public/MixLabWindowsBuilds/reports/real_cut_smoke-20260622T033449Z-ab051386/report.json`
- Result: passed
- Query: `第一场`
- Selected source video: `V010574`, title `C0728`
- Clip list: `CL20260622-0001`
- Cut job: `CJ20260622-0001`
- Run-next status: `done`
- Run-next elapsed: `1169ms`
- Output file: `export-clips/E000013/001-Windows验收剪切-20260622033449-C0728.mp4`

Phase timings:

| Phase | Duration |
| --- | ---: |
| queue_wait | 80ms |
| resolve_source | 1ms |
| preflight_source | 2ms |
| cut_media | 984ms |
| write_project_output | 2ms |
| preprocess_local_asset | 4ms |
| generate_cover | 139ms |
| write_manifest | 6ms |

Desktop screenshot smoke:

- Runner: `0.1.31` launched through the main `0.1.13` Runner on Windows localhost port `3875`
- Screenshot run: `desktop_ui_screenshot_smoke-20260622T043112Z-cdbf15ef`
- Screenshot report: `/Users/huaqihang/Public/MixLabWindowsBuilds/reports/desktop_ui_screenshot_smoke-20260622T043112Z-cdbf15ef/report.json`
- Screenshot directory: `/Users/huaqihang/Public/MixLabWindowsBuilds/reports/desktop_ui_screenshot_smoke-20260622T043112Z-cdbf15ef/screenshots`
- Captured: `8 / 8`
- Pages: project home, material search, cut tasks, local library, public library, source detail, cache management, settings

Manual visual review:

- `project-home.png`: clean app shell, no Windows prompt, no browser-level scrollbar, sidebar footer shows `本地 13 / 公共 10471`.
- `material-locator.png`: clean material search empty state.
- `cut-tasks.png`: clean task table and inspector.
- `public-library.png`: clean library grid, `20 / 10471`, detail panel visible.
- `source-detail.png`: clean public-source detail page.
- `cache-management.png`: cache page shows about `48GB` total cache with release, search index, source video, and cut temp categories.
- `settings.png`: current editor `hqh`, available public materials `10471`, local materials `13`, reviewed-mode settings visible.

## Outcome

The package is accepted as the current internal Windows desktop test build for the UI Foundation cutter surface.

The sidebar library count bug is fixed in code by removing route-specific count ordering and always rendering `本地 <localCount> / 公共 <publicCount>`.

The public-library count mismatch was not a frontend rendering bug. It was caused by a stale cutter release catalog. The cutter release is now aligned with the current index at `v010471`.

The `e58b0c0` package also hardens the cut job list against legacy or corrupt workspace job files, preventing a bad local job record from breaking the cut task list or search workflow after a cut attempt.

## Residual Risk

The Windows Security / Firewall dialog was a test-infrastructure issue caused by launching a backup Node Runner process, not a product UI bug. Runner `0.1.31` now dismisses it before screenshots, and the clean screenshot run above passed.

The material-search screenshot smoke records the empty/search-entry state. Search performance and real cut behavior are covered separately by the stable Windows acceptance and real cut smoke reports.
