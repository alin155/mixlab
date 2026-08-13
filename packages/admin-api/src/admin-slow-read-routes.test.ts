import assert from "node:assert/strict";
import test from "node:test";
import {
  handleAdminSlowReadRoutes,
  type AdminSlowReadRouteDeps,
  type AdminSlowReadRoutePagedOptions
} from "./admin-slow-read-routes.ts";

interface TestDashboardMetrics {
  material: {
    video_count: number;
  };
}

interface TestPreprocessJobs {
  active_count: number;
  jobs: Array<{ job_id: string }>;
}

interface TestSupervisor {
  state: "running" | "idle";
}

interface TestIndexVersions {
  versions: Array<{ index_version: string }>;
  offset: number;
  limit: number;
}

function makeDeps(
  overrides: Partial<AdminSlowReadRouteDeps<
    TestDashboardMetrics,
    TestPreprocessJobs,
    TestSupervisor,
    TestIndexVersions
  >> = {}
): AdminSlowReadRouteDeps<TestDashboardMetrics, TestPreprocessJobs, TestSupervisor, TestIndexVersions> {
  return {
    read_dashboard_metrics: async () => ({
      data: {
        material: {
          video_count: 11394
        }
      },
      actual_data_source: "usage-events",
      cache_status: "miss",
      component_timings: [{
        name: "usage_metrics",
        duration_ms: 120,
        data_source: "usage-events",
        scan_mode: "status-scan",
        scan_reason: "background-metrics"
      }]
    }),
    read_preprocess_jobs: async () => ({
      data: {
        active_count: 1,
        jobs: [{ job_id: "J000001" }]
      },
      actual_data_source: "admin-read-model",
      cache_status: "hit"
    }),
    read_preprocess_supervisor_status: () => ({
      state: "running"
    }),
    read_index_versions: async () => ({
      response: {
        versions: [{ index_version: "v010471" }],
        offset: 0,
        limit: 20
      },
      runtime: {
        actual_data_source: "index-version-packages",
        cache_status: "miss",
        query_strategy: "directory-page"
      }
    }),
    ...overrides
  };
}

async function callRoute(input: {
  method?: string;
  pathname: string;
  query?: string;
  deps?: AdminSlowReadRouteDeps<TestDashboardMetrics, TestPreprocessJobs, TestSupervisor, TestIndexVersions>;
}) {
  return handleAdminSlowReadRoutes({
    method: input.method ?? "GET",
    pathname: input.pathname,
    search_params: new URLSearchParams(input.query ?? ""),
    api_input: {
      library_root: "/tmp/PublicLibrary"
    },
    deps: input.deps ?? makeDeps()
  });
}

test("slow read routes handle dashboard metrics runtime metadata", async () => {
  const samples = [10, 1_700];
  const result = await callRoute({
    pathname: "/api/admin/dashboard/metrics",
    deps: makeDeps({
      runtime_now_ms: () => samples.shift() ?? 1_700
    })
  });

  assert.equal(result.handled, true);
  if (!result.handled) {
    return;
  }

  assert.equal(result.status_code, 200);
  assert.equal(result.body.ok, true);
  if (!result.body.ok) {
    return;
  }

  assert.deepEqual(result.body.data, {
    material: {
      video_count: 11394
    }
  });
  assert.equal(result.body.meta?.runtime.endpoint, "/api/admin/dashboard/metrics");
  assert.equal(result.body.meta?.runtime.scan_mode, "status-scan");
  assert.equal(result.body.meta?.runtime.data_source, "usage-events");
  assert.equal(result.body.meta?.runtime.scan_reason, "background-metrics");
  assert.equal(result.body.meta?.runtime.actual_data_source, "usage-events");
  assert.equal(result.body.meta?.runtime.cache_status, "miss");
  assert.equal(result.body.meta?.runtime.result_count, 1);
  assert.equal(result.body.meta?.runtime.slow, true);
  assert.equal(result.body.meta?.runtime.slow_reason, "dashboard-metrics-above-target");
  assert.deepEqual(result.body.meta?.runtime.components?.map((component) => component.name), ["usage_metrics"]);
  assert.equal(result.body.meta?.runtime.components?.[0]?.duration_ms, 120);
});

test("slow read routes derive dashboard runtime source from read-model results", async () => {
  const result = await callRoute({
    pathname: "/api/admin/dashboard/metrics",
    deps: makeDeps({
      read_dashboard_metrics: async () => ({
        data: {
          material: {
            video_count: 11394
          }
        },
        actual_data_source: "admin-read-model",
        cache_status: "hit",
        component_timings: [{
          name: "usage_metrics",
          duration_ms: 9,
          data_source: "admin-read-model",
          scan_mode: "no-scan",
          scan_reason: "background-metrics",
          cache_status: "hit"
        }]
      })
    })
  });

  assert.equal(result.handled, true);
  if (!result.handled || !result.body.ok) {
    return;
  }

  assert.equal(result.body.meta?.runtime.scan_mode, "no-scan");
  assert.equal(result.body.meta?.runtime.data_source, "admin-read-model");
  assert.equal(result.body.meta?.runtime.actual_data_source, "admin-read-model");
  assert.equal(result.body.meta?.runtime.cache_status, "hit");
  assert.deepEqual(result.body.meta?.runtime.components?.map((component) => component.name), ["usage_metrics"]);
  assert.equal(result.body.meta?.runtime.components?.[0]?.scan_mode, "no-scan");
});

