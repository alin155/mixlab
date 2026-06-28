import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildAdminDockerGithubArtifactReadinessReport,
  runGithubArtifactReadiness,
  toMarkdown
} from "./admin-docker-github-artifact-readiness.ts";

type ArtifactMap = Parameters<typeof buildAdminDockerGithubArtifactReadinessReport>[0]["artifacts"];

function localSmokeReport(imageTag = "abc123", passed = true): unknown {
  return {
    mode: "admin-docker-local-smoke",
    local_smoke_passed: passed,
    build_identity: {
      image_tag: passed ? imageTag : "local-admin-docker-mvp-v0.1",
      build_sha: passed ? imageTag : "local-docker-smoke",
      build_version: imageTag,
      mvp_mode: "v0.1"
    },
    result: {
      status: passed ? "accepted" : "blocked"
    },
    summary: {
      local_smoke_blockers: passed ? [] : ["explicit-run-requested"]
    }
  };
}

function candidateProofReport(imageTag = "abc123", ready = true): unknown {
  return {
    mode: "admin-docker-candidate-contract-proof",
    candidate_contract_ready: ready,
    source: {
      kind: "local-smoke-report",
      local_smoke_passed: ready
    },
    observed: {
      image_tag: ready ? imageTag : "",
      build_sha: ready ? imageTag : ""
    },
    result: {
      status: ready ? "ready-for-candidate-review" : "blocked"
    },
    summary: {
      candidate_review_blockers: ready ? [] : ["candidate-current-admin-api-contract"]
    }
  };
}

function stagingRunbookReport(input: {
  target?: string;
  current?: string;
  rollback?: string;
  pushApproved?: boolean;
  ready?: boolean;
  deployAllowed?: boolean;
} = {}): unknown {
  const target = input.target ?? "abc123";
  const current = input.current ?? "";
  const rollback = input.rollback ?? "";
  const ready = input.ready ?? false;
  const pushApproved = input.pushApproved ?? false;

  return {
    mode: "admin-docker-staging-runbook",
    image_tags: {
      current,
      target,
      rollback
    },
    image_push_approval: {
      value: pushApproved ? "workflow_dispatch:push_images=true" : "",
      accepted: pushApproved
    },
    staging_review_ready: ready,
    docker_deploy_allowed: input.deployAllowed ?? false,
    observations: {
      target_tag_matches_local_smoke: target === "abc123"
    },
    result: {
      status: ready ? "ready-for-staging-review" : "blocked"
    },
    summary: {
      staging_blockers: ready
        ? []
        : [
          "current-image-tag-provided",
          "rollback-image-tag-provided",
          "image-push-explicitly-approved",
          "staging-runbook-ready"
        ]
    }
  };
}

function releaseReadinessSummaryReport(uploadAllowed = false, ready = false): unknown {
  return {
    mode: "admin-docker-release-readiness-summary",
    release_review_ready: ready,
    docker_upload_allowed: uploadAllowed,
    result: {
      status: ready ? "ready-for-release-decision" : "blocked"
    },
    summary: {
      release_review_blockers: ready ? [] : ["live-readonly-blockers-clear"]
    }
  };
}

function releaseInputsIntakeReport(input: {
  complete?: boolean;
  ready?: boolean;
  precheckPassed?: boolean;
  pushAllowed?: boolean;
  deployAllowed?: boolean;
} = {}): unknown {
  const complete = input.complete ?? false;
  const ready = input.ready ?? false;

  return {
    mode: "admin-docker-nas-release-inputs-intake",
    intake_complete: complete,
    release_inputs_ready: ready,
    push_execution_allowed: input.pushAllowed ?? false,
    docker_deploy_allowed: input.deployAllowed ?? false,
    observations: {
      returned_precheck_passed: input.precheckPassed ?? (complete ? true : false)
    },
    result: {
      status: complete ? "intake-complete" : "blocked"
    },
    summary: {
      intake_blockers: complete ? [] : [
        "returned-dir-provided",
        "returned-files-complete",
        "nas-image-proof-accepted"
      ],
      release_input_blockers: ready ? [] : [
        "returned-dir-provided",
        "returned-files-complete",
        "release-inputs-ready"
      ]
    }
  };
}

function passthroughReport(mode: string): unknown {
  return {
    mode,
    result: {
      status: "blocked"
    },
    summary: {
      upload_blockers: []
    }
  };
}

function artifactMap(overrides: Partial<ArtifactMap> = {}): ArtifactMap {
  return {
    local_docker_smoke_report: {
      path: "admin-docker-local-smoke-1.json",
      report: localSmokeReport()
    },
    candidate_contract_proof_report: {
      path: "admin-docker-candidate-contract-proof-1.json",
      report: candidateProofReport()
    },
    live_readonly_report: {
      path: "admin-docker-release-live-readonly-1.json",
      report: passthroughReport("admin-docker-release-live-readonly")
    },
    version_parity_plan_report: {
      path: "admin-docker-version-parity-plan-1.json",
      report: passthroughReport("admin-docker-version-parity-plan")
    },
    worker_env_proof_report: {
      path: "admin-worker-env-proof-1.json",
      report: passthroughReport("admin-worker-env-proof")
    },
    cutter_compatibility_proof_report: {
      path: "admin-cutter-compatibility-proof-1.json",
      report: passthroughReport("admin-cutter-compatibility-proof")
    },
    nas_release_inputs_intake_report: {
      path: "admin-docker-nas-release-inputs-intake-1.json",
      report: releaseInputsIntakeReport()
    },
    staging_runbook_report: {
      path: "admin-docker-staging-runbook-1.json",
      report: stagingRunbookReport()
    },
    release_readiness_summary_report: {
      path: "admin-docker-release-readiness-summary-1.json",
      report: releaseReadinessSummaryReport()
    },
    ...overrides
  };
}

