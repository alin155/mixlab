import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createServer, type Server } from "node:http";
import type { TranscriptSegment } from "../../protocol/src/index.ts";
import {
  approveCutterUser,
  claimNextPreprocessJob,
  completePreprocessArtifacts,
  createCutterLoginApplication,
  listCutterUsers,
  publishIndexRequiredSourceVideos,
  publishReadySourceVideo,
  readUsageMetrics,
  scanSourceVideos
} from "../../library-fs/src/index.ts";
import {
  createCutterApiServer,
  cutterApiInfrastructureErrorPayload,
  type CreateCutterApiServerInput,
  parseIostatDiskIoBytesPerSecond,
  resolveCutterApiRuntimeConfigFromEnv
} from "./index.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "mixlab-cutter-api-"));
}

test("cutter API runtime config defaults the local workspace to the user Movies folder", () => {
  const config = resolveCutterApiRuntimeConfigFromEnv({
    MIXLAB_CUTTER_LIBRARY_ROOT: "/Volumes/PublicLibrary"
  });

  assert.equal(config.library_root, "/Volumes/PublicLibrary");
  assert.equal(config.workspace_root, path.join(os.homedir(), "Movies", "MixLabLocal"));
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 3789);
});

test("cutter API runtime config still honors an explicit local workspace path", () => {
  const config = resolveCutterApiRuntimeConfigFromEnv({
    MIXLAB_CUTTER_LIBRARY_ROOT: "/Volumes/PublicLibrary",
    MIXLAB_CUTTER_WORKSPACE_ROOT: "/Volumes/FastDisk/MixLabLocal"
  });

  assert.equal(config.workspace_root, "/Volumes/FastDisk/MixLabLocal");
});

test("cutter API runtime config can enable local searchd", () => {
  const config = resolveCutterApiRuntimeConfigFromEnv({
    MIXLAB_CUTTER_LIBRARY_ROOT: "/Volumes/PublicLibrary",
    MIXLAB_SEARCHD_BASE_URL: " http://127.0.0.1:3799 "
  });

  assert.equal(config.searchd_base_url, "http://127.0.0.1:3799");
});

test("cutter API runtime config can enable local trusted auth for web rehearsals", () => {
  const config = resolveCutterApiRuntimeConfigFromEnv({
    MIXLAB_CUTTER_LIBRARY_ROOT: "/Volumes/PublicLibrary",
    MIXLAB_CUTTER_AUTH_MODE: " local_trusted ",
    MIXLAB_CUTTER_TRUSTED_USER_ID: " CU-LOCAL-001 ",
    MIXLAB_CUTTER_TRUSTED_USERNAME: " 本机剪辑师 "
  });

  assert.equal(config.auth_mode, "local_trusted");
  assert.equal(config.trusted_user_id, "CU-LOCAL-001");
  assert.equal(config.trusted_username, "本机剪辑师");
});

test("cutter API runtime config rejects unknown auth modes", () => {
  assert.throws(
    () => resolveCutterApiRuntimeConfigFromEnv({
      MIXLAB_CUTTER_LIBRARY_ROOT: "/Volumes/PublicLibrary",
      MIXLAB_CUTTER_AUTH_MODE: "open"
    }),
    /MIXLAB_CUTTER_AUTH_MODE must be reviewed or local_trusted/
  );
});

test("cutter API maps disk full errors to an actionable storage response", () => {
  const diskFullError = Object.assign(new Error("write failed"), { code: "ENOSPC" });
  const payload = cutterApiInfrastructureErrorPayload(Object.assign(new Error("queue failed"), {
    cause: diskFullError
  }));

  assert.equal(payload?.statusCode, 507);
  assert.equal(payload?.code, "insufficient_storage");
  assert.match(payload?.message ?? "", /本机磁盘空间不足/);
});

test("default Cutter cut runner avoids synchronous child processes so API requests stay responsive", async () => {
  const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");

  assert.doesNotMatch(source, /\bspawnSync\b/);
});

test("parses local iostat disk throughput from the newest sample", () => {
  const bytesPerSecond = parseIostatDiskIoBytesPerSecond(`
              disk0               disk6
    KB/t  tps  MB/s     KB/t  tps  MB/s
   25.35  129  3.19   133.29    4  0.55
   16.80   10  0.16     0.00    0  0.00
  `);

  assert.equal(bytesPerSecond, Math.round(0.16 * 1024 * 1024));
});

test("runtime status uses cached disk IO sampling so page entry stays responsive", async () => {
  const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");

  assert.match(source, /cachedLocalDiskIoBytesPerSecond\(\)/);
  assert.doesNotMatch(source, /await localDiskIoBytesPerSecond\(\)/);
});

async function writeDummyVideo(filePath: string, bytes = "dummy-video-bytes"): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, bytes);
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
    confidence: 0.96
  };
}

async function writeArtifacts(input: {
  library_root: string;
  source_video_id: string;
  full_text: string;
  segments: TranscriptSegment[];
}): Promise<void> {
  const videoDir = path.join(
    input.library_root,
    ".mixlab-library",
    "videos",
    input.source_video_id
  );

  await mkdir(videoDir, { recursive: true });
  await writeFile(
    path.join(videoDir, "transcript.json"),
    `${JSON.stringify(
      {
        schema_version: "1.0",
        source_video_id: input.source_video_id,
        provider: "dashscope",
        model: "paraformer-v2",
        generated_at: "2026-05-02T00:00:00Z",
        duration_ms: 12_000,
        full_text: input.full_text,
        segments: input.segments
      },
      null,
      2
    )}\n`
  );
  await writeFile(path.join(videoDir, "subtitles.srt"), "1\n00:00:01,000 --> 00:00:03,600\n现金流\n");
  await writeFile(
    path.join(videoDir, "keyframes.json"),
    `${JSON.stringify({ schema_version: "1.0", keyframes_ms: [0, 5000, 10000] }, null, 2)}\n`
  );
  await writeFile(path.join(videoDir, "cover.jpg"), "cover-bytes");
}

async function completeReady(input: {
  library_root: string;
  source_video_id: string;
}): Promise<void> {
  await completePreprocessArtifacts({
    library_root: input.library_root,
    source_video_id: input.source_video_id,
    now: "2026-05-02T00:10:00Z",
    media: {
      duration_ms: 12_000,
      width: 1920,
      height: 1080,
      fps: 29.97,
      codec: "h264",
      content_hash: `sha256:${input.source_video_id}`
    },
    artifacts: {
      transcript_path: `.mixlab-library/videos/${input.source_video_id}/transcript.json`,
      srt_path: `.mixlab-library/videos/${input.source_video_id}/subtitles.srt`,
      keyframes_path: `.mixlab-library/videos/${input.source_video_id}/keyframes.json`,
      cover_path: `.mixlab-library/videos/${input.source_video_id}/cover.jpg`
    }
  });
  await publishReadySourceVideo({
    library_root: input.library_root,
    source_video_id: input.source_video_id,
    index_version: "v000001",
    now: "2026-05-02T00:15:00Z"
  });
}

async function prepareLibrary(): Promise<string> {
  const libraryRoot = await makeLibraryRoot();

  await writeDummyVideo(path.join(libraryRoot, "source-videos", "01_现金流.mp4"));
  await writeDummyVideo(path.join(libraryRoot, "source-videos", "02_组织增长.mov"));
  await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-02T00:00:00Z"
  });

  await claimNextPreprocessJob({
    library_root: libraryRoot,
    worker_id: "worker-a",
    now: "2026-05-02T00:01:00Z"
  });
  await writeArtifacts({
    library_root: libraryRoot,
    source_video_id: "V000001",
    full_text: "现金流，是企业的血液。不是账面数字。",
    segments: [
      segment({
        source_video_id: "V000001",
        index: 0,
        begin_ms: 1000,
        end_ms: 3600,
        text: "现金流，是企业的血液。",
        normalized_text: "现金流是企业的血液"
      })
    ]
  });
  await completeReady({
    library_root: libraryRoot,
    source_video_id: "V000001"
  });

  await claimNextPreprocessJob({
    library_root: libraryRoot,
    worker_id: "worker-a",
    now: "2026-05-02T00:20:00Z"
  });
  await writeArtifacts({
    library_root: libraryRoot,
    source_video_id: "V000002",
    full_text: "组织效率决定增长。",
    segments: [
      segment({
        source_video_id: "V000002",
        index: 0,
        begin_ms: 1000,
        end_ms: 3600,
        text: "组织效率决定增长。",
        normalized_text: "组织效率决定增长"
      })
    ]
  });
  await completePreprocessArtifacts({
    library_root: libraryRoot,
    source_video_id: "V000002",
    now: "2026-05-02T00:25:00Z",
    media: {
      duration_ms: 12_000,
      width: 1920,
      height: 1080,
      fps: 29.97,
      codec: "h264",
      content_hash: "sha256:V000002"
    },
    artifacts: {
      transcript_path: ".mixlab-library/videos/V000002/transcript.json",
      srt_path: ".mixlab-library/videos/V000002/subtitles.srt",
      keyframes_path: ".mixlab-library/videos/V000002/keyframes.json",
      cover_path: ".mixlab-library/videos/V000002/cover.jpg"
    }
  });

  return libraryRoot;
}

