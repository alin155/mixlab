import assert from "node:assert/strict";
import test from "node:test";

import { buildAdminWorkerEnvProofReport } from "./admin-worker-env-proof.ts";

const SAFE_ENV = [
  "MIXLAB_ADMIN_DOCKER_MVP_MODE=v0.1",
  "MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=0",
  "MIXLAB_ENABLE_READY_PUBLISH_WORKER=0",
  "DASHSCOPE_API_KEY=not-recorded-by-report"
].join("\n");

const SAFE_INSPECT = JSON.stringify([
  {
    Name: "/mixlab-admin-worker-1",
    Config: {
      Image: "ghcr.io/alin155/mixlab-admin-runtime:test-tag",
      Env: [
        "MIXLAB_ADMIN_DOCKER_MVP_MODE=v0.1",
        "MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=0",
        "MIXLAB_ENABLE_READY_PUBLISH_WORKER=0",
        "MIXLAB_ADMIN_LIBRARY_ROOT=/data/PublicLibrary",
        "MIXLAB_PREPROCESS_LIBRARY_ROOT=/data/PublicLibrary",
        "DASHSCOPE_API_KEY=secret"
      ]
    }
  }
]);

test("admin worker env proof stays blocked and provides collection instructions when evidence is missing", () => {
  const report = buildAdminWorkerEnvProofReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test"
  });

  assert.equal(report.proof_accepted, false);
  assert.equal(report.docker_upload_allowed, false);
  assert.equal(report.result.status, "blocked");
  assert.equal(report.observations.env_file_present, false);
  assert.equal(report.observations.inspect_json_present, false);
  assert.ok(report.summary.upload_blockers.includes("env-file-provided"));
  assert.ok(report.summary.upload_blockers.includes("inspect-json-provided"));
  assert.ok(report.collection_instructions.some((item) => item.includes("admin-docker-nas-release-inputs-collector.sh")));
  assert.ok(report.collection_instructions.some((item) => item.includes("MIXLAB_ADMIN_DOCKER_MVP_MODE")));
  assert.equal(report.collection_instructions.some((item) => item.includes("env | sort")), false);
  assert.equal(report.collection_instructions.some((item) => item.includes("DASHSCOPE_API_KEY")), false);
  assert.equal(report.remediation_review.status, "blocked");
  assert.ok(report.remediation_review.blockers.includes("env-file-required-before-remediation-review"));
  assert.ok(report.remediation_review.blockers.includes("inspect-json-required-before-remediation-review"));
});

test("admin worker env proof accepts disabled worker flags and Docker library roots", () => {
  const report = buildAdminWorkerEnvProofReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    env_file_path: "admin-worker.env",
    env_file_raw: SAFE_ENV,
    inspect_json_path: "admin-worker.inspect.json",
    inspect_json_raw: SAFE_INSPECT
  });

  assert.equal(report.proof_accepted, true);
  assert.equal(report.docker_upload_allowed, false);
  assert.equal(report.result.status, "accepted");
  assert.deepEqual(report.summary.upload_blockers, []);
  assert.equal(report.observations.env_file_flags.MIXLAB_ADMIN_DOCKER_MVP_MODE, "v0.1");
  assert.equal(report.observations.env_file_flags.MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER, "0");
  assert.equal(report.observations.inspect_flags.MIXLAB_ADMIN_DOCKER_MVP_MODE, "v0.1");
  assert.equal(report.observations.inspect_flags.MIXLAB_ENABLE_READY_PUBLISH_WORKER, "0");
  assert.equal(report.observations.library_roots.MIXLAB_ADMIN_LIBRARY_ROOT, "/data/PublicLibrary");
  assert.equal(report.observations.image, "ghcr.io/alin155/mixlab-admin-runtime:test-tag");
  assert.equal(
    report.gates.find((gate) => gate.id === "admin-worker-library-roots")?.status,
    "pass"
  );
  assert.equal(JSON.stringify(report).includes("DASHSCOPE_API_KEY"), false);
  assert.equal(JSON.stringify(report).includes("not-recorded-by-report"), false);
  assert.equal(report.remediation_review.status, "not-needed");
  assert.equal(report.remediation_review.accepted, true);
});

