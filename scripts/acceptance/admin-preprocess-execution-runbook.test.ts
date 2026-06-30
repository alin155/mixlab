import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  runAdminPreprocessExecutionRunbook
} from "./admin-preprocess-execution-runbook.ts";

const BASE_URL = "http://192.168.1.27:18080";
const IDS = ["V002428", "V007422"];

function readinessReport(input: {
  status?: string;
  phase_ready?: boolean;
  review_ready?: boolean;
  ready_count?: number;
  processing_count?: number;
  index_version?: string;
  safe_to_start?: boolean;
  supervisor_state?: string;
  windows_status?: string;
  cutter_ready_count?: number;
  cutter_release_version?: string;
} = {}) {
  const readyCount = input.ready_count ?? 10475;
  const indexVersion = input.index_version ?? "v010475";
  return {
    schema_version: "1.0",
    mode: "admin-preprocess-production-readiness",
    phase_0_1_readiness_ready: input.phase_ready ?? true,
    single_video_smoke_review_ready: input.review_ready ?? true,
    target: {
      base_url: BASE_URL,
      expected_library_root: "/data/PublicLibrary"
    },
    observed: {
      ready_video_count: readyCount,
      queued_video_count: 794,
      processing_video_count: input.processing_count ?? 0,
      index_required_video_count: 114,
      current_index_version: indexVersion,
      preprocess_safe_to_start: input.safe_to_start ?? true,
      supervisor_state: input.supervisor_state ?? "idle",
      windows_acceptance_status: input.windows_status ?? "passed",
      cutter_visible_ready_count: input.cutter_ready_count ?? readyCount,
      cutter_release_version: input.cutter_release_version ?? indexVersion
    },
    result: {
      status: input.status ?? "ready-for-single-video-review"
    }
  };
}

async function writeReadiness(tempDir: string, value = readinessReport()): Promise<string> {
  const filePath = path.join(tempDir, "readiness.json");
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return filePath;
}

test("preprocess execution runbook is ready with bounded ids and current readiness", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-preprocess-runbook-"));

  try {
    const readinessPath = await writeReadiness(tempDir);
    const report = await runAdminPreprocessExecutionRunbook({
      readiness_report_path: readinessPath,
      source_video_ids: IDS,
      real_cut_query: "好，有的同学对",
      output_dir: tempDir,
      date: new Date("2026-06-30T15:00:00.000Z")
    });

    assert.equal(report.result.status, "ready-for-controlled-execution");
    assert.equal(report.runbook_ready, true);
    assert.equal(report.execution_allowed, false);
    assert.equal(report.mutates_nas_files, false);
    assert.equal(report.target.expected_ready_count_before, 10475);
    assert.equal(report.target.expected_ready_count_after_publish, 10477);
    assert.equal(report.target.expected_index_version_after_publish, "v010477");
    assert.match(report.runbook.execute_batch, /MIXLAB_ADMIN_PREPROCESS_BATCH_EXECUTE="1"/);
    assert.match(report.runbook.execute_batch, /MIXLAB_ADMIN_PREPROCESS_BATCH_SOURCE_VIDEO_IDS="V002428,V007422"/);
    assert.match(report.runbook.execute_batch, /MIXLAB_ADMIN_PREPROCESS_BATCH_SNAPSHOT_READ_MODEL="true"/);
    assert.match(report.runbook.post_publish_proof, /MIXLAB_CUTTER_REAL_CUT_REPORT/);
    assert.match(report.runbook.real_cut_smoke, /"source_video_id":"V002428"/);
    assert.equal(report.runbook.publish_selected_sources.length, IDS.length);
    assert.equal(report.summary.runbook_blockers.length, 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("preprocess execution runbook blocks without explicit source ids", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-preprocess-runbook-"));

  try {
    const readinessPath = await writeReadiness(tempDir);
    const report = await runAdminPreprocessExecutionRunbook({
      readiness_report_path: readinessPath,
      output_dir: tempDir,
      date: new Date("2026-06-30T15:00:00.000Z")
    });

    assert.equal(report.result.status, "blocked");
    assert.equal(report.runbook_ready, false);
    assert.ok(report.summary.runbook_blockers.includes("source-video-ids-explicit-and-bounded"));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("preprocess execution runbook fails when readiness baseline drifts", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-preprocess-runbook-"));

  try {
    const readinessPath = await writeReadiness(tempDir, readinessReport({
      ready_count: 10474,
      index_version: "v010474"
    }));
    const report = await runAdminPreprocessExecutionRunbook({
      readiness_report_path: readinessPath,
      source_video_ids: IDS,
      expected_ready_count: 10475,
      expected_index_version: "v010475",
      output_dir: tempDir,
      date: new Date("2026-06-30T15:00:00.000Z")
    });

    assert.equal(report.result.status, "failed");
    assert.equal(report.gates.find((item) => item.id === "pre-execution-baseline-preserved")?.status, "fail");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("preprocess execution runbook artifacts do not include real credentials", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-preprocess-runbook-"));

  try {
    const readinessPath = await writeReadiness(tempDir);
    const report = await runAdminPreprocessExecutionRunbook({
      readiness_report_path: readinessPath,
      source_video_ids: IDS,
      output_dir: tempDir,
      date: new Date("2026-06-30T15:00:00.000Z")
    });
    const json = await readFile(report.artifacts?.json_path ?? "", "utf8");
    const markdown = await readFile(report.artifacts?.markdown_path ?? "", "utf8");

    assert.doesNotMatch(json, /hqh123456|fixture-admin-session-token/);
    assert.doesNotMatch(markdown, /hqh123456|fixture-admin-session-token/);
    assert.match(json, /<temporary-admin-session-token>/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
