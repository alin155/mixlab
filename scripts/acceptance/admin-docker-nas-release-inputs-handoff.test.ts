import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildAdminDockerNasReleaseInputsHandoffReport,
  runAdminDockerNasReleaseInputsHandoff,
  toMarkdown
} from "./admin-docker-nas-release-inputs-handoff.ts";

const TARGET_TAG = "e94a5bdd8fc981b8112cc372df6f18204bb47528";
const TARGET_REF = `admin-docker-candidate-${TARGET_TAG}`;
const RELEASE_INPUT_BLOCKERS = [
  "nas-image-proof-provided",
  "nas-image-proof-accepted",
  "nas-proof-does-not-approve-deploy",
  "current-and-rollback-tags-present",
  "rollback-tag-matches-current",
  "target-tag-differs-from-current",
  "workflow-command-has-no-placeholders"
];

function prestaging(): unknown {
  return {
    mode: "admin-docker-prestaging-handoff",
    ready_to_request_release_inputs: true,
    staging_execution_ready: false,
    docker_deploy_allowed: false
  };
}

function candidateRef(overrides: Record<string, unknown> = {}): unknown {
  return {
    mode: "admin-docker-candidate-ref-proof",
    candidate_ref_proof_accepted: true,
    docker_deploy_allowed: false,
    candidate: {
      expected_sha: TARGET_TAG,
      expected_tag: TARGET_REF
    },
    summary: {
      candidate_ref_blockers: []
    },
    ...overrides
  };
}

function releaseInputs(overrides: Record<string, unknown> = {}): unknown {
  return {
    mode: "admin-docker-release-inputs",
    release_inputs_ready: false,
    push_execution_allowed: false,
    docker_deploy_allowed: false,
    observations: {
      candidate_ref_expected_sha: TARGET_TAG,
      candidate_ref_expected_tag: TARGET_REF
    },
    summary: {
      release_input_blockers: RELEASE_INPUT_BLOCKERS
    },
    result: {
      status: "blocked"
    },
    ...overrides
  };
}

function report(input: {
  candidate?: unknown;
  release?: unknown;
  collector?: string;
} = {}) {
  return buildAdminDockerNasReleaseInputsHandoffReport({
    generated_at: "2026-06-28T00:00:00.000Z",
    command: "test",
    prestaging_handoff_report_path: "prestaging.json",
    prestaging_handoff_report: prestaging(),
    candidate_ref_proof_report_path: "candidate-ref.json",
    candidate_ref_proof_report: input.candidate ?? candidateRef(),
    release_inputs_report_path: "release-inputs.json",
    release_inputs_report: input.release ?? releaseInputs(),
    collector_source_path: input.collector ?? "collector.sh",
    bundle_dir: "handoff-bundle",
    artifact_dir: "docs/acceptance/artifacts"
  });
}

test("NAS release-inputs handoff is ready only for the expected NAS collection blockers", () => {
  const built = report();

  assert.equal(built.handoff_package_ready, true);
  assert.equal(built.push_execution_allowed, false);
  assert.equal(built.docker_deploy_allowed, false);
  assert.equal(built.result.status, "ready-for-nas-collection");
  assert.deepEqual(built.summary.handoff_blockers, []);
  assert.equal(built.observations.candidate_sha, TARGET_TAG);
  assert.equal(built.observations.candidate_release_ref, TARGET_REF);
  assert.deepEqual(built.observations.unexpected_release_input_blockers, []);
  assert.deepEqual(built.observations.missing_expected_release_input_blockers, []);
  assert.ok(built.operator_handoff.local_validation_commands.some((item) => item.includes("MIXLAB_ADMIN_DOCKER_CANDIDATE_REF_PROOF_REPORT")));
  assert.ok(built.operator_handoff.local_validation_commands.some((item) => item.includes("validate:admin-docker-release-inputs")));
});

test("NAS release-inputs handoff does not include executable push instructions", () => {
  const markdown = toMarkdown(report());

  assert.match(markdown, /push execution allowed: no/i);
  assert.match(markdown, /Do not run push_images=true/);
  assert.equal(markdown.includes("gh workflow run docker-admin.yml"), false);
});

test("NAS release-inputs handoff blocks unexpected release-input blockers", () => {
  const built = report({
    release: releaseInputs({
      summary: {
        release_input_blockers: [
          "candidate-ref-proof-accepted",
          ...RELEASE_INPUT_BLOCKERS
        ]
      }
    })
  });

  assert.equal(built.handoff_package_ready, false);
  assert.ok(built.summary.handoff_blockers.includes("release-inputs-still-blocked-for-nas-collection"));
  assert.deepEqual(built.observations.unexpected_release_input_blockers, ["candidate-ref-proof-accepted"]);
});

