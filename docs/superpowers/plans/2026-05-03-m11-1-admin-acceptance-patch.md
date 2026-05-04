# M11.1 Admin Acceptance Patch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the admin-side acceptance gaps found in testing: actionable diagnosis, observable index publishing, per-video operations, and real cover/keyframe publish readiness.

**Architecture:** Keep the existing manifest lifecycle as the source of truth. Add narrow admin API commands for single-video queue/retry and ready-publish, make index publishing return user-facing counts, and adjust admin web pages so every risky state has a visible explanation and an explicit action. Doctor details move into the wide main column while the side panel becomes summary/actions only.

**Tech Stack:** TypeScript, Node.js `node:test`, existing `library-fs`, `admin-api`, React admin web.

---

## File Structure

- Modify `packages/doctor-core/src/index.ts`
  - Treat malformed local clips as warning-level workspace hygiene, not a blocker for public library publishing.
- Modify `packages/doctor-core/src/index.test.ts`
  - Assert local clip problems are warnings with actionable objects.
- Modify `packages/admin-api/src/index.ts`
  - Add per-video queue/retry endpoints.
  - Add ready-publish visual artifact preparation before index publishing.
  - Add an index publish response shape with published/skipped counts and Chinese message.
- Modify `packages/admin-api/src/index.test.ts`
  - Cover per-video queue/retry, index publish skipped feedback, and ready-publish artifact generation with injected media tools.
- Modify `apps/admin-web/src/api.ts`
  - Add client methods and fixture mutations for per-video queue/retry and richer publish result notices.
- Modify `apps/admin-web/src/app/AdminApp.tsx`
  - Wire new actions and format publish results visibly.
- Modify `apps/admin-web/src/features/doctor/DoctorPage.tsx`
  - Move diagnostic detail into main column and make local clip handling explicit.
- Modify `apps/admin-web/src/features/index-publish/IndexPublishPage.tsx`
  - Show待发布视频清单, publish outcomes, and skipped explanations.
- Modify `apps/admin-web/src/features/source-videos/SourceVideosPage.tsx`
  - Add row-level actions based on status and clearer status context.
- Modify `apps/admin-web/src/features/shared.tsx`
  - Extend source table row actions and show cover fallback state clearly.
- Modify `apps/admin-web/src/admin-app.test.ts` and `apps/admin-web/src/api.test.ts`
  - Assert the acceptance behaviors render and mutate correctly.

---

### Task 1: Doctor Diagnosis Is Actionable

- [ ] Write failing tests showing malformed local clips are warnings and the doctor page shows wide detail cards with concrete handling text.
- [ ] Run focused doctor tests and confirm RED.
- [ ] Change `checkLocalClips` to return `warn` for malformed local clip manifests and include object ids in details.
- [ ] Move doctor explanation cards into the main column under the status list; keep report metadata/export in the inspector.
- [ ] Run focused doctor tests and confirm GREEN.

### Task 2: Index Publish Is Observable

- [ ] Write failing API/web tests for publishing with incomplete待发布视频: the result must report skipped ids and the page must show why nothing became visible.
- [ ] Run focused tests and confirm RED.
- [ ] Return a typed admin publish action result containing `published_count`, `skipped_count`, `ready_video_count`, and Chinese `message`.
- [ ] Render待发布视频清单 and skipped/published explanations on `索引与发布`.
- [ ] Run focused tests and confirm GREEN.

### Task 3: Source Videos Have Per-Video Actions

- [ ] Write failing API/web tests for row-level `处理此视频` and `重试此视频`.
- [ ] Run focused tests and confirm RED.
- [ ] Add `/api/admin/source-videos/:id/queue` and `/retry` endpoints that mutate only the requested manifest.
- [ ] Wire admin web buttons based on status: 未处理 -> 处理此视频, 失败 -> 重试此视频, 待发布索引 -> 查看发布.
- [ ] Run focused tests and confirm GREEN.

### Task 4: Ready Publish Generates Visual Artifacts

- [ ] Write failing API test where an index-required video with transcript/SRT but no cover/keyframes becomes ready after admin publish using injected media helpers.
- [ ] Run focused test and confirm RED.
- [ ] Add an admin-side ready-publish preparation helper that resolves source path, creates cover when missing, writes keyframes, then calls existing `publishIndexRequiredSourceVideos`.
- [ ] Keep real FFmpeg guarded through existing runtime resolution; tests inject lightweight media helpers.
- [ ] Run focused tests and confirm GREEN.

### Task 5: Self-Check And Verification

- [ ] Search admin web for stale English labels, native-boundary controls that should now be implemented, disabled buttons without explanation, and empty inspectors.
- [ ] Patch any same-class acceptance issues found in this pass.
- [ ] Run `npm test`, `npm run typecheck`, and `git diff --check`.
- [ ] Refresh the admin web in browser and verify doctor, source videos, index publish, and preprocess queue pages show the new controls and explanations.
