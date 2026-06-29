import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildAdminDockerLiveReadonlyReport,
  buildLiveProbeDefinitions,
  classifyLiveReadonlyTarget,
  renderMarkdown,
  runLiveReadonlyProbe,
  sanitizeLiveProbeData,
  type LiveProbeResult
} from "./admin-docker-release-live-readonly.ts";

function probe(input: {
  name: LiveProbeResult["name"];
  path: string;
  data?: unknown;
  ok?: boolean;
  status?: number | null;
  bytes?: number;
  error_code?: string;
  message?: string;
}): LiveProbeResult {
  return {
    name: input.name,
    method: "GET",
    path: input.path,
    duration_ms: 10,
    http_status: input.status === undefined ? input.ok === false ? 401 : 200 : input.status,
    ok: input.ok !== false,
    api_ok: input.ok === false ? false : true,
    response_bytes: input.bytes ?? 256,
    content_type: input.name === "admin_web_root" ? "text/html" : "application/json",
    data: input.data ?? null,
    error_code: input.error_code,
    message: input.message
  };
}

function passReleaseGates(overrides: Record<string, string> = {}): unknown {
  const statuses = {
    "runtime-path-profile": "pass",
    "build-version-health": "pass",
    "preprocess-disk": "pass",
    "processing-recovery": "pass",
    "usage-events-tolerance": "pass",
    "current-index": "pass",
    "scan-protection": "pass",
    ...overrides
  };

  return {
    overall_status: Object.values(statuses).every((status) => status === "pass") ? "pass" : "blocked",
    release_allowed: Object.values(statuses).every((status) => status === "pass"),
    runtime: {
      library_root: "/data/PublicLibrary",
      source_videos_path: "/data/PublicLibrary/source-videos",
      path_profile: "docker"
    },
    build: {
      sha: "abc123",
      version: "2026.06.26",
      image_tag: "admin-runtime:abc123"
    },
    version_health_parity: {
      status: statuses["build-version-health"] === "pass" ? "ready" : "incomplete",
      metadata_complete: statuses["build-version-health"] === "pass",
      build_sha: "abc123",
      build_version: "2026.06.26",
      image_tag: "admin-runtime:abc123",
      expected_services: ["admin-web", "admin-api", "admin-worker"],
      health_preflight_endpoints: [
        "GET /",
        "GET /health",
        "GET /api/admin/release-gates"
      ],
      live_probe_command: "npx tsx scripts/acceptance/admin-docker-release-live-readonly.ts",
      external_proof_required: [
        "docker compose ps admin-web admin-api admin-worker",
        "docker inspect admin-web/admin-api/admin-worker image tags and health state"
      ],
      static_compose_gate: "image-tag-static-parity",
      safe_scope: "version-health-only",
      starts_workers: false,
      mutates_ready_assets: false,
      mutates_cutter_protocol: false,
      notes: []
    },
    admin_worker_env_proof: {
      proof_required: true,
      status: "external-proof-required",
      expected_service: "admin-worker",
      required_env_flags: {
        MIXLAB_ADMIN_DOCKER_MVP_MODE: "v0.1",
        MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER: "0",
        MIXLAB_ENABLE_READY_PUBLISH_WORKER: "0"
      },
      required_library_roots: {
        MIXLAB_ADMIN_LIBRARY_ROOT: "/data/PublicLibrary",
        MIXLAB_PREPROCESS_LIBRARY_ROOT: "/data/PublicLibrary"
      },
      env_file_name: "admin-worker.env",
      inspect_json_name: "admin-worker.inspect.json",
      env_file_variable: "MIXLAB_ADMIN_WORKER_ENV_FILE",
      inspect_json_variable: "MIXLAB_ADMIN_WORKER_INSPECT_JSON",
      proof_command: "npx tsx scripts/acceptance/admin-worker-env-proof.ts",
      collection_commands: [
        "docker compose --env-file .env -f docker-compose.yml exec admin-worker env | sort > admin-worker.env",
        "docker inspect $(docker compose --env-file .env -f docker-compose.yml ps -q admin-worker) > admin-worker.inspect.json"
      ],
      artifacts_pattern: "docs/acceptance/artifacts/admin-worker-env-proof-*.{json,md}",
      safe_scope: "admin-worker-env-only",
      starts_workers: false,
      records_secrets: false,
      mutates_ready_assets: false,
      mutates_cutter_protocol: false,
      notes: []
    },
    cutter_compatibility_proof: {
      proof_required: true,
      status: "external-proof-required",
      expected_ready_count: 10471,
      expected_auth_mode: "reviewed",
      required_reports: {
        windows_acceptance_env_var: "MIXLAB_CUTTER_WINDOWS_ACCEPTANCE_REPORT",
        real_cut_env_var: "MIXLAB_CUTTER_REAL_CUT_REPORT",
        optional_desktop_screenshot_env_var: "MIXLAB_CUTTER_DESKTOP_SCREENSHOT_REPORT",
        expected_ready_count_env_var: "MIXLAB_CUTTER_EXPECTED_READY_COUNT",
        expected_release_version_env_var: "MIXLAB_CUTTER_EXPECTED_RELEASE_VERSION"
      },
      required_evidence: [
        "Windows Runner windows_acceptance report with status=passed.",
        "Windows Runner real_cut_smoke report with status=passed."
      ],
      proof_command: "npx tsx scripts/acceptance/admin-cutter-compatibility-proof.ts",
      artifacts_pattern: "docs/acceptance/artifacts/admin-cutter-compatibility-proof-*.{json,md}",
      safe_scope: "cutter-compatibility-only",
      requires_staged_candidate: true,
      contacts_windows_runner: false,
      contacts_docker: false,
      starts_workers: false,
      mutates_ready_assets: false,
      mutates_cutter_protocol: false,
      notes: []
    },
    disk_space_protection: {
      status: statuses["preprocess-disk"] === "pass" ? "healthy" : "attention",
      safe_to_preprocess: statuses["preprocess-disk"] !== "blocked",
      preprocess_write_blocked: statuses["preprocess-disk"] === "blocked",
      release_blocked: statuses["preprocess-disk"] !== "pass",
      library_root: "/data/PublicLibrary",
      total_bytes: 1000,
      available_bytes: statuses["preprocess-disk"] === "pass" ? 400 : 90,
      used_bytes: statuses["preprocess-disk"] === "pass" ? 600 : 910,
      usage_percent: statuses["preprocess-disk"] === "pass" ? 60 : 91,
      block_usage_percent: 92,
      attention_usage_percent: 87,
      last_error: "",
      threshold_env_var: "MIXLAB_PREPROCESS_DISK_BLOCK_USAGE_PERCENT",
      write_block_scope: "preprocess-and-docker-upload",
      preflight_endpoints: [
        "GET /api/admin/release-gates",
        "GET /api/admin/preprocess/safety",
        "GET /api/admin/library/status"
      ],
      starts_workers: false,
      mutates_ready_assets: false,
      mutates_cutter_protocol: false,
      notes: []
    },
    usage_events_repair: {
      repair_required: statuses["usage-events-tolerance"] !== "pass",
      status: statuses["usage-events-tolerance"] === "pass" ? "clean" : "dry-run-required",
      events_path: "/data/PublicLibrary/.mixlab-library/usage-events/events.ndjson",
      projection_path: "/data/PublicLibrary/.mixlab-library/admin-read-model/usage-metrics.sqlite",
      dry_run_command: "npx tsx scripts/acceptance/usage-events-repair.ts --library-root '/data/PublicLibrary'",
      apply_command: "npx tsx scripts/acceptance/usage-events-repair.ts --library-root '/data/PublicLibrary' --apply",
      artifacts_pattern: "docs/acceptance/artifacts/usage-events-repair-*.{json,md}",
      backup_directory: "/data/PublicLibrary/.mixlab-library/usage-events/backups",
      quarantine_directory: "/data/PublicLibrary/.mixlab-library/usage-events/quarantine",
      safe_scope: "usage-events-only",
      mutates_ready_assets: false,
      mutates_cutter_protocol: false,
      notes: []
    },
    processing_recovery: {
      recovery_required: statuses["processing-recovery"] !== "pass",
      status: statuses["processing-recovery"] === "pass" ? "clear" : "preflight-required",
      processing_count: statuses["processing-recovery"] === "pass" ? 0 : 1,
      source_video_ids: statuses["processing-recovery"] === "pass" ? [] : ["V001440"],
      sample_truncated: false,
      preflight_endpoints: [
        "GET /api/admin/preprocess/safety",
        "GET /api/admin/source-videos?status=processing&limit=20",
        "GET /api/admin/preprocess/jobs?limit=20"
      ],
      bulk_recovery_endpoint: "POST /api/admin/preprocess/recover-processing",
      single_recovery_endpoints: statuses["processing-recovery"] === "pass"
        ? []
        : ["POST /api/admin/source-videos/V001440/recover-processing"],
      supervisor_must_be_idle: true,
      safe_scope: "processing-to-queued-only",
      mutates_ready_assets: false,
      mutates_cutter_protocol: false,
      notes: []
    },
    gates: Object.entries(statuses).map(([code, status]) => ({
      code,
      status,
      message: `${code} ${status}`
    }))
  };
}