async function withApiServer<T>(
  libraryRoot: string,
  fn: (baseUrl: string) => Promise<T>,
  input?: Partial<Omit<CreateCutterApiServerInput, "library_root">>
): Promise<T> {
  const server = createCutterApiServer({ library_root: libraryRoot, ...input });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address() as AddressInfo;
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      (server as Server).close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

async function withSearchdServer<T>(
  handler: (url: URL) => { status?: number; body: unknown },
  fn: (baseUrl: string, requests: string[]) => Promise<T>
): Promise<T> {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    requests.push(url.toString());
    const result = handler(url);
    response.writeHead(result.status ?? 200, {
      "Content-Type": "application/json; charset=utf-8"
    });
    response.end(`${JSON.stringify(result.body)}\n`);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address() as AddressInfo;
    return await fn(`http://127.0.0.1:${address.port}`, requests);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

async function waitForUsageMetrics(
  libraryRoot: string,
  predicate: (metrics: Awaited<ReturnType<typeof readUsageMetrics>>) => boolean
): Promise<Awaited<ReturnType<typeof readUsageMetrics>>> {
  const deadline = Date.now() + 1000;
  let latest = await readUsageMetrics(libraryRoot);

  while (Date.now() < deadline) {
    latest = await readUsageMetrics(libraryRoot);
    if (predicate(latest)) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  return latest;
}

async function createApprovedAuthHeaders(libraryRoot: string): Promise<Record<string, string>> {
  const application = await createCutterLoginApplication(libraryRoot, {
    username: "cutter-user",
    device_id: "test-device",
    device_name: "Test Device",
    now: "2026-05-02T09:00:00Z"
  });
  const approved = await approveCutterUser(libraryRoot, {
    user_id: application.user_id,
    now: "2026-05-02T09:01:00Z"
  });

  return {
    "X-MixLab-Device-Id": approved.session.device_id,
    "X-MixLab-Session-Token": approved.session.session_token
  };
}

async function writeMalformedUsageEvents(libraryRoot: string): Promise<void> {
  const usageDir = path.join(libraryRoot, ".mixlab-library", "usage-events");
  await mkdir(usageDir, { recursive: true });
  await writeFile(path.join(usageDir, "events.ndjson"), "{not-json}\n", "utf8");
}

test("cutter auth request-login creates a pending application without auth headers", async () => {
  const libraryRoot = await prepareLibrary();

  await withApiServer(libraryRoot, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/cutter/auth/request-login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: "lisi",
        device_id: "device-login",
        device_name: "剪辑工作站"
      })
    });

    assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.equal(body.schema_version, "1.0");
    assert.equal(body.data.user.username, "lisi");
    assert.equal(body.data.user.status, "pending");
    assert.equal(body.data.user.devices[0].device_id, "device-login");
    assert.equal(body.data.session, undefined);
  });
});

test("cutter auth request-login records IP and browser as audit data only", async () => {
  const libraryRoot = await prepareLibrary();

  await withApiServer(libraryRoot, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/cutter/auth/request-login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "MixLabTestBrowser/1.0",
        "X-Forwarded-For": "192.168.31.10, 10.0.0.1"
      },
      body: JSON.stringify({
        username: "lisi",
        device_id: "device-login",
        device_name: "Mac 剪辑端 · Safari"
      })
    });

    assert.equal(response.status, 200);
    const users = await listCutterUsers(libraryRoot);
    const device = users.users[0]?.devices[0] as any;
    assert.equal(users.users[0]?.username, "lisi");
    assert.equal(device.device_id, "device-login");
    assert.equal(device.last_ip_address, "192.168.31.10");
    assert.equal(device.user_agent, "MixLabTestBrowser/1.0");

    const protectedResponse = await fetch(`${baseUrl}/cutter/source-library`, {
      headers: {
        "X-MixLab-Device-Id": "device-login",
        "X-MixLab-Session-Token": "not-approved-yet"
      }
    });
    assert.equal(protectedResponse.status, 401);
  });
});

test("cutter auth request-login returns approved device session after admin approval", async () => {
  const libraryRoot = await prepareLibrary();
  const application = await createCutterLoginApplication(libraryRoot, {
    username: "lisi",
    device_id: "device-login",
    device_name: "剪辑工作站",
    now: "2026-05-02T09:00:00Z"
  });
  const approved = await approveCutterUser(libraryRoot, {
    user_id: application.user_id,
    now: "2026-05-02T09:01:00Z"
  });

  await withApiServer(libraryRoot, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/cutter/auth/request-login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: "lisi",
        device_id: "device-login",
        device_name: "剪辑工作站"
      })
    });

    assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.equal(body.data.user.status, "approved");
    assert.equal(body.data.session.user_id, application.user_id);
    assert.equal(body.data.session.device_id, "device-login");
    assert.equal(body.data.session.session_token, approved.session.session_token);
  });
});

test("cutter auth request-login does not grant approved username to unreviewed device", async () => {
  const libraryRoot = await prepareLibrary();
  const application = await createCutterLoginApplication(libraryRoot, {
    username: "lisi",
    device_id: "approved-device",
    device_name: "剪辑工作站",
    now: "2026-05-02T09:00:00Z"
  });
  await approveCutterUser(libraryRoot, {
    user_id: application.user_id,
    now: "2026-05-02T09:01:00Z"
  });

  await withApiServer(libraryRoot, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/cutter/auth/request-login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: "lisi",
        device_id: "unreviewed-device",
        device_name: "新设备"
      })
    });

    assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.equal(body.data.user.status, "pending");
    assert.equal(body.data.user.devices[0].device_id, "unreviewed-device");
    assert.equal(body.data.session, undefined);
  });
});

test("cutter auth approval does not grant sessions to sibling pending devices", async () => {
  const libraryRoot = await prepareLibrary();
  const first = await createCutterLoginApplication(libraryRoot, {
    username: "wangwu",
    device_id: "first-device",
    device_name: "第一台设备",
    now: "2026-05-02T09:00:00Z"
  });
  const second = await createCutterLoginApplication(libraryRoot, {
    username: "wangwu",
    device_id: "second-device",
    device_name: "第二台设备",
    now: "2026-05-02T09:00:30Z"
  });
  assert.notEqual(second.user_id, first.user_id);
  await approveCutterUser(libraryRoot, {
    user_id: first.user_id,
    now: "2026-05-02T09:01:00Z"
  });

  await withApiServer(libraryRoot, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/cutter/auth/request-login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: "wangwu",
        device_id: "second-device",
        device_name: "第二台设备"
      })
    });

    assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.equal(body.data.user.user_id, second.user_id);
    assert.equal(body.data.user.status, "pending");
    assert.equal(body.data.session, undefined);
  });
});

test("cutter auth status requires and validates approved session headers", async () => {
  const libraryRoot = await prepareLibrary();
  const headers = await createApprovedAuthHeaders(libraryRoot);

  await withApiServer(libraryRoot, async (baseUrl) => {
    const missing = await fetch(`${baseUrl}/cutter/auth/status`);
    assert.equal(missing.status, 401);
    assert.deepEqual(await missing.json(), {
      error: {
        code: "login_required",
        message: "请先登录剪辑工作台"
      }
    });

    const invalid = await fetch(`${baseUrl}/cutter/auth/status`, {
      headers: {
        ...headers,
        "X-MixLab-Session-Token": "bad-token"
      }
    });
    assert.equal(invalid.status, 401);
    assert.deepEqual(await invalid.json(), {
      error: {
        code: "login_required",
        message: "登录凭证无效"
      }
    });

    const response = await fetch(`${baseUrl}/cutter/auth/status`, {
      headers
    });
    assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.equal(body.data.ok, true);
    assert.equal(body.data.user.username, "cutter-user");
    assert.equal(body.data.user.status, "approved");
  });
});

test("cutter source library requires approved session headers", async () => {
  const libraryRoot = await prepareLibrary();

  await withApiServer(libraryRoot, async (baseUrl) => {
    const mode = await fetch(`${baseUrl}/cutter/auth/mode`);
    assert.equal(mode.status, 200);
    assert.deepEqual(await mode.json(), {
      schema_version: "1.0",
      data: {
        auth_mode: "reviewed",
        local_trusted: false,
        trusted_username: ""
      }
    });

    const response = await fetch(`${baseUrl}/cutter/source-library`);

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: {
        code: "login_required",
        message: "请先登录剪辑工作台"
      }
    });
  });
});

