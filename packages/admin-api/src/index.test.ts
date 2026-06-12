import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import {
  appendPreprocessJobLog,
  appendUsageEvent,
  createCutterLoginApplication
} from "../../library-fs/src/index.ts";
import { runLibraryTextPreprocessWorker } from "../../preprocess-core/src/index.ts";
import type { SourceVideoManifest } from "../../protocol/src/index.ts";
import { writeSourceTranscriptSqliteIndex } from "../../search-sqlite/src/index.ts";
import * as adminApiModule from "./index.ts";
import { createAdminApiServer, runAdminPreprocessPipeline } from "./index.ts";
import type { PreprocessSupervisorRunner } from "./preprocess-supervisor.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-api-"));
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

async function withServer(
  libraryRoot: string,
  callback: (baseUrl: string) => Promise<void>,
  preprocessRunner?: PreprocessSupervisorRunner,
  readyPublishMedia?: {
    create_cover(input: {
      source_path: string;
      output_path: string;
      at_ms: number;
      width: number;
    }): Promise<void>;
  }
): Promise<void> {
  const server = createAdminApiServer({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "测试素材库",
    now: () => "2026-05-02T12:00:00.000Z",
    env: {
      DASHSCOPE_API_KEY: "sk-test-secret",
      MIXLAB_ASR_MODEL: "paraformer-v2"
    } as NodeJS.ProcessEnv,
    ...(preprocessRunner ? { preprocess_runner: preprocessRunner } : {}),
    ...(readyPublishMedia ? { ready_publish_media: readyPublishMedia } : {})
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

async function withServerEnv(
  libraryRoot: string,
  env: NodeJS.ProcessEnv,
  callback: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = createAdminApiServer({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "测试素材库",
    now: () => "2026-05-02T12:00:00.000Z",
    env
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

async function writeTranscriptArtifacts(libraryRoot: string, sourceVideoId: string): Promise<void> {
  const videoDir = path.join(libraryRoot, ".mixlab-library", "videos", sourceVideoId);
  await mkdir(videoDir, { recursive: true });
  await writeFile(
    path.join(videoDir, "transcript.json"),
    `${JSON.stringify({
      schema_version: "1.0",
      source_video_id: sourceVideoId,
      full_text: "现金流，是企业的血液。",
      duration_ms: 4_000,
      segments: [
        {
          segment_id: `${sourceVideoId}-S000001`,
          index: 0,
          begin_ms: 0,
          end_ms: 4_000,
          begin_char: 0,
          end_char: 10,
          normalized_begin_char: 0,
          normalized_end_char: 9,
          text: "现金流，是企业的血液。",
          normalized_text: "现金流是企业的血液",
          confidence: 0.95
        }
      ]
    }, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(videoDir, "subtitles.srt"),
    "1\n00:00:00,000 --> 00:00:04,000\n现金流，是企业的血液。\n",
    "utf8"
  );
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

async function deleteJson(baseUrl: string, pathName: string): Promise<any> {
  const response = await fetch(`${baseUrl}${pathName}`, {
    method: "DELETE"
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
    const initialized = await postJson(baseUrl, "/api/admin/library/init");
    assert.equal(initialized.ok, true);
    assert.equal(initialized.data.library_id, "lib_main_001");
    assert.equal(initialized.data.name, "测试素材库");
    assert.equal(initialized.data.version, "1.0");
    assert.equal(initialized.data.video_count, 0);
    assert.equal(await fileOrDirExists(libraryRoot), true);
    assert.equal(await fileOrDirExists(path.join(libraryRoot, "source-videos")), true);
    assert.equal(await fileOrDirExists(path.join(libraryRoot, ".mixlab-library", "videos")), true);
    assert.equal(
      await fileOrDirExists(path.join(libraryRoot, ".mixlab-library", "indexes", "source-transcript-index")),
      true
    );
    const libraryManifest = JSON.parse(
      await readFile(path.join(libraryRoot, ".mixlab-library", "library.json"), "utf8")
    ) as any;
    assert.equal(libraryManifest.library_id, "lib_main_001");
    assert.equal(libraryManifest.name, "测试素材库");

    const settings = await getJson(baseUrl, "/api/admin/settings/config");
    assert.equal(settings.data.source_folders[0].path, path.join(libraryRoot, "source-videos"));

    const checksAfterInit = await getJson(baseUrl, "/api/admin/library/path-checks");
    assert.deepEqual(
      checksAfterInit.data.map((item: { label: string; status: string }) => [item.label, item.status]),
      [
        ["公共素材库", "pass"],
        ["素材来源：默认素材来源", "pass"],
        [".mixlab-library", "pass"],
        ["library.json", "pass"]
      ]
    );

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

    const checksAfterScan = await getJson(baseUrl, "/api/admin/library/path-checks");
    assert.equal(checksAfterScan.data.every((item: { status: string }) => item.status === "pass"), true);

    const metrics = await getJson(baseUrl, "/api/admin/dashboard/metrics");
    assert.equal(metrics.ok, true);
    assert.equal(typeof metrics.data.runtime_load.cpu.usage_percent, "number");
    assert.equal(typeof metrics.data.runtime_load.cpu.load_average_1m, "number");
    assert.equal(typeof metrics.data.runtime_load.memory.usage_percent, "number");
    assert.equal(typeof metrics.data.runtime_load.disk.usage_percent, "number");
    assert.equal(typeof metrics.data.runtime_load.network.active_interface_count, "number");
    assert.equal(metrics.data.runtime_load.service.heartbeat_at, "2026-05-02T12:00:00.000Z");
    assert.ok(["healthy", "attention", "blocked"].includes(metrics.data.runtime_load.overall_status));
  });
});

test("exports doctor report JSON through the admin API", async () => {
  const libraryRoot = await makeLibraryRoot();
  await mkdir(path.join(libraryRoot, "source-videos"), { recursive: true });

  await withServer(libraryRoot, async (baseUrl) => {
    const exported = await postJson(baseUrl, "/api/admin/doctor/export");

    assert.equal(exported.ok, true);
    assert.equal(exported.data.file_name, "mixlab-doctor-2026-05-02T12-00-00.000Z.json");
    assert.equal(
      exported.data.relative_path,
      `.mixlab-library/exports/doctor/${exported.data.file_name}`
    );
    assert.equal(await fileOrDirExists(exported.data.file_path), true);
    assert.equal(exported.data.report.generated_at, "2026-05-02T12:00:00.000Z");

    const exportedJson = await readFile(exported.data.file_path, "utf8");
    assert.equal(exportedJson.includes("sk-test-secret"), false);
    assert.deepEqual(JSON.parse(exportedJson), exported.data.report);
  });
});

test("source video list filters query and status before paginating", async () => {
  const libraryRoot = await makeLibraryRoot();
  await writeManifest(libraryRoot, sourceVideoManifest({
    source_video_id: "V000001",
    title: "普通经营课",
    relative_path: "普通经营课.mp4",
    preprocess_status: "ready"
  }));
  await writeManifest(libraryRoot, sourceVideoManifest({
    source_video_id: "V000002",
    title: "现金流未处理",
    relative_path: "现金流未处理.mp4",
    preprocess_status: "unprocessed",
    visible_to_cutters: false
  }));
  await writeManifest(libraryRoot, sourceVideoManifest({
    source_video_id: "V000003",
    title: "现金流管理课",
    relative_path: "经营课/现金流管理课.mp4",
    preprocess_status: "ready",
    tags: ["财务"]
  }));

  await withServer(libraryRoot, async (baseUrl) => {
    const firstPage = await getJson(baseUrl, "/api/admin/source-videos?limit=1");
    const filtered = await getJson(baseUrl, "/api/admin/source-videos?query=%E7%8E%B0%E9%87%91%E6%B5%81&status=ready&limit=1");
    const secondFilteredPage = await getJson(baseUrl, "/api/admin/source-videos?query=%E7%8E%B0%E9%87%91%E6%B5%81&status=ready&offset=1&limit=1");

    assert.equal(firstPage.data[0].source_video_id, "V000001");
    assert.equal(filtered.data.length, 1);
    assert.equal(filtered.data[0].source_video_id, "V000003");
    assert.equal(secondFilteredPage.data.length, 0);
  });
});

test("source video query can return ready rows from the current transcript index without manifests", async () => {
  const libraryRoot = await makeLibraryRoot();
  const indexRoot = path.join(libraryRoot, ".mixlab-library", "indexes", "source-transcript-index");
  const indexVersion = "v000001";
  await mkdir(path.join(indexRoot, indexVersion), { recursive: true });
  await writeFile(
    path.join(indexRoot, "current.json"),
    `${JSON.stringify({
      library_id: "lib_main_001",
      current_version: indexVersion,
      updated_at: "2026-05-02T10:00:05.000Z"
    }, null, 2)}\n`,
    "utf8"
  );
  await writeSourceTranscriptSqliteIndex({
    index_file_path: path.join(indexRoot, indexVersion, "index.sqlite"),
    library_id: "lib_main_001",
    index_version: indexVersion,
    created_at: "2026-05-02T10:00:05.000Z",
    videos: [
      {
        source_video_id: "V000108",
        title: "C0327",
        duration_ms: 2_012_000,
        relative_path: "王牧笛/2024年素材/3.2广州-交付课/C0327.MP4",
        cover_path: ".mixlab-library/videos/V000108/cover.jpg",
        segments: []
      }
    ]
  });

  await withServer(libraryRoot, async (baseUrl) => {
    const filtered = await getJson(baseUrl, "/api/admin/source-videos?query=C0327&limit=100");

    assert.equal(filtered.ok, true);
    assert.equal(filtered.data.length, 1);
    assert.equal(filtered.data[0].source_video_id, "V000108");
    assert.equal(filtered.data[0].title, "C0327");
    assert.equal(filtered.data[0].preprocess_status, "ready");
    assert.equal(filtered.data[0].file_size, 0);
  });
});

test("source video ready status can page from the current transcript index without manifests", async () => {
  const libraryRoot = await makeLibraryRoot();
  const indexRoot = path.join(libraryRoot, ".mixlab-library", "indexes", "source-transcript-index");
  const indexVersion = "v000001";
  await mkdir(path.join(indexRoot, indexVersion), { recursive: true });
  await writeFile(
    path.join(indexRoot, "current.json"),
    `${JSON.stringify({
      library_id: "lib_main_001",
      current_version: indexVersion,
      updated_at: "2026-05-02T10:00:05.000Z"
    }, null, 2)}\n`,
    "utf8"
  );
  await writeSourceTranscriptSqliteIndex({
    index_file_path: path.join(indexRoot, indexVersion, "index.sqlite"),
    library_id: "lib_main_001",
    index_version: indexVersion,
    created_at: "2026-05-02T10:00:05.000Z",
    videos: [
      {
        source_video_id: "V000001",
        title: "已发布素材一",
        duration_ms: 120_000,
        relative_path: "ready-1.mp4",
        cover_path: ".mixlab-library/videos/V000001/cover.jpg",
        segments: []
      },
      {
        source_video_id: "V000002",
        title: "已发布素材二",
        duration_ms: 180_000,
        relative_path: "ready-2.mp4",
        cover_path: ".mixlab-library/videos/V000002/cover.jpg",
        segments: []
      }
    ]
  });

  await withServer(libraryRoot, async (baseUrl) => {
    const firstReady = await getJson(baseUrl, "/api/admin/source-videos?status=ready&limit=1");
    const secondReady = await getJson(baseUrl, "/api/admin/source-videos?status=ready&offset=1&limit=1");

    assert.equal(firstReady.ok, true);
    assert.equal(firstReady.data[0].source_video_id, "V000001");
    assert.equal(firstReady.data[0].preprocess_status, "ready");
    assert.equal(secondReady.data[0].source_video_id, "V000002");
  });
});

test("source video non-ready filters skip indexed ready ids before reading manifests", async () => {
  const libraryRoot = await makeLibraryRoot();
  const indexRoot = path.join(libraryRoot, ".mixlab-library", "indexes", "source-transcript-index");
  const indexVersion = "v000001";
  await mkdir(path.join(indexRoot, indexVersion), { recursive: true });
  await mkdir(path.join(libraryRoot, ".mixlab-library", "videos", "V000001"), { recursive: true });
  await mkdir(path.join(libraryRoot, ".mixlab-library", "videos", "V000002"), { recursive: true });
  await writeFile(
    path.join(indexRoot, "current.json"),
    `${JSON.stringify({
      library_id: "lib_main_001",
      current_version: indexVersion,
      updated_at: "2026-05-02T10:00:05.000Z"
    }, null, 2)}\n`,
    "utf8"
  );
  await writeSourceTranscriptSqliteIndex({
    index_file_path: path.join(indexRoot, indexVersion, "index.sqlite"),
    library_id: "lib_main_001",
    index_version: indexVersion,
    created_at: "2026-05-02T10:00:05.000Z",
    videos: [
      {
        source_video_id: "V000001",
        title: "已发布素材一",
        duration_ms: 120_000,
        relative_path: "ready-1.mp4",
        cover_path: ".mixlab-library/videos/V000001/cover.jpg",
        segments: []
      },
      {
        source_video_id: "V000002",
        title: "已发布素材二",
        duration_ms: 180_000,
        relative_path: "ready-2.mp4",
        cover_path: ".mixlab-library/videos/V000002/cover.jpg",
        segments: []
      }
    ]
  });
  await writeManifest(libraryRoot, sourceVideoManifest({
    source_video_id: "V000003",
    title: "等待预处理素材",
    relative_path: "queued-video.mp4",
    preprocess_status: "queued",
    visible_to_cutters: false
  }));

  await withServer(libraryRoot, async (baseUrl) => {
    const queued = await getJson(baseUrl, "/api/admin/source-videos?status=queued&limit=1");

    assert.equal(queued.ok, true);
    assert.equal(queued.data.length, 1);
    assert.equal(queued.data[0].source_video_id, "V000003");
    assert.equal(queued.data[0].preprocess_status, "queued");
  });
});

test("source video query fills ready index results with matching non-ready manifests", async () => {
  const libraryRoot = await makeLibraryRoot();
  const indexRoot = path.join(libraryRoot, ".mixlab-library", "indexes", "source-transcript-index");
  const indexVersion = "v000001";
  await mkdir(path.join(indexRoot, indexVersion), { recursive: true });
  await mkdir(path.join(libraryRoot, ".mixlab-library", "videos", "V000001"), { recursive: true });
  await writeFile(
    path.join(indexRoot, "current.json"),
    `${JSON.stringify({
      library_id: "lib_main_001",
      current_version: indexVersion,
      updated_at: "2026-05-02T10:00:05.000Z"
    }, null, 2)}\n`,
    "utf8"
  );
  await writeSourceTranscriptSqliteIndex({
    index_file_path: path.join(indexRoot, indexVersion, "index.sqlite"),
    library_id: "lib_main_001",
    index_version: indexVersion,
    created_at: "2026-05-02T10:00:05.000Z",
    videos: [
      {
        source_video_id: "V000001",
        title: "已发布素材",
        duration_ms: 120_000,
        relative_path: "ready-video.mp4",
        cover_path: ".mixlab-library/videos/V000001/cover.jpg",
        segments: []
      }
    ]
  });
  await writeManifest(libraryRoot, sourceVideoManifest({
    source_video_id: "V000002",
    title: "C0326",
    relative_path: "queued/C0326.MP4",
    preprocess_status: "queued",
    visible_to_cutters: false
  }));

  await withServer(libraryRoot, async (baseUrl) => {
    const filtered = await getJson(baseUrl, "/api/admin/source-videos?query=C0326&limit=10");

    assert.equal(filtered.ok, true);
    assert.equal(filtered.data.length, 1);
    assert.equal(filtered.data[0].source_video_id, "V000002");
    assert.equal(filtered.data[0].preprocess_status, "queued");
  });
});

test("runtime CPU load uses sampled busy time instead of load average saturation", () => {
  const runtimeModule = adminApiModule as unknown as {
    runtimeCpuUsagePercentFromSamples(
      previous: { idle_ms: number; total_ms: number },
      current: { idle_ms: number; total_ms: number }
    ): number;
  };

  assert.equal(
    runtimeModule.runtimeCpuUsagePercentFromSamples(
      { idle_ms: 1_000, total_ms: 10_000 },
      { idle_ms: 1_350, total_ms: 11_000 }
    ),
    65
  );
});

test("runtime memory load uses macOS memory pressure availability when present", () => {
  const runtimeModule = adminApiModule as unknown as {
    runtimeMemoryMetricsFromMacosPressureLevel(input: {
      total_bytes: number;
      free_percent: number;
    }): { available_bytes: number; used_bytes: number; usage_percent: number };
  };

  assert.deepEqual(
    runtimeModule.runtimeMemoryMetricsFromMacosPressureLevel({
      total_bytes: 16_000,
      free_percent: 61
    }),
    {
      total_bytes: 16_000,
      available_bytes: 9_760,
      used_bytes: 6_240,
      usage_percent: 39
    }
  );
});

test("starts, reports, and stops the preprocessing supervisor through Chinese admin API", async () => {
  const libraryRoot = await makeLibraryRoot();
  let runCount = 0;

  await withServer(
    libraryRoot,
    async (baseUrl) => {
      const idle = await getJson(baseUrl, "/api/admin/preprocess/supervisor/status");
      assert.equal(idle.data.state, "idle");
      assert.equal(idle.data.state_label, "未运行");

      const started = await postJson(baseUrl, "/api/admin/preprocess/supervisor/start", { limit: 1 });
      assert.equal(started.data.state, "running");
      assert.equal(started.data.state_label, "运行中");

      await new Promise((resolve) => setTimeout(resolve, 25));

      const finished = await getJson(baseUrl, "/api/admin/preprocess/supervisor/status");
      assert.equal(finished.data.state, "idle");
      assert.equal(finished.data.last_result.total_claimed_count, 1);
      assert.equal(runCount, 1);

      const stopped = await postJson(baseUrl, "/api/admin/preprocess/supervisor/stop");
      assert.equal(stopped.data.state, "idle");
    },
    {
      async runOnce() {
        runCount += 1;
        return {
          scan_result: {
            total_video_count: 1,
            new_video_count: 0,
            existing_video_count: 1,
            source_video_ids: ["V000001"]
          },
          total_claimed_count: 1,
          succeeded_count: 1,
          failed_count: 0,
          items: []
        };
      }
    }
  );
});

test("admin preprocess supervisor responses redact temporary ASR result details", async () => {
  const libraryRoot = await makeLibraryRoot();

  await withServer(
    libraryRoot,
    async (baseUrl) => {
      await postJson(baseUrl, "/api/admin/preprocess/supervisor/start", { limit: 1 });
      await new Promise((resolve) => setTimeout(resolve, 25));

      const supervisor = await getJson(baseUrl, "/api/admin/preprocess/supervisor/status");
      const jobs = await getJson(baseUrl, "/api/admin/preprocess/jobs");
      const supervisorJson = JSON.stringify(supervisor);
      const jobsJson = JSON.stringify(jobs);

      assert.deepEqual(supervisor.data.last_result, {
        total_claimed_count: 1,
        succeeded_count: 1,
        failed_count: 0
      });
      assert.deepEqual(jobs.data.supervisor.last_result, {
        total_claimed_count: 1,
        succeeded_count: 1,
        failed_count: 0
      });

      for (const serialized of [supervisorJson, jobsJson]) {
        assert.equal(serialized.includes("transcription_url"), false);
        assert.equal(serialized.includes("audio_file_url"), false);
        assert.equal(serialized.includes("audio_object_key"), false);
        assert.equal(serialized.includes("Signature="), false);
        assert.equal(serialized.includes("security-token"), false);
        assert.equal(serialized.includes("dashscope-instant"), false);
      }
    },
    {
      async runOnce() {
        return {
          scan_result: {
            total_video_count: 1,
            new_video_count: 0,
            existing_video_count: 1,
            source_video_ids: ["V000001"]
          },
          total_claimed_count: 1,
          succeeded_count: 1,
          failed_count: 0,
          items: [{
            status: "succeeded",
            source_video_id: "V000001",
            source_video_path: "/Volumes/素材/C001.mp4",
            result: {
              source_video_id: "V000001",
              audio_path: ".mixlab-library/videos/V000001/asr-audio/audio.mp3",
              audio_object_key: "dashscope-instant/private/audio.mp3",
              audio_file_url: "oss://dashscope-instant/private/audio.mp3",
              asr_task_id: "task-secret",
              transcription_url: "https://example.com/result.json?Signature=secret&security-token=secret",
              transcript_path: ".mixlab-library/videos/V000001/transcript.json",
              srt_path: ".mixlab-library/videos/V000001/subtitles.srt",
              duration_ms: 1000,
              segment_count: 1
            }
          }]
        };
      }
    }
  );
});

test("preprocess jobs expose observable production estimates in Chinese", async () => {
  const libraryRoot = await makeLibraryRoot();
  const videoRoot = path.join(libraryRoot, ".mixlab-library", "videos");

  for (const manifest of [
    sourceVideoManifest({
      source_video_id: "V000001",
      title: "正在处理的视频",
      preprocess_status: "processing",
      visible_to_cutters: false
    }),
    sourceVideoManifest({
      source_video_id: "V000002",
      title: "第一条等待视频",
      preprocess_status: "queued",
      visible_to_cutters: false
    }),
    sourceVideoManifest({
      source_video_id: "V000003",
      title: "已经完成的视频",
      preprocess_status: "ready",
      visible_to_cutters: true
    }),
    sourceVideoManifest({
      source_video_id: "V000004",
      title: "第二条等待视频",
      preprocess_status: "queued",
      visible_to_cutters: false
    })
  ]) {
    await writeManifest(libraryRoot, manifest);
  }

  const writeJob = async (sourceVideoId: string, job: Record<string, unknown>) => {
    await mkdir(path.join(videoRoot, sourceVideoId), { recursive: true });
    await writeFile(
      path.join(videoRoot, sourceVideoId, "preprocess-job.json"),
      `${JSON.stringify({ source_video_id: sourceVideoId, attempt: 1, ...job }, null, 2)}\n`,
      "utf8"
    );
  };
  await writeJob("V000001", {
    worker_id: "admin-worker-test",
    status: "processing",
    claimed_at: "2026-05-02T11:55:00.000Z",
    current_stage: "upload-audio",
    stage_updated_at: "2026-05-02T11:58:00.000Z",
    error_stage: "asr"
  });
  await appendPreprocessJobLog({
    library_root: libraryRoot,
    source_video_id: "V000001",
    now: "2026-05-02T11:58:00.000Z",
    stage: "upload-audio",
    message: "stage changed to upload-audio"
  });
  await writeJob("V000002", {
    worker_id: "admin-worker-test",
    status: "queued",
    claimed_at: "2026-05-02T12:00:00.000Z"
  });
  await writeJob("V000003", {
    worker_id: "admin-worker-test",
    status: "ready",
    claimed_at: "2026-05-02T11:40:00.000Z",
    completed_at: "2026-05-02T11:50:00.000Z",
    indexed_at: "2026-05-02T11:51:00.000Z"
  });
  await writeJob("V000004", {
    worker_id: "admin-worker-test",
    status: "queued",
    claimed_at: "2026-05-02T12:00:00.000Z"
  });

  await withServer(libraryRoot, async (baseUrl) => {
    const response = await getJson(baseUrl, "/api/admin/preprocess/jobs");

    assert.equal(response.ok, true);
    assert.equal(response.data.observability.running_job_id, "J000001");
    assert.equal(response.data.observability.running_source_video_id, "V000001");
    assert.equal(response.data.observability.estimated_all_done_at, "2026-05-02T12:25:00.000Z");
    assert.equal(response.data.observability.estimated_queue_duration_ms, 1_500_000);
    assert.match(response.data.observability.throughput_label, /预计 25:00 完成当前队列/);
    assert.match(response.data.observability.load_advice, /运行负荷正常|负荷|磁盘空间不足/);

    const running = response.data.jobs.find((job: any) => job.source_video_id === "V000001");
    assert.equal(running.status_label, "正在处理");
    assert.equal(running.stage, "upload-audio");
    assert.equal(running.stage_label, "上传音频");
    assert.equal(running.elapsed_ms, 300_000);
    assert.equal(running.estimated_remaining_ms, 300_000);
    assert.equal(running.estimated_done_at, "2026-05-02T12:05:00.000Z");
    assert.equal(running.log_path, ".mixlab-library/logs/V000001.log");
    assert.equal(running.log_url, "/api/admin/preprocess/jobs/J000001/log");
    assert.ok(running.progress >= 35);

    const log = await getJson(baseUrl, running.log_url);
    assert.equal(log.ok, true);
    assert.equal(log.data.job_id, "J000001");
    assert.equal(log.data.source_video_id, "V000001");
    assert.equal(log.data.exists, true);
    assert.equal(log.data.path, ".mixlab-library/logs/V000001.log");
    assert.match(log.data.content, /upload-audio\tstage changed to upload-audio/);

    const queued = response.data.jobs.find((job: any) => job.source_video_id === "V000002");
    assert.equal(queued.status_label, "等待处理");
    assert.equal(queued.stage_label, "等待处理");
    assert.equal(queued.queue_position, 1);
    assert.equal(queued.estimated_start_at, "2026-05-02T12:05:00.000Z");
    assert.equal(queued.estimated_done_at, "2026-05-02T12:15:00.000Z");
  });
});

test("preprocess job log endpoint falls back to a real task record snapshot", async () => {
  const libraryRoot = await makeLibraryRoot();

  await writeManifest(libraryRoot, sourceVideoManifest({
    source_video_id: "V000001",
    title: "历史预处理任务",
    preprocess_status: "processing",
    visible_to_cutters: false
  }));
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "preprocess-job.json"),
    `${JSON.stringify({
      source_video_id: "V000001",
      worker_id: "worker-a",
      status: "processing",
      attempt: 1,
      claimed_at: "2026-05-02T11:55:00.000Z",
      current_stage: "asr",
      stage_updated_at: "2026-05-02T11:58:00.000Z"
    }, null, 2)}\n`,
    "utf8"
  );

  await withServer(libraryRoot, async (baseUrl) => {
    const log = await getJson(baseUrl, "/api/admin/preprocess/jobs/J000001/log");

    assert.equal(log.ok, true);
    assert.equal(log.data.job_id, "J000001");
    assert.equal(log.data.source_video_id, "V000001");
    assert.equal(log.data.exists, false);
    assert.equal(log.data.record_source, "preprocess-job");
    assert.equal(log.data.path, ".mixlab-library/logs/V000001.log");
    assert.match(log.data.content, /MixLab preprocess task record snapshot/);
    assert.match(log.data.content, /title: 历史预处理任务/);
    assert.match(log.data.content, /manifest_status: processing/);
    assert.match(log.data.content, /current_stage: asr/);
  });
});

test("preprocess jobs eventually include processing videos outside the requested manifest page", async () => {
  const libraryRoot = await makeLibraryRoot();

  for (let index = 1; index <= 8; index += 1) {
    const sourceVideoId = `V${String(index).padStart(6, "0")}`;
    await writeManifest(libraryRoot, sourceVideoManifest({
      source_video_id: sourceVideoId,
      title: sourceVideoId === "V000008" ? "分页外停滞任务" : `普通视频 ${index}`,
      preprocess_status: sourceVideoId === "V000008" ? "processing" : "queued",
      visible_to_cutters: false
    }));
  }

  await withServer(libraryRoot, async (baseUrl) => {
    const first = await getJson(baseUrl, "/api/admin/preprocess/jobs?limit=5");
    assert.equal(first.ok, true);

    let running: any | undefined;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      const response = await getJson(baseUrl, "/api/admin/preprocess/jobs?limit=5");
      running = response.data.jobs.find((job: any) => job.source_video_id === "V000008");
      if (running) {
        break;
      }
    }

    assert.ok(running);
    assert.equal(running.title, "分页外停滞任务");
    assert.equal(running.status, "running");
    assert.equal(running.status_label, "正在处理");
  });
});

test("preprocess jobs warm far processing rows in the background without blocking the first page", async () => {
  const libraryRoot = await makeLibraryRoot();

  for (let index = 1; index <= 150; index += 1) {
    const sourceVideoId = `V${String(index).padStart(6, "0")}`;
    await writeManifest(libraryRoot, sourceVideoManifest({
      source_video_id: sourceVideoId,
      title: sourceVideoId === "V000150" ? "远端停滞任务" : `普通视频 ${index}`,
      preprocess_status: sourceVideoId === "V000150" ? "processing" : "queued",
      visible_to_cutters: false
    }));
  }
  await mkdir(path.join(libraryRoot, ".mixlab-library"), { recursive: true });
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "library.json"),
    `${JSON.stringify({
      library_id: "lib_main_001",
      name: "测试素材库",
      version: "1.0",
      created_at: "2026-05-02T12:00:00.000Z",
      updated_at: "2026-05-02T12:00:00.000Z",
      video_count: 150,
      ready_video_count: 0,
      processing_video_count: 1,
      queued_video_count: 149,
      unprocessed_video_count: 0,
      failed_video_count: 0,
      index_required_video_count: 0
    }, null, 2)}\n`,
    "utf8"
  );

  await withServer(libraryRoot, async (baseUrl) => {
    const first = await getJson(baseUrl, "/api/admin/preprocess/jobs?limit=5");
    assert.equal(first.ok, true);
    assert.equal(first.data.active_count, 1);

    let warmed: any | undefined;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      const response = await getJson(baseUrl, "/api/admin/preprocess/jobs?limit=5");
      warmed = response.data.jobs.find((job: any) => job.source_video_id === "V000150");
      if (warmed) {
        break;
      }
    }

    assert.ok(warmed);
    assert.equal(warmed.title, "远端停滞任务");
    assert.equal(warmed.status, "running");
  });
});

test("admin preprocess pipeline keeps cycling with concurrency one and auto publishes ready videos", async () => {
  const libraryRoot = await makeLibraryRoot();
  await mkdir(path.join(libraryRoot, "source-videos"), { recursive: true });
  await writeFile(path.join(libraryRoot, "source-videos", "a.mp4"), "video-a");
  await writeFile(path.join(libraryRoot, "source-videos", "b.mp4"), "video-b");
  let nowIndex = 0;
  let cycleCount = 0;

  const result = await runAdminPreprocessPipeline({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "测试素材库",
    runtime_policy: {
      audio_mode: "mp3_16k_mono_64k",
      concurrent_jobs: 1,
      auto_scan_enabled: false,
      auto_queue_enabled: false,
      auto_publish_index_enabled: true
    },
    now: () => `2026-05-02T12:${String(nowIndex++).padStart(2, "0")}:00.000Z`,
    media: {
      async create_cover(input) {
        await mkdir(path.dirname(input.output_path), { recursive: true });
        await writeFile(input.output_path, `cover ${path.basename(input.source_path)}`);
      }
    },
    async run_worker_cycle(workerInput) {
      cycleCount += 1;
      assert.equal(workerInput.limit, 1);
      assert.equal(workerInput.scan_before_claim, false);
      assert.deepEqual(workerInput.claim_statuses, ["queued"]);

      return runLibraryTextPreprocessWorker({
        ...workerInput,
        async probe_source_video() {
          return {
            duration_ms: 4_000,
            width: 1280,
            height: 720,
            fps: 25,
            codec: "h264"
          };
        },
        async get_content_hash(sourceVideoPath) {
          return `sha256:${path.basename(sourceVideoPath)}`;
        },
        async preprocess_source_video(input) {
          await writeTranscriptArtifacts(libraryRoot, input.source_video_id);
          return {
            source_video_id: input.source_video_id,
            audio_path: `.mixlab-library/videos/${input.source_video_id}/asr-audio/audio.mp3`,
            audio_object_key: `temporary/${input.source_video_id}/audio.mp3`,
            audio_file_url: `oss://temporary/${input.source_video_id}/audio.mp3`,
            asr_task_id: `task-${input.source_video_id}`,
            transcription_url: `https://example.com/${input.source_video_id}.json`,
            transcript_path: `.mixlab-library/videos/${input.source_video_id}/transcript.json`,
            srt_path: `.mixlab-library/videos/${input.source_video_id}/subtitles.srt`,
            duration_ms: 4_000,
            segment_count: 1
          };
        }
      });
    }
  });

  assert.equal(result.total_claimed_count, 2);
  assert.equal(result.succeeded_count, 2);
  assert.equal(result.failed_count, 0);
  assert.equal(result.published_count, 2);
  assert.equal(cycleCount, 3);

  const manifestA = JSON.parse(
    await readFile(path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json"), "utf8")
  );
  const manifestB = JSON.parse(
    await readFile(path.join(libraryRoot, ".mixlab-library", "videos", "V000002", "source-video.json"), "utf8")
  );
  assert.equal(manifestA.preprocess_status, "ready");
  assert.equal(manifestA.visible_to_cutters, true);
  assert.equal(manifestB.preprocess_status, "ready");
  assert.equal(manifestB.visible_to_cutters, true);
});

