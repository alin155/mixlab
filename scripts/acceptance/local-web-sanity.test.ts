import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  adminDashboardUrl,
  isLocalWebSanityIndexDriftOnly,
  materialLocatorUrl,
  resolveLocalWebSanityEndpoints,
  validateAdminDashboardSanityState,
  validateAdminRealNasMatrixState,
  validateCutterAuthSanityState,
  validateCutterPublicLibraryWebSanityState,
  validateCutterSearchMatrixState,
  validateLocalWebLayoutSanityState,
  validateLocalWebSanityReport,
  validateMaterialLocatorClosedLoopState,
  validateMaterialLocatorSanityState,
  validateSearchdIndexSanityState,
  writeLocalWebSanityReport,
  type LocalWebSanityReport,
  type AdminDashboardSanityState,
  type AdminRealNasMatrixState,
  type CutterAuthSanityState,
  type CutterPublicLibraryWebSanityState,
  type CutterSearchMatrixState,
  type LocalWebLayoutSanityState,
  type LocalWebRouteLayoutState,
  type SearchdIndexSanityState,
  type MaterialLocatorClosedLoopState,
  type MaterialLocatorSanityState
} from "./local-web-sanity.ts";
import { validateLocalWebSanityReportFile } from "./local-web-sanity-report.ts";

function completeAdminDashboardState(overrides: Partial<AdminDashboardSanityState> = {}): AdminDashboardSanityState {
  return {
    url: "http://127.0.0.1:5176/#/dashboard",
    title: "MixLab V3 - 管理端",
    visible_labels: [
      "公共素材库生产总览",
      "核心链路健康",
      "关键词定位",
      "完整文案",
      "选段剪切",
      "50 人容量",
      "搜索 p95",
      "本地搜索覆盖",
      "搜索失败",
      "素材规模",
      "活跃剪辑师"
    ],
    write_action_labels: ["重试失败视频"],
    disabled_write_action_labels: [],
    active_cutter_capacity_label: "2/50 活跃剪辑师",
    active_cutter_count: 2,
    cutter_capacity: 50,
    current_index_version: "v000027",
    search_p95_ms: 47,
    local_search_coverage_percent: 93,
    search_failure_count: 0,
    body_sample: "公共素材库生产总览 核心链路健康 关键词定位 完整文案 选段剪切 50 人容量 当前索引 v000027 搜索 p95 47ms 本地搜索覆盖 93% 素材规模 活跃剪辑师 2/50 搜索失败 0",
    ...overrides
  };
}

function completeSearchdIndexState(overrides: Partial<SearchdIndexSanityState> = {}): SearchdIndexSanityState {
  return {
    url: "http://127.0.0.1:3790/health",
    ok: true,
    admin_current_index_version: "v000027",
    index_version: "v000027",
    source_video_count: 120,
    segment_count: 12_000,
    matched_admin_current_index: true,
    ...overrides
  };
}

function completeAdminRealNasMatrixState(overrides: Partial<AdminRealNasMatrixState> = {}): AdminRealNasMatrixState {
  return {
    admin_api_base_url: "http://127.0.0.1:3889/",
    library_root: "/Volumes/MixLab/PublicLibrary",
    source_videos_path: "/data/PublicLibrary/source-videos",
    video_count: 120,
    ready_video_count: 100,
    queued_video_count: 10,
    processing_video_count: 1,
    failed_video_count: 2,
    index_required_video_count: 3,
    current_index_version: "v000027",
    settings_source_folder_count: 1,
    enabled_source_folder_count: 1,
    settings_include_real_nas_path: true,
    source_ready_sample_count: 5,
    source_ready_detail_id: "V000001",
    source_ready_detail_ms: 98,
    source_ready_detail_visible_to_cutters: true,
    source_ready_detail_transcript_segment_count: 66,
    source_ready_detail_transcript_char_count: 1_200,
    source_ready_detail_index_version: "v000027",
    runtime_settings_ms: 580,
    runtime_ffmpeg_available: true,
    runtime_ffprobe_available: true,
    runtime_asr_key_configured: true,
    preprocess_job_count: 12,
    preprocess_active_count: 1,
    preprocess_queued_count: 10,
    preprocess_failed_count: 2,
    preprocess_supervisor_state: "idle",
    index_version_count: 3,
    index_current_version: "v000027",
    cutter_user_count: 50,
    source_video_list: {
      page_size: 50,
      first_page_count: 50,
      second_page_count: 50,
      first_page_first_id: "V000001",
      second_page_first_id: "V000051",
      pages_are_distinct: true,
      first_page_ms: 120,
      second_page_ms: 110,
      ready_filter_count: 50,
      ready_filter_all_ready: true,
      ready_filter_ms: 90,
      query: "资产",
      query_result_count: 20,
      query_first_id: "V000001",
      query_first_matches: true,
      query_filter_ms: 140
    },
    source_video_web: {
      url: "http://127.0.0.1:5176/#/source-videos",
      source_path_text: "素材来源 /data/PublicLibrary/source-videos",
      source_path_visible: true,
      first_page_first_id: "V000001",
      first_page_first_id_visible: true,
      loaded_count_before: 100,
      total_count_before: 120,
      load_more_button_label: "继续加载 20 条",
      load_more_clicked: true,
      loaded_count_after: 120,
      total_count_after: 120,
      loaded_count_increased: true,
      query: "资产",
      query_result_id: "V000001",
      query_response_observed: true,
      query_result_visible: true,
      query_result_count_text: "显示 1-20 / 已返回 20",
      query_result_matches_api: true,
      ready_filter_selected_value: "ready",
      ready_filter_response_observed: true,
      ready_filter_result_count_text: "显示 1-50 / 已返回 50",
      ready_filter_visible_status_count: 50,
      ready_filter_all_visible_rows_ready: true
    },
    preprocess_web: {
      url: "http://127.0.0.1:5176/#/preprocess-jobs",
      current_index_version: "v000027",
      current_index_visible: true,
      source_video_count: 120,
      source_video_count_visible: true,
      active_count: 1,
      active_count_visible: true,
      queued_count: 10,
      queued_count_visible: true,
      failed_count: 2,
      failed_count_visible: true,
      index_required_video_count: 3,
      index_required_visible: true,
      production_status_title: "1 个处理中任务需要恢复",
      production_status_visible: true,
      public_library_root_visible: true,
      visible_job_id: "J000001",
      visible_job_id_observed: true,
      log_job_id: "J000001",
      log_record_source: "preprocess-job",
      log_content_char_count: 420,
      log_path_visible: true,
      log_content_visible: true,
      log_snapshot_visible: true
    },
    cutter_users_web: {
      url: "http://127.0.0.1:5176/#/cutter-users",
      api_user_count: 50,
      api_approved_count: 49,
      api_pending_count: 1,
      api_first_user_id: "CU000001",
      api_first_display_name: "Allen",
      api_first_status_label: "已通过",
      api_first_device_name: "Windows 剪辑端 · Edge",
      approved_count_visible: true,
      pending_count_visible: true,
      first_user_visible: true,
      first_device_visible: true,
      identity_note_visible: true,
      device_detail_visible: true,
      disable_action_visible: true,
      approve_action_visible: true,
      usage_metrics_labels_visible: ["活跃剪辑师", "搜索次数", "搜索失败", "选段次数", "剪切成功"]
    },
    web_routes: [
      {
        route: "source-videos",
        url: "http://127.0.0.1:5176/#/source-videos",
        required_labels: [
          "公共素材资产清单",
          "素材来源",
          "已载入",
          "预处理状态",
          "搜索可见",
          "继续加载"
        ],
        visible_labels: [
          "公共素材资产清单",
          "素材来源",
          "已载入",
          "预处理状态",
          "搜索可见",
          "继续加载"
        ],
        disabled_write_action_labels: []
      },
      {
        route: "preprocess-jobs",
        url: "http://127.0.0.1:5176/#/preprocess-jobs",
        required_labels: [
          "预处理流水线与索引发布",
          "当前索引",
          "生产状态",
          "扫描素材",
          "生成文案",
          "队列中",
          "任务队列",
          "处理控制"
        ],
        visible_labels: [
          "预处理流水线与索引发布",
          "当前索引",
          "生产状态",
          "扫描素材",
          "生成文案",
          "队列中",
          "任务队列",
          "处理控制"
        ],
        disabled_write_action_labels: []
      },
      {
        route: "doctor",
        url: "http://127.0.0.1:5176/#/doctor",
        required_labels: ["系统检查", "检查结果", "检查报告", "通过", "失败"],
        visible_labels: ["系统检查", "检查结果", "检查报告", "通过", "失败"],
        disabled_write_action_labels: []
      },
      {
        route: "cutter-users",
        url: "http://127.0.0.1:5176/#/cutter-users",
        required_labels: ["剪辑师用户", "剪切成功"],
        visible_labels: ["剪辑师用户", "剪切成功"],
        disabled_write_action_labels: []
      },
      {
        route: "settings",
        url: "http://127.0.0.1:5176/#/settings",
        required_labels: ["素材来源与预处理设置", "素材库基本信息", "预处理设置", "语音识别", "密钥状态"],
        visible_labels: ["素材来源与预处理设置", "素材库基本信息", "预处理设置", "语音识别", "密钥状态"],
        disabled_write_action_labels: []
      }
    ],
    read_only_actions_skipped: [
      "queue-unprocessed",
      "retry-failed",
      "recover-processing",
      "start-supervisor",
      "stop-supervisor",
      "doctor-run",
      "settings-save"
    ],
    ...overrides
  };
}

