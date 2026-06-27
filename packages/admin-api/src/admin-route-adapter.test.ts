import assert from "node:assert/strict";
import test from "node:test";
import {
  apiError,
  apiOk,
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
