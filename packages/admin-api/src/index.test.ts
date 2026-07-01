import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import {
  appendPreprocessJobLog,
  appendUsageEvent,
  createCutterLoginApplication,
  readAdminSettings,
  readSourceVideoManifest,
  scanSourceVideos,
  withAdminWriterLease,
  writeAdminSettings
} from "../../library-fs/src/index.ts";
import { runLibraryTextPreprocessWorker } from "../../preprocess-core/src/index.ts";
import type { SourceVideoManifest } from "../../protocol/src/index.ts";
import { writeSourceTranscriptSqliteIndex } from "../../search-sqlite/src/index.ts";
import {
  createAdminApiServer,
  runAdminPreprocessPipeline,
  type AdminPreprocessWorkerCycleInput
} from "./index.ts";
import {
  createAdminCommandSnapshot
} from "./admin-command-snapshot.ts";
import { adminCommandSystemActor } from "./admin-command-audit.ts";
import { readAdminOperationLog } from "./admin-operation-log.ts";
import { initializeAdminLibrary } from "./admin-library-commands.ts";
import { runAdminPipelineQueueCommand } from "./admin-transition-commands.ts";
import {
  adminReadModelStorePath,
  writeAdminSourceVideoStatusReadModelStore
} from "./admin-read-model-store.ts";
import { buildAdminSourceVideoStatusReadModel } from "./admin-source-video-read-model.ts";
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

async function runStubPreprocessWorkerCycle(
  libraryRoot: string,
  workerInput: AdminPreprocessWorkerCycleInput
) {
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

async function prepareQueuedSourceVideos(
  libraryRoot: string,
  sourceFileNames: string[]
): Promise<void> {
  await mkdir(path.join(libraryRoot, "source-videos"), { recursive: true });
  for (const sourceFileName of sourceFileNames) {
    await writeFile(path.join(libraryRoot, "source-videos", sourceFileName), `video-${sourceFileName}`);
  }

  await initializeAdminLibrary({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "测试素材库",
    now: "2026-05-02T11:00:00.000Z"
  });
  await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "测试素材库",
    now: "2026-05-02T11:01:00.000Z"
  });
  await runAdminPipelineQueueCommand({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "测试素材库",
    command_now: "2026-05-02T11:02:00.000Z",
    now: () => "2026-05-02T11:02:00.000Z",
    actor: adminCommandSystemActor("测试预置入队", "system-task")
  });
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

async function getJsonWithHeaders(
  baseUrl: string,
  pathName: string,
  headers: Record<string, string>
): Promise<any> {
  const response = await fetch(`${baseUrl}${pathName}`, { headers });

  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  return response.json();
}

function assertAdminRuntimeMeta(envelope: any, expected: {
  endpoint: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  scan_mode: string;
  data_source: string;
  scan_reason: string;
}) {
  assert.equal(envelope.ok, true);
  assert.equal(envelope.meta?.runtime?.schema_version, "1.0");
  assert.equal(envelope.meta.runtime.endpoint, expected.endpoint);
  assert.equal(envelope.meta.runtime.method, expected.method ?? "GET");
  assert.equal(typeof envelope.meta.runtime.duration_ms, "number");
  assert(envelope.meta.runtime.duration_ms >= 0);
  assert.equal(envelope.meta.runtime.scan_mode, expected.scan_mode);
  assert.equal(envelope.meta.runtime.data_source, expected.data_source);
  assert.equal(envelope.meta.runtime.scan_reason, expected.scan_reason);
  assert.equal(typeof envelope.meta.runtime.actual_data_source, "string");
  assert.equal(typeof envelope.meta.runtime.cache_status, "string");
  assert.equal(typeof envelope.meta.runtime.result_count, "number");
  assert.equal(typeof envelope.meta.runtime.offset, "number");
  assert.equal(typeof envelope.meta.runtime.limit, "number");
  assert.equal(typeof envelope.meta.runtime.slow, "boolean");
  assert.equal(typeof envelope.meta.runtime.slow_reason, "string");

  return envelope.meta.runtime;
}

async function waitForReadModelReconcileStatus(
  baseUrl: string,
  expected: "succeeded" | "skipped" | "cancelled" | "failed"
): Promise<any> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const status = await getJson(baseUrl, "/api/admin/read-model/reconcile/status");
    if (status.data.status === expected) {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  return getJson(baseUrl, "/api/admin/read-model/reconcile/status");
}

async function waitForOperationLogEvent(
  baseUrl: string,
  eventType: string
): Promise<any> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const log = await getJson(baseUrl, "/api/admin/operation-log?limit=20");
    if (log.data.events.some((event: { event_type: string }) => event.event_type === eventType)) {
      return log;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  return getJson(baseUrl, "/api/admin/operation-log?limit=20");
}

test("admin password auth protects business routes and redacts password hashes", async () => {
  const libraryRoot = await makeLibraryRoot();
  const server = createAdminApiServer({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "测试素材库",
    auth_mode: "password",
    now: () => "2026-06-18T00:00:00.000Z",
    env: {
      DASHSCOPE_API_KEY: "sk-test-secret",
      MIXLAB_ASR_MODEL: "paraformer-v2"
    } as NodeJS.ProcessEnv
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;

  try {
    const denied = await fetch(`${baseUrl}/api/admin/cutter-users`);
    assert.equal(denied.status, 401);
    assert.match(JSON.stringify(await denied.json()), /login_required/);

    const bootstrap = await fetch(`${baseUrl}/api/admin/auth/bootstrap`);
    assert.equal(bootstrap.status, 200);
    assert.equal(((await bootstrap.json()) as any).data.registration_open, true);

    const registered = await fetch(`${baseUrl}/api/admin/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "owner",
        display_name: "Owner",
        password: "Owner12345"
      })
    });
    assert.equal(registered.status, 201);
    const registeredBody = (await registered.json()) as any;
    assert.equal(registeredBody.data.user.username, "owner");
    assert.equal("password_hash" in registeredBody.data.user, false);

    const sessionToken = registeredBody.data.session.session_token as string;
    const authedStatus = await fetch(`${baseUrl}/api/admin/auth/status`, {
      headers: { "X-MixLab-Admin-Session-Token": sessionToken }
    });
    assert.equal(authedStatus.status, 200);
    assert.equal(((await authedStatus.json()) as any).data.authenticated, true);

    const allowed = await fetch(`${baseUrl}/api/admin/cutter-users`, {
      headers: { "X-MixLab-Admin-Session-Token": sessionToken }
    });
    assert.equal(allowed.status, 200);
    assert.deepEqual(((await allowed.json()) as any).data.users, []);

    const loggedOut = await fetch(`${baseUrl}/api/admin/auth/logout`, {
      method: "POST",
      headers: { "X-MixLab-Admin-Session-Token": sessionToken }
    });
    assert.equal(loggedOut.status, 200);
    assert.equal(((await loggedOut.json()) as any).data.removed, true);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("authenticated admin command audit records actor identity without session token", async () => {
  const libraryRoot = await makeLibraryRoot();
  const server = createAdminApiServer({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "测试素材库",
    auth_mode: "password",
    now: () => "2026-06-18T00:00:00.000Z",
    env: {
      DASHSCOPE_API_KEY: "sk-test-secret",
      MIXLAB_ASR_MODEL: "paraformer-v2"
    } as NodeJS.ProcessEnv
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;

  try {
    const registered = await fetch(`${baseUrl}/api/admin/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "owner",
        display_name: "Owner",
        password: "Owner12345"
      })
    });
    assert.equal(registered.status, 201);
    const registeredBody = (await registered.json()) as any;
    const sessionToken = registeredBody.data.session.session_token as string;

    const initialized = await fetch(`${baseUrl}/api/admin/library/init`, {
      method: "POST",
      headers: { "X-MixLab-Admin-Session-Token": sessionToken }
    });
    assert.equal(initialized.status, 200);

    const operationLogResponse = await fetch(`${baseUrl}/api/admin/operation-log?limit=5`, {
      headers: { "X-MixLab-Admin-Session-Token": sessionToken }
    });
    assert.equal(operationLogResponse.status, 200);
    const operationLog = (await operationLogResponse.json()) as any;
    const latest = operationLog.data.events.find((event: { action: string; event_type: string }) =>
      event.action === "library-init" && event.event_type === "succeeded"
    );

    assert.ok(latest);
    assert.deepEqual(latest.details.actor, {
      kind: "admin-user",
      source: "admin-session",
      admin_id: "AU000001",
      username: "owner",
      display_name: "Owner",
      role: "owner"
    });
    assert.equal(latest.details.holder.startsWith("admin-api:"), true);
    assert.equal(JSON.stringify(latest.details).includes(sessionToken), false);
  } finally {
    server.close();
    await once(server, "close");
  }
});

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

async function seedIndexRequiredPublishFixture(libraryRoot: string): Promise<{
  manifest: SourceVideoManifest;
  json_read_model_path: string;
}> {
  const sourceVideoId = "V000001";
  await mkdir(path.join(libraryRoot, "source-videos"), { recursive: true });
  await writeFile(path.join(libraryRoot, "source-videos", "cashflow.mp4"), "video");
  await writeTranscriptArtifacts(libraryRoot, sourceVideoId);

  const manifest = sourceVideoManifest({
    source_video_id: sourceVideoId,
    relative_path: "cashflow.mp4",
    preprocess_status: "index-required",
    visible_to_cutters: false,
    transcript_path: ".mixlab-library/videos/V000001/transcript.json",
    srt_path: ".mixlab-library/videos/V000001/subtitles.srt",
    cover_path: "",
    keyframes_path: ""
  });
  const library = {
    library_id: "lib_main_001",
    name: "测试素材库",
    version: "1.0",
    created_at: "2026-05-02T11:00:00.000Z",
    updated_at: "2026-05-02T12:00:00.000Z",
    video_count: 1,
    ready_video_count: 0,
    processing_video_count: 0,
    queued_video_count: 0,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 1
  };
  const mixlabRoot = path.join(libraryRoot, ".mixlab-library");
  const jsonReadModelPath = path.join(
    mixlabRoot,
    "admin",
    "read-models",
    "source-video-status-read-model-v1.json"
  );

  await mkdir(mixlabRoot, { recursive: true });
  await writeFile(path.join(mixlabRoot, "library.json"), `${JSON.stringify(library, null, 2)}\n`, "utf8");
  await writeManifest(libraryRoot, manifest);
  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model: buildAdminSourceVideoStatusReadModel({
      library,
      manifests: [manifest],
      default_page_limit: 20,
      generated_at: "2026-05-02T12:01:00.000Z"
    })
  });

  return {
    manifest,
    json_read_model_path: jsonReadModelPath
  };
}

