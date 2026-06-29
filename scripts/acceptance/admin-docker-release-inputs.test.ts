import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildAdminDockerReleaseInputsReport,
  runAdminDockerReleaseInputs,
  toMarkdown
} from "./admin-docker-release-inputs.ts";

const TARGET_TAG = "ff05c8a4e4b88463fc0227ee173ba859d85a41be";
const CURRENT_TAG = "acf896c6d16ec1503237f3afa854afff60a191b3";
const LEGACY_APPROVAL = "release-manager:legacy-latest-rollback-exception=accepted";
const TARGET_RELEASE_REF = `admin-docker-candidate-${TARGET_TAG}`;
const CURRENT_RELEASE_REF = `admin-docker-candidate-${CURRENT_TAG}`;

function handoff(overrides: Record<string, unknown> = {}): unknown {
  return {
    mode: "admin-docker-prestaging-handoff",
    ready_to_request_release_inputs: true,
    staging_execution_ready: false,
    docker_deploy_allowed: false,
    candidate: {
      head_branch: "codex/windows-first-run-autostart-20260615104835"
    },
    release_input_request: {
      target_image_tag: TARGET_TAG,
      workflow_ref: TARGET_RELEASE_REF,
      release_ref_setup_command: `git tag ${TARGET_RELEASE_REF} ${TARGET_TAG} && git push origin refs/tags/${TARGET_RELEASE_REF}:refs/tags/${TARGET_RELEASE_REF}`
    },
    summary: {
      staging_execution_blockers: [
        "explicit-push-approval-required",
        "current-and-rollback-tags-required"
      ],
      docker_deploy_blockers: [
        "explicit-push-approval-required",
        "current-and-rollback-tags-required"
      ]
    },
    ...overrides
  };
}

function nasImageProof(overrides: Record<string, unknown> = {}): unknown {
  return {
    mode: "admin-docker-nas-image-proof",
    proof_accepted: true,
    docker_deploy_allowed: false,
    release_inputs: {
      current_image_tag: CURRENT_TAG,
      rollback_image_tag: CURRENT_TAG
    },
    summary: {
      release_input_blockers: []
    },
    ...overrides
  };
}

function legacyLatestNasImageProof(overrides: Record<string, unknown> = {}): unknown {
  return nasImageProof({
    proof_accepted: false,
    release_inputs: {
      current_image_tag: "",
      rollback_image_tag: ""
    },
    observations: {
      env_image_tag: "latest"
    },
    summary: {
      release_input_blockers: ["current-tag-stable-for-rollback"]
    },
    ...overrides
  });
}

function legacyRollbackPlan(overrides: Record<string, unknown> = {}): unknown {
  return {
    mode: "admin-docker-legacy-rollback-plan",
    exception_plan_ready: true,
    release_execution_allowed: false,
    docker_deploy_allowed: false,
    observations: {
      current_image_tag: "latest",
      target_image_tag: TARGET_TAG,
      current_image_proof_blockers: ["current-tag-stable-for-rollback"]
    },
    summary: {
      release_decision_blockers: ["explicit-legacy-rollback-exception-approval"]
    },
    ...overrides
  };
}

function legacyExceptionReview(overrides: Record<string, unknown> = {}): unknown {
  return {
    mode: "admin-docker-legacy-rollback-exception-review",
    exception_review_accepted: true,
    release_execution_allowed: false,
    docker_deploy_allowed: false,
    reviewer: {
      role: "release-manager",
      scope: "legacy-latest-rollback-exception"
    },
    observations: {
      current_image_tag: "latest",
      target_image_tag: TARGET_TAG
    },
    summary: {
      exception_review_blockers: []
    },
    ...overrides
  };
}

function candidateRefProof(overrides: Record<string, unknown> = {}): unknown {
  return {
    mode: "admin-docker-candidate-ref-proof",
    candidate_ref_proof_accepted: true,
    docker_deploy_allowed: false,
    candidate: {
      expected_sha: TARGET_TAG,
      expected_tag: TARGET_RELEASE_REF
    },
    github_run: {
      url: "https://github.com/alin155/mixlab/actions/runs/28307173676",
      headBranch: TARGET_RELEASE_REF,
      headSha: TARGET_TAG
    },
    summary: {
      candidate_ref_blockers: []
    },
    ...overrides
  };
}

