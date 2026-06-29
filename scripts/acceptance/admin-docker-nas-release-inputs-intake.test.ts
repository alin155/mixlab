import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runAdminDockerNasReleaseInputsIntake } from "./admin-docker-nas-release-inputs-intake.ts";

const TARGET_TAG = "ff05c8a4e4b88463fc0227ee173ba859d85a41be";
const CURRENT_TAG = "acf896c6d16ec1503237f3afa854afff60a191b3";
const CANDIDATE_REF = `admin-docker-candidate-${TARGET_TAG}`;

async function writeText(filePath: string, content: string): Promise<string> {
  await writeFile(filePath, content);
  return filePath;
}

async function writeJson(filePath: string, value: unknown): Promise<string> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function currentEnv(): string {
  return [
    `MIXLAB_IMAGE_TAG=${CURRENT_TAG}`
  ].join("\n");
}

function currentInspect(): unknown[] {
  return [
    {
      Name: "/mixlab-admin-api-1",
      Config: {
        Image: `ghcr.io/alin155/mixlab-admin-runtime:${CURRENT_TAG}`,
        Labels: {
          "com.docker.compose.service": "admin-api"
        }
      }
    },
    {
      Name: "/mixlab-admin-worker-1",
      Config: {
        Image: `ghcr.io/alin155/mixlab-admin-runtime:${CURRENT_TAG}`,
        Labels: {
          "com.docker.compose.service": "admin-worker"
        }
      }
    },
    {
      Name: "/mixlab-admin-web-1",
      Config: {
        Image: `ghcr.io/alin155/mixlab-admin-web:${CURRENT_TAG}`,
        Labels: {
          "com.docker.compose.service": "admin-web"
        }
      }
    }
  ];
}

function legacyCurrentEnv(): string {
  return "MIXLAB_IMAGE_TAG=latest";
}

function legacyCurrentInspect(): unknown[] {
  return [
    {
      Name: "/mixlab-admin-api-1",
      Config: {
        Image: "ghcr.io/alin155/mixlab-admin-runtime:latest",
        Labels: {
          "com.docker.compose.service": "admin-api"
        }
      }
    },
    {
      Name: "/mixlab-admin-worker-1",
      Config: {
        Image: "ghcr.io/alin155/mixlab-admin-runtime:latest",
        Labels: {
          "com.docker.compose.service": "admin-worker"
        }
      }
    },
    {
      Name: "/mixlab-admin-web-1",
      Config: {
        Image: "ghcr.io/alin155/mixlab-admin-web:latest",
        Labels: {
          "com.docker.compose.service": "admin-web"
        }
      }
    }
  ];
}

function workerEnv(): string {
  return [
    "MIXLAB_ADMIN_DOCKER_MVP_MODE=v0.1",
    "MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=0",
    "MIXLAB_ENABLE_READY_PUBLISH_WORKER=0"
  ].join("\n");
}

function workerInspect(): unknown[] {
  return [
    {
      Name: "/mixlab-admin-worker-1",
      Config: {
        Image: `ghcr.io/alin155/mixlab-admin-runtime:${CURRENT_TAG}`,
        Env: [
          "MIXLAB_ADMIN_DOCKER_MVP_MODE=v0.1",
          "MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=0",
          "MIXLAB_ENABLE_READY_PUBLISH_WORKER=0",
          "MIXLAB_ADMIN_LIBRARY_ROOT=/data/PublicLibrary",
          "MIXLAB_PREPROCESS_LIBRARY_ROOT=/data/PublicLibrary"
        ]
      }
    }
  ];
}

function diskProof(): unknown {
  return {
    schema_version: "1.0",
    mode: "admin-docker-nas-release-inputs-collector",
    expected_library_root: "/data/PublicLibrary",
    thresholds: {
      attention_usage_percent: 87,
      block_usage_percent: 92
    },
    checks: [
      {
        id: "admin-api-library-root",
        scope: "container",
        service: "admin-api",
        path: "/data/PublicLibrary",
        filesystem: "/dev/md0",
        total_bytes: 1000,
        used_bytes: 600,
        available_bytes: 400,
        usage_percent: 60
      },
      {
        id: "admin-worker-library-root",
        scope: "container",
        service: "admin-worker",
        path: "/data/PublicLibrary",
        filesystem: "/dev/md0",
        total_bytes: 1000,
        used_bytes: 610,
        available_bytes: 390,
        usage_percent: 61
      }
    ]
  };
}