test("desktop local trusted auth exposes cutter endpoints without review headers", async () => {
  const libraryRoot = await prepareLibrary();

  await withApiServer(libraryRoot, async (baseUrl) => {
    const mode = await fetch(`${baseUrl}/cutter/auth/mode`);
    assert.equal(mode.status, 200);
    assert.deepEqual(await mode.json(), {
      schema_version: "1.0",
      data: {
        auth_mode: "local_trusted",
        local_trusted: true,
        trusted_username: "Allen"
      }
    });

    const status = await fetch(`${baseUrl}/cutter/auth/status`);
    assert.equal(status.status, 200);
    const statusBody = await status.json() as any;
    assert.equal(statusBody.data.ok, true);
    assert.equal(statusBody.data.user.username, "Allen");
    assert.equal(statusBody.data.user.status, "approved");

    const catalog = await fetch(`${baseUrl}/cutter/source-library`);
    assert.equal(catalog.status, 200);
    const catalogBody = await catalog.json() as any;
    assert.equal(catalogBody.data.available_video_count, 1);

    const login = await fetch(`${baseUrl}/cutter/auth/request-login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: "ignored-in-local-trusted-mode",
        device_id: "desktop-device",
        device_name: "Windows 桌面端"
      })
    });
    assert.equal(login.status, 200);
    const loginBody = await login.json() as any;
    assert.equal(loginBody.data.user.status, "approved");
    assert.equal(loginBody.data.session.device_id, "desktop-device");
  }, { auth_mode: "local_trusted" });
});

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
    assert.equal(body.data.current_user.username, "cutter-user");
    assert.equal(body.data.search_backend.mode, "transcript-artifact-fallback");
    assert.equal(body.data.search_backend.degraded, true);
    assert.equal(body.data.library_root_path, libraryRoot);
    assert.match(body.data.workspace_root_label, /mixlab-cutter-runtime-/);
    assert.match(body.data.workspace_root_path, /mixlab-cutter-runtime-/);
    assert.match(body.data.ffmpeg_status, /可用|不可用/);
    assert.equal(typeof body.data.local_runtime.cpu_usage_percent, "number");
    assert.ok(body.data.local_runtime.cpu_usage_percent >= 0);
    assert.ok(body.data.local_runtime.cpu_usage_percent <= 100);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

test("runtime status reports local searchd health when configured", async () => {
  const libraryRoot = await prepareLibrary();
  const headers = await createApprovedAuthHeaders(libraryRoot);

  await withSearchdServer(
    () => ({
      body: {
        schema_version: "1.0",
        data: {
          ok: true,
          library_root: libraryRoot,
          cache_root: "/tmp/mixlab-searchd",
          index_version: "tantivy-v000001",
          source_video_count: 42,
          segment_count: 2048
        }
      }
    }),
    async (searchdBaseUrl, searchdRequests) => {
      await withApiServer(libraryRoot, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/cutter/runtime-status`, { headers });
        assert.equal(response.status, 200);
        const body = await response.json() as any;

        assert.equal(body.data.search_backend.mode, "searchd");
        assert.equal(body.data.search_backend.preferred_mode, "searchd");
        assert.equal(body.data.search_backend.degraded, false);
        assert.equal(body.data.search_backend.index_version, "tantivy-v000001");
        assert.equal(body.data.search_backend.source_video_count, 42);
        assert.equal(body.data.search_backend.segment_count, 2048);
        assert.equal(typeof body.data.search_backend.response_ms, "number");
      }, {
        searchd_base_url: searchdBaseUrl
      });

      assert.equal(searchdRequests.length, 1);
      assert.equal(new URL(searchdRequests[0]!).pathname, "/health");
    }
  );
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
    assert.equal(body.data.workspace_root_path, "");
    assert.equal(body.data.local_clip_count, 0);
  });
});

test("cut job catalog remains readable when cutter workspace is not configured", async () => {
  const libraryRoot = await prepareLibrary();
  const headers = await createApprovedAuthHeaders(libraryRoot);

  await withApiServer(libraryRoot, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/cutter/cut-jobs`, { headers });
    assert.equal(response.status, 200);
    const body = await response.json() as any;

    assert.equal(body.data.job_count, 0);
    assert.deepEqual(body.data.jobs, []);
  });
});

test("malformed usage events do not break authenticated source search", async () => {
  const libraryRoot = await prepareLibrary();
  const headers = await createApprovedAuthHeaders(libraryRoot);
  await writeMalformedUsageEvents(libraryRoot);

  await withApiServer(libraryRoot, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/cutter/source-search?query=${encodeURIComponent("现金流")}`, {
      headers
    });

    assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.equal(body.data.groups[0].source_video_id, "V000001");
    await assert.rejects(() => readUsageMetrics(libraryRoot), /使用事件存储文件格式错误/);
  });
});

