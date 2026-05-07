import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminApiClient,
  createFixtureAdminApiClient,
  loadAdminDashboardData,
  unwrapAdminResponse,
  type AdminApiEnvelope,
  type AdminSettingsConfig
} from "./api.ts";

test("unwraps successful admin API envelopes", () => {
  assert.deepEqual(unwrapAdminResponse({ ok: true, data: { ready: 120 } }), {
    ready: 120
  });
});

test("throws readable admin API errors", () => {
  const envelope: AdminApiEnvelope<unknown> = {
    ok: false,
    error_code: "LIBRARY_NOT_FOUND",
    message: "无法访问公共素材库，请检查路径是否正确。",
    details: { path: "/Volumes/MixLab" }
  };

  assert.throws(() => unwrapAdminResponse(envelope), /LIBRARY_NOT_FOUND.*无法访问公共素材库/);
});

test("calls admin API endpoints through the typed client", async () => {
  const requested: string[] = [];
  const client = createAdminApiClient({
    base_url: "http://127.0.0.1:4899",
    fetch: async (url) => {
      requested.push(String(url));
      const pathname = new URL(String(url)).pathname;
      const sourceVideo = {
        source_video_id: "V000001",
        title: "现金流",
        file_name: "cashflow.mp4",
        relative_path: "source-videos/cashflow.mp4",
        cover_url: "/api/admin/source-videos/V000001/cover",
        duration_ms: 120_000,
        file_size: 4096,
        preprocess_status: "ready",
        visible_to_cutters: true,
        tags: [],
        description: "",
        lecturer: "",
        course: "",
        category: "",
        updated_at: ""
      };
      const data = pathname === "/api/admin/source-videos"
        ? []
        : pathname === "/api/admin/source-videos/V000001"
          ? {
              source_video: sourceVideo,
              technical: {
                duration_ms: 120_000,
                width: 1920,
                height: 1080,
                fps: 25,
                codec: "h264",
                file_size: 4096,
                content_hash: "hash",
                relative_path: "source-videos/cashflow.mp4"
              },
              visibility: {
                visible_to_cutters: true,
                label: "剪辑师可见",
                reason: ""
              },
              preprocess: {
                status: "ready",
                job_id: "J000001",
                stage: "publish-ready",
                attempt: 1,
                started_at: "",
                completed_at: "",
                failed_at: "",
                error_stage: "",
                error_message: ""
              },
              artifacts: {
                transcript: { path: "transcript.json", file_path: "/tmp/transcript.json", exists: true },
                subtitles: { path: "subtitles.srt", file_path: "/tmp/subtitles.srt", exists: true },
                cover: { path: "cover.jpg", file_path: "/tmp/cover.jpg", exists: true },
                keyframes: { path: "keyframes.json", file_path: "/tmp/keyframes.json", exists: true },
                index_version: "v000001"
              },
              transcript: {
                full_text: "现金流",
                segment_count: 1,
                character_count: 3
              }
            }
          : pathname === "/api/admin/cutter-users/CU000001/approve"
            ? {
                status: "approved",
                user: {
                  user_id: "CU000001",
                  username: "zhangsan",
                  display_name: "张三",
                  status: "approved",
                  applied_at: "",
                  approved_at: "",
                  rejected_at: "",
                  disabled_at: "",
                  last_login_at: "",
                  last_used_at: "",
                  note: "",
                  devices: []
                },
                session: {
                  user_id: "CU000001",
                  device_id: "device-a",
                  created_at: "",
                  last_seen_at: ""
                }
              }
          : {};

      return new Response(JSON.stringify({ ok: true, data }), {
        headers: { "content-type": "application/json" }
      });
    }
  });

  await client.getLibraryStatus();
  await client.getAdminSettings();
  await client.getDashboardMetrics();
  await client.listSourceVideos();
  await client.getSourceVideoDetail("V000001");
  await client.listCutterUsers();
  await client.approveCutterUser("CU000001");
  await client.disableCutterUser("CU000001");
  await client.listPreprocessJobs();
  await client.listIndexVersions();
  await client.getDoctorReport();
  await client.getRuntimeSettings();
  await client.initializeLibrary();
  await client.scanSourceVideos();
  await client.queueUnprocessedVideos();
  await client.retryFailedVideos();
  await client.queueSourceVideo("V000001");
  await client.retrySourceVideo("V000001");
  await client.publishSourceVideo("V000001");
  await client.getPreprocessSupervisorStatus();
  await client.startPreprocessSupervisor(1);
  await client.stopPreprocessSupervisor();
  await client.repairIndex();
  await client.runDoctor();
  await client.testAsrConfig();
  await client.updateSourceVideoMetadata("V000001", {
    title: "现金流",
    tags: ["财务"]
  });

  assert.deepEqual(
    requested.map((url) => new URL(url).pathname),
    [
      "/api/admin/library/status",
      "/api/admin/settings/config",
      "/api/admin/dashboard/metrics",
      "/api/admin/source-videos",
      "/api/admin/source-videos/V000001",
      "/api/admin/cutter-users",
      "/api/admin/cutter-users/CU000001/approve",
      "/api/admin/cutter-users/CU000001/disable",
      "/api/admin/preprocess/jobs",
      "/api/admin/index/versions",
      "/api/admin/doctor/report",
      "/api/admin/settings/runtime",
      "/api/admin/library/init",
    "/api/admin/library/scan",
    "/api/admin/preprocess/queue-unprocessed",
    "/api/admin/preprocess/retry-failed",
    "/api/admin/source-videos/V000001/queue",
    "/api/admin/source-videos/V000001/retry",
    "/api/admin/source-videos/V000001/publish",
    "/api/admin/preprocess/supervisor/status",
      "/api/admin/preprocess/supervisor/start",
      "/api/admin/preprocess/supervisor/stop",
      "/api/admin/index/repair",
      "/api/admin/doctor/run",
      "/api/admin/settings/test-asr",
      "/api/admin/source-videos/V000001/metadata"
    ]
  );
});

