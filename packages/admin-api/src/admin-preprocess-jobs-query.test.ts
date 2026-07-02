import assert from "node:assert/strict";
import test from "node:test";
import type { LibraryCounts, SourceVideoManifest } from "../../protocol/src/index.ts";
import {
  adminPreprocessJobStageFromManifest,
  listAdminPreprocessJobs,
  shouldReadAdminPreprocessJobRecordForList,
  type AdminPreprocessJobRecord
} from "./admin-preprocess-jobs-query.ts";

function sourceVideoManifest(input: {
  source_video_id: string;
  preprocess_status: SourceVideoManifest["preprocess_status"];
  title?: string;
  duration_ms?: number;
}): SourceVideoManifest {
  return {
    source_video_id: input.source_video_id,
    title: input.title ?? input.source_video_id,
    relative_path: `课程/${input.source_video_id}.mp4`,
    logical_uri: `library://source-video/${input.source_video_id}`,
    duration_ms: input.duration_ms ?? 600_000,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: "h264",
    file_size: 1024,
    content_hash: `hash-${input.source_video_id}`,
    preprocess_status: input.preprocess_status,
    visible_to_cutters: input.preprocess_status === "ready",
    transcript_path: input.preprocess_status === "ready" ? `artifacts/${input.source_video_id}/transcript.json` : "",
    srt_path: input.preprocess_status === "ready" ? `artifacts/${input.source_video_id}/transcript.srt` : "",
    keyframes_path: input.preprocess_status === "ready" ? `artifacts/${input.source_video_id}/keyframes.json` : "",
    cover_path: input.preprocess_status === "ready" ? `artifacts/${input.source_video_id}/cover.jpg` : "",
    description: "",
    tags: [],
    lecturer: "",
    course: "",
    category: ""
  };
}

function counts(input: Partial<LibraryCounts> = {}): LibraryCounts {
  return {
    video_count: 0,
    ready_video_count: 0,
    processing_video_count: 0,
    queued_video_count: 0,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    ...input
  };
}

function healthyRuntimeLoad() {
  return {
    overall_status: "healthy" as const,
    disk: { status: "healthy" as const },
    network: { status: "healthy" as const },
    cpu: { status: "healthy" as const },
    memory: { status: "healthy" as const }
  };
}

test("preprocess jobs query builds ordered observable queue state from a store-provided page", async () => {
  const jobRecords = new Map<string, AdminPreprocessJobRecord>([
    ["V000010", {
      source_video_id: "V000010",
      status: "processing",
      attempt: 1,
      claimed_at: "2026-05-02T11:55:00.000Z",
      current_stage: "asr"
    }],
    ["V000004", {
      source_video_id: "V000004",
      status: "failed",
      attempt: 1,
      claimed_at: "2026-05-02T11:20:00.000Z",
      failed_at: "2026-05-02T11:25:00.000Z",
      error_stage: "upload-audio",
      error_message: "上传失败"
    }],
    ["V000003", {
      source_video_id: "V000003",
      status: "ready",
      attempt: 1,
      claimed_at: "2026-05-02T11:30:00.000Z",
      completed_at: "2026-05-02T11:40:00.000Z"
    }]
  ]);

  const result = await listAdminPreprocessJobs({
    now: "2026-05-02T12:00:00.000Z",
    concurrency: 2,
    library_counts: counts({
      video_count: 12,
      processing_video_count: 3,
      queued_video_count: 7,
      failed_video_count: 2,
      ready_video_count: 0
    }),
    manifests: [
      sourceVideoManifest({
        source_video_id: "V000003",
        title: "历史完成",
        preprocess_status: "ready"
      }),
      sourceVideoManifest({
        source_video_id: "V000002",
        title: "排队素材",
        preprocess_status: "queued"
      }),
      sourceVideoManifest({
        source_video_id: "V000010",
        title: "正在处理",
        preprocess_status: "processing"
      }),
      sourceVideoManifest({
        source_video_id: "V000004",
        title: "失败素材",
        preprocess_status: "failed"
      })
    ],
    async read_preprocess_job(sourceVideoId) {
      return jobRecords.get(sourceVideoId) ?? null;
    },
    async read_runtime_load() {
      return {
        ...healthyRuntimeLoad(),
        network: { status: "blocked" as const }
      };
    }
  });

  assert.equal(result.active_count, 3);
  assert.equal(result.queued_count, 7);
  assert.equal(result.failed_count, 2);
  assert.deepEqual(
    result.jobs.map((job) => [job.source_video_id, job.status, job.stage, job.stage_label]),
    [
      ["V000010", "running", "asr", "语音识别"],
      ["V000002", "queued", "extract-audio", "等待处理"],
      ["V000004", "failed", "upload-audio", "上传音频"],
      ["V000003", "done", "publish-ready", "发布可用产物"]
    ]
  );
  assert.equal(result.jobs[0]?.progress, 50);
  assert.equal(result.jobs[0]?.estimated_remaining_ms, 300_000);
  assert.equal(result.jobs[0]?.estimated_done_at, "2026-05-02T12:05:00.000Z");
  assert.equal(result.jobs[1]?.queue_position, 1);
  assert.equal(result.jobs[1]?.estimated_start_at, "2026-05-02T12:05:00.000Z");
  assert.equal(result.jobs[1]?.estimated_done_at, "2026-05-02T12:15:00.000Z");
  assert.equal(result.jobs[1]?.log_url, "/api/admin/preprocess/jobs/J000002/log");
  assert.equal(result.jobs[2]?.retryable, true);
  assert.equal(result.jobs[2]?.error_message, "上传失败");
  assert.equal(result.observability.running_source_video_id, "V000010");
  assert.equal(result.observability.pipeline_progress_percent, 38);
  assert.equal(result.observability.estimated_queue_duration_ms, 900_000);
  assert.equal(result.observability.throughput_label, "预计 15:00 完成当前队列");
  assert.equal(result.observability.load_advice, "网络不可用，建议暂停流水线并检查语音识别网络。");
});

