# M16.1 Cutter Project Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cutter startup page and lightweight project context so editors can start with search, continue previous projects, and have the first cut silently create a project.

**Architecture:** Keep projects as a cutter-web local domain model first, persisted in localStorage, so the UI and workflow can stabilize before backend schema changes. Add a non-sidebar `project-home` route, a top chrome project switcher, and project creation hooks inside the existing direct cut flow.

**Tech Stack:** React, TypeScript, localStorage, existing cutter API client, Node test runner with `tsx`.

---

### Task 1: Project State Model

**Files:**
- Create: `/Users/allen/Documents/mixlab/apps/cutter-web/src/state/cutter-projects.ts`
- Test: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-state.test.ts`

- [ ] Add tests for default project naming, first-cut project creation, persisted project ordering, and search migration.
- [ ] Implement `CutterProject`, serialization helpers, `createProjectFromFirstCut`, `recordProjectSearch`, `recordProjectCut`, and display helpers.
- [ ] Run `node --test --import tsx apps/cutter-web/src/cutter-state.test.ts`.

### Task 2: Startup Route And Page

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/app/navigation.ts`
- Create: `/Users/allen/Documents/mixlab/apps/cutter-web/src/features/project-home/ProjectHomePage.tsx`
- Test: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`

- [ ] Add `project-home` as a route outside the five primary sidebar items.
- [ ] Make an empty hash route to `project-home`; keep legacy `#search` and `#material-locator` behavior.
- [ ] Render a startup page with search-first entry, recent projects, project detail, and recent searches.
- [ ] Run `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts`.

### Task 3: Global Project Switcher

**Files:**
- Modify: `/Users/allen/Documents/mixlab/packages/ui-foundation/src/components.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/app/CutterApp.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/styles.css`
- Test: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`

- [ ] Allow `MacWindow` chrome meta to receive React content.
- [ ] Add a compact right-side project switcher in the chrome area.
- [ ] Menu actions: 回到启动页, 新建搜索, 查看项目剪切任务, 打开交付文件夹.
- [ ] Ensure it shows `临时搜索` before first cut and `当前项目：项目名` after project creation.

### Task 4: First Cut Creates Project

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/app/CutterApp.tsx`
- Test: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`

- [ ] When `addSelectedSpan` runs without an active project, create a project silently.
- [ ] Default title from current search query; fallback to selected text prefix.
- [ ] Use first cut cover as project cover and migrate current search history into the project.
- [ ] Update the project after every submitted cut.
- [ ] Show a non-blocking notice with the created project name.

### Task 5: Verification

**Files:**
- No new files.

- [ ] Run `node --test --import tsx apps/cutter-web/src/cutter-state.test.ts`.
- [ ] Run `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build:cutter-web`.
- [ ] Commit as `feat: add cutter project home`.