test("calls admin settings mutation endpoints through the typed client", async () => {
  const requests: Array<{ method: string; pathname: string; body?: unknown }> = [];
  const savedSettings: AdminSettingsConfig = {
    schema_version: "1.0",
    library_name: "课程公共素材库",
    source_folders: [
      {
        id: "src_default",
        name: "默认素材来源",
        path: "/Volumes/PublicLibrary/source-videos",
        enabled: true
      }
    ],
    artifact_library: {
      mode: "default",
      path: "/Volumes/PublicLibrary/.mixlab-library",
      migration_required: false
    },
    runtime_policy: {
      audio_mode: "mp3_16k_mono_64k",
      concurrent_jobs: 2,
      auto_scan_enabled: true,
      auto_queue_enabled: false,
      auto_publish_index_enabled: true
    },
    updated_at: "2026-05-03T10:00:00.000Z"
  };
  const client = createAdminApiClient({
    base_url: "http://127.0.0.1:4899",
    fetch: async (url, init) => {
      requests.push({
        method: init?.method ?? "GET",
        pathname: new URL(String(url)).pathname,
        body: init?.body ? JSON.parse(String(init.body)) : undefined
      });
      return new Response(JSON.stringify({ ok: true, data: savedSettings }), {
        headers: { "content-type": "application/json" }
      });
    }
  });

  await client.saveAdminSettings({
    library_name: "课程公共素材库",
    source_folders: savedSettings.source_folders,
    runtime_policy: savedSettings.runtime_policy
  });
  await client.addSourceFolder({
    name: "品牌素材",
    path: "/Volumes/BrandVideos",
    enabled: true
  });
  await client.updateSourceFolder("src_002", {
    name: "品牌素材归档",
    enabled: false
  });
  await client.removeSourceFolder("src_002");

  assert.deepEqual(
    requests.map((request) => [request.method, request.pathname]),
    [
      ["PATCH", "/api/admin/settings/config"],
      ["POST", "/api/admin/settings/source-folders"],
      ["PATCH", "/api/admin/settings/source-folders/src_002"],
      ["DELETE", "/api/admin/settings/source-folders/src_002"]
    ]
  );
  assert.deepEqual(requests[0]?.body, {
    library_name: "课程公共素材库",
    source_folders: savedSettings.source_folders,
    runtime_policy: savedSettings.runtime_policy
  });
  assert.deepEqual(requests[1]?.body, {
    name: "品牌素材",
    path: "/Volumes/BrandVideos",
    enabled: true
  });
  assert.deepEqual(requests[2]?.body, {
    name: "品牌素材归档",
    enabled: false
  });
  assert.equal(requests[3]?.body, undefined);
});