test("preprocess jobs query marks permanent source failures as non-retryable", async () => {
  const result = await listAdminPreprocessJobs({
    now: "2026-05-02T12:00:00.000Z",
    concurrency: 1,
    manifests: [
      sourceVideoManifest({
        source_video_id: "V000001",
        title: "损坏视频",
        preprocess_status: "failed"
      }),
      sourceVideoManifest({
        source_video_id: "V000002",
        title: "临时失败视频",
        preprocess_status: "failed"
      })
    ],
    async read_preprocess_job(sourceVideoId) {
      if (sourceVideoId === "V000001") {
        return {
          source_video_id: sourceVideoId,
          status: "failed",
          attempt: 3,
          claimed_at: "2026-05-02T11:20:00.000Z",
          failed_at: "2026-05-02T11:21:00.000Z",
          error_stage: "probe-media",
          error_message: "moov atom not found"
        };
      }

      return {
        source_video_id: sourceVideoId,
        status: "failed",
        attempt: 1,
        claimed_at: "2026-05-02T11:30:00.000Z",
        failed_at: "2026-05-02T11:31:00.000Z",
        error_stage: "asr",
        error_message: "DashScope task timeout"
      };
    },
    async read_runtime_load() {
      return healthyRuntimeLoad();
    }
  });

  const damaged = result.jobs.find((job) => job.source_video_id === "V000001");
  const temporary = result.jobs.find((job) => job.source_video_id === "V000002");

  assert.equal(damaged?.retryable, false);
  assert.equal(damaged?.status_label, "异常素材");
  assert.equal(damaged?.failure_kind, "invalid-media");
  assert.equal(damaged?.recommended_action, "inspect-source");
  assert.equal(temporary?.retryable, true);
  assert.equal(temporary?.status_label, "长任务语音识别待处理");
  assert.equal(temporary?.failure_kind, "asr-timeout");
  assert.equal(temporary?.recommended_action, "long-asr");
  assert.equal(temporary?.long_task_recommended, true);
});

test("preprocess jobs query skips unprocessed rows and only reads job records for observable histories", async () => {
  const requestedJobRecords: string[] = [];

  const result = await listAdminPreprocessJobs({
    now: "2026-05-02T12:00:00.000Z",
    concurrency: 1,
    manifests: [
      sourceVideoManifest({
        source_video_id: "V000001",
        preprocess_status: "unprocessed"
      }),
      sourceVideoManifest({
        source_video_id: "V000002",
        preprocess_status: "queued"
      }),
      sourceVideoManifest({
        source_video_id: "V000003",
        preprocess_status: "ready"
      }),
      sourceVideoManifest({
        source_video_id: "V000003",
        title: "去重后的完成记录",
        preprocess_status: "ready"
      })
    ],
    async read_preprocess_job(sourceVideoId) {
      requestedJobRecords.push(sourceVideoId);
      return {
        source_video_id: sourceVideoId,
        status: "ready",
        attempt: 1,
        claimed_at: "2026-05-02T11:30:00.000Z",
        indexed_at: "2026-05-02T11:40:00.000Z"
      };
    },
    async read_runtime_load() {
      return healthyRuntimeLoad();
    }
  });

  assert.deepEqual(requestedJobRecords, ["V000003"]);
  assert.deepEqual(
    result.jobs.map((job) => [job.source_video_id, job.title, job.status]),
    [
      ["V000002", "V000002", "queued"],
      ["V000003", "去重后的完成记录", "done"]
    ]
  );
  assert.equal(result.active_count, 0);
  assert.equal(result.queued_count, 1);
  assert.equal(result.failed_count, 0);
});

test("preprocess job stage helper preserves source-video detail stage semantics", () => {
  assert.equal(adminPreprocessJobStageFromManifest(
    sourceVideoManifest({
      source_video_id: "V000001",
      preprocess_status: "processing"
    }),
    {
      source_video_id: "V000001",
      status: "processing",
      attempt: 1,
      current_stage: "write-transcript"
    }
  ), "write-transcript");
  assert.equal(adminPreprocessJobStageFromManifest(
    sourceVideoManifest({
      source_video_id: "V000002",
      preprocess_status: "index-required"
    }),
    null
  ), "build-index");
  assert.equal(shouldReadAdminPreprocessJobRecordForList(sourceVideoManifest({
    source_video_id: "V000003",
    preprocess_status: "queued"
  })), false);
});
