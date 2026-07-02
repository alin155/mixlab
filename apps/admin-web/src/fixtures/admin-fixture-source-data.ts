import type {
  AdminPreprocessJobsResponse,
  AdminPreprocessProcessHistoryResponse,
  AdminSourceVideo
} from "../api.ts";

const ADMIN_PREPROCESS_PROCESS_HISTORY_DEFAULT_LOAD_LIMIT = 20;

function cover(seed: string, tint: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="%23f5f6f8"/><rect y="98" width="320" height="82" fill="%23${tint}"/><path d="M28 122h24V78h26v44h18V60h30v62h22V88h24v34h25V48h31v74h20V82h25v40h28v15H28z" fill="%23262f3a"/><circle cx="266" cy="48" r="24" fill="%23ffffff" opacity=".68"/><text x="18" y="164" font-family="Arial" font-size="19" fill="%23ffffff">${seed}</text></svg>`;
  return `data:image/svg+xml,${svg}`;
}

export const sourceVideos: AdminSourceVideo[] = [
  {
    source_video_id: "V000043",
    title: "现金流课程片段",
    file_name: "现金流课程片段.mp4",
    relative_path: "source-videos/2024/05/现金流课程片段.mp4",
    cover_url: cover("V43", "9bb8d6"),
    duration_ms: 3_374_000,
    file_size: 2_420_000_000,
    preprocess_status: "processing",
    visible_to_cutters: false,
    tags: ["财务", "现金流"],
    description: "正在生成关键帧，未对剪辑师可见。",
    lecturer: "李明",
    course: "企业现金流",
    category: "公开课",
    updated_at: "2024-05-07 10:24:18"
  },
  {
    source_video_id: "V000042",
    title: "现金流管理与风险控制",
    file_name: "现金流管理与风险控制.mp4",
    relative_path: "source-videos/2024/05/现金流管理与风险控制.mp4",
    cover_url: cover("V42", "86a98b"),
    duration_ms: 3_374_000,
    file_size: 2_110_000_000,
    preprocess_status: "ready",
    visible_to_cutters: true,
    tags: ["财务", "风险控制"],
    description: "现金流安全边界、预算节奏和经营风险控制。",
    lecturer: "李明",
    course: "企业现金流",
    category: "公开课",
    updated_at: "2024-05-07 10:22:07"
  },
  {
    source_video_id: "V000041",
    title: "利润增长的估价优化",
    file_name: "利润增长估价优化.mp4",
    relative_path: "source-videos/2024/05/利润增长估价优化.mp4",
    cover_url: cover("V41", "d8b16f"),
    duration_ms: 4_329_000,
    file_size: 2_870_000_000,
    preprocess_status: "ready",
    visible_to_cutters: true,
    tags: ["利润", "估价"],
    description: "利润结构、毛利改善和估价模型说明。",
    lecturer: "孙悦",
    course: "增长模型",
    category: "经营课",
    updated_at: "2024-05-07 10:20:13"
  },
  {
    source_video_id: "V000039",
    title: "组织复制方法",
    file_name: "组织复制方法.mp4",
    relative_path: "source-videos/2024/05/组织复制方法.mp4",
    cover_url: cover("V39", "b0a2cb"),
    duration_ms: 2_821_000,
    file_size: 1_760_000_000,
    preprocess_status: "index-required",
    visible_to_cutters: false,
    tags: ["组织", "流程"],
    description: "文案已完成，等待索引发布后才可见。",
    lecturer: "周航",
    course: "组织复制",
    category: "管理课",
    updated_at: "2024-05-07 10:16:44"
  },
  {
    source_video_id: "V000037",
    title: "客户筛选与品牌定价",
    file_name: "客户筛选与品牌定价.mp4",
    relative_path: "source-videos/2024/05/客户筛选与品牌定价.mp4",
    cover_url: cover("V37", "c79f8d"),
    duration_ms: 2_295_000,
    file_size: 1_280_000_000,
    preprocess_status: "failed",
    visible_to_cutters: false,
    tags: ["客户", "定价"],
    description: "ASR 返回错误，等待管理员重试。",
    lecturer: "林青",
    course: "品牌定价",
    category: "营销课",
    error_stage: "asr",
    error_message: "DashScope ASR 网络超时",
    updated_at: "2024-05-07 10:12:51"
  },
  {
    source_video_id: "V000044",
    title: "人工智能商业落地",
    file_name: "人工智能商业落地.mp4",
    relative_path: "source-videos/2024/05/人工智能商业落地.mp4",
    cover_url: cover("V44", "95b9a8"),
    duration_ms: 0,
    file_size: 1_920_000_000,
    preprocess_status: "unprocessed",
    visible_to_cutters: false,
    tags: ["AI", "商业"],
    description: "新扫描素材，尚未预处理。",
    lecturer: "王然",
    course: "AI 商业化",
    category: "公开课",
    updated_at: "2024-05-07 10:27:03"
  }
];

export const jobs: AdminPreprocessJobsResponse = {
  active_count: 1,
  queued_count: 2,
  completed_count: 3,
  failed_count: 1,
  supervisor: {
    state: "running",
    state_label: "运行中",
    worker_id: "admin-worker-5174",
    started_at: "2024-05-07 10:24:18",
    stopped_at: "",
    last_error: "",
    stop_requested: false,
    last_result: {
      total_claimed_count: 2,
      succeeded_count: 1,
      failed_count: 1
    }
  },
  jobs: [
    {
      job_id: "J000043",
      source_video_id: "V000043",
      title: "现金流课程片段",
      status: "running",
      status_label: "正在处理",
      stage: "build-keyframes",
      stage_label: "生成关键帧",
      progress: 65,
      started_at: "2024-05-07 10:24:18",
      elapsed_ms: 272_000,
      estimated_remaining_ms: 268_000,
      estimated_start_at: "2024-05-07 10:24:18",
      estimated_done_at: "2024-05-07 10:33:18",
      queue_position: 0,
      log_path: ".mixlab-library/logs/V000043.log",
      retryable: false
    },
    {
      job_id: "J000044",
      source_video_id: "V000044",
      title: "人工智能商业落地",
      status: "queued",
      status_label: "等待处理",
      stage: "extract-audio",
      stage_label: "等待处理",
      progress: 0,
      elapsed_ms: 0,
      estimated_remaining_ms: 540_000,
      estimated_start_at: "2024-05-07 10:33:18",
      estimated_done_at: "2024-05-07 10:42:18",
      queue_position: 1,
      log_path: ".mixlab-library/logs/V000044.log",
      retryable: false
    },
    {
      job_id: "J000037",
      source_video_id: "V000037",
      title: "客户筛选与品牌定价",
      status: "failed",
      status_label: "长任务语音识别待处理",
      stage: "asr",
      stage_label: "语音识别",
      progress: 0,
      failed_at: "2024-05-07 10:18:20",
      elapsed_ms: 38_000,
      estimated_remaining_ms: 0,
      estimated_start_at: "",
      estimated_done_at: "",
      queue_position: 0,
      log_path: ".mixlab-library/logs/V000037.log",
      retryable: true,
      failure_kind: "asr-timeout",
      failure_label: "语音识别等待超时",
      recommended_action: "long-asr",
      long_task_recommended: true,
      error_message: "DashScope ASR 网络超时"
    },
    {
      job_id: "J000042",
      source_video_id: "V000042",
      title: "现金流管理与风险控制",
      status: "done",
      status_label: "已完成",
      stage: "publish-ready",
      stage_label: "发布可用产物",
      progress: 100,
      completed_at: "2024-05-07 10:23:02",
      elapsed_ms: 468_000,
      estimated_remaining_ms: 0,
      estimated_start_at: "",
      estimated_done_at: "2024-05-07 10:23:02",
      queue_position: 0,
      log_path: ".mixlab-library/logs/V000042.log",
      retryable: false
    },
    {
      job_id: "J000041",
      source_video_id: "V000041",
      title: "利润增长的估价优化",
      status: "done",
      status_label: "已完成",
      stage: "publish-ready",
      stage_label: "发布可用产物",
      progress: 100,
      completed_at: "2024-05-07 10:25:40",
      elapsed_ms: 655_000,
      estimated_remaining_ms: 0,
      estimated_start_at: "",
      estimated_done_at: "2024-05-07 10:25:40",
      queue_position: 0,
      log_path: ".mixlab-library/logs/V000041.log",
      retryable: false
    }
  ],
  observability: {
    running_job_id: "J000043",
    running_source_video_id: "V000043",
    pipeline_progress_percent: 46,
    estimated_all_done_at: "2024-05-07 10:42:18",
    estimated_queue_duration_ms: 1_078_000,
    throughput_label: "预计 17:58 完成当前队列",
    load_advice: "运行负荷正常，可以继续处理"
  }
};

export const processHistory: AdminPreprocessProcessHistoryResponse = {
  schema_version: "1.0",
  generated_at: "2024-05-07T10:31:00.000Z",
  library_updated_at: "2024-05-07T10:30:00.000Z",
  data_source: "admin-read-model",
  actual_data_source: "admin-read-model",
  cache_status: "hit",
  scan_mode: "no-scan",
  scan_reason: "route-owned-page",
  history_available: true,
  window_days: 30,
  limit: ADMIN_PREPROCESS_PROCESS_HISTORY_DEFAULT_LOAD_LIMIT,
  filters: {
    source_folder_name: "",
    preprocess_status: "",
    event_type: ""
  },
  filter_options: {
    source_folder_names: ["默认素材来源"],
    preprocess_statuses: ["processing", "ready", "failed"],
    event_types: ["failed", "indexed", "claimed"]
  },
  summary: {
    returned_count: 4,
    completed_count: 2,
    failed_count: 1,
    active_count: 1,
    average_process_ms: 561_500,
    tracked_count: 4,
    tracked_completed_count: 2,
    tracked_failed_count: 1,
    tracked_active_count: 1,
    tracked_average_process_ms: 561_500,
    window_start_at: "2024-04-07T10:31:00.000Z",
    newest_event_at: "2024-05-07T10:26:10.000Z",
    oldest_event_at: "2024-05-07T10:18:22.000Z",
    status_counts: {
      unprocessed: 0,
      queued: 0,
      processing: 1,
      ready: 2,
      failed: 1,
      "index-required": 0
    },
    event_counts: {
      failed: 1,
      indexed: 2,
      completed: 0,
      claimed: 1,
      status: 0
    },
    source_folder_summaries: [
      {
        source_folder_name: "默认素材来源",
        tracked_count: 4,
        completed_count: 2,
        failed_count: 1,
        active_count: 1,
        average_process_ms: 561_500,
        newest_event_at: "2024-05-07T10:26:10.000Z"
      }
    ],
    daily_trend: [
      {
        date: "2024-05-07",
        tracked_count: 4,
        completed_count: 2,
        failed_count: 1,
        active_count: 1,
        average_process_ms: 561_500
      }
    ]
  },
  items: [
    {
      source_video_id: "V000043",
      title: "现金流课程片段",
      preprocess_status: "processing",
      source_folder_name: "默认素材来源",
      visible_to_cutters: false,
      claimed_at: "2024-05-07T10:24:18.000Z",
      completed_at: "",
      indexed_at: "",
      failed_at: "",
      last_event_at: "2024-05-07T10:24:18.000Z",
      last_event_type: "claimed",
      elapsed_ms: 272_000
    },
    {
      source_video_id: "V000041",
      title: "利润增长的估价优化",
      preprocess_status: "ready",
      source_folder_name: "默认素材来源",
      visible_to_cutters: true,
      claimed_at: "2024-05-07T10:14:45.000Z",
      completed_at: "2024-05-07T10:25:40.000Z",
      indexed_at: "2024-05-07T10:26:10.000Z",
      failed_at: "",
      last_event_at: "2024-05-07T10:26:10.000Z",
      last_event_type: "indexed",
      elapsed_ms: 655_000
    },
    {
      source_video_id: "V000042",
      title: "现金流管理与风险控制",
      preprocess_status: "ready",
      source_folder_name: "默认素材来源",
      visible_to_cutters: true,
      claimed_at: "2024-05-07T10:15:14.000Z",
      completed_at: "2024-05-07T10:23:02.000Z",
      indexed_at: "2024-05-07T10:23:30.000Z",
      failed_at: "",
      last_event_at: "2024-05-07T10:23:30.000Z",
      last_event_type: "indexed",
      elapsed_ms: 468_000
    },
    {
      source_video_id: "V000037",
      title: "客户筛选与品牌定价",
      preprocess_status: "failed",
      source_folder_name: "默认素材来源",
      visible_to_cutters: false,
      claimed_at: "2024-05-07T10:17:42.000Z",
      completed_at: "",
      indexed_at: "",
      failed_at: "2024-05-07T10:18:20.000Z",
      last_event_at: "2024-05-07T10:18:20.000Z",
      last_event_type: "failed",
      elapsed_ms: 38_000
    }
  ]
};
