import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildAdminDockerLegacyRollbackPlanReport,
  runAdminDockerLegacyRollbackPlan,
  toMarkdown
} from "./admin-docker-legacy-rollback-plan.ts";

const TARGET = "4cb5b18262e49894d4272b0fc940be6c1d2102b4";

function imageProof(input: {
  tag?: string;
  blockers?: string[];
} = {}): unknown {
  const tag = input.tag ?? "latest";
  const blockers = input.blockers ?? ["current-tag-stable-for-rollback"];

  return {
    result: {
      status: blockers.length === 0 ? "accepted" : "blocked"
    },
    observations: {
      env_image_tag: tag,
      services: [
        {
          service: "admin-api",
          image_reference: `ghcr.io/alin155/mixlab-admin-runtime:${tag}`,
          image_tag: tag
        },
        {
          service: "admin-worker",
          image_reference: `ghcr.io/alin155/mixlab-admin-runtime:${tag}`,
          image_tag: tag
        },
        {
          service: "admin-web",
          image_reference: `ghcr.io/alin155/mixlab-admin-web:${tag}`,
          image_tag: tag
        }
      ]
    },
    summary: {
      release_input_blockers: blockers
    }
  };
}

function githubReady(target = TARGET): unknown {
  return {
    github_candidate_artifact_ready: true,
    observations: {
      local_smoke_image_tag: target,
      local_smoke_build_sha: target
    }
  };
}

function workflow(input: {
  pushLatest?: boolean;
} = {}): string {
  return [
    "tags: |",
    "  ghcr.io/alin155/mixlab-admin-runtime:${{ github.sha }}",
    input.pushLatest ? "  ghcr.io/alin155/mixlab-admin-runtime:latest" : "",
    "tags: |",
    "  ghcr.io/alin155/mixlab-admin-web:${{ github.sha }}",
    input.pushLatest ? "  ghcr.io/alin155/mixlab-admin-web:latest" : ""
  ].filter(Boolean).join("\n");
}

function compose(input: {
  defaultsLatest?: boolean;
} = {}): string {
  const imageTag = input.defaultsLatest
    ? "${MIXLAB_IMAGE_TAG:-latest}"
    : "${MIXLAB_IMAGE_TAG:?Set MIXLAB_IMAGE_TAG to an immutable candidate SHA}";

  return [
    `image: ghcr.io/alin155/mixlab-admin-runtime:${imageTag}`,
    `image: ghcr.io/alin155/mixlab-admin-web:${imageTag}`
  ].join("\n");
}

function report(input: {
  proof?: unknown;
  github?: unknown;
  workflowRaw?: string;
  composeRaw?: string;
} = {}) {
  return buildAdminDockerLegacyRollbackPlanReport({
    generated_at: "2026-06-29T00:00:00.000Z",
    command: "test",
    nas_image_proof_report_path: "admin-docker-nas-image-proof.json",
    nas_image_proof_report: input.proof ?? imageProof(),
    github_artifact_readiness_report_path: "admin-docker-github-artifact-readiness.json",
    github_artifact_readiness_report: input.github ?? githubReady(),
    workflow_file_path: ".github/workflows/docker-admin.yml",
    workflow_file_raw: input.workflowRaw ?? workflow(),
    compose_file_path: "deploy/nas/mixlab/docker-compose.yml",
    compose_file_raw: input.composeRaw ?? compose()
  });
}

test("legacy rollback plan makes old latest state reviewable without approving release", () => {
  const built = report();

  assert.equal(built.exception_plan_ready, true);
  assert.equal(built.release_execution_allowed, false);
  assert.equal(built.docker_deploy_allowed, false);
  assert.equal(built.result.status, "ready-for-release-decision");
  assert.deepEqual(built.summary.exception_plan_blockers, []);
  assert.ok(built.summary.release_decision_blockers.includes("explicit-legacy-rollback-exception-approval"));
  assert.equal(built.observations.current_image_tag, "latest");
  assert.equal(built.observations.target_image_tag, TARGET);
  assert.ok(built.plan.rollback.some((item) => item.includes("MIXLAB_IMAGE_TAG=latest")));
});

test("legacy rollback plan blocks when image proof has blockers beyond latest mutability", () => {
  const built = report({
    proof: imageProof({
      blockers: ["current-tag-stable-for-rollback", "all-admin-services-present"]
    })
  });

  assert.equal(built.exception_plan_ready, false);
  assert.ok(built.summary.exception_plan_blockers.includes("only-stable-rollback-tag-blocker"));
});

test("legacy rollback plan blocks when workflow would push latest", () => {
  const built = report({
    workflowRaw: workflow({ pushLatest: true })
  });

  assert.equal(built.exception_plan_ready, false);
  assert.ok(built.summary.exception_plan_blockers.includes("workflow-does-not-push-latest"));
});

test("legacy rollback plan blocks when target candidate tag is not immutable", () => {
  const built = report({
    github: githubReady("branch-head")
  });

  assert.equal(built.exception_plan_ready, false);
  assert.ok(built.summary.exception_plan_blockers.includes("target-tag-immutable"));
});

test("legacy rollback plan markdown and CLI record no-deploy boundary", async () => {
  const markdown = toMarkdown(report());
  assert.match(markdown, /Admin Docker Legacy Rollback Plan/);
  assert.match(markdown, /Docker deploy allowed: no/);
  assert.match(markdown, /MIXLAB_IMAGE_TAG=latest/);

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-legacy-rollback-"));
  const proofPath = path.join(tempRoot, "proof.json");
  const githubPath = path.join(tempRoot, "github.json");
  const workflowPath = path.join(tempRoot, "workflow.yml");
  const composePath = path.join(tempRoot, "docker-compose.yml");

  await writeFile(proofPath, `${JSON.stringify(imageProof(), null, 2)}\n`);
  await writeFile(githubPath, `${JSON.stringify(githubReady(), null, 2)}\n`);
  await writeFile(workflowPath, workflow());
  await writeFile(composePath, compose());

  const built = await runAdminDockerLegacyRollbackPlan({
    nas_image_proof_report_path: proofPath,
    github_artifact_readiness_report_path: githubPath,
    workflow_file_path: workflowPath,
    compose_file_path: composePath,
    output_dir: tempRoot,
    generated_at: "2026-06-29T00:00:00.000Z",
    command: "test"
  });

  assert.equal(built.exception_plan_ready, true);
  assert.equal(built.artifacts?.json_path, path.join(tempRoot, "admin-docker-legacy-rollback-plan-20260629T000000Z.json"));
  assert.match(await readFile(built.artifacts?.markdown_path ?? "", "utf8"), /Release execution allowed: no/);
});
