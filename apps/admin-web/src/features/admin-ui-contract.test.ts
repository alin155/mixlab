import assert from "node:assert/strict";
import test from "node:test";
import { buildAdminDataLoadingPlan } from "../../../../packages/admin-api/src/admin-data-loading-plan.ts";
import { adminScanModeProfile } from "../../../../packages/admin-api/src/admin-scan-modes.ts";
import {
  ADMIN_DOCKER_MVP_NAV_ITEMS,
  ADMIN_NAV_ITEMS,
  adminNavItemsForMode,
  adminRouteForMode
} from "../app/navigation.ts";
import {
  ADMIN_DOCKER_MVP_UI_ROUTES,
  ADMIN_UI_PAGES,
  ADMIN_UI_ROUTES,
  adminDockerMvpControlDisposition,
  adminPageContract,
  listAdminDockerMvpControlsByDisposition,
  listAdminControlsByState
} from "./admin-ui-contract.ts";

test("admin UI contract defines the Admin Architecture v1 production-console pages", () => {
  assert.deepEqual(ADMIN_UI_ROUTES, [
    "dashboard",
    "protection",
    "source-videos",
    "preprocess-jobs",
    "index-publish",
    "cutter-users",
    "doctor",
    "settings",
    "operation-log"
  ]);
  assert.equal(ADMIN_UI_PAGES.dashboard.goal, "让小白用户一眼看懂素材生产是否正常");
  assert.equal(ADMIN_UI_PAGES["source-videos"].goal, "管理公共素材资产与元数据");
  assert.equal(ADMIN_UI_PAGES["preprocess-jobs"].label, "素材处理");
  assert.equal(ADMIN_UI_PAGES["preprocess-jobs"].goal, "让小白用户用一个页面继续处理素材并上线给剪辑端");
  assert.equal(ADMIN_UI_PAGES.protection.goal, "集中查看发布门禁和运行保护");
  assert.equal(ADMIN_UI_PAGES["index-publish"].goal, "保证已处理素材进入剪辑端搜索");
  assert.equal(ADMIN_UI_PAGES.doctor.goal, "用红黄绿告诉小白用户系统是否能继续生产");
  assert.equal(ADMIN_UI_PAGES["cutter-users"].goal, "管理剪辑师准入");
  assert.equal(ADMIN_UI_PAGES.settings.goal, "配置素材来源和预处理参数");
  assert.equal(ADMIN_UI_PAGES["operation-log"].goal, "查看管理端维护和审计轨迹");
  assert.equal(ADMIN_UI_PAGES["index-publish"].composition.primary_surface, "publication-queue");
  assert.equal(ADMIN_UI_PAGES["source-videos"].composition.inspector, "required");
});

test("navigation uses product-approved page labels", () => {
  assert.deepEqual(
    ADMIN_NAV_ITEMS.map((item) => item.label),
    ["首页", "素材处理", "剪辑师", "系统状态"]
  );
});

test("docker mvp surface narrows navigation without shrinking the full admin architecture contract", () => {
  assert.deepEqual(
    ADMIN_DOCKER_MVP_UI_ROUTES,
    ["dashboard", "preprocess-jobs", "cutter-users", "doctor"]
  );
  assert.deepEqual(
    ADMIN_DOCKER_MVP_NAV_ITEMS.map((item) => item.label),
    ["首页", "素材处理", "剪辑师", "系统状态"]
  );
  assert.deepEqual(
    adminNavItemsForMode("full").map((item) => item.label),
    ADMIN_NAV_ITEMS.map((item) => item.label)
  );
  assert.deepEqual(
    adminNavItemsForMode("docker-mvp-v0.1").map((item) => item.label),
    ADMIN_DOCKER_MVP_NAV_ITEMS.map((item) => item.label)
  );
  assert.equal(adminRouteForMode("settings", "docker-mvp-v0.1"), "dashboard");
  assert.equal(adminRouteForMode("index-publish", "docker-mvp-v0.1"), "dashboard");
  assert.equal(adminRouteForMode("source-videos", "docker-mvp-v0.1"), "dashboard");
  assert.equal(adminRouteForMode("source-detail", "docker-mvp-v0.1"), "dashboard");
  assert.deepEqual(ADMIN_UI_ROUTES, [
    "dashboard",
    "protection",
    "source-videos",
    "preprocess-jobs",
    "index-publish",
    "cutter-users",
    "doctor",
    "settings",
    "operation-log"
  ]);
});

