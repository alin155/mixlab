# M14 Cutter Search Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the cutter workflow from real search to transcript reading, continuous segment selection, and local cut-list preparation.

**Architecture:** Keep Cutter API as the data source and CutterApp as the state owner. Add hash helpers for search/detail context, a tiny transcript-selection state helper, interactive SearchPage and SourceDetailPage props, and URL-resolved search reloads through the existing typed API client.

**Tech Stack:** React, TypeScript, node:test, Cutter API client, localStorage cut-list state.

---

### Task 1: Hash Context

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/app/navigation.ts`
- Test: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`

- [x] **Step 1:** Add failing tests for `#search?query=...` and `#source-detail/V000001?query=...&segments=...`.
- [x] **Step 2:** Run `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` and confirm failure.
- [x] **Step 3:** Implement `searchHash`, `searchQueryFromHash`, expanded `sourceDetailHash`, and `sourceDetailContextFromHash`.
- [x] **Step 4:** Re-run the test file and confirm pass.

### Task 2: Search Page

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/features/search/SearchPage.tsx`
- Test: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`

- [x] **Step 1:** Add failing render test for real search form and detail links carrying query and segment IDs.
- [x] **Step 2:** Run cutter app tests and confirm failure.
- [x] **Step 3:** Implement form, search button, empty state, and `查看完整文案` links.
- [x] **Step 4:** Re-run tests.

### Task 3: Transcript Selection

**Files:**
- Create: `/Users/allen/Documents/mixlab/apps/cutter-web/src/state/transcript-selection.ts`
- Test: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-state.test.ts`

- [x] **Step 1:** Add failing tests for continuous range resolution and click-to-select behavior.
- [x] **Step 2:** Run cutter state tests and confirm failure.
- [x] **Step 3:** Implement selection helpers.
- [x] **Step 4:** Re-run cutter state tests.

### Task 4: Source Detail Reader

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/features/source-detail/SourceDetailPage.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/app/CutterApp.tsx`
- Test: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`

- [x] **Step 1:** Add failing tests for highlighted hit segments, selected range text, and selectable segment controls.
- [x] **Step 2:** Run cutter app tests and confirm failure.
- [x] **Step 3:** Wire highlighted IDs, selected IDs, segment click handler, and selected text into detail page.
- [x] **Step 4:** Re-run tests.

### Task 5: App Data Flow

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/fixture-client.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/app/CutterApp.tsx`
- Test: `/Users/allen/Documents/mixlab/apps/cutter-web/src/api.test.ts`
- Test: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`

- [x] **Step 1:** Add failing tests proving search query reload resolves API media URLs and source detail selection uses highlighted segments.
- [x] **Step 2:** Run focused tests and confirm failure.
- [x] **Step 3:** Export search URL resolver and wire search hash query, detail context, and add-to-cut-list.
- [x] **Step 4:** Re-run focused tests.

### Task 6: Verification

**Files:** read-only unless failures require fixes.

- [x] **Step 1:** Run focused cutter tests.
- [x] **Step 2:** Run `npm run typecheck`.
- [x] **Step 3:** Run `npm test`.
- [x] **Step 4:** Run `npm run build:cutter-web`.
- [x] **Step 5:** Run `git diff --check`.
- [x] **Step 6:** Smoke test in the local browser: search, detail context, selected transcript range, add to cut list.