test("malformed usage events do not break authenticated local clip creation", async () => {
  const libraryRoot = await prepareLibrary();
  const headers = await createApprovedAuthHeaders(libraryRoot);
  await writeMalformedUsageEvents(libraryRoot);
  const cutOutputs: Array<{ output_path: string; begin_ms: number; end_ms: number }> = [];

  const server = createCutterApiServer({
    library_root: libraryRoot,
    now: () => "2026-05-02T10:00:00Z",
    cut_runner: async (input) => {
      cutOutputs.push({
        output_path: input.output_path,
        begin_ms: input.begin_ms,
        end_ms: input.end_ms
      });
      await mkdir(path.dirname(input.output_path), { recursive: true });
      await writeFile(input.output_path, "local-clip-bytes");
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${baseUrl}/cutter/local-clips`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        source_video_id: "V000001",
        start_segment_id: "V000001-S000001",
        end_segment_id: "V000001-S000001",
        pre_roll_ms: 250,
        post_roll_ms: 400,
        cut_mode: "copy"
      })
    });

    assert.equal(response.status, 201);
    const body = await response.json() as any;
    assert.equal(body.data.local_clip_id, "LC000001");
    assert.equal(cutOutputs.length, 1);
    await assert.rejects(() => readUsageMetrics(libraryRoot), /使用事件存储文件格式错误/);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

test("serves cutter source library, detail, and search JSON with API media URLs", async () => {
  const libraryRoot = await prepareLibrary();
  const headers = await createApprovedAuthHeaders(libraryRoot);
  const manifestPath = path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as any;
  await writeFile(
    manifestPath,
    `${JSON.stringify({
      ...manifest,
      description: "剪辑端卡片说明",
      tags: ["现金流", "财务"],
      lecturer: "李老师",
      course: "经营课",
      category: "财务"
    }, null, 2)}\n`,
    "utf8"
  );

  await withApiServer(libraryRoot, async (baseUrl) => {
    const catalogResponse = await fetch(`${baseUrl}/cutter/source-library`, {
      headers
    });
    assert.equal(catalogResponse.status, 200);
    assert.equal(catalogResponse.headers.get("access-control-allow-origin"), "*");
    assert.match(
      catalogResponse.headers.get("access-control-allow-headers") ?? "",
      /X-MixLab-Device-Id/
    );
    assert.match(
      catalogResponse.headers.get("access-control-allow-headers") ?? "",
      /X-MixLab-Session-Token/
    );

    const catalog = await catalogResponse.json() as any;
    assert.equal(catalog.schema_version, "1.0");
    assert.equal(catalog.data.library_id, "lib_main_001");
    assert.equal(catalog.data.available_video_count, 1);
    assert.equal(catalog.data.videos[0].source_video_id, "V000001");
    assert.equal(catalog.data.videos[0].detail_url, "/cutter/source-videos/V000001");
    assert.equal(catalog.data.videos[0].media_url, "/cutter/source-videos/V000001/media");
    assert.equal(catalog.data.videos[0].cover_url, "/cutter/source-videos/V000001/cover");
    assert.equal(catalog.data.videos[0].description, "剪辑端卡片说明");
    assert.deepEqual(catalog.data.videos[0].tags, ["现金流", "财务"]);
    assert.equal(catalog.data.videos[0].lecturer, "李老师");
    assert.equal(catalog.data.videos[0].course, "经营课");
    assert.equal(catalog.data.videos[0].category, "财务");

    const detailResponse = await fetch(`${baseUrl}${catalog.data.videos[0].detail_url}`, {
      headers
    });
    assert.equal(detailResponse.status, 200);
    const detail = await detailResponse.json() as any;
    assert.equal(detail.data.source_video_id, "V000001");
    assert.equal(detail.data.description, "剪辑端卡片说明");
    assert.deepEqual(detail.data.tags, ["现金流", "财务"]);
    assert.equal(detail.data.lecturer, "李老师");
    assert.equal(detail.data.course, "经营课");
    assert.equal(detail.data.category, "财务");
    assert.equal(detail.data.transcript.full_text, "现金流，是企业的血液。不是账面数字。");
    assert.deepEqual(detail.data.keyframes.keyframes_ms, [0, 5000, 10000]);

    const hiddenDetail = await fetch(`${baseUrl}/cutter/source-videos/V000002`, {
      headers
    });
    assert.equal(hiddenDetail.status, 404);

    const searchResponse = await fetch(`${baseUrl}/cutter/source-search?query=${encodeURIComponent("现金流")}&limit=10`, {
      headers
    });
    assert.equal(searchResponse.status, 200);
    const search = await searchResponse.json() as any;
    assert.deepEqual(
      search.data.groups.map((group: any) => group.source_video_id),
      ["V000001"]
    );
    assert.equal(search.data.search_mode, "transcript-artifact-fallback");
    assert.equal(search.data.index_version, "");
    assert.equal(search.data.returned_count, 1);
    assert.equal(search.data.has_more, false);
    assert.equal(search.data.search_ms >= 0, true);
    assert.equal(search.data.groups[0].cover_url, "/cutter/source-videos/V000001/cover");
    assert.equal(search.data.groups[0].transcript_character_count, 18);

    const hiddenSearch = await fetch(`${baseUrl}/cutter/source-search?query=${encodeURIComponent("组织效率")}`, {
      headers
    });
    assert.deepEqual(((await hiddenSearch.json()) as any).data.groups, []);

    const invalidCursor = await fetch(`${baseUrl}/cutter/source-search?query=${encodeURIComponent("现金流")}&cursor=not-a-cursor`, {
      headers
    });
    assert.equal(invalidCursor.status, 400);
    assert.equal(((await invalidCursor.json()) as any).error.code, "invalid_search_cursor");

    const metrics = await readUsageMetrics(libraryRoot);
    assert.equal(metrics.search_request_count, 2);
    assert.equal(metrics.search_hit_count, 1);
    assert.equal(metrics.search_empty_count, 1);
    assert.equal(metrics.fallback_search_count, 2);
    assert.equal(metrics.search_backend_unknown_count, 0);
    assert.equal(metrics.source_detail_view_count, 1);
    assert.deepEqual(metrics.recent_keywords, ["组织效率", "现金流"]);
    assert.equal(metrics.users[0].user_id, "CU000001");
    assert.equal(metrics.users[0].username, "cutter-user");
  });
});

test("source search prefers local searchd when configured", async () => {
  const libraryRoot = await prepareLibrary();
  const headers = await createApprovedAuthHeaders(libraryRoot);

  await withSearchdServer(
    (url) => ({
      body: {
        schema_version: "1.0",
        data: {
          query: url.searchParams.get("query"),
          normalized_query: "现金流",
          cursor: "",
          next_cursor: "searchd:10",
          has_more: true,
          returned_count: 1,
          limit: Number.parseInt(url.searchParams.get("limit") ?? "0", 10),
          index_version: "tantivy-v000001",
          search_ms: 4,
          groups: [
            {
              source_video_id: "V000001",
              title: "C0015",
              duration_ms: 12_000,
              hit_count: 1,
              best_excerpt: "现金流，是企业的血液。",
              transcript_character_count: 18,
              hit_segments: [
                {
                  segment_id: "V000001-S000001",
                  begin_ms: 0,
                  end_ms: 5000,
                  text: "现金流，是企业的血液。",
                  match_ranges: [[0, 3]],
                  match_id: "V000001-M000001",
                  match_type: "exact"
                }
              ]
            }
          ]
        }
      }
    }),
    async (searchdBaseUrl, searchdRequests) => {
      await withApiServer(libraryRoot, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/cutter/source-search?query=${encodeURIComponent("现金流")}&limit=10`, {
          headers
        });
        assert.equal(response.status, 200);
        const search = await response.json() as any;

        assert.equal(search.data.search_mode, "searchd");
        assert.equal(search.data.index_version, "tantivy-v000001");
        assert.equal(search.data.next_cursor, "searchd:10");
        assert.equal(search.data.groups[0].source_video_id, "V000001");
        assert.equal(search.data.groups[0].cover_url, "/cutter/source-videos/V000001/cover");
        const metrics = await waitForUsageMetrics(
          libraryRoot,
          (current) => current.search_request_count === 1
        );
        assert.equal(metrics.search_latency_p50_ms, 4);
        assert.equal(metrics.search_latency_p95_ms, 4);
        assert.equal(metrics.search_latency_max_ms, 4);
        assert.equal(metrics.searchd_search_count, 1);
        assert.equal(metrics.sqlite_index_search_count, 0);
        assert.equal(metrics.fallback_search_count, 0);
        assert.equal(metrics.search_backend_unknown_count, 0);
      }, {
        searchd_base_url: searchdBaseUrl
      });

      assert.equal(searchdRequests.length, 1);
      const requestUrl = new URL(searchdRequests[0]!);
      assert.equal(requestUrl.pathname, "/source-search");
      assert.equal(requestUrl.searchParams.get("query"), "现金流");
      assert.equal(requestUrl.searchParams.get("limit"), "10");
    }
  );
});

test("source search falls back to sqlite path when searchd first page is unavailable", async () => {
  const libraryRoot = await prepareLibrary();
  const headers = await createApprovedAuthHeaders(libraryRoot);

  await withSearchdServer(
    () => ({
      status: 503,
      body: {
        error: {
          code: "searchd_unavailable",
          message: "restarting"
        }
      }
    }),
    async (searchdBaseUrl, searchdRequests) => {
      await withApiServer(libraryRoot, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/cutter/source-search?query=${encodeURIComponent("现金流")}&limit=10`, {
          headers
        });
        assert.equal(response.status, 200);
        const search = await response.json() as any;

        assert.equal(search.data.search_mode, "transcript-artifact-fallback");
        assert.equal(search.data.groups[0].source_video_id, "V000001");
      }, {
        searchd_base_url: searchdBaseUrl
      });

      assert.equal(searchdRequests.length, 1);
    }
  );
});

test("source search keeps cursor continuation on searchd backend", async () => {
  const libraryRoot = await prepareLibrary();
  const headers = await createApprovedAuthHeaders(libraryRoot);

  await withSearchdServer(
    () => ({
      status: 503,
      body: {
        error: {
          code: "searchd_unavailable",
          message: "restarting"
        }
      }
    }),
    async (searchdBaseUrl, searchdRequests) => {
      await withApiServer(libraryRoot, async (baseUrl) => {
        const response = await fetch(
          `${baseUrl}/cutter/source-search?query=${encodeURIComponent("现金流")}&limit=10&cursor=${encodeURIComponent("searchd:10")}`,
          { headers }
        );
        assert.equal(response.status, 502);
        const body = await response.json() as any;
        assert.equal(body.error.code, "searchd_unavailable");
      }, {
        searchd_base_url: searchdBaseUrl
      });

      assert.equal(searchdRequests.length, 1);
      assert.equal(new URL(searchdRequests[0]!).searchParams.get("cursor"), "searchd:10");
      const metrics = await waitForUsageMetrics(
        libraryRoot,
        (current) => current.search_failure_count === 1
      );
      assert.equal(metrics.search_request_count, 0);
      assert.equal(metrics.search_hit_count, 0);
      assert.equal(metrics.search_empty_count, 0);
      assert.equal(metrics.search_failure_count, 1);
      assert.equal(metrics.searchd_search_count, 0);
      assert.equal(metrics.users[0]?.search_request_count, 0);
    }
  );
});

test("source search keeps sqlite cursor continuation off searchd backend", async () => {
  const libraryRoot = await prepareLibrary();
  const headers = await createApprovedAuthHeaders(libraryRoot);
  await writeArtifacts({
    library_root: libraryRoot,
    source_video_id: "V000002",
    full_text: "现金流也会影响组织效率。",
    segments: [
      segment({
        source_video_id: "V000002",
        index: 0,
        begin_ms: 1000,
        end_ms: 3600,
        text: "现金流也会影响组织效率。",
        normalized_text: "现金流也会影响组织效率"
      })
    ]
  });
  await publishIndexRequiredSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    now: "2026-05-02T00:35:00Z"
  });

  await withSearchdServer(
    () => ({
      body: {
        schema_version: "1.0",
        data: {
          query: "现金流",
          normalized_query: "现金流",
          cursor: "sqlite:1",
          next_cursor: "",
          has_more: false,
          returned_count: 1,
          limit: 1,
          index_version: "tantivy-v000001",
          search_ms: 1,
          groups: []
        }
      }
    }),
    async (searchdBaseUrl, searchdRequests) => {
      await withApiServer(libraryRoot, async (baseUrl) => {
        const response = await fetch(
          `${baseUrl}/cutter/source-search?query=${encodeURIComponent("现金流")}&limit=1&cursor=${encodeURIComponent("sqlite:1")}`,
          { headers }
        );
        const body = await response.json() as any;
        assert.equal(response.status, 200, JSON.stringify(body));
        assert.equal(body.data.search_mode, "sqlite-index");
        assert.equal(body.data.cursor, "sqlite:1");
        assert.deepEqual(body.data.groups.map((group: any) => group.source_video_id), ["V000002"]);
      }, {
        searchd_base_url: searchdBaseUrl
      });

      assert.equal(searchdRequests.length, 0);
      const metrics = await waitForUsageMetrics(
        libraryRoot,
        (current) => current.active_user_count === 1
      );
      assert.equal(metrics.search_request_count, 0);
      assert.equal(metrics.search_hit_count, 0);
      assert.equal(metrics.sqlite_index_search_count, 0);
      assert.equal(metrics.active_user_count, 1);
      assert.equal(metrics.users[0]?.search_request_count, 0);
    }
  );
});

test("source detail prefers local searchd transcript when artifact transcript is unavailable", async () => {
  const libraryRoot = await prepareLibrary();
  const headers = await createApprovedAuthHeaders(libraryRoot);

  await rm(path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "transcript.json"));

  await withSearchdServer(
    (url) => {
      if (url.pathname !== "/source-videos/V000001/detail") {
        return {
          status: 404,
          body: {
            error: {
              code: "source_video_not_found",
              message: "not found"
            }
          }
        };
      }

      return {
        body: {
          schema_version: "1.0",
          data: {
            source_video_id: "V000001",
            title: "C0015",
            duration_ms: 12_000,
            relative_path: "01_现金流.mp4",
            cover_path: ".mixlab-library/videos/V000001/cover.jpg",
            transcript_character_count: 18,
            transcript: {
              schema_version: "1.0",
              source_video_id: "V000001",
              provider: "sqlite-index",
              model: "source-transcript-index",
              generated_at: "",
              duration_ms: 12_000,
              full_text: "现金流，是企业的血液。不是账面数字。",
              segments: [
                {
                  segment_id: "V000001-S000001",
                  index: 0,
                  begin_ms: 1000,
                  end_ms: 3600,
                  begin_char: 0,
                  end_char: 11,
                  normalized_begin_char: 0,
                  normalized_end_char: 9,
                  text: "现金流，是企业的血液。",
                  normalized_text: "现金流是企业的血液",
                  confidence: 1
                },
                {
                  segment_id: "V000001-S000002",
                  index: 1,
                  begin_ms: 3600,
                  end_ms: 6200,
                  begin_char: 11,
                  end_char: 18,
                  normalized_begin_char: 9,
                  normalized_end_char: 15,
                  text: "不是账面数字。",
                  normalized_text: "不是账面数字",
                  confidence: 1
                }
              ]
            }
          }
        }
      };
    },
    async (searchdBaseUrl, searchdRequests) => {
      await withApiServer(libraryRoot, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/cutter/source-videos/V000001`, {
          headers
        });
        assert.equal(response.status, 200);
        const detail = await response.json() as any;

        assert.equal(detail.data.transcript.provider, "sqlite-index");
        assert.equal(detail.data.transcript.full_text, "现金流，是企业的血液。不是账面数字。");
        assert.deepEqual(
          detail.data.transcript.segments.map((segment: any) => segment.segment_id),
          ["V000001-S000001", "V000001-S000002"]
        );
        assert.deepEqual(detail.data.keyframes.keyframes_ms, []);
        assert.equal(
          detail.data.source_video_file_path.endsWith(path.join("source-videos", "01_现金流.mp4")),
          true
        );
        assert.equal(detail.data.media_url, "/cutter/source-videos/V000001/media");
      }, {
        searchd_base_url: searchdBaseUrl
      });

      assert.equal(searchdRequests.length, 1);
      assert.equal(new URL(searchdRequests[0]!).pathname, "/source-videos/V000001/detail");
    }
  );
});

