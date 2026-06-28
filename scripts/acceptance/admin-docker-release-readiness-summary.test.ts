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

function blockedReleaseInputsIntake(): unknown {
  return {
    result: { status: "blocked" },
    intake_complete: false,
    release_inputs_ready: false,
    push_execution_allowed: false,
    docker_deploy_allowed: false,
    summary: {
      intake_blockers: [
        "returned-dir-provided",
        "returned-files-complete",
        "nas-image-proof-accepted"
      ],
      release_input_blockers: [
        "returned-dir-provided",
        "returned-files-complete",
        "release-inputs-ready"
      ]
    }
  };
}

function blockedNasAccessPreflight(): unknown {
  return {
    nas_collection_directly_available: false,
    push_execution_allowed: false,
    docker_deploy_allowed: false,
    result: { status: "blocked" },
    summary: {
      nas_collection_blockers: [
        "ssh-access-available",
        "compose-project-visible-on-smb",
        "returned-evidence-visible"
      ],
      staging_review_blockers: [
        "returned-evidence-visible",
        "staging-admin-port-reachable"
      ]
    }
  };
}

function readyNasHandoffKit(): unknown {
  return {
    kit_ready: true,
    push_execution_allowed: false,
    docker_deploy_allowed: false,
    result: { status: "ready-for-transfer" },
    observations: {
      archive_file: {
        path: "dist/acceptance/admin-docker-nas-handoff-kit.tar.gz",
        sha256: "d".repeat(64),
        size_bytes: 9706
      }
    },
    artifacts: {
      kit_archive_path: "dist/acceptance/admin-docker-nas-handoff-kit.tar.gz",
      kit_archive_sha256: "d".repeat(64)
    },
    summary: {
      kit_blockers: []
    }
  };
}

function blockedNasHandoffKit(): unknown {
  return {
    kit_ready: false,
    push_execution_allowed: false,
    docker_deploy_allowed: false,
    result: { status: "blocked" },
    summary: {
      kit_blockers: ["kit-archive-created"]
    }
  };
}

function readyReleaseInputsIntake(): unknown {
  return {
    result: { status: "intake-complete" },
    intake_complete: true,
    release_inputs_ready: true,
    push_execution_allowed: false,
    docker_deploy_allowed: false,
    observations: {
      returned_precheck_passed: true
    },
    summary: {
      intake_blockers: [],
      release_input_blockers: []
    }
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
    release_inputs_intake_report_path: "intake.json",
    release_inputs_intake_report: blockedReleaseInputsIntake(),
    nas_access_preflight_report_path: "nas-access.json",
    nas_access_preflight_report: blockedNasAccessPreflight(),
    nas_handoff_kit_report_path: "handoff-kit.json",
    nas_handoff_kit_report: readyNasHandoffKit(),
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
  assert.ok(report.summary.release_review_blockers.includes("nas-release-inputs-intake-complete"));
  assert.ok(report.summary.release_review_blockers.includes("release-inputs-ready"));
  assert.ok(report.summary.release_review_blockers.includes("staging-runbook-ready"));
  assert.ok(!report.summary.release_review_blockers.includes("nas-handoff-kit-ready"));
  assert.equal(report.observations.nas_handoff_kit_ready, true);
  assert.equal(report.observations.nas_collection_directly_available, false);
  assert.ok(report.next_actions.some((item) => item.includes("admin-docker-nas-handoff-kit.tar.gz")));
  assert.ok(report.next_actions.some((item) => item.includes("admin-docker-release-inputs/")));
  assert.ok(report.next_actions.some((item) => item.includes("release-input blockers")));
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
    release_inputs_intake_report: readyReleaseInputsIntake(),
    nas_handoff_kit_report: blockedNasHandoffKit(),
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
    release_inputs_intake_report: readyReleaseInputsIntake(),
    staging_runbook_report: unsafeRunbook
  }));

  assert.equal(report.release_review_ready, false);
  assert.ok(report.summary.release_review_blockers.includes("summary-does-not-approve-upload"));
});

test("admin Docker release readiness summary blocks old intake artifacts without returned precheck proof", () => {
  const oldIntake = {
    ...readyReleaseInputsIntake() as Record<string, unknown>,
    observations: {}
  };
  const report = buildAdminDockerReleaseReadinessSummaryReport(reportInput({
    local_docker_smoke_report: passedLocalSmokeReport(),
    live_readonly_report: clearLiveReport(),
    parity_plan_report: clearParityReport(),
    worker_env_proof_report: acceptedProof(),
    cutter_compatibility_proof_report: acceptedProof(),
    release_inputs_intake_report: oldIntake,
    staging_runbook_report: readyRunbook()
  }));

  assert.equal(report.release_review_ready, false);
  assert.ok(report.summary.release_review_blockers.includes("returned-evidence-precheck-passed"));
  assert.match(toMarkdown(report), /returned_precheck_passed=unknown/);
});

test("admin Docker release readiness summary blocks when returned evidence and handoff kit are both missing", () => {
  const report = buildAdminDockerReleaseReadinessSummaryReport(reportInput({
    nas_handoff_kit_report: blockedNasHandoffKit()
  }));

  assert.equal(report.release_review_ready, false);
  assert.ok(report.summary.release_review_blockers.includes("nas-collection-path-prepared"));
  assert.ok(report.summary.release_review_blockers.includes("nas-handoff-kit-ready"));
  assert.ok(report.next_actions.some((item) => item.includes("package:admin-docker-nas-handoff-kit")));
});

test("admin Docker release readiness summary markdown records no-side-effect scope", () => {
  const report = buildAdminDockerReleaseReadinessSummaryReport(reportInput());
  const markdown = toMarkdown(report);

  assert.match(markdown, /reads archived artifacts only/);
  assert.match(markdown, /does not approve Docker upload/);
  assert.match(markdown, /Local Docker smoke/);
  assert.match(markdown, /Release-inputs intake complete/);
  assert.match(markdown, /Live blockers/);
  assert.match(markdown, /NAS handoff kit ready/);
  assert.match(markdown, /admin-docker-nas-handoff-kit\.tar\.gz/);
});

test("admin Docker release readiness summary fails if release-input intake tries to approve push", () => {
  const unsafeIntake = {
    ...readyReleaseInputsIntake() as Record<string, unknown>,
    push_execution_allowed: true
  };
  const report = buildAdminDockerReleaseReadinessSummaryReport(reportInput({
    local_docker_smoke_report: passedLocalSmokeReport(),
    live_readonly_report: clearLiveReport(),
    parity_plan_report: clearParityReport(),
    worker_env_proof_report: acceptedProof(),
    cutter_compatibility_proof_report: acceptedProof(),
    release_inputs_intake_report: unsafeIntake,
    staging_runbook_report: readyRunbook()
  }));

  assert.equal(report.release_review_ready, false);
  assert.ok(report.summary.release_review_blockers.includes("summary-does-not-approve-upload"));
});
