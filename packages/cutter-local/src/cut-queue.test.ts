import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, stat, truncate, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  deleteProjectOutputs,
  listExportClips,
  writeClipList
} from "./index.ts";
import {
  acquireWorkspaceLease,
  cancelCutJob,
  getCutJob,
  invalidateCutJobCache,
  listCutJobs,
  pinCachePath,
  pruneCutTempCache,
  readCutTempCacheStatus,
  readWorkspaceLease,
  recoverInterruptedCutJobs,
  recoverInterruptedCutJobsIfLeased,
  retryCutJob,
  runCutJob,
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

async function writeLibrarySource(libraryRoot: string, relativePath: string): Promise<string> {
  const sourcePath = path.join(libraryRoot, relativePath);

  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, `source:${relativePath}`);
  return sourcePath;
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
      job.project_clip_order,
      job.current_phase,
      job.phase_timings?.[0]?.label,
      job.phase_timings?.[0]?.status
    ]),
    [
      ["CJ20260502-0001", "pending", "CLI000001", "现金流混剪", 1, "queue_wait", "排队等待", "pending"],
      ["CJ20260502-0002", "pending", "CLI000002", "现金流混剪", 2, "queue_wait", "排队等待", "pending"]
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
      source_video_file_path: await writeLibrarySource(libraryRoot, job.source_relative_path),
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
  assert.equal(result?.current_phase, "write_manifest");
  assert.deepEqual(
    result?.phase_timings?.map((phase) => [phase.phase_id, phase.label, phase.status]),
    [
      ["queue_wait", "排队等待", "done"],
      ["resolve_source", "准备源素材", "done"],
      ["preflight_source", "剪切前检查", "done"],
      ["cut_media", "剪切/重编码", "done"],
      ["write_project_output", "写入交付目录", "done"],
      ["preprocess_local_asset", "本地素材预处理", "done"],
      ["generate_cover", "生成封面", "done"],
      ["write_manifest", "写入清单", "done"]
    ]
  );
  assert.equal(
    result?.phase_timings?.every((phase) => typeof phase.duration_ms === "number"),
    true
  );
  assert.equal(cutCalls.length, 1);
  assert.equal(cutCalls[0]?.begin_ms, 1000);
  assert.equal(cutCalls[0]?.end_ms, 5200);
  const pendingAfterFirstRun = await getCutJob({
    workspace_root: workspaceRoot,
    cut_job_id: "CJ20260502-0002"
  });
  assert.equal(pendingAfterFirstRun?.status, "pending");
  assert.equal(pendingAfterFirstRun?.phase_timings?.some((phase) => phase.status === "running"), false);

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
  // Round2 CUT-14：无实测 probe 时 duration 明确 unknown（0 + 标记），不再用请求时长冒充。
  assert.equal(localSourceManifest.duration_ms, 0);
  assert.equal(localSourceManifest.duration_unknown, true);
  assert.equal(localSourceManifest.duration_source, "unknown");
  assert.equal(localSourceManifest.width, 1920);
  assert.equal(localSourceManifest.visual_metadata_source, "source_manifest");
  assert.equal(localSourceManifest.transcript_text_scope, "exact_or_selected");
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

test("normalizes legacy pending jobs with running queue-wait phase and still runs them", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-legacy-pending-");
  const libraryRoot = await makeRoot("mixlab-cutter-local-legacy-library-");
  const sourceRelativePath = "source-videos/legacy.mp4";
  await writeLibrarySource(libraryRoot, sourceRelativePath);
  await mkdir(path.join(workspaceRoot, "clip-jobs"), { recursive: true });
  await writeFile(
    path.join(workspaceRoot, "clip-jobs", "CJ20260622-0001.json"),
    JSON.stringify({
      schema_version: "1.0",
      cut_job_id: "CJ20260622-0001",
      clip_list_id: "CL20260622-0001",
      clip_list_item_id: "CLI000001",
      library_id: "lib_main_001",
      project_id: "P20260622-legacy",
      title: "1-旧任务-legacy",
      project_title: "旧任务",
      project_clip_order: 1,
      source_video_id: "VLEGACY",
      source_title: "legacy",
      source_relative_path: sourceRelativePath,
      start_segment_id: "VLEGACY-S000001",
      end_segment_id: "VLEGACY-S000001",
      begin_ms: 1000,
      end_ms: 2500,
      selected_text: "旧任务排队等待。",
      cut_mode: "copy",
      status: "pending",
      current_phase: "queue_wait",
      phase_timings: [
        {
          phase_id: "queue_wait",
          label: "排队等待",
          status: "running",
          started_at: "2026-06-22T12:28:46.571Z"
        },
        { phase_id: "resolve_source", label: "准备源素材", status: "pending" },
        { phase_id: "preflight_source", label: "剪切前检查", status: "pending" },
        { phase_id: "cut_media", label: "剪切/重编码", status: "pending" },
        { phase_id: "write_project_output", label: "写入交付目录", status: "pending" },
        { phase_id: "preprocess_local_asset", label: "本地素材预处理", status: "pending" },
        { phase_id: "generate_cover", label: "生成封面", status: "pending" },
        { phase_id: "write_manifest", label: "写入清单", status: "pending" }
      ],
      created_at: "2026-06-22T12:28:46.571Z",
      updated_at: "2026-06-22T12:28:46.571Z"
    }, null, 2),
    "utf8"
  );

  const listed = await listCutJobs({ workspace_root: workspaceRoot });
  assert.equal(listed.jobs[0]?.status, "pending");
  assert.equal(listed.jobs[0]?.phase_timings?.some((phase) => phase.status === "running"), false);
  const pending = await getCutJob({
    workspace_root: workspaceRoot,
    cut_job_id: "CJ20260622-0001"
  });
  assert.equal(pending?.phase_timings?.some((phase) => phase.status === "running"), false);

  const result = await runNextCutJob({
    workspace_root: workspaceRoot,
    library_root: libraryRoot,
    now: () => "2026-06-22T12:30:00.000Z",
    resolve_source: (job) => ({
      source_video_id: job.source_video_id,
      title: job.source_title,
      relative_path: job.source_relative_path,
      source_video_file_path: path.join(libraryRoot, job.source_relative_path),
      duration_ms: 10_000,
      transcript_segments: []
    }),
    cut_runner: async (input) => {
      await writeFile(input.output_path, "clip-bytes");
    }
  });

  assert.equal(result?.status, "done");
  assert.equal(result?.phase_timings?.[0]?.phase_id, "queue_wait");
  assert.equal(result?.phase_timings?.[0]?.status, "done");
});

test("runs direct cut jobs without persisting every intermediate phase", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-direct-cut-");
  const libraryRoot = await makeRoot("mixlab-cutter-local-direct-library-");
  const clipList = await makeClipList(workspaceRoot);
  const submission = await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: "2026-05-02T10:01:00Z"
  });
  const cutJobId = submission.jobs[0]!.cut_job_id;
  let persistedDuringCut = await getCutJob({
    workspace_root: workspaceRoot,
    cut_job_id: cutJobId
  });

  const result = await runCutJob({
    workspace_root: workspaceRoot,
    library_root: libraryRoot,
    cut_job_id: cutJobId,
    now: () => "2026-05-02T10:02:00Z",
    resolve_source: async (job) => ({
      source_video_id: job.source_video_id,
      title: job.source_title,
      relative_path: job.source_relative_path,
      source_video_file_path: await writeLibrarySource(libraryRoot, job.source_relative_path),
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
        }
      ]
    }),
    cut_runner: async (input) => {
      persistedDuringCut = await getCutJob({
        workspace_root: workspaceRoot,
        cut_job_id: cutJobId
      });
      await writeFile(input.output_path, "direct-clip-bytes");
    },
    persist_phase_progress: false
  });

  assert.equal(persistedDuringCut?.status, "pending");
  assert.equal(persistedDuringCut?.current_phase, "queue_wait");
  assert.equal(result?.status, "done");
  assert.equal(result?.current_phase, "write_manifest");
  assert.equal(
    result?.phase_timings?.every((phase) => phase.status === "done" && typeof phase.duration_ms === "number"),
    true
  );
  assert.equal(
    (await getCutJob({
      workspace_root: workspaceRoot,
      cut_job_id: cutJobId
    }))?.status,
    "done"
  );
});