function prestagingHandoff(): unknown {
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
      workflow_ref: CANDIDATE_REF,
      release_ref_setup_command: `git tag ${CANDIDATE_REF} ${TARGET_TAG} && git push origin refs/tags/${CANDIDATE_REF}:refs/tags/${CANDIDATE_REF}`
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
    }
  };
}

function candidateRefProof(): unknown {
  return {
    mode: "admin-docker-candidate-ref-proof",
    candidate_ref_proof_accepted: true,
    docker_deploy_allowed: false,
    candidate: {
      expected_sha: TARGET_TAG,
      expected_tag: CANDIDATE_REF
    },
    github_run: {
      url: "https://github.com/alin155/mixlab/actions/runs/28307173676",
      headBranch: CANDIDATE_REF,
      headSha: TARGET_TAG
    },
    summary: {
      candidate_ref_blockers: []
    }
  };
}

function localSmoke(): unknown {
  return {
    mode: "admin-docker-local-smoke",
    local_smoke_passed: true,
    build_identity: {
      image_tag: TARGET_TAG,
      build_sha: TARGET_TAG,
      build_version: TARGET_TAG,
      mvp_mode: "v0.1"
    },
    summary: {
      local_smoke_blockers: []
    },
    result: {
      status: "accepted"
    }
  };
}

function parityPlan(): unknown {
  return {
    decision: {
      docker_image_update_required: true
    },
    summary: {
      upload_blockers: []
    },
    result: {
      status: "blocked"
    }
  };
}

function candidateContract(): unknown {
  return {
    mode: "admin-docker-candidate-contract-proof",
    candidate_contract_ready: true,
    summary: {
      candidate_review_blockers: []
    },
    result: {
      status: "ready-for-candidate-review"
    }
  };
}

function cutterCompatibility(): unknown {
  return {
    mode: "admin-cutter-compatibility-proof",
    proof_accepted: true,
    summary: {
      upload_blockers: []
    },
    result: {
      status: "accepted"
    }
  };
}

function imagePushProof(): unknown {
  return {
    mode: "admin-docker-image-push-proof",
    proof_accepted: false,
    push_execution_allowed: false,
    docker_deploy_allowed: false,
    summary: {
      image_push_proof_blockers: ["image-push-approval-observed-in-artifact"]
    },
    result: {
      status: "blocked"
    }
  };
}

function legacyRollbackPlan(): unknown {
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
    }
  };
}

function legacyExceptionReview(): unknown {
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
    }
  };
}

async function writeReturnedEvidenceBundle(returnedDir: string): Promise<void> {
  await mkdir(returnedDir, { recursive: true });
  await writeText(path.join(returnedDir, "admin-docker-current.env"), currentEnv());
  await writeJson(path.join(returnedDir, "admin-docker-current.inspect.json"), currentInspect());
  await writeText(path.join(returnedDir, "admin-worker.env"), workerEnv());
  await writeJson(path.join(returnedDir, "admin-worker.inspect.json"), workerInspect());
  await writeJson(path.join(returnedDir, "admin-docker-disk-proof.json"), diskProof());
  await writeText(path.join(returnedDir, "MANIFEST.txt"), [
    "schema_version=1.0",
    "mode=admin-docker-nas-release-inputs-collector",
    "push_execution_allowed=false",
    "docker_deploy_allowed=false",
    "nas_writes_allowed=false",
    "worker_start_allowed=false",
    "secret_sanitization=sanitized-only",
    "forbidden_full_env=true",
    "forbidden_full_docker_inspect=true",
    "forbidden_secrets=true"
  ].join("\n"));
  await writeText(path.join(returnedDir, "README.md"), [
    "# Admin Docker NAS Release Inputs",
    "",
    "This directory contains sanitized returned evidence.",
    "Do not copy full .env into this directory."
  ].join("\n"));
}

