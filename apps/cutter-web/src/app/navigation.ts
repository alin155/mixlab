export type CutterRoute =
  | "material-locator"
  | "cut-tasks"
  | "local-library"
  | "public-library"
  | "source-detail"
  | "settings";

export interface CutterNavItem {
  route: CutterRoute;
  label: string;
  icon: string;
}

export const CUTTER_NAV_ITEMS: CutterNavItem[] = [
  { route: "material-locator", label: "素材定位", icon: "search" },
  { route: "cut-tasks", label: "剪切任务", icon: "queue" },
  { route: "local-library", label: "本地素材", icon: "folder" },
  { route: "public-library", label: "公共素材库", icon: "archive" },
  { route: "settings", label: "设置", icon: "settings" }
];

export function routeToHash(route: CutterRoute): string {
  return `#${route}`;
}

const SOURCE_VIDEO_HASH_ID_PATTERN = /^(?:V\d{6}|src-\d{3})$/;

export function routeFromHash(hash: string): CutterRoute {
  const route = hash.replace(/^#/, "").split(/[/?]/)[0];
  if (route === "search" || route === "material-locator" || !route) {
    return "material-locator";
  }
  if (route === "cut-list" || route === "cut-queue" || route === "cut-tasks") {
    return "cut-tasks";
  }
  if (route === "source-detail") {
    return "source-detail";
  }
  return CUTTER_NAV_ITEMS.some((item) => item.route === route) ? (route as CutterRoute) : "material-locator";
}

export function sourceVideoIdFromHash(hash: string): string | undefined {
  const match = /^#?source-detail\/([^/?#]+)/.exec(hash.trim());
  const sourceVideoId = match?.[1] ? decodeURIComponent(match[1]) : "";

  return SOURCE_VIDEO_HASH_ID_PATTERN.test(sourceVideoId) ? sourceVideoId : undefined;
}

function searchParamsFromHash(hash: string): URLSearchParams {
  const query = hash.split("?")[1]?.split("#")[0] ?? "";
  return new URLSearchParams(query);
}

export function searchQueryFromHash(hash: string): string {
  if (routeFromHash(hash) !== "material-locator") {
    return "";
  }

  return searchParamsFromHash(hash).get("query")?.trim() ?? "";
}

export function searchHash(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) {
    return "#material-locator";
  }

  return `#material-locator?query=${encodeURIComponent(trimmed)}`;
}

export function sourceDetailHash(
  sourceVideoId: string,
  options: { query?: string; segmentIds?: string[] } = {}
): string {
  const params = new URLSearchParams();
  if (options.query?.trim()) {
    params.set("query", options.query.trim());
  }
  if (options.segmentIds?.length) {
    params.set("segments", options.segmentIds.join(","));
  }
  const query = params.toString();
  return `#source-detail/${encodeURIComponent(sourceVideoId)}${query ? `?${query}` : ""}`;
}

export function sourceDetailContextFromHash(hash: string): {
  sourceVideoId?: string;
  query: string;
  segmentIds: string[];
} {
  const params = searchParamsFromHash(hash);
  const sourceVideoId = sourceVideoIdFromHash(hash);
  const segmentIds = (params.get("segments") ?? "")
    .split(",")
    .map((segmentId) => segmentId.trim())
    .filter(Boolean);

  return {
    sourceVideoId,
    query: params.get("query")?.trim() ?? "",
    segmentIds
  };
}

export function routeTitle(route: CutterRoute): string {
  if (route === "source-detail") {
    return "原视频详情";
  }

  return CUTTER_NAV_ITEMS.find((item) => item.route === route)?.label ?? "素材定位";
}
