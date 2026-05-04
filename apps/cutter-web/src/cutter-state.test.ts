import assert from "node:assert/strict";
import test from "node:test";
import type { LocalClipCatalog, SearchResponse, SourceLibraryResponse, SourceVideoCard, TranscriptSegment } from "./api.ts";
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
import {
  cutQueueSummary,
  hasActiveCutJobs,
  shouldAutoRefreshCutJobs,
  shouldRefreshLocalClipsAfterQueueUpdate
} from "./state/cut-task-refresh.ts";
import * as cutListModule from "./state/cut-list.ts";
import {
  continuousTranscriptSegments,
  nextTranscriptSelectionRange,
  shouldSuppressTranscriptClickAfterMouseUp,
  transcriptSelectionRangeFromDrag
} from "./state/transcript-selection.ts";
import {
  previewStartSeconds,
  selectionPlaybackWindow,
  shouldPauseSelectionPreview
} from "./state/transcript-playback.ts";
import {
  matchesOrientationFilter,
  videoOrientation,
  videoOrientationLabel,
  type VideoOrientationFilter
} from "./state/video-orientation.ts";
import {
  buildMaterialLocatorSections,
  localClipToSourceVideoDetail
} from "./state/material-locator.ts";
import {
  appendCompletedLocalClip,
  localClipFromCutListItem
} from "./state/local-clip-reuse.ts";

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

test("video orientation follows width and height in Chinese product labels", () => {
  assert.equal(videoOrientation({ width: 1920, height: 1080 }), "landscape");
  assert.equal(videoOrientationLabel({ width: 1920, height: 1080 }), "横版");
  assert.equal(videoOrientation({ width: 1080, height: 1920 }), "portrait");
  assert.equal(videoOrientationLabel({ width: 1080, height: 1920 }), "竖版");
  assert.equal(videoOrientation({ width: 1080, height: 1080 }), "square");
  assert.equal(videoOrientationLabel({ width: 1080, height: 1080 }), "方形");
  assert.equal(videoOrientation({}), "unknown");
  assert.equal(videoOrientationLabel({}), "未知");
});

test("orientation filters preserve all videos or keep only landscape and portrait", () => {
  const videos = [
    { source_video_id: "landscape", width: 1920, height: 1080 },
    { source_video_id: "portrait", width: 1080, height: 1920 },
    { source_video_id: "square", width: 1080, height: 1080 },
    { source_video_id: "unknown" }
  ];

  const idsFor = (filter: VideoOrientationFilter) =>
    videos
      .filter((video) => matchesOrientationFilter(video, filter))
      .map((video) => video.source_video_id);

  assert.deepEqual(idsFor("all"), ["landscape", "portrait", "square", "unknown"]);
  assert.deepEqual(idsFor("landscape"), ["landscape"]);
  assert.deepEqual(idsFor("portrait"), ["portrait"]);
});

test("material locator groups local reusable materials before public source materials", () => {
  const sections = buildMaterialLocatorSections({
    query: "现金流",
    sourceFilter: "all",
    orientationFilter: "all",
    localClips: {
      local_clip_count: 2,
      clips: [
        {
          local_clip_id: "clip-001",
          title: "现金流短片开场",
          source_video_id: "src-001",
          source_title: "现金流管理与风险控制",
          begin_ms: 12_200,
          end_ms: 31_000,
          duration_ms: 18_800,
          selected_text: "现金流决定企业能不能安全穿过周期。",
          media_url: "/local-clips/clip-001.mp4",
          detail_url: "/cutter/local-clips/clip-001",
          width: 1080,
          height: 1920
        },
        {
          local_clip_id: "clip-002",
          title: "无文案片段",
          media_url: "/local-clips/clip-002.mp4",
          detail_url: "/cutter/local-clips/clip-002"
        }
      ]
    } as unknown as LocalClipCatalog,
    library: {
      available_video_count: 1,
      videos: [sourceVideo]
    },
    search: {
      query: "现金流",
      normalized_query: "现金流",
      groups: [
        {
          source_video_id: "src-001",
          title: "现金流管理与风险控制",
          duration_ms: 618_000,
          hit_count: 2,
          best_excerpt: "现金流不是利润表的影子。",
          hit_segments: transcriptSegments.slice(0, 2),
          media_url: "/media/src-001.mp4",
          cover_url: "/covers/src-001.jpg",
          detail_url: "/cutter/source-videos/src-001",
          subtitles_url: "/subtitles/src-001.vtt"
        }
      ]
    }
  });

  assert.deepEqual(sections.map((section) => section.label), ["本地素材", "公共原素材"]);
  assert.equal(sections[0]?.items[0]?.source, "local");
  assert.equal(sections[0]?.items[0]?.title, "现金流短片开场");
  assert.equal(sections[0]?.items[0]?.orientation_label, "竖版");
  assert.equal(sections[1]?.items[0]?.source, "public");
  assert.equal(sections[1]?.items[0]?.orientation_label, "横版");
});

