import type {
  AdminCutterUser,
  AdminDashboardMetrics,
  UsageMetrics
} from "../api.ts";
import { status } from "./admin-fixture-system-data.ts";

export const usage: UsageMetrics = {
  search_request_count: 42,
  search_hit_count: 36,
  search_empty_count: 6,
  search_failure_count: 0,
  search_latency_p50_ms: 12,
  search_latency_p95_ms: 47,
  search_latency_max_ms: 68,
  searchd_search_count: 39,
  sqlite_index_search_count: 2,
  fallback_search_count: 1,
  search_backend_unknown_count: 0,
  core_search_request_count: 20,
  core_search_failure_count: 0,
  core_search_latency_p50_ms: 11,
  core_search_latency_p95_ms: 47,
  core_search_latency_max_ms: 68,
  core_searchd_search_count: 20,
  core_sqlite_index_search_count: 0,
  core_fallback_search_count: 0,
  core_search_backend_unknown_count: 0,
  source_detail_view_count: 28,
  transcript_selection_count: 19,
  add_to_cut_list_count: 11,
  cut_submission_count: 8,
  cut_success_count: 7,
  cut_failure_count: 1,
  local_clip_count: 9,
  reuse_local_clip_count: 4,
  active_user_count: 2,
  recent_keywords: ["现金流", "风险控制", "品牌定价"],
  most_used_source_video_ids: ["V000042", "V000041", "V000037"],
  event_store: {
    line_count: 60,
    valid_line_count: 60,
    malformed_line_count: 0,
    malformed_lines: [],
    warning: ""
  },
  users: [
    {
      user_id: "CU000002",
      username: "wangwu",
      search_request_count: 24,
      search_failure_count: 0,
      add_to_cut_list_count: 8,
      transcript_selection_count: 12,
      cut_submission_count: 5,
      cut_success_count: 5,
      local_clip_count: 6,
      reuse_local_clip_count: 1,
      last_used_at: "2024-05-07 10:25:00"
    },
    {
      user_id: "CU000003",
      username: "zhaoliu",
      search_request_count: 18,
      search_failure_count: 0,
      add_to_cut_list_count: 3,
      transcript_selection_count: 7,
      cut_submission_count: 3,
      cut_success_count: 2,
      local_clip_count: 3,
      reuse_local_clip_count: 3,
      last_used_at: "2024-05-07 10:18:00"
    }
  ]
};

export const dashboardMetrics: AdminDashboardMetrics = {
  material: {
    video_count: status.video_count,
    ready_video_count: status.ready_video_count,
    total_duration_ms: 1_982_000_000,
    ready_duration_ms: 426_000_000,
    unprocessed_duration_ms: 1_120_000_000,
    total_size_bytes: 820_000_000_000
  },
  transcript: {
    transcript_video_count: 118,
    character_count: 1_240_000,
    segment_count: 24_800,
    current_index_version: status.current_index_version
  },
  production: {
    completed_today_count: 6,
    failed_today_count: 1,
    average_video_process_ms: 540_000,
    estimated_queue_done_at: "2024-05-07 15:40:00"
  },
  usage,
  risk: {
    failed_video_count: status.failed_video_count,
    index_required_video_count: status.index_required_video_count
  },
  runtime_load: {
    overall_status: "healthy",
    cpu: {
      usage_percent: 32,
      load_average_1m: 1.1,
      status: "healthy",
      label: "负荷正常"
    },
    memory: {
      total_bytes: 32_000_000_000,
      used_bytes: 15_400_000_000,
      available_bytes: 16_600_000_000,
      usage_percent: 48,
      status: "healthy",
      label: "内存充足"
    },
    disk: {
      total_bytes: status.disk_total_bytes,
      available_bytes: status.disk_available_bytes,
      usage_percent: 38,
      status: "healthy",
      label: "空间充足"
    },
    network: {
      active_interface_count: 2,
      status: "healthy",
      label: "网络可用"
    },
    service: {
      uptime_seconds: 7420,
      heartbeat_at: "2024-05-07 10:26:00",
      status: "healthy",
      label: "服务运行中"
    }
  },
  sources: {
    material: {
      data_source: "admin-read-model",
      scan_mode: "no-scan",
      scan_reason: "background-metrics"
    },
    transcript: {
      data_source: "current-index",
      scan_mode: "no-scan",
      scan_reason: "background-metrics"
    },
    production: {
      data_source: "admin-read-model",
      scan_mode: "no-scan",
      scan_reason: "background-metrics"
    },
    usage: {
      data_source: "admin-read-model",
      scan_mode: "no-scan",
      scan_reason: "background-metrics"
    },
    risk: {
      data_source: "admin-read-model",
      scan_mode: "no-scan",
      scan_reason: "background-metrics"
    },
    runtime_load: {
      data_source: "runtime-telemetry",
      scan_mode: "no-scan",
      scan_reason: "background-metrics"
    }
  }
};

export const cutterUsers: AdminCutterUser[] = [
  {
    user_id: "CU000001",
    username: "zhangsan",
    display_name: "张三",
    status: "pending",
    applied_at: "2024-05-07 09:10:00",
    approved_at: "",
    rejected_at: "",
    disabled_at: "",
    last_login_at: "",
    last_used_at: "",
    note: "新设备申请访问素材库",
    devices: [
      {
        device_id: "device-a",
        device_name: "剪辑工作站 A",
        status: "active",
        first_seen_at: "2024-05-07 09:10:00",
        last_login_at: ""
      }
    ]
  },
  {
    user_id: "CU000002",
    username: "wangwu",
    display_name: "王五",
    status: "approved",
    applied_at: "2024-05-06 11:12:00",
    approved_at: "2024-05-06 11:30:00",
    rejected_at: "",
    disabled_at: "",
    last_login_at: "2024-05-07 10:12:00",
    last_used_at: "2024-05-07 10:25:00",
    note: "",
    devices: [
      {
        device_id: "device-b",
        device_name: "剪辑工作站 B",
        status: "active",
        first_seen_at: "2024-05-06 11:12:00",
        last_login_at: "2024-05-07 10:12:00"
      }
    ]
  }
];