test("admin preprocess pipeline stops at the next safe video boundary", async () => {
  const libraryRoot = await makeLibraryRoot();
  await mkdir(path.join(libraryRoot, "source-videos"), { recursive: true });
  await writeFile(path.join(libraryRoot, "source-videos", "a.mp4"), "video-a");
  await writeFile(path.join(libraryRoot, "source-videos", "b.mp4"), "video-b");
  let nowIndex = 0;
  let cycleCount = 0;
  let shouldStop = false;

  const result = await runAdminPreprocessPipeline({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "测试素材库",
    runtime_policy: {
      audio_mode: "mp3_16k_mono_64k",
      concurrent_jobs: 1,
      auto_scan_enabled: false,
      auto_queue_enabled: false,
      auto_publish_index_enabled: true
    },
    should_stop: () => shouldStop,
    now: () => `2026-05-02T13:${String(nowIndex++).padStart(2, "0")}:00.000Z`,
    media: {
      async create_cover(input) {
        await mkdir(path.dirname(input.output_path), { recursive: true });
        await writeFile(input.output_path, `cover ${path.basename(input.source_path)}`);
      }
    },
    async run_worker_cycle(workerInput) {
      cycleCount += 1;
      const cycleResult = await runLibraryTextPreprocessWorker({
        ...workerInput,
        async probe_source_video() {
          return {
            duration_ms: 4_000,
            width: 1280,
            height: 720,
            fps: 25,
            codec: "h264"
          };
        },
        async get_content_hash(sourceVideoPath) {
          return `sha256:${path.basename(sourceVideoPath)}`;
        },
        async preprocess_source_video(input) {
          await writeTranscriptArtifacts(libraryRoot, input.source_video_id);
          return {
            source_video_id: input.source_video_id,
            audio_path: `.mixlab-library/videos/${input.source_video_id}/asr-audio/audio.mp3`,
            audio_object_key: `temporary/${input.source_video_id}/audio.mp3`,
            audio_file_url: `oss://temporary/${input.source_video_id}/audio.mp3`,
            asr_task_id: `task-${input.source_video_id}`,
            transcription_url: `https://example.com/${input.source_video_id}.json`,
            transcript_path: `.mixlab-library/videos/${input.source_video_id}/transcript.json`,
            srt_path: `.mixlab-library/videos/${input.source_video_id}/subtitles.srt`,
            duration_ms: 4_000,
            segment_count: 1
          };
        }
      });

      shouldStop = true;
      return cycleResult;
    }
  });

  assert.equal(cycleCount, 1);
  assert.equal(result.total_claimed_count, 1);
  assert.equal(result.succeeded_count, 1);
  assert.equal(result.published_count, 1);

  const firstManifest = JSON.parse(
    await readFile(path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json"), "utf8")
  );
  const secondManifest = JSON.parse(
    await readFile(path.join(libraryRoot, ".mixlab-library", "videos", "V000002", "source-video.json"), "utf8")
  );
  assert.equal(firstManifest.preprocess_status, "ready");
  assert.equal(firstManifest.visible_to_cutters, true);
  assert.equal(secondManifest.preprocess_status, "queued");
  assert.equal(secondManifest.visible_to_cutters, false);
});

test("refuses to start real preprocessing when DashScope key is missing", async () => {
  const libraryRoot = await makeLibraryRoot();
  const server = createAdminApiServer({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "测试素材库",
    now: () => "2026-05-02T12:00:00.000Z",
    env: {} as NodeJS.ProcessEnv
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const response = await postJson(
      `http://127.0.0.1:${(address as AddressInfo).port}`,
      "/api/admin/preprocess/supervisor/start",
      { limit: 1 }
    );
    assert.equal(response.ok, false);
    assert.equal(response.error_code, "invalid_request");
    assert.match(response.message, /语音识别接口密钥未配置/);
  } finally {
    server.close();
    await once(server, "close");
  }
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
    assert.equal(metadata.data.description, "剪辑端卡片说明");
    assert.equal(metadata.data.lecturer, "李老师");
    assert.equal(metadata.data.course, "经营课");
    assert.equal(metadata.data.category, "财务");

    const renamed = await patchJson(baseUrl, "/api/admin/source-videos/V000001/metadata", {
      title: "现金流管理新版"
    });
    assert.equal(renamed.data.title, "现金流管理新版");
    assert.deepEqual(renamed.data.tags, ["现金流", "财务"]);
    assert.equal(renamed.data.description, "剪辑端卡片说明");
    assert.equal(renamed.data.lecturer, "李老师");
    assert.equal(renamed.data.course, "经营课");
    assert.equal(renamed.data.category, "财务");

    const manifest = JSON.parse(
      await readFile(
        path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json"),
        "utf8"
      )
    );
    assert.equal(manifest.preprocess_status, "queued");
    assert.equal(manifest.title, "现金流管理新版");
    assert.deepEqual(manifest.tags, ["现金流", "财务"]);
    assert.equal(manifest.description, "剪辑端卡片说明");
    assert.equal(manifest.lecturer, "李老师");
    assert.equal(manifest.course, "经营课");
    assert.equal(manifest.category, "财务");
    assert.equal(manifest.visible_to_cutters, false);

    const list = await getJson(baseUrl, "/api/admin/source-videos?limit=1");
    assert.equal(list.data[0].title, "现金流管理新版");
    assert.deepEqual(list.data[0].tags, ["现金流", "财务"]);
    assert.equal(list.data[0].description, "剪辑端卡片说明");

    const detail = await getJson(baseUrl, "/api/admin/source-videos/V000001");
    assert.equal(detail.data.source_video.title, "现金流管理新版");
    assert.equal(detail.data.source_video.lecturer, "李老师");
    assert.equal(detail.data.source_video.course, "经营课");
    assert.equal(detail.data.source_video.category, "财务");
  });
});