test("slow read routes record runtime diagnostics best-effort", async () => {
  const recorded: Array<{ libraryRoot: string; endpoint: string; slow: boolean }> = [];
  const result = await callRoute({
    pathname: "/api/admin/dashboard/metrics",
    deps: makeDeps({
      record_runtime_diagnostic: async (libraryRoot, runtime) => {
        recorded.push({
          libraryRoot,
          endpoint: runtime.endpoint,
          slow: runtime.slow
        });
      }
    })
  });

  assert.equal(result.handled, true);
  assert.deepEqual(recorded, [{
    libraryRoot: "/tmp/PublicLibrary",
    endpoint: "/api/admin/dashboard/metrics",
    slow: false
  }]);

  const ignoredRecorderFailure = await callRoute({
    pathname: "/api/admin/preprocess/jobs",
    deps: makeDeps({
      record_runtime_diagnostic: () => {
        throw new Error("diagnostic write failed");
      }
    })
  });

  assert.equal(ignoredRecorderFailure.handled, true);
  if (ignoredRecorderFailure.handled) {
    assert.equal(ignoredRecorderFailure.status_code, 200);
  }
});

test("slow read routes handle preprocess jobs pagination supervisor and runtime metadata", async () => {
  let captured: AdminSlowReadRoutePagedOptions | undefined;
  const samples = [20, 1_040];
  const result = await callRoute({
    pathname: "/api/admin/preprocess/jobs",
    query: "limit=999&offset=3",
    deps: makeDeps({
      runtime_now_ms: () => samples.shift() ?? 1_040,
      read_preprocess_jobs: async (_input, options) => {
        captured = options;
        return {
          data: {
            active_count: 2,
            jobs: [{ job_id: "J000002" }, { job_id: "J000003" }]
          },
          actual_data_source: "admin-read-model",
          cache_status: "hit",
          component_timings: [
            {
              name: "preprocess_job_page",
              duration_ms: 32,
              data_source: "admin-read-model",
              scan_mode: "paged-list",
              scan_reason: "route-owned-page",
              cache_status: "hit",
              detail: "offset=3;limit=500;manifests=2;snapshots=0"
            },
            {
              name: "runtime_load",
              duration_ms: 7,
              data_source: "runtime-telemetry",
              scan_mode: "no-scan",
              scan_reason: "route-owned-page",
              cache_status: "not-applicable",
              detail: "status=healthy"
            }
          ]
        };
      },
      read_preprocess_supervisor_status: () => ({
        state: "idle"
      })
    })
  });

  assert.equal(result.handled, true);
  if (!result.handled) {
    return;
  }

  assert.equal(result.status_code, 200);
  assert.equal(result.body.ok, true);
  if (!result.body.ok) {
    return;
  }

  assert.deepEqual(captured, {
    limit: 500,
    offset: 3
  });
  assert.deepEqual(result.body.data, {
    active_count: 2,
    jobs: [{ job_id: "J000002" }, { job_id: "J000003" }],
    supervisor: {
      state: "idle"
    }
  });
  assert.equal(result.body.meta?.runtime.endpoint, "/api/admin/preprocess/jobs");
  assert.equal(result.body.meta?.runtime.scan_mode, "status-scan");
  assert.equal(result.body.meta?.runtime.data_source, "admin-read-model");
  assert.equal(result.body.meta?.runtime.scan_reason, "route-owned-page");
  assert.equal(result.body.meta?.runtime.actual_data_source, "admin-read-model");
  assert.equal(result.body.meta?.runtime.cache_status, "hit");
  assert.equal(result.body.meta?.runtime.result_count, 2);
  assert.equal(result.body.meta?.runtime.offset, 3);
  assert.equal(result.body.meta?.runtime.limit, 500);
  assert.equal(result.body.meta?.runtime.slow, true);
  assert.equal(result.body.meta?.runtime.slow_reason, "preprocess-jobs-page-above-target");
  assert.deepEqual(result.body.meta?.runtime.components?.map((component) => component.name), [
    "preprocess_job_page",
    "runtime_load"
  ]);
  assert.equal(result.body.meta?.runtime.components?.[0]?.duration_ms, 32);
  assert.equal(result.body.meta?.runtime.components?.[0]?.data_source, "admin-read-model");
  assert.equal(result.body.meta?.runtime.components?.[0]?.scan_mode, "paged-list");
  assert.equal(result.body.meta?.runtime.components?.[0]?.cache_status, "hit");
});

