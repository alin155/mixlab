import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInvariantChecks,
  buildPreflightChecks,
  renderMarkdown
} from "./admin-read-model-reconcile.ts";

function sampleLibraryStatus(overrides: Record<string, unknown> = {}) {
  return {
    root_path: "/Volumes/MixLab/PublicLibrary",
    updated_at: "2026-06-25T19:07:13.162Z",
    video_count: 11394,
    ready_video_count: 10471,
    queued_video_count: 904,
    processing_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 19,
    disk_available_bytes: 1024 * 1024 * 1024 * 8,
    ...overrides
  };
}

function sampleReadModelStatus(overrides: Record<string, unknown> = {}) {
  return {
    admin_read_model: {
      freshness: "missing",
      exists: false,
      video_count: 0,
      reconciliation: {
        action: "build",
        reason: "missing_store",
        scan_mode: "full-reconcile",
        requires_background_reconcile: true,
        safe_for_page_request: false
      }
    },
    source_video_status: {
      freshness: "fresh",
      persisted: "fresh"
    },
    ...overrides
  };
}

function readyProjection(videoCount = 11394) {
  return {
    status: "ready",
    reason: "ready",
    scan_mode: "no-scan",
    requires_background_reconcile: false,
    safe_for_page_request: true,
    video_count: videoCount,
    current_video_count: videoCount
  };
}

function freshReadModelWithProjections(overrides: Record<string, unknown> = {}) {
  return sampleReadModelStatus({
    admin_read_model: {
      freshness: "fresh",
      exists: true,
      video_count: 11394,
      counts_by_status: {
        ready: 10471,
        queued: 904,
        processing: 0,
        failed: 0,
        "index-required": 19
      },
      reconciliation: {
        action: "none",
        reason: "fresh",
        scan_mode: "no-scan",
        requires_background_reconcile: false,
        safe_for_page_request: true
      },
      projections: {
        material_summary: readyProjection(),
        production_summary: readyProjection(),
        process_history: readyProjection()
      },
      ...overrides
    }
  });
}

test("admin read-model reconcile preflight accepts a missing generated store with a fresh JSON model", () => {
  const checks = buildPreflightChecks({
    expected_library_root: "/Volumes/MixLab/PublicLibrary",
    library_status: sampleLibraryStatus(),
    read_model_status: sampleReadModelStatus(),
    reconcile_status: { status: "idle", phase: "idle" },
    min_disk_available_bytes: 1024
  });

  assert.equal(checks.every((check) => check.passed), true);
});

test("admin read-model reconcile preflight blocks unsafe runtime state", () => {
  const checks = buildPreflightChecks({
    expected_library_root: "/Volumes/MixLab/PublicLibrary",
    library_status: sampleLibraryStatus({
      root_path: "/tmp/not-real-nas",
      disk_available_bytes: 10
    }),
    read_model_status: sampleReadModelStatus({
      admin_read_model: {
        freshness: "unreadable",
        exists: true,
        reconciliation: {
          action: "manual-review",
          reason: "unreadable_store",
          scan_mode: "full-reconcile",
          requires_background_reconcile: false,
          safe_for_page_request: false
        }
      },
      source_video_status: {
        freshness: "stale",
        persisted: "stale"
      }
    }),
    reconcile_status: { status: "running", phase: "scanning" },
    min_disk_available_bytes: 1024
  });
  const failures = checks.filter((check) => !check.passed).map((check) => check.name);

  assert.deepEqual(failures, [
    "library-root",
    "disk-available",
    "source-video-status-fresh",
    "reconcile-not-running",
    "reconcile-action-safe",
    "no-manual-review"
  ]);
});

test("admin read-model reconcile invariants require dashboard projections to be ready after apply", () => {
  const passed = buildInvariantChecks({
    before_library_status: sampleLibraryStatus(),
    after_library_status: sampleLibraryStatus(),
    before_read_model_status: sampleReadModelStatus(),
    after_read_model_status: freshReadModelWithProjections(),
    action_started: true,
    terminal_status: "succeeded"
  });
  const failed = buildInvariantChecks({
    before_library_status: sampleLibraryStatus(),
    after_library_status: sampleLibraryStatus(),
    before_read_model_status: sampleReadModelStatus(),
    after_read_model_status: freshReadModelWithProjections({
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
        production_summary: readyProjection(),
        process_history: readyProjection()
      }
    }),
    action_started: true,
    terminal_status: "succeeded"
  });

  assert.equal(passed.every((check) => check.passed), true);
  assert.equal(
    failed.find((check) => check.name === "dashboard-material-projection-ready")?.passed,
    false
  );
  assert.equal(
    failed.find((check) => check.name === "dashboard-production-projection-ready")?.passed,
    true
  );
  assert.equal(
    failed.find((check) => check.name === "process-history-projection-ready")?.passed,
    true
  );
});

