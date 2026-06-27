import assert from "node:assert/strict";
import test from "node:test";
import {
  handleAdminRuntimeObservabilityRoutes
} from "./admin-runtime-observability-routes.ts";

function callRoute(input: {
  method?: string;
  pathname: string;
  query?: string;
  read_history?: (input: {
    library_root: string;
    generated_at: string;
    limit?: number;
  }) => Promise<{ marker: string; limit?: number }>;
}) {
  return handleAdminRuntimeObservabilityRoutes({
    method: input.method ?? "GET",
    pathname: input.pathname,
    search_params: new URLSearchParams(input.query ?? ""),
    request_now: "2026-06-26T12:00:00.000Z",
    api_input: {
      library_root: "/tmp/PublicLibrary"
    },
    deps: {
      read_runtime_diagnostics_history: input.read_history ?? (async (historyInput) => ({
        marker: `${historyInput.generated_at}:${historyInput.library_root}`,
        limit: historyInput.limit
      }))
    }
  });
}

test("runtime observability route reads bounded diagnostics history", async () => {
  const calls: Array<{ library_root: string; generated_at: string; limit?: number }> = [];
  const result = await callRoute({
    pathname: "/api/admin/runtime/diagnostics/history",
    query: "limit=500",
    read_history: async (input) => {
      calls.push(input);
      return {
        marker: input.library_root,
        limit: input.limit
      };
    }
  });

  assert.equal(result.handled, true);
  assert.deepEqual(calls, [{
    library_root: "/tmp/PublicLibrary",
    generated_at: "2026-06-26T12:00:00.000Z",
    limit: 200
  }]);
  if (result.handled) {
    assert.deepEqual(result.body, {
      ok: true,
      data: {
        marker: "/tmp/PublicLibrary",
        limit: 200
      }
    });
  }
});

test("runtime observability route ignores unrelated routes and non-get methods", async () => {
  assert.deepEqual(await callRoute({
    method: "POST",
    pathname: "/api/admin/runtime/diagnostics/history"
  }), {
    handled: false
  });
  assert.deepEqual(await callRoute({
    pathname: "/api/admin/runtime/diagnostics"
  }), {
    handled: false
  });
});
