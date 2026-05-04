import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { Server } from "node:http";
import type { TranscriptSegment } from "../../protocol/src/index.ts";
import {
  approveCutterUser,
  claimNextPreprocessJob,
  completePreprocessArtifacts,
  createCutterLoginApplication,
  listCutterUsers,
  publishReadySourceVideo,
  readUsageMetrics,
  scanSourceVideos
} from "../../library-fs/src/index.ts";
import { createCutterApiServer } from "./index.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "mixlab-cutter-api-"));
}

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
  fn: (baseUrl: string) => Promise<T>
): Promise<T> {
  const server = createCutterApiServer({ library_root: libraryRoot });

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

    const detailResponse = await fetch(`${baseUrl}${catalog.data.videos[0].detail_url}`, {
      headers
    });
    assert.equal(detailResponse.status, 200);
    const detail = await detailResponse.json() as any;
    assert.equal(detail.data.source_video_id, "V000001");
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
    assert.equal(search.data.groups[0].cover_url, "/cutter/source-videos/V000001/cover");

    const hiddenSearch = await fetch(`${baseUrl}/cutter/source-search?query=${encodeURIComponent("组织效率")}`, {
      headers
    });
    assert.deepEqual(((await hiddenSearch.json()) as any).data.groups, []);

    const metrics = await readUsageMetrics(libraryRoot);
    assert.equal(metrics.search_request_count, 2);
    assert.equal(metrics.search_hit_count, 1);
    assert.equal(metrics.search_empty_count, 1);
    assert.equal(metrics.source_detail_view_count, 1);
    assert.deepEqual(metrics.recent_keywords, ["组织效率", "现金流"]);
    assert.equal(metrics.users[0].user_id, "CU000001");
    assert.equal(metrics.users[0].username, "cutter-user");
  });
});

test("streams cover, subtitles, and source media with range support", async () => {
  const libraryRoot = await prepareLibrary();

  await withApiServer(libraryRoot, async (baseUrl) => {
    const coverResponse = await fetch(`${baseUrl}/cutter/source-videos/V000001/cover`);
    assert.equal(coverResponse.status, 200);
    assert.equal(coverResponse.headers.get("content-type"), "image/jpeg");
    assert.equal(await coverResponse.text(), "cover-bytes");

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

    const metrics = await readUsageMetrics(libraryRoot);
    assert.equal(metrics.local_clip_count, 1);
    assert.equal(metrics.transcript_selection_count, 1);
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

  const server = createCutterApiServer({
    library_root: libraryRoot,
    workspace_root: workspaceRoot,
    now: () => "2026-05-02T10:00:00Z",
    cut_runner: async (input) => {
      await mkdir(path.dirname(input.output_path), { recursive: true });
      await writeFile(input.output_path, "queued-clip-bytes");
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
            cut_mode: "smart"
          }
        ]
      })
    });
    assert.equal(clipListResponse.status, 201);
    const clipList = await clipListResponse.json() as any;
    assert.equal(clipList.data.clip_list_id, "CL20260502-0001");

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

    const runResponse = await fetch(`${baseUrl}/cutter/cut-jobs/run-next`, {
      method: "POST",
      headers
    });
    assert.equal(runResponse.status, 200);
    const run = await runResponse.json() as any;
    assert.equal(run.data.status, "done");
    assert.equal(run.data.export_clip_id, "E000001");

    const jobs = await (await fetch(`${baseUrl}/cutter/cut-jobs`, { headers })).json() as any;
    assert.equal(jobs.data.job_count, 1);
    assert.equal(jobs.data.jobs[0].status, "done");

    const metrics = await readUsageMetrics(libraryRoot);
    assert.equal(metrics.add_to_cut_list_count, 1);
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
