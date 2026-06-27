import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminSlowReadRouteDeps,
  createAdminSlowReadRouteServerDeps
} from "./admin-slow-read-route-deps.ts";

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

interface TestSupervisorRuntime {
  internal_state: "running" | "idle";
  temporary_result_count: number;
}

interface TestIndexVersions {
  versions: Array<{ index_version: string }>;
  offset: number;
  limit: number;
}

test("slow read route deps preserve query wrappers and injected helpers", async () => {
  const calls: Array<{ name: string; input: unknown }> = [];
  const deps = createAdminSlowReadRouteDeps<
    TestDashboardMetrics,
    TestPreprocessJobs,
    TestSupervisor,
    TestIndexVersions
  >({
    async read_dashboard_metrics(input) {
      calls.push({ name: "dashboard", input });
      return {
        data: {
          material: {
            video_count: 10471
          }
        },
        actual_data_source: "admin-read-model",
        cache_status: "hit"
      };
    },
    async read_preprocess_jobs_with_runtime_meta(input, options) {
      calls.push({ name: "preprocess-jobs", input: { input, options } });
      return {
        jobs: {
          active_count: 1,
          jobs: [{ job_id: "J000001" }]
        },
        actual_data_source: "admin-read-model",
        cache_status: "miss",
        component_timings: [{
          name: "preprocess_job_page",
          duration_ms: 12,
          data_source: "admin-read-model",
          scan_mode: "paged-list",
          scan_reason: "route-owned-page",
          cache_status: "miss"
        }]
      };
    },
    read_preprocess_supervisor_status: () => ({
      state: "running"
    }),
    async read_index_versions(libraryRoot, options) {
      calls.push({ name: "index-versions", input: { libraryRoot, options } });
      return {
        response: {
          versions: [{ index_version: "v010471" }],
          offset: options.offset,
          limit: options.limit ?? 20
        },
        runtime: {
          actual_data_source: "current-index",
          cache_status: "hit",
          query_strategy: "current-pointer-fast-page"
        }
      };
    },
    record_runtime_diagnostic(libraryRoot, runtime) {
      calls.push({ name: "diagnostic", input: { libraryRoot, endpoint: runtime.endpoint } });
    }
  });

  const apiInput = {
    library_root: "/tmp/PublicLibrary"
  };
  const dashboard = await deps.read_dashboard_metrics(apiInput);
  const preprocessJobs = await deps.read_preprocess_jobs(apiInput, {
    limit: 50,
    offset: 10
  });
  const supervisor = deps.read_preprocess_supervisor_status();
  const indexVersions = await deps.read_index_versions(apiInput.library_root, {
    limit: 7,
    offset: 2
  });
  await deps.record_runtime_diagnostic?.(apiInput.library_root, {
    schema_version: "1.0",
    endpoint: "/api/admin/dashboard/metrics",
    method: "GET",
    duration_ms: 10,
    scan_mode: "status-scan",
    scan_reason: "background-metrics",
    data_source: "usage-events",
    actual_data_source: "admin-read-model",
    cache_status: "hit",
    result_count: 1,
    offset: 0,
    limit: 0,
    slow: false,
    slow_reason: ""
  });

  assert.deepEqual(dashboard, {
    data: {
      material: {
        video_count: 10471
      }
    },
    actual_data_source: "admin-read-model",
    cache_status: "hit"
  });
  assert.deepEqual(preprocessJobs, {
    data: {
      active_count: 1,
      jobs: [{ job_id: "J000001" }]
    },
    actual_data_source: "admin-read-model",
    cache_status: "miss",
    component_timings: [{
      name: "preprocess_job_page",
      duration_ms: 12,
      data_source: "admin-read-model",
      scan_mode: "paged-list",
      scan_reason: "route-owned-page",
      cache_status: "miss"
    }]
  });
  assert.deepEqual(supervisor, {
    state: "running"
  });
  assert.deepEqual(indexVersions.response, {
    versions: [{ index_version: "v010471" }],
    offset: 2,
    limit: 7
  });
  assert.deepEqual(calls, [
    {
      name: "dashboard",
      input: apiInput
    },
    {
      name: "preprocess-jobs",
      input: {
        input: apiInput,
        options: {
          limit: 50,
          offset: 10
        }
      }
    },
    {
      name: "index-versions",
      input: {
        libraryRoot: "/tmp/PublicLibrary",
        options: {
          limit: 7,
          offset: 2
        }
      }
    },
    {
      name: "diagnostic",
      input: {
        libraryRoot: "/tmp/PublicLibrary",
        endpoint: "/api/admin/dashboard/metrics"
      }
    }
  ]);
});

