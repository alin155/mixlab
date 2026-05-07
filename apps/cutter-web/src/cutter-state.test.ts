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
  filterCutQueueJobsByProject,
  mapApiCutJobsToQueueJobs,
  rememberCutJobsForProject,
  removeCutJobsForProject,
  replaceQueueJobWithSubmittedJobs,
  updateQueueJobStatus
} from "./state/cut-queue.ts";
import {
  cutQueueSummary,
  hasActiveCutJobs,
  shouldAutoRefreshCutJobs,
  shouldRefreshLocalClipsAfterQueueUpdate
} from "./state/cut-task-refresh.ts";
import {
  cutPipelineDetailLabel,
  cutPipelineStatusLabel,
  idleCutPipelineState,
  runCutPipeline
} from "./state/cut-pipeline.ts";
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
import { sourceMaterialTitleFromStableName } from "./state/material-naming.ts";
import {
  CUTTER_APPEARANCE_STORAGE_KEY,
  appearanceModeLabel,
  readCutterAppearanceMode,
  writeCutterAppearanceMode
} from "./state/appearance.ts";
import {
  clearCutterCurrentProject,
  createProjectFromFirstCut,
  createProjectFromSearch,
  removeCutterProject,
  projectDisplayTitle,
  projectSwitcherLabel,
  readCutterProjects,
  recordProjectCut,
  writeCutterProjects,
  type CutterProject
} from "./state/cutter-projects.ts";

function installTestWindow() {
  const store = new Map<string, string>();
  const localStorage = {
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    get length() {
      return store.size;
    }
  } satisfies Storage;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage
    }
  });
}

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

test("cutter appearance mode persists locally with Chinese labels", () => {
  installTestWindow();
  window.localStorage.clear();

  assert.equal(readCutterAppearanceMode(), "dark");
  assert.equal(appearanceModeLabel("dark"), "深色");
  assert.equal(appearanceModeLabel("light"), "浅色");
  assert.equal(appearanceModeLabel("system"), "系统");

  writeCutterAppearanceMode("light");
  assert.equal(readCutterAppearanceMode(), "light");

  window.localStorage.setItem(CUTTER_APPEARANCE_STORAGE_KEY, "default");
  assert.equal(readCutterAppearanceMode(), "dark");

  window.localStorage.setItem(CUTTER_APPEARANCE_STORAGE_KEY, "night");
  assert.equal(readCutterAppearanceMode(), "dark");

  window.localStorage.setItem(CUTTER_APPEARANCE_STORAGE_KEY, "comfort");
  assert.equal(readCutterAppearanceMode(), "light");

  window.localStorage.setItem(CUTTER_APPEARANCE_STORAGE_KEY, "invalid");
  assert.equal(readCutterAppearanceMode(), "dark");
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

test("material locator searches timestamped local clip transcript segments instead of the whole clip text", () => {
  const sections = buildMaterialLocatorSections({
    query: "账面数字",
    sourceFilter: "local",
    orientationFilter: "all",
    localClips: {
      local_clip_count: 1,
      clips: [
        {
          local_clip_id: "E000001",
          title: "1-5月6日-1-C2100",
          source_video_id: "V000039",
          source_title: "C2100",
          begin_ms: 0,
          end_ms: 4200,
          duration_ms: 4200,
          selected_text: "现金流，是企业的血液。 不是账面数字。",
          media_url: "/cutter/local-clips/E000001/media",
          cover_url: "/cutter/local-clips/E000001/cover",
          detail_url: "/cutter/local-clips/E000001",
          subtitles_url: "/cutter/local-clips/E000001/subtitles.srt",
          width: 1920,
          height: 1080,
          relative_path: ".mixlab-library/videos/E000001/source.mp4",
          transcript_segments: [
            {
              segment_id: "E000001-S000001",
              begin_ms: 0,
              end_ms: 1600,
              text: "现金流，是企业的血液。"
            },
            {
              segment_id: "E000001-S000002",
              begin_ms: 1600,
              end_ms: 4200,
              text: "不是账面数字。"
            }
          ]
        }
      ]
    } as unknown as LocalClipCatalog,
    library: {
      available_video_count: 0,
      videos: []
    },
    search: {
      query: "账面数字",
      normalized_query: "账面数字",
      groups: []
    }
  });

  const result = sections[0]?.items[0];
  assert.equal(result?.cover_url, "/cutter/local-clips/E000001/cover");
  assert.equal(result?.excerpt, "不是账面数字。");
  assert.equal(result?.hit_count, 1);
  assert.deepEqual(
    result?.segments.map((segment) => [segment.segment_id, segment.begin_ms, segment.end_ms, segment.text]),
    [["E000001-S000002", 1600, 4200, "不是账面数字。"]]
  );
});

test("material locator local material search normalizes punctuation and tolerates ASR errors", () => {
  const localClips = {
    local_clip_count: 1,
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
      }
    ]
  } as unknown as LocalClipCatalog;
  const emptyPublicSearch: SearchResponse = {
    query: "现金流，决定企业能不能安全穿过周其",
    normalized_query: "现金流决定企业能不能安全穿过周其",
    groups: []
  };

  const tolerantSections = buildMaterialLocatorSections({
    query: "现金流，决定企业能不能安全穿过周其",
    sourceFilter: "local",
    orientationFilter: "all",
    localClips,
    library: {
      available_video_count: 0,
      videos: []
    },
    search: emptyPublicSearch
  });
  assert.equal(tolerantSections[0]?.items[0]?.id, "clip-001");
  assert.equal(tolerantSections[0]?.items[0]?.hit_count, 1);

  const tooShort = buildMaterialLocatorSections({
    query: "现今流",
    sourceFilter: "local",
    orientationFilter: "all",
    localClips,
    library: {
      available_video_count: 0,
      videos: []
    },
    search: {
      query: "现今流",
      normalized_query: "现今流",
      groups: []
    }
  });
  assert.deepEqual(tooShort, []);
});

