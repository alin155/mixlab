import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGateChecks,
  buildProbeDefinitions,
  buildReport,
  renderMarkdown,
  type ProbeResult
} from "./admin-read-model-rebuild-plan.ts";

function probeResult(input: {
  name: ProbeResult["name"];
  path: string;
  data: unknown;
  ok?: boolean;
}): ProbeResult {
  return {
    name: input.name,
    method: "GET",
    path: input.path,
    duration_ms: 10,
    http_status: input.ok === false ? 500 : 200,
    ok: input.ok !== false,
    api_ok: input.ok === false ? false : true,
    response_bytes: 128,
    data: input.data,
    error_code: input.ok === false ? "failed" : undefined
  };
}

function sampleRequests(overrides: {
  library?: Record<string, unknown>;
  readModel?: Record<string, unknown>;
  readiness?: Record<string, unknown>;
  reconcile?: Record<string, unknown>;
  history?: Record<string, unknown>;
} = {}): ProbeResult[] {
  return [
    probeResult({
      name: "auth_status",
      path: "/api/admin/auth/status",
      data: {
        auth_mode: "disabled",
        authenticated: true
      }
    }),
    probeResult({
      name: "library_status",
      path: "/api/admin/library/status",
      data: {
        root_path: "/Volumes/MixLab/PublicLibrary",
        updated_at: "2026-06-25T19:07:13.162Z",
        current_index_version: "v010471",
        video_count: 11394,
        ready_video_count: 10471,
        queued_video_count: 903,
        processing_video_count: 1,
        failed_video_count: 0,
        index_required_video_count: 19,
        disk_available_bytes: 1024 * 1024 * 1024 * 8,
        disk_total_bytes: 1024 * 1024 * 1024 * 100,
        ...overrides.library
      }
    }),
    probeResult({
      name: "read_model_status",
      path: "/api/admin/read-model/status",
      data: {
        admin_read_model: {
          storage: "sqlite",
          exists: true,
          freshness: "fresh",
          video_count: 11394,
          path: "/Volumes/MixLab/PublicLibrary/.mixlab-library/admin-read-model/admin.sqlite",
          reconciliation: {
            action: "none",
            reason: "fresh",
            scan_mode: "no-scan",
            safe_for_page_request: true
          },
          projections: {
            material_summary: {
              status: "ready",
              reason: "ready",
              scan_mode: "no-scan",
              requires_background_reconcile: false,
              safe_for_page_request: true,
              video_count: 11394,
              current_video_count: 11394
            },
            production_summary: {
              status: "ready",
              reason: "ready",
              scan_mode: "no-scan",
              requires_background_reconcile: false,
              safe_for_page_request: true,
              video_count: 11394,
              current_video_count: 11394
            },
            process_history: {
              status: "ready",
              reason: "ready",
              scan_mode: "no-scan",
              requires_background_reconcile: false,
              safe_for_page_request: true,
              video_count: 11394,
              current_video_count: 11394
            }
          },
          ...overrides.readModel
        }
      }
    }),
    probeResult({
      name: "reconcile_status",
      path: "/api/admin/read-model/reconcile/status",
      data: {
        status: "idle",
        phase: "idle",
        ...overrides.reconcile
      }
    }),
    probeResult({
      name: "process_history_readiness",
      path: "/api/admin/preprocess/process-history/readiness",
      data: {
        ready_for_process_history: false,
        reason: "store_unreadable",
        last_error: "no such table: preprocess_job_status",
        actual_data_source: "admin-read-model",
        scan_mode: "no-scan",
        expected_job_snapshot_rows: 11394,
        snapshot_complete: false,
        snapshot_metadata_row_count: null,
        snapshot_table_row_count: null,
        projection_complete: false,
        projection_metadata_row_count: null,
        projection_table_row_count: null,
        projection_row_count_matches: false,
        ...overrides.readiness
      }
    }),
    probeResult({
      name: "process_history",
      path: "/api/admin/preprocess/process-history?limit=20&window_days=30",
      data: {
        history_available: false,
        actual_data_source: "admin-read-model",
        cache_status: "miss",
        scan_mode: "no-scan",
        summary: {
          returned_count: 0
        },
        ...overrides.history
      }
    })
  ];
}

test("admin read-model rebuild plan probes are GET-only and exclude command endpoints", () => {
  const probes = buildProbeDefinitions();
  assert.equal(probes.every((probe) => probe.method === "GET"), true);
  assert.deepEqual(
    probes.map((probe) => probe.path),
    [
      "/api/admin/auth/status",
      "/api/admin/library/status",
      "/api/admin/read-model/status",
      "/api/admin/read-model/reconcile/status",
      "/api/admin/preprocess/process-history/readiness",
      "/api/admin/preprocess/process-history?limit=20&window_days=30"
    ]
  );
  assert.doesNotMatch(
    probes.map((probe) => probe.path).join("\n"),
    /\/read-model\/reconcile$|\/scan|\/apply|\/publish|\/repair|\/queue|\/retry|\/cancel/
  );
});

