import assert from "node:assert/strict";
import test from "node:test";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  adminDashboardFieldSource,
  adminDoctorReportStatus,
  adminSettingsSaveBlockReason,
  createAdminApiClient,
  createFixtureAdminApiClient,
  loadAdminDashboardData,
  settleWithin,
  type AdminApiClient,
  type AdminDashboardData
} from "./api.ts";
import {
  AdminHttpError,
  isAdminAuthExpiredError
} from "./admin-http.ts";
import {
  adminAuthFormErrorMessage,
  adminDoctorSummaryLabel,
  adminPreprocessRuntimeLabel,
  formatAdminRetryAfterSeconds,
  resolveAdminRuntimeApiBaseUrl
} from "./app/AdminApp.tsx";
import { AdminLoginGate } from "./features/login/AdminLoginGate.tsx";
import { DashboardPage } from "./features/dashboard/DashboardPage.tsx";
import { DoctorPage } from "./features/doctor/DoctorPage.tsx";
import { PreprocessJobsPage } from "./features/preprocess-jobs/PreprocessJobsPage.tsx";
import { SettingsPage } from "./features/settings/SettingsPage.tsx";

async function apiData(): Promise<AdminDashboardData> {
  return loadAdminDashboardData(createFixtureAdminApiClient());
}

async function fallbackShellData(): Promise<AdminDashboardData> {
  const fixtureClient = createFixtureAdminApiClient();
  const failingClient: AdminApiClient = {
    ...fixtureClient,
    getAdminSettings: async () => {
      throw new Error("settings endpoint down");
    },
    getPreprocessSupervisorStatus: async () => {
      throw new Error("supervisor endpoint down");
    },
    listPreprocessJobs: async () => {
      throw new Error("preprocess jobs endpoint down");
    },
    getDataLoadingPlan: async () => {
      throw new Error("data loading plan endpoint down");
    }
  };

  return loadAdminDashboardData(failingClient, { includeHeavy: false });
}

test("settleWithin returns settlement metadata for ok, rejection, and timeout", async () => {
  const ok = await settleWithin(Promise.resolve("value"), "fallback", 50);
  assert.equal(ok.settled, "ok");
  assert.equal(ok.value, "value");
  assert.equal(ok.error, undefined);

  const rejected = await settleWithin(Promise.reject(new Error("boom")), "fallback", 50);
  assert.equal(rejected.settled, "fallback");
  assert.equal(rejected.value, "fallback");
  assert.match(rejected.error ?? "", /boom/);

  const timedOut = await settleWithin(new Promise<string>(() => undefined), "fallback", 5);
  assert.equal(timedOut.settled, "fallback");
  assert.equal(timedOut.value, "fallback");
  assert.match(timedOut.error ?? "", /超时/);
});

test("shell fallback data never claims settings/supervisor/runtime/doctor came from the API", async () => {
  const data = await fallbackShellData();

  assert.equal(adminDashboardFieldSource(data, "settings").source, "fallback");
  assert.equal(adminDashboardFieldSource(data, "supervisor").source, "fallback");
  assert.equal(adminDashboardFieldSource(data, "runtime").source, "placeholder");
  assert.equal(adminDashboardFieldSource(data, "doctor").source, "placeholder");
  assert.equal(data.doctor.source, "placeholder");

  assert.match(adminSettingsSaveBlockReason(data), /保存已禁用/);
  assert.equal(adminDoctorReportStatus(data).loaded, false);
  assert.equal(adminDoctorSummaryLabel(data), "未检查");
  assert.equal(adminPreprocessRuntimeLabel(data), "读取失败");
});

test("api-loaded dashboard data marks real sources and keeps settings savable", async () => {
  const data = await apiData();

  assert.equal(adminDashboardFieldSource(data, "settings").source, "api");
  assert.equal(adminDashboardFieldSource(data, "supervisor").source, "api");
  assert.equal(adminDashboardFieldSource(data, "doctor").source, "api");
  assert.equal(data.doctor.source, "api");
  assert.equal(adminSettingsSaveBlockReason(data), "");
  assert.equal(adminDoctorReportStatus(data).loaded, true);
});