test("serves cut job list from live snapshot while a job is cutting", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-live-job-list-");
  const libraryRoot = await makeRoot("mixlab-cutter-local-library-");
  const clipList = await makeClipList(workspaceRoot);
  const submission = await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: "2026-05-02T10:01:00Z"
  });
  const cutJobId = submission.jobs[0]!.cut_job_id;

  const initialList = await listCutJobs({
    workspace_root: workspaceRoot,
    limit: 20
  });
  assert.equal(initialList.jobs.find((job) => job.cut_job_id === cutJobId)?.status, "pending");

  let listedDuringCut: Awaited<ReturnType<typeof listCutJobs>> | undefined;
  const result = await runNextCutJob({
    workspace_root: workspaceRoot,
    library_root: libraryRoot,
    now: () => "2026-05-02T10:02:00Z",
    resolve_source: async (job) => ({
      source_video_id: job.source_video_id,
      title: job.source_title,
      relative_path: job.source_relative_path,
      source_video_file_path: await writeLibrarySource(libraryRoot, job.source_relative_path),
      duration_ms: 40_000,
      width: 1920,
      height: 1080,
      fps: 25,
      codec: "h264",
      file_size: 123_456,
      transcript_segments: []
    }),
    cut_runner: async (input) => {
      listedDuringCut = await listCutJobs({
        workspace_root: workspaceRoot,
        limit: 20
      });
      await writeFile(input.output_path, "live-clip-bytes");
    }
  });

  assert.equal(result?.status, "done");
  const runningJob = listedDuringCut?.jobs.find((job) => job.cut_job_id === cutJobId);
  assert.equal(runningJob?.status, "running");
  assert.equal(runningJob?.current_phase, "cut_media");
});

test("cuts through workspace temp cache and removes temporary media after success", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-cut-temp-");
  const libraryRoot = await makeRoot("mixlab-cutter-local-library-");
  const clipList = await writeClipList({
    workspace_root: workspaceRoot,
    library_id: "lib_main_001",
    title: "临时区剪切",
    items: [
      {
        source_video_id: "V000001",
        source_title: "01_现金流",
        source_relative_path: "source-videos/01_现金流.mp4",
        start_segment_id: "V000001-S000001",
        end_segment_id: "V000001-S000001",
        begin_ms: 1000,
        end_ms: 2200,
        selected_text: "现金流",
        cut_mode: "copy"
      }
    ],
    now: "2026-05-02T10:00:00Z"
  });
  await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: "2026-05-02T10:01:00Z"
  });

  let runnerOutputPath = "";
  const result = await runNextCutJob({
    workspace_root: workspaceRoot,
    library_root: libraryRoot,
    now: () => "2026-05-02T10:02:00Z",
    resolve_source: async (job) => ({
      source_video_id: job.source_video_id,
      title: job.source_title,
      relative_path: job.source_relative_path,
      source_video_file_path: await writeLibrarySource(libraryRoot, job.source_relative_path),
      duration_ms: 40_000,
      width: 1920,
      height: 1080,
      fps: 25,
      codec: "h264",
      file_size: 123_456,
      transcript_segments: []
    }),
    cut_runner: async (input) => {
      runnerOutputPath = input.output_path;
      await writeFile(input.output_path, "temp-clip-bytes");
    }
  });

  assert.equal(result?.status, "done");
  assert.match(runnerOutputPath, /cache[/\\]cut-temp[/\\]CJ20260502-0001-E000001-/);
  assert.equal(await fileOrDirExists(runnerOutputPath), false);
  assert.equal(
    await readFile(path.join(workspaceRoot, "export-clips", "E000001", "001-临时区剪切-01_现金流.mp4"), "utf8"),
    "temp-clip-bytes"
  );
  assert.equal((await readCutTempCacheStatus({ workspace_root: workspaceRoot })).file_count, 0);
});

test("writes exact selected text into local transcript assets for partial segment cuts", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-partial-transcript-");
  const libraryRoot = await makeRoot("mixlab-cutter-local-library-");
  const clipList = await writeClipList({
    workspace_root: workspaceRoot,
    library_id: "lib_main_001",
    title: "关键词片段",
    items: [
      {
        source_video_id: "V000001",
        source_title: "01_现金流",
        source_relative_path: "source-videos/01_现金流.mp4",
        start_segment_id: "V000001-S000001",
        end_segment_id: "V000001-S000001",
        begin_ms: 500,
        end_ms: 964,
        selected_text: "现金流",
        cut_mode: "copy"
      }
    ],
    now: "2026-05-02T10:00:00Z"
  });
  await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: "2026-05-02T10:01:00Z"
  });

  const cutCalls: Array<{ begin_ms: number; end_ms: number }> = [];
  const result = await runNextCutJob({
    workspace_root: workspaceRoot,
    library_root: libraryRoot,
    now: () => "2026-05-02T10:02:00Z",
    resolve_source: async (job) => ({
      source_video_id: job.source_video_id,
      title: job.source_title,
      relative_path: job.source_relative_path,
      source_video_file_path: await writeLibrarySource(libraryRoot, job.source_relative_path),
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
          begin_ms: 500,
          end_ms: 2200,
          begin_char: 0,
          end_char: 11,
          normalized_begin_char: 0,
          normalized_end_char: 10,
          text: "现金流，是企业的血液。",
          normalized_text: "现金流是企业的血液",
          confidence: 0.99
        }
      ]
    }),
    cut_runner: async (input) => {
      cutCalls.push({
        begin_ms: input.begin_ms,
        end_ms: input.end_ms
      });
      await writeFile(input.output_path, "keyword-clip-bytes");
    }
  });

  assert.equal(result?.status, "done");
  assert.equal(result?.selected_text, "现金流");
  assert.deepEqual(cutCalls, [{ begin_ms: 500, end_ms: 964 }]);

  const catalog = await listExportClips({ workspace_root: workspaceRoot });
  assert.equal(catalog.local_clip_count, 1);
  assert.equal(catalog.clips[0]?.selected_text, "现金流");
  assert.deepEqual(
    catalog.clips[0]?.transcript_segments?.map((segment) => [
      segment.segment_id,
      segment.begin_ms,
      segment.end_ms,
      segment.text
    ]),
    [["E000001-S000001", 0, 464, "现金流"]]
  );

  const localTranscript = JSON.parse(
    await readFile(path.join(workspaceRoot, ".mixlab-library", "videos", "E000001", "transcript.json"), "utf8")
  );
  assert.equal(localTranscript.full_text, "现金流");
  assert.equal(
    await readFile(path.join(workspaceRoot, ".mixlab-library", "videos", "E000001", "subtitles.srt"), "utf8"),
    "1\n00:00:00,000 --> 00:00:00,464\n现金流\n"
  );
});

