import type { AdminRoute } from "../app/navigation.ts";

export type AdminControlState = "local" | "m9b-api" | "native-boundary" | "read-only";
export type AdminDockerMvpControlDisposition = "enabled" | "disabled" | "hidden" | "read-only";
export type AdminPageRole =
  | "overview"
  | "guardrail-center"
  | "asset-management"
  | "record-detail"
  | "pipeline-monitor"
  | "publish-console"
  | "user-management"
  | "system-diagnostics"
  | "configuration"
  | "audit";
export type AdminPagePrimarySurface =
  | "status-overview"
  | "gate-overview"
  | "asset-table"
  | "record-detail"
  | "queue-table"
  | "publication-queue"
  | "user-table"
  | "diagnostic-report"
  | "settings-form"
  | "audit-timeline";
export type AdminPageSupportSurface =
  | "background-metrics"
  | "read-model-status"
  | "metadata-inspector"
  | "process-history"
  | "index-version-list"
  | "usage-summary"
  | "export-actions"
  | "runtime-diagnostics"
  | "path-runtime-probes"
  | "restore-plan"
  | "none";
export type AdminPageInspectorRequirement = "required" | "optional" | "not-applicable";
export type AdminPageErrorBoundary = "shell" | "route-local";
export type AdminPageDashboardCoupling = "self-only" | "forbidden";
export type AdminPageAllowedDataSource =
  | "admin-read-model"
  | "admin-settings"
  | "command-snapshot"
  | "data-loading-contract"
  | "doctor-probes"
  | "index-version-packages"
  | "library-manifest"
  | "operation-log"
  | "path-checks"
  | "read-model-reconcile"
  | "runtime-secrets"
  | "source-video-manifest"
  | "supervisor-runtime"
  | "user-store";

export interface AdminControlContract {
  route: AdminRoute;
  label: string;
  state: AdminControlState;
  reason: string;
}

export interface AdminPageDataLoadingContract {
  route_plan: AdminRoute;
  load_phase: "shell" | "route-entry";
  expected_endpoints: readonly string[];
  allowed_data_sources: readonly AdminPageAllowedDataSource[];
  hidden_full_scan_allowed: false;
  dashboard_coupling: AdminPageDashboardCoupling;
}

export interface AdminPageCompositionContract {
  role: AdminPageRole;
  primary_surface: AdminPagePrimarySurface;
  support_surface: AdminPageSupportSurface;
  inspector: AdminPageInspectorRequirement;
  error_boundary: AdminPageErrorBoundary;
}

export interface AdminPageContract {
  route: AdminRoute;
  label: string;
  goal: string;
  primaryQuestion: string;
  composition: AdminPageCompositionContract;
  data_loading: AdminPageDataLoadingContract;
  controls: readonly AdminControlContract[];
}

export const ADMIN_UI_ROUTES = [
  "dashboard",
  "protection",
  "source-videos",
  "preprocess-jobs",
  "index-publish",
  "cutter-users",
  "doctor",
  "settings",
  "operation-log"
] as const satisfies readonly AdminRoute[];

export const ADMIN_DOCKER_MVP_UI_ROUTES = [
  "dashboard",
  "source-videos",
  "preprocess-jobs",
  "cutter-users",
  "doctor"
] as const satisfies readonly AdminRoute[];

const adminDockerMvpDisabledControls = new Set<string>([
  "dashboard:扫描新增素材",
  "dashboard:执行下一步建议",
  "source-videos:发布到剪辑端",
  "source-videos:保存封面",
  "source-videos:保存素材信息",
  "preprocess-jobs:发布到剪辑端"
]);

const adminDockerMvpHiddenRoutes = new Set<AdminRoute>([
  "protection",
  "index-publish",
  "settings",
  "operation-log"
]);

