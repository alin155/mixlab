import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildAdminDockerCandidateRefProofReport,
  toMarkdown
} from "./admin-docker-candidate-ref-proof.ts";

const CANDIDATE_SHA = "e94a5bdd8fc981b8112cc372df6f18204bb47528";
const CANDIDATE_TAG = `admin-docker-candidate-${CANDIDATE_SHA}`;

function githubRun(overrides: Record<string, unknown> = {}): unknown {
  return {
    databaseId: 28307173676,
    headSha: CANDIDATE_SHA,
    headBranch: CANDIDATE_TAG,
    status: "completed",
    conclusion: "success",
    url: "https://github.com/alin155/mixlab/actions/runs/28307173676",
    workflowName: "Build Admin Docker Images",
    event: "workflow_dispatch",
    ...overrides
  };
}

function localSmoke(overrides: Record<string, unknown> = {}): unknown {
  return {
    mode: "admin-docker-local-smoke",
    local_smoke_passed: true,
    build_identity: {
      image_tag: CANDIDATE_SHA,
      build_sha: CANDIDATE_SHA,
      build_version: CANDIDATE_SHA,
      mvp_mode: "v0.1"
    },
    ...overrides
  };
}

function stagingRunbook(overrides: Record<string, unknown> = {}): unknown {
  return {
    mode: "admin-docker-staging-runbook",
    staging_execution_ready: false,
    docker_deploy_allowed: false,
    image_push_approval: {
      value: "",
      accepted: false
    },
    image_tags: {
      current: "",
      target: CANDIDATE_SHA,
      rollback: ""
    },
    ...overrides
  };
}

function report(input: {
  candidateSha?: string;
  candidateTag?: string;
  remoteTagOutput?: string;
  run?: unknown;
  smoke?: unknown;
  staging?: unknown;
} = {}) {
  return buildAdminDockerCandidateRefProofReport({
    generated_at: "2026-06-28T01:12:00.000Z",
    command: "test",
    candidate_sha: input.candidateSha ?? CANDIDATE_SHA,
    candidate_tag: input.candidateTag ?? CANDIDATE_TAG,
    artifact_dir: "/tmp/mixlab-gh-run",
    local_smoke_report_path: "/tmp/mixlab-gh-run/admin-docker-local-smoke.json",
    local_smoke_report: input.smoke ?? localSmoke(),
    staging_runbook_report_path: "/tmp/mixlab-gh-run/admin-docker-staging-runbook.json",
    staging_runbook_report: input.staging ?? stagingRunbook(),
    github_run_id: "28307173676",
    github_run: input.run ?? githubRun(),
    remote_tag_output: input.remoteTagOutput ?? `${CANDIDATE_SHA}\trefs/tags/${CANDIDATE_TAG}\n`
  });
}

test("candidate ref proof accepts pinned tag dry-run evidence", () => {
  const built = report();

  assert.equal(built.candidate_ref_proof_accepted, true);
  assert.equal(built.docker_deploy_allowed, false);
  assert.equal(built.result.status, "accepted");
  assert.deepEqual(built.summary.candidate_ref_blockers, []);
  assert.equal(built.candidate.expected_sha, CANDIDATE_SHA);
  assert.equal(built.candidate.expected_tag, CANDIDATE_TAG);
  assert.equal(built.candidate.remote_tag_sha, CANDIDATE_SHA);
  assert.equal(built.github_run.headBranch, CANDIDATE_TAG);
  assert.equal(built.github_run.headSha, CANDIDATE_SHA);
  assert.equal(built.observations.local_smoke_matches_candidate, true);
  assert.equal(built.observations.staging_target_matches_candidate, true);
  assert.ok(built.summary.docker_deploy_blockers.length === 0);
  assert.ok(built.next_actions.some((item) => item.includes("push_images=false dry-run")));
});

test("candidate ref proof blocks moving branch dry-run evidence", () => {
  const built = report({
    candidateTag: "codex/windows-first-run-autostart-20260615104835",
    run: githubRun({
      headBranch: "codex/windows-first-run-autostart-20260615104835"
    }),
    remoteTagOutput: `${CANDIDATE_SHA}\trefs/tags/codex/windows-first-run-autostart-20260615104835\n`
  });

  assert.equal(built.candidate_ref_proof_accepted, false);
  assert.ok(built.summary.candidate_ref_blockers.includes("candidate-tag-pins-sha-name"));
});

test("candidate ref proof blocks tag target drift", () => {
  const built = report({
    remoteTagOutput: "566b16a000000000000000000000000000000000\trefs/tags/admin-docker-candidate-e94a5bdd8fc981b8112cc372df6f18204bb47528\n"
  });

  assert.equal(built.candidate_ref_proof_accepted, false);
  assert.ok(built.summary.candidate_ref_blockers.includes("remote-tag-points-to-candidate-sha"));
});

test("candidate ref proof blocks smoke identity mismatch", () => {
  const built = report({
    smoke: localSmoke({
      build_identity: {
        image_tag: "different",
        build_sha: "different"
      }
    })
  });

  assert.equal(built.candidate_ref_proof_accepted, false);
  assert.ok(built.summary.candidate_ref_blockers.includes("local-smoke-identity-matches-candidate"));
});

test("candidate ref proof fails if dry-run evidence tries to approve deploy", () => {
  const built = report({
    staging: stagingRunbook({
      docker_deploy_allowed: true,
      image_push_approval: {
        accepted: true
      }
    })
  });

  assert.equal(built.candidate_ref_proof_accepted, false);
  assert.equal(built.result.status, "failed");
  assert.ok(built.summary.candidate_ref_blockers.includes("tag-dry-run-does-not-approve-push-or-deploy"));
  assert.ok(built.summary.docker_deploy_blockers.includes("tag-dry-run-does-not-approve-push-or-deploy"));
});

test("candidate ref proof markdown records no-deploy boundary", () => {
  const markdown = toMarkdown(report());

  assert.match(markdown, /Admin Docker Candidate Ref Proof/);
  assert.match(markdown, /Candidate ref proof accepted: yes/);
  assert.match(markdown, /Docker deploy allowed: no/);
  assert.match(markdown, new RegExp(CANDIDATE_TAG));
  assert.match(markdown, /Image push approval accepted: false/);
});

test("candidate ref proof fixture files remain parseable", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-candidate-ref-proof-"));
  const built = report();
  const jsonPath = path.join(tempRoot, "admin-docker-candidate-ref-proof.json");
  const markdownPath = path.join(tempRoot, "admin-docker-candidate-ref-proof.md");

  await writeFile(jsonPath, `${JSON.stringify(built, null, 2)}\n`);
  await writeFile(markdownPath, toMarkdown(built));

  assert.equal(JSON.parse(await readFile(jsonPath, "utf8")).candidate_ref_proof_accepted, true);
  assert.match(await readFile(markdownPath, "utf8"), /Candidate release ref/);
});