test("applies pre-roll and post-roll when clip-list rows become cut jobs", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-roll-queue-");
  const libraryRoot = await makeRoot("mixlab-cutter-local-library-");
  const clipList = await writeClipList({
    workspace_root: workspaceRoot,
    library_id: "lib_main_001",
    title: "带余量片段",
    items: [
      {
        source_video_id: "V000001",
        source_title: "01_现金流",
        source_relative_path: "source-videos/01_现金流.mp4",
        start_segment_id: "V000001-S000001",
        end_segment_id: "V000001-S000001",
        begin_ms: 1000,
        end_ms: 2200,
        selected_text: "现金流",
        cut_mode: "copy",
        pre_roll_ms: 350,
        post_roll_ms: 450
      }
    ],
    now: "2026-05-02T10:00:00Z"
  });
  const submission = await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: "2026-05-02T10:01:00Z"
  });

  assert.equal(submission.jobs[0]?.begin_ms, 650);
  assert.equal(submission.jobs[0]?.end_ms, 2650);
  assert.equal(submission.jobs[0]?.selected_text, "现金流");

  const cutCalls: Array<{ begin_ms: number; end_ms: number }> = [];
  const result = await runNextCutJob({
    workspace_root: workspaceRoot,
    library_root: libraryRoot,
    now: () => "2026-05-02T10:02:00Z",
    resolve_source: async (job) => ({
      source_video_id: job.source_video_id,
      title: job.source_title,
      relative_path: job.source_relative_path,
      source_video_file_path: await writeLibrarySource(libraryRoot, job.source_relative_path),
      duration_ms: 40_000,
      width: 1920,
      height: 1080,
      fps: 25,
      codec: "h264",
      file_size: 123_456,
      transcript_segments: []
    }),
    cut_runner: async (input) => {
      cutCalls.push({
        begin_ms: input.begin_ms,
        end_ms: input.end_ms
      });
      await writeFile(input.output_path, "rolled-clip-bytes");
    }
  });

  assert.equal(result?.status, "done");
  assert.equal(result?.begin_ms, 650);
  assert.equal(result?.end_ms, 2650);
  assert.equal(result?.selected_text, "现金流");
  assert.deepEqual(cutCalls, [{ begin_ms: 650, end_ms: 2650 }]);
});

test("serializes concurrent run-next calls so each pending job is cut once", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-run-next-lock-");
  const libraryRoot = await makeRoot("mixlab-cutter-local-library-");
  const clipList = await makeClipList(workspaceRoot);
  await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: "2026-05-02T10:01:00Z"
  });

  let activeCuts = 0;
  let maxActiveCuts = 0;
  const cutJobIds: string[] = [];
  const runInput = {
    workspace_root: workspaceRoot,
    library_root: libraryRoot,
    now: () => "2026-05-02T10:02:00Z",
    resolve_source: async (job: { source_video_id: string; source_title: string; source_relative_path: string }) => ({
      source_video_id: job.source_video_id,
      title: job.source_title,
      relative_path: job.source_relative_path,
      source_video_file_path: await writeLibrarySource(libraryRoot, job.source_relative_path),
      duration_ms: 40_000,
      width: 1920,
      height: 1080,
      fps: 25,
      codec: "h264",
      file_size: 123_456,
      transcript_segments: []
    }),
    cut_runner: async (input: { output_path: string }) => {
      activeCuts += 1;
      maxActiveCuts = Math.max(maxActiveCuts, activeCuts);
      await new Promise((resolve) => setTimeout(resolve, 20));
      await writeFile(input.output_path, "clip-bytes");
      activeCuts -= 1;
    }
  };

  const results = await Promise.all(Array.from({ length: 6 }, () => runNextCutJob(runInput)));
  for (const result of results) {
    if (result) {
      cutJobIds.push(result.cut_job_id);
    }
  }

  assert.deepEqual(cutJobIds.sort(), ["CJ20260502-0001", "CJ20260502-0002"]);
  assert.equal(maxActiveCuts, 1);
  assert.equal(results.filter(Boolean).length, 2);
  assert.equal((await listExportClips({ workspace_root: workspaceRoot })).local_clip_count, 2);
  assert.deepEqual(
    (await listCutJobs({ workspace_root: workspaceRoot })).jobs.map((job) => [job.cut_job_id, job.status]).sort(),
    [
      ["CJ20260502-0001", "done"],
      ["CJ20260502-0002", "done"]
    ]
  );
});

test("serializes concurrent queue submissions so job ids and project order stay unique", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-submit-lock-");
  const clipLists = await Promise.all(Array.from({ length: 12 }, (_, index) =>
    writeClipList({
      workspace_root: workspaceRoot,
      library_id: "lib_main_001",
      title: "并发提交项目",
      items: [
        {
          source_video_id: "V000001",
          source_title: `素材 ${index + 1}`,
          source_relative_path: `source-videos/${index + 1}.mp4`,
          start_segment_id: "V000001-S000001",
          end_segment_id: "V000001-S000001",
          begin_ms: 1000,
          end_ms: 2200,
          selected_text: "现金流",
          cut_mode: "copy"
        }
      ],
      now: "2026-05-02T10:00:00Z"
    })
  ));
  const submissions = await Promise.all(clipLists.map((clipList) =>
    submitClipListToQueue({
      workspace_root: workspaceRoot,
      clip_list: clipList,
      now: "2026-05-02T10:01:00Z"
    })
  ));
  const jobs = submissions.flatMap((submission) => submission.jobs);

  assert.deepEqual(
    jobs.map((job) => job.cut_job_id).sort(),
    Array.from({ length: 12 }, (_, index) => `CJ20260502-${String(index + 1).padStart(4, "0")}`)
  );
  assert.deepEqual(
    jobs.map((job) => job.project_clip_order).sort((left, right) => (left ?? 0) - (right ?? 0)),
    Array.from({ length: 12 }, (_, index) => index + 1)
  );
  assert.equal((await listCutJobs({ workspace_root: workspaceRoot })).job_count, 12);
  const paged = await listCutJobs({ workspace_root: workspaceRoot, limit: 3, offset: 2 });
  assert.equal(paged.job_count, 12);
  assert.equal(paged.jobs.length, 3);
});

test("lists cut jobs when legacy or corrupt job files exist", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-legacy-jobs-");
  const jobsRoot = path.join(workspaceRoot, "clip-jobs");
  await mkdir(jobsRoot, { recursive: true });
  await writeFile(path.join(jobsRoot, "CJ20260502-0001.json"), JSON.stringify({
    schema_version: "1.0",
    cut_job_id: "CJ20260502-0001",
    clip_list_id: "CL20260502-0001",
    clip_list_item_id: "item-1",
    library_id: "lib_main_001",
    source_video_id: "V000001",
    source_title: "现金流",
    source_relative_path: "source-videos/01.mp4",
    start_segment_id: "S1",
    end_segment_id: "S1",
    begin_ms: 1000,
    end_ms: 2200,
    selected_text: "现金流",
    cut_mode: "smart",
    status: "done",
    created_at: "2026-05-02T10:00:00Z"
  }));
  await writeFile(path.join(jobsRoot, "CJ20260502-0002.json"), "{broken-json");
  await writeFile(path.join(jobsRoot, "CJ20260502-0003.json"), JSON.stringify({
    schema_version: "1.0",
    cut_job_id: "CJ20260502-0003",
    status: "failed",
    created_at: "2026-05-02T10:03:00Z",
    updated_at: "2026-05-02T10:04:00Z",
    error_message: "source video not found"
  }));

  const catalog = await listCutJobs({ workspace_root: workspaceRoot, limit: 20 });

  assert.equal(catalog.job_count, 2);
  assert.deepEqual(catalog.jobs.map((job) => job.cut_job_id), [
    "CJ20260502-0003",
    "CJ20260502-0001"
  ]);
  assert.equal(catalog.jobs[1]?.updated_at, "2026-05-02T10:00:00Z");
});

