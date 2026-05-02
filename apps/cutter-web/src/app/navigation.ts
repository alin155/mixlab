export type CutterRoute =
  | "public-library"
  | "source-detail"
  | "search"
  | "cut-list"
  | "local-library"
  | "cut-queue"
  | "settings";

export interface CutterNavItem {
  route: CutterRoute;
  label: string;
  icon: string;
}

export const CUTTER_NAV_ITEMS: CutterNavItem[] = [
  { route: "public-library", label: "公共原素材库", icon: "archive" },
  { route: "source-detail", label: "原视频详情", icon: "video" },
  { route: "search", label: "搜索与文案", icon: "search" },
  { route: "cut-list", label: "待剪清单", icon: "list" },
  { route: "local-library", label: "本地素材库", icon: "folder" },
  { route: "cut-queue", label: "剪切队列", icon: "queue" },
  { route: "settings", label: "设置", icon: "settings" }
];

export function routeToHash(route: CutterRoute): string {
  return `#${route}`;
}

export function routeFromHash(hash: string): CutterRoute {
  const route = hash.replace(/^#/, "") as CutterRoute;
  return CUTTER_NAV_ITEMS.some((item) => item.route === route) ? route : "public-library";
}

export function routeTitle(route: CutterRoute): string {
  return CUTTER_NAV_ITEMS.find((item) => item.route === route)?.label ?? "公共原素材库";
}
