import assert from "node:assert/strict";
import test from "node:test";

import { buildAdminDockerStagingRunbookReport } from "./admin-docker-staging-runbook.ts";

function blockedParityReport(): unknown {
  return {
    decision: {
      docker_image_update_required: true
    },
    summary: {
      upload_blockers: [
        "current-admin-api-contract-parity",
        "nas-disk-risk",
        "admin-worker-env-external-proof",
        "cutter-compatibility-external-proof"
      ]
    },
    result: {
      status: "blocked"
    }
  };
}

function acceptedWorkerProof(): unknown {
  return {
    proof_accepted: true,
    summary: {
      upload_blockers: []
    },
    result: {
      status: "accepted"
    }
  };
}

function acceptedCutterProof(): unknown {
  return {
    proof_accepted: true,
    summary: {
      upload_blockers: []
    },
    result: {
      status: "accepted"
    }
  };
}

function acceptedCandidateProof(): unknown {
  return {
    candidate_contract_ready: true,
    summary: {
      candidate_review_blockers: []
    },
    result: {
      status: "ready-for-candidate-review"
    }
  };
}

function blockedCandidateProof(): unknown {
  return {
    candidate_contract_ready: false,
    summary: {
      candidate_review_blockers: [
        "candidate-target-configured",
        "candidate-current-admin-api-contract"
      ]
    },
    result: {
      status: "blocked"
    }
  };
}

function blockedWorkerProof(): unknown {
  return {
    proof_accepted: false,
    summary: {
      upload_blockers: ["env-file-provided", "inspect-json-provided"]
    },
    result: {
      status: "blocked"
    }
  };
}

function blockedCutterProof(): unknown {
  return {
    proof_accepted: false,
    summary: {
      upload_blockers: ["windows-acceptance-report-provided", "real-cut-report-provided"]
    },
    result: {
      status: "blocked"
    }
  };
}

function clearParityReport(): unknown {
  return {
    decision: {
      docker_image_update_required: true
    },
    summary: {
      upload_blockers: []
    },
    result: {
      status: "blocked"
    }
  };
}

function acceptedLocalSmokeReport(imageTag = "new-tag"): unknown {
  return {
    local_smoke_passed: true,
    build_identity: {
      image_tag: imageTag,
      build_sha: "smoked-sha",
      build_version: "smoked-version",
      mvp_mode: "v0.1"
    },
    summary: {
      local_smoke_blockers: []
    },
    result: {
      status: "accepted"
    }
  };
}

function blockedLocalSmokeReport(): unknown {
  return {
    local_smoke_passed: false,
    build_identity: {
      image_tag: "unsmoked-tag",
      build_sha: "unsmoked-sha",
      build_version: "unsmoked-version",
      mvp_mode: "v0.1"
    },
    summary: {
      local_smoke_blockers: ["docker-cli-available"]
    },
    result: {
      status: "blocked"
    }
  };
}

test("admin Docker staging runbook stays blocked when tags and release evidence are missing", () => {
  const report = buildAdminDockerStagingRunbookReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    local_docker_smoke_report_path: "local-smoke.json",
    local_docker_smoke_report: blockedLocalSmokeReport(),
    parity_plan_report_path: "parity.json",
    parity_plan_report: blockedParityReport(),
    candidate_contract_proof_report_path: "candidate.json",
    candidate_contract_proof_report: blockedCandidateProof(),
    worker_env_proof_report_path: "worker.json",
    worker_env_proof_report: blockedWorkerProof(),
    cutter_compatibility_proof_report_path: "cutter.json",
    cutter_compatibility_proof_report: blockedCutterProof()
  });

  assert.equal(report.staging_review_ready, false);
  assert.equal(report.docker_deploy_allowed, false);
  assert.equal(report.result.status, "blocked");
  assert.ok(report.summary.staging_blockers.includes("current-image-tag-provided"));
  assert.ok(report.summary.staging_blockers.includes("target-image-tag-provided"));
  assert.ok(report.summary.staging_blockers.includes("rollback-image-tag-provided"));
  assert.ok(report.summary.staging_blockers.includes("image-push-explicitly-approved"));
  assert.ok(report.summary.staging_blockers.includes("local-docker-smoke-passed"));
  assert.ok(report.summary.staging_blockers.includes("target-tag-matches-smoked-image"));
  assert.ok(report.summary.staging_blockers.includes("parity-report-blockers-clear"));
  assert.ok(report.summary.staging_blockers.includes("candidate-contract-proof-accepted"));
  assert.ok(report.summary.staging_blockers.includes("worker-env-proof-accepted"));
  assert.ok(report.summary.staging_blockers.includes("cutter-compatibility-proof-accepted"));
  assert.ok(report.runbook.stage_update.some((line) => line.includes("<target-tag>")));
});

