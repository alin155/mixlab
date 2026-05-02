# M8 Cutter Workspace UI Binding Acceptance Record

Date: 2026-05-02

## Scope

This milestone binds the cutter workbench UI to the M7 local workspace API for cut-list submission, queue refresh/execution, and local-library refresh.

Spec sources:

- `09_剪辑师工作台规格.md`
- `10_搜索与文案阅读器规格.md`
- `11_本地剪切与导出规格.md`
- `14_验收标准与测试剧本.md`
- `18_API接口草案.md`
- `21_视觉与交互设计规范.md`

Traceability IDs:

- `PROD-002`
- `PROD-003`
- `CUTTER-001`
- `CUTTER-005`
- `CUTTER-006`
- `CUTTER-007`
- `ACC-006`
- `ACC-007`

## Implemented

- `/cutter/source-library` now exposes `library_id` for traceable clip-list creation.
- Cutter cut-list state now preserves `source_relative_path`.
- New UI mapping from cut-list rows to `createClipList` API requests.
- New UI mapping from API cut jobs to queue rows with status/progress/traceability.
- Queue page has optional API-mode controls: refresh queue and execute next pending job.
- `CutterApp` detects API mode from `VITE_MIXLAB_CUTTER_API_BASE_URL`.
- In API mode, cut-list submit calls `/cutter/clip-lists` and `/cutter/cut-jobs`.
- In API mode, queue page refreshes from `/cutter/cut-jobs`.
- In API mode, run-next calls `/cutter/cut-jobs/run-next`, then refreshes queue and local library.
- Fixture mode remains deterministic for visual review and screenshots.

## Explicitly Not Implemented In M8

- Tauri native open-file/open-folder commands.
- Desktop packaging.
- Multi-worker queue scheduler.
- Admin backend persistence.
- A new visual direction or layout rewrite.

## Verification Commands

```bash
node --test --import tsx apps/cutter-web/src/cutter-state.test.ts apps/cutter-web/src/cutter-app.test.ts apps/cutter-web/src/api.test.ts packages/cutter-api/src/index.test.ts
npm run typecheck
npm test
npm run build:cutter-web
npm run build:admin-web
npm run build:ui-fixtures
npm run visual:ui-foundation
npm run visual:admin-web
npm run visual:cutter-web
git diff --check
```

Result:

- `node --test --import tsx apps/cutter-web/src/cutter-state.test.ts apps/cutter-web/src/cutter-app.test.ts apps/cutter-web/src/api.test.ts packages/cutter-api/src/index.test.ts`: passed, 26/26 tests.
- `npm run typecheck`: passed.
- `npm test`: passed, 197/197 tests.
- `npm run build:cutter-web`: passed.
- `npm run build:admin-web`: passed.
- `npm run build:ui-fixtures`: passed.
- `npm run visual:ui-foundation`: passed and refreshed M3 screenshots.
- `npm run visual:admin-web`: passed and refreshed M5 screenshots.
- `npm run visual:cutter-web`: passed and refreshed M4 screenshots.
- `git diff --check`: passed.
- Secret scan for the previously shared real DashScope key fingerprint returned no matches.

## Acceptance Criteria

- UI-generated cut-list rows include source video id, source relative path, segment ids, time range, selected text, and cut mode.
- Submit uses real M7 API routes in API mode.
- Queue page reads real M7 job states in API mode.
- Running one job refreshes local reusable clips.
- Fixture mode still renders the complete Apple-HIG cutter workbench for visual acceptance.

## Known Remaining Work

- Native reveal/open/reuse commands in Tauri.
- Manual acceptance with a real mobile-disk library and real FFmpeg output.
- Queue retry/cancel wiring once the local desktop runner policy is finalized.
