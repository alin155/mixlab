import assert from "node:assert/strict";
import test from "node:test";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CONTRACT_VERSION,
  type CapabilityTableV1
} from "../../../packages/contracts/src/index.ts";
import {
  AdminHttpError,
  isAdminAuthExpiredError
} from "./admin-http.ts";
import {
  createAdminApiClient,
  createFixtureAdminApiClient,
  loadAdminDashboardData,
  type AdminDashboardData
} from "./api.ts";
import {
  adminAuthFormErrorMessage
} from "./app/AdminApp.tsx";
import {
  ADMIN_ERROR_CODE_INFO,
  adminErrorCodeInfo,
  adminErrorContractBody,
  adminErrorIsRetryable,
  adminErrorTechnicalDetail,
  resolveAdminContractErrorCode
} from "./app/admin-error-codes.ts";
import {
  adminCapabilityCompatibility,
  adminCapabilityEnabled,
  adminCapabilityFeatureLabel,
  adminCapabilityFeatureRows,
  adminCapabilityFeatureSummary,
  adminCapabilityGate,
  adminCapabilityUnavailableMessage,
  parseAdminCapabilityTable,
  resolveAdminClientVersion,
  type AdminCapabilityState
} from "./app/capabilities.ts";
import { DoctorPage } from "./features/doctor/DoctorPage.tsx";
import { IndexPublishPage } from "./features/index-publish/IndexPublishPage.tsx";

async function fixtureData(): Promise<AdminDashboardData> {
  return loadAdminDashboardData(createFixtureAdminApiClient());
}

function capabilityTable(overrides: Partial<CapabilityTableV1> = {}): CapabilityTableV1 {
  return {
    contract_version: CONTRACT_VERSION,
    server_version: "2026.10",
    server_product: "admin",
    min_client_version: "0.19.0",
    features: {
      release_v2: false,
      event_batch: true,
      smart_beta: false,
      admin_capabilities: true
    },
    limits: {
      event_batch_max: 100,
      page_max: 200,
      upload_max_bytes: 16 * 1024 * 1024,
      request_body_max_bytes: 1024 * 1024
    },
    generated_at: "2026-10-27T02:00:00.000Z",
    ...overrides
  };
}

test("contract error registry maps known legacy codes and exposes retryability", () => {
  const auth = adminErrorCodeInfo("AUTH_REQUIRED");
  assert.equal(auth?.contract_code, "AUTH_REQUIRED");
  assert.equal(auth?.retryable, "after-fix");
  assert.match(auth?.title ?? "", /登录/);

  const legacy = adminErrorCodeInfo("login_required");
  assert.equal(legacy?.contract_code, "AUTH_REQUIRED");
  assert.equal(resolveAdminContractErrorCode("login_required"), "AUTH_REQUIRED");
  assert.equal(resolveAdminContractErrorCode("registration_forbidden"), "REGISTRATION_FORBIDDEN");
  assert.equal(resolveAdminContractErrorCode("admin_mvp_command_blocked"), "CAPABILITY_UNAVAILABLE");

  assert.equal(adminErrorIsRetryable("LOGIN_RATE_LIMITED"), true);
  assert.equal(adminErrorIsRetryable("login_rate_limited"), true);
  assert.equal(adminErrorIsRetryable("CAPABILITY_UNAVAILABLE"), false);
  assert.equal(adminErrorIsRetryable("preprocess_start_blocked"), false);
  assert.equal(adminErrorIsRetryable("SOMETHING_NEW"), undefined);

  assert.equal(isAdminAuthExpiredError(new AdminHttpError("AUTH_REQUIRED", "登录已过期", 401)), true);
  assert.equal(isAdminAuthExpiredError(new AdminHttpError("login_required", "请先登录", 0)), true);
  assert.equal(isAdminAuthExpiredError(new AdminHttpError("AUTH_FORBIDDEN", "无权限", 403)), false);
});