test("queues and retries a single source video without mutating unrelated rows", async () => {
  const libraryRoot = await makeLibraryRoot();

  await writeManifest(libraryRoot, sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "unprocessed",
    visible_to_cutters: false
  }));
  await writeManifest(libraryRoot, sourceVideoManifest({
    source_video_id: "V000002",
    title: "失败视频",
    preprocess_status: "failed",
    visible_to_cutters: false
  }));
  await writeManifest(libraryRoot, sourceVideoManifest({
    source_video_id: "V000003",
    title: "停滞视频",
    preprocess_status: "processing",
    visible_to_cutters: false
  }));
  await writeManifest(libraryRoot, sourceVideoManifest({
    source_video_id: "V000004",
    title: "另一个停滞视频",
    preprocess_status: "processing",
    visible_to_cutters: false
  }));

  await withServer(libraryRoot, async (baseUrl) => {
    const queued = await postJson(baseUrl, "/api/admin/source-videos/V000001/queue");
    assert.equal(queued.ok, true);
    assert.deepEqual(queued.data.source_video_ids, ["V000001"]);
    assert.equal(queued.data.affected_count, 1);

    const retry = await postJson(baseUrl, "/api/admin/source-videos/V000002/retry");
    assert.equal(retry.ok, true);
    assert.deepEqual(retry.data.source_video_ids, ["V000002"]);
    assert.equal(retry.data.affected_count, 1);

    const recoveredSingle = await postJson(baseUrl, "/api/admin/source-videos/V000003/recover-processing");
    assert.equal(recoveredSingle.ok, true);
    assert.deepEqual(recoveredSingle.data.source_video_ids, ["V000003"]);
    assert.equal(recoveredSingle.data.affected_count, 1);

    const recoveredBulk = await postJson(baseUrl, "/api/admin/preprocess/recover-processing");
    assert.equal(recoveredBulk.ok, true);
    assert.deepEqual(recoveredBulk.data.source_video_ids, ["V000004"]);
    assert.equal(recoveredBulk.data.affected_count, 1);

    const first = await getJson(baseUrl, "/api/admin/source-videos/V000001");
    const second = await getJson(baseUrl, "/api/admin/source-videos/V000002");
    const third = await getJson(baseUrl, "/api/admin/source-videos/V000003");
    const fourth = await getJson(baseUrl, "/api/admin/source-videos/V000004");
    assert.equal(first.data.preprocess.status, "queued");
    assert.equal(second.data.preprocess.status, "queued");
    assert.equal(third.data.preprocess.status, "queued");
    assert.equal(fourth.data.preprocess.status, "queued");

    const firstLog = await getJson(baseUrl, "/api/admin/preprocess/jobs/J000001/log");
    const secondLog = await getJson(baseUrl, "/api/admin/preprocess/jobs/J000002/log");
    const thirdLog = await getJson(baseUrl, "/api/admin/preprocess/jobs/J000003/log");
    const fourthLog = await getJson(baseUrl, "/api/admin/preprocess/jobs/J000004/log");
    assert.match(firstLog.data.content, /queued-by-admin\tunprocessed -> queued/);
    assert.match(secondLog.data.content, /retry-by-admin\tfailed -> queued/);
    assert.match(thirdLog.data.content, /recover-processing-by-admin\tprocessing -> queued/);
    assert.match(fourthLog.data.content, /recover-processing-by-admin\tprocessing -> queued/);
  });
});

