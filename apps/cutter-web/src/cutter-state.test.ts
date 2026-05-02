import assert from "node:assert/strict";
import test from "node:test";
import type { SourceVideoCard, TranscriptSegment } from "./api.ts";
import {
  clearCutList,
  createCutListItemFromSegments,
  deserializeCutList,
  moveCutListItem,
  removeCutListItem,
  serializeCutList,
  toCreateLocalClipRequest,
  toCreateClipListRequest,
  type CutListItem
} from "./state/cut-list.ts";
import {
  createQueueJobsFromCutList,
  mapApiCutJobsToQueueJobs,
  updateQueueJobStatus
} from "./state/cut-queue.ts";
import * as cutListModule from "./state/cut-list.ts";

const sourceVideo: SourceVideoCard = {
  source_video_id: "src-001",
  title: "现金流管理与风险控制",
  duration_ms: 618_000,
  width: 1920,
  height: 1080,
  fps: 25,
  codec: "h264",
  media_url: "/media/src-001.mp4",
  cover_url: "/covers/src-001.jpg",
  detail_url: "/cutter/source-videos/src-001",
  subtitles_url: "/subtitles/src-001.vtt",
  tags: ["财务", "经营分析"],
  description: "由管理端配置的课程说明。",
  relative_path: "source-videos/cashflow.mp4"
};

const transcriptSegments: TranscriptSegment[] = [
  {
    segment_id: "s-001",
    begin_ms: 10_000,
    end_ms: 15_200,
    text: "现金流不是利润表的影子。"
  },
  {
    segment_id: "s-002",
    begin_ms: 15_200,
    end_ms: 21_400,
    text: "它直接决定企业能不能安全穿过周期。"
  },
  {
    segment_id: "s-003",
    begin_ms: 21_400,
    end_ms: 28_000,
    text: "所以第一步要看回款节奏。"
  }
];

function item(overrides: Partial<CutListItem>): CutListItem {
  return {
    cut_list_item_id: overrides.cut_list_item_id ?? "cut-a",
    source_video_id: overrides.source_video_id ?? "src-001",
    source_title: overrides.source_title ?? "现金流管理与风险控制",
    source_relative_path: overrides.source_relative_path ?? "source-videos/cashflow.mp4",
    start_segment_id: overrides.start_segment_id ?? "s-001",
    end_segment_id: overrides.end_segment_id ?? "s-001",
    begin_ms: overrides.begin_ms ?? 1_000,
    end_ms: overrides.end_ms ?? 3_000,
    duration_ms: overrides.duration_ms ?? 2_000,
    selected_text: overrides.selected_text ?? "片段",
    cut_mode: overrides.cut_mode ?? "smart",
    order: overrides.order ?? 1
  };
}

test("continuous transcript range becomes one cut-list item", () => {
  const cut = createCutListItemFromSegments({
    sourceVideo,
    segments: transcriptSegments,
    cutMode: "precise",
    order: 3
  });

  assert.equal(cut.source_video_id, "src-001");
  assert.equal(cut.source_title, "现金流管理与风险控制");
  assert.equal(cut.start_segment_id, "s-001");
  assert.equal(cut.end_segment_id, "s-003");
  assert.equal(cut.begin_ms, 10_000);
  assert.equal(cut.end_ms, 28_000);
  assert.equal(cut.duration_ms, 18_000);
  assert.equal(cut.cut_mode, "precise");
  assert.equal(cut.order, 3);
  assert.equal(
    cut.selected_text,
    "现金流不是利润表的影子。 它直接决定企业能不能安全穿过周期。 所以第一步要看回款节奏。"
  );
});

test("cut-list reorder, remove, clear, serialize are deterministic", () => {
  const list = [item({ cut_list_item_id: "cut-a", order: 1 }), item({ cut_list_item_id: "cut-b", order: 2 })];

  assert.deepEqual(
    moveCutListItem(list, "cut-b", "up").map((cut) => [cut.cut_list_item_id, cut.order]),
    [
      ["cut-b", 1],
      ["cut-a", 2]
    ]
  );

  assert.deepEqual(
    removeCutListItem(list, "cut-a").map((cut) => [cut.cut_list_item_id, cut.order]),
    [["cut-b", 1]]
  );

  assert.deepEqual(clearCutList(list), []);

  const encoded = serializeCutList(list);
  assert.deepEqual(
    deserializeCutList(encoded).map((cut) => [cut.cut_list_item_id, cut.order]),
    [
      ["cut-a", 1],
      ["cut-b", 2]
    ]
  );
});

