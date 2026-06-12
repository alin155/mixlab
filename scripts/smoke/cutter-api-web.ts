import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import type { Server } from "node:http";
import type { TranscriptSegment } from "../../packages/protocol/src/index.ts";
import {
  approveCutterUser,
  claimNextPreprocessJob,
  completePreprocessArtifacts,
  createCutterLoginApplication,
  publishIndexRequiredSourceVideos,
  scanSourceVideos
} from "../../packages/library-fs/src/index.ts";
import { createCutterApiServer } from "../../packages/cutter-api/src/index.ts";
import { resolveFfmpegRuntime } from "../../packages/ffmpeg-core/src/index.ts";
import { CUTTER_AUTH_STORAGE_KEY } from "../../apps/cutter-web/src/auth.ts";

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

async function freePort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  return port;
}

async function fileOrDirExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function workspaceRelativePath(root: string, relativePath: unknown): string {
  if (typeof relativePath !== "string" || relativePath.trim() === "") {
    throw new Error(`需要工作区相对路径，实际为：${String(relativePath)}`);
  }

  const normalized = relativePath.replace(/\\/g, "/");
  if (
    path.isAbsolute(normalized) ||
    path.win32.isAbsolute(normalized) ||
    normalized.split("/").includes("..")
  ) {
    throw new Error(`接口返回了非工作区相对路径：${relativePath}`);
  }

  return path.join(root, normalized);
}

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
    "-movflags",
    "faststart",
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

  await writeFile(
    path.join(videoDir, "transcript.json"),
    `${JSON.stringify(
      {
        schema_version: "1.0",
        source_video_id: sourceVideoId,
        provider: "smoke",
        model: "manual",
        generated_at: "2026-05-04T10:02:00.000Z",
        duration_ms: 4000,
        full_text: "现金流，是企业的血液。不是账面数字。",
        segments
      },
      null,
      2
    )}\n`
  );
  await writeFile(
    path.join(videoDir, "subtitles.srt"),
    "1\n00:00:00,500 --> 00:00:02,200\n现金流，是企业的血液。\n"
  );
  await writeFile(
    path.join(videoDir, "keyframes.json"),
    `${JSON.stringify({ schema_version: "1.0", keyframes_ms: [0, 1000, 2000, 3000] }, null, 2)}\n`
  );
  runFfmpeg([
    "-hide_banner",
    "-y",
    "-ss",
    "00:00:01",
    "-i",
    sourcePath,
    "-frames:v",
    "1",
    path.join(videoDir, "cover.jpg")
  ]);

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
  await publishIndexRequiredSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    source_video_ids: [sourceVideoId],
    now: "2026-05-04T10:04:00.000Z"
  });
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function waitForViteReady(child: ChildProcess, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`等待剪辑端前端启动超时：${port}`)), 20_000);
    const onData = (chunk: Buffer) => {
      const text = String(chunk);
      process.stdout.write(text);
      if (text.includes(`http://127.0.0.1:${port}/`)) {
        clearTimeout(timeout);
        resolve();
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", (chunk) => process.stderr.write(String(chunk)));
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`剪辑端前端提前退出：${code ?? "unknown"}`));
    });
  });
}

