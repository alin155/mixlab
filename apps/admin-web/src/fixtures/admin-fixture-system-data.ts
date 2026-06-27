import type {
  DoctorCheck,
  MixlabDoctorReport
} from "../../../../packages/doctor-core/src/index.ts";
import type {
  AdminIndexVersionsResponse,
  AdminLibraryStatus,
  AdminPathCheck,
  AdminRuntimeSettings,
  AdminSettingsConfig
} from "../api.ts";

export const status: AdminLibraryStatus = {
  library_id: "MLPUB-001",
  name: "公司公开课程素材库",
  root_path: "/Volumes/PublicLibrary",
  source_videos_path: "/Volumes/PublicLibrary/source-videos",
  mixlab_library_path: "/Volumes/PublicLibrary/.mixlab-library",
  protocol_version: "1.0.0",
  video_count: 623,
  ready_video_count: 120,
  processing_video_count: 3,
  queued_video_count: 28,
  unprocessed_video_count: 465,
  failed_video_count: 2,
  index_required_video_count: 5,
  disk_total_bytes: 4_000_000_000_000,
  disk_available_bytes: 2_480_000_000_000,
  index_status: "ready",
  current_index_version: "v000027",
  active_task_label: "V000043 - build-keyframes 65%",
  updated_at: "2024-05-07 10:26"
};

export const pathChecks: AdminPathCheck[] = [
  {
    label: "公共素材库",
    path: status.root_path,
    status: "pass",
    message: "根路径可访问"
  },
  {
    label: "素材来源：默认素材来源",
    path: status.source_videos_path,
    status: "pass",
    message: "素材来源可读"
  },
  {
    label: ".mixlab-library",
    path: status.mixlab_library_path,
    status: "pass",
    message: "协议目录可写"
  },
  {
    label: "manifest.json",
    path: `${status.mixlab_library_path}/library.json`,
    status: "pass",
    message: "library.json 有效"
  }
];

export const indexes: AdminIndexVersionsResponse = {
  current_version: "v000027",
  current_validation_status: "pass",
  current_validation_message: "current.json 指向 v000027",
  versions: [
    {
      index_version: "v000027",
      created_at: "2024-05-07 09:51:32",
      ready_video_count: 120,
      schema_version: "1.0.0",
      validation_status: "pass",
      validation_message: "索引包校验通过",
      is_current: true,
      published_by: "admin"
    },
    {
      index_version: "v000026",
      created_at: "2024-05-06 22:10:11",
      ready_video_count: 118,
      schema_version: "1.0.0",
      validation_status: "pass",
      validation_message: "索引包校验通过",
      is_current: false,
      published_by: "admin"
    },
    {
      index_version: "v000025",
      created_at: "2024-05-05 21:47:09",
      ready_video_count: 114,
      schema_version: "1.0.0",
      validation_status: "pass",
      validation_message: "索引包校验通过",
      is_current: false,
      published_by: "admin"
    }
  ]
};

const doctorChecks: DoctorCheck[] = [
  {
    check_id: "public-root",
    label: "公共路径",
    status: "pass",
    message: "公共素材库可访问，子目录完整"
  },
  {
    check_id: "manifest",
    label: "Manifest",
    status: "pass",
    message: "manifest.json 与 source-video.json 有效"
  },
  {
    check_id: "artifacts",
    label: "视频产物",
    status: "warn",
    message: "有 5 个视频缺少可视化产物"
  },
  {
    check_id: "preprocess-logs-writable",
    label: "Preprocess Logs Writable",
    status: "pass",
    message: "preprocess log directory is writable"
  },
  {
    check_id: "preprocess-logs",
    label: "Preprocess Logs",
    status: "warn",
    message: "preprocess logs are missing for V000037"
  },
  {
    check_id: "ffmpeg",
    label: "FFmpeg",
    status: "pass",
    message: "bundled ffmpeg 可用"
  },
  {
    check_id: "asr",
    label: "ASR",
    status: "pass",
    message: "DashScope key 已配置且未暴露"
  },
  {
    check_id: "counts",
    label: "状态计数",
    status: "warn",
    message: "index-required 与 ready 边界需发布"
  },
  {
    check_id: "local-clips",
    label: "Local Clips",
    status: "warn",
    message: "LC000001: media file is missing"
  }
];

export const doctor: MixlabDoctorReport = {
  schema_version: "1.0",
  generated_at: "2024-05-07 10:26:15",
  library_root: status.root_path,
  summary: {
    pass: 5,
    warn: 4,
    fail: 0
  },
  checks: doctorChecks
};

export const runtime: AdminRuntimeSettings = {
  ffmpeg: {
    available: true,
    source: "bundled",
    version: "ffmpeg 6.1.1 essentials",
    last_error: ""
  },
  ffprobe: {
    available: true,
    source: "bundled",
    version: "ffprobe 6.1.1 essentials",
    last_error: ""
  },
  asr: {
    provider: "dashscope",
    provider_label: "阿里云百炼 / DashScope",
    model: "paraformer-v2",
    audio_mode: "mp3_16k_mono_64k",
    dashscope_api_key_configured: true,
    language_hints: ["zh"],
    speaker_diarization_enabled: false,
    object_storage_mode: "dashscope-temporary",
    last_failure_reason: "V000037 ASR 网络超时，可重试"
  }
};

export const settings: AdminSettingsConfig = {
  schema_version: "1.0",
  library_name: "公司公开课程素材库",
  source_folders: [
    {
      id: "src_default",
      name: "默认素材来源",
      path: "/Volumes/PublicLibrary/source-videos",
      enabled: true,
      last_scanned_at: "2024-05-07 10:27:03",
      discovered_video_count: 623,
      new_unprocessed_count: 1
    },
    {
      id: "src_002",
      name: "财务课程归档",
      path: "/Volumes/CourseArchive/finance",
      enabled: true,
      last_scanned_at: "2024-05-07 09:20:00",
      discovered_video_count: 84,
      new_unprocessed_count: 0
    }
  ],
  artifact_library: {
    mode: "default",
    path: "/Volumes/PublicLibrary/.mixlab-library",
    migration_required: false
  },
  runtime_policy: {
    audio_mode: "mp3_16k_mono_64k",
    concurrent_jobs: 2,
    auto_scan_enabled: true,
    auto_queue_enabled: false,
    auto_publish_index_enabled: true
  },
  updated_at: "2024-05-07 10:27:03"
};
