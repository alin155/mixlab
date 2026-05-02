# M4 Cutter Workbench Acceptance Record

Date: 2026-05-02

## Scope

This milestone implements the formal cutter-side workbench on top of the M3 UI foundation.

Spec sources:

- `09_剪辑师工作台规格.md`
- `10_搜索与文案阅读器规格.md`
- `11_本地剪切与导出规格.md`
- `18_API接口草案.md`
- `21_视觉与交互设计规范.md`

Traceability IDs:

- `CUTTER-001`
- `CUTTER-002`
- `CUTTER-003`
- `CUTTER-004`
- `CUTTER-005`
- `CUTTER-006`
- `CUTTER-007`
- `CUTTER-009`

Hi-fi reference:

- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/assets/ui/cutter-workbench-apple-hig.png`

## Implemented

- `apps/cutter-web` formal React/Vite cutter workbench.
- Fixture cutter API client for deterministic acceptance without a running backend.
- Optional real cutter API binding through `VITE_MIXLAB_CUTTER_API_BASE_URL`.
- Ready-only public source material gallery with cover, title, tags, description, course, lecturer, and available count.
- Source detail page with video player, full transcript, timestamped segments, continuous range selection, and right inspector.
- Grouped search page that organizes hits by source video and avoids sentence-waterfall layout.
- Local cut-list state model where adjacent transcript segments become one cut-list row.
- Cut-list UI with order, time range, selected text, cut mode, move, delete, clear, and submit-to-queue controls.
- Cut queue page with pending/running/done/failed/retry states and non-blocking navigation.
- Independent local clip library with search, reusable clip cards, open/reveal/reuse affordances, and source traceability.
- Settings page with public mount, local workspace, FFmpeg path, default cut mode, concurrency, audio mode, and Doctor status.
- Visual screenshot verification for every cutter page.

## Screenshot Artifacts

- `/Users/allen/Documents/mixlab/docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`
- `/Users/allen/Documents/mixlab/docs/acceptance/artifacts/m4-cutter-workbench/source-detail.png`
- `/Users/allen/Documents/mixlab/docs/acceptance/artifacts/m4-cutter-workbench/search.png`
- `/Users/allen/Documents/mixlab/docs/acceptance/artifacts/m4-cutter-workbench/cut-list.png`
- `/Users/allen/Documents/mixlab/docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
- `/Users/allen/Documents/mixlab/docs/acceptance/artifacts/m4-cutter-workbench/cut-queue.png`
- `/Users/allen/Documents/mixlab/docs/acceptance/artifacts/m4-cutter-workbench/settings.png`

## Explicitly Not Implemented In M4

- Tauri native shell packaging.
- Real FFmpeg queue execution from the UI.
- Production queue persistence and `export-clip.json` generation.
- Native open video, reveal folder, and file permission dialogs.
- Admin backend or public-library metadata persistence.
- SQLite FTS or production search index storage.

## Verification Commands

```bash
node --test --import tsx apps/cutter-web/src/cutter-state.test.ts
node --test --import tsx apps/cutter-web/src/cutter-app.test.ts
npm run typecheck
npm test
npm run build:cutter-web
npm run build:admin-web
npm run build:ui-fixtures
npm run visual:ui-foundation
npm run visual:admin-web
npm run visual:cutter-web
```

Result:

- `npm run typecheck`: passed.
- `npm test`: passed, 176/176 tests.
- `npm run build:cutter-web`: passed.
- `npm run build:admin-web`: passed.
- `npm run build:ui-fixtures`: passed.
- `npm run visual:ui-foundation`: passed and regenerated M3 screenshots.
- `npm run visual:admin-web`: passed and regenerated M5 screenshots.
- `npm run visual:cutter-web`: passed and regenerated all M4 cutter screenshots.

## Acceptance Criteria

- Cutter app uses the shared Apple-HIG UI foundation and follows the approved cutter hi-fi direction.
- Public source library is an independent gallery page and does not expose non-ready material.
- Source detail supports full transcript reading and continuous segment selection.
- Search is grouped by source video and has no sentence-waterfall class/layout.
- Cut list preserves a multi-sentence span as one local item.
- Cut queue is visible as its own page and does not block search/navigation.
- Local library is independent from public source library and shows source traceability.
- Settings exposes runtime paths and Doctor status without writing to the public library.

## Known Remaining Work

- M7 must connect the queue to real FFmpeg execution, local clip manifest writing, and `export-clip.json`.
- A later Tauri milestone must implement native folder/file actions and packaged desktop runtime.
- Backend milestones must replace fixture data with production admin/cutter services.
