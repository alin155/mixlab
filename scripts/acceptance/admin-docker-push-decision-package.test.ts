import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildAdminDockerPushDecisionPackageReport,
  runAdminDockerPushDecisionPackage,
  toMarkdown
} from "./admin-docker-push-decision-package.ts";

const TARGET = "4cb5b18262e49894d4272b0fc940be6c1d2102b4";
const WORKFLOW_COMMAND = `gh workflow run docker-admin.yml --repo alin155/mixlab --ref admin-docker-candidate-${TARGET} -f push_images=true -f current_image_tag=latest -f rollback_image_tag=latest`;

function runbook(overrides: Record<string, unknown> = {}): unknown {
  return {
    mode: "admin-docker-staging-runbook",
    staging_execution_ready: false,
    staging_review_ready: false,
    docker_deploy_allowed: false,
    summary: {
      staging_execution_blockers: ["image-push-explicitly-approved"],
      staging_blockers: [
        "image-push-explicitly-approved",
        "worker-env-proof-accepted",
        "cutter-compatibility-proof-accepted"
      ]
    },
    observations: {
      target_tag_matches_smoked_image: true,
      nas_disk_proof_accepted: true,
      worker_proof_accepted: false,
      cutter_proof_accepted: false
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
      current_image_tag: "latest",
      target_image_tag: TARGET,
      rollback_image_tag: "latest",
      workflow_dispatch_command: WORKFLOW_COMMAND
    },
    summary: {
      release_input_blockers: []
    },
    result: {
      status: "ready-for-release-decision"
    },
    ...overrides
  };
}

function readiness(overrides: Record<string, unknown> = {}): unknown {
  return {
    mode: "admin-docker-release-readiness-summary",
    release_review_ready: false,
    summary: {
      release_review_blockers: [
        "live-readonly-blockers-clear",
        "worker-proof-accepted",
        "cutter-proof-accepted",
        "staging-runbook-ready"
      ]
    },
    result: {
      status: "blocked"
    },
    ...overrides
  };
}

function report(input: {
  staging?: unknown;
  inputs?: unknown;
  summary?: unknown;
} = {}) {
  return buildAdminDockerPushDecisionPackageReport({
    generated_at: "2026-06-29T00:00:00.000Z",
    command: "test",
    staging_runbook_report_path: "runbook.json",
    staging_runbook_report: input.staging ?? runbook(),
    release_inputs_report_path: "release-inputs.json",
    release_inputs_report: input.inputs ?? releaseInputs(),
    readiness_summary_report_path: "readiness.json",
    readiness_summary_report: input.summary ?? readiness()
  });
}

test("push decision package is ready when only explicit push approval blocks staging execution", () => {
  const built = report();

  assert.equal(built.push_decision_package_ready, true);
  assert.equal(built.push_execution_allowed, false);
  assert.equal(built.docker_deploy_allowed, false);
  assert.equal(built.release_decision_required, true);
  assert.equal(built.result.status, "ready-for-external-release-decision");
  assert.deepEqual(built.summary.package_blockers, []);
  assert.deepEqual(built.summary.push_execution_blockers, ["external-release-decision-required"]);
  assert.deepEqual(built.summary.docker_deploy_blockers, ["external-release-decision-required"]);
  assert.deepEqual(built.observations.staging_execution_blockers, ["image-push-explicitly-approved"]);
  assert.equal(built.observations.workflow_dispatch_command, WORKFLOW_COMMAND);
  assert.ok(built.next_actions.some((item) => item.includes(WORKFLOW_COMMAND)));
});

test("push decision package is ready when staging is fully ready", () => {
  const built = report({
    staging: runbook({
      staging_execution_ready: true,
      staging_review_ready: true,
      summary: {
        staging_execution_blockers: [],
        staging_blockers: []
      },
      result: {
        status: "ready-for-staging-review"
      }
    })
  });

  assert.equal(built.push_decision_package_ready, true);
  assert.equal(built.result.status, "ready-for-external-release-decision");
  assert.deepEqual(built.summary.package_blockers, []);
  assert.deepEqual(built.observations.staging_execution_blockers, []);
});

test("push decision package blocks extra staging execution blockers", () => {
  const built = report({
    staging: runbook({
      summary: {
        staging_execution_blockers: [
          "image-push-explicitly-approved",
          "nas-disk-proof-accepted"
        ],
        staging_blockers: [
          "image-push-explicitly-approved",
          "nas-disk-proof-accepted"
        ]
      }
    })
  });

  assert.equal(built.push_decision_package_ready, false);
  assert.ok(built.summary.package_blockers.includes("staging-ready-for-release-decision"));
});

test("push decision package fails if source reports approve push or deploy", () => {
  const built = report({
    inputs: releaseInputs({
      push_execution_allowed: true
    })
  });

  assert.equal(built.push_decision_package_ready, false);
  assert.equal(built.result.status, "failed");
  assert.ok(built.summary.package_blockers.includes("source-reports-do-not-approve-push-or-deploy"));
});

test("push decision package markdown and CLI write no-approval artifact", async () => {
  const markdown = toMarkdown(report());
  assert.match(markdown, /Admin Docker Push Decision Package/);
  assert.match(markdown, /Push execution allowed: no/);
  assert.match(markdown, /Release decision required: yes/);

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-push-decision-"));
  const runbookPath = path.join(tempRoot, "runbook.json");
  const releaseInputsPath = path.join(tempRoot, "release-inputs.json");
  const readinessPath = path.join(tempRoot, "readiness.json");

  await writeFile(runbookPath, `${JSON.stringify(runbook(), null, 2)}\n`);
  await writeFile(releaseInputsPath, `${JSON.stringify(releaseInputs(), null, 2)}\n`);
  await writeFile(readinessPath, `${JSON.stringify(readiness(), null, 2)}\n`);

  const built = await runAdminDockerPushDecisionPackage({
    staging_runbook_report_path: runbookPath,
    release_inputs_report_path: releaseInputsPath,
    readiness_summary_report_path: readinessPath,
    output_dir: tempRoot,
    generated_at: "2026-06-29T00:00:00.000Z",
    command: "test"
  });

  assert.equal(built.push_decision_package_ready, true);
  assert.equal(built.artifacts?.json_path, path.join(tempRoot, "admin-docker-push-decision-package-20260629T000000Z.json"));
  assert.match(await readFile(built.artifacts?.markdown_path ?? "", "utf8"), /ready-for-external-release-decision/);
});