test("runs a requested pending cut job without taking the oldest queued job", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-run-specific-");
  const libraryRoot = await makeRoot("mixlab-cutter-local-library-");
  const clipList = await makeClipList(workspaceRoot);
  const submission = await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: "2026-05-02T10:01:00Z"
  });
  const runInput = {
    workspace_root: workspaceRoot,
    library_root: libraryRoot,
    now: () => "2026-05-02T10:02:00Z",
    resolve_source: async (job: { source_video_id: string; source_title: string; source_relative_path: string }) => ({
      source_video_id: job.source_video_id,
      title: job.source_title,
      relative_path: job.source_relative_path,
      source_video_file_path: await writeLibrarySource(libraryRoot, job.source_relative_path),
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
    }
  };

  const second = await runCutJob({
    ...runInput,
    cut_job_id: submission.jobs[1]!.cut_job_id
  });

  assert.equal(second?.cut_job_id, "CJ20260502-0002");
  assert.equal(second?.status, "done");
  assert.equal(
    (await getCutJob({ workspace_root: workspaceRoot, cut_job_id: "CJ20260502-0001" }))?.status,
    "pending"
  );

  const first = await runNextCutJob(runInput);
  assert.equal(first?.cut_job_id, "CJ20260502-0001");
  assert.deepEqual(
    (await listCutJobs({ workspace_root: workspaceRoot })).jobs.map((job) => [job.cut_job_id, job.status]).sort(),
    [
      ["CJ20260502-0001", "done"],
      ["CJ20260502-0002", "done"]
    ]
  );
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
      source_video_file_path: await writeLibrarySource(libraryRoot, job.source_relative_path),
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
      // 区间边界契约（CUT-P0-2）要求实测源时长，否则在 preflight 阶段拒绝。
      duration_ms: 40_000,
      source_video_file_path: await writeLibrarySource(libraryRoot, job.source_relative_path)
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
      // 区间边界契约（CUT-P0-2）要求实测源时长。
      duration_ms: 40_000,
      source_video_file_path: await writeLibrarySource(libraryRoot, job.source_relative_path)
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

test("marks missing source videos with an actionable cutter error", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-missing-source-");
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
    resolve_source: async () => null,
    cut_runner: async () => {
      throw new Error("should not cut without a source video");
    }
  });

  assert.equal(failed?.status, "failed");
  assert.match(failed?.error_message ?? "", /源视频不可读/);
  assert.match(failed?.error_message ?? "", /source-videos/);
  assert.match(failed?.error_message ?? "", /PublicLibrary/);
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
      // 区间边界契约（CUT-P0-2）要求实测源时长，否则在 preflight 阶段拒绝。
      duration_ms: 40_000,
      source_video_file_path: await writeLibrarySource(libraryRoot, job.source_relative_path)
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
    (error: unknown) =>
      (error as { code?: string }).code === "cut_job_not_retryable" &&
      /只有失败、已取消或已完成但输出校验未通过的任务可以复剪/.test((error as Error).message)
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

// --- CUT-P0 修复新增契约测试（输出验收 / 区间边界 / copy 关键帧 / 超时恢复） -----

type LocalCutMode = "copy" | "smart" | "precise";

async function makeSingleClipList(
  workspaceRoot: string,
  input: {
    begin_ms: number;
    end_ms: number;
    cut_mode?: LocalCutMode;
    title?: string;
    source_video_id?: string;
    source_relative_path?: string;
  }
) {
  return writeClipList({
    workspace_root: workspaceRoot,
    library_id: "lib_main_001",
    title: input.title ?? "输出验收",
    items: [
      {
        source_video_id: input.source_video_id ?? "V000001",
        source_title: "01_现金流",
        source_relative_path: input.source_relative_path ?? "source-videos/01_现金流.mp4",
        start_segment_id: "V000001-S000001",
        end_segment_id: "V000001-S000001",
        begin_ms: input.begin_ms,
        end_ms: input.end_ms,
        selected_text: "现金流，是企业的血液。",
        cut_mode: input.cut_mode ?? "smart"
      }
    ],
    now: "2026-05-02T10:00:00Z"
  });
}

async function writeRawCutJobFile(
  workspaceRoot: string,
  input: {
    cut_job_id: string;
    begin_ms: number;
    end_ms: number;
    cut_mode?: LocalCutMode;
    source_video_id?: string;
    status?: string;
    created_at?: string;
    extra?: Record<string, unknown>;
  }
): Promise<void> {
  const jobDir = path.join(workspaceRoot, "clip-jobs");
  await mkdir(jobDir, { recursive: true });
  const job = {
    schema_version: "1.0",
    cut_job_id: input.cut_job_id,
    clip_list_id: "CL20260502-0001",
    clip_list_item_id: "CLI000001",
    library_id: "lib_main_001",
    source_video_id: input.source_video_id ?? "V000001",
    source_title: "01_现金流",
    source_relative_path: "source-videos/01_现金流.mp4",
    start_segment_id: "V000001-S000001",
    end_segment_id: "V000001-S000001",
    begin_ms: input.begin_ms,
    end_ms: input.end_ms,
    selected_text: "现金流，是企业的血液。",
    cut_mode: input.cut_mode ?? "smart",
    status: input.status ?? "pending",
    current_phase: "queue_wait",
    created_at: input.created_at ?? "2026-05-02T10:00:00Z",
    updated_at: input.created_at ?? "2026-05-02T10:00:00Z",
    ...(input.extra ?? {})
  };
  await writeFile(path.join(jobDir, `${input.cut_job_id}.json`), `${JSON.stringify(job, null, 2)}\n`, "utf8");
  // 测试直接落盘任务文件，绕过 writeCutJob 的进程内快照缓存。
  invalidateCutJobCache(workspaceRoot);
}

function healthyProbe(overrides: Record<string, unknown> = {}) {
  return {
    exists: true,
    size_bytes: 1024,
    duration_ms: 2000,
    has_video_stream: true,
    has_audio_stream: true,
    source_has_audio_stream: true,
    first_video_pts_ms: 0,
    video_duration_ms: 2000,
    audio_duration_ms: 2000,
    ...overrides
  };
}

async function writeTempMedia(input: { output_path: string }): Promise<void> {
  await mkdir(path.dirname(input.output_path), { recursive: true });
  await writeFile(input.output_path, "fake-clip-bytes");
}

test("verifies output duration and streams before marking a cut job done", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-verify-ok-");
  const libraryRoot = await makeRoot("mixlab-cutter-local-library-");
  const clipList = await makeSingleClipList(workspaceRoot, { begin_ms: 1000, end_ms: 3000 });
  await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: "2026-05-02T10:01:00Z"
  });

  const job = await runNextCutJob({
    workspace_root: workspaceRoot,
    library_root: libraryRoot,
    now: () => "2026-05-02T10:02:00Z",
    resolve_source: async (pending) => ({
      source_video_id: pending.source_video_id,
      title: pending.source_title,
      relative_path: pending.source_relative_path,
      source_video_file_path: await writeLibrarySource(libraryRoot, pending.source_relative_path),
      duration_ms: 12_000
    }),
    cut_runner: writeTempMedia,
    output_probe: async () => healthyProbe()
  });

  assert.equal(job?.status, "done");
  assert.equal(job?.cut_mode_used, "smart");
  assert.equal(job?.verification?.passed, true);
  assert.equal(job?.verification?.expected_duration_ms, 2000);
  assert.equal(job?.verification?.actual_duration_ms, 2000);
  assert.equal(job?.verification?.tolerance_ms, 200);
  assert.deepEqual(
    job?.verification?.checks.map((check) => check.check),
    ["file_exists", "file_size", "duration", "video_stream", "audio_stream", "first_frame_pts", "av_duration_delta"]
  );
});

test("fails a cut job whose output file is empty instead of marking done", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-verify-empty-");
  const libraryRoot = await makeRoot("mixlab-cutter-local-library-");
  const clipList = await makeSingleClipList(workspaceRoot, { begin_ms: 1000, end_ms: 3000 });
  await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: "2026-05-02T10:01:00Z"
  });

  const job = await runNextCutJob({
    workspace_root: workspaceRoot,
    library_root: libraryRoot,
    now: () => "2026-05-02T10:02:00Z",
    resolve_source: async (pending) => ({
      source_video_id: pending.source_video_id,
      title: pending.source_title,
      relative_path: pending.source_relative_path,
      source_video_file_path: await writeLibrarySource(libraryRoot, pending.source_relative_path),
      duration_ms: 12_000
    }),
    cut_runner: writeTempMedia,
    output_probe: async () => healthyProbe({
      size_bytes: 0,
      duration_ms: 0,
      has_video_stream: false,
      has_audio_stream: false,
      first_video_pts_ms: undefined,
      video_duration_ms: 0,
      audio_duration_ms: 0
    })
  });

  assert.equal(job?.status, "failed");
  assert.equal(job?.error_code, "CUT_OUTPUT_MISMATCH");
  assert.match(job?.error_message ?? "", /输出校验未通过/);
  assert.equal(job?.verification?.passed, false);
  assert.equal((await listExportClips({ workspace_root: workspaceRoot })).local_clip_count, 0);
});