test("client resolves admin media URLs against base URL", async () => {
  const client = createAdminApiClient({
    base_url: "http://127.0.0.1:4899",
    fetch: async (url) => {
      const pathname = new URL(String(url)).pathname;
      const sourceVideo = {
        source_video_id: "V000001",
        title: "现金流",
        file_name: "cashflow.mp4",
        relative_path: "source-videos/cashflow.mp4",
        cover_url: "/api/admin/source-videos/V000001/cover",
        duration_ms: 120_000,
        file_size: 4096,
        preprocess_status: "ready",
        visible_to_cutters: true,
        tags: [],
        description: "",
        lecturer: "",
        course: "",
        category: "",
        updated_at: ""
      };

      const data = pathname === "/api/admin/source-videos"
        ? [
            sourceVideo,
            { ...sourceVideo, source_video_id: "V000002", cover_url: "covers/V000002.jpg" },
            { ...sourceVideo, source_video_id: "V000003", cover_url: "https://cdn.example.test/cover.jpg" },
            { ...sourceVideo, source_video_id: "V000004", cover_url: "data:image/png;base64,AAAA" }
          ]
        : {
            source_video: sourceVideo,
            technical: {
              duration_ms: 120_000,
              width: 1920,
              height: 1080,
              fps: 25,
              codec: "h264",
              file_size: 4096,
              content_hash: "hash",
              relative_path: "source-videos/cashflow.mp4"
            },
            visibility: {
              visible_to_cutters: true,
              label: "剪辑师可见",
              reason: ""
            },
            preprocess: {
              status: "ready",
              job_id: "J000001",
              stage: "publish-ready",
              attempt: 1,
              started_at: "",
              completed_at: "",
              failed_at: "",
              error_stage: "",
              error_message: ""
            },
            artifacts: {
              transcript: { path: "transcript.json", file_path: "/tmp/transcript.json", exists: true },
              subtitles: { path: "subtitles.srt", file_path: "/tmp/subtitles.srt", exists: true },
              cover: { path: "cover.jpg", file_path: "/tmp/cover.jpg", exists: true },
              keyframes: { path: "keyframes.json", file_path: "/tmp/keyframes.json", exists: true },
              index_version: "v000001"
            },
            transcript: {
              full_text: "现金流",
              segment_count: 1,
              character_count: 3
            }
          };

      return new Response(JSON.stringify({ ok: true, data }), {
        headers: { "content-type": "application/json" }
      });
    }
  });

  const videos = await client.listSourceVideos();
  assert.equal(videos[0]?.cover_url, "http://127.0.0.1:4899/api/admin/source-videos/V000001/cover");
  assert.equal(videos[1]?.cover_url, "http://127.0.0.1:4899/covers/V000002.jpg");
  assert.equal(videos[2]?.cover_url, "https://cdn.example.test/cover.jpg");
  assert.equal(videos[3]?.cover_url, "data:image/png;base64,AAAA");

  const detail = await client.getSourceVideoDetail("V000001");
  assert.equal(detail.source_video.cover_url, "http://127.0.0.1:4899/api/admin/source-videos/V000001/cover");
});