function completeCutterSearchMatrixState(overrides: Partial<CutterSearchMatrixState> = {}): CutterSearchMatrixState {
  return {
    cutter_api_base_url: "http://127.0.0.1:3789/",
    query_count: 3,
    max_search_ms: 105,
    all_queries_used_searchd: true,
    matched_searchd_index: true,
    queries: [
      {
        query: "现金流",
        group_count: 3,
        returned_count: 3,
        index_version: "v000027",
        search_mode: "searchd",
        search_ms: 47,
        first_source_video_id: "V000001",
        first_hit_count: 5,
        first_segment_id: "V000001-S000001",
        first_segment_begin_ms: 1_000,
        first_segment_contains_query: true,
        first_segment_has_match_range: true
      },
      {
        query: "利润",
        group_count: 3,
        returned_count: 3,
        index_version: "v000027",
        search_mode: "searchd",
        search_ms: 86,
        first_source_video_id: "V000002",
        first_hit_count: 4,
        first_segment_id: "V000002-S000002",
        first_segment_begin_ms: 2_000,
        first_segment_contains_query: true,
        first_segment_has_match_range: true
      },
      {
        query: "客户",
        group_count: 3,
        returned_count: 3,
        index_version: "v000027",
        search_mode: "searchd",
        search_ms: 105,
        first_source_video_id: "V000003",
        first_hit_count: 6,
        first_segment_id: "V000003-S000003",
        first_segment_begin_ms: 3_000,
        first_segment_contains_query: true,
        first_segment_has_match_range: true
      }
    ],
    ...overrides
  };
}

function completeRouteLayoutState(overrides: Partial<LocalWebRouteLayoutState> = {}): LocalWebRouteLayoutState {
  const app = overrides.app ?? "admin";
  const route = overrides.route ?? "source-videos";
  const url = overrides.url ?? `http://127.0.0.1:5176/#/${route}`;
  const viewportLabel = overrides.viewport_label ?? "desktop";
  const viewportWidth = overrides.viewport_width ?? (viewportLabel === "compact" ? 1024 : 1440);
  const viewportHeight = overrides.viewport_height ?? (viewportLabel === "compact" ? 768 : 960);
  const pageWidth = viewportLabel === "compact" ? 746 : 1180;

  return {
    app,
    route,
    url,
    viewport_label: viewportLabel,
    viewport_width: viewportWidth,
    viewport_height: viewportHeight,
    required_labels: overrides.required_labels ?? ["公共素材资产清单"],
    visible_labels: overrides.visible_labels ?? overrides.required_labels ?? ["公共素材资产清单"],
    disabled_write_action_labels: overrides.disabled_write_action_labels ?? [],
    body: overrides.body ?? {
      selector: "body",
      client_width: viewportWidth,
      scroll_width: viewportWidth,
      horizontal_overflow: false
    },
    page: overrides.page ?? {
      selector: app === "admin" ? ".admin-main-column" : `[data-page='${route}']`,
      client_width: pageWidth,
      scroll_width: pageWidth,
      horizontal_overflow: false
    }
  };
}

function withCompactRouteLayout(route: LocalWebRouteLayoutState): LocalWebRouteLayoutState {
  return completeRouteLayoutState({
    ...route,
    viewport_label: "compact",
    viewport_width: 1024,
    viewport_height: 768,
    body: {
      ...route.body,
      client_width: 1024,
      scroll_width: 1024
    },
    page: {
      ...route.page,
      client_width: route.app === "admin" ? 746 : 746,
      scroll_width: route.app === "admin" ? 746 : 746
    }
  });
}

function completeLocalWebLayoutState(overrides: Partial<LocalWebLayoutSanityState> = {}): LocalWebLayoutSanityState {
  const adminRouteLayouts = [
    completeRouteLayoutState({
      route: "source-videos",
      required_labels: [
        "公共素材资产清单",
        "素材来源",
        "已载入",
        "预处理状态",
        "搜索可见",
        "继续加载"
      ],
      visible_labels: [
        "公共素材资产清单",
        "素材来源",
        "已载入",
        "预处理状态",
        "搜索可见",
        "继续加载"
      ],
      disabled_write_action_labels: []
    }),
    completeRouteLayoutState({
      route: "preprocess-jobs",
      url: "http://127.0.0.1:5176/#/preprocess-jobs",
      required_labels: [
        "预处理流水线与索引发布",
        "生产状态",
        "扫描素材",
        "生成文案",
        "当前索引",
        "队列中",
        "任务队列",
        "处理控制"
      ],
      visible_labels: [
        "预处理流水线与索引发布",
        "生产状态",
        "扫描素材",
        "生成文案",
        "当前索引",
        "队列中",
        "任务队列",
        "处理控制"
      ],
      disabled_write_action_labels: []
    }),
    completeRouteLayoutState({
      route: "doctor",
      url: "http://127.0.0.1:5176/#/doctor",
      required_labels: ["系统检查", "检查结果", "检查报告", "通过", "失败"],
      visible_labels: ["系统检查", "检查结果", "检查报告", "通过", "失败"]
    }),
    completeRouteLayoutState({
      route: "cutter-users",
      url: "http://127.0.0.1:5176/#/cutter-users",
      required_labels: ["登录申请与使用统计", "剪辑师用户", "活跃剪辑师", "搜索失败", "剪切成功"],
      visible_labels: ["登录申请与使用统计", "剪辑师用户", "活跃剪辑师", "搜索失败", "剪切成功"]
    }),
    completeRouteLayoutState({
      route: "settings",
      url: "http://127.0.0.1:5176/#/settings",
      required_labels: ["素材来源与预处理设置", "素材库基本信息", "预处理设置", "语音识别", "密钥状态"],
      visible_labels: ["素材来源与预处理设置", "素材库基本信息", "预处理设置", "语音识别", "密钥状态"]
    })
  ];
  const cutterRouteLayouts = [
    completeRouteLayoutState({
      app: "cutter",
      route: "material-locator",
      url: "http://127.0.0.1:5177/#material-locator?query=%E7%8E%B0%E9%87%91%E6%B5%81",
      required_labels: ["素材库", "搜索", "连接", "公共原素材", "视频文案", "选中当前命中"],
      visible_labels: ["素材库", "搜索", "连接", "公共原素材", "视频文案", "选中当前命中"]
    }),
    completeRouteLayoutState({
      app: "cutter",
      route: "cut-tasks",
      url: "http://127.0.0.1:5177/#cut-tasks",
      required_labels: ["剪切任务", "本机剪切流水线"],
      visible_labels: ["剪切任务", "本机剪切流水线"]
    }),
    completeRouteLayoutState({
      app: "cutter",
      route: "local-library",
      url: "http://127.0.0.1:5177/#local-library",
      required_labels: ["本地素材库", "本地可复剪素材"],
      visible_labels: ["本地素材库", "本地可复剪素材"]
    }),
    completeRouteLayoutState({
      app: "cutter",
      route: "public-library",
      url: "http://127.0.0.1:5177/#public-library",
      required_labels: ["公共素材库", "可用原素材"],
      visible_labels: ["公共素材库", "可用原素材"]
    }),
    completeRouteLayoutState({
      app: "cutter",
      route: "settings",
      url: "http://127.0.0.1:5177/#settings",
      required_labels: ["运行环境", "设置", "公共素材库"],
      visible_labels: ["运行环境", "设置", "公共素材库"]
    })
  ];

  return {
    admin_source_videos_url: "http://127.0.0.1:5176/#/source-videos",
    cutter_material_locator_url: "http://127.0.0.1:5177/#material-locator?query=%E7%8E%B0%E9%87%91%E6%B5%81",
    viewport_width: 1440,
    viewport_height: 960,
    admin_statusbar: {
      selector: ".admin-console-statusbar",
      client_width: 1180,
      scroll_width: 1180,
      horizontal_overflow: false
    },
    admin_statusbar_item_overflow_count: 0,
    cutter_workbench: {
      selector: ".cutter-locator-workbench",
      client_width: 1118,
      scroll_width: 1118,
      horizontal_overflow: false
    },
    cutter_body: {
      selector: "body",
      client_width: 1440,
      scroll_width: 1440,
      horizontal_overflow: false
    },
    admin_route_layouts: [...adminRouteLayouts, ...adminRouteLayouts.map(withCompactRouteLayout)],
    cutter_route_layouts: [...cutterRouteLayouts, ...cutterRouteLayouts.map(withCompactRouteLayout)],
    ...overrides
  };
}