test("NAS release-inputs intake stays blocked when returned evidence is missing", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-nas-intake-missing-"));
  const report = await runAdminDockerNasReleaseInputsIntake({
    returned_dir: "",
    output_dir: tempRoot,
    artifact_dir: tempRoot,
    generated_at: "2026-06-28T00:00:00.000Z",
    command: "test"
  });

  assert.equal(report.result.status, "blocked");
  assert.equal(report.intake_complete, false);
  assert.equal(report.release_inputs_ready, false);
  assert.equal(report.push_execution_allowed, false);
  assert.equal(report.docker_deploy_allowed, false);
  assert.ok(report.summary.intake_blockers.includes("returned-dir-provided"));
  assert.ok(report.summary.intake_blockers.includes("returned-files-complete"));
  assert.equal(report.generated_reports.release_inputs_report, "");
  assert.equal(report.generated_reports.staging_runbook_report, "");
  const markdown = await readFile(report.artifacts?.markdown_path ?? "", "utf8");
  assert.match(markdown, /Result: blocked/);
  assert.match(markdown, /If returned evidence is missing/);
});

test("NAS release-inputs intake auto-discovers the latest sanitized returned evidence bundle", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-nas-intake-autodiscover-"));
  const staleDir = path.join(
    tempRoot,
    "admin-docker-nas-ugos-returned-evidence-20260628T000000Z",
    "admin-docker-release-inputs"
  );
  const freshDir = path.join(
    tempRoot,
    "admin-docker-nas-ugos-returned-evidence-20260628T010000Z",
    "admin-docker-release-inputs"
  );
  await mkdir(staleDir, { recursive: true });
  await writeText(path.join(staleDir, "README.md"), "# stale incomplete bundle\n");
  await writeReturnedEvidenceBundle(freshDir);

  const prestagingPath = await writeJson(path.join(tempRoot, "admin-docker-prestaging-handoff.json"), prestagingHandoff());
  const candidateRefPath = await writeJson(path.join(tempRoot, "admin-docker-candidate-ref-proof.json"), candidateRefProof());
  const localSmokePath = await writeJson(path.join(tempRoot, "admin-docker-local-smoke.json"), localSmoke());
  const parityPath = await writeJson(path.join(tempRoot, "admin-docker-version-parity-plan.json"), parityPlan());
  const candidateContractPath = await writeJson(path.join(tempRoot, "admin-docker-candidate-contract-proof.json"), candidateContract());
  const cutterPath = await writeJson(path.join(tempRoot, "admin-cutter-compatibility-proof.json"), cutterCompatibility());
  const imagePushProofPath = await writeJson(path.join(tempRoot, "admin-docker-image-push-proof.json"), imagePushProof());

  const report = await runAdminDockerNasReleaseInputsIntake({
    prestaging_handoff_report_path: prestagingPath,
    candidate_ref_proof_report_path: candidateRefPath,
    local_docker_smoke_report_path: localSmokePath,
    parity_plan_report_path: parityPath,
    candidate_contract_proof_report_path: candidateContractPath,
    cutter_compatibility_proof_report_path: cutterPath,
    image_push_proof_report_path: imagePushProofPath,
    output_dir: tempRoot,
    artifact_dir: tempRoot,
    generated_at: "2026-06-28T00:00:00.000Z",
    command: "test"
  });

  assert.equal(report.sources.returned_dir, freshDir);
  assert.equal(report.summary.intake_blockers.includes("returned-dir-provided"), false);
  assert.equal(report.summary.intake_blockers.includes("returned-files-complete"), false);
  assert.equal(report.observations.returned_precheck_passed, true);
  assert.equal(report.generated_reports.nas_image_proof_report.endsWith("admin-docker-nas-image-proof-20260628T000000Z.json"), true);
});

