# M9A Admin UI Freeze Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock the MixLab V3 management-console product interface before binding real controls, so the admin side can be reviewed as a coherent product instead of a collection of prematurely wired buttons.

**Architecture:** Keep M9A-UI as a fixture/data-driven React UI milestone. The admin app may load fixture or read-only API data, but visible mutation controls are classified by a product control-state contract and do not mutate public-library protocol files in this milestone. Functional Admin API work from the previous interrupted pass remains outside this milestone and must not be staged into the M9A-UI commit.

**Tech Stack:** React 19, TypeScript, Node test runner, existing `@mixlab/ui-foundation`, Vite, Playwright visual smoke checks.

---

## Scope Contract

M9A-UI is a product/interface milestone, not a backend/functionality milestone.

In scope:

- Management-console information architecture for seven pages:
  - `dashboard`: 仪表盘 - 看全局风险和产能
  - `library-settings`: 公共库设置 - 保证库能初始化和读写
  - `source-videos`: 原视频管理 - 管理公共素材资产与元数据
  - `preprocess-jobs`: 预处理任务 - 控制生产队列
  - `index-publish`: 索引健康与修复 - 保证 ready 视频可搜索
  - `doctor`: Doctor - 诊断系统问题
  - `settings`: 设置 - 配置运行策略
- Page-specific layout, copy, primary/secondary actions, local interactions, empty states, risk states, and disabled states.
- A control-state matrix where every visible control is one of:
  - `local`: works inside the page without backend mutation.
  - `m9b-api`: shown but disabled until M9B binds Admin API.
  - `native-boundary`: shown but disabled because a browser UI cannot perform native desktop operations.
  - `read-only`: informational control or field with no mutation.
- Render tests that lock product language and visible controls.
- Visual smoke checks for all seven routes.

Out of scope:

- Admin API mutation wiring.
- Real library initialization, scanning, queueing, retrying, index repair, Doctor rerun, ASR submit tests, and metadata saving.
- New backend packages or server scripts.
- Cutter-side changes.
- Styling unrelated to admin web.

## Branch And Worktree Hygiene

The current branch contains partially implemented functional work from the interrupted M9A product-closure pass. Treat it as WIP context, not as this milestone.

Before executing M9A-UI:

- Preserve any functional work that is not part of UI freeze in a named stash or separate WIP branch.
- Start M9A-UI execution from the current clean codebase state or from a clean branch.
- Stage only the files listed under this plan's file structure.
- Do not stage `packages/admin-api/**`, `packages/library-fs/**`, or Admin API mutation tests for the M9A-UI commit.

## File Structure

- Create: `/Users/allen/Documents/mixlab/apps/admin-web/src/features/admin-ui-contract.ts`
  - Defines page goals, page sections, and control-state metadata.
