import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildAdminDockerCandidateContractProofReport,
  classifyCandidateTarget,
  renderCandidateMarkdown,
  runCandidateContractProof,
  runCandidateContractProofFromLocalSmoke,
  type CandidateProbeResult
} from "./admin-docker-candidate-contract-proof.ts";

function probe(input: {
  name: CandidateProbeResult["name"];
  path: string;
  data?: unknown;
  ok?: boolean;
  status?: number | null;
  error_code?: string;
  message?: string;
}): CandidateProbeResult {
  return {
    name: input.name,
    method: "GET",
    path: input.path,
    duration_ms: 10,
    http_status: input.status === undefined ? input.ok === false ? 404 : 200 : input.status,
    ok: input.ok !== false,
    api_ok: input.name === "admin_web_root" ? null : input.ok !== false,
    response_bytes: 256,
    content_type: input.name === "admin_web_root" ? "text/html" : "application/json",
    data: input.data ?? null,
    error_code: input.error_code,
    message: input.message
  };
}

function completeReleaseGates(overrides: Record<string, unknown> = {}): unknown {
  return {
    overall_status: "pass",
    release_allowed: false,
    build: {
      sha: "abc123",
      version: "2026.06.27",
      image_tag: "mixlab-admin:abc123"
    },
    version_health_parity: {
      status: "external-proof-required",
      safe_scope: "version-health-only",
      static_compose_gate: "image-tag-static-parity",
      expected_services: ["admin-web", "admin-api", "admin-worker"],
      health_preflight_endpoints: [
        "GET /",
        "GET /health",
        "GET /api/admin/release-gates"
      ],
      external_proof_required: [
        "docker compose ps admin-web admin-api admin-worker"
      ],
      starts_workers: false,
      mutates_ready_assets: false,
      mutates_cutter_protocol: false
    },
    disk_space_protection: {
      threshold_env_var: "MIXLAB_PREPROCESS_DISK_BLOCK_USAGE_PERCENT",
      write_block_scope: "preprocess-and-docker-upload",
      preflight_endpoints: [
        "GET /api/admin/release-gates",
        "GET /api/admin/preprocess/safety",
        "GET /api/admin/library/status"
      ],
      starts_workers: false,
      mutates_ready_assets: false,
      mutates_cutter_protocol: false
    },
    usage_events_repair: {
      safe_scope: "usage-events-only",
      dry_run_command: "npx tsx scripts/acceptance/usage-events-repair.ts --library-root /data/PublicLibrary",
      apply_command: "npx tsx scripts/acceptance/usage-events-repair.ts --library-root /data/PublicLibrary --apply",
      mutates_ready_assets: false,
      mutates_cutter_protocol: false
    },
    processing_recovery: {
      safe_scope: "processing-to-queued-only",
      bulk_recovery_endpoint: "POST /api/admin/preprocess/recover-processing",
      preflight_endpoints: [
        "GET /api/admin/preprocess/safety",
        "GET /api/admin/source-videos?status=processing&limit=20"
      ],
      supervisor_must_be_idle: true,
      mutates_ready_assets: false,
      mutates_cutter_protocol: false
    },
    admin_worker_env_proof: {
      status: "external-proof-required",
      expected_service: "admin-worker",
      safe_scope: "admin-worker-env-only",
      required_env_flags: {
        MIXLAB_ADMIN_DOCKER_MVP_MODE: "v0.1",
        MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER: "0",
        MIXLAB_ENABLE_READY_PUBLISH_WORKER: "0"
      },
      required_library_roots: {
        MIXLAB_ADMIN_LIBRARY_ROOT: "/data/PublicLibrary",
        MIXLAB_PREPROCESS_LIBRARY_ROOT: "/data/PublicLibrary"
      },
      proof_command: "npx tsx scripts/acceptance/admin-worker-env-proof.ts",
      collection_commands: [
        "docker compose exec admin-worker env"
      ],
      starts_workers: false,
      records_secrets: false,
      mutates_ready_assets: false,
      mutates_cutter_protocol: false
    },
    cutter_compatibility_proof: {
      status: "external-proof-required",
      expected_auth_mode: "reviewed",
      expected_ready_count: 10471,
      safe_scope: "cutter-compatibility-only",
      required_reports: {
        windows_acceptance_env_var: "MIXLAB_CUTTER_WINDOWS_ACCEPTANCE_REPORT",
        real_cut_env_var: "MIXLAB_CUTTER_REAL_CUT_REPORT"
      },
      required_evidence: [
        "Windows Runner windows_acceptance report with status=passed.",
        "Windows Runner real_cut_smoke report with status=passed."
      ],
      proof_command: "npx tsx scripts/acceptance/admin-cutter-compatibility-proof.ts",
      requires_staged_candidate: true,
      contacts_windows_runner: false,
      contacts_docker: false,
      starts_workers: false,
      mutates_ready_assets: false,
      mutates_cutter_protocol: false
    },
    ...overrides
  };
}

