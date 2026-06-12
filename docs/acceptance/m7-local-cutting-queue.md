# M7 Local Cutting Queue Acceptance Record

Date: 2026-05-02
Updated: 2026-06-03

## Scope

This milestone productionizes the cutter-side local workspace for cut lists, cut jobs, reusable exports, and `export-clip.json`.

Spec sources:

- `07_数据模型与Manifest.md`
- `09_剪辑师工作台规格.md`
- `11_本地剪切与导出规格.md`
- `12_权限与路径解析规格.md`
- `14_验收标准与测试剧本.md`
- `18_API接口草案.md`
- `21_视觉与交互设计规范.md`

Traceability IDs:

- `PROD-002`
- `PROD-003`
- `LIB-005`
- `CUTTER-005`
- `CUTTER-006`
- `CUTTER-007`
- `CUTTER-008`
- `ACC-006`
- `ACC-007`

## Implemented

- New `@mixlab/cutter-local` package.
- Workspace-local `clip-lists/<clip_list_id>/clip-list.json` persistence.
- Shared `ClipListManifest` protocol type and `validateClipListManifest` validator now enforce `clip-list.json` schema on write/read, including item ids, ordering, safe source paths, time ranges, cut mode, pre/post roll, and reusable local export sources.
- Workspace-local `clip-jobs/<cut_job_id>.json` persistence with `pending`, `running`, `done`, `failed`, and `cancelled` status vocabulary.
- Queue submission from saved cut lists.
- One-job runner boundary that resolves a ready public source, calls the injected or default FFmpeg runner, and writes one export.
- Workspace-local `export-clips/<export_clip_id>/export-clip.json` with source video id, source title, selected text, time range, cut mode, output file, and created timestamp.
- Workspace-backed `/cutter/local-clips` list/detail/media APIs when `MIXLAB_CUTTER_WORKSPACE_ROOT` is configured.
- New `/cutter/clip-lists`, `/cutter/cut-jobs`, and `/cutter/cut-jobs/run-next` local bridge routes.
- Tests proving workspace-backed cutter exports do not create `.mixlab-library/local-clips` in the public library.
- Cutter web API client methods for clip-list and cut-job routes.

## Explicitly Not Implemented In M7

- Tauri native open-file/open-folder commands.
- Desktop packaging.
- Multi-worker queue concurrency.
- Admin-side metadata persistence.
- Windows/NAS final acceptance.
- New UI redesign; M7 preserves the M4 product UI surface and adds the API contract needed to bind it to real local data.

## Verification Commands

```bash
node --test --import tsx packages/cutter-local/src/*.test.ts
node --test --import tsx packages/protocol/src/*.test.ts
node --test --import tsx packages/cutter-api/src/index.test.ts apps/cutter-web/src/api.test.ts
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

- `node --test --import tsx packages/protocol/src/*.test.ts`: passed, 32/32 tests.
- `node --test --import tsx packages/cutter-local/src/*.test.ts packages/cutter-api/src/index.test.ts apps/cutter-web/src/api.test.ts`: passed, 76/76 tests.
- `npm run typecheck`: passed.
- `npm test`: passed, 598/598 tests.
- `npm run build:cutter-web`: passed.
- `npm run build:admin-web`: passed.
- `npm run build:ui-fixtures`: passed.
- `npm run visual:ui-foundation`: passed and refreshed M3 screenshots.
- `npm run visual:admin-web`: passed and refreshed M5 screenshots.
- `npm run visual:cutter-web`: passed and refreshed M4 screenshots.
- `git diff --check`: passed.
- Secret scan for the previously shared real DashScope key fingerprint returned no matches. Broader secret-pattern scan only found existing placeholder/test strings and documented environment variable names.

## Acceptance Criteria

- Saved cut-list rows preserve segment ids, selected text, source traceability, ordering, and cut mode.
- Saved and read `clip-list.json` manifests are validated through the shared protocol validator.
- Queue submission creates stable pending jobs.
- Running one job writes the output video and `export-clip.json`.
- Failed jobs persist `failed` status and `error_message` without blocking later pending jobs.
- Workspace local clips can be listed, read, and streamed through the cutter API.
- Public library source routes and search remain separate from local queue execution.
- Cutter writes stay out of `.mixlab-library/local-clips` when a workspace root is configured.

## Known Remaining Work

- Bind the M4 queue/local-library UI to the new API methods instead of fixture state.
- Add native Tauri commands for reveal/open/reuse in the editor workflow.
- Add queue retry/cancel controls once the desktop shell exists.
- Run manual section 6 and 7 acceptance on real videos from the mobile disk.
