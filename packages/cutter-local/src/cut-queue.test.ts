import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  deleteProjectOutputs,
  listExportClips,
  writeClipList
} from "./index.ts";
import {
  getCutJob,
  listCutJobs,
  retryCutJob,
  runNextCutJob,
  submitClipListToQueue
} from "./cut-queue.ts";

async function makeRoot(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function fileOrDirExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
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
    submission.jobs.map((job) => [
      job.cut_job_id,
      job.status,
      job.clip_list_item_id,
      job.project_title,
      job.project_clip_order
    ]),
    [
      ["CJ20260502-0001", "pending", "CLI000001", "现金流混剪", 1],
      ["CJ20260502-0002", "pending", "CLI000002", "现金流混剪", 2]
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
      source_video_file_path: path.join(libraryRoot, job.source_relative_path),
      duration_ms: 40_000,
      width: 1920,
      height: 1080,
      fps: 25,
      codec: "h264",
      file_size: 123_456,
      transcript_segments: [
        {
          segment_id: "V000001-S000001",
          index: 1,
          begin_ms: 1000,
          end_ms: 2600,
          begin_char: 0,
          end_char: 10,
          normalized_begin_char: 0,
          normalized_end_char: 10,
          text: "现金流，是企业的血液。",
          normalized_text: "现金流，是企业的血液。",
          confidence: 0.99
        },
        {
          segment_id: "V000001-S000002",
          index: 2,
          begin_ms: 2600,
          end_ms: 5200,
          begin_char: 10,
          end_char: 17,
          normalized_begin_char: 10,
          normalized_end_char: 17,
          text: "不是账面数字。",
          normalized_text: "不是账面数字。",
          confidence: 0.98
        }
      ]
    }),
    cut_runner: async (input) => {
      cutCalls.push({
        output_path: input.output_path,
        begin_ms: input.begin_ms,
        end_ms: input.end_ms
      });
      await writeFile(input.output_path, "clip-bytes");
    },
    cover_runner: async (input) => {
      await writeFile(input.output_path, "cover-bytes");
    }
  });

  assert.equal(result?.status, "done");
  assert.equal(result?.export_clip_id, "E000001");
  assert.equal(result?.project_clip_order, 1);
  assert.equal(result?.title, "1-现金流混剪-01_现金流");
  assert.equal(result?.output_file, "export-clips/E000001/001-现金流混剪-01_现金流.mp4");
  assert.equal(cutCalls.length, 1);
  assert.equal(cutCalls[0]?.begin_ms, 1000);
  assert.equal(cutCalls[0]?.end_ms, 5200);

  const catalog = await listExportClips({ workspace_root: workspaceRoot });
  assert.equal(catalog.local_clip_count, 1);
  assert.equal(catalog.clips[0]?.source_video_id, "V000001");
  assert.equal(catalog.clips[0]?.title, "1-现金流混剪-01_现金流");
  assert.equal(catalog.clips[0]?.project_output_file, "projects/现金流混剪/001-现金流混剪-01_现金流.mp4");
  assert.equal(catalog.clips[0]?.cover_path, ".mixlab-library/videos/E000001/cover.jpg");
  assert.deepEqual(
    catalog.clips[0]?.transcript_segments?.map((segment) => [
      segment.segment_id,
      segment.begin_ms,
      segment.end_ms,
      segment.text
    ]),
    [
      ["E000001-S000001", 0, 1600, "现金流，是企业的血液。"],
      ["E000001-S000002", 1600, 4200, "不是账面数字。"]
    ]
  );

  const localSourceManifest = JSON.parse(
    await readFile(path.join(workspaceRoot, ".mixlab-library", "videos", "E000001", "source-video.json"), "utf8")
  );
  assert.equal(localSourceManifest.title, "1-现金流混剪-01_现金流");
  assert.equal(localSourceManifest.relative_path, ".mixlab-library/videos/E000001/source.mp4");
  assert.equal(localSourceManifest.duration_ms, 4200);
  assert.equal(localSourceManifest.width, 1920);
  assert.equal(localSourceManifest.cover_path, ".mixlab-library/videos/E000001/cover.jpg");

  const localTranscript = JSON.parse(
    await readFile(path.join(workspaceRoot, ".mixlab-library", "videos", "E000001", "transcript.json"), "utf8")
  );
  assert.equal(localTranscript.full_text, "现金流，是企业的血液。 不是账面数字。");
  assert.equal(
    await readFile(path.join(workspaceRoot, ".mixlab-library", "videos", "E000001", "subtitles.srt"), "utf8"),
    "1\n00:00:00,000 --> 00:00:01,600\n现金流，是企业的血液。\n\n2\n00:00:01,600 --> 00:00:04,200\n不是账面数字。\n"
  );
  await stat(path.join(workspaceRoot, ".mixlab-library", "videos", "E000001", "source.mp4"));
  await stat(path.join(workspaceRoot, "projects", "现金流混剪", "001-现金流混剪-01_现金流.mp4"));

  const persisted = JSON.parse(
    await readFile(path.join(workspaceRoot, "clip-jobs", "CJ20260502-0001.json"), "utf8")
  );
  assert.equal(persisted.status, "done");
});

