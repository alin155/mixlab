import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGateChecks,
  buildProbeDefinitions,
  buildReport,
  renderMarkdown,
  type ProbeResult
} from "./admin-command-restore-drill-plan.ts";

const SNAPSHOT_ID = "fixture-source-video-metadata-snapshot";

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

function dataLoadingPlan(): Record<string, unknown> {
  return {
    endpoints: [
      {
        endpoint: "/api/admin/command-snapshots/:snapshot_id/restore-plan",
        method: "GET",
        phase: "command",
        scan_mode: "no-scan",
        data_source: "command-snapshot",
        refresh: "command-only"
      },
      {
        endpoint: "/api/admin/command-snapshots/:snapshot_id/restore",
        method: "POST",
        phase: "command",
        scan_mode: "no-scan",
        data_source: "command-snapshot",
        refresh: "command-only"
      }
    ]
  };
}

function operationLogSnapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: "1.0",
    event_id: "evt-restore-candidate",
    occurred_at: "2026-06-26T18:00:00.000Z",
    area: "protection",
    action: "source-video-metadata",
    event_type: "succeeded",
    message: "Admin command source-video-metadata succeeded.",
    details: {
      command: "source-video-metadata",
      holder: "admin-api:source-video-metadata",
      command_snapshot: {
        created: true,
        snapshot_id: SNAPSHOT_ID,
        snapshot_kind: "file-capture",
        rollback_status: "not-implemented",
        manifest_relative_path:
          ".mixlab-library/admin/command-snapshots/20260626180000-source-video-metadata/snapshot.json",
        captured_file_count: 1,
        missing_file_count: 0,
        skipped_file_count: 0,
        failed_file_count: 0,
        ...overrides
      }
    }
  };
}

function restorePlan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: "1.0",
    generated_at: "2026-06-26T18:01:00.000Z",
    can_restore: true,
    command: "source-video-metadata",
    snapshot_id: SNAPSHOT_ID,
    snapshot_kind: "file-capture",
    file_count: 1,
    restorable_file_count: 1,
    blocked_file_count: 0,
    blockers: [],
    files: [
      {
        label: "source-video-V000042-manifest",
        can_restore: true,
        status: "restorable",
        target_status: "exists",
        snapshot_status: "exists",
        source_relative_path: ".mixlab-library/videos/V000042/source-video.json"
      }
    ],
    ...overrides
  };
}

function sampleRequests(overrides: {
  library?: Record<string, unknown>;
  operationSnapshot?: Record<string, unknown>;
  restore?: Record<string, unknown>;
  operationEvents?: unknown[];
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
        ...overrides.library
      }
    }),
    probeResult({
      name: "data_loading_plan",
      path: "/api/admin/data-loading/plan",
      data: dataLoadingPlan()
    }),
    probeResult({
      name: "operation_log",
      path: "/api/admin/operation-log?limit=100",
      data: {
        schema_version: "1.0",
        events: overrides.operationEvents ?? [
          operationLogSnapshot(overrides.operationSnapshot)
        ]
      }
    }),
    probeResult({
      name: "restore_plan",
      path: `/api/admin/command-snapshots/${SNAPSHOT_ID}/restore-plan`,
      data: restorePlan(overrides.restore)
    })
  ];
}

test("restore drill plan probes are GET-only and never include restore execution", () => {
  const probes = buildProbeDefinitions({
    snapshot_id: SNAPSHOT_ID,
    operation_log_limit: 100
  });

  assert.equal(probes.every((probe) => probe.method === "GET"), true);
  assert.deepEqual(
    probes.map((probe) => probe.path),
    [
      "/api/admin/auth/status",
      "/api/admin/library/status",
      "/api/admin/data-loading/plan",
      "/api/admin/operation-log?limit=100",
      `/api/admin/command-snapshots/${SNAPSHOT_ID}/restore-plan`
    ]
  );
  assert.doesNotMatch(
    probes.map((probe) => probe.path).join("\n"),
    /\/command-snapshots\/[^/]+\/restore$|\/scan|\/apply|\/publish|\/repair|\/queue|\/retry|\/cancel|\/reconcile/
  );
});

test("restore drill plan passes for a bounded file-capture snapshot with a clean restore plan", () => {
  const report = buildReport({
    generated_at: "2026-06-26T18:02:00.000Z",
    api_base_url: "http://127.0.0.1:3892",
    expected_library_root: "/Volumes/MixLab/PublicLibrary",
    snapshot_id: SNAPSHOT_ID,
    operation_log_limit: 100,
    max_file_count: 10,
    requests: sampleRequests()
  });

  assert.equal(report.result.passed, true);
  assert.equal(report.mode, "plan-only");
  assert.equal(report.restore_drill_plan.ready_for_future_restore_drill, true);
  assert.equal(report.restore_drill_plan.future_action, "separately-gated-post-restore");
  assert.equal(
    report.restore_drill_plan.allowed_future_request,
    `POST /api/admin/command-snapshots/${SNAPSHOT_ID}/restore`
  );
  assert.equal(report.operation_log_snapshot.snapshot_kind, "file-capture");
  assert.equal(report.restore_plan.can_restore, true);
  assert.equal(report.restore_plan.file_count, 1);
  assert.equal(
    report.restore_drill_plan.required_environment.MIXLAB_ADMIN_RESTORE_ALLOW,
    "true"
  );
});