test("material locator public candidates keep whole-video transcript character counts", () => {
  const sections = buildMaterialLocatorSections({
    query: "现金流",
    sourceFilter: "public",
    orientationFilter: "all",
    localClips: { local_clip_count: 0, clips: [] },
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
          duration_ms: sourceVideo.duration_ms,
          hit_count: 1,
          best_excerpt: "现金流不是利润表的影子。",
          hit_segments: transcriptSegments.slice(0, 1),
          transcript_character_count: 1234
        }
      ]
    } as unknown as SearchResponse
  });

  assert.equal(sections[0]?.items[0]?.transcript_character_count, 1234);
  assert.notEqual(
    sections[0]?.items[0]?.transcript_character_count,
    transcriptSegments[0]!.text.replace(/\s+/g, "").length
  );
});

test("material locator keeps public candidates when the active query contains punctuation", () => {
  const sections = buildMaterialLocatorSections({
    query: "让自己清醒，通过不断的清醒让自己选择正确的道路。",
    sourceFilter: "public",
    orientationFilter: "all",
    localClips: { local_clip_count: 0, clips: [] },
    library: {
      available_video_count: 1,
      videos: [sourceVideo]
    },
    search: {
      query: "让自己清醒，通过不断的清醒让自己选择正确的道路。",
      normalized_query: "让自己清醒通过不断的清醒让自己选择正确的道路",
      groups: [
        {
          source_video_id: "src-001",
          title: "现金流管理与风险控制",
          duration_ms: sourceVideo.duration_ms,
          hit_count: 1,
          best_excerpt: "让自己清醒，通过不断的清醒让自己选择正确的道路。",
          hit_segments: transcriptSegments.slice(0, 1),
          transcript_character_count: 1234
        }
      ]
    } as unknown as SearchResponse
  });

  assert.equal(sections[0]?.key, "public");
  assert.equal(sections[0]?.items[0]?.id, "src-001");
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
  assert.deepEqual(
    buildMaterialLocatorSections({
      query: "",
      sourceFilter: "all",
      orientationFilter: "all",
      localClips,
      library,
      search
    }),
    []
  );
  assert.deepEqual(
    buildMaterialLocatorSections({
      query: "素材定位",
      sourceFilter: "all",
      orientationFilter: "all",
      localClips,
      library,
      search
    }),
    []
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

test("local reusable material detail preserves preprocessed transcript, cover and relative path", () => {
  const detail = localClipToSourceVideoDetail({
    local_clip_id: "E000001",
    title: "1-5月6日-1-C2100",
    source_video_id: "V000039",
    source_title: "C2100",
    begin_ms: 0,
    end_ms: 4200,
    duration_ms: 4200,
    selected_text: "现金流，是企业的血液。 不是账面数字。",
    media_url: "/cutter/local-clips/E000001/media",
    cover_url: "/cutter/local-clips/E000001/cover",
    detail_url: "/cutter/local-clips/E000001",
    subtitles_url: "/cutter/local-clips/E000001/subtitles.srt",
    relative_path: ".mixlab-library/videos/E000001/source.mp4",
    transcript_segments: [
      {
        segment_id: "E000001-S000001",
        begin_ms: 0,
        end_ms: 1600,
        text: "现金流，是企业的血液。"
      },
      {
        segment_id: "E000001-S000002",
        begin_ms: 1600,
        end_ms: 4200,
        text: "不是账面数字。"
      }
    ]
  });

  assert.equal(detail.cover_url, "/cutter/local-clips/E000001/cover");
  assert.equal(detail.subtitles_url, "/cutter/local-clips/E000001/subtitles.srt");
  assert.equal(detail.relative_path, ".mixlab-library/videos/E000001/source.mp4");
  assert.equal(detail.transcript.full_text, "现金流，是企业的血液。 不是账面数字。");
  assert.deepEqual(
    detail.transcript.segments.map((segment) => [segment.segment_id, segment.begin_ms, segment.end_ms, segment.text]),
    [
      ["E000001-S000001", 0, 1600, "现金流，是企业的血液。"],
      ["E000001-S000002", 1600, 4200, "不是账面数字。"]
    ]
  );
});

test("cut pipeline labels expose Chinese running, completed, failed and idle states", () => {
  assert.equal(cutPipelineStatusLabel(idleCutPipelineState), "本机剪切空闲");
  assert.equal(cutPipelineStatusLabel({ ...idleCutPipelineState, status: "running" }), "本机剪切运行中");
  assert.equal(cutPipelineStatusLabel({ ...idleCutPipelineState, status: "completed" }), "本机剪切已完成");
  assert.equal(cutPipelineStatusLabel({ ...idleCutPipelineState, status: "failed" }), "本机剪切失败");
  assert.equal(
    cutPipelineDetailLabel({
      status: "completed",
      processed_count: 3,
      done_count: 2,
      failed_count: 1,
      message: "本机剪切已完成",
      last_updated_label: "刚刚更新"
    }),
    "已处理 3 个任务，完成 2 个，失败 1 个。"
  );
});

test("cut pipeline runs pending jobs sequentially and refreshes local clips after completed jobs", async () => {
  const states: string[] = [];
  let queueRefreshes = 0;
  let localRefreshes = 0;
  const jobs = [
    {
      cut_job_id: "CJ20260504-0001",
      clip_list_id: "CL20260504-0001",
      status: "failed" as const,
      source_video_id: "V000001",
      begin_ms: 1000,
      end_ms: 2000
    },
    {
      cut_job_id: "CJ20260504-0002",
      clip_list_id: "CL20260504-0001",
      status: "done" as const,
      source_video_id: "V000001",
      begin_ms: 3000,
      end_ms: 5000,
      export_clip_id: "E000001"
    },
    null
  ];

  const result = await runCutPipeline({
    runNextCutJob: async () => jobs.shift() ?? null,
    refreshQueueJobs: async () => {
      queueRefreshes += 1;
    },
    refreshLocalClips: async () => {
      localRefreshes += 1;
    },
    onState(state) {
      states.push(cutPipelineStatusLabel(state));
    }
  });

  assert.equal(result.status, "completed");
  assert.equal(result.processed_count, 2);
  assert.equal(result.done_count, 1);
  assert.equal(result.failed_count, 1);
  assert.equal(queueRefreshes, 2);
  assert.equal(localRefreshes, 1);
  assert.deepEqual(states, ["本机剪切运行中", "本机剪切运行中", "本机剪切运行中", "本机剪切已完成"]);
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

  const recutClip = localClipFromCutListItem(
    {
      ...cut,
      source_title: "3-旧项目-现金流管理与风险控制",
      title: "4-新项目-现金流管理与风险控制"
    },
    "clip-recut-001"
  );
  assert.equal(recutClip.source_title, "现金流管理与风险控制");

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

test("cut-list items default to fast copy cutting when no mode is selected", () => {
  const cut = createCutListItemFromSegments({
    sourceVideo,
    segments: transcriptSegments.slice(0, 1)
  });

  assert.equal(cut.cut_mode, "copy");
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
  assert.deepEqual(
    continuousTranscriptSegments(transcriptSegments).map((segment) => segment.segment_id),
    []
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

  const recutRequest = toCreateClipListRequest({
    libraryId: "lib_main_001",
    title: "复剪清单",
    items: [
      {
        ...cut,
        source_title: "3-旧项目-现金流管理与风险控制"
      }
    ]
  });
  assert.equal(recutRequest.items[0]?.source_title, "现金流管理与风险控制");
});

test("first cut silently creates a cutter project from the active search query", () => {
  const cut = createCutListItemFromSegments({
    sourceVideo,
    segments: transcriptSegments.slice(0, 2),
    cutMode: "smart",
    title: "现金流安全片段"
  });

  const project = createProjectFromFirstCut({
    cut,
    query: "  今天想学管理  ",
    recentSearches: [
      { query: "现金流", hitCount: 7 },
      { query: "老师", hitCount: 202 }
    ],
    coverUrl: "/covers/project.jpg",
    now: "2026-05-05T10:00:00.000Z"
  });

  assert.match(project.project_id, /^P20260505-/);
  assert.equal(project.title, "5月5日");
  assert.equal(project.title_source, "auto");
  assert.equal(projectDisplayTitle(project), "5月5日");
  assert.equal(project.cover_url, "/covers/project.jpg");
  assert.equal(project.status, "active");
  assert.equal(project.clip_count, 1);
  assert.deepEqual(
    project.searches.map((item) => [item.query, item.hit_count]),
    [
      ["今天想学管理", 1],
      ["现金流", 7],
      ["老师", 202]
    ]
  );
});

test("first cut project uses date suffix when the day already has a project", () => {
  const cut = createCutListItemFromSegments({
    sourceVideo,
    segments: transcriptSegments,
    cutMode: "smart"
  });

  const project = createProjectFromFirstCut({
    cut,
    query: "",
    recentSearches: [],
    existingProjects: [
      createProjectFromFirstCut({
        cut,
        query: "现金流",
        recentSearches: [],
        now: "2026-05-05T09:00:00.000Z"
      })
    ],
    now: "2026-05-05T10:00:00.000Z"
  });

  assert.equal(project.title, "5月5日-1");
  assert.equal(projectSwitcherLabel(null), "临时搜索");
  assert.equal(projectSwitcherLabel(project), "当前项目：5月5日-1");
});

test("startup search creates an empty cutter project with the query recorded", () => {
  const existingProject = createProjectFromSearch({
    query: "现金流",
    existingProjects: [],
    now: "2026-05-05T09:00:00.000Z"
  });
  const project = createProjectFromSearch({
    query: "  今天想学管理  ",
    existingProjects: [existingProject],
    now: "2026-05-05T10:00:00.000Z"
  });

  assert.match(project.project_id, /^P20260505-/);
  assert.equal(project.title, "5月5日-1");
  assert.equal(project.title_source, "auto");
  assert.equal(project.clip_count, 0);
  assert.equal(project.running_count, 0);
  assert.equal(project.failed_count, 0);
  assert.deepEqual(project.searches, [
    {
      query: "今天想学管理",
      hit_count: 0,
      searched_at: "2026-05-05T10:00:00.000Z"
    }
  ]);
});

test("cutter projects persist with newest updated project first", () => {
  installTestWindow();
  const oldProject: CutterProject = {
    project_id: "P20260504-001",
    title: "昨天项目",
    status: "active",
    created_at: "2026-05-04T10:00:00.000Z",
    updated_at: "2026-05-04T10:00:00.000Z",
    clip_count: 1,
    running_count: 0,
    failed_count: 0,
    searches: []
  };
  const newProject = {
    ...oldProject,
    project_id: "P20260505-001",
    title: "今天项目",
    updated_at: "2026-05-05T10:00:00.000Z"
  };

  writeCutterProjects([oldProject, newProject], newProject.project_id);

  const restored = readCutterProjects();
  assert.equal(restored.currentProjectId, newProject.project_id);
  assert.deepEqual(
    restored.projects.map((project) => project.title),
    ["今天项目", "昨天项目"]
  );
});

test("clearing the current cutter project preserves the stored project list", () => {
  installTestWindow();
  const project: CutterProject = {
    project_id: "P20260505-001",
    title: "今天项目",
    status: "active",
    created_at: "2026-05-05T10:00:00.000Z",
    updated_at: "2026-05-05T10:00:00.000Z",
    clip_count: 2,
    running_count: 1,
    failed_count: 0,
    searches: []
  };

  writeCutterProjects([project], project.project_id);
  clearCutterCurrentProject();

  const restored = readCutterProjects();
  assert.equal(restored.currentProjectId, undefined);
  assert.deepEqual(restored.projects, [project]);
});

test("removing a cutter project clears the current selection only when that project is removed", () => {
  const oldProject: CutterProject = {
    project_id: "P20260505-001",
    title: "5月5日",
    status: "active",
    created_at: "2026-05-05T10:00:00.000Z",
    updated_at: "2026-05-05T10:00:00.000Z",
    clip_count: 2,
    running_count: 0,
    failed_count: 0,
    searches: []
  };
  const selectedProject: CutterProject = {
    ...oldProject,
    project_id: "P20260506-001",
    title: "5月6日",
    updated_at: "2026-05-06T10:00:00.000Z"
  };

  const state = removeCutterProject({
    projects: [oldProject, selectedProject],
    currentProjectId: selectedProject.project_id
  }, selectedProject.project_id);

  assert.equal(state.currentProjectId, undefined);
  assert.deepEqual(state.projects, [oldProject]);

  const preserved = removeCutterProject({
    projects: [oldProject, selectedProject],
    currentProjectId: selectedProject.project_id
  }, oldProject.project_id);

  assert.equal(preserved.currentProjectId, selectedProject.project_id);
  assert.deepEqual(preserved.projects, [selectedProject]);
});

test("removing a project from cut job index keeps other project mappings", () => {
  const cleaned = removeCutJobsForProject({
    jobs: {
      "job-1": "P20260505-001",
      "job-2": "P20260506-001"
    },
    clipLists: {
      "clip-list-1": "P20260505-001",
      "clip-list-2": "P20260506-001"
    }
  }, "P20260505-001");

  assert.deepEqual(cleaned, {
    jobs: {
      "job-2": "P20260506-001"
    },
    clipLists: {
      "clip-list-2": "P20260506-001"
    }
  });
});

test("recording a cut updates project metrics and keeps the first cover", () => {
  const project = createProjectFromFirstCut({
    cut: createCutListItemFromSegments({
      sourceVideo,
      segments: transcriptSegments.slice(0, 1),
      cutMode: "smart"
    }),
    query: "现金流",
    recentSearches: [],
    coverUrl: "/covers/first.jpg",
    now: "2026-05-05T10:00:00.000Z"
  });

  const updated = recordProjectCut(project, {
    status: "pending",
    coverUrl: "/covers/second.jpg",
    now: "2026-05-05T10:05:00.000Z"
  });

  assert.equal(updated.clip_count, 2);
  assert.equal(updated.running_count, 1);
  assert.equal(updated.failed_count, 0);
  assert.equal(updated.cover_url, "/covers/first.jpg");
  assert.equal(updated.updated_at, "2026-05-05T10:05:00.000Z");
});

test("queue jobs are derived from cut-list items and can change status independently", () => {
  const list = [
    item({ cut_list_item_id: "cut-a", order: 1, selected_text: "第一段" }),
    item({ cut_list_item_id: "cut-b", order: 2, selected_text: "第二段", cut_mode: "copy" })
  ];

  const jobs = createQueueJobsFromCutList(list, {
    createdAt: "2026-05-02T09:00:00.000Z",
    projectTitle: "现金流项目"
  });

  assert.equal(jobs.length, 2);
  assert.equal(jobs[0]?.status, "pending");
  assert.equal(jobs[0]?.progress, 0);
  assert.equal(jobs[0]?.current_phase, "queue_wait");
  assert.equal(jobs[0]?.phase_timings?.[0]?.label, "排队等待");
  assert.equal(jobs[0]?.phase_timings?.[0]?.status, "running");
  assert.equal(jobs[0]?.title, "1-现金流项目-现金流管理与风险控制");
  assert.equal(jobs[0]?.title.includes("第一段"), false);
  assert.equal(jobs[0]?.title.includes("00:01"), false);
  assert.equal(jobs[1]?.cut_mode, "copy");

  const recutJobs = createQueueJobsFromCutList(
    [
      item({
        cut_list_item_id: "cut-local-reuse",
        order: 4,
        source_title: "3-旧项目-现金流管理与风险控制"
      })
    ],
    {
      createdAt: "2026-05-02T09:05:00.000Z",
      projectTitle: "新项目"
    }
  );
  assert.equal(recutJobs[0]?.source_title, "现金流管理与风险控制");
  assert.equal(recutJobs[0]?.title, "4-新项目-现金流管理与风险控制");

  const running = updateQueueJobStatus(jobs, jobs[0]!.queue_job_id, {
    status: "running",
    progress: 42
  });

  assert.equal(running[0]?.status, "running");
  assert.equal(running[0]?.progress, 42);
  assert.equal(running[1]?.status, "pending");
});

test("stable material names expose the source material field for recuts", () => {
  assert.equal(sourceMaterialTitleFromStableName("1-5月6日-1-C2100"), "C2100");
  assert.equal(sourceMaterialTitleFromStableName("3-旧项目-现金流管理与风险控制"), "现金流管理与风险控制");
  assert.equal(sourceMaterialTitleFromStableName("C2100"), "C2100");
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
  const jobs = mapApiCutJobsToQueueJobs(
    {
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
    },
    {
      projectId: "P-growth",
      projectTitle: "增长复盘"
    }
  );

  assert.equal(jobs[0]?.queue_job_id, "CJ20260502-0002");
  assert.equal(jobs[0]?.status, "failed");
  assert.equal(jobs[0]?.title, "2-增长复盘-组织增长");
  assert.equal(jobs[0]?.title.includes("组织效率决定增长"), false);
  assert.equal(jobs[0]?.progress, 0);
  assert.equal(jobs[0]?.error_message, "ffmpeg failed");
  assert.equal(jobs[1]?.queue_job_id, "CJ20260502-0001");
  assert.equal(jobs[1]?.status, "done");
  assert.equal(jobs[1]?.title, "1-增长复盘-现金流");
  assert.equal(jobs[1]?.progress, 100);
  assert.equal(jobs[1]?.duration_ms, 11_400);
});

test("cut queue jobs can be scoped back to the current cutter project", () => {
  const list = [
    item({ cut_list_item_id: "cut-project-a", order: 1, selected_text: "项目 A 的文案" }),
    item({ cut_list_item_id: "cut-project-b", order: 2, selected_text: "项目 B 的文案" })
  ];
  const projectAJobs = createQueueJobsFromCutList([list[0]!], {
    createdAt: "2026-05-05T10:00:00.000Z",
    projectId: "P-a"
  });
  const projectBJobs = createQueueJobsFromCutList([list[1]!], {
    createdAt: "2026-05-05T10:05:00.000Z",
    projectId: "P-b"
  });

  assert.equal(projectAJobs[0]?.project_id, "P-a");
  assert.equal(projectBJobs[0]?.project_id, "P-b");
  assert.deepEqual(
    filterCutQueueJobsByProject([...projectAJobs, ...projectBJobs], "P-a").map((job) => job.cut_list_item_id),
    ["cut-project-a"]
  );

  const projectIndex = rememberCutJobsForProject(
    { jobs: {}, clipLists: {} },
    [
      {
        ...projectAJobs[0]!,
        queue_job_id: "CJ20260505-0001",
        clip_list_id: "CL20260505-0001"
      }
    ],
    "P-a"
  );
  const mappedApiJobs = mapApiCutJobsToQueueJobs(
    {
      job_count: 1,
      jobs: [
        {
          cut_job_id: "CJ20260505-0002",
          clip_list_id: "CL20260505-0001",
          clip_list_item_id: "CLI000001",
          source_video_id: "V000001",
          source_title: "项目归属",
          begin_ms: 0,
          end_ms: 3_000,
          selected_text: "刷新后仍然属于项目 A。",
          cut_mode: "smart",
          status: "pending",
          created_at: "2026-05-05T10:10:00.000Z",
          updated_at: "2026-05-05T10:10:00.000Z"
        }
      ]
    },
    { projectIndex }
  );

  assert.equal(projectIndex.jobs["CJ20260505-0001"], "P-a");
  assert.equal(projectIndex.clipLists["CL20260505-0001"], "P-a");
  assert.equal(mappedApiJobs[0]?.clip_list_id, "CL20260505-0001");
  assert.equal(mappedApiJobs[0]?.project_id, "P-a");
});

test("optimistic queue rows are replaced by submitted API jobs without losing order", () => {
  const optimistic = createQueueJobsFromCutList(
    [item({ cut_list_item_id: "cut-optimistic", order: 1, selected_text: "先显示队列" })],
    {
      createdAt: "2026-05-05T10:00:00.000Z",
      projectId: "P-a"
    }
  )[0]!;
  const existing = createQueueJobsFromCutList(
    [item({ cut_list_item_id: "cut-existing", order: 2, selected_text: "已有任务" })],
    {
      createdAt: "2026-05-05T09:00:00.000Z",
      projectId: "P-a"
    }
  )[0]!;
  const submitted = [
    {
      ...optimistic,
      queue_job_id: "CJ20260505-0001",
      clip_list_id: "CL20260505-0001"
    }
  ];

  const next = replaceQueueJobWithSubmittedJobs(
    [optimistic, existing],
    optimistic.queue_job_id,
    submitted
  );

  assert.deepEqual(
    next.map((job) => job.queue_job_id),
    ["CJ20260505-0001", existing.queue_job_id]
  );
  assert.equal(next[0]?.project_id, "P-a");
  assert.equal(next.some((job) => job.queue_job_id === optimistic.queue_job_id), false);
});