function buildReport(overrides: Partial<ArtifactMap> = {}) {
  return buildAdminDockerGithubArtifactReadinessReport({
    generated_at: "2026-06-27T00:00:00.000Z",
    command: "test",
    artifact_dir: "artifact-dir",
    artifacts: artifactMap(overrides)
  });
}

test("GitHub artifact readiness can accept a smoked candidate while staging remains blocked", () => {
  const report = buildReport();

  assert.equal(report.github_candidate_artifact_ready, true);
  assert.equal(report.staging_handoff_ready, false);
  assert.equal(report.docker_deploy_allowed, false);
  assert.equal(report.result.status, "candidate-ready");
  assert.deepEqual(report.summary.candidate_artifact_blockers, []);
  assert.ok(report.summary.staging_handoff_blockers.includes("nas-release-inputs-intake-complete"));
  assert.ok(report.summary.staging_handoff_blockers.includes("release-inputs-ready"));
  assert.ok(report.summary.staging_handoff_blockers.includes("image-push-explicitly-approved"));
  assert.ok(report.summary.staging_handoff_blockers.includes("current-and-rollback-tags-provided"));
  assert.ok(report.summary.staging_handoff_blockers.includes("staging-runbook-ready"));
  assert.ok(report.next_actions.some((item) => item.includes("NAS release-inputs collector")));
});

test("GitHub artifact readiness can accept staging handoff without approving deploy", () => {
  const report = buildReport({
    nas_release_inputs_intake_report: {
      path: "admin-docker-nas-release-inputs-intake-ready.json",
      report: releaseInputsIntakeReport({
        complete: true,
        ready: true
      })
    },
    staging_runbook_report: {
      path: "admin-docker-staging-runbook-2.json",
      report: stagingRunbookReport({
        current: "old-tag",
        target: "abc123",
        rollback: "old-tag",
        pushApproved: true,
        ready: true
      })
    },
    release_readiness_summary_report: {
      path: "admin-docker-release-readiness-summary-2.json",
      report: releaseReadinessSummaryReport(false, true)
    }
  });

  assert.equal(report.github_candidate_artifact_ready, true);
  assert.equal(report.staging_handoff_ready, true);
  assert.equal(report.docker_deploy_allowed, false);
  assert.equal(report.result.status, "staging-handoff-ready");
  assert.deepEqual(report.summary.staging_handoff_blockers, []);
  assert.ok(report.summary.docker_deploy_blockers.includes("github-artifact-readiness-no-side-effects") === false);
});

test("GitHub artifact readiness blocks candidate evidence when local smoke did not pass", () => {
  const report = buildReport({
    local_docker_smoke_report: {
      path: "admin-docker-local-smoke-blocked.json",
      report: localSmokeReport("abc123", false)
    },
    candidate_contract_proof_report: {
      path: "admin-docker-candidate-contract-proof-blocked.json",
      report: candidateProofReport("abc123", false)
    }
  });

  assert.equal(report.github_candidate_artifact_ready, false);
  assert.equal(report.staging_handoff_ready, false);
  assert.equal(report.result.status, "blocked");
  assert.ok(report.summary.candidate_artifact_blockers.includes("local-docker-smoke-passed"));
  assert.ok(report.summary.candidate_artifact_blockers.includes("local-smoke-build-identity-current"));
  assert.ok(report.summary.candidate_artifact_blockers.includes("candidate-derived-from-local-smoke"));
});

test("GitHub artifact readiness fails safety if archived reports approve deploy", () => {
  const report = buildReport({
    staging_runbook_report: {
      path: "admin-docker-staging-runbook-unsafe.json",
      report: stagingRunbookReport({
        current: "old-tag",
        target: "abc123",
        rollback: "old-tag",
        pushApproved: true,
        ready: true,
        deployAllowed: true
      })
    },
    release_readiness_summary_report: {
      path: "admin-docker-release-readiness-summary-unsafe.json",
      report: releaseReadinessSummaryReport(true, true)
    }
  });

  assert.equal(report.github_candidate_artifact_ready, false);
  assert.equal(report.staging_handoff_ready, false);
  assert.equal(report.result.status, "failed");
  assert.ok(report.summary.failed > 0);
  assert.ok(report.summary.candidate_artifact_blockers.includes("release-boundary-does-not-approve-deploy"));
});