test("fails a cut job when the output is far shorter than requested", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-verify-short-");
  const libraryRoot = await makeRoot("mixlab-cutter-local-library-");
  const clipList = await makeSingleClipList(workspaceRoot, { begin_ms: 1000, end_ms: 3000 });
  await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: "2026-05-02T10:01:00Z"
  });

  const job = await runNextCutJob({
    workspace_root: workspaceRoot,
    library_root: libraryRoot,
    now: () => "2026-05-02T10:02:00Z",
    resolve_source: async (pending) => ({
      source_video_id: pending.source_video_id,
      title: pending.source_title,
      relative_path: pending.source_relative_path,
      source_video_file_path: await writeLibrarySource(libraryRoot, pending.source_relative_path),
      duration_ms: 12_000
    }),
    cut_runner: writeTempMedia,
    output_probe: async () => healthyProbe({
      duration_ms: 1000,
      video_duration_ms: 1000,
      audio_duration_ms: 1000
    })
  });

  assert.equal(job?.status, "failed");
  assert.equal(job?.error_code, "CUT_OUTPUT_MISMATCH");
  assert.equal(job?.verification?.expected_duration_ms, 2000);
  assert.equal(job?.verification?.actual_duration_ms, 1000);
  assert.match(job?.error_message ?? "", /输出时长 1000ms/);
});

test("accepts an output without audio when the source has no audio track", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-verify-no-audio-");
  const libraryRoot = await makeRoot("mixlab-cutter-local-library-");
  const clipList = await makeSingleClipList(workspaceRoot, { begin_ms: 1000, end_ms: 3000 });
  await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: "2026-05-02T10:01:00Z"
  });

  const job = await runNextCutJob({
    workspace_root: workspaceRoot,
    library_root: libraryRoot,
    now: () => "2026-05-02T10:02:00Z",
    resolve_source: async (pending) => ({
      source_video_id: pending.source_video_id,
      title: pending.source_title,
      relative_path: pending.source_relative_path,
      source_video_file_path: await writeLibrarySource(libraryRoot, pending.source_relative_path),
      duration_ms: 12_000
    }),
    cut_runner: writeTempMedia,
    output_probe: async () => healthyProbe({
      has_audio_stream: false,
      source_has_audio_stream: false,
      audio_duration_ms: undefined
    })
  });

  assert.equal(job?.status, "done");
  const audioCheck = job?.verification?.checks.find((check) => check.check === "audio_stream");
  assert.equal(audioCheck?.passed, true);
});

test("rejects a request range that ends after the measured source duration", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-range-out-");
  const libraryRoot = await makeRoot("mixlab-cutter-local-library-");
  const clipList = await makeSingleClipList(workspaceRoot, { begin_ms: 12_500, end_ms: 13_500 });
  await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: "2026-05-02T10:01:00Z"
  });

  let cutCalled = false;
  const job = await runNextCutJob({
    workspace_root: workspaceRoot,
    library_root: libraryRoot,
    now: () => "2026-05-02T10:02:00Z",
    resolve_source: async (pending) => ({
      source_video_id: pending.source_video_id,
      title: pending.source_title,
      relative_path: pending.source_relative_path,
      source_video_file_path: await writeLibrarySource(libraryRoot, pending.source_relative_path),
      duration_ms: 12_000
    }),
    cut_runner: async (input) => {
      cutCalled = true;
      await writeTempMedia(input);
    }
  });

  assert.equal(job?.status, "failed");
  assert.equal(job?.error_code, "CUT_RANGE_OUT_OF_SOURCE");
  assert.match(job?.error_message ?? "", /超出源视频时长/);
  assert.equal(cutCalled, false);
});

test("rejects negative, zero-length, and overlong ranges before cutting", async () => {
  const cases = [
    { cut_job_id: "CJ20260502-0101", begin_ms: -100, end_ms: 1000, message: /剪切时间段非法/ },
    { cut_job_id: "CJ20260502-0102", begin_ms: 1000, end_ms: 1000, message: /剪切时间段非法/ },
    { cut_job_id: "CJ20260502-0103", begin_ms: 1000, end_ms: 200_000, message: /超出源视频时长/ }
  ];

  for (const item of cases) {
    const workspaceRoot = await makeRoot("mixlab-cutter-local-range-invalid-");
    const libraryRoot = await makeRoot("mixlab-cutter-local-library-");
    await writeRawCutJobFile(workspaceRoot, {
      cut_job_id: item.cut_job_id,
      begin_ms: item.begin_ms,
      end_ms: item.end_ms
    });
    let cutCalled = false;
    const job = await runNextCutJob({
      workspace_root: workspaceRoot,
      library_root: libraryRoot,
      now: () => "2026-05-02T10:02:00Z",
      resolve_source: async (pending) => ({
        source_video_id: pending.source_video_id,
        title: pending.source_title,
        relative_path: pending.source_relative_path,
        source_video_file_path: await writeLibrarySource(libraryRoot, pending.source_relative_path),
        duration_ms: 12_000
      }),
      cut_runner: async (input) => {
        cutCalled = true;
        await writeTempMedia(input);
      }
    });

    assert.equal(job?.status, "failed");
    assert.match(job?.error_message ?? "", item.message);
    assert.equal(cutCalled, false);
  }
});

test("probes real media duration for re-cut jobs sourced from local export clips", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-recut-probe-");
  const libraryRoot = await makeRoot("mixlab-cutter-local-library-");
  const sourcePath = await writeLibrarySource(libraryRoot, "source-videos/01_现金流.mp4");
  await writeRawCutJobFile(workspaceRoot, {
    cut_job_id: "CJ20260502-0201",
    begin_ms: 1_500,
    end_ms: 2_500,
    source_video_id: "E000001"
  });

  const probedPaths: string[] = [];
  const rejected = await runNextCutJob({
    workspace_root: workspaceRoot,
    library_root: libraryRoot,
    now: () => "2026-05-02T10:02:00Z",
    resolve_source: async () => ({
      source_video_id: "E000001",
      title: "本地作品",
      relative_path: ".mixlab-library/videos/E000001/source.mp4",
      source_video_file_path: sourcePath,
      // manifest 里的请求时长故意写成 2000ms，预检必须忽略它并探测真实 1000ms。
      duration_ms: 2000
    }),
    cut_runner: writeTempMedia,
    source_duration_probe: async (probeInput) => {
      probedPaths.push(probeInput.source_video_path);
      return { duration_ms: 1000 };
    }
  });

  assert.equal(rejected?.status, "failed");
  assert.equal(rejected?.error_code, "CUT_RANGE_OUT_OF_SOURCE");
  assert.match(rejected?.error_message ?? "", /超出源视频时长/);
  assert.deepEqual(probedPaths, [sourcePath]);

  await writeRawCutJobFile(workspaceRoot, {
    cut_job_id: "CJ20260502-0202",
    begin_ms: 100,
    end_ms: 800,
    source_video_id: "E000001"
  });

  const accepted = await runNextCutJob({
    workspace_root: workspaceRoot,
    library_root: libraryRoot,
    now: () => "2026-05-02T10:03:00Z",
    resolve_source: async () => ({
      source_video_id: "E000001",
      title: "本地作品",
      relative_path: ".mixlab-library/videos/E000001/source.mp4",
      source_video_file_path: sourcePath,
      duration_ms: 2000
    }),
    cut_runner: writeTempMedia,
    source_duration_probe: async (probeInput) => {
      probedPaths.push(probeInput.source_video_path);
      return { duration_ms: 1000 };
    }
  });

  assert.equal(accepted?.status, "done");
  assert.equal(probedPaths.length, 2);
});