test("slow read route server deps project supervisor status for preprocess jobs", async () => {
  const calls: Array<{ name: string; input: unknown }> = [];
  const deps = createAdminSlowReadRouteServerDeps<
    TestDashboardMetrics,
    TestPreprocessJobs,
    TestSupervisorRuntime,
    TestSupervisor,
    TestIndexVersions
  >({
    async read_dashboard_metrics(input) {
      calls.push({ name: "dashboard", input });
      return {
        data: {
          material: {
            video_count: 10471
          }
        },
        actual_data_source: "admin-read-model",
        cache_status: "hit"
      };
    },
    async read_preprocess_jobs_with_runtime_meta(input, options) {
      calls.push({ name: "preprocess-jobs", input: { input, options } });
      return {
        jobs: {
          active_count: 1,
          jobs: [{ job_id: "J000001" }]
        },
        actual_data_source: "admin-read-model",
        cache_status: "hit",
        component_timings: [{
          name: "runtime_load",
          duration_ms: 7,
          data_source: "runtime-telemetry",
          scan_mode: "no-scan",
          scan_reason: "route-owned-page",
          cache_status: "not-applicable"
        }]
      };
    },
    read_preprocess_supervisor_status() {
      calls.push({ name: "supervisor-runtime", input: null });
      return {
        internal_state: "running",
        temporary_result_count: 7
      };
    },
    to_public_preprocess_supervisor_status(status) {
      calls.push({ name: "supervisor-public", input: status });
      return {
        state: status.internal_state
      };
    },
    async read_index_versions(libraryRoot, options) {
      calls.push({ name: "index-versions", input: { libraryRoot, options } });
      return {
        response: {
          versions: [{ index_version: "v010471" }],
          offset: options.offset,
          limit: options.limit ?? 20
        },
        runtime: {
          actual_data_source: "current-index",
          cache_status: "hit",
          query_strategy: "current-pointer-fast-page"
        }
      };
    }
  });

  const apiInput = {
    library_root: "/tmp/PublicLibrary"
  };
  const preprocessJobs = await deps.read_preprocess_jobs(apiInput, {
    limit: 20,
    offset: 0
  });
  const supervisor = deps.read_preprocess_supervisor_status();

  assert.deepEqual(preprocessJobs, {
    data: {
      active_count: 1,
      jobs: [{ job_id: "J000001" }]
    },
    actual_data_source: "admin-read-model",
    cache_status: "hit",
    component_timings: [{
      name: "runtime_load",
      duration_ms: 7,
      data_source: "runtime-telemetry",
      scan_mode: "no-scan",
      scan_reason: "route-owned-page",
      cache_status: "not-applicable"
    }]
  });
  assert.deepEqual(supervisor, {
    state: "running"
  });
  assert.deepEqual(calls, [
    {
      name: "preprocess-jobs",
      input: {
        input: apiInput,
        options: {
          limit: 20,
          offset: 0
        }
      }
    },
    {
      name: "supervisor-runtime",
      input: null
    },
    {
      name: "supervisor-public",
      input: {
        internal_state: "running",
        temporary_result_count: 7
      }
    }
  ]);
});