function completeMaterialLocatorState(overrides: Partial<MaterialLocatorSanityState> = {}): MaterialLocatorSanityState {
  return {
    url: "http://127.0.0.1:5177/#material-locator?query=%E7%8E%B0%E9%87%91%E6%B5%81",
    query: "现金流",
    default_selected_material_section: "⌄ 公共原素材（12）",
    candidate_count: 6,
    search_status_text: "素材库 已发布 120 条 搜索 可搜索 结果 已返回 连接 已连接",
    search_index_version: "",
    transcript_header: "视频文案 当前 11:58 · 定位 1 / 25 · 本片命中 10 处 · 已选 1 句 · 文案 509字 上一个 下一个",
    current_hit_time_ms: "718000",
    current_hit_time_ms_value: 718000,
    current_hit_segment_id: "s-062",
    global_hit_position: 1,
    global_hit_count: 25,
    current_video_hit_count: 10,
    selected_sentence_count: 1,
    full_transcript_char_count: 509,
    ...overrides
  };
}

function completeClosedLoopState(overrides: Partial<MaterialLocatorClosedLoopState> = {}): MaterialLocatorClosedLoopState {
  return {
    selection_method: "transcript-drag",
    selected_text: "当然第二个就强制储蓄，第三个是潜在的养老金准备，第四个是现金流的转换。保险可以转换现金流吗？",
    selection_proof_text: "来源公共原素材时间段06:58 - 07:06字数46 字命中1/25",
    selected_text_char_count: 46,
    selected_sentence_count: 2,
    selected_text_segment_count: 2,
    selected_text_is_broader_than_query: true,
    cut_notice: "剪切完成 · 本地素材已更新 1",
    local_library_contains_selection: true,
    local_library_page_url: "http://127.0.0.1:5177/#local-library",
    local_library_view_mode: "all",
    local_library_visible_clip_count: 41,
    local_library_visible_count_label: "41 条当前视图素材",
    local_library_clip_title: "001-C0035.mp4",
    local_library_source_title: "1.房产置换与资产优化",
    local_library_clip_title_visible: true,
    local_library_source_title_visible: true,
    local_library_selected_text_visible: true,
    first_result_section: "公共原素材",
    second_result_section: "",
    local_clip_id: "E000041",
    local_clip_media_file_path: "/Users/example/Movies/MixLabLocal/export-clips/E000041/001-C0035.mp4",
    local_clip_manifest_file_path: "/Users/example/Movies/MixLabLocal/export-clips/E000041/export-clip.json",
    local_clip_media_file_exists: true,
    local_clip_media_file_size_bytes: 1024,
    local_clip_manifest_file_exists: true,
    local_clip_manifest_file_size_bytes: 512,
    cut_job_id: "CJ20260604-0001",
    cut_job_status: "done",
    cut_job_export_clip_id: "E000041",
    cut_job_output_file: "export-clips/E000041/001-C0035.mp4",
    cut_job_contains_selection: true,
    cut_tasks_page_contains_selection: true,
    cut_tasks_page_contains_output: true,
    cut_tasks_page_shows_done: true,
    cut_tasks_page_url: "http://127.0.0.1:5177/#cut-tasks",
    cut_tasks_page_visible_status_label: "已完成",
    cut_tasks_page_visible_output_file: "export-clips/E000041/001-C0035.mp4",
    cut_tasks_page_source_title: "1.房产置换与资产优化",
    cut_tasks_page_source_title_visible: true,
    cut_tasks_page_time_range_label: "06:58 - 07:06",
    cut_tasks_page_time_range_visible: true,
    public_library_root: "/Volumes/MixLab/PublicLibrary",
    local_output_is_outside_public_library: true,
    public_library_write_detected: false,
    ...overrides
  };
}

function completeCutterAuthState(overrides: Partial<CutterAuthSanityState> = {}): CutterAuthSanityState {
  return {
    cutter_api_base_url: "http://127.0.0.1:3789/",
    auth_mode_url: "http://127.0.0.1:3789/cutter/auth/mode",
    auth_mode: "local_trusted",
    local_trusted: true,
    trusted_username: "本机剪辑师",
    material_locator_url: "http://127.0.0.1:5177/#material-locator?query=%E7%8E%B0%E9%87%91%E6%B5%81",
    fresh_context_workbench_ready: true,
    login_gate_visible_after_ready: false,
    manual_apply_used: false,
    visible_username: "本机剪辑师",
    ...overrides
  };
}

function completeCutterPublicLibraryWebState(
  overrides: Partial<CutterPublicLibraryWebSanityState> = {}
): CutterPublicLibraryWebSanityState {
  return {
    cutter_api_base_url: "http://127.0.0.1:3789/",
    url: "http://127.0.0.1:5177/#public-library",
    api_available_video_count: 120,
    api_returned_count: 20,
    api_first_source_video_id: "V000001",
    api_first_title: "1.房产置换与资产优化",
    web_api_response_observed: true,
    available_count_visible: true,
    first_title_visible: true,
    public_source_label_visible: true,
    load_more_button_visible: true,
    loaded_count_before: 20,
    loaded_count_after: 40,
    load_more_clicked: true,
    loaded_count_increased: true,
    selected_inspector_title: "1.房产置换与资产优化",
    ...overrides
  };
}

function completeLocalWebReport(overrides: Partial<LocalWebSanityReport> = {}): LocalWebSanityReport {
  return {
    ok: true,
    errors: [],
    endpoints: [
      { label: "admin web", url: "http://127.0.0.1:5176/", ok: true, status: 200 },
      { label: "cutter web", url: "http://127.0.0.1:5177/", ok: true, status: 200 },
      { label: "searchd", url: "http://127.0.0.1:3790/health", ok: true, status: 200 }
    ],
    admin_dashboard: completeAdminDashboardState(),
    searchd_index: completeSearchdIndexState(),
    admin_real_nas_matrix: completeAdminRealNasMatrixState(),
    cutter_search_matrix: completeCutterSearchMatrixState(),
    cutter_auth: completeCutterAuthState(),
    cutter_public_library_web: completeCutterPublicLibraryWebState(),
    layout: completeLocalWebLayoutState(),
    material_locator: completeMaterialLocatorState(),
    material_locator_closed_loop: completeClosedLoopState(),
    ...overrides
  };
}

test("local web sanity builds the material locator route with a keyword query", () => {
  assert.equal(
    materialLocatorUrl("http://127.0.0.1:5177/", "现金流"),
    "http://127.0.0.1:5177/#material-locator?query=%E7%8E%B0%E9%87%91%E6%B5%81"
  );
  assert.equal(
    materialLocatorUrl("http://127.0.0.1:5177/#settings", "增长 ROI"),
    "http://127.0.0.1:5177/#material-locator?query=%E5%A2%9E%E9%95%BF%20ROI"
  );
});

test("local web sanity builds the admin dashboard route", () => {
  assert.equal(adminDashboardUrl("http://127.0.0.1:5176/"), "http://127.0.0.1:5176/#/dashboard");
  assert.equal(adminDashboardUrl("http://127.0.0.1:5176/#/settings"), "http://127.0.0.1:5176/#/dashboard");
});

test("local web sanity accepts BASE_URL env aliases for local web targets", () => {
  assert.deepEqual(resolveLocalWebSanityEndpoints({}, {
    MIXLAB_ADMIN_WEB_BASE_URL: "http://127.0.0.1:5176/",
    MIXLAB_ADMIN_API_URL: "http://127.0.0.1:3889/",
    MIXLAB_CUTTER_WEB_BASE_URL: "http://127.0.0.1:5177/",
    MIXLAB_CUTTER_API_URL: "http://127.0.0.1:3789/",
    MIXLAB_SEARCHD_URL: "http://127.0.0.1:3799/"
  }), {
    adminWebUrl: "http://127.0.0.1:5176/",
    adminApiBaseUrl: "http://127.0.0.1:3889/",
    cutterWebUrl: "http://127.0.0.1:5177/",
    cutterApiBaseUrl: "http://127.0.0.1:3789/",
    searchdBaseUrl: "http://127.0.0.1:3799/"
  });
});