test("NAS release-inputs intake runs returned evidence precheck before proof generation", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-nas-intake-precheck-"));
  const returnedDir = path.join(tempRoot, "admin-docker-release-inputs");
  await mkdir(returnedDir);
  const unsafeInspect = currentInspect() as Array<Record<string, unknown>>;
  unsafeInspect[0] = {
    ...unsafeInspect[0],
    Config: {
      Image: `ghcr.io/alin155/mixlab-admin-runtime:${CURRENT_TAG}`,
      Labels: {
        "com.docker.compose.service": "admin-api"
      },
      Env: ["MIXLAB_ADMIN_LIBRARY_ROOT=/data/PublicLibrary"]
    }
  };

  await writeText(path.join(returnedDir, "admin-docker-current.env"), currentEnv());
  await writeJson(path.join(returnedDir, "admin-docker-current.inspect.json"), unsafeInspect);
  await writeText(path.join(returnedDir, "admin-worker.env"), workerEnv());
  await writeJson(path.join(returnedDir, "admin-worker.inspect.json"), workerInspect());
  await writeJson(path.join(returnedDir, "admin-docker-disk-proof.json"), diskProof());
  await writeText(path.join(returnedDir, "MANIFEST.txt"), [
    "schema_version=1.0",
    "mode=admin-docker-nas-release-inputs-collector",
    "push_execution_allowed=false",
    "docker_deploy_allowed=false",
    "nas_writes_allowed=false",
    "worker_start_allowed=false",
    "secret_sanitization=sanitized-only",
    "forbidden_full_env=true",
    "forbidden_full_docker_inspect=true",
    "forbidden_secrets=true"
  ].join("\n"));
  await writeText(path.join(returnedDir, "README.md"), "# Admin Docker NAS Release Inputs\n");

  const report = await runAdminDockerNasReleaseInputsIntake({
    returned_dir: returnedDir,
    output_dir: tempRoot,
    artifact_dir: tempRoot,
    generated_at: "2026-06-28T00:00:00.000Z",
    command: "test"
  });

  assert.equal(report.result.status, "blocked");
  assert.equal(report.intake_complete, false);
  assert.equal(report.observations.returned_precheck_passed, false);
  assert.ok(report.summary.intake_blockers.includes("returned-evidence-precheck-passed"));
  assert.ok(report.observations.returned_precheck_issues.some((issue) => issue.includes("inspect-env-present")));
  assert.equal(report.generated_reports.nas_image_proof_report, "");
  assert.equal(report.generated_reports.release_inputs_report, "");
  const markdown = await readFile(report.artifacts?.markdown_path ?? "", "utf8");
  assert.match(markdown, /Returned evidence is present but failed precheck/);
  assert.doesNotMatch(markdown, /Returned NAS evidence has already passed intake precheck/);
});