test("material locator source and orientation filters narrow the unified result set", () => {
  const localClips = {
    local_clip_count: 1,
    clips: [
      {
        local_clip_id: "clip-001",
        title: "现金流竖版复剪素材",
        begin_ms: 0,
        end_ms: 10_000,
        duration_ms: 10_000,
        selected_text: "现金流要先看回款。",
        media_url: "/local-clips/clip-001.mp4",
        detail_url: "/cutter/local-clips/clip-001",
        width: 1080,
        height: 1920
      }
    ]
  } as unknown as LocalClipCatalog;
  const library: SourceLibraryResponse = {
    available_video_count: 1,
    videos: [sourceVideo]
  };
  const search: SearchResponse = {
    query: "现金流",
    normalized_query: "现金流",
    groups: [
      {
        source_video_id: "src-001",
        title: "现金流管理与风险控制",
        duration_ms: sourceVideo.duration_ms,
        hit_count: 1,
        best_excerpt: "现金流不是利润表的影子。",
        hit_segments: transcriptSegments.slice(0, 1)
      }
    ]
  };

  assert.deepEqual(
    buildMaterialLocatorSections({
      query: "现金流",
      sourceFilter: "local",
      orientationFilter: "all",
      localClips,
      library,
      search
    }).map((section) => section.key),
    ["local"]
  );
  assert.deepEqual(
    buildMaterialLocatorSections({
      query: "现金流",
      sourceFilter: "public",
      orientationFilter: "all",
      localClips,
      library,
      search
    }).map((section) => section.key),
    ["public"]
  );
  assert.deepEqual(
    buildMaterialLocatorSections({
      query: "现金流",
      sourceFilter: "all",
      orientationFilter: "portrait",
      localClips,
      library,
      search
    }).map((section) => section.key),
    ["local"]
  );
  assert.deepEqual(
    buildMaterialLocatorSections({
      query: "现金流",
      sourceFilter: "all",
      orientationFilter: "landscape",
      localClips,
      library,
      search
    }).map((section) => section.key),
    ["public"]
  );
});

test("local reusable material becomes a one-span selectable video detail", () => {
  const detail = localClipToSourceVideoDetail({
    local_clip_id: "clip-001",
    title: "现金流短片开场",
    source_video_id: "src-001",
    source_title: "现金流管理与风险控制",
    begin_ms: 12_200,
    end_ms: 31_000,
    duration_ms: 18_800,
    selected_text: "现金流决定企业能不能安全穿过周期。",
    media_url: "/local-clips/clip-001.mp4",
    detail_url: "/cutter/local-clips/clip-001"
  });

  assert.equal(detail.source_video_id, "clip-001");
  assert.equal(detail.title, "现金流短片开场");
  assert.equal(detail.transcript.full_text, "现金流决定企业能不能安全穿过周期。");
  assert.deepEqual(detail.transcript.segments, [
    {
      segment_id: "clip-001-S000001",
      begin_ms: 12_200,
      end_ms: 31_000,
      text: "现金流决定企业能不能安全穿过周期。"
    }
  ]);
});

test("completed cut-list items become local clips for reuse search", () => {
  const cut = createCutListItemFromSegments({
    sourceVideo,
    segments: transcriptSegments.slice(0, 2),
    cutMode: "smart",
    title: "现金流安全片段"
  });
  const clip = localClipFromCutListItem(cut, "clip-finished-001");

  assert.equal(clip.local_clip_id, "clip-finished-001");
  assert.equal(clip.title, "现金流安全片段");
  assert.equal(clip.source_title, "现金流管理与风险控制");
  assert.equal(clip.selected_text?.includes("现金流"), true);
  assert.equal(clip.duration_ms, 11_400);

  const catalog = appendCompletedLocalClip({ local_clip_count: 0, clips: [] }, clip);
  assert.equal(catalog.local_clip_count, 1);
  assert.equal(appendCompletedLocalClip(catalog, clip).local_clip_count, 1);

  const sections = buildMaterialLocatorSections({
    query: "现金流安全",
    sourceFilter: "all",
    orientationFilter: "all",
    localClips: catalog,
    library: {
      available_video_count: 1,
      videos: [sourceVideo]
    },
    search: {
      query: "现金流安全",
      normalized_query: "现金流安全",
      groups: [
        {
          source_video_id: sourceVideo.source_video_id,
          title: sourceVideo.title,
          duration_ms: sourceVideo.duration_ms,
          hit_count: 1,
          best_excerpt: "公共原素材命中",
          hit_segments: transcriptSegments.slice(0, 1)
        }
      ]
    }
  });

  assert.deepEqual(sections.map((section) => section.label), ["本地素材", "公共原素材"]);
  assert.equal(sections[0]?.items[0]?.id, "clip-finished-001");
});

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