test("local web sanity defaults to the current real NAS local web ports", () => {
  assert.deepEqual(resolveLocalWebSanityEndpoints({}, {}), {
    adminWebUrl: "http://127.0.0.1:5176/",
    adminApiBaseUrl: "http://127.0.0.1:3889/",
    cutterWebUrl: "http://127.0.0.1:5177/",
    cutterApiBaseUrl: "http://127.0.0.1:3789/",
    searchdBaseUrl: "http://127.0.0.1:3790/"
  });
});

test("local web sanity accepts admin dashboard core-path evidence", () => {
  assert.deepEqual(validateAdminDashboardSanityState(completeAdminDashboardState()), []);
});

test("local web sanity accepts searchd index parity with admin current index", () => {
  assert.deepEqual(validateSearchdIndexSanityState(completeSearchdIndexState()), []);
});

test("local web sanity accepts the admin real NAS matrix", () => {
  assert.deepEqual(validateAdminRealNasMatrixState(completeAdminRealNasMatrixState()), []);
});

test("local web sanity rejects weak admin source video pagination and filtering evidence", () => {
  const errors = validateAdminRealNasMatrixState(completeAdminRealNasMatrixState({
    source_video_list: {
      page_size: 50,
      first_page_count: 50,
      second_page_count: 50,
      first_page_first_id: "V000001",
      second_page_first_id: "V000001",
      pages_are_distinct: false,
      first_page_ms: 120,
      second_page_ms: 110,
      ready_filter_count: 10,
      ready_filter_all_ready: false,
      ready_filter_ms: 90,
      query: "资产",
      query_result_count: 1,
      query_first_id: "V000009",
      query_first_matches: false,
      query_filter_ms: 4_200
    }
  }));

  assert.match(errors.join("\n"), /second page must differ from first page/);
  assert.match(errors.join("\n"), /ready filter must return only ready videos/);
  assert.match(errors.join("\n"), /query filter first result must match the query fields/);
  assert.match(errors.join("\n"), /query_filter_ms must be <= 3000ms/);
});

test("local web sanity rejects weak admin source video web UI evidence", () => {
  const errors = validateAdminRealNasMatrixState(completeAdminRealNasMatrixState({
    source_video_web: {
      ...completeAdminRealNasMatrixState().source_video_web,
      source_path_visible: false,
      first_page_first_id_visible: false,
      load_more_clicked: false,
      loaded_count_after: 100,
      loaded_count_increased: false,
      query_response_observed: false,
      query_result_visible: false,
      query_result_matches_api: false,
      ready_filter_selected_value: "all",
      ready_filter_response_observed: false,
      ready_filter_visible_status_count: 0,
      ready_filter_all_visible_rows_ready: false
    }
  }));

  assert.match(errors.join("\n"), /display the real PublicLibrary source path/);
  assert.match(errors.join("\n"), /render the server first-page source video id/);
  assert.match(errors.join("\n"), /exercise the real load-more control/);
  assert.match(errors.join("\n"), /observe a source-videos API response for the query/);
  assert.match(errors.join("\n"), /render the server query result in the UI/);
  assert.match(errors.join("\n"), /ready filter must be selected through the UI/);
  assert.match(errors.join("\n"), /ready filter must render ready rows/);
  assert.match(errors.join("\n"), /ready filter must render only ready status badges/);
});

test("local web sanity rejects weak admin preprocess web UI evidence", () => {
  const errors = validateAdminRealNasMatrixState(completeAdminRealNasMatrixState({
    preprocess_web: {
      ...completeAdminRealNasMatrixState().preprocess_web,
      current_index_visible: false,
      queued_count_visible: false,
      failed_count_visible: false,
      production_status_visible: false,
      visible_job_id_observed: false,
      log_job_id: "",
      log_record_source: "",
      log_content_char_count: 0,
      log_path_visible: false,
      log_content_visible: false,
      log_snapshot_visible: false
    }
  }));

  assert.match(errors.join("\n"), /preprocess web must display the current index version/);
  assert.match(errors.join("\n"), /preprocess web must display the queued preprocess count/);
  assert.match(errors.join("\n"), /preprocess web must display the failed preprocess count/);
  assert.match(errors.join("\n"), /preprocess web must display the API-derived production status title/);
  assert.match(errors.join("\n"), /preprocess web must render at least one real preprocess job id/);
});

test("local web sanity rejects weak admin cutter users web UI evidence", () => {
  const errors = validateAdminRealNasMatrixState(completeAdminRealNasMatrixState({
    cutter_users_web: {
      ...completeAdminRealNasMatrixState().cutter_users_web,
      api_user_count: 1,
      approved_count_visible: false,
      pending_count_visible: false,
      api_first_user_id: "",
      api_first_display_name: "",
      api_first_status_label: "",
      api_first_device_name: "",
      first_user_visible: false,
      first_device_visible: false,
      identity_note_visible: false,
      device_detail_visible: false,
      disable_action_visible: false,
      approve_action_visible: false,
      usage_metrics_labels_visible: ["活跃剪辑师"]
    }
  }));

  assert.match(errors.join("\n"), /user count must match/);
  assert.match(errors.join("\n"), /approved user count/);
  assert.match(errors.join("\n"), /pending user count/);
  assert.match(errors.join("\n"), /concrete first cutter user id/);
  assert.match(errors.join("\n"), /first cutter display name/);
  assert.match(errors.join("\n"), /first cutter status label/);
  assert.match(errors.join("\n"), /first cutter device name/);
  assert.match(errors.join("\n"), /render the first API cutter user/);
  assert.match(errors.join("\n"), /disable action/);
  assert.match(errors.join("\n"), /approve action/);
  assert.match(errors.join("\n"), /usage metrics must include 搜索次数/);
  assert.match(errors.join("\n"), /usage metrics must include 剪切成功/);
});

test("local web sanity does not require a real NAS write-action lock", () => {
  const state = completeAdminRealNasMatrixState({
    web_routes: completeAdminRealNasMatrixState().web_routes.map((route) =>
      route.route === "preprocess-jobs"
        ? { ...route, disabled_write_action_labels: ["重试失败"] }
        : route
    )
  });
  const errors = validateAdminRealNasMatrixState(state);

  assert.doesNotMatch(errors.join("\n"), /real NAS write actions disabled by default/);
});

test("local web sanity accepts the cutter multi-keyword search matrix", () => {
  assert.deepEqual(
    validateCutterSearchMatrixState(completeCutterSearchMatrixState(), completeSearchdIndexState()),
    []
  );
});

test("local web sanity accepts cutter local trusted auto-entry evidence", () => {
  assert.deepEqual(validateCutterAuthSanityState(completeCutterAuthState()), []);
});

test("local web sanity accepts cutter public library Web evidence", () => {
  assert.deepEqual(
    validateCutterPublicLibraryWebSanityState(completeCutterPublicLibraryWebState(), completeSearchdIndexState()),
    []
  );
});

test("local web sanity rejects weak cutter public library Web evidence", () => {
  const errors = validateCutterPublicLibraryWebSanityState(completeCutterPublicLibraryWebState({
    api_available_video_count: 1,
    api_returned_count: 0,
    api_first_source_video_id: "",
    web_api_response_observed: false,
    available_count_visible: false,
    first_title_visible: false,
    public_source_label_visible: false,
    selected_inspector_title: "其他素材"
  }), completeSearchdIndexState());

  assert.match(errors.join("\n"), /at least 50 public source videos/);
  assert.match(errors.join("\n"), /must return visible source videos/);
  assert.match(errors.join("\n"), /first source video id must be concrete/);
  assert.match(errors.join("\n"), /must observe the source-library API response/);
  assert.match(errors.join("\n"), /must display the available public source count/);
  assert.match(errors.join("\n"), /must render the first API source title/);
  assert.match(errors.join("\n"), /must show the public source library labels/);
  assert.match(errors.join("\n"), /inspector must select the first public source by default/);
});

test("local web sanity rejects cutter auth when a fresh local context remains gated", () => {
  const errors = validateCutterAuthSanityState(completeCutterAuthState({
    auth_mode: "reviewed",
    local_trusted: false,
    fresh_context_workbench_ready: false,
    login_gate_visible_after_ready: true,
    manual_apply_used: true,
    visible_username: ""
  }));

  assert.match(errors.join("\n"), /auth mode must be local_trusted/);
  assert.match(errors.join("\n"), /fresh context must reach the workbench/);
  assert.match(errors.join("\n"), /must not remain on the login gate/);
  assert.match(errors.join("\n"), /must not require manual application/);
});

