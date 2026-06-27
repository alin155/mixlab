import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createAdminRuntimeDiagnosticsRecorder,
  createDefaultAdminRuntimeDiagnosticsRecorder
} from "./admin-runtime-diagnostics-recorder.ts";
import {
  buildAdminRuntimeEndpointMeta,
  readAdminRuntimeDiagnosticsHistory,
  type AdminRuntimeEndpointMeta
} from "./admin-runtime-observability.ts";

function runtimeMeta(): AdminRuntimeEndpointMeta {
  return buildAdminRuntimeEndpointMeta({
    endpoint: "/api/admin/source-videos",
    method: "GET",
    started_at_ms: 10,
    finished_at_ms: 25,
    scan_mode: "paged-list",
    data_source: "admin-read-model",
    scan_reason: "route-owned-page",
    actual_data_source: "admin-read-model",
    cache_status: "hit",
    result_count: 20,
    offset: 0,
    limit: 20
  });
}

test("runtime diagnostics recorder appends runtime metadata with the request timestamp", async () => {
  const calls: Array<{
    library_root: string;
    recorded_at: string;
    runtime: AdminRuntimeEndpointMeta;
  }> = [];
  const runtime = runtimeMeta();
  const recorder = createAdminRuntimeDiagnosticsRecorder({
    recorded_at: "2026-06-26T22:10:00.000Z",
    deps: {
      append_runtime_diagnostics_history: async (input) => {
        calls.push(input);
        return {
          schema_version: "1.0",
          recorded_at: input.recorded_at,
          runtime: input.runtime
        };
      }
    }
  });

  const entry = await recorder("/tmp/PublicLibrary", runtime);

  assert.deepEqual(calls, [{
    library_root: "/tmp/PublicLibrary",
    recorded_at: "2026-06-26T22:10:00.000Z",
    runtime
  }]);
  assert.equal(entry, undefined);
});

test("default runtime diagnostics recorder appends to the bounded diagnostics history", async () => {
  const libraryRoot = await mkdtemp(path.join(tmpdir(), "mixlab-admin-runtime-recorder-"));
  const runtime = runtimeMeta();
  const recorder = createDefaultAdminRuntimeDiagnosticsRecorder({
    recorded_at: "2026-06-26T22:11:00.000Z"
  });

  await recorder(libraryRoot, runtime);

  const history = await readAdminRuntimeDiagnosticsHistory({
    library_root: libraryRoot,
    generated_at: "2026-06-26T22:12:00.000Z",
    limit: 10
  });

  assert.equal(history.entries.length, 1);
  assert.equal(history.entries[0]?.recorded_at, "2026-06-26T22:11:00.000Z");
  assert.deepEqual(history.entries[0]?.runtime, runtime);
  assert.equal(history.malformed_line_count, 0);
});
