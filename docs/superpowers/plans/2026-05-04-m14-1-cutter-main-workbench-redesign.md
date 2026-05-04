# M14.1 Cutter Main Workbench Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Follow `superpowers:test-driven-development` for each production behavior change: write a failing focused test, confirm it fails, implement the smallest change, then rerun the focused test.

**Goal:** Rebuild the cutter client around the actual editor workflow: search transcript, locate video, select transcript text, cut this segment directly, and let completed cuts become local reusable source material.

**Architecture:** Keep `CutterApp` as the state owner and the Cutter API client as the data boundary. Replace the visible `搜索与文案 -> 原视频详情 -> 待剪清单 -> 剪切队列` main path with one `素材定位` workbench page and one `剪切任务` background page. Keep legacy hashes as aliases so old URLs do not break, but remove old concepts from the primary UI.

**Tech Stack:** React, TypeScript, node:test, `renderToStaticMarkup`, Cutter API client, fixture client, CSS in `apps/cutter-web/src/styles.css`.

---

### Task 1: Navigation And Route Contract

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/app/navigation.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/app/CutterApp.tsx`
- Test: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`

- [ ] **Step 1:** Add failing tests that the default route is `素材定位`, the top navigation has exactly `素材定位、剪切任务、本地素材、公共素材库、设置`, and `原视频详情、搜索与文案、待剪清单、剪切队列` are not top-level navigation labels.
- [ ] **Step 2:** Add failing tests that legacy hashes are still safe: `#search` resolves to `material-locator`, `#cut-list` and `#cut-queue` resolve to `cut-tasks`, and `#source-detail/V000001` still resolves as a child detail route.
- [ ] **Step 3:** Run `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` and confirm the new tests fail.
- [ ] **Step 4:** Update `CutterRoute`, `CUTTER_NAV_ITEMS`, `routeFromHash`, `routeTitle`, `searchHash`, and `shouldRefreshCutQueueForRoute`.
- [ ] **Step 5:** Re-run the focused cutter app tests and confirm pass.

### Task 2: Video Orientation Model

**Files:**
- Create: `/Users/allen/Documents/mixlab/apps/cutter-web/src/state/video-orientation.ts`
- Test: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-state.test.ts`

- [ ] **Step 1:** Add failing tests for `width > height -> 横版`, `width < height -> 竖版`, `width = height -> 方形`, and missing dimensions -> `未知`.
- [ ] **Step 2:** Add failing tests for orientation filtering: `全部` keeps all videos, `横版` keeps only landscape, `竖版` keeps only portrait.
- [ ] **Step 3:** Run `node --test --import tsx apps/cutter-web/src/cutter-state.test.ts` and confirm failure.
- [ ] **Step 4:** Implement orientation helpers and labels.
- [ ] **Step 5:** Re-run cutter state tests.

### Task 3: Material Locator Search Model

**Files:**
- Create: `/Users/allen/Documents/mixlab/apps/cutter-web/src/state/material-locator.ts`
- Test: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-state.test.ts`

- [ ] **Step 1:** Add failing tests proving search results are grouped as `本地素材` first and `公共原素材` second.
- [ ] **Step 2:** Add failing tests for source filters: `全部、本地素材、公共原素材`.
- [ ] **Step 3:** Add failing tests that completed local clips with `selected_text` become one selectable transcript span with begin/end milliseconds.
- [ ] **Step 4:** Add failing tests that local clips without text or time mapping do not enter locator search.
- [ ] **Step 5:** Run cutter state tests and confirm failure.
- [ ] **Step 6:** Implement normalized material locator result sections, source filtering, orientation filtering, and local clip detail conversion.
- [ ] **Step 7:** Re-run cutter state tests.

### Task 4: Material Locator Page