test("local web sanity accepts local web layout overflow evidence", () => {
  assert.deepEqual(validateLocalWebLayoutSanityState(completeLocalWebLayoutState()), []);
});

test("local web layout does not require a preprocess write-action lock", () => {
  const errors = validateLocalWebLayoutSanityState(completeLocalWebLayoutState({
    admin_route_layouts: [
      completeRouteLayoutState({
        route: "source-videos",
        required_labels: [
          "公共素材资产清单",
          "素材来源",
          "已载入",
          "预处理状态",
          "搜索可见",
          "真实 NAS 写入动作",
          "未解锁"
        ],
        visible_labels: [
          "公共素材资产清单",
          "素材来源",
          "已载入",
          "预处理状态",
          "搜索可见",
          "真实 NAS 写入动作",
          "未解锁"
        ],
        disabled_write_action_labels: ["重试此视频", "保存封面", "保存公开说明"]
      }),
      completeRouteLayoutState({
        route: "preprocess-jobs",
        url: "http://127.0.0.1:5176/#/preprocess-jobs",
        required_labels: ["预处理流水线与索引发布", "真实 NAS 写入动作", "未解锁"],
        visible_labels: ["预处理流水线与索引发布", "真实 NAS 写入动作", "未解锁"],
        disabled_write_action_labels: ["重试失败"]
      })
    ]
  }));

  assert.doesNotMatch(errors.join("\n"), /real NAS write actions disabled by default/);
});

test("local web layout does not require a source video write-action lock", () => {
  const errors = validateLocalWebLayoutSanityState(completeLocalWebLayoutState({
    admin_route_layouts: [
      completeRouteLayoutState({
        route: "source-videos",
        required_labels: [
          "公共素材资产清单",
          "素材来源",
          "已载入",
          "预处理状态",
          "搜索可见",
          "真实 NAS 写入动作",
          "未解锁"
        ],
        visible_labels: [
          "公共素材资产清单",
          "素材来源",
          "已载入",
          "预处理状态",
          "搜索可见",
          "真实 NAS 写入动作",
          "未解锁"
        ],
        disabled_write_action_labels: ["保存公开说明"]
      }),
      completeRouteLayoutState({
        route: "preprocess-jobs",
        disabled_write_action_labels: [
          "重试失败",
          "发布待索引视频",
          "校验索引",
          "恢复处理中任务",
          "启动预处理流水线",
          "暂停预处理流水线"
        ]
      })
    ]
  }));

  assert.doesNotMatch(errors.join("\n"), /real NAS write actions disabled by default/);
});

test("local web sanity rejects admin and cutter horizontal layout overflow", () => {
  const errors = validateLocalWebLayoutSanityState(completeLocalWebLayoutState({
    admin_statusbar: {
      selector: ".admin-console-statusbar",
      client_width: 980,
      scroll_width: 1044,
      horizontal_overflow: true
    },
    admin_statusbar_item_overflow_count: 2,
    cutter_workbench: {
      selector: ".cutter-locator-workbench",
      client_width: 1118,
      scroll_width: 1190,
      horizontal_overflow: true
    },
    cutter_body: {
      selector: "body",
      client_width: 1440,
      scroll_width: 1510,
      horizontal_overflow: true
    }
  }));

  assert.match(errors.join("\n"), /admin statusbar must not overflow horizontally/);
  assert.match(errors.join("\n"), /admin statusbar items must not overflow horizontally/);
  assert.match(errors.join("\n"), /cutter workbench must not overflow horizontally/);
  assert.match(errors.join("\n"), /cutter body must not overflow horizontally/);
});

test("local web sanity rejects missing route layouts and route page overflow", () => {
  const errors = validateLocalWebLayoutSanityState(completeLocalWebLayoutState({
    admin_route_layouts: [
      completeRouteLayoutState({
        route: "source-videos",
        required_labels: [
          "公共素材资产清单",
          "素材来源",
          "已载入",
          "预处理状态",
          "搜索可见",
          "继续加载"
        ],
        visible_labels: [
          "公共素材资产清单",
          "素材来源",
          "已载入",
          "预处理状态",
          "搜索可见",
          "继续加载"
        ],
        disabled_write_action_labels: [],
        page: {
          selector: ".admin-main-column",
          client_width: 1180,
          scroll_width: 1220,
          horizontal_overflow: true
        }
      })
    ],
    cutter_route_layouts: [
      completeRouteLayoutState({
        app: "cutter",
        route: "material-locator",
        url: "http://127.0.0.1:5177/#material-locator?query=%E7%8E%B0%E9%87%91%E6%B5%81",
        required_labels: ["素材库", "搜索", "连接", "公共原素材", "视频文案", "选中当前命中"],
        visible_labels: ["公共原素材", "视频文案"]
      })
    ]
  }));

  assert.match(errors.join("\n"), /must verify all required admin routes/);
  assert.match(errors.join("\n"), /admin route source-videos page must not overflow horizontally/);
  assert.match(errors.join("\n"), /must verify all required cutter routes/);
  assert.match(errors.join("\n"), /route material-locator missing labels: 素材库/);
});

test("local web sanity rejects incomplete or unsafe admin dashboard evidence", () => {
  const errors = validateAdminDashboardSanityState(completeAdminDashboardState({
    visible_labels: ["核心链路健康", "关键词定位"],
    disabled_write_action_labels: [],
    active_cutter_capacity_label: "",
    active_cutter_count: 51,
    cutter_capacity: 49,
    current_index_version: "",
    search_p95_ms: 1001,
    local_search_coverage_percent: 79,
    search_failure_count: 2,
    body_sample: "核心链路健康 关键词定位 智能扫描 加入待剪率 5500% sk-live-secret"
  }));

  assert.match(errors.join("\n"), /公共素材库生产总览/);
  assert.match(errors.join("\n"), /完整文案/);
  assert.match(errors.join("\n"), /50-editor capacity/);
  assert.match(errors.join("\n"), /cutter_capacity must be at least 50/);
  assert.match(errors.join("\n"), /current_index_version must be a current index version/);
  assert.match(errors.join("\n"), /active_cutter_count must not exceed cutter_capacity/);
  assert.match(errors.join("\n"), /search_failure_count must be 0/);
  assert.match(errors.join("\n"), /four-digit conversion percentages/);
  assert.match(errors.join("\n"), /API keys or bearer tokens/);
});

test("local web sanity rejects searchd index drift from admin current index", () => {
  const errors = validateSearchdIndexSanityState(completeSearchdIndexState({
    admin_current_index_version: "v000028",
    index_version: "v000027",
    matched_admin_current_index: false
  }));

  assert.match(errors.join("\n"), /must match the admin current index version/);
});

test("local web sanity classifies only final index snapshot drift as retryable", () => {
  assert.equal(isLocalWebSanityIndexDriftOnly([
    "material locator search_index_version must match searchd index_version",
    "admin real NAS matrix current_index_version must match searchd index_version",
    "admin real NAS matrix index_current_version must match searchd index_version",
    "cutter search matrix query 现金流 index_version must match searchd index_version"
  ]), true);
  assert.equal(isLocalWebSanityIndexDriftOnly([
    "material locator search_index_version must match searchd index_version",
    "admin dashboard search_failure_count must be 0"
  ]), false);
  assert.equal(isLocalWebSanityIndexDriftOnly([]), false);
});

test("local web sanity accepts concrete hit-to-transcript locator evidence", () => {
  assert.deepEqual(validateMaterialLocatorSanityState(completeMaterialLocatorState()), []);
});

test("local web sanity accepts transcript header time at displayed-second precision", () => {
  assert.deepEqual(validateMaterialLocatorSanityState(completeMaterialLocatorState({
    transcript_header: "视频文案 当前 06:58 · 定位 1 / 25 · 本片命中 10 处 · 已选 1 句 · 文案 509字 上一个 下一个",
    current_hit_time_ms: "418803",
    current_hit_time_ms_value: 418803
  })), []);
});

test("local web sanity rejects transcript header time from a different displayed second", () => {
  const errors = validateMaterialLocatorSanityState(completeMaterialLocatorState({
    transcript_header: "视频文案 当前 06:57 · 定位 1 / 25 · 本片命中 10 处 · 已选 1 句 · 文案 509字 上一个 下一个",
    current_hit_time_ms: "418803",
    current_hit_time_ms_value: 418803
  }));

  assert.match(errors.join("\n"), /current hit time must match/);
});