test("degrades copy to precise when the begin point is far from a keyframe", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-keyframe-degrade-");
  const libraryRoot = await makeRoot("mixlab-cutter-local-library-");
  const clipList = await makeSingleClipList(workspaceRoot, {
    begin_ms: 1000,
    end_ms: 3000,
    cut_mode: "copy"
  });
  await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: "2026-05-02T10:01:00Z"
  });

  const runnerModes: string[] = [];
  const job = await runNextCutJob({
    workspace_root: workspaceRoot,
    library_root: libraryRoot,
    now: () => "2026-05-02T10:02:00Z",
    resolve_source: async (pending) => ({
      source_video_id: pending.source_video_id,
      title: pending.source_title,
      relative_path: pending.source_relative_path,
      source_video_file_path: await writeLibrarySource(libraryRoot, pending.source_relative_path),
      duration_ms: 12_000
    }),
    cut_runner: async (input) => {
      runnerModes.push(input.cut_mode);
      await writeTempMedia(input);
    },
    keyframe_probe: async () => ({ keyframe_times_ms: [0] }),
    output_probe: async () => healthyProbe()
  });

  assert.equal(job?.status, "done");
  assert.deepEqual(runnerModes, ["precise"]);
  assert.equal(job?.cut_mode_used, "precise");
  assert.match(job?.degrade_reason ?? "", /自动降级为精准剪切/);
  const clips = await listExportClips({ workspace_root: workspaceRoot });
  assert.equal(clips.clips[0]?.cut_mode, "precise");
});

test("keeps copy when the begin point is close to a keyframe and records the keyframe tolerance", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-keyframe-keep-");
  const libraryRoot = await makeRoot("mixlab-cutter-local-library-");
  const clipList = await makeSingleClipList(workspaceRoot, {
    begin_ms: 1000,
    end_ms: 3000,
    cut_mode: "copy"
  });
  await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: "2026-05-02T10:01:00Z"
  });

  const job = await runNextCutJob({
    workspace_root: workspaceRoot,
    library_root: libraryRoot,
    now: () => "2026-05-02T10:02:00Z",
    resolve_source: async (pending) => ({
      source_video_id: pending.source_video_id,
      title: pending.source_title,
      relative_path: pending.source_relative_path,
      source_video_file_path: await writeLibrarySource(libraryRoot, pending.source_relative_path),
      duration_ms: 12_000
    }),
    cut_runner: writeTempMedia,
    keyframe_probe: async () => ({ keyframe_times_ms: [0, 1000] }),
    // copy 模式容差 = 500 + 250 + 关键帧距离(0) = 750ms，允许 300ms 误差。
    output_probe: async () => healthyProbe({
      duration_ms: 2300,
      video_duration_ms: 2300,
      audio_duration_ms: 2300
    })
  });

  assert.equal(job?.status, "done");
  assert.equal(job?.cut_mode_used, "copy");
  assert.equal(job?.verification?.tolerance_ms, 750);
  assert.equal(job?.degrade_reason, undefined);
});

test("times out a hung cut runner and marks the job failed with CUT_TIMEOUT", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-timeout-");
  const libraryRoot = await makeRoot("mixlab-cutter-local-library-");
  const clipList = await makeSingleClipList(workspaceRoot, { begin_ms: 1000, end_ms: 3000 });
  await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: "2026-05-02T10:01:00Z"
  });

  let runnerAborted = false;
  const startedAt = Date.now();
  const job = await runNextCutJob({
    workspace_root: workspaceRoot,
    library_root: libraryRoot,
    now: () => "2026-05-02T10:02:00Z",
    cut_timeout_ms: 60,
    resolve_source: async (pending) => ({
      source_video_id: pending.source_video_id,
      title: pending.source_title,
      relative_path: pending.source_relative_path,
      source_video_file_path: await writeLibrarySource(libraryRoot, pending.source_relative_path),
      duration_ms: 12_000
    }),
    cut_runner: (input) =>
      new Promise<void>((resolve) => {
        input.signal?.addEventListener("abort", () => {
          runnerAborted = true;
          resolve();
        });
      })
  });

  assert.equal(job?.status, "failed");
  assert.equal(job?.error_code, "CUT_TIMEOUT");
  assert.match(job?.error_message ?? "", /剪切超时/);
  assert.equal(runnerAborted, true);
  assert.ok(Date.now() - startedAt < 5_000);
});

test("cancels an in-flight cut job and aborts the runner", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-cancel-");
  const libraryRoot = await makeRoot("mixlab-cutter-local-library-");
  const clipList = await makeSingleClipList(workspaceRoot, { begin_ms: 1000, end_ms: 3000 });
  const submission = await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: "2026-05-02T10:01:00Z"
  });
  const cutJobId = submission.jobs[0]!.cut_job_id;
  let runnerAborted = false;
  let releaseRunner!: () => void;
  const runnerStarted = new Promise<void>((resolve) => {
    releaseRunner = resolve;
  });

  const runPromise = runNextCutJob({
    workspace_root: workspaceRoot,
    library_root: libraryRoot,
    now: () => "2026-05-02T10:02:00Z",
    resolve_source: async (pending) => ({
      source_video_id: pending.source_video_id,
      title: pending.source_title,
      relative_path: pending.source_relative_path,
      source_video_file_path: await writeLibrarySource(libraryRoot, pending.source_relative_path),
      duration_ms: 12_000
    }),
    cut_runner: (input) =>
      new Promise<void>((resolve) => {
        releaseRunner();
        input.signal?.addEventListener("abort", () => {
          runnerAborted = true;
          resolve();
        });
      })
  });

  await runnerStarted;
  await cancelCutJob({
    workspace_root: workspaceRoot,
    cut_job_id: cutJobId,
    now: "2026-05-02T10:02:30Z"
  });
  const result = await runPromise;

  assert.equal(result?.status, "cancelled");
  assert.equal(result?.error_code, "CUT_CANCELLED");
  assert.equal(runnerAborted, true);
});

test("recovers interrupted running jobs on startup and allows retry", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-recover-");
  await writeRawCutJobFile(workspaceRoot, {
    cut_job_id: "CJ20260502-0301",
    begin_ms: 1000,
    end_ms: 3000,
    status: "running",
    created_at: "2026-05-02T10:00:00Z"
  });
  await writeRawCutJobFile(workspaceRoot, {
    cut_job_id: "CJ20260502-0302",
    begin_ms: 1000,
    end_ms: 3000,
    status: "pending",
    created_at: "2026-05-02T10:00:01Z"
  });

  const recovered = await recoverInterruptedCutJobs({
    workspace_root: workspaceRoot,
    now: "2026-05-02T11:00:00Z"
  });

  assert.equal(recovered.length, 1);
  const interrupted = await getCutJob({ workspace_root: workspaceRoot, cut_job_id: "CJ20260502-0301" });
  assert.equal(interrupted?.status, "failed");
  assert.equal(interrupted?.error_code, "CUT_PROCESS_INTERRUPTED");
  assert.match(interrupted?.error_message ?? "", /进程中断/);
  assert.equal(interrupted?.finished_at, "2026-05-02T11:00:00Z");
  assert.equal((await getCutJob({ workspace_root: workspaceRoot, cut_job_id: "CJ20260502-0302" }))?.status, "pending");

  const retried = await retryCutJob({
    workspace_root: workspaceRoot,
    cut_job_id: "CJ20260502-0301",
    now: "2026-05-02T11:01:00Z"
  });
  assert.equal(retried.status, "pending");
  assert.equal(retried.error_code, undefined);
});

