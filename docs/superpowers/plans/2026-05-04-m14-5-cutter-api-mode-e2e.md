# M14.5 Cutter API Mode E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make cutter API mode diagnosable and prove the real public-library-to-local-cut reuse path with a repeatable browser smoke.

**Architecture:** Add a protected Cutter API runtime-status endpoint, surface it in cutter-web settings, and add a controlled smoke script that builds a temporary ready library, starts the real Cutter API plus cutter-web, injects an approved cutter session, and validates search -> transcript selection -> real FFmpeg cut -> local reusable material. Keep this milestone diagnostic and integration-focused; do not add new product flows.

**Tech Stack:** TypeScript, Node HTTP server, React, Vite, Playwright, bundled FFmpeg, node:test.

---

### Task 1: Protected Cutter Runtime Status API

**Files:**
- Modify: `/Users/allen/Documents/mixlab/packages/cutter-api/src/index.ts`
- Modify: `/Users/allen/Documents/mixlab/packages/cutter-api/src/index.test.ts`

- [ ] **Step 1: Write failing API tests**

Add tests near the existing cutter auth/source-library tests in `/Users/allen/Documents/mixlab/packages/cutter-api/src/index.test.ts`:

```ts
test("runtime status requires approved cutter session and reports workspace readiness", async () => {
  const libraryRoot = await prepareLibrary();
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-cutter-runtime-"));
  const headers = await createApprovedAuthHeaders(libraryRoot);

  const server = createCutterApiServer({
    library_root: libraryRoot,
    workspace_root: workspaceRoot,
    now: () => "2026-05-04T10:00:00.000Z"
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const anonymous = await fetch(`${baseUrl}/cutter/runtime-status`);
    assert.equal(anonymous.status, 401);

    const response = await fetch(`${baseUrl}/cutter/runtime-status`, { headers });
    assert.equal(response.status, 200);
    const body = await response.json() as any;

    assert.equal(body.data.mode_label, "真实 Cutter API 模式");
    assert.equal(body.data.api_ready, true);
    assert.equal(body.data.available_video_count, 1);
    assert.equal(body.data.workspace_enabled, true);
    assert.equal(body.data.local_clip_count, 0);
    assert.equal(body.data.current_user.username, "剪辑师A");
    assert.match(body.data.workspace_root_label, /mixlab-cutter-runtime-/);
    assert.match(body.data.ffmpeg_status, /可用|不可用/);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test("runtime status remains readable when cutter workspace is not configured", async () => {
  const libraryRoot = await prepareLibrary();
  const headers = await createApprovedAuthHeaders(libraryRoot);

  await withApiServer(libraryRoot, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/cutter/runtime-status`, { headers });
    assert.equal(response.status, 200);
    const body = await response.json() as any;

    assert.equal(body.data.workspace_enabled, false);
    assert.equal(body.data.workspace_root_label, "未启用本地剪切工作区");
    assert.equal(body.data.local_clip_count, 0);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test --import tsx packages/cutter-api/src/index.test.ts
```

Expected: fails because `/cutter/runtime-status` is not implemented.

- [ ] **Step 3: Add runtime status types and helper**

In `/Users/allen/Documents/mixlab/packages/cutter-api/src/index.ts`, add:

```ts
interface CutterRuntimeStatusPayload {
  mode: "api";
  mode_label: string;
  api_ready: boolean;
  generated_at: string;
  library_id: string;
  library_root_label: string;
  available_video_count: number;
  workspace_enabled: boolean;
  workspace_root_label: string;
  local_clip_count: number;
  ffmpeg_status: "可用" | "不可用";
  ffmpeg_source: "内置" | "环境配置" | "未检测到";
  current_user: {
    user_id: string;
    username: string;
    display_name: string;
  };
}
```

Add helpers:

```ts
function pathLabel(filePath: string | undefined, fallback: string): string {
  if (!filePath) {
    return fallback;
  }

  return path.basename(filePath) || filePath;
}