test("slow read routes forward preprocess job status filters", async () => {
  let captured: AdminSlowReadRoutePagedOptions | undefined;
  const result = await callRoute({
    pathname: "/api/admin/preprocess/jobs",
    query: "limit=50&status=failed",
    deps: makeDeps({
      read_preprocess_jobs: async (_input, options) => {
        captured = options;
        return {
          data: {
            active_count: 0,
            jobs: [{ job_id: "J000059" }]
          },
          actual_data_source: "admin-read-model",
          cache_status: "hit"
        };
      }
    })
  });

  assert.equal(result.handled, true);
  assert.deepEqual(captured, {
    limit: 50,
    offset: 0,
    status: "failed"
  });
});

test("slow read routes preserve preprocess jobs absent limit as zero in metadata", async () => {
  let captured: AdminSlowReadRoutePagedOptions | undefined;
  const result = await callRoute({
    pathname: "/api/admin/preprocess/jobs",
    deps: makeDeps({
      read_preprocess_jobs: async (_input, options) => {
        captured = options;
        return {
          data: {
            active_count: 0,
            jobs: []
          },
          actual_data_source: "admin-read-model",
          cache_status: "unknown"
        };
      }
    })
  });

  assert.equal(result.handled, true);
  if (!result.handled) {
    return;
  }
  assert.deepEqual(captured, {
    limit: undefined,
    offset: 0
  });
  if (result.body.ok) {
    assert.equal(result.body.meta?.runtime.limit, 0);
    assert.equal(result.body.meta?.runtime.result_count, 0);
  }
});

test("slow read routes handle index versions pagination and runtime metadata", async () => {
  let capturedLibraryRoot = "";
  let capturedOptions: AdminSlowReadRoutePagedOptions | undefined;
  const samples = [30, 1_400];
  const result = await callRoute({
    pathname: "/api/admin/index/versions",
    query: "limit=7&offset=2",
    deps: makeDeps({
      runtime_now_ms: () => samples.shift() ?? 1_400,
      read_index_versions: async (libraryRoot, options) => {
        capturedLibraryRoot = libraryRoot;
        capturedOptions = options;
        return {
          response: {
            versions: [{ index_version: "v010470" }, { index_version: "v010471" }],
            offset: 2,
            limit: 7
          },
          runtime: {
            actual_data_source: "current-index",
            cache_status: "hit",
            query_strategy: "cache-hit",
            component_timings: [
              {
                name: "cache_lookup",
                duration_ms: 0,
                data_source: "current-index",
                scan_mode: "no-scan",
                scan_reason: "index-version-page",
                cache_status: "hit",
                detail: "offset=2;limit=7"
              }
            ]
          }
        };
      }
    })
  });

  assert.equal(result.handled, true);
  if (!result.handled) {
    return;
  }

  assert.equal(capturedLibraryRoot, "/tmp/PublicLibrary");
  assert.deepEqual(capturedOptions, {
    limit: 7,
    offset: 2
  });
  assert.equal(result.status_code, 200);
  assert.equal(result.body.ok, true);
  if (!result.body.ok) {
    return;
  }
  assert.deepEqual(result.body.data, {
    versions: [{ index_version: "v010470" }, { index_version: "v010471" }],
    offset: 2,
    limit: 7
  });
  assert.equal(result.body.meta?.runtime.endpoint, "/api/admin/index/versions");
  assert.equal(result.body.meta?.runtime.scan_mode, "paged-list");
  assert.equal(result.body.meta?.runtime.data_source, "index-version-packages");
  assert.equal(result.body.meta?.runtime.scan_reason, "index-version-page");
  assert.equal(result.body.meta?.runtime.actual_data_source, "current-index");
  assert.equal(result.body.meta?.runtime.cache_status, "hit");
  assert.equal(result.body.meta?.runtime.result_count, 2);
  assert.equal(result.body.meta?.runtime.offset, 2);
  assert.equal(result.body.meta?.runtime.limit, 7);
  assert.equal(result.body.meta?.runtime.slow, true);
  assert.equal(result.body.meta?.runtime.slow_reason, "cache-hit");
  assert.deepEqual(result.body.meta?.runtime.components?.map((component) => component.name), ["cache_lookup"]);
  assert.equal(result.body.meta?.runtime.components?.[0]?.data_source, "current-index");
  assert.equal(result.body.meta?.runtime.components?.[0]?.scan_mode, "no-scan");
});

test("slow read routes ignore unrelated routes and non-get methods", async () => {
  assert.deepEqual(await callRoute({ pathname: "/api/admin/preprocess/jobs/J000001/log" }), {
    handled: false
  });
  assert.deepEqual(await callRoute({ method: "POST", pathname: "/api/admin/index/versions" }), {
    handled: false
  });
});