function report(input: {
  handoff?: unknown;
  candidateProof?: unknown;
  proof?: unknown;
  legacyPlan?: unknown;
  legacyReview?: unknown;
  legacyApproval?: string;
  handoffPath?: string;
  candidateProofPath?: string;
  proofPath?: string;
  legacyPlanPath?: string;
  legacyReviewPath?: string;
} = {}) {
  return buildAdminDockerReleaseInputsReport({
    generated_at: "2026-06-27T00:00:00.000Z",
    command: "test",
    prestaging_handoff_report_path: input.handoffPath ?? (input.handoff === undefined ? undefined : "handoff.json"),
    prestaging_handoff_report: input.handoff,
    candidate_ref_proof_report_path: input.candidateProofPath ?? (input.candidateProof === undefined ? undefined : "candidate-ref-proof.json"),
    candidate_ref_proof_report: input.candidateProof,
    nas_image_proof_report_path: input.proofPath ?? (input.proof === undefined ? undefined : "proof.json"),
    nas_image_proof_report: input.proof,
    legacy_rollback_plan_report_path: input.legacyPlanPath ?? (input.legacyPlan === undefined ? undefined : "legacy-rollback-plan.json"),
    legacy_rollback_plan_report: input.legacyPlan,
    legacy_rollback_exception_review_report_path: input.legacyReviewPath ?? (input.legacyReview === undefined ? undefined : "legacy-rollback-exception-review.json"),
    legacy_rollback_exception_review_report: input.legacyReview,
    legacy_rollback_exception_approval: input.legacyApproval
  });
}

test("release input package stays blocked when handoff and NAS proof are missing", () => {
  const built = report();

  assert.equal(built.release_inputs_ready, false);
  assert.equal(built.push_execution_allowed, false);
  assert.equal(built.docker_deploy_allowed, false);
  assert.equal(built.result.status, "blocked");
  assert.ok(built.summary.release_input_blockers.includes("prestaging-handoff-provided"));
  assert.ok(built.summary.release_input_blockers.includes("candidate-ref-proof-provided"));
  assert.ok(built.summary.release_input_blockers.includes("nas-image-proof-provided"));
  assert.equal(built.inputs.workflow_dispatch_command, "");
  assert.ok(built.next_actions.some((item) => item.includes("validate:admin-docker-candidate-ref-proof")));
  assert.ok(built.next_actions.some((item) => item.includes("validate:admin-docker-nas-image-proof")));
});

test("release input package emits exact workflow command but still requires explicit approval", () => {
  const built = report({
    handoff: handoff(),
    candidateProof: candidateRefProof(),
    proof: nasImageProof()
  });

  assert.equal(built.release_inputs_ready, true);
  assert.equal(built.push_execution_allowed, false);
  assert.equal(built.docker_deploy_allowed, false);
  assert.equal(built.release_decision_required, true);
  assert.equal(built.result.status, "ready-for-release-decision");
  assert.deepEqual(built.summary.release_input_blockers, []);
  assert.deepEqual(built.summary.push_execution_blockers, ["explicit-release-approval-required"]);
  assert.ok(built.summary.docker_deploy_blockers.includes("handoff-staging-blockers-carried-forward"));
  assert.ok(built.summary.docker_deploy_blockers.includes("explicit-release-approval-required"));
  assert.deepEqual(built.observations.handoff_staging_execution_blockers, [
    "explicit-push-approval-required",
    "current-and-rollback-tags-required"
  ]);
  assert.equal(built.observations.candidate_ref_proof_accepted, true);
  assert.equal(built.observations.candidate_ref_expected_sha, TARGET_TAG);
  assert.equal(built.observations.candidate_ref_expected_tag, TARGET_RELEASE_REF);
  assert.equal(built.inputs.target_image_tag, TARGET_TAG);
  assert.equal(built.inputs.current_image_tag, CURRENT_TAG);
  assert.equal(built.inputs.rollback_image_tag, CURRENT_TAG);
  assert.equal(built.inputs.workflow_ref, TARGET_RELEASE_REF);
  assert.match(built.inputs.release_ref_setup_command, new RegExp(`git tag ${TARGET_RELEASE_REF} ${TARGET_TAG}`));
  assert.match(built.inputs.workflow_dispatch_command, /push_images=true/);
  assert.match(built.inputs.workflow_dispatch_command, new RegExp(`--ref ${TARGET_RELEASE_REF}`));
  assert.match(built.inputs.workflow_dispatch_command, new RegExp(`current_image_tag=${CURRENT_TAG}`));
  assert.match(built.inputs.workflow_dispatch_command, new RegExp(`rollback_image_tag=${CURRENT_TAG}`));
  assert.equal(built.inputs.workflow_dispatch_command.includes("<"), false);
  assert.ok(built.next_actions.some((item) => item.includes("Before staging execution")));
});

