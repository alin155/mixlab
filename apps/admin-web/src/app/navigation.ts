export type AdminRoute =
  | "dashboard"
  | "source-videos"
  | "source-detail"
  | "preprocess-jobs"
  | "protection"
  | "index-publish"
  | "doctor"
  | "cutter-users"
  | "settings"
  | "operation-log";

export interface AdminNavItem {
  route: AdminRoute;
  label: string;
  icon: string;
}

export type AdminSurfaceMode = "full" | "docker-mvp-v0.1";

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { route: "dashboard", label: "首页", icon: "dashboard" },
  { route: "preprocess-jobs", label: "素材处理", icon: "queue" },
  { route: "source-videos", label: "素材库", icon: "video" },
  { route: "cutter-users", label: "剪辑师", icon: "users" },
  { route: "doctor", label: "系统状态", icon: "doctor" },
  { route: "settings", label: "设置", icon: "settings" }
];

export const ADMIN_DOCKER_MVP_NAV_ITEMS: AdminNavItem[] = [
  { route: "dashboard", label: "首页", icon: "dashboard" },
  { route: "preprocess-jobs", label: "素材处理", icon: "queue" },
  { route: "source-videos", label: "素材库", icon: "video" },
  { route: "cutter-users", label: "剪辑师", icon: "users" },
  { route: "doctor", label: "系统状态", icon: "doctor" }
];

const ADMIN_DOCKER_MVP_ROUTES = new Set<AdminRoute>([
  ...ADMIN_DOCKER_MVP_NAV_ITEMS.map((item) => item.route),
  "source-detail"
]);

const ROUTES = new Set<AdminRoute>([
  "dashboard",
  "source-videos",
  "source-detail",
  "preprocess-jobs",
  "protection",
  "index-publish",
  "doctor",
  "cutter-users",
  "settings",
  "operation-log"
]);

const ROUTE_ALIASES: Record<string, AdminRoute> = {
  "library-settings": "settings",
  "index-health": "index-publish",
  release: "protection",
  "release-gates": "protection",
  "audit-log": "operation-log"
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

export function resolveAdminSurfaceMode(value?: string | null): AdminSurfaceMode {
  const normalized = value?.trim().toLowerCase();
  return normalized === "v0.1" ||
    normalized === "docker-mvp-v0.1" ||
    normalized === "true"
    ? "docker-mvp-v0.1"
    : "full";
}

export function adminNavItemsForMode(mode: AdminSurfaceMode): AdminNavItem[] {
  return mode === "docker-mvp-v0.1" ? ADMIN_DOCKER_MVP_NAV_ITEMS : ADMIN_NAV_ITEMS;
}

export function adminRouteAllowedInMode(route: AdminRoute, mode: AdminSurfaceMode): boolean {
  return mode === "full" || ADMIN_DOCKER_MVP_ROUTES.has(route);
}

export function adminRouteForMode(route: AdminRoute, mode: AdminSurfaceMode): AdminRoute {
  return adminRouteAllowedInMode(route, mode) ? route : "dashboard";
}
