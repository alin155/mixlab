import type {
  ClipList,
  CutJob,
  CutJobCatalog,
  CutJobSubmission,
  CutterApiClient,
  CutterRuntimeStatus,
  LocalClip,
  LocalClipCatalog,
  OpenCutOutputDirectoryRequest,
  SearchResponse,
  SourceLibraryResponse,
  SourceVideoCard,
  SourceVideoDetail,
  CreateLocalClipRequest
} from "./api.ts";

export interface CutterWorkbenchSettings {
  public_library_mount: string;
  local_workspace: string;
  ffmpeg_path: string;
  default_cut_mode: "copy" | "smart" | "precise";
  concurrency: number;
  audio_mode: "mp3_16k_mono_64k" | "wav_16k_mono_pcm_s16le";
  doctor: Array<{
    label: string;
    status: "pass" | "warn" | "fail";
    message: string;
  }>;
}

export interface CutterFixtureData {
  library: SourceLibraryResponse;
  primaryDetail: SourceVideoDetail;
  search: SearchResponse;
  localClips: LocalClipCatalog;
  settings: CutterWorkbenchSettings;
  runtimeStatus: CutterRuntimeStatus;
}

export interface LoadCutterWorkbenchDataOptions {
  preferredSourceVideoId?: string;
  includeSourceLibrary?: boolean;
  sourceLibraryLimit?: number;
}