function successfulRequests(releaseGates = passReleaseGates()): LiveProbeResult[] {
  return [
    probe({
      name: "admin_web_root",
      path: "/",
      data: null,
      bytes: 1024
    }),
    probe({
      name: "auth_status",
      path: "/api/admin/auth/status",
      data: {
        auth_mode: "password",
        authenticated: true
      }
    }),
    probe({
      name: "library_status",
      path: "/api/admin/library/status",
      data: {
        root_path: "/data/PublicLibrary",
        current_index_version: "v010471",
        video_count: 11394,
        ready_video_count: 10471
      }
    }),
    probe({
      name: "release_gates",
      path: "/api/admin/release-gates",
      data: releaseGates
    }),
    probe({
      name: "dashboard_metrics",
      path: "/api/admin/dashboard/metrics",
      data: {
        runtime_load: {
          overall_status: "healthy"
        }
      }
    }),
    probe({
      name: "data_loading_plan",
      path: "/api/admin/data-loading/plan",
      data: {
        strategy: "shell-first-route-owned-v1"
      }
    }),
    probe({
      name: "preprocess_supervisor_status",
      path: "/api/admin/preprocess/supervisor/status",
      data: {
        running: false
      }
    })
  ];
}

function legacyNasApiRequests(): LiveProbeResult[] {
  return [
    probe({
      name: "admin_web_root",
      path: "/",
      data: null,
      bytes: 413
    }),
    probe({
      name: "auth_status",
      path: "/api/admin/auth/status",
      ok: false,
      status: 404,
      error_code: "not_found",
      message: "路由不存在"
    }),
    probe({
      name: "library_status",
      path: "/api/admin/library/status",
      data: {
        root_path: "/data/PublicLibrary",
        current_index_version: "v010471",
        video_count: 11394,
        ready_video_count: 10471
      },
      bytes: 702
    }),
    probe({
      name: "release_gates",
      path: "/api/admin/release-gates",
      ok: false,
      status: 404,
      error_code: "not_found",
      message: "路由不存在"
    }),
    probe({
      name: "dashboard_metrics",
      path: "/api/admin/dashboard/metrics",
      ok: false,
      status: null,
      error_code: "timeout",
      message: "This operation was aborted"
    }),
    probe({
      name: "data_loading_plan",
      path: "/api/admin/data-loading/plan",
      ok: false,
      status: 404,
      error_code: "not_found",
      message: "路由不存在"
    }),
    probe({
      name: "preprocess_supervisor_status",
      path: "/api/admin/preprocess/supervisor/status",
      data: {
        state: "idle"
      },
      bytes: 181
    })
  ];
}