test("workspace local clip creation reuses recently loaded source detail", async () => {
  const libraryRoot = await prepareLibrary();
  const headers = await createApprovedAuthHeaders(libraryRoot);
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-cutter-api-detail-cache-"));
  const detailBody = {
    schema_version: "1.0",
    data: {
      source_video_id: "V000001",
      title: "C0015",
      duration_ms: 12_000,
      relative_path: "01_现金流.mp4",
      cover_path: ".mixlab-library/videos/V000001/cover.jpg",
      transcript_character_count: 18,
      transcript: {
        schema_version: "1.0",
        source_video_id: "V000001",
        provider: "sqlite-index",
        model: "source-transcript-index",
        generated_at: "",
        duration_ms: 12_000,
        full_text: "现金流，是企业的血液。不是账面数字。",
        segments: [
          {
            segment_id: "V000001-S000001",
            index: 0,
            begin_ms: 1000,
            end_ms: 3600,
            begin_char: 0,
            end_char: 11,
            normalized_begin_char: 0,
            normalized_end_char: 9,
            text: "现金流，是企业的血液。",
            normalized_text: "现金流是企业的血液",
            confidence: 1
          },
          {
            segment_id: "V000001-S000002",
            index: 1,
            begin_ms: 3600,
            end_ms: 6200,
            begin_char: 11,
            end_char: 18,
            normalized_begin_char: 9,
            normalized_end_char: 15,
            text: "不是账面数字。",
            normalized_text: "不是账面数字",
            confidence: 1
          }
        ]
      }
    }
  };

  await withSearchdServer(
    (url) => {
      if (url.pathname !== "/source-videos/V000001/detail") {
        return {
          status: 404,
          body: {
            error: {
              code: "source_video_not_found",
              message: "not found"
            }
          }
        };
      }

      return { body: detailBody };
    },
    async (searchdBaseUrl, searchdRequests) => {
      await withApiServer(libraryRoot, async (baseUrl) => {
        const detail = await fetch(`${baseUrl}/cutter/source-videos/V000001`, { headers });
        assert.equal(detail.status, 200);

        const create = await fetch(`${baseUrl}/cutter/local-clips`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            source_video_id: "V000001",
            start_segment_id: "V000001-S000001",
            end_segment_id: "V000001-S000001",
            begin_ms: 1200,
            end_ms: 1800,
            selected_text: "现金流",
            cut_mode: "copy"
          })
        });
        assert.equal(create.status, 201);
        const created = await create.json() as any;
        assert.equal(created.data.local_clip_id, "E000001");
      }, {
        workspace_root: workspaceRoot,
        searchd_base_url: searchdBaseUrl,
        cut_runner: async (input) => {
          await mkdir(path.dirname(input.output_path), { recursive: true });
          await writeFile(input.output_path, "cached-detail-cut");
        }
      });

      assert.equal(
        searchdRequests.filter((requestUrl) => new URL(requestUrl).pathname === "/source-videos/V000001/detail").length,
        1
      );
    }
  );
});

test("streams cover, subtitles, and source media with range support", async () => {
  const libraryRoot = await prepareLibrary();
  const pngCoverBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64"
  );
  const manifestPath = path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  await writeFile(path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "cover.png"), pngCoverBytes);
  await writeFile(
    manifestPath,
    `${JSON.stringify({
      ...manifest,
      cover_path: ".mixlab-library/videos/V000001/cover.png"
    }, null, 2)}\n`
  );

  await withApiServer(libraryRoot, async (baseUrl) => {
    const coverResponse = await fetch(`${baseUrl}/cutter/source-videos/V000001/cover`);
    assert.equal(coverResponse.status, 200);
    assert.equal(coverResponse.headers.get("content-type"), "image/png");
    assert.equal(Buffer.compare(Buffer.from(await coverResponse.arrayBuffer()), pngCoverBytes), 0);

    const srtResponse = await fetch(`${baseUrl}/cutter/source-videos/V000001/subtitles.srt`);
    assert.equal(srtResponse.status, 200);
    assert.equal(srtResponse.headers.get("content-type"), "text/plain; charset=utf-8");
    assert.match(await srtResponse.text(), /现金流/);

    const rangeResponse = await fetch(`${baseUrl}/cutter/source-videos/V000001/media`, {
      headers: {
        Range: "bytes=0-4"
      }
    });
    assert.equal(rangeResponse.status, 206);
    assert.equal(rangeResponse.headers.get("accept-ranges"), "bytes");
    assert.equal(rangeResponse.headers.get("content-range"), "bytes 0-4/17");
    assert.equal(await rangeResponse.text(), "dummy");
  });
});

test("returns structured JSON errors for missing routes and invalid source ids", async () => {
  const libraryRoot = await prepareLibrary();

  await withApiServer(libraryRoot, async (baseUrl) => {
    const notFound = await fetch(`${baseUrl}/missing`);
    assert.equal(notFound.status, 404);
    assert.deepEqual(await notFound.json(), {
      error: {
        code: "not_found",
        message: "Route not found"
      }
    });

    const invalid = await fetch(`${baseUrl}/cutter/source-videos/not-safe/media`);
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), {
      error: {
        code: "invalid_source_video_id",
        message: "source_video_id must use V000001 format"
      }
    });
  });
});