test("retries a done job whose output verification failed and clears verification state", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-retry-done-unverified-");
  await writeRawCutJobFile(workspaceRoot, {
    cut_job_id: "CJ20260502-0401",
    begin_ms: 1000,
    end_ms: 3000,
    status: "done",
    extra: {
      cut_mode_used: "precise",
      degrade_reason: "起点距最近关键帧 2600ms，已自动降级为精准剪切",
      verification: {
        passed: false,
        expected_duration_ms: 2000,
        actual_duration_ms: 1000,
        tolerance_ms: 200,
        checks: [{ check: "duration", passed: false, detail: "输出时长不足" }]
      },
      export_clip_id: "E000001",
      output_file: "export-clips/E000001/001-输出验收.mp4",
      error_code: "CUT_OUTPUT_MISMATCH",
      error_message: "输出校验未通过",
      started_at: "2026-05-02T10:00:10Z",
      finished_at: "2026-05-02T10:00:20Z"
    }
  });

  const retried = await retryCutJob({
    workspace_root: workspaceRoot,
    cut_job_id: "CJ20260502-0401",
    now: "2026-05-02T10:05:00Z"
  });

  assert.equal(retried.cut_job_id, "CJ20260502-0401");
  assert.equal(retried.status, "pending");
  assert.equal(retried.begin_ms, 1000);
  assert.equal(retried.end_ms, 3000);
  assert.equal(retried.verification, undefined);
  assert.equal(retried.cut_mode_used, undefined);
  assert.equal(retried.degrade_reason, undefined);
  assert.equal(retried.export_clip_id, undefined);
  assert.equal(retried.output_file, undefined);
  assert.equal(retried.error_code, undefined);
  assert.equal(retried.error_message, undefined);
  assert.equal(retried.started_at, undefined);
  assert.equal(retried.finished_at, undefined);
  assert.equal(retried.updated_at, "2026-05-02T10:05:00Z");
});

test("rejects retry for done jobs whose output verification passed", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-retry-done-verified-");
  await writeRawCutJobFile(workspaceRoot, {
    cut_job_id: "CJ20260502-0402",
    begin_ms: 1000,
    end_ms: 3000,
    status: "done",
    extra: {
      verification: {
        passed: true,
        expected_duration_ms: 2000,
        actual_duration_ms: 2000,
        tolerance_ms: 200,
        checks: []
      }
    }
  });

  await assert.rejects(
    () =>
      retryCutJob({
        workspace_root: workspaceRoot,
        cut_job_id: "CJ20260502-0402",
        now: "2026-05-02T10:05:00Z"
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "cut_job_not_retryable" &&
      /输出校验通过/.test((error as Error).message)
  );
});

test("rejects retry for done jobs without legacy output verification record", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-retry-done-legacy-");
  await writeRawCutJobFile(workspaceRoot, {
    cut_job_id: "CJ20260502-0403",
    begin_ms: 1000,
    end_ms: 3000,
    status: "done"
  });

  await assert.rejects(
    () =>
      retryCutJob({
        workspace_root: workspaceRoot,
        cut_job_id: "CJ20260502-0403",
        now: "2026-05-02T10:05:00Z"
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "cut_job_not_retryable" &&
      /缺少输出校验记录/.test((error as Error).message)
  );
});

// --- Round2 契约测试：workspace 租约 / 提交幂等与原子 / 缓存 pin / 元数据实测 -------

test("workspace lease is exclusive, reclaims stale locks, and releases cleanly", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-lease-");
  const first = await acquireWorkspaceLease({
    workspace_root: workspaceRoot,
    instance_id: "instance-a",
    heartbeat_interval_ms: 0,
    now: () => "2026-05-02T10:00:00Z"
  });
  assert.equal(first.is_held(), true);
  assert.equal((await readWorkspaceLease(workspaceRoot))?.instance_id, "instance-a");

  await assert.rejects(
    () =>
      acquireWorkspaceLease({
        workspace_root: workspaceRoot,
        instance_id: "instance-b",
        heartbeat_interval_ms: 0,
        now: () => "2026-05-02T10:00:01Z"
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "workspace_lease_unavailable" &&
      /另一个剪辑实例/.test((error as Error).message)
  );

  await first.release();
  assert.equal(await readWorkspaceLease(workspaceRoot), null);

  const reclaimable = await acquireWorkspaceLease({
    workspace_root: workspaceRoot,
    instance_id: "instance-c",
    heartbeat_interval_ms: 0,
    now: () => "2026-05-02T10:00:02Z"
  });
  assert.equal(reclaimable.is_held(), true);
  await reclaimable.release();

  // 陈旧锁：心跳超过 stale_after_ms 时允许回收。
  await writeFile(
    path.join(workspaceRoot, ".mixlab-workspace-lock.json"),
    JSON.stringify({
      schema_version: "1.0",
      instance_id: "dead-instance",
      pid: 999_999,
      hostname: "another-host",
      workspace_root: workspaceRoot,
      acquired_at: "2026-05-02T09:00:00Z",
      heartbeat_at: "2026-05-02T09:00:00Z"
    }),
    "utf8"
  );
  const reclaimed = await acquireWorkspaceLease({
    workspace_root: workspaceRoot,
    instance_id: "instance-d",
    heartbeat_interval_ms: 0,
    stale_after_ms: 1_000,
    now: () => "2026-05-02T10:00:03Z"
  });
  assert.equal(reclaimed.is_held(), true);
  await reclaimed.release();
});

test("only the lease holder runs startup recovery; other instances leave running jobs untouched", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-lease-recovery-");
  const holder = await acquireWorkspaceLease({
    workspace_root: workspaceRoot,
    instance_id: "holder",
    heartbeat_interval_ms: 0
  });
  await writeRawCutJobFile(workspaceRoot, {
    cut_job_id: "CJ20260502-0501",
    begin_ms: 1000,
    end_ms: 3000,
    status: "running"
  });

  const notHeld = {
    workspace_root: workspaceRoot,
    instance_id: "pretender",
    pid: process.pid,
    acquired_at: "2026-05-02T10:00:00Z",
    heartbeat_at: () => "2026-05-02T10:00:00Z",
    is_held: () => false,
    refresh: async () => false,
    release: async () => undefined
  };

  const skipped = await recoverInterruptedCutJobsIfLeased({
    workspace_root: workspaceRoot,
    now: "2026-05-02T11:00:00Z",
    lease: notHeld
  });
  assert.equal(skipped.skipped, true);
  assert.equal(
    (await getCutJob({ workspace_root: workspaceRoot, cut_job_id: "CJ20260502-0501" }))?.status,
    "running"
  );

  const recovered = await recoverInterruptedCutJobsIfLeased({
    workspace_root: workspaceRoot,
    now: "2026-05-02T11:00:00Z",
    lease: holder
  });
  assert.equal(recovered.skipped, false);
  assert.equal(recovered.recovered.length, 1);
  assert.equal(
    (await getCutJob({ workspace_root: workspaceRoot, cut_job_id: "CJ20260502-0501" }))?.status,
    "failed"
  );
  await holder.release();
});

test("repeated submission with the same idempotency key returns existing jobs without new tasks", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-idempotent-");
  const clipList = await makeSingleClipList(workspaceRoot, { begin_ms: 1000, end_ms: 3000 });
  const first = await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: "2026-05-02T10:01:00Z"
  });
  const second = await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: "2026-05-02T10:02:00Z"
  });

  assert.equal(first.replayed, false);
  assert.equal(first.submission_key, `clip_list:${clipList.clip_list_id}`);
  assert.equal(second.replayed, true);
  assert.deepEqual(
    second.jobs.map((job) => job.cut_job_id),
    first.jobs.map((job) => job.cut_job_id)
  );
  assert.equal((await listCutJobs({ workspace_root: workspaceRoot })).job_count, 1);

  const clientKeyed = await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: "2026-05-02T10:03:00Z",
    client_request_id: "req:abc-123"
  });
  assert.equal(clientKeyed.replayed, false);
  assert.equal(clientKeyed.submission_key, "client:req:abc-123");
  assert.equal((await listCutJobs({ workspace_root: workspaceRoot })).job_count, 2);

  const clientKeyedReplay = await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: "2026-05-02T10:04:00Z",
    client_request_id: "req:abc-123"
  });
  assert.equal(clientKeyedReplay.replayed, true);
  assert.equal((await listCutJobs({ workspace_root: workspaceRoot })).job_count, 2);
});

