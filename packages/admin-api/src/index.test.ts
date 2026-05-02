import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { appendUsageEvent, createCutterLoginApplication } from "../../library-fs/src/index.ts";
import type { SourceVideoManifest } from "../../protocol/src/index.ts";
import { createAdminApiServer } from "./index.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-api-"));
}

async function withServer(
  libraryRoot: string,
  callback: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = createAdminApiServer({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "测试素材库",
    now: () => "2026-05-02T12:00:00.000Z",
    env: {
      DASHSCOPE_API_KEY: "sk-test-secret",
      MIXLAB_ASR_MODEL: "paraformer-v2"
    } as NodeJS.ProcessEnv
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();

  assert.ok(address && typeof address === "object");

  try {
    await callback(`http://127.0.0.1:${(address as AddressInfo).port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

async function postJson(baseUrl: string, pathName: string, body: unknown = {}): Promise<any> {
  const response = await fetch(`${baseUrl}${pathName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  return response.json();
}

async function patchJson(baseUrl: string, pathName: string, body: unknown): Promise<any> {
  const response = await fetch(`${baseUrl}${pathName}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  return response.json();
}

async function getJson(baseUrl: string, pathName: string): Promise<any> {
  const response = await fetch(`${baseUrl}${pathName}`);

  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  return response.json();
}

async function writeManifest(libraryRoot: string, manifest: SourceVideoManifest): Promise<void> {
  const dir = path.join(libraryRoot, ".mixlab-library", "videos", manifest.source_video_id);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "source-video.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
}

function sourceVideoManifest(input: Partial<SourceVideoManifest> = {}): SourceVideoManifest {
  const sourceVideoId = input.source_video_id ?? "V000001";

  return {
    source_video_id: sourceVideoId,
    title: input.title ?? "老板现金流课程",
    relative_path: input.relative_path ?? "cashflow.mp4",
    logical_uri: input.logical_uri ?? `library://source-video/${sourceVideoId}`,
    duration_ms: input.duration_ms ?? 120_000,
    width: input.width ?? 1920,
    height: input.height ?? 1080,
    fps: input.fps ?? 25,
    codec: input.codec ?? "h264",
    file_size: input.file_size ?? 1234,
    content_hash: input.content_hash ?? "sha256:test",
    preprocess_status: input.preprocess_status ?? "ready",
    visible_to_cutters: input.visible_to_cutters ?? true,
    transcript_path: input.transcript_path ?? `.mixlab-library/videos/${sourceVideoId}/transcript.json`,
    srt_path: input.srt_path ?? `.mixlab-library/videos/${sourceVideoId}/subtitles.srt`,
    keyframes_path: input.keyframes_path ?? `.mixlab-library/videos/${sourceVideoId}/keyframes.json`,
    cover_path: input.cover_path ?? `.mixlab-library/videos/${sourceVideoId}/cover.jpg`,
    ...input
  };
}

test("initializes, scans, and reports a public library dashboard", async () => {
  const libraryRoot = await makeLibraryRoot();
  await mkdir(path.join(libraryRoot, "source-videos"), { recursive: true });
  await writeFile(path.join(libraryRoot, "source-videos", "cashflow.mp4"), "video");

  await withServer(libraryRoot, async (baseUrl) => {
    assert.equal((await postJson(baseUrl, "/api/admin/library/init")).ok, true);
    const scan = await postJson(baseUrl, "/api/admin/library/scan");
    assert.equal(scan.data.new_video_count, 1);

    const status = await (await fetch(`${baseUrl}/api/admin/library/status`)).json();
    assert.equal(status.ok, true);
    assert.equal(status.data.library_id, "lib_main_001");
    assert.equal(status.data.video_count, 1);
    assert.equal(status.data.unprocessed_video_count, 1);

    const videos = await (await fetch(`${baseUrl}/api/admin/source-videos`)).json();
    assert.equal(videos.data[0].source_video_id, "V000001");
    assert.equal(videos.data[0].preprocess_status, "unprocessed");
    assert.equal(videos.data[0].visible_to_cutters, false);
  });
});

test("queues unprocessed videos and lets admin edit public source metadata", async () => {
  const libraryRoot = await makeLibraryRoot();
  await mkdir(path.join(libraryRoot, "source-videos"), { recursive: true });
  await writeFile(path.join(libraryRoot, "source-videos", "cashflow.mp4"), "video");

  await withServer(libraryRoot, async (baseUrl) => {
    await postJson(baseUrl, "/api/admin/library/init");
    await postJson(baseUrl, "/api/admin/library/scan");

    const queued = await postJson(baseUrl, "/api/admin/preprocess/queue-unprocessed");
    assert.equal(queued.data.affected_count, 1);

    const metadata = await patchJson(baseUrl, "/api/admin/source-videos/V000001/metadata", {
      title: "现金流管理",
      tags: ["现金流", "财务"],
      description: "剪辑端卡片说明",
      lecturer: "李老师",
      course: "经营课",
      category: "财务"
    });
    assert.equal(metadata.data.title, "现金流管理");
    assert.deepEqual(metadata.data.tags, ["现金流", "财务"]);

    const manifest = JSON.parse(
      await readFile(
        path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json"),
        "utf8"
      )
    );
    assert.equal(manifest.preprocess_status, "queued");
    assert.equal(manifest.title, "现金流管理");
    assert.equal(manifest.visible_to_cutters, false);
  });
});

test("returns admin settings config with the default source folder", async () => {
  const libraryRoot = await makeLibraryRoot();

  await withServer(libraryRoot, async (baseUrl) => {
    const settings = await getJson(baseUrl, "/api/admin/settings/config");

    assert.equal(settings.ok, true);
    assert.equal(settings.data.source_folders[0].name, "默认素材来源");
    assert.equal(settings.data.source_folders[0].path, path.join(libraryRoot, "source-videos"));
  });
});

test("returns source video detail for an unprocessed scan result", async () => {
  const libraryRoot = await makeLibraryRoot();
  await mkdir(path.join(libraryRoot, "source-videos"), { recursive: true });
  await writeFile(path.join(libraryRoot, "source-videos", "cashflow.mp4"), "video");

  await withServer(libraryRoot, async (baseUrl) => {
    await postJson(baseUrl, "/api/admin/library/init");
    await postJson(baseUrl, "/api/admin/library/scan");

    const detail = await getJson(baseUrl, "/api/admin/source-videos/V000001");

    assert.equal(detail.ok, true);
    assert.equal(detail.data.source_video.source_video_id, "V000001");
    assert.equal(detail.data.visibility.label, "剪辑师暂不可见");
    assert.equal(detail.data.preprocess.status, "unprocessed");
    assert.equal(detail.data.transcript.full_text, "");
  });
});

test("returns an empty cutter user list initially", async () => {
  const libraryRoot = await makeLibraryRoot();

  await withServer(libraryRoot, async (baseUrl) => {
    const users = await getJson(baseUrl, "/api/admin/cutter-users");

    assert.deepEqual(users, {
      ok: true,
      data: { users: [] }
    });
  });
});

test("returns dashboard material metrics after scan", async () => {
  const libraryRoot = await makeLibraryRoot();
  await mkdir(path.join(libraryRoot, "source-videos"), { recursive: true });
  await writeFile(path.join(libraryRoot, "source-videos", "cashflow.mp4"), "video");

  await withServer(libraryRoot, async (baseUrl) => {
    await postJson(baseUrl, "/api/admin/library/init");
    await postJson(baseUrl, "/api/admin/library/scan");

    const metrics = await getJson(baseUrl, "/api/admin/dashboard/metrics");

    assert.equal(metrics.ok, true);
    assert.equal(metrics.data.material.video_count, 1);
    assert.equal(metrics.data.material.ready_video_count, 0);
    assert.equal(metrics.data.risk.index_required_video_count, 0);
  });
});

test("returns expanded dashboard transcript production and usage metrics", async () => {
  const libraryRoot = await makeLibraryRoot();
  const fullText = "现金流，是企业的血液。";
  await writeManifest(libraryRoot, sourceVideoManifest({
    duration_ms: 120_000,
    file_size: 4096,
    transcript_path: ".mixlab-library/videos/V000001/transcript.json",
    preprocess_status: "ready",
    visible_to_cutters: true
  }));
  await mkdir(path.join(libraryRoot, ".mixlab-library", "videos", "V000001"), { recursive: true });
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "transcript.json"),
    `${JSON.stringify({
      full_text: fullText,
      segments: [
        { segment_id: "S1", text: "现金流，" },
        { segment_id: "S2", text: "是企业的血液。" }
      ]
    }, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "preprocess-job.json"),
    `${JSON.stringify({
      source_video_id: "V000001",
      worker_id: "worker-a",
      status: "ready",
      attempt: 1,
      claimed_at: "2026-05-02T10:00:00.000Z",
      completed_at: "2026-05-02T10:00:02.000Z",
      indexed_at: "2026-05-02T10:00:05.000Z",
      index_version: "v000001"
    }, null, 2)}\n`,
    "utf8"
  );
  await mkdir(path.join(libraryRoot, ".mixlab-library", "indexes", "source-transcript-index"), { recursive: true });
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "indexes", "source-transcript-index", "current.json"),
    `${JSON.stringify({
      library_id: "lib_main_001",
      current_version: "v000001",
      updated_at: "2026-05-02T10:00:05.000Z"
    }, null, 2)}\n`,
    "utf8"
  );
  await appendUsageEvent(libraryRoot, {
    user_id: "CU000001",
    username: "zhangsan",
    device_id: "device-a",
    event_type: "search",
    occurred_at: "2026-05-02T11:00:00.000Z",
    query: "现金流",
    result_status: "success"
  });
  await appendUsageEvent(libraryRoot, {
    user_id: "CU000001",
    username: "zhangsan",
    device_id: "device-a",
    event_type: "add_to_cut_list",
    occurred_at: "2026-05-02T11:01:00.000Z",
    source_video_id: "V000001"
  });
  await appendUsageEvent(libraryRoot, {
    user_id: "CU000001",
    username: "zhangsan",
    device_id: "device-a",
    event_type: "reuse_local_clip",
    occurred_at: "2026-05-02T11:02:00.000Z",
    source_video_id: "V000001"
  });

  await withServer(libraryRoot, async (baseUrl) => {
    const metrics = await getJson(baseUrl, "/api/admin/dashboard/metrics");

    assert.equal(metrics.ok, true);
    assert.equal(metrics.data.material.total_duration_ms, 120_000);
    assert.equal(metrics.data.material.ready_duration_ms, 120_000);
    assert.equal(metrics.data.transcript.character_count, fullText.length);
    assert.equal(metrics.data.transcript.segment_count, 2);
    assert.equal(metrics.data.transcript.current_index_version, "v000001");
    assert.equal(metrics.data.production.completed_today_count, 1);
    assert.equal(metrics.data.production.average_video_process_ms, 5000);
    assert.equal(metrics.data.usage.search_hit_count, 1);
    assert.equal(metrics.data.usage.add_to_cut_list_count, 1);
    assert.equal(metrics.data.usage.reuse_local_clip_count, 1);
  });
});

test("dashboard metrics returns internal_error when usage history is malformed", async () => {
  const libraryRoot = await makeLibraryRoot();
  await mkdir(path.join(libraryRoot, ".mixlab-library", "usage-events"), { recursive: true });
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "usage-events", "events.ndjson"),
    "{broken json}\n",
    "utf8"
  );

  await withServer(libraryRoot, async (baseUrl) => {
    const metrics = await getJson(baseUrl, "/api/admin/dashboard/metrics");

    assert.equal(metrics.ok, false);
    assert.equal(metrics.error_code, "internal_error");
    assert.match(metrics.message, /使用事件存储文件格式错误/);
  });
});

test("approves cutter applications and disables cutter users", async () => {
  const libraryRoot = await makeLibraryRoot();
  const application = await createCutterLoginApplication(libraryRoot, {
    username: "zhangsan",
    device_id: "device-a",
    device_name: "剪辑工作站",
    now: "2026-05-01T10:00:00.000Z"
  });

  await withServer(libraryRoot, async (baseUrl) => {
    const approved = await postJson(
      baseUrl,
      `/api/admin/cutter-users/${application.user_id}/approve`
    );
    assert.equal(approved.ok, true);
    assert.equal(approved.data.user.status, "approved");
    assert.equal(approved.data.session.user_id, application.user_id);
    assert.equal(approved.data.session.device_id, "device-a");
    assert.equal(approved.data.session.created_at, "2026-05-02T12:00:00.000Z");
    assert.equal(approved.data.session.last_seen_at, "2026-05-02T12:00:00.000Z");
    assert.equal(approved.data.session.session_token, undefined);

    const disabled = await postJson(
      baseUrl,
      `/api/admin/cutter-users/${application.user_id}/disable`
    );
    assert.equal(disabled.ok, true);
    assert.equal(disabled.data.status, "disabled");
    assert.equal(disabled.data.disabled_at, "2026-05-02T12:00:00.000Z");
  });
});

test("admin cutter user routes accept CU ids longer than six digits", async () => {
  const libraryRoot = await makeLibraryRoot();
  const longUserId = "CU1000000000000";
  await mkdir(path.join(libraryRoot, ".mixlab-library", "cutter-users"), { recursive: true });
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "cutter-users", "users.json"),
    `${JSON.stringify({
      schema_version: "1.0",
      users: [
        {
          user_id: longUserId,
          username: "lisi",
          display_name: "李四",
          status: "pending",
          applied_at: "2026-05-01T10:00:00.000Z",
          approved_at: "",
          rejected_at: "",
          disabled_at: "",
          last_login_at: "",
          last_used_at: "",
          note: "",
          devices: [
            {
              device_id: "device-b",
              device_name: "备用工作站",
              status: "active",
              first_seen_at: "2026-05-01T10:00:00.000Z",
              last_login_at: ""
            }
          ]
        }
      ],
      sessions: []
    }, null, 2)}\n`,
    "utf8"
  );

  await withServer(libraryRoot, async (baseUrl) => {
    const approved = await postJson(baseUrl, `/api/admin/cutter-users/${longUserId}/approve`);

    assert.equal(approved.ok, true);
    assert.equal(approved.data.user.user_id, longUserId);
  });
});

test("admin cover endpoint resolves relative and library cover paths", async () => {
  const libraryRoot = await makeLibraryRoot();
  const relativeCoverBytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const libraryCoverBytes = Buffer.from([0xff, 0xd8, 0x00, 0xff, 0xd9]);

  await mkdir(path.join(libraryRoot, ".mixlab-library", "videos", "V000001"), { recursive: true });
  await mkdir(path.join(libraryRoot, ".mixlab-library", "videos", "V000002", "covers"), { recursive: true });
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "cover.jpg"),
    relativeCoverBytes
  );
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000002", "covers", "cover.jpg"),
    libraryCoverBytes
  );
  await writeManifest(libraryRoot, sourceVideoManifest({
    source_video_id: "V000001",
    cover_path: ".mixlab-library/videos/V000001/cover.jpg"
  }));
  await writeManifest(libraryRoot, sourceVideoManifest({
    source_video_id: "V000002",
    cover_path: "library://video/V000002/covers/cover.jpg"
  }));

  await withServer(libraryRoot, async (baseUrl) => {
    const relative = await fetch(`${baseUrl}/api/admin/source-videos/V000001/cover`);
    const library = await fetch(`${baseUrl}/api/admin/source-videos/V000002/cover`);

    assert.equal(relative.status, 200);
    assert.equal(Buffer.compare(Buffer.from(await relative.arrayBuffer()), relativeCoverBytes), 0);
    assert.equal(library.status, 200);
    assert.equal(Buffer.compare(Buffer.from(await library.arrayBuffer()), libraryCoverBytes), 0);
  });
});
