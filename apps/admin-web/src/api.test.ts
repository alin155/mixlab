import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminApiClient,
  createFixtureAdminApiClient,
  loadAdminDashboardData,
  resolveMediaUrl,
  unwrapAdminResponse,
  type AdminApiEnvelope,
  type AdminSettingsConfig
} from "./api.ts";

test("unwraps successful admin API envelopes", () => {
  assert.deepEqual(
    unwrapAdminResponse({
      ok: true,
      data: { ready: 120 },
      meta: {
        runtime: {
          schema_version: "1.0",
          endpoint: "/api/admin/dashboard/metrics",
          method: "GET",
          duration_ms: 12,
          scan_mode: "status-scan",
          data_source: "usage-events",
          scan_reason: "background-metrics",
          actual_data_source: "usage-events",
          cache_status: "not-applicable",
          result_count: 1,
          offset: 0,
          limit: 0,
          slow: false,
          slow_reason: ""
        }
      }
    }),
    { ready: 120 }
  );
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

test("calls admin auth endpoints with the typed client and session header", async () => {
  const requests: Array<{ pathname: string; method: string; token: string | null; body?: unknown }> = [];
  const client = createAdminApiClient({
    base_url: "http://127.0.0.1:4899",
    auth: { session_token: "admin-session-001" },
    fetch: async (url, init) => {
      const pathname = new URL(String(url)).pathname;
      requests.push({
        pathname,
        method: init?.method ?? "GET",
        token: new Headers(init?.headers).get("x-mixlab-admin-session-token"),
        body: init?.body ? JSON.parse(String(init.body)) : undefined
      });

      const data = pathname === "/api/admin/auth/bootstrap"
        ? {
            registration_open: true,
            has_admin_user: false
          }
        : pathname === "/api/admin/auth/status"
          ? {
              authenticated: true,
              auth_mode: "password",
              user: {
                user_id: "AU000001",
                username: "owner",
                display_name: "Owner",
                role: "owner",
                status: "active",
                created_at: "2026-06-18T00:00:00.000Z",
                last_login_at: "2026-06-18T00:01:00.000Z",
                disabled_at: ""
              },
              bootstrap: {
                registration_open: false,
                has_admin_user: true
              }
            }
          : pathname === "/api/admin/auth/logout"
            ? { removed: true }
            : {
                user: {
                  user_id: "AU000001",
                  username: "owner",
                  display_name: "Owner",
                  role: "owner",
                  status: "active",
                  created_at: "2026-06-18T00:00:00.000Z",
                  last_login_at: "2026-06-18T00:01:00.000Z",
                  disabled_at: ""
                },
                session: {
                  user_id: "AU000001",
                  session_token: "admin-session-001",
                  created_at: "2026-06-18T00:00:00.000Z",
                  last_seen_at: "2026-06-18T00:00:00.000Z"
                }
              };

      return new Response(JSON.stringify({ ok: true, data }), {
        headers: { "content-type": "application/json" }
      });
    }
  });

  await client.getAuthBootstrap();
  await client.getAuthStatus();
  await client.registerAdmin({
    username: "owner",
    display_name: "Owner",
    password: "Owner12345"
  });
  await client.loginAdmin({
    username: "owner",
    password: "Owner12345"
  });
  await client.logoutAdmin();

  assert.deepEqual(requests.map((request) => [request.pathname, request.method]), [
    ["/api/admin/auth/bootstrap", "GET"],
    ["/api/admin/auth/status", "GET"],
    ["/api/admin/auth/register", "POST"],
    ["/api/admin/auth/login", "POST"],
    ["/api/admin/auth/logout", "POST"]
  ]);
  assert.equal(requests[0]?.token, null);
  assert.equal(requests[1]?.token, "admin-session-001");
  assert.equal(requests[2]?.token, null);
  assert.equal(requests[3]?.token, null);
  assert.equal(requests[4]?.token, "admin-session-001");
  assert.deepEqual(requests[2]?.body, {
    username: "owner",
    display_name: "Owner",
    password: "Owner12345"
  });
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
        : pathname === "/api/admin/preprocess/jobs/J000001/log"
          ? {
              job_id: "J000001",
              source_video_id: "V000001",
              path: ".mixlab-library/logs/V000001.log",
              file_path: "/Volumes/PublicLibrary/.mixlab-library/logs/V000001.log",
              exists: true,
              content: "2026-05-02T11:58:00.000Z\tV000001\tupload-audio\tstage changed to upload-audio"
            }
        : pathname === "/api/admin/source-videos/V000001/metadata" ||
          pathname === "/api/admin/source-videos/V000001/cover"
          ? sourceVideo
        : pathname === "/api/admin/doctor/export"
          ? {
              file_name: "mixlab-doctor-2026-05-02T12-00-00.000Z.json",
              relative_path: ".mixlab-library/exports/doctor/mixlab-doctor-2026-05-02T12-00-00.000Z.json",
              file_path: "/Volumes/PublicLibrary/.mixlab-library/exports/doctor/mixlab-doctor-2026-05-02T12-00-00.000Z.json",
              report: {
                schema_version: "1.0",
                generated_at: "2026-05-02T12:00:00.000Z",
                library_root: "/Volumes/PublicLibrary",
                summary: { pass: 1, warn: 0, fail: 0 },
                checks: []
              }
            }
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
  await client.getDataLoadingPlan();
  await client.getOperationsOverview();
  await client.getReadModelReconcileStatus();
  await client.startReadModelReconcile();
  await client.cancelReadModelReconcile();
  await client.getOperationLog({ limit: 12 });
  await client.getCommandSnapshotRestorePlan("fixture-source-video-metadata-snapshot");
  await client.restoreCommandSnapshot("fixture-source-video-metadata-snapshot");
  await client.getAdminSettings();
  await client.getDashboardMetrics();
  await client.listSourceVideos();
  await client.getSourceVideoDetail("V000001");
  await client.listCutterUsers();
  await client.approveCutterUser("CU000001");
  await client.disableCutterUser("CU000001");
  await client.resetCutterUserPassword("CU000001", { new_password: "Cutter67890" });
  await client.listPreprocessJobs();
  await client.listPreprocessProcessHistory({
    limit: 7,
    window_days: 14,
    source_folder_name: "默认素材来源",
    preprocess_status: "failed",
    event_type: "failed"
  });
  await client.getPreprocessJobLog("J000001");
  await client.listIndexVersions();
  await client.getDoctorReport();
  await client.getRuntimeDiagnosticsHistory({ limit: 20 });
  await client.getRuntimeSettings();
  await client.initializeLibrary();
  await client.scanSourceVideos();
  await client.scanNewSourceVideos();
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
  await client.exportDoctorReport();
  await client.testAsrConfig();
  await client.updateSourceVideoMetadata("V000001", {
    title: "现金流",
    tags: ["财务"]
  });
  await client.updateSourceVideoCover("V000001", {
    image_base64: "iVBORw0KGgo=",
    content_type: "image/png",
    file_name: "cover.png"
  });

  assert.deepEqual(
    requested.map((url) => new URL(url).pathname),
    [
      "/api/admin/library/status",
      "/api/admin/data-loading/plan",
      "/api/admin/operations/overview",
      "/api/admin/read-model/reconcile/status",
      "/api/admin/read-model/reconcile",
      "/api/admin/read-model/reconcile/cancel",
      "/api/admin/operation-log",
      "/api/admin/command-snapshots/fixture-source-video-metadata-snapshot/restore-plan",
      "/api/admin/command-snapshots/fixture-source-video-metadata-snapshot/restore",
      "/api/admin/settings/config",
      "/api/admin/dashboard/metrics",
      "/api/admin/source-videos",
      "/api/admin/source-videos/V000001",
      "/api/admin/cutter-users",
      "/api/admin/cutter-users/CU000001/approve",
      "/api/admin/cutter-users/CU000001/disable",
      "/api/admin/cutter-users/CU000001/password",
      "/api/admin/preprocess/jobs",
      "/api/admin/preprocess/process-history",
      "/api/admin/preprocess/jobs/J000001/log",
      "/api/admin/index/versions",
      "/api/admin/doctor/report",
      "/api/admin/runtime/diagnostics/history",
      "/api/admin/settings/runtime",
      "/api/admin/library/init",
      "/api/admin/library/scan",
      "/api/admin/library/scan-new",
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
      "/api/admin/doctor/export",
      "/api/admin/settings/test-asr",
      "/api/admin/source-videos/V000001/metadata",
      "/api/admin/source-videos/V000001/cover"
    ]
  );
  assert.equal(
    new URL(requested.find((url) => new URL(url).pathname === "/api/admin/preprocess/jobs") ?? "").search,
    "?limit=20"
  );
  assert.equal(
    new URL(requested.find((url) => new URL(url).pathname === "/api/admin/preprocess/process-history") ?? "").search,
    "?limit=7&window_days=14&source_folder_name=%E9%BB%98%E8%AE%A4%E7%B4%A0%E6%9D%90%E6%9D%A5%E6%BA%90&preprocess_status=failed&event_type=failed"
  );
  assert.equal(
    new URL(requested.find((url) => new URL(url).pathname === "/api/admin/operation-log") ?? "").search,
    "?limit=12"
  );
  assert.equal(
    new URL(requested.find((url) => new URL(url).pathname === "/api/admin/runtime/diagnostics/history") ?? "").search,
    "?limit=20"
  );
});

test("restore command snapshots through POST with the typed client", async () => {
  const requests: Array<{ pathname: string; method: string; token: string | null; body?: unknown }> = [];
  const client = createAdminApiClient({
    base_url: "http://127.0.0.1:4899",
    auth: { session_token: "admin-session-001" },
    fetch: async (url, init) => {
      const pathname = new URL(String(url)).pathname;
      requests.push({
        pathname,
        method: init?.method ?? "GET",
        token: new Headers(init?.headers).get("x-mixlab-admin-session-token"),
        body: init?.body ? JSON.parse(String(init.body)) : undefined
      });

      return new Response(JSON.stringify({
        ok: true,
        data: {
          schema_version: "1.0",
          restored_at: "2024-05-07T10:34:00.000Z",
          status: "restored",
          restored_file_count: 1,
          blocked_file_count: 0,
          blockers: [],
          plan: {
            schema_version: "1.0",
            generated_at: "2024-05-07T10:33:00.000Z",
            can_restore: true,
            command: "source-video-metadata",
            snapshot_id: "fixture-source-video-metadata-snapshot",
            snapshot_kind: "file-capture",
            snapshot_manifest_relative_path:
              ".mixlab-library/admin/command-snapshots/20240507103200-source-video-metadata/snapshot.json",
            file_count: 1,
            restorable_file_count: 1,
            blocked_file_count: 0,
            blockers: [],
            files: []
          },
          files: [
            {
              label: "source-video-V000042-manifest",
              restored: true,
              source_relative_path: ".mixlab-library/videos/V000042/source-video.json",
              snapshot_relative_path:
                ".mixlab-library/admin/command-snapshots/20240507103200-source-video-metadata/files/001-source-video-V000042-manifest"
            }
          ]
        }
      }), {
        headers: { "content-type": "application/json" }
      });
    }
  });

  const result = await client.restoreCommandSnapshot("fixture-source-video-metadata-snapshot");

  assert.deepEqual(requests, [
    {
      pathname: "/api/admin/command-snapshots/fixture-source-video-metadata-snapshot/restore",
      method: "POST",
      token: "admin-session-001",
      body: undefined
    }
  ]);
  assert.equal(result.status, "restored");
  assert.equal(result.restored_file_count, 1);
  assert.equal(result.files[0]?.restored, true);
});

test("read-model reconcile commands use explicit POST endpoints with the typed client", async () => {
  const requests: Array<{ pathname: string; method: string; token: string | null; body?: unknown }> = [];
  const status = await createFixtureAdminApiClient().getReadModelReconcileStatus();
  const client = createAdminApiClient({
    base_url: "http://127.0.0.1:4899",
    auth: { session_token: "admin-session-001" },
    fetch: async (url, init) => {
      const pathname = new URL(String(url)).pathname;
      requests.push({
        pathname,
        method: init?.method ?? "GET",
        token: new Headers(init?.headers).get("x-mixlab-admin-session-token"),
        body: init?.body ? JSON.parse(String(init.body)) : undefined
      });

      return new Response(JSON.stringify({
        ok: true,
        data: {
          accepted: true,
          status
        }
      }), {
        headers: { "content-type": "application/json" }
      });
    }
  });

  const started = await client.startReadModelReconcile();
  const cancelled = await client.cancelReadModelReconcile();

  assert.deepEqual(requests, [
    {
      pathname: "/api/admin/read-model/reconcile",
      method: "POST",
      token: "admin-session-001",
      body: undefined
    },
    {
      pathname: "/api/admin/read-model/reconcile/cancel",
      method: "POST",
      token: "admin-session-001",
      body: undefined
    }
  ]);
  assert.equal(started.accepted, true);
  assert.equal(cancelled.accepted, true);
  assert.equal(started.status.command, "read-model-reconcile");
  assert.equal(cancelled.status.scan_mode, "full-reconcile");
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
    runtime_policy: savedSettings.runtime_policy,
    asr: {
      dashscope_api_key: "sk-live-secret"
    }
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
    runtime_policy: savedSettings.runtime_policy,
    asr: {
      dashscope_api_key: "sk-live-secret"
    }
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

test("client sends source video query and status filters to the admin API", async () => {
  const requested: string[] = [];
  const client = createAdminApiClient({
    base_url: "http://127.0.0.1:4899",
    fetch: async (url) => {
      requested.push(String(url));
      return new Response(JSON.stringify({ ok: true, data: [] }), {
        headers: { "content-type": "application/json" }
      });
    }
  });

  await client.listSourceVideos({
    query: "现金流",
    status: "ready",
    offset: 100,
    limit: 50
  });

  const url = new URL(requested[0]!);
  assert.equal(url.pathname, "/api/admin/source-videos");
  assert.equal(url.searchParams.get("query"), "现金流");
  assert.equal(url.searchParams.get("status"), "ready");
  assert.equal(url.searchParams.get("offset"), "100");
  assert.equal(url.searchParams.get("limit"), "50");
});

test("client preserves source video runtime fallback metadata", async () => {
  const sourceVideo = {
    source_video_id: "V000001",
    title: "现金流",
    file_name: "cashflow.mp4",
    relative_path: "source-videos/cashflow.mp4",
    cover_url: "/api/admin/source-videos/V000001/cover",
    duration_ms: 120_000,
    file_size: 4096,
    preprocess_status: "processing",
    visible_to_cutters: false,
    tags: [],
    description: "",
    lecturer: "",
    course: "",
    category: "",
    updated_at: ""
  };
  const client = createAdminApiClient({
    base_url: "http://127.0.0.1:4899",
    fetch: async () =>
      new Response(JSON.stringify({
        ok: true,
        data: [sourceVideo],
        meta: {
          runtime: {
            schema_version: "1.0",
            endpoint: "/api/admin/source-videos?status=processing&limit=5",
            method: "GET",
            duration_ms: 412,
            scan_mode: "paged-list",
            data_source: "admin-read-model",
            scan_reason: "route-owned-page",
            actual_data_source: "source-video-manifest",
            cache_status: "miss",
            result_count: 1,
            offset: 0,
            limit: 5,
            slow: false,
            slow_reason: "",
            fallback_reason: "status-store:store-not-fresh"
          }
        }
      }), {
        headers: { "content-type": "application/json" }
      })
  });

  const result = await client.listSourceVideosWithRuntime({
    status: "processing",
    limit: 5
  });
  const legacyVideos = await client.listSourceVideos({
    status: "processing",
    limit: 5
  });

  assert.equal(result.source_videos.length, 1);
  assert.equal(result.source_videos[0]?.cover_url, "http://127.0.0.1:4899/api/admin/source-videos/V000001/cover");
  assert.equal(result.runtime?.actual_data_source, "source-video-manifest");
  assert.equal(result.runtime?.fallback_reason, "status-store:store-not-fresh");
  assert.equal(legacyVideos.length, 1);
});

test("client preserves source video runtime repair metadata", async () => {
  const sourceVideo = {
    source_video_id: "V000002",
    title: "修复命中",
    file_name: "repair.mp4",
    relative_path: "source-videos/repair.mp4",
    cover_url: "/api/admin/source-videos/V000002/cover",
    duration_ms: 60_000,
    file_size: 2048,
    preprocess_status: "processing",
    visible_to_cutters: false,
    tags: [],
    description: "",
    lecturer: "",
    course: "",
    category: "",
    updated_at: ""
  };
  const client = createAdminApiClient({
    base_url: "http://127.0.0.1:4899",
    fetch: async () =>
      new Response(JSON.stringify({
        ok: true,
        data: [sourceVideo],
        meta: {
          runtime: {
            schema_version: "1.0",
            endpoint: "/api/admin/source-videos?status=processing&limit=5",
            method: "GET",
            duration_ms: 128,
            scan_mode: "paged-list",
            data_source: "admin-read-model",
            scan_reason: "route-owned-page",
            actual_data_source: "admin-read-model",
            cache_status: "hit",
            result_count: 1,
            offset: 0,
            limit: 5,
            slow: false,
            slow_reason: "",
            fallback_reason: "",
            repair_reason: "status-store:repaired-incomplete-manifest-rows"
          }
        }
      }), {
        headers: { "content-type": "application/json" }
      })
  });

  const result = await client.listSourceVideosWithRuntime({
    status: "processing",
    limit: 5
  });

  assert.equal(result.runtime?.actual_data_source, "admin-read-model");
  assert.equal(result.runtime?.repair_reason, "status-store:repaired-incomplete-manifest-rows");
});

test("client forwards a bound AbortSignal to runtime fetch requests", async () => {
  const abortController = new AbortController();
  const requestInits: Array<RequestInit | undefined> = [];
  const client = createAdminApiClient({
    base_url: "http://127.0.0.1:4899",
    signal: abortController.signal,
    fetch: async (url, init) => {
      requestInits.push(init);
      const pathname = new URL(String(url)).pathname;
      const data = pathname === "/api/admin/source-videos" ? [] : {};
      return new Response(JSON.stringify({ ok: true, data }), {
        headers: { "content-type": "application/json" }
      });
    }
  });

  await client.getLibraryStatus();
  await client.listSourceVideos({ limit: 5 });
  await client.initializeLibrary();
  await client.saveAdminSettings({
    library_name: "公共素材库",
    source_folders: [],
    runtime_policy: {
      audio_mode: "mp3_16k_mono_64k",
      concurrent_jobs: 1,
      auto_scan_enabled: false,
      auto_queue_enabled: false,
      auto_publish_index_enabled: false
    }
  });
  await client.removeSourceFolder("SF000001");

  assert.equal(requestInits.length, 5);
  for (const init of requestInits) {
    assert.equal(init?.signal, abortController.signal);
  }
});

test("client preserves same-origin admin media URLs when API base is root-relative", () => {
  assert.equal(
    resolveMediaUrl("/", "/api/admin/source-videos/V000001/cover"),
    "/api/admin/source-videos/V000001/cover"
  );
  assert.equal(resolveMediaUrl("/", "covers/V000002.jpg"), "/covers/V000002.jpg");
  assert.equal(resolveMediaUrl("/", "javascript:alert(1)"), "");
  assert.equal(resolveMediaUrl("/", "file:///tmp/cover.jpg"), "");
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
  assert.equal(data.data_loading_plan.strategy, "shell-first-route-owned-v1");
  assert.equal(data.data_loading_plan.hidden_full_scan_allowed, false);
  assert.equal(
    data.data_loading_plan.endpoints.some((endpoint) => endpoint.endpoint === "/api/admin/data-loading/plan"),
    true
  );
  assert.equal(
    data.data_loading_plan.endpoints.find((endpoint) => endpoint.endpoint === "/api/admin/source-videos")?.read_model,
    "source-video-status-read-model-v1"
  );
  assert.equal(
    data.data_loading_plan.endpoints.find((endpoint) => endpoint.endpoint === "/api/admin/source-videos")?.data_source,
    "admin-read-model"
  );
  assert.equal(
    data.data_loading_plan.endpoints.find((endpoint) => endpoint.endpoint === "/api/admin/source-videos")?.scan_reason,
    "route-owned-page"
  );
  assert.equal(
    data.data_loading_plan.endpoints.find((endpoint) => endpoint.endpoint === "/api/admin/read-model/status")?.scan_mode,
    "no-scan"
  );
  assert.equal(
    data.data_loading_plan.endpoints.find((endpoint) => endpoint.endpoint === "/api/admin/read-model/reconcile/status")?.scan_mode,
    "no-scan"
  );
  assert.equal(
    data.data_loading_plan.endpoints.find((endpoint) => endpoint.endpoint === "/api/admin/read-model/reconcile")?.refresh,
    "command-only"
  );
  assert.equal(
    data.data_loading_plan.endpoints.find((endpoint) => endpoint.endpoint === "/api/admin/read-model/reconcile/cancel")?.scan_mode,
    "no-scan"
  );
  assert.equal(
    data.data_loading_plan.endpoints.find((endpoint) => endpoint.endpoint === "/api/admin/preprocess/process-history")?.read_model,
    "admin-read-model-v1"
  );
  assert.equal(
    data.data_loading_plan.endpoints.find((endpoint) => endpoint.endpoint === "/api/admin/preprocess/process-history")?.scan_mode,
    "no-scan"
  );
  assert.equal(
    data.data_loading_plan.endpoints.find((endpoint) => endpoint.endpoint === "/api/admin/preprocess/process-history/readiness")?.scan_mode,
    "no-scan"
  );
  assert.equal(
    data.data_loading_plan.endpoints.find((endpoint) => endpoint.endpoint === "/api/admin/operations/overview")?.phase,
    "route"
  );
  assert.equal(
    data.data_loading_plan.endpoints.find((endpoint) => endpoint.endpoint === "/api/admin/doctor/report")?.scan_mode,
    "status-scan"
  );
  assert.equal(
    data.data_loading_plan.endpoints.find((endpoint) => endpoint.endpoint === "/api/admin/settings/runtime")?.scan_mode,
    "no-scan"
  );
  assert.equal(
    data.data_loading_plan.endpoints.find((endpoint) => endpoint.endpoint === "/api/admin/operation-log")?.scan_mode,
    "no-scan"
  );
  assert.equal(
    data.data_loading_plan.endpoints.find((endpoint) => endpoint.endpoint === "/api/admin/library/scan")?.scan_mode,
    "folder-scan"
  );
  assert.equal(
    data.data_loading_plan.endpoints.find((endpoint) => endpoint.endpoint === "/api/admin/library/scan")?.scan_reason,
    "explicit-scan-apply"
  );
  assert.equal(
    data.data_loading_plan.endpoints.find((endpoint) => endpoint.endpoint === "/api/admin/library/scan-new")?.scan_reason,
    "explicit-additive-scan"
  );
  assert.equal(
    data.data_loading_plan.routes.find((route) => route.route === "protection")?.endpoints.includes("/api/admin/operations/overview"),
    true
  );
  assert.equal(
    data.data_loading_plan.routes.find((route) => route.route === "protection")?.endpoints.includes("/api/admin/read-model/reconcile/status"),
    true
  );
  assert.equal(
    data.data_loading_plan.routes.find((route) => route.route === "operation-log")?.endpoints.includes("/api/admin/operation-log"),
    true
  );
  assert.equal(
    data.data_loading_plan.routes.find((route) => route.route === "preprocess-jobs")?.endpoints.includes("/api/admin/preprocess/process-history"),
    true
  );
  assert.deepEqual(
    data.data_loading_plan.routes.find((route) => route.route === "index-publish")?.endpoints,
    ["/api/admin/source-videos", "/api/admin/index/versions"]
  );
  assert.deepEqual(
    data.data_loading_plan.routes.find((route) => route.route === "settings")?.endpoints,
    ["/api/admin/library/path-checks", "/api/admin/settings/runtime"]
  );
});

test("fixture operations overview aggregates release gates and loading plan", async () => {
  const overview = await createFixtureAdminApiClient().getOperationsOverview();

  assert.equal(overview.title, "管理端运行保护中心");
  assert.equal(overview.schema_version, "1.0");
  assert.equal(overview.protection.mode, "preprocess-protection-v1");
  assert.equal(overview.summary.ready_video_count, 120);
  assert.equal(
    overview.summary.processing_video_count,
    overview.read_model.source_video_status.counts_by_status.processing
  );
  assert.equal(overview.release.gates.some((gate) => gate.code === "usage-events-tolerance"), true);
  assert.equal(overview.release.usage_events_repair.repair_required, false);
  assert.equal(overview.release.usage_events_repair.safe_scope, "usage-events-only");
  assert.match(overview.release.usage_events_repair.dry_run_command, /usage-events-repair/);
  assert.equal(overview.release.processing_recovery.recovery_required, false);
  assert.equal(overview.release.processing_recovery.safe_scope, "processing-to-queued-only");
  assert.equal(overview.release.processing_recovery.bulk_recovery_endpoint, "POST /api/admin/preprocess/recover-processing");
  assert.equal(overview.release.disk_space_protection.status, "healthy");
  assert.equal(overview.release.disk_space_protection.safe_to_preprocess, true);
  assert.equal(overview.release.disk_space_protection.write_block_scope, "preprocess-and-docker-upload");
  assert.equal(overview.release.disk_space_protection.threshold_env_var, "MIXLAB_PREPROCESS_DISK_BLOCK_USAGE_PERCENT");
  assert.equal(overview.release.disk_space_protection.starts_workers, false);
  assert.equal(overview.release.disk_space_protection.mutates_ready_assets, false);
  assert.equal(overview.release.disk_space_protection.mutates_cutter_protocol, false);
  assert.equal(overview.release.version_health_parity.status, "incomplete");
  assert.equal(overview.release.version_health_parity.metadata_complete, false);
  assert.equal(overview.release.version_health_parity.safe_scope, "version-health-only");
  assert.deepEqual(overview.release.version_health_parity.expected_services, [
    "admin-web",
    "admin-api",
    "admin-worker"
  ]);
  assert.equal(overview.release.version_health_parity.starts_workers, false);
  assert.equal(overview.release.version_health_parity.mutates_ready_assets, false);
  assert.equal(overview.release.version_health_parity.mutates_cutter_protocol, false);
  assert.equal(overview.release.gates.some((gate) => gate.code === "admin-worker-env-proof"), true);
  assert.equal(overview.release.admin_worker_env_proof.proof_required, true);
  assert.equal(overview.release.admin_worker_env_proof.status, "external-proof-required");
  assert.equal(overview.release.admin_worker_env_proof.safe_scope, "admin-worker-env-only");
  assert.equal(overview.release.admin_worker_env_proof.required_env_flags.MIXLAB_ADMIN_DOCKER_MVP_MODE, "off");
  assert.equal(overview.release.admin_worker_env_proof.required_env_flags.MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER, "0");
  assert.equal(overview.release.admin_worker_env_proof.required_library_roots.MIXLAB_ADMIN_LIBRARY_ROOT, "/data/PublicLibrary");
  assert.equal(overview.release.admin_worker_env_proof.records_secrets, false);
  assert.equal(overview.release.admin_worker_env_proof.starts_workers, false);
  assert.equal(overview.release.admin_worker_env_proof.mutates_ready_assets, false);
  assert.equal(overview.release.admin_worker_env_proof.mutates_cutter_protocol, false);
  assert.equal(overview.release.gates.some((gate) => gate.code === "cutter-compatibility-proof"), true);
  assert.equal(overview.release.cutter_compatibility_proof.proof_required, true);
  assert.equal(overview.release.cutter_compatibility_proof.status, "external-proof-required");
  assert.equal(overview.release.cutter_compatibility_proof.safe_scope, "cutter-compatibility-only");
  assert.equal(overview.release.cutter_compatibility_proof.expected_ready_count, 10471);
  assert.equal(overview.release.cutter_compatibility_proof.expected_auth_mode, "reviewed");
  assert.equal(overview.release.cutter_compatibility_proof.requires_staged_candidate, true);
  assert.equal(overview.release.cutter_compatibility_proof.contacts_windows_runner, false);
  assert.equal(overview.release.cutter_compatibility_proof.contacts_docker, false);
  assert.equal(overview.release.cutter_compatibility_proof.starts_workers, false);
  assert.equal(overview.release.cutter_compatibility_proof.mutates_ready_assets, false);
  assert.equal(overview.release.cutter_compatibility_proof.mutates_cutter_protocol, false);
  assert.equal(overview.release.gates.some((gate) => gate.code === "current-index"), true);
  assert.equal(overview.release.gates.some((gate) => gate.code === "scan-protection"), true);
  assert.equal(overview.read_model.source_video_status.name, "source-video-status-read-model-v1");
  assert.equal(overview.read_model.source_video_status.freshness, "fresh");
  assert.equal(overview.read_model.admin_read_model.storage, "sqlite");
  assert.equal(overview.read_model.admin_read_model.freshness, "fresh");
  assert.equal(overview.read_model.admin_read_model.reconciliation.action, "none");
  assert.equal(overview.read_model.admin_read_model.reconciliation.scan_mode, "no-scan");
  assert.equal(overview.data_loading.strategy, "shell-first-route-owned-v1");
  assert.equal(overview.data_loading.hidden_full_scan_allowed, false);
});

test("fixture read-model reconcile status exposes step progress", async () => {
  const client = createFixtureAdminApiClient();
  const status = await client.getReadModelReconcileStatus();
  const started = await client.startReadModelReconcile();
  const cancelled = await client.cancelReadModelReconcile();

  assert.equal(status.command, "read-model-reconcile");
  assert.equal(status.status, "running");
  assert.equal(status.phase, "scanning");
  assert.equal(status.progress.current_step, "preprocess-job-snapshots");
  assert.equal(status.progress.preprocess_job_snapshot_count, 64);
  assert.equal(status.progress.total_preprocess_job_snapshot_count, 623);
  assert.equal(status.progress.step_percent, 10);
  assert.equal(status.events[0]?.current_step, "preprocess-job-snapshots");
  assert.equal(started.accepted, true);
  assert.equal(started.status.command, "read-model-reconcile");
  assert.equal(cancelled.accepted, true);
  assert.equal(cancelled.status.cancel_requested, true);
});

test("fixture operation log exposes command snapshots and read-model maintenance events", async () => {
  const client = createFixtureAdminApiClient();
  const operationLog = await client.getOperationLog({ limit: 2 });
  const dataLoadingPlan = await client.getDataLoadingPlan();
  const restorePlanEndpoint = dataLoadingPlan.endpoints.find(
    (endpoint) => endpoint.endpoint === "/api/admin/command-snapshots/:snapshot_id/restore-plan"
  );
  const restoreExecutionEndpoint = dataLoadingPlan.endpoints.find(
    (endpoint) => endpoint.endpoint === "/api/admin/command-snapshots/:snapshot_id/restore"
  );

  assert.equal(operationLog.schema_version, "1.0");
  assert.equal(operationLog.events.length, 2);
  assert.equal(operationLog.events[0]?.area, "protection");
  assert.equal(operationLog.events[0]?.action, "source-video-metadata");
  assert.equal(operationLog.events[0]?.event_type, "succeeded");
  assert.equal(
    (operationLog.events[0]?.details.command_snapshot as { snapshot_id?: string })?.snapshot_id,
    "fixture-source-video-metadata-snapshot"
  );
  assert.deepEqual(operationLog.events[0]?.details.actor, {
    kind: "admin-user",
    source: "admin-session",
    admin_id: "AU000001",
    username: "owner",
    display_name: "Owner",
    role: "owner"
  });
  assert.equal(operationLog.events[1]?.area, "users");
  assert.equal(operationLog.events[1]?.action, "cutter-user-approve");
  assert.equal(
    (operationLog.events[1]?.details.command_snapshot as { snapshot_id?: string })?.snapshot_id,
    "fixture-cutter-user-approve-snapshot"
  );
  assert.equal(operationLog.truncated, true);

  const plan = await client.getCommandSnapshotRestorePlan("fixture-source-video-metadata-snapshot");
  const restore = await client.restoreCommandSnapshot("fixture-source-video-metadata-snapshot");
  assert.equal(plan.can_restore, true);
  assert.equal(plan.snapshot_id, "fixture-source-video-metadata-snapshot");
  assert.equal(plan.file_count, 1);
  assert.equal(plan.restorable_file_count, 1);
  assert.equal(plan.files[0]?.target_status, "exists");
  assert.equal(plan.files[0]?.snapshot_status, "exists");
  assert.equal(restore.status, "restored");
  assert.equal(restore.restored_file_count, 1);
  assert.equal(restore.files[0]?.restored, true);
  assert.equal(restorePlanEndpoint?.phase, "command");
  assert.equal(restorePlanEndpoint?.scan_mode, "no-scan");
  assert.equal(restorePlanEndpoint?.data_source, "command-snapshot");
  assert.equal(restorePlanEndpoint?.refresh, "command-only");
  assert.equal(restoreExecutionEndpoint?.method, "POST");
  assert.equal(restoreExecutionEndpoint?.phase, "command");
  assert.equal(restoreExecutionEndpoint?.scan_mode, "no-scan");
  assert.equal(restoreExecutionEndpoint?.data_source, "command-snapshot");
  assert.equal(restoreExecutionEndpoint?.refresh, "command-only");
});

test("dashboard shell loader requests only shell-safe endpoints", async () => {
  const fixture = await loadAdminDashboardData(createFixtureAdminApiClient(), { includeHeavy: false });
  const requested: string[] = [];
  const client = createAdminApiClient({
    base_url: "http://127.0.0.1:4899",
    fetch: async (url) => {
      const pathname = new URL(String(url)).pathname;
      requested.push(pathname);

      const data = pathname === "/api/admin/library/status"
        ? fixture.status
        : pathname === "/api/admin/settings/config"
          ? fixture.settings
          : pathname === "/api/admin/preprocess/supervisor/status"
            ? fixture.jobs.supervisor
            : pathname === "/api/admin/preprocess/jobs"
              ? fixture.jobs
              : pathname === "/api/admin/data-loading/plan"
                ? fixture.data_loading_plan
                : null;

      if (!data) {
        throw new Error(`unexpected dashboard shell request: ${pathname}`);
      }

      return new Response(JSON.stringify({ ok: true, data }), {
        headers: { "content-type": "application/json" }
      });
    }
  });

  const data = await loadAdminDashboardData(client, { includeHeavy: false });
  const requestedSet = new Set(requested);

  assert.deepEqual(requestedSet, new Set([
    "/api/admin/library/status",
    "/api/admin/settings/config",
    "/api/admin/preprocess/supervisor/status",
    "/api/admin/preprocess/jobs",
    "/api/admin/data-loading/plan"
  ]));
  assert.equal(data.source_videos.length, 0);
  assert.equal(data.jobs.jobs.length > 0, true);
  assert.equal(data.data_loading_plan.background_prefetch_default, false);

  for (const heavyPath of [
    "/api/admin/source-videos",
    "/api/admin/index/versions",
    "/api/admin/doctor/report",
    "/api/admin/settings/runtime",
    "/api/admin/dashboard/metrics",
    "/api/admin/cutter-users",
    "/api/admin/operations/overview",
    "/api/admin/read-model/reconcile/status"
  ]) {
    assert.equal(requestedSet.has(heavyPath), false, `${heavyPath} should not be part of shell load`);
  }
});

test("fixture client pages source videos like the runtime API", async () => {
  const client = createFixtureAdminApiClient();
  const firstPage = await client.listSourceVideos({ limit: 2 });
  const secondPage = await client.listSourceVideos({ offset: 2, limit: 2 });
  const readyCashflow = await client.listSourceVideos({
    query: "现金流",
    status: "ready",
    limit: 20
  });

  assert.equal(firstPage.length, 2);
  assert.equal(secondPage.length, 2);
  assert.notEqual(firstPage[0]?.source_video_id, secondPage[0]?.source_video_id);
  assert.equal(readyCashflow.every((video) => video.preprocess_status === "ready"), true);
  assert.equal(readyCashflow.some((video) => video.title.includes("现金流")), true);
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

test("fixture preprocess process history exposes bounded no-scan read-model data", async () => {
  const history = await createFixtureAdminApiClient().listPreprocessProcessHistory({
    limit: 2,
    window_days: 7
  });

  assert.equal(history.history_available, true);
  assert.equal(history.actual_data_source, "admin-read-model");
  assert.equal(history.scan_mode, "no-scan");
  assert.equal(history.cache_status, "hit");
  assert.equal(history.window_days, 7);
  assert.equal(history.limit, 2);
  assert.deepEqual(history.filters, {
    source_folder_name: "",
    preprocess_status: "",
    event_type: ""
  });
  assert.deepEqual(history.filter_options, {
    source_folder_names: ["默认素材来源"],
    preprocess_statuses: ["processing", "ready", "failed"],
    event_types: ["failed", "indexed", "claimed"]
  });
  assert.equal(history.items.length, 2);
  assert.equal(history.summary.returned_count, 2);
  assert.equal(history.summary.tracked_count, 2);
  assert.equal(history.summary.status_counts.processing, 1);
  assert.equal(history.summary.event_counts.indexed, 1);
  assert.deepEqual(history.summary.source_folder_summaries, [
    {
      source_folder_name: "默认素材来源",
      tracked_count: 2,
      completed_count: 1,
      failed_count: 0,
      active_count: 1,
      average_process_ms: 463_500,
      newest_event_at: "2024-05-07T10:26:10.000Z"
    }
  ]);
  assert.deepEqual(history.summary.daily_trend, [
    {
      date: "2024-05-07",
      tracked_count: 2,
      completed_count: 1,
      failed_count: 0,
      active_count: 1,
      average_process_ms: 463_500
    }
  ]);
  assert.equal(history.items[0]?.source_video_id, "V000043");

  const filtered = await createFixtureAdminApiClient().listPreprocessProcessHistory({
    source_folder_name: "默认素材来源",
    preprocess_status: "failed",
    event_type: "failed",
    limit: 10,
    window_days: 7
  });

  assert.deepEqual(filtered.filters, {
    source_folder_name: "默认素材来源",
    preprocess_status: "failed",
    event_type: "failed"
  });
  assert.equal(filtered.items.length, 1);
  assert.equal(filtered.items[0]?.source_video_id, "V000037");
  assert.equal(filtered.summary.returned_count, 1);
  assert.equal(filtered.summary.tracked_count, 1);
  assert.equal(filtered.summary.tracked_failed_count, 1);
  assert.equal(filtered.summary.status_counts.failed, 1);
  assert.equal(filtered.summary.event_counts.failed, 1);
  assert.deepEqual(filtered.summary.source_folder_summaries, [
    {
      source_folder_name: "默认素材来源",
      tracked_count: 1,
      completed_count: 0,
      failed_count: 1,
      active_count: 0,
      average_process_ms: 38_000,
      newest_event_at: "2024-05-07T10:18:20.000Z"
    }
  ]);
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
  assert.equal(metrics.sources.material.data_source, "admin-read-model");
  assert.equal(metrics.sources.production.scan_mode, "no-scan");
  assert.equal(metrics.sources.transcript.data_source, "current-index");
  assert.equal(metrics.sources.usage.data_source, "admin-read-model");

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

  const failedLog = await client.getPreprocessJobLog("J000037");
  assert.equal(failedLog.source_video_id, "V000037");
  assert.equal(failedLog.exists, true);
  assert.match(failedLog.content, /DashScope ASR 网络超时/);

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
  assert.equal((await client.listIndexVersions()).current_validation_message, "current.json 指向 v000028");

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

  const cover = await client.updateSourceVideoCover("V000042", {
    image_base64: "iVBORw0KGgo=",
    content_type: "image/png",
    file_name: "cover.png"
  });
  assert.equal(cover.cover_url, "data:image/png;base64,iVBORw0KGgo=");

  const data = await loadAdminDashboardData(client);
  assert.equal(data.source_videos.some((video) => video.preprocess_status === "failed"), false);
  assert.equal(data.source_videos.some((video) => video.preprocess_status === "index-required"), false);
});
