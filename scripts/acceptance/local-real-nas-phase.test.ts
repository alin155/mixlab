import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { auditLocalRealNasPhaseArtifacts } from "./local-real-nas-phase.ts";
import { syncLocalWebRealNasRecord } from "./sync-local-web-real-nas-record.ts";

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function routeLayout(input: {
  app: "admin" | "cutter";
  route: string;
  url: string;
  viewport_label: "desktop" | "compact";
  required_labels: string[];
  visible_labels?: string[];
  disabled_write_action_labels?: string[];
}): Record<string, unknown> {
  const viewportWidth = input.viewport_label === "compact" ? 1024 : 1440;
  const viewportHeight = input.viewport_label === "compact" ? 768 : 960;
  const pageWidth = input.viewport_label === "compact"
    ? input.app === "admin" ? 958 : 958
    : input.app === "admin" ? 922 : input.route === "material-locator" ? 1260 : 1164;

  return {
    app: input.app,
    route: input.route,
    url: input.url,
    viewport_label: input.viewport_label,
    viewport_width: viewportWidth,
    viewport_height: viewportHeight,
    required_labels: input.required_labels,
    visible_labels: input.visible_labels ?? input.required_labels,
    disabled_write_action_labels: input.disabled_write_action_labels ?? [],
    body: {
      selector: "body",
      client_width: viewportWidth,
      scroll_width: viewportWidth,
      horizontal_overflow: false
    },
    page: {
      selector: input.app === "admin" ? ".admin-main-column" : `[data-page='${input.route}']`,
      client_width: pageWidth,
      scroll_width: pageWidth,
      horizontal_overflow: false
    }
  };
}

function routeMatrix(app: "admin" | "cutter"): Record<string, unknown>[] {
  const adminRoutes = [
    {
      route: "source-videos",
      url: "http://127.0.0.1:5176/#/source-videos",
      labels: [
        "公共素材资产清单",
        "素材来源",
        "已载入",
        "预处理状态",
        "搜索可见",
        "真实 NAS 安全边界",
        "真实 NAS 写入动作",
        "未解锁",
        "只读观察",
        "人工确认"
      ],
      disabled_write_action_labels: ["重试此视频", "保存封面", "保存公开说明"]
    },
    {
      route: "preprocess-jobs",
      url: "http://127.0.0.1:5176/#/preprocess-jobs",
      labels: [
        "预处理流水线与索引发布",
        "生产状态",
        "真实 NAS 安全边界",
        "真实 NAS 写入动作",
        "未解锁",
        "只读观察",
        "人工确认",
        "本机工作区",
        "扫描素材",
        "生成文案",
        "当前索引",
        "队列中"
      ],
      disabled_write_action_labels: [
        "重试失败",
        "发布待索引视频",
        "校验索引",
        "恢复处理中任务",
        "启动预处理流水线",
        "暂停预处理流水线"
      ]
    },
    {
      route: "doctor",
      url: "http://127.0.0.1:5176/#/doctor",
      labels: ["健康诊断", "诊断系统问题", "诊断报告", "通过", "失败"]
    },
    {
      route: "cutter-users",
      url: "http://127.0.0.1:5176/#/cutter-users",
      labels: ["登录申请与使用统计", "剪辑师用户", "活跃剪辑师", "搜索失败", "剪切成功"]
    },
    {
      route: "settings",
      url: "http://127.0.0.1:5176/#/settings",
      labels: ["素材来源与运行策略", "素材库基本信息", "运行策略", "语音识别配置", "接口密钥", "已隐藏"]
    }
  ];
  const cutterRoutes = [
    {
      route: "material-locator",
      url: "http://127.0.0.1:5177/#material-locator?query=%E7%8E%B0%E9%87%91%E6%B5%81",
      labels: ["本地 searchd", "公共原素材", "视频文案", "选中当前命中"]
    },
    {
      route: "cut-tasks",
      url: "http://127.0.0.1:5177/#cut-tasks",
      labels: ["剪切任务", "本机剪切流水线"]
    },
    {
      route: "local-library",
      url: "http://127.0.0.1:5177/#local-library",
      labels: ["本地素材库", "本地可复剪素材"]
    },
    {
      route: "public-library",
      url: "http://127.0.0.1:5177/#public-library",
      labels: ["公共素材库", "可用原素材"]
    },
    {
      route: "settings",
      url: "http://127.0.0.1:5177/#settings",
      labels: ["运行环境", "设置", "公共素材库挂载"]
    }
  ];
  const routes = app === "admin" ? adminRoutes : cutterRoutes;

  return ["desktop", "compact"].flatMap((viewportLabel) =>
    routes.map((route) => routeLayout({
      app,
      route: route.route,
      url: route.url,
      viewport_label: viewportLabel as "desktop" | "compact",
      required_labels: route.labels,
      disabled_write_action_labels: "disabled_write_action_labels" in route
        ? route.disabled_write_action_labels
        : []
    }))
  );
}

function completeLocalWebReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ok: true,
    errors: [],
    endpoints: [
      { label: "admin web", url: "http://127.0.0.1:5176/", ok: true, status: 200 },
      { label: "cutter web", url: "http://127.0.0.1:5177/", ok: true, status: 200 },
      { label: "searchd", url: "http://127.0.0.1:3799/health", ok: true, status: 200 }
    ],
    admin_dashboard: {
      url: "http://127.0.0.1:5176/#/dashboard",
      title: "MixLab 素材库管理端",
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
      active_cutter_capacity_label: "17/50 活跃剪辑师",
      active_cutter_count: 17,
      cutter_capacity: 50,
      current_index_version: "v002701",
      search_p95_ms: 395,
      local_search_coverage_percent: 100,
      search_failure_count: 0,
      disabled_write_action_labels: ["智能扫描"],
      body_sample: "核心链路健康 关键词定位 完整文案 选段剪切 50 人容量 智能扫描 当前索引 v002701 搜索 p95 395ms 本地搜索覆盖 100% 素材规模 活跃剪辑师 17/50 搜索失败 0"
    },
    searchd_index: {
      url: "http://127.0.0.1:3799/health",
      ok: true,
      admin_current_index_version: "v002701",
      index_version: "v002701",
      source_video_count: 2701,
      segment_count: 391709,
      matched_admin_current_index: true
    },
    admin_real_nas_matrix: {
      admin_api_base_url: "http://127.0.0.1:3889/",
      library_root: "/Volumes/MixLab/PublicLibrary",
      source_videos_path: "/data/PublicLibrary/source-videos",
      video_count: 11394,
      ready_video_count: 2700,
      queued_video_count: 8433,
      processing_video_count: 1,
      failed_video_count: 257,
      index_required_video_count: 3,
      current_index_version: "v002701",
      settings_source_folder_count: 1,
      enabled_source_folder_count: 1,
      settings_include_real_nas_path: true,
      source_ready_sample_count: 5,
      source_ready_detail_id: "V000001",
      source_ready_detail_ms: 638,
      source_ready_detail_visible_to_cutters: true,
      source_ready_detail_transcript_segment_count: 78,
      source_ready_detail_transcript_char_count: 2481,
      source_ready_detail_index_version: "v002701",
      runtime_settings_ms: 67,
      runtime_ffmpeg_available: true,
      runtime_ffprobe_available: true,
      runtime_asr_key_configured: true,
      preprocess_job_count: 13,
      preprocess_active_count: 1,
      preprocess_queued_count: 8433,
      preprocess_failed_count: 257,
      preprocess_supervisor_state: "idle",
      index_version_count: 80,
      index_current_version: "v002701",
      cutter_user_count: 19,
      source_video_list: {
        page_size: 50,
        first_page_count: 50,
        second_page_count: 50,
        first_page_first_id: "V000001",
        second_page_first_id: "V000051",
        pages_are_distinct: true,
        first_page_ms: 120,
        second_page_ms: 98,
        ready_filter_count: 50,
        ready_filter_all_ready: true,
        ready_filter_ms: 88,
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
        total_count_before: 2701,
        load_more_button_label: "继续加载 100 条",
        load_more_clicked: true,
        loaded_count_after: 200,
        total_count_after: 2701,
        loaded_count_increased: true,
        query: "资产",
        query_result_id: "V000001",
        query_response_observed: true,
        query_result_visible: true,
        query_result_count_text: "显示 1-20 / 已返回 20",
        query_result_matches_api: true,
        ready_filter_selected_value: "ready",
        ready_filter_response_observed: true,
        ready_filter_result_count_text: "显示 1-100 / 已返回 100",
        ready_filter_visible_status_count: 100,
        ready_filter_all_visible_rows_ready: true
      },
      preprocess_web: {
        url: "http://127.0.0.1:5176/#/preprocess-jobs",
        current_index_version: "v002701",
        current_index_visible: true,
        source_video_count: 11394,
        source_video_count_visible: true,
        active_count: 1,
        active_count_visible: true,
        queued_count: 8433,
        queued_count_visible: true,
        failed_count: 257,
        failed_count_visible: true,
        index_required_video_count: 3,
        index_required_visible: true,
        production_status_title: "1 个处理中任务需要恢复",
        production_status_visible: true,
        public_library_root_visible: true,
        visible_job_id: "J001440",
        visible_job_id_observed: true,
        log_job_id: "J001440",
        log_record_source: "preprocess-job",
        log_content_char_count: 620,
        log_path_visible: true,
        log_content_visible: true,
        log_snapshot_visible: true
      },
      cutter_users_web: {
        url: "http://127.0.0.1:5176/#/cutter-users",
        api_user_count: 19,
        api_approved_count: 18,
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
      web_routes: routeMatrix("admin").slice(0, 5).map((route) => ({
        route: route.route,
        url: route.url,
        required_labels: route.required_labels,
        visible_labels: route.visible_labels,
        disabled_write_action_labels: route.disabled_write_action_labels
      })),
      read_only_actions_skipped: [
        "queue-unprocessed",
        "retry-failed",
        "recover-processing",
        "start-supervisor",
        "stop-supervisor",
        "doctor-run",
        "settings-save"
      ]
    },
    cutter_search_matrix: {
      cutter_api_base_url: "http://127.0.0.1:3789/",
      query_count: 3,
      max_search_ms: 27,
      all_queries_used_searchd: true,
      matched_searchd_index: true,
      queries: ["现金流", "利润", "客户"].map((query, index) => ({
        query,
        group_count: 3,
        returned_count: 3,
        index_version: "v002701",
        search_mode: "searchd",
        search_ms: 20 + index,
        first_source_video_id: `V00000${index + 1}`,
        first_hit_count: 3,
        first_segment_id: `V00000${index + 1}-S000001`,
        first_segment_begin_ms: 1000 + index,
        first_segment_contains_query: true,
        first_segment_has_match_range: true
      }))
    },
    cutter_auth: {
      cutter_api_base_url: "http://127.0.0.1:3789/",
      auth_mode_url: "http://127.0.0.1:3789/cutter/auth/mode",
      auth_mode: "local_trusted",
      local_trusted: true,
      trusted_username: "本机剪辑师",
      material_locator_url: "http://127.0.0.1:5177/#material-locator?query=%E7%8E%B0%E9%87%91%E6%B5%81",
      fresh_context_workbench_ready: true,
      login_gate_visible_after_ready: false,
      manual_apply_used: false,
      visible_username: "本机剪辑师"
    },
    cutter_public_library_web: {
      cutter_api_base_url: "http://127.0.0.1:3789/",
      url: "http://127.0.0.1:5177/#public-library",
      api_available_video_count: 2701,
      api_returned_count: 100,
      api_first_source_video_id: "V000001",
      api_first_title: "1.房产置换与资产优化",
      web_api_response_observed: true,
      available_count_visible: true,
      first_title_visible: true,
      public_source_label_visible: true,
      selected_inspector_title: "1.房产置换与资产优化"
    },
    layout: {
      admin_source_videos_url: "http://127.0.0.1:5176/#/source-videos",
      cutter_material_locator_url: "http://127.0.0.1:5177/#material-locator?query=%E7%8E%B0%E9%87%91%E6%B5%81",
      viewport_width: 1440,
      viewport_height: 960,
      admin_statusbar: {
        selector: ".admin-console-statusbar",
        client_width: 920,
        scroll_width: 920,
        horizontal_overflow: false
      },
      admin_statusbar_item_overflow_count: 0,
      cutter_workbench: {
        selector: ".cutter-locator-workbench",
        client_width: 1260,
        scroll_width: 1260,
        horizontal_overflow: false
      },
      cutter_body: {
        selector: "body",
        client_width: 1440,
        scroll_width: 1440,
        horizontal_overflow: false
      },
      admin_route_layouts: routeMatrix("admin"),
      cutter_route_layouts: routeMatrix("cutter")
    },
    material_locator: {
      url: "http://127.0.0.1:5177/#material-locator?query=%E7%8E%B0%E9%87%91%E6%B5%81",
      query: "现金流",
      default_selected_material_section: "⌄ 公共原素材（111）",
      candidate_count: 147,
      search_status_text: "本地 searchd v002701 已同步 搜索服务 454ms NAS 只读",
      search_index_version: "v002701",
      transcript_header: "视频文案 当前 06:58 · 定位 37 / 471 · 本片命中 3 处 · 已选 1 句 · 文案 2,513字 上一个 下一个 极速剪切 精准剪切",
      current_hit_time_ms: "418803",
      current_hit_time_ms_value: 418803,
      current_hit_segment_id: "V000303-S000071",
      global_hit_position: 37,
      global_hit_count: 471,
      current_video_hit_count: 3,
      selected_sentence_count: 1,
      full_transcript_char_count: 2513
    },
    material_locator_closed_loop: {
      selection_method: "transcript-drag",
      selected_text: "当然第二个就强制储蓄，第三个是潜在的养老金准备，第四个是现金流的转换。保险可以转换现金流吗？",
      selection_proof_text: "来源 公共原素材 时间段 06:58 - 07:06 字数 46 字 命中 37/471",
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
      first_result_section: "⌄ 本地素材（35）",
      second_result_section: "⌄ 公共原素材（111）",
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
      public_library_write_detected: false
    },
    ...overrides
  };
}

function completeNasConcurrencyReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const searchQueries = ["现金流", "利润", "客户", "增长", "品牌"];
  const editorSessions = Array.from({ length: 50 }, (_, index) => {
    const suffix = String(index + 1).padStart(2, "0");
    const sourceVideoId = `V${String(index + 1).padStart(6, "0")}`;
    const selectedHash = String(index + 1).padStart(64, "0");
    const searchQuery = searchQueries[index % searchQueries.length]!;

    return {
      user_id: `CU-REAL-NAS-${suffix}`,
      username: `target-editor-${suffix}`,
      workspace_id: `workspace-${suffix}`,
      source_video_id: sourceVideoId,
      selected_segment_id: `${sourceVideoId}-S000001`,
      search_query: searchQuery,
      search_result_source_video_id: sourceVideoId,
      search_result_rank: index + 1,
      search_result_group_count: 50,
      search_result_limit: 50,
      search_result_segment_id: `${sourceVideoId}-S000001`,
      search_result_begin_char: 0,
      search_result_end_char: searchQuery.length,
      search_result_text_sha256: sha256Hex(searchQuery),
      full_transcript_source_video_id: sourceVideoId,
      full_transcript_segment_id: `${sourceVideoId}-S000001`,
      full_transcript_segment_count: 4,
      full_transcript_begin_char: 0,
      full_transcript_end_char: 96,
      full_transcript_char_count: 96,
      full_transcript_text_sha256: sha256Hex(`full transcript ${sourceVideoId}`),
      selected_text_begin_char: 0,
      selected_text_end_char: 24,
      selected_text_char_count: 24,
      selected_text_sha256: selectedHash,
      selected_begin_ms: 0,
      selected_end_ms: 1500,
      local_clip_id: `E${String(index + 1).padStart(6, "0")}`,
      local_clip_source_video_id: sourceVideoId,
      local_clip_selected_text_sha256: selectedHash,
      local_clip_relative_path: `.mixlab-library/videos/E${String(index + 1).padStart(6, "0")}/source.mp4`,
      local_clip_file_size_bytes: 18_000 + index,
      local_clip_content_sha256: sha256Hex(`local clip ${sourceVideoId}`),
      local_clip_begin_ms: 0,
      local_clip_end_ms: 1500,
      search_backend: "searchd",
      search_index_version: "v002701",
      location_verified: true,
      completed_closed_loop: true,
      workspace_output_written: true,
      public_library_written: false,
      search_ms: 46.3 + index,
      detail_ms: 7.1 + index,
      cut_ms: 7 + index
    };
  });

  return {
    status: "passed",
    editor_count: 50,
    active_user_count: 50,
    distinct_source_video_count: 50,
    search_query_count: searchQueries.length,
    search_queries: searchQueries,
    search_query_distribution: Object.fromEntries(
      searchQueries.map((query) => [query, editorSessions.filter((session) => session.search_query === query).length])
    ),
    indexed_source_video_count: 2701,
    indexed_transcript_segment_count: 391709,
    search_index_version: "v002701",
    searchd_health_index_version: "v002701",
    searchd_health_source_video_count: 2701,
    searchd_health_segment_count: 391709,
    all_searches_passed: true,
    all_cuts_written_to_local_workspaces: true,
    public_library_not_written_by_cutters: true,
    no_cross_workspace_outputs: true,
    search_sla_ms: 1000,
    detail_sla_ms: 1000,
    cut_sla_ms: 1000,
    metrics: {
      search: { count: 50, min_ms: 46.3, p50_ms: 180.1, p95_ms: 321.8, max_ms: 326 },
      detail: { count: 50, min_ms: 7.1, p50_ms: 126.2, p95_ms: 187, max_ms: 270.4 },
      cut: { count: 50, min_ms: 7, p50_ms: 159.9, p95_ms: 284.1, max_ms: 362.1 },
      usage: {
        search_request_count: 50,
        searchd_search_count: 50,
        search_failure_count: 0,
        source_detail_view_count: 50,
        transcript_selection_count: 50,
        cut_submission_count: 50,
        cut_success_count: 50,
        local_clip_count: 50,
        active_user_count: 50
      }
    },
    editor_sessions: editorSessions,
    ...overrides
  };
}