test("production builds reject fixture data mode", () => {
  assert.throws(
    () => resolveAdminRuntimeApiBaseUrl({ useFixtureData: true, isProduction: true }),
    /fixture 数据模式/
  );
  assert.equal(
    resolveAdminRuntimeApiBaseUrl({ useFixtureData: true, isProduction: false }),
    ""
  );
  assert.equal(resolveAdminRuntimeApiBaseUrl({}), "http://127.0.0.1:3889/");
});

test("admin http errors classify expired admin sessions", () => {
  assert.equal(isAdminAuthExpiredError(new AdminHttpError("login_required", "请先登录管理端", 401)), true);
  assert.equal(isAdminAuthExpiredError(new AdminHttpError("login_required", "请先登录管理端")), true);
  assert.equal(isAdminAuthExpiredError(new AdminHttpError("invalid_request", "参数错误", 400)), false);
  assert.equal(isAdminAuthExpiredError(new Error("network down")), false);
});

test("admin api client notifies once on 401 and throws a typed error", async () => {
  let expiredCalls = 0;
  const client = createAdminApiClient({
    base_url: "http://127.0.0.1:3889",
    fetch: async () => new Response(
      JSON.stringify({ ok: false, error_code: "login_required", message: "请先登录管理端" }),
      { status: 401, headers: { "content-type": "application/json" } }
    ),
    onAuthExpired: () => {
      expiredCalls += 1;
    }
  });

  let caught: unknown = null;

  try {
    await client.getLibraryStatus();
  } catch (error) {
    caught = error;
  }

  assert.equal(expiredCalls, 1);
  assert.equal(isAdminAuthExpiredError(caught), true);
});

test("settings page disables saving when settings data is fallback", async () => {
  const data = await fallbackShellData();
  const html = renderToStaticMarkup(h(SettingsPage, { data }));

  assert.match(html, /设置数据未读取，保存已禁用/);
  assert.match(html, /重新加载设置数据/);
  assert.match(html, /保存已禁用/);
  assert.match(html, /disabled/);
});

test("settings page keeps saving enabled for api-backed data", async () => {
  const data = await apiData();
  const html = renderToStaticMarkup(h(SettingsPage, { data }));

  assert.doesNotMatch(html, /设置数据未读取，保存已禁用/);
  assert.match(html, /保存设置/);
});

test("dashboard and preprocess pages show unknown state instead of running/normal on fallback data", async () => {
  const data = await fallbackShellData();
  const dashboardHtml = renderToStaticMarkup(h(DashboardPage, { data }));
  const preprocessHtml = renderToStaticMarkup(h(PreprocessJobsPage, { data }));

  assert.match(dashboardHtml, /部分状态尚未读取/);
  assert.doesNotMatch(dashboardHtml, /运行正常/);
  assert.doesNotMatch(dashboardHtml, /检查通过 0，警告 0，失败 0/);

  assert.match(preprocessHtml, /预处理服务状态未确认/);
  assert.match(preprocessHtml, /未检查/);
});

test("doctor page does not render a passing report for placeholder data", async () => {
  const data = await fallbackShellData();
  const html = renderToStaticMarkup(h(DoctorPage, { data }));

  assert.match(html, /未检查/);
  assert.doesNotMatch(html, /诊断报告[\s\S]{0,40}>通过</);
});

test("run-doctor helper data update trusts the fresh report", async () => {
  const data = await fallbackShellData();
  const refreshed = {
    ...data,
    data_source: { ...data.data_source, doctor: { source: "api" as const } },
    doctor: { ...data.doctor, source: "api" as const, generated_at: "2026-01-01T00:00:00.000Z" }
  };

  assert.equal(adminDoctorReportStatus(refreshed).loaded, true);
  assert.equal(adminDoctorSummaryLabel(refreshed), "正常");
});