test("selected slow admin endpoints expose runtime metadata without changing data shapes", async () => {
  const libraryRoot = await makeLibraryRoot();
  await seedIndexRequiredPublishFixture(libraryRoot);

  await withServer(libraryRoot, async (baseUrl) => {
    const sourceVideos = await getJson(baseUrl, "/api/admin/source-videos?status=index-required&limit=1");
    const sourceRuntime = assertAdminRuntimeMeta(sourceVideos, {
      endpoint: "/api/admin/source-videos",
      scan_mode: "paged-list",
      data_source: "admin-read-model",
      scan_reason: "route-owned-page"
    });
    assert.equal(Array.isArray(sourceVideos.data), true);
    assert.equal(sourceVideos.data[0].source_video_id, "V000001");
    assert.equal(sourceRuntime.actual_data_source, "admin-read-model");
    assert.equal(sourceRuntime.cache_status, "hit");
    assert.equal(sourceRuntime.result_count, 1);
    assert.equal(sourceRuntime.offset, 0);
    assert.equal(sourceRuntime.limit, 1);

    const preprocessJobs = await getJson(baseUrl, "/api/admin/preprocess/jobs?limit=1");
    const jobsRuntime = assertAdminRuntimeMeta(preprocessJobs, {
      endpoint: "/api/admin/preprocess/jobs",
      scan_mode: "status-scan",
      data_source: "admin-read-model",
      scan_reason: "route-owned-page"
    });
    assert.equal(Array.isArray(preprocessJobs.data.jobs), true);
    assert.equal(preprocessJobs.data.jobs[0].source_video_id, "V000001");
    assert.equal(jobsRuntime.actual_data_source, "admin-read-model");
    assert.equal(jobsRuntime.cache_status, "hit");
    assert.equal(jobsRuntime.result_count, 1);
    assert.equal(jobsRuntime.limit, 1);

    const versions = await getJson(baseUrl, "/api/admin/index/versions");
    const versionsRuntime = assertAdminRuntimeMeta(versions, {
      endpoint: "/api/admin/index/versions",
      scan_mode: "paged-list",
      data_source: "index-version-packages",
      scan_reason: "index-version-page"
    });
    assert.equal(Array.isArray(versions.data.versions), true);
    assert.equal(versionsRuntime.actual_data_source, "index-version-packages");
    assert.equal(versionsRuntime.cache_status, "miss");
    assert.equal(versionsRuntime.result_count, versions.data.versions.length);

    const metrics = await getJson(baseUrl, "/api/admin/dashboard/metrics");
    const metricsRuntime = assertAdminRuntimeMeta(metrics, {
      endpoint: "/api/admin/dashboard/metrics",
      scan_mode: "status-scan",
      data_source: "usage-events",
      scan_reason: "background-metrics"
    });
    assert.equal(typeof metrics.data.runtime_load.cpu.usage_percent, "number");
    assert.equal(metricsRuntime.actual_data_source, "usage-events");
    assert.equal(metricsRuntime.cache_status, "miss");
    assert.equal(metricsRuntime.result_count, 1);

    const cachedMetrics = await getJson(baseUrl, "/api/admin/dashboard/metrics");
    const cachedMetricsRuntime = assertAdminRuntimeMeta(cachedMetrics, {
      endpoint: "/api/admin/dashboard/metrics",
      scan_mode: "status-scan",
      data_source: "usage-events",
      scan_reason: "background-metrics"
    });
    assert.equal(cachedMetricsRuntime.actual_data_source, "usage-events");
    assert.equal(cachedMetricsRuntime.cache_status, "hit");

    const runtimeHistory = await getJson(baseUrl, "/api/admin/runtime/diagnostics/history?limit=3");
    assert.equal(runtimeHistory.ok, true);
    assert.equal(runtimeHistory.data.schema_version, "1.0");
    assert.equal(runtimeHistory.data.entries.length, 3);
    assert.deepEqual(runtimeHistory.data.entries.map((entry: any) => entry.runtime.endpoint), [
      "/api/admin/dashboard/metrics",
      "/api/admin/dashboard/metrics",
      "/api/admin/index/versions"
    ]);
    assert.equal(runtimeHistory.data.entries[0].runtime.cache_status, "hit");
    assert.equal(runtimeHistory.data.entries[0].runtime.scan_reason, "background-metrics");
    assert.equal(runtimeHistory.data.entries[2].runtime.scan_mode, "paged-list");
  });
});

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

test("health reports build, runtime path profile, and shallow preprocess safety", async () => {
  const libraryRoot = await makeLibraryRoot();
  const server = createAdminApiServer({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "测试素材库",
    now: () => "2026-06-25T00:00:00.000Z",
    env: {
      DASHSCOPE_API_KEY: "sk-test-secret",
      MIXLAB_ASR_MODEL: "paraformer-v2",
      MIXLAB_BUILD_SHA: "abc123",
      MIXLAB_BUILD_VERSION: "2026.06.25",
      MIXLAB_IMAGE_TAG: "abc123"
    } as NodeJS.ProcessEnv
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const health = await getJson(`http://127.0.0.1:${(address as AddressInfo).port}`, "/health");

    assert.equal(health.ok, true);
    assert.equal(health.data.ok, true);
    assert.equal(health.data.service, "admin-api");
    assert.equal(health.data.build.sha, "abc123");
    assert.equal(health.data.build.version, "2026.06.25");
    assert.equal(health.data.build.image_tag, "abc123");
    assert.equal(health.data.runtime.library_root, libraryRoot);
    assert.equal(health.data.runtime.source_videos_path, path.join(libraryRoot, "source-videos"));
    assert.equal(health.data.runtime.path_profile, "local");
    assert.equal(health.data.preprocess.processing.checked, false);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("protection status and release gates expose Admin Architecture v1 blockers", async () => {
  const libraryRoot = await makeLibraryRoot();
  await writeManifest(libraryRoot, sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "ready",
    visible_to_cutters: true
  }));
  await writeManifest(libraryRoot, sourceVideoManifest({
    source_video_id: "V001440",
    preprocess_status: "processing",
    visible_to_cutters: false
  }));
  await mkdir(path.join(libraryRoot, ".mixlab-library", "usage-events"), { recursive: true });
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "usage-events", "events.ndjson"),
    "{broken json}\n",
    "utf8"
  );

  await withServerEnv(
    libraryRoot,
    {
      DASHSCOPE_API_KEY: "sk-test-secret",
      MIXLAB_ASR_MODEL: "paraformer-v2",
      MIXLAB_BUILD_SHA: "abc123",
      MIXLAB_BUILD_VERSION: "2026.06.25",
      MIXLAB_IMAGE_TAG: "admin-api:test"
    } as NodeJS.ProcessEnv,
    async (baseUrl) => {
      await postJson(baseUrl, "/api/admin/library/init");

      const protection = await getJson(baseUrl, "/api/admin/protection/status");
      assert.equal(protection.ok, true);
      assert.equal(protection.data.mode, "preprocess-protection-v1");
      assert.equal(protection.data.ready_video_count, 1);
      assert.equal(protection.data.processing_video_count, 1);
      assert.equal(protection.data.scan_apply_requires_preview, true);
      assert.match(
        protection.data.ready_asset_policy.blocked_ready_mutations.join(" "),
        /ready -> queued/
      );

      const gates = await getJson(baseUrl, "/api/admin/release-gates");
      assert.equal(gates.ok, true);
      assert.equal(gates.data.overall_status, "blocked");
      assert.equal(gates.data.release_allowed, false);
      const byCode = new Map(
        gates.data.gates.map((gate: { code: string; status: string }) => [gate.code, gate.status])
      );
      assert.equal(byCode.get("processing-recovery"), "blocked");
      assert.equal(byCode.get("usage-events-tolerance"), "blocked");
      assert.equal(byCode.get("current-index"), "blocked");
      assert.equal(byCode.get("scan-protection"), "pass");
      assert.equal(gates.data.usage_events_repair.repair_required, true);
      assert.match(gates.data.usage_events_repair.dry_run_command, /usage-events-repair/);
      assert.equal(gates.data.usage_events_repair.mutates_ready_assets, false);

      const overview = await getJson(baseUrl, "/api/admin/operations/overview");
      assert.equal(overview.ok, true);
      assert.equal(overview.data.title, "管理端运行保护中心");
      assert.equal(overview.data.summary.overall_status, "blocked");
      assert.equal(overview.data.summary.blocked_gate_count >= 1, true);
      assert.equal(overview.data.release.overall_status, "blocked");
      assert.equal(overview.data.protection.mode, "preprocess-protection-v1");
      assert.equal(overview.data.read_model.source_video_status.name, "source-video-status-read-model-v1");
      assert.equal(overview.data.data_loading.strategy, "shell-first-route-owned-v1");
      assert.equal(
        overview.data.next_actions.some((action: { key: string }) => action.key === "processing-recovery"),
        true
      );
    }
  );
});

test("data loading plan keeps shell endpoints cheap and route-owned", async () => {
  const libraryRoot = await makeLibraryRoot();
  type EndpointPlanForTest = {
    endpoint: string;
    phase: string;
    scan_mode?: string;
    data_source?: string;
    scan_reason?: string;
    default_limit?: number;
    read_model?: string;
    refresh?: string;
  };
  type RoutePlanForTest = {
    route: string;
    prefetch: boolean;
    endpoints: string[];
  };

  await withServer(libraryRoot, async (baseUrl) => {
    const plan = await getJson(baseUrl, "/api/admin/data-loading/plan");

    assert.equal(plan.ok, true);
    assert.equal(plan.data.strategy, "shell-first-route-owned-v1");
    assert.equal(plan.data.hidden_full_scan_allowed, false);
    assert.equal(plan.data.background_prefetch_default, false);
    const endpoints = new Map<string, EndpointPlanForTest>(
      plan.data.endpoints.map((endpoint: EndpointPlanForTest) => [endpoint.endpoint, endpoint])
    );
    assert.equal(endpoints.get("/api/admin/library/status")?.phase, "shell");
    assert.equal(endpoints.get("/api/admin/library/status")?.scan_mode, "no-scan");
    assert.equal(endpoints.get("/api/admin/library/status")?.data_source, "library-manifest");
    assert.equal(endpoints.get("/api/admin/source-videos")?.phase, "route");
    assert.equal(endpoints.get("/api/admin/source-videos")?.default_limit, 20);
    assert.equal(endpoints.get("/api/admin/source-videos")?.read_model, "source-video-status-read-model-v1");
    assert.equal(endpoints.get("/api/admin/source-videos")?.scan_reason, "route-owned-page");
    assert.equal(endpoints.get("/api/admin/preprocess/jobs")?.phase, "route");
    assert.equal(endpoints.get("/api/admin/preprocess/jobs")?.read_model, "source-video-status-read-model-v1");
    assert.equal(endpoints.get("/api/admin/read-model/status")?.scan_mode, "no-scan");
    assert.equal(endpoints.get("/api/admin/read-model/reconcile/status")?.scan_mode, "no-scan");
    assert.equal(endpoints.get("/api/admin/operations/overview")?.phase, "route");
    assert.equal(endpoints.get("/api/admin/operations/overview")?.read_model, "source-video-status-read-model-v1");
    assert.equal(endpoints.get("/api/admin/index/versions")?.default_limit, 8);
    assert.equal(endpoints.get("/api/admin/library/scan-preview")?.scan_mode, "folder-scan");
    assert.equal(endpoints.get("/api/admin/library/scan")?.phase, "command");
    assert.equal(endpoints.get("/api/admin/library/scan")?.scan_mode, "folder-scan");
    assert.equal(endpoints.get("/api/admin/library/scan")?.data_source, "source-folders");
    assert.equal(endpoints.get("/api/admin/library/scan")?.scan_reason, "explicit-scan-apply");
    assert.equal(endpoints.get("/api/admin/read-model/reconcile")?.phase, "command");
    assert.equal(endpoints.get("/api/admin/read-model/reconcile")?.refresh, "command-only");
    assert.equal(endpoints.get("/api/admin/read-model/reconcile")?.scan_mode, "full-reconcile");
    assert.equal(endpoints.get("/api/admin/read-model/reconcile/cancel")?.phase, "command");
    assert.equal(endpoints.get("/api/admin/read-model/reconcile/cancel")?.scan_mode, "no-scan");
    assert.equal(endpoints.get("/api/admin/operation-log")?.phase, "route");
    assert.equal(endpoints.get("/api/admin/operation-log")?.scan_mode, "no-scan");

    const dashboardRoute = (plan.data.routes as RoutePlanForTest[])
      .find((route) => route.route === "dashboard");
    const operationLogRoute = (plan.data.routes as RoutePlanForTest[])
      .find((route) => route.route === "operation-log");
    assert.ok(dashboardRoute);
    assert.ok(operationLogRoute);
    assert.deepEqual(operationLogRoute.endpoints, ["/api/admin/operation-log"]);
    assert.equal(dashboardRoute.prefetch, false);
    assert.deepEqual(dashboardRoute.endpoints, [
      "/api/admin/library/status",
      "/api/admin/settings/config",
      "/api/admin/preprocess/supervisor/status",
      "/api/admin/data-loading/plan"
    ]);

    const protectionRoute = (plan.data.routes as RoutePlanForTest[])
      .find((route) => route.route === "protection");
    assert.ok(protectionRoute);
    assert.equal(protectionRoute.prefetch, false);
    assert.deepEqual(protectionRoute.endpoints, [
      "/api/admin/operations/overview",
      "/api/admin/read-model/reconcile/status"
    ]);
  });
});

