import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_NAV_ITEMS } from "../app/navigation.ts";
import {
  ADMIN_UI_PAGES,
  ADMIN_UI_ROUTES,
  listAdminControlsByState
} from "./admin-ui-contract.ts";

test("admin UI contract defines the M12.1 product pages", () => {
  assert.deepEqual(ADMIN_UI_ROUTES, [
    "dashboard",
    "source-videos",
    "preprocess-jobs",
    "doctor",
    "cutter-users",
    "settings"
  ]);
  assert.equal(ADMIN_UI_PAGES.dashboard.goal, "看全局风险和产能");
  assert.equal(ADMIN_UI_PAGES["source-videos"].goal, "管理公共素材资产与元数据");
  assert.equal(ADMIN_UI_PAGES["preprocess-jobs"].label, "预处理");
  assert.equal(ADMIN_UI_PAGES["preprocess-jobs"].goal, "监控预处理流水线和自动增量发布");
  assert.equal(ADMIN_UI_PAGES.doctor.goal, "检查系统状态");
  assert.equal(ADMIN_UI_PAGES["cutter-users"].goal, "管理剪辑师准入");
  assert.equal(ADMIN_UI_PAGES.settings.goal, "配置素材来源和预处理参数");
});

test("navigation uses product-approved page labels", () => {
  assert.deepEqual(
    ADMIN_NAV_ITEMS.map((item) => item.label),
    ["仪表盘", "原视频管理", "预处理", "剪辑师用户", "设置"]
  );
});

test("every visible control is classified before implementation", () => {
  const apiControls = listAdminControlsByState("m9b-api").map((control) => control.label);
  const localControls = listAdminControlsByState("local").map((control) => control.label);
  const readOnlyControls = listAdminControlsByState("read-only").map((control) => control.label);

  assert.equal(apiControls.includes("智能扫描"), false);
  assert.ok(apiControls.includes("扫描新增素材"));
  assert.ok(apiControls.includes("启动预处理"));
  assert.ok(apiControls.includes("暂停预处理"));
  assert.ok(apiControls.includes("详情"));
  assert.equal(apiControls.includes("查看日志"), false);
  assert.ok(apiControls.includes("发布到剪辑端"));
  assert.ok(apiControls.includes("通过申请"));
  assert.ok(apiControls.includes("停用用户"));
  assert.ok(apiControls.includes("初始化素材库"));
  assert.ok(apiControls.includes("检查语音识别"));
  assert.equal(apiControls.includes("测试语音识别配置"), false);
  assert.equal(apiControls.includes("扫描源视频"), false);
  assert.equal(apiControls.includes("发布待索引视频"), false);
  assert.ok(localControls.includes("搜索原视频"));
  assert.ok(localControls.includes("筛选预处理状态"));
  assert.deepEqual(listAdminControlsByState("native-boundary"), []);
  assert.deepEqual(readOnlyControls, []);
});
