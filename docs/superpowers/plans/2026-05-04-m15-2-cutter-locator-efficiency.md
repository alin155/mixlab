# M15.2 Cutter Locator Efficiency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `素材定位` from a broad dashboard-like page into a compact editor workbench where the complete transcript receives the largest operating space.

**Architecture:** Keep `CutterApp` as the state owner and `MaterialLocatorPage` as the UI boundary. Hide the general cutter toolbar only on `素材定位`, compress search and candidate controls inside the page, move the cut queue into the same top row as the player, and make candidate clicks focus transcript hits without creating a cut selection.

**Tech Stack:** React, TypeScript, node:test, `renderToStaticMarkup`, CSS in `apps/cutter-web/src/styles.css`.

---

### Task 1: Tests For The M15.2 Contract

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`

- [ ] **Step 1:** Add failing tests that `素材定位` hides the general toolbar while other routes can still show it.
- [ ] **Step 2:** Add failing render tests that search uses one larger input plus `素材来源` and `视频类型` selects, and no longer renders `当前搜索` or `画面方向`.
- [ ] **Step 3:** Add failing render tests that candidate cards do not render hit excerpts, only hit count and compact metadata.
- [ ] **Step 4:** Add failing render tests that `画面验证` and `剪切队列` appear before `完整文案`.
- [ ] **Step 5:** Add failing render tests that highlighted transcript hits expose a current-hit/autoscroll contract and no cut selection bar is shown when only candidate focus exists.
- [ ] **Step 6:** Add failing render tests that the cut action bar is a floating selection bar when transcript text is selected.

### Task 2: Toolbar And Search Controls

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/app/CutterApp.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/features/material-locator/MaterialLocatorPage.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/styles.css`

- [ ] **Step 1:** Implement `shouldShowCutterToolbar(route)` and use it to hide the toolbar on `material-locator`.
- [ ] **Step 2:** Replace segmented source/orientation buttons with native selects inside the search form.
- [ ] **Step 3:** Rename `画面方向` to `视频类型` and remove the visible current-query helper line.
- [ ] **Step 4:** Re-run focused tests.

### Task 3: Candidate Column And Top Row Layout

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/features/material-locator/MaterialLocatorPage.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/styles.css`

- [ ] **Step 1:** Remove candidate excerpts from the render output.
- [ ] **Step 2:** Shrink the candidate column to a compact index.
- [ ] **Step 3:** Move the cut queue panel into the top row next to the player, then keep the full transcript below them.
- [ ] **Step 4:** Re-run focused tests.

### Task 4: Candidate Focus And Floating Selection

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/app/CutterApp.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/features/material-locator/MaterialLocatorPage.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/styles.css`

- [ ] **Step 1:** Change candidate selection semantics so it highlights hit segments and clears any cut selection.
- [ ] **Step 2:** Add current-hit class/data attributes and scroll the first highlighted hit into view after candidate focus.
- [ ] **Step 3:** Render selected transcript actions as a floating bar near the selection area.
- [ ] **Step 4:** Re-run focused tests.

### Task 5: Verification

**Files:** read-only unless verification exposes regressions.

- [ ] **Step 1:** Run `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts --test-name-pattern "material locator|toolbar"`.
- [ ] **Step 2:** Run `npm run typecheck`.
- [ ] **Step 3:** Run `npm run build:cutter-web`.
- [ ] **Step 4:** Run `git diff --check`.
- [ ] **Step 5:** Run `npm test`.
- [ ] **Step 6:** Refresh `http://127.0.0.1:5173/#material-locator` and visually inspect the new layout.