test("ready source videos cannot be requeued by Admin transition commands", async () => {
  const libraryRoot = await makeLibraryRoot();
  await writeManifest(libraryRoot, sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "ready",
    visible_to_cutters: true
  }));

  await withServer(libraryRoot, async (baseUrl) => {
    const queued = await postJson(baseUrl, "/api/admin/source-videos/V000001/queue");
    assert.equal(queued.ok, false);
    assert.equal(queued.error_code, "preprocess_transition_blocked");
    assert.deepEqual(queued.details.source_video_ids, ["V000001"]);

    const detail = await getJson(baseUrl, "/api/admin/source-videos/V000001");
    assert.equal(detail.data.preprocess.status, "ready");
    assert.equal(detail.data.visibility.visible_to_cutters, true);
  });
});

test("single source-video queue command writes through to fresh admin sqlite", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    library_id: "lib_main_001",
    name: "测试素材库",
    version: "1.0",
    created_at: "2026-05-02T11:00:00.000Z",
    updated_at: "2026-05-02T12:00:00.000Z",
    video_count: 2,
    ready_video_count: 0,
    processing_video_count: 0,
    queued_video_count: 1,
    unprocessed_video_count: 1,
    failed_video_count: 0,
    index_required_video_count: 0
  };
  const unprocessed = sourceVideoManifest({
    source_video_id: "V000001",
    title: "未处理素材",
    preprocess_status: "unprocessed",
    visible_to_cutters: false
  });
  const queued = sourceVideoManifest({
    source_video_id: "V000002",
    title: "已排队素材",
    preprocess_status: "queued",
    visible_to_cutters: false
  });
  const jsonReadModelPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "admin",
    "read-models",
    "source-video-status-read-model-v1.json"
  );

  await mkdir(path.join(libraryRoot, ".mixlab-library"), { recursive: true });
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "library.json"),
    `${JSON.stringify(library, null, 2)}\n`,
    "utf8"
  );
  await writeManifest(libraryRoot, unprocessed);
  await writeManifest(libraryRoot, queued);
  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model: buildAdminSourceVideoStatusReadModel({
      library,
      manifests: [unprocessed, queued],
      default_page_limit: 20,
      generated_at: "2026-05-02T12:01:00.000Z"
    })
  });

  await withServer(libraryRoot, async (baseUrl) => {
    const result = await postJson(baseUrl, "/api/admin/source-videos/V000001/queue");
    const status = await getJson(baseUrl, "/api/admin/read-model/status");
    const queuedList = await getJson(baseUrl, "/api/admin/source-videos?status=queued&limit=2");

    assert.equal(result.ok, true);
    assert.equal(result.data.affected_count, 1);
    assert.equal(status.data.source_video_status.freshness, "missing");
    assert.equal(status.data.admin_read_model.freshness, "fresh");
    assert.equal(status.data.admin_read_model.reconciliation.action, "none");
    assert.equal(status.data.admin_read_model.reconciliation.scan_mode, "no-scan");
    assert.equal(status.data.admin_read_model.counts_by_status.queued, 2);
    assert.deepEqual(
      queuedList.data.map((item: { source_video_id: string; preprocess_status: string }) => [
        item.source_video_id,
        item.preprocess_status
      ]),
      [
        ["V000001", "queued"],
        ["V000002", "queued"]
      ]
    );
    assert.equal(await fileOrDirExists(jsonReadModelPath), false);
  });
});

test("bulk preprocess transition commands write through to fresh admin sqlite", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    library_id: "lib_main_001",
    name: "测试素材库",
    version: "1.0",
    created_at: "2026-05-02T11:00:00.000Z",
    updated_at: "2026-05-02T12:00:00.000Z",
    video_count: 4,
    ready_video_count: 0,
    processing_video_count: 1,
    queued_video_count: 0,
    unprocessed_video_count: 2,
    failed_video_count: 1,
    index_required_video_count: 0
  };
  const first = sourceVideoManifest({
    source_video_id: "V000001",
    title: "未处理素材一",
    preprocess_status: "unprocessed",
    visible_to_cutters: false
  });
  const second = sourceVideoManifest({
    source_video_id: "V000002",
    title: "未处理素材二",
    preprocess_status: "unprocessed",
    visible_to_cutters: false
  });
  const failed = sourceVideoManifest({
    source_video_id: "V000003",
    title: "失败素材",
    preprocess_status: "failed",
    visible_to_cutters: false
  });
  const processing = sourceVideoManifest({
    source_video_id: "V000004",
    title: "停滞素材",
    preprocess_status: "processing",
    visible_to_cutters: false
  });
  const jsonReadModelPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "admin",
    "read-models",
    "source-video-status-read-model-v1.json"
  );

  await mkdir(path.join(libraryRoot, ".mixlab-library"), { recursive: true });
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "library.json"),
    `${JSON.stringify(library, null, 2)}\n`,
    "utf8"
  );
  await writeManifest(libraryRoot, first);
  await writeManifest(libraryRoot, second);
  await writeManifest(libraryRoot, failed);
  await writeManifest(libraryRoot, processing);
  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model: buildAdminSourceVideoStatusReadModel({
      library,
      manifests: [first, second, failed, processing],
      default_page_limit: 20,
      generated_at: "2026-05-02T12:01:00.000Z"
    })
  });

  await withServer(libraryRoot, async (baseUrl) => {
    const queued = await postJson(baseUrl, "/api/admin/preprocess/queue-unprocessed");
    const retried = await postJson(baseUrl, "/api/admin/preprocess/retry-failed");
    const recovered = await postJson(baseUrl, "/api/admin/preprocess/recover-processing");
    const status = await getJson(baseUrl, "/api/admin/read-model/status");
    const queuedList = await getJson(baseUrl, "/api/admin/source-videos?status=queued&limit=4");

    assert.equal(queued.ok, true);
    assert.equal(queued.data.affected_count, 2);
    assert.deepEqual(queued.data.source_video_ids, ["V000001", "V000002"]);
    assert.equal(retried.ok, true);
    assert.equal(retried.data.affected_count, 1);
    assert.deepEqual(retried.data.source_video_ids, ["V000003"]);
    assert.equal(recovered.ok, true);
    assert.equal(recovered.data.affected_count, 1);
    assert.deepEqual(recovered.data.source_video_ids, ["V000004"]);
    assert.equal(status.data.source_video_status.freshness, "missing");
    assert.equal(status.data.admin_read_model.freshness, "fresh");
    assert.equal(status.data.admin_read_model.reconciliation.scan_mode, "no-scan");
    assert.equal(status.data.admin_read_model.counts_by_status.queued, 4);
    assert.equal(status.data.admin_read_model.counts_by_status.unprocessed, 0);
    assert.equal(status.data.admin_read_model.counts_by_status.failed, 0);
    assert.equal(status.data.admin_read_model.counts_by_status.processing, 0);
    assert.deepEqual(
      queuedList.data.map((item: { source_video_id: string; preprocess_status: string }) => [
        item.source_video_id,
        item.preprocess_status
      ]),
      [
        ["V000001", "queued"],
        ["V000002", "queued"],
        ["V000003", "queued"],
        ["V000004", "queued"]
      ]
    );
    assert.equal(await fileOrDirExists(jsonReadModelPath), false);
  });
});

test("read-model reconcile command rebuilds admin sqlite in the background", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    library_id: "lib_main_001",
    name: "测试素材库",
    version: "1.0",
    created_at: "2026-05-02T11:00:00.000Z",
    updated_at: "2026-05-02T12:00:00.000Z",
    video_count: 2,
    ready_video_count: 1,
    processing_video_count: 0,
    queued_video_count: 1,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0
  };
  await mkdir(path.join(libraryRoot, ".mixlab-library"), { recursive: true });
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "library.json"),
    `${JSON.stringify(library, null, 2)}\n`,
    "utf8"
  );
  await writeManifest(libraryRoot, sourceVideoManifest({
    source_video_id: "V000001",
    title: "已完成素材",
    preprocess_status: "ready",
    visible_to_cutters: true
  }));
  await writeManifest(libraryRoot, sourceVideoManifest({
    source_video_id: "V000002",
    title: "排队素材",
    preprocess_status: "queued",
    visible_to_cutters: false,
    transcript_path: "",
    srt_path: "",
    keyframes_path: "",
    cover_path: ""
  }));

  await withServer(libraryRoot, async (baseUrl) => {
    const before = await getJson(baseUrl, "/api/admin/read-model/status");
    const idle = await getJson(baseUrl, "/api/admin/read-model/reconcile/status");
    const cancelIdle = await postJson(baseUrl, "/api/admin/read-model/reconcile/cancel");
    const started = await postJson(baseUrl, "/api/admin/read-model/reconcile");
    const finished = await waitForReadModelReconcileStatus(baseUrl, "succeeded");
    const operationLog = await waitForOperationLogEvent(baseUrl, "succeeded");
    const after = await getJson(baseUrl, "/api/admin/read-model/status");
    const queuedList = await getJson(baseUrl, "/api/admin/source-videos?status=queued&limit=1");

    assert.equal(before.data.admin_read_model.freshness, "missing");
    assert.equal(before.data.admin_read_model.reconciliation.action, "build");
    assert.equal(idle.data.status, "idle");
    assert.equal(idle.data.phase, "idle");
    assert.equal(idle.data.progress.percent, 0);
    assert.equal(cancelIdle.ok, true);
    assert.equal(cancelIdle.data.accepted, false);
    assert.equal(cancelIdle.data.status.status, "idle");
    assert.equal(started.ok, true);
    assert.equal(started.data.accepted, true);
    assert.equal(started.data.status.status, "running");
    assert.equal(started.data.status.phase, "starting");
    assert.equal(finished.data.status, "succeeded");
    assert.equal(finished.data.phase, "completed");
    assert.equal(finished.data.progress.percent, 100);
    assert.equal(finished.data.result.applied, true);
    assert.equal(finished.data.snapshot_video_count, 2);
    assert.equal(finished.data.events.at(-1).event_type, "succeeded");
    assert.equal(operationLog.data.events.some((event: { event_type: string }) => event.event_type === "started"), true);
    assert.equal(operationLog.data.events[0].area, "read-model");
    assert.equal(operationLog.data.events[0].action, "read-model-reconcile");
    assert.equal(operationLog.data.malformed_line_count, 0);
    assert.equal(after.data.admin_read_model.freshness, "fresh");
    assert.equal(after.data.admin_read_model.reconciliation.action, "none");
    assert.equal(after.data.admin_read_model.reconciliation.scan_mode, "no-scan");
    assert.equal(after.data.admin_read_model.counts_by_status.ready, 1);
    assert.equal(after.data.admin_read_model.counts_by_status.queued, 1);
    assert.equal(queuedList.data[0].source_video_id, "V000002");
  });
});

test("admin writer lease returns a conflict while another writer is active", async () => {
  const libraryRoot = await makeLibraryRoot();
  let release!: () => void;
  let entered!: () => void;
  const enteredLock = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const releaseLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  const holdingLease = withAdminWriterLease({
    library_root: libraryRoot,
    holder: "test-suite",
    reason: "hold-lock",
    now: "2026-05-02T12:00:00.000Z"
  }, async () => {
    entered();
    await releaseLock;
  });

  await enteredLock;
  await withServer(libraryRoot, async (baseUrl) => {
    const initialized = await postJson(baseUrl, "/api/admin/library/init");
    assert.equal(initialized.ok, false);
    assert.equal(initialized.error_code, "admin_writer_busy");
    assert.equal(initialized.details.lease.holder, "test-suite");
  });

  release();
  await holdingLease;
});