test("deletes only workspace outputs tied to a cutter project id", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-delete-project-");
  const libraryRoot = await makeRoot("mixlab-cutter-local-delete-library-");
  const projectA = await writeClipList({
    workspace_root: workspaceRoot,
    library_id: "lib_main_001",
    project_id: "P20260506-aaa",
    title: "现金流项目",
    items: [{
      source_video_id: "V000001",
      source_title: "01_现金流",
      source_relative_path: "source-videos/01_现金流.mp4",
      start_segment_id: "V000001-S000001",
      end_segment_id: "V000001-S000001",
      begin_ms: 1000,
      end_ms: 3600,
      selected_text: "现金流，是企业的血液。",
      cut_mode: "smart"
    }],
    now: "2026-05-06T10:00:00Z"
  });
  const projectB = await writeClipList({
    workspace_root: workspaceRoot,
    library_id: "lib_main_001",
    project_id: "P20260506-bbb",
    title: "组织增长项目",
    items: [{
      source_video_id: "V000002",
      source_title: "02_组织增长",
      source_relative_path: "source-videos/02_组织增长.mp4",
      start_segment_id: "V000002-S000001",
      end_segment_id: "V000002-S000001",
      begin_ms: 2000,
      end_ms: 5200,
      selected_text: "组织效率决定增长。",
      cut_mode: "smart"
    }],
    now: "2026-05-06T10:01:00Z"
  });

  await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: projectA,
    now: "2026-05-06T10:02:00Z"
  });
  await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: projectB,
    now: "2026-05-06T10:03:00Z"
  });

  const runInput = {
    workspace_root: workspaceRoot,
    library_root: libraryRoot,
    now: () => "2026-05-06T10:04:00Z",
    resolve_source: async (job: { source_video_id: string; source_title: string; source_relative_path: string }) => ({
      source_video_id: job.source_video_id,
      title: job.source_title,
      relative_path: job.source_relative_path,
      source_video_file_path: path.join(libraryRoot, job.source_relative_path),
      duration_ms: 40_000,
      width: 1920,
      height: 1080,
      fps: 25,
      codec: "h264",
      file_size: 123_456,
      transcript_segments: []
    }),
    cut_runner: async (input: { output_path: string }) => {
      await writeFile(input.output_path, "clip-bytes");
    },
    cover_runner: async (input: { output_path: string }) => {
      await writeFile(input.output_path, "cover-bytes");
    }
  };
  await runNextCutJob(runInput);
  await runNextCutJob(runInput);

  const before = await listExportClips({ workspace_root: workspaceRoot });
  assert.deepEqual(
    before.clips.map((clip) => [clip.export_clip_id, clip.project_id]),
    [
      ["E000002", "P20260506-bbb"],
      ["E000001", "P20260506-aaa"]
    ]
  );

  const result = await deleteProjectOutputs({
    workspace_root: workspaceRoot,
    project_id: "P20260506-aaa"
  });

  assert.deepEqual(result, {
    project_id: "P20260506-aaa",
    removed_export_clips: 1,
    removed_local_clips: 1,
    removed_project_outputs: 1,
    removed_cut_jobs: 1,
    removed_clip_lists: 1
  });
  assert.equal(await fileOrDirExists(path.join(workspaceRoot, "export-clips", "E000001")), false);
  assert.equal(await fileOrDirExists(path.join(workspaceRoot, ".mixlab-library", "videos", "E000001")), false);
  assert.equal(await fileOrDirExists(path.join(workspaceRoot, "clip-jobs", "CJ20260506-0001.json")), false);
  assert.equal(await fileOrDirExists(path.join(workspaceRoot, "clip-lists", "CL20260506-0001")), false);
  assert.equal(await fileOrDirExists(path.join(workspaceRoot, "export-clips", "E000002")), true);
  assert.equal(await fileOrDirExists(path.join(workspaceRoot, ".mixlab-library", "videos", "E000002")), true);
  assert.equal(await fileOrDirExists(path.join(workspaceRoot, "clip-jobs", "CJ20260506-0002.json")), true);
  assert.equal(await fileOrDirExists(path.join(workspaceRoot, "clip-lists", "CL20260506-0002")), true);
});