function acceptanceRecordText(): string {
  return [
    "This local Web preflight does not complete ACC-008.",
    "This local Web preflight does not complete ACC-009.",
    "Preprocess route safety labels: 真实 NAS 安全边界, 只读观察, 人工确认, 本机工作区.",
    "Dashboard write action lock labels: 智能扫描.",
    "Preprocess write action lock labels: 重试失败, 发布待索引视频, 校验索引, 恢复处理中任务, 启动预处理流水线, 暂停预处理流水线.",
    "Source videos write action lock labels: 重试此视频, 保存封面, 保存公开说明.",
    "local Web snapshot v002701 2701 source videos 391709 transcript segments search p95 395.",
    "Admin source videos Web UI source path visible true first server id V000001 loaded count 100 -> 200 query 资产 source-videos API response true rendered V000001 ready filter ready ready API response true ready status badges 100.",
    "Admin preprocess Web UI current index v002701 source count 11394 queued count 8433 failed count 257 production status 1 个处理中任务需要恢复 visible job J001440 log job J001440 log source preprocess-job log chars 620.",
    "Admin cutter users Web UI user count 19 approved users 18 pending users 1 first user CU000001 Allen first device Windows 剪辑端 · Edge.",
    "Cutter public library Web UI available count 2701 returned count 100 first source V000001 title 1.房产置换与资产优化.",
    "local Web material query 现金流 candidate count 147 selection method transcript-drag selection proof 来源 公共原素材 时间段 06:58 - 07:06 字数 46 字 命中 37/471 selected text chars 46 selected sentence count 2 selected text segment count 2 local clip E000041 cut job CJ20260604-0001.",
    "Local library page proof route http://127.0.0.1:5177/#local-library view all visible clip count 41 clip title 001-C0035.mp4 source 1.房产置换与资产优化.",
    "Cut task tracking route http://127.0.0.1:5177/#cut-tasks status 已完成 output export-clips/E000041/001-C0035.mp4 source 1.房产置换与资产优化 time 06:58 - 07:06.",
    "## 50-Editor Real NAS Source-Machine Rehearsal",
    "Latest verified values from the 2026-06-03 50-editor source-machine run:",
    "50-editor snapshot v002701 2701 source videos 391709 transcript segments.",
    "Search backend: every editor used searchd across 5 distinct queries 现金流, 利润, 客户, 增长, 品牌.",
    "50-editor p95 values search 321.8 detail 187 cut 284.1."
  ].join("\n");
}