test("command snapshot restore plan and execute are exposed through guarded admin API routes", async () => {
  const libraryRoot = await makeLibraryRoot();
  const settingsPath = path.join(libraryRoot, ".mixlab-library", "admin-settings.json");
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, "{\"library_name\":\"before\"}\n", "utf8");
  const snapshot = await createAdminCommandSnapshot({
    library_root: libraryRoot,
    command: "settings-config",
    created_at: "2026-05-02T11:59:00.000Z",
    holder: "test-suite",
    snapshot_id: "api-restore-ok",
    files: [{
      label: "admin-settings",
      file_path: settingsPath
    }]
  });
  await writeFile(settingsPath, "{\"library_name\":\"after\"}\n", "utf8");

  await withServer(libraryRoot, async (baseUrl) => {
    const plan = await getJson(
      baseUrl,
      `/api/admin/command-snapshots/${snapshot.snapshot_id}/restore-plan`
    );
    const restored = await postJson(
      baseUrl,
      `/api/admin/command-snapshots/${snapshot.snapshot_id}/restore`
    );
    const operationLog = await getJson(baseUrl, "/api/admin/operation-log?limit=5");

    assert.equal(plan.ok, true);
    assert.equal(plan.data.can_restore, true);
    assert.equal(plan.data.snapshot_id, "api-restore-ok");
    assert.ok(!plan.data.snapshot_manifest_relative_path.startsWith(libraryRoot));
    assert.ok(!plan.data.files[0].source_relative_path.startsWith(libraryRoot));
    assert.ok(!plan.data.files[0].snapshot_relative_path.startsWith(libraryRoot));

    assert.equal(restored.ok, true);
    assert.equal(restored.data.status, "restored");
    assert.equal(restored.data.restored_file_count, 1);
    assert.equal(restored.data.plan.snapshot_id, "api-restore-ok");
    assert.equal(await readFile(settingsPath, "utf8"), "{\"library_name\":\"before\"}\n");
    assert.equal(
      operationLog.data.events.some((event: { action: string }) =>
        event.action === "command-snapshot-restore"
      ),
      true
    );
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

test("source video status read model builds from indexed ready ids and non-ready manifests", async () => {
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
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "library.json"),
    `${JSON.stringify({
      library_id: "lib_main_001",
      name: "测试素材库",
      version: "1.0",
      created_at: "2026-05-02T11:00:00.000Z",
      updated_at: "2026-05-02T12:00:00.000Z",
      video_count: 3,
      ready_video_count: 2,
      processing_video_count: 0,
      queued_video_count: 1,
      unprocessed_video_count: 0,
      failed_video_count: 0,
      index_required_video_count: 0
    }, null, 2)}\n`,
    "utf8"
  );

  await withServer(libraryRoot, async (baseUrl) => {
    const queued = await getJson(baseUrl, "/api/admin/source-videos?status=queued&limit=1");
    const status = await getJson(baseUrl, "/api/admin/read-model/status");

    assert.equal(queued.ok, true);
    assert.equal(queued.data.length, 1);
    assert.equal(queued.data[0].source_video_id, "V000003");
    assert.equal(status.ok, true);
    assert.equal(status.data.source_video_status.freshness, "fresh");
    assert.equal(status.data.source_video_status.counts_by_status.ready, 2);
    assert.equal(status.data.source_video_status.counts_by_status.queued, 1);
    assert.equal(status.data.source_video_status.persisted, "fresh");
  });
});

test("source video default first page mixes indexed ready rows with non-ready manifests", async () => {
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
        title: "索引素材一",
        duration_ms: 120_000,
        relative_path: "ready-1.mp4",
        cover_path: ".mixlab-library/videos/V000001/cover.jpg",
        segments: []
      },
      {
        source_video_id: "V000002",
        title: "索引素材二",
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
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "library.json"),
    `${JSON.stringify({
      library_id: "lib_main_001",
      name: "测试素材库",
      version: "1.0",
      created_at: "2026-05-02T11:00:00.000Z",
      updated_at: "2026-05-02T12:00:00.000Z",
      video_count: 3,
      ready_video_count: 2,
      processing_video_count: 0,
      queued_video_count: 1,
      unprocessed_video_count: 0,
      failed_video_count: 0,
      index_required_video_count: 0
    }, null, 2)}\n`,
    "utf8"
  );

  await withServer(libraryRoot, async (baseUrl) => {
    const firstPage = await getJson(baseUrl, "/api/admin/source-videos?limit=3");

    assert.equal(firstPage.ok, true);
    assert.deepEqual(
      firstPage.data.map((item: { source_video_id: string; preprocess_status: string; title: string }) => [
        item.source_video_id,
        item.preprocess_status,
        item.title
      ]),
      [
        ["V000001", "ready", "索引素材一"],
        ["V000002", "ready", "索引素材二"],
        ["V000003", "queued", "等待预处理素材"]
      ]
    );
  });
});

test("source video status read model persists and reports freshness", async () => {
  const libraryRoot = await makeLibraryRoot();
  await writeManifest(libraryRoot, sourceVideoManifest({
    source_video_id: "V000001",
    title: "待发布素材",
    preprocess_status: "index-required",
    visible_to_cutters: false
  }));
  await writeManifest(libraryRoot, sourceVideoManifest({
    source_video_id: "V000002",
    title: "排队素材",
    preprocess_status: "queued",
    visible_to_cutters: false
  }));

  await withServer(libraryRoot, async (baseUrl) => {
    await postJson(baseUrl, "/api/admin/library/init");
    const filtered = await getJson(baseUrl, "/api/admin/source-videos?status=index-required&limit=1");
    const status = await getJson(baseUrl, "/api/admin/read-model/status");

    assert.equal(filtered.ok, true);
    assert.equal(filtered.data[0].source_video_id, "V000001");
    assert.equal(status.ok, true);
    assert.equal(status.data.source_video_status.freshness, "fresh");
    assert.equal(status.data.source_video_status.persisted, "fresh");
    assert.equal(status.data.source_video_status.counts_by_status["index-required"], 1);
    assert.equal(status.data.source_video_status.counts_by_status.queued, 1);
    assert.match(status.data.source_video_status.path, /source-video-status-read-model-v1\.json$/);
    assert.equal(await fileOrDirExists(status.data.source_video_status.path), true);
    assert.equal(status.data.admin_read_model.storage, "sqlite");
    assert.match(status.data.admin_read_model.path, /admin-read-model\/admin\.sqlite$/);
    assert.equal(status.data.admin_read_model.freshness, "fresh");
    assert.equal(status.data.admin_read_model.reconciliation.action, "none");
    assert.equal(status.data.admin_read_model.reconciliation.safe_for_page_request, true);
    assert.equal(status.data.admin_read_model.counts_by_status["index-required"], 1);
    assert.equal(await fileOrDirExists(status.data.admin_read_model.path), true);
  });
});

test("source video non-ready status list can read from fresh admin sqlite without JSON read model", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    library_id: "lib_main_001",
    name: "测试素材库",
    version: "1.0",
    created_at: "2026-05-02T11:00:00.000Z",
    updated_at: "2026-05-02T12:00:00.000Z",
    video_count: 2,
    ready_video_count: 0,
    processing_video_count: 0,
    queued_video_count: 1,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 1
  };
  const queuedManifest = sourceVideoManifest({
    source_video_id: "V000001",
    title: "排队素材",
    relative_path: "老师/排队素材.mp4",
    preprocess_status: "queued",
    visible_to_cutters: false
  });
  const indexRequiredManifest = sourceVideoManifest({
    source_video_id: "V000002",
    title: "待发布素材",
    relative_path: "老师/待发布素材.mp4",
    preprocess_status: "index-required",
    visible_to_cutters: false
  });
  const jsonReadModelPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "admin",
    "read-models",
    "source-video-status-read-model-v1.json"
  );

  await mkdir(path.join(libraryRoot, ".mixlab-library"), { recursive: true });
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "library.json"),
    `${JSON.stringify(library, null, 2)}\n`,
    "utf8"
  );
  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model: buildAdminSourceVideoStatusReadModel({
      library,
      manifests: [queuedManifest, indexRequiredManifest],
      default_page_limit: 20,
      generated_at: "2026-05-02T12:01:00.000Z"
    })
  });

  await withServer(libraryRoot, async (baseUrl) => {
    const indexRequired = await getJson(baseUrl, "/api/admin/source-videos?status=index-required&limit=1");
    const queriedQueued = await getJson(baseUrl, "/api/admin/source-videos?status=queued&query=%E6%8E%92%E9%98%9F&limit=1");
    const status = await getJson(baseUrl, "/api/admin/read-model/status");

    assert.equal(indexRequired.ok, true);
    assert.equal(indexRequired.data.length, 1);
    assert.equal(indexRequired.data[0].source_video_id, "V000002");
    assert.equal(indexRequired.data[0].preprocess_status, "index-required");
    assert.equal(queriedQueued.ok, true);
    assert.equal(queriedQueued.data[0].source_video_id, "V000001");
    assert.equal(status.data.source_video_status.freshness, "missing");
    assert.equal(status.data.admin_read_model.freshness, "fresh");
    assert.equal(await fileOrDirExists(jsonReadModelPath), false);
  });
});

test("source-video read-only probe header disables page-time admin sqlite repair", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    library_id: "lib_main_001",
    name: "测试素材库",
    version: "1.0",
    created_at: "2026-05-02T11:00:00.000Z",
    updated_at: "2026-05-02T12:00:00.000Z",
    video_count: 1,
    ready_video_count: 0,
    processing_video_count: 0,
    queued_video_count: 1,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0
  };
  const queuedManifest = sourceVideoManifest({
    source_video_id: "V000001",
    title: "排队素材",
    relative_path: "老师/排队素材.mp4",
    preprocess_status: "queued",
    visible_to_cutters: false
  });
  const statusModel = buildAdminSourceVideoStatusReadModel({
    library,
    manifests: [queuedManifest],
    default_page_limit: 20,
    generated_at: "2026-05-02T12:01:00.000Z"
  });
  const jsonReadModelPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "admin",
    "read-models",
    "source-video-status-read-model-v1.json"
  );

  await mkdir(path.dirname(jsonReadModelPath), { recursive: true });
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "library.json"),
    `${JSON.stringify(library, null, 2)}\n`,
    "utf8"
  );
  await writeManifest(libraryRoot, queuedManifest);
  await writeFile(jsonReadModelPath, `${JSON.stringify(statusModel, null, 2)}\n`, "utf8");
  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model: statusModel
  });

  const db = new DatabaseSync(adminReadModelStorePath(libraryRoot));
  try {
    db.prepare(`
      UPDATE source_video_status
      SET manifest_json = ''
      WHERE source_video_id = ?
    `).run("V000001");
  } finally {
    db.close();
  }

  await withServer(libraryRoot, async (baseUrl) => {
    const noRepairProbe = await getJsonWithHeaders(
      baseUrl,
      "/api/admin/source-videos?status=queued&limit=1",
      { "X-MixLab-Admin-Read-Only-Probe": "true" }
    );

    assert.equal(noRepairProbe.ok, true);
    assert.equal(noRepairProbe.data[0].source_video_id, "V000001");
    assert.equal(noRepairProbe.meta.runtime.actual_data_source, "admin-read-model");
    assert.equal(noRepairProbe.meta.runtime.cache_status, "hit");
    assert.equal(noRepairProbe.meta.runtime.fallback_reason, "status-store:incomplete-manifest-rows");
    assert.equal(noRepairProbe.meta.runtime.repair_reason, undefined);
    const historyAfterProbe = await getJson(baseUrl, "/api/admin/runtime/diagnostics/history?limit=10");
    assert.deepEqual(historyAfterProbe.data.entries, []);

    const normalPageRead = await getJson(baseUrl, "/api/admin/source-videos?status=queued&limit=1");

    assert.equal(normalPageRead.ok, true);
    assert.equal(normalPageRead.data[0].source_video_id, "V000001");
    assert.equal(normalPageRead.meta.runtime.actual_data_source, "admin-read-model");
    assert.equal(normalPageRead.meta.runtime.cache_status, "hit");
    assert.equal(
      normalPageRead.meta.runtime.repair_reason,
      "status-store:repaired-incomplete-manifest-rows"
    );
    const historyAfterNormalRead = await getJson(baseUrl, "/api/admin/runtime/diagnostics/history?limit=10");
    assert.deepEqual(
      historyAfterNormalRead.data.entries.map((entry: { runtime: { endpoint: string } }) => entry.runtime.endpoint),
      ["/api/admin/source-videos"]
    );
  });
});

