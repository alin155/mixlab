import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  listExportClips,
  writeClipList
} from "./index.ts";
import {
  getCutJob,
  listCutJobs,
  runNextCutJob,
  submitClipListToQueue
} from "./cut-queue.ts";

async function makeRoot(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function makeClipList(workspaceRoot: string) {
  return writeClipList({
    workspace_root: workspaceRoot,
    library_id: "lib_main_001",
    title: "现金流混剪",
    items: [
      {
        source_video_id: "V000001",
        source_title: "01_现金流",
        source_relative_path: "source-videos/01_现金流.mp4",
        start_segment_id: "V000001-S000001",
        end_segment_id: "V000001-S000002",
        begin_ms: 1000,
        end_ms: 5200,
        selected_text: "现金流，是企业的血液。",
        cut_mode: "smart"
      },
      {
        source_video_id: "V000002",
        source_title: "02_组织增长",
        source_relative_path: "source-videos/02_组织增长.mp4",
        start_segment_id: "V000002-S000001",
        end_segment_id: "V000002-S000001",
        begin_ms: 800,
        end_ms: 3100,
        selected_text: "组织效率决定增长。",
        cut_mode: "copy"
      }
    ],
    now: "2026-05-02T10:00:00Z"
  });
}

test("submits cut-list rows to pending jobs and runs the oldest job to an export manifest", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-queue-");
  const libraryRoot = await makeRoot("mixlab-cutter-local-library-");
  const clipList = await makeClipList(workspaceRoot);
  const submission = await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: "2026-05-02T10:01:00Z"
  });

  assert.equal(submission.submitted_count, 2);
  assert.deepEqual(
    submission.jobs.map((job) => [job.cut_job_id, job.status, job.clip_list_item_id]),
    [
      ["CJ20260502-0001", "pending", "CLI000001"],
      ["CJ20260502-0002", "pending", "CLI000002"]
    ]
  );

  const cutCalls: Array<{ output_path: string; begin_ms: number; end_ms: number }> = [];
  const result = await runNextCutJob({
    workspace_root: workspaceRoot,
    library_root: libraryRoot,
    now: () => "2026-05-02T10:02:00Z",
    resolve_source: async (job) => ({
      source_video_id: job.source_video_id,
      title: job.source_title,
      relative_path: job.source_relative_path,
      source_video_file_path: path.join(libraryRoot, job.source_relative_path)
    }),
    cut_runner: async (input) => {
      cutCalls.push({
        output_path: input.output_path,
        begin_ms: input.begin_ms,
        end_ms: input.end_ms
      });
      await writeFile(input.output_path, "clip-bytes");
    }
  });

  assert.equal(result?.status, "done");
  assert.equal(result?.export_clip_id, "E000001");
  assert.equal(result?.output_file, "export-clips/E000001/E000001_现金流，是企业的血液.mp4");
  assert.equal(cutCalls.length, 1);
  assert.equal(cutCalls[0]?.begin_ms, 1000);
  assert.equal(cutCalls[0]?.end_ms, 5200);

  const catalog = await listExportClips({ workspace_root: workspaceRoot });
  assert.equal(catalog.local_clip_count, 1);
  assert.equal(catalog.clips[0]?.source_video_id, "V000001");

  const persisted = JSON.parse(
    await readFile(path.join(workspaceRoot, "clip-jobs", "CJ20260502-0001.json"), "utf8")
  );
  assert.equal(persisted.status, "done");
});

test("marks failed jobs with error message and continues to later pending jobs", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-failed-");
  const libraryRoot = await makeRoot("mixlab-cutter-local-library-");
  const clipList = await makeClipList(workspaceRoot);
  await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: "2026-05-02T10:01:00Z"
  });

  const failed = await runNextCutJob({
    workspace_root: workspaceRoot,
    library_root: libraryRoot,
    now: () => "2026-05-02T10:02:00Z",
    resolve_source: async (job) => ({
      source_video_id: job.source_video_id,
      title: job.source_title,
      relative_path: job.source_relative_path,
      source_video_file_path: path.join(libraryRoot, job.source_relative_path)
    }),
    cut_runner: async () => {
      throw new Error("ffmpeg failed");
    }
  });

  assert.equal(failed?.status, "failed");
  assert.match(failed?.error_message ?? "", /ffmpeg failed/);

  const next = await runNextCutJob({
    workspace_root: workspaceRoot,
    library_root: libraryRoot,
    now: () => "2026-05-02T10:03:00Z",
    resolve_source: async (job) => ({
      source_video_id: job.source_video_id,
      title: job.source_title,
      relative_path: job.source_relative_path,
      source_video_file_path: path.join(libraryRoot, job.source_relative_path)
    }),
    cut_runner: async (input) => {
      await writeFile(input.output_path, "second-clip-bytes");
    }
  });

  assert.equal(next?.cut_job_id, "CJ20260502-0002");
  assert.equal(next?.status, "done");
  assert.equal((await getCutJob({ workspace_root: workspaceRoot, cut_job_id: "CJ20260502-0001" }))?.status, "failed");
  assert.deepEqual(
    (await listCutJobs({ workspace_root: workspaceRoot })).jobs.map((job) => job.status),
    ["done", "failed"]
  );
});

test("returns null when no pending cut job exists", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-empty-");

  const result = await runNextCutJob({
    workspace_root: workspaceRoot,
    library_root: await makeRoot("mixlab-cutter-local-library-"),
    now: () => "2026-05-02T10:00:00Z",
    resolve_source: async () => {
      throw new Error("should not resolve source");
    },
    cut_runner: async () => {
      throw new Error("should not cut");
    }
  });

  assert.equal(result, null);
});
