import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminDockerReleaseReadinessSummaryReport,
  toMarkdown
} from "./admin-docker-release-readiness-summary.ts";

function blockedLiveReport(): unknown {
  return {
    result: { status: "blocked" },
    summary: {
      upload_blockers: ["current-admin-api-contract-live", "preprocess-disk"]
    }
  };
}

function blockedLocalSmokeReport(): unknown {
  return {
    local_smoke_passed: false,
    result: { status: "blocked" },
    summary: {
      local_smoke_blockers: [
        "explicit-run-requested",
        "docker-cli-available",
        "docker-compose-available"
      ]
    }
  };
}

function passedLocalSmokeReport(): unknown {
  return {
    local_smoke_passed: true,
    result: { status: "accepted" },
    summary: {
      local_smoke_blockers: []
    }
  };
}

function clearLiveReport(): unknown {
  return {
    result: { status: "ready" },
    summary: {
      upload_blockers: []
    }
  };
}

function blockedParityReport(): unknown {
  return {
    result: { status: "blocked" },
    summary: {
      upload_blockers: [
        "current-admin-api-contract-parity",
        "nas-disk-risk",
        "admin-worker-env-external-proof",
        "cutter-compatibility-proof-contract",
        "cutter-compatibility-external-proof"
      ]
    }
  };
}

function clearParityReport(): unknown {
  return {
    result: { status: "blocked" },
    summary: {
      upload_blockers: []
    }
  };
}

function blockedProof(blockers: string[]): unknown {
  return {
    proof_accepted: false,
    result: { status: "blocked" },
    summary: { upload_blockers: blockers }
  };
}

function acceptedProof(): unknown {
  return {
    proof_accepted: true,
    result: { status: "accepted" },
    summary: { upload_blockers: [] }
  };
}

function blockedRunbook(): unknown {
  return {
    result: { status: "blocked" },
    staging_review_ready: false,
    docker_deploy_allowed: false,
    observations: {
      unresolved_parity_upload_blockers: [
        "current-admin-api-contract-parity",
        "nas-disk-risk"
      ],
      resolved_external_parity_blockers: []
    },
    summary: {
      staging_blockers: [
        "current-image-tag-provided",
        "local-docker-smoke-passed",
        "target-tag-matches-smoked-image",
        "parity-report-blockers-clear",
        "candidate-contract-proof-accepted",
        "image-push-explicitly-approved",
        "worker-env-proof-accepted",
        "cutter-compatibility-proof-accepted"
      ]
    }
  };
}

function readyRunbook(): unknown {
  return {
    result: { status: "ready-for-staging-review" },
    staging_review_ready: true,
    docker_deploy_allowed: false,
    observations: {
      unresolved_parity_upload_blockers: [],
      resolved_external_parity_blockers: [
        "admin-worker-env-external-proof",
        "cutter-compatibility-external-proof"
      ]
    },
    summary: {
      staging_blockers: []
    }
  };
}

function reportInput(overrides: Partial<Parameters<typeof buildAdminDockerReleaseReadinessSummaryReport>[0]> = {}) {
  return {
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    local_docker_smoke_report_path: "local-smoke.json",
    local_docker_smoke_report: blockedLocalSmokeReport(),
    live_readonly_report_path: "live.json",
    live_readonly_report: blockedLiveReport(),
    parity_plan_report_path: "parity.json",
    parity_plan_report: blockedParityReport(),
    worker_env_proof_report_path: "worker.json",
    worker_env_proof_report: blockedProof(["env-file-provided"]),
    cutter_compatibility_proof_report_path: "cutter.json",
    cutter_compatibility_proof_report: blockedProof(["windows-acceptance-report-provided"]),
    staging_runbook_report_path: "runbook.json",
    staging_runbook_report: blockedRunbook(),
    ...overrides
  };
}

test("admin Docker release readiness summary stays blocked when evidence gates are blocked", () => {
  const report = buildAdminDockerReleaseReadinessSummaryReport(reportInput());

  assert.equal(report.release_review_ready, false);
  assert.equal(report.docker_upload_allowed, false);
  assert.equal(report.result.status, "blocked");
  assert.ok(report.summary.release_review_blockers.includes("local-docker-smoke-passed"));
  assert.ok(report.summary.release_review_blockers.includes("live-readonly-blockers-clear"));
  assert.ok(report.summary.release_review_blockers.includes("parity-plan-blockers-clear"));
  assert.ok(report.summary.release_review_blockers.includes("worker-proof-accepted"));
  assert.ok(report.summary.release_review_blockers.includes("cutter-proof-accepted"));
  assert.ok(report.summary.release_review_blockers.includes("staging-runbook-ready"));
  assert.ok(report.next_actions.some((item) => item.includes("NAS disk pressure")));
  assert.ok(report.next_actions.some((item) => item.includes("local smoke")));
  assert.ok(report.next_actions.some((item) => item.includes("push_images=true")));
  assert.ok(report.next_actions.some((item) => item.includes("build_identity.image_tag")));
  assert.ok(report.next_actions.some((item) => item.includes("cutter_compatibility_proof")));
  assert.ok(report.next_actions.some((item) => item.includes("admin-docker-candidate-contract-proof")));
});

test("admin Docker release readiness summary can become ready for separate release decision", () => {
  const report = buildAdminDockerReleaseReadinessSummaryReport(reportInput({
    local_docker_smoke_report: passedLocalSmokeReport(),
    live_readonly_report: clearLiveReport(),
    parity_plan_report: clearParityReport(),
    worker_env_proof_report: acceptedProof(),
    cutter_compatibility_proof_report: acceptedProof(),
    staging_runbook_report: readyRunbook()
  }));

  assert.equal(report.release_review_ready, true);
  assert.equal(report.docker_upload_allowed, false);
  assert.equal(report.result.status, "ready-for-release-decision");
  assert.deepEqual(report.summary.release_review_blockers, []);
  assert.ok(report.next_actions.some((item) => item.includes("separate release decision")));
});

test("admin Docker release readiness summary blocks if a source report tries to approve upload", () => {
  const unsafeRunbook = {
    ...readyRunbook() as Record<string, unknown>,
    docker_deploy_allowed: true
  };
  const report = buildAdminDockerReleaseReadinessSummaryReport(reportInput({
    live_readonly_report: clearLiveReport(),
    parity_plan_report: clearParityReport(),
    worker_env_proof_report: acceptedProof(),
    cutter_compatibility_proof_report: acceptedProof(),
    staging_runbook_report: unsafeRunbook
  }));

  assert.equal(report.release_review_ready, false);
  assert.ok(report.summary.release_review_blockers.includes("summary-does-not-approve-upload"));
});

test("admin Docker release readiness summary markdown records no-side-effect scope", () => {
  const report = buildAdminDockerReleaseReadinessSummaryReport(reportInput());
  const markdown = toMarkdown(report);

  assert.match(markdown, /reads archived artifacts only/);
  assert.match(markdown, /does not approve Docker upload/);
  assert.match(markdown, /Local Docker smoke/);
  assert.match(markdown, /Live blockers/);
});
