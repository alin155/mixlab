import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildAdminDockerReleaseOwnerRunbookReport,
  runAdminDockerReleaseOwnerRunbook,
  toMarkdown
} from "./admin-docker-release-owner-runbook.ts";

const TARGET = "9c015b9105e97954240020781f79daae3f954bde";
const WORKFLOW_COMMAND = `gh workflow run docker-admin.yml --repo alin155/mixlab --ref admin-docker-candidate-${TARGET} -f push_images=true -f current_image_tag=latest -f rollback_image_tag=latest`;

function pushPackage(overrides: Record<string, unknown> = {}): unknown {
  return {
    mode: "admin-docker-push-decision-package",
    push_decision_package_ready: true,
    push_execution_allowed: false,
    docker_deploy_allowed: false,
    observations: {
      current_image_tag: "latest",
      target_image_tag: TARGET,
      rollback_image_tag: "latest",
      workflow_dispatch_command: WORKFLOW_COMMAND
    },
    summary: {
      package_blockers: [],
      push_execution_blockers: ["external-release-decision-required"],
      docker_deploy_blockers: ["external-release-decision-required"]
    },
    result: {
      status: "ready-for-external-release-decision"
    },
    ...overrides
  };
}

function stagingRunbook(overrides: Record<string, unknown> = {}): unknown {
  return {
    mode: "admin-docker-staging-runbook",
    staging_execution_ready: true,
    staging_review_ready: true,
    docker_deploy_allowed: false,
    summary: {
      staging_execution_blockers: [],
      staging_blockers: []
    },
    result: {
      status: "ready-for-staging-review"
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
    release_review_ready: true,
    docker_upload_allowed: false,
    summary: {
      release_review_blockers: []
    },
    result: {
      status: "ready-for-release-decision"
    },
    ...overrides
  };
}

function report(input: {
  push?: unknown;
  staging?: unknown;
  inputs?: unknown;
  summary?: unknown;
} = {}) {
  return buildAdminDockerReleaseOwnerRunbookReport({
    generated_at: "2026-06-29T00:00:00.000Z",
    command: "test",
    push_decision_package_report_path: "push.json",
    push_decision_package_report: input.push ?? pushPackage(),
    staging_runbook_report_path: "staging.json",
    staging_runbook_report: input.staging ?? stagingRunbook(),
    release_inputs_report_path: "inputs.json",
    release_inputs_report: input.inputs ?? releaseInputs(),
    readiness_summary_report_path: "readiness.json",
    readiness_summary_report: input.summary ?? readiness()
  });
}

test("release owner runbook is ready for review from accepted release evidence", () => {
  const built = report();

  assert.equal(built.release_owner_runbook_ready, true);
  assert.equal(built.result.status, "ready-for-release-owner-review");
  assert.equal(built.push_execution_allowed, false);
  assert.equal(built.docker_deploy_allowed, false);
  assert.equal(built.preprocess_execution_allowed, false);
  assert.equal(built.mvp_completion_allowed, false);
  assert.deepEqual(built.summary.runbook_blockers, []);
  assert.deepEqual(built.summary.push_execution_blockers, ["external-release-decision-required"]);
  assert.ok(built.summary.docker_deploy_blockers.includes("separate-nas-runtime-approval-required"));
  assert.ok(built.summary.mvp_completion_blockers.includes("post-release-smoke-required"));
  assert.equal(built.observations.workflow_dispatch_command, WORKFLOW_COMMAND);
  assert.match(built.observations.post_release_smoke_command, /validate:admin-docker-post-release-smoke/);
  assert.match(built.observations.post_release_smoke_command, new RegExp(TARGET));
});

test("release owner runbook blocks if readiness is not ready", () => {
  const built = report({
    summary: readiness({
      release_review_ready: false,
      summary: {
        release_review_blockers: ["worker-proof-accepted"]
      },
      result: {
        status: "blocked"
      }
    })
  });

  assert.equal(built.release_owner_runbook_ready, false);
  assert.equal(built.result.status, "blocked");
  assert.ok(built.summary.runbook_blockers.includes("readiness-ready-for-release-decision"));
});

test("release owner runbook fails if source reports try to approve push or deploy", () => {
  const built = report({
    inputs: releaseInputs({
      push_execution_allowed: true
    })
  });

  assert.equal(built.release_owner_runbook_ready, false);
  assert.equal(built.result.status, "failed");
  assert.ok(built.summary.runbook_blockers.includes("source-reports-remain-nondeploy"));
  assert.equal(built.gates.find((item) => item.id === "source-reports-remain-nondeploy")?.status, "fail");
});

test("release owner runbook markdown includes release and smoke sequence", () => {
  const markdown = toMarkdown(report());

  assert.match(markdown, /Admin Docker Release Owner Runbook/);
  assert.match(markdown, /gh workflow run docker-admin\.yml/);
  assert.match(markdown, /Final URL Read-only Smoke After Deploy/);
  assert.match(markdown, /Controlled Preprocess Smoke/);
  assert.match(markdown, /MVP completion allowed: no/);
});

test("release owner runbook CLI writes review artifact", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-release-owner-runbook-"));
  const pushPath = path.join(tempDir, "admin-docker-push-decision-package-20260629T000000Z.json");
  const stagingPath = path.join(tempDir, "admin-docker-staging-runbook-20260629T000000Z.json");
  const inputsPath = path.join(tempDir, "admin-docker-release-inputs-20260629T000000Z.json");
  const readinessPath = path.join(tempDir, "admin-docker-release-readiness-summary-20260629T000000Z.json");

  try {
    await writeFile(pushPath, JSON.stringify(pushPackage()), "utf8");
    await writeFile(stagingPath, JSON.stringify(stagingRunbook()), "utf8");
    await writeFile(inputsPath, JSON.stringify(releaseInputs()), "utf8");
    await writeFile(readinessPath, JSON.stringify(readiness()), "utf8");

    const built = await runAdminDockerReleaseOwnerRunbook({
      artifact_dir: tempDir,
      output_dir: tempDir,
      generated_at: "2026-06-29T00:00:00.000Z",
      command: "test"
    });
    const json = await readFile(built.artifacts?.json_path ?? "", "utf8");
    const markdown = await readFile(built.artifacts?.markdown_path ?? "", "utf8");

    assert.equal(built.release_owner_runbook_ready, true);
    assert.match(json, /ready-for-release-owner-review/);
    assert.match(markdown, /Push execution allowed: no/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("release owner runbook defaults to push decision package sources instead of latest stale release inputs", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-release-owner-runbook-sources-"));
  const pushPath = path.join(tempDir, "admin-docker-push-decision-package-20260629T000000Z.json");
  const stagingPath = path.join(tempDir, "admin-docker-staging-runbook-20260629T000000Z.json");
  const readyInputsPath = path.join(tempDir, "admin-docker-release-inputs-20260629T000000Z.json");
  const blockedInputsPath = path.join(tempDir, "admin-docker-release-inputs-20260629T999999Z.json");
  const readinessPath = path.join(tempDir, "admin-docker-release-readiness-summary-20260629T000000Z.json");

  try {
    await writeFile(pushPath, JSON.stringify({
      ...pushPackage(),
      sources: {
        staging_runbook_report: stagingPath,
        release_inputs_report: readyInputsPath,
        readiness_summary_report: readinessPath
      }
    }), "utf8");
    await writeFile(stagingPath, JSON.stringify(stagingRunbook()), "utf8");
    await writeFile(readyInputsPath, JSON.stringify(releaseInputs()), "utf8");
    await writeFile(blockedInputsPath, JSON.stringify(releaseInputs({
      release_inputs_ready: false,
      summary: {
        release_input_blockers: ["stale-latest-input"]
      }
    })), "utf8");
    await writeFile(readinessPath, JSON.stringify(readiness()), "utf8");

    const built = await runAdminDockerReleaseOwnerRunbook({
      artifact_dir: tempDir,
      output_dir: tempDir,
      generated_at: "2026-06-29T00:00:00.000Z",
      command: "test"
    });

    assert.equal(built.release_owner_runbook_ready, true);
    assert.equal(built.sources.release_inputs_report, readyInputsPath);
    assert.deepEqual(built.summary.runbook_blockers, []);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
