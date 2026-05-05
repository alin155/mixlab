# Cutter Appearance Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cutter-side display modes for system, default, night, and comfort viewing without altering video pixels.

**Architecture:** Store the cutter appearance mode in local browser storage, apply it as a `data-appearance-mode` attribute on the cutter app root, and expose the selector on the cutter settings page. Theme colors are CSS variable overrides scoped to the cutter app, while `video`, `img`, and cover media remain unfiltered.

**Tech Stack:** React, TypeScript, CSS custom properties, Node test runner with `tsx`.

---

### Task 1: Persist Appearance Mode

**Files:**
- Create: `apps/cutter-web/src/state/appearance.ts`
- Test: `apps/cutter-web/src/cutter-state.test.ts`

- [x] Add a failing test that invalid stored modes fall back to `system`, valid modes round-trip through local storage, and labels are Chinese.
- [x] Implement `CutterAppearanceMode`, `appearanceModeLabel`, `readCutterAppearanceMode`, and `writeCutterAppearanceMode`.
- [x] Run `node --test --import tsx apps/cutter-web/src/cutter-state.test.ts`.

### Task 2: Connect Cutter App and Settings

**Files:**
- Modify: `apps/cutter-web/src/app/CutterApp.tsx`
- Modify: `apps/cutter-web/src/features/settings/SettingsPage.tsx`
- Test: `apps/cutter-web/src/cutter-app.test.ts`

- [x] Add a failing render test that the cutter app root exposes `data-appearance-mode` and settings show four Chinese display modes.
- [x] Pass the mode and setter into settings and persist changes when users choose a mode.
- [x] Run `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts`.

### Task 3: Add CSS Theme Tokens

**Files:**
- Modify: `apps/cutter-web/src/styles.css`
- Test: `apps/cutter-web/src/cutter-app.test.ts`

- [x] Add a failing CSS test that night and comfort modes override scoped UI colors and do not apply filters to `video` or `img`.
- [x] Implement scoped CSS variable overrides for `data-appearance-mode="night"`, `data-appearance-mode="comfort"`, and system dark preference.
- [x] Run `npm run typecheck` and `npm run build:cutter-web`.
