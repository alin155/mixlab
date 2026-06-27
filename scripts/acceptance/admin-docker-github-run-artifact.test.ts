import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminDockerGithubRunArtifactReport,
  toMarkdown
} from "./admin-docker-github-run-artifact.ts";
import type { AdminDockerGithubArtifactReadinessReport } from "./admin-docker-github-artifact-readiness.ts";

type BuilderInput = Parameters<typeof buildAdminDockerGithubRunArtifactReport>[0];

function run(overrides: Partial<BuilderInput["run"]> = {}): BuilderInput["run"] {
  return {
    databaseId: 12345,
    headSha: "abc123",
    headBranch: "codex/admin-docker-mvp",
    status: "completed",
    conclusion: "success",
    url: "https://github.com/alin155/mixlab/actions/runs/12345",
    workflowName: "Build Admin Docker Images",
    event: "workflow_dispatch",
    createdAt: "2026-06-27T00:00:00Z",
    updatedAt: "2026-06-27T00:20:00Z",
    ...overrides
  };
}

function source(overrides: Partial<BuilderInput["source_control"]> = {}): BuilderInput["source_control"] {
  return {
    current_head_sha: "abc123",
    current_branch: "codex/admin-docker-mvp",
    worktree_dirty: false,
    porcelain: [],
    ...overrides
  };
}

function readiness(overrides: Partial<AdminDockerGithubArtifactReadinessReport> = {}): AdminDockerGithubArtifactReadinessReport {
  return {
    schema_version: "1.0",
    generated_at: "2026-06-27T00:00:00.000Z",
    command: "test",
    mode: "admin-docker-github-artifact-readiness",
    artifact_dir: ".local-dev/run/12345/release-gates",
    sources: {
      local_docker_smoke_report: "local-smoke.json",
      candidate_contract_proof_report: "candidate.json",
      live_readonly_report: "live.json",
      version_parity_plan_report: "parity.json",
      worker_env_proof_report: "worker.json",
      cutter_compatibility_proof_report: "cutter.json",
      staging_runbook_report: "runbook.json",
      release_readiness_summary_report: "summary.json"
    },
    source_errors: {},
    github_candidate_artifact_ready: true,
    staging_handoff_ready: false,
    docker_deploy_allowed: false,
    observations: {
      local_smoke_status: "accepted",
      local_smoke_passed: true,
      local_smoke_image_tag: "abc123",
      local_smoke_build_sha: "abc123",
      candidate_contract_status: "ready-for-candidate-review",
      candidate_contract_ready: true,
      candidate_source_kind: "local-smoke-report",
      candidate_source_local_smoke_passed: true,
      candidate_observed_image_tag: "abc123",
      candidate_observed_build_sha: "abc123",
      target_image_tag: "abc123",
      target_tag_matches_smoke: true,
      image_push_approval_accepted: false,
      current_image_tag: "",
      rollback_image_tag: "",
      staging_review_ready: false,
      release_review_ready: false,
      release_review_blockers: ["live-readonly-blockers-clear"],
      staging_blockers: ["image-push-explicitly-approved"]
    },
    gates: [],
    summary: {
      total: 0,
      passed: 0,
      blocked: 0,
      failed: 0,
      candidate_artifact_blockers: [],
      staging_handoff_blockers: ["image-push-explicitly-approved"],
      docker_deploy_blockers: ["image-push-explicitly-approved"]
    },
    result: {
      status: "candidate-ready",
      summary: "candidate ready"
    },
    next_actions: [],
    artifacts: {
      json_path: "docs/acceptance/artifacts/admin-docker-github-artifact-readiness.json",
      markdown_path: "docs/acceptance/artifacts/admin-docker-github-artifact-readiness.md"
    },
    ...overrides
  };
}

function report(overrides: Partial<BuilderInput> = {}) {
  return buildAdminDockerGithubRunArtifactReport({
    generated_at: "2026-06-27T00:00:00.000Z",
    command: "test",
    repo: "alin155/mixlab",
    workflow: "docker-admin.yml",
    artifact_name: "mixlab-admin-docker-release-gates",
    run: run(),
    source_control: source(),
    artifact_dir: ".local-dev/admin-docker-github-runs/12345/mixlab-admin-docker-release-gates",
    readiness_report: readiness(),
    ...overrides
  });
}

test("GitHub run artifact can prove a remote candidate but not a dirty local worktree", () => {
  const built = report({
    source_control: source({
      worktree_dirty: true,
      porcelain: [" M package.json"]
    })
  });

  assert.equal(built.github_run_candidate_ready, true);
  assert.equal(built.current_worktree_candidate_ready, false);
  assert.equal(built.github_run_staging_handoff_ready, false);
  assert.equal(built.docker_deploy_allowed, false);
  assert.equal(built.result.status, "github-run-candidate-ready");
  assert.ok(built.summary.current_worktree_candidate_blockers.includes("current-worktree-clean"));
  assert.ok(built.next_actions.some((item) => item.includes("current candidate changes")));
});

test("GitHub run artifact proves the current clean worktree only when head sha matches", () => {
  const built = report();

  assert.equal(built.github_run_candidate_ready, true);
  assert.equal(built.current_worktree_candidate_ready, true);
  assert.equal(built.result.status, "current-worktree-candidate-ready");
  assert.deepEqual(built.summary.current_worktree_candidate_blockers, []);
});

test("GitHub run artifact blocks current proof when run head differs from local head", () => {
  const built = report({
    run: run({ headSha: "remote-old" }),
    source_control: source({ current_head_sha: "local-new" })
  });

  assert.equal(built.github_run_candidate_ready, true);
  assert.equal(built.current_worktree_candidate_ready, false);
  assert.ok(built.summary.current_worktree_candidate_blockers.includes("run-head-matches-current-head"));
});

test("GitHub run artifact can report staging handoff readiness without approving deploy", () => {
  const built = report({
    readiness_report: readiness({
      staging_handoff_ready: true,
      summary: {
        total: 0,
        passed: 0,
        blocked: 0,
        failed: 0,
        candidate_artifact_blockers: [],
        staging_handoff_blockers: [],
        docker_deploy_blockers: []
      },
      result: {
        status: "staging-handoff-ready",
        summary: "staging handoff ready"
      }
    })
  });

  assert.equal(built.github_run_staging_handoff_ready, true);
  assert.equal(built.current_worktree_staging_handoff_ready, true);
  assert.equal(built.docker_deploy_allowed, false);
  assert.equal(built.result.status, "current-worktree-staging-handoff-ready");
});

test("GitHub run artifact fails if the readiness report tries to approve deploy", () => {
  const built = report({
    readiness_report: readiness({
      docker_deploy_allowed: true as false
    })
  });

  assert.equal(built.github_run_candidate_ready, false);
  assert.equal(built.current_worktree_candidate_ready, false);
  assert.equal(built.result.status, "failed");
  assert.ok(built.summary.failed > 0);
  assert.ok(built.summary.github_run_candidate_blockers.includes("run-artifact-does-not-approve-deploy"));
});

test("GitHub run artifact markdown records run and current-worktree boundaries", () => {
  const markdown = toMarkdown(report({
    source_control: source({
      worktree_dirty: true,
      porcelain: [" M package.json"]
    })
  }));

  assert.match(markdown, /GitHub run candidate ready: yes/);
  assert.match(markdown, /Current worktree candidate ready: no/);
  assert.match(markdown, /Docker deploy allowed: no/);
  assert.match(markdown, /Worktree dirty: yes/);
});