test("GitHub artifact readiness fails safety if intake tries to approve push", () => {
  const report = buildReport({
    nas_release_inputs_intake_report: {
      path: "admin-docker-nas-release-inputs-intake-unsafe.json",
      report: releaseInputsIntakeReport({
        complete: true,
        ready: true,
        pushAllowed: true
      })
    }
  });

  assert.equal(report.github_candidate_artifact_ready, false);
  assert.equal(report.staging_handoff_ready, false);
  assert.equal(report.result.status, "failed");
  assert.ok(report.summary.candidate_artifact_blockers.includes("release-boundary-does-not-approve-deploy"));
});

test("GitHub artifact readiness blocks old intake artifacts without returned precheck proof", () => {
  const oldIntake = releaseInputsIntakeReport({
    complete: true,
    ready: true
  }) as Record<string, unknown>;
  oldIntake.observations = {};
  const report = buildReport({
    nas_release_inputs_intake_report: {
      path: "admin-docker-nas-release-inputs-intake-old.json",
      report: oldIntake
    },
    staging_runbook_report: {
      path: "admin-docker-staging-runbook-2.json",
      report: stagingRunbookReport({
        current: "old-tag",
        target: "abc123",
        rollback: "old-tag",
        pushApproved: true,
        ready: true
      })
    },
    release_readiness_summary_report: {
      path: "admin-docker-release-readiness-summary-2.json",
      report: releaseReadinessSummaryReport(false, true)
    }
  });

  assert.equal(report.github_candidate_artifact_ready, true);
  assert.equal(report.staging_handoff_ready, false);
  assert.ok(report.summary.staging_handoff_blockers.includes("returned-evidence-precheck-passed"));
  assert.match(toMarkdown(report), /returned_precheck_passed=null/);
});

test("GitHub artifact readiness treats missing reports as blocked instead of failed", () => {
  const report = buildReport({
    nas_release_inputs_intake_report: {
      path: "",
      report: null
    },
    staging_runbook_report: {
      path: "",
      report: null
    },
    release_readiness_summary_report: {
      path: "",
      report: null
    }
  });

  assert.equal(report.result.status, "blocked");
  assert.equal(report.summary.failed, 0);
  assert.ok(report.summary.candidate_artifact_blockers.includes("artifact-admin-docker-nas-release-inputs-intake-present"));
  assert.ok(report.summary.candidate_artifact_blockers.includes("artifact-admin-docker-staging-runbook-present"));
  assert.ok(report.summary.candidate_artifact_blockers.includes("artifact-admin-docker-release-readiness-summary-present"));
  assert.ok(report.summary.candidate_artifact_blockers.includes("release-boundary-does-not-approve-deploy"));
});

test("GitHub artifact readiness markdown explains artifact and deploy boundaries", () => {
  const markdown = toMarkdown(buildReport());

  assert.match(markdown, /GitHub candidate artifact ready: yes/);
  assert.match(markdown, /Staging handoff ready: no/);
  assert.match(markdown, /Docker deploy allowed: no/);
  assert.match(markdown, /Admin Docker local smoke/);
});

test("GitHub artifact readiness CLI writes JSON and Markdown from an artifact directory", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "admin-docker-github-artifact-readiness-"));

  try {
    const artifactDir = path.join(tempDir, "artifact");
    const outputDir = path.join(tempDir, "output");
    await writeFileSet(artifactDir, {
      "admin-docker-local-smoke-20260627T000000Z.json": localSmokeReport(),
      "admin-docker-candidate-contract-proof-20260627T000000Z.json": candidateProofReport(),
      "admin-docker-release-live-readonly-20260627T000000Z.json": passthroughReport("admin-docker-release-live-readonly"),
      "admin-docker-version-parity-plan-20260627T000000Z.json": passthroughReport("admin-docker-version-parity-plan"),
      "admin-worker-env-proof-20260627T000000Z.json": passthroughReport("admin-worker-env-proof"),
      "admin-cutter-compatibility-proof-20260627T000000Z.json": passthroughReport("admin-cutter-compatibility-proof"),
      "admin-docker-nas-release-inputs-intake-20260627T000000Z.json": releaseInputsIntakeReport(),
      "admin-docker-staging-runbook-20260627T000000Z.json": stagingRunbookReport(),
      "admin-docker-release-readiness-summary-20260627T000000Z.json": releaseReadinessSummaryReport()
    });

    const report = await runGithubArtifactReadiness({
      artifact_dir: artifactDir,
      output_dir: outputDir,
      generated_at: "2026-06-27T00:00:00.000Z",
      command: "test"
    });
    const jsonPath = report.artifacts?.json_path;
    const markdownPath = report.artifacts?.markdown_path;

    assert.ok(jsonPath);
    assert.ok(markdownPath);
    assert.equal(JSON.parse(await readFile(jsonPath, "utf8")).github_candidate_artifact_ready, true);
    assert.match(await readFile(markdownPath, "utf8"), /Candidate artifact blockers: none/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

async function writeFileSet(dir: string, files: Record<string, unknown>): Promise<void> {
  await mkdir(dir, { recursive: true });
  await Promise.all(Object.entries(files).map(([name, value]) => {
    return writeFile(path.join(dir, name), `${JSON.stringify(value, null, 2)}\n`);
  }));
}