test("creates, lists, reads, and streams local clips", async () => {
  const libraryRoot = await prepareLibrary();
  const headers = await createApprovedAuthHeaders(libraryRoot);
  const cutOutputs: Array<{ output_path: string; begin_ms: number; end_ms: number }> = [];

  const server = createCutterApiServer({
    library_root: libraryRoot,
    now: () => "2026-05-02T10:00:00Z",
    cut_runner: async (input) => {
      cutOutputs.push({
        output_path: input.output_path,
        begin_ms: input.begin_ms,
        end_ms: input.end_ms
      });
      await mkdir(path.dirname(input.output_path), { recursive: true });
      await writeFile(input.output_path, "local-clip-bytes");
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const createResponse = await fetch(`${baseUrl}/cutter/local-clips`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        source_video_id: "V000001",
        start_segment_id: "V000001-S000001",
        end_segment_id: "V000001-S000001",
        pre_roll_ms: 250,
        post_roll_ms: 400,
        cut_mode: "copy"
      })
    });

    assert.equal(createResponse.status, 201);
    const created = await createResponse.json() as any;
    assert.equal(created.data.local_clip_id, "LC000001");
    assert.equal(created.data.source_video_id, "V000001");
    assert.equal(created.data.begin_ms, 750);
    assert.equal(created.data.end_ms, 4000);
    assert.equal(created.data.media_url, "/cutter/local-clips/LC000001/media");
    assert.equal(cutOutputs.length, 1);
    assert.equal(path.basename(cutOutputs[0]?.output_path ?? ""), "clip.mp4");

    const list = await (await fetch(`${baseUrl}/cutter/local-clips`, { headers })).json() as any;
    assert.equal(list.data.local_clip_count, 1);
    assert.equal(list.data.clips[0].local_clip_id, "LC000001");

    const detail = await (await fetch(`${baseUrl}/cutter/local-clips/LC000001`, { headers })).json() as any;
    assert.equal(detail.data.selected_text, "现金流，是企业的血液。");

    const media = await fetch(`${baseUrl}/cutter/local-clips/LC000001/media`, {
      headers: {
        Range: "bytes=0-4"
      }
    });
    assert.equal(media.status, 206);
    assert.equal(media.headers.get("content-range"), "bytes 0-4/16");
    assert.equal(await media.text(), "local");

    const metrics = await waitForUsageMetrics(
      libraryRoot,
      (current) => current.cut_success_count === 1
    );
    assert.equal(metrics.local_clip_count, 1);
    assert.equal(metrics.transcript_selection_count, 1);
    assert.equal(metrics.cut_submission_count, 1);
    assert.equal(metrics.cut_success_count, 1);
    assert.equal(metrics.most_used_source_video_ids[0], "V000001");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

test("creates workspace-backed local exports without writing public-library local clips", async () => {
  const libraryRoot = await prepareLibrary();
  const headers = await createApprovedAuthHeaders(libraryRoot);
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-cutter-api-workspace-"));
  const cutOutputs: Array<{ output_path: string; begin_ms: number; end_ms: number }> = [];

  const server = createCutterApiServer({
    library_root: libraryRoot,
    workspace_root: workspaceRoot,
    now: () => "2026-05-02T10:00:00Z",
    cut_runner: async (input) => {
      cutOutputs.push({
        output_path: input.output_path,
        begin_ms: input.begin_ms,
        end_ms: input.end_ms
      });
      await mkdir(path.dirname(input.output_path), { recursive: true });
      await writeFile(input.output_path, "workspace-clip-bytes");
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const createResponse = await fetch(`${baseUrl}/cutter/local-clips`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        source_video_id: "V000001",
        start_segment_id: "V000001-S000001",
        end_segment_id: "V000001-S000001",
        pre_roll_ms: 250,
        post_roll_ms: 400,
        cut_mode: "copy"
      })
    });

    assert.equal(createResponse.status, 201);
    const created = await createResponse.json() as any;
    assert.equal(created.data.local_clip_id, "E000001");
    assert.equal(created.data.export_clip_id, "E000001");
    assert.equal(created.data.source_video_id, "V000001");
    assert.equal(created.data.begin_ms, 750);
    assert.equal(created.data.end_ms, 4000);
    assert.equal(created.data.media_url, "/cutter/local-clips/E000001/media");
    assert.equal(cutOutputs.length, 1);
    assert.equal(
      await fileOrDirExists(path.join(workspaceRoot, "export-clips", "E000001", "export-clip.json")),
      true
    );
    assert.equal(
      await fileOrDirExists(path.join(libraryRoot, ".mixlab-library", "local-clips")),
      false
    );

    const list = await (await fetch(`${baseUrl}/cutter/local-clips`, { headers })).json() as any;
    assert.equal(list.data.local_clip_count, 1);
    assert.equal(list.data.clips[0].local_clip_id, "E000001");

    const detail = await (await fetch(`${baseUrl}/cutter/local-clips/E000001`, { headers })).json() as any;
    assert.equal(detail.data.selected_text, "现金流，是企业的血液。");

    const media = await fetch(`${baseUrl}/cutter/local-clips/E000001/media`, {
      headers: {
        Range: "bytes=0-8"
      }
    });
    assert.equal(media.status, 206);
    assert.equal(await media.text(), "workspace");

    const metrics = await waitForUsageMetrics(
      libraryRoot,
      (current) => current.cut_success_count === 1
    );
    assert.equal(metrics.local_clip_count, 1);
    assert.equal(metrics.transcript_selection_count, 1);
    assert.equal(metrics.cut_submission_count, 1);
    assert.equal(metrics.cut_success_count, 1);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

test("workspace-backed direct local clip API preserves precise text ranges", async () => {
  const libraryRoot = await prepareLibrary();
  const headers = await createApprovedAuthHeaders(libraryRoot);
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-cutter-api-precise-local-"));
  const cutOutputs: Array<{ output_path: string; begin_ms: number; end_ms: number }> = [];

  const server = createCutterApiServer({
    library_root: libraryRoot,
    workspace_root: workspaceRoot,
    now: () => "2026-05-02T10:00:00Z",
    cut_runner: async (input) => {
      cutOutputs.push({
        output_path: input.output_path,
        begin_ms: input.begin_ms,
        end_ms: input.end_ms
      });
      await mkdir(path.dirname(input.output_path), { recursive: true });
      await writeFile(input.output_path, "precise-workspace-clip-bytes");
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const invalidResponse = await fetch(`${baseUrl}/cutter/local-clips`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        source_video_id: "V000001",
        start_segment_id: "V000001-S000001",
        end_segment_id: "V000001-S000001",
        begin_ms: 1400,
        end_ms: 5000,
        selected_text: "越界文案",
        cut_mode: "copy"
      })
    });
    assert.equal(invalidResponse.status, 400);
    assert.deepEqual(await invalidResponse.json(), {
      error: {
        code: "invalid_precise_selection",
        message: "precise selection must stay within selected transcript segments"
      }
    });

    const createResponse = await fetch(`${baseUrl}/cutter/local-clips`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        source_video_id: "V000001",
        start_segment_id: "V000001-S000001",
        end_segment_id: "V000001-S000001",
        begin_ms: 1200,
        end_ms: 1800,
        selected_text: "现金流",
        pre_roll_ms: 200,
        post_roll_ms: 300,
        cut_mode: "copy"
      })
    });

    assert.equal(createResponse.status, 201);
    const created = await createResponse.json() as any;
    assert.equal(created.data.local_clip_id, "E000001");
    assert.equal(created.data.begin_ms, 1000);
    assert.equal(created.data.end_ms, 2100);
    assert.equal(created.data.selected_text, "现金流");
    assert.deepEqual(cutOutputs.map((output) => [output.begin_ms, output.end_ms]), [[1000, 2100]]);

    const detail = await (await fetch(`${baseUrl}/cutter/local-clips/E000001`, { headers })).json() as any;
    assert.equal(detail.data.selected_text, "现金流");
    assert.deepEqual(
      detail.data.transcript_segments.map((segment: any) => [
        segment.begin_ms,
        segment.end_ms,
        segment.text
      ]),
      [[0, 1100, "现金流"]]
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

test("persists clip lists and runs queued workspace cut jobs", async () => {
  const libraryRoot = await prepareLibrary();
  const headers = await createApprovedAuthHeaders(libraryRoot);
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-cutter-api-queue-"));
  const cutOutputs: Array<{ begin_ms: number; end_ms: number }> = [];

  const server = createCutterApiServer({
    library_root: libraryRoot,
    workspace_root: workspaceRoot,
    now: () => "2026-05-02T10:00:00Z",
    cut_runner: async (input) => {
      cutOutputs.push({
        begin_ms: input.begin_ms,
        end_ms: input.end_ms
      });
      await mkdir(path.dirname(input.output_path), { recursive: true });
      await writeFile(input.output_path, "queued-clip-bytes");
    },
    cover_runner: async (input) => {
      await writeFile(input.output_path, "cover-bytes");
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const clipListResponse = await fetch(`${baseUrl}/cutter/clip-lists`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        library_id: "lib_main_001",
        project_id: "P20260506-aaa",
        title: "现金流清单",
        items: [
          {
            source_video_id: "V000001",
            source_title: "01_现金流.mp4",
            source_relative_path: "source-videos/01_现金流.mp4",
            start_segment_id: "V000001-S000001",
            end_segment_id: "V000001-S000001",
            begin_ms: 1000,
            end_ms: 3600,
            selected_text: "现金流，是企业的血液。",
            cut_mode: "smart",
            pre_roll_ms: 250,
            post_roll_ms: 400
          }
        ]
      })
    });
    assert.equal(clipListResponse.status, 201);
    const clipList = await clipListResponse.json() as any;
    assert.equal(clipList.data.clip_list_id, "CL20260502-0001");
    assert.equal(clipList.data.project_id, "P20260506-aaa");

    const submitResponse = await fetch(`${baseUrl}/cutter/cut-jobs`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        clip_list_id: "CL20260502-0001"
      })
    });
    assert.equal(submitResponse.status, 201);
    const submitted = await submitResponse.json() as any;
    assert.equal(submitted.data.submitted_count, 1);
    assert.equal(submitted.data.jobs[0].status, "pending");
    assert.equal(submitted.data.jobs[0].project_id, "P20260506-aaa");
    assert.equal(submitted.data.jobs[0].project_clip_order, 1);
    assert.equal(submitted.data.jobs[0].title, "1-现金流清单-01_现金流");
    assert.equal(submitted.data.jobs[0].begin_ms, 750);
    assert.equal(submitted.data.jobs[0].end_ms, 4000);
    assert.equal(submitted.data.jobs[0].selected_text, "现金流，是企业的血液。");

    const runResponse = await fetch(`${baseUrl}/cutter/cut-jobs/run-next`, {
      method: "POST",
      headers
    });
    assert.equal(runResponse.status, 200);
    const run = await runResponse.json() as any;
    assert.equal(run.data.status, "done");
    assert.equal(run.data.export_clip_id, "E000001");
    assert.equal(run.data.output_file, "export-clips/E000001/001-现金流清单-01_现金流.mp4");
    assert.equal(run.data.begin_ms, 750);
    assert.equal(run.data.end_ms, 4000);
    assert.deepEqual(cutOutputs, [{ begin_ms: 750, end_ms: 4000 }]);

    const jobs = await (await fetch(`${baseUrl}/cutter/cut-jobs`, { headers })).json() as any;
    assert.equal(jobs.data.job_count, 1);
    assert.equal(jobs.data.jobs[0].status, "done");
    assert.equal(jobs.data.jobs[0].project_id, "P20260506-aaa");
    assert.equal(jobs.data.jobs[0].title, "1-现金流清单-01_现金流");

    const localClips = await (await fetch(`${baseUrl}/cutter/local-clips`, { headers })).json() as any;
    assert.equal(localClips.data.clips[0].title, "1-现金流清单-01_现金流");
    assert.equal(localClips.data.clips[0].cover_url, "/cutter/local-clips/E000001/cover");
    assert.equal(localClips.data.clips[0].subtitles_url, "/cutter/local-clips/E000001/subtitles.srt");
    assert.equal(localClips.data.clips[0].relative_path, ".mixlab-library/videos/E000001/source.mp4");
    assert.equal(localClips.data.clips[0].project_output_file, "projects/现金流清单/001-现金流清单-01_现金流.mp4");
    assert.deepEqual(
      localClips.data.clips[0].transcript_segments.map((segment: any) => [
        segment.segment_id,
        segment.begin_ms,
        segment.end_ms,
        segment.text
      ]),
      [["E000001-S000001", 250, 2850, "现金流，是企业的血液。"]]
    );
    assert.equal(
      await fileOrDirExists(path.join(workspaceRoot, ".mixlab-library", "videos", "E000001", "source-video.json")),
      true
    );
    assert.equal(await fileOrDirExists(path.join(workspaceRoot, "projects", "现金流清单", "001-现金流清单-01_现金流.mp4")), true);

    const cover = await fetch(`${baseUrl}/cutter/local-clips/E000001/cover`);
    assert.equal(cover.status, 200);
    assert.equal(await cover.text(), "cover-bytes");

    const subtitles = await fetch(`${baseUrl}/cutter/local-clips/E000001/subtitles.srt`);
    assert.equal(subtitles.status, 200);
    assert.match(await subtitles.text(), /00:00:00,250 --> 00:00:02,850/);

    const reuseClipListResponse = await fetch(`${baseUrl}/cutter/clip-lists`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        library_id: "lib_main_001",
        project_id: "P20260506-aaa",
        title: "现金流复剪清单",
        items: [
          {
            source_video_id: "E000001",
            source_title: localClips.data.clips[0].title,
            source_relative_path: localClips.data.clips[0].relative_path,
            start_segment_id: "E000001-S000001",
            end_segment_id: "E000001-S000001",
            begin_ms: 250,
            end_ms: 700,
            selected_text: "现金流",
            cut_mode: "copy",
            pre_roll_ms: 0,
            post_roll_ms: 0
          }
        ]
      })
    });
    assert.equal(reuseClipListResponse.status, 201);
    const reuseClipList = await reuseClipListResponse.json() as any;
    assert.equal(reuseClipList.data.clip_list_id, "CL20260502-0002");
    assert.equal(reuseClipList.data.items[0].source_video_id, "E000001");

    const reuseSubmitResponse = await fetch(`${baseUrl}/cutter/cut-jobs`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        clip_list_id: "CL20260502-0002"
      })
    });
    assert.equal(reuseSubmitResponse.status, 201);
    const reuseSubmitted = await reuseSubmitResponse.json() as any;
    assert.equal(reuseSubmitted.data.submitted_count, 1);
    assert.equal(reuseSubmitted.data.jobs[0].source_video_id, "E000001");
    assert.equal(reuseSubmitted.data.jobs[0].project_clip_order, 2);

    const reuseRunResponse = await fetch(`${baseUrl}/cutter/cut-jobs/run-next`, {
      method: "POST",
      headers
    });
    assert.equal(reuseRunResponse.status, 200);
    const reuseRun = await reuseRunResponse.json() as any;
    assert.equal(reuseRun.data.status, "done");
    assert.equal(reuseRun.data.source_video_id, "E000001");
    assert.equal(reuseRun.data.export_clip_id, "E000002");
    assert.equal(reuseRun.data.begin_ms, 250);
    assert.equal(reuseRun.data.end_ms, 700);
    assert.deepEqual(cutOutputs, [
      { begin_ms: 750, end_ms: 4000 },
      { begin_ms: 250, end_ms: 700 }
    ]);

    const reusedLocalClips = await (await fetch(`${baseUrl}/cutter/local-clips`, { headers })).json() as any;
    assert.equal(reusedLocalClips.data.local_clip_count, 2);
    const reusedClip = reusedLocalClips.data.clips.find((clip: any) => clip.local_clip_id === "E000002");
    assert.equal(reusedClip?.source_video_id, "E000001");
    assert.equal(reusedClip?.source_title, "01_现金流");
    assert.equal(reusedClip?.selected_text, "现金流");
    assert.equal(reusedClip?.relative_path, ".mixlab-library/videos/E000002/source.mp4");
    assert.deepEqual(
      reusedClip?.transcript_segments.map((segment: any) => [
        segment.segment_id,
        segment.begin_ms,
        segment.end_ms,
        segment.text
      ]),
      [["E000002-S000001", 0, 450, "现金流"]]
    );
    assert.equal(
      await fileOrDirExists(path.join(workspaceRoot, "export-clips", "E000002", "export-clip.json")),
      true
    );
    assert.equal(
      await fileOrDirExists(path.join(workspaceRoot, ".mixlab-library", "videos", "E000002", "source-video.json")),
      true
    );
    assert.equal(await fileOrDirExists(path.join(workspaceRoot, reusedClip.project_output_file)), true);

    const reusedMedia = await fetch(`${baseUrl}/cutter/local-clips/E000002/media`, {
      headers: {
        Range: "bytes=0-5"
      }
    });
    assert.equal(reusedMedia.status, 206);
    assert.equal(await reusedMedia.text(), "queued");

    const deletionResponse = await fetch(`${baseUrl}/cutter/projects/P20260506-aaa/outputs`, {
      method: "DELETE",
      headers
    });
    assert.equal(deletionResponse.status, 200);
    const deletion = await deletionResponse.json() as any;
    assert.deepEqual(deletion.data, {
      project_id: "P20260506-aaa",
      removed_export_clips: 2,
      removed_local_clips: 2,
      removed_project_outputs: 2,
      removed_cut_jobs: 2,
      removed_clip_lists: 2
    });
    assert.equal(await fileOrDirExists(path.join(workspaceRoot, "export-clips", "E000001")), false);
    assert.equal(await fileOrDirExists(path.join(workspaceRoot, "export-clips", "E000002")), false);
    assert.equal(await fileOrDirExists(path.join(workspaceRoot, ".mixlab-library", "videos", "E000001")), false);
    assert.equal(await fileOrDirExists(path.join(workspaceRoot, ".mixlab-library", "videos", "E000002")), false);
    assert.equal(await fileOrDirExists(path.join(workspaceRoot, "projects", "现金流清单", "001-现金流清单-01_现金流.mp4")), false);
    assert.equal(await fileOrDirExists(path.join(workspaceRoot, reusedClip.project_output_file)), false);
    const emptyLocalClips = await (await fetch(`${baseUrl}/cutter/local-clips`, { headers })).json() as any;
    assert.equal(emptyLocalClips.data.local_clip_count, 0);

    const metrics = await readUsageMetrics(libraryRoot);
    assert.equal(metrics.add_to_cut_list_count, 2);
    assert.equal(metrics.cut_submission_count, 2);
    assert.equal(metrics.cut_success_count, 2);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

