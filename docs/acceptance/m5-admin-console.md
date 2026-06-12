# M5 Admin Console MVP Acceptance Record

Date: 2026-05-02
Updated: 2026-06-03

## Scope

This milestone implements the formal management console MVP on top of the M3 UI foundation.

Spec sources:

- `08_素材库管理端规格.md`
- `18_API接口草案.md`
- `19_增量预处理与可见性规则.md`
- `21_视觉与交互设计规范.md`
- `22_运行时依赖与ASR配置.md`

Traceability IDs:

- `ADMIN-001`
- `ADMIN-002`
- `ADMIN-003`
- `ADMIN-004`
- `ADMIN-005`
- `ADMIN-006`
- `ADMIN-007`
- `ACC-001`

Hi-fi reference:

- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/assets/ui/admin-console-apple-hig.png`

## Implemented

- `apps/admin-web` formal React/Vite management console MVP.
- Typed Admin API client matching the `/api/admin/*` boundary from `18_API接口草案.md`.
- Fixture Admin API client for deterministic local acceptance and no-backend demos.
- Admin API public-library initialization creates the root protocol tree, `library.json`, default source folder contract, and path/permission checks.
- Dashboard binds to Admin API library status, runtime settings, preprocessing supervisor summary, Doctor summary, current index pointer, and metrics; it shows total, ready, processing, queued, unprocessed, failed, index-required, disk, active task, core search-to-cut health, 50-editor usage, runtime load, and current index.
- Settings exposes a conditional first-run initialization repair entry when `.mixlab-library` or `library.json` is missing, while healthy libraries keep the settings surface focused on source folders, runtime policy, and path checks.
- Source video management page with paged server loading, cover, status, cutter visibility, tags, description, lecturer, course, and category.
- Public text metadata edits persist to `source-video.json` and are exposed to the Cutter public library list/detail payloads.
- Public cover replacement accepts JPG/PNG/WebP from the Admin source management panel, persists the new cover artifact path to `source-video.json`, and serves the real image content type to Admin and Cutter clients.
- Preprocessing page with production pipeline status, active/queued/completed/failed jobs, retry, stage, observability, and index publication controls in the same workflow.
- Preprocessing lifecycle writes real task logs under `.mixlab-library/logs/V*.log`; Admin API exposes `/api/admin/preprocess/jobs/J*/log`; the Admin preprocessing page can open and render the selected task log instead of showing placeholder paths.
- Index publication is part of the preprocessing workflow: Admin publishes待索引视频 through the real SQLite/current.json ready-publish path, validates `current.json`, `index-manifest.json`, and `index.sqlite`, and shows Chinese validation details for current and historical index versions.
- Doctor page with check rows and backend-backed `导出诊断报告` action.
- Doctor core validates public paths, `.mixlab-library` and log write permissions, library counts, source-video manifests/artifacts, current `current.json`/`index-manifest.json`/`index.sqlite` package metadata, FFmpeg/FFprobe, redacted ASR config, local clips, and lifecycle task logs.
- Admin API `/api/admin/doctor/export` writes a report JSON artifact under `.mixlab-library/exports/doctor/` and returns the file name, relative path, file path, and report payload.
- Cutter user page with login approvals, device audit, and usage metrics.
- Runtime settings page with source folders, runtime policy, FFmpeg/FFprobe, DashScope provider/model/saved audio mode/key configured status, and latest ASR failure reason from real preprocessing jobs.
- DashScope API keys are persisted separately in `admin-runtime-secrets.json`, applied to the Admin runtime environment, and never echoed through settings, runtime status, logs, or Doctor reports.
- Visual screenshot verification for every admin page.

## Screenshot Artifacts

- `docs/acceptance/artifacts/m5-admin-console/dashboard.png`
- `docs/acceptance/artifacts/m5-admin-console/source-videos.png`
- `docs/acceptance/artifacts/m5-admin-console/preprocess-jobs.png`
- `docs/acceptance/artifacts/m5-admin-console/doctor.png`
- `docs/acceptance/artifacts/m5-admin-console/cutter-users.png`
- `docs/acceptance/artifacts/m5-admin-console/settings.png`

## Explicitly Not Implemented In M5

- Go admin backend.
- Full multi-step first-run wizard with native folder picker; the current settings page provides the conditional initialization repair entry.
- Real preprocessing start/pause/retry orchestration from UI.
- Real index rebuild/current switch from UI.
- Paid live ASR audio probe from the settings UI; the current test action is a readiness check and does not submit audio.
- Cutter UI rebuild.
- Tauri shell and native file/folder actions beyond the backend Doctor JSON export.

## Verification Commands

```bash
node --test --import tsx apps/admin-web/src/api.test.ts
node --test --import tsx apps/admin-web/src/app/view-model.test.ts
node --test --import tsx apps/admin-web/src/admin-app.test.ts
node --test --import tsx packages/doctor-core/src/index.test.ts
node --test --import tsx packages/admin-api/src/index.test.ts
node --test --import tsx packages/library-fs/src/cutter-source-library.test.ts
node --test --import tsx packages/cutter-api/src/index.test.ts
npm run typecheck
npm test
npm run build:cutter-web
npm run build:ui-fixtures
npm run build:admin-web
npm run visual:ui-foundation
npm run visual:admin-web
```

Result:

- `npm run typecheck`: passed.
- `npm run test:searchd`: passed, 17/17 tests.
- `npm test`: passed, 598/598 tests.
- `node --test --import tsx packages/doctor-core/src/index.test.ts`: passed, 5/5 tests; Doctor validates current index package SQLite metadata, lifecycle task logs, and backend JSON artifact export while redacting ASR secrets.
- `node --test --import tsx packages/admin-api/src/index.test.ts`: passed, 36/36 tests; initialization creates public-library protocol directories, `library.json`, default source folder settings, read/write path checks, scan result, dashboard metrics, public text metadata persistence, JPG/PNG/WebP cover replacement validation, current/index package validation for Admin index publication, Doctor JSON export under `.mixlab-library/exports/doctor/`, and runtime ASR settings with saved audio mode plus latest ASR failure reason.
- `node --test --import tsx packages/library-fs/src/preprocess-lifecycle.test.ts`: passed, 8/8 tests; preprocessing claim/stage/text-artifact/visual-artifact/failure/publish transitions write readable task logs.
- `node --test --import tsx packages/library-fs/src/cutter-source-library.test.ts`: passed; Admin-managed text metadata is visible in Cutter library list/detail.
- `node --test --import tsx packages/cutter-api/src/index.test.ts`: passed, 35/35 tests; Cutter API returns Admin-managed text metadata over HTTP and streams updated public covers with the correct image content type.
- `node --test --import tsx apps/admin-web/src/api.test.ts apps/admin-web/src/admin-app.test.ts`: passed, 52/52 tests; Admin typed client and UI expose backend dashboard status, conditional first-run initialization repair, public metadata, cover update controls, preprocessing log viewing, index validation details, Doctor log checks, and backend Doctor export action.
- `npm run build:cutter-web`: passed.
- `npm run build:ui-fixtures`: passed.
- `npm run build:admin-web`: passed.
- `npm run visual:ui-foundation`: passed and regenerated M3 screenshots.
- `npm run visual:admin-web`: passed and regenerated all M5 screenshots.

## Acceptance Criteria

- Admin web uses Apple-HIG UI foundation and avoids marketing/dashboard-heavy styling.
- Admin UI clearly distinguishes ready, failed, and index-required.
- Admin dashboard reads real Admin API status/metrics/runtime data and presents restrained public-library governance status.
- Admin API initialization proves public-library root, source folder, protocol directory, manifest id/version, and read/write permissions before scanning.
- Admin settings provides an on-demand initialization repair entry only when protocol files or directories are missing.
- Admin UI shows failed preprocessing as retryable and shows later successful jobs.
- Admin UI opens a selected preprocessing task log backed by the public-library log artifact.
- Admin UI shows the current index pointer, historical index versions, and validation messages for `current.json`, `index-manifest.json`, and `index.sqlite`.
- Doctor UI and API export a real JSON report artifact under the public library and include log-directory/lifecycle-log health checks.
- Source video management includes public metadata needed by cutter gallery.
- Cutter public library payloads include Admin-managed cover, tags, description, lecturer, course, and category from the public manifest.
- Doctor and ASR settings do not expose API key values.
- Admin runtime settings reflect the saved ASR audio mode and latest ASR failure without requiring administrators to inspect task files.
- Browser screenshot artifacts are generated at `1536x1024`.

## Known Remaining Work

- M2/M6 must continue wiring any remaining fixture-only demo surfaces to the real backend where applicable.
- M5 fixture actions remain demo-only when the Admin app runs without `VITE_MIXLAB_ADMIN_API_BASE_URL`.
- A later full first-run wizard can add native folder picking and guided copy, but initialization status and remediation are now visible in Settings.
- M8/Tauri integration should still provide native folder/file pickers and reveal/open actions, but Doctor JSON export is now backed by the Admin API.
- A paid live ASR probe may be added later behind an explicit confirmation; current settings testing is a non-submitting readiness check.