test("release input package preserves live NAS disk risk carried by handoff", () => {
  const built = report({
    handoff: handoff({
      summary: {
        staging_execution_blockers: [
          "explicit-push-approval-required",
          "nas-disk-risk-carried-forward"
        ],
        docker_deploy_blockers: [
          "explicit-push-approval-required",
          "nas-disk-risk-carried-forward"
        ]
      }
    }),
    candidateProof: candidateRefProof(),
    proof: nasImageProof()
  });

  assert.equal(built.release_inputs_ready, true);
  assert.deepEqual(built.summary.push_execution_blockers, ["explicit-release-approval-required"]);
  assert.ok(built.summary.docker_deploy_blockers.includes("handoff-staging-blockers-carried-forward"));
  assert.ok(built.observations.handoff_staging_execution_blockers.includes("nas-disk-risk-carried-forward"));
  assert.ok(built.next_actions.some((item) => item.includes("nas-disk-risk-carried-forward")));
});

test("release input package blocks a rejected NAS image proof", () => {
  const built = report({
    handoff: handoff(),
    candidateProof: candidateRefProof(),
    proof: nasImageProof({
      proof_accepted: false,
      release_inputs: {
        current_image_tag: "",
        rollback_image_tag: ""
      },
      summary: {
        release_input_blockers: ["current-tag-stable-for-rollback"]
      }
    })
  });

  assert.equal(built.release_inputs_ready, false);
  assert.ok(built.summary.release_input_blockers.includes("nas-image-proof-accepted"));
  assert.ok(built.summary.release_input_blockers.includes("current-and-rollback-tags-present"));
  assert.equal(built.inputs.current_image_tag, "");
  assert.ok(built.next_actions.some((item) => item.includes("Preserved pre-staging execution blockers")));
});

test("legacy latest rollback plan is reviewable but blocked without release-manager approval", () => {
  const built = report({
    handoff: handoff(),
    candidateProof: candidateRefProof(),
    proof: legacyLatestNasImageProof(),
    legacyPlan: legacyRollbackPlan()
  });

  assert.equal(built.release_inputs_ready, false);
  assert.equal(built.result.status, "blocked");
  assert.equal(built.observations.legacy_rollback_exception_ready, true);
  assert.equal(built.observations.legacy_rollback_exception_accepted, false);
  assert.ok(built.summary.release_input_blockers.includes("legacy-rollback-exception-approved"));
  assert.ok(built.summary.release_input_blockers.includes("nas-image-proof-accepted"));
  assert.equal(built.inputs.current_image_tag, "");
  assert.equal(built.inputs.workflow_dispatch_command, "");
  assert.ok(built.next_actions.some((item) => item.includes("review:admin-docker-legacy-rollback-exception")));
});

test("legacy latest rollback review report fills current and rollback tags without env approval", () => {
  const built = report({
    handoff: handoff(),
    candidateProof: candidateRefProof(),
    proof: legacyLatestNasImageProof(),
    legacyPlan: legacyRollbackPlan(),
    legacyReview: legacyExceptionReview()
  });

  assert.equal(built.release_inputs_ready, true);
  assert.equal(built.push_execution_allowed, false);
  assert.equal(built.docker_deploy_allowed, false);
  assert.equal(built.observations.legacy_rollback_exception_review_accepted, true);
  assert.equal(built.observations.legacy_rollback_exception_review_role, "release-manager");
  assert.equal(built.observations.legacy_rollback_exception_accepted, true);
  assert.deepEqual(built.summary.release_input_blockers, []);
  assert.deepEqual(built.summary.push_execution_blockers, ["explicit-release-approval-required"]);
  assert.equal(built.inputs.current_image_tag, "latest");
  assert.equal(built.inputs.rollback_image_tag, "latest");
  assert.match(built.inputs.workflow_dispatch_command, /current_image_tag=latest/);
  assert.match(built.inputs.workflow_dispatch_command, /rollback_image_tag=latest/);
});

