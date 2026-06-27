import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_READ_ONLY_PROBE_HEADER,
  adminReadOnlyProbeHeaders,
  buildRuntimeComponentContracts,
  endpointProbes,
  requiredRuntimeComponentContracts,
  renderMarkdown
} from "./admin-real-nas-performance.ts";

test("admin real NAS performance probe keeps read-model control surface read-only", () => {
  assert.equal(endpointProbes.every((endpoint) => endpoint.method === "GET"), true);
  assert.deepEqual(adminReadOnlyProbeHeaders("session-1"), {
    accept: "application/json",
    [ADMIN_READ_ONLY_PROBE_HEADER]: "true",
    "X-MixLab-Admin-Session-Token": "session-1"
  });

  const probes = new Map(endpointProbes.map((endpoint) => [endpoint.name, endpoint]));
  assert.equal(
    probes.get("read_model_reconcile_status")?.path,
    "/api/admin/read-model/reconcile/status"
  );
  assert.equal(
    probes.get("read_model_reconcile_status")?.notes.includes("does not start or cancel reconcile"),
    true
  );
  assert.equal(probes.get("operations_overview")?.path, "/api/admin/operations/overview");
  assert.equal(probes.get("operation_log")?.path, "/api/admin/operation-log?limit=20");
});

test("admin real NAS performance markdown reports read-model page-safety fields", () => {
  const markdown = renderMarkdown({
    generated_at: "2026-06-25T20:00:00.000Z",
    command: "tsx scripts/acceptance/admin-real-nas-performance.ts",
    environment: {
      api_base_url: "http://127.0.0.1:3889",
      auth_mode: "disabled",
      authenticated: true,
      library: {
        root_path: "/Volumes/MixLab/PublicLibrary",
        source_videos_path: "/Volumes/MixLab/PublicLibrary/source-videos",
        current_index_version: "v010471",
        updated_at: "2026-06-25T19:59:00.000Z",
        video_count: 10471,
        ready_video_count: 10471,
        processing_video_count: 0,
        queued_video_count: 0,
        failed_video_count: 0,
        index_required_video_count: 0,
        disk_total_bytes: 1000,
        disk_available_bytes: 100
      },
      read_model_before: {},
      read_model_after: {
        admin_read_model: {
          storage: "sqlite",
          freshness: "fresh",
          exists: true,
          video_count: 10471,
          projections: {
            material_summary: {
              status: "missing",
              reason: "missing_metadata",
              scan_mode: "full-reconcile",
              requires_background_reconcile: true,
              safe_for_page_request: true,
              video_count: 0,
              current_video_count: 10471
            },
            production_summary: {
              status: "ready",
              reason: "ready",
              scan_mode: "no-scan",
              requires_background_reconcile: false,
              safe_for_page_request: true,
              video_count: 10471,
              current_video_count: 10471
            },
            process_history: {
              status: "ready",
              reason: "ready",
              scan_mode: "no-scan",
              requires_background_reconcile: false,
              safe_for_page_request: true,
              video_count: 10471,
              current_video_count: 10471
            }
          },
          reconciliation: {
            action: "none",
            reason: "fresh",
            scan_mode: "no-scan",
            requires_background_reconcile: false,
            safe_for_page_request: true
          }
        },
        source_video_status: {
          freshness: "fresh",
          persisted: "fresh"
        }
      }
    },
    notes: [
      "All endpoint probes use GET requests only.",
      "The probe checks read-model reconcile status but never starts, cancels, applies, repairs or publishes any command."
    ],
    endpoints: [{
      name: "read_model_reconcile_status",
      method: "GET",
      path: "/api/admin/read-model/reconcile/status",
      phase: "diagnostic",
      expected_max_p95_ms: 1000,
      timeout_ms: 5000,
      notes: "Read-only background reconciler status.",
      samples: [{
        label: "cold",
        sample_index: 0,
        duration_ms: 12.3,
        http_status: 200,
        ok: true,
        api_ok: true,
        response_bytes: 128
      }],
      summary: {
        sample_count: 1,
        success_count: 1,
        min_ms: 12.3,
        p50_ms: 12.3,
        p95_ms: 12.3,
        max_ms: 12.3,
        response_bytes_max: 128,
        passed_target: true,
        runtime: {
          sample_count: 1,
          missing_runtime_count: 0,
          actual_data_sources: {
            "admin-read-model": 1
          },
          cache_statuses: {
            hit: 1
          },
          fallback_reasons: {},
          repair_reasons: {
            "status-store:repaired-incomplete-manifest-rows": 1
          },
          slow_runtime_count: 0,
          slow_reasons: {},
          components: {
            usage_metrics: {
              sample_count: 1,
              total_ms: 42,
              max_ms: 42,
              data_sources: {
                "admin-read-model": 1
              },
              scan_modes: {
                "no-scan": 1
              },
              scan_reasons: {
                "route-owned-page": 1
              },
              cache_statuses: {
                hit: 1
              },
              details: {}
            }
          }
        }
      }
    }]
  });

  assert.match(markdown, /## Read Model Control Surface/);
  assert.match(markdown, /## Read Model Projection Readiness/);
  assert.match(markdown, /material_summary \| missing \| missing_metadata \| full-reconcile/);
  assert.match(markdown, /production_summary \| ready \| ready \| no-scan/);
  assert.match(markdown, /process_history \| ready \| ready \| no-scan/);
  assert.match(markdown, /## Runtime Source Summary/);
  assert.match(markdown, /## Runtime Component Timing Summary/);
  assert.match(markdown, /Admin read model storage: `sqlite`/);
  assert.match(markdown, /scan mode `no-scan`/);
  assert.match(markdown, /safe for page request `true`/);
  assert.match(markdown, /admin-read-model=1/);
  assert.match(markdown, /no-scan=1/);
  assert.match(markdown, /usage_metrics/);
  assert.match(markdown, /42\.0ms/);
  assert.match(markdown, /status-store:repaired-incomplete-manifest-rows=1/);
  assert.match(markdown, /never starts, cancels, applies, repairs or publishes/);
});

test("admin real NAS performance probe gates required runtime components", () => {
  function sourceVideosEndpoint(name: string) {
    return {
      name,
      method: "GET" as const,
      path: "/api/admin/source-videos?status=queued&limit=20",
      phase: "route" as const,
      expected_max_p95_ms: 1000,
      timeout_ms: 15000,
      notes: "Source videos",
      samples: [],
      summary: {
        sample_count: 1,
        success_count: 1,
        min_ms: 10,
        p50_ms: 10,
        p95_ms: 10,
        max_ms: 10,
        response_bytes_max: 100,
        passed_target: true,
        runtime: {
          sample_count: 1,
          missing_runtime_count: 0,
          actual_data_sources: {},
          cache_statuses: {},
          fallback_reasons: {},
          repair_reasons: {},
          slow_runtime_count: 0,
          slow_reasons: {},
          components: {
            library_counts: {
              sample_count: 1,
              total_ms: 1,
              max_ms: 1,
              data_sources: {},
              scan_modes: {},
              scan_reasons: {},
              cache_statuses: {},
              details: {}
            },
            status_store_page: {
              sample_count: 1,
              total_ms: 1,
              max_ms: 1,
              data_sources: {},
              scan_modes: {},
              scan_reasons: {},
              cache_statuses: {},
              details: {}
            }
          }
        }
      }
    };
  }

  const contracts = buildRuntimeComponentContracts([
    sourceVideosEndpoint("source_videos_processing"),
    sourceVideosEndpoint("source_videos_index_required"),
    sourceVideosEndpoint("source_videos_queued"),
    {
      name: "preprocess_jobs",
      method: "GET",
      path: "/api/admin/preprocess/jobs?limit=20",
      phase: "route",
      expected_max_p95_ms: 1000,
      timeout_ms: 15000,
      notes: "Preprocess jobs",
      samples: [],
      summary: {
        sample_count: 1,
        success_count: 1,
        min_ms: 10,
        p50_ms: 10,
        p95_ms: 10,
        max_ms: 10,
        response_bytes_max: 100,
        passed_target: true,
        runtime: {
          sample_count: 1,
          missing_runtime_count: 0,
          actual_data_sources: {},
          cache_statuses: {},
          fallback_reasons: {},
          repair_reasons: {},
          slow_runtime_count: 0,
          slow_reasons: {},
          components: {
            concurrency_policy: {
              sample_count: 1,
              total_ms: 1,
              max_ms: 1,
              data_sources: {},
              scan_modes: {},
              scan_reasons: {},
              cache_statuses: {},
              details: {}
            },
            library_counts: {
              sample_count: 1,
              total_ms: 1,
              max_ms: 1,
              data_sources: {},
              scan_modes: {},
              scan_reasons: {},
              cache_statuses: {},
              details: {}
            },
            preprocess_job_page: {
              sample_count: 1,
              total_ms: 1,
              max_ms: 1,
              data_sources: {},
              scan_modes: {},
              scan_reasons: {},
              cache_statuses: {},
              details: {}
            },
            runtime_load: {
              sample_count: 1,
              total_ms: 1,
              max_ms: 1,
              data_sources: {},
              scan_modes: {},
              scan_reasons: {},
              cache_statuses: {},
              details: {}
            }
          }
        }
      }
    },
    {
      name: "index_versions",
      method: "GET",
      path: "/api/admin/index/versions?limit=8",
      phase: "route",
      expected_max_p95_ms: 1000,
      timeout_ms: 15000,
      notes: "Index versions",
      samples: [],
      summary: {
        sample_count: 1,
        success_count: 1,
        min_ms: 10,
        p50_ms: 10,
        p95_ms: 10,
        max_ms: 10,
        response_bytes_max: 100,
        passed_target: true,
        runtime: {
          sample_count: 1,
          missing_runtime_count: 0,
          actual_data_sources: {},
          cache_statuses: {},
          fallback_reasons: {},
          repair_reasons: {},
          slow_runtime_count: 0,
          slow_reasons: {},
          components: {
            cache_lookup: {
              sample_count: 1,
              total_ms: 0,
              max_ms: 0,
              data_sources: {},
              scan_modes: {},
              scan_reasons: {},
              cache_statuses: {},
              details: {}
            }
          }
        }
      }
    }
  ]);

  assert.deepEqual(contracts.map((contract) => contract.passed), [true, true, true, true, true]);
  assert.deepEqual(requiredRuntimeComponentContracts.map((contract) => contract.endpoint_name), [
    "source_videos_processing",
    "source_videos_index_required",
    "source_videos_queued",
    "preprocess_jobs",
    "index_versions"
  ]);

  const missing = buildRuntimeComponentContracts([]);
  assert.deepEqual(missing.map((contract) => contract.passed), [false, false, false, false, false]);
  assert.deepEqual(missing[0]?.missing_components, [
    "library_counts",
    "status_store_page"
  ]);
  assert.deepEqual(missing[3]?.missing_components, [
    "concurrency_policy",
    "library_counts",
    "preprocess_job_page",
    "runtime_load"
  ]);
});