test("admin Docker staging runbook requires rollback tag to match current tag", () => {
  const report = buildAdminDockerStagingRunbookReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    local_docker_smoke_report_path: "local-smoke.json",
    local_docker_smoke_report: acceptedLocalSmokeReport(),
    parity_plan_report_path: "parity.json",
    parity_plan_report: clearParityReport(),
    candidate_contract_proof_report_path: "candidate.json",
    candidate_contract_proof_report: acceptedCandidateProof(),
    worker_env_proof_report_path: "worker.json",
    worker_env_proof_report: acceptedWorkerProof(),
    cutter_compatibility_proof_report_path: "cutter.json",
    cutter_compatibility_proof_report: acceptedCutterProof(),
    current_image_tag: "old-tag",
    target_image_tag: "new-tag",
    rollback_image_tag: "different-old-tag",
    image_push_approval: "workflow_dispatch:push_images=true"
  });

  assert.equal(report.staging_review_ready, false);
  assert.ok(report.summary.staging_blockers.includes("rollback-tag-matches-current"));
});

test("admin Docker staging runbook can become ready for staging review without approving deploy", () => {
  const report = buildAdminDockerStagingRunbookReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    local_docker_smoke_report_path: "local-smoke.json",
    local_docker_smoke_report: acceptedLocalSmokeReport(),
    parity_plan_report_path: "parity.json",
    parity_plan_report: clearParityReport(),
    candidate_contract_proof_report_path: "candidate.json",
    candidate_contract_proof_report: acceptedCandidateProof(),
    worker_env_proof_report_path: "worker.json",
    worker_env_proof_report: acceptedWorkerProof(),
    cutter_compatibility_proof_report_path: "cutter.json",
    cutter_compatibility_proof_report: acceptedCutterProof(),
    current_image_tag: "old-tag",
    target_image_tag: "new-tag",
    rollback_image_tag: "old-tag",
    image_push_approval: "workflow_dispatch:push_images=true"
  });

  assert.equal(report.staging_review_ready, true);
  assert.equal(report.docker_deploy_allowed, false);
  assert.equal(report.image_push_approval.accepted, true);
  assert.equal(report.observations.target_tag_matches_local_smoke, true);
  assert.equal(report.result.status, "ready-for-staging-review");
  assert.deepEqual(report.summary.staging_blockers, []);
  assert.ok(report.runbook.stage_update.some((line) => line.includes("MIXLAB_IMAGE_TAG=new-tag")));
  assert.ok(report.runbook.rollback.some((line) => line.includes("MIXLAB_IMAGE_TAG=old-tag")));
  assert.ok(report.runbook.preflight.some((line) => line.includes("candidate API/version contract proof")));
  assert.ok(report.runbook.post_update_validation.some((line) => line.includes("candidate contract proof")));
  assert.ok(report.runbook.post_update_validation.some((line) => line.includes("Cutter")));
});

test("admin Docker staging runbook resolves external parity blockers only when accepted proofs exist", () => {
  const report = buildAdminDockerStagingRunbookReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    local_docker_smoke_report_path: "local-smoke.json",
    local_docker_smoke_report: acceptedLocalSmokeReport(),
    parity_plan_report_path: "parity.json",
    parity_plan_report: blockedParityReport(),
    candidate_contract_proof_report_path: "candidate.json",
    candidate_contract_proof_report: acceptedCandidateProof(),
    worker_env_proof_report_path: "worker.json",
    worker_env_proof_report: acceptedWorkerProof(),
    cutter_compatibility_proof_report_path: "cutter.json",
    cutter_compatibility_proof_report: acceptedCutterProof(),
    current_image_tag: "old-tag",
    target_image_tag: "new-tag",
    rollback_image_tag: "old-tag",
    image_push_approval: "workflow_dispatch:push_images=true"
  });

  assert.equal(report.staging_review_ready, false);
  assert.deepEqual(report.observations.resolved_external_parity_blockers, [
    "admin-worker-env-external-proof",
    "cutter-compatibility-external-proof"
  ]);
  assert.deepEqual(report.observations.unresolved_parity_upload_blockers, [
    "current-admin-api-contract-parity",
    "nas-disk-risk"
  ]);
  assert.ok(report.summary.staging_blockers.includes("parity-report-blockers-clear"));
  assert.ok(!report.summary.staging_blockers.includes("candidate-contract-proof-accepted"));
  assert.ok(!report.summary.staging_blockers.includes("worker-env-proof-accepted"));
  assert.ok(!report.summary.staging_blockers.includes("cutter-compatibility-proof-accepted"));
});

