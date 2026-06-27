import assert from "node:assert/strict";
import test from "node:test";
import {
  adminAuthHeaders,
  deleteJson,
  getJson,
  getJsonWithMeta,
  joinUrl,
  listQuery,
  sendJson,
  unwrapAdminResponse,
  unwrapAdminResponseWithMeta,
  type AdminListQueryOptions
} from "./admin-http.ts";
import type { AdminApiEnvelope } from "./api.ts";

test("admin HTTP helpers unwrap envelopes and preserve response meta", () => {
  assert.deepEqual(
    unwrapAdminResponse({ ok: true, data: { ready: 12 } }),
    { ready: 12 }
  );

  const withMeta = unwrapAdminResponseWithMeta({
    ok: true,
    data: ["V000001"],
    meta: {
      runtime: {
        schema_version: "1.0",
        endpoint: "/api/admin/source-videos",
        method: "GET",
        duration_ms: 8,
        scan_mode: "no-scan",
        data_source: "admin-read-model",
        scan_reason: "route-owned-page",
        actual_data_source: "admin-read-model",
        cache_status: "hit",
        result_count: 1,
        offset: 0,
        limit: 50,
        slow: false,
        slow_reason: ""
      }
    }
  });

  assert.deepEqual(withMeta.data, ["V000001"]);
  assert.equal(withMeta.meta?.runtime.endpoint, "/api/admin/source-videos");

  const envelope: AdminApiEnvelope<unknown> = {
    ok: false,
    error_code: "internal_error",
    message: "无法读取管理端数据"
  };
  assert.throws(() => unwrapAdminResponse(envelope), /internal_error.*无法读取管理端数据/);
});

test("admin HTTP helpers build URLs, query strings, and auth headers", () => {
  assert.equal(joinUrl("http://127.0.0.1:3889/", "/api/admin/library/status"), "http://127.0.0.1:3889/api/admin/library/status");
  assert.equal(listQuery(), "");
  assert.equal(listQuery({ limit: 50, offset: 100, query: "  张三  ", status: "processing" }), "?limit=50&offset=100&query=%E5%BC%A0%E4%B8%89&status=processing");
  assert.equal(listQuery({ status: "all" } satisfies AdminListQueryOptions), "");
  assert.deepEqual(adminAuthHeaders({ session_token: "session-001" }), {
    "X-MixLab-Admin-Session-Token": "session-001"
  });
  assert.equal(adminAuthHeaders(), undefined);
});

test("admin HTTP helpers keep GET, POST, PATCH, and DELETE transport behavior", async () => {
  const requests: Array<{
    url: string;
    method: string;
    token: string | null;
    contentType: string | null;
    body?: unknown;
  }> = [];
  const fetchImpl: typeof fetch = async (resource, init) => {
    const headers = new Headers(init?.headers);
    requests.push({
      url: String(resource),
      method: init?.method ?? "GET",
      token: headers.get("x-mixlab-admin-session-token"),
      contentType: headers.get("content-type"),
      body: init?.body ? JSON.parse(String(init.body)) : undefined
    });

    return new Response(JSON.stringify({
      ok: true,
      data: { accepted: true },
      meta: {
        runtime: {
          schema_version: "1.0",
          endpoint: new URL(String(resource)).pathname,
          method: init?.method ?? "GET",
          duration_ms: 1,
          scan_mode: "no-scan",
          data_source: "admin-read-model",
          scan_reason: "route-owned-page",
          actual_data_source: "admin-read-model",
          cache_status: "hit",
          result_count: 1,
          offset: 0,
          limit: 1,
          slow: false,
          slow_reason: ""
        }
      }
    }));
  };
  const headers = adminAuthHeaders({ session_token: "session-001" });

  await getJson(fetchImpl, "http://127.0.0.1:3889/", "/api/admin/library/status", headers);
  const withMeta = await getJsonWithMeta(fetchImpl, "http://127.0.0.1:3889", "/api/admin/source-videos", headers);
  await sendJson(fetchImpl, "http://127.0.0.1:3889", "/api/admin/settings/config", "PATCH", { library_name: "MixLab" }, headers);
  await sendJson(fetchImpl, "http://127.0.0.1:3889", "/api/admin/preprocess/supervisor/start", "POST", undefined, headers);
  await deleteJson(fetchImpl, "http://127.0.0.1:3889", "/api/admin/settings/source-folders/SF000001", headers);

  assert.equal(withMeta.meta?.runtime.endpoint, "/api/admin/source-videos");
  assert.deepEqual(requests.map((request) => request.method), ["GET", "GET", "PATCH", "POST", "DELETE"]);
  assert.deepEqual(requests.map((request) => request.token), [
    "session-001",
    "session-001",
    "session-001",
    "session-001",
    "session-001"
  ]);
  assert.equal(requests[0]?.url, "http://127.0.0.1:3889/api/admin/library/status");
  assert.deepEqual(requests[2]?.body, { library_name: "MixLab" });
  assert.equal(requests[2]?.contentType, "application/json");
  assert.equal(requests[3]?.body, undefined);
});