test("client neutralizes unsupported admin media URL schemes", async () => {
  const sourceVideo = {
    source_video_id: "V000001",
    title: "现金流",
    file_name: "cashflow.mp4",
    relative_path: "source-videos/cashflow.mp4",
    cover_url: "javascript:alert(1)",
    duration_ms: 120_000,
    file_size: 4096,
    preprocess_status: "ready",
    visible_to_cutters: true,
    tags: [],
    description: "",
    lecturer: "",
    course: "",
    category: "",
    updated_at: ""
  };
  const detail = {
    source_video: { ...sourceVideo, cover_url: "file:///tmp/cover.jpg" },
    technical: {
      duration_ms: 120_000,
      width: 1920,
      height: 1080,
      fps: 25,
      codec: "h264",
      file_size: 4096,
      content_hash: "hash",
      relative_path: "source-videos/cashflow.mp4"
    },
    visibility: {
      visible_to_cutters: true,
      label: "剪辑师可见",
      reason: ""
    },
    preprocess: {
      status: "ready",
      job_id: "J000001",
      stage: "publish-ready",
      attempt: 1,
      started_at: "",
      completed_at: "",
      failed_at: "",
      error_stage: "",
      error_message: ""
    },
    artifacts: {
      transcript: { path: "transcript.json", file_path: "/tmp/transcript.json", exists: true },
      subtitles: { path: "subtitles.srt", file_path: "/tmp/subtitles.srt", exists: true },
      cover: { path: "cover.jpg", file_path: "/tmp/cover.jpg", exists: true },
      keyframes: { path: "keyframes.json", file_path: "/tmp/keyframes.json", exists: true },
      index_version: "v000001"
    },
    transcript: {
      full_text: "现金流",
      segment_count: 1,
      character_count: 3
    }
  };
  const client = createAdminApiClient({
    base_url: "http://127.0.0.1:4899",
    fetch: async (url) => {
      const pathname = new URL(String(url)).pathname;
      return new Response(JSON.stringify({
        ok: true,
        data: pathname === "/api/admin/source-videos"
          ? [
              sourceVideo,
              { ...sourceVideo, source_video_id: "V000002", cover_url: "file:///tmp/list-cover.jpg" },
              { ...sourceVideo, source_video_id: "V000003", cover_url: "data:text/html,<script></script>" }
            ]
          : detail
      }), {
        headers: { "content-type": "application/json" }
      });
    }
  });

  const videos = await client.listSourceVideos();
  assert.equal(videos[0]?.cover_url, "");
  assert.equal(videos[1]?.cover_url, "");
  assert.equal(videos[2]?.cover_url, "");

  const resolvedDetail = await client.getSourceVideoDetail("V000001");
  assert.equal(resolvedDetail.source_video.cover_url, "");
});

test("client defensively redacts approve session tokens at runtime", async () => {
  const client = createAdminApiClient({
    base_url: "http://127.0.0.1:4899",
    fetch: async () => new Response(JSON.stringify({
      ok: true,
      data: {
        status: "approved",
        user: {
          user_id: "CU000001",
          username: "zhangsan",
          display_name: "张三",
          status: "approved",
          applied_at: "2024-05-07 09:10:00",
          approved_at: "2024-05-07 10:35:00",
          rejected_at: "",
          disabled_at: "",
          last_login_at: "",
          last_used_at: "",
          note: "",
          devices: []
        },
        session: {
          user_id: "CU000001",
          device_id: "device-a",
          session_token: "secret-token",
          created_at: "2024-05-07 10:35:00",
          last_seen_at: "2024-05-07 10:35:00"
        }
      }
    }), {
      headers: { "content-type": "application/json" }
    })
  });

  const approved = await client.approveCutterUser("CU000001");
  assert.equal("session_token" in approved.session, false);
  assert.equal(JSON.stringify(approved).includes("secret-token"), false);
});

test("fixture client separates ready, failed, and index-required counts", async () => {
  const data = await loadAdminDashboardData(createFixtureAdminApiClient());

  assert.equal(data.status.ready_video_count, 120);
  assert.equal(data.status.failed_video_count, 2);
  assert.equal(data.status.index_required_video_count, 5);
});