test("local web sanity accepts the search-to-local-cut closed loop", () => {
  assert.deepEqual(validateMaterialLocatorClosedLoopState(completeClosedLoopState()), []);
});

test("local web sanity rejects missing or inconsistent selection proof strip", () => {
  const missing = validateMaterialLocatorClosedLoopState(completeClosedLoopState({
    selection_proof_text: ""
  }));
  assert.match(missing.join("\n"), /selection proof strip/);

  const inconsistent = validateMaterialLocatorClosedLoopState(completeClosedLoopState({
    selection_proof_text: "来源公共原素材时间段06:58 - 07:05字数4 字命中1/25"
  }));
  assert.match(inconsistent.join("\n"), /character count must match/);
});

test("local web sanity rejects vague or missing locator evidence", () => {
  const errors = validateMaterialLocatorSanityState(completeMaterialLocatorState({
    default_selected_material_section: "⌄ 本地素材（12）",
    candidate_count: 0,
    transcript_header: "视频文案 已选 0 句",
    current_hit_time_ms: "",
    current_hit_segment_id: ""
  }));

  assert.match(errors.join("\n"), /at least one candidate result/);
  assert.match(errors.join("\n"), /default-focus a public source result/);
  assert.match(errors.join("\n"), /data-current-hit-time-ms must be a millisecond integer/);
  assert.match(errors.join("\n"), /current hit segment id/);
  assert.match(errors.join("\n"), /exact current hit time/);
  assert.match(errors.join("\n"), /global hit position/);
  assert.match(errors.join("\n"), /current-video hit count/);
  assert.match(errors.join("\n"), /full transcript character count/);
});

test("local web sanity rejects inconsistent structured locator evidence", () => {
  const errors = validateMaterialLocatorSanityState(completeMaterialLocatorState({
    current_hit_time_ms_value: 1,
    global_hit_position: 0,
    global_hit_count: 0,
    current_video_hit_count: 0,
    selected_sentence_count: -1,
    full_transcript_char_count: 0
  }));

  assert.match(errors.join("\n"), /current_hit_time_ms_value must match/);
  assert.match(errors.join("\n"), /global_hit_position must be a positive integer/);
  assert.match(errors.join("\n"), /global_hit_count must be at least/);
  assert.match(errors.join("\n"), /current_video_hit_count must be a positive integer/);
  assert.match(errors.join("\n"), /selected_sentence_count must be a non-negative integer/);
  assert.match(errors.join("\n"), /full_transcript_char_count must be a positive integer/);
  assert.match(errors.join("\n"), /global_hit_position must match transcript header/);
});

test("local web sanity rejects locator counters that contradict each other", () => {
  const errors = validateMaterialLocatorSanityState(completeMaterialLocatorState({
    transcript_header: "视频文案 当前 11:58 · 定位 1 / 3 · 本片命中 5 处 · 已选 1 句 · 文案 509字 上一个 下一个",
    global_hit_count: 3,
    current_video_hit_count: 5
  }));

  assert.match(errors.join("\n"), /current_video_hit_count must not exceed global_hit_count/);
});

test("local web sanity rejects incomplete local cut closed-loop evidence", () => {
  const errors = validateMaterialLocatorClosedLoopState(completeClosedLoopState({
    selection_method: "select-current-hit",
    selected_text: "",
    selection_proof_text: "",
    selected_text_char_count: 0,
    selected_sentence_count: 1,
    selected_text_segment_count: 1,
    selected_text_is_broader_than_query: false,
    cut_notice: "等待文案选区",
    local_library_contains_selection: false,
    local_library_page_url: "http://127.0.0.1:5177/#material-locator",
    local_library_view_mode: "current-project",
    local_library_visible_clip_count: 0,
    local_library_visible_count_label: "",
    local_library_clip_title: "",
    local_library_source_title: "",
    local_library_clip_title_visible: false,
    local_library_source_title_visible: false,
    local_library_selected_text_visible: false,
    first_result_section: "公共原素材",
    second_result_section: "",
    local_clip_id: "",
    local_clip_media_file_path: "",
    local_clip_manifest_file_path: "",
    local_clip_media_file_exists: false,
    local_clip_media_file_size_bytes: 0,
    local_clip_manifest_file_exists: false,
    local_clip_manifest_file_size_bytes: 0,
    cut_job_id: "",
    cut_job_status: "pending",
    cut_job_export_clip_id: "",
    cut_job_output_file: "",
    cut_job_contains_selection: false,
    cut_tasks_page_contains_selection: false,
    cut_tasks_page_contains_output: false,
    cut_tasks_page_shows_done: false,
    cut_tasks_page_url: "http://127.0.0.1:5177/#local-library",
    cut_tasks_page_visible_status_label: "",
    cut_tasks_page_visible_output_file: "",
    cut_tasks_page_source_title: "",
    cut_tasks_page_source_title_visible: false,
    cut_tasks_page_time_range_label: "",
    cut_tasks_page_time_range_visible: false,
    public_library_root: "",
    local_output_is_outside_public_library: false,
    public_library_write_detected: true
  }));

  assert.match(errors.join("\n"), /transcript-drag selection/);
  assert.match(errors.join("\n"), /select transcript text/);
  assert.match(errors.join("\n"), /selected_text_char_count must be positive/);
  assert.match(errors.join("\n"), /at least two transcript sentences/);
  assert.match(errors.join("\n"), /at least two transcript segment texts/);
  assert.match(errors.join("\n"), /cut submission or completion feedback/);
  assert.match(errors.join("\n"), /local library must contain/);
  assert.match(errors.join("\n"), /local-library route/);
  assert.match(errors.join("\n"), /all-materials view/);
  assert.match(errors.join("\n"), /visible clip count/);
  assert.match(errors.join("\n"), /visible clip count label/);
  assert.match(errors.join("\n"), /generated local clip title/);
  assert.match(errors.join("\n"), /local clip source title/);
  assert.match(errors.join("\n"), /selected transcript text in the clip details/);
  assert.match(errors.join("\n"), /generated local_clip_id/);
  assert.match(errors.join("\n"), /local clip media file path/);
  assert.match(errors.join("\n"), /local clip manifest file path/);
  assert.match(errors.join("\n"), /media file must exist/);
  assert.match(errors.join("\n"), /media file size must be a positive integer/);
  assert.match(errors.join("\n"), /manifest file must exist/);
  assert.match(errors.join("\n"), /manifest file size must be a positive integer/);
  assert.match(errors.join("\n"), /completed cut_job_id/);
  assert.match(errors.join("\n"), /cut_job_status must be done/);
  assert.match(errors.join("\n"), /cut job export clip id/);
  assert.match(errors.join("\n"), /cut job output file/);
  assert.match(errors.join("\n"), /cut job must include/);
  assert.match(errors.join("\n"), /cut tasks page must show the selected/);
  assert.match(errors.join("\n"), /cut tasks page must show the completed output/);
  assert.match(errors.join("\n"), /cut tasks page must show the completed task status/);
  assert.match(errors.join("\n"), /cut-tasks route/);
  assert.match(errors.join("\n"), /visible completed status label/);
  assert.match(errors.join("\n"), /visible completed output file/);
  assert.match(errors.join("\n"), /visible source title/);
  assert.match(errors.join("\n"), /completed job source title/);
  assert.match(errors.join("\n"), /visible cut time range/);
  assert.match(errors.join("\n"), /completed job time range/);
  assert.match(errors.join("\n"), /more context than the keyword alone/);
  assert.match(errors.join("\n"), /public library root/);
  assert.match(errors.join("\n"), /outside the public NAS library root/);
  assert.match(errors.join("\n"), /must not write cutter outputs/);
});

test("local web sanity rejects selected text character count drift", () => {
  const errors = validateMaterialLocatorClosedLoopState(completeClosedLoopState({
    selected_text_char_count: 1
  }));

  assert.match(errors.join("\n"), /selected_text_char_count must match selected_text length/);
});

test("local web sanity rejects missing or empty local output file proof", () => {
  const errors = validateMaterialLocatorClosedLoopState(completeClosedLoopState({
    local_clip_media_file_exists: false,
    local_clip_media_file_size_bytes: 0,
    local_clip_manifest_file_exists: true,
    local_clip_manifest_file_size_bytes: 0
  }));

  assert.match(errors.join("\n"), /media file must exist/);
  assert.match(errors.join("\n"), /media file size must be a positive integer/);
  assert.match(errors.join("\n"), /manifest file size must be a positive integer/);
});