test("admin read-model reconcile markdown records generated-metadata scope and invariants", () => {
  const markdown = renderMarkdown({
    schema_version: "1.0",
    generated_at: "2026-06-25T23:20:00.000Z",
    command: "tsx scripts/acceptance/admin-read-model-reconcile.ts",
    mode: "apply",
    api_base_url: "http://127.0.0.1:3891",
    expected_library_root: "/Volumes/MixLab/PublicLibrary",
    allow_reconcile: true,
    force_reconcile: false,
    preflight: {
      passed: true,
      checks: [{ name: "library-root", passed: true, detail: "root_path=/Volumes/MixLab/PublicLibrary" }]
    },
    before: {
      library_status: sampleLibraryStatus(),
      read_model_status: sampleReadModelStatus(),
      reconcile_status: { status: "idle", phase: "idle" }
    },
    action: {
      started: true,
      accepted: true,
      terminal_status: "succeeded",
      terminal_phase: "completed",
      poll_count: 3,
      duration_ms: 2200,
      start_response: {},
      terminal_response: {}
    },
    after: {
      library_status: sampleLibraryStatus(),
      read_model_status: freshReadModelWithProjections(),
      operation_log: {},
      probes: [{
        name: "source_videos_index_required",
        request: {
          method: "GET",
          path: "/api/admin/source-videos?status=index-required&limit=20",
          duration_ms: 2,
          http_status: 200,
          ok: true,
          api_ok: true,
          response_bytes: 128,
          data: []
        }
      }, {
        name: "process_history_readiness",
        request: {
          method: "GET",
          path: "/api/admin/preprocess/process-history/readiness",
          duration_ms: 2,
          http_status: 200,
          ok: true,
          api_ok: true,
          response_bytes: 128,
          data: {
            ready_for_process_history: true,
            reason: "ready"
          }
        }
      }, {
        name: "process_history",
        request: {
          method: "GET",
          path: "/api/admin/preprocess/process-history?limit=20&window_days=30",
          duration_ms: 2,
          http_status: 200,
          ok: true,
          api_ok: true,
          response_bytes: 128,
          data: {
            history_available: true,
            actual_data_source: "admin-read-model",
            scan_mode: "no-scan"
          }
        }
      }]
    },
    invariants: [
      { name: "library-ready-count-unchanged", passed: true, detail: "before=10471, after=10471" },
      { name: "current-index-version-unchanged", passed: true, detail: "before=v010471, after=v010471" },
      { name: "admin-read-model-safe-for-page", passed: true, detail: "safe_for_page_request=true" },
      { name: "dashboard-material-projection-ready", passed: true, detail: "status=ready, reason=ready" },
      { name: "dashboard-production-projection-ready", passed: true, detail: "status=ready, reason=ready" },
      { name: "process-history-projection-ready", passed: true, detail: "status=ready, reason=ready" },
      { name: "process-history-readiness-ready", passed: true, detail: "ready=true, reason=ready" },
      { name: "process-history-no-scan-hit", passed: true, detail: "history_available=true, source=admin-read-model, scan_mode=no-scan" }
    ],
    result: {
      passed: true,
      status: "passed",
      summary: "admin.sqlite reconcile completed and post-run invariants passed."
    }
  });

  assert.match(markdown, /generated read-model metadata/);
  assert.match(markdown, /library-ready-count-unchanged/);
  assert.match(markdown, /current-index-version-unchanged/);
  assert.match(markdown, /safe for page request: `true`/);
  assert.match(markdown, /material projection: status `ready`/);
  assert.match(markdown, /dashboard-material-projection-ready/);
  assert.match(markdown, /process-history-readiness-ready/);
  assert.match(markdown, /process_history_readiness/);
  assert.match(markdown, /source_videos_index_required/);
});
