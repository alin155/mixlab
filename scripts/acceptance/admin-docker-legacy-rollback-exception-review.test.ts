import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildAdminDockerLegacyRollbackExceptionReviewReport,
  runAdminDockerLegacyRollbackExceptionReview,
  toMarkdown
} from "./admin-docker-legacy-rollback-exception-review.ts";

const TARGET = "4cb5b18262e49894d4272b0fc940be6c1d2102b4";

function legacyPlan(overrides: Record<string, unknown> = {}): unknown {
  return {
    mode: "admin-docker-legacy-rollback-plan",
    exception_plan_ready: true,
    release_execution_allowed: false,
    docker_deploy_allowed: false,
    result: {
      status: "ready-for-release-decision"
    },
    observations: {
      current_image_tag: "latest",
      current_image_proof_blockers: ["current-tag-stable-for-rollback"],
      target_image_tag: TARGET,
      workflow_pushes_latest: false,
      workflow_pushes_sha_tag: true,
      compose_requires_explicit_image_tag: true,
      compose_defaults_latest: false
    },
    summary: {
      exception_plan_blockers: [],
      release_decision_blockers: ["explicit-legacy-rollback-exception-approval"]
    },
    ...overrides
  };
}

function report(plan: unknown = legacyPlan()) {
  return buildAdminDockerLegacyRollbackExceptionReviewReport({
    generated_at: "2026-06-29T00:00:00.000Z",
    command: "test",
    legacy_rollback_plan_report_path: "legacy-plan.json",
    legacy_rollback_plan_report: plan
  });
}

test("release-manager review accepts a safe legacy latest exception without approving release", () => {
  const built = report();

  assert.equal(built.exception_review_accepted, true);
  assert.equal(built.release_execution_allowed, false);
  assert.equal(built.docker_deploy_allowed, false);
  assert.equal(built.reviewer.role, "release-manager");
  assert.deepEqual(built.summary.exception_review_blockers, []);
  assert.ok(built.summary.release_execution_blockers.includes("explicit-legacy-rollback-exception-approval") === false);
  assert.equal(built.result.status, "accepted");
});

test("release-manager review blocks unsafe plans and release-approving reports", () => {
  const pushesLatest = report(legacyPlan({
    observations: {
      current_image_tag: "latest",
      current_image_proof_blockers: ["current-tag-stable-for-rollback"],
      target_image_tag: TARGET,
      workflow_pushes_latest: true,
      workflow_pushes_sha_tag: true,
      compose_requires_explicit_image_tag: true,
      compose_defaults_latest: false
    }
  }));

  assert.equal(pushesLatest.exception_review_accepted, false);
  assert.ok(pushesLatest.summary.exception_review_blockers.includes("workflow-and-compose-are-hardened"));

  const approvesRelease = report(legacyPlan({
    release_execution_allowed: true
  }));

  assert.equal(approvesRelease.exception_review_accepted, false);
  assert.equal(approvesRelease.result.status, "failed");
  assert.ok(approvesRelease.summary.exception_review_blockers.includes("review-plan-does-not-approve-release-or-deploy"));
});

test("release-manager review markdown and CLI write no-deploy artifact", async () => {
  const markdown = toMarkdown(report());
  assert.match(markdown, /Admin Docker Legacy Rollback Exception Review/);
  assert.match(markdown, /Release execution allowed: no/);
  assert.match(markdown, /Docker deploy allowed: no/);

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-legacy-exception-review-"));
  const planPath = path.join(tempRoot, "legacy-plan.json");
  await writeFile(planPath, `${JSON.stringify(legacyPlan(), null, 2)}\n`);

  const built = await runAdminDockerLegacyRollbackExceptionReview({
    legacy_rollback_plan_report_path: planPath,
    output_dir: tempRoot,
    generated_at: "2026-06-29T00:00:00.000Z",
    command: "test"
  });

  assert.equal(built.exception_review_accepted, true);
  assert.equal(built.artifacts?.json_path, path.join(tempRoot, "admin-docker-legacy-rollback-exception-review-20260629T000000Z.json"));
  assert.match(await readFile(built.artifacts?.markdown_path ?? "", "utf8"), /Exception review accepted: yes/);
});
