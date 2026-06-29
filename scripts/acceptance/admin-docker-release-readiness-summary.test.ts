import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildAdminDockerReleaseReadinessSummaryReport,
  latestTargetedLiveReadonlyArtifact,
  toMarkdown
} from "./admin-docker-release-readiness-summary.ts";

const TARGET_SHA = "b062bc387c1fdb2a391320c1c36233b782cb000a";

function blockedLiveReport(): unknown {
  return {
    result: { status: "blocked" },
    summary: {
      upload_blockers: ["current-admin-api-contract-live", "preprocess-disk"]
    }
  };
}

async function writeReport(filePath: string, report: unknown): Promise<string> {
  await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`);
  return filePath;
}

function targetedLiveReport(): unknown {
  return {
    target: {
      base_url: "http://192.168.1.27:18080",
      configured: true,
      kind: "admin-web-url",
      safe_to_probe: true
    },
    result: { status: "blocked" },
    summary: {
      upload_blockers: ["current-admin-api-contract-live"]
    }
  };
}

function untargetedLiveReport(): unknown {
  return {
    target: {
      base_url: "",
      configured: false,
      kind: "not-configured",
      safe_to_probe: false
    },
    result: { status: "blocked" },
    summary: {
      upload_blockers: ["target-url-configured"]
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

test("admin Docker release readiness summary prefers targeted live artifact over newer untargeted output", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-readiness-live-picker-"));
  const targetedPath = await writeReport(
    path.join(tempRoot, "admin-docker-release-live-readonly-20260628T010000Z.json"),
    targetedLiveReport()
  );
  await writeReport(
    path.join(tempRoot, "admin-docker-release-live-readonly-20260628T020000Z.json"),
    untargetedLiveReport()
  );

  assert.equal(await latestTargetedLiveReadonlyArtifact(tempRoot), targetedPath);
});

function passedLocalSmokeReport(): unknown {
  return {
    local_smoke_passed: true,
    result: { status: "accepted" },
    summary: {
      local_smoke_blockers: []
    }
  };
}

function blockedGithubArtifactReadiness(): unknown {
  return {
    github_candidate_artifact_ready: false,
    staging_handoff_ready: false,
    docker_deploy_allowed: false,
    result: { status: "blocked" },
    observations: {}
  };
}

function readyGithubArtifactReadiness(): unknown {
  return {
    github_candidate_artifact_ready: true,
    staging_handoff_ready: false,
    docker_deploy_allowed: false,
    result: { status: "candidate-ready" },
    observations: {
      local_smoke_image_tag: TARGET_SHA,
      local_smoke_build_sha: TARGET_SHA
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

function workerProofWithAcceptedRemediationReview(): unknown {
  return {
    proof_accepted: false,
    result: { status: "blocked" },
    remediation_review: {
      status: "accepted-for-runtime-owner-action",
      accepted: true,
      runtime_action_allowed: false,
      docker_deploy_allowed: false,
      blockers: []
    },
    summary: {
      upload_blockers: [
        "env-file-worker-flags-disabled",
        "inspect-worker-flags-disabled",
        "admin-worker-library-roots"
      ]
    }
  };
}

function readyCutterStagedPlan(): unknown {
  return {
    plan_ready: true,
    result: { status: "ready-for-staged-cutter-proof" },
    inputs: {
      candidate_image_tag: TARGET_SHA
    },
    summary: {
      plan_blockers: []
    }
  };
}

function blockedCutterStagedPlan(): unknown {
  return {
    plan_ready: false,
    result: { status: "blocked" },
    inputs: {},
    summary: {
      plan_blockers: ["candidate-image-tag-provided"]
    }
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
    observations: {
      returned_precheck_passed: true,
      legacy_rollback_exception_ready: true,
      legacy_rollback_exception_accepted: false,
      legacy_rollback_exception_blockers: ["legacy-rollback-exception-approved"]
    },
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

function readyPushDecisionPackage(): unknown {
  return {
    push_decision_package_ready: true,
    push_execution_allowed: false,
    docker_deploy_allowed: false,
    release_decision_required: true,
    result: { status: "ready-for-external-release-decision" },
    summary: {
      package_blockers: [],
      push_execution_blockers: ["external-release-decision-required"],
      docker_deploy_blockers: ["external-release-decision-required"]
    }
  };
}

function reportInput(overrides: Partial<Parameters<typeof buildAdminDockerReleaseReadinessSummaryReport>[0]> = {}) {
  return {
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    local_docker_smoke_report_path: "local-smoke.json",
    local_docker_smoke_report: blockedLocalSmokeReport(),
    github_artifact_readiness_report_path: "github-artifact.json",
    github_artifact_readiness_report: blockedGithubArtifactReadiness(),
    live_readonly_report_path: "live.json",
    live_readonly_report: blockedLiveReport(),
    parity_plan_report_path: "parity.json",
    parity_plan_report: blockedParityReport(),
    worker_env_proof_report_path: "worker.json",
    worker_env_proof_report: blockedProof(["env-file-provided"]),
    cutter_staged_proof_plan_report_path: "cutter-staged-plan.json",
    cutter_staged_proof_plan_report: readyCutterStagedPlan(),
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
  assert.equal(report.automation_boundary.safe_local_progress_allowed, true);
  assert.equal(report.automation_boundary.nas_runtime_changes_allowed, false);
  assert.equal(report.automation_boundary.image_push_allowed, false);
  assert.equal(report.automation_boundary.docker_deploy_allowed, false);
  assert.equal(report.automation_boundary.release_approval_required, true);
  assert.equal(report.automation_boundary.nas_operator_or_runtime_action_required, true);
  assert.equal(report.automation_boundary.windows_staged_candidate_required, true);
  assert.ok(report.automation_boundary.reasons_requiring_external_action.some((item) => item.includes("Explicit release approval")));
  assert.ok(report.automation_boundary.reasons_requiring_external_action.some((item) => item.includes("NAS disk pressure")));
  assert.ok(report.automation_boundary.safe_local_next_actions.some((item) => item.includes("handoff kit")));
  assert.ok(report.automation_boundary.blocked_actions.some((item) => item.includes("push_images=true")));
  assert.ok(report.automation_boundary.blocked_actions.some((item) => item.includes("NAS Docker .env")));
  assert.ok(report.next_actions.some((item) => item.includes("admin-docker-nas-handoff-kit.tar.gz")));
  assert.ok(report.next_actions.some((item) => item.includes("admin-docker-release-inputs/")));
  assert.ok(report.next_actions.some((item) => item.includes("release-input blockers")));
  assert.equal(report.observations.legacy_rollback_exception_ready, true);
  assert.equal(report.observations.legacy_rollback_exception_accepted, false);
  assert.ok(report.next_actions.some((item) => item.includes("release-manager role review")));
  assert.ok(report.next_actions.some((item) => item.includes("NAS disk pressure")));
  assert.ok(report.next_actions.some((item) => item.includes("local smoke")));
  assert.ok(report.next_actions.some((item) => item.includes("push_images=true")));
  assert.ok(report.next_actions.some((item) => item.includes("accepted candidate image tag")));
  assert.equal(report.observations.cutter_staged_plan_ready, true);
  assert.equal(report.observations.cutter_staged_plan_candidate_image_tag, TARGET_SHA);
  assert.ok(report.summary.release_review_blockers.includes("cutter-proof-accepted"));
  assert.ok(!report.summary.release_review_blockers.includes("cutter-staged-proof-plan-ready"));
  assert.ok(report.next_actions.some((item) => item.includes("prepared staged Cutter proof plan")));
  assert.ok(report.next_actions.some((item) => item.includes("admin-docker-candidate-contract-proof")));
});

test("admin Docker release readiness summary records the prepared push decision package without approving upload", () => {
  const report = buildAdminDockerReleaseReadinessSummaryReport(reportInput({
    github_artifact_readiness_report: readyGithubArtifactReadiness(),
    release_inputs_intake_report: readyReleaseInputsIntake(),
    push_decision_package_report_path: "push-decision.json",
    push_decision_package_report: readyPushDecisionPackage()
  }));

  assert.equal(report.release_review_ready, false);
  assert.equal(report.docker_upload_allowed, false);
  assert.equal(report.sources.push_decision_package_report, "push-decision.json");
  assert.equal(report.observations.push_decision_package_ready, true);
  assert.equal(report.observations.push_decision_push_allowed, false);
  assert.equal(report.observations.push_decision_deploy_allowed, false);
  assert.ok(!report.summary.release_review_blockers.includes("push-decision-package-prepared"));
  assert.ok(report.summary.release_review_blockers.includes("staging-runbook-ready"));
  assert.ok(report.next_actions.some((item) => item.includes("push decision package")));
  assert.ok(report.automation_boundary.safe_local_next_actions.some((item) => item.includes("push decision package")));
  assert.match(toMarkdown(report), /Push decision package ready: true/);
});

test("admin Docker release readiness summary surfaces accepted worker remediation handoff without clearing proof", () => {
  const report = buildAdminDockerReleaseReadinessSummaryReport(reportInput({
    worker_env_proof_report: workerProofWithAcceptedRemediationReview()
  }));

  assert.equal(report.release_review_ready, false);
  assert.ok(report.summary.release_review_blockers.includes("worker-proof-accepted"));
  assert.equal(report.observations.worker_remediation_review_status, "accepted-for-runtime-owner-action");
  assert.equal(report.observations.worker_remediation_review_accepted, true);
  assert.equal(report.observations.worker_remediation_runtime_action_allowed, false);
  assert.ok(report.next_actions.some((item) => item.includes("accepted admin-worker remediation handoff")));
  assert.ok(report.automation_boundary.safe_local_next_actions.some((item) => item.includes("accepted admin-worker remediation handoff")));
  assert.match(toMarkdown(report), /Worker remediation review: status=accepted-for-runtime-owner-action/);
});

test("admin Docker release readiness summary records missing staged Cutter plan without clearing final proof", () => {
  const report = buildAdminDockerReleaseReadinessSummaryReport(reportInput({
    cutter_staged_proof_plan_report_path: "",
    cutter_staged_proof_plan_report: blockedCutterStagedPlan()
  }));

  assert.equal(report.release_review_ready, false);
  assert.equal(report.observations.cutter_staged_plan_ready, false);
  assert.deepEqual(report.observations.cutter_staged_plan_blockers, ["candidate-image-tag-provided"]);
  assert.ok(report.summary.release_review_blockers.includes("cutter-proof-accepted"));
  assert.ok(report.next_actions.some((item) => item.includes("Prepare a staged Cutter proof plan")));
});

test("admin Docker release readiness summary accepts GitHub candidate artifact when Mac local Docker is unavailable", () => {
  const report = buildAdminDockerReleaseReadinessSummaryReport(reportInput({
    github_artifact_readiness_report: readyGithubArtifactReadiness()
  }));

  assert.equal(report.release_review_ready, false);
  assert.ok(!report.summary.release_review_blockers.includes("local-docker-smoke-passed"));
  assert.equal(report.observations.local_smoke_passed, false);
  assert.equal(report.observations.github_candidate_artifact_ready, true);
  assert.equal(report.observations.github_candidate_image_tag, TARGET_SHA);
  assert.ok(!report.next_actions.some((item) => item.includes("Docker CLI and Docker Compose")));
  assert.ok(report.next_actions.some((item) => item.includes("Regenerate the staging runbook")));
  assert.ok(report.next_actions.some((item) => item.includes(TARGET_SHA)));
});

test("admin Docker release readiness summary tolerates missing GitHub artifact readiness during workflow generation", () => {
  const report = buildAdminDockerReleaseReadinessSummaryReport(reportInput({
    local_docker_smoke_report: passedLocalSmokeReport(),
    github_artifact_readiness_report_path: "",
    github_artifact_readiness_report: {}
  }));

  assert.equal(report.release_review_ready, false);
  assert.ok(!report.summary.release_review_blockers.includes("local-docker-smoke-passed"));
  assert.equal(report.sources.github_artifact_readiness_report, "");
  assert.equal(report.observations.github_candidate_artifact_ready, null);
  assert.equal(report.observations.github_candidate_image_tag, "");
  assert.match(toMarkdown(report), /GitHub artifact readiness: $/m);
});

test("admin Docker release readiness summary records missing NAS collection evidence as blocked", () => {
  const report = buildAdminDockerReleaseReadinessSummaryReport(reportInput({
    local_docker_smoke_report: passedLocalSmokeReport(),
    github_artifact_readiness_report_path: "",
    github_artifact_readiness_report: {},
    nas_access_preflight_report_path: "",
    nas_access_preflight_report: {},
    nas_handoff_kit_report_path: "",
    nas_handoff_kit_report: {}
  }));

  assert.equal(report.release_review_ready, false);
  assert.ok(report.summary.release_review_blockers.includes("nas-collection-path-prepared"));
  assert.ok(report.summary.release_review_blockers.includes("nas-handoff-kit-ready"));
  assert.ok(report.summary.release_review_blockers.includes("summary-does-not-approve-upload"));
  assert.equal(report.sources.nas_access_preflight_report, "");
  assert.equal(report.sources.nas_handoff_kit_report, "");
  assert.equal(report.observations.nas_collection_directly_available, null);
  assert.equal(report.observations.nas_handoff_kit_ready, null);
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
  assert.equal(report.automation_boundary.safe_local_progress_allowed, true);
  assert.equal(report.automation_boundary.image_push_allowed, false);
  assert.equal(report.automation_boundary.docker_deploy_allowed, false);
  assert.equal(report.automation_boundary.release_approval_required, true);
  assert.equal(report.automation_boundary.nas_operator_or_runtime_action_required, false);
  assert.equal(report.automation_boundary.windows_staged_candidate_required, false);
  assert.equal(report.automation_boundary.reasons_requiring_external_action.length, 1);
  assert.ok(report.automation_boundary.reasons_requiring_external_action[0]?.includes("Separate release decision"));
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

test("admin Docker release readiness summary blocks if GitHub artifact tries to approve deploy", () => {
  const unsafeGithubArtifact = {
    ...readyGithubArtifactReadiness() as Record<string, unknown>,
    docker_deploy_allowed: true
  };
  const report = buildAdminDockerReleaseReadinessSummaryReport(reportInput({
    local_docker_smoke_report: passedLocalSmokeReport(),
    github_artifact_readiness_report: unsafeGithubArtifact,
    live_readonly_report: clearLiveReport(),
    parity_plan_report: clearParityReport(),
    worker_env_proof_report: acceptedProof(),
    cutter_compatibility_proof_report: acceptedProof(),
    release_inputs_intake_report: readyReleaseInputsIntake(),
    staging_runbook_report: readyRunbook()
  }));

  assert.equal(report.release_review_ready, false);
  assert.ok(report.summary.release_review_blockers.includes("summary-does-not-approve-upload"));
});

test("admin Docker release readiness summary blocks if push decision package tries to approve upload", () => {
  const unsafePackage = {
    ...readyPushDecisionPackage() as Record<string, unknown>,
    push_execution_allowed: true
  };
  const report = buildAdminDockerReleaseReadinessSummaryReport(reportInput({
    local_docker_smoke_report: passedLocalSmokeReport(),
    live_readonly_report: clearLiveReport(),
    parity_plan_report: clearParityReport(),
    worker_env_proof_report: acceptedProof(),
    cutter_compatibility_proof_report: acceptedProof(),
    release_inputs_intake_report: readyReleaseInputsIntake(),
    staging_runbook_report: readyRunbook(),
    push_decision_package_report_path: "push-decision.json",
    push_decision_package_report: unsafePackage
  }));

  assert.equal(report.release_review_ready, false);
  assert.ok(report.summary.release_review_blockers.includes("summary-does-not-approve-upload"));
  assert.match(toMarkdown(report), /push_allowed=true/);
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
  assert.match(markdown, /GitHub candidate artifact ready/);
  assert.match(markdown, /Cutter staged proof plan/);
  assert.match(markdown, /Cutter staged plan ready: true/);
  assert.match(markdown, /Release-inputs intake complete/);
  assert.match(markdown, /Automation Boundary/);
  assert.match(markdown, /NAS runtime changes allowed: no/);
  assert.match(markdown, /Image push allowed: no/);
  assert.match(markdown, /Blocked actions/);
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