async function waitForSearchdReady(child: ChildProcess, baseUrl: string): Promise<void> {
  const startedAt = Date.now();
  const timeoutMs = 60_000;
  let lastError = "";

  child.stdout?.on("data", (chunk) => process.stdout.write(String(chunk)));
  child.stderr?.on("data", (chunk) => process.stderr.write(String(chunk)));

  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`searchd 提前退出：${child.exitCode}`);
    }

    try {
      const response = await fetch(`${baseUrl}/health`, {
        headers: { Accept: "application/json" }
      });
      if (response.ok) {
        const body = await response.json() as any;
        if (body.data?.index_version && body.data?.source_video_count >= 1) {
          return;
        }
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`等待 searchd 启动超时：${lastError}`);
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.killed) {
    return;
  }

  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 2500);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function assertSearchdBackedCutterApi(input: {
  api_base_url: string;
  auth_headers: Record<string, string>;
}): Promise<void> {
  const runtimeStatus = await (await fetch(`${input.api_base_url}/cutter/runtime-status`, {
    headers: input.auth_headers
  })).json() as any;
  if (runtimeStatus.data?.search_backend?.mode !== "searchd") {
    throw new Error(`烟测需要 searchd 搜索后端，实际为：${runtimeStatus.data?.search_backend?.mode ?? "unknown"}`);
  }

  const apiSearch = await (await fetch(
    `${input.api_base_url}/cutter/source-search?query=${encodeURIComponent("现金流")}&limit=10`,
    { headers: input.auth_headers }
  )).json() as any;
  if (apiSearch.data?.search_mode !== "searchd") {
    throw new Error(`烟测搜索未走 searchd：${apiSearch.data?.search_mode ?? "unknown"}`);
  }
  const firstHitSegment = apiSearch.data?.groups?.[0]?.hit_segments?.[0];
  assert.equal(firstHitSegment?.text, "现金流，是企业的血液。");
  assert.deepEqual(firstHitSegment?.match_ranges, [[0, 3]]);
  assert.equal(firstHitSegment?.match_type, "exact");

  const apiDetail = await (await fetch(`${input.api_base_url}/cutter/source-videos/V000001`, {
    headers: input.auth_headers
  })).json() as any;
  if (apiDetail.data?.transcript?.provider !== "sqlite-index") {
    throw new Error(`烟测完整文案未走 searchd index：${apiDetail.data?.transcript?.provider ?? "unknown"}`);
  }

  const mediaResponse = await fetch(`${input.api_base_url}/cutter/source-videos/V000001/media`, {
    headers: {
      ...input.auth_headers,
      Range: "bytes=0-15"
    }
  });
  assert.equal(mediaResponse.status, 206);
  assert.equal(mediaResponse.headers.get("accept-ranges"), "bytes");
  assert.ok((await mediaResponse.arrayBuffer()).byteLength > 0);
}

