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
| Commit | `fee718403e86910a34b4b5b00e7208c9f2ef28fe` |
| GitHub Actions run | `27915627515` |
| Installer | `/Users/huaqihang/Public/MixLabWindowsBuilds/MixLab Cutter_0.18.10_x64-setup-fee7184.exe` |
| SHA-256 | `fa6917108943c039ab8146f7aa6fb5caf966a356cb2db27a0476b55ff7e3b0fc` |
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

Runner: `0.1.13` at `http://192.168.1.20:3799`.

Install smoke:

- Run: `install_latest_and_smoke-20260621T200636Z-0db14ade`
- Report: `/Users/huaqihang/Public/MixLabWindowsBuilds/reports/install_latest_and_smoke-20260621T200636Z-0db14ade/report.json`
- Result: passed
- Install exit code: `0`
- Install elapsed: `6905ms`
- Installed SHA-256: `fa6917108943c039ab8146f7aa6fb5caf966a356cb2db27a0476b55ff7e3b0fc`
- Runtime available videos: `10471`
- Source library first page: `20 / 10471`, `27ms`
- Auth mode: `reviewed`, `local_trusted=false`

Real cut smoke:

- Run: `real_cut_smoke-20260621T200740Z-504436ad`
- Report: `/Users/huaqihang/Public/MixLabWindowsBuilds/reports/real_cut_smoke-20260621T200740Z-504436ad/report.json`
- Result: passed
- Query: `第一场`
- Selected source video: `V010574`, title `C0728`
- Clip list: `CL20260621-0002`
- Cut job: `CJ20260621-0002`
- Run-next status: `done`
- Run-next elapsed: `1020ms`
- Output file: `export-clips/E000012/001-Windows验收剪切-20260621200740-C0728.mp4`

Phase timings:

| Phase | Duration |
| --- | ---: |
| queue_wait | 77ms |
| resolve_source | 1ms |
| preflight_source | 3ms |
| cut_media | 828ms |
| write_project_output | 2ms |
| preprocess_local_asset | 8ms |
| generate_cover | 141ms |
| write_manifest | 7ms |

## Outcome

The package is accepted as the current internal Windows desktop test build for the UI Foundation cutter surface.

The sidebar library count bug is fixed in code by removing route-specific count ordering and always rendering `本地 <localCount> / 公共 <publicCount>`.

The public-library count mismatch was not a frontend rendering bug. It was caused by a stale cutter release catalog. The cutter release is now aligned with the current index at `v010471`.

## Residual Risk

Windows Runner `0.1.13` does not capture desktop screenshots, so visual proof for the Windows webview remains based on install/runtime/API acceptance plus local cutter web screenshot verification. A future Runner extension can add screenshot capture, but it was not required for this package acceptance.