test("docker mvp control contract keeps core writes and disables or hides high-risk operations", () => {
  const disabled = listAdminDockerMvpControlsByDisposition("disabled").map((control) => control.label);
  const hidden = listAdminDockerMvpControlsByDisposition("hidden").map((control) => `${control.route}:${control.label}`);
  const enabled = listAdminDockerMvpControlsByDisposition("enabled").map((control) => control.label);

  assert.ok(disabled.includes("扫描新增素材"));
  assert.ok(disabled.includes("上线全部已处理素材"));
  assert.ok(enabled.includes("执行下一步建议"));
  assert.ok(hidden.includes("source-videos:保存封面"));
  assert.ok(hidden.includes("source-videos:保存素材信息"));
  assert.equal(adminDockerMvpControlDisposition({
    route: "source-videos",
    label: "上线到剪辑端",
    state: "m9b-api",
    reason: ""
  }), "hidden");
  assert.equal(adminDockerMvpControlDisposition({
    route: "source-videos",
    label: "加入预处理",
    state: "m9b-api",
    reason: ""
  }), "hidden");
  assert.ok(hidden.includes("source-videos:加入预处理"));
  assert.ok(hidden.includes("source-videos:重新处理"));
  assert.ok(hidden.includes("source-videos:恢复到队列"));
  assert.ok(hidden.includes("source-videos:上线到剪辑端"));
  assert.ok(enabled.includes("启动预处理"));
  assert.ok(enabled.includes("暂停预处理"));
  assert.ok(enabled.includes("通过申请"));
  assert.ok(enabled.includes("重置密码"));
  assert.ok(enabled.includes("停用用户"));
  assert.ok(hidden.includes("settings:初始化素材库"));
  assert.ok(hidden.includes("settings:保存设置"));
  assert.ok(hidden.includes("index-publish:上线全部已处理素材"));
  assert.ok(hidden.includes("operation-log:确认执行恢复"));
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
  assert.ok(apiControls.includes("上线到剪辑端"));
  assert.ok(apiControls.includes("上线全部已处理素材"));
  assert.ok(apiControls.includes("校验索引"));
  assert.ok(apiControls.includes("通过申请"));
  assert.ok(apiControls.includes("停用用户"));
  assert.ok(apiControls.includes("初始化素材库"));
  assert.ok(apiControls.includes("检查语音识别"));
  assert.ok(apiControls.includes("确认执行恢复"));
  assert.equal(apiControls.includes("测试语音识别配置"), false);
  assert.equal(apiControls.includes("扫描源视频"), false);
  assert.equal(apiControls.includes("发布待索引视频"), false);
  assert.ok(localControls.includes("搜索原视频"));
  assert.ok(localControls.includes("筛选预处理状态"));
  assert.ok(localControls.includes("准备恢复"));
  assert.deepEqual(listAdminControlsByState("native-boundary"), []);
  assert.deepEqual(readOnlyControls, [
    "查看发布门禁",
    "查看读模型状态",
    "查看数据加载策略",
    "查看索引版本",
    "查看最近事件",
    "查看读模型失效原因",
    "查看恢复预检"
  ]);
});

test("production-console page contracts match the backend route loading plan", () => {
  const plan = buildAdminDataLoadingPlan({
    generated_at: "2026-06-26T17:10:00.000Z",
    manifest_cache_ttl_ms: 30_000
  });
  const routePlans = new Map(plan.routes.map((route) => [route.route, route]));
  const endpointPlans = new Map(plan.endpoints.map((endpoint) => [endpoint.endpoint, endpoint]));

  for (const page of Object.values(ADMIN_UI_PAGES)) {
    const routePlan = routePlans.get(page.data_loading.route_plan);
    assert.ok(routePlan, `${page.route} missing backend route plan`);
    assert.equal(routePlan.load_phase, page.data_loading.load_phase, page.route);
    assert.equal(routePlan.prefetch, false, page.route);
    assert.deepEqual(routePlan.endpoints, [...page.data_loading.expected_endpoints], page.route);
    assert.equal(page.data_loading.hidden_full_scan_allowed, false, page.route);

    for (const endpointPath of page.data_loading.expected_endpoints) {
      const endpoint = endpointPlans.get(endpointPath);
      assert.ok(endpoint, `${page.route} references unregistered endpoint ${endpointPath}`);
      assert.notEqual(endpoint.scan_mode, "full-reconcile", endpointPath);
      assert.equal(adminScanModeProfile(endpoint.scan_mode).blocks_page_open, false, endpointPath);
      assert.equal(
        (page.data_loading.allowed_data_sources as readonly string[]).includes(endpoint.data_source),
        true,
        `${page.route} must allow ${endpoint.data_source} for ${endpointPath}`
      );
    }
  }
});

test("non-dashboard pages are route-local production-console surfaces", () => {
  for (const route of ADMIN_UI_ROUTES) {
    const page = adminPageContract(route);
    assert.equal(page.composition.primary_surface.length > 0, true, route);
    assert.notEqual(page.composition.support_surface, "none", route);

    if (route === "dashboard") {
      assert.equal(page.data_loading.dashboard_coupling, "self-only");
      assert.equal(page.composition.error_boundary, "shell");
      continue;
    }

    assert.equal(page.data_loading.dashboard_coupling, "forbidden", route);
    assert.equal(page.composition.error_boundary, "route-local", route);
    assert.notDeepEqual(page.data_loading.expected_endpoints, ADMIN_UI_PAGES.dashboard.data_loading.expected_endpoints, route);
  }
});