test("assigns project-scoped clip order across separately submitted direct cuts", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-project-order-");
  const firstClipList = await writeClipList({
    workspace_root: workspaceRoot,
    library_id: "lib_main_001",
    title: "5月6日-1",
    items: [
      {
        source_video_id: "V000039",
        source_title: "C2100",
        source_relative_path: "source-videos/C2100.mp4",
        start_segment_id: "V000039-S000001",
        end_segment_id: "V000039-S000001",
        begin_ms: 0,
        end_ms: 1000,
        selected_text: "第一段",
        cut_mode: "smart"
      }
    ],
    now: "2026-05-06T10:00:00.000Z"
  });
  const first = await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: firstClipList,
    now: "2026-05-06T10:00:01.000Z"
  });
  const secondClipList = await writeClipList({
    workspace_root: workspaceRoot,
    library_id: "lib_main_001",
    title: "5月6日-1",
    items: [
      {
        source_video_id: "V000039",
        source_title: "C2100",
        source_relative_path: "source-videos/C2100.mp4",
        start_segment_id: "V000039-S000002",
        end_segment_id: "V000039-S000002",
        begin_ms: 1000,
        end_ms: 2000,
        selected_text: "第二段",
        cut_mode: "smart"
      }
    ],
    now: "2026-05-06T10:00:02.000Z"
  });
  const second = await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: secondClipList,
    now: "2026-05-06T10:00:03.000Z"
  });

  assert.equal(first.jobs[0]?.project_clip_order, 1);
  assert.equal(first.jobs[0]?.title, "1-5月6日-1-C2100");
  assert.equal(second.jobs[0]?.project_clip_order, 2);
  assert.equal(second.jobs[0]?.title, "2-5月6日-1-C2100");
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

test("retries failed cut jobs by returning them to pending", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-retry-");
  const libraryRoot = await makeRoot("mixlab-cutter-local-library-");
  const clipList = await makeClipList(workspaceRoot);
  await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: "2026-05-04T10:00:00.000Z"
  });

  const failed = await runNextCutJob({
    workspace_root: workspaceRoot,
    library_root: libraryRoot,
    now: () => "2026-05-04T10:01:00.000Z",
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

  const retried = await retryCutJob({
    workspace_root: workspaceRoot,
    cut_job_id: failed!.cut_job_id,
    now: "2026-05-04T10:02:00.000Z"
  });

  assert.equal(retried.status, "pending");
  assert.equal(retried.error_message, undefined);
  assert.equal(retried.started_at, undefined);
  assert.equal(retried.finished_at, undefined);
  assert.equal(retried.export_clip_id, undefined);
  assert.equal(retried.output_file, undefined);
  assert.equal(retried.updated_at, "2026-05-04T10:02:00.000Z");
});

test("retry rejects non-failed cut jobs", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-retry-non-failed-");
  const clipList = await makeClipList(workspaceRoot);
  const submission = await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: "2026-05-04T10:00:00.000Z"
  });

  await assert.rejects(
    () =>
      retryCutJob({
        workspace_root: workspaceRoot,
        cut_job_id: submission.jobs[0]!.cut_job_id,
        now: "2026-05-04T10:01:00.000Z"
      }),
    /only failed cut jobs can be retried/
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