function buildReport(input: {
  base_url?: string;
  session_token_present?: boolean;
  requests?: LiveProbeResult[];
} = {}) {
  return buildAdminDockerLiveReadonlyReport({
    generated_at: "2026-06-26T21:00:00.000Z",
    command: "npx tsx scripts/acceptance/admin-docker-release-live-readonly.ts",
    base_url: input.base_url ?? "",
    expected_library_root: "/data/PublicLibrary",
    session_token_present: input.session_token_present ?? false,
    requests: input.requests ?? []
  });
}

test("admin Docker live-readonly probe definitions are GET-only and avoid command endpoints", () => {
  const probes = buildLiveProbeDefinitions();

  assert.equal(probes.every((item) => item.method === "GET"), true);
  assert.doesNotMatch(
    probes.map((item) => item.path).join("\n"),
    /\/scan|\/apply|\/publish|\/repair|\/queue|\/retry|\/recover|\/start|\/stop|\/cancel/
  );
  assert.deepEqual(
    probes.map((item) => item.path),
    [
      "/",
      "/api/admin/auth/status",
      "/api/admin/library/status",
      "/api/admin/release-gates",
      "/api/admin/dashboard/metrics",
      "/api/admin/data-loading/plan",
      "/api/admin/preprocess/supervisor/status"
    ]
  );
  assert.equal(
    probes.find((item) => item.name === "auth_status")?.protected,
    true
  );
});

