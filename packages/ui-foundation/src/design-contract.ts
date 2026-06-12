export type MixlabProductSurface = "cutter" | "admin";

export interface PageValidationResult {
  ok: boolean;
  missing_pages: string[];
}

export interface ForbiddenPatternValidationResult {
  ok: boolean;
  violations: string[];
}

export interface ScopeGuardViolation {
  id: string;
  term: string;
  policy: string;
}

export interface FirstVersionScopeValidationResult {
  ok: boolean;
  violations: ScopeGuardViolation[];
}

export const MIXLAB_HIFI_REFERENCES = {
  cutter: "https://spectrum.adobe.com/",
  admin: "https://spectrum.adobe.com/"
} as const;

export const MIXLAB_UI_SPEC_SOURCES = [
  "https://spectrum.adobe.com/page/design-tokens/",
  "https://spectrum.adobe.com/page/color/",
  "https://spectrum.adobe.com/page/typography/",
  "https://spectrum.adobe.com/page/layout/",
  "https://spectrum.adobe.com/page/button/",
  "https://spectrum.adobe.com/page/sidenav/",
  "https://spectrum.adobe.com/page/card/",
  "https://carbondesignsystem.com/components/data-table/usage/",
  "docs/spec-traceability.md CUTTER-001",
  "docs/spec-traceability.md CUTTER-002",
  "docs/spec-traceability.md ADMIN-001",
  "docs/ui-design-system/MixLab-UI-Design-System.md"
] as const;

export const CUTTER_REQUIRED_PAGES = [
  "首页",
  "素材搜索",
  "剪切任务",
  "本地素材",
  "公共素材库",
  "原视频详情",
  "设置"
] as const;

export const ADMIN_REQUIRED_PAGES = [
  "仪表盘",
  "原视频管理",
  "预处理",
  "剪辑师用户",
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

export const MIXLAB_V1_ALLOWED_CAPABILITIES = [
  "keyword-search",
  "full-transcript-reading",
  "continuous-transcript-selection",
  "local-video-cutting",
  "reusable-local-exports",
  "admin-public-library-governance"
] as const;

export const MIXLAB_V1_OUT_OF_SCOPE_CAPABILITIES = [
  {
    id: "ai-recommendations",
    policy: "AI recommendations or semantic expansion require a written change request.",
    terms: ["AI recommendation", "AI 推荐", "智能推荐", "语义扩展", "向量推荐"]
  },
  {
    id: "collaboration",
    policy: "Collaborative editing or shared multi-user cut lists require a written change request.",
    terms: ["collaboration", "协作", "协同剪辑", "多用户协同"]
  },
  {
    id: "complex-permissions",
    policy: "Role matrices, department permissions, or material-level permissions are out of scope for V1.",
    terms: ["complex permissions", "复杂权限", "角色权限矩阵", "部门权限", "素材级权限"]
  },
  {
    id: "cloud-material-management",
    policy: "Cloud material management or public-material sync/download workflows require a written change request.",
    terms: ["cloud material management", "云素材", "云端素材管理", "公共素材下载同步"]
  }
] as const;

const SCOPE_GUARD_CONTEXT_TERMS = [
  "out of scope",
  "not in scope",
  "not implemented",
  "explicitly not implemented",
  "known remaining work",
  "change request",
  "written change request",
  "不做",
  "不引入",
  "不支持",
  "不在范围",
  "变更请求",
  "另行确认"
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

function hasScopeGuardContext(content: string, index: number): boolean {
  const windowStart = Math.max(0, index - 100);
  const windowEnd = Math.min(content.length, index + 140);
  const window = content.slice(windowStart, windowEnd);

  return SCOPE_GUARD_CONTEXT_TERMS.some((term) => window.includes(term.toLowerCase()));
}

export function validateFirstVersionScopeClaims(
  content: string
): FirstVersionScopeValidationResult {
  const normalized = content.toLowerCase();
  const violations: ScopeGuardViolation[] = [];

  for (const capability of MIXLAB_V1_OUT_OF_SCOPE_CAPABILITIES) {
    for (const term of capability.terms) {
      const normalizedTerm = term.toLowerCase();
      let index = normalized.indexOf(normalizedTerm);

      while (index !== -1) {
        if (!hasScopeGuardContext(normalized, index)) {
          violations.push({
            id: capability.id,
            term,
            policy: capability.policy
          });
        }

        index = normalized.indexOf(normalizedTerm, index + normalizedTerm.length);
      }
    }
  }

  return {
    ok: violations.length === 0,
    violations
  };
}