test("admin read-model rebuild plan records derived-only mutation scope", () => {
  const report = buildReport({
    generated_at: "2026-06-26T11:00:00.000Z",
    api_base_url: "http://127.0.0.1:3892",
    expected_library_root: "/Volumes/MixLab/PublicLibrary",
    min_disk_available_bytes: 1024,
    requests: sampleRequests()
  });

  assert.equal(report.result.passed, true);
  assert.equal(report.mode, "plan-only");
  assert.equal(report.rebuild_plan.needed, true);
  assert.equal(report.rebuild_plan.planned_action, "force-rebuild-derived-admin-read-model");
  assert.equal(report.rebuild_plan.runner, "scripts/acceptance/admin-read-model-reconcile.ts");
  assert.equal(
    report.rebuild_plan.allowed_mutation_paths.some((targetPath) =>
      targetPath.includes("/.mixlab-library/admin-read-model")
    ),
    true
  );
  assert.equal(
    report.rebuild_plan.allowed_mutation_paths.some((targetPath) =>
      targetPath.includes("/.mixlab-library/admin/operation-log/events.ndjson")
    ),
    true
  );
  assert.equal(
    report.rebuild_plan.forbidden_effects.some((effect) =>
      effect.includes("Do not modify source-video manifests")
    ),
    true
  );
  assert.equal(
    report.rebuild_plan.required_environment.MIXLAB_ADMIN_READ_MODEL_EXPECT_ROOT,
    "/Volumes/MixLab/PublicLibrary"
  );
  assert.equal(report.rebuild_plan.required_environment.MIXLAB_ADMIN_READ_MODEL_RECONCILE_ALLOW, "true");
  assert.equal(report.rebuild_plan.required_environment.MIXLAB_ADMIN_READ_MODEL_RECONCILE_FORCE, "true");
});

test("admin read-model rebuild plan treats missing dashboard projections as rebuild-needed", () => {
  const report = buildReport({
    generated_at: "2026-06-27T10:45:00.000Z",
    api_base_url: "http://127.0.0.1:3889",
    expected_library_root: "/Volumes/MixLab/PublicLibrary",
    min_disk_available_bytes: 1024,
    requests: sampleRequests({
      readModel: {
        projections: {
          material_summary: {
            status: "missing",
            reason: "missing_metadata",
            scan_mode: "full-reconcile",
            requires_background_reconcile: true,
            safe_for_page_request: true,
            video_count: 0,
            current_video_count: 11394
          },
          production_summary: {
            status: "ready",
            reason: "ready",
            scan_mode: "no-scan",
            requires_background_reconcile: false,
            safe_for_page_request: true,
            video_count: 11394,
            current_video_count: 11394
          },
          process_history: {
            status: "ready",
            reason: "ready",
            scan_mode: "no-scan",
            requires_background_reconcile: false,
            safe_for_page_request: true,
            video_count: 11394,
            current_video_count: 11394
          }
        }
      },
      readiness: {
        ready_for_process_history: true,
        reason: "ready",
        last_error: "",
        expected_job_snapshot_rows: 11394,
        snapshot_complete: true,
        snapshot_metadata_row_count: 11394,
        snapshot_table_row_count: 11394,
        projection_complete: true,
        projection_metadata_row_count: 11394,
        projection_table_row_count: 11394,
        projection_row_count_matches: true
      },
      history: {
        history_available: true,
        cache_status: "hit",
        summary: {
          returned_count: 20
        }
      }
    })
  });
  const markdown = renderMarkdown(report);

  assert.equal(report.result.passed, true);
  assert.equal(report.rebuild_plan.needed, true);
  assert.equal(report.rebuild_plan.planned_action, "force-rebuild-derived-admin-read-model");
  assert.match(report.rebuild_plan.reason, /projection_incomplete:material_summary:missing_metadata/);
  assert.equal(report.environment.admin_read_model.projections.material_summary.status, "missing");
  assert.equal(
    report.rebuild_plan.required_environment.MIXLAB_ADMIN_READ_MODEL_RECONCILE_FORCE,
    "true"
  );
  assert.match(markdown, /Read Model Projection Readiness/);
  assert.match(markdown, /material_summary \| missing \| missing_metadata/);
  assert.match(markdown, /dashboard material, dashboard production, and process-history projections become ready/);
});

test("admin read-model rebuild plan gates block wrong root, low disk, and running reconcile", () => {
  const requests = sampleRequests({
    library: {
      root_path: "/tmp/PublicLibrary",
      disk_available_bytes: 10
    },
    reconcile: {
      status: "running",
      phase: "snapshot"
    }
  });
  const report = buildReport({
    generated_at: "2026-06-26T11:00:00.000Z",
    api_base_url: "http://127.0.0.1:3892",
    expected_library_root: "/Volumes/MixLab/PublicLibrary",
    min_disk_available_bytes: 1024,
    requests
  });
  const failed = buildGateChecks({
    expected_library_root: "/Volumes/MixLab/PublicLibrary",
    min_disk_available_bytes: 1024,
    requests,
    environment: report.environment,
    reconcile_status: report.reconcile_status,
    readiness: report.process_history_readiness,
    current_history: report.current_process_history,
    rebuild_plan: report.rebuild_plan
  }).filter((check) => !check.passed);

  assert.deepEqual(failed.map((check) => check.name), [
    "library-root",
    "disk-available",
    "reconcile-not-running"
  ]);
});

test("admin read-model rebuild plan markdown states plan-only scope and invariants", () => {
  const report = buildReport({
    generated_at: "2026-06-26T11:00:00.000Z",
    api_base_url: "http://127.0.0.1:3892",
    expected_library_root: "/Volumes/MixLab/PublicLibrary",
    min_disk_available_bytes: 1024,
    requests: sampleRequests()
  });
  const markdown = renderMarkdown(report);

  assert.match(markdown, /plan-only gate/);
  assert.match(markdown, /does not start reconcile, scan, apply, repair, publish, rebuild, Docker upload/);
  assert.match(markdown, /Allowed mutation paths/);
  assert.match(markdown, /\.mixlab-library\/admin-read-model/);
  assert.match(markdown, /\.mixlab-library\/admin\/operation-log\/events\.ndjson/);
  assert.match(markdown, /Do not modify source-video manifests/);
  assert.match(markdown, /library.ready_video_count stays unchanged/);
  assert.match(markdown, /MIXLAB_ADMIN_READ_MODEL_RECONCILE_FORCE=true/);
});
