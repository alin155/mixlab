import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildAdminDockerImagePushProofReport,
  runAdminDockerImagePushProof,
  toMarkdown
} from "./admin-docker-image-push-proof.ts";

const TARGET = "4cb5b18262e49894d4272b0fc940be6c1d2102b4";
const CURRENT = "latest";
const ROLLBACK = "latest";
const WORKFLOW_COMMAND = `gh workflow run docker-admin.yml --repo alin155/mixlab --ref admin-docker-candidate-${TARGET} -f push_images=true -f current_image_tag=${CURRENT} -f rollback_image_tag=${ROLLBACK}`;

function githubRunArtifact(overrides: Record<string, unknown> = {}): unknown {
  return {
    mode: "admin-docker-github-run-artifact",
    github_run_candidate_ready: true,
    github_run_staging_handoff_ready: false,
    docker_deploy_allowed: false,
    run: {
      databaseId: 28339129475,
      headSha: TARGET,
      headBranch: `admin-docker-candidate-${TARGET}`,
      status: "completed",
      conclusion: "success",
      url: "https://github.com/alin155/mixlab/actions/runs/28339129475",
      workflowName: "Build Admin Docker Images",
      event: "workflow_dispatch"
    },
    ...overrides
  };
}

function githubReadiness(overrides: Record<string, unknown> = {}): unknown {
  return {
    mode: "admin-docker-github-artifact-readiness",
    github_candidate_artifact_ready: true,
    staging_handoff_ready: false,
    docker_deploy_allowed: false,
    observations: {
      image_push_approval_accepted: true
    },
    summary: {
      staging_handoff_blockers: [
        "worker-proof-accepted",
        "cutter-proof-accepted"
      ]
    },
    result: {
      status: "blocked"
    },
    ...overrides
  };
}

function releaseInputs(overrides: Record<string, unknown> = {}): unknown {
  return {
    mode: "admin-docker-release-inputs",
    release_inputs_ready: true,
    push_execution_allowed: false,
    docker_deploy_allowed: false,
    inputs: {
      current_image_tag: CURRENT,
      target_image_tag: TARGET,
      rollback_image_tag: ROLLBACK,
      workflow_dispatch_command: WORKFLOW_COMMAND
    },
    result: {
      status: "ready-for-release-decision"
    },
    ...overrides
  };
}

function pushDecision(overrides: Record<string, unknown> = {}): unknown {
  return {
    mode: "admin-docker-push-decision-package",
    push_decision_package_ready: true,
    push_execution_allowed: false,
    docker_deploy_allowed: false,
    observations: {
      workflow_dispatch_command: WORKFLOW_COMMAND
    },
    result: {
      status: "ready-for-external-release-decision"
    },
    ...overrides
  };
}

function report(input: {
  run?: unknown;
  readiness?: unknown;
  inputs?: unknown;
  decision?: unknown;
} = {}) {
  return buildAdminDockerImagePushProofReport({
    generated_at: "2026-06-29T00:00:00.000Z",
    command: "test",
    github_run_artifact_report_path: "github-run.json",
    github_run_artifact_report: input.run ?? githubRunArtifact(),
    github_artifact_readiness_report_path: "github-readiness.json",
    github_artifact_readiness_report: input.readiness ?? githubReadiness(),
    release_inputs_report_path: "release-inputs.json",
    release_inputs_report: input.inputs ?? releaseInputs(),
    push_decision_package_report_path: "push-decision.json",
    push_decision_package_report: input.decision ?? pushDecision()
  });
}

test("image push proof accepts successful push_images workflow evidence without approving deploy", () => {
  const built = report();

  assert.equal(built.proof_accepted, true);
  assert.equal(built.push_execution_allowed, false);
  assert.equal(built.docker_deploy_allowed, false);
  assert.equal(built.result.status, "accepted");
  assert.deepEqual(built.summary.image_push_proof_blockers, []);
  assert.deepEqual(built.summary.staging_execution_blockers, []);
  assert.ok(built.next_actions.some((item) => item.includes("MIXLAB_ADMIN_DOCKER_IMAGE_PUSH_PROOF_REPORT")));
});

test("image push proof blocks current dry-run artifact because push_images was not observed", () => {
  const built = report({
    readiness: githubReadiness({
      observations: {
        image_push_approval_accepted: false
      },
      summary: {
        staging_handoff_blockers: [
          "image-push-explicitly-approved",
          "worker-proof-accepted"
        ]
      }
    })
  });

  assert.equal(built.proof_accepted, false);
  assert.equal(built.result.status, "blocked");
  assert.ok(built.summary.image_push_proof_blockers.includes("image-push-approval-observed-in-artifact"));
  assert.ok(built.summary.image_push_proof_blockers.includes("image-push-blocker-cleared-from-artifact"));
});

test("image push proof fails if any source report self-approves push or deploy", () => {
  const built = report({
    decision: pushDecision({
      push_execution_allowed: true
    })
  });

  assert.equal(built.proof_accepted, false);
  assert.equal(built.result.status, "failed");
  assert.ok(built.summary.image_push_proof_blockers.includes("source-reports-do-not-approve-push-or-deploy"));
});

test("image push proof blocks when the GitHub run target drifts from release inputs", () => {
  const built = report({
    run: githubRunArtifact({
      run: {
        headSha: "different-target",
        headBranch: "admin-docker-candidate-different-target",
        status: "completed",
        conclusion: "success",
        event: "workflow_dispatch"
      }
    })
  });

  assert.equal(built.proof_accepted, false);
  assert.equal(built.observations.run_head_matches_target, false);
  assert.ok(built.summary.image_push_proof_blockers.includes("github-run-target-ref-matches-release-inputs"));
});

test("image push proof markdown and CLI keep the non-executing boundary visible", async () => {
  const markdown = toMarkdown(report());
  assert.match(markdown, /Admin Docker Image Push Proof/);
  assert.match(markdown, /Push execution allowed: no/);
  assert.match(markdown, /Docker deploy allowed: no/);
  assert.match(markdown, /does not contact GitHub, GHCR, Docker, NAS/);

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-image-push-proof-"));
  const runPath = path.join(tempRoot, "github-run.json");
  const readinessPath = path.join(tempRoot, "github-readiness.json");
  const inputsPath = path.join(tempRoot, "release-inputs.json");
  const decisionPath = path.join(tempRoot, "push-decision.json");

  await writeFile(runPath, `${JSON.stringify(githubRunArtifact(), null, 2)}\n`);
  await writeFile(readinessPath, `${JSON.stringify(githubReadiness(), null, 2)}\n`);
  await writeFile(inputsPath, `${JSON.stringify(releaseInputs(), null, 2)}\n`);
  await writeFile(decisionPath, `${JSON.stringify(pushDecision(), null, 2)}\n`);

  const built = await runAdminDockerImagePushProof({
    github_run_artifact_report_path: runPath,
    github_artifact_readiness_report_path: readinessPath,
    release_inputs_report_path: inputsPath,
    push_decision_package_report_path: decisionPath,
    output_dir: tempRoot,
    generated_at: "2026-06-29T00:00:00.000Z",
    command: "test"
  });

  assert.equal(built.proof_accepted, true);
  assert.equal(built.artifacts?.json_path, path.join(tempRoot, "admin-docker-image-push-proof-20260629T000000Z.json"));
  assert.match(await readFile(built.artifacts?.markdown_path ?? "", "utf8"), /Proof accepted: yes/);
});
