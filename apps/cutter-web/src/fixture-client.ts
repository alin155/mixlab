import type {
  ClipList,
  CutJob,
  CutJobCatalog,
  CutJobSubmission,
  CutterApiClient,
  LocalClip,
  LocalClipCatalog,
  SearchResponse,
  SourceLibraryResponse,
  SourceVideoCard,
  SourceVideoDetail
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
}

function cover(seed: string, tint: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><rect width="640" height="360" fill="#f6f7f9"/><rect y="210" width="640" height="150" fill="#${tint}"/><path d="M46 252h50v-92h56v92h42V124h64v128h48v-74h54v74h60V94h66v158h48v-98h62v98h34v30H46z" fill="#26313d"/><circle cx="540" cy="82" r="52" fill="#ffffff" opacity=".72"/><text x="36" y="326" font-family="Arial, sans-serif" font-size="32" font-weight="700" fill="#ffffff">${seed}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const videos: SourceVideoCard[] = [
  {
    source_video_id: "src-001",
    title: "现金流管理与风险控制",
    duration_ms: 618_000,
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
    cover_url: cover("Cashflow", "6c8fb6"),
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
    description: "管理端维护封面、标签和简介；剪辑端只读浏览和选段。",
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
    full_text:
      "现金流不是利润表的影子。它直接决定企业能不能安全穿过周期。很多企业看起来增长很快，但回款节奏一乱，组织就会被现金压力拖住。所以第一步要看回款节奏，第二步才看利润结构。现金流短片开场可以从这个判断开始。",
    segments: [
      {
        segment_id: "s-001",
        begin_ms: 8_400,
        end_ms: 12_200,
        text: "现金流不是利润表的影子。"
      },
      {
        segment_id: "s-002",
        begin_ms: 12_200,
        end_ms: 17_400,
        text: "它直接决定企业能不能安全穿过周期。"
      },
      {
        segment_id: "s-003",
        begin_ms: 17_400,
        end_ms: 24_800,
        text: "很多企业看起来增长很快，但回款节奏一乱，组织就会被现金压力拖住。"
      },
      {
        segment_id: "s-004",
        begin_ms: 24_800,
        end_ms: 31_000,
        text: "所以第一步要看回款节奏，第二步才看利润结构。"
      },
      {
        segment_id: "s-005",
        begin_ms: 31_000,
        end_ms: 36_200,
        text: "现金流短片开场可以从这个判断开始。"
      }
    ]
  },
  keyframes: {
    keyframes_ms: [8_400, 12_200, 17_400, 24_800, 31_000]
  }
};

const search: SearchResponse = {
  query: "现金流",
  normalized_query: "现金流",
  groups: [
    {
      source_video_id: "src-001",
      title: "现金流管理与风险控制",
      duration_ms: videos[0]!.duration_ms,
      hit_count: 3,
      best_excerpt: "现金流不是利润表的影子，它直接决定企业能不能安全穿过周期。",
      hit_segments: primaryDetail.transcript.segments.slice(0, 3),
      media_url: videos[0]!.media_url,
      cover_url: videos[0]!.cover_url,
      detail_url: videos[0]!.detail_url,
      subtitles_url: videos[0]!.subtitles_url
    },
    {
      source_video_id: "src-002",
      title: "私域直播复盘方法",
      duration_ms: videos[1]!.duration_ms,
      hit_count: 1,
      best_excerpt: "直播复盘先看成交曲线，再回到现金流和投放回收周期。",
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
    }
  ]
};

const localClips: LocalClipCatalog = {
  local_clip_count: 3,
  clips: [
    {
      local_clip_id: "clip-001",
      title: "现金流短片开场",
      source_video_id: "src-001",
      source_title: "现金流管理与风险控制",
      begin_ms: 12_200,
      end_ms: 31_000,
      duration_ms: 18_800,
      selected_text: "它直接决定企业能不能安全穿过周期。很多企业看起来增长很快...",
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
  default_cut_mode: "smart",
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
    settings
  };
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
    async listSourceLibrary() {
      return data.library;
    },
    async getSourceVideoDetail(sourceVideoId: string) {
      return sourceVideoId === data.primaryDetail.source_video_id
        ? data.primaryDetail
        : { ...data.primaryDetail, ...data.library.videos.find((video) => video.source_video_id === sourceVideoId) };
    },
    async searchSourceLibrary(query: string) {
      return {
        ...data.search,
        query,
        normalized_query: query.trim().toLowerCase()
      };
    },
    async listLocalClips() {
      return data.localClips;
    },
    async getLocalClipDetail(localClipId: string) {
      return data.localClips.clips.find((clip) => clip.local_clip_id === localClipId) ?? data.localClips.clips[0]!;
    },
    async createLocalClip(request) {
      return {
        local_clip_id: `clip-${request.source_video_id}-${request.start_segment_id}-${request.end_segment_id}`,
        title: request.title ?? "新剪切片段",
        source_video_id: request.source_video_id,
        source_title: data.primaryDetail.title,
        begin_ms: data.primaryDetail.transcript.segments.find((segment) => segment.segment_id === request.start_segment_id)
          ?.begin_ms,
        end_ms: data.primaryDetail.transcript.segments.find((segment) => segment.segment_id === request.end_segment_id)
          ?.end_ms,
        selected_text: data.primaryDetail.transcript.segments
          .filter(
            (segment) =>
              segment.begin_ms >=
                (data.primaryDetail.transcript.segments.find((candidate) => candidate.segment_id === request.start_segment_id)
                  ?.begin_ms ?? 0) &&
              segment.end_ms <=
                (data.primaryDetail.transcript.segments.find((candidate) => candidate.segment_id === request.end_segment_id)
                  ?.end_ms ?? Number.MAX_SAFE_INTEGER)
          )
          .map((segment) => segment.text)
          .join(" "),
        media_url: "/local-clips/new.mp4",
        detail_url: "/cutter/local-clips/new"
      };
    },
    async createClipList(request): Promise<ClipList> {
      return {
        schema_version: "1.0",
        clip_list_id: "CL20260502-0001",
        library_id: request.library_id,
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
    resolveApiUrl(pathOrUrl: string) {
      return pathOrUrl;
    }
  };
}

export async function loadCutterWorkbenchData(client: CutterApiClient): Promise<CutterFixtureData> {
  const [library, localClips] = await Promise.all([
    client.listSourceLibrary(),
    client.listLocalClips()
  ]);
  const primary = library.videos[0];

  const [primaryDetailResult, searchResult] = await Promise.all([
    primary ? client.getSourceVideoDetail(primary.source_video_id) : Promise.resolve(primaryDetail),
    client.searchSourceLibrary("现金流", 20)
  ]);

  return {
    library,
    primaryDetail: primaryDetailResult,
    search: searchResult,
    localClips,
    settings
  };
}
