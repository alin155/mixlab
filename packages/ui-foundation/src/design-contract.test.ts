import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_REQUIRED_PAGES,
  CUTTER_REQUIRED_PAGES,
  FORBIDDEN_UI_PATTERNS,
  MIXLAB_HIFI_REFERENCES,
  validateNoForbiddenUiPatterns,
  validateRequiredPages
} from "./design-contract.ts";

test("defines required cutter pages from the visual spec", () => {
  assert.deepEqual(CUTTER_REQUIRED_PAGES, [
    "公共原素材库",
    "搜索与文案",
    "待剪清单",
    "本地素材库",
    "剪切队列",
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
    "公共素材库设置",
    "原视频管理",
    "预处理任务",
    "索引发布",
    "健康诊断",
    "设置"
  ]);

  assert.deepEqual(validateRequiredPages("admin", ADMIN_REQUIRED_PAGES), {
    ok: true,
    missing_pages: []
  });
});

test("reports missing required pages", () => {
  assert.deepEqual(validateRequiredPages("cutter", ["公共原素材库", "本地素材库"]), {
    ok: false,
    missing_pages: ["搜索与文案", "待剪清单", "剪切队列", "设置"]
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

test("points to the approved hi-fi reference images", () => {
  assert.equal(
    MIXLAB_HIFI_REFERENCES.cutter.endsWith("assets/ui/cutter-workbench-apple-hig.png"),
    true
  );
  assert.equal(
    MIXLAB_HIFI_REFERENCES.admin.endsWith("assets/ui/admin-console-apple-hig.png"),
    true
  );
});
