import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_PREPROCESS_JOB_DEFAULT_LOAD_LIMIT,
  ADMIN_PREPROCESS_PROCESS_HISTORY_DEFAULT_LOAD_LIMIT,
  createAdminOperationsClientMethods
} from "./admin-operations-client.ts";

test("calls operations endpoints with session headers and stable query defaults", async () => {
  const requests: Array<{
    pathname: string;
    search: string;
    method: string;
    token: string | null;
    body?: unknown;
  }> = [];
  const client = createAdminOperationsClientMethods({
    baseUrl: "http://127.0.0.1:4899",
    protectedHeaders: {
      "X-MixLab-Admin-Session-Token": "admin-session-001"
    },
    fetchImpl: async (url, init) => {
      const parsedUrl = new URL(String(url));
      requests.push({
        pathname: parsedUrl.pathname,
        search: parsedUrl.search,
        method: init?.method ?? "GET",
        token: new Headers(init?.headers).get("x-mixlab-admin-session-token"),
        body: init?.body ? JSON.parse(String(init.body)) : undefined
      });

      return new Response(JSON.stringify({ ok: true, data: {} }), {
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
  await client.getCommandSnapshotRestorePlan("sample/snapshot 001");
  await client.restoreCommandSnapshot("sample/snapshot 001");
  await client.getPathChecks();
  await client.getAdminSettings();
  await client.saveAdminSettings({
    library_name: "课程公共素材库",
    source_folders: [],
    runtime_policy: {
      audio_mode: "mp3_16k_mono_64k",
      concurrent_jobs: 2,
      auto_scan_enabled: true,
      auto_queue_enabled: false,
      auto_publish_index_enabled: true
    },
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
  await client.getDashboardMetrics();
  await client.listPreprocessJobs();
  await client.listPreprocessJobs({ limit: 5, offset: 10 });
  await client.listPreprocessProcessHistory();
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
  await client.getScanNewSourceVideosStatus();
  await client.queueUnprocessedVideos();
  await client.retryFailedVideos();
  await client.recoverProcessingVideos();
  await client.getPreprocessSupervisorStatus();
  await client.startPreprocessSupervisor(1);
  await client.stopPreprocessSupervisor();
  await client.repairIndex({ limit: 10 });
  await client.runDoctor();
  await client.exportDoctorReport();
  await client.testAsrConfig();

  assert.deepEqual(
    requests.map((request) => [request.method, request.pathname]),
    [
      ["GET", "/api/admin/library/status"],
      ["GET", "/api/admin/data-loading/plan"],
      ["GET", "/api/admin/operations/overview"],
      ["GET", "/api/admin/read-model/reconcile/status"],
      ["POST", "/api/admin/read-model/reconcile"],
      ["POST", "/api/admin/read-model/reconcile/cancel"],
      ["GET", "/api/admin/operation-log"],
      ["GET", "/api/admin/command-snapshots/sample%2Fsnapshot%20001/restore-plan"],
      ["POST", "/api/admin/command-snapshots/sample%2Fsnapshot%20001/restore"],
      ["GET", "/api/admin/library/path-checks"],
      ["GET", "/api/admin/settings/config"],
      ["PATCH", "/api/admin/settings/config"],
      ["POST", "/api/admin/settings/source-folders"],
      ["PATCH", "/api/admin/settings/source-folders/src_002"],
      ["DELETE", "/api/admin/settings/source-folders/src_002"],
      ["GET", "/api/admin/dashboard/metrics"],
      ["GET", "/api/admin/preprocess/jobs"],
      ["GET", "/api/admin/preprocess/jobs"],
      ["GET", "/api/admin/preprocess/process-history"],
      ["GET", "/api/admin/preprocess/process-history"],
      ["GET", "/api/admin/preprocess/jobs/J000001/log"],
      ["GET", "/api/admin/index/versions"],
      ["GET", "/api/admin/doctor/report"],
      ["GET", "/api/admin/runtime/diagnostics/history"],
      ["GET", "/api/admin/settings/runtime"],
      ["POST", "/api/admin/library/init"],
      ["POST", "/api/admin/library/scan"],
      ["POST", "/api/admin/library/scan-new"],
      ["GET", "/api/admin/library/scan-new/status"],
      ["POST", "/api/admin/preprocess/queue-unprocessed"],
      ["POST", "/api/admin/preprocess/retry-failed"],
      ["POST", "/api/admin/preprocess/recover-processing"],
      ["GET", "/api/admin/preprocess/supervisor/status"],
      ["POST", "/api/admin/preprocess/supervisor/start"],
      ["POST", "/api/admin/preprocess/supervisor/stop"],
      ["POST", "/api/admin/index/repair"],
      ["POST", "/api/admin/doctor/run"],
      ["POST", "/api/admin/doctor/export"],
      ["POST", "/api/admin/settings/test-asr"]
    ]
  );

  assert.deepEqual([...new Set(requests.map((request) => request.token))], ["admin-session-001"]);
  assert.equal(
    requests.find((request) => request.pathname === "/api/admin/operation-log")?.search,
    "?limit=12"
  );
  assert.equal(
    requests.filter((request) => request.pathname === "/api/admin/preprocess/jobs")[0]?.search,
    `?limit=${ADMIN_PREPROCESS_JOB_DEFAULT_LOAD_LIMIT}`
  );
  assert.equal(
    requests.filter((request) => request.pathname === "/api/admin/preprocess/jobs")[1]?.search,
    "?limit=5&offset=10"
  );
  assert.equal(
    requests.filter((request) => request.pathname === "/api/admin/preprocess/process-history")[0]?.search,
    `?limit=${ADMIN_PREPROCESS_PROCESS_HISTORY_DEFAULT_LOAD_LIMIT}&window_days=30`
  );
  assert.equal(
    requests.filter((request) => request.pathname === "/api/admin/preprocess/process-history")[1]?.search,
    "?limit=7&window_days=14&source_folder_name=%E9%BB%98%E8%AE%A4%E7%B4%A0%E6%9D%90%E6%9D%A5%E6%BA%90&preprocess_status=failed&event_type=failed"
  );
  assert.equal(
    requests.find((request) => request.pathname === "/api/admin/runtime/diagnostics/history")?.search,
    "?limit=20"
  );
  assert.deepEqual(
    requests.find((request) => request.pathname === "/api/admin/index/repair")?.body,
    { limit: 10 }
  );
  assert.deepEqual(
    requests.find((request) => request.pathname === "/api/admin/settings/config" && request.method === "PATCH")?.body,
    {
      library_name: "课程公共素材库",
      source_folders: [],
      runtime_policy: {
        audio_mode: "mp3_16k_mono_64k",
        concurrent_jobs: 2,
        auto_scan_enabled: true,
        auto_queue_enabled: false,
        auto_publish_index_enabled: true
      },
      asr: {
        dashscope_api_key: "sk-live-secret"
      }
    }
  );
  assert.deepEqual(
    requests.find((request) => request.pathname === "/api/admin/settings/source-folders" && request.method === "POST")?.body,
    {
      name: "品牌素材",
      path: "/Volumes/BrandVideos",
      enabled: true
    }
  );
  assert.deepEqual(
    requests.find((request) => request.pathname === "/api/admin/settings/source-folders/src_002" && request.method === "PATCH")?.body,
    {
      name: "品牌素材归档",
      enabled: false
    }
  );
  assert.equal(
    requests.find((request) => request.pathname === "/api/admin/settings/source-folders/src_002" && request.method === "DELETE")?.body,
    undefined
  );
  assert.deepEqual(
    requests.find((request) => request.pathname === "/api/admin/preprocess/supervisor/start")?.body,
    { limit: 1 }
  );
});

test("omits all-status and empty process-history filters", async () => {
  const requested: string[] = [];
  const client = createAdminOperationsClientMethods({
    baseUrl: "http://127.0.0.1:4899",
    fetchImpl: async (url) => {
      requested.push(String(url));
      return new Response(JSON.stringify({ ok: true, data: {} }), {
        headers: { "content-type": "application/json" }
      });
    }
  });

  await client.listPreprocessProcessHistory({
    limit: 10,
    window_days: 7,
    source_folder_name: "  ",
    preprocess_status: "all",
    event_type: "all"
  });

  const url = new URL(requested[0]!);
  assert.equal(url.pathname, "/api/admin/preprocess/process-history");
  assert.equal(url.search, "?limit=10&window_days=7");
});

test("forwards preprocess job status filters", async () => {
  const requested: string[] = [];
  const client = createAdminOperationsClientMethods({
    baseUrl: "http://127.0.0.1:4899",
    fetchImpl: async (url) => {
      requested.push(String(url));
      return new Response(JSON.stringify({ ok: true, data: {} }), {
        headers: { "content-type": "application/json" }
      });
    }
  });

  await client.listPreprocessJobs({
    limit: 50,
    status: "failed"
  });

  const url = new URL(requested[0]!);
  assert.equal(url.pathname, "/api/admin/preprocess/jobs");
  assert.equal(url.search, "?limit=50&status=failed");
});

test("starts preprocess supervisor with bounded unprocessed queue option", async () => {
  const requests: Array<{ pathname: string; body?: unknown }> = [];
  const client = createAdminOperationsClientMethods({
    baseUrl: "http://127.0.0.1:4899",
    fetchImpl: async (url, init) => {
      requests.push({
        pathname: new URL(String(url)).pathname,
        body: init?.body ? JSON.parse(String(init.body)) : undefined
      });

      return new Response(JSON.stringify({ ok: true, data: {} }), {
        headers: { "content-type": "application/json" }
      });
    }
  });

  await client.startPreprocessSupervisor(5, { queue_unprocessed_limit: 5 });

  assert.deepEqual(requests, [
    {
      pathname: "/api/admin/preprocess/supervisor/start",
      body: {
        limit: 5,
        queue_unprocessed_limit: 5
      }
    }
  ]);
});

test("starts preprocess supervisor in long ASR mode for explicit source videos", async () => {
  const requests: Array<{ pathname: string; body?: unknown }> = [];
  const client = createAdminOperationsClientMethods({
    baseUrl: "http://127.0.0.1:4899",
    fetchImpl: async (url, init) => {
      requests.push({
        pathname: new URL(String(url)).pathname,
        body: init?.body ? JSON.parse(String(init.body)) : undefined
      });

      return new Response(JSON.stringify({ ok: true, data: {} }), {
        headers: { "content-type": "application/json" }
      });
    }
  });

  await client.startPreprocessSupervisor(undefined, {
    source_video_ids: ["V009934"],
    asr_mode: "long-task"
  });

  assert.deepEqual(requests, [
    {
      pathname: "/api/admin/preprocess/supervisor/start",
      body: {
        source_video_ids: ["V009934"],
        asr_mode: "long-task"
      }
    }
  ]);
});

test("starts preprocess supervisor without a limit for continuous processing", async () => {
  const requests: Array<{ pathname: string; body?: unknown }> = [];
  const client = createAdminOperationsClientMethods({
    baseUrl: "http://127.0.0.1:4899",
    fetchImpl: async (url, init) => {
      requests.push({
        pathname: new URL(String(url)).pathname,
        body: init?.body ? JSON.parse(String(init.body)) : undefined
      });

      return new Response(JSON.stringify({ ok: true, data: {} }), {
        headers: { "content-type": "application/json" }
      });
    }
  });

  await client.startPreprocessSupervisor();

  assert.deepEqual(requests, [
    {
      pathname: "/api/admin/preprocess/supervisor/start",
      body: {}
    }
  ]);
});

test("operations client preserves preprocess jobs runtime metadata", async () => {
  const client = createAdminOperationsClientMethods({
    baseUrl: "http://127.0.0.1:4899",
    fetchImpl: async () =>
      new Response(JSON.stringify({
        ok: true,
        data: {
          active_count: 0,
          queued_count: 0,
          completed_count: 0,
          failed_count: 0,
          supervisor: {
            state: "idle",
            state_label: "未运行",
            worker_id: "",
            started_at: "",
            stopped_at: "",
            last_error: "",
            stop_requested: false,
            last_result: null
          },
          observability: {
            running_job_id: "",
            running_source_video_id: "",
            pipeline_progress_percent: 0,
            estimated_all_done_at: "",
            estimated_queue_duration_ms: 0,
            throughput_label: "没有等待处理的视频。",
            load_advice: "运行负荷正常，可以继续处理"
          },
          jobs: []
        },
        meta: {
          runtime: {
            schema_version: "1.0",
            endpoint: "/api/admin/preprocess/jobs",
            method: "GET",
            duration_ms: 812,
            scan_mode: "status-scan",
            data_source: "admin-read-model",
            scan_reason: "route-owned-page",
            actual_data_source: "admin-read-model",
            cache_status: "hit",
            result_count: 0,
            offset: 0,
            limit: 20,
            slow: false,
            slow_reason: "",
            components: [{
              name: "preprocess_job_page",
              duration_ms: 721,
              data_source: "admin-read-model",
              scan_mode: "paged-list",
              scan_reason: "route-owned-page",
              cache_status: "hit"
            }]
          }
        }
      }), {
        headers: { "content-type": "application/json" }
      })
  });

  const jobs = await client.listPreprocessJobs();

  assert.equal(jobs.runtime?.endpoint, "/api/admin/preprocess/jobs");
  assert.equal(jobs.runtime?.duration_ms, 812);
  assert.equal(jobs.runtime?.components?.[0]?.name, "preprocess_job_page");
});

test("operations client preserves index versions runtime metadata", async () => {
  const client = createAdminOperationsClientMethods({
    baseUrl: "http://127.0.0.1:4899",
    fetchImpl: async () =>
      new Response(JSON.stringify({
        ok: true,
        data: {
          current_version: "v000027",
          current_validation_status: "pass",
          current_validation_message: "current.json 指向 v000027",
          total_count: 2,
          returned_count: 2,
          offset: 0,
          limit: 20,
          has_more: false,
          versions: []
        },
        meta: {
          runtime: {
            schema_version: "1.0",
            endpoint: "/api/admin/index/versions",
            method: "GET",
            duration_ms: 684,
            scan_mode: "paged-list",
            data_source: "index-version-packages",
            scan_reason: "index-version-page",
            actual_data_source: "index-version-packages",
            cache_status: "hit",
            result_count: 2,
            offset: 0,
            limit: 20,
            slow: false,
            slow_reason: "",
            components: [{
              name: "current_pointer_fast_page",
              duration_ms: 301,
              data_source: "current-index",
              scan_mode: "no-scan",
              scan_reason: "index-version-page",
              cache_status: "hit"
            }]
          }
        }
      }), {
        headers: { "content-type": "application/json" }
      })
  });

  const versions = await client.listIndexVersions();

  assert.equal(versions.runtime?.endpoint, "/api/admin/index/versions");
  assert.equal(versions.runtime?.duration_ms, 684);
  assert.equal(versions.runtime?.components?.[0]?.name, "current_pointer_fast_page");
});
