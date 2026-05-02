import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_NAV_ITEMS } from "../app/navigation.ts";
import {
  ADMIN_UI_PAGES,
  ADMIN_UI_ROUTES,
  listAdminControlsByState
} from "./admin-ui-contract.ts";

test("admin UI contract defines exactly seven product pages", () => {
  assert.deepEqual(ADMIN_UI_ROUTES, [
    "dashboard",
    "library-settings",
    "source-videos",
    "preprocess-jobs",
    "index-publish",
    "doctor",
    "settings"
  ]);
  assert.equal(ADMIN_UI_PAGES.dashboard.goal, "看全局风险和产能");
  assert.equal(ADMIN_UI_PAGES["library-settings"].goal, "保证库能初始化和读写");
  assert.equal(ADMIN_UI_PAGES["source-videos"].goal, "管理公共素材资产与元数据");
  assert.equal(ADMIN_UI_PAGES["preprocess-jobs"].goal, "控制生产队列");
  assert.equal(ADMIN_UI_PAGES["index-publish"].label, "索引健康与修复");
  assert.equal(ADMIN_UI_PAGES.doctor.goal, "诊断系统问题");
  assert.equal(ADMIN_UI_PAGES.settings.goal, "配置运行策略");
});

test("navigation uses product-approved page labels", () => {
  assert.deepEqual(
    ADMIN_NAV_ITEMS.map((item) => item.label),
    ["仪表盘", "公共素材库设置", "原视频管理", "预处理任务", "索引健康与修复", "健康诊断", "设置"]
  );
});

test("every visible control is classified before implementation", () => {
  const apiControls = listAdminControlsByState("m9b-api").map((control) => control.label);
  const nativeControls = listAdminControlsByState("native-boundary").map((control) => control.label);
  const localControls = listAdminControlsByState("local").map((control) => control.label);

  assert.ok(apiControls.includes("处理未处理"));
  assert.ok(apiControls.includes("修复 index-required"));
  assert.ok(nativeControls.includes("打开文件夹"));
  assert.ok(nativeControls.includes("编辑 API Key"));
  assert.ok(localControls.includes("搜索原视频"));
  assert.ok(localControls.includes("筛选预处理状态"));
});
