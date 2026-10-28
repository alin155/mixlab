import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_CONTRACT_VERSION,
  apiContractError,
  apiError,
  apiOk,
  apiOkContract,
  contractErrorCodeForAdminError,
  parseAdminRouteLimit,
  parseAdminRouteOffset
} from "./admin-route-adapter.ts";

test("admin route adapter success envelope preserves optional runtime metadata", () => {
  const envelope = apiOk(
    { ready: 120 },
    {
      runtime: {
        schema_version: "1.0",
        endpoint: "/api/admin/dashboard/metrics",
        method: "GET",
        duration_ms: 25,
        scan_mode: "status-scan",
        data_source: "usage-events",
        scan_reason: "background-metrics",
        actual_data_source: "usage-events",
        cache_status: "not-applicable",
        result_count: 1,
        offset: 0,
        limit: 0,
        slow: false,
        slow_reason: ""
      }
    }
  );

  assert.equal(envelope.ok, true);
  assert.deepEqual(envelope.data, { ready: 120 });
  assert.equal(envelope.meta?.runtime.endpoint, "/api/admin/dashboard/metrics");
});

test("admin route adapter error envelope omits details unless provided", () => {
  assert.deepEqual(apiError("not_found", "原视频不存在"), {
    ok: false,
    error_code: "not_found",
    message: "原视频不存在"
  });
  assert.deepEqual(apiError("invalid_request", "请求无效", { field: "limit" }), {
    ok: false,
    error_code: "invalid_request",
    message: "请求无效",
    details: { field: "limit" }
  });
});

test("admin route adapter parses bounded limits and preserves current defaults", () => {
  assert.equal(parseAdminRouteLimit(new URLSearchParams("limit=20"), { max_limit: 500 }), 20);
  assert.equal(parseAdminRouteLimit(new URLSearchParams("limit=999"), { max_limit: 500 }), 500);
  assert.equal(parseAdminRouteLimit(new URLSearchParams("limit=0"), { max_limit: 500 }), undefined);
  assert.equal(parseAdminRouteLimit(new URLSearchParams("limit=-1"), { max_limit: 500 }), undefined);
  assert.equal(parseAdminRouteLimit(new URLSearchParams("limit=abc"), { max_limit: 500 }), undefined);
  assert.equal(parseAdminRouteLimit(new URLSearchParams(""), { max_limit: 500, default_limit: 0 }), 0);
});

test("admin route adapter parses positive offsets only", () => {
  assert.equal(parseAdminRouteOffset(new URLSearchParams("offset=12")), 12);
  assert.equal(parseAdminRouteOffset(new URLSearchParams("offset=0")), 0);
  assert.equal(parseAdminRouteOffset(new URLSearchParams("offset=-5")), 0);
  assert.equal(parseAdminRouteOffset(new URLSearchParams("offset=abc")), 0);
  assert.equal(parseAdminRouteOffset(new URLSearchParams("")), 0);
});

test("contract error helper keeps legacy fields and adds contract code/version", () => {
  const envelope = apiContractError("login_failed", "用户名或密码错误");
  assert.deepEqual(envelope, {
    ok: false,
    error_code: "login_failed",
    message: "用户名或密码错误",
    code: "AUTH_REQUIRED",
    remediation: "重新登录后重试",
    retryable: "after-fix",
    contract_version: ADMIN_CONTRACT_VERSION
  });
  assert.equal(ADMIN_CONTRACT_VERSION, "1.0.0");

  const withDetails = apiContractError("login_rate_limited", "稍后再试", {
    retry_after_seconds: 30
  });
  assert.equal(withDetails.code, "LOGIN_RATE_LIMITED");
  assert.equal(withDetails.retryable, "retryable");
  assert.deepEqual(withDetails.details, { retry_after_seconds: 30 });
  assert.equal(withDetails.error_code, "login_rate_limited");
});

test("contract error helper never invents a contract code for unknown legacy codes", () => {
  const unknown = apiContractError("totally_custom_failure", "自定义失败");
  assert.equal(unknown.error_code, "totally_custom_failure");
  assert.equal(unknown.code, undefined);
  assert.equal(unknown.remediation, undefined);
  assert.equal(unknown.contract_version, ADMIN_CONTRACT_VERSION);
  assert.equal(JSON.stringify(unknown).includes("undefined"), false);
});

test("legacy error code mapping covers high-frequency Admin codes and families", () => {
  assert.equal(contractErrorCodeForAdminError("login_required"), "AUTH_REQUIRED");
  assert.equal(contractErrorCodeForAdminError("registration_forbidden"), "REGISTRATION_FORBIDDEN");
  assert.equal(contractErrorCodeForAdminError("invalid_request"), "VALIDATION_FAILED");
  assert.equal(contractErrorCodeForAdminError("validation_failed"), "VALIDATION_FAILED");
  assert.equal(contractErrorCodeForAdminError("library_unavailable"), "LIBRARY_UNAVAILABLE");
  assert.equal(contractErrorCodeForAdminError("not_ready"), "LIBRARY_NOT_READY");
  assert.equal(contractErrorCodeForAdminError("release_busy"), "RELEASE_BUSY");
  assert.equal(contractErrorCodeForAdminError("release_bundle_corrupt"), "RELEASE_BUNDLE_CORRUPT");
  assert.equal(contractErrorCodeForAdminError("not_implemented"), "CAPABILITY_UNAVAILABLE");
  assert.equal(contractErrorCodeForAdminError("admin_writer_busy"), "WORKSPACE_LEASE_UNAVAILABLE");
  // Family heuristics stay narrow and additive.
  assert.equal(contractErrorCodeForAdminError("invalid_password_change"), "VALIDATION_FAILED");
  assert.equal(contractErrorCodeForAdminError("scene_not_found"), "NOT_FOUND");
  assert.equal(contractErrorCodeForAdminError("random_unknown_code"), undefined);
});

test("contract success helper is purely additive over the legacy envelope", () => {
  const legacy = apiOk({ ready: true });
  assert.deepEqual(legacy, { ok: true, data: { ready: true } });

  const contract = apiOkContract({ ready: true });
  assert.deepEqual(contract, {
    ok: true,
    data: { ready: true },
    contract_version: ADMIN_CONTRACT_VERSION
  });
  assert.equal("contract_version" in legacy, false);
});