test("NAS release-inputs intake consumes returned proofs without approving push or deploy", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-nas-intake-"));
  const returnedDir = path.join(tempRoot, "admin-docker-release-inputs");
  await mkdir(returnedDir);

  await writeText(path.join(returnedDir, "admin-docker-current.env"), currentEnv());
  await writeJson(path.join(returnedDir, "admin-docker-current.inspect.json"), currentInspect());
  await writeText(path.join(returnedDir, "admin-worker.env"), workerEnv());
  await writeJson(path.join(returnedDir, "admin-worker.inspect.json"), workerInspect());
  await writeJson(path.join(returnedDir, "admin-docker-disk-proof.json"), diskProof());
  await writeText(path.join(returnedDir, "MANIFEST.txt"), [
    "schema_version=1.0",
    "mode=admin-docker-nas-release-inputs-collector",
    "push_execution_allowed=false",
    "docker_deploy_allowed=false",
    "nas_writes_allowed=false",
    "worker_start_allowed=false",
    "secret_sanitization=sanitized-only",
    "forbidden_full_env=true",
    "forbidden_full_docker_inspect=true",
    "forbidden_secrets=true"
  ].join("\n"));
  await writeText(path.join(returnedDir, "README.md"), [
    "# Admin Docker NAS Release Inputs",
    "",
    "This directory contains sanitized returned evidence.",
    "Do not copy full .env into this directory."
  ].join("\n"));

  const prestagingPath = await writeJson(path.join(tempRoot, "admin-docker-prestaging-handoff.json"), prestagingHandoff());
  const candidateRefPath = await writeJson(path.join(tempRoot, "admin-docker-candidate-ref-proof.json"), candidateRefProof());
  const localSmokePath = await writeJson(path.join(tempRoot, "admin-docker-local-smoke.json"), localSmoke());
  const parityPath = await writeJson(path.join(tempRoot, "admin-docker-version-parity-plan.json"), parityPlan());
  const candidateContractPath = await writeJson(path.join(tempRoot, "admin-docker-candidate-contract-proof.json"), candidateContract());
  const cutterPath = await writeJson(path.join(tempRoot, "admin-cutter-compatibility-proof.json"), cutterCompatibility());
  const imagePushProofPath = await writeJson(path.join(tempRoot, "admin-docker-image-push-proof.json"), imagePushProof());

  const report = await runAdminDockerNasReleaseInputsIntake({
    returned_dir: returnedDir,
    prestaging_handoff_report_path: prestagingPath,
    candidate_ref_proof_report_path: candidateRefPath,
    local_docker_smoke_report_path: localSmokePath,
    parity_plan_report_path: parityPath,
    candidate_contract_proof_report_path: candidateContractPath,
    cutter_compatibility_proof_report_path: cutterPath,
    image_push_proof_report_path: imagePushProofPath,
    output_dir: tempRoot,
    artifact_dir: tempRoot,
    generated_at: "2026-06-28T00:00:00.000Z",
    command: "test"
  });

  assert.equal(report.result.status, "intake-complete");
  assert.equal(report.intake_complete, true);
  assert.equal(report.release_inputs_ready, true);
  assert.equal(report.staging_execution_ready, false);
  assert.equal(report.push_execution_allowed, false);
  assert.equal(report.docker_deploy_allowed, false);
  assert.equal(report.observations.current_image_tag, CURRENT_TAG);
  assert.equal(report.observations.target_image_tag, TARGET_TAG);
  assert.equal(report.observations.rollback_image_tag, CURRENT_TAG);
  assert.equal(report.observations.returned_precheck_passed, true);
  assert.deepEqual(report.observations.returned_precheck_issues, []);
  assert.equal(report.observations.nas_image_proof_accepted, true);
  assert.equal(report.observations.worker_proof_accepted, true);
  assert.equal(report.observations.nas_disk_proof_accepted, true);
  assert.equal(report.returned_files.some((item) => item.expected_name === "MANIFEST.txt" && item.present), true);
  assert.equal(report.returned_files.some((item) => item.expected_name === "README.md" && item.present), true);
  assert.ok(report.generated_reports.nas_image_proof_report.endsWith("admin-docker-nas-image-proof-20260628T000000Z.json"));
  assert.ok(report.generated_reports.worker_env_proof_report.endsWith("admin-worker-env-proof-20260628T000000Z.json"));
  assert.ok(report.generated_reports.nas_disk_proof_report.endsWith("admin-docker-nas-disk-proof-20260628T000000Z.json"));
  assert.ok(report.generated_reports.release_inputs_report.endsWith("admin-docker-release-inputs-20260628T000000Z.json"));
  assert.ok(report.generated_reports.staging_runbook_report.endsWith("admin-docker-staging-runbook-20260628T000000Z.json"));
  assert.equal(report.sources.image_push_proof_report, imagePushProofPath);
  const runbook = JSON.parse(await readFile(report.generated_reports.staging_runbook_report, "utf8")) as {
    sources: { image_push_proof_report: string };
  };
  assert.equal(runbook.sources.image_push_proof_report, imagePushProofPath);
  assert.equal(JSON.stringify(report).includes("gh workflow run docker-admin.yml"), false);
  assert.match(await readFile(report.artifacts?.markdown_path ?? "", "utf8"), /Release inputs ready: yes/);
});

