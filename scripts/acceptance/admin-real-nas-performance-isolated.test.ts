import assert from "node:assert/strict";
import test from "node:test";

import {
  buildIsolatedAdminApiEnv,
  buildIsolatedPerformanceReport,
  parseChildJsonStdout,
  renderIsolatedMarkdown
} from "./admin-real-nas-performance-isolated.ts";

function performanceReport(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const highRiskRoute = (input: {
    name: string;
    path: string;
    p95_ms: number;
    components: Record<string, Record<string, unknown>>;
  }): Record<string, unknown> => ({
    name: input.name,
    method: "GET",
    path: input.path,
    phase: "route",
    expected_max_p95_ms: 1000,
    summary: {
      sample_count: 2,
      success_count: 2,
      p95_ms: input.p95_ms,
      passed_target: true,
      runtime: {
        sample_count: 2,
        actual_data_sources: {
          "admin-read-model": 2
        },
        scan_modes: {
          "no-scan": 2
        },
        cache_statuses: {
          hit: 2
        },
        fallback_reasons: {},
        repair_reasons: {},
        slow_runtime_count: 0,
        slow_reasons: {},
        components: input.components
      }
    }
  });

  const component = (name: string, maxMs: number): Record<string, unknown> => ({
    sample_count: 2,
    total_ms: maxMs * 2,
    max_ms: maxMs,
    data_sources: {
      "admin-read-model": 2
    },
    scan_modes: {
      "no-scan": 2
    },
    scan_reasons: {
      "route-owned-page": 2
    },
    cache_statuses: {
      hit: 2
    },
    details: {
      name: 2
    }
  });

  return {
    generated_at: "2026-06-27T07:00:00.000Z",
    environment: {
      auth_mode: "disabled",
      authenticated: true,
      library: {
        root_path: "/Volumes/MixLab/PublicLibrary"
      }
    },
    sample_policy: {
      read_only_probe: true,
      disable_page_time_store_repair: true
    },
    endpoints: [
      highRiskRoute({
        name: "source_videos_processing",
        path: "/api/admin/source-videos?status=processing&limit=20",
        p95_ms: 120,
        components: {
          library_counts: component("library_counts", 20),
          status_store_page: component("status_store_page", 12)
        }
      }),
      highRiskRoute({
        name: "source_videos_index_required",
        path: "/api/admin/source-videos?status=index-required&limit=20",
        p95_ms: 180,
        components: {
          library_counts: component("library_counts", 21),
          status_store_page: component("status_store_page", 15)
        }
      }),
      highRiskRoute({
        name: "preprocess_jobs",
        path: "/api/admin/preprocess/jobs?limit=20",
        p95_ms: 260,
        components: {
          concurrency_policy: component("concurrency_policy", 3),
          library_counts: component("library_counts", 23),
          preprocess_job_page: component("preprocess_job_page", 42),
          runtime_load: component("runtime_load", 11)
        }
      }),
      highRiskRoute({
        name: "index_versions",
        path: "/api/admin/index/versions?limit=8",
        p95_ms: 90,
        components: {
          cache_lookup: component("cache_lookup", 8)
        }
      }),
      {
        name: "dashboard_metrics",
        expected_max_p95_ms: 8000,
        phase: "background",
        summary: {
          sample_count: 3,
          success_count: 3,
          p95_ms: 450,
          passed_target: true,
          runtime: {
            sample_count: 3,
            actual_data_sources: {
              "admin-read-model": 3
            },
            scan_modes: {
              "no-scan": 3
            },
            cache_statuses: {
              hit: 3
            },
            fallback_reasons: {},
            repair_reasons: {},
            slow_runtime_count: 0,
            slow_reasons: {},
            components: {
              usage_metrics: component("usage_metrics", 31),
              dashboard_metrics_cache: component("dashboard_metrics_cache", 0)
            }
          }
        }
      }
    ],
    runtime_component_contracts: [
      {
        endpoint_name: "preprocess_jobs",
        expected_components: ["concurrency_policy", "library_counts", "preprocess_job_page", "runtime_load"],
        observed_components: ["concurrency_policy", "library_counts", "preprocess_job_page", "runtime_load"],
        missing_components: [],
        passed: true
      },
      {
        endpoint_name: "index_versions",
        expected_components: ["cache_lookup"],
        observed_components: ["cache_lookup"],
        missing_components: [],
        passed: true
      }
    ],
    ...overrides
  };
}

test("isolated runner env forces auth-disabled local server without session token", () => {
  const env = buildIsolatedAdminApiEnv({
    base_env: {
      MIXLAB_ADMIN_SESSION_TOKEN: "secret-session",
      MIXLAB_ADMIN_API_PORT: "3889"
    } as NodeJS.ProcessEnv,
    library_root: "/Volumes/MixLab/PublicLibrary",
    port: 3911
  });

  assert.equal(env.MIXLAB_ADMIN_LIBRARY_ROOT, "/Volumes/MixLab/PublicLibrary");
  assert.equal(env.MIXLAB_ADMIN_API_HOST, "127.0.0.1");
  assert.equal(env.MIXLAB_ADMIN_API_PORT, "3911");
  assert.equal(env.MIXLAB_ADMIN_AUTH_MODE, "disabled");
  assert.equal(env.MIXLAB_ADMIN_SESSION_TOKEN, undefined);
});