test("NAS release-inputs handoff fails if source reports approve deploy", () => {
  const built = report({
    candidate: candidateRef({
      docker_deploy_allowed: true
    })
  });

  assert.equal(built.handoff_package_ready, false);
  assert.equal(built.result.status, "failed");
  assert.ok(built.summary.handoff_blockers.includes("candidate-ref-proof-does-not-approve-deploy"));
});

test("NAS release-inputs handoff CLI writes report and bundle", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-nas-handoff-"));
  const prestagingPath = path.join(tempRoot, "prestaging.json");
  const candidatePath = path.join(tempRoot, "candidate-ref.json");
  const releaseInputsPath = path.join(tempRoot, "release-inputs.json");

  await writeFile(prestagingPath, `${JSON.stringify(prestaging(), null, 2)}\n`);
  await writeFile(candidatePath, `${JSON.stringify(candidateRef(), null, 2)}\n`);
  await writeFile(releaseInputsPath, `${JSON.stringify(releaseInputs(), null, 2)}\n`);

  const built = await runAdminDockerNasReleaseInputsHandoff({
    prestaging_handoff_report_path: prestagingPath,
    candidate_ref_proof_report_path: candidatePath,
    release_inputs_report_path: releaseInputsPath,
    output_dir: tempRoot,
    artifact_dir: tempRoot,
    generated_at: "2026-06-28T00:00:00.000Z",
    command: "test"
  });

  assert.equal(built.handoff_package_ready, true);
  assert.equal(built.artifacts?.json_path, path.join(tempRoot, "admin-docker-nas-release-inputs-handoff-20260628T000000Z.json"));
  assert.match(await readFile(built.artifacts?.markdown_path ?? "", "utf8"), /ready-for-nas-collection/);
  const readme = await readFile(built.artifacts?.readme_path ?? "", "utf8");
  const checklist = await readFile(built.artifacts?.operator_checklist_path ?? "", "utf8");
  const manifest = await readFile(built.artifacts?.manifest_path ?? "", "utf8");

  assert.match(readme, /admin-docker-nas-release-inputs-collector\.sh/);
  assert.match(readme, /sh \.\/nas\/RUN_ON_NAS\.sh/);
  assert.match(readme, /sh \.\/local\/install-nas-runner\.sh/);
  assert.match(readme, /sh \.\/local\/validate-returned-evidence\.sh/);
  assert.match(readme, /sensitive fields before running intake/);
  assert.match(checklist, /Admin Docker NAS Operator Checklist/);
  assert.match(checklist, /Candidate SHA/);
  assert.match(checklist, /sh \.\/nas\/RUN_ON_NAS\.sh/);
  assert.match(checklist, /validate-returned-evidence\.sh/);
  assert.match(checklist, /Stop Conditions/);
  assert.match(checklist, /Push execution allowed: no/);
  assert.match(manifest, /"nas_writes_allowed": false/);
  assert.match(manifest, /OPERATOR-CHECKLIST\.md/);
  assert.match(manifest, /RUN_ON_NAS\.sh/);
  assert.match(manifest, /install-nas-runner\.sh/);
  assert.match(manifest, /validate-returned-evidence\.sh/);
  const validator = await readFile(built.artifacts?.local_validator_path ?? "", "utf8");
  assert.match(validator, /REQUIRED_FILES=/);
  assert.match(validator, /unexpected file in returned evidence directory/);
  assert.match(validator, /returned evidence appears to contain sensitive fields/);
  assert.match(validator, /precheck:admin-docker-nas-returned-evidence/);
  assert.ok((await stat(built.artifacts?.collector_path ?? "")).mode & 0o111);
  assert.ok((await stat(built.artifacts?.nas_runner_path ?? "")).mode & 0o111);
  assert.ok((await stat(built.artifacts?.local_installer_path ?? "")).mode & 0o111);
  assert.ok((await stat(built.artifacts?.local_validator_path ?? "")).mode & 0o111);
  assert.equal(built.artifacts?.latest_json_path, path.join(tempRoot, "admin-docker-nas-release-inputs-handoff-latest.json"));
  assert.match(await readFile(built.artifacts?.latest_markdown_path ?? "", "utf8"), /ready-for-nas-collection/);
  assert.match(await readFile(built.artifacts?.latest_readme_path ?? "", "utf8"), /sh \.\/local\/install-nas-runner\.sh/);
  assert.match(await readFile(built.artifacts?.latest_operator_checklist_path ?? "", "utf8"), /Admin Docker NAS Operator Checklist/);
  assert.ok((await stat(path.join(built.artifacts?.latest_bundle_dir ?? "", "nas", "RUN_ON_NAS.sh"))).mode & 0o111);
  assert.ok((await stat(path.join(built.artifacts?.latest_bundle_dir ?? "", "local", "install-nas-runner.sh"))).mode & 0o111);
});