test("fixture jobs show failed retry without blocking later success", async () => {
  const jobs = await createFixtureAdminApiClient().listPreprocessJobs();
  const failed = jobs.jobs.find((job) => job.status === "failed");
  const laterDone = jobs.jobs.find(
    (job) => job.status === "done" && (job.completed_at ?? "") > (failed?.failed_at ?? "")
  );

  assert.equal(failed?.retryable, true);
  assert.ok(laterDone, "expected a later successful job after the failed job");
});

test("fixture runtime settings redact DashScope key values", async () => {
  const settings = await createFixtureAdminApiClient().getRuntimeSettings();
  const asJson = JSON.stringify(settings);

  assert.equal(settings.asr.dashscope_api_key_configured, true);
  assert.equal(asJson.includes("sk-"), false);
});

test("fixture source video protocol uses V-prefixed ids", async () => {
  const client = createFixtureAdminApiClient();
  const [data, detail, runtime, metrics] = await Promise.all([
    loadAdminDashboardData(client),
    client.getSourceVideoDetail("V000042"),
    client.getRuntimeSettings(),
    client.getDashboardMetrics()
  ]);

  assert.match(data.status.active_task_label, /^V000043\b/);
  assert.equal(JSON.stringify([data.source_videos, data.jobs, detail, runtime, metrics]).includes(`P${"000"}`), false);
});

test("fixture client includes settings, metrics, cutter users, and source detail", async () => {
  const client = createFixtureAdminApiClient();

  const settings = await client.getAdminSettings();
  assert.equal(settings.source_folders.length >= 2, true);
  assert.equal(settings.source_folders[0]?.enabled, true);

  const metrics = await client.getDashboardMetrics();
  assert.equal(metrics.material.video_count > 0, true);
  assert.equal(metrics.transcript.transcript_video_count > 0, true);
  assert.equal(metrics.production.completed_today_count > 0, true);
  assert.equal(metrics.usage.add_to_cut_list_count > 0, true);
  assert.equal(metrics.usage.reuse_local_clip_count > 0, true);
  assert.equal(metrics.usage.users.some((user) => user.add_to_cut_list_count > 0), true);
  assert.equal(metrics.usage.users.some((user) => user.reuse_local_clip_count > 0), true);
  assert.equal(metrics.risk.failed_video_count > 0, true);

  const users = await client.listCutterUsers();
  assert.equal(users.users.some((user) => user.status === "pending"), true);
  assert.equal(users.users.some((user) => user.status === "approved" && user.devices.length > 0), true);

  const detail = await client.getSourceVideoDetail("V000042");
  assert.equal(detail.source_video.preprocess_status, "ready");
  assert.deepEqual(detail.artifacts.cover, {
    path: ".mixlab-library/videos/V000042/cover.jpg",
    file_path: "/Volumes/PublicLibrary/.mixlab-library/videos/V000042/cover.jpg",
    exists: true
  });
  assert.equal(detail.artifacts.index_version, "v000027");
});

test("fixture settings mutations persist and appear in dashboard data", async () => {
  const client = createFixtureAdminApiClient();
  const before = await client.getAdminSettings();
  const saved = await client.saveAdminSettings({
    library_name: "课程公共素材库",
    source_folders: before.source_folders.map((folder) =>
      folder.id === "src_default"
        ? { ...folder, name: "主素材来源" }
        : folder
    ),
    runtime_policy: {
      ...before.runtime_policy,
      audio_mode: "wav_16k_mono_pcm_s16le",
      concurrent_jobs: 4,
      auto_queue_enabled: true
    }
  });

  assert.equal(saved.library_name, "课程公共素材库");
  assert.equal(saved.source_folders[0]?.name, "主素材来源");
  assert.equal(saved.runtime_policy.concurrent_jobs, 4);

  const added = await client.addSourceFolder({
    name: "品牌素材",
    path: "/Volumes/BrandVideos",
    enabled: true
  });
  const newFolder = added.source_folders.at(-1);

  assert.match(newFolder?.id ?? "", /^src_\d+$/);
  assert.equal(newFolder?.name, "品牌素材");

  const updated = await client.updateSourceFolder(newFolder?.id ?? "", {
    path: "/Volumes/BrandArchive",
    enabled: false
  });
  const updatedFolder = updated.source_folders.find((folder) => folder.id === newFolder?.id);

  assert.equal(updatedFolder?.path, "/Volumes/BrandArchive");
  assert.equal(updatedFolder?.enabled, false);
  assert.equal(updatedFolder?.discovered_video_count, 0);

  const removed = await client.removeSourceFolder(newFolder?.id ?? "");

  assert.equal(removed.source_folders.some((folder) => folder.id === newFolder?.id), false);

  const dashboard = await loadAdminDashboardData(client);
  assert.equal(dashboard.settings.library_name, "课程公共素材库");
  assert.equal(dashboard.settings.runtime_policy.audio_mode, "wav_16k_mono_pcm_s16le");
});