test("auth form errors map registration and rate-limit codes to actionable Chinese", () => {
  const fallbackRegistrationMessage = adminAuthFormErrorMessage(
    "创建管理员",
    new AdminHttpError("registration_forbidden", "registration token forbidden", 403)
  );
  assert.match(fallbackRegistrationMessage, /注册令牌/);
  assert.doesNotMatch(fallbackRegistrationMessage, /registration_forbidden/);

  const tokenMissing = new AdminHttpError(
    "registration_forbidden",
    "首次管理员注册需要匹配的注册令牌（请求体 registration_token），请向管理员索取注册令牌",
    403
  );
  assert.match(adminAuthFormErrorMessage("创建管理员", tokenMissing), /请向管理员索取注册令牌/);
  assert.doesNotMatch(adminAuthFormErrorMessage("创建管理员", tokenMissing), /registration_forbidden/);

  const loopbackOnly = new AdminHttpError(
    "registration_forbidden",
    "未配置注册令牌时仅允许从本机回环地址完成首次管理员注册",
    403
  );
  assert.match(adminAuthFormErrorMessage("创建管理员", loopbackOnly), /本机回环地址/);

  const rateLimited = new AdminHttpError(
    "login_rate_limited",
    "登录失败次数过多，请稍后再试",
    429,
    { retry_after_seconds: 17 }
  );
  const rateLimitedMessage = adminAuthFormErrorMessage("登录管理端", rateLimited);
  assert.match(rateLimitedMessage, /17 秒后重试/);
  assert.doesNotMatch(rateLimitedMessage, /login_rate_limited/);

  const fiveMinutes = adminAuthFormErrorMessage(
    "登录管理端",
    new AdminHttpError("login_rate_limited", "登录失败次数过多，请稍后再试", 429, { retry_after_seconds: 299 })
  );
  assert.match(fiveMinutes, /5 分钟后重试/);

  const milliseconds = adminAuthFormErrorMessage(
    "登录管理端",
    new AdminHttpError("login_rate_limited", "too many attempts", 429, { retry_after_ms: 45_500 })
  );
  assert.match(milliseconds, /46 秒后重试/);

  const rateLimitedWithoutSeconds = adminAuthFormErrorMessage(
    "登录管理端",
    new AdminHttpError("login_rate_limited", "too many attempts", 429)
  );
  assert.match(rateLimitedWithoutSeconds, /稍后重试/);

  assert.equal(formatAdminRetryAfterSeconds(299), "5 分钟");
  assert.equal(formatAdminRetryAfterSeconds(17), "17 秒");
  assert.equal(formatAdminRetryAfterSeconds(60), "1 分钟");
  assert.equal(new AdminHttpError("x", "服务端消息", 400).serverMessage, "服务端消息");
});

test("login gate shows registration token field only when bootstrap requires it", () => {
  const withTokenHtml = renderToStaticMarkup(h(AdminLoginGate, {
    mode: "register",
    requiresRegistrationToken: true,
    onRegister: () => undefined,
    onLogin: () => undefined
  }));
  const withoutTokenHtml = renderToStaticMarkup(h(AdminLoginGate, {
    mode: "register",
    onRegister: () => undefined,
    onLogin: () => undefined
  }));

  assert.match(withTokenHtml, /注册令牌（首次部署）/);
  assert.doesNotMatch(withoutTokenHtml, /注册令牌（首次部署）/);

  const loginModeHtml = renderToStaticMarkup(h(AdminLoginGate, {
    mode: "login",
    requiresRegistrationToken: true,
    onRegister: () => undefined,
    onLogin: () => undefined
  }));
  assert.doesNotMatch(loginModeHtml, /注册令牌（首次部署）/);
});
