# M9B Admin Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind the M9A management-console controls to real local admin functionality without changing the approved seven-page product structure.

**Architecture:** Add a local Admin API server that reads and safely mutates public-library protocol files, extend the typed admin web client with mutation methods, and pass page-level action handlers into the existing M9A UI. Long-running preprocessing remains worker-owned: browser controls enqueue or retry jobs, but do not run ASR/FFmpeg work directly.

**Tech Stack:** React 19, TypeScript, Node HTTP server, existing `@mixlab/library-fs`, `@mixlab/doctor-core`, `@mixlab/ffmpeg-core`, Node test runner, Vite, Playwright visual smoke checks.

---

## Scope Contract

In scope:

- Admin API endpoints for:
  - initialize library
  - scan source videos
  - queue unprocessed videos
  - retry failed videos
  - repair index-required videos
  - run Doctor
  - test ASR configuration state
  - update source-video public metadata
- Queue-aware lifecycle so workers claim `queued` jobs before raw `unprocessed` jobs.
- Admin web typed client mutation methods.
- Fixture client mutations so UI tests can exercise behavior without real files.
- Page controls enabled only when an action handler is supplied.
- Action notice/error feedback in the app shell.
- Local server entry for Admin API and env documentation.

Out of scope:

- Running the preprocess worker from a browser click.
- Editing secrets in the browser.
- Native Finder/open-folder integration.
- Cutter-side changes.
- Redesigning the M9A page layout.

## File Structure

- Create: `/Users/allen/Documents/mixlab/packages/admin-api/package.json`
- Create: `/Users/allen/Documents/mixlab/packages/admin-api/src/index.ts`
- Create: `/Users/allen/Documents/mixlab/packages/admin-api/src/index.test.ts`
- Create: `/Users/allen/Documents/mixlab/scripts/servers/admin-api-server.ts`
- Modify: `/Users/allen/Documents/mixlab/packages/library-fs/src/preprocess-lifecycle.ts`
- Modify: `/Users/allen/Documents/mixlab/packages/library-fs/src/preprocess-lifecycle.test.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/api.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/api.test.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/app/AdminApp.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/features/shared.tsx`
- Modify: all admin page files that need action props:
  - `/Users/allen/Documents/mixlab/apps/admin-web/src/features/dashboard/DashboardPage.tsx`
  - `/Users/allen/Documents/mixlab/apps/admin-web/src/features/library-settings/LibrarySettingsPage.tsx`
  - `/Users/allen/Documents/mixlab/apps/admin-web/src/features/source-videos/SourceVideosPage.tsx`
  - `/Users/allen/Documents/mixlab/apps/admin-web/src/features/preprocess-jobs/PreprocessJobsPage.tsx`
  - `/Users/allen/Documents/mixlab/apps/admin-web/src/features/index-publish/IndexPublishPage.tsx`
  - `/Users/allen/Documents/mixlab/apps/admin-web/src/features/doctor/DoctorPage.tsx`
  - `/Users/allen/Documents/mixlab/apps/admin-web/src/features/settings/SettingsPage.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/admin-app.test.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/styles.css`
- Modify: `/Users/allen/Documents/mixlab/package.json`
- Modify: `/Users/allen/Documents/mixlab/.env.example`

## Tasks

### Task 1: Admin API Package

- [x] Write failing tests in `packages/admin-api/src/index.test.ts` proving init/scan/status, queue, metadata update, retry, Doctor, ASR config, and index repair endpoints.
- [x] Implement `createAdminApiServer` in `packages/admin-api/src/index.ts`.
- [x] Add `packages/admin-api/package.json`.
- [x] Verify with `node --test --import tsx packages/admin-api/src/index.test.ts`.

### Task 2: Queue-Aware Lifecycle

- [x] Add a failing regression test showing `claimNextPreprocessJob` claims a `queued` job before an `unprocessed` job.
- [x] Update `claimNextPreprocessJob` to select queued first, then unprocessed.
- [x] Verify with `node --test --import tsx packages/library-fs/src/preprocess-lifecycle.test.ts packages/admin-api/src/index.test.ts`.

### Task 3: Admin Web Client

- [x] Extend `AdminApiClient` with mutation methods and typed action result metadata.
- [x] Add `sendJson` for POST/PATCH envelopes.
- [x] Make the fixture client mutable for queue, retry, index repair, ASR test, Doctor run, and metadata updates.
- [x] Verify endpoint paths and fixture transitions in `apps/admin-web/src/api.test.ts`.
- [x] Run `node --test --import tsx apps/admin-web/src/api.test.ts`.

### Task 4: Bind M9A UI Controls Without Redesign

- [x] Change `AdminControlButton` so `m9b-api` controls are enabled when an `onClick` handler is supplied, while `native-boundary` and `read-only` stay disabled.
- [x] Add action props to each page, preserving M9A copy and layout.
- [x] Make source metadata inspector editable and call `onSave`.
- [x] Add app-shell `runAction` orchestration with action notice/error and refresh after mutations.
- [x] Keep toolbar free of duplicated global action buttons unless page-level actions already exist.
- [x] Update render tests to assert M9B action handlers enable controls and M9A native/read-only controls remain disabled.
- [x] Run `node --test --import tsx apps/admin-web/src/admin-app.test.ts`.

### Task 5: Runtime Server And Local Test Setup

- [x] Create `scripts/servers/admin-api-server.ts` using `loadProjectEnv`.
- [x] Add root script `server:admin-api`.
- [x] Add `.env.example` keys for `MIXLAB_ADMIN_LIBRARY_ROOT`, `MIXLAB_ADMIN_LIBRARY_ID`, `MIXLAB_ADMIN_LIBRARY_NAME`, `MIXLAB_ADMIN_API_HOST`, `MIXLAB_ADMIN_API_PORT`, and `VITE_MIXLAB_ADMIN_API_BASE_URL`.
- [x] Start Admin API at `127.0.0.1:3889` and Admin Web at `127.0.0.1:5174`.
- [x] Verify `curl http://127.0.0.1:3889/api/admin/library/status` and `curl -I http://127.0.0.1:5174/`.

### Task 6: Verification And Commit

- [x] Run targeted tests:
  `node --test --import tsx packages/admin-api/src/index.test.ts packages/library-fs/src/preprocess-lifecycle.test.ts apps/admin-web/src/api.test.ts apps/admin-web/src/admin-app.test.ts`
- [x] Run `npm test`.
- [x] Run `npm run typecheck`.
- [x] Run `npm run build:admin-web`.
- [x] Run `npm run visual:admin-web`.
- [x] Stage only M9B files.
- [x] Commit with `feat(admin): wire management console controls`.

## Acceptance Script

After implementation, test at `http://127.0.0.1:5174/`:

1. 公共素材库设置: click 初始化素材库, 扫描源视频, 导出诊断.
2. 原视频管理: search/filter/select, edit metadata, save public description.
3. 预处理任务: click 处理未处理 and 重试失败.
4. 索引健康与修复: click 修复 index-required and 校验索引.
5. Doctor: click 重新运行 Doctor and 导出诊断 JSON.
6. 设置: click 测试 ASR 配置; confirm 编辑 API Key remains disabled.
7. Confirm action notice/error appears and counts refresh after mutations.

## Self-Review

- Scope matches the user-approved sequence: M9A UI first, M9B controls second.
- The plan preserves the M9A page structure and only adds behavior.
- Native and secret-editing boundaries stay explicit.
- Long-running preprocessing is not triggered from the browser; browser actions only change queue state.