- Create: `/Users/allen/Documents/mixlab/apps/admin-web/src/features/admin-ui-contract.test.ts`
  - Verifies the seven-page product map and control-state matrix.
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/app/navigation.ts`
  - Rename the index route label from `索引发布` to `索引健康与修复`.
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/app/AdminApp.tsx`
  - Render the seven-page UI against fixture/read-only data without mutation handlers.
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/features/shared.tsx`
  - Add shared UI primitives for admin action controls, page summary strips, metadata chips, empty states, and read-only/edit-preview fields.
- Modify:
  - `/Users/allen/Documents/mixlab/apps/admin-web/src/features/dashboard/DashboardPage.tsx`
  - `/Users/allen/Documents/mixlab/apps/admin-web/src/features/library-settings/LibrarySettingsPage.tsx`
  - `/Users/allen/Documents/mixlab/apps/admin-web/src/features/source-videos/SourceVideosPage.tsx`
  - `/Users/allen/Documents/mixlab/apps/admin-web/src/features/preprocess-jobs/PreprocessJobsPage.tsx`
  - `/Users/allen/Documents/mixlab/apps/admin-web/src/features/index-publish/IndexPublishPage.tsx`
  - `/Users/allen/Documents/mixlab/apps/admin-web/src/features/doctor/DoctorPage.tsx`
  - `/Users/allen/Documents/mixlab/apps/admin-web/src/features/settings/SettingsPage.tsx`
  - Implement page-specific product layouts and local-only interactions.
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/admin-app.test.ts`
  - Lock product semantics and controls for all seven pages.
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/styles.css`
  - Add the admin-console layout, control-state, table, inspector, empty/risk states, and responsive polish.
- Modify: `/Users/allen/Documents/mixlab/scripts/visual/check-admin-web-screenshots.ts`
  - Update route assertions to M9A-UI language and control-state expectations.

## Product Contract

### Page 1: 仪表盘

User goal: In one screen, the material administrator knows whether the public library is healthy, whether production is moving, and where risk is accumulating.

Primary information:

- Total source videos.
- Ready videos visible to cutters.
- Processing, queued, unprocessed, failed, and index-required counts.
- Disk capacity.
- Current active job.
- Recent failed/retryable jobs.
- Current index status.

Controls:

- `扫描源视频`: `m9b-api`.
- `处理未处理`: `m9b-api`.
- `Doctor`: `m9b-api`.
- Failed-row retry: `m9b-api`.

### Page 2: 公共库设置

User goal: Confirm the public library path, protocol directory, source-videos folder, and library identity are valid before production work starts.

Primary information:

- Root path.
- `source-videos` path.
- `.mixlab-library` path.
- `library_id`.
- protocol version.
- path checks with pass/warn/fail tone.

Controls:

- `初始化素材库`: `m9b-api`.
- `扫描源视频`: `m9b-api`.
- `打开文件夹`: `native-boundary`.
- `导出诊断`: `m9b-api`.

### Page 3: 原视频管理

User goal: Manage the public-facing metadata and visibility readiness of original source videos.

Primary information:

- Searchable table of all source videos.
- Cover, title, file name, tags, duration, file size, preprocess status, cutter visibility.
- Right-side selected-video inspector with editable-preview public metadata fields.
- Error stage/message for failed assets.

Local interactions:

- Search file name, title, tags, relative path, lecturer, course, category.
- Filter by preprocess status.
- Select a source video row and update the right inspector preview.

Controls:

- Search input: `local`.
- Status filter: `local`.
- Row select/view: `local`.
- `保存公开说明`: `m9b-api`.
- `扫描新增视频`: `m9b-api`.
- `处理未处理`: `m9b-api`.
- `重试失败视频`: `m9b-api`.
- `查看 Manifest`: `read-only` or `native-boundary`, shown disabled until a dedicated JSON viewer exists.

### Page 4: 预处理任务

User goal: Understand and control the long-running preprocessing production queue without blocking the whole library when one video fails.

Primary information:

- Running jobs.
- Queued jobs.
- Recently completed jobs.
- Failed retryable jobs.
- Queue counts.
- Failure strategy: per-video failure does not block later videos.
- Worker boundary: long-running worker is a service/script, not a browser click.

Controls:

- `处理未处理`: `m9b-api`.
- `重试失败`: `m9b-api`.
- Failed-row retry: `m9b-api`.
- `启动 Worker`: `native-boundary`, disabled with reason.

### Page 5: 索引健康与修复

User goal: Confirm ready videos are included in searchable/indexed data and repair `index-required` assets.

Primary information:

- Current index version.
- Index-required count.
- Ready count in current index.
- Index version history.
- Validation status per index package.

Controls:

- `修复 index-required`: `m9b-api`.
- `校验索引`: `m9b-api`.
- `原子切换 current`: `native-boundary` or hidden manual operation; if shown, disabled with reason.

### Page 6: Doctor

User goal: Diagnose why the library, FFmpeg, ASR, manifests, artifacts, or index are unhealthy.

Primary information:

- Doctor pass/warn/fail summary.
- Check list with labels, messages, tones.
- Generated-at timestamp.
- Library root.

Controls:

- `重新运行 Doctor`: `m9b-api`.
- `导出诊断 JSON`: `m9b-api`.

### Page 7: 设置

User goal: See runtime strategy and configuration status without exposing secrets in the browser.

Primary information:

- FFmpeg/FFprobe availability and source.
- ASR provider/model.
- Audio preprocessing mode: `mp3_16k_mono_64k` and `wav_16k_mono_pcm_s16le`.
- DashScope temporary upload mode.
- Whether DashScope key is configured, redacted.
- Last failure reason.

Local interactions:

- Preview-select audio mode for UI review only.

Controls:

- Audio mode segmented/select control: `local` preview, not saved in M9A.
- `保存运行策略`: `m9b-api`.
- `测试 ASR 配置`: `m9b-api`.
- `编辑 API Key`: `native-boundary`, disabled because secrets live in `.env.local`/deployment environment.

## Tasks

### Task 1: Product Contract And Route Semantics

**Files:**

- Create: `/Users/allen/Documents/mixlab/apps/admin-web/src/features/admin-ui-contract.ts`
- Create: `/Users/allen/Documents/mixlab/apps/admin-web/src/features/admin-ui-contract.test.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/app/navigation.ts`

- [ ] **Step 1: Write the failing contract test**

Create `/Users/allen/Documents/mixlab/apps/admin-web/src/features/admin-ui-contract.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_NAV_ITEMS } from "../app/navigation.ts";
import {
  ADMIN_UI_PAGES,
  ADMIN_UI_ROUTES,
  listAdminControlsByState
} from "./admin-ui-contract.ts";