test("legacy latest rollback review report must be accepted and nondeploy", () => {
  const rejectedReview = report({
    handoff: handoff(),
    candidateProof: candidateRefProof(),
    proof: legacyLatestNasImageProof(),
    legacyPlan: legacyRollbackPlan(),
    legacyReview: legacyExceptionReview({
      exception_review_accepted: false,
      summary: {
        exception_review_blockers: ["workflow-and-compose-are-hardened"]
      }
    })
  });

  assert.equal(rejectedReview.release_inputs_ready, false);
  assert.ok(rejectedReview.summary.release_input_blockers.includes("legacy-rollback-exception-review-accepted"));

  const deployReview = report({
    handoff: handoff(),
    candidateProof: candidateRefProof(),
    proof: legacyLatestNasImageProof(),
    legacyPlan: legacyRollbackPlan(),
    legacyReview: legacyExceptionReview({
      docker_deploy_allowed: true
    })
  });

  assert.equal(deployReview.release_inputs_ready, false);
  assert.equal(deployReview.result.status, "failed");
  assert.ok(deployReview.summary.release_input_blockers.includes("legacy-rollback-exception-review-does-not-approve-release-or-deploy"));
});

test("legacy latest rollback approval fills current and rollback tags without approving push or deploy", () => {
  const built = report({
    handoff: handoff(),
    candidateProof: candidateRefProof(),
    proof: legacyLatestNasImageProof(),
    legacyPlan: legacyRollbackPlan(),
    legacyApproval: LEGACY_APPROVAL
  });

  assert.equal(built.release_inputs_ready, true);
  assert.equal(built.push_execution_allowed, false);
  assert.equal(built.docker_deploy_allowed, false);
  assert.equal(built.observations.nas_image_proof_accepted, false);
  assert.equal(built.observations.legacy_rollback_exception_ready, true);
  assert.equal(built.observations.legacy_rollback_exception_accepted, true);
  assert.deepEqual(built.summary.release_input_blockers, []);
  assert.deepEqual(built.summary.push_execution_blockers, ["explicit-release-approval-required"]);
  assert.equal(built.inputs.current_image_tag, "latest");
  assert.equal(built.inputs.rollback_image_tag, "latest");
  assert.match(built.inputs.workflow_dispatch_command, /current_image_tag=latest/);
  assert.match(built.inputs.workflow_dispatch_command, /rollback_image_tag=latest/);
});

test("legacy latest rollback plan must match target and stay nondeploy", () => {
  const targetMismatch = report({
    handoff: handoff(),
    candidateProof: candidateRefProof(),
    proof: legacyLatestNasImageProof(),
    legacyPlan: legacyRollbackPlan({
      observations: {
        current_image_tag: "latest",
        target_image_tag: CURRENT_TAG
      }
    }),
    legacyApproval: LEGACY_APPROVAL
  });

  assert.equal(targetMismatch.release_inputs_ready, false);
  assert.ok(targetMismatch.summary.release_input_blockers.includes("legacy-rollback-exception-ready"));

  const unsafePlan = report({
    handoff: handoff(),
    candidateProof: candidateRefProof(),
    proof: legacyLatestNasImageProof(),
    legacyPlan: legacyRollbackPlan({
      release_execution_allowed: true
    }),
    legacyApproval: LEGACY_APPROVAL
  });

  assert.equal(unsafePlan.release_inputs_ready, false);
  assert.equal(unsafePlan.result.status, "failed");
  assert.ok(unsafePlan.summary.release_input_blockers.includes("legacy-rollback-plan-does-not-approve-release-or-deploy"));
});

test("release input package blocks when target tag equals current tag", () => {
  const built = report({
    handoff: handoff({
      release_input_request: {
        target_image_tag: CURRENT_TAG,
        workflow_ref: CURRENT_RELEASE_REF,
        release_ref_setup_command: `git tag ${CURRENT_RELEASE_REF} ${CURRENT_TAG} && git push origin refs/tags/${CURRENT_RELEASE_REF}:refs/tags/${CURRENT_RELEASE_REF}`
      }
    }),
    candidateProof: candidateRefProof({
      candidate: {
        expected_sha: CURRENT_TAG,
        expected_tag: CURRENT_RELEASE_REF
      }
    }),
    proof: nasImageProof()
  });

  assert.equal(built.release_inputs_ready, false);
  assert.ok(built.summary.release_input_blockers.includes("target-tag-differs-from-current"));
});