test("admin worker env proof blocks when standalone workers are enabled", () => {
  const report = buildAdminWorkerEnvProofReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    env_file_path: "admin-worker.env",
    env_file_raw: SAFE_ENV.replace("MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=0", "MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=1"),
    inspect_json_path: "admin-worker.inspect.json",
    inspect_json_raw: SAFE_INSPECT.replace("MIXLAB_ENABLE_READY_PUBLISH_WORKER=0", "MIXLAB_ENABLE_READY_PUBLISH_WORKER=1")
  });

  assert.equal(report.proof_accepted, false);
  assert.equal(report.remediation_plan.status, "required");
  assert.ok(report.remediation_plan.required_changes.some((item) => (
    item.key === "MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER" &&
    item.required_value === "0"
  )));
  assert.ok(report.remediation_plan.required_changes.some((item) => (
    item.key === "MIXLAB_ENABLE_READY_PUBLISH_WORKER" &&
    item.required_value === "0"
  )));
  assert.ok(report.remediation_plan.forbidden_actions.some((item) => item.includes("Do not start preprocessing")));
  assert.equal(
    report.gates.find((gate) => gate.id === "env-file-worker-flags-disabled")?.status,
    "blocked"
  );
  assert.equal(
    report.gates.find((gate) => gate.id === "inspect-worker-flags-disabled")?.status,
    "blocked"
  );
  assert.ok(report.summary.upload_blockers.includes("env-file-worker-flags-disabled"));
  assert.ok(report.summary.upload_blockers.includes("inspect-worker-flags-disabled"));
  assert.equal(report.remediation_review.status, "accepted-for-runtime-owner-action");
  assert.equal(report.remediation_review.accepted, true);
  assert.equal(report.remediation_review.runtime_action_allowed, false);
  assert.equal(report.remediation_review.docker_deploy_allowed, false);
  assert.equal(report.operator_handoff.required_target_env.MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER, "0");
  assert.ok(report.operator_handoff.rollback_notes.some((item) => item.includes("current index unchanged")));
});

test("admin worker env proof blocks when docker mvp mode is disabled", () => {
  const report = buildAdminWorkerEnvProofReport({
    generated_at: "2026-06-27T00:00:00.000Z",
    command: "test",
    env_file_path: "admin-worker.env",
    env_file_raw: SAFE_ENV.replace("MIXLAB_ADMIN_DOCKER_MVP_MODE=v0.1", "MIXLAB_ADMIN_DOCKER_MVP_MODE=off"),
    inspect_json_path: "admin-worker.inspect.json",
    inspect_json_raw: SAFE_INSPECT.replace("MIXLAB_ADMIN_DOCKER_MVP_MODE=v0.1", "MIXLAB_ADMIN_DOCKER_MVP_MODE=off")
  });

  assert.equal(report.proof_accepted, false);
  assert.equal(
    report.gates.find((gate) => gate.id === "env-file-worker-flags-disabled")?.status,
    "blocked"
  );
  assert.equal(
    report.gates.find((gate) => gate.id === "inspect-worker-flags-disabled")?.status,
    "blocked"
  );
  assert.ok(report.summary.upload_blockers.includes("env-file-worker-flags-disabled"));
  assert.ok(report.summary.upload_blockers.includes("inspect-worker-flags-disabled"));
});

test("admin worker env proof remediation plan is not needed for safe worker evidence", () => {
  const report = buildAdminWorkerEnvProofReport({
    generated_at: "2026-06-27T00:00:00.000Z",
    command: "test",
    env_file_path: "admin-worker.env",
    env_file_raw: SAFE_ENV,
    inspect_json_path: "admin-worker.inspect.json",
    inspect_json_raw: SAFE_INSPECT
  });

  assert.equal(report.proof_accepted, true);
  assert.equal(report.remediation_plan.status, "not-needed");
  assert.equal(report.remediation_review.status, "not-needed");
  assert.equal(report.remediation_review.accepted, true);
  assert.deepEqual(report.remediation_plan.required_changes, []);
  assert.equal(report.remediation_plan.target_env.MIXLAB_ADMIN_DOCKER_MVP_MODE, "v0.1");
  assert.equal(report.remediation_plan.target_env.MIXLAB_PREPROCESS_LIBRARY_ROOT, "/data/PublicLibrary");
});

test("admin worker env proof remediation plan identifies missing preprocess root", () => {
  const inspectWithoutPreprocessRoot = SAFE_INSPECT.replace(
    "\"MIXLAB_PREPROCESS_LIBRARY_ROOT=/data/PublicLibrary\",",
    ""
  );
  const report = buildAdminWorkerEnvProofReport({
    generated_at: "2026-06-27T00:00:00.000Z",
    command: "test",
    env_file_path: "admin-worker.env",
    env_file_raw: SAFE_ENV,
    inspect_json_path: "admin-worker.inspect.json",
    inspect_json_raw: inspectWithoutPreprocessRoot
  });

  assert.equal(report.proof_accepted, false);
  assert.equal(report.remediation_plan.status, "required");
  assert.ok(report.remediation_plan.required_changes.some((item) => (
    item.key === "MIXLAB_PREPROCESS_LIBRARY_ROOT" &&
    item.running_value === "missing" &&
    item.required_value === "/data/PublicLibrary"
  )));
});