test("batch submission rolls back already written jobs when a later write fails", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-submit-rollback-");
  const clipList = await makeSingleClipList(workspaceRoot, { begin_ms: 1000, end_ms: 3000, title: "回滚" });

  await assert.rejects(
    () =>
      submitClipListToQueue({
        workspace_root: workspaceRoot,
        clip_list: clipList,
        now: "2026-05-02T10:01:00Z",
        on_job_written: (_job, index) => {
          if (index === 0) {
            throw new Error("simulated write failure");
          }
        }
      }),
    /simulated write failure/
  );

  assert.equal((await listCutJobs({ workspace_root: workspaceRoot })).job_count, 0);
  assert.deepEqual(
    (await readdir(path.join(workspaceRoot, "clip-jobs"))).filter((name) =>
      name.startsWith(".staging-")
    ),
    []
  );
});

test("submission reports cut_queue_busy when another process holds the submission lock", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-submit-busy-");
  const clipList = await makeSingleClipList(workspaceRoot, { begin_ms: 1000, end_ms: 3000 });
  const lockPath = path.join(workspaceRoot, "clip-jobs", ".submission.lock");
  await mkdir(path.dirname(lockPath), { recursive: true });
  await writeFile(lockPath, JSON.stringify({ pid: process.pid }), "utf8");

  await assert.rejects(
    () =>
      submitClipListToQueue({
        workspace_root: workspaceRoot,
        clip_list: clipList,
        now: "2026-05-02T10:01:00Z",
        submission_lock_wait_ms: 30
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "cut_queue_busy" &&
      /正在提交剪切任务/.test((error as Error).message)
  );
});

test("cut temp cache pruning skips pinned files that are being written", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-cache-pin-");
  const cutTempDir = path.join(workspaceRoot, "cache", "cut-temp");
  await mkdir(cutTempDir, { recursive: true });
  const pinnedPath = path.join(cutTempDir, "CJ20260502-0001-E000001-pinned.mp4");
  const otherPath = path.join(cutTempDir, "CJ20260502-0001-E000002-older.mp4");
  await writeFile(pinnedPath, "");
  await writeFile(otherPath, "");
  await truncate(pinnedPath, 70 * 1024 * 1024);
  await truncate(otherPath, 70 * 1024 * 1024);

  const release = pinCachePath(pinnedPath);

  try {
    const pruned = await pruneCutTempCache({
      workspace_root: workspaceRoot,
      max_bytes: 128 * 1024 * 1024
    });
    assert.deepEqual(pruned, [otherPath]);
    assert.equal(await fileOrDirExists(pinnedPath), true);
    assert.equal(await fileOrDirExists(otherPath), false);
  } finally {
    release();
  }
});

test("local asset metadata comes from measured probe values instead of the requested range", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-measured-metadata-");
  const libraryRoot = await makeRoot("mixlab-cutter-local-library-");
  const clipList = await makeSingleClipList(workspaceRoot, { begin_ms: 1000, end_ms: 4000 });
  await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: "2026-05-02T10:01:00Z"
  });

  const job = await runNextCutJob({
    workspace_root: workspaceRoot,
    library_root: libraryRoot,
    now: () => "2026-05-02T10:02:00Z",
    resolve_source: async (pending) => ({
      source_video_id: pending.source_video_id,
      title: pending.source_title,
      relative_path: pending.source_relative_path,
      source_video_file_path: await writeLibrarySource(libraryRoot, pending.source_relative_path),
      duration_ms: 40_000,
      width: 1920,
      height: 1080,
      fps: 25,
      codec: "h264"
    }),
    cut_runner: writeTempMedia,
    output_probe: async () => healthyProbe({
      duration_ms: 2950,
      video_duration_ms: 2950,
      audio_duration_ms: 2950,
      width: 1280,
      height: 720,
      fps: 30,
      codec: "hevc"
    })
  });

  assert.equal(job?.status, "done");
  const manifest = JSON.parse(
    await readFile(
      path.join(workspaceRoot, ".mixlab-library", "videos", "E000001", "source-video.json"),
      "utf8"
    )
  );
  // 请求区间 3000ms，但清单使用实测 2950ms；宽高/编码来自 probe 而非源清单。
  assert.equal(manifest.duration_ms, 2950);
  assert.equal(manifest.duration_unknown, false);
  assert.equal(manifest.duration_source, "probe");
  assert.equal(manifest.width, 1280);
  assert.equal(manifest.height, 720);
  assert.equal(manifest.fps, 30);
  assert.equal(manifest.codec, "hevc");
  assert.equal(manifest.visual_metadata_source, "probe");
});

test("partial transcript segments explicitly mark selected-text timing estimate", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-text-scope-");
  const libraryRoot = await makeRoot("mixlab-cutter-local-library-");
  const clipList = await makeSingleClipList(workspaceRoot, { begin_ms: 1200, end_ms: 2800 });
  await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: "2026-05-02T10:01:00Z"
  });

  await runNextCutJob({
    workspace_root: workspaceRoot,
    library_root: libraryRoot,
    now: () => "2026-05-02T10:02:00Z",
    resolve_source: async (pending) => ({
      source_video_id: pending.source_video_id,
      title: pending.source_title,
      relative_path: pending.source_relative_path,
      source_video_file_path: await writeLibrarySource(libraryRoot, pending.source_relative_path),
      duration_ms: 40_000,
      transcript_segments: [
        {
          segment_id: "V000001-S000001",
          index: 1,
          begin_ms: 1000,
          end_ms: 2200,
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
          begin_ms: 2200,
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
    cut_runner: writeTempMedia,
    cover_runner: async (input) => {
      await writeFile(input.output_path, "cover-bytes");
    }
  });

  const transcript = JSON.parse(
    await readFile(
      path.join(workspaceRoot, ".mixlab-library", "videos", "E000001", "transcript.json"),
      "utf8"
    )
  );
  // 选区落在句内：文字为精确选区、时间为整句估算，用 text_scope 明确标注（不再静默冒充逐字对齐）。
  assert.deepEqual(
    transcript.segments.map((segment: { text_scope: string; source_begin_ms?: number; text: string }) => [
      segment.text_scope,
      segment.source_begin_ms ?? null,
      segment.text
    ]),
    [["selected_text_estimated_timing", null, "现金流，是企业的血液。"]]
  );
  assert.match(
    await readFile(
      path.join(workspaceRoot, ".mixlab-library", "videos", "E000001", "subtitles.srt"),
      "utf8"
    ),
    /现金流，是企业的血液。/
  );
  const manifest = JSON.parse(
    await readFile(
      path.join(workspaceRoot, ".mixlab-library", "videos", "E000001", "source-video.json"),
      "utf8"
    )
  );
  assert.equal(manifest.transcript_text_scope, "exact_or_selected");
});

test("startup recovery cleans stale submission staging directories", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-staging-cleanup-");
  const stagingDir = path.join(workspaceRoot, "clip-jobs", ".staging-dead-batch");
  await mkdir(stagingDir, { recursive: true });
  await writeFile(path.join(stagingDir, "CJ20260502-0009.json"), "{}", "utf8");
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  await utimes(stagingDir, tenMinutesAgo, tenMinutesAgo);

  await recoverInterruptedCutJobs({
    workspace_root: workspaceRoot,
    now: new Date().toISOString()
  });

  assert.equal(await fileOrDirExists(stagingDir), false);
});