**Files:**
- Create: `/Users/allen/Documents/mixlab/apps/cutter-web/src/features/material-locator/MaterialLocatorPage.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/app/CutterApp.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/styles.css`
- Test: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`

- [ ] **Step 1:** Add failing render tests for the `素材定位` page: global search input, source filter, orientation filter, grouped results with `本地素材` before `公共原素材`, and orientation labels.
- [ ] **Step 2:** Add failing render tests that clicking a result opens a workbench-style video and full transcript region in the same page contract, not a top-level detail route.
- [ ] **Step 3:** Add failing tests that the page does not render visible `片段篮` or `待剪清单`.
- [ ] **Step 4:** Run cutter app tests and confirm failure.
- [ ] **Step 5:** Implement `MaterialLocatorPage` with search header, result groups, selected material workspace, video panel, natural transcript panel, and lightweight cut task summary.
- [ ] **Step 6:** Wire `CutterApp` route rendering so `material-locator` is the default page and search submissions remain on that page.
- [ ] **Step 7:** Re-run cutter app tests.

### Task 5: Natural Transcript Selection

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/features/material-locator/MaterialLocatorPage.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/state/transcript-selection.ts` if needed
- Test: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`
- Test: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-state.test.ts`

- [ ] **Step 1:** Add failing tests that transcript text appears as natural continuous text with no visible timecodes, no visible segment list, and no `选择此句` action.
- [ ] **Step 2:** Add failing tests that invisible span mapping still exists through `data-segment-id` so click and drag can map text to time.
- [ ] **Step 3:** Add failing tests for drag range selection producing one continuous selected range.
- [ ] **Step 4:** Run focused tests and confirm failure.
- [ ] **Step 5:** Implement inline span transcript rendering, click-to-seek callback, mouse drag selection, selection highlight, and selected text summary.
- [ ] **Step 6:** Re-run focused tests.

### Task 6: Direct Cut Submission

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/app/CutterApp.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/features/material-locator/MaterialLocatorPage.tsx`
- Test: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`
- Test: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-state.test.ts` if a pure helper is introduced

- [ ] **Step 1:** Add failing tests that the selected operation bar primary action is `剪切这段`, not `加入待剪清单`.
- [ ] **Step 2:** Add failing tests for the fixture path proving a direct cut creates a background queue job and stays on `素材定位`.
- [ ] **Step 3:** Run focused tests and confirm failure.
- [ ] **Step 4:** Implement `cutSelectionNow`: create one internal cut-list item from the selected transcript range, submit it directly to the backend in API mode, create a fixture queue job in fixture mode, and do not navigate away.
- [ ] **Step 5:** Re-run focused tests.

### Task 7: Cut Tasks Page Rename And Chinese Statuses

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/features/cut-queue/CutQueuePage.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/app/CutterApp.tsx`
- Test: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`

- [ ] **Step 1:** Add failing tests that the page title is `剪切任务` and statuses render as `等待中、剪切中、已完成、失败`.
- [ ] **Step 2:** Add failing tests that old user-facing labels `剪切队列` and `待剪清单` do not appear in the primary workflow.
- [ ] **Step 3:** Run cutter app tests and confirm failure.
- [ ] **Step 4:** Update the page copy, status labels, inspector copy, and route rendering.
- [ ] **Step 5:** Re-run tests.

### Task 8: Library Orientation Tags

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/features/public-library/PublicLibraryPage.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/features/local-library/LocalLibraryPage.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/styles.css`
- Test: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`

- [ ] **Step 1:** Add failing tests that public and local library cards show `横版/竖版/方形/未知` orientation tags.
- [ ] **Step 2:** Add failing tests for visible `全部、横版、竖版` orientation filters on both pages.
- [ ] **Step 3:** Run cutter app tests and confirm failure.
- [ ] **Step 4:** Add orientation tags and filters while preserving the current public library layout.
- [ ] **Step 5:** Re-run cutter app tests.

### Task 9: Verification And Browser Smoke

**Files:** read-only unless a verification failure requires a targeted fix.

- [ ] **Step 1:** Run `node --test --import tsx apps/cutter-web/src/cutter-state.test.ts`.
- [ ] **Step 2:** Run `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts`.
- [ ] **Step 3:** Run `npm run typecheck`.
- [ ] **Step 4:** Run `npm test`.
- [ ] **Step 5:** Run `npm run build:cutter-web`.
- [ ] **Step 6:** Run `git diff --check`.
- [ ] **Step 7:** Smoke test in the in-app browser: default page is `素材定位`, search results group local first, selecting transcript shows `剪切这段`, direct cut creates a task without leaving the page, `剪切任务` shows Chinese statuses, library pages show orientation tags.