test("unknown contract error codes stay visible and keep expandable technical detail", () => {
  assert.equal(adminErrorCodeInfo("SOMETHING_NEW"), null);

  const body = adminErrorContractBody("SOMETHING_NEW", {
    message: "服务端补充说明",
    httpStatus: 500,
    details: { hint: "x" }
  });
  assert.equal(body.error_code, "SOMETHING_NEW");
  assert.equal(body.http_status, 500);
  assert.deepEqual(body.details, { hint: "x" });
  assert.equal(body.message, "服务端补充说明");

  const unknownBody = adminErrorContractBody("SOMETHING_NEW");
  assert.equal(unknownBody.error_code, "SOMETHING_NEW");
  assert.equal(unknownBody.message, "操作失败，请稍后重试");

  const detail = adminErrorTechnicalDetail(new AdminHttpError("SOMETHING_NEW", "unexpected", 500, { hint: "x" }));
  assert.match(detail, /错误码: SOMETHING_NEW/);
  assert.match(detail, /契约错误码: SOMETHING_NEW/);
  assert.match(detail, /retryable: 未知/);
  assert.match(detail, /retryable: unknown|retryable: 未知/);
  assert.match(detail, /hint/);

  assert.equal(ADMIN_ERROR_CODE_INFO.login_required.title, "登录已过期");
});

test("rate limit retry seconds and auth expiry behaviour stay unchanged", () => {
  const legacyRate = adminAuthFormErrorMessage(
    "登录管理端",
    new AdminHttpError("login_rate_limited", "登录失败次数过多", 429, { retry_after_seconds: 17 })
  );
  assert.match(legacyRate, /17 秒后重试/);

  const contractRate = adminAuthFormErrorMessage(
    "登录管理端",
    new AdminHttpError("LOGIN_RATE_LIMITED", "登录失败次数过多", 429, { retry_after_seconds: 299 })
  );
  assert.match(contractRate, /5 分钟后重试/);

  const rateWithoutSeconds = adminAuthFormErrorMessage(
    "登录管理端",
    new AdminHttpError("LOGIN_RATE_LIMITED", "登录失败次数过多", 429)
  );
  assert.match(rateWithoutSeconds, /稍后重试/);

  const registration = adminAuthFormErrorMessage(
    "创建管理员",
    new AdminHttpError(
      "REGISTRATION_FORBIDDEN",
      "首次管理员注册需要匹配的注册令牌，请向管理员索取注册令牌",
      403
    )
  );
  assert.match(registration, /注册令牌/);
  assert.doesNotMatch(registration, /REGISTRATION_FORBIDDEN/);
});

test("capability parsing, gates, feature rows, and compatibility", () => {
  const table = capabilityTable();
  assert.deepEqual(parseAdminCapabilityTable(table), table);
  assert.equal(parseAdminCapabilityTable({ ...table, features: undefined }), null);
  assert.equal(parseAdminCapabilityTable(null), null);

  const readyState: AdminCapabilityState = { status: "ready", table };
  assert.equal(adminCapabilityEnabled(readyState, "event_batch"), true);
  assert.equal(adminCapabilityEnabled(readyState, "release_v2"), false);

  const disabledGate = adminCapabilityGate(readyState, "release_v2");
  assert.equal(disabledGate.visible, false);
  assert.match(disabledGate.reason, /未启用/);
  assert.match(disabledGate.reason, new RegExp(adminCapabilityFeatureLabel("release_v2")));

  const enabledGate = adminCapabilityGate(
    { status: "ready", table: capabilityTable({ features: { release_v2: true } }) },
    "release_v2"
  );
  assert.equal(enabledGate.visible, true);
  assert.equal(enabledGate.reason, "");

  const unavailableGate = adminCapabilityGate(
    { status: "unavailable", message: "版本信息不可用：未提供 v1 capabilities" },
    "release_v2"
  );
  assert.equal(unavailableGate.visible, false);
  assert.match(unavailableGate.reason, /版本信息不可用/);

  assert.equal(adminCapabilityGate({ status: "loading" }, "release_v2").visible, false);

  const rows = adminCapabilityFeatureRows(capabilityTable());
  assert.ok(rows.some((row) => row.key === "release_v2" && row.label.includes("发布 v2")));
  assert.match(adminCapabilityFeatureSummary(capabilityTable()), /已启用/);
  assert.match(adminCapabilityFeatureSummary(capabilityTable()), /未启用/);

  assert.equal(adminCapabilityCompatibility(table, "0.19.0").compatible, true);
  assert.equal(adminCapabilityCompatibility(table, "0.1.0").compatible, false);
  assert.match(adminCapabilityCompatibility(table, "0.1.0").label, /升级/);

  assert.equal(resolveAdminClientVersion(undefined), "0.1.0");
  assert.equal(resolveAdminClientVersion(" 0.2.0 "), "0.2.0");
});

