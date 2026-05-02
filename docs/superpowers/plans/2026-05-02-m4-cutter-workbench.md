# M4 Cutter Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build the formal cutter-side web workbench that matches the approved Apple HIG direction and gives editors independent pages for public source materials, source detail and transcript selection, grouped search, cut list, local reusable clips, cut queue, and settings.

**Architecture:** Convert `@mixlab/cutter-web` from a vanilla preview into a React/Vite app using `@mixlab/ui-foundation`. The app consumes the existing cutter API contract, but ships a fixture client for visual acceptance and development without a running backend. Public library data stays read-only in the cutter; cutter-created state is local-only and modelled separately for cut list and queue.

**Tech Stack:** TypeScript, React 19, Vite, `node:test`, Playwright visual checks, shared MixLab UI foundation.

---

## Scope Guard

This step is **M4 Formal Cutter Workbench**.

Spec sources:
- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/09_剪辑师工作台规格.md`
- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/10_搜索与文案阅读器规格.md`
- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/11_本地剪切与导出规格.md`
- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/18_API接口草案.md`
- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/21_视觉与交互设计规范.md`

Hi-fi reference:
- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/assets/ui/cutter-workbench-apple-hig.png`

Traceability IDs:
- `CUTTER-001` App shell and first-run/settings entry
- `CUTTER-002` Read-only public source material library
- `CUTTER-003` Source detail, player, transcript reader, continuous range selection
- `CUTTER-004` Search grouped by source video with context
- `CUTTER-005` Cut list state, reorder, delete, clear, submit
- `CUTTER-006` Local cut queue page with non-blocking task visibility
- `CUTTER-007` Local reusable clip library
- `CUTTER-008` Export clip manifest remains out of scope until M7
- `CUTTER-009` Settings and Doctor visibility

Explicitly not doing in M4:
- Tauri/native shell packaging
- Real FFmpeg execution from the UI
- Production queue persistence and `export-clip.json` generation
- Admin backend, SQLite FTS, or manifest publish pipeline changes
- Uploading public library data from cutter side

Acceptance commands:
- `npm run typecheck`
- `npm test`
- `npm run build:cutter-web`
- `npm run build:admin-web`
- `npm run build:ui-fixtures`
- `npm run visual:ui-foundation`
- `npm run visual:admin-web`
- `npm run visual:cutter-web`

## File Structure

Create:
- `apps/cutter-web/src/app/CutterApp.tsx` - app shell, route selection, data loading, shared layout
- `apps/cutter-web/src/app/navigation.ts` - route IDs, navigation metadata, hash parsing
- `apps/cutter-web/src/fixture-client.ts` - deterministic cutter API fixture client
- `apps/cutter-web/src/features/public-library/PublicLibraryPage.tsx` - read-only gallery of ready source videos
- `apps/cutter-web/src/features/source-detail/SourceDetailPage.tsx` - source player, full transcript, continuous range, inspector
- `apps/cutter-web/src/features/search/SearchPage.tsx` - grouped source-video search
- `apps/cutter-web/src/features/cut-list/CutListPage.tsx` - selected spans, reorder/delete/clear/submit
- `apps/cutter-web/src/features/local-library/LocalLibraryPage.tsx` - reusable local clip gallery
- `apps/cutter-web/src/features/cut-queue/CutQueuePage.tsx` - local queue task visibility and retry controls
- `apps/cutter-web/src/features/settings/SettingsPage.tsx` - mount/workspace/FFmpeg/default mode/concurrency/Doctor
- `apps/cutter-web/src/state/cut-list.ts` - pure cut-list model and localStorage helpers
- `apps/cutter-web/src/state/cut-queue.ts` - pure queue model
- `apps/cutter-web/src/cutter-state.test.ts` - TDD tests for cut-list and queue behavior
- `apps/cutter-web/src/cutter-app.test.ts` - TDD tests for page contract and forbidden patterns
- `scripts/visual/check-cutter-web-screenshots.ts` - Playwright screenshots and structural checks
- `docs/acceptance/m4-cutter-workbench.md` - acceptance record

Modify:
- `apps/cutter-web/src/api.ts` - add optional admin-configured display metadata to API types
- `apps/cutter-web/src/main.tsx` - React entrypoint
- `apps/cutter-web/src/styles.css` - Apple HIG workbench styling
- `apps/cutter-web/index.html` - point Vite to `main.tsx`
- `apps/cutter-web/package.json` - add React and UI foundation dependencies
- `package.json` - add `visual:cutter-web`
- `docs/spec-traceability.md` - update CUTTER IDs with M4 status
- `README.md` - document the formal cutter workbench and visual acceptance command

Delete:
- `apps/cutter-web/src/main.ts` after the React entrypoint replaces it.

## Task 1: Plan Lock

