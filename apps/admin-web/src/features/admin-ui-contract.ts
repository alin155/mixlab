import type { AdminRoute } from "../app/navigation.ts";

export type AdminControlState = "local" | "m9b-api" | "native-boundary" | "read-only";

export interface AdminControlContract {
  route: AdminRoute;
  label: string;
  state: AdminControlState;
  reason: string;
}

export interface AdminPageContract {
  route: AdminRoute;
  label: string;
  goal: string;
  primaryQuestion: string;
  controls: readonly AdminControlContract[];
}

export const ADMIN_UI_ROUTES = [
  "dashboard",
  "source-videos",
  "preprocess-jobs",
  "doctor",
  "cutter-users",
  "settings"
] as const satisfies readonly AdminRoute[];

export const ADMIN_UI_PAGES: Record<AdminRoute, AdminPageContract> = {
  dashboard: {
    route: "dashboard",
    label: "仪表盘",
    goal: "看全局风险和产能",
    primaryQuestion: "公共素材库现在是否健康，生产是否在推进？",
    controls: [
      { route: "dashboard", label: "智能扫描", state: "m9b-api", reason: "扫描素材来源、运行健康诊断并生成下一步建议。" },
      { route: "dashboard", label: "启动预处理流水线", state: "m9b-api", reason: "智能扫描建议动作。" },
      { route: "dashboard", label: "重试失败", state: "m9b-api", reason: "M9B 接入失败重试接口。" }
    ]
  },
  "source-videos": {
    route: "source-videos",
    label: "原视频管理",
    goal: "管理公共素材资产与元数据",
    primaryQuestion: "哪些原视频可见、哪些还在生产、公开说明是否完整？",
    controls: [
      { route: "source-videos", label: "搜索原视频", state: "local", reason: "页面内筛选，不写入协议文件。" },
      { route: "source-videos", label: "筛选预处理状态", state: "local", reason: "页面内筛选，不写入协议文件。" },
      { route: "source-videos", label: "查看原视频", state: "local", reason: "页面内选择表格行。" },
      { route: "source-videos", label: "保存公开说明", state: "m9b-api", reason: "M9B 接入公开说明保存接口。" }
    ]
  },
  "source-detail": {
    route: "source-detail",
    label: "原视频详情",
    goal: "查看单个原视频的处理上下文",
    primaryQuestion: "这个原视频的公开信息和预处理状态是否完整？",
    controls: [
      { route: "source-detail", label: "返回原视频管理", state: "local", reason: "页面内导航。" }
    ]
  },
  "preprocess-jobs": {
    route: "preprocess-jobs",
    label: "预处理",
    goal: "监控预处理流水线和自动增量发布",
    primaryQuestion: "长时间预处理是否持续推进，可用视频是否自动发布给剪辑端搜索？",
    controls: [
      { route: "preprocess-jobs", label: "重试失败", state: "m9b-api", reason: "M9B 接入失败重试接口。" },
      { route: "preprocess-jobs", label: "启动预处理流水线", state: "m9b-api", reason: "扫描、入队、预处理并自动发布索引。" },
      { route: "preprocess-jobs", label: "暂停预处理流水线", state: "m9b-api", reason: "请求当前流水线在安全边界内暂停。" }
    ]
  },
  "index-publish": {
    route: "index-publish",
    label: "预处理",
    goal: "兼容旧索引入口并跳转到预处理",
    primaryQuestion: "旧索引页面是否被合并到预处理主路径？",
    controls: []
  },
  doctor: {
    route: "doctor",
    label: "健康诊断",
    goal: "诊断系统问题",
    primaryQuestion: "系统问题出现在哪里，管理员下一步该看什么？",
    controls: [
      { route: "doctor", label: "重新运行健康诊断", state: "m9b-api", reason: "M9B 接入健康诊断运行接口。" },
      { route: "doctor", label: "导出诊断报告", state: "m9b-api", reason: "M9B 接入报告导出。" }
    ]
  },
  "cutter-users": {
    route: "cutter-users",
    label: "剪辑师用户",
    goal: "管理剪辑师准入",
    primaryQuestion: "哪些剪辑师需要审批、停用或查看使用情况？",
    controls: [
      { route: "cutter-users", label: "查看剪辑师用户", state: "m9b-api", reason: "M9B 接入剪辑师用户列表接口。" },
      { route: "cutter-users", label: "通过申请", state: "m9b-api", reason: "M9B 接入剪辑师用户审核接口。" },
      { route: "cutter-users", label: "停用用户", state: "m9b-api", reason: "M9B 接入剪辑师用户停用接口。" }
    ]
  },
  settings: {
    route: "settings",
    label: "设置",
    goal: "配置素材来源和运行策略",
    primaryQuestion: "素材来源、音视频工具、语音识别和密钥配置是否满足运行要求？",
    controls: [
      { route: "settings", label: "编辑素材库名称", state: "local", reason: "页面内编辑，保存设置后写入管理配置。" },
      { route: "settings", label: "新增素材来源", state: "local", reason: "页面内新增素材来源，保存设置后写入管理配置。" },
      { route: "settings", label: "启用素材来源", state: "local", reason: "页面内切换素材来源启用状态，保存设置后生效。" },
      { route: "settings", label: "移除素材来源", state: "local", reason: "页面内移除非默认素材来源，保存设置后生效。" },
      { route: "settings", label: "选择音频模式", state: "local", reason: "页面内选择预处理音频模式，保存设置后写入管理配置。" },
      { route: "settings", label: "保存设置", state: "m9b-api", reason: "M10 接入素材来源和运行策略保存接口。" },
      { route: "settings", label: "测试语音识别配置", state: "m9b-api", reason: "M9B 接入语音识别配置检测。" }
    ]
  }
};

export function listAdminControlsByState(state: AdminControlState): AdminControlContract[] {
  return ADMIN_UI_ROUTES.flatMap((route) =>
    ADMIN_UI_PAGES[route].controls.filter((control) => control.state === state)
  );
}

export function adminPageContract(route: AdminRoute): AdminPageContract {
  return ADMIN_UI_PAGES[route];
}