test("admin Docker staging runbook blocks when Cutter compatibility proof is missing even if parity is otherwise clear", () => {
  const report = buildAdminDockerStagingRunbookReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    local_docker_smoke_report_path: "local-smoke.json",
    local_docker_smoke_report: acceptedLocalSmokeReport(),
    parity_plan_report_path: "parity.json",
    parity_plan_report: clearParityReport(),
    candidate_contract_proof_report_path: "candidate.json",
    candidate_contract_proof_report: acceptedCandidateProof(),
    worker_env_proof_report_path: "worker.json",
    worker_env_proof_report: acceptedWorkerProof(),
    cutter_compatibility_proof_report_path: "cutter.json",
    cutter_compatibility_proof_report: blockedCutterProof(),
    current_image_tag: "old-tag",
    target_image_tag: "new-tag",
    rollback_image_tag: "old-tag",
    image_push_approval: "workflow_dispatch:push_images=true"
  });

  assert.equal(report.staging_review_ready, false);
  assert.ok(report.summary.staging_blockers.includes("cutter-compatibility-proof-accepted"));
  assert.deepEqual(report.observations.cutter_upload_blockers, [
    "windows-acceptance-report-provided",
    "real-cut-report-provided"
  ]);
});

test("admin Docker staging runbook blocks when candidate contract proof is missing", () => {
  const report = buildAdminDockerStagingRunbookReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    local_docker_smoke_report_path: "local-smoke.json",
    local_docker_smoke_report: acceptedLocalSmokeReport(),
    parity_plan_report_path: "parity.json",
    parity_plan_report: clearParityReport(),
    candidate_contract_proof_report_path: "candidate.json",
    candidate_contract_proof_report: blockedCandidateProof(),
    worker_env_proof_report_path: "worker.json",
    worker_env_proof_report: acceptedWorkerProof(),
    cutter_compatibility_proof_report_path: "cutter.json",
    cutter_compatibility_proof_report: acceptedCutterProof(),
    current_image_tag: "old-tag",
    target_image_tag: "new-tag",
    rollback_image_tag: "old-tag",
    image_push_approval: "workflow_dispatch:push_images=true"
  });

  assert.equal(report.staging_review_ready, false);
  assert.ok(report.summary.staging_blockers.includes("candidate-contract-proof-accepted"));
  assert.deepEqual(report.observations.candidate_contract_blockers, [
    "candidate-target-configured",
    "candidate-current-admin-api-contract"
  ]);
});

test("admin Docker staging runbook blocks without explicit workflow push approval", () => {
  const report = buildAdminDockerStagingRunbookReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    local_docker_smoke_report_path: "local-smoke.json",
    local_docker_smoke_report: acceptedLocalSmokeReport(),
    parity_plan_report_path: "parity.json",
    parity_plan_report: clearParityReport(),
    candidate_contract_proof_report_path: "candidate.json",
    candidate_contract_proof_report: acceptedCandidateProof(),
    worker_env_proof_report_path: "worker.json",
    worker_env_proof_report: acceptedWorkerProof(),
    cutter_compatibility_proof_report_path: "cutter.json",
    cutter_compatibility_proof_report: acceptedCutterProof(),
    current_image_tag: "old-tag",
    target_image_tag: "new-tag",
    rollback_image_tag: "old-tag"
  });

  assert.equal(report.staging_review_ready, false);
  assert.equal(report.image_push_approval.accepted, false);
  assert.ok(report.summary.staging_blockers.includes("image-push-explicitly-approved"));
});

test("admin Docker staging runbook blocks when target tag differs from smoked image tag", () => {
  const report = buildAdminDockerStagingRunbookReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    local_docker_smoke_report_path: "local-smoke.json",
    local_docker_smoke_report: acceptedLocalSmokeReport("smoked-tag"),
    parity_plan_report_path: "parity.json",
    parity_plan_report: clearParityReport(),
    candidate_contract_proof_report_path: "candidate.json",
    candidate_contract_proof_report: acceptedCandidateProof(),
    worker_env_proof_report_path: "worker.json",
    worker_env_proof_report: acceptedWorkerProof(),
    cutter_compatibility_proof_report_path: "cutter.json",
    cutter_compatibility_proof_report: acceptedCutterProof(),
    current_image_tag: "old-tag",
    target_image_tag: "different-target-tag",
    rollback_image_tag: "old-tag",
    image_push_approval: "workflow_dispatch:push_images=true"
  });

  assert.equal(report.staging_review_ready, false);
  assert.equal(report.observations.target_tag_matches_local_smoke, false);
  assert.ok(report.summary.staging_blockers.includes("target-tag-matches-smoked-image"));
});