function completeRequests(releaseGates = completeReleaseGates()): CandidateProbeResult[] {
  return [
    probe({
      name: "admin_web_root",
      path: "/"
    }),
    probe({
      name: "auth_status",
      path: "/api/admin/auth/status",
      data: {
        auth_mode: "disabled",
        authenticated: true
      }
    }),
    probe({
      name: "library_status",
      path: "/api/admin/library/status",
      data: {
        root_path: "/data/PublicLibrary",
        current_index_version: "v010471"
      }
    }),
    probe({
      name: "release_gates",
      path: "/api/admin/release-gates",
      data: releaseGates
    }),
    probe({
      name: "data_loading_plan",
      path: "/api/admin/data-loading/plan",
      data: {
        hidden_full_scan_allowed: false
      }
    })
  ];
}

function localSmokeProbe(request: CandidateProbeResult): unknown {
  return {
    name: request.name,
    path: request.path,
    duration_ms: request.duration_ms,
    http_status: request.http_status,
    ok: request.ok,
    api_ok: request.api_ok,
    content_type: request.content_type,
    response_bytes: request.response_bytes,
    data: request.data,
    error_code: request.error_code,
    message: request.message
  };
}

function localSmokeReport(input: {
  passed: boolean;
  probes?: CandidateProbeResult[];
}): unknown {
  return {
    mode: "admin-docker-local-smoke",
    local_smoke_passed: input.passed,
    observations: {
      web_url: "http://127.0.0.1:18081/"
    },
    probes: (input.probes ?? completeRequests()).map((request) => localSmokeProbe(request)),
    summary: {
      local_smoke_blockers: input.passed ? [] : ["docker-cli-available"]
    },
    result: {
      status: input.passed ? "accepted" : "blocked"
    }
  };
}

test("candidate contract proof blocks without a configured candidate URL and sends no requests", () => {
  const report = buildAdminDockerCandidateContractProofReport({
    generated_at: "2026-06-27T00:00:00.000Z",
    command: "test",
    base_url: "",
    session_token_present: false,
    requests: []
  });

  assert.equal(report.target.kind, "not-configured");
  assert.equal(report.target.safe_to_probe, false);
  assert.equal(report.target.nas_live_evidence, false);
  assert.equal(report.requests.length, 0);
  assert.equal(report.candidate_contract_ready, false);
  assert.equal(report.docker_upload_allowed, false);
  assert.equal(report.staging_approved, false);
  assert.ok(report.summary.candidate_review_blockers.includes("candidate-target-configured"));
});

test("candidate target classification allows localhost only as local candidate proof", () => {
  const classification = classifyCandidateTarget("http://127.0.0.1:5176/");

  assert.equal(classification.kind, "local-loopback-candidate");
  assert.equal(classification.safe_to_probe, true);
  assert.match(classification.evidence, /local to the current machine/);
  assert.ok(classification.notes.some((note) => note.includes("not NAS Docker live evidence")));
});

