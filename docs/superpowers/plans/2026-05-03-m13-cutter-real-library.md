# M13 Cutter Real Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the cutter workbench to the real Cutter API ready source library with approved-login access, API-resolved media URLs, per-video detail routing, and usage-stat visibility.

**Architecture:** Keep Cutter API as the only runtime backend for the cutter app. The React app stores an approved session, loads the public ready library through the authenticated client, resolves all returned media URLs against the Cutter API base URL, and uses hash route `#source-detail/V000001` to fetch per-video details. Cutter API already owns ready filtering and usage event writes, so frontend changes should not duplicate library rules.

**Tech Stack:** React, Vite, TypeScript, Node test runner, Cutter API, library-fs cutter catalog helpers.

---

### Task 1: Runtime URL Resolution

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/fixture-client.ts`
- Test: `/Users/allen/Documents/mixlab/apps/cutter-web/src/api.test.ts`

- [x] **Step 1: Write the failing test**

Add a test that calls `loadCutterWorkbenchData()` with a fake client whose `resolveApiUrl()` prefixes `http://127.0.0.1:3789`. Assert that library cards, primary detail, search groups, and local clips use absolute API URLs.

- [x] **Step 2: Run test to verify it fails**

Run: `node --test --import tsx apps/cutter-web/src/api.test.ts`

Expected: FAIL because returned URLs remain `/cutter/...`.

- [x] **Step 3: Implement URL normalization**

Add helper functions in `fixture-client.ts`:

```ts
function resolveSourceVideoCardUrls<T extends SourceVideoCard>(client: CutterApiClient, card: T): T {
  return {
    ...card,
    media_url: client.resolveApiUrl(card.media_url),
    cover_url: client.resolveApiUrl(card.cover_url),
    detail_url: client.resolveApiUrl(card.detail_url),
    subtitles_url: client.resolveApiUrl(card.subtitles_url)
  };
}
```

Apply the same idea to source detail, search groups, and local clips inside `loadCutterWorkbenchData()`.

- [x] **Step 4: Run focused test**

Run: `node --test --import tsx apps/cutter-web/src/api.test.ts`

Expected: PASS.

### Task 2: Source Detail Hash Routing

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/app/navigation.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/app/CutterApp.tsx`
- Test: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`

- [x] **Step 1: Write the failing tests**

Add tests for:

- `routeFromHash("#source-detail/V000001")` returns `source-detail`.
- `sourceVideoIdFromHash("#source-detail/V000001")` returns `V000001`.
- `sourceDetailHash("V000001")` returns `#source-detail/V000001`.

- [x] **Step 2: Run test to verify it fails**

Run: `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts`

Expected: FAIL because helper functions do not exist and route parser does not support detail IDs.

- [x] **Step 3: Implement helpers**

Add route helpers in `navigation.ts`, then update `CutterApp` hash-change state so selected source video ID is tracked separately from the page route.

- [x] **Step 4: Run focused test**

Run: `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts`

Expected: PASS.

### Task 3: Public Library Detail Entry

**Files:**
- Modify: `/Users/allen/Documents/mixlab/packages/ui-foundation/src/components.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/features/public-library/PublicLibraryPage.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/app/CutterApp.tsx`
- Test: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`

- [x] **Step 1: Write the failing test**

Extend the public library test to assert each rendered card has a Chinese “查看详情” link with `href="#source-detail/src-001"` in fixture mode and no management/edit controls.

- [x] **Step 2: Run test to verify it fails**

Run: `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts`

Expected: FAIL because cards do not render detail links.

- [x] **Step 3: Implement card actions**

Add optional `href` and `action_label` to `GalleryItem`; render an `<a>` action inside each gallery card. Pass `sourceDetailHash(video.source_video_id)` from `PublicLibraryPage`.

- [x] **Step 4: Run focused test**

Run: `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts`

Expected: PASS.

### Task 4: Selected Detail Fetch

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/app/CutterApp.tsx`
- Test: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`
- Test: `/Users/allen/Documents/mixlab/packages/cutter-api/src/index.test.ts`

- [x] **Step 1: Add regression coverage**

Use existing API tests to confirm `GET /cutter/source-videos/:id` records source detail usage and hides non-ready videos. Add frontend unit coverage for `selectedSourceVideoId` helpers if the app logic is extracted.

- [x] **Step 2: Implement selected detail loading**

When the hash contains a source video ID and the login gate is not visible, call `client.getSourceVideoDetail(id)`. On success, set `data.primaryDetail` to that result. On failure, show the existing Chinese load error panel.

- [x] **Step 3: Run focused tests**

Run:

```bash
node --test --import tsx apps/cutter-web/src/cutter-app.test.ts
node --test --import tsx packages/cutter-api/src/index.test.ts
```

Expected: PASS.

### Task 5: End-to-End Verification

**Files:**
- Verify only unless a focused failure appears.

- [x] **Step 1: Run typecheck**

Run: `npm run typecheck`

Expected: exit 0.

- [x] **Step 2: Run full tests**

Run: `npm test`

Expected: all tests pass.

- [x] **Step 3: Browser smoke test**

Open the cutter workbench against the current Cutter API, confirm public library media URLs point to Cutter API and detail route can be opened.