test("admin Docker live-readonly dashboard metrics are sanitized before archival", () => {
  const sanitized = sanitizeLiveProbeData("dashboard_metrics", {
    material: {
      video_count: 11394,
      ready_video_count: 10471
    },
    usage: {
      search_request_count: 10,
      search_hit_count: 9,
      search_empty_count: 1,
      source_detail_view_count: 5,
      cut_submission_count: 3,
      cut_success_count: 2,
      cut_failure_count: 1,
      active_user_count: 2,
      recent_keywords: ["private-keyword"],
      users: [
        {
          user_id: "CU000011",
          username: "Private Editor",
          last_used_at: "2026-06-28T00:00:00.000Z"
        }
      ]
    },
    runtime_load: {
      overall_status: "blocked",
      disk: {
        usage_percent: 98,
        status: "blocked"
      }
    }
  });

  const text = JSON.stringify(sanitized);
  assert.match(text, /"user_count":1/);
  assert.match(text, /"recent_keyword_count":1/);
  assert.equal(text.includes("Private Editor"), false);
  assert.equal(text.includes("private-keyword"), false);
  assert.equal(text.includes("CU000011"), false);
});

test("admin Docker live-readonly report stays blocked when target URL is missing", () => {
  const report = buildReport();

  assert.equal(report.target.configured, false);
  assert.equal(report.target.kind, "not-configured");
  assert.equal(report.target.safe_to_probe, false);
  assert.equal(report.requests.length, 0);
  assert.equal(report.live_readiness_ready, false);
  assert.equal(report.docker_upload_allowed, false);
  assert.equal(report.result.status, "blocked");
  assert.equal(
    report.gates.find((gate) => gate.id === "target-url-configured")?.status,
    "blocked"
  );
  assert.equal(
    report.gates.find((gate) => gate.id === "target-url-admin-web-shape")?.status,
    "blocked"
  );
});

