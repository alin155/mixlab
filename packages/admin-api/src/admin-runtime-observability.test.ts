import assert from "node:assert/strict";
import { appendFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  adminRuntimeDiagnosticsHistoryPath,
  appendAdminRuntimeDiagnosticsHistory,
  buildAdminRuntimeEndpointMeta,
  readAdminRuntimeDiagnosticsHistory
} from "./admin-runtime-observability.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-runtime-observability-"));
}

test("runtime endpoint metadata records duration and source contract", () => {
  const meta = buildAdminRuntimeEndpointMeta({
    endpoint: "/api/admin/source-videos",
    method: "GET",
    started_at_ms: 10,
    finished_at_ms: 85,
    scan_mode: "paged-list",
    data_source: "admin-read-model",
    scan_reason: "route-owned-page",
    actual_data_source: "admin-read-model",
    cache_status: "hit",
    result_count: 20,
    offset: 0,
    limit: 20,
    slow_threshold_ms: 100,
    repair_reason: "status-store:repaired-incomplete-manifest-rows",
    components: [{
      name: "usage_metrics",
      duration_ms: 12.4,
      data_source: "admin-read-model",
      scan_mode: "no-scan",
      scan_reason: "background-metrics",
      cache_status: "hit"
    }]
  });

  assert.equal(meta.schema_version, "1.0");
  assert.equal(meta.duration_ms, 75);
  assert.equal(meta.actual_data_source, "admin-read-model");
  assert.equal(meta.cache_status, "hit");
  assert.equal(meta.repair_reason, "status-store:repaired-incomplete-manifest-rows");
  assert.deepEqual(meta.components, [{
    name: "usage_metrics",
    duration_ms: 12,
    data_source: "admin-read-model",
    scan_mode: "no-scan",
    scan_reason: "background-metrics",
    cache_status: "hit"
  }]);
  assert.equal(meta.slow, false);
  assert.equal(meta.slow_reason, "");
});

test("runtime endpoint metadata explains slow responses", () => {
  const meta = buildAdminRuntimeEndpointMeta({
    endpoint: "/api/admin/index/versions",
    method: "GET",
    started_at_ms: 0,
    finished_at_ms: 2_500,
    scan_mode: "paged-list",
    data_source: "index-version-packages",
    scan_reason: "index-version-page",
    cache_status: "miss",
    slow_threshold_ms: 2_000,
    slow_reason: "index-version-directory-page"
  });

  assert.equal(meta.duration_ms, 2500);
  assert.equal(meta.slow, true);
  assert.equal(meta.slow_reason, "index-version-directory-page");
  assert.equal(meta.result_count, 0);
  assert.equal(meta.offset, 0);
  assert.equal(meta.limit, 0);
});

test("runtime diagnostics history keeps a bounded newest-first tail", async () => {
  const libraryRoot = await makeLibraryRoot();
  const first = buildAdminRuntimeEndpointMeta({
    endpoint: "/api/admin/source-videos",
    method: "GET",
    started_at_ms: 0,
    finished_at_ms: 20,
    scan_mode: "paged-list",
    data_source: "admin-read-model",
    scan_reason: "route-owned-page",
    cache_status: "hit",
    result_count: 1,
    limit: 20
  });
  const second = buildAdminRuntimeEndpointMeta({
    endpoint: "/api/admin/preprocess/jobs",
    method: "GET",
    started_at_ms: 0,
    finished_at_ms: 1_200,
    scan_mode: "status-scan",
    data_source: "admin-read-model",
    scan_reason: "route-owned-page",
    cache_status: "miss",
    slow_threshold_ms: 1_000,
    slow_reason: "preprocess-jobs-page-above-target"
  });
  const third = buildAdminRuntimeEndpointMeta({
    endpoint: "/api/admin/dashboard/metrics",
    method: "GET",
    started_at_ms: 0,
    finished_at_ms: 100,
    scan_mode: "status-scan",
    data_source: "usage-events",
    scan_reason: "background-metrics",
    cache_status: "hit",
    result_count: 1
  });

  await appendAdminRuntimeDiagnosticsHistory({
    library_root: libraryRoot,
    recorded_at: "2026-06-26T10:00:00.000Z",
    runtime: first,
    max_entries: 2
  });
  await appendAdminRuntimeDiagnosticsHistory({
    library_root: libraryRoot,
    recorded_at: "2026-06-26T10:00:01.000Z",
    runtime: second,
    max_entries: 2
  });
  await appendAdminRuntimeDiagnosticsHistory({
    library_root: libraryRoot,
    recorded_at: "2026-06-26T10:00:02.000Z",
    runtime: third,
    max_entries: 2
  });

  const history = await readAdminRuntimeDiagnosticsHistory({
    library_root: libraryRoot,
    generated_at: "2026-06-26T10:00:03.000Z",
    limit: 10
  });

  assert.equal(history.path, adminRuntimeDiagnosticsHistoryPath(libraryRoot));
  assert.equal(history.total_line_count, 2);
  assert.equal(history.malformed_line_count, 0);
  assert.equal(history.truncated, false);
  assert.deepEqual(history.entries.map((entry) => entry.runtime.endpoint), [
    "/api/admin/dashboard/metrics",
    "/api/admin/preprocess/jobs"
  ]);
  assert.equal(history.entries[1]?.runtime.slow, true);
  assert.equal(history.entries[1]?.runtime.slow_reason, "preprocess-jobs-page-above-target");
});

test("runtime diagnostics history tolerates malformed lines", async () => {
  const libraryRoot = await makeLibraryRoot();
  const diagnosticsPath = adminRuntimeDiagnosticsHistoryPath(libraryRoot);

  await appendAdminRuntimeDiagnosticsHistory({
    library_root: libraryRoot,
    recorded_at: "2026-06-26T10:00:00.000Z",
    runtime: buildAdminRuntimeEndpointMeta({
      endpoint: "/api/admin/index/versions",
      method: "GET",
      started_at_ms: 0,
      finished_at_ms: 10,
      scan_mode: "paged-list",
      data_source: "index-version-packages",
      scan_reason: "index-version-page",
      cache_status: "hit"
    })
  });
  await appendFile(diagnosticsPath, "not-json\n{\"schema_version\":\"1.0\"}\n", "utf8");

  const history = await readAdminRuntimeDiagnosticsHistory({
    library_root: libraryRoot,
    generated_at: "2026-06-26T10:00:01.000Z",
    limit: 5
  });

  assert.equal(history.total_line_count, 3);
  assert.equal(history.malformed_line_count, 2);
  assert.deepEqual(history.entries.map((entry) => entry.runtime.endpoint), [
    "/api/admin/index/versions"
  ]);
});