async function runtimeStatusForSession(input: {
  api_input: CreateCutterApiServerInput;
  auth: AuthenticatedCutterSession;
}): Promise<CutterRuntimeStatusPayload> {
  const library = await listCutterSourceLibrary({
    library_root: input.api_input.library_root
  });
  const localClips = input.api_input.workspace_root
    ? await listExportClips({ workspace_root: input.api_input.workspace_root })
    : await listLocalClips({ library_root: input.api_input.library_root });

  let ffmpegStatus: CutterRuntimeStatusPayload["ffmpeg_status"] = "不可用";
  let ffmpegSource: CutterRuntimeStatusPayload["ffmpeg_source"] = "未检测到";
  try {
    const runtime = resolveFfmpegRuntime();
    ffmpegStatus = "可用";
    ffmpegSource = runtime.source === "env" ? "环境配置" : "内置";
  } catch {
    ffmpegStatus = "不可用";
  }

  return {
    mode: "api",
    mode_label: "真实 Cutter API 模式",
    api_ready: true,
    generated_at: input.api_input.now?.() ?? new Date().toISOString(),
    library_id: await readLibraryId(input.api_input.library_root),
    library_root_label: pathLabel(input.api_input.library_root, "公共素材库"),
    available_video_count: library.available_video_count,
    workspace_enabled: Boolean(input.api_input.workspace_root),
    workspace_root_label: pathLabel(input.api_input.workspace_root, "未启用本地剪切工作区"),
    local_clip_count: localClips.local_clip_count,
    ffmpeg_status: ffmpegStatus,
    ffmpeg_source: ffmpegSource,
    current_user: {
      user_id: input.auth.user.user_id,
      username: input.auth.user.username,
      display_name: input.auth.user.display_name
    }
  };
}
```

- [ ] **Step 4: Add the protected route**

Inside `createCutterApiServer()`, before `/cutter/source-library`, add:

```ts
if (url.pathname === "/cutter/runtime-status") {
  const auth = await requireCutterSession({
    api_input: input,
    request,
    response
  });

  if (!auth) {
    return;
  }

  writeJson(response, 200, apiResponse(await runtimeStatusForSession({
    api_input: input,
    auth
  })));
  return;
}
```

- [ ] **Step 5: Re-run focused API tests**

Run:

```bash
node --test --import tsx packages/cutter-api/src/index.test.ts
```

Expected: all package tests pass.

### Task 2: Cutter Web Settings Shows Real API Status

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/api.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/api.test.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/fixture-client.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/features/settings/SettingsPage.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/app/CutterApp.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`

- [ ] **Step 1: Add failing API client test**

In `/Users/allen/Documents/mixlab/apps/cutter-web/src/api.test.ts`, add:

```ts
test("loads cutter runtime status with approved session headers", async () => {
  let observedDevice = "";
  let observedSession = "";
  const client = createCutterApiClient({
    base_url: "http://127.0.0.1:3789",
    auth: {
      device_id: "device-001",
      session_token: "session-001"
    },
    fetch: async (url, init) => {
      assert.equal(String(url), "http://127.0.0.1:3789/cutter/runtime-status");
      const headers = new Headers(init?.headers);
      observedDevice = headers.get("X-MixLab-Device-Id") ?? "";
      observedSession = headers.get("X-MixLab-Session-Token") ?? "";
      return makeJsonResponse({
        schema_version: "1.0",
        data: {
          mode: "api",
          mode_label: "真实 Cutter API 模式",
          api_ready: true,
          generated_at: "2026-05-04T10:00:00.000Z",
          library_id: "lib_main_001",
          library_root_label: "source-library",
          available_video_count: 1,
          workspace_enabled: true,
          workspace_root_label: "cutter-workspace",
          local_clip_count: 1,
          ffmpeg_status: "可用",
          ffmpeg_source: "内置",
          current_user: {
            user_id: "CU000001",
            username: "剪辑师A",
            display_name: "剪辑师A"
          }
        }
      });
    }
  });

  const status = await client.getRuntimeStatus();

  assert.equal(status.mode_label, "真实 Cutter API 模式");
  assert.equal(status.current_user.username, "剪辑师A");
  assert.equal(observedDevice, "device-001");
  assert.equal(observedSession, "session-001");
});
```