test("admin UI contract defines exactly seven product pages", () => {
  assert.deepEqual(ADMIN_UI_ROUTES, [
    "dashboard",
    "library-settings",
    "source-videos",
    "preprocess-jobs",
    "index-publish",
    "doctor",
    "settings"
  ]);
  assert.equal(ADMIN_UI_PAGES.dashboard.goal, "看全局风险和产能");
  assert.equal(ADMIN_UI_PAGES["library-settings"].goal, "保证库能初始化和读写");
  assert.equal(ADMIN_UI_PAGES["source-videos"].goal, "管理公共素材资产与元数据");
  assert.equal(ADMIN_UI_PAGES["preprocess-jobs"].goal, "控制生产队列");
  assert.equal(ADMIN_UI_PAGES["index-publish"].label, "索引健康与修复");
  assert.equal(ADMIN_UI_PAGES.doctor.goal, "诊断系统问题");
  assert.equal(ADMIN_UI_PAGES.settings.goal, "配置运行策略");
});

test("navigation uses product-approved page labels", () => {
  assert.deepEqual(
    ADMIN_NAV_ITEMS.map((item) => item.label),
    ["仪表盘", "公共素材库设置", "原视频管理", "预处理任务", "索引健康与修复", "健康诊断", "设置"]
  );
});

