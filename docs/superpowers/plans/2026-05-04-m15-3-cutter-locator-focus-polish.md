# M15.3 Cutter Locator Focus Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce visual noise in the cutter material locator so editors can search, verify video, select transcript text, and cut with less interruption.

**Architecture:** Keep the existing `MaterialLocatorPage` component and CSS ownership. Tests lock the intended markup contract: no redundant visual/queue headers, a bounded video panel, compact candidate cards, an empty-by-default search input, and a lightweight selection toolbar.

**Tech Stack:** React, TypeScript, Node test runner, CSS.

---

### Task 1: Lock M15.3 Markup Contract

**Files:**
- Modify: `apps/cutter-web/src/cutter-app.test.ts`

- [ ] **Step 1: Update the material locator render test**

Add assertions that the locator no longer renders redundant video and queue section headers, the search input is empty by default, compact candidate cards expose video title plus text statistics, and the selection toolbar only shows selected duration.

- [ ] **Step 2: Run focused test and confirm RED**

Run: `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts --test-name-pattern "material locator"`

Expected: FAIL because the current implementation still renders the old headers, old candidate metadata, default query value, and selected transcript text inside the floating toolbar.

### Task 2: Implement Locator Focus Polish

**Files:**
- Modify: `apps/cutter-web/src/features/material-locator/MaterialLocatorPage.tsx`
- Modify: `apps/cutter-web/src/styles.css`

- [ ] **Step 1: Remove redundant section chrome**

Remove the visible `画面验证` and queue summary headers from the top row. Keep accessible labels on sections.

- [ ] **Step 2: Bound video height**

Add a locator-specific video CSS rule with a max height so the video cannot consume the transcript workspace on tall screens.

- [ ] **Step 3: Compact candidate cards**

Render candidate cards as cover, video name, transcript word count, and hit count. Keep source grouping in section headers.

- [ ] **Step 4: Make selection toolbar lightweight**

Render only selected duration and actions in a semi-transparent compact floating toolbar. The cancel button continues to call the existing cancel handler.

- [ ] **Step 5: Keep search input empty by default**

Use the query only as page/search state, not as the input default text. The placeholder remains the guide.

### Task 3: Verify

**Files:**
- Test: `apps/cutter-web/src/cutter-app.test.ts`

- [ ] **Step 1: Run focused tests**

Run: `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts --test-name-pattern "material locator"`

Expected: PASS.

- [ ] **Step 2: Run broader checks**

Run: `npm run typecheck`, `npm run build:cutter-web`, and `npm test`.

Expected: all commands exit 0.