async function main(): Promise<void> {
  const libraryRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-smoke-library-"));
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-smoke-workspace-"));
  const searchdCacheRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-smoke-searchd-cache-"));
  await createReadySmokeLibrary(libraryRoot);

  const application = await createCutterLoginApplication(libraryRoot, {
    username: "烟测剪辑师",
    device_id: "smoke-device",
    device_name: "烟测剪辑端",
    now: "2026-05-04T10:05:00.000Z"
  });
  const approved = await approveCutterUser(libraryRoot, {
    user_id: application.user_id,
    now: "2026-05-04T10:06:00.000Z"
  });

  const searchdPort = await freePort();
  const searchdBaseUrl = `http://127.0.0.1:${searchdPort}`;
  const searchd = spawn(
    "cargo",
    [
      "run",
      "--quiet",
      "--manifest-path",
      "packages/searchd/Cargo.toml",
      "--",
      "--library-root",
      libraryRoot,
      "--cache-root",
      searchdCacheRoot,
      "--host",
      "127.0.0.1",
      "--port",
      String(searchdPort)
    ],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  let apiServer: Server | undefined;
  let web: ChildProcess | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let pageText = "";
  let pageUrl = "";
  const browserMessages: string[] = [];
  let apiBaseUrl = "";
  let webBaseUrl = "";

  try {
    await waitForSearchdReady(searchd, searchdBaseUrl);

    apiServer = createCutterApiServer({
      library_root: libraryRoot,
      workspace_root: workspaceRoot,
      searchd_base_url: searchdBaseUrl,
      searchd_timeout_ms: 3000,
      now: () => new Date().toISOString()
    });
    await new Promise<void>((resolve) => apiServer!.listen(0, "127.0.0.1", resolve));
    const apiPort = (apiServer.address() as AddressInfo).port;
    apiBaseUrl = `http://127.0.0.1:${apiPort}`;
    const authHeaders = {
      "x-mixlab-device-id": approved.session.device_id,
      "x-mixlab-session-token": approved.session.session_token
    };
    await assertSearchdBackedCutterApi({
      api_base_url: apiBaseUrl,
      auth_headers: authHeaders
    });

    const webPort = await freePort();
    const viteBin = path.join(process.cwd(), "node_modules", ".bin", "vite");
    web = spawn(
      viteBin,
      [
        "--host",
        "127.0.0.1",
        "--port",
        String(webPort),
        "--strictPort"
      ],
      {
        cwd: path.join(process.cwd(), "apps", "cutter-web"),
        env: {
          ...process.env,
          VITE_MIXLAB_CUTTER_API_BASE_URL: apiBaseUrl
        },
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    await waitForViteReady(web, webPort);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1365, height: 1100 } });
    page.on("console", (message) => browserMessages.push(`${message.type()}: ${message.text()}`));
    page.on("pageerror", (error) => browserMessages.push(`pageerror: ${error.message}`));
    webBaseUrl = `http://127.0.0.1:${webPort}`;
    await page.addInitScript(
      ([key, value]) => {
        window.localStorage.setItem(key, value);
      },
      [
        CUTTER_AUTH_STORAGE_KEY,
        JSON.stringify({
          user_id: approved.session.user_id,
          username: approved.user.username,
          device_id: approved.session.device_id,
          session_token: approved.session.session_token
        })
      ]
    );

    await page.goto(`${webBaseUrl}/#settings`, { waitUntil: "networkidle" });
    await page.getByText("真实模式联调状态").waitFor({ state: "visible", timeout: 10_000 });
    await page.getByText("真实 Cutter API 模式").waitFor({ state: "visible", timeout: 10_000 });
    await page.getByText("烟测剪辑师").first().waitFor({ state: "visible", timeout: 10_000 });

    await page.goto(`${webBaseUrl}/#material-locator?query=${encodeURIComponent("现金流")}`, {
      waitUntil: "networkidle"
    });
    await page.getByText("本地 searchd").waitFor({ state: "visible", timeout: 10_000 });
    const firstHitSegment = page.locator("[data-segment-id='V000001-S000001']").first();
    await firstHitSegment.waitFor({ state: "visible", timeout: 10_000 });
    const keywordHit = firstHitSegment.locator("mark[data-testid='transcript-hit']").first();
    await keywordHit.waitFor({ state: "visible", timeout: 10_000 });
    assert.equal(await keywordHit.innerText(), "现金流");
    await keywordHit.click();
    await page.locator(".cutter-locator-selected-copy p").getByText("现金流", { exact: true }).waitFor({
      state: "visible",
      timeout: 10_000
    });
    await page.getByRole("button", { name: /导出片段/ }).click();
    await page.getByText("剪切完成 · 本地素材已更新 1").waitFor({ state: "visible", timeout: 30_000 });

    const jobsAfterCut = await (await fetch(`${apiBaseUrl}/cutter/cut-jobs`, {
      headers: authHeaders
    })).json() as any;
    assert.equal(jobsAfterCut.data?.job_count, 1);
    assert.equal(jobsAfterCut.data?.jobs?.[0]?.status, "done");
    assert.equal(jobsAfterCut.data?.jobs?.[0]?.selected_text, "现金流");
    assert.equal(jobsAfterCut.data?.jobs?.[0]?.begin_ms, 500);
    assert.equal(jobsAfterCut.data?.jobs?.[0]?.end_ms, 964);
    assert.equal(
      await fileOrDirExists(workspaceRelativePath(workspaceRoot, jobsAfterCut.data?.jobs?.[0]?.output_file)),
      true
    );

    const localClipsAfterCut = await (await fetch(`${apiBaseUrl}/cutter/local-clips`, {
      headers: authHeaders
    })).json() as any;
    assert.equal(localClipsAfterCut.data?.local_clip_count, 1);
    assert.equal(localClipsAfterCut.data?.clips?.[0]?.selected_text, "现金流");
    assert.equal(localClipsAfterCut.data?.clips?.[0]?.begin_ms, 500);
    assert.equal(localClipsAfterCut.data?.clips?.[0]?.end_ms, 964);
    assert.deepEqual(
      localClipsAfterCut.data?.clips?.[0]?.transcript_segments?.map((segment: any) => [
        segment.begin_ms,
        segment.end_ms,
        segment.text
      ]),
      [[0, 464, "现金流"]]
    );
    assert.equal(
      await fileOrDirExists(path.join(workspaceRoot, "export-clips", "E000001", "export-clip.json")),
      true
    );
    assert.equal(
      await fileOrDirExists(workspaceRelativePath(workspaceRoot, localClipsAfterCut.data?.clips?.[0]?.output_file)),
      true
    );
    assert.equal(
      await fileOrDirExists(
        workspaceRelativePath(workspaceRoot, localClipsAfterCut.data?.clips?.[0]?.project_output_file)
      ),
      true
    );
    assert.equal(
      await fileOrDirExists(path.join(workspaceRoot, ".mixlab-library", "videos", "E000001", "source.mp4")),
      true
    );
    assert.equal(
      await fileOrDirExists(path.join(workspaceRoot, ".mixlab-library", "videos", "E000001", "source-video.json")),
      true
    );
    assert.equal(
      await fileOrDirExists(path.join(workspaceRoot, ".mixlab-library", "videos", "E000001", "transcript.json")),
      true
    );
    assert.equal(
      await fileOrDirExists(path.join(libraryRoot, ".mixlab-library", "local-clips")),
      false
    );
    assert.equal(
      await fileOrDirExists(path.join(libraryRoot, ".mixlab-library", "videos", "E000001")),
      false
    );
    assert.equal(
      await fileOrDirExists(path.join(libraryRoot, "export-clips", "E000001")),
      false
    );
    assert.equal(
      await fileOrDirExists(path.join(libraryRoot, "projects")),
      false
    );

    await page.goto(`${webBaseUrl}/#local-library`, { waitUntil: "networkidle" });
    await page.getByText("现金流", { exact: true }).first().waitFor({ state: "visible", timeout: 10_000 });

    await page.goto(`${webBaseUrl}/#material-locator?query=${encodeURIComponent("现金流")}`, {
      waitUntil: "networkidle"
    });
    const sectionTitles = await page.locator(".cutter-locator-section header h2").evaluateAll((nodes) =>
      nodes.map((node) => node.textContent?.trim())
    );
    if (!sectionTitles[0]?.includes("本地素材") || !sectionTitles[1]?.includes("公共原素材")) {
      throw new Error(`素材分组顺序不正确：${sectionTitles.join(" / ")}`);
    }
  } catch (error) {
    const pages = browser?.contexts().flatMap((context) => context.pages()) ?? [];
    const currentPage = pages[0];
    if (currentPage) {
      pageUrl = currentPage.url();
      pageText = await currentPage.locator("body").innerText().catch(() => "");
    }
    console.error(JSON.stringify({
      smoke_error_context: {
        page_url: pageUrl,
        page_text: pageText.slice(0, 1200),
        browser_messages: browserMessages.slice(-20)
      }
    }, null, 2));
    throw error;
  } finally {
    await browser?.close();
    if (web) {
      await stopChild(web);
    }
    if (apiServer) {
      await closeServer(apiServer);
    }
    await stopChild(searchd);
  }

  console.log(JSON.stringify({
    status: "passed",
    library_root: libraryRoot,
    workspace_root: workspaceRoot,
    searchd_base_url: searchdBaseUrl
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