test("clip-list usage counts submissions per queued cut item", async () => {
  const libraryRoot = await prepareLibrary();
  const headers = await createApprovedAuthHeaders(libraryRoot);
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-cutter-api-clip-list-usage-"));

  await withApiServer(libraryRoot, async (baseUrl) => {
    const clipItems = [
      {
        source_video_id: "V000001",
        source_title: "01_现金流.mp4",
        source_relative_path: "source-videos/01_现金流.mp4",
        start_segment_id: "V000001-S000001",
        end_segment_id: "V000001-S000001",
        begin_ms: 1000,
        end_ms: 2600,
        selected_text: "现金流",
        cut_mode: "smart",
        pre_roll_ms: 250,
        post_roll_ms: 400
      },
      {
        source_video_id: "V000001",
        source_title: "01_现金流.mp4",
        source_relative_path: "source-videos/01_现金流.mp4",
        start_segment_id: "V000001-S000001",
        end_segment_id: "V000001-S000001",
        begin_ms: 2600,
        end_ms: 3600,
        selected_text: "企业的血液",
        cut_mode: "smart",
        pre_roll_ms: 100,
        post_roll_ms: 100
      }
    ];
    const clipListResponse = await fetch(`${baseUrl}/cutter/clip-lists`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        library_id: "lib_main_001",
        title: "多条现金流选区",
        items: clipItems
      })
    });
    assert.equal(clipListResponse.status, 201);
    const clipList = await clipListResponse.json() as any;
    assert.equal(clipList.data.items.length, 2);

    const submitResponse = await fetch(`${baseUrl}/cutter/cut-jobs`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        clip_list_id: clipList.data.clip_list_id
      })
    });
    assert.equal(submitResponse.status, 201);
    const submission = await submitResponse.json() as any;
    assert.equal(submission.data.submitted_count, 2);
    assert.equal(submission.data.jobs.length, 2);

    const metrics = await waitForUsageMetrics(
      libraryRoot,
      (current) => current.add_to_cut_list_count === 2 && current.cut_submission_count === 2
    );
    assert.equal(metrics.add_to_cut_list_count, 2);
    assert.equal(metrics.cut_submission_count, 2);
    assert.equal(metrics.users[0]?.add_to_cut_list_count, 2);
    assert.equal(metrics.users[0]?.cut_submission_count, 2);
  }, {
    workspace_root: workspaceRoot,
    now: () => "2026-05-02T10:00:00Z"
  });
});