test("stale source video status read model is ignored and rebuilt from manifests", async () => {
  const libraryRoot = await makeLibraryRoot();
  const modelPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "admin",
    "read-models",
    "source-video-status-read-model-v1.json"
  );
  await writeManifest(libraryRoot, sourceVideoManifest({
    source_video_id: "V000001",
    title: "真实排队素材",
    preprocess_status: "queued",
    visible_to_cutters: false
  }));
  await mkdir(path.dirname(modelPath), { recursive: true });
  await mkdir(path.join(libraryRoot, ".mixlab-library"), { recursive: true });
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "library.json"),
    `${JSON.stringify({
      library_id: "lib_main_001",
      name: "测试素材库",
      version: "1.0",
      created_at: "2026-05-02T11:00:00.000Z",
      updated_at: "2026-05-02T12:00:00.000Z",
      video_count: 1,
      ready_video_count: 0,
      processing_video_count: 0,
      queued_video_count: 1,
      unprocessed_video_count: 0,
      failed_video_count: 0,
      index_required_video_count: 0
    }, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    modelPath,
    `${JSON.stringify({
      schema_version: "1.0",
      generated_at: "2026-05-01T00:00:00.000Z",
      library_updated_at: "2026-05-01T00:00:00.000Z",
      video_count: 1,
      ids_by_status: {
        unprocessed: [],
        queued: [],
        processing: [],
        ready: [],
        failed: [],
        "index-required": ["V000001"]
      }
    }, null, 2)}\n`,
    "utf8"
  );

  await withServer(libraryRoot, async (baseUrl) => {
    const queued = await getJson(baseUrl, "/api/admin/source-videos?status=queued&limit=1");
    const status = await getJson(baseUrl, "/api/admin/read-model/status");

    assert.equal(queued.ok, true);
    assert.equal(queued.data[0].source_video_id, "V000001");
    assert.equal(queued.data[0].preprocess_status, "queued");
    assert.equal(status.data.source_video_status.freshness, "fresh");
    assert.equal(status.data.source_video_status.persisted, "fresh");
    assert.equal(status.data.source_video_status.library_updated_at, "2026-05-02T12:00:00.000Z");
    assert.equal(status.data.source_video_status.counts_by_status.queued, 1);
    assert.equal(status.data.source_video_status.counts_by_status["index-required"], 0);
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

test("blocks preprocessing supervisor start while processing tasks need recovery", async () => {
  const libraryRoot = await makeLibraryRoot();
  let runCount = 0;
  await writeManifest(libraryRoot, sourceVideoManifest({
    source_video_id: "V001440",
    preprocess_status: "processing"
  }));

  await withServer(
    libraryRoot,
    async (baseUrl) => {
      const safety = await getJson(baseUrl, "/api/admin/preprocess/safety");
      assert.equal(safety.ok, true);
      assert.equal(safety.data.safe_to_start, false);
      assert.equal(safety.data.blockers[0].code, "processing-needs-recovery");
      assert.deepEqual(safety.data.processing.source_video_ids, ["V001440"]);

      const started = await postJson(baseUrl, "/api/admin/preprocess/supervisor/start", { limit: 1 });
      assert.equal(started.ok, false);
      assert.equal(started.error_code, "preprocess_start_blocked");
      assert.match(started.message, /V001440/);
      assert.equal(started.details.safety.safe_to_start, false);
      assert.equal(runCount, 0);
    },
    {
      async runOnce() {
        runCount += 1;
        return {
          scan_result: {
            total_video_count: 0,
            new_video_count: 0,
            existing_video_count: 0,
            source_video_ids: []
          },
          total_claimed_count: 0,
          succeeded_count: 0,
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

test("preprocess jobs can read the active first page from fresh admin sqlite without JSON read model", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    library_id: "lib_main_001",
    name: "测试素材库",
    version: "1.0",
    created_at: "2026-05-02T11:00:00.000Z",
    updated_at: "2026-05-02T12:00:00.000Z",
    video_count: 3,
    ready_video_count: 1,
    processing_video_count: 1,
    queued_video_count: 1,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0
  };
  const jsonReadModelPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "admin",
    "read-models",
    "source-video-status-read-model-v1.json"
  );
  const processingManifest = sourceVideoManifest({
    source_video_id: "V000001",
    title: "正在处理素材",
    preprocess_status: "processing",
    visible_to_cutters: false
  });
  const queuedManifest = sourceVideoManifest({
    source_video_id: "V000002",
    title: "排队素材",
    preprocess_status: "queued",
    visible_to_cutters: false
  });
  const readyManifest = sourceVideoManifest({
    source_video_id: "V000003",
    title: "完成历史",
    preprocess_status: "ready",
    visible_to_cutters: true
  });

  await mkdir(path.join(libraryRoot, ".mixlab-library"), { recursive: true });
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "library.json"),
    `${JSON.stringify(library, null, 2)}\n`,
    "utf8"
  );
  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model: buildAdminSourceVideoStatusReadModel({
      library,
      manifests: [processingManifest, queuedManifest, readyManifest],
      default_page_limit: 20,
      generated_at: "2026-05-02T12:01:00.000Z"
    })
  });

  await withServer(libraryRoot, async (baseUrl) => {
    const jobs = await getJson(baseUrl, "/api/admin/preprocess/jobs?limit=2");
    const status = await getJson(baseUrl, "/api/admin/read-model/status");

    assert.equal(jobs.ok, true);
    assert.deepEqual(
      jobs.data.jobs.map((job: { source_video_id: string; status: string; title: string }) => [
        job.source_video_id,
        job.status,
        job.title
      ]),
      [
        ["V000001", "running", "正在处理素材"],
        ["V000002", "queued", "排队素材"]
      ]
    );
    assert.equal(jobs.data.active_count, 1);
    assert.equal(jobs.data.queued_count, 1);
    assert.equal(status.data.source_video_status.freshness, "missing");
    assert.equal(status.data.admin_read_model.freshness, "fresh");
    assert.equal(await fileOrDirExists(jsonReadModelPath), false);
  });
});

test("preprocess jobs can read ready history from fresh admin sqlite without job files", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    library_id: "lib_main_001",
    name: "测试素材库",
    version: "1.0",
    created_at: "2026-05-02T11:00:00.000Z",
    updated_at: "2026-05-02T12:00:00.000Z",
    video_count: 3,
    ready_video_count: 1,
    processing_video_count: 1,
    queued_video_count: 1,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0
  };
  const jsonReadModelPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "admin",
    "read-models",
    "source-video-status-read-model-v1.json"
  );
  const readyJobPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "videos",
    "V000003",
    "preprocess-job.json"
  );
  const processingManifest = sourceVideoManifest({
    source_video_id: "V000001",
    title: "正在处理素材",
    preprocess_status: "processing",
    visible_to_cutters: false
  });
  const queuedManifest = sourceVideoManifest({
    source_video_id: "V000002",
    title: "排队素材",
    preprocess_status: "queued",
    visible_to_cutters: false
  });
  const readyManifest = sourceVideoManifest({
    source_video_id: "V000003",
    title: "完成历史",
    preprocess_status: "ready",
    visible_to_cutters: true
  });

  await mkdir(path.join(libraryRoot, ".mixlab-library"), { recursive: true });
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "library.json"),
    `${JSON.stringify(library, null, 2)}\n`,
    "utf8"
  );
  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model: buildAdminSourceVideoStatusReadModel({
      library,
      manifests: [processingManifest, queuedManifest, readyManifest],
      default_page_limit: 20,
      generated_at: "2026-05-02T12:01:00.000Z"
    }),
    manifests: [processingManifest, queuedManifest, readyManifest],
    preprocess_jobs: [
      {
        source_video_id: "V000001",
        claimed_at: "2026-05-02T11:55:00.000Z"
      },
      {
        source_video_id: "V000002"
      },
      {
        source_video_id: "V000003",
        claimed_at: "2026-05-02T11:30:00.000Z",
        completed_at: "2026-05-02T11:40:00.000Z"
      }
    ]
  });

  await withServer(libraryRoot, async (baseUrl) => {
    const jobs = await getJson(baseUrl, "/api/admin/preprocess/jobs?offset=2&limit=1");
    const history = await getJson(baseUrl, "/api/admin/preprocess/process-history?limit=2&window_days=7");
    const historyReadiness = await getJson(baseUrl, "/api/admin/preprocess/process-history/readiness");
    const status = await getJson(baseUrl, "/api/admin/read-model/status");

    assert.equal(jobs.ok, true);
    assert.deepEqual(
      jobs.data.jobs.map((job: { source_video_id: string; status: string; title: string; completed_at: string }) => [
        job.source_video_id,
        job.status,
        job.title,
        job.completed_at
      ]),
      [
        ["V000003", "done", "完成历史", "2026-05-02T11:40:00.000Z"]
      ]
    );
    assert.equal(jobs.data.jobs[0].elapsed_ms, 600_000);
    assert.equal(history.ok, true);
    assert.equal(history.data.history_available, true);
    assert.equal(history.data.actual_data_source, "admin-read-model");
    assert.equal(history.data.cache_status, "hit");
    assert.equal(history.data.scan_mode, "no-scan");
    assert.deepEqual(
      history.data.items.map((item: { source_video_id: string; preprocess_status: string; last_event_type: string }) => [
        item.source_video_id,
        item.preprocess_status,
        item.last_event_type
      ]),
      [
        ["V000001", "processing", "claimed"],
        ["V000003", "ready", "completed"]
      ]
    );
    assert.deepEqual(history.data.summary, {
      returned_count: 2,
      completed_count: 1,
      failed_count: 0,
      active_count: 1,
      average_process_ms: 600_000,
      tracked_count: 3,
      tracked_completed_count: 1,
      tracked_failed_count: 0,
      tracked_active_count: 2,
      tracked_average_process_ms: 600_000,
      window_start_at: "2026-04-25T12:00:00.000Z",
      newest_event_at: "2026-05-02T11:55:00.000Z",
      oldest_event_at: "2026-05-02T11:40:00.000Z",
      status_counts: {
        unprocessed: 0,
        queued: 1,
        processing: 1,
        ready: 1,
        failed: 0,
        "index-required": 0
      },
      event_counts: {
        failed: 0,
        indexed: 0,
        completed: 1,
        claimed: 1,
        status: 1
      },
      source_folder_summaries: [{
        source_folder_name: "未归类",
        tracked_count: 3,
        completed_count: 1,
        failed_count: 0,
        active_count: 2,
        average_process_ms: 600_000,
        newest_event_at: "2026-05-02T11:55:00.000Z"
      }],
      daily_trend: [{
        date: "2026-05-02",
        tracked_count: 2,
        completed_count: 1,
        failed_count: 0,
        active_count: 1,
        average_process_ms: 600_000
      }]
    });
    assert.equal(historyReadiness.ok, true);
    assert.equal(historyReadiness.data.actual_data_source, "admin-read-model");
    assert.equal(historyReadiness.data.scan_mode, "no-scan");
    assert.equal(historyReadiness.data.ready_for_process_history, true);
    assert.equal(historyReadiness.data.reason, "ready");
    assert.equal(historyReadiness.data.expected_job_snapshot_rows, 3);
    assert.equal(historyReadiness.data.snapshot_metadata_row_count, 3);
    assert.equal(historyReadiness.data.snapshot_table_row_count, 3);
    assert.equal(status.data.source_video_status.freshness, "missing");
    assert.equal(status.data.admin_read_model.freshness, "fresh");
    assert.equal(await fileOrDirExists(jsonReadModelPath), false);
    assert.equal(await fileOrDirExists(readyJobPath), false);
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

test("preprocess jobs include processing videos outside the generic manifest page immediately", async () => {
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
    const running = first.data.jobs.find((job: any) => job.source_video_id === "V000008");
    assert.ok(running);
    assert.equal(running.title, "分页外停滞任务");
    assert.equal(running.status, "running");
    assert.equal(running.status_label, "正在处理");
  });
});

test("preprocess jobs include far processing rows from the status read model on the first page", async () => {
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
    assert.equal(first.data.jobs[0]?.source_video_id, "V000150");
    assert.equal(first.data.jobs[0]?.title, "远端停滞任务");
    assert.equal(first.data.jobs[0]?.status, "running");
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
      auto_scan_enabled: true,
      auto_queue_enabled: true,
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

  const operationLog = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-05-02T12:10:00.000Z",
    limit: 50
  });
  const scanSucceeded = operationLog.events.find(
    (event) => event.action === "library-scan" && event.event_type === "succeeded"
  );
  const scanDetails = scanSucceeded?.details as {
    actor?: {
      kind?: string;
      source?: string;
      label?: string;
    };
    lease_reason?: string;
    scan_mode?: string;
    command_snapshot?: {
      created?: boolean;
      snapshot_kind?: string;
    };
  } | undefined;
  assert.equal(scanSucceeded?.area, "protection");
  assert.equal(scanDetails?.lease_reason, "library-scan");
  assert.equal(scanDetails?.scan_mode, "folder-scan");
  assert.deepEqual(scanDetails?.actor, {
    kind: "system",
    source: "system-task",
    label: "预处理流水线自动扫描"
  });
  assert.equal(scanDetails?.command_snapshot?.created, true);
  assert.equal(scanDetails?.command_snapshot?.snapshot_kind, "file-capture");

  const publishEvents = operationLog.events.filter(
    (event) => event.action === "source-video-publish"
  );
  assert.equal(
    publishEvents.filter((event) => event.event_type === "started").length,
    2
  );
  const succeededEvents = publishEvents.filter((event) => event.event_type === "succeeded");
  assert.equal(succeededEvents.length, 2);
  const succeeded = succeededEvents[0];
  const details = succeeded?.details as {
    actor?: {
      kind?: string;
      source?: string;
      label?: string;
    };
    lease_reason?: string;
    scan_mode?: string;
    command_snapshot?: {
      created?: boolean;
      snapshot_kind?: string;
    };
  } | undefined;
  assert.equal(succeeded?.area, "release");
  assert.equal(details?.lease_reason, "source-video-publish");
  assert.equal(details?.scan_mode, "single-id");
  assert.deepEqual(details?.actor, {
    kind: "system",
    source: "system-task",
    label: "预处理流水线自动发布"
  });
  assert.equal(details?.command_snapshot?.created, true);
  assert.equal(details?.command_snapshot?.snapshot_kind, "file-capture");
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
      auto_scan_enabled: true,
      auto_queue_enabled: true,
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

test("admin preprocess pipeline skips hidden scan and auto queue when runtime policy disables both", async () => {
  const libraryRoot = await makeLibraryRoot();
  await prepareQueuedSourceVideos(libraryRoot, ["a.mp4", "b.mp4"]);
  await writeFile(path.join(libraryRoot, "source-videos", "c.mp4"), "video-c");
  let nowIndex = 0;
  let cycleCount = 0;

  const result = await runAdminPreprocessPipeline({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "测试素材库",
    runtime_policy: {
      audio_mode: "mp3_16k_mono_64k",
      concurrent_jobs: 5,
      auto_scan_enabled: false,
      auto_queue_enabled: false,
      auto_publish_index_enabled: false
    },
    now: () => `2026-05-02T14:${String(nowIndex++).padStart(2, "0")}:00.000Z`,
    media: {
      async create_cover(input) {
        await mkdir(path.dirname(input.output_path), { recursive: true });
        await writeFile(input.output_path, `cover ${path.basename(input.source_path)}`);
      }
    },
    async run_worker_cycle(workerInput) {
      cycleCount += 1;
      assert.equal(workerInput.limit, 5);
      assert.equal(workerInput.scan_before_claim, false);
      assert.deepEqual(workerInput.claim_statuses, ["queued"]);

      return runStubPreprocessWorkerCycle(libraryRoot, workerInput);
    }
  });

  assert.equal(result.scan_result.total_video_count, 2);
  assert.equal(result.scan_result.new_video_count, 0);
  assert.equal(result.scan_result.existing_video_count, 2);
  assert.deepEqual(result.scan_result.source_video_ids, ["V000001", "V000002"]);
  assert.equal(result.total_claimed_count, 2);
  assert.equal(result.succeeded_count, 2);
  assert.equal(result.published_count, 0);
  assert.equal(cycleCount, 2);

  const firstManifest = await readSourceVideoManifest(libraryRoot, "V000001");
  const secondManifest = await readSourceVideoManifest(libraryRoot, "V000002");
  assert.equal(firstManifest.preprocess_status, "index-required");
  assert.equal(firstManifest.visible_to_cutters, false);
  assert.equal(secondManifest.preprocess_status, "index-required");
  assert.equal(secondManifest.visible_to_cutters, false);
  assert.equal(
    await fileOrDirExists(path.join(libraryRoot, ".mixlab-library", "videos", "V000003", "source-video.json")),
    false
  );

  const operationLog = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-05-02T14:10:00.000Z",
    limit: 20
  });
  assert.equal(
    operationLog.events.some((event) => event.action === "library-scan"),
    false
  );
});

test("admin preprocess pipeline scans without auto queue leaves discovered videos unprocessed", async () => {
  const libraryRoot = await makeLibraryRoot();
  await mkdir(path.join(libraryRoot, "source-videos"), { recursive: true });
  await writeFile(path.join(libraryRoot, "source-videos", "a.mp4"), "video-a");
  let nowIndex = 0;
  let cycleCount = 0;

  const result = await runAdminPreprocessPipeline({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "测试素材库",
    runtime_policy: {
      audio_mode: "mp3_16k_mono_64k",
      concurrent_jobs: 1,
      auto_scan_enabled: true,
      auto_queue_enabled: false,
      auto_publish_index_enabled: true
    },
    now: () => `2026-05-02T15:${String(nowIndex++).padStart(2, "0")}:00.000Z`,
    media: {
      async create_cover(input) {
        await mkdir(path.dirname(input.output_path), { recursive: true });
        await writeFile(input.output_path, `cover ${path.basename(input.source_path)}`);
      }
    },
    async run_worker_cycle(workerInput) {
      cycleCount += 1;
      assert.equal(workerInput.scan_before_claim, false);
      assert.deepEqual(workerInput.claim_statuses, ["queued"]);

      return runStubPreprocessWorkerCycle(libraryRoot, workerInput);
    }
  });

  assert.equal(result.scan_result.total_video_count, 1);
  assert.equal(result.scan_result.new_video_count, 1);
  assert.equal(result.total_claimed_count, 0);
  assert.equal(result.succeeded_count, 0);
  assert.equal(result.published_count, 0);
  assert.equal(cycleCount, 1);

  const manifest = await readSourceVideoManifest(libraryRoot, "V000001");
  assert.equal(manifest.preprocess_status, "unprocessed");
  assert.equal(manifest.visible_to_cutters, false);
});

test("admin preprocess pipeline leaves completed videos index-required when auto publish is disabled", async () => {
  const libraryRoot = await makeLibraryRoot();
  await mkdir(path.join(libraryRoot, "source-videos"), { recursive: true });
  await writeFile(path.join(libraryRoot, "source-videos", "a.mp4"), "video-a");
  let nowIndex = 0;
  let cycleCount = 0;

  const result = await runAdminPreprocessPipeline({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "测试素材库",
    runtime_policy: {
      audio_mode: "mp3_16k_mono_64k",
      concurrent_jobs: 1,
      auto_scan_enabled: true,
      auto_queue_enabled: true,
      auto_publish_index_enabled: false
    },
    now: () => `2026-05-02T16:${String(nowIndex++).padStart(2, "0")}:00.000Z`,
    media: {
      async create_cover(input) {
        await mkdir(path.dirname(input.output_path), { recursive: true });
        await writeFile(input.output_path, `cover ${path.basename(input.source_path)}`);
      }
    },
    async run_worker_cycle(workerInput) {
      cycleCount += 1;
      assert.equal(workerInput.scan_before_claim, false);
      assert.deepEqual(workerInput.claim_statuses, ["queued"]);

      return runStubPreprocessWorkerCycle(libraryRoot, workerInput);
    }
  });

  assert.equal(result.total_claimed_count, 1);
  assert.equal(result.succeeded_count, 1);
  assert.equal(result.published_count, 0);
  assert.deepEqual(result.prepared_source_video_ids, []);
  assert.deepEqual(result.published_source_video_ids, []);
  assert.equal(cycleCount, 2);

  const manifest = await readSourceVideoManifest(libraryRoot, "V000001");
  assert.equal(manifest.preprocess_status, "index-required");
  assert.equal(manifest.visible_to_cutters, false);
  assert.equal(
    await fileOrDirExists(
      path.join(libraryRoot, ".mixlab-library", "indexes", "source-transcript-index", "current.json")
    ),
    false
  );
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
  const jsonReadModelPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "admin",
    "read-models",
    "source-video-status-read-model-v1.json"
  );

  await withServer(libraryRoot, async (baseUrl) => {
    await postJson(baseUrl, "/api/admin/library/init");
    await postJson(baseUrl, "/api/admin/library/scan");

    const queued = await postJson(baseUrl, "/api/admin/preprocess/queue-unprocessed");
    assert.equal(queued.data.affected_count, 1);
    const warmedQueued = await getJson(baseUrl, "/api/admin/source-videos?status=queued&limit=1");
    const warmedStatus = await getJson(baseUrl, "/api/admin/read-model/status");
    assert.equal(warmedQueued.data[0].source_video_id, "V000001");
    assert.equal(warmedStatus.data.admin_read_model.freshness, "fresh");

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

    const queuedAfterMetadata = await getJson(baseUrl, "/api/admin/source-videos?status=queued&limit=1");
    const readModelAfterMetadata = await getJson(baseUrl, "/api/admin/read-model/status");
    assert.equal(queuedAfterMetadata.data[0].title, "现金流管理新版");
    assert.equal(readModelAfterMetadata.data.admin_read_model.freshness, "fresh");
    assert.equal(readModelAfterMetadata.data.source_video_status.freshness, "missing");
    assert.equal(await fileOrDirExists(jsonReadModelPath), false);

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

test("scan preview blocks applying source-folder changes that would remove ready videos", async () => {
  const libraryRoot = await makeLibraryRoot();
  const externalSource = path.join(libraryRoot, "external-source");
  await mkdir(path.join(libraryRoot, "source-videos"), { recursive: true });
  await mkdir(externalSource, { recursive: true });
  await writeFile(path.join(libraryRoot, "source-videos", "ready.mp4"), "video");
  await writeFile(path.join(externalSource, "new.mp4"), "video");

  await withServer(libraryRoot, async (baseUrl) => {
    await postJson(baseUrl, "/api/admin/library/init");
    await postJson(baseUrl, "/api/admin/library/scan");
    const readyManifest = sourceVideoManifest({
      source_video_id: "V000001",
      relative_path: "ready.mp4",
      preprocess_status: "ready",
      visible_to_cutters: true
    });
    const readyLibrary = {
      library_id: "lib_main_001",
      name: "测试素材库",
      version: "1.0",
      created_at: "2026-05-02T11:00:00.000Z",
      updated_at: "2026-05-02T12:00:00.000Z",
      video_count: 1,
      ready_video_count: 1,
      processing_video_count: 0,
      queued_video_count: 0,
      unprocessed_video_count: 0,
      failed_video_count: 0,
      index_required_video_count: 0
    };
    await writeFile(
      path.join(libraryRoot, ".mixlab-library", "library.json"),
      `${JSON.stringify(readyLibrary, null, 2)}\n`,
      "utf8"
    );
    await writeManifest(libraryRoot, readyManifest);
    await writeAdminSourceVideoStatusReadModelStore({
      library_root: libraryRoot,
      model: buildAdminSourceVideoStatusReadModel({
        library: readyLibrary,
        manifests: [readyManifest],
        default_page_limit: 20,
        generated_at: "2026-05-02T12:01:00.000Z"
      })
    });

    const settings = await readAdminSettings(libraryRoot);
    await writeAdminSettings(libraryRoot, {
      ...settings,
      source_folders: settings.source_folders.map((folder) =>
        folder.id === "src_default"
          ? { ...folder, path: externalSource }
          : folder
      )
    });

    const beforeStatus = await getJson(baseUrl, "/api/admin/read-model/status");
    const beforeOperationLog = await getJson(baseUrl, "/api/admin/operation-log?limit=10");
    const preview = await postJson(baseUrl, "/api/admin/library/scan-preview");
    assert.equal(preview.ok, true);
    assert.equal(preview.data.blocked, true);
    assert.equal(preview.data.inactive_ready_count, 1);
    assert.deepEqual(preview.data.inactive_ready_source_video_ids, ["V000001"]);
    assert.equal(preview.data.blockers[0].code, "ready-manifest-removal");

    const scan = await postJson(baseUrl, "/api/admin/library/scan");
    assert.equal(scan.ok, false);
    assert.equal(scan.error_code, "scan_blocked");
    assert.equal(scan.details.preview.blocked, true);
    const afterStatus = await getJson(baseUrl, "/api/admin/read-model/status");
    const afterOperationLog = await getJson(baseUrl, "/api/admin/operation-log?limit=10");

    assert.equal(beforeStatus.data.admin_read_model.freshness, "fresh");
    assert.equal(afterStatus.data.admin_read_model.freshness, "fresh");
    assert.equal(afterStatus.data.admin_read_model.reconciliation.action, "none");
    assert.deepEqual(
      afterOperationLog.data.events
        .filter((event: { action: string }) => event.action === "read-model-invalidate")
        .map((event: { event_id: string }) => event.event_id),
      beforeOperationLog.data.events
        .filter((event: { action: string }) => event.action === "read-model-invalidate")
        .map((event: { event_id: string }) => event.event_id)
    );
    assert.equal(afterOperationLog.data.events.some((event: {
      action: string;
      event_type: string;
      details: { error_code?: string };
    }) =>
      event.action === "library-scan" &&
      event.event_type === "failed"
    ), true);

    const manifest = JSON.parse(
      await readFile(
        path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json"),
        "utf8"
      )
    );
    assert.equal(manifest.preprocess_status, "ready");
    assert.equal(manifest.visible_to_cutters, true);
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
    const initialized = await postJson(baseUrl, "/api/admin/library/init");
    assert.equal(initialized.ok, true);
    assert.equal(initialized.data.video_count, 4);
    assert.equal(initialized.data.processing_video_count, 2);

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

    const library = await getJson(baseUrl, "/api/admin/library/status");
    assert.equal(library.data.video_count, 4);
    assert.equal(library.data.ready_video_count, 0);
    assert.equal(library.data.processing_video_count, 0);
    assert.equal(library.data.queued_video_count, 4);
    assert.equal(library.data.unprocessed_video_count, 0);
    assert.equal(library.data.failed_video_count, 0);
    assert.equal(library.data.index_required_video_count, 0);

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
  const fixture = await seedIndexRequiredPublishFixture(libraryRoot);

  await withServer(
    libraryRoot,
    async (baseUrl) => {
      const published = await postJson(baseUrl, "/api/admin/index/repair");
      assert.equal(published.ok, true);
      assert.equal(published.data.published_count, 1);
      assert.equal(published.data.skipped_count, 0);
      assert.deepEqual(published.data.published_source_video_ids, ["V000001"]);
      assert.match(published.data.message, /已上线 1 个素材/);

      const detail = await getJson(baseUrl, "/api/admin/source-videos/V000001");
      assert.equal(detail.data.preprocess.status, "ready");
      assert.equal(detail.data.visibility.visible_to_cutters, true);
      assert.equal(detail.data.artifacts.cover.exists, true);
      assert.equal(detail.data.artifacts.keyframes.exists, true);

      const readModelStatus = await getJson(baseUrl, "/api/admin/read-model/status");
      assert.equal(readModelStatus.data.source_video_status.freshness, "missing");
      assert.equal(readModelStatus.data.admin_read_model.freshness, "fresh");
      assert.equal(readModelStatus.data.admin_read_model.reconciliation.action, "none");
      assert.equal(readModelStatus.data.admin_read_model.reconciliation.scan_mode, "no-scan");
      assert.equal(readModelStatus.data.admin_read_model.counts_by_status.ready, 1);
      assert.equal(readModelStatus.data.admin_read_model.counts_by_status["index-required"], 0);
      assert.equal(await fileOrDirExists(fixture.json_read_model_path), false);

      const indexRequired = await getJson(baseUrl, "/api/admin/source-videos?status=index-required&limit=1");
      assert.deepEqual(indexRequired.data, []);

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

test("single source-video publish writes through to fresh admin sqlite", async () => {
  const libraryRoot = await makeLibraryRoot();
  await seedIndexRequiredPublishFixture(libraryRoot);

  await withServer(
    libraryRoot,
    async (baseUrl) => {
      const published = await postJson(baseUrl, "/api/admin/source-videos/V000001/publish");
      assert.equal(published.ok, true);
      assert.equal(published.data.published_count, 1);
      assert.deepEqual(published.data.published_source_video_ids, ["V000001"]);

      const readModelStatus = await getJson(baseUrl, "/api/admin/read-model/status");
      assert.equal(readModelStatus.data.admin_read_model.freshness, "fresh");
      assert.equal(readModelStatus.data.admin_read_model.reconciliation.scan_mode, "no-scan");
      assert.equal(readModelStatus.data.admin_read_model.counts_by_status.ready, 1);
      assert.equal(readModelStatus.data.admin_read_model.counts_by_status["index-required"], 0);

      const indexRequired = await getJson(baseUrl, "/api/admin/source-videos?status=index-required&limit=1");
      assert.deepEqual(indexRequired.data, []);
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
    assert.equal(response.data.limit, 8);
    assert.equal(response.data.has_more, true);
    assert.equal(response.data.versions.length, 9);
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

test("source folder mutations mark fresh admin sqlite stale without rebuilding JSON read model", async () => {
  const libraryRoot = await makeLibraryRoot();
  const { json_read_model_path: jsonReadModelPath } = await seedIndexRequiredPublishFixture(libraryRoot);

  await withServer(libraryRoot, async (baseUrl) => {
    const before = await getJson(baseUrl, "/api/admin/read-model/status");
    const added = await postJson(baseUrl, "/api/admin/settings/source-folders", {
      name: "课程素材",
      path: "/Volumes/CourseVideos",
      enabled: true
    });
    const afterAdd = await getJson(baseUrl, "/api/admin/read-model/status");
    const updated = await patchJson(baseUrl, "/api/admin/settings/source-folders/src_002", {
      name: "课程素材归档",
      enabled: false
    });
    const removed = await deleteJson(baseUrl, "/api/admin/settings/source-folders/src_002");
    const afterRemove = await getJson(baseUrl, "/api/admin/read-model/status");
    const operationLog = await getJson(baseUrl, "/api/admin/operation-log?limit=10");

    assert.equal(before.data.admin_read_model.freshness, "fresh");
    assert.equal(added.ok, true);
    assert.equal(updated.ok, true);
    assert.equal(removed.ok, true);
    assert.equal(afterAdd.data.admin_read_model.freshness, "stale");
    assert.equal(afterAdd.data.admin_read_model.invalidation_reason, "source-folder-scope-change");
    assert.equal(afterAdd.data.admin_read_model.reconciliation.action, "rebuild");
    assert.equal(afterAdd.data.admin_read_model.reconciliation.scan_mode, "full-reconcile");
    assert.equal(afterAdd.data.admin_read_model.reconciliation.safe_for_page_request, false);
    assert.equal(afterRemove.data.admin_read_model.freshness, "stale");
    assert.equal(afterRemove.data.admin_read_model.invalidation_reason, "source-folder-scope-change");
    const invalidationEvents = operationLog.data.events.filter((event: { action: string }) =>
      event.action === "read-model-invalidate"
    );
    assert.equal(invalidationEvents.length, 3);
    assert.equal(invalidationEvents[0].event_type, "succeeded");
    assert.equal(invalidationEvents[0].details.command, "source-folder-remove");
    assert.equal(invalidationEvents[0].details.invalidation_reason, "source-folder-scope-change");
    assert.equal(invalidationEvents[0].details.stale_mark_applied, true);
    assert.equal(await fileOrDirExists(jsonReadModelPath), false);
  });
});

test("settings source_folders patch marks fresh admin sqlite stale without hidden rebuild", async () => {
  const libraryRoot = await makeLibraryRoot();
  const { json_read_model_path: jsonReadModelPath } = await seedIndexRequiredPublishFixture(libraryRoot);
  const externalSource = path.join(libraryRoot, "external-source");
  await mkdir(externalSource, { recursive: true });

  await withServer(libraryRoot, async (baseUrl) => {
    const before = await getJson(baseUrl, "/api/admin/read-model/status");
    const current = await getJson(baseUrl, "/api/admin/settings/config");
    const saved = await patchJson(baseUrl, "/api/admin/settings/config", {
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
    const after = await getJson(baseUrl, "/api/admin/read-model/status");
    const operationLog = await getJson(baseUrl, "/api/admin/operation-log?limit=5");

    assert.equal(before.data.admin_read_model.freshness, "fresh");
    assert.equal(saved.ok, true);
    assert.equal(after.data.admin_read_model.freshness, "stale");
    assert.equal(after.data.admin_read_model.invalidation_reason, "source-folder-scope-change");
    assert.equal(after.data.admin_read_model.reconciliation.action, "rebuild");
    assert.equal(after.data.admin_read_model.reconciliation.requires_background_reconcile, true);
    assert.equal(after.data.admin_read_model.reconciliation.safe_for_page_request, false);
    const invalidationEvent = operationLog.data.events.find((event: { action: string }) =>
      event.action === "read-model-invalidate"
    );
    assert.equal(invalidationEvent.event_type, "succeeded");
    assert.equal(invalidationEvent.details.command, "settings-config");
    assert.equal(invalidationEvent.details.stale_mark_result, "invalidated");
    assert.equal(operationLog.data.events.some((event: { action: string; event_type: string }) =>
      event.action === "settings-config" && event.event_type === "succeeded"
    ), true);
    assert.equal(await fileOrDirExists(jsonReadModelPath), false);
  });
});

test("library scan returns read-model reconcile handoff after marking admin sqlite stale", async () => {
  const libraryRoot = await makeLibraryRoot();
  const { json_read_model_path: jsonReadModelPath } = await seedIndexRequiredPublishFixture(libraryRoot);

  await withServer(libraryRoot, async (baseUrl) => {
    const before = await getJson(baseUrl, "/api/admin/read-model/status");
    const scan = await postJson(baseUrl, "/api/admin/library/scan");
    const finished = await waitForReadModelReconcileStatus(baseUrl, "succeeded");
    const after = await getJson(baseUrl, "/api/admin/read-model/status");
    const operationLog = await getJson(baseUrl, "/api/admin/operation-log?limit=20");

    assert.equal(before.data.admin_read_model.freshness, "fresh");
    assert.equal(scan.ok, true);
    assert.equal(scan.data.read_model.command, "library-scan");
    assert.equal(scan.data.read_model.invalidation_reason, "library-scan-or-init");
    assert.equal(scan.data.read_model.stale_mark.applied, true);
    assert.equal(scan.data.read_model.stale_mark.reason, "invalidated");
    assert.equal(scan.data.read_model.reconciliation.action, "rebuild");
    assert.equal(scan.data.read_model.reconciliation.scan_mode, "full-reconcile");
    assert.equal(scan.data.read_model.reconciliation.requires_background_reconcile, true);
    assert.equal(scan.data.read_model.reconciliation.safe_for_page_request, false);
    assert.equal(scan.data.read_model.reconcile_schedule.policy, "post-scan-reconcile-v1");
    assert.equal(scan.data.read_model.reconcile_schedule.requested, true);
    assert.equal(scan.data.read_model.reconcile_schedule.accepted, true);
    assert.equal(scan.data.read_model.reconcile_schedule.reason, "started");
    assert.equal(scan.data.read_model.reconcile_schedule.command, "library-scan");
    assert.equal(scan.data.read_model.reconcile_schedule.action, "rebuild");
    assert.equal(scan.data.read_model.reconcile_schedule.scan_mode, "full-reconcile");
    assert.equal(scan.data.read_model.reconcile_schedule.safe_for_page_request, false);
    assert.equal(finished.data.status, "succeeded");
    assert.equal(finished.data.result.applied, true);
    assert.equal(after.data.admin_read_model.freshness, "fresh");
    assert.equal(after.data.admin_read_model.reconciliation.action, "none");
    assert.equal(after.data.admin_read_model.reconciliation.safe_for_page_request, true);
    const invalidationEvent = operationLog.data.events.find((event: { action: string }) =>
      event.action === "read-model-invalidate"
    );
    assert.equal(invalidationEvent.event_type, "succeeded");
    assert.equal(invalidationEvent.details.command, "library-scan");
    assert.equal(invalidationEvent.details.invalidation_reason, "library-scan-or-init");
    assert.equal(operationLog.data.events.some((event: { action: string; event_type: string }) =>
      event.action === "library-scan" && event.event_type === "succeeded"
    ), true);
    assert.equal(operationLog.data.events.some((event: { action: string; event_type: string }) =>
      event.action === "read-model-reconcile" && event.event_type === "succeeded"
    ), true);
    assert.equal(await fileOrDirExists(jsonReadModelPath), false);
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

test("dashboard metrics exposes read-model provenance for large libraries", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    library_id: "lib_main_001",
    name: "测试素材库",
    version: "1.0",
    created_at: "2026-05-02T11:00:00.000Z",
    updated_at: "2026-05-02T12:00:00.000Z",
    video_count: 101,
    ready_video_count: 99,
    processing_video_count: 0,
    queued_video_count: 0,
    unprocessed_video_count: 0,
    failed_video_count: 1,
    index_required_video_count: 1
  };
  const manifests = Array.from({ length: 101 }, (_, index) => {
    const ordinal = index + 1;
    const sourceVideoId = `V${String(ordinal).padStart(6, "0")}`;
    const preprocessStatus = ordinal === 100
      ? "failed"
      : ordinal === 101
        ? "index-required"
        : "ready";

    return sourceVideoManifest({
      source_video_id: sourceVideoId,
      title: `大库素材 ${ordinal}`,
      relative_path: `course/${sourceVideoId}.mp4`,
      content_hash: `sha256:${sourceVideoId}`,
      preprocess_status: preprocessStatus,
      visible_to_cutters: preprocessStatus === "ready",
      duration_ms: 60_000,
      file_size: 1024
    });
  });

  await mkdir(path.join(libraryRoot, ".mixlab-library"), { recursive: true });
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "library.json"),
    `${JSON.stringify(library, null, 2)}\n`,
    "utf8"
  );
  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model: buildAdminSourceVideoStatusReadModel({
      library,
      manifests,
      default_page_limit: 20,
      generated_at: "2026-05-02T12:00:30.000Z"
    }),
    manifests,
    preprocess_jobs: manifests.map((manifest) => ({
      source_video_id: manifest.source_video_id,
      claimed_at: manifest.preprocess_status === "ready" ? "2026-05-02T10:00:00.000Z" : "",
      completed_at: manifest.preprocess_status === "ready" ? "2026-05-02T10:01:00.000Z" : "",
      indexed_at: manifest.preprocess_status === "ready" ? "2026-05-02T10:02:00.000Z" : "",
      failed_at: manifest.preprocess_status === "failed" ? "2026-05-02T10:03:00.000Z" : ""
    }))
  });

  await withServer(libraryRoot, async (baseUrl) => {
    const metrics = await getJson(baseUrl, "/api/admin/dashboard/metrics");
    const runtime = assertAdminRuntimeMeta(metrics, {
      endpoint: "/api/admin/dashboard/metrics",
      scan_mode: "no-scan",
      data_source: "admin-read-model",
      scan_reason: "background-metrics"
    });

    assert.equal(metrics.ok, true);
    assert.equal(metrics.data.material.video_count, 101);
    assert.equal(metrics.data.material.total_duration_ms, 6_060_000);
    assert.equal(metrics.data.production.completed_today_count, 99);
    assert.equal(metrics.data.risk.failed_video_count, 1);
    assert.equal(metrics.data.risk.index_required_video_count, 1);
    assert.equal(metrics.data.sources.material.data_source, "admin-read-model");
    assert.equal(metrics.data.sources.material.scan_mode, "no-scan");
    assert.equal(metrics.data.sources.production.data_source, "admin-read-model");
    assert.equal(metrics.data.sources.risk.data_source, "admin-read-model");
    assert.equal(metrics.data.sources.transcript.data_source, "current-index");
    assert.equal(runtime.actual_data_source, "admin-read-model");
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

test("dashboard metrics skips malformed usage history and reports event-store health", async () => {
  const libraryRoot = await makeLibraryRoot();
  await mkdir(path.join(libraryRoot, ".mixlab-library", "usage-events"), { recursive: true });
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "usage-events", "events.ndjson"),
    "{broken json}\n",
    "utf8"
  );

  await withServer(libraryRoot, async (baseUrl) => {
    const metrics = await getJson(baseUrl, "/api/admin/dashboard/metrics");

    assert.equal(metrics.ok, true);
    assert.equal(metrics.data.usage.search_request_count, 0);
    assert.equal(metrics.data.usage.event_store.line_count, 1);
    assert.equal(metrics.data.usage.event_store.valid_line_count, 0);
    assert.equal(metrics.data.usage.event_store.malformed_line_count, 1);
    assert.deepEqual(metrics.data.usage.event_store.malformed_lines, [1]);
    assert.match(metrics.data.usage.event_store.warning, /已跳过第 1 行/);
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

    const operationLog = await getJson(baseUrl, "/api/admin/operation-log?limit=10");
    const succeededActions = operationLog.data.events
      .filter((event: { event_type: string }) => event.event_type === "succeeded")
      .map((event: { action: string }) => event.action);
    assert.deepEqual(succeededActions.slice(0, 2), [
      "cutter-user-disable",
      "cutter-user-approve"
    ]);
    assert.equal(operationLog.data.events[0].area, "users");
    assert.equal(operationLog.data.events[0].details.actor.kind, "system");
    assert.equal(operationLog.data.events[0].details.actor.source, "auth-disabled");
    assert.equal(
      (operationLog.data.events[0].details.command_snapshot as { created?: boolean }).created,
      true
    );
  });
});

test("admin can reset cutter user password and invalidate sessions", async () => {
  const libraryRoot = await makeLibraryRoot();
  const application = await createCutterLoginApplication(libraryRoot, {
    username: "password-target",
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

    const reset = await postJson(
      baseUrl,
      `/api/admin/cutter-users/${application.user_id}/password`,
      { new_password: "Cutter67890" }
    );
    assert.equal(reset.ok, true);
    assert.equal(reset.data.user_id, application.user_id);
    assert.equal("password_hash" in reset.data, false);

    const raw = JSON.parse(await readFile(
      path.join(libraryRoot, ".mixlab-library", "cutter-users", "users.json"),
      "utf8"
    )) as {
      users: Array<{ user_id: string; password_hash?: string }>;
      sessions: unknown[];
    };
    const storedUser = raw.users.find((user) => user.user_id === application.user_id);
    assert.ok(storedUser?.password_hash);
    assert.notEqual(storedUser.password_hash, "Cutter67890");
    assert.equal(raw.sessions.length, 0);

    const weakPassword = await postJson(
      baseUrl,
      `/api/admin/cutter-users/${application.user_id}/password`,
      { new_password: "123" }
    );
    assert.equal(weakPassword.ok, false);
    assert.equal(weakPassword.error_code, "invalid_request");

    const operationLog = await getJson(baseUrl, "/api/admin/operation-log?limit=20");
    const passwordResetSucceeded = operationLog.data.events.find(
      (event: { action: string; event_type: string }) =>
        event.action === "cutter-user-password-reset" && event.event_type === "succeeded"
    );
    assert.ok(passwordResetSucceeded);
    assert.equal(passwordResetSucceeded.area, "users");
    assert.equal(passwordResetSucceeded.details.scan_mode, "no-scan");
    assert.deepEqual(passwordResetSucceeded.details.mutation_targets, ["cutter-user-store"]);
    assert.equal(JSON.stringify(passwordResetSucceeded.details).includes("Cutter67890"), false);
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
  const library = {
    library_id: "lib_main_001",
    name: "测试素材库",
    version: "1.0",
    created_at: "2026-05-02T11:00:00.000Z",
    updated_at: "2026-05-02T12:00:00.000Z",
    video_count: 1,
    ready_video_count: 0,
    processing_video_count: 0,
    queued_video_count: 1,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0
  };
  const manifest = sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "queued",
    visible_to_cutters: false,
    cover_path: ""
  });
  const jsonReadModelPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "admin",
    "read-models",
    "source-video-status-read-model-v1.json"
  );

  await mkdir(path.join(libraryRoot, ".mixlab-library"), { recursive: true });
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "library.json"),
    `${JSON.stringify(library, null, 2)}\n`,
    "utf8"
  );
  await writeManifest(libraryRoot, manifest);
  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model: buildAdminSourceVideoStatusReadModel({
      library,
      manifests: [manifest],
      default_page_limit: 20,
      generated_at: "2026-05-02T12:01:00.000Z"
    })
  });

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

    const readModelStatus = await getJson(baseUrl, "/api/admin/read-model/status");
    assert.equal(readModelStatus.data.source_video_status.freshness, "missing");
    assert.equal(readModelStatus.data.admin_read_model.freshness, "fresh");
    assert.equal(readModelStatus.data.admin_read_model.reconciliation.scan_mode, "no-scan");
    assert.equal(readModelStatus.data.admin_read_model.counts_by_status.queued, 1);
    assert.equal(await fileOrDirExists(jsonReadModelPath), false);

    const queued = await getJson(baseUrl, "/api/admin/source-videos?status=queued&limit=1");
    assert.equal(queued.data[0].source_video_id, "V000001");
    assert.equal(queued.data[0].cover_url, "/api/admin/source-videos/V000001/cover");

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