test("admin index publish prepares missing cover and keyframes before publishing", async () => {
  const libraryRoot = await makeLibraryRoot();
  await mkdir(path.join(libraryRoot, "source-videos"), { recursive: true });
  await writeFile(path.join(libraryRoot, "source-videos", "cashflow.mp4"), "video");
  await writeTranscriptArtifacts(libraryRoot, "V000001");
  await writeManifest(libraryRoot, sourceVideoManifest({
    source_video_id: "V000001",
    relative_path: "cashflow.mp4",
    preprocess_status: "index-required",
    visible_to_cutters: false,
    transcript_path: ".mixlab-library/videos/V000001/transcript.json",
    srt_path: ".mixlab-library/videos/V000001/subtitles.srt",
    cover_path: "",
    keyframes_path: ""
  }));

  await withServer(
    libraryRoot,
    async (baseUrl) => {
      const published = await postJson(baseUrl, "/api/admin/index/repair");
      assert.equal(published.ok, true);
      assert.equal(published.data.published_count, 1);
      assert.equal(published.data.skipped_count, 0);
      assert.deepEqual(published.data.published_source_video_ids, ["V000001"]);
      assert.match(published.data.message, /已发布 1 个原视频/);

      const detail = await getJson(baseUrl, "/api/admin/source-videos/V000001");
      assert.equal(detail.data.preprocess.status, "ready");
      assert.equal(detail.data.visibility.visible_to_cutters, true);
      assert.equal(detail.data.artifacts.cover.exists, true);
      assert.equal(detail.data.artifacts.keyframes.exists, true);

      const versions = await getJson(baseUrl, "/api/admin/index/versions");
      assert.equal(versions.data.current_version, published.data.index_version);
      assert.equal(versions.data.current_validation_status, "pass");
      assert.match(versions.data.current_validation_message, /current\.json 指向 v000001/);
      assert.equal(versions.data.versions[0].validation_status, "pass");
      assert.equal(versions.data.versions[0].validation_message, "索引包校验通过");
    },
    undefined,
    {
      async create_cover(input) {
        await mkdir(path.dirname(input.output_path), { recursive: true });
        await writeFile(input.output_path, `cover from ${path.basename(input.source_path)}`);
      }
    }
  );
});

