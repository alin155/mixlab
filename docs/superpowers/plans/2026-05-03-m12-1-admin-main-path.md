# M12.1 Admin Main Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the admin console around explicit smart scan, one-click continuous preprocessing, automatic incremental publishing, runtime load visibility, and fewer scattered production buttons.

**Architecture:** Keep the current React admin shell and Node admin API. Treat `#/preprocess-jobs` as the single production monitoring page named `预处理`, route legacy index pages to it, and make the backend supervisor run a continuous pipeline that scans, queues, preprocesses, and publishes ready videos. Runtime load metrics are returned from the dashboard metrics endpoint and rendered as operator-friendly Chinese health summaries.

**Tech Stack:** TypeScript, React server-rendered tests via `renderToStaticMarkup`, Node test runner, local filesystem protocol packages, Node `os` runtime metrics.

---

### Task 1: Freeze The New Admin IA In Tests

**Files:**
- Modify: `apps/admin-web/src/features/admin-ui-contract.test.ts`
- Modify: `apps/admin-web/src/admin-app.test.ts`

- [ ] **Step 1: Write failing contract tests**

Update `apps/admin-web/src/features/admin-ui-contract.test.ts` so it expects six visible product pages and no daily `索引与发布` nav item:

```ts
test("admin UI contract defines the M12.1 product pages", () => {
  assert.deepEqual(ADMIN_UI_ROUTES, [
    "dashboard",
    "source-videos",
    "preprocess-jobs",
    "doctor",
    "cutter-users",
    "settings"
  ]);
  assert.equal(ADMIN_UI_PAGES["preprocess-jobs"].label, "预处理");
  assert.equal(ADMIN_UI_PAGES["preprocess-jobs"].goal, "监控预处理流水线和自动增量发布");
});

test("navigation uses product-approved page labels", () => {
  assert.deepEqual(
    ADMIN_NAV_ITEMS.map((item) => item.label),
    ["仪表盘", "原视频管理", "预处理", "健康诊断", "剪辑师用户", "设置"]
  );
});
```

Update the admin app tests to expect `routeFromHash("#/index-publish")` and `routeFromHash("#/index-health")` to resolve to `"preprocess-jobs"`, and assert that settings/source video/preprocess pages do not render removed global buttons.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --test --import tsx apps/admin-web/src/admin-app.test.ts apps/admin-web/src/features/admin-ui-contract.test.ts
```

Expected: FAIL because the current navigation still shows `预处理队列` and `索引与发布`, and removed buttons still exist.

### Task 2: Update Navigation, Page Contracts, And Button Boundaries

**Files:**
- Modify: `apps/admin-web/src/app/navigation.ts`
- Modify: `apps/admin-web/src/features/admin-ui-contract.ts`
- Modify: `apps/admin-web/src/app/AdminApp.tsx`
- Modify: `apps/admin-web/src/features/settings/SettingsPage.tsx`
- Modify: `apps/admin-web/src/features/source-videos/SourceVideosPage.tsx`
- Modify: `apps/admin-web/src/features/preprocess-jobs/PreprocessJobsPage.tsx`

- [ ] **Step 1: Implement the IA**

Change navigation labels and route aliases:

```ts
export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { route: "dashboard", label: "仪表盘", icon: "dashboard" },
  { route: "source-videos", label: "原视频管理", icon: "video" },
  { route: "preprocess-jobs", label: "预处理", icon: "queue" },
  { route: "doctor", label: "健康诊断", icon: "doctor" },
  { route: "cutter-users", label: "剪辑师用户", icon: "users" },
  { route: "settings", label: "设置", icon: "settings" }
];