test("admin Docker live-readonly probe writes blocked artifacts to configured output dir", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-live-readonly-output-"));
  try {
    const escapedTempDir = tempDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const report = await runLiveReadonlyProbe({
      base_url: "",
      output_dir: tempDir,
      date: new Date("2026-06-27T00:00:00.000Z"),
      command: "test"
    });

    assert.equal(report.result.status, "blocked");
    assert.match(report.artifacts?.json_path ?? "", new RegExp(`^${escapedTempDir}`));
    assert.match(report.artifacts?.markdown_path ?? "", new RegExp(`^${escapedTempDir}`));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("admin Docker live-readonly target classification blocks NAS desktop and loopback URLs", () => {
  const adminWeb = classifyLiveReadonlyTarget("http://192.168.1.27:8080/");
  assert.equal(adminWeb.kind, "admin-web-url");
  assert.equal(adminWeb.safe_to_probe, true);
  assert.equal(adminWeb.normalized_base_url, "http://192.168.1.27:8080");

  const desktop = classifyLiveReadonlyTarget("http://192.168.1.27:9999/desktop/");
  assert.equal(desktop.kind, "nas-desktop-url");
  assert.equal(desktop.safe_to_probe, false);
  assert.match(desktop.evidence, /NAS desktop UI/);
  assert.equal(desktop.notes.some((note) => note.includes("9999/desktop")), true);

  const localhost = classifyLiveReadonlyTarget("http://127.0.0.1:5176/");
  assert.equal(localhost.kind, "local-loopback");
  assert.equal(localhost.safe_to_probe, false);
  assert.match(localhost.evidence, /local to the current machine/);

  const subpath = classifyLiveReadonlyTarget("http://192.168.1.27:8080/admin/");
  assert.equal(subpath.kind, "non-root-path");
  assert.equal(subpath.safe_to_probe, false);
  assert.match(subpath.evidence, /non-root path/);
});

test("admin Docker live-readonly report blocks wrong target shapes before API parity claims", () => {
  const report = buildReport({
    base_url: "http://192.168.1.27:9999/desktop/"
  });

  assert.equal(report.target.configured, true);
  assert.equal(report.target.kind, "nas-desktop-url");
  assert.equal(report.target.safe_to_probe, false);
  assert.equal(report.target.normalized_base_url, "http://192.168.1.27:9999/desktop");
  assert.equal(
    report.gates.find((gate) => gate.id === "target-url-admin-web-shape")?.status,
    "blocked"
  );
  assert.match(
    report.gates.find((gate) => gate.id === "target-url-admin-web-shape")?.evidence ?? "",
    /nas-desktop-url/
  );
  assert.equal(report.summary.upload_blockers.includes("target-url-admin-web-shape"), true);

  const markdown = renderMarkdown(report);
  assert.match(markdown, /Target kind: nas-desktop-url/);
  assert.match(markdown, /Safe to probe: no/);
  assert.match(markdown, /9999\/desktop/);
});

test("admin Docker live-readonly report classifies authorized live Admin API evidence", () => {
  const report = buildReport({
    base_url: "http://192.168.1.27:8080",
    session_token_present: true,
    requests: successfulRequests()
  });

  assert.equal(report.target.configured, true);
  assert.equal(report.target.kind, "admin-web-url");
  assert.equal(report.target.safe_to_probe, true);
  assert.equal(report.target.normalized_base_url, "http://192.168.1.27:8080");
  assert.equal(report.target.session_token_present, true);
  assert.equal(report.observed.library_root, "/data/PublicLibrary");
  assert.equal(report.observed.runtime_path_profile, "docker");
  assert.equal(report.observed.image_tag, "admin-runtime:abc123");
  assert.equal(
    report.gates.find((gate) => gate.id === "runtime-path-profile-live")?.status,
    "pass"
  );
  assert.equal(
    report.gates.find((gate) => gate.id === "current-admin-api-contract-live")?.status,
    "pass"
  );
  assert.equal(
    report.gates.find((gate) => gate.id === "target-url-admin-web-shape")?.status,
    "pass"
  );
  assert.equal(
    report.gates.find((gate) => gate.id === "version-health-parity-contract-live")?.status,
    "pass"
  );
  assert.match(
    report.gates.find((gate) => gate.id === "version-health-parity-contract-live")?.evidence ?? "",
    /admin-web,admin-api,admin-worker/
  );
  assert.equal(
    report.gates.find((gate) => gate.id === "usage-events-tolerance")?.status,
    "pass"
  );
  assert.equal(
    report.gates.find((gate) => gate.id === "disk-space-protection-contract-live")?.status,
    "pass"
  );
  assert.match(
    report.gates.find((gate) => gate.id === "disk-space-protection-contract-live")?.evidence ?? "",
    /preprocess-and-docker-upload/
  );
  assert.equal(
    report.gates.find((gate) => gate.id === "usage-events-repair-contract-live")?.status,
    "pass"
  );
  assert.match(
    report.gates.find((gate) => gate.id === "usage-events-repair-contract-live")?.evidence ?? "",
    /usage-events-repair/
  );
  assert.equal(
    report.gates.find((gate) => gate.id === "processing-recovery")?.status,
    "pass"
  );
  assert.equal(
    report.gates.find((gate) => gate.id === "processing-recovery-contract-live")?.status,
    "pass"
  );
  assert.match(
    report.gates.find((gate) => gate.id === "processing-recovery-contract-live")?.evidence ?? "",
    /processing-to-queued-only/
  );
  assert.equal(
    report.gates.find((gate) => gate.id === "admin-worker-env-proof-contract-live")?.status,
    "pass"
  );
  assert.match(
    report.gates.find((gate) => gate.id === "admin-worker-env-proof-contract-live")?.evidence ?? "",
    /admin-worker-env-only/
  );
  assert.equal(
    report.gates.find((gate) => gate.id === "admin-worker-live-flags")?.status,
    "needs-external-proof"
  );
  assert.equal(
    report.gates.find((gate) => gate.id === "cutter-compatibility-proof-contract-live")?.status,
    "pass"
  );
  assert.match(
    report.gates.find((gate) => gate.id === "cutter-compatibility-proof-contract-live")?.evidence ?? "",
    /cutter-compatibility-only/
  );
  assert.equal(
    report.gates.find((gate) => gate.id === "cutter-release-compatibility-live")?.status,
    "needs-external-proof"
  );
  assert.equal(report.live_readiness_ready, false);
  assert.equal(report.docker_upload_allowed, false);
});

test("admin Docker live-readonly report separates legacy API contract drift from proxy reachability", () => {
  const report = buildReport({
    base_url: "http://192.168.1.27:18080",
    requests: legacyNasApiRequests()
  });

  assert.equal(
    report.gates.find((gate) => gate.id === "admin-api-proxy-live")?.status,
    "pass"
  );
  assert.match(
    report.gates.find((gate) => gate.id === "admin-api-proxy-live")?.evidence ?? "",
    /library=HTTP 200/
  );
  assert.equal(
    report.gates.find((gate) => gate.id === "current-admin-api-contract-live")?.status,
    "blocked"
  );
  assert.match(
    report.gates.find((gate) => gate.id === "current-admin-api-contract-live")?.evidence ?? "",
    /auth=HTTP 404/
  );
  assert.equal(
    report.gates.find((gate) => gate.id === "runtime-path-profile-live")?.status,
    "pass"
  );
  assert.equal(report.observed.library_root, "/data/PublicLibrary");
  assert.equal(report.summary.upload_blockers.includes("current-admin-api-contract-live"), true);
  assert.equal(report.summary.upload_blockers.includes("version-health-parity-contract-live"), true);
  assert.equal(report.summary.upload_blockers.includes("usage-events-repair-contract-live"), true);
  assert.equal(report.summary.upload_blockers.includes("processing-recovery-contract-live"), true);
  assert.equal(report.summary.upload_blockers.includes("disk-space-protection-contract-live"), true);
  assert.equal(report.summary.upload_blockers.includes("admin-worker-env-proof-contract-live"), true);
  assert.equal(report.summary.upload_blockers.includes("cutter-compatibility-proof-contract-live"), true);
  assert.equal(report.summary.upload_blockers.includes("admin-api-proxy-live"), false);
});

test("admin Docker live-readonly report blocks on release-gate failures", () => {
  const report = buildReport({
    base_url: "http://192.168.1.27:8080",
    session_token_present: true,
    requests: successfulRequests(passReleaseGates({
      "usage-events-tolerance": "blocked",
      "processing-recovery": "blocked",
      "preprocess-disk": "attention"
    }))
  });

  assert.equal(
    report.gates.find((gate) => gate.id === "usage-events-tolerance")?.status,
    "blocked"
  );
  assert.match(
    report.gates.find((gate) => gate.id === "processing-recovery")?.evidence ?? "",
    /blocked/
  );
  assert.equal(
    report.gates.find((gate) => gate.id === "preprocess-disk")?.status,
    "blocked"
  );
  assert.equal(report.summary.upload_blockers.includes("usage-events-tolerance"), true);
  assert.equal(report.summary.upload_blockers.includes("processing-recovery"), true);
});

test("admin Docker live-readonly report redacts session token values in markdown", () => {
  const report = buildReport({
    base_url: "http://192.168.1.27:8080",
    session_token_present: true,
    requests: successfulRequests()
  });
  const markdown = renderMarkdown(report);

  assert.match(markdown, /Session token present: yes/);
  assert.match(markdown, /sends only GET requests/);
  assert.match(markdown, /does not start Docker/);
  assert.match(markdown, /Worker runtime environment proof and Cutter compatibility proof remain external/);
  assert.doesNotMatch(markdown, /secret-token|X-MixLab-Admin-Session-Token|Bearer/);
});