test("transcript selection uses clicked range or search-highlight fallback as one continuous span", () => {
  assert.deepEqual(nextTranscriptSelectionRange({}, "s-002"), {
    startSegmentId: "s-002",
    endSegmentId: "s-002"
  });
  assert.deepEqual(nextTranscriptSelectionRange({ startSegmentId: "s-002" }, "s-001"), {
    startSegmentId: "s-002",
    endSegmentId: "s-001"
  });
  assert.deepEqual(
    nextTranscriptSelectionRange({ startSegmentId: "s-002", endSegmentId: "s-003" }, "s-001"),
    {
      startSegmentId: "s-001",
      endSegmentId: "s-001"
    }
  );

  assert.deepEqual(
    continuousTranscriptSegments(transcriptSegments, {
      startSegmentId: "s-003",
      endSegmentId: "s-001"
    }).map((segment) => segment.segment_id),
    ["s-001", "s-002", "s-003"]
  );
  assert.deepEqual(
    continuousTranscriptSegments(transcriptSegments, {
      fallbackSegmentIds: ["s-002", "s-003"]
    }).map((segment) => segment.segment_id),
    ["s-002", "s-003"]
  );
});

test("dragged transcript endpoints resolve to one continuous selectable range", () => {
  const dragged = transcriptSelectionRangeFromDrag("s-003", "s-001");

  assert.deepEqual(dragged, {
    startSegmentId: "s-003",
    endSegmentId: "s-001"
  });
  assert.deepEqual(
    continuousTranscriptSegments(transcriptSegments, dragged).map((segment) => segment.segment_id),
    ["s-001", "s-002", "s-003"]
  );
});

test("drag selection suppresses the synthetic click that follows mouseup", () => {
  assert.equal(shouldSuppressTranscriptClickAfterMouseUp("s-001", "s-003"), true);
  assert.equal(shouldSuppressTranscriptClickAfterMouseUp("s-003", "s-001"), true);
  assert.equal(shouldSuppressTranscriptClickAfterMouseUp("s-002", "s-002"), false);
  assert.equal(shouldSuppressTranscriptClickAfterMouseUp("s-002", undefined), false);
});

test("transcript playback helpers convert selected milliseconds into player seconds", () => {
  assert.equal(previewStartSeconds(12_200), 11.7);
  assert.equal(previewStartSeconds(200), 0);
  assert.deepEqual(selectionPlaybackWindow(transcriptSegments.slice(0, 2)), {
    startSeconds: 9.5,
    endSeconds: 21.4
  });
  assert.equal(selectionPlaybackWindow([]), null);
  assert.equal(shouldPauseSelectionPreview(21.39, 21_400), false);
  assert.equal(shouldPauseSelectionPreview(21.41, 21_400), true);
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

test("cut task refresh helpers summarize jobs and refresh only useful cutter routes", () => {
  const jobs = [
    item({ cut_list_item_id: "cut-a", order: 1 }),
    item({ cut_list_item_id: "cut-b", order: 2 })
  ];
  const queue = createQueueJobsFromCutList(jobs, { createdAt: "2026-05-04T10:00:00.000Z" });
  const activeQueue = [
    { ...queue[0]!, status: "pending" as const, progress: 0 },
    { ...queue[1]!, status: "running" as const, progress: 50 }
  ];

  assert.deepEqual(cutQueueSummary(activeQueue), {
    pending: 1,
    running: 1,
    done: 0,
    failed: 0,
    cancelled: 0,
    total: 2
  });
  assert.equal(hasActiveCutJobs(activeQueue), true);
  assert.equal(hasActiveCutJobs([{ ...activeQueue[0]!, status: "done", progress: 100 }]), false);
  assert.equal(
    shouldAutoRefreshCutJobs({
      apiMode: true,
      hasData: true,
      loginGateVisible: false,
      route: "material-locator",
      hasSubmittedCutJobs: true,
      jobs: []
    }),
    true
  );
  assert.equal(
    shouldAutoRefreshCutJobs({
      apiMode: true,
      hasData: true,
      loginGateVisible: false,
      route: "settings",
      hasSubmittedCutJobs: true,
      jobs: activeQueue
    }),
    false
  );
});

test("local clips refresh only when queue gains completed jobs", () => {
  const queue = createQueueJobsFromCutList([item({ cut_list_item_id: "cut-a", order: 1 })], {
    createdAt: "2026-05-04T10:00:00.000Z"
  });

  assert.equal(
    shouldRefreshLocalClipsAfterQueueUpdate(queue, [
      { ...queue[0]!, status: "done", progress: 100 }
    ]),
    true
  );
  assert.equal(
    shouldRefreshLocalClipsAfterQueueUpdate([{ ...queue[0]!, status: "done", progress: 100 }], [
      { ...queue[0]!, status: "done", progress: 100 }
    ]),
    false
  );
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