test("clip list creation responds before slow usage analytics finish", async () => {
  const libraryRoot = await prepareLibrary();
  const headers = await createApprovedAuthHeaders(libraryRoot);
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-cutter-api-fast-clip-list-"));
  let usageRecordAttempts = 0;

  const server = createCutterApiServer({
    library_root: libraryRoot,
    workspace_root: workspaceRoot,
    now: () => "2026-05-02T10:00:00Z",
    usage_event_recorder: () => {
      usageRecordAttempts += 1;
      return new Promise<void>(() => undefined);
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const response = await Promise.race([
      fetch(`${baseUrl}/cutter/clip-lists`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          library_id: "lib_main_001",
          project_id: "P20260506-fast",
          title: "现金流快速提交",
          items: [
            {
              source_video_id: "V000001",
              source_title: "01_现金流.mp4",
              source_relative_path: "source-videos/01_现金流.mp4",
              start_segment_id: "V000001-S000001",
              end_segment_id: "V000001-S000001",
              begin_ms: 1000,
              end_ms: 3600,
              selected_text: "现金流，是企业的血液。",
              cut_mode: "smart"
            }
          ]
        })
      }),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 250))
    ]);

    assert.notEqual(response, "timeout");
    assert.equal((response as Response).status, 201);
    const body = await (response as Response).json() as any;
    assert.equal(body.data.clip_list_id, "CL20260502-0001");
    assert.equal(usageRecordAttempts, 1);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

test("opens the current project output directory for cutters", async () => {
  const libraryRoot = await prepareLibrary();
  const headers = await createApprovedAuthHeaders(libraryRoot);
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-cutter-api-open-"));
  const openedPaths: string[] = [];
  const server = createCutterApiServer({
    library_root: libraryRoot,
    workspace_root: workspaceRoot,
    open_path: async (targetPath) => {
      openedPaths.push(targetPath);
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const anonymous = await fetch(`${baseUrl}/cutter/workspace/open-export-directory`, {
      method: "POST"
    });
    assert.equal(anonymous.status, 401);

    const response = await fetch(`${baseUrl}/cutter/workspace/open-export-directory`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        project_id: "P20260506-aaa",
        project_title: "5月6日"
      })
    });
    assert.equal(response.status, 200);
    const body = await response.json() as any;
    const expectedPath = path.join(workspaceRoot, "projects", "5月6日");
    assert.equal(body.data.path, expectedPath);
    assert.deepEqual(openedPaths, [expectedPath]);
    assert.equal(await fileOrDirExists(expectedPath), true);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

test("retries failed workspace cut jobs through protected Cutter API", async () => {
  const libraryRoot = await prepareLibrary();
  const headers = await createApprovedAuthHeaders(libraryRoot);
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-cutter-api-retry-"));
  let failNextCut = true;

  const server = createCutterApiServer({
    library_root: libraryRoot,
    workspace_root: workspaceRoot,
    now: () => "2026-05-04T10:00:00Z",
    cut_runner: async (input) => {
      if (failNextCut) {
        throw new Error("ffmpeg failed");
      }

      await mkdir(path.dirname(input.output_path), { recursive: true });
      await writeFile(input.output_path, "retried-clip-bytes");
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const clipListResponse = await fetch(`${baseUrl}/cutter/clip-lists`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        library_id: "lib_main_001",
        title: "现金流重试清单",
        items: [
          {
            source_video_id: "V000001",
            source_title: "01_现金流.mp4",
            source_relative_path: "source-videos/01_现金流.mp4",
            start_segment_id: "V000001-S000001",
            end_segment_id: "V000001-S000001",
            begin_ms: 1000,
            end_ms: 3600,
            selected_text: "现金流，是企业的血液。",
            cut_mode: "smart"
          }
        ]
      })
    });
    assert.equal(clipListResponse.status, 201);

    const submitResponse = await fetch(`${baseUrl}/cutter/cut-jobs`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        clip_list_id: "CL20260504-0001"
      })
    });
    assert.equal(submitResponse.status, 201);

    const failedResponse = await fetch(`${baseUrl}/cutter/cut-jobs/run-next`, {
      method: "POST",
      headers
    });
    assert.equal(failedResponse.status, 200);
    const failed = await failedResponse.json() as any;
    assert.equal(failed.data.status, "failed");
    assert.match(failed.data.error_message, /ffmpeg failed/);

    const anonymousRetry = await fetch(`${baseUrl}/cutter/cut-jobs/${failed.data.cut_job_id}/retry`, {
      method: "POST"
    });
    assert.equal(anonymousRetry.status, 401);

    const retryResponse = await fetch(`${baseUrl}/cutter/cut-jobs/${failed.data.cut_job_id}/retry`, {
      method: "POST",
      headers
    });
    assert.equal(retryResponse.status, 200);
    const retried = await retryResponse.json() as any;
    assert.equal(retried.data.status, "pending");
    assert.equal(retried.data.error_message, undefined);

    failNextCut = false;
    const doneResponse = await fetch(`${baseUrl}/cutter/cut-jobs/run-next`, {
      method: "POST",
      headers
    });
    assert.equal(doneResponse.status, 200);
    const done = await doneResponse.json() as any;
    assert.equal(done.data.status, "done");

    const nonFailedRetry = await fetch(`${baseUrl}/cutter/cut-jobs/${failed.data.cut_job_id}/retry`, {
      method: "POST",
      headers
    });
    assert.equal(nonFailedRetry.status, 409);
    const nonFailed = await nonFailedRetry.json() as any;
    assert.match(nonFailed.error.message, /只有失败任务需要重试/);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});
