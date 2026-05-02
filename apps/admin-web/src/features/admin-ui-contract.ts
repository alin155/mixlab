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
  "library-settings",
  "source-videos",
  "preprocess-jobs",
  "index-publish",
  "doctor",
  "settings"
] as const satisfies readonly AdminRoute[];

export const ADMIN_UI_PAGES: Record<AdminRoute, AdminPageContract> = {
  dashboard: {
    route: "dashboard",
    label: "仪表盘",
    goal: "看全局风险和产能",
    primaryQuestion: "公共素材库现在是否健康，生产是否在推进？",
    controls: [
      { route: "dashboard", label: "扫描源视频", state: "m9b-api", reason: "M9B 接入扫描接口。" },
      { route: "dashboard", label: "处理未处理", state: "m9b-api", reason: "M9B 接加入队接口。" },
      { route: "dashboard", label: "Doctor", state: "m9b-api", reason: "M9B 接入 Doctor 运行接口。" },
      { route: "dashboard", label: "重试失败", state: "m9b-api", reason: "M9B 接入失败重试接口。" }
    ]
  },
  "library-settings": {
    route: "library-settings",
    label: "公共素材库设置",
    goal: "保证库能初始化和读写",
    primaryQuestion: "公共素材库路径、协议目录和权限是否满足生产要求？",
    controls: [
      { route: "library-settings", label: "初始化素材库", state: "m9b-api", reason: "M9B 接入初始化接口。" },
      { route: "library-settings", label: "扫描源视频", state: "m9b-api", reason: "M9B 接入扫描接口。" },
      { route: "library-settings", label: "打开文件夹", state: "native-boundary", reason: "浏览器不能直接唤起本机 Finder。" },
      { route: "library-settings", label: "导出诊断", state: "m9b-api", reason: "M9B 接入 Doctor JSON 导出。" }
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
      { route: "source-videos", label: "保存公开说明", state: "m9b-api", reason: "M9B 接入 metadata 保存接口。" },
      { route: "source-videos", label: "扫描新增视频", state: "m9b-api", reason: "M9B 接入扫描接口。" },
      { route: "source-videos", label: "处理未处理", state: "m9b-api", reason: "M9B 接加入队接口。" },
      { route: "source-videos", label: "重试失败视频", state: "m9b-api", reason: "M9B 接入失败重试接口。" },
      { route: "source-videos", label: "查看 Manifest", state: "read-only", reason: "M9A 只呈现入口，JSON 查看器另行实现。" }
    ]
  },
  "preprocess-jobs": {
    route: "preprocess-jobs",
    label: "预处理任务",
    goal: "控制生产队列",
    primaryQuestion: "长时间预处理是否持续推进，失败视频是否可隔离重试？",
    controls: [
      { route: "preprocess-jobs", label: "处理未处理", state: "m9b-api", reason: "M9B 接加入队接口。" },
      { route: "preprocess-jobs", label: "重试失败", state: "m9b-api", reason: "M9B 接入失败重试接口。" },
      { route: "preprocess-jobs", label: "启动 Worker", state: "native-boundary", reason: "长期 Worker 由服务端脚本或桌面壳托管。" }
    ]
  },
  "index-publish": {
    route: "index-publish",
    label: "索引健康与修复",
    goal: "保证 ready 视频可搜索",
    primaryQuestion: "ready 视频是否已经进入 current 可搜索索引？",
    controls: [
      { route: "index-publish", label: "修复 index-required", state: "m9b-api", reason: "M9B 接入索引修复接口。" },
      { route: "index-publish", label: "校验索引", state: "m9b-api", reason: "M9B 接入 Doctor/索引校验。" },
      { route: "index-publish", label: "原子切换 current", state: "native-boundary", reason: "手动切换 current 不作为 Web 常规操作暴露。" }
    ]
  },
  doctor: {
    route: "doctor",
    label: "健康诊断",
    goal: "诊断系统问题",
    primaryQuestion: "系统问题出现在哪里，管理员下一步该看什么？",
    controls: [
      { route: "doctor", label: "重新运行 Doctor", state: "m9b-api", reason: "M9B 接入 Doctor 运行接口。" },
      { route: "doctor", label: "导出诊断 JSON", state: "m9b-api", reason: "M9B 接入报告导出。" }
    ]
  },
  settings: {
    route: "settings",
    label: "设置",
    goal: "配置运行策略",
    primaryQuestion: "FFmpeg、ASR、音频模式和密钥配置是否满足运行要求？",
    controls: [
      { route: "settings", label: "选择音频模式", state: "local", reason: "M9A 只预览界面状态，不保存运行策略。" },
      { route: "settings", label: "保存运行策略", state: "m9b-api", reason: "M9B 接入配置保存或环境提示。" },
      { route: "settings", label: "测试 ASR 配置", state: "m9b-api", reason: "M9B 接入 ASR 配置检测。" },
      { route: "settings", label: "编辑 API Key", state: "native-boundary", reason: "密钥只通过 .env.local 或部署环境变量配置。" }
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