**Files:**
- Create: `docs/superpowers/plans/2026-05-02-m4-cutter-workbench.md`

- [x] **Step 1: Save this implementation plan**

The plan is the scope guard for M4 and prevents adding M7 production cutting work into this milestone.

- [x] **Step 2: Commit only after implementation is verified**

Do not commit this plan by itself; commit it with the completed M4 implementation.

## Task 2: Tests For Cutter State

**Files:**
- Create: `apps/cutter-web/src/state/cut-list.ts`
- Create: `apps/cutter-web/src/state/cut-queue.ts`
- Create: `apps/cutter-web/src/cutter-state.test.ts`

- [x] **Step 1: Write failing tests**

Tests must cover:
- Continuous transcript selection creates one cut-list item, not one item per sentence.
- Reorder, remove, and clear keep deterministic ordering.
- Queue jobs are created from cut-list items without blocking the rest of the UI model.
- Public source mutations do not exist in cutter-side state APIs.

- [x] **Step 2: Run tests and confirm RED**

Run: `npm test -- apps/cutter-web/src/cutter-state.test.ts`

Expected: FAIL because `state/cut-list.ts` and `state/cut-queue.ts` do not exist yet.

- [x] **Step 3: Implement pure state modules**

Keep functions deterministic and UI-independent:
- `createCutListItemFromSegments`
- `moveCutListItem`
- `removeCutListItem`
- `clearCutList`
- `serializeCutList`
- `deserializeCutList`
- `createQueueJobsFromCutList`
- `updateQueueJobStatus`

- [x] **Step 4: Run tests and confirm GREEN**

Run: `npm test -- apps/cutter-web/src/cutter-state.test.ts`

Expected: PASS.

## Task 3: Tests For Page Contract

**Files:**
- Create: `apps/cutter-web/src/cutter-app.test.ts`
- Create later in Task 4/5: React page files under `apps/cutter-web/src/app`, `features`, and `fixture-client.ts`

- [x] **Step 1: Write failing tests**

Render pages with `react-dom/server` and assert:
- Public library says `可用原素材`, uses gallery classes, includes cover/title/tags/description, and excludes processing/failed items.
- Source detail includes video, full transcript, continuous selection, and an action to add one span to the cut list.
- Search results are grouped by source video and do not include a `sentence-waterfall` class.
- Cut list has order, time range, selected text, mode, reorder, delete, clear, and submit controls.
- Local library is independent from public library and includes reusable clip cards, search, open, and reuse controls.
- Cut queue includes pending/running/done/failed/retry states.
- Settings includes public mount, local workspace, FFmpeg path, default cut mode, concurrency, and Doctor.

- [x] **Step 2: Run tests and confirm RED**

Run: `npm test -- apps/cutter-web/src/cutter-app.test.ts`

Expected: FAIL because React page modules do not exist yet.

## Task 4: API Fixture And React App Skeleton

**Files:**
- Modify: `apps/cutter-web/package.json`
- Modify: `apps/cutter-web/index.html`
- Modify: `apps/cutter-web/src/api.ts`
- Create: `apps/cutter-web/src/fixture-client.ts`
- Create: `apps/cutter-web/src/main.tsx`
- Delete: `apps/cutter-web/src/main.ts`
- Create: `apps/cutter-web/src/app/navigation.ts`
- Create: `apps/cutter-web/src/app/CutterApp.tsx`

- [x] **Step 1: Add dependencies**

Add `@mixlab/ui-foundation`, `react`, and `react-dom` to `@mixlab/cutter-web`.

- [x] **Step 2: Extend API display metadata**

Add optional fields to `SourceVideoCard`: `description`, `tags`, `category`, `course`, `lecturer`, `publish_status`.

- [x] **Step 3: Add fixture client**

Fixture client must expose only ready public source videos to editors and include representative local clips and search groups.

- [x] **Step 4: Add route metadata**

Routes:
- `public-library`
- `source-detail`
- `search`
- `cut-list`
- `local-library`
- `cut-queue`
- `settings`

- [x] **Step 5: Add app skeleton**

Use `MacWindow`, `Sidebar`, and `UnifiedToolbar`; choose fixture client by default unless `VITE_MIXLAB_CUTTER_API_BASE_URL` is provided.

## Task 5: Feature Pages

**Files:**
- Create: `apps/cutter-web/src/features/public-library/PublicLibraryPage.tsx`
- Create: `apps/cutter-web/src/features/source-detail/SourceDetailPage.tsx`
- Create: `apps/cutter-web/src/features/search/SearchPage.tsx`
- Create: `apps/cutter-web/src/features/cut-list/CutListPage.tsx`
- Create: `apps/cutter-web/src/features/local-library/LocalLibraryPage.tsx`
- Create: `apps/cutter-web/src/features/cut-queue/CutQueuePage.tsx`
- Create: `apps/cutter-web/src/features/settings/SettingsPage.tsx`

