export type MixlabProductSurface = "cutter" | "admin";

export interface PageValidationResult {
  ok: boolean;
  missing_pages: string[];
}

export interface ForbiddenPatternValidationResult {
  ok: boolean;
  violations: string[];
}

export const MIXLAB_HIFI_REFERENCES = {
  cutter:
    "/Users/allen/Desktop/MixLab_V3_开发交付规格书/assets/ui/cutter-workbench-apple-hig.png",
  admin:
    "/Users/allen/Desktop/MixLab_V3_开发交付规格书/assets/ui/admin-console-apple-hig.png"
} as const;

export const MIXLAB_UI_SPEC_SOURCES = [
  "21_视觉与交互设计规范.md",
  "docs/spec-traceability.md CUTTER-001",
  "docs/spec-traceability.md CUTTER-002",
  "docs/spec-traceability.md ADMIN-001"
] as const;

export const CUTTER_REQUIRED_PAGES = [
  "公共原素材库",
  "搜索与文案",
  "待剪清单",
  "本地素材库",
  "剪切队列",
  "设置"
] as const;

export const ADMIN_REQUIRED_PAGES = [
  "仪表盘",
  "公共素材库设置",
  "原视频管理",
  "预处理任务",
  "索引发布",
  "健康诊断",
  "设置"
] as const;

export const FORBIDDEN_UI_PATTERNS = [
  "hero",
  "marketing",
  "sentence-waterfall",
  "heavy-dashboard-card",
  "public-source-table-only",
  "gradient-orb",
  "bokeh",
  "admin-kpi-card-wall"
] as const;

export function validateRequiredPages(
  kind: MixlabProductSurface,
  pages: readonly string[]
): PageValidationResult {
  const required = kind === "cutter" ? CUTTER_REQUIRED_PAGES : ADMIN_REQUIRED_PAGES;
  const pageSet = new Set(pages);
  const missing_pages = required.filter((page) => !pageSet.has(page));

  return {
    ok: missing_pages.length === 0,
    missing_pages
  };
}

export function validateNoForbiddenUiPatterns(
  content: string
): ForbiddenPatternValidationResult {
  const normalized = content.toLowerCase();
  const violations = FORBIDDEN_UI_PATTERNS.filter((pattern) =>
    normalized.includes(pattern.toLowerCase())
  );

  return {
    ok: violations.length === 0,
    violations: [...violations]
  };
}
