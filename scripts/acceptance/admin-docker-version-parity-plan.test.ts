import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminDockerVersionParityPlanReport
} from "./admin-docker-version-parity-plan.ts";

function legacyNasLiveReport(): unknown {
  return {
    target: {
      base_url: "http://192.168.1.27:18080",
      configured: true,
      expected_library_root: "/data/PublicLibrary"
    },
    requests: [
      {
        name: "admin_web_root",
        http_status: 200,
        ok: true,
        duration_ms: 31.9
      },
      {
        name: "auth_status",
        http_status: 404,
        ok: false,
        error_code: "not_found",
        message: "route missing",
        duration_ms: 9.7
      },
      {
        name: "library_status",
        http_status: 200,
        ok: true,
        duration_ms: 1135.6,
        data: {
          root_path: "/data/PublicLibrary"
        }
      },
      {
        name: "release_gates",
        http_status: 404,
        ok: false,
        error_code: "not_found",
        message: "route missing",
        duration_ms: 5.9
      },
      {
        name: "dashboard_metrics",
        http_status: 200,
        ok: true,
        duration_ms: 5526.9,
        data: {
          runtime_load: {
            disk: {
              usage_percent: 98,
              status: "blocked"
            }
          }
        }
      },
      {
        name: "data_loading_plan",
        http_status: 404,
        ok: false,
        error_code: "not_found",
        message: "route missing",
        duration_ms: 12.1
      },
      {
        name: "preprocess_supervisor_status",
        http_status: 200,
        ok: true,
        duration_ms: 4.7
      }
    ],
    observed: {
      library_root: "/data/PublicLibrary",
      current_index_version: "v010471",
      video_count: 11394,
      ready_video_count: 10471,
      build_sha: "",
      build_version: "",
      image_tag: ""
    }
  };
}

function currentApiLiveReport(): unknown {
  const report = legacyNasLiveReport() as Record<string, unknown>;
  report.requests = [
    {
      name: "admin_web_root",
      http_status: 200,
      ok: true,
      duration_ms: 20
    },
    {
      name: "auth_status",
      http_status: 200,
      ok: true,
      duration_ms: 8
    },
    {
      name: "library_status",
      http_status: 200,
      ok: true,
      duration_ms: 100,
      data: {
        root_path: "/data/PublicLibrary"
      }
    },
    {
      name: "release_gates",
      http_status: 200,
      ok: true,
      duration_ms: 100,
      data: {
        version_health_parity: {
          status: "ready",
          metadata_complete: true,
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
          mutates_cutter_protocol: false
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
          mutates_cutter_protocol: false
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
          mutates_cutter_protocol: false
        }
      }
    },
    {
      name: "dashboard_metrics",
      http_status: 200,
      ok: true,
      duration_ms: 120,
      data: {
        runtime_load: {
          disk: {
            usage_percent: 50,
            status: "healthy"
          }
        }
      }
    },
    {
      name: "data_loading_plan",
      http_status: 200,
      ok: true,
      duration_ms: 10
    },
    {
      name: "preprocess_supervisor_status",
      http_status: 200,
      ok: true,
      duration_ms: 4
    }
  ];

  return report;
}

function nasDesktopTargetLiveReport(): unknown {
  return {
    target: {
      base_url: "http://192.168.1.27:9999/desktop/",
      normalized_base_url: "http://192.168.1.27:9999/desktop",
      configured: true,
      kind: "nas-desktop-url",
      safe_to_probe: false,
      expected_library_root: "/data/PublicLibrary"
    },
    requests: [],
    observed: {}
  };
}