- [x] **Step 1: Implement public source library**

Gallery-first page; cards display cover, title, duration, admin tags, and admin description. It must only show ready source videos.

- [x] **Step 2: Implement source detail**

Include source media panel, full transcript reader, continuous selection controls, selected span inspector, and add-to-cut-list action.

- [x] **Step 3: Implement grouped search**

Render result groups by source video with hit count, cover, best excerpt, and context segments. Do not render a sentence waterfall.

- [x] **Step 4: Implement cut list**

Render selected source spans with order, source title, time range, selected text, cut mode, move up/down, delete, clear, and submit-to-queue actions.

- [x] **Step 5: Implement local library**

Render only cutter-local clips with search, open video, reveal folder, reuse, source tracing, selected text, and clip duration.

- [x] **Step 6: Implement cut queue and settings**

Queue page shows pending/running/done/failed/retry without blocking navigation. Settings page shows public mount, local workspace, FFmpeg path, default cut mode, concurrency, and Doctor status.

- [x] **Step 7: Run app tests and confirm GREEN**

Run: `npm test -- apps/cutter-web/src/cutter-app.test.ts`

Expected: PASS.

## Task 6: Visual Design And Screenshot Acceptance

**Files:**
- Modify: `apps/cutter-web/src/styles.css`
- Create: `scripts/visual/check-cutter-web-screenshots.ts`
- Modify: `package.json`
- Create output: `docs/acceptance/artifacts/m4-cutter-workbench/*.png`

- [x] **Step 1: Replace preview CSS**

Use Apple-like window chrome, translucent sidebar, segmented controls, gallery grid, dense transcript, inspector panels, and compact toolbar. Avoid hero pages, decorative gradients, nested cards, and sentence-waterfall search.

- [x] **Step 2: Add visual script**

Start cutter Vite on a fixed port, capture screenshots for:
- `public-library.png`
- `source-detail.png`
- `search.png`
- `cut-list.png`
- `local-library.png`
- `cut-queue.png`
- `settings.png`

The script must assert key classes/text exist and fail if public library shows processing/failed source material.

- [x] **Step 3: Add root script**

Add `"visual:cutter-web": "tsx scripts/visual/check-cutter-web-screenshots.ts"`.

- [x] **Step 4: Run visual script**

Run: `npm run visual:cutter-web`

Expected: PASS and screenshots written to `docs/acceptance/artifacts/m4-cutter-workbench`.

## Task 7: Documentation And Traceability

**Files:**
- Modify: `README.md`
- Modify: `docs/spec-traceability.md`
- Create: `docs/acceptance/m4-cutter-workbench.md`

- [x] **Step 1: Update README**

Document:
- `npm run dev:cutter-web`
- `npm run build:cutter-web`
- `npm run visual:cutter-web`
- Fixture-first default and optional real cutter API base URL.

- [x] **Step 2: Update traceability**

Mark M4 as:
- Accepted for formal UI pages and visual acceptance.
- Partial for production-native shell and production queue/export behavior that belongs to M7.
- `CUTTER-008` remains out of scope until M7.

- [x] **Step 3: Add acceptance record**

Document scope, commands, screenshots, and known M7 deferrals.

## Task 8: Full Verification And Commit

**Files:**
- All M4 changed files

- [x] **Step 1: Run full verification**

Run:
```bash
npm run typecheck
npm test
npm run build:cutter-web
npm run build:admin-web
npm run build:ui-fixtures
npm run visual:ui-foundation
npm run visual:admin-web
npm run visual:cutter-web
```

Expected: all commands pass.

- [x] **Step 2: Check secrets are not staged**

Run:
```bash
git add .
git diff --cached --name-only | rg '(^|/)\\.env|\\.local|secret|key' || true
```

Expected: no `.env.local` or secret files.

- [x] **Step 3: Commit**

Run:
```bash
git commit -m "feat: add M4 cutter workbench"
```

Expected: commit succeeds on `codex/m4-cutter-workbench`.

## Self-Review

Spec coverage:
- Public library is an independent gallery page, not a tiny status widget.
- Source detail supports video and complete transcript reading with continuous segment selection.
- Search groups hits by source video and explicitly rejects sentence waterfall UI.
- Cut list, cut queue, local library, and settings are independent cutter pages.
- Public library remains read-only from cutter side; all cutter writes are local workbench state.

Gaps intentionally left to later milestones:
- Native Tauri packaging belongs after the formal web surface is stable.
- Real FFmpeg queue execution and `export-clip.json` belongs to M7.
- Backend index/search persistence belongs to backend milestones.

Placeholder scan:
- No placeholder scope, no unspecified acceptance command, no unowned file group.

Type consistency:
- App pages consume the existing `CutterApiClient` and pure state modules; API type extensions are optional metadata only.
