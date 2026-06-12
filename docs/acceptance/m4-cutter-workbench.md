# M4 Cutter Workbench Acceptance Record

Date: 2026-05-02
Updated: 2026-06-03

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
- `ACC-003`

Hi-fi reference:

- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/assets/ui/cutter-workbench-apple-hig.png`

## Implemented

- `apps/cutter-web` formal React/Vite cutter workbench.
- Fixture cutter API client for deterministic acceptance without a running backend.
- Optional real cutter API binding through `VITE_MIXLAB_CUTTER_API_BASE_URL`.
- Startup project home with search-first entry, recent projects, and project detail.
- Material locator as the primary search-select-cut workbench, with grouped local/public results, natural transcript hit navigation, video preview, continuous text selection, and direct export.
- Cut tasks page with pending/running/done/failed/retry states, project context, output directory action, and non-blocking navigation.
- Independent local reusable material library with project grouping, current-project view, reusable clip cards, source traceability, and selected-material output directory action.
- Ready-only public source material gallery with cover, title, tags, description, course, lecturer, and available count.
- Source detail page with video player, full transcript, timestamped segments, continuous range selection, and right inspector.
- Settings page with public mount, local workspace, real Cutter API connection status, FFmpeg path/status/source, default cut mode, default source/orientation filters, concurrency, audio mode, display mode, and Doctor status.
- Visual screenshot verification for every cutter page.

## Post-M14 Connection Smoke Evidence

`npm run smoke:cutter-api-web` now starts a real searchd, Cutter API, and cutter-web session against a generated ready public library.

It verifies:

- public library search, full transcript detail, and source media range reads work through the Cutter API;
- the UI can select transcript text and create a local clip through the real API path;
- workspace `export-clips`, `.mixlab-library/videos/E000001`, and project output files are written;
- public library local-clip, export, and project output paths are not created by the cutter app.
- API queue tests prove a completed local export `E000001` can be reused as source material and cut into `E000002`.
- `npm run smoke:searchd-concurrency` proves the search/read/select/cut path for 50 active editors under the 1,500ms p95 SLA.
- `npm run smoke:searchd-scale` proves full-transcript keyword location across 2,000 indexed source videos and 48,000 transcript segments.

## Screenshot Artifacts

- `docs/acceptance/artifacts/m4-cutter-workbench/project-home.png`
- `docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png`
- `docs/acceptance/artifacts/m4-cutter-workbench/cut-tasks.png`
- `docs/acceptance/artifacts/m4-cutter-workbench/local-library.png`
- `docs/acceptance/artifacts/m4-cutter-workbench/public-library.png`
- `docs/acceptance/artifacts/m4-cutter-workbench/source-detail.png`
- `docs/acceptance/artifacts/m4-cutter-workbench/settings.png`

## Explicitly Not Implemented In M4

- Tauri native shell packaging.
- Real FFmpeg queue execution from the UI.
- Production queue persistence and `export-clip.json` generation.
- Per-file native open video/reveal dialogs; project output directory opening is now covered through the Cutter API and local library UI.
- Admin backend or public-library metadata persistence.
- SQLite FTS or production search index storage.

## Verification Commands

```bash
node --test --import tsx apps/cutter-web/src/cutter-state.test.ts
node --test --import tsx apps/cutter-web/src/cutter-app.test.ts
node --test --import tsx packages/cutter-api/src/index.test.ts
npm run typecheck
npm test
npm run build:cutter-web
npm run build:admin-web
npm run build:ui-fixtures
npm run smoke:cutter-api-web
npm run smoke:searchd-concurrency
npm run smoke:searchd-scale
npm run visual:ui-foundation
npm run visual:admin-web
npm run visual:cutter-web
```

Result:

- `npm run typecheck`: passed.
- `npm test`: passed, 598/598 tests.
- `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts apps/cutter-web/src/api.test.ts packages/cutter-api/src/index.test.ts`: passed, 133/133 tests; local export reuse, protected project output directory opening, and local library directory action rendering are verified.
- `npm run build:cutter-web`: passed.
- `npm run build:admin-web`: passed.
- `npm run build:ui-fixtures`: passed.
- `npm run smoke:cutter-api-web`: passed; searchd-backed cutter API, web selection/export, workspace writes, and public-library non-write boundary verified.
- `npm run smoke:searchd-concurrency`: passed; 50 active editors completed search, detail, selection, cut submission, and local clip creation across 50 public source videos with p95 search 115.4ms, detail 96.8ms, and cut submit 130.6ms.
- `npm run smoke:searchd-scale`: passed; 2,000 videos / 48,000 transcript segments searched with p95 API search 558.5ms and detail 7ms.
- `apps/cutter-web/src/desktop-bridge.test.ts`: covered by `npm test`; desktop engine startup and native directory opening delegate to the Tauri host.
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
- Local library is independent from public source library, shows source traceability, and can open the selected local clip's project output directory through the Cutter API path.
- Settings exposes runtime paths and Doctor status without writing to the public library.
- Settings exposes real Cutter API connection status, workspace readiness, FFmpeg status/source, and native desktop path coverage through automated tests.
- Real Cutter API connection smoke proves public material readability, local workspace writability, and public-library non-write boundaries.

## Known Remaining Work

- Remaining native polish is limited to per-file reveal/open dialogs and packaged desktop runtime details.
- Backend fixtures remain available only for demos without a running Cutter API.