test("admin Docker version parity plan requires API update for legacy NAS Admin contract", () => {
  const report = buildAdminDockerVersionParityPlanReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    source_artifact: "legacy.json",
    live_report: legacyNasLiveReport()
  });

  assert.equal(report.decision.docker_image_update_required, true);
  assert.equal(report.decision.docker_deploy_allowed_now, false);
  assert.deepEqual(report.observations.missing_current_endpoints, [
    "/api/admin/auth/status",
    "/api/admin/release-gates",
    "/api/admin/data-loading/plan"
  ]);
  assert.equal(
    report.gates.find((gate) => gate.id === "current-admin-api-contract-parity")?.status,
    "blocked"
  );
  assert.equal(
    report.gates.find((gate) => gate.id === "version-health-parity-contract")?.status,
    "blocked"
  );
  assert.equal(report.observations.version_health_parity_contract_ready, false);
  assert.equal(report.observations.admin_worker_env_proof_contract_ready, false);
  assert.equal(report.observations.cutter_compatibility_proof_contract_ready, false);
  assert.equal(
    report.gates.find((gate) => gate.id === "docker-library-root-parity")?.status,
    "pass"
  );
  assert.equal(
    report.gates.find((gate) => gate.id === "nas-disk-risk")?.status,
    "blocked"
  );
  assert.ok(report.summary.upload_blockers.includes("current-admin-api-contract-parity"));
  assert.ok(report.summary.upload_blockers.includes("admin-worker-env-proof-contract"));
  assert.ok(report.summary.upload_blockers.includes("cutter-compatibility-proof-contract"));
  assert.ok(report.summary.upload_blockers.includes("admin-worker-env-external-proof"));
  assert.ok(report.summary.upload_blockers.includes("cutter-compatibility-external-proof"));
});

test("admin Docker version parity plan rejects live artifacts from unsafe NAS desktop targets", () => {
  const report = buildAdminDockerVersionParityPlanReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    source_artifact: "nas-desktop.json",
    live_report: nasDesktopTargetLiveReport()
  });

  assert.equal(report.target.configured, true);
  assert.equal(report.target.kind, "nas-desktop-url");
  assert.equal(report.target.safe_to_probe, false);
  assert.equal(report.observations.live_target_kind, "nas-desktop-url");
  assert.equal(report.observations.live_target_safe_to_probe, false);
  assert.equal(
    report.gates.find((gate) => gate.id === "live-artifact-targeted")?.status,
    "blocked"
  );
  assert.match(
    report.gates.find((gate) => gate.id === "live-artifact-targeted")?.evidence ?? "",
    /not safe admin-web evidence/
  );
  assert.equal(report.summary.upload_blockers.includes("live-artifact-targeted"), true);
  assert.match(report.decision.summary, /not classified as a probe-safe NAS Docker admin-web root/);
});

test("admin Docker version parity plan still blocks deploy when API parity is current but external proof is missing", () => {
  const report = buildAdminDockerVersionParityPlanReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    source_artifact: "current.json",
    live_report: currentApiLiveReport()
  });

  assert.equal(report.decision.docker_image_update_required, false);
  assert.equal(report.decision.docker_deploy_allowed_now, false);
  assert.deepEqual(report.observations.missing_current_endpoints, []);
  assert.equal(report.observations.version_health_parity_contract_ready, true);
  assert.equal(report.observations.admin_worker_env_proof_contract_ready, true);
  assert.equal(report.observations.cutter_compatibility_proof_contract_ready, true);
  assert.equal(
    report.gates.find((gate) => gate.id === "current-admin-api-contract-parity")?.status,
    "pass"
  );
  assert.equal(
    report.gates.find((gate) => gate.id === "version-health-parity-contract")?.status,
    "pass"
  );
  assert.equal(
    report.gates.find((gate) => gate.id === "admin-worker-env-proof-contract")?.status,
    "pass"
  );
  assert.equal(
    report.gates.find((gate) => gate.id === "cutter-compatibility-proof-contract")?.status,
    "pass"
  );
  assert.equal(
    report.gates.find((gate) => gate.id === "admin-worker-env-external-proof")?.status,
    "needs-external-proof"
  );
  assert.equal(
    report.gates.find((gate) => gate.id === "cutter-compatibility-external-proof")?.status,
    "needs-external-proof"
  );
  assert.ok(report.summary.upload_blockers.includes("admin-worker-env-external-proof"));
  assert.ok(report.summary.upload_blockers.includes("cutter-compatibility-external-proof"));
});