const ROUTE_ALIASES: Record<string, AdminRoute> = {
  "library-settings": "settings",
  "index-health": "preprocess-jobs",
  "index-publish": "preprocess-jobs"
};
```

Update route titles so `preprocess-jobs` and legacy `index-publish` display `预处理`.

- [ ] **Step 2: Remove production buttons from non-production pages**

In settings, remove the `自动扫描`、`自动入队`、`自动发布索引` rows and the `初始化素材库`、`扫描源视频` buttons. Preserve hidden runtime policy fields by keeping the existing values in component state and save payload.

In source videos, remove global `扫描新增视频`、`加入预处理队列`、`重试失败视频` buttons. Keep search, filter, metadata editing, detail navigation, and row-level actions.

In preprocess, rename headings to `预处理`, remove `加入预处理队列` as a primary page action, and add an `索引状态` block using `data.indexes` plus `data.status.index_required_video_count`.

- [ ] **Step 3: Run focused tests and verify GREEN**

Run:

```bash
node --test --import tsx apps/admin-web/src/admin-app.test.ts apps/admin-web/src/features/admin-ui-contract.test.ts
```

Expected: PASS for navigation and removed-button expectations.

### Task 3: Add Runtime Load Metrics To Dashboard Data

**Files:**
- Modify: `apps/admin-web/src/api.ts`
- Modify: `packages/admin-api/src/index.ts`
- Modify: `apps/admin-web/src/features/dashboard/DashboardPage.tsx`
- Modify: `apps/admin-web/src/features/preprocess-jobs/PreprocessJobsPage.tsx`
- Modify: `apps/admin-web/src/styles.css`
- Modify: `apps/admin-web/src/admin-app.test.ts`
- Modify: `packages/admin-api/src/index.test.ts`

- [ ] **Step 1: Write failing runtime metric tests**

Add tests that expect dashboard markup to include `设备负荷`、`CPU`、`内存`、`网络`、`服务心跳`, and API metrics to include a `runtime_load` object with CPU, memory, network, disk, and service summaries.

- [ ] **Step 2: Implement types and API metrics**

Add `AdminRuntimeLoadMetrics` to `apps/admin-web/src/api.ts` and include it under `AdminDashboardMetrics.runtime_load`.

In `packages/admin-api/src/index.ts`, use Node `os` and existing disk usage to return:

```ts
runtime_load: {
  overall_status,
  cpu: { usage_percent, load_average_1m, status, label },
  memory: { total_bytes, used_bytes, available_bytes, usage_percent, status, label },
  disk: { total_bytes, available_bytes, usage_percent, status, label },
  network: { active_interface_count, status, label },
  service: { uptime_seconds, heartbeat_at, status, label }
}
```

- [ ] **Step 3: Render runtime health**

In dashboard, add a `设备负荷` panel. In preprocess, add a compact `运行负荷` area. Use Chinese labels only and avoid raw OS jargon.

- [ ] **Step 4: Run tests**

Run:

```bash
node --test --import tsx packages/admin-api/src/index.test.ts apps/admin-web/src/admin-app.test.ts
```

Expected: PASS.

### Task 4: Reframe Smart Scan As Pipeline Recommendations

**Files:**
- Modify: `apps/admin-web/src/api.ts`
- Modify: `apps/admin-web/src/app/AdminApp.tsx`
- Modify: `apps/admin-web/src/features/dashboard/DashboardPage.tsx`
- Modify: `apps/admin-web/src/admin-app.test.ts`

- [ ] **Step 1: Write failing smart scan tests**

Assert smart scan recommends `启动预处理流水线` when there are unprocessed, queued, or index-required videos. Assert it no longer recommends `加入预处理队列` or `发布待索引视频` as primary actions.

- [ ] **Step 2: Implement recommendation changes**

Keep compatibility actions internally, but make the primary production action `start-preprocess`. Change labels to:

```ts
"start-preprocess": "启动预处理流水线"
```

Update details to explain that the pipeline will scan, queue, preprocess, and publish automatically.

- [ ] **Step 3: Run focused tests**

Run:

```bash
node --test --import tsx apps/admin-web/src/admin-app.test.ts
```

Expected: PASS.

### Task 5: Make The Supervisor Run A Continuous Pipeline

**Files:**
- Modify: `packages/library-fs/src/preprocess-lifecycle.ts`
- Modify: `packages/preprocess-core/src/library-worker.ts`
- Modify: `packages/admin-api/src/preprocess-supervisor.ts`
- Modify: `packages/admin-api/src/index.ts`
- Modify: `packages/admin-api/src/index.test.ts`
- Modify: `packages/preprocess-core/src/library-worker.test.ts`
- Modify: `packages/library-fs/src/preprocess-lifecycle.test.ts`

- [ ] **Step 1: Write failing backend pipeline tests**

Add an admin API test where starting the supervisor with two unprocessed videos scans, queues, processes available work, auto-publishes the completed video, and then returns to idle with `ready_video_count` incremented.

Add a test proving the start request does not treat `concurrent_jobs: 1` as “only one video forever”; it keeps running cycles until the queue is empty or stopped.

- [ ] **Step 2: Add queued-only claim support**

Extend `ClaimNextPreprocessJobInput` with:

```ts
claim_statuses?: Array<"queued" | "unprocessed">;
```

Default remains queued then unprocessed. When `claim_statuses: ["queued"]`, it must not claim `unprocessed`.

- [ ] **Step 3: Add worker options**

Extend `RunLibraryTextPreprocessWorkerInput` with:

```ts
scan_before_claim?: boolean;
claim_statuses?: Array<"queued" | "unprocessed">;
```

Default behavior remains unchanged. The pipeline will call with `scan_before_claim: false` and `claim_statuses: ["queued"]`.

- [ ] **Step 4: Implement continuous pipeline runner**

In admin API real runner:

1. Initialize library structure.
2. Scan source folders.
3. Transition unprocessed videos to queued.
4. Run one worker cycle with `limit: runtime_policy.concurrent_jobs`.
5. Auto-publish index-required videos.
6. Repeat until no videos are claimed or stop is requested.

Single-video failures stay failed and do not stop later cycles.

- [ ] **Step 5: Run backend tests**

Run:

```bash
node --test --import tsx packages/library-fs/src/preprocess-lifecycle.test.ts packages/preprocess-core/src/library-worker.test.ts packages/admin-api/src/index.test.ts
```

Expected: PASS.

### Task 6: Final Verification And Browser Check

**Files:**
- No new code unless verification reveals a defect.

- [ ] **Step 1: Run full checks**

Run:

```bash
git diff --check
npm run typecheck
npm test
```

Expected: all pass.

- [ ] **Step 2: Browser sanity check**

Open or refresh:

```text
http://127.0.0.1:5174/#/dashboard
http://127.0.0.1:5174/#/preprocess-jobs
http://127.0.0.1:5174/#/settings
http://127.0.0.1:5174/#/source-videos
http://127.0.0.1:5174/#/index-publish
```

Expected:

- Navigation shows `预处理`, not `预处理队列`.
- Navigation does not show `索引与发布`.
- Legacy `#/index-publish` resolves into the `预处理` experience.
- Settings has no production action buttons or auto toggles.
- Dashboard includes device load summary.
- Preprocess page includes production queue and index status.