export const ADMIN_UI_PAGES: Record<AdminRoute, AdminPageContract> = {
  dashboard: {
    route: "dashboard",
    label: "总览",
    goal: "看全局风险和产能",
    primaryQuestion: "公共素材库现在是否健康，生产是否在推进？",
    composition: {
      role: "overview",
      primary_surface: "status-overview",
      support_surface: "background-metrics",
      inspector: "optional",
      error_boundary: "shell"
    },
    data_loading: {
      route_plan: "dashboard",
      load_phase: "shell",
      expected_endpoints: [
        "/api/admin/library/status",
        "/api/admin/settings/config",
        "/api/admin/preprocess/supervisor/status",
        "/api/admin/data-loading/plan"
      ],
      allowed_data_sources: [
        "library-manifest",
        "admin-settings",
        "supervisor-runtime",
        "data-loading-contract"
      ],
      hidden_full_scan_allowed: false,
      dashboard_coupling: "self-only"
    },
    controls: [
      { route: "dashboard", label: "扫描新增素材", state: "m9b-api", reason: "扫描素材来源、检查系统状态并生成下一步建议。" },
      { route: "dashboard", label: "执行下一步建议", state: "m9b-api", reason: "根据当前生产状态执行启动预处理、重试失败、恢复任务或发布索引。" }
    ]
  },
  "source-videos": {
    route: "source-videos",
    label: "素材库",
    goal: "管理公共素材资产与元数据",
    primaryQuestion: "哪些原视频可见、哪些还在生产、公开说明是否完整？",
    composition: {
      role: "asset-management",
      primary_surface: "asset-table",
      support_surface: "metadata-inspector",
      inspector: "required",
      error_boundary: "route-local"
    },
    data_loading: {
      route_plan: "source-videos",
      load_phase: "route-entry",
      expected_endpoints: ["/api/admin/source-videos"],
      allowed_data_sources: ["admin-read-model"],
      hidden_full_scan_allowed: false,
      dashboard_coupling: "forbidden"
    },
    controls: [
      { route: "source-videos", label: "搜索原视频", state: "local", reason: "页面内筛选，不写入协议文件。" },
      { route: "source-videos", label: "筛选预处理状态", state: "local", reason: "页面内筛选，不写入协议文件。" },
      { route: "source-videos", label: "查看原视频", state: "local", reason: "页面内选择表格行。" },
      { route: "source-videos", label: "加入预处理", state: "m9b-api", reason: "在当前素材详情中将未处理原视频加入预处理队列。" },
      { route: "source-videos", label: "重新处理", state: "m9b-api", reason: "在当前素材详情中重试失败原视频。" },
      { route: "source-videos", label: "恢复到队列", state: "m9b-api", reason: "在当前素材详情中恢复卡住的处理中任务。" },
      { route: "source-videos", label: "发布到剪辑端", state: "m9b-api", reason: "在当前素材详情中发布待索引视频。" },
      { route: "source-videos", label: "保存封面", state: "m9b-api", reason: "选择新封面后保存当前素材封面图片。" },
      { route: "source-videos", label: "保存素材信息", state: "m9b-api", reason: "保存当前素材标题、标签、说明和分类。" }
    ]
  },
  "source-detail": {
    route: "source-detail",
    label: "原视频详情",
    goal: "查看单个原视频的处理上下文",
    primaryQuestion: "这个原视频的公开信息和预处理状态是否完整？",
    composition: {
      role: "record-detail",
      primary_surface: "record-detail",
      support_surface: "metadata-inspector",
      inspector: "required",
      error_boundary: "route-local"
    },
    data_loading: {
      route_plan: "source-detail",
      load_phase: "route-entry",
      expected_endpoints: ["/api/admin/source-videos/:id"],
      allowed_data_sources: ["source-video-manifest"],
      hidden_full_scan_allowed: false,
      dashboard_coupling: "forbidden"
    },
    controls: [
      { route: "source-detail", label: "返回素材库", state: "local", reason: "页面内导航。" }
    ]
  },
  "preprocess-jobs": {
    route: "preprocess-jobs",
    label: "预处理",
    goal: "监控预处理流水线和自动增量发布",
    primaryQuestion: "长时间预处理是否持续推进，可用视频是否自动发布给剪辑端搜索？",
    composition: {
      role: "pipeline-monitor",
      primary_surface: "queue-table",
      support_surface: "process-history",
      inspector: "optional",
      error_boundary: "route-local"
    },
    data_loading: {
      route_plan: "preprocess-jobs",
      load_phase: "route-entry",
      expected_endpoints: [
        "/api/admin/preprocess/jobs",
        "/api/admin/preprocess/process-history",
        "/api/admin/preprocess/process-history/readiness",
        "/api/admin/index/versions"
      ],
      allowed_data_sources: ["admin-read-model", "index-version-packages"],
      hidden_full_scan_allowed: false,
      dashboard_coupling: "forbidden"
    },
    controls: [
      { route: "preprocess-jobs", label: "启动预处理", state: "m9b-api", reason: "扫描、入队、预处理并自动发布索引。" },
      { route: "preprocess-jobs", label: "暂停预处理", state: "m9b-api", reason: "暂停当前预处理。" },
      { route: "preprocess-jobs", label: "重试失败视频", state: "m9b-api", reason: "将失败视频重新加入预处理队列。" },
      { route: "preprocess-jobs", label: "恢复卡住任务", state: "m9b-api", reason: "将停留在处理中的任务恢复到队列。" },
      { route: "preprocess-jobs", label: "发布到剪辑端", state: "m9b-api", reason: "发布完成预处理但尚未进入搜索索引的视频。" },
      { route: "preprocess-jobs", label: "详情", state: "m9b-api", reason: "查看单条任务的处理记录。" }
    ]
  },
  "index-publish": {
    route: "index-publish",
    label: "发布与索引",
    goal: "保证已处理素材进入剪辑端搜索",
    primaryQuestion: "哪些 ready 素材尚未发布，当前索引是否安全可用？",
    composition: {
      role: "publish-console",
      primary_surface: "publication-queue",
      support_surface: "index-version-list",
      inspector: "optional",
      error_boundary: "route-local"
    },
    data_loading: {
      route_plan: "index-publish",
      load_phase: "route-entry",
      expected_endpoints: ["/api/admin/source-videos", "/api/admin/index/versions"],
      allowed_data_sources: ["admin-read-model", "index-version-packages"],
      hidden_full_scan_allowed: false,
      dashboard_coupling: "forbidden"
    },
    controls: [
      { route: "index-publish", label: "查看索引版本", state: "read-only", reason: "只读查看当前索引和最近版本，不写入协议数据。" },
      { route: "index-publish", label: "发布到剪辑端", state: "m9b-api", reason: "发布完成预处理但尚未进入搜索索引的视频。" },
      { route: "index-publish", label: "校验索引", state: "m9b-api", reason: "运行系统检查并校验当前索引。" }
    ]
  },
  protection: {
    route: "protection",
    label: "保护中心",
    goal: "集中查看发布门禁和运行保护",
    primaryQuestion: "当前管理端是否允许继续预处理、发布 Docker，哪些门禁还阻塞？",
    composition: {
      role: "guardrail-center",
      primary_surface: "gate-overview",
      support_surface: "read-model-status",
      inspector: "optional",
      error_boundary: "route-local"
    },
    data_loading: {
      route_plan: "protection",
      load_phase: "route-entry",
      expected_endpoints: [
        "/api/admin/operations/overview",
        "/api/admin/read-model/reconcile/status"
      ],
      allowed_data_sources: ["data-loading-contract", "read-model-reconcile"],
      hidden_full_scan_allowed: false,
      dashboard_coupling: "forbidden"
    },
    controls: [
      { route: "protection", label: "查看发布门禁", state: "read-only", reason: "只读聚合 release-gates、磁盘、读模型和路径状态。" },
      { route: "protection", label: "查看读模型状态", state: "read-only", reason: "确认管理端状态读模型是否新鲜，不写入协议数据。" },
      { route: "protection", label: "查看数据加载策略", state: "read-only", reason: "确认页面打开不会触发隐藏全库扫描。" }
    ]
  },
  doctor: {
    route: "doctor",
    label: "系统检查",
    goal: "检查系统状态",
    primaryQuestion: "系统问题出现在哪里，管理员下一步该看什么？",
    composition: {
      role: "system-diagnostics",
      primary_surface: "diagnostic-report",
      support_surface: "runtime-diagnostics",
      inspector: "optional",
      error_boundary: "route-local"
    },
    data_loading: {
      route_plan: "doctor",
      load_phase: "route-entry",
      expected_endpoints: [
        "/api/admin/doctor/report",
        "/api/admin/runtime/diagnostics/history"
      ],
      allowed_data_sources: ["doctor-probes", "admin-read-model"],
      hidden_full_scan_allowed: false,
      dashboard_coupling: "forbidden"
    },
    controls: [
      { route: "doctor", label: "重新检查", state: "m9b-api", reason: "重新检查路径、索引、工具和预处理产物。" },
      { route: "doctor", label: "导出检查报告", state: "m9b-api", reason: "导出当前检查结果，便于排障留档。" }
    ]
  },
  "cutter-users": {
    route: "cutter-users",
    label: "剪辑师",
    goal: "管理剪辑师准入",
    primaryQuestion: "哪些剪辑师需要审批、停用或查看使用情况？",
    composition: {
      role: "user-management",
      primary_surface: "user-table",
      support_surface: "usage-summary",
      inspector: "optional",
      error_boundary: "route-local"
    },
    data_loading: {
      route_plan: "cutter-users",
      load_phase: "route-entry",
      expected_endpoints: ["/api/admin/cutter-users"],
      allowed_data_sources: ["user-store"],
      hidden_full_scan_allowed: false,
      dashboard_coupling: "forbidden"
    },
    controls: [
      { route: "cutter-users", label: "查看剪辑师", state: "m9b-api", reason: "查看剪辑师申请、状态和使用统计。" },
      { route: "cutter-users", label: "通过申请", state: "m9b-api", reason: "允许待审核剪辑师进入剪辑端。" },
      { route: "cutter-users", label: "重置密码", state: "m9b-api", reason: "为剪辑师设置新密码并清除旧登录会话。" },
      { route: "cutter-users", label: "停用用户", state: "m9b-api", reason: "停用后该剪辑师现有登录凭证会失效。" }
    ]
  },
  settings: {
    route: "settings",
    label: "设置",
    goal: "配置素材来源和预处理参数",
    primaryQuestion: "素材来源、音视频工具、语音识别和密钥配置是否满足运行要求？",
    composition: {
      role: "configuration",
      primary_surface: "settings-form",
      support_surface: "path-runtime-probes",
      inspector: "optional",
      error_boundary: "route-local"
    },
    data_loading: {
      route_plan: "settings",
      load_phase: "route-entry",
      expected_endpoints: ["/api/admin/library/path-checks", "/api/admin/settings/runtime"],
      allowed_data_sources: ["admin-settings", "path-checks", "runtime-secrets"],
      hidden_full_scan_allowed: false,
      dashboard_coupling: "forbidden"
    },
    controls: [
      { route: "settings", label: "编辑素材库名称", state: "local", reason: "页面内编辑，保存设置后写入管理配置。" },
      { route: "settings", label: "新增素材来源", state: "local", reason: "页面内新增素材来源，保存设置后写入管理配置。" },
      { route: "settings", label: "启用素材来源", state: "local", reason: "页面内切换素材来源启用状态，保存设置后生效。" },
      { route: "settings", label: "移除素材来源", state: "local", reason: "页面内移除非默认素材来源，保存设置后生效。" },
      { route: "settings", label: "选择音频模式", state: "local", reason: "页面内选择预处理音频模式，保存设置后写入管理配置。" },
      { route: "settings", label: "初始化素材库", state: "m9b-api", reason: "仅在协议目录或 library.json 缺失时显示，用于创建公共素材库协议树。" },
      { route: "settings", label: "保存设置", state: "m9b-api", reason: "保存素材来源和预处理参数。" },
      { route: "settings", label: "检查语音识别", state: "m9b-api", reason: "检查当前语音识别配置是否可用。" }
    ]
  },
  "operation-log": {
    route: "operation-log",
    label: "操作记录",
    goal: "查看管理端维护和审计轨迹",
    primaryQuestion: "哪些管理端维护动作影响了读模型、保护状态或发布门禁？",
    composition: {
      role: "audit",
      primary_surface: "audit-timeline",
      support_surface: "restore-plan",
      inspector: "optional",
      error_boundary: "route-local"
    },
    data_loading: {
      route_plan: "operation-log",
      load_phase: "route-entry",
      expected_endpoints: ["/api/admin/operation-log"],
      allowed_data_sources: ["operation-log"],
      hidden_full_scan_allowed: false,
      dashboard_coupling: "forbidden"
    },
    controls: [
      { route: "operation-log", label: "查看最近事件", state: "read-only", reason: "只读查看管理端操作记录，不写入协议数据。" },
      { route: "operation-log", label: "查看读模型失效原因", state: "read-only", reason: "确认是哪类命令让 admin.sqlite 需要对账。" },
      { route: "operation-log", label: "查看恢复预检", state: "read-only", reason: "只读查看选中命令快照的恢复计划。" },
      { route: "operation-log", label: "准备恢复", state: "local", reason: "页面内进入恢复确认状态，不写入协议数据。" },
      { route: "operation-log", label: "确认执行恢复", state: "m9b-api", reason: "执行命令快照恢复；后端重新预检、获取写入锁并写入审计。" }
    ]
  }
};

export function listAdminControlsByState(state: AdminControlState): AdminControlContract[] {
  return ADMIN_UI_ROUTES.flatMap((route) =>
    ADMIN_UI_PAGES[route].controls.filter((control) => control.state === state)
  );
}

export function adminDockerMvpControlDisposition(
  control: AdminControlContract
): AdminDockerMvpControlDisposition {
  if (adminDockerMvpHiddenRoutes.has(control.route)) {
    return "hidden";
  }

  if (control.state === "read-only") {
    return "read-only";
  }

  if (adminDockerMvpDisabledControls.has(`${control.route}:${control.label}`)) {
    return "disabled";
  }

  return "enabled";
}

export function listAdminDockerMvpControlsByDisposition(
  disposition: AdminDockerMvpControlDisposition
): AdminControlContract[] {
  return ADMIN_UI_ROUTES.flatMap((route) =>
    ADMIN_UI_PAGES[route].controls.filter((control) =>
      adminDockerMvpControlDisposition(control) === disposition
    )
  );
}

export function adminPageContract(route: AdminRoute): AdminPageContract {
  return ADMIN_UI_PAGES[route];
}