function syncableAcceptanceRecordText(): string {
  return [
    "This local Web preflight does not complete ACC-008.",
    "This local Web preflight does not complete ACC-009.",
    "Preprocess route safety labels: 真实 NAS 安全边界, 只读观察, 人工确认, 本机工作区.",
    "Dashboard write action lock labels: 智能扫描.",
    "Preprocess write action lock labels: 重试失败, 发布待索引视频, 校验索引, 恢复处理中任务, 启动预处理流水线, 暂停预处理流水线.",
    "Source videos write action lock labels: 重试此视频, 保存封面, 保存公开说明.",
    "## 50-Editor Real NAS Source-Machine Rehearsal",
    "Latest verified values from the 2026-06-03 50-editor source-machine run:",
    "- Status: stale.",
    "- Search index: stale.",
    "- Indexed real NAS scale: stale.",
    "- Active editors: stale.",
    "- Distinct source videos covered by the 50 editors: stale.",
    "- Search backend: stale.",
    "- Search latency: stale.",
    "- Full transcript detail latency: stale.",
    "- Local cut submission latency: stale.",
    "- Usage loop counts: stale.",
    "- The rehearsal asserts local workspace isolation with stale.",
    "## Latest Evidence",
    "- Searchd health: `index_version = v000000`, `source_video_count = 1`, `segment_count = 1`.",
    "- Searchd/admin index parity: stale.",
    "- Admin real NAS matrix: stale.",
    "- Admin source video list: stale.",
    "- Admin source videos Web UI: stale.",
    "- Admin preprocess Web UI: stale.",
    "- Admin cutter users Web UI: stale.",
    "- Admin source videos write lock: stale.",
    "- Admin Web route matrix: source videos, preprocessing, Doctor, cutter users, and settings routes all rendered with required labels.",
    "- Admin write lock: the preprocessing route recorded `disabled_write_action_labels` for `重试失败`, `发布待索引视频`, `校验索引`, `恢复处理中任务`, `启动预处理流水线`, and `暂停预处理流水线`.",
    "- Cutter Web route layout matrix: Material Locator, cut tasks, local library, public library, and settings routes all rendered with required labels.",
    "- Cutter search matrix: stale.",
    "- Cutter public library Web UI: stale.",
    "- Cutter search status: stale.",
    "- Admin dashboard: stale.",
    "- Admin dashboard write lock: stale.",
    "- Admin dashboard funnel guard: stale.",
    "- Material Locator query: `现金流`.",
    "- Candidate count: `1`.",
    "- Default selected material section: stale.",
    "- Current hit: stale.",
    "- Full transcript context: stale.",
    "- Closed loop: stale.",
    "- Local library page proof: stale.",
    "- Output file proof: stale.",
    "- Cut task tracking: stale.",
    "- Write protection: stale.",
    "- Layout: admin and cutter route layout checks passed.",
    "- Admin API performance fix verified during this run: stale.",
    "- Search/detail performance fix verified after this run: retained.",
    "## Verification Commands",
    "- `npm run smoke:real-nas-50-editor`: stale.",
    "- `npm run audit:local-real-nas-phase`: passed with `ok: true`, local Web snapshot `v000000`, and 50-editor snapshot `v002701`.",
    "## Manual Test Focus",
    "- Expected index signal: stale.",
    "- Expected library scale: stale.",
    "- Expected dashboard write lock: stale.",
    "- Expected admin write lock: preprocessing write actions remain disabled.",
    "- Expected source videos write lock: stale.",
    "- Expected search result shape: stale.",
    "- Expected transcript locator shape: stale.",
    "- Expected selection proof: stale.",
    "- Expected cut feedback: stale."
  ].join("\n");
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function withPhaseFixture<T>(input: {
  local_web_report?: Record<string, unknown>;
  real_nas_50_report?: Record<string, unknown>;
  acceptance_record_text?: string;
}, fn: (paths: {
  root: string;
  local_web_report_path: string;
  real_nas_50_report_path: string;
  acceptance_record_path: string;
}) => Promise<T>): Promise<T> {
  const root = await mkdtemp(path.join(os.tmpdir(), "mixlab-local-real-nas-phase-"));
  const paths = {
    root,
    local_web_report_path: path.join(root, "local-web-sanity.json"),
    real_nas_50_report_path: path.join(root, "real-nas-50-editor-report.json"),
    acceptance_record_path: path.join(root, "local-web-real-nas.md")
  };

  try {
    await writeJson(paths.local_web_report_path, input.local_web_report ?? completeLocalWebReport());
    await writeJson(paths.real_nas_50_report_path, input.real_nas_50_report ?? completeNasConcurrencyReport());
    await writeFile(paths.acceptance_record_path, input.acceptance_record_text ?? acceptanceRecordText(), "utf8");
    return await fn(paths);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("local real NAS phase audit accepts complete saved source-machine evidence", async () => {
  await withPhaseFixture({}, async (paths) => {
    const report = await auditLocalRealNasPhaseArtifacts(paths);

    assert.equal(report.ok, true);
    assert.deepEqual(report.errors, []);
    assert.equal(report.local_web?.index_version, "v002701");
    assert.equal(report.local_web?.source_video_count, 2701);
    assert.equal(report.local_web?.source_video_web_first_id, "V000001");
    assert.equal(report.local_web?.source_video_web_loaded_after, 200);
    assert.equal(report.local_web?.source_video_web_query_response_observed, true);
    assert.equal(report.local_web?.source_video_web_ready_filter_all_visible_rows_ready, true);
    assert.deepEqual(report.local_web?.dashboard_write_action_lock_labels, ["智能扫描"]);
    assert.deepEqual(report.local_web?.preprocess_safety_labels, [
      "真实 NAS 安全边界",
      "只读观察",
      "人工确认",
      "本机工作区"
    ]);
    assert.deepEqual(report.local_web?.preprocess_write_action_lock_labels, [
      "重试失败",
      "发布待索引视频",
      "校验索引",
      "恢复处理中任务",
      "启动预处理流水线",
      "暂停预处理流水线"
    ]);
    assert.equal(report.local_web?.material_query, "现金流");
    assert.equal(report.local_web?.material_candidate_count, 147);
    assert.equal(report.local_web?.selection_method, "transcript-drag");
    assert.equal(report.local_web?.selection_proof_text, "来源 公共原素材 时间段 06:58 - 07:06 字数 46 字 命中 37/471");
    assert.equal(report.local_web?.selected_text_char_count, 46);
    assert.equal(report.local_web?.selected_sentence_count, 2);
    assert.equal(report.local_web?.selected_text_segment_count, 2);
    assert.equal(report.local_web?.selected_text_is_broader_than_query, true);
    assert.equal(report.local_web?.local_clip_id, "E000041");
    assert.equal(report.local_web?.cut_job_id, "CJ20260604-0001");
    assert.equal(report.local_web?.public_library_write_detected, false);
    assert.equal(report.real_nas_50?.index_version, "v002701");
    assert.equal(report.real_nas_50?.detail_p95_ms, 187);
  });
});

test("local real NAS phase audit rejects mixed searchd snapshots across local Web and 50-editor reports", async () => {
  const mixedSnapshotReport = completeNasConcurrencyReport({
    indexed_source_video_count: 2702,
    indexed_transcript_segment_count: 391718,
    search_index_version: "v002702",
    searchd_health_index_version: "v002702",
    searchd_health_source_video_count: 2702,
    searchd_health_segment_count: 391718
  });
  for (const session of mixedSnapshotReport.editor_sessions as Record<string, unknown>[]) {
    session.search_index_version = "v002702";
  }

  await withPhaseFixture({
    real_nas_50_report: mixedSnapshotReport,
    acceptance_record_text: acceptanceRecordText().replace(
      "50-editor snapshot v002701 2701 source videos 391709 transcript segments.",
      "50-editor snapshot v002702 2702 source videos 391718 transcript segments."
    )
  }, async (paths) => {
    const report = await auditLocalRealNasPhaseArtifacts(paths);

    assert.equal(report.ok, false);
    assert.match(report.errors.join("\n"), /local Web and 50-editor reports must use the same search index version/);
    assert.match(report.errors.join("\n"), /local Web and 50-editor source video counts must match/);
    assert.match(report.errors.join("\n"), /local Web and 50-editor transcript segment counts must match/);
  });
});

test("local real NAS phase audit rejects p95 latency above the millisecond target", async () => {
  const localWebReport = completeLocalWebReport();
  localWebReport.admin_dashboard.search_p95_ms = 1001;
  const slowReport = completeNasConcurrencyReport({
    metrics: {
      ...completeNasConcurrencyReport().metrics,
      search: { count: 50, min_ms: 100, p50_ms: 600, p95_ms: 1001, max_ms: 1002 },
      detail: { count: 50, min_ms: 100, p50_ms: 600, p95_ms: 1001, max_ms: 1002 },
      cut: { count: 50, min_ms: 100, p50_ms: 600, p95_ms: 1001, max_ms: 1002 }
    }
  });

  await withPhaseFixture({
    local_web_report: localWebReport,
    real_nas_50_report: slowReport
  }, async (paths) => {
    const report = await auditLocalRealNasPhaseArtifacts(paths);

    assert.equal(report.ok, false);
    assert.match(report.errors.join("\n"), /local web admin search_p95_ms must be a finite millisecond value no higher than 1000/);
    assert.match(report.errors.join("\n"), /50-editor search p95 must be a finite millisecond value no higher than 1000/);
    assert.match(report.errors.join("\n"), /50-editor detail p95 must be a finite millisecond value no higher than 1000/);
    assert.match(report.errors.join("\n"), /50-editor cut p95 must be a finite millisecond value no higher than 1000/);
  });
});

test("local Web record sync rewrites volatile evidence from the saved sanity report", async () => {
  await withPhaseFixture({
    acceptance_record_text: syncableAcceptanceRecordText()
  }, async (paths) => {
    const before = await auditLocalRealNasPhaseArtifacts(paths);
    assert.equal(before.ok, false);
    assert.match(before.errors.join("\n"), /acceptance record must include local web transcript segment count: 391709/);

    const sync = await syncLocalWebRealNasRecord(paths);
    assert.equal(sync.ok, true);
    assert.equal(sync.changed, true);
    assert.match(sync.replacements.join("\n"), /Searchd health/);
    assert.match(sync.replacements.join("\n"), /Expected cut feedback/);

    const text = await readFile(paths.acceptance_record_path, "utf8");
    assert.match(text, /v002701/);
    assert.match(text, /source_video_count = 2701/);
    assert.match(text, /Admin source videos Web UI/);
    assert.match(text, /load-more changed loaded count `100 -> 200`/);
    assert.match(text, /query `资产` observed a source-videos API response \(`true`\) and rendered `V000001`/);
    assert.match(text, /Admin preprocess Web UI/);
    assert.match(text, /production status `1 个处理中任务需要恢复`/);
    assert.match(text, /opened log job `J001440`/);
    assert.match(text, /log record source `preprocess-job`/);
    assert.match(text, /rendered `620` log characters/);
    assert.match(text, /Admin cutter users Web UI/);
    assert.match(text, /rendered `19` cutter users/);
    assert.match(text, /`18` approved users/);
    assert.match(text, /`1` pending users/);
    assert.match(text, /first API user `CU000001` \/ `Allen`/);
    assert.match(text, /first device `Windows 剪辑端 · Edge`/);
    assert.match(text, /Cutter public library Web UI/);
    assert.match(text, /first API source `V000001` \/ `1\.房产置换与资产优化`/);
    assert.match(text, /across `5` distinct queries \(`现金流`, `利润`, `客户`, `增长`, `品牌`\)/);
    assert.match(text, /Admin source videos write lock/);
    assert.match(text, /Admin dashboard write lock/);
    assert.match(text, /Expected dashboard write lock/);
    assert.match(text, /智能扫描/);
    assert.match(text, /Expected source videos write lock/);
    assert.match(text, /保存封面/);
    assert.match(text, /transcript-drag/);
    assert.match(text, /selection_proof_text = 来源 公共原素材 时间段 06:58 - 07:06 字数 46 字 命中 37\/471/);
    assert.match(text, /selected_sentence_count = 2/);
    assert.match(text, /selected_text_segment_count = 2/);
    assert.match(text, /E000041/);
    assert.match(text, /CJ20260604-0001/);
    assert.match(text, /Local library page proof/);
    assert.match(text, /displayed `41` current-view clips/);
    assert.match(text, /generated clip title `001-C0035\.mp4`/);
    assert.match(text, /route `http:\/\/127\.0\.0\.1:5177\/#cut-tasks` showed selected text/);
    assert.match(text, /time range `06:58 - 07:06`/);
    assert.match(text, /status `已完成`/);
    assert.doesNotMatch(text, /v000000/);

    const after = await auditLocalRealNasPhaseArtifacts(paths);
    assert.equal(after.ok, true);
    assert.deepEqual(after.errors, []);
  });
});

test("local real NAS phase audit rejects acceptance records that omit current evidence values", async () => {
  await withPhaseFixture({
    acceptance_record_text: acceptanceRecordText().replace("284.1", "old-cut-p95")
  }, async (paths) => {
    const report = await auditLocalRealNasPhaseArtifacts(paths);

    assert.equal(report.ok, false);
    assert.match(report.errors.join("\n"), /acceptance record must include 50-editor cut p95: 284\.1/);
  });
});

test("local real NAS phase audit rejects records that omit local Web closed-loop evidence", async () => {
  await withPhaseFixture({
    acceptance_record_text: acceptanceRecordText().replaceAll("E000041", "missing-local-clip")
  }, async (paths) => {
    const report = await auditLocalRealNasPhaseArtifacts(paths);

    assert.equal(report.ok, false);
    assert.match(report.errors.join("\n"), /acceptance record must include local web local clip id: E000041/);
  });
});

test("local real NAS phase audit rejects weak 50-editor closed-loop reports", async () => {
  const weakReport = completeNasConcurrencyReport({
    status: "failed",
    editor_count: 49
  });

  await withPhaseFixture({
    real_nas_50_report: weakReport
  }, async (paths) => {
    const report = await auditLocalRealNasPhaseArtifacts(paths);

    assert.equal(report.ok, false);
    assert.match(report.errors.join("\n"), /50-editor report self-check failed/);
    assert.match(report.errors.join("\n"), /status must be "passed"/);
  });
});

test("local real NAS phase audit rejects private text or secret markers in 50-editor reports", async () => {
  const privateReport = completeNasConcurrencyReport();
  const sessions = privateReport.editor_sessions as Record<string, unknown>[];
  sessions[0] = {
    ...sessions[0],
    full_text: "完整文案不应进入 50 人报告",
    diagnostics_note: "Authorization: Bearer should-not-leave-target"
  };

  await withPhaseFixture({
    real_nas_50_report: privateReport
  }, async (paths) => {
    const report = await auditLocalRealNasPhaseArtifacts(paths);

    assert.equal(report.ok, false);
    assert.match(report.errors.join("\n"), /50-editor report self-check failed/);
    assert.match(report.errors.join("\n"), /forbidden private transcript, secret, or signed URL field/);
    assert.match(report.errors.join("\n"), /forbidden secret\/private marker/);
  });
});