- [ ] **Step 2: Run focused client test and verify RED**

Run:

```bash
node --test --import tsx apps/cutter-web/src/api.test.ts
```

Expected: fails because `getRuntimeStatus()` does not exist.

- [ ] **Step 3: Add client type and method**

In `/Users/allen/Documents/mixlab/apps/cutter-web/src/api.ts`, add:

```ts
export interface CutterRuntimeStatus {
  mode: "api" | "fixture";
  mode_label: string;
  api_ready: boolean;
  generated_at: string;
  library_id: string;
  library_root_label: string;
  available_video_count: number;
  workspace_enabled: boolean;
  workspace_root_label: string;
  local_clip_count: number;
  ffmpeg_status: "可用" | "不可用";
  ffmpeg_source: "内置" | "环境配置" | "未检测到";
  current_user: {
    user_id: string;
    username: string;
    display_name: string;
  };
}
```

Add to `CutterApiClient`:

```ts
getRuntimeStatus(): Promise<CutterRuntimeStatus>;
```

Add implementation:

```ts
getRuntimeStatus() {
  return requestEnvelope<CutterRuntimeStatus>(
    fetchImpl,
    appendPath(input.base_url, "/cutter/runtime-status"),
    {
      headers: protectedHeaders
    }
  );
},
```

- [ ] **Step 4: Add fixture runtime status**

In `/Users/allen/Documents/mixlab/apps/cutter-web/src/fixture-client.ts`:

```ts
import type { CutterRuntimeStatus } from "./api.ts";

export interface CutterFixtureData {
  library: SourceLibraryResponse;
  primaryDetail: SourceVideoDetail;
  search: SearchResponse;
  localClips: LocalClipCatalog;
  settings: CutterWorkbenchSettings;
  runtimeStatus: CutterRuntimeStatus;
}
```

Add a fixture:

```ts
const runtimeStatus: CutterRuntimeStatus = {
  mode: "fixture",
  mode_label: "界面演示模式",
  api_ready: true,
  generated_at: "2026-05-04T10:00:00.000Z",
  library_id: "fixture",
  library_root_label: "演示素材库",
  available_video_count: videos.length,
  workspace_enabled: true,
  workspace_root_label: "演示本地工作区",
  local_clip_count: 3,
  ffmpeg_status: "可用",
  ffmpeg_source: "内置",
  current_user: {
    user_id: "fixture",
    username: "演示剪辑师",
    display_name: "演示剪辑师"
  }
};
```

Ensure fixture client exposes:

```ts
getRuntimeStatus: async () => runtimeStatus
```

In `loadCutterWorkbenchData()`, include `client.getRuntimeStatus()` in the initial `Promise.all` and return `runtimeStatus`.

- [ ] **Step 5: Add failing settings render test**

In `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`, update the settings test to render:

```ts
const html = renderToStaticMarkup(
  h(SettingsPage, {
    settings: data.settings,
    runtimeStatus: data.runtimeStatus,
    apiBaseUrl: "http://127.0.0.1:3789"
  })
);
```

Add assertions:

```ts
for (const text of [
  "真实模式联调状态",
  "http://127.0.0.1:3789",
  "界面演示模式",
  "演示剪辑师",
  "演示本地工作区",
  "本地素材数"
]) {
  assert.match(html, new RegExp(text));
}
```

Run:

```bash
node --test --import tsx apps/cutter-web/src/cutter-app.test.ts
```

Expected: fails because SettingsPage does not render runtime status.

- [ ] **Step 6: Render runtime status in SettingsPage**

Update `SettingsPage` props:

```ts
export function SettingsPage({
  settings,
  runtimeStatus,
  apiBaseUrl = ""
}: {
  settings: CutterWorkbenchSettings;
  runtimeStatus?: CutterRuntimeStatus;
  apiBaseUrl?: string;
}) {
```

Add a `GroupedForm` group before existing groups:

```ts
runtimeStatus
  ? {
      title: "真实模式联调状态",
      rows: [
        { label: "运行模式", value: runtimeStatus.mode_label },
        { label: "API 地址", value: apiBaseUrl || "未连接真实 API" },
        { label: "当前剪辑师", value: runtimeStatus.current_user.display_name || runtimeStatus.current_user.username },
        { label: "可用原素材", value: `${runtimeStatus.available_video_count}` },
        { label: "本地工作区", value: runtimeStatus.workspace_enabled ? runtimeStatus.workspace_root_label : "未启用" },
        { label: "本地素材数", value: `${runtimeStatus.local_clip_count}` },
        { label: "FFmpeg", value: `${runtimeStatus.ffmpeg_status} · ${runtimeStatus.ffmpeg_source}` }
      ]
    }
  : {
      title: "真实模式联调状态",
      rows: [
        { label: "运行模式", value: "界面演示模式" },
        { label: "API 地址", value: "未连接真实 API" }
      ]
    }
```

Pass the new props from `CutterApp`:

```tsx
return <SettingsPage settings={data.settings} runtimeStatus={data.runtimeStatus} apiBaseUrl={apiBaseUrl} />;
```

- [ ] **Step 7: Re-run focused cutter web tests**

Run:

```bash
node --test --import tsx apps/cutter-web/src/api.test.ts
node --test --import tsx apps/cutter-web/src/cutter-app.test.ts
```

Expected: both pass.

### Task 3: Real API + Cutter Web Smoke Script

**Files:**
- Create: `/Users/allen/Documents/mixlab/scripts/smoke/cutter-api-web.ts`
- Modify: `/Users/allen/Documents/mixlab/package.json`

- [ ] **Step 1: Add package script first**

In `/Users/allen/Documents/mixlab/package.json`, add:

```json
"smoke:cutter-api-web": "tsx scripts/smoke/cutter-api-web.ts"
```

Run:

```bash
npm run smoke:cutter-api-web
```

Expected: fails because the script file does not exist.

- [ ] **Step 2: Create the smoke script**

Create `/Users/allen/Documents/mixlab/scripts/smoke/cutter-api-web.ts` with these responsibilities:

```ts
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import type { TranscriptSegment } from "../../packages/protocol/src/index.ts";
import {
  approveCutterUser,
  claimNextPreprocessJob,
  completePreprocessArtifacts,
  createCutterLoginApplication,
  publishReadySourceVideo,
  scanSourceVideos
} from "../../packages/library-fs/src/index.ts";
import { createCutterApiServer } from "../../packages/cutter-api/src/index.ts";
import { resolveFfmpegRuntime } from "../../packages/ffmpeg-core/src/index.ts";
import { CUTTER_AUTH_STORAGE_KEY } from "../../apps/cutter-web/src/auth.ts";
```

Implement helpers:

```ts
function segment(input: {
  source_video_id: string;
  index: number;
  begin_ms: number;
  end_ms: number;
  text: string;
  normalized_text: string;
}): TranscriptSegment {
  return {
    segment_id: `${input.source_video_id}-S${String(input.index + 1).padStart(6, "0")}`,
    index: input.index,
    begin_ms: input.begin_ms,
    end_ms: input.end_ms,
    begin_char: 0,
    end_char: input.text.length,
    normalized_begin_char: 0,
    normalized_end_char: input.normalized_text.length,
    text: input.text,
    normalized_text: input.normalized_text,
    confidence: 0.98
  };
}

function runFfmpeg(args: string[]): void {
  const runtime = resolveFfmpegRuntime();
  const result = spawnSync(runtime.ffmpeg_path, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || "FFmpeg command failed");
  }
}
```

Generate source video and artifacts:

```ts
async function createReadySmokeLibrary(libraryRoot: string): Promise<void> {
  const sourcePath = path.join(libraryRoot, "source-videos", "01_现金流.mp4");
  await mkdir(path.dirname(sourcePath), { recursive: true });
  runFfmpeg([
    "-hide_banner",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=1280x720:rate=25:duration=4",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=880:duration=4",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    sourcePath
  ]);

  await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-04T10:00:00.000Z"
  });
  await claimNextPreprocessJob({
    library_root: libraryRoot,
    worker_id: "smoke-worker",
    now: "2026-05-04T10:01:00.000Z"
  });

  const sourceVideoId = "V000001";
  const videoDir = path.join(libraryRoot, ".mixlab-library", "videos", sourceVideoId);
  await mkdir(videoDir, { recursive: true });
  const segments = [
    segment({
      source_video_id: sourceVideoId,
      index: 0,
      begin_ms: 500,
      end_ms: 2200,
      text: "现金流，是企业的血液。",
      normalized_text: "现金流是企业的血液"
    }),
    segment({
      source_video_id: sourceVideoId,
      index: 1,
      begin_ms: 2200,
      end_ms: 3400,
      text: "不是账面数字。",
      normalized_text: "不是账面数字"
    })
  ];
  await writeFile(path.join(videoDir, "transcript.json"), `${JSON.stringify({
    schema_version: "1.0",
    source_video_id: sourceVideoId,
    provider: "smoke",
    model: "manual",
    generated_at: "2026-05-04T10:02:00.000Z",
    duration_ms: 4000,
    full_text: "现金流，是企业的血液。不是账面数字。",
    segments
  }, null, 2)}\n`);
  await writeFile(path.join(videoDir, "subtitles.srt"), "1\n00:00:00,500 --> 00:00:02,200\n现金流，是企业的血液。\n");
  await writeFile(path.join(videoDir, "keyframes.json"), `${JSON.stringify({
    schema_version: "1.0",
    keyframes_ms: [0, 1000, 2000, 3000]
  }, null, 2)}\n`);
  runFfmpeg(["-hide_banner", "-y", "-ss", "00:00:01", "-i", sourcePath, "-frames:v", "1", path.join(videoDir, "cover.jpg")]);

  await completePreprocessArtifacts({
    library_root: libraryRoot,
    source_video_id: sourceVideoId,
    now: "2026-05-04T10:03:00.000Z",
    media: {
      duration_ms: 4000,
      width: 1280,
      height: 720,
      fps: 25,
      codec: "h264",
      content_hash: "sha256:smoke"
    },
    artifacts: {
      transcript_path: ".mixlab-library/videos/V000001/transcript.json",
      srt_path: ".mixlab-library/videos/V000001/subtitles.srt",
      keyframes_path: ".mixlab-library/videos/V000001/keyframes.json",
      cover_path: ".mixlab-library/videos/V000001/cover.jpg"
    }
  });
  await publishReadySourceVideo({
    library_root: libraryRoot,
    source_video_id: sourceVideoId,
    index_version: "v000001",
    now: "2026-05-04T10:04:00.000Z"
  });
}
```

Start services:

```ts
async function waitForText(stream: NodeJS.ReadableStream, pattern: RegExp): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${pattern}`)), 15_000);
    stream.on("data", (chunk) => {
      const text = String(chunk);
      process.stdout.write(text);
      if (pattern.test(text)) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
}

function stop(child: ChildProcess): void {
  if (!child.killed) {
    child.kill("SIGTERM");
  }
}
```

Run browser path:

```ts
async function main(): Promise<void> {
  const libraryRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-smoke-library-"));
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-smoke-workspace-"));
  await createReadySmokeLibrary(libraryRoot);

  const application = await createCutterLoginApplication(libraryRoot, {
    username: "烟测剪辑师",
    device_id: "smoke-device",
    device_name: "烟测剪辑端",
    now: "2026-05-04T10:05:00.000Z"
  });
  const approved = await approveCutterUser(libraryRoot, {
    user_id: application.user_id,
    device_id: "smoke-device",
    now: "2026-05-04T10:06:00.000Z"
  });

  const apiServer = createCutterApiServer({
    library_root: libraryRoot,
    workspace_root: workspaceRoot,
    now: () => new Date().toISOString()
  });
  await new Promise<void>((resolve) => apiServer.listen(3789, "127.0.0.1", resolve));

  const web = spawn("npm", ["run", "dev", "-w", "@mixlab/cutter-web", "--", "--host", "127.0.0.1", "--port", "5185"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      VITE_MIXLAB_CUTTER_API_BASE_URL: "http://127.0.0.1:3789"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  web.stderr?.on("data", (chunk) => process.stderr.write(String(chunk)));
  await waitForText(web.stdout!, /Local:\s+http:\/\/127\.0\.0\.1:5185\//);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1365, height: 1100 } });
    await page.goto("http://127.0.0.1:5185/", { waitUntil: "domcontentloaded" });
    await page.evaluate(([key, value]) => {
      window.localStorage.setItem(key, value);
    }, [
      CUTTER_AUTH_STORAGE_KEY,
      JSON.stringify({
        user_id: approved.session.user_id,
        username: approved.user.username,
        device_id: approved.session.device_id,
        session_token: approved.session.session_token
      })
    ]);

    await page.goto("http://127.0.0.1:5185/#settings", { waitUntil: "networkidle" });
    await page.getByText("真实模式联调状态").waitFor({ state: "visible", timeout: 10_000 });
    await page.getByText("真实 Cutter API 模式").waitFor({ state: "visible", timeout: 10_000 });
    await page.getByText("烟测剪辑师").waitFor({ state: "visible", timeout: 10_000 });

    await page.goto("http://127.0.0.1:5185/#material-locator?query=%E7%8E%B0%E9%87%91%E6%B5%81", { waitUntil: "networkidle" });
    await page.getByText("素材定位").waitFor({ state: "visible", timeout: 10_000 });
    await page.locator("[data-segment-id='V000001-S000001']").first().click();
    await page.getByText("已选中一段文案").waitFor({ state: "visible", timeout: 10_000 });
    await page.getByRole("button", { name: "剪切这段" }).click();
    await page.getByText("剪切完成 · 本地素材已更新 1").waitFor({ state: "visible", timeout: 30_000 });

    await page.goto("http://127.0.0.1:5185/#local-library", { waitUntil: "networkidle" });
    await page.getByText("1 个本地可复剪素材").waitFor({ state: "visible", timeout: 10_000 });

    await page.goto("http://127.0.0.1:5185/#material-locator?query=%E7%8E%B0%E9%87%91%E6%B5%81", { waitUntil: "networkidle" });
    const sectionTitles = await page.locator(".cutter-locator-section header h2").evaluateAll((nodes) =>
      nodes.map((node) => node.textContent?.trim())
    );
    if (sectionTitles[0] !== "本地素材" || sectionTitles[1] !== "公共原素材") {
      throw new Error(`素材分组顺序不正确：${sectionTitles.join(" / ")}`);
    }
  } finally {
    await browser.close();
    stop(web);
    await new Promise<void>((resolve, reject) => {
      apiServer.close((error) => error ? reject(error) : resolve());
    });
  }

  console.log(JSON.stringify({
    status: "passed",
    library_root: libraryRoot,
    workspace_root: workspaceRoot
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 3: Run the smoke script**

Run:

```bash
npm run smoke:cutter-api-web
```

Expected: passes and prints `{ "status": "passed", ... }`.

If port `3789` or `5185` is occupied, change the script to allocate free ports dynamically before proceeding.

### Task 4: Verification

**Files:** read-only unless verification exposes a bug.

- [ ] **Step 1:** Run `node --test --import tsx packages/cutter-api/src/index.test.ts`.
- [ ] **Step 2:** Run `node --test --import tsx apps/cutter-web/src/api.test.ts`.
- [ ] **Step 3:** Run `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts`.
- [ ] **Step 4:** Run `npm run typecheck`.
- [ ] **Step 5:** Run `npm test`.
- [ ] **Step 6:** Run `npm run build:cutter-web`.
- [ ] **Step 7:** Run `npm run smoke:cutter-api-web`.
- [ ] **Step 8:** Run `git diff --check`.
- [ ] **Step 9:** Commit with `feat: complete M14.5 cutter api e2e`.
