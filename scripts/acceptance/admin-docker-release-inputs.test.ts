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
      target_image_tag: TARGET_TAG
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

function report(input: {
  handoff?: unknown;
  proof?: unknown;
  handoffPath?: string;
  proofPath?: string;
} = {}) {
  return buildAdminDockerReleaseInputsReport({
    generated_at: "2026-06-27T00:00:00.000Z",
    command: "test",
    prestaging_handoff_report_path: input.handoffPath ?? (input.handoff === undefined ? undefined : "handoff.json"),
    prestaging_handoff_report: input.handoff,
    nas_image_proof_report_path: input.proofPath ?? (input.proof === undefined ? undefined : "proof.json"),
    nas_image_proof_report: input.proof
  });
}

test("release input package stays blocked when handoff and NAS proof are missing", () => {
  const built = report();

  assert.equal(built.release_inputs_ready, false);
  assert.equal(built.push_execution_allowed, false);
  assert.equal(built.docker_deploy_allowed, false);
  assert.equal(built.result.status, "blocked");
  assert.ok(built.summary.release_input_blockers.includes("prestaging-handoff-provided"));
  assert.ok(built.summary.release_input_blockers.includes("nas-image-proof-provided"));
  assert.equal(built.inputs.workflow_dispatch_command, "");
  assert.ok(built.next_actions.some((item) => item.includes("validate:admin-docker-nas-image-proof")));
});

test("release input package emits exact workflow command but still requires explicit approval", () => {
  const built = report({
    handoff: handoff(),
    proof: nasImageProof()
  });

  assert.equal(built.release_inputs_ready, true);
  assert.equal(built.push_execution_allowed, false);
  assert.equal(built.docker_deploy_allowed, false);
  assert.equal(built.release_decision_required, true);
  assert.equal(built.result.status, "ready-for-release-decision");
  assert.deepEqual(built.summary.release_input_blockers, []);
  assert.ok(built.summary.push_execution_blockers.includes("handoff-staging-blockers-carried-forward"));
  assert.ok(built.summary.push_execution_blockers.includes("explicit-release-approval-required"));
  assert.deepEqual(built.observations.handoff_staging_execution_blockers, [
    "explicit-push-approval-required",
    "current-and-rollback-tags-required"
  ]);
  assert.equal(built.inputs.target_image_tag, TARGET_TAG);
  assert.equal(built.inputs.current_image_tag, CURRENT_TAG);
  assert.equal(built.inputs.rollback_image_tag, CURRENT_TAG);
  assert.match(built.inputs.workflow_dispatch_command, /push_images=true/);
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
    proof: nasImageProof()
  });

  assert.equal(built.release_inputs_ready, true);
  assert.ok(built.summary.push_execution_blockers.includes("handoff-staging-blockers-carried-forward"));
  assert.ok(built.observations.handoff_staging_execution_blockers.includes("nas-disk-risk-carried-forward"));
  assert.ok(built.next_actions.some((item) => item.includes("nas-disk-risk-carried-forward")));
});

test("release input package blocks a rejected NAS image proof", () => {
  const built = report({
    handoff: handoff(),
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

test("release input package blocks when target tag equals current tag", () => {
  const built = report({
    handoff: handoff({
      release_input_request: {
        target_image_tag: CURRENT_TAG
      }
    }),
    proof: nasImageProof()
  });

  assert.equal(built.release_inputs_ready, false);
  assert.ok(built.summary.release_input_blockers.includes("target-tag-differs-from-current"));
});

test("release input package derives branch from handoff workflow command", () => {
  const built = report({
    handoff: handoff({
      candidate: {},
      release_input_request: {
        target_image_tag: TARGET_TAG,
        workflow_dispatch_command: "gh workflow run docker-admin.yml --repo alin155/mixlab --ref codex/custom-admin-release -f push_images=true"
      }
    }),
    proof: nasImageProof()
  });

  assert.equal(built.release_inputs_ready, true);
  assert.equal(built.inputs.branch, "codex/custom-admin-release");
  assert.match(built.inputs.workflow_dispatch_command, /--ref codex\/custom-admin-release/);
});

test("release input package fails if an input report tries to approve staging or deploy", () => {
  const built = report({
    handoff: handoff({
      staging_execution_ready: true,
      docker_deploy_allowed: true
    }),
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
  const proofPath = path.join(tempRoot, "proof.json");

  await writeFile(handoffPath, `${JSON.stringify(handoff(), null, 2)}\n`);
  await writeFile(proofPath, `${JSON.stringify(nasImageProof(), null, 2)}\n`);

  const built = await runAdminDockerReleaseInputs({
    prestaging_handoff_report_path: handoffPath,
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