test("NAS release-inputs intake supports legacy latest exception only after release-manager approval", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-nas-intake-legacy-"));
  const returnedDir = path.join(tempRoot, "admin-docker-release-inputs");
  await mkdir(returnedDir);

  await writeText(path.join(returnedDir, "admin-docker-current.env"), legacyCurrentEnv());
  await writeJson(path.join(returnedDir, "admin-docker-current.inspect.json"), legacyCurrentInspect());
  await writeText(path.join(returnedDir, "admin-worker.env"), workerEnv());
  await writeJson(path.join(returnedDir, "admin-worker.inspect.json"), workerInspect());
  await writeJson(path.join(returnedDir, "admin-docker-disk-proof.json"), diskProof());
  await writeText(path.join(returnedDir, "MANIFEST.txt"), [
    "schema_version=1.0",
    "mode=admin-docker-nas-release-inputs-collector",
    "push_execution_allowed=false",
    "docker_deploy_allowed=false",
    "nas_writes_allowed=false",
    "worker_start_allowed=false",
    "secret_sanitization=sanitized-only",
    "forbidden_full_env=true",
    "forbidden_full_docker_inspect=true",
    "forbidden_secrets=true"
  ].join("\n"));
  await writeText(path.join(returnedDir, "README.md"), "# Admin Docker NAS Release Inputs\n");

  const prestagingPath = await writeJson(path.join(tempRoot, "admin-docker-prestaging-handoff.json"), prestagingHandoff());
  const candidateRefPath = await writeJson(path.join(tempRoot, "admin-docker-candidate-ref-proof.json"), candidateRefProof());
  const legacyPath = await writeJson(path.join(tempRoot, "admin-docker-legacy-rollback-plan.json"), legacyRollbackPlan());
  const legacyReviewPath = await writeJson(path.join(tempRoot, "admin-docker-legacy-rollback-exception-review.json"), legacyExceptionReview());
  const localSmokePath = await writeJson(path.join(tempRoot, "admin-docker-local-smoke.json"), localSmoke());
  const parityPath = await writeJson(path.join(tempRoot, "admin-docker-version-parity-plan.json"), parityPlan());
  const candidateContractPath = await writeJson(path.join(tempRoot, "admin-docker-candidate-contract-proof.json"), candidateContract());
  const cutterPath = await writeJson(path.join(tempRoot, "admin-cutter-compatibility-proof.json"), cutterCompatibility());

  const blocked = await runAdminDockerNasReleaseInputsIntake({
    returned_dir: returnedDir,
    prestaging_handoff_report_path: prestagingPath,
    candidate_ref_proof_report_path: candidateRefPath,
    legacy_rollback_plan_report_path: legacyPath,
    local_docker_smoke_report_path: localSmokePath,
    parity_plan_report_path: parityPath,
    candidate_contract_proof_report_path: candidateContractPath,
    cutter_compatibility_proof_report_path: cutterPath,
    output_dir: tempRoot,
    artifact_dir: tempRoot,
    generated_at: "2026-06-28T00:01:00.000Z",
    command: "test"
  });

  assert.equal(blocked.intake_complete, false);
  assert.equal(blocked.release_inputs_ready, false);
  assert.equal(blocked.observations.legacy_rollback_exception_ready, true);
  assert.equal(blocked.observations.legacy_rollback_exception_accepted, false);
  assert.ok(blocked.observations.release_input_blockers.includes("legacy-rollback-exception-approved"));
  assert.ok(blocked.summary.release_input_blockers.includes("nas-image-proof-accepted"));
  assert.ok(blocked.next_actions.includes("Returned NAS evidence has already passed intake precheck; do not recollect it just to clear unrelated proof blockers."));
  assert.equal(blocked.next_actions.some((item) => item.includes("If returned evidence is missing")), false);

  const approved = await runAdminDockerNasReleaseInputsIntake({
    returned_dir: returnedDir,
    prestaging_handoff_report_path: prestagingPath,
    candidate_ref_proof_report_path: candidateRefPath,
    legacy_rollback_plan_report_path: legacyPath,
    legacy_rollback_exception_review_report_path: legacyReviewPath,
    local_docker_smoke_report_path: localSmokePath,
    parity_plan_report_path: parityPath,
    candidate_contract_proof_report_path: candidateContractPath,
    cutter_compatibility_proof_report_path: cutterPath,
    output_dir: tempRoot,
    artifact_dir: tempRoot,
    generated_at: "2026-06-28T00:02:00.000Z",
    command: "test"
  });

  assert.equal(approved.intake_complete, true);
  assert.equal(approved.release_inputs_ready, true);
  assert.equal(approved.push_execution_allowed, false);
  assert.equal(approved.docker_deploy_allowed, false);
  assert.equal(approved.observations.current_image_tag, "latest");
  assert.equal(approved.observations.rollback_image_tag, "latest");
  assert.equal(approved.observations.legacy_rollback_exception_review_accepted, true);
  assert.equal(approved.observations.legacy_rollback_exception_accepted, true);
  assert.equal(approved.summary.release_input_blockers.includes("nas-image-proof-accepted"), false);
});
