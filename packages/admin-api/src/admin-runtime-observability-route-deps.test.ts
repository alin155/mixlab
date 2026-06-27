import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminRuntimeObservabilityRouteDeps,
  createAdminRuntimeObservabilityRouteServerDeps
} from "./admin-runtime-observability-route-deps.ts";

test("runtime observability route deps preserve diagnostics history input", async () => {
  const calls: Array<{
    library_root: string;
    generated_at: string;
    limit?: number;
  }> = [];

  const deps = createAdminRuntimeObservabilityRouteDeps({
    async read_runtime_diagnostics_history(input) {
      calls.push(input);
      return {
        source: input.library_root,
        generated_at: input.generated_at,
        limit: input.limit
      };
    }
  });

  const result = await deps.read_runtime_diagnostics_history({
    library_root: "/tmp/PublicLibrary",
    generated_at: "2026-06-27T00:03:00.000Z",
    limit: 25
  });

  assert.deepEqual(result, {
    source: "/tmp/PublicLibrary",
    generated_at: "2026-06-27T00:03:00.000Z",
    limit: 25
  });
  assert.deepEqual(calls, [{
    library_root: "/tmp/PublicLibrary",
    generated_at: "2026-06-27T00:03:00.000Z",
    limit: 25
  }]);
});

test("runtime observability route server deps wire diagnostics history service", async () => {
  const calls: Array<{
    library_root: string;
    generated_at: string;
    limit?: number;
  }> = [];

  const deps = createAdminRuntimeObservabilityRouteServerDeps({
    async read_runtime_diagnostics_history_service(input) {
      calls.push(input);
      return {
        schema_version: "1.0",
        generated_at: input.generated_at,
        path: "/tmp/PublicLibrary/.mixlab-library/admin-read-model/runtime-diagnostics.ndjson",
        entries: [],
        limit: input.limit ?? 50,
        total_line_count: 0,
        malformed_line_count: 0,
        truncated: false
      };
    }
  });

  const result = await deps.read_runtime_diagnostics_history({
    library_root: "/tmp/PublicLibrary",
    generated_at: "2026-06-27T00:04:00.000Z",
    limit: 3
  });

  assert.deepEqual(result, {
    schema_version: "1.0",
    generated_at: "2026-06-27T00:04:00.000Z",
    path: "/tmp/PublicLibrary/.mixlab-library/admin-read-model/runtime-diagnostics.ndjson",
    entries: [],
    limit: 3,
    total_line_count: 0,
    malformed_line_count: 0,
    truncated: false
  });
  assert.deepEqual(calls, [{
    library_root: "/tmp/PublicLibrary",
    generated_at: "2026-06-27T00:04:00.000Z",
    limit: 3
  }]);
});
