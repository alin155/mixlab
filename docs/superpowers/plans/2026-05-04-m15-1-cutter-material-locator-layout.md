# M15.1 Cutter Material Locator Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Follow `superpowers:test-driven-development`: write a failing focused test, confirm it fails, implement the smallest change, then rerun the focused test.

**Goal:** Rebuild the cutter `素材定位` home page into one efficient search-select-cut workbench matching the agreed six-area layout.

**Architecture:** Keep `CutterApp` as the state owner and keep `MaterialLocatorPage` as the page boundary. Update only the material locator render contract and CSS layout so existing search, transcript selection, video seek, and direct cut behavior continue to work.

**Tech Stack:** React, TypeScript, node:test, `renderToStaticMarkup`, CSS in `apps/cutter-web/src/styles.css`.

---

### Task 1: Page Contract Tests

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`

- [ ] **Step 1:** Add a failing render test for the six product areas: `工作台状态`, `搜索定位`, `候选素材`, `画面验证`, `完整文案`, `剪切队列`.
- [ ] **Step 2:** Add failing assertions that the page uses a single workbench shell with `data-layout="search-select-cut"` and grouped candidates before the player.
- [ ] **Step 3:** Run `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts --test-name-pattern "material locator"` and confirm the new assertions fail.

### Task 2: Workbench Layout Implementation

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/features/material-locator/MaterialLocatorPage.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/styles.css`

- [ ] **Step 1:** Replace the current vertical locator page with a workbench status row, search command row, candidate column, main video verification panel, natural transcript panel, and right cut queue rail.
- [ ] **Step 2:** Keep all existing controls wired: search submit, source/orientation filters, candidate select, transcript click/drag, preview selection, `剪切这段`, cancel selection.
- [ ] **Step 3:** Keep all visible copy Chinese-only and remove layout text that describes implementation internals.
- [ ] **Step 4:** Re-run the focused material locator tests and confirm they pass.

### Task 3: Verification

**Files:** read-only unless verification exposes a regression.

- [ ] **Step 1:** Run `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts --test-name-pattern "material locator"`.
- [ ] **Step 2:** Run `npm run typecheck`.
- [ ] **Step 3:** Run `npm run build:cutter-web`.
- [ ] **Step 4:** Refresh `http://127.0.0.1:5173/#material-locator` and visually confirm the six areas render in the agreed layout.
