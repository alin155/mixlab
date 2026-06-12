import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_REQUIRED_PAGES,
  CUTTER_REQUIRED_PAGES,
  FORBIDDEN_UI_PATTERNS,
  MIXLAB_HIFI_REFERENCES,
  MIXLAB_UI_SPEC_SOURCES,
  MIXLAB_V1_ALLOWED_CAPABILITIES,
  MIXLAB_V1_OUT_OF_SCOPE_CAPABILITIES,
  validateFirstVersionScopeClaims,
  validateNoForbiddenUiPatterns,
  validateRequiredPages
} from "./design-contract.ts";

test("defines required cutter pages from the visual spec", () => {
  assert.deepEqual(CUTTER_REQUIRED_PAGES, [
    "首页",
    "素材搜索",
    "剪切任务",
    "本地素材",
    "公共素材库",
    "原视频详情",
    "设置"
  ]);

  assert.deepEqual(validateRequiredPages("cutter", CUTTER_REQUIRED_PAGES), {
    ok: true,
    missing_pages: []
  });
});

test("defines required admin pages from the visual spec", () => {
  assert.deepEqual(ADMIN_REQUIRED_PAGES, [
    "仪表盘",
    "原视频管理",
    "预处理",
    "剪辑师用户",
    "设置"
  ]);

  assert.deepEqual(validateRequiredPages("admin", ADMIN_REQUIRED_PAGES), {
    ok: true,
    missing_pages: []
  });
});

test("reports missing required pages", () => {
  assert.deepEqual(validateRequiredPages("cutter", ["公共素材库", "本地素材"]), {
    ok: false,
    missing_pages: ["首页", "素材搜索", "剪切任务", "原视频详情", "设置"]
  });
});

test("rejects forbidden UI patterns from the visual spec", () => {
  assert.equal(FORBIDDEN_UI_PATTERNS.includes("sentence-waterfall"), true);
  assert.deepEqual(validateNoForbiddenUiPatterns("<main class=\"gallery\"></main>"), {
    ok: true,
    violations: []
  });
  assert.deepEqual(validateNoForbiddenUiPatterns("<section class=\"hero sentence-waterfall\"></section>"), {
    ok: false,
    violations: ["hero", "sentence-waterfall"]
  });
});

test("points to the approved Spectrum-based MixLab reference system", () => {
  assert.equal(MIXLAB_HIFI_REFERENCES.cutter, "https://spectrum.adobe.com/");
  assert.equal(MIXLAB_HIFI_REFERENCES.admin, "https://spectrum.adobe.com/");
  assert.ok(MIXLAB_UI_SPEC_SOURCES.includes("https://spectrum.adobe.com/page/color/"));
  assert.ok(MIXLAB_UI_SPEC_SOURCES.includes("https://spectrum.adobe.com/page/typography/"));
  assert.ok(MIXLAB_UI_SPEC_SOURCES.includes("https://carbondesignsystem.com/components/data-table/usage/"));
  assert.ok(MIXLAB_UI_SPEC_SOURCES.includes("docs/ui-design-system/MixLab-UI-Design-System.md"));
});

test("defines the first-version product scope guard", () => {
  assert.deepEqual(MIXLAB_V1_ALLOWED_CAPABILITIES, [
    "keyword-search",
    "full-transcript-reading",
    "continuous-transcript-selection",
    "local-video-cutting",
    "reusable-local-exports",
    "admin-public-library-governance"
  ]);
  assert.deepEqual(
    MIXLAB_V1_OUT_OF_SCOPE_CAPABILITIES.map((capability) => capability.id),
    [
      "ai-recommendations",
      "collaboration",
      "complex-permissions",
      "cloud-material-management"
    ]
  );
});

test("rejects out-of-scope product claims unless they are explicit non-scope or change requests", () => {
  assert.deepEqual(
    validateFirstVersionScopeClaims("关键词搜索、完整文案阅读、连续选择、本地剪切、本地素材复用。"),
    {
      ok: true,
      violations: []
    }
  );

  const invalid = validateFirstVersionScopeClaims(
    "新增 AI recommendation、多用户协同和云端素材管理入口。"
  );
  assert.equal(invalid.ok, false);
  assert.deepEqual(
    invalid.violations.map((violation) => violation.id),
    ["ai-recommendations", "collaboration", "cloud-material-management"]
  );

  assert.deepEqual(
    validateFirstVersionScopeClaims(
      "不做 AI recommendation，不做多用户协同。变更请求：cloud material management 另行确认。"
    ),
    {
      ok: true,
      violations: []
    }
  );
});