test("restore drill plan fails metadata-only or missing operation-log snapshots", () => {
  const metadataOnly = buildReport({
    generated_at: "2026-06-26T18:02:00.000Z",
    api_base_url: "http://127.0.0.1:3892",
    expected_library_root: "/Volumes/MixLab/PublicLibrary",
    snapshot_id: SNAPSHOT_ID,
    operation_log_limit: 100,
    max_file_count: 10,
    requests: sampleRequests({
      operationSnapshot: {
        snapshot_kind: "metadata-only",
        captured_file_count: 0
      }
    })
  });
  const missing = buildReport({
    generated_at: "2026-06-26T18:02:00.000Z",
    api_base_url: "http://127.0.0.1:3892",
    expected_library_root: "/Volumes/MixLab/PublicLibrary",
    snapshot_id: SNAPSHOT_ID,
    operation_log_limit: 100,
    max_file_count: 10,
    requests: sampleRequests({
      operationEvents: []
    })
  });

  assert.equal(metadataOnly.result.passed, false);
  assert.equal(
    metadataOnly.gates.find((check) => check.name === "file-capture-snapshot")?.passed,
    false
  );
  assert.equal(missing.result.passed, false);
  assert.equal(
    missing.gates.find((check) => check.name === "snapshot-in-operation-log")?.passed,
    false
  );
});

test("restore drill plan fails blocked restore plans and oversized candidates", () => {
  const blocked = buildReport({
    generated_at: "2026-06-26T18:02:00.000Z",
    api_base_url: "http://127.0.0.1:3892",
    expected_library_root: "/Volumes/MixLab/PublicLibrary",
    snapshot_id: SNAPSHOT_ID,
    operation_log_limit: 100,
    max_file_count: 10,
    requests: sampleRequests({
      restore: {
        can_restore: false,
        blocked_file_count: 1,
        blockers: ["snapshot_file_missing"]
      }
    })
  });
  const oversized = buildReport({
    generated_at: "2026-06-26T18:02:00.000Z",
    api_base_url: "http://127.0.0.1:3892",
    expected_library_root: "/Volumes/MixLab/PublicLibrary",
    snapshot_id: SNAPSHOT_ID,
    operation_log_limit: 100,
    max_file_count: 1,
    requests: sampleRequests({
      operationSnapshot: {
        captured_file_count: 2
      },
      restore: {
        file_count: 2,
        restorable_file_count: 2,
        files: [
          {
            label: "a",
            status: "restorable",
            target_status: "exists",
            snapshot_status: "exists",
            source_relative_path: ".mixlab-library/a.json"
          },
          {
            label: "b",
            status: "restorable",
            target_status: "exists",
            snapshot_status: "exists",
            source_relative_path: ".mixlab-library/b.json"
          }
        ]
      }
    })
  });

  assert.equal(blocked.result.passed, false);
  assert.equal(
    blocked.gates.find((check) => check.name === "restore-plan-restorable")?.passed,
    false
  );
  assert.equal(oversized.result.passed, false);
  assert.equal(
    oversized.gates.find((check) => check.name === "bounded-file-count")?.passed,
    false
  );
});

test("restore drill plan markdown states plan-only scope and protected invariants", () => {
  const report = buildReport({
    generated_at: "2026-06-26T18:02:00.000Z",
    api_base_url: "http://127.0.0.1:3892",
    expected_library_root: "/Volumes/MixLab/PublicLibrary",
    snapshot_id: SNAPSHOT_ID,
    operation_log_limit: 100,
    max_file_count: 10,
    requests: sampleRequests()
  });
  const markdown = renderMarkdown(report);

  assert.match(markdown, /plan-only restore drill readiness report/);
  assert.match(markdown, /does not call POST restore/);
  assert.match(markdown, new RegExp(SNAPSHOT_ID));
  assert.match(markdown, /Future Restore Drill Requirements/);
  assert.match(markdown, /MIXLAB_ADMIN_RESTORE_ALLOW=true/);
  assert.match(markdown, /library.ready_video_count stays unchanged/);
  assert.match(markdown, /Cutter release\/index\/search smoke remains compatible/);
});

test("restore drill gate helper exposes failed contract and root checks", () => {
  const report = buildReport({
    generated_at: "2026-06-26T18:02:00.000Z",
    api_base_url: "http://127.0.0.1:3892",
    expected_library_root: "/Volumes/MixLab/PublicLibrary",
    snapshot_id: SNAPSHOT_ID,
    operation_log_limit: 100,
    max_file_count: 10,
    requests: sampleRequests({
      library: {
        root_path: "/tmp/PublicLibrary"
      }
    })
  });
  const failed = buildGateChecks({
    expected_library_root: "/Volumes/MixLab/PublicLibrary",
    max_file_count: 10,
    snapshot_id: SNAPSHOT_ID,
    requests: report.requests,
    environment: report.environment,
    data_loading_contract: report.data_loading_contract,
    operation_log_snapshot: report.operation_log_snapshot,
    restore_plan: report.restore_plan
  }).filter((check) => !check.passed);

  assert.deepEqual(failed.map((check) => check.name), ["library-root"]);
});
