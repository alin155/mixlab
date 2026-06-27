import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminDockerReleaseGateDryRunReport,
  renderMarkdown,
  type AdminDockerReleaseGateDryRunReport
} from "./admin-docker-release-gate-dry-run.ts";
import type { NasDockerComposeStaticReport } from "./nas-docker-compose-static.ts";

function composeStaticOk(): NasDockerComposeStaticReport {
  return {
    ok: true,
    errors: [],
    compose_path: "deploy/nas/mixlab/docker-compose.yml",
    env_example_path: "deploy/nas/mixlab/.env.example"
  };
}

function composeStaticFailed(): NasDockerComposeStaticReport {
  return {
    ok: false,
    errors: [
      "admin-worker standalone workers must default disabled and require explicit opt-in",
      ".env.example MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER must be \"0\""
    ],
    compose_path: "deploy/nas/mixlab/docker-compose.yml",
    env_example_path: "deploy/nas/mixlab/.env.example"
  };
}

function reportWith(composeStatic: NasDockerComposeStaticReport): AdminDockerReleaseGateDryRunReport {
  return buildAdminDockerReleaseGateDryRunReport({
    generated_at: "2026-06-26T20:00:00.000Z",
    command: "npx tsx scripts/acceptance/admin-docker-release-gate-dry-run.ts",
    compose_static: composeStatic
  });
}

test("admin Docker release-gate dry-run blocks upload until live proof exists", () => {
  const report = reportWith(composeStaticOk());

  assert.equal(report.mode, "dry-run-static");
  assert.equal(report.result.status, "blocked");
  assert.equal(report.release_ready, false);
  assert.equal(report.docker_upload_allowed, false);
  assert.equal(report.summary.failed, 0);
  assert.equal(report.summary.blocked, 0);
  assert.equal(report.summary.needs_live_proof, 6);
  assert.equal(report.summary.upload_blockers.length, 6);
  assert.equal(
    report.gates.find((gate) => gate.id === "compose-static-contract")?.status,
    "pass"
  );
  assert.equal(
    report.gates.find((gate) => gate.id === "worker-flags-default-disabled")?.status,
    "pass"
  );
  assert.equal(
    report.gates.find((gate) => gate.id === "usage-events-live-tolerance")?.status,
    "needs-live-proof"
  );
  assert.equal(
    report.gates.find((gate) => gate.id === "docker-health-version-live")?.status,
    "needs-live-proof"
  );
  assert.equal(
    report.gates.every((gate) => gate.status !== "needs-live-proof" || gate.blocks_docker_upload),
    true
  );
});

test("admin Docker release-gate dry-run fails when compose static validation fails", () => {
  const report = reportWith(composeStaticFailed());

  assert.equal(report.result.status, "failed");
  assert.equal(report.release_ready, false);
  assert.equal(report.docker_upload_allowed, false);
  assert.equal(report.summary.failed, 1);
  assert.equal(report.summary.blocked, 6);
  assert.equal(report.summary.needs_live_proof, 6);
  assert.deepEqual(
    report.gates.find((gate) => gate.id === "compose-static-contract")?.errors,
    composeStaticFailed().errors
  );
  assert.equal(
    report.gates.find((gate) => gate.id === "path-isolation-static")?.status,
    "blocked"
  );
  assert.match(report.result.summary, /Static release-gate failures block Docker upload/);
});

test("admin Docker release-gate dry-run markdown records no-side-effect scope", () => {
  const markdown = renderMarkdown(reportWith(composeStaticOk()));

  assert.match(markdown, /does not start Docker, workers, or NAS writes/);
  assert.match(markdown, /release_ready=false/);
  assert.match(markdown, /docker_upload_allowed=false/);
  assert.match(markdown, /Standalone worker flags default disabled/);
  assert.match(markdown, /usage-events tolerance/);
  assert.match(markdown, /usage-events-repair/);
  assert.match(markdown, /V001440 recovery/);
  assert.match(markdown, /processing_recovery/);
  assert.match(markdown, /disk_space_protection/);
  assert.match(markdown, /version_health_parity/);
  assert.match(markdown, /admin_worker_env_proof/);
  assert.match(markdown, /admin-worker-env-proof/);
  assert.match(markdown, /cutter_compatibility_proof/);
  assert.match(markdown, /admin-cutter-compatibility-proof/);
  assert.match(markdown, /Cutter compatibility/);
});

test("admin Docker release-gate dry-run keeps live proof separate from static compose evidence", () => {
  const report = reportWith(composeStaticOk());
  const staticStatuses = report.gates
    .filter((gate) => gate.category === "static")
    .map((gate) => gate.status);
  const liveStatuses = report.gates
    .filter((gate) => gate.category === "live-nas" || gate.category === "live-docker")
    .map((gate) => gate.status);

  assert.equal(staticStatuses.every((status) => status === "pass"), true);
  assert.equal(liveStatuses.every((status) => status === "needs-live-proof"), true);
  assert.equal(
    report.gates.some((gate) =>
      gate.required_live_evidence?.includes("archive") ||
        gate.required_live_evidence?.includes("Capture")
    ),
    true
  );
});
