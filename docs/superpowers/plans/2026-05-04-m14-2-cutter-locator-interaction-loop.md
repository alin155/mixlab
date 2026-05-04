# M14.2 Cutter Locator Interaction Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the cutter `素材定位` workbench perform the real click-to-seek, drag-to-select, preview-selection, and direct-cut-feedback loop.

**Architecture:** Keep `CutterApp` as the owner of selected material, highlighted hits, selected transcript range, and cut task feedback. Add small state helpers for transcript playback math so the React page only handles DOM video control and event wiring. Keep M14.1 navigation and page structure unchanged.

**Tech Stack:** React, TypeScript, node:test, Playwright smoke test, Vite cutter web.

---

### Task 1: Transcript Playback State Helpers

**Files:**
- Create: `/Users/allen/Documents/mixlab/apps/cutter-web/src/state/transcript-playback.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-state.test.ts`

- [x] **Step 1:** Add failing tests for playback start and stop math:
  - `previewStartSeconds(12200)` returns `11.7`.
  - `previewStartSeconds(200)` returns `0`.
  - `selectionPlaybackWindow([s-001, s-002])` returns `{ startSeconds: 9.5, endSeconds: 21.4 }` when the first segment begins at `10000` and the last ends at `21400`.
  - `shouldPauseSelectionPreview(21.41, 21400)` returns `true`.
- [x] **Step 2:** Run `node --test --import tsx apps/cutter-web/src/cutter-state.test.ts` and confirm it fails because the module is missing.
- [x] **Step 3:** Implement `previewStartSeconds`, `selectionPlaybackWindow`, and `shouldPauseSelectionPreview`.
- [x] **Step 4:** Re-run the focused state test and confirm pass.

### Task 2: Material Locator Player Controls

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/features/material-locator/MaterialLocatorPage.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`

- [x] **Step 1:** Add failing render tests proving the locator video exposes `data-testid="locator-video"` and the preview button exposes `data-testid="preview-selection"`.
- [x] **Step 2:** Run `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` and confirm failure.
- [x] **Step 3:** Add a `videoRef`, set `currentTime` to the clicked segment start minus pre-roll on transcript click, and expose stable test ids.
- [x] **Step 4:** Add `handlePreviewSelection`: seek to selected range start, call `play()`, store selected range end, and pause in `onTimeUpdate` when the video reaches the end.
- [x] **Step 5:** Re-run cutter app tests.

### Task 3: Drag Selection Without Click Overwrite

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/features/material-locator/MaterialLocatorPage.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-state.test.ts`

- [x] **Step 1:** Add failing state helper tests proving a drag from `s-003` to `s-001` resolves to `s-001..s-003`, and a subsequent click should be suppressed when a drag selected a multi-segment range.
- [x] **Step 2:** Run the focused state tests and confirm failure.
- [x] **Step 3:** Add a tiny helper in `transcript-selection.ts` for `shouldSuppressTranscriptClickAfterMouseUp(startSegmentId, endSegmentId)`.
- [x] **Step 4:** Use that helper in `MaterialLocatorPage` so a drag selection does not get overwritten by the browser click event.
- [x] **Step 5:** Re-run focused tests.

### Task 4: Search Result Highlight State

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/app/CutterApp.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`

- [x] **Step 1:** Add failing tests for a pure helper `materialSelectionFromResult(result)` that returns selected start id, selected end id, and highlighted hit ids.
- [x] **Step 2:** Run cutter app tests and confirm failure.
- [x] **Step 3:** Implement and export `materialSelectionFromResult`.
- [x] **Step 4:** Add `locatorHighlightedSegmentIds` state in `CutterApp`, set it when a result is selected, and pass it to `MaterialLocatorPage` while on `material-locator`.
- [x] **Step 5:** Re-run cutter app tests.

### Task 5: Direct Cut Feedback

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/app/CutterApp.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/features/material-locator/MaterialLocatorPage.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/styles.css`

- [x] **Step 1:** Add failing render tests that a `cutNotice="已加入剪切任务 · 等待中 1"` prop appears in the locator page.
- [x] **Step 2:** Add failing pure helper test for `cutNoticeForSubmittedJobs(1)` returning `已加入剪切任务 · 等待中 1`.
- [x] **Step 3:** Run cutter app tests and confirm failure.
- [x] **Step 4:** Add the `cutNotice` prop and render it as a non-blocking notice.
- [x] **Step 5:** Implement `cutNoticeForSubmittedJobs` and set notice after API or fixture direct cut succeeds.
- [x] **Step 6:** Re-run cutter app tests.

### Task 6: Verification And Browser Smoke

**Files:** read-only unless failures require targeted fixes.

- [x] **Step 1:** Run `node --test --import tsx apps/cutter-web/src/cutter-state.test.ts`.
- [x] **Step 2:** Run `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts`.
- [x] **Step 3:** Run `npm run typecheck`.
- [x] **Step 4:** Run `npm test`.
- [x] **Step 5:** Run `npm run build:cutter-web`.
- [x] **Step 6:** Run `git diff --check`.
- [x] **Step 7:** Run a fixture-mode Playwright smoke test against a temporary cutter web dev server. Verify: click transcript changes video `currentTime`, drag selection leaves multi-segment selected text, preview button calls the video path without crashing, direct cut displays `已加入剪切任务`, and `#cut-tasks` still shows Chinese task statuses.