test("capability endpoint degrades on 404 or missing route", () => {
  assert.match(
    adminCapabilityUnavailableMessage(new AdminHttpError("not_found", "route not found", 404)),
    /版本信息不可用/
  );
  assert.match(
    adminCapabilityUnavailableMessage(new AdminHttpError("NOT_FOUND", "not found", 404)),
    /版本信息不可用/
  );
  assert.match(
    adminCapabilityUnavailableMessage(new AdminHttpError("invalid_response", "bad json", 404)),
    /版本信息不可用/
  );
  assert.match(
    adminCapabilityUnavailableMessage(new AdminHttpError("AUTH_REQUIRED", "登录已过期", 401)),
    /版本信息不可用/
  );
  assert.match(adminCapabilityUnavailableMessage(new Error("network down")), /network down/);
});

test("admin client requests GET /api/v1/capabilities and returns the capability table", async () => {
  const requested: string[] = [];
  const table = capabilityTable();
  const client = createAdminApiClient({
    base_url: "http://127.0.0.1:3889",
    fetch: async (resource) => {
      requested.push(new URL(String(resource)).pathname);
      return new Response(JSON.stringify({ ok: true, data: table }), {
        headers: { "content-type": "application/json" }
      });
    }
  });

  const result = await client.getCapabilities();
  assert.equal(result.contract_version, CONTRACT_VERSION);
  assert.deepEqual(requested, ["/api/v1/capabilities"]);
});

test("doctor and index-publish surfaces render capability version/degradation states", async () => {
  const data = await fixtureData();
  const unavailable = renderToStaticMarkup(h(DoctorPage, {
    data,
    capabilities: { status: "unavailable", message: "版本信息不可用：当前管理端 API 未提供 v1 capabilities 接口。" },
    clientVersion: "0.1.0",
    onReloadCapabilities: () => undefined
  }));
  assert.match(unavailable, /版本与能力/);
  assert.match(unavailable, /版本信息不可用/);
  assert.match(unavailable, /重试读取版本信息/);

  const ready = renderToStaticMarkup(h(DoctorPage, {
    data,
    capabilities: { status: "ready", table: capabilityTable() },
    clientVersion: "0.1.0"
  }));
  assert.match(ready, /契约版本/);
  assert.match(ready, /2026\.10/);
  assert.match(ready, /不满足|升级/);
  assert.match(ready, /发布 v2/);

  const publishDisabled = renderToStaticMarkup(h(IndexPublishPage, {
    data,
    capabilities: { status: "ready", table: capabilityTable() }
  }));
  assert.match(publishDisabled, /未启用/);

  const publishUnknown = renderToStaticMarkup(h(IndexPublishPage, {
    data,
    capabilities: { status: "unavailable", message: "版本信息不可用：当前管理端 API 未提供 v1 capabilities 接口。" }
  }));
  assert.match(publishUnknown, /版本信息不可用/);
});