test("every visible control is classified before implementation", () => {
  const apiControls = listAdminControlsByState("m9b-api").map((control) => control.label);
  const nativeControls = listAdminControlsByState("native-boundary").map((control) => control.label);
  const localControls = listAdminControlsByState("local").map((control) => control.label);

  assert.ok(apiControls.includes("处理未处理"));
  assert.ok(apiControls.includes("修复 index-required"));
  assert.ok(nativeControls.includes("打开文件夹"));
  assert.ok(nativeControls.includes("编辑 API Key"));
  assert.ok(localControls.includes("搜索原视频"));
  assert.ok(localControls.includes("筛选预处理状态"));
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run:

```bash
node --test --import tsx apps/admin-web/src/features/admin-ui-contract.test.ts
```

Expected: fail because `admin-ui-contract.ts` does not exist and navigation still says `索引发布`.

- [ ] **Step 3: Implement the product contract**

Create `/Users/allen/Documents/mixlab/apps/admin-web/src/features/admin-ui-contract.ts`:

```ts
import type { AdminRoute } from "../app/navigation.ts";

export type AdminControlState = "local" | "m9b-api" | "native-boundary" | "read-only";

export interface AdminControlContract {
  route: AdminRoute;
  label: string;
  state: AdminControlState;
  reason: string;
}

export interface AdminPageContract {
  route: AdminRoute;
  label: string;
  goal: string;
  primaryQuestion: string;
  controls: readonly AdminControlContract[];
}

export const ADMIN_UI_ROUTES = [
  "dashboard",
  "library-settings",
  "source-videos",
  "preprocess-jobs",
  "index-publish",
  "doctor",
  "settings"
] as const satisfies readonly AdminRoute[];

export const ADMIN_UI_PAGES: Record<AdminRoute, AdminPageContract> = {
  dashboard: {
    route: "dashboard",
    label: "仪表盘",
    goal: "看全局风险和产能",
    primaryQuestion: "公共素材库现在是否健康，生产是否在推进？",
    controls: [
      { route: "dashboard", label: "扫描源视频", state: "m9b-api", reason: "M9B 接入扫描接口。" },
      { route: "dashboard", label: "处理未处理", state: "m9b-api", reason: "M9B 接加入队接口。" },
      { route: "dashboard", label: "Doctor", state: "m9b-api", reason: "M9B 接入 Doctor 运行接口。" },
      { route: "dashboard", label: "重试失败", state: "m9b-api", reason: "M9B 接入失败重试接口。" }
    ]
  },
  "library-settings": {
    route: "library-settings",
    label: "公共素材库设置",
    goal: "保证库能初始化和读写",
    primaryQuestion: "公共素材库路径、协议目录和权限是否满足生产要求？",
    controls: [
      { route: "library-settings", label: "初始化素材库", state: "m9b-api", reason: "M9B 接入初始化接口。" },
      { route: "library-settings", label: "扫描源视频", state: "m9b-api", reason: "M9B 接入扫描接口。" },
      { route: "library-settings", label: "打开文件夹", state: "native-boundary", reason: "浏览器不能直接唤起本机 Finder。" },
      { route: "library-settings", label: "导出诊断", state: "m9b-api", reason: "M9B 接入 Doctor JSON 导出。" }
    ]
  },
  "source-videos": {
    route: "source-videos",
    label: "原视频管理",
    goal: "管理公共素材资产与元数据",
    primaryQuestion: "哪些原视频可见、哪些还在生产、公开说明是否完整？",
    controls: [
      { route: "source-videos", label: "搜索原视频", state: "local", reason: "页面内筛选，不写入协议文件。" },
      { route: "source-videos", label: "筛选预处理状态", state: "local", reason: "页面内筛选，不写入协议文件。" },
      { route: "source-videos", label: "查看原视频", state: "local", reason: "页面内选择表格行。" },
      { route: "source-videos", label: "保存公开说明", state: "m9b-api", reason: "M9B 接入 metadata 保存接口。" },
      { route: "source-videos", label: "扫描新增视频", state: "m9b-api", reason: "M9B 接入扫描接口。" },
      { route: "source-videos", label: "处理未处理", state: "m9b-api", reason: "M9B 接加入队接口。" },
      { route: "source-videos", label: "重试失败视频", state: "m9b-api", reason: "M9B 接入失败重试接口。" },
      { route: "source-videos", label: "查看 Manifest", state: "read-only", reason: "M9A 只呈现入口，JSON 查看器另行实现。" }
    ]
  },
  "preprocess-jobs": {
    route: "preprocess-jobs",
    label: "预处理任务",
    goal: "控制生产队列",
    primaryQuestion: "长时间预处理是否持续推进，失败视频是否可隔离重试？",
    controls: [
      { route: "preprocess-jobs", label: "处理未处理", state: "m9b-api", reason: "M9B 接加入队接口。" },
      { route: "preprocess-jobs", label: "重试失败", state: "m9b-api", reason: "M9B 接入失败重试接口。" },
      { route: "preprocess-jobs", label: "启动 Worker", state: "native-boundary", reason: "长期 Worker 由服务端脚本或桌面壳托管。" }
    ]
  },
  "index-publish": {
    route: "index-publish",
    label: "索引健康与修复",
    goal: "保证 ready 视频可搜索",
    primaryQuestion: "ready 视频是否已经进入 current 可搜索索引？",
    controls: [
      { route: "index-publish", label: "修复 index-required", state: "m9b-api", reason: "M9B 接入索引修复接口。" },
      { route: "index-publish", label: "校验索引", state: "m9b-api", reason: "M9B 接入 Doctor/索引校验。" },
      { route: "index-publish", label: "原子切换 current", state: "native-boundary", reason: "手动切换 current 不作为 Web 常规操作暴露。" }
    ]
  },
  doctor: {
    route: "doctor",
    label: "健康诊断",
    goal: "诊断系统问题",
    primaryQuestion: "系统问题出现在哪里，管理员下一步该看什么？",
    controls: [
      { route: "doctor", label: "重新运行 Doctor", state: "m9b-api", reason: "M9B 接入 Doctor 运行接口。" },
      { route: "doctor", label: "导出诊断 JSON", state: "m9b-api", reason: "M9B 接入报告导出。" }
    ]
  },
  settings: {
    route: "settings",
    label: "设置",
    goal: "配置运行策略",
    primaryQuestion: "FFmpeg、ASR、音频模式和密钥配置是否满足运行要求？",
    controls: [
      { route: "settings", label: "选择音频模式", state: "local", reason: "M9A 只预览界面状态，不保存运行策略。" },
      { route: "settings", label: "保存运行策略", state: "m9b-api", reason: "M9B 接入配置保存或环境提示。" },
      { route: "settings", label: "测试 ASR 配置", state: "m9b-api", reason: "M9B 接入 ASR 配置检测。" },
      { route: "settings", label: "编辑 API Key", state: "native-boundary", reason: "密钥只通过 .env.local 或部署环境变量配置。" }
    ]
  }
};

export function listAdminControlsByState(state: AdminControlState): AdminControlContract[] {
  return ADMIN_UI_ROUTES.flatMap((route) =>
    ADMIN_UI_PAGES[route].controls.filter((control) => control.state === state)
  );
}

export function adminPageContract(route: AdminRoute): AdminPageContract {
  return ADMIN_UI_PAGES[route];
}
```

Modify `/Users/allen/Documents/mixlab/apps/admin-web/src/app/navigation.ts`:

```ts
export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { route: "dashboard", label: "仪表盘", icon: "dashboard" },
  { route: "library-settings", label: "公共素材库设置", icon: "archive" },
  { route: "source-videos", label: "原视频管理", icon: "video" },
  { route: "preprocess-jobs", label: "预处理任务", icon: "queue" },
  { route: "index-publish", label: "索引健康与修复", icon: "index" },
  { route: "doctor", label: "健康诊断", icon: "doctor" },
  { route: "settings", label: "设置", icon: "settings" }
];
```

- [ ] **Step 4: Run the contract test and verify it passes**

Run:

```bash
node --test --import tsx apps/admin-web/src/features/admin-ui-contract.test.ts
```

Expected: pass.

### Task 2: Shared Admin UI Primitives

**Files:**

- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/features/shared.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/admin-app.test.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/styles.css`

- [ ] **Step 1: Write failing render tests for shared control states**

Append this test to `/Users/allen/Documents/mixlab/apps/admin-web/src/admin-app.test.ts`:

```ts
import { AdminControlButton, EmptyState, MetricBand } from "./features/shared.tsx";

test("shared admin UI primitives expose control states and empty state language", () => {
  const html = renderToStaticMarkup(
    h("section", null,
      h(MetricBand, {
        items: [
          { label: "Ready", value: 120, caption: "对剪辑师可见" },
          { label: "Failed", value: 2, caption: "失败可重试" }
        ]
      }),
      h(AdminControlButton, {
        label: "处理未处理",
        state: "m9b-api",
        reason: "M9B 接加入队接口。",
        variant: "primary"
      }),
      h(EmptyState, {
        title: "没有匹配的原视频",
        detail: "请调整搜索词或状态筛选。"
      })
    )
  );

  assert.match(html, /data-control-state="m9b-api"/);
  assert.match(html, /处理未处理/);
  assert.match(html, /M9B 接加入队接口/);
  assert.match(html, /没有匹配的原视频/);
  assert.match(html, /对剪辑师可见/);
});
```

- [ ] **Step 2: Run the render test and verify it fails**

Run:

```bash
node --test --import tsx apps/admin-web/src/admin-app.test.ts
```

Expected: fail because `AdminControlButton`, `EmptyState`, and `MetricBand` are not exported.

- [ ] **Step 3: Implement shared primitives**

Add to `/Users/allen/Documents/mixlab/apps/admin-web/src/features/shared.tsx`:

```tsx
import type { AdminControlState } from "./admin-ui-contract.ts";

export function AdminControlButton({
  label,
  state,
  reason,
  variant = "secondary",
  onClick
}: {
  label: string;
  state: AdminControlState;
  reason: string;
  variant?: "primary" | "secondary";
  onClick?: () => void;
}) {
  const disabled = state !== "local" || !onClick;

  return (
    <button
      className={variant === "primary" ? "admin-primary-button" : "admin-secondary-button"}
      type="button"
      data-control-state={state}
      disabled={disabled}
      title={reason}
      onClick={disabled ? undefined : onClick}
    >
      {label}
    </button>
  );
}

export function MetricBand({
  items
}: {
  items: Array<{ label: string; value: string | number; caption: string }>;
}) {
  return (
    <section className="admin-metric-band" aria-label="核心指标">
      {items.map((item) => (
        <article className="admin-metric-tile" key={item.label}>
          <strong>{item.value}</strong>
          <span>{item.label}</span>
          <p>{item.caption}</p>
        </article>
      ))}
    </section>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="admin-empty-state">
      <strong>{title}</strong>
      <p>{detail}</p>
    </section>
  );
}
```

Add styles to `/Users/allen/Documents/mixlab/apps/admin-web/src/styles.css`:

```css
.admin-metric-band {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
  gap: var(--ml-space-3);
}

.admin-metric-tile,
.admin-empty-state {
  border: 1px solid var(--ml-color-separator);
  border-radius: var(--ml-radius-panel);
  padding: var(--ml-space-3);
  background: var(--ml-color-surface);
}

.admin-metric-tile {
  display: grid;
  gap: 3px;
  min-height: 84px;
}

.admin-metric-tile strong {
  font-size: 24px;
  line-height: 1;
}

.admin-metric-tile span,
.admin-empty-state strong {
  font-size: 12px;
  font-weight: 650;
}

.admin-metric-tile p,
.admin-empty-state p {
  color: var(--ml-color-text-secondary);
  font-size: 11px;
  line-height: 1.45;
}

.admin-primary-button:disabled,
.admin-secondary-button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}
```

- [ ] **Step 4: Run the render test and verify it passes**

Run:

```bash
node --test --import tsx apps/admin-web/src/admin-app.test.ts
```

Expected: pass.

### Task 3: Admin App Shell Becomes UI Freeze Shell

**Files:**

- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/app/AdminApp.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/admin-app.test.ts`

- [ ] **Step 1: Write failing test for no mutation orchestration in M9A-UI**

Append to `/Users/allen/Documents/mixlab/apps/admin-web/src/admin-app.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("M9A UI shell does not orchestrate Admin API mutations", () => {
  const source = readFileSync(resolve("apps/admin-web/src/app/AdminApp.tsx"), "utf8");

  assert.equal(source.includes("runAction("), false);
  assert.equal(source.includes("onInitializeLibrary"), false);
  assert.equal(source.includes("updateSourceVideoMetadata"), false);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node --test --import tsx apps/admin-web/src/admin-app.test.ts
```

Expected: fail if previous premature binding remains in `AdminApp.tsx`.

- [ ] **Step 3: Simplify `AdminApp.tsx` to read-only page routing**

Replace the mutation orchestration with this render structure:

```tsx
function renderPage(route: AdminRoute, data: AdminDashboardData) {
  if (route === "library-settings") {
    return <LibrarySettingsPage data={data} />;
  }

  if (route === "source-videos") {
    return <SourceVideosPage data={data} />;
  }

  if (route === "preprocess-jobs") {
    return <PreprocessJobsPage data={data} />;
  }

  if (route === "index-publish") {
    return <IndexPublishPage data={data} />;
  }

  if (route === "doctor") {
    return <DoctorPage data={data} />;
  }

  if (route === "settings") {
    return <SettingsPage data={data} />;
  }

  return <DashboardPage data={data} />;
}
```

Set toolbar actions as classified disabled controls or remove them from the toolbar if page-level actions already provide the visible controls. Preferred M9A shell:

```tsx
<UnifiedToolbar
  title="MixLab V3 - 素材库管理端"
  libraryLabel={data?.status.root_path ?? "/Volumes/PublicLibrary"}
  healthLabel={data?.doctor.summary.fail ? "需处理" : "健康"}
  actions={[]}
/>
```

- [ ] **Step 4: Run the test and verify it passes**

Run:

```bash
node --test --import tsx apps/admin-web/src/admin-app.test.ts
```

Expected: pass.

### Task 4: Page UI Redesign And Local Interactions

**Files:**

- Modify: all seven page files under `/Users/allen/Documents/mixlab/apps/admin-web/src/features/**`
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/admin-app.test.ts`

- [ ] **Step 1: Write failing tests for page-level product language**

Update each existing page test in `/Users/allen/Documents/mixlab/apps/admin-web/src/admin-app.test.ts` so the expected strings include:

```ts
const expectedByPage = {
  dashboard: ["全局风险和产能", "Ready", "Failed", "Index Required", "处理未处理"],
  librarySettings: ["路径与权限", "初始化素材库", "打开文件夹", "data-control-state=\"native-boundary\""],
  sourceVideos: ["公共元数据", "搜索文件名 / 标签 / 相对路径", "保存公开说明", "data-control-state=\"m9b-api\""],
  preprocessJobs: ["生产队列", "失败策略", "启动 Worker", "data-control-state=\"native-boundary\""],
  indexHealth: ["索引健康与修复", "修复 index-required", "current.json", "原子切换 current"],
  doctor: ["诊断系统问题", "重新运行 Doctor", "导出诊断 JSON"],
  settings: ["运行策略", "mp3_16k_mono_64k", "wav_16k_mono_pcm_s16le", "编辑 API Key"]
};
```

Use the concrete assertions already used in the file:

```ts
for (const text of expectedByPage.dashboard) {
  assert.match(html, new RegExp(text.replaceAll(".", "\\.")));
}
```

- [ ] **Step 2: Run render tests and verify they fail**

Run:

```bash
node --test --import tsx apps/admin-web/src/admin-app.test.ts
```

Expected: fail because pages do not yet render all product-approved language and control-state attributes.

- [ ] **Step 3: Implement the seven pages**

Implement the pages according to the Product Contract section above.

Required page-level implementation details:

- `DashboardPage.tsx`
  - Header eyebrow: `全局风险和产能`.
  - Use `MetricBand` for counts.
  - Show risk panel for failed and index-required.
  - Render `AdminControlButton` for `扫描源视频`, `处理未处理`, `Doctor`, and failed retry.
- `LibrarySettingsPage.tsx`
  - Header eyebrow: `路径与权限`.
  - Show grouped form for root paths and library identity.
  - Render `AdminControlButton` states for initialization, scan, open folder, and export diagnostic.
- `SourceVideosPage.tsx`
  - Keep `useState` local query/status/selected state.
  - Header eyebrow: `公共元数据`.
  - Search and status filter must change visible table rows.
  - Inspector fields may be editable preview fields, but `保存公开说明` is disabled as `m9b-api`.
  - Empty search result renders `EmptyState`.
- `PreprocessJobsPage.tsx`
  - Header eyebrow: `生产队列`.
  - Show running, queued, done, failed groups.
  - Inspector includes `失败策略: 单个视频失败不影响后续任务继续处理`.
  - `启动 Worker` is disabled as `native-boundary`.
- `IndexPublishPage.tsx`
  - Title: `索引健康与修复`.
  - Header eyebrow: `保证 ready 视频可搜索`.
  - Show current pointer, ready count, index-required count, version table.
  - `原子切换 current` is disabled as `native-boundary`.
- `DoctorPage.tsx`
  - Header eyebrow: `诊断系统问题`.
  - Show summary pass/warn/fail and checks.
  - Rerun/export buttons are `m9b-api`.
- `SettingsPage.tsx`
  - Header eyebrow: `运行策略`.
  - Show FFmpeg, FFprobe, ASR provider/model, both audio modes, temporary upload mode, redacted key state.
  - Local audio mode selector changes a preview label only.
  - Save/test are `m9b-api`; edit API key is `native-boundary`.

- [ ] **Step 4: Run render tests and verify they pass**

Run:

```bash
node --test --import tsx apps/admin-web/src/admin-app.test.ts
```

Expected: pass.

### Task 5: CSS Polish And Visual Contract

**Files:**

- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/styles.css`
- Modify: `/Users/allen/Documents/mixlab/scripts/visual/check-admin-web-screenshots.ts`

- [ ] **Step 1: Update visual assertions**

Modify `/Users/allen/Documents/mixlab/scripts/visual/check-admin-web-screenshots.ts` route assertions:

```ts
if (route === "dashboard") {
  await requireText(page, "全局风险和产能");
  await requireText(page, "处理未处理");
}

if (route === "library-settings") {
  await requireText(page, "路径与权限");
  await requireText(page, "打开文件夹");
}

if (route === "source-videos") {
  await requireText(page, "公共元数据");
  await requireText(page, "保存公开说明");
}

if (route === "preprocess-jobs") {
  await requireText(page, "生产队列");
  await requireText(page, "启动 Worker");
}

if (route === "index-publish") {
  await requireText(page, "索引健康与修复");
  await requireText(page, "修复 index-required");
}

if (route === "doctor") {
  await requireText(page, "诊断系统问题");
  await requireText(page, "导出诊断 JSON");
}

if (route === "settings") {
  await requireText(page, "运行策略");
  await requireText(page, "DashScope 临时上传");
  await requireText(page, "wav_16k_mono_pcm_s16le");
}
```

- [ ] **Step 2: Add CSS for polished management-console density**

Ensure `/Users/allen/Documents/mixlab/apps/admin-web/src/styles.css` includes:

```css
.admin-content-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: var(--ml-space-5);
  min-height: 0;
  padding: var(--ml-space-5);
}

.admin-action-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ml-space-2);
  align-items: center;
}

.admin-select {
  min-height: 30px;
  border: 1px solid var(--ml-color-separator);
  border-radius: var(--ml-radius-control);
  padding: 0 10px;
  color: var(--ml-color-text);
  background: var(--ml-color-control);
  font-size: 12px;
}

.admin-link-button {
  border: 0;
  padding: 0;
  color: #0758b8;
  background: transparent;
  font-size: 12px;
  font-weight: 650;
  text-align: left;
}

.admin-link-button.is-selected {
  color: var(--ml-color-accent);
}

.admin-edit-form {
  display: grid;
  gap: var(--ml-space-2);
  margin-bottom: var(--ml-space-3);
}

.admin-edit-form input,
.admin-edit-form textarea {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--ml-color-separator);
  border-radius: var(--ml-radius-control);
  padding: 7px 9px;
  outline: 0;
  color: var(--ml-color-text);
  background: rgba(255, 255, 255, 0.84);
  font-size: 12px;
}
```

- [ ] **Step 3: Run visual smoke check**

Run:

```bash
npm run visual:admin-web
```

Expected:

- Script completes.
- Screenshots written to `/Users/allen/Documents/mixlab/docs/acceptance/artifacts/m5-admin-console`.
- No secret-like `sk-` value appears in page content.

### Task 6: Verification And Test Server Handoff

**Files:**

- Modify only if needed:
  - `/Users/allen/Documents/mixlab/package.json`
  - `/Users/allen/Documents/mixlab/apps/admin-web/src/**/*.tsx`
  - `/Users/allen/Documents/mixlab/apps/admin-web/src/**/*.ts`

- [ ] **Step 1: Run targeted tests**

Run:

```bash
node --test --import tsx apps/admin-web/src/features/admin-ui-contract.test.ts apps/admin-web/src/admin-app.test.ts packages/ui-foundation/src/components.test.ts
```

Expected: pass.

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm test
```

Expected: pass.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: pass.

- [ ] **Step 4: Build admin web**

Run:

```bash
npm run build:admin-web
```

Expected: pass.

- [ ] **Step 5: Restart admin web for user review**

Run:

```bash
screen -S mixlab-admin-web -X quit || true
screen -dmS mixlab-admin-web zsh -lc 'cd /Users/allen/Documents/mixlab && npm run dev -w @mixlab/admin-web -- --host 127.0.0.1 --port 5174 --strictPort >/tmp/mixlab-admin-web.log 2>&1'
```

Verify:

```bash
curl -I http://127.0.0.1:5174/
```

Expected: HTTP 200 or Vite dev-server response.

- [ ] **Step 6: Stage only M9A-UI files**

Run:

```bash
git add \
  docs/superpowers/plans/2026-05-02-m9a-admin-ui-freeze.md \
  apps/admin-web/src/features/admin-ui-contract.ts \
  apps/admin-web/src/features/admin-ui-contract.test.ts \
  apps/admin-web/src/app/navigation.ts \
  apps/admin-web/src/app/AdminApp.tsx \
  apps/admin-web/src/features/shared.tsx \
  apps/admin-web/src/features/dashboard/DashboardPage.tsx \
  apps/admin-web/src/features/library-settings/LibrarySettingsPage.tsx \
  apps/admin-web/src/features/source-videos/SourceVideosPage.tsx \
  apps/admin-web/src/features/preprocess-jobs/PreprocessJobsPage.tsx \
  apps/admin-web/src/features/index-publish/IndexPublishPage.tsx \
  apps/admin-web/src/features/doctor/DoctorPage.tsx \
  apps/admin-web/src/features/settings/SettingsPage.tsx \
  apps/admin-web/src/admin-app.test.ts \
  apps/admin-web/src/styles.css \
  scripts/visual/check-admin-web-screenshots.ts
```

Then inspect:

```bash
git diff --cached --stat
git diff --cached --name-only
```

Expected: no `packages/admin-api/**` and no `packages/library-fs/**`.

- [ ] **Step 7: Commit the UI freeze milestone**

Run:

```bash
git commit -m "feat(admin-web): freeze management console UI"
```

Expected: commit succeeds.

## Acceptance Script For User Review

After Task 6, ask the user to test:

1. Open `http://127.0.0.1:5174/#/dashboard`.
2. Check the seven left-nav pages.
3. Confirm page responsibilities:
   - 仪表盘: global production/risk view.
   - 公共素材库设置: path/read-write readiness.
   - 原视频管理: source asset metadata and visibility review.
   - 预处理任务: queue health and failure isolation.
   - 索引健康与修复: ready/searchable index boundary.
   - 健康诊断: Doctor report.
   - 设置: runtime strategy and secret boundary.
4. In 原视频管理, test search, status filter, and row selection.
5. In 设置, test audio mode preview.
6. Confirm API-dependent buttons are visibly disabled with a reason.
7. Confirm there are no controls that look active but do nothing.

## Self-Review

- Spec coverage: The plan covers the user-approved management-console page map and deliberately excludes cutter and backend function binding.
- Placeholder scan: No `TBD`, `TODO`, or undefined future code blocks are used; future work is explicitly classified as `m9b-api` or `native-boundary`.
- Type consistency: `AdminRoute`, `AdminControlState`, `AdminPageContract`, and route names match existing admin navigation types.
- Product risk: The plan isolates current premature functional work and prevents it from being staged into the UI freeze commit.
