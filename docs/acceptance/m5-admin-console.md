# M5 Admin Console MVP Acceptance Record

Date: 2026-05-02

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

Hi-fi reference:

- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/assets/ui/admin-console-apple-hig.png`

## Implemented

- `apps/admin-web` formal React/Vite management console MVP.
- Typed Admin API client matching the `/api/admin/*` boundary from `18_API接口草案.md`.
- Fixture Admin API client for deterministic local acceptance until the real backend is wired.
- Dashboard with total, ready, processing, queued, unprocessed, failed, index-required, disk, active task, and current index.
- Public library settings page with root, `source-videos`, `.mixlab-library`, library id, protocol version, and path checks.
- Source video management page with cover, status, cutter visibility, tags, description, lecturer, course, and category.
- Preprocessing jobs page with active, queued, completed, failed/retry, stage, log path, and error reason.
- Index publication page with current pointer, historical versions, ready count, schema, validation, and atomic switch action.
- Doctor page with check rows and `导出诊断 JSON` action.
- Runtime settings page with FFmpeg/FFprobe, DashScope provider/model/audio mode/key configured status, and last failure reason.
- Visual screenshot verification for every admin page.

## Screenshot Artifacts

- `/Users/allen/Documents/mixlab/docs/acceptance/artifacts/m5-admin-console/dashboard.png`
- `/Users/allen/Documents/mixlab/docs/acceptance/artifacts/m5-admin-console/library-settings.png`
- `/Users/allen/Documents/mixlab/docs/acceptance/artifacts/m5-admin-console/source-videos.png`
- `/Users/allen/Documents/mixlab/docs/acceptance/artifacts/m5-admin-console/preprocess-jobs.png`
- `/Users/allen/Documents/mixlab/docs/acceptance/artifacts/m5-admin-console/index-publish.png`
- `/Users/allen/Documents/mixlab/docs/acceptance/artifacts/m5-admin-console/doctor.png`
- `/Users/allen/Documents/mixlab/docs/acceptance/artifacts/m5-admin-console/settings.png`

## Explicitly Not Implemented In M5

- Go admin backend.
- Real public-library initialization/write actions.
- Real preprocessing start/pause/retry orchestration from UI.
- Real index rebuild/current switch from UI.
- Real secure key persistence or live ASR test submit from UI.
- Cutter UI rebuild.
- Tauri shell and native file/folder actions.

## Verification Commands

```bash
node --test --import tsx apps/admin-web/src/api.test.ts
node --test --import tsx apps/admin-web/src/app/view-model.test.ts
node --test --import tsx apps/admin-web/src/admin-app.test.ts
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
- `npm test`: passed, 165/165 tests.
- `npm run build:cutter-web`: passed.
- `npm run build:ui-fixtures`: passed.
- `npm run build:admin-web`: passed.
- `npm run visual:ui-foundation`: passed and regenerated M3 screenshots.
- `npm run visual:admin-web`: passed and regenerated all M5 screenshots.

## Acceptance Criteria

- Admin web uses Apple-HIG UI foundation and avoids marketing/dashboard-heavy styling.
- Admin UI clearly distinguishes ready, failed, and index-required.
- Admin UI shows failed preprocessing as retryable and shows later successful jobs.
- Source video management includes public metadata needed by cutter gallery.
- Doctor and ASR settings do not expose API key values.
- Browser screenshot artifacts are generated at `1536x1024`.

## Known Remaining Work

- M2/M6 must wire the admin UI to a real backend and production index/task persistence.
- M5 fixture actions are UI affordances only; they do not mutate the public library.
- M8/Tauri or backend integration must implement native folder/file/export actions.