function cover(seed: string, tint: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><rect width="640" height="360" fill="#f6f7f9"/><rect y="210" width="640" height="150" fill="#${tint}"/><path d="M46 252h50v-92h56v92h42V124h64v128h48v-74h54v74h60V94h66v158h48v-98h62v98h34v30H46z" fill="#26313d"/><circle cx="540" cy="82" r="52" fill="#ffffff" opacity=".72"/><text x="36" y="326" font-family="Arial, sans-serif" font-size="32" font-weight="700" fill="#ffffff">${seed}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const cashflowPosterUrl = "/fixture-media/cashflow-cover.png";

const cashflowTranscriptSegments = [
  {
    segment_id: "s-061",
    begin_ms: 705_000,
    end_ms: 718_000,
    text: "我们先看这个月的整体数据，整体流量环比上升了 18%，但利润没有同步增长。"
  },
  {
    segment_id: "s-062",
    begin_ms: 718_000,
    end_ms: 727_000,
    text: "原因其实很简单，投放费用增加了，但回收周期变长了，这直接影响到我们的现金流。"
  },
  {
    segment_id: "s-063",
    begin_ms: 727_000,
    end_ms: 737_000,
    text: "很多团队只看利润，而忽略了现金流的健康度，结果账上赚了钱，实际却缺钱用。"
  },
  {
    segment_id: "s-064",
    begin_ms: 737_000,
    end_ms: 748_000,
    text: "现金流的本质，是在正确的时间点，有足够的现金去支持业务的持续运转。"
  },
  {
    segment_id: "s-065",
    begin_ms: 748_000,
    end_ms: 756_000,
    text: "我们做直播带货，最核心的指标除了 GMV，还有一个就是投放回收周期。"
  },
  {
    segment_id: "s-066",
    begin_ms: 756_000,
    end_ms: 765_000,
    text: "如果回收周期过长，哪怕最终能赚钱，过程中的现金流也会非常紧张，甚至断裂。"
  },
  {
    segment_id: "s-067",
    begin_ms: 765_000,
    end_ms: 774_000,
    text: "所以我们要控制的不是单日 ROI，而是整体的现金流节奏和回收周期。"
  },
  {
    segment_id: "s-068",
    begin_ms: 774_000,
    end_ms: 783_000,
    text: "建议大家把回收周期控制在 7 天以内，这样现金流压力会小很多。"
  },
  {
    segment_id: "s-069",
    begin_ms: 783_000,
    end_ms: 790_000,
    text: "具体怎么做？第一，缩短发货周期，减少用户等待时间。"
  },
  {
    segment_id: "s-070",
    begin_ms: 790_000,
    end_ms: 798_000,
    text: "第二，优化投放结构，把更多预算放在高转化的计划上。"
  },
  {
    segment_id: "s-071",
    begin_ms: 798_000,
    end_ms: 807_000,
    text: "第三，建立稳定的复购和私域，把现金流的来源从单次交易变成持续收入。"
  },
  {
    segment_id: "s-072",
    begin_ms: 807_000,
    end_ms: 816_000,
    text: "我们来看一个案例，这个团队通过优化投放和供应链，把回收周期从 14 天缩短到 6 天。"
  },
  {
    segment_id: "s-073",
    begin_ms: 816_000,
    end_ms: 825_000,
    text: "现金流改善后，他们可以更快地加大投放，形成正向循环，业绩自然就起来了。"
  },
  {
    segment_id: "s-074",
    begin_ms: 825_000,
    end_ms: 835_000,
    text: "总结一下，现金流管理的核心就是：回得快、花得准、控得住。"
  },
  {
    segment_id: "s-075",
    begin_ms: 835_000,
    end_ms: 845_000,
    text: "只要把回收周期跑通，现金流健康了，利润只是时间问题。"
  },
  {
    segment_id: "s-076",
    begin_ms: 845_000,
    end_ms: 858_000,
    text: "下面我们进入互动答疑环节，大家的问题我会一一解答。"
  }
] satisfies SourceVideoDetail["transcript"]["segments"];

const cashflowTranscriptText = cashflowTranscriptSegments.map((segment) => segment.text).join("");

const videos: SourceVideoCard[] = [
  {
    source_video_id: "src-001",
    title: "直播复盘：从流量到现金流健康度",
    duration_ms: 1_935_000,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: "h264",
    file_size: 4_862_000_000,
    relative_path: "经营课/现金流管理与风险控制.mp4",
    description: "由管理端配置的课程说明：适合提取现金流、回款节奏、风险控制类短视频素材。",
    tags: ["经营分析", "现金流", "风险控制"],
    category: "经营课",
    course: "企业经营基本功",
    lecturer: "林老师",
    publish_status: "ready",
    media_url: "/fixture-media/cashflow.mp4",
    cover_url: cashflowPosterUrl,
    detail_url: "/cutter/source-videos/src-001",
    subtitles_url: "/fixture-subtitles/src-001.vtt"
  },
  {
    source_video_id: "src-002",
    title: "私域直播复盘方法",
    duration_ms: 742_000,
    width: 3840,
    height: 2160,
    fps: 30,
    codec: "h265",
    file_size: 8_120_000_000,
    relative_path: "增长课/私域直播复盘方法.mp4",
    description: "管理端维护封面、标签和简介；剪辑端用于浏览和选段。",
    tags: ["私域", "直播复盘", "增长"],
    category: "增长课",
    course: "内容增长实战",
    lecturer: "周老师",
    publish_status: "ready",
    media_url: "/fixture-media/live-review.mp4",
    cover_url: cover("Live Review", "7a9c86"),
    detail_url: "/cutter/source-videos/src-002",
    subtitles_url: "/fixture-subtitles/src-002.vtt"
  },
  {
    source_video_id: "src-003",
    title: "销售话术拆解",
    duration_ms: 494_000,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: "h264",
    file_size: 3_460_000_000,
    relative_path: "销售课/销售话术拆解.mp4",
    description: "适合复用为案例、金句、成交拆解类混剪素材。",
    tags: ["销售", "话术", "案例"],
    category: "销售课",
    course: "成交表达",
    lecturer: "陈老师",
    publish_status: "ready",
    media_url: "/fixture-media/sales-script.mp4",
    cover_url: cover("Sales Script", "9b826f"),
    detail_url: "/cutter/source-videos/src-003",
    subtitles_url: "/fixture-subtitles/src-003.vtt"
  },
  {
    source_video_id: "src-004",
    title: "团队目标对齐会",
    duration_ms: 536_000,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: "h264",
    file_size: 4_050_000_000,
    relative_path: "管理课/团队目标对齐会.mp4",
    description: "适合组织管理、目标拆解、复盘会议主题的视频剪辑。",
    tags: ["管理", "目标", "复盘"],
    category: "管理课",
    course: "团队管理",
    lecturer: "王老师",
    publish_status: "ready",
    media_url: "/fixture-media/team-alignment.mp4",
    cover_url: cover("Team", "6f7f9f"),
    detail_url: "/cutter/source-videos/src-004",
    subtitles_url: "/fixture-subtitles/src-004.vtt"
  },
  {
    source_video_id: "src-005",
    title: "用户访谈问题设计",
    duration_ms: 684_000,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: "h264",
    file_size: 4_840_000_000,
    relative_path: "产品课/用户访谈问题设计.mp4",
    description: "适合剪成需求洞察、用户研究、产品判断类短视频。",
    tags: ["产品", "用户访谈", "洞察"],
    category: "产品课",
    course: "产品经理实战",
    lecturer: "许老师",
    publish_status: "ready",
    media_url: "/fixture-media/user-interview.mp4",
    cover_url: cover("Interview", "8a8f74"),
    detail_url: "/cutter/source-videos/src-005",
    subtitles_url: "/fixture-subtitles/src-005.vtt"
  },
  {
    source_video_id: "src-006",
    title: "短视频开场结构",
    duration_ms: 431_000,
    width: 1920,
    height: 1080,
    fps: 30,
    codec: "h264",
    file_size: 2_920_000_000,
    relative_path: "内容课/短视频开场结构.mp4",
    description: "沉淀可复用的开场模板、反差表达和转折句。",
    tags: ["短视频", "开场", "表达"],
    category: "内容课",
    course: "短视频脚本课",
    lecturer: "何老师",
    publish_status: "ready",
    media_url: "/fixture-media/opening.mp4",
    cover_url: cover("Opening", "738b95"),
    detail_url: "/cutter/source-videos/src-006",
    subtitles_url: "/fixture-subtitles/src-006.vtt"
  },
  {
    source_video_id: "src-007",
    title: "组织成本控制案例",
    duration_ms: 806_000,
    width: 3840,
    height: 2160,
    fps: 30,
    codec: "h265",
    file_size: 9_330_000_000,
    relative_path: "经营课/组织成本控制案例.mp4",
    description: "可剪为降本增效、组织效率、预算管理等主题。",
    tags: ["组织", "成本", "预算"],
    category: "经营课",
    course: "经营决策课",
    lecturer: "林老师",
    publish_status: "ready",
    media_url: "/fixture-media/cost-control.mp4",
    cover_url: cover("Cost", "8c7a96"),
    detail_url: "/cutter/source-videos/src-007",
    subtitles_url: "/fixture-subtitles/src-007.vtt"
  },
  {
    source_video_id: "src-008",
    title: "品牌故事表达",
    duration_ms: 577_000,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: "h264",
    file_size: 4_210_000_000,
    relative_path: "品牌课/品牌故事表达.mp4",
    description: "用于品牌口播、创始人故事、价值主张类混剪。",
    tags: ["品牌", "故事", "口播"],
    category: "品牌课",
    course: "品牌表达",
    lecturer: "苏老师",
    publish_status: "ready",
    media_url: "/fixture-media/brand-story.mp4",
    cover_url: cover("Brand", "637f88"),
    detail_url: "/cutter/source-videos/src-008",
    subtitles_url: "/fixture-subtitles/src-008.vtt"
  }
];

const primaryDetail: SourceVideoDetail = {
  ...videos[0]!,
  transcript: {
    full_text: cashflowTranscriptText,
    segments: cashflowTranscriptSegments
  },
  keyframes: {
    keyframes_ms: cashflowTranscriptSegments.map((segment) => segment.begin_ms)
  }
};

function fixtureSegmentsForRequest(request: CreateLocalClipRequest): SourceVideoDetail["transcript"]["segments"] {
  const segments = primaryDetail.transcript.segments;
  const startIndex = segments.findIndex((segment) => segment.segment_id === request.start_segment_id);
  const endIndex = segments.findIndex((segment) => segment.segment_id === request.end_segment_id);

  if (startIndex < 0 || endIndex < 0) {
    return [];
  }

  const [from, to] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
  return segments.slice(from, to + 1);
}

function fixtureLocalClipFromRequest(request: CreateLocalClipRequest): LocalClip {
  const segments = fixtureSegmentsForRequest(request);
  const first = segments[0];
  const last = segments[segments.length - 1];
  const selectionBeginMs = typeof request.begin_ms === "number"
    ? request.begin_ms
    : first?.begin_ms ?? 0;
  const selectionEndMs = typeof request.end_ms === "number"
    ? request.end_ms
    : last?.end_ms ?? selectionBeginMs;
  const beginMs = Math.max(0, selectionBeginMs - (request.pre_roll_ms ?? 0));
  const endMs = Math.max(beginMs, selectionEndMs + (request.post_roll_ms ?? 0));
  const selectionOffsetBeginMs = Math.max(0, selectionBeginMs - beginMs);
  const selectionOffsetEndMs = Math.min(endMs - beginMs, Math.max(selectionOffsetBeginMs, selectionEndMs - beginMs));
  const selectedText = request.selected_text?.trim() ||
    segments.map((segment) => segment.text).join(" ");
  const localClipId = `clip-${request.source_video_id}-${request.start_segment_id}-${request.end_segment_id}`;

  return {
    local_clip_id: localClipId,
    title: request.title ?? "新剪切片段",
    source_video_id: request.source_video_id,
    source_title: primaryDetail.title,
    begin_ms: beginMs,
    end_ms: endMs,
    duration_ms: endMs - beginMs,
    selected_text: selectedText,
    transcript_segments: selectedText
      ? [
          {
            segment_id: `${localClipId}-S000001`,
            begin_ms: selectionOffsetBeginMs,
            end_ms: selectionOffsetEndMs,
            text: selectedText
          }
        ]
      : [],
    media_url: "/local-clips/new.mp4",
    detail_url: "/cutter/local-clips/new"
  };
}

const search: SearchResponse = {
  query: "现金流",
  normalized_query: "现金流",
  groups: [
    {
      source_video_id: "src-001",
      title: "直播复盘：从流量到现金流健康度",
      duration_ms: videos[0]!.duration_ms,
      hit_count: 8,
      best_excerpt: "现金流的本质，是在正确的时间点，有足够的现金去支持业务的持续运转。",
      hit_segments: primaryDetail.transcript.segments
        .filter((segment) => segment.text.includes("现金流"))
        .map((segment, index) => ({
          ...segment,
          match_id: `cashflow-${String(index + 1).padStart(3, "0")}`
        })),
      transcript_character_count: primaryDetail.transcript.full_text.replace(/\s+/g, "").length,
      media_url: videos[0]!.media_url,
      cover_url: videos[0]!.cover_url,
      detail_url: videos[0]!.detail_url,
      subtitles_url: videos[0]!.subtitles_url
    },
    {
      source_video_id: "src-004",
      title: "投放复盘：ROI 与现金流管理实战",
      duration_ms: videos[3]!.duration_ms,
      hit_count: 4,
      best_excerpt: "投放不是只看 ROI，还要看现金流压力和回款节奏。",
      transcript_character_count: 14_575,
      hit_segments: [
        {
          segment_id: "team-021",
          begin_ms: 47_000,
          end_ms: 54_400,
          text: "投放不是只看 ROI，还要看现金流压力和回款节奏。"
        },
        {
          segment_id: "team-022",
          begin_ms: 54_400,
          end_ms: 61_200,
          text: "现金流越稳定，团队越敢在正确的时候加预算。"
        }
      ],
      media_url: videos[3]!.media_url,
      cover_url: videos[3]!.cover_url,
      detail_url: videos[3]!.detail_url,
      subtitles_url: videos[3]!.subtitles_url
    },
    {
      source_video_id: "src-007",
      title: "组织成本控制与现金流案例",
      duration_ms: videos[6]!.duration_ms,
      hit_count: 3,
      best_excerpt: "成本控制的目标不是少花钱，而是让现金流支撑更长的经营周期。",
      transcript_character_count: 19_032,
      hit_segments: [
        {
          segment_id: "cost-014",
          begin_ms: 91_000,
          end_ms: 99_800,
          text: "成本控制的目标不是少花钱，而是让现金流支撑更长的经营周期。"
        }
      ],
      media_url: videos[6]!.media_url,
      cover_url: videos[6]!.cover_url,
      detail_url: videos[6]!.detail_url,
      subtitles_url: videos[6]!.subtitles_url
    },
    {
      source_video_id: "src-002",
      title: "私域直播复盘方法",
      duration_ms: videos[1]!.duration_ms,
      hit_count: 1,
      best_excerpt: "直播复盘先看成交曲线，再回到现金流和投放回收周期。",
      transcript_character_count: "直播复盘先看成交曲线，再回到现金流和投放回收周期。".replace(/\s+/g, "").length,
      hit_segments: [
        {
          segment_id: "l-003",
          begin_ms: 86_000,
          end_ms: 94_400,
          text: "直播复盘先看成交曲线，再回到现金流和投放回收周期。"
        }
      ],
      media_url: videos[1]!.media_url,
      cover_url: videos[1]!.cover_url,
      detail_url: videos[1]!.detail_url,
      subtitles_url: videos[1]!.subtitles_url
    },
    {
      source_video_id: "src-005",
      title: "企业运营与现金流管理实战",
      duration_ms: videos[4]!.duration_ms,
      hit_count: 2,
      best_excerpt: "运营动作最终要回到现金流，否则增长只是账面热闹。",
      transcript_character_count: 22_114,
      hit_segments: [
        {
          segment_id: "ops-031",
          begin_ms: 128_000,
          end_ms: 135_000,
          text: "运营动作最终要回到现金流，否则增长只是账面热闹。"
        }
      ],
      media_url: videos[4]!.media_url,
      cover_url: videos[4]!.cover_url,
      detail_url: videos[4]!.detail_url,
      subtitles_url: videos[4]!.subtitles_url
    }
  ]
};

const localClips: LocalClipCatalog = {
  local_clip_count: 3,
  clips: [
    {
      local_clip_id: "clip-001",
      title: "直播复盘：从流量到现金流健康度",
      source_video_id: "src-001",
      source_title: "直播复盘：从流量到现金流健康度",
      begin_ms: 748_280,
      end_ms: 766_280,
      duration_ms: 1_935_000,
      width: 1920,
      height: 1080,
      selected_text: cashflowTranscriptSegments.slice(4, 9).map((segment) => segment.text).join(""),
      transcript_segments: cashflowTranscriptSegments,
      cover_url: videos[0]!.cover_url,
      media_url: "/local-clips/clip-001.mp4",
      detail_url: "/cutter/local-clips/clip-001"
    },
    {
      local_clip_id: "clip-002",
      title: "复盘方法三步",
      source_video_id: "src-002",
      source_title: "私域直播复盘方法",
      begin_ms: 42_000,
      end_ms: 58_500,
      duration_ms: 16_500,
      selected_text: "先看场观，再看互动，最后看成交转化。",
      media_url: "/local-clips/clip-002.mp4",
      detail_url: "/cutter/local-clips/clip-002"
    },
    {
      local_clip_id: "clip-003",
      title: "销售异议处理",
      source_video_id: "src-003",
      source_title: "销售话术拆解",
      begin_ms: 102_000,
      end_ms: 121_000,
      duration_ms: 19_000,
      selected_text: "客户说贵的时候，先确认他比较的是价格还是风险。",
      media_url: "/local-clips/clip-003.mp4",
      detail_url: "/cutter/local-clips/clip-003"
    }
  ]
};

const settings: CutterWorkbenchSettings = {
  public_library_mount: "/Volumes/PublicLibrary",
  local_workspace: "/Users/allen/Movies/MixLabLocal",
  ffmpeg_path: "/opt/homebrew/bin/ffmpeg",
  default_cut_mode: "copy",
  concurrency: 2,
  audio_mode: "mp3_16k_mono_64k",
  doctor: [
    {
      label: "公共素材库挂载",
      status: "pass",
      message: "current.json 可读取，只暴露 ready 素材"
    },
    {
      label: "本地工作区",
      status: "pass",
      message: "cut-list 与 local-clips 可写"
    },
    {
      label: "FFmpeg",
      status: "pass",
      message: "已发现可执行文件"
    }
  ]
};

const runtimeStatus: CutterRuntimeStatus = {
  mode: "fixture",
  mode_label: "界面演示模式",
  api_ready: true,
  generated_at: "2026-05-04T10:00:00.000Z",
  library_id: "fixture",
  library_root_label: "演示素材库",
  available_video_count: videos.length,
  workspace_enabled: true,
  workspace_root_label: "演示本地工作区",
  local_clip_count: localClips.local_clip_count,
  ffmpeg_status: "可用",
  ffmpeg_source: "内置",
  local_runtime: {
    cpu_usage_percent: 27,
    disk_io_bytes_per_second: 68 * 1024 * 1024
  },
  search_backend: {
    mode: "sqlite-index",
    preferred_mode: "sqlite-index",
    label: "本地索引",
    healthy: true,
    degraded: false,
    index_version: "fixture",
    source_video_count: videos.length,
    segment_count: cashflowTranscriptSegments.length,
    response_ms: 4,
    message: "Fixture SQLite 搜索索引可用"
  },
  current_user: {
    user_id: "fixture",
    username: "演示剪辑师",
    display_name: "演示剪辑师"
  }
};

export function createFixtureCutterData(): CutterFixtureData {
  return {
    library: {
      library_id: "lib_main_001",
      available_video_count: videos.length,
      videos
    },
    primaryDetail,
    search,
    localClips,
    settings,
    runtimeStatus
  };
}

export function emptySearchResponse(query = ""): SearchResponse {
  return {
    query,
    normalized_query: query.trim().toLowerCase(),
    groups: []
  };
}

function searchGroupText(group: SearchResponse["groups"][number]): string {
  return [
    group.title,
    group.best_excerpt,
    ...group.hit_segments.map((segment) => segment.text)
  ].filter(Boolean).join(" ");
}

function fixtureSearchCursor(offset: number): string {
  return offset > 0 ? `sqlite:${offset}` : "";
}

function fixtureSearchOffset(cursor?: string): number {
  const normalized = cursor?.trim();
  if (!normalized) {
    return 0;
  }

  const offsetText = normalized.startsWith("sqlite:")
    ? normalized.slice("sqlite:".length)
    : normalized;
  const offset = Number.parseInt(offsetText, 10);
  if (!Number.isInteger(offset) || offset < 0 || String(offset) !== offsetText) {
    throw new Error("invalid_search_cursor");
  }

  return offset;
}

export function createFixtureCutterApiClient(): CutterApiClient {
  const data = createFixtureCutterData();

  return {
    async requestLogin(request) {
      return {
        user: {
          user_id: "CU000001",
          username: request.username,
          display_name: request.username,
          status: "approved",
          applied_at: "2026-05-02T10:00:00Z",
          approved_at: "2026-05-02T10:00:00Z",
          rejected_at: "",
          disabled_at: "",
          last_login_at: "2026-05-02T10:00:00Z",
          last_used_at: "",
          note: "",
          devices: [
            {
              device_id: request.device_id,
              device_name: request.device_name,
              status: "active",
              first_seen_at: "2026-05-02T10:00:00Z",
              last_login_at: "2026-05-02T10:00:00Z"
            }
          ]
        },
        session: {
          user_id: "CU000001",
          device_id: request.device_id,
          session_token: "fixture-session",
          created_at: "2026-05-02T10:00:00Z",
          last_seen_at: "2026-05-02T10:00:00Z"
        }
      };
    },
    async getAuthMode() {
      return {
        auth_mode: "reviewed",
        local_trusted: false,
        trusted_username: ""
      };
    },
    async getLoginStatus() {
      return {
        ok: true,
        user: {
          user_id: "CU000001",
          username: "fixture-user",
          display_name: "fixture-user",
          status: "approved",
          applied_at: "2026-05-02T10:00:00Z",
          approved_at: "2026-05-02T10:00:00Z",
          rejected_at: "",
          disabled_at: "",
          last_login_at: "2026-05-02T10:00:00Z",
          last_used_at: "",
          note: "",
          devices: [
            {
              device_id: "fixture-device",
              device_name: "Fixture Device",
              status: "active",
              first_seen_at: "2026-05-02T10:00:00Z",
              last_login_at: "2026-05-02T10:00:00Z"
            }
          ]
        }
      };
    },
    async getRuntimeStatus() {
      return data.runtimeStatus;
    },
    async listSourceLibrary() {
      return data.library;
    },
    async getSourceVideoDetail(sourceVideoId: string) {
      return sourceVideoId === data.primaryDetail.source_video_id
        ? data.primaryDetail
        : { ...data.primaryDetail, ...data.library.videos.find((video) => video.source_video_id === sourceVideoId) };
    },
    async searchSourceLibrary(query: string, limit = 20, options: { cursor?: string } = {}) {
      const normalizedQuery = query.trim().toLowerCase();
      if (!normalizedQuery) {
        return emptySearchResponse(query);
      }

      const filteredGroups = data.search.groups.filter((group) =>
        searchGroupText(group).toLowerCase().includes(normalizedQuery)
      );
      const offset = fixtureSearchOffset(options.cursor);
      const groups = filteredGroups.slice(offset, offset + limit);
      return {
        ...data.search,
        query,
        normalized_query: normalizedQuery,
        groups,
        cursor: fixtureSearchCursor(offset),
        next_cursor:
          offset + limit < filteredGroups.length
            ? fixtureSearchCursor(offset + limit)
            : "",
        has_more: offset + limit < filteredGroups.length,
        returned_count: groups.length,
        limit,
        index_version: "fixture",
        search_ms: 1,
        search_mode: "sqlite-index"
      };
    },
    async listLocalClips() {
      return data.localClips;
    },
    async getLocalClipDetail(localClipId: string) {
      return data.localClips.clips.find((clip) => clip.local_clip_id === localClipId) ?? data.localClips.clips[0]!;
    },
    async createLocalClip(request) {
      return fixtureLocalClipFromRequest(request);
    },
    async createClipList(request): Promise<ClipList> {
      return {
        schema_version: "1.0",
        clip_list_id: "CL20260502-0001",
        library_id: request.library_id,
        ...(request.project_id ? { project_id: request.project_id } : {}),
        title: request.title,
        item_count: request.items.length,
        created_at: "2026-05-02T10:00:00Z",
        updated_at: "2026-05-02T10:00:00Z",
        items: request.items.map((item, index) => ({
          ...item,
          item_id: `CLI${String(index + 1).padStart(6, "0")}`,
          order: index + 1,
          pre_roll_ms: item.pre_roll_ms ?? 0,
          post_roll_ms: item.post_roll_ms ?? 0
        }))
      };
    },
    async submitCutJobs(request): Promise<CutJobSubmission> {
      return {
        submitted_count: 1,
        jobs: [
          {
            cut_job_id: "CJ20260502-0001",
            clip_list_id: request.clip_list_id,
            clip_list_item_id: "CLI000001",
            status: "pending",
            created_at: "2026-05-02T10:00:00Z",
            updated_at: "2026-05-02T10:00:00Z"
          }
        ]
      };
    },
    async listCutJobs(): Promise<CutJobCatalog> {
      return {
        job_count: 3,
        jobs: [
          {
            cut_job_id: "CJ20260502-0003",
            clip_list_id: "CL20260502-0001",
            clip_list_item_id: "CLI000003",
            status: "done",
            export_clip_id: "E000003",
            output_file: "export-clips/E000003/E000003_销售话术拆解.mp4",
            created_at: "2026-05-02T10:10:00Z",
            updated_at: "2026-05-02T10:15:00Z"
          },
          {
            cut_job_id: "CJ20260502-0002",
            clip_list_id: "CL20260502-0001",
            clip_list_item_id: "CLI000002",
            status: "running",
            created_at: "2026-05-02T10:05:00Z",
            updated_at: "2026-05-02T10:12:00Z"
          },
          {
            cut_job_id: "CJ20260502-0001",
            clip_list_id: "CL20260502-0001",
            clip_list_item_id: "CLI000001",
            status: "failed",
            error_message: "示例失败：源片段需要重新导出",
            created_at: "2026-05-02T10:00:00Z",
            updated_at: "2026-05-02T10:02:00Z"
          }
        ]
      };
    },
    async runNextCutJob(): Promise<CutJob | null> {
      return {
        cut_job_id: "CJ20260502-0002",
        clip_list_id: "CL20260502-0001",
        clip_list_item_id: "CLI000002",
        status: "done",
        export_clip_id: "E000002",
        output_file: "export-clips/E000002/E000002_现金流，是企业的血液.mp4",
        created_at: "2026-05-02T10:05:00Z",
        updated_at: "2026-05-02T10:16:00Z"
      };
    },
    async retryCutJob(cutJobId: string): Promise<CutJob> {
      return {
        cut_job_id: cutJobId,
        clip_list_id: "CL20260502-0001",
        clip_list_item_id: "CLI000001",
        status: "pending",
        created_at: "2026-05-02T10:00:00Z",
        updated_at: "2026-05-02T10:17:00Z"
      };
    },
    async openCutOutputDirectory(request?: OpenCutOutputDirectoryRequest) {
      return {
        path: request?.project_title
          ? `/fixture-workspace/projects/${request.project_title}`
          : "/fixture-workspace/export-clips"
      };
    },
    async deleteProjectOutputs(projectId: string) {
      return {
        project_id: projectId,
        removed_export_clips: 0,
        removed_local_clips: 0,
        removed_project_outputs: 0,
        removed_cut_jobs: 0,
        removed_clip_lists: 0
      };
    },
    resolveApiUrl(pathOrUrl: string) {
      return pathOrUrl;
    }
  };
}

function resolveClientApiUrl(client: CutterApiClient, pathOrUrl: string): string {
  if (/^(?:https?:\/\/|data:|blob:)/.test(pathOrUrl)) {
    return pathOrUrl;
  }

  return client.resolveApiUrl(pathOrUrl);
}

export function resolveSourceVideoCardUrls<T extends SourceVideoCard>(
  client: CutterApiClient,
  card: T
): T {
  return {
    ...card,
    media_url: resolveClientApiUrl(client, card.media_url),
    cover_url: resolveClientApiUrl(client, card.cover_url),
    detail_url: resolveClientApiUrl(client, card.detail_url),
    subtitles_url: resolveClientApiUrl(client, card.subtitles_url)
  };
}

export function resolveSourceVideoDetailUrls(
  client: CutterApiClient,
  detail: SourceVideoDetail
): SourceVideoDetail {
  return resolveSourceVideoCardUrls(client, detail);
}

function resolveSearchGroupUrls(
  client: CutterApiClient,
  group: SearchResponse["groups"][number]
): SearchResponse["groups"][number] {
  return {
    ...group,
    ...(group.media_url ? { media_url: resolveClientApiUrl(client, group.media_url) } : {}),
    ...(group.cover_url ? { cover_url: resolveClientApiUrl(client, group.cover_url) } : {}),
    ...(group.detail_url ? { detail_url: resolveClientApiUrl(client, group.detail_url) } : {}),
    ...(group.subtitles_url ? { subtitles_url: resolveClientApiUrl(client, group.subtitles_url) } : {})
  };
}

export function resolveSearchResponseUrls(
  client: CutterApiClient,
  searchResult: SearchResponse
): SearchResponse {
  return {
    ...searchResult,
    groups: searchResult.groups.map((group) => resolveSearchGroupUrls(client, group))
  };
}

export function resolveLocalClipUrls(client: CutterApiClient, clip: LocalClip): LocalClip {
  return {
    ...clip,
    media_url: resolveClientApiUrl(client, clip.media_url),
    detail_url: resolveClientApiUrl(client, clip.detail_url),
    ...(clip.cover_url ? { cover_url: resolveClientApiUrl(client, clip.cover_url) } : {}),
    ...(clip.subtitles_url ? { subtitles_url: resolveClientApiUrl(client, clip.subtitles_url) } : {})
  };
}

function settingsFromRuntimeStatus(runtimeStatusResult: CutterRuntimeStatus): CutterWorkbenchSettings {
  if (runtimeStatusResult.mode !== "api") {
    return settings;
  }

  return {
    ...settings,
    public_library_mount:
      runtimeStatusResult.library_root_path?.trim() ||
      runtimeStatusResult.library_root_label ||
      settings.public_library_mount,
    local_workspace:
      runtimeStatusResult.workspace_root_path?.trim() ||
      (runtimeStatusResult.workspace_enabled
        ? runtimeStatusResult.workspace_root_label
        : "未启用本地工作区"),
    ffmpeg_path:
      runtimeStatusResult.ffmpeg_source === "环境配置"
        ? "系统环境配置"
        : runtimeStatusResult.ffmpeg_source === "内置"
          ? "内置剪切工具"
          : "未检测到"
  };
}

export async function loadCutterWorkbenchData(
  client: CutterApiClient,
  options: LoadCutterWorkbenchDataOptions = {}
): Promise<CutterFixtureData> {
  const includeSourceLibrary = options.includeSourceLibrary ?? true;
  const [localClipsResult, runtimeStatusResult, libraryResult] = await Promise.all([
    client.listLocalClips(),
    client.getRuntimeStatus(),
    includeSourceLibrary
      ? client.listSourceLibrary({ limit: options.sourceLibraryLimit })
      : Promise.resolve(undefined)
  ]);
  const resolvedLibraryResult = libraryResult ?? {
    library_id: runtimeStatusResult.library_id,
    available_video_count: runtimeStatusResult.available_video_count,
    videos: []
  };
  const library = {
    ...resolvedLibraryResult,
    videos: resolvedLibraryResult.videos.map((video) => resolveSourceVideoCardUrls(client, video))
  };
  const localClips = {
    ...localClipsResult,
    clips: localClipsResult.clips.map((clip) => resolveLocalClipUrls(client, clip))
  };
  const primaryDetailResult = options.preferredSourceVideoId
    ? await client.getSourceVideoDetail(options.preferredSourceVideoId)
    : primaryDetail;

  return {
    library,
    primaryDetail: resolveSourceVideoDetailUrls(client, primaryDetailResult),
    search: emptySearchResponse(),
    localClips,
    settings: settingsFromRuntimeStatus(runtimeStatusResult),
    runtimeStatus: runtimeStatusResult
  };
}