test("candidate target classification blocks NAS desktop and non-root targets before probing", () => {
  assert.deepEqual(classifyCandidateTarget("http://192.168.1.27:9999/desktop/").safe_to_probe, false);
  assert.equal(classifyCandidateTarget("http://192.168.1.27:9999/desktop/").kind, "nas-desktop-url");
  assert.equal(classifyCandidateTarget("http://192.168.1.27:18080/#/dashboard").kind, "non-root-path");
  assert.equal(classifyCandidateTarget("http://192.168.1.27:18080/#/dashboard").safe_to_probe, false);
});

test("complete candidate API and release-gate contract becomes ready for candidate review without approving upload", () => {
  const report = buildAdminDockerCandidateContractProofReport({
    generated_at: "2026-06-27T00:00:00.000Z",
    command: "test",
    base_url: "http://127.0.0.1:5176",
    session_token_present: false,
    requests: completeRequests()
  });

  assert.equal(report.target.kind, "local-loopback-candidate");
  assert.equal(report.candidate_contract_ready, true);
  assert.equal(report.result.status, "ready-for-candidate-review");
  assert.equal(report.docker_upload_allowed, false);
  assert.equal(report.staging_approved, false);
  assert.deepEqual(report.summary.candidate_review_blockers, []);
  assert.ok(report.summary.docker_upload_blockers.includes("candidate-not-nas-live-evidence"));
  assert.ok(report.summary.docker_upload_blockers.includes("candidate-does-not-approve-upload"));
});

