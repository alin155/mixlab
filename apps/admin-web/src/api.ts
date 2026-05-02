import type { DoctorCheck, MixlabDoctorReport } from "../../../packages/doctor-core/src/index.ts";

export type AdminApiEnvelope<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error_code: string;
      message: string;
      details?: Record<string, unknown>;
    };

export type AdminPreprocessStatus =
  | "unprocessed"
  | "queued"
  | "processing"
  | "ready"
  | "failed"
  | "index-required";

export interface AdminLibraryStatus {
  library_id: string;
  name: string;
  root_path: string;
  source_videos_path: string;
  mixlab_library_path: string;
  protocol_version: string;
  video_count: number;
  ready_video_count: number;
  processing_video_count: number;
  queued_video_count: number;
  unprocessed_video_count: number;
  failed_video_count: number;
  index_required_video_count: number;
  disk_total_bytes: number;
  disk_available_bytes: number;
  index_status: "ready" | "building" | "needs-publish" | "error";
  current_index_version: string;
  active_task_label: string;
  updated_at: string;
}

export interface AdminPathCheck {
  label: string;
  path: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

export interface AdminSourceVideo {
  source_video_id: string;
  title: string;
  file_name: string;
  relative_path: string;
  cover_url: string;
  duration_ms: number;
  file_size: number;
  preprocess_status: AdminPreprocessStatus;
  visible_to_cutters: boolean;
  tags: string[];
  description: string;
  lecturer: string;
  course: string;
  category: string;
  error_stage?: string;
  error_message?: string;
  updated_at: string;
}

export interface AdminPreprocessJob {
  job_id: string;
  source_video_id: string;
  title: string;
  status: "running" | "queued" | "done" | "failed";
  stage: string;
  progress: number;
  started_at?: string;
  completed_at?: string;
  failed_at?: string;
  elapsed_ms: number;
  log_path: string;
  retryable: boolean;
  error_message?: string;
}

export interface AdminPreprocessJobsResponse {
  active_count: number;
  queued_count: number;
  completed_count: number;
  failed_count: number;
  jobs: AdminPreprocessJob[];
}

export interface AdminIndexVersion {
  index_version: string;
  created_at: string;
  ready_video_count: number;
  schema_version: string;
  validation_status: "pass" | "warn" | "fail";
  is_current: boolean;
  published_by: string;
}

export interface AdminIndexVersionsResponse {
  current_version: string;
  versions: AdminIndexVersion[];
}

export interface AdminRuntimeSettings {
  ffmpeg: {
    available: boolean;
    source: "bundled" | "custom" | "path" | "missing";
    version: string;
    last_error: string;
  };
  ffprobe: {
    available: boolean;
    source: "bundled" | "custom" | "path" | "missing";
    version: string;
    last_error: string;
  };
  asr: {
    provider: "dashscope";
    provider_label: string;
    model: string;
    audio_mode: "mp3_16k_mono_64k" | "wav_16k_mono_pcm_s16le";
    dashscope_api_key_configured: boolean;
    language_hints: string[];
    speaker_diarization_enabled: boolean;
    object_storage_mode: "dashscope-temporary";
    last_failure_reason: string;
  };
}

export interface AdminActionResult {
  affected_count?: number;
  source_video_ids?: string[];
  new_video_count?: number;
  existing_video_count?: number;
  published_source_video_ids?: string[];
  passed?: boolean;
  message?: string;
}

export interface AdminSourceVideoMetadataUpdate {
  title?: string;
  description?: string;
  tags?: string[];
  lecturer?: string;
  course?: string;
  category?: string;
}

export interface AdminDashboardData {
  status: AdminLibraryStatus;
  path_checks: AdminPathCheck[];
  source_videos: AdminSourceVideo[];
  jobs: AdminPreprocessJobsResponse;
  indexes: AdminIndexVersionsResponse;
  doctor: MixlabDoctorReport;
  runtime: AdminRuntimeSettings;
}

export interface AdminApiClient {
  getLibraryStatus(): Promise<AdminLibraryStatus>;
  getPathChecks(): Promise<AdminPathCheck[]>;
  listSourceVideos(): Promise<AdminSourceVideo[]>;
  listPreprocessJobs(): Promise<AdminPreprocessJobsResponse>;
  listIndexVersions(): Promise<AdminIndexVersionsResponse>;
  getDoctorReport(): Promise<MixlabDoctorReport>;
  getRuntimeSettings(): Promise<AdminRuntimeSettings>;
  initializeLibrary(): Promise<AdminActionResult>;
  scanSourceVideos(): Promise<AdminActionResult>;
  queueUnprocessedVideos(): Promise<AdminActionResult>;
  retryFailedVideos(): Promise<AdminActionResult>;
  repairIndex(): Promise<AdminActionResult>;
  runDoctor(): Promise<MixlabDoctorReport>;
  testAsrConfig(): Promise<AdminActionResult>;
  updateSourceVideoMetadata(
    sourceVideoId: string,
    metadata: AdminSourceVideoMetadataUpdate
  ): Promise<AdminSourceVideo>;
}

export interface CreateAdminApiClientInput {
  base_url: string;
  fetch?: typeof fetch;
}

export function unwrapAdminResponse<T>(envelope: AdminApiEnvelope<T>): T {
  if (envelope.ok) {
    return envelope.data;
  }

  throw new Error(`${envelope.error_code}: ${envelope.message}`);
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

async function getJson<T>(
  fetchImpl: typeof fetch,
  baseUrl: string,
  endpoint: string
): Promise<T> {
  const response = await fetchImpl(joinUrl(baseUrl, endpoint));
  const envelope = (await response.json()) as AdminApiEnvelope<T>;
  return unwrapAdminResponse(envelope);
}

async function sendJson<T>(
  fetchImpl: typeof fetch,
  baseUrl: string,
  endpoint: string,
  method: "POST" | "PATCH",
  body?: unknown
): Promise<T> {
  const response = await fetchImpl(joinUrl(baseUrl, endpoint), {
    method,
    headers: {
      "Content-Type": "application/json"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const envelope = (await response.json()) as AdminApiEnvelope<T>;
  return unwrapAdminResponse(envelope);
}

export function createAdminApiClient(input: CreateAdminApiClientInput): AdminApiClient {
  const fetchImpl = input.fetch ?? fetch;

  return {
    getLibraryStatus: () =>
      getJson<AdminLibraryStatus>(fetchImpl, input.base_url, "/api/admin/library/status"),
    getPathChecks: () =>
      getJson<AdminPathCheck[]>(fetchImpl, input.base_url, "/api/admin/library/path-checks"),
    listSourceVideos: () =>
      getJson<AdminSourceVideo[]>(fetchImpl, input.base_url, "/api/admin/source-videos"),
    listPreprocessJobs: () =>
      getJson<AdminPreprocessJobsResponse>(fetchImpl, input.base_url, "/api/admin/preprocess/jobs"),
    listIndexVersions: () =>
      getJson<AdminIndexVersionsResponse>(fetchImpl, input.base_url, "/api/admin/index/versions"),
    getDoctorReport: () =>
      getJson<MixlabDoctorReport>(fetchImpl, input.base_url, "/api/admin/doctor/report"),
    getRuntimeSettings: () =>
      getJson<AdminRuntimeSettings>(fetchImpl, input.base_url, "/api/admin/settings/runtime"),
    initializeLibrary: () =>
      sendJson<AdminActionResult>(fetchImpl, input.base_url, "/api/admin/library/init", "POST"),
    scanSourceVideos: () =>
      sendJson<AdminActionResult>(fetchImpl, input.base_url, "/api/admin/library/scan", "POST"),
    queueUnprocessedVideos: () =>
      sendJson<AdminActionResult>(fetchImpl, input.base_url, "/api/admin/preprocess/queue-unprocessed", "POST"),
    retryFailedVideos: () =>
      sendJson<AdminActionResult>(fetchImpl, input.base_url, "/api/admin/preprocess/retry-failed", "POST"),
    repairIndex: () =>
      sendJson<AdminActionResult>(fetchImpl, input.base_url, "/api/admin/index/repair", "POST"),
    runDoctor: () =>
      sendJson<MixlabDoctorReport>(fetchImpl, input.base_url, "/api/admin/doctor/run", "POST"),
    testAsrConfig: () =>
      sendJson<AdminActionResult>(fetchImpl, input.base_url, "/api/admin/settings/test-asr", "POST"),
    updateSourceVideoMetadata: (sourceVideoId, metadata) =>
      sendJson<AdminSourceVideo>(
        fetchImpl,
        input.base_url,
        `/api/admin/source-videos/${sourceVideoId}/metadata`,
        "PATCH",
        metadata
      )
  };
}

function cover(seed: string, tint: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="%23f5f6f8"/><rect y="98" width="320" height="82" fill="%23${tint}"/><path d="M28 122h24V78h26v44h18V60h30v62h22V88h24v34h25V48h31v74h20V82h25v40h28v15H28z" fill="%23262f3a"/><circle cx="266" cy="48" r="24" fill="%23ffffff" opacity=".68"/><text x="18" y="164" font-family="Arial" font-size="19" fill="%23ffffff">${seed}</text></svg>`;
  return `data:image/svg+xml,${svg}`;
}

const status: AdminLibraryStatus = {
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
  active_task_label: "P000043 - build-keyframes 65%",
  updated_at: "2024-05-07 10:26"
};

const pathChecks: AdminPathCheck[] = [
  {
    label: "公共素材库",
    path: status.root_path,
    status: "pass",
    message: "根路径可访问"
  },
  {
    label: "source-videos",
    path: status.source_videos_path,
    status: "pass",
    message: "原视频目录可读"
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

const sourceVideos: AdminSourceVideo[] = [
  {
    source_video_id: "P000043",
    title: "现金流课程片段",
    file_name: "现金流课程片段.mp4",
    relative_path: "source-videos/2024/05/现金流课程片段.mp4",
    cover_url: cover("P43", "9bb8d6"),
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
    source_video_id: "P000042",
    title: "现金流管理与风险控制",
    file_name: "现金流管理与风险控制.mp4",
    relative_path: "source-videos/2024/05/现金流管理与风险控制.mp4",
    cover_url: cover("P42", "86a98b"),
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
    source_video_id: "P000041",
    title: "利润增长的估价优化",
    file_name: "利润增长估价优化.mp4",
    relative_path: "source-videos/2024/05/利润增长估价优化.mp4",
    cover_url: cover("P41", "d8b16f"),
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
    source_video_id: "P000039",
    title: "组织复制方法",
    file_name: "组织复制方法.mp4",
    relative_path: "source-videos/2024/05/组织复制方法.mp4",
    cover_url: cover("P39", "b0a2cb"),
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
    source_video_id: "P000037",
    title: "客户筛选与品牌定价",
    file_name: "客户筛选与品牌定价.mp4",
    relative_path: "source-videos/2024/05/客户筛选与品牌定价.mp4",
    cover_url: cover("P37", "c79f8d"),
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
    source_video_id: "P000044",
    title: "人工智能商业落地",
    file_name: "人工智能商业落地.mp4",
    relative_path: "source-videos/2024/05/人工智能商业落地.mp4",
    cover_url: cover("P44", "95b9a8"),
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

const jobs: AdminPreprocessJobsResponse = {
  active_count: 1,
  queued_count: 2,
  completed_count: 3,
  failed_count: 1,
  jobs: [
    {
      job_id: "J000043",
      source_video_id: "P000043",
      title: "现金流课程片段",
      status: "running",
      stage: "build-keyframes",
      progress: 65,
      started_at: "2024-05-07 10:24:18",
      elapsed_ms: 272_000,
      log_path: ".mixlab-library/logs/P000043.log",
      retryable: false
    },
    {
      job_id: "J000044",
      source_video_id: "P000044",
      title: "人工智能商业落地",
      status: "queued",
      stage: "extract-audio",
      progress: 0,
      elapsed_ms: 0,
      log_path: ".mixlab-library/logs/P000044.log",
      retryable: false
    },
    {
      job_id: "J000037",
      source_video_id: "P000037",
      title: "客户筛选与品牌定价",
      status: "failed",
      stage: "asr",
      progress: 0,
      failed_at: "2024-05-07 10:18:20",
      elapsed_ms: 38_000,
      log_path: ".mixlab-library/logs/P000037.log",
      retryable: true,
      error_message: "DashScope ASR 网络超时"
    },
    {
      job_id: "J000042",
      source_video_id: "P000042",
      title: "现金流管理与风险控制",
      status: "done",
      stage: "publish-ready",
      progress: 100,
      completed_at: "2024-05-07 10:23:02",
      elapsed_ms: 468_000,
      log_path: ".mixlab-library/logs/P000042.log",
      retryable: false
    },
    {
      job_id: "J000041",
      source_video_id: "P000041",
      title: "利润增长的估价优化",
      status: "done",
      stage: "publish-ready",
      progress: 100,
      completed_at: "2024-05-07 10:25:40",
      elapsed_ms: 655_000,
      log_path: ".mixlab-library/logs/P000041.log",
      retryable: false
    }
  ]
};

const indexes: AdminIndexVersionsResponse = {
  current_version: "v000027",
  versions: [
    {
      index_version: "v000027",
      created_at: "2024-05-07 09:51:32",
      ready_video_count: 120,
      schema_version: "1.0.0",
      validation_status: "pass",
      is_current: true,
      published_by: "admin"
    },
    {
      index_version: "v000026",
      created_at: "2024-05-06 22:10:11",
      ready_video_count: 118,
      schema_version: "1.0.0",
      validation_status: "pass",
      is_current: false,
      published_by: "admin"
    },
    {
      index_version: "v000025",
      created_at: "2024-05-05 21:47:09",
      ready_video_count: 114,
      schema_version: "1.0.0",
      validation_status: "pass",
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
  }
];

const doctor: MixlabDoctorReport = {
  schema_version: "1.0",
  generated_at: "2024-05-07 10:26:15",
  library_root: status.root_path,
  summary: {
    pass: 4,
    warn: 2,
    fail: 0
  },
  checks: doctorChecks
};

const runtime: AdminRuntimeSettings = {
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
    last_failure_reason: "P000037 ASR 网络超时，可重试"
  }
};

export function createFixtureAdminApiClient(): AdminApiClient {
  let fixtureStatus: AdminLibraryStatus = { ...status };
  let fixturePathChecks: AdminPathCheck[] = pathChecks.map((item) => ({ ...item }));
  let fixtureSourceVideos: AdminSourceVideo[] = sourceVideos.map((video) => ({
    ...video,
    tags: [...video.tags]
  }));
  let fixtureJobs: AdminPreprocessJobsResponse = {
    ...jobs,
    jobs: jobs.jobs.map((job) => ({ ...job }))
  };
  let fixtureIndexes: AdminIndexVersionsResponse = {
    ...indexes,
    versions: indexes.versions.map((version) => ({ ...version }))
  };
  let fixtureDoctor: MixlabDoctorReport = {
    ...doctor,
    summary: { ...doctor.summary },
    checks: doctor.checks.map((check) => ({ ...check }))
  };

  function recount(): void {
    fixtureStatus = {
      ...fixtureStatus,
      ready_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "ready").length,
      processing_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "processing").length,
      queued_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "queued").length,
      unprocessed_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "unprocessed").length,
      failed_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "failed").length,
      index_required_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "index-required").length
    };
  }

  function queueVideos(statuses: AdminPreprocessStatus[], message: string): AdminActionResult {
    const affected = fixtureSourceVideos.filter((video) => statuses.includes(video.preprocess_status));

    fixtureSourceVideos = fixtureSourceVideos.map((video) =>
      statuses.includes(video.preprocess_status)
        ? {
            ...video,
            preprocess_status: "queued",
            visible_to_cutters: false,
            error_stage: undefined,
            error_message: undefined,
            updated_at: "2024-05-07 10:30:00"
          }
        : video
    );

    for (const video of affected) {
      const jobId = `J${video.source_video_id.slice(1)}`;
      const existing = fixtureJobs.jobs.find((job) => job.job_id === jobId);
      const nextJob: AdminPreprocessJob = {
        job_id: jobId,
        source_video_id: video.source_video_id,
        title: video.title,
        status: "queued",
        stage: "extract-audio",
        progress: 0,
        elapsed_ms: 0,
        log_path: `.mixlab-library/logs/${video.source_video_id}.log`,
        retryable: false
      };

      fixtureJobs = {
        ...fixtureJobs,
        jobs: existing
          ? fixtureJobs.jobs.map((job) => job.job_id === jobId ? nextJob : job)
          : [nextJob, ...fixtureJobs.jobs]
      };
    }

    recount();
    return {
      affected_count: affected.length,
      source_video_ids: affected.map((video) => video.source_video_id),
      message
    };
  }

  return {
    getLibraryStatus: async () => ({ ...fixtureStatus }),
    getPathChecks: async () => fixturePathChecks.map((item) => ({ ...item })),
    listSourceVideos: async () => fixtureSourceVideos.map((video) => ({
      ...video,
      tags: [...video.tags]
    })),
    listPreprocessJobs: async () => ({
      ...fixtureJobs,
      jobs: fixtureJobs.jobs.map((job) => ({ ...job }))
    }),
    listIndexVersions: async () => ({
      ...fixtureIndexes,
      versions: fixtureIndexes.versions.map((version) => ({ ...version }))
    }),
    getDoctorReport: async () => ({
      ...fixtureDoctor,
      summary: { ...fixtureDoctor.summary },
      checks: fixtureDoctor.checks.map((check) => ({ ...check }))
    }),
    getRuntimeSettings: async () => runtime,
    initializeLibrary: async () => ({
      affected_count: 0,
      message: "fixture 素材库已初始化"
    }),
    scanSourceVideos: async () => ({
      new_video_count: 0,
      existing_video_count: fixtureSourceVideos.length,
      message: "fixture 扫描完成"
    }),
    queueUnprocessedVideos: async () =>
      queueVideos(["unprocessed"], "已将未处理视频加入预处理队列"),
    retryFailedVideos: async () =>
      queueVideos(["failed"], "已将失败视频重新加入预处理队列"),
    repairIndex: async () => {
      const affected = fixtureSourceVideos.filter((video) => video.preprocess_status === "index-required");

      fixtureSourceVideos = fixtureSourceVideos.map((video) =>
        video.preprocess_status === "index-required"
          ? {
              ...video,
              preprocess_status: "ready",
              visible_to_cutters: true,
              updated_at: "2024-05-07 10:31:00"
            }
          : video
      );
      fixtureIndexes = {
        current_version: "v000028",
        versions: [
          {
            index_version: "v000028",
            created_at: "2024-05-07 10:31:00",
            ready_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "ready").length,
            schema_version: "1.0.0",
            validation_status: "pass",
            is_current: true,
            published_by: "admin"
          },
          ...fixtureIndexes.versions.map((version) => ({ ...version, is_current: false }))
        ]
      };
      fixtureStatus = {
        ...fixtureStatus,
        current_index_version: "v000028",
        index_status: "ready"
      };
      recount();

      return {
        affected_count: affected.length,
        published_source_video_ids: affected.map((video) => video.source_video_id),
        message: "索引修复完成"
      };
    },
    runDoctor: async () => fixtureDoctor,
    testAsrConfig: async () => ({
      passed: runtime.asr.dashscope_api_key_configured,
      message: runtime.asr.dashscope_api_key_configured
        ? "DashScope API Key 已配置，测试通过。"
        : "DashScope API Key 未配置。"
    }),
    updateSourceVideoMetadata: async (sourceVideoId, metadata) => {
      let updated: AdminSourceVideo | undefined;

      fixtureSourceVideos = fixtureSourceVideos.map((video) => {
        if (video.source_video_id !== sourceVideoId) {
          return video;
        }

        updated = {
          ...video,
          ...metadata,
          tags: metadata.tags ?? video.tags,
          updated_at: "2024-05-07 10:32:00"
        };
        return updated;
      });

      if (!updated) {
        throw new Error(`source video not found: ${sourceVideoId}`);
      }

      return updated;
    }
  };
}

export async function loadAdminDashboardData(
  client: AdminApiClient
): Promise<AdminDashboardData> {
  const [
    libraryStatus,
    adminPathChecks,
    adminSourceVideos,
    adminJobs,
    adminIndexes,
    adminDoctor,
    adminRuntime
  ] = await Promise.all([
    client.getLibraryStatus(),
    client.getPathChecks(),
    client.listSourceVideos(),
    client.listPreprocessJobs(),
    client.listIndexVersions(),
    client.getDoctorReport(),
    client.getRuntimeSettings()
  ]);

  return {
    status: libraryStatus,
    path_checks: adminPathChecks,
    source_videos: adminSourceVideos,
    jobs: adminJobs,
    indexes: adminIndexes,
    doctor: adminDoctor,
    runtime: adminRuntime
  };
}
