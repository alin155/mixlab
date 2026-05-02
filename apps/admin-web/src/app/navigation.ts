export type AdminRoute =
  | "dashboard"
  | "library-settings"
  | "source-videos"
  | "preprocess-jobs"
  | "index-publish"
  | "doctor"
  | "settings";

export interface AdminNavItem {
  route: AdminRoute;
  label: string;
  icon: string;
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { route: "dashboard", label: "仪表盘", icon: "dashboard" },
  { route: "library-settings", label: "公共素材库设置", icon: "archive" },
  { route: "source-videos", label: "原视频管理", icon: "video" },
  { route: "preprocess-jobs", label: "预处理任务", icon: "queue" },
  { route: "index-publish", label: "索引健康与修复", icon: "index" },
  { route: "doctor", label: "健康诊断", icon: "doctor" },
  { route: "settings", label: "设置", icon: "settings" }
];

const ROUTES = new Set<AdminRoute>(ADMIN_NAV_ITEMS.map((item) => item.route));

export function routeFromHash(hash: string): AdminRoute {
  const route = hash.replace(/^#\/?/, "");
  return ROUTES.has(route as AdminRoute) ? (route as AdminRoute) : "dashboard";
}

export function routeToHash(route: AdminRoute): string {
  return `#/${route}`;
}