test("local web sanity rejects cut job evidence that does not map back to the generated local clip", () => {
  const errors = validateMaterialLocatorClosedLoopState(completeClosedLoopState({
    cut_job_export_clip_id: "E000999",
    cut_job_output_file: "export-clips/E000999/001-C0035.mp4"
  }));

  assert.match(errors.join("\n"), /cut job export clip id must match local_clip_id/);
  assert.match(errors.join("\n"), /cut job output file must reference local_clip_id/);
});

test("local web sanity rejects local cut outputs inside the public NAS library", () => {
  const errors = validateMaterialLocatorClosedLoopState(completeClosedLoopState({
    local_clip_media_file_path: "/Volumes/MixLab/PublicLibrary/.mixlab-library/videos/E000041/source.mp4",
    local_clip_manifest_file_path: "/Volumes/MixLab/PublicLibrary/export-clips/E000041/export-clip.json",
    local_output_is_outside_public_library: true,
    public_library_write_detected: false
  }));

  assert.match(errors.join("\n"), /local clip output paths must not be inside/);
});

test("local web sanity can write an audit report JSON artifact", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "mixlab-local-web-sanity-"));
  const reportPath = path.join(tempRoot, "nested", "local-web-sanity.json");

  try {
    await writeLocalWebSanityReport(completeLocalWebReport(), reportPath);
    const report = JSON.parse(await readFile(reportPath, "utf8")) as LocalWebSanityReport;

    assert.equal(report.ok, true);
    assert.equal(report.admin_dashboard?.active_cutter_capacity_label, "2/50 活跃剪辑师");
    assert.equal(report.admin_dashboard?.active_cutter_count, 2);
    assert.equal(report.admin_dashboard?.cutter_capacity, 50);
    assert.equal(report.admin_dashboard?.current_index_version, "v000027");
    assert.equal(report.admin_dashboard?.search_p95_ms, 47);
    assert.equal(report.admin_dashboard?.local_search_coverage_percent, 93);
    assert.equal(report.admin_dashboard?.search_failure_count, 0);
    assert.deepEqual(report.admin_dashboard?.disabled_write_action_labels, []);
    assert.equal(report.searchd_index?.index_version, "v000027");
    assert.equal(report.searchd_index?.matched_admin_current_index, true);
    assert.equal(report.admin_real_nas_matrix?.library_root, "/Volumes/MixLab/PublicLibrary");
    assert.equal(report.admin_real_nas_matrix?.source_ready_detail_id, "V000001");
    assert.equal(report.admin_real_nas_matrix?.source_ready_detail_ms, 98);
    assert.equal(report.admin_real_nas_matrix?.runtime_settings_ms, 580);
    assert.equal(report.admin_real_nas_matrix?.runtime_ffmpeg_available, true);
    assert.equal(report.admin_real_nas_matrix?.runtime_ffprobe_available, true);
    assert.equal(report.admin_real_nas_matrix?.source_video_web.source_path_visible, true);
    assert.equal(report.admin_real_nas_matrix?.source_video_web.first_page_first_id_visible, true);
    assert.equal(report.admin_real_nas_matrix?.source_video_web.loaded_count_increased, true);
    assert.equal(report.admin_real_nas_matrix?.source_video_web.query_response_observed, true);
    assert.equal(report.admin_real_nas_matrix?.source_video_web.ready_filter_all_visible_rows_ready, true);
    assert.equal(report.admin_real_nas_matrix?.preprocess_web.current_index_visible, true);
    assert.equal(report.admin_real_nas_matrix?.preprocess_web.queued_count_visible, true);
    assert.equal(report.admin_real_nas_matrix?.preprocess_web.failed_count_visible, true);
    assert.equal(report.admin_real_nas_matrix?.preprocess_web.production_status_visible, true);
    assert.equal(report.admin_real_nas_matrix?.preprocess_web.visible_job_id_observed, true);
    assert.equal(report.admin_real_nas_matrix?.web_routes.length, 5);
    assert.equal(report.cutter_search_matrix?.query_count, 3);
    assert.equal(report.cutter_search_matrix?.all_queries_used_searchd, true);
    assert.equal(report.cutter_search_matrix?.matched_searchd_index, true);
    assert.equal(report.cutter_public_library_web?.api_available_video_count, 120);
    assert.equal(report.cutter_public_library_web?.api_first_source_video_id, "V000001");
    assert.equal(report.cutter_public_library_web?.first_title_visible, true);
    assert.equal(report.cutter_public_library_web?.selected_inspector_title, "1.房产置换与资产优化");
    assert.equal(report.layout?.admin_statusbar.horizontal_overflow, false);
    assert.equal(report.layout?.admin_statusbar_item_overflow_count, 0);
    assert.equal(report.layout?.cutter_workbench.horizontal_overflow, false);
    assert.equal(report.layout?.cutter_body.horizontal_overflow, false);
    assert.equal(report.layout?.admin_route_layouts.length, 10);
    assert.equal(report.layout?.cutter_route_layouts.length, 10);
    assert.equal(
      report.layout?.admin_route_layouts.filter((route) => route.viewport_label === "compact").length,
      5
    );
    assert.equal(
      report.layout?.cutter_route_layouts.filter((route) => route.viewport_label === "compact").length,
      5
    );
    assert.equal(report.material_locator?.search_index_version, "");
    assert.equal(report.material_locator?.current_hit_time_ms_value, 718000);
    assert.equal(report.material_locator?.global_hit_position, 1);
    assert.equal(report.material_locator?.global_hit_count, 25);
    assert.equal(report.material_locator?.current_video_hit_count, 10);
    assert.equal(report.material_locator?.selected_sentence_count, 1);
    assert.equal(report.material_locator?.full_transcript_char_count, 509);
    assert.equal(report.material_locator_closed_loop?.selected_text?.includes("现金流"), true);
    assert.match(report.material_locator_closed_loop?.selection_proof_text ?? "", /来源公共原素材/);
    assert.match(report.material_locator_closed_loop?.selection_proof_text ?? "", /字数46 字/);
    assert.equal(report.material_locator_closed_loop?.selection_method, "transcript-drag");
    assert.equal(report.material_locator_closed_loop?.selected_sentence_count, 2);
    assert.equal(report.material_locator_closed_loop?.selected_text_segment_count, 2);
    assert.equal(report.material_locator_closed_loop?.selected_text_char_count, 46);
    assert.equal(report.material_locator_closed_loop?.selected_text_is_broader_than_query, true);
    assert.equal(report.material_locator_closed_loop?.local_library_view_mode, "all");
    assert.equal(report.material_locator_closed_loop?.local_library_selected_text_visible, true);
    assert.equal(report.material_locator_closed_loop?.local_library_clip_title_visible, true);
    assert.equal(report.material_locator_closed_loop?.local_library_source_title_visible, true);
    assert.equal(report.material_locator_closed_loop?.local_clip_media_file_exists, true);
    assert.equal(report.material_locator_closed_loop?.local_clip_media_file_size_bytes, 1024);
    assert.equal(report.material_locator_closed_loop?.local_clip_manifest_file_exists, true);
    assert.equal(report.material_locator_closed_loop?.local_clip_manifest_file_size_bytes, 512);
    assert.equal(report.material_locator_closed_loop?.cut_job_id, "CJ20260604-0001");
    assert.equal(report.material_locator_closed_loop?.cut_job_status, "done");
    assert.equal(report.material_locator_closed_loop?.cut_job_export_clip_id, "E000041");
    assert.equal(report.material_locator_closed_loop?.cut_tasks_page_shows_done, true);
    assert.equal(report.material_locator_closed_loop?.cut_tasks_page_visible_status_label, "已完成");
    assert.equal(report.material_locator_closed_loop?.cut_tasks_page_visible_output_file, "export-clips/E000041/001-C0035.mp4");
    assert.equal(report.material_locator_closed_loop?.cut_tasks_page_source_title_visible, true);
    assert.equal(report.material_locator_closed_loop?.cut_tasks_page_time_range_visible, true);
    assert.deepEqual(await validateLocalWebSanityReportFile(reportPath), {
      ok: true,
      path: reportPath,
      errors: []
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("local web sanity accepts a complete saved report", () => {
  assert.deepEqual(validateLocalWebSanityReport(completeLocalWebReport()), []);
});

test("local web sanity rejects selection proof hit counters that drift from the transcript header", () => {
  const errors = validateLocalWebSanityReport(completeLocalWebReport({
    material_locator: completeMaterialLocatorState({
      transcript_header: "视频文案 当前 11:58 · 定位 51 / 490 · 本片命中 10 处 · 已选 1 句 · 文案 509字 上一个 下一个",
      global_hit_position: 51,
      global_hit_count: 490
    }),
    material_locator_closed_loop: completeClosedLoopState({
      selection_proof_text: "来源公共原素材时间段06:58 - 07:05字数35 字命中50/489"
    })
  }));

  assert.match(errors.join("\n"), /selection proof global hit position must match transcript header/);
  assert.match(errors.join("\n"), /selection proof global hit count must match transcript header/);
});

test("local web sanity rejects incomplete saved reports", () => {
  const errors = validateLocalWebSanityReport(completeLocalWebReport({
    ok: false,
    errors: ["material locator failed"],
    endpoints: [
      { label: "admin web", url: "file:///tmp/admin.html", ok: true, status: 200 },
      { label: "cutter web", url: "http://127.0.0.1:5177/", ok: false, status: 500 }
    ],
    admin_dashboard: completeAdminDashboardState({
      active_cutter_count: 55,
      cutter_capacity: 50,
      search_p95_ms: 1001,
      local_search_coverage_percent: 70,
      search_failure_count: 1,
      body_sample: "核心链路健康 sk-live-secret"
    }),
    material_locator: completeMaterialLocatorState({
      query: "现金流"
    }),
    layout: completeLocalWebLayoutState({
      cutter_body: {
        selector: "body",
        client_width: 1440,
        scroll_width: 1510,
        horizontal_overflow: true
      }
    }),
    material_locator_closed_loop: completeClosedLoopState({
      selected_text: "现金流",
      selected_text_char_count: 3,
      selected_text_is_broader_than_query: false,
      local_library_contains_selection: false
    })
  }));

  assert.match(errors.join("\n"), /ok: true/);
  assert.match(errors.join("\n"), /errors must be empty/);
  assert.match(errors.join("\n"), /admin web endpoint URL must use http or https/);
  assert.match(errors.join("\n"), /cutter web endpoint must be ok with HTTP 200/);
  assert.match(errors.join("\n"), /active_cutter_count must not exceed cutter_capacity/);
  assert.match(errors.join("\n"), /search_failure_count must be 0/);
  assert.match(errors.join("\n"), /cutter body must not overflow horizontally/);
  assert.match(errors.join("\n"), /local library must contain/);
  assert.match(errors.join("\n"), /selected transcript text must include broader context/);
  assert.match(errors.join("\n"), /must not include secrets/);
});

test("local web sanity rejects material locator search index drift from searchd health", () => {
  const errors = validateLocalWebSanityReport(completeLocalWebReport({
    searchd_index: completeSearchdIndexState({
      index_version: "v000028",
      admin_current_index_version: "v000028"
    }),
    material_locator: completeMaterialLocatorState({
      search_status_text: "本地 searchd v000027 已同步 搜索服务 47ms NAS 只读",
      search_index_version: "v000027"
    })
  }));

  assert.match(errors.join("\n"), /material locator search_index_version must match searchd index_version/);
});

test("local web sanity rejects admin real NAS matrix index drift from searchd health", () => {
  const errors = validateLocalWebSanityReport(completeLocalWebReport({
    searchd_index: completeSearchdIndexState({
      index_version: "v000028",
      admin_current_index_version: "v000028"
    }),
    admin_real_nas_matrix: completeAdminRealNasMatrixState({
      current_index_version: "v000027",
      index_current_version: "v000027"
    })
  }));

  assert.match(errors.join("\n"), /admin real NAS matrix current_index_version must match searchd index_version/);
  assert.match(errors.join("\n"), /admin real NAS matrix index_current_version must match searchd index_version/);
});

test("local web sanity rejects selected text that is not covered by full transcript size", () => {
  const errors = validateLocalWebSanityReport(completeLocalWebReport({
    material_locator: completeMaterialLocatorState({
      transcript_header: "视频文案 当前 11:58 · 定位 1 / 25 · 本片命中 10 处 · 已选 1 句 · 文案 2字 上一个 下一个",
      full_transcript_char_count: 2
    }),
    material_locator_closed_loop: completeClosedLoopState({
      selected_text: "现金流"
    })
  }));

  assert.match(errors.join("\n"), /full_transcript_char_count must be greater than selected transcript text length/);
});

test("local web sanity can derive search p95 from older saved reports", () => {
  const report = completeLocalWebReport({
    admin_dashboard: {
      ...completeAdminDashboardState(),
      search_p95_ms: undefined as unknown as number,
      body_sample: "核心链路健康 关键词定位 完整文案 选段剪切 50 人容量 智能扫描 搜索 p95 88ms 本地搜索覆盖 93% 素材规模 活跃剪辑师 2/50 搜索失败 0"
    }
  });

  delete (report.admin_dashboard as unknown as { search_p95_ms?: number }).search_p95_ms;

  assert.deepEqual(validateLocalWebSanityReport(report), []);
});

test("local web sanity can derive local search coverage from older saved reports", () => {
  const report = completeLocalWebReport({
    admin_dashboard: {
      ...completeAdminDashboardState(),
      local_search_coverage_percent: undefined as unknown as number,
      body_sample: "核心链路健康 关键词定位 完整文案 选段剪切 50 人容量 智能扫描 搜索 p95 88ms 本地搜索覆盖 91% 素材规模 活跃剪辑师 2/50 搜索失败 0"
    }
  });

  delete (report.admin_dashboard as unknown as {
    local_search_coverage_percent?: number;
  }).local_search_coverage_percent;

  assert.deepEqual(validateLocalWebSanityReport(report), []);
});

test("local web sanity can derive material locator counters from older saved reports", () => {
  const report = completeLocalWebReport({
    material_locator: {
      ...completeMaterialLocatorState(),
      current_hit_time_ms_value: undefined as unknown as number,
      global_hit_position: undefined as unknown as number,
      global_hit_count: undefined as unknown as number,
      current_video_hit_count: undefined as unknown as number,
      selected_sentence_count: undefined as unknown as number,
      full_transcript_char_count: undefined as unknown as number
    }
  });

  delete (report.material_locator as unknown as {
    current_hit_time_ms_value?: number;
    global_hit_position?: number;
    global_hit_count?: number;
    current_video_hit_count?: number;
    selected_sentence_count?: number;
    full_transcript_char_count?: number;
  }).current_hit_time_ms_value;
  delete (report.material_locator as unknown as {
    current_hit_time_ms_value?: number;
    global_hit_position?: number;
    global_hit_count?: number;
    current_video_hit_count?: number;
    selected_sentence_count?: number;
    full_transcript_char_count?: number;
  }).global_hit_position;
  delete (report.material_locator as unknown as {
    current_hit_time_ms_value?: number;
    global_hit_position?: number;
    global_hit_count?: number;
    current_video_hit_count?: number;
    selected_sentence_count?: number;
    full_transcript_char_count?: number;
  }).global_hit_count;
  delete (report.material_locator as unknown as {
    current_hit_time_ms_value?: number;
    global_hit_position?: number;
    global_hit_count?: number;
    current_video_hit_count?: number;
    selected_sentence_count?: number;
    full_transcript_char_count?: number;
  }).current_video_hit_count;
  delete (report.material_locator as unknown as {
    current_hit_time_ms_value?: number;
    global_hit_position?: number;
    global_hit_count?: number;
    current_video_hit_count?: number;
    selected_sentence_count?: number;
    full_transcript_char_count?: number;
  }).selected_sentence_count;
  delete (report.material_locator as unknown as {
    current_hit_time_ms_value?: number;
    global_hit_position?: number;
    global_hit_count?: number;
    current_video_hit_count?: number;
    selected_sentence_count?: number;
    full_transcript_char_count?: number;
  }).full_transcript_char_count;

  assert.deepEqual(validateLocalWebSanityReport(report), []);
});

test("local web sanity can derive cutter capacity from older saved reports", () => {
  const report = completeLocalWebReport({
    admin_dashboard: {
      ...completeAdminDashboardState(),
      active_cutter_count: undefined as unknown as number,
      cutter_capacity: undefined as unknown as number,
      active_cutter_capacity_label: "17/50 活跃剪辑师",
      body_sample: "核心链路健康 关键词定位 完整文案 选段剪切 50 人容量 智能扫描 搜索 p95 88ms 本地搜索覆盖 93% 素材规模 活跃剪辑师 17/50 搜索失败 0"
    }
  });

  delete (report.admin_dashboard as unknown as {
    active_cutter_count?: number;
    cutter_capacity?: number;
  }).active_cutter_count;
  delete (report.admin_dashboard as unknown as {
    active_cutter_count?: number;
    cutter_capacity?: number;
  }).cutter_capacity;

  assert.deepEqual(validateLocalWebSanityReport(report), []);
});
