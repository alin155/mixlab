import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildAdminDockerPrestagingHandoffReport,
  runAdminDockerPrestagingHandoff,
  toMarkdown
} from "./admin-docker-prestaging-handoff.ts";

function runArtifactReport(overrides: Record<string, unknown> = {}): unknown {
  return {
    mode: "admin-docker-github-run-artifact",
    current_worktree_candidate_ready: true,
    github_run_staging_handoff_ready: false,
    docker_deploy_allowed: false,
    run: {
      databaseId: 12345,
      url: "https://github.com/alin155/mixlab/actions/runs/12345",
      headSha: "abc123",
      headBranch: "codex/admin-docker-mvp"
    },
    ...overrides
  };
}

function liveReadonlyReport(overrides: Record<string, unknown> = {}): unknown {
  return {
    mode: "live-readonly-get",
    docker_upload_allowed: false,
    target: {
      normalized_base_url: "http://192.168.1.27:18080"
    },
    observed: {
      library_root: "/data/PublicLibrary",
      current_index_version: "v010471",
      video_count: 11394,
      ready_video_count: 10471
    },
    requests: [
      {},
      {},
      {
        data: {
          ready_video_count: 10471
        }
      },
      {},
      {
        data: {
          runtime_load: {
            disk: {
              usage_percent: 98,
              status: "blocked"
            }
          }
        }
      }
    ],
    summary: {
      upload_blockers: [
        "current-admin-api-contract-live",
        "data-loading-contract-live",
        "admin-worker-live-flags",
        "cutter-release-compatibility-live"
      ]
    },
    ...overrides
  };
}

function report(input: {
  run?: unknown;
  live?: unknown;
} = {}) {
  return buildAdminDockerPrestagingHandoffReport({
    generated_at: "2026-06-27T00:00:00.000Z",
    command: "test",
    github_run_artifact_report_path: "run.json",
    github_run_artifact_report: input.run ?? runArtifactReport(),
    live_readonly_report_path: "live.json",
    live_readonly_report: input.live ?? liveReadonlyReport()
  });
}

test("pre-staging handoff can request release inputs while keeping staging and deploy blocked", () => {
  const built = report();

  assert.equal(built.ready_to_request_release_inputs, true);
  assert.equal(built.staging_execution_ready, false);
  assert.equal(built.docker_deploy_allowed, false);
  assert.equal(built.result.status, "ready-for-release-inputs");
  assert.deepEqual(built.summary.release_input_blockers, []);
  assert.ok(built.summary.staging_execution_blockers.includes("explicit-push-approval-required"));
  assert.ok(built.summary.staging_execution_blockers.includes("admin-worker-env-proof-required"));
  assert.equal(built.candidate.head_sha, "abc123");
  assert.equal(built.live_baseline.ready_video_count, 10471);
  assert.equal(built.live_baseline.current_index_version, "v010471");
  assert.equal(built.live_baseline.current_api_contract_blocked, true);
  assert.equal(built.release_input_request.target_image_tag, "abc123");
  assert.match(built.release_input_request.workflow_dispatch_command, /--ref codex\/admin-docker-mvp/);
  assert.match(built.release_input_request.workflow_dispatch_command, /push_images=true/);
  assert.match(built.release_input_request.nas_image_proof_command, /validate:admin-docker-nas-image-proof/);
  assert.ok(built.release_input_request.required_operator_inputs.some((input) => input.id === "current_image_tag" && input.status === "required"));
  assert.ok(built.release_input_request.required_operator_inputs.some((input) => input.id === "rollback_image_tag" && input.status === "required"));
  assert.equal(built.release_input_request.initial_staging_defaults.library_preprocess_worker, "0");
  assert.equal(built.release_input_request.initial_staging_defaults.ready_publish_worker, "0");
  assert.ok(built.release_input_request.forbidden_before_staged_proof.some((item) => item.includes("18080")));
});

test("pre-staging handoff blocks release inputs without a current-worktree candidate", () => {
  const built = report({
    run: runArtifactReport({
      current_worktree_candidate_ready: false
    })
  });

  assert.equal(built.ready_to_request_release_inputs, false);
  assert.equal(built.result.status, "blocked");
  assert.ok(built.summary.release_input_blockers.includes("current-worktree-candidate-ready"));
});

test("pre-staging handoff fails if an input report tries to approve deploy", () => {
  const built = report({
    run: runArtifactReport({
      docker_deploy_allowed: true
    })
  });

  assert.equal(built.ready_to_request_release_inputs, false);
  assert.equal(built.result.status, "failed");
  assert.ok(built.summary.failed > 0);
  assert.ok(built.summary.release_input_blockers.includes("handoff-does-not-approve-deploy"));
});

test("pre-staging handoff markdown records candidate and release-input boundaries", () => {
  const markdown = toMarkdown(report());

  assert.match(markdown, /Ready to request release inputs: yes/);
  assert.match(markdown, /Staging execution ready: no/);
  assert.match(markdown, /Docker deploy allowed: no/);
  assert.match(markdown, /Ready video count: 10471/);
  assert.match(markdown, /Current index: v010471/);
  assert.match(markdown, /Release Input Request/);
  assert.match(markdown, /gh workflow run docker-admin\.yml/);
  assert.match(markdown, /validate:admin-docker-nas-image-proof/);
  assert.match(markdown, /current_image_tag/);
  assert.match(markdown, /rollback_image_tag/);
  assert.match(markdown, /Initial ready publish worker: 0/);
  assert.match(markdown, /Forbidden Before Staged Proof/);
});

test("pre-staging handoff CLI writes JSON and Markdown", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-prestaging-handoff-"));
  const runPath = path.join(tempRoot, "run.json");
  const livePath = path.join(tempRoot, "live.json");

  await import("node:fs/promises").then(async ({ writeFile }) => {
    await writeFile(runPath, `${JSON.stringify(runArtifactReport(), null, 2)}\n`);
    await writeFile(livePath, `${JSON.stringify(liveReadonlyReport(), null, 2)}\n`);
  });

  const built = await runAdminDockerPrestagingHandoff({
    github_run_artifact_report_path: runPath,
    live_readonly_report_path: livePath,
    output_dir: tempRoot,
    generated_at: "2026-06-27T00:00:00.000Z",
    command: "test"
  });

  assert.equal(built.artifacts?.json_path, path.join(tempRoot, "admin-docker-prestaging-handoff-20260627T000000Z.json"));
  assert.equal(built.ready_to_request_release_inputs, true);
  assert.match(await readFile(built.artifacts?.markdown_path ?? "", "utf8"), /Pre-Staging Handoff/);
});