test("fixture cutter user approval redacts session token and disable mutates status", async () => {
  const client = createFixtureAdminApiClient();

  const approved = await client.approveCutterUser("CU000001");
  assert.equal(approved.status, "approved");
  assert.equal(approved.user.status, "approved");
  assert.equal(approved.session.user_id, "CU000001");
  assert.equal("session_token" in approved.session, false);

  const usersAfterApproval = await client.listCutterUsers();
  assert.equal(usersAfterApproval.users.find((user) => user.user_id === "CU000001")?.status, "approved");

  const disabled = await client.disableCutterUser("CU000001");
  assert.equal(disabled.status, "disabled");
  assert.equal(disabled.devices.every((device) => device.status === "disabled"), true);
});

test("fixture source detail reflects retried jobs and repaired index state", async () => {
  const client = createFixtureAdminApiClient();

  await client.retryFailedVideos();
  const retried = await client.getSourceVideoDetail("V000037");
  assert.equal(retried.source_video.preprocess_status, "queued");
  assert.equal(retried.preprocess.status, "queued");
  assert.equal(retried.preprocess.stage, "extract-audio");
  assert.equal(retried.preprocess.failed_at, "");
  assert.equal(retried.preprocess.error_message, "");

  await client.repairIndex();
  const repaired = await client.getSourceVideoDetail("V000039");
  assert.equal(repaired.source_video.preprocess_status, "ready");
  assert.equal(repaired.visibility.visible_to_cutters, true);
  assert.equal(repaired.artifacts.index_version, "v000028");
});

test("fixture admin actions mutate queue, index, and metadata state", async () => {
  const client = createFixtureAdminApiClient();

  const singleQueued = await client.queueSourceVideo("V000044");
  assert.equal(singleQueued.affected_count, 1);
  assert.deepEqual(singleQueued.source_video_ids, ["V000044"]);

  const singleRetried = await client.retrySourceVideo("V000037");
  assert.equal(singleRetried.affected_count, 1);
  assert.deepEqual(singleRetried.source_video_ids, ["V000037"]);

  const queued = await client.queueUnprocessedVideos();
  assert.equal(queued.affected_count, 0);

  const retried = await client.retryFailedVideos();
  assert.equal(retried.affected_count, 0);

  const singlePublished = await client.publishSourceVideo("V000039");
  assert.equal(singlePublished.published_count, 1);
  assert.deepEqual(singlePublished.published_source_video_ids, ["V000039"]);

  const repaired = await client.repairIndex();
  assert.equal(repaired.published_count, 0);
  assert.equal(repaired.skipped_count, 0);

  const metadata = await client.updateSourceVideoMetadata("V000042", {
    title: "现金流管理更新",
    tags: ["现金流", "风险"],
    description: "已更新说明"
  });
  assert.equal(metadata.title, "现金流管理更新");
  assert.deepEqual(metadata.tags, ["现金流", "风险"]);

  const data = await loadAdminDashboardData(client);
  assert.equal(data.source_videos.some((video) => video.preprocess_status === "failed"), false);
  assert.equal(data.source_videos.some((video) => video.preprocess_status === "index-required"), false);
});