test("admin index versions expose current pointer and package validation details", async () => {
  const libraryRoot = await makeLibraryRoot();
  const indexRoot = path.join(libraryRoot, ".mixlab-library", "indexes", "source-transcript-index");

  await mkdir(path.join(indexRoot, "v000001"), { recursive: true });
  await writeFile(
    path.join(indexRoot, "v000001", "index-manifest.json"),
    `${JSON.stringify({
      index_version: "v000001",
      library_id: "lib_main_001",
      created_at: "2026-05-02T10:00:00.000Z",
      ready_video_count: 2,
      source_video_ids: ["V000001"],
      schema_version: ""
    }, null, 2)}\n`,
    "utf8"
  );

  await mkdir(path.join(indexRoot, "v000002"), { recursive: true });
  await writeFile(
    path.join(indexRoot, "v000002", "index-manifest.json"),
    `${JSON.stringify({
      index_version: "v000002",
      library_id: "lib_main_001",
      created_at: "2026-05-02T10:05:00.000Z",
      ready_video_count: 0,
      source_video_ids: [],
      schema_version: "1.0"
    }, null, 2)}\n`,
    "utf8"
  );
  await writeSourceTranscriptSqliteIndex({
    index_file_path: path.join(indexRoot, "v000002", "index.sqlite"),
    library_id: "lib_main_001",
    index_version: "v000002",
    created_at: "2026-05-02T10:05:00.000Z",
    videos: []
  });

  await writeFile(
    path.join(indexRoot, "current.json"),
    `${JSON.stringify({
      library_id: "lib_main_001",
      current_version: "v000003",
      updated_at: "2026-05-02T10:06:00.000Z"
    }, null, 2)}\n`,
    "utf8"
  );

  await withServer(libraryRoot, async (baseUrl) => {
    const response = await getJson(baseUrl, "/api/admin/index/versions");

    assert.equal(response.ok, true);
    assert.equal(response.data.current_version, "v000003");
    assert.equal(response.data.current_validation_status, "fail");
    assert.match(response.data.current_validation_message, /current\.json 指向不存在的索引版本/);

    const broken = response.data.versions.find((version: any) => version.index_version === "v000001");
    assert.equal(broken.validation_status, "fail");
    assert.match(broken.validation_message, /ready_video_count 与 source_video_ids 数量不一致/);
    assert.match(broken.validation_message, /schema_version 缺失/);
    assert.match(broken.validation_message, /index\.sqlite 不存在/);

    const valid = response.data.versions.find((version: any) => version.index_version === "v000002");
    assert.equal(valid.validation_status, "pass");
    assert.equal(valid.validation_message, "索引包校验通过");
    assert.equal(valid.ready_video_count, 0);
  });
});