test("cut-list items submit as local clip requests without public source mutation APIs", () => {
  const cut = createCutListItemFromSegments({
    sourceVideo,
    segments: transcriptSegments.slice(0, 2),
    cutMode: "smart",
    title: "现金流安全片段"
  });

  assert.deepEqual(toCreateLocalClipRequest(cut), {
    source_video_id: "src-001",
    start_segment_id: "s-001",
    end_segment_id: "s-002",
    pre_roll_ms: 0,
    post_roll_ms: 0,
    cut_mode: "smart",
    title: "现金流安全片段"
  });

  assert.equal("publishSourceVideo" in cutListModule, false);
  assert.equal("updateSourceVideo" in cutListModule, false);
  assert.equal("deleteSourceVideo" in cutListModule, false);
});

test("cut-list items submit as traceable clip-list API requests", () => {
  const cut = createCutListItemFromSegments({
    sourceVideo,
    segments: transcriptSegments.slice(0, 2),
    cutMode: "smart",
    title: "现金流安全片段",
    preRollMs: 200,
    postRollMs: 300
  });

  const request = toCreateClipListRequest({
    libraryId: "lib_main_001",
    title: "待剪清单",
    items: [cut]
  });

  assert.equal(request.library_id, "lib_main_001");
  assert.equal(request.title, "待剪清单");
  assert.equal(request.items[0]?.source_relative_path, "source-videos/cashflow.mp4");
  assert.equal(request.items[0]?.begin_ms, 10_000);
  assert.equal(request.items[0]?.end_ms, 21_400);
  assert.equal(request.items[0]?.selected_text.includes("现金流"), true);
  assert.equal(request.items[0]?.pre_roll_ms, 200);
  assert.equal(request.items[0]?.post_roll_ms, 300);
});

test("queue jobs are derived from cut-list items and can change status independently", () => {
  const list = [
    item({ cut_list_item_id: "cut-a", order: 1, selected_text: "第一段" }),
    item({ cut_list_item_id: "cut-b", order: 2, selected_text: "第二段", cut_mode: "copy" })
  ];

  const jobs = createQueueJobsFromCutList(list, {
    createdAt: "2026-05-02T09:00:00.000Z"
  });

  assert.equal(jobs.length, 2);
  assert.equal(jobs[0]?.status, "pending");
  assert.equal(jobs[0]?.progress, 0);
  assert.equal(jobs[1]?.cut_mode, "copy");

  const running = updateQueueJobStatus(jobs, jobs[0]!.queue_job_id, {
    status: "running",
    progress: 42
  });

  assert.equal(running[0]?.status, "running");
  assert.equal(running[0]?.progress, 42);
  assert.equal(running[1]?.status, "pending");
});

test("API cut jobs map to queue rows with progress and traceability", () => {
  const jobs = mapApiCutJobsToQueueJobs({
    job_count: 2,
    jobs: [
      {
        cut_job_id: "CJ20260502-0001",
        clip_list_id: "CL20260502-0001",
        clip_list_item_id: "CLI000001",
        source_video_id: "V000001",
        source_title: "现金流",
        begin_ms: 10_000,
        end_ms: 21_400,
        selected_text: "现金流不是利润表的影子。",
        cut_mode: "smart",
        status: "done",
        export_clip_id: "E000001",
        created_at: "2026-05-02T10:00:00Z",
        updated_at: "2026-05-02T10:01:00Z"
      },
      {
        cut_job_id: "CJ20260502-0002",
        clip_list_id: "CL20260502-0001",
        clip_list_item_id: "CLI000002",
        source_video_id: "V000002",
        source_title: "组织增长",
        begin_ms: 1_000,
        end_ms: 3_000,
        selected_text: "组织效率决定增长。",
        cut_mode: "copy",
        status: "failed",
        error_message: "ffmpeg failed",
        created_at: "2026-05-02T10:00:00Z",
        updated_at: "2026-05-02T10:02:00Z"
      }
    ]
  });

  assert.equal(jobs[0]?.queue_job_id, "CJ20260502-0002");
  assert.equal(jobs[0]?.status, "failed");
  assert.equal(jobs[0]?.progress, 0);
  assert.equal(jobs[0]?.error_message, "ffmpeg failed");
  assert.equal(jobs[1]?.queue_job_id, "CJ20260502-0001");
  assert.equal(jobs[1]?.status, "done");
  assert.equal(jobs[1]?.progress, 100);
  assert.equal(jobs[1]?.duration_ms, 11_400);
});
