import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminDockerCandidateScopeReport,
  toMarkdown
} from "./admin-docker-candidate-scope.ts";

function report(porcelain: string) {
  return buildAdminDockerCandidateScopeReport({
    generated_at: "2026-06-27T00:00:00.000Z",
    command: "test",
    current_branch: "codex/admin-docker-mvp",
    current_head_sha: "abc123",
    porcelain,
    max_paths_per_bucket: 3
  });
}

function bucketCount(built: ReturnType<typeof report>, bucket: string): number {
  return built.buckets.find((item) => item.bucket === bucket)?.count ?? 0;
}

test("Admin Docker candidate scope accepts MVP code and docs with selective commit", () => {
  const built = report([
    " M .github/workflows/docker-admin.yml",
    " M .gitignore",
    " M apps/admin-web/src/app/AdminApp.tsx",
    " M packages/admin-api/src/admin-command-guard.ts",
    "?? scripts/acceptance/admin-docker-github-run-artifact.ts",
    "?? docs/architecture/admin-docker-mvp-v0.1-plan.md",
    "?? docs/acceptance/artifacts/admin-docker-mvp-v0.1-phase4.15-github-run-artifact-collection-20260627.md"
  ].join("\n"));

  assert.equal(bucketCount(built, "mvp_candidate_code"), 5);
  assert.equal(bucketCount(built, "planning_docs"), 1);
  assert.equal(bucketCount(built, "acceptance_evidence"), 1);
  assert.equal(built.decisions.candidate_scope_review_ready, true);
  assert.equal(built.decisions.candidate_selective_commit_ready, true);
  assert.equal(built.decisions.remote_workflow_proof_possible_from_current_worktree, false);
  assert.ok(built.blockers.includes("current-worktree-dirty"));
});

test("Admin Docker candidate scope excludes local generated artifacts", () => {
  const built = report([
    "?? .local-dev/admin-docker-local-smoke/report.json",
    "?? captures/admin.png",
    "?? output/scratch.json",
    "?? apps/cutter-web/public/local-clips/demo.mp4",
    "?? apps/cutter-desktop/src-tauri/gen/schemas/schema.json",
    " M package.json"
  ].join("\n"));

  assert.equal(bucketCount(built, "local_generated_artifact"), 5);
  assert.equal(bucketCount(built, "mvp_candidate_code"), 1);
  assert.equal(built.decisions.candidate_scope_review_ready, true);
  assert.equal(built.decisions.candidate_selective_commit_ready, true);
  assert.ok(built.blockers.includes("local-generated-artifacts-must-be-excluded-or-cleaned"));
});

test("Admin Docker candidate scope requires review for Cutter-impact paths", () => {
  const built = report([
    " M packages/cutter-api/src/index.ts",
    " M packages/cutter-api/src/index.test.ts",
    " M package.json"
  ].join("\n"));

  assert.equal(bucketCount(built, "cutter_impact_review"), 1);
  assert.equal(bucketCount(built, "acceptance_evidence"), 1);
  assert.equal(built.decisions.candidate_scope_review_ready, false);
  assert.equal(built.decisions.candidate_selective_commit_ready, false);
  assert.ok(built.blockers.includes("cutter-impact-paths-require-review"));
});

test("Admin Docker candidate scope treats scripts/dev as local candidate tooling", () => {
  const built = report([
    "?? scripts/dev/start-local-real-public-library.sh"
  ].join("\n"));

  assert.equal(bucketCount(built, "mvp_candidate_code"), 1);
  assert.equal(built.decisions.candidate_scope_review_ready, true);
});

test("Admin Docker candidate scope blocks unknown paths", () => {
  const built = report([
    "?? random/manual-note.txt",
    " M package.json"
  ].join("\n"));

  assert.equal(bucketCount(built, "unknown_review"), 1);
  assert.equal(built.decisions.candidate_scope_review_ready, false);
  assert.ok(built.blockers.includes("unknown-paths-require-review"));
});

test("Admin Docker candidate scope reports clean scoped worktree as remote-proof possible", () => {
  const built = report("");

  assert.equal(built.total_changed_paths, 0);
  assert.equal(built.decisions.current_worktree_clean, true);
  assert.equal(built.decisions.candidate_scope_review_ready, true);
  assert.equal(built.decisions.remote_workflow_proof_possible_from_current_worktree, true);
  assert.deepEqual(built.blockers, []);
});

test("Admin Docker candidate scope markdown summarizes buckets and blockers", () => {
  const markdown = toMarkdown(report([
    " M package.json",
    "?? .local-dev/file.json",
    "?? random/manual-note.txt"
  ].join("\n")));

  assert.match(markdown, /Total changed paths: 3/);
  assert.match(markdown, /mvp_candidate_code/);
  assert.match(markdown, /local_generated_artifact/);
  assert.match(markdown, /unknown-paths-require-review/);
});