test("isolated runner parses child JSON stdout", () => {
  assert.deepEqual(parseChildJsonStdout(" {\"ok\":true,\"json_path\":\"report.json\"}\n"), {
    ok: true,
    json_path: "report.json"
  });
  assert.throws(() => parseChildJsonStdout(""), /did not write JSON/);
});

test("isolated runner report passes only when auth, no-repair policy, endpoints, and targets pass", () => {
  const report = buildIsolatedPerformanceReport({
    generated_at: "2026-06-27T07:01:00.000Z",
    command: "tsx scripts/acceptance/admin-real-nas-performance-isolated.ts",
    api_base_url: "http://127.0.0.1:3911",
    expected_library_root: "/Volumes/MixLab/PublicLibrary",
    port: 3911,
    health_wait_ms: 120,
    performance_report: performanceReport(),
    performance_stdout: {
      json_path: "docs/acceptance/artifacts/admin-real-nas-performance-example.json",
      markdown_path: "docs/acceptance/artifacts/admin-real-nas-performance-example.md"
    }
  });

  assert.equal(report.result.status, "passed");
  assert.equal(report.performance_summary.auth_mode, "disabled");
  assert.equal(report.performance_summary.endpoint_count, 5);
  assert.equal(report.performance_summary.runtime_repair_endpoint_count, 0);
  assert.equal(report.performance_summary.runtime_component_contract_failed_count, 0);
  assert.equal(report.performance_summary.high_risk_route_count, 4);
  assert.equal(report.performance_summary.high_risk_route_evidence_failed_count, 0);
  assert.equal(report.performance_summary.background_aggregation_count, 1);
  assert.equal(report.performance_summary.background_aggregation_evidence_failed_count, 0);
  assert.deepEqual(
    report.high_risk_route_runtime_evidence.map((route) => route.endpoint_name),
    ["source_videos_processing", "source_videos_index_required", "preprocess_jobs", "index_versions"]
  );
  assert.equal(report.high_risk_route_runtime_evidence.every((route) => route.evidence_complete), true);
  assert.equal(report.background_aggregation_runtime_evidence[0]?.endpoint_name, "dashboard_metrics");
  assert.equal(report.background_aggregation_runtime_evidence[0]?.evidence_complete, true);
  assert.deepEqual(
    report.background_aggregation_runtime_evidence[0]?.components.map((component) => component.name),
    ["usage_metrics", "dashboard_metrics_cache"]
  );
  assert.deepEqual(report.high_risk_route_runtime_evidence[0]?.scan_modes, {
    "no-scan": 2
  });
  assert.equal(report.gates.every((gate) => gate.passed), true);

  const markdown = renderIsolatedMarkdown(report);
  assert.match(markdown, /isolated-auth-disabled/);
  assert.match(markdown, /Disable page-time store repair: `true`/);
  assert.match(markdown, /Runtime component contract failures: `0`/);
  assert.match(markdown, /## High-Risk Route Runtime Evidence/);
  assert.match(markdown, /## Background Aggregation Runtime Evidence/);
  assert.match(markdown, /source_videos_index_required/);
  assert.match(markdown, /dashboard_metrics/);
  assert.match(markdown, /no-scan=2/);
  assert.match(markdown, /usage_metrics max 31\.0ms/);
  assert.match(markdown, /status_store_page max 15\.0ms/);
});

test("isolated runner report fails when protected sampling is not clean", () => {
  const report = buildIsolatedPerformanceReport({
    generated_at: "2026-06-27T07:02:00.000Z",
    command: "tsx scripts/acceptance/admin-real-nas-performance-isolated.ts",
    api_base_url: "http://127.0.0.1:3911",
    expected_library_root: "/Volumes/MixLab/PublicLibrary",
    port: 3911,
    health_wait_ms: 120,
    performance_report: performanceReport({
      environment: {
        auth_mode: "password",
        authenticated: false,
        library: {
          root_path: "/tmp/not-real"
        }
      },
      sample_policy: {
        read_only_probe: false,
        disable_page_time_store_repair: false
      },
      endpoints: [
        {
          name: "source_videos_processing",
          expected_max_p95_ms: 1000,
          summary: {
            sample_count: 2,
            success_count: 1,
            p95_ms: 2200,
            passed_target: false,
            runtime: {
              repair_reasons: {
                "status-store:repaired-incomplete-manifest-rows": 1
              }
            }
          }
        }
      ],
      runtime_component_contracts: [
        {
          endpoint_name: "preprocess_jobs",
          expected_components: ["concurrency_policy"],
          observed_components: [],
          missing_components: ["concurrency_policy"],
          passed: false
        }
      ]
    }),
    performance_stdout: {
      json_path: "report.json",
      markdown_path: "report.md"
    }
  });

  assert.equal(report.result.status, "failed");
  assert.deepEqual(
    report.gates.filter((gate) => !gate.passed).map((gate) => gate.name),
    [
      "isolated-auth-disabled",
      "library-root-match",
      "no-repair-sample-policy",
      "no-runtime-repair-samples",
      "required-runtime-components-present",
      "high-risk-route-runtime-evidence-complete",
      "background-aggregation-runtime-evidence-complete",
      "all-endpoint-samples-succeeded",
      "performance-targets-met"
    ]
  );
});
