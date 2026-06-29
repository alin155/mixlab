import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  type AdminPreprocessSingleVideoSmokeReport
} from "./admin-preprocess-single-video-smoke.ts";
import {
  runAdminPreprocessSmallBatchSmoke
} from "./admin-preprocess-small-batch-smoke.ts";

function singleReport(input: {
  source_video_id: string;
  status?: "dry-run-ready" | "passed" | "blocked" | "failed";
  dry_run_ready?: boolean;
  passed?: boolean;
  dry_run_blockers?: string[];
  execute_blockers?: string[];
}): AdminPreprocessSingleVideoSmokeReport {
  const status = input.status ?? "dry-run-ready";
  return {
    target: {
      source_video_id: input.source_video_id
    },
    result: {
      status
    },
    dry_run_ready: input.dry_run_ready ?? (status === "dry-run-ready" || status === "passed"),
    single_video_smoke_passed: input.passed ?? status === "passed",
    observed: {
      ready_video_count_after: 10471,
      processing_video_count_after: 0,
      current_index_version_after: "v010471",
      source_status_after: status === "passed" ? "index-required" : "queued",
      source_visible_after: false
    },
    post_file_check: {
      source_video_manifest: {
        fields: {
          preprocess_status: status === "passed" ? "index-required" : "queued"
        }
      },
      preprocess_job: {
        fields: {
          status: status === "passed" ? "index-required" : "queued"
        }
      },
      library_manifest: {
        fields: {
          ready_video_count: 10471,
          queued_video_count: status === "passed" ? 899 : 900,
          processing_video_count: 0,
          index_required_video_count: status === "passed" ? 24 : 23
        }
      },
      attempt_count: status === "passed" ? 2 : 0,
      refresh_attempted: status === "passed"
    },
    summary: {
      dry_run_blockers: input.dry_run_blockers ?? [],
      execute_blockers: input.execute_blockers ?? []
    },
    artifacts: {
      json_path: `single-${input.source_video_id}.json`,
      markdown_path: `single-${input.source_video_id}.md`
    }
  } as unknown as AdminPreprocessSingleVideoSmokeReport;
}

test("small-batch smoke dry-run requires explicit ids and aggregates single reports", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-small-batch-"));
  const calls: string[] = [];

  try {
    const report = await runAdminPreprocessSmallBatchSmoke({
      base_url: "http://192.168.1.27:18080",
      source_video_ids: ["V000167", "V000421"],
      session_token: "fixture-session",
      allow_smb_stale_post_file_view: true,
      output_dir: tempDir,
      date: new Date("2026-06-29T00:00:00.000Z"),
      run_single_video_smoke: async (input) => {
        calls.push(input.source_video_id ?? "");
        assert.equal(input.allow_smb_stale_post_file_view, true);
        return singleReport({
          source_video_id: input.source_video_id ?? ""
        });
      }
    });

    assert.equal(report.status, "dry-run-ready");
    assert.equal(report.mutates_nas_files, false);
    assert.deepEqual(calls, ["V000167", "V000421"]);
    assert.equal(report.summary.requested_count, 2);
    assert.equal(report.summary.passed_count, 2);
    assert.equal(report.allowed_write_boundary.allowed_post_paths.length, 0);
    assert.ok(report.artifacts?.json_path);
    const saved = JSON.parse(await readFile(report.artifacts?.json_path ?? "", "utf8"));
    assert.equal(saved.status, "dry-run-ready");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("small-batch smoke execute stops on the first failed item by default", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-small-batch-"));
  const calls: string[] = [];

  try {
    const report = await runAdminPreprocessSmallBatchSmoke({
      source_video_ids: ["V000167", "V000421", "V000428"],
      execute: true,
      output_dir: tempDir,
      date: new Date("2026-06-29T00:00:00.000Z"),
      run_single_video_smoke: async (input) => {
        calls.push(input.source_video_id ?? "");
        return input.source_video_id === "V000421"
          ? singleReport({
              source_video_id: input.source_video_id,
              status: "failed",
              dry_run_ready: true,
              passed: false,
              execute_blockers: ["post-smoke-nas-file-persistence"]
            })
          : singleReport({
              source_video_id: input.source_video_id ?? "",
              status: "passed",
              dry_run_ready: true,
              passed: true
            });
      }
    });

    assert.equal(report.status, "failed");
    assert.deepEqual(calls, ["V000167", "V000421"]);
    assert.equal(report.summary.attempted_count, 2);
    assert.equal(report.summary.stopped_on_failure, true);
    assert.deepEqual(report.summary.blockers, ["V000421:post-smoke-nas-file-persistence"]);
    assert.deepEqual(report.allowed_write_boundary.allowed_post_paths, ["/api/admin/preprocess/supervisor/start"]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("small-batch smoke refuses to run more than the configured max count", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-small-batch-"));
  let calls = 0;

  try {
    const report = await runAdminPreprocessSmallBatchSmoke({
      source_video_ids: ["V1", "V2", "V3"],
      max_count: 2,
      output_dir: tempDir,
      date: new Date("2026-06-29T00:00:00.000Z"),
      run_single_video_smoke: async () => {
        calls += 1;
        return singleReport({ source_video_id: "never" });
      }
    });

    assert.equal(report.status, "failed");
    assert.equal(calls, 0);
    assert.equal(report.summary.attempted_count, 0);
    assert.deepEqual(report.summary.blockers, ["source-video-id-count-exceeds-max"]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