test("accepted local Docker smoke report can supply candidate contract proof without reopening containers", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-candidate-from-smoke-"));
  const reportPath = path.join(outputDir, "admin-docker-local-smoke-fixture.json");

  await writeFile(reportPath, `${JSON.stringify(localSmokeReport({ passed: true }), null, 2)}\n`);

  try {
    const report = await runCandidateContractProofFromLocalSmoke({
      local_smoke_report_path: reportPath,
      output_dir: outputDir,
      date: new Date("2026-06-27T00:00:00.000Z"),
      command: "test"
    });

    assert.equal(report.source.kind, "local-smoke-report");
    assert.equal(report.source.report_path, reportPath);
    assert.equal(report.source.local_smoke_passed, true);
    assert.equal(report.target.kind, "local-loopback-candidate");
    assert.equal(report.target.nas_live_evidence, false);
    assert.equal(report.candidate_contract_ready, true);
    assert.equal(report.docker_upload_allowed, false);
    assert.equal(report.requests.find((request) => request.name === "release_gates")?.base_url, "http://127.0.0.1:18081");
    assert.equal(report.requests.find((request) => request.name === "release_gates")?.target_role, "api");
    assert.ok(report.gates.find((item) => item.id === "candidate-proof-source-accepted")?.status === "pass");
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("blocked local Docker smoke report cannot become candidate contract ready", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-candidate-from-blocked-smoke-"));
  const reportPath = path.join(outputDir, "admin-docker-local-smoke-fixture.json");

  await writeFile(reportPath, `${JSON.stringify(localSmokeReport({ passed: false }), null, 2)}\n`);

  try {
    const report = await runCandidateContractProofFromLocalSmoke({
      local_smoke_report_path: reportPath,
      output_dir: outputDir,
      date: new Date("2026-06-27T00:00:00.000Z"),
      command: "test"
    });

    assert.equal(report.source.kind, "local-smoke-report");
    assert.equal(report.source.local_smoke_passed, false);
    assert.equal(report.candidate_contract_ready, false);
    assert.ok(report.summary.candidate_review_blockers.includes("candidate-proof-source-accepted"));
    assert.ok(report.gates.find((item) => item.id === "candidate-proof-source-accepted")?.evidence.includes("docker-cli-available"));
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("split local candidate proof sends admin API probes to the explicit API base", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-candidate-proof-"));
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requestedUrls.push(url.href);

    if (url.pathname === "/") {
      return new Response("<!doctype html><title>MixLab Admin</title>", {
        status: 200,
        headers: { "content-type": "text/html" }
      });
    }

    const data = url.pathname === "/api/admin/auth/status"
      ? { auth_mode: "disabled", authenticated: true }
      : url.pathname === "/api/admin/library/status"
        ? { root_path: "/data/PublicLibrary", current_index_version: "v010471" }
        : url.pathname === "/api/admin/release-gates"
          ? completeReleaseGates()
          : url.pathname === "/api/admin/data-loading/plan"
            ? { hidden_full_scan_allowed: false }
            : null;

    return new Response(JSON.stringify({ ok: data !== null, data }), {
      status: data === null ? 404 : 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const report = await runCandidateContractProof({
      base_url: "http://127.0.0.1:5176",
      api_base_url: "http://127.0.0.1:3889",
      output_dir: outputDir,
      date: new Date("2026-06-27T00:00:00.000Z"),
      command: "test"
    });

    assert.equal(report.target.split_api_target, true);
    assert.equal(report.target.api_configured, true);
    assert.equal(report.target.normalized_base_url, "http://127.0.0.1:5176");
    assert.equal(report.target.api_normalized_base_url, "http://127.0.0.1:3889");
    assert.equal(report.requests.find((request) => request.name === "admin_web_root")?.base_url, "http://127.0.0.1:5176");
    assert.equal(report.requests.find((request) => request.name === "release_gates")?.base_url, "http://127.0.0.1:3889");
    assert.equal(report.requests.find((request) => request.name === "release_gates")?.target_role, "api");
    assert.ok(requestedUrls.includes("http://127.0.0.1:5176/"));
    assert.ok(requestedUrls.includes("http://127.0.0.1:3889/api/admin/release-gates"));
    assert.equal(report.candidate_contract_ready, true);
    assert.equal(report.docker_upload_allowed, false);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("explicit split API target must also be a root URL before probing", () => {
  const report = buildAdminDockerCandidateContractProofReport({
    generated_at: "2026-06-27T00:00:00.000Z",
    command: "test",
    base_url: "http://127.0.0.1:5176",
    api_base_url: "http://127.0.0.1:3889/#/dashboard",
    session_token_present: false,
    requests: []
  });

  const gate = report.gates.find((item) => item.id === "candidate-api-target-shape");

  assert.equal(report.target.split_api_target, true);
  assert.equal(report.target.api_kind, "non-root-path");
  assert.equal(gate?.status, "blocked");
  assert.ok(report.summary.candidate_review_blockers.includes("candidate-api-target-shape"));
});

test("missing release-gate subcontracts block candidate review", () => {
  const releaseGates = completeReleaseGates({
    admin_worker_env_proof: {
      status: "missing"
    }
  });
  const report = buildAdminDockerCandidateContractProofReport({
    generated_at: "2026-06-27T00:00:00.000Z",
    command: "test",
    base_url: "http://candidate.example.test/",
    session_token_present: false,
    requests: completeRequests(releaseGates)
  });
  const gate = report.gates.find((item) => item.id === "candidate-admin-worker-env-proof-contract");

  assert.equal(report.candidate_contract_ready, false);
  assert.equal(gate?.status, "blocked");
  assert.ok(report.summary.candidate_review_blockers.includes("candidate-admin-worker-env-proof-contract"));
});

test("candidate contract markdown records candidate-only scope", () => {
  const report = buildAdminDockerCandidateContractProofReport({
    generated_at: "2026-06-27T00:00:00.000Z",
    command: "test",
    base_url: "http://127.0.0.1:5176",
    session_token_present: false,
    requests: completeRequests()
  });
  const markdown = renderCandidateMarkdown(report);

  assert.match(markdown, /Candidate contract ready: yes/);
  assert.match(markdown, /Docker upload allowed: no/);
  assert.match(markdown, /cannot replace NAS live-readonly evidence/);
});
