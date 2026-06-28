import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildAdminCutterStagedProofPlanReport,
  runAdminCutterStagedProofPlan,
  toMarkdown
} from "./admin-cutter-staged-proof-plan.ts";

const TARGET_TAG = "25fe2264de7b391a56e770a8acb6bf40ebec3863";

function readyReport() {
  return buildAdminCutterStagedProofPlanReport({
    generated_at: "2026-06-28T00:00:00.000Z",
    command: "test",
    runner_base_url: "http://192.168.1.20:3799",
    candidate_image_tag: TARGET_TAG,
    expected_ready_count: 10471,
    expected_release_version: "v010471",
    real_cut_query: "第一场",
    include_desktop_screenshot: true
  });
}

test("staged Cutter proof plan is ready without contacting external systems", () => {
  const report = readyReport();

  assert.equal(report.plan_ready, true);
  assert.equal(report.result.status, "ready-for-staged-cutter-proof");
  assert.equal(report.docker_upload_allowed, false);
  assert.equal(report.run_policy.plan_only, true);
  assert.equal(report.run_policy.windows_runner_touched, false);
  assert.equal(report.run_policy.nas_runtime_touched, false);
  assert.equal(report.run_policy.docker_touched, false);
  assert.equal(report.run_policy.secrets_recorded, false);
  assert.deepEqual(report.summary.plan_blockers, []);
  assert.ok(report.request_templates.some((item) => item.suite === "windows_acceptance"));
  assert.ok(report.request_templates.some((item) => item.suite === "real_cut_smoke"));
  assert.ok(report.request_templates.some((item) => item.suite === "desktop_ui_screenshot_smoke"));
  assert.match(report.command_templates.validate_proof, /validate:admin-cutter-compatibility-proof/);
  assert.match(report.command_templates.validate_proof, /MIXLAB_CUTTER_EXPECTED_READY_COUNT=10471/);
  assert.match(report.command_templates.validate_proof, /MIXLAB_CUTTER_EXPECTED_RELEASE_VERSION=v010471/);
});

test("staged Cutter proof plan blocks Mac-localhost runner URLs", () => {
  const report = buildAdminCutterStagedProofPlanReport({
    generated_at: "2026-06-28T00:00:00.000Z",
    command: "test",
    runner_base_url: "http://127.0.0.1:3799",
    candidate_image_tag: TARGET_TAG
  });

  assert.equal(report.plan_ready, false);
  assert.ok(report.summary.plan_blockers.includes("runner-base-url-mac-reachable"));
  assert.match(toMarkdown(report), /Use the Windows LAN address/);
});

test("staged Cutter proof plan blocks when candidate image tag is missing", () => {
  const report = buildAdminCutterStagedProofPlanReport({
    generated_at: "2026-06-28T00:00:00.000Z",
    command: "test",
    runner_base_url: "http://192.168.1.20:3799"
  });

  assert.equal(report.plan_ready, false);
  assert.ok(report.summary.plan_blockers.includes("candidate-image-tag-provided"));
  assert.equal(report.inputs.candidate_image_tag, "");
});

test("staged Cutter proof plan markdown stays sanitized", () => {
  const markdown = toMarkdown(readyReport());

  assert.match(markdown, /plan-only artifact/);
  assert.match(markdown, /approved-cutter-session-token/);
  assert.doesNotMatch(markdown, /super-secret-password/);
  assert.doesNotMatch(markdown, new RegExp(["session", "token="].join("_")));
  assert.doesNotMatch(markdown, new RegExp(["Cook", "ie:"].join("")));
  assert.match(markdown, /curl --noproxy '\*'/);
});

test("staged Cutter proof plan can derive candidate tag from latest readiness artifact", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-cutter-staged-proof-plan-"));
  await writeFile(path.join(tempRoot, "admin-docker-release-readiness-summary-20260628T000000Z.json"), `${JSON.stringify({
    observations: {
      github_candidate_image_tag: TARGET_TAG
    }
  })}\n`);

  const report = await runAdminCutterStagedProofPlan({
    output_dir: tempRoot,
    artifact_dir: tempRoot,
    generated_at: "2026-06-28T00:00:00.000Z",
    command: "test",
    runner_base_url: "http://192.168.1.20:3799"
  });

  assert.equal(report.plan_ready, true);
  assert.equal(report.inputs.candidate_image_tag, TARGET_TAG);
  assert.equal(report.artifacts?.json_path, path.join(tempRoot, "admin-cutter-staged-proof-plan-20260628T000000Z.json"));
  assert.match(await readFile(report.artifacts?.markdown_path ?? "", "utf8"), /Admin Cutter Staged Proof Plan/);
});
