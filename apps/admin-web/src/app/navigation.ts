export type AdminRoute =
  | "dashboard"
  | "source-videos"
  | "source-detail"
  | "preprocess-jobs"
  | "index-publish"
  | "doctor"
  | "cutter-users"
  | "settings";

export interface AdminNavItem {
  route: AdminRoute;
  label: string;
  icon: string;
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { route: "dashboard", label: "仪表盘", icon: "dashboard" },
  { route: "source-videos", label: "原视频管理", icon: "video" },
  { route: "preprocess-jobs", label: "预处理队列", icon: "queue" },
  { route: "index-publish", label: "索引与发布", icon: "index" },
  { route: "doctor", label: "健康诊断", icon: "doctor" },
  { route: "cutter-users", label: "剪辑师用户", icon: "users" },
  { route: "settings", label: "设置", icon: "settings" }
];

const ROUTES = new Set<AdminRoute>([
  "dashboard",
  "source-videos",
  "source-detail",
  "preprocess-jobs",
  "index-publish",
  "doctor",
  "cutter-users",
  "settings"
]);

const ROUTE_ALIASES: Record<string, AdminRoute> = {
  "library-settings": "settings",
  "index-health": "index-publish"
};

export function routeFromHash(hash: string): AdminRoute {
  const route = hash.replace(/^#\/?/, "");
  if (route in ROUTE_ALIASES) {
    return ROUTE_ALIASES[route];
  }
  return ROUTES.has(route as AdminRoute) ? (route as AdminRoute) : "dashboard";
}

export function routeToHash(route: AdminRoute): string {
  return `#/${route}`;
}