test("admin index versions default to recent packages while keeping current visible", async () => {
  const libraryRoot = await makeLibraryRoot();
  const indexRoot = path.join(libraryRoot, ".mixlab-library", "indexes", "source-transcript-index");

  for (let index = 1; index <= 85; index += 1) {
    const indexVersion = `v${String(index).padStart(6, "0")}`;
    await mkdir(path.join(indexRoot, indexVersion), { recursive: true });
    await writeFile(
      path.join(indexRoot, indexVersion, "index-manifest.json"),
      `${JSON.stringify({
        index_version: indexVersion,
        library_id: "lib_main_001",
        created_at: "2026-05-02T10:00:00.000Z",
        ready_video_count: 0,
        source_video_ids: [],
        schema_version: "1.0"
      }, null, 2)}\n`,
      "utf8"
    );
  }
  await writeFile(
    path.join(indexRoot, "current.json"),
    `${JSON.stringify({
      library_id: "lib_main_001",
      current_version: "v000001",
      updated_at: "2026-05-02T10:06:00.000Z"
    }, null, 2)}\n`,
    "utf8"
  );

  await withServer(libraryRoot, async (baseUrl) => {
    const response = await getJson(baseUrl, "/api/admin/index/versions");

    assert.equal(response.ok, true);
    assert.equal(response.data.total_count, 85);
    assert.equal(response.data.limit, 80);
    assert.equal(response.data.has_more, true);
    assert.equal(response.data.versions.length, 81);
    assert(response.data.versions.some((version: any) => version.index_version === "v000085"));
    assert(response.data.versions.some((version: any) => version.index_version === "v000001"));
    assert.equal(
      response.data.versions.find((version: any) => version.index_version === "v000001").is_current,
      true
    );
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

test("persists admin settings config through API", async () => {
  const libraryRoot = await makeLibraryRoot();

  await withServer(libraryRoot, async (baseUrl) => {
    const current = await getJson(baseUrl, "/api/admin/settings/config");
    const defaultSource = current.data.source_folders[0];
    const saved = await patchJson(baseUrl, "/api/admin/settings/config", {
      library_name: "课程公共素材库",
      source_folders: [
        {
          ...defaultSource,
          name: "主课程素材",
          path: path.join(libraryRoot, "main-videos"),
          enabled: true
        },
        {
          id: "src_002",
          name: "外部课程素材",
          path: "/Volumes/CourseVideos",
          enabled: false
        }
      ],
      runtime_policy: {
        audio_mode: "wav_16k_mono_pcm_s16le",
        concurrent_jobs: 3,
        auto_scan_enabled: true,
        auto_queue_enabled: true,
        auto_publish_index_enabled: false
      }
    });

    assert.equal(saved.ok, true);
    assert.equal(saved.data.library_name, "课程公共素材库");
    assert.equal(saved.data.source_folders.length, 2);
    assert.equal(saved.data.source_folders[0].name, "主课程素材");
    assert.equal(saved.data.source_folders[1].path, "/Volumes/CourseVideos");
    assert.equal(saved.data.runtime_policy.audio_mode, "wav_16k_mono_pcm_s16le");
    assert.equal(saved.data.runtime_policy.concurrent_jobs, 3);

    const persisted = await getJson(baseUrl, "/api/admin/settings/config");
    assert.equal(persisted.data.library_name, "课程公共素材库");
    assert.equal(persisted.data.source_folders[1].enabled, false);
    assert.equal(persisted.data.runtime_policy.auto_queue_enabled, true);
  });
});

test("persists speech recognition key through settings API without echoing the secret", async () => {
  const libraryRoot = await makeLibraryRoot();
  const env: NodeJS.ProcessEnv = {
    MIXLAB_ASR_MODEL: "paraformer-v2"
  };

  await withServerEnv(libraryRoot, env, async (baseUrl) => {
    const before = await postJson(baseUrl, "/api/admin/settings/test-asr");
    assert.equal(before.data.passed, false);

    const current = await getJson(baseUrl, "/api/admin/settings/config");
    const saved = await patchJson(baseUrl, "/api/admin/settings/config", {
      library_name: current.data.library_name,
      source_folders: current.data.source_folders,
      runtime_policy: current.data.runtime_policy,
      asr: {
        dashscope_api_key: "  sk-live-secret  "
      }
    });

    assert.equal(saved.ok, true);
    assert.equal(JSON.stringify(saved).includes("sk-live-secret"), false);
    assert.equal(env.DASHSCOPE_API_KEY, "sk-live-secret");

    const runtime = await getJson(baseUrl, "/api/admin/settings/runtime");
    assert.equal(runtime.data.asr.dashscope_api_key_configured, true);

    const after = await postJson(baseUrl, "/api/admin/settings/test-asr");
    assert.equal(after.data.passed, true);
    assert.equal(JSON.stringify(after).includes("sk-live-secret"), false);
  });
});

test("runtime settings reflect saved ASR audio mode and latest ASR failure", async () => {
  const libraryRoot = await makeLibraryRoot();

  for (const manifest of [
    sourceVideoManifest({
      source_video_id: "V000001",
      title: "较早 ASR 失败",
      preprocess_status: "failed",
      visible_to_cutters: false
    }),
    sourceVideoManifest({
      source_video_id: "V000002",
      title: "最新 ASR 失败",
      preprocess_status: "failed",
      visible_to_cutters: false
    }),
    sourceVideoManifest({
      source_video_id: "V000003",
      title: "非 ASR 失败",
      preprocess_status: "failed",
      visible_to_cutters: false
    })
  ]) {
    await writeManifest(libraryRoot, manifest);
  }

  const writeJob = async (sourceVideoId: string, job: Record<string, unknown>) => {
    await mkdir(path.join(libraryRoot, ".mixlab-library", "videos", sourceVideoId), { recursive: true });
    await writeFile(
      path.join(libraryRoot, ".mixlab-library", "videos", sourceVideoId, "preprocess-job.json"),
      `${JSON.stringify({ source_video_id: sourceVideoId, attempt: 1, status: "failed", ...job }, null, 2)}\n`,
      "utf8"
    );
  };
  await writeJob("V000001", {
    failed_at: "2026-05-02T10:00:00.000Z",
    error_stage: "asr",
    error_message: "DashScope ASR 排队超时"
  });
  await writeJob("V000002", {
    failed_at: "2026-05-02T11:00:00.000Z",
    error_stage: "asr",
    error_message: "DashScope ASR 网络超时"
  });
  await writeJob("V000003", {
    failed_at: "2026-05-02T12:00:00.000Z",
    error_stage: "ffmpeg",
    error_message: "FFmpeg 失败"
  });

  await withServer(libraryRoot, async (baseUrl) => {
    const current = await getJson(baseUrl, "/api/admin/settings/config");
    const saved = await patchJson(baseUrl, "/api/admin/settings/config", {
      library_name: current.data.library_name,
      source_folders: current.data.source_folders,
      runtime_policy: {
        ...current.data.runtime_policy,
        audio_mode: "wav_16k_mono_pcm_s16le"
      }
    });
    assert.equal(saved.ok, true);

    const runtime = await getJson(baseUrl, "/api/admin/settings/runtime");
    assert.equal(runtime.data.asr.audio_mode, "wav_16k_mono_pcm_s16le");
    assert.equal(runtime.data.asr.last_failure_reason, "V000002 DashScope ASR 网络超时");
  });
});

test("library status and path checks follow configured source folders", async () => {
  const libraryRoot = await makeLibraryRoot();
  const externalSource = path.join(libraryRoot, "external-source");
  await mkdir(externalSource, { recursive: true });

  await withServer(libraryRoot, async (baseUrl) => {
    const current = await getJson(baseUrl, "/api/admin/settings/config");
    await patchJson(baseUrl, "/api/admin/settings/config", {
      library_name: current.data.library_name,
      source_folders: [
        {
          ...current.data.source_folders[0],
          name: "外部素材来源",
          path: externalSource,
          enabled: true
        }
      ],
      runtime_policy: current.data.runtime_policy
    });

    const status = await getJson(baseUrl, "/api/admin/library/status");
    assert.equal(status.data.source_videos_path, externalSource);

    const checks = await getJson(baseUrl, "/api/admin/library/path-checks");
    assert.equal(checks.data.some((item: { path: string }) => item.path === externalSource), true);
    assert.equal(checks.data.some((item: { label: string }) => item.label === "source-videos"), false);
  });
});

test("mutates source folders through API", async () => {
  const libraryRoot = await makeLibraryRoot();

  await withServer(libraryRoot, async (baseUrl) => {
    const added = await postJson(baseUrl, "/api/admin/settings/source-folders", {
      name: "课程素材",
      path: "/Volumes/CourseVideos",
      enabled: true
    });

    assert.equal(added.ok, true);
    assert.equal(added.data.source_folders[1].id, "src_002");
    assert.equal(added.data.source_folders[1].name, "课程素材");

    const updated = await patchJson(baseUrl, "/api/admin/settings/source-folders/src_002", {
      name: "课程素材归档",
      enabled: false
    });

    assert.equal(updated.ok, true);
    assert.equal(updated.data.source_folders[1].name, "课程素材归档");
    assert.equal(updated.data.source_folders[1].enabled, false);

    const removed = await deleteJson(baseUrl, "/api/admin/settings/source-folders/src_002");

    assert.equal(removed.ok, true);
    assert.equal(removed.data.source_folders.length, 1);
    assert.equal(removed.data.source_folders[0].id, "src_default");
  });
});

test("returns Chinese settings validation errors", async () => {
  const libraryRoot = await makeLibraryRoot();

  await withServer(libraryRoot, async (baseUrl) => {
    const current = await getJson(baseUrl, "/api/admin/settings/config");
    const invalidPath = await patchJson(baseUrl, "/api/admin/settings/config", {
      source_folders: [
        {
          ...current.data.source_folders[0],
          path: "relative/source"
        }
      ]
    });

    assert.equal(invalidPath.ok, false);
    assert.equal(invalidPath.error_code, "invalid_request");
    assert.match(invalidPath.message, /素材来源路径必须是绝对路径/);

    const missingFolder = await patchJson(baseUrl, "/api/admin/settings/source-folders/src_999", {
      name: "不存在"
    });

    assert.equal(missingFolder.ok, false);
    assert.equal(missingFolder.error_code, "not_found");
    assert.match(missingFolder.message, /素材来源不存在/);

    const defaultRemoval = await deleteJson(baseUrl, "/api/admin/settings/source-folders/src_default");

    assert.equal(defaultRemoval.ok, false);
    assert.equal(defaultRemoval.error_code, "invalid_request");
    assert.match(defaultRemoval.message, /默认素材来源不能移除/);
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
    search_mode: "searchd",
    search_elapsed_ms: 37,
    result_status: "success"
  });
  await appendUsageEvent(libraryRoot, {
    user_id: "CU000001",
    username: "zhangsan",
    device_id: "device-a",
    event_type: "search",
    occurred_at: "2026-05-02T11:00:05.000Z",
    query: "现金流",
    search_mode: "searchd",
    search_page_type: "cursor",
    search_elapsed_ms: 120,
    result_status: "failure"
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
    assert.equal(metrics.data.usage.search_request_count, 1);
    assert.equal(metrics.data.usage.search_hit_count, 1);
    assert.equal(metrics.data.usage.search_failure_count, 1);
    assert.equal(metrics.data.usage.search_latency_p95_ms, 37);
    assert.equal(metrics.data.usage.searchd_search_count, 1);
    assert.equal(metrics.data.usage.fallback_search_count, 0);
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

test("admin can replace a source video cover and serve its real image type", async () => {
  const libraryRoot = await makeLibraryRoot();
  const pngCoverBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64"
  );

  await writeManifest(libraryRoot, sourceVideoManifest({
    source_video_id: "V000001",
    cover_path: ".mixlab-library/videos/V000001/cover.jpg"
  }));

  await withServer(libraryRoot, async (baseUrl) => {
    const updated = await patchJson(baseUrl, "/api/admin/source-videos/V000001/cover", {
      image_base64: pngCoverBytes.toString("base64"),
      content_type: "image/png",
      file_name: "cashflow.png"
    });

    assert.equal(updated.ok, true);
    assert.equal(updated.data.cover_url, "/api/admin/source-videos/V000001/cover");

    const manifest = JSON.parse(
      await readFile(
        path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json"),
        "utf8"
      )
    );
    assert.equal(manifest.cover_path, ".mixlab-library/videos/V000001/cover.png");
    assert.equal(
      Buffer.compare(
        await readFile(path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "cover.png")),
        pngCoverBytes
      ),
      0
    );

    const cover = await fetch(`${baseUrl}/api/admin/source-videos/V000001/cover`);
    assert.equal(cover.status, 200);
    assert.equal(cover.headers.get("content-type"), "image/png");
    assert.equal(Buffer.compare(Buffer.from(await cover.arrayBuffer()), pngCoverBytes), 0);
  });
});

test("admin rejects cover uploads with mismatched image content", async () => {
  const libraryRoot = await makeLibraryRoot();

  await writeManifest(libraryRoot, sourceVideoManifest({
    source_video_id: "V000001",
    cover_path: ".mixlab-library/videos/V000001/cover.jpg"
  }));

  await withServer(libraryRoot, async (baseUrl) => {
    const rejected = await patchJson(baseUrl, "/api/admin/source-videos/V000001/cover", {
      image_base64: Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64"),
      content_type: "image/png"
    });

    assert.equal(rejected.ok, false);
    assert.equal(rejected.error_code, "invalid_request");
    assert.match(rejected.message, /内容与类型不匹配/);
  });
});
