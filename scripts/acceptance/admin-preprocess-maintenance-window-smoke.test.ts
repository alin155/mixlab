import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type {
  AdminPreprocessSmallBatchSmokeReport
} from "./admin-preprocess-small-batch-smoke.ts";
import {
  runAdminPreprocessMaintenanceWindowSmoke
} from "./admin-preprocess-maintenance-window-smoke.ts";

function libraryStatus(input: {
  ready?: number;
  queued?: number;
  processing?: number;
  indexRequired?: number;
  indexVersion?: string;
} = {}) {
  return {
    ready_video_count: input.ready ?? 10471,
    queued_video_count: input.queued ?? 894,
    processing_video_count: input.processing ?? 0,
    index_required_video_count: input.indexRequired ?? 29,
    current_index_version: input.indexVersion ?? "v010471",
    updated_at: "2026-06-29T20:00:00.000Z"
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ ok: status < 400, data }), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function batchReport(input: {
  source_video_ids: string[];
  status?: "dry-run-ready" | "passed" | "failed";
  blockers?: string[];
}): AdminPreprocessSmallBatchSmokeReport {
  const status = input.status ?? "dry-run-ready";
  return {
    status,
    summary: {
      blockers: input.blockers ?? []
    },
    artifacts: {
      json_path: `batch-${input.source_video_ids.join("-")}.json`,
      markdown_path: `batch-${input.source_video_ids.join("-")}.md`
    }
  } as unknown as AdminPreprocessSmallBatchSmokeReport;
}

test("maintenance-window smoke dry-run splits explicit ids into safe batches", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-window-"));
  const batches: string[][] = [];
  const fakeFetch: typeof fetch = async (resource) => {
    assert.equal(new URL(String(resource)).pathname, "/api/admin/library/status");
    return jsonResponse(libraryStatus());
  };

  try {
    const report = await runAdminPreprocessMaintenanceWindowSmoke({
      base_url: "http://192.168.1.27:18080",
      source_video_ids: ["V1", "V2", "V3", "V4"],
      batch_size: 2,
      max_batches: 2,
      session_token: "fixture-session",
      allow_smb_stale_post_file_view: true,
      output_dir: tempDir,
      date: new Date("2026-06-29T00:00:00.000Z"),
      fetch_impl: fakeFetch,
      run_small_batch_smoke: async (input) => {
        batches.push(input.source_video_ids ?? []);
        assert.equal(input.allow_smb_stale_post_file_view, true);
        return batchReport({
          source_video_ids: input.source_video_ids ?? []
        });
      }
    });

    assert.equal(report.status, "dry-run-ready");
    assert.equal(report.mutates_nas_files, false);
    assert.deepEqual(batches, [["V1", "V2"], ["V3", "V4"]]);
    assert.equal(report.summary.attempted_batches, 2);
    assert.equal(report.summary.passed_batches, 2);
    assert.deepEqual(report.summary.blockers, []);
    assert.equal(report.allowed_write_boundary.allowed_post_paths.length, 0);
    const saved = JSON.parse(await readFile(report.artifacts?.json_path ?? "", "utf8"));
    assert.equal(saved.status, "dry-run-ready");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("maintenance-window smoke execute stops after a failed batch", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-window-"));
  const batches: string[][] = [];
  const fakeFetch: typeof fetch = async () => jsonResponse(libraryStatus());

  try {
    const report = await runAdminPreprocessMaintenanceWindowSmoke({
      base_url: "http://192.168.1.27:18080",
      source_video_ids: ["V1", "V2", "V3", "V4"],
      batch_size: 2,
      max_batches: 2,
      execute: true,
      output_dir: tempDir,
      date: new Date("2026-06-29T00:00:00.000Z"),
      fetch_impl: fakeFetch,
      run_small_batch_smoke: async (input) => {
        batches.push(input.source_video_ids ?? []);
        return batches.length === 1
          ? batchReport({
              source_video_ids: input.source_video_ids ?? [],
              status: "passed"
            })
          : batchReport({
              source_video_ids: input.source_video_ids ?? [],
              status: "failed",
              blockers: ["V3:post-smoke-nas-file-persistence"]
            });
      }
    });

    assert.equal(report.status, "failed");
    assert.deepEqual(batches, [["V1", "V2"], ["V3", "V4"]]);
    assert.equal(report.summary.attempted_batches, 2);
    assert.equal(report.summary.failed_batches, 1);
    assert.equal(report.summary.stopped_on_failure, false);
    assert.deepEqual(report.summary.blockers, ["batch-2:V3:post-smoke-nas-file-persistence"]);
    assert.deepEqual(report.allowed_write_boundary.allowed_post_paths, ["/api/admin/preprocess/supervisor/start"]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("maintenance-window smoke blocks before running when capacity is exceeded", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-window-"));
  let calls = 0;

  try {
    const report = await runAdminPreprocessMaintenanceWindowSmoke({
      source_video_ids: ["V1", "V2", "V3"],
      batch_size: 1,
      max_batches: 2,
      output_dir: tempDir,
      date: new Date("2026-06-29T00:00:00.000Z"),
      run_small_batch_smoke: async () => {
        calls += 1;
        return batchReport({ source_video_ids: [] });
      }
    });

    assert.equal(report.status, "failed");
    assert.equal(calls, 0);
    assert.equal(report.summary.attempted_batches, 0);
    assert.deepEqual(report.summary.blockers, ["source-video-id-count-exceeds-window-capacity"]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("maintenance-window smoke blocks on ready/index/processing drift before a batch", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-window-"));
  let calls = 0;
  const fakeFetch: typeof fetch = async () => jsonResponse(libraryStatus({
    ready: 10470,
    processing: 1,
    indexVersion: "v010470"
  }));

  try {
    const report = await runAdminPreprocessMaintenanceWindowSmoke({
      base_url: "http://192.168.1.27:18080",
      source_video_ids: ["V1"],
      output_dir: tempDir,
      date: new Date("2026-06-29T00:00:00.000Z"),
      fetch_impl: fakeFetch,
      run_small_batch_smoke: async () => {
        calls += 1;
        return batchReport({ source_video_ids: ["V1"] });
      }
    });

    assert.equal(report.status, "failed");
    assert.equal(calls, 0);
    assert.equal(report.summary.attempted_batches, 1);
    assert.deepEqual(report.summary.blockers, [
      "batch-1-before-ready-count-drift",
      "batch-1-before-index-version-drift",
      "batch-1-before-processing-not-idle"
    ]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