test("release input package blocks old branch-ref workflow commands", () => {
  const built = report({
    handoff: handoff({
      candidate: {},
      release_input_request: {
        target_image_tag: TARGET_TAG,
        workflow_dispatch_command: "gh workflow run docker-admin.yml --repo alin155/mixlab --ref codex/custom-admin-release -f push_images=true"
      }
    }),
    candidateProof: candidateRefProof(),
    proof: nasImageProof()
  });

  assert.equal(built.release_inputs_ready, false);
  assert.ok(built.summary.release_input_blockers.includes("workflow-ref-pins-target-image"));
  assert.ok(built.summary.release_input_blockers.includes("release-ref-setup-command-ready"));
  assert.equal(built.inputs.branch, "codex/custom-admin-release");
});

test("release input package blocks missing candidate ref proof even with handoff and NAS proof", () => {
  const built = report({
    handoff: handoff(),
    proof: nasImageProof()
  });

  assert.equal(built.release_inputs_ready, false);
  assert.ok(built.summary.release_input_blockers.includes("candidate-ref-proof-provided"));
  assert.ok(built.summary.release_input_blockers.includes("candidate-ref-proof-accepted"));
});

test("release input package blocks candidate ref proof that does not match handoff", () => {
  const built = report({
    handoff: handoff(),
    candidateProof: candidateRefProof({
      candidate_ref_proof_accepted: true,
      candidate: {
        expected_sha: "different-sha",
        expected_tag: "admin-docker-candidate-different-sha"
      }
    }),
    proof: nasImageProof()
  });

  assert.equal(built.release_inputs_ready, false);
  assert.ok(built.summary.release_input_blockers.includes("candidate-ref-target-matches-handoff"));
  assert.ok(built.summary.release_input_blockers.includes("candidate-ref-tag-matches-workflow-ref"));
});

test("release input package fails if candidate ref proof tries to approve deploy", () => {
  const built = report({
    handoff: handoff(),
    candidateProof: candidateRefProof({
      docker_deploy_allowed: true
    }),
    proof: nasImageProof()
  });

  assert.equal(built.release_inputs_ready, false);
  assert.equal(built.result.status, "failed");
  assert.ok(built.summary.release_input_blockers.includes("candidate-ref-proof-does-not-approve-deploy"));
});

test("release input package fails if an input report tries to approve staging or deploy", () => {
  const built = report({
    handoff: handoff({
      staging_execution_ready: true,
      docker_deploy_allowed: true
    }),
    candidateProof: candidateRefProof(),
    proof: nasImageProof()
  });

  assert.equal(built.release_inputs_ready, false);
  assert.equal(built.result.status, "failed");
  assert.ok(built.summary.release_input_blockers.includes("handoff-does-not-approve-staging-or-deploy"));
  assert.ok(built.summary.docker_deploy_blockers.includes("handoff-does-not-approve-staging-or-deploy"));
});

test("release input package CLI writes JSON and Markdown", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-release-inputs-"));
  const handoffPath = path.join(tempRoot, "handoff.json");
  const candidateProofPath = path.join(tempRoot, "candidate-ref-proof.json");
  const proofPath = path.join(tempRoot, "proof.json");

  await writeFile(handoffPath, `${JSON.stringify(handoff(), null, 2)}\n`);
  await writeFile(candidateProofPath, `${JSON.stringify(candidateRefProof(), null, 2)}\n`);
  await writeFile(proofPath, `${JSON.stringify(nasImageProof(), null, 2)}\n`);

  const built = await runAdminDockerReleaseInputs({
    prestaging_handoff_report_path: handoffPath,
    candidate_ref_proof_report_path: candidateProofPath,
    nas_image_proof_report_path: proofPath,
    output_dir: tempRoot,
    generated_at: "2026-06-27T00:00:00.000Z",
    command: "test"
  });

  assert.equal(built.release_inputs_ready, true);
  assert.equal(built.artifacts?.json_path, path.join(tempRoot, "admin-docker-release-inputs-20260627T000000Z.json"));
  assert.match(await readFile(built.artifacts?.markdown_path ?? "", "utf8"), /Admin Docker Release Inputs/);
  assert.match(await readFile(built.artifacts?.markdown_path ?? "", "utf8"), /Handoff staging execution blockers/);
  assert.match(toMarkdown(built), /Release decision required: yes/);
});
