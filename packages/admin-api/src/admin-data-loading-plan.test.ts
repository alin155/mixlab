import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAdminDataLoadingPlan,
  type AdminDataLoadingEndpointPlan
} from "./admin-data-loading-plan.ts";
import { adminScanModeProfile, isAdminScanMode } from "./admin-scan-modes.ts";

function endpointMap(): Map<string, AdminDataLoadingEndpointPlan> {
  const plan = buildAdminDataLoadingPlan({
    generated_at: "2026-06-26T14:10:00.000Z",
    manifest_cache_ttl_ms: 30_000
  });

  return new Map(plan.endpoints.map((endpoint) => [endpoint.endpoint, endpoint]));
}

test("data loading endpoints expose shared scan metadata", () => {
  const endpoints = [...endpointMap().values()];

  assert.equal(endpoints.length > 0, true);

  for (const endpoint of endpoints) {
    assert.equal(isAdminScanMode(endpoint.scan_mode), true, endpoint.endpoint);
    assert.equal(typeof endpoint.data_source, "string", endpoint.endpoint);
    assert.equal(endpoint.data_source.length > 0, true, endpoint.endpoint);
    assert.equal(typeof endpoint.scan_reason, "string", endpoint.endpoint);
    assert.equal(endpoint.scan_reason.length > 0, true, endpoint.endpoint);
  }
});

test("route-owned endpoints avoid full-reconcile and registered routes point to registered endpoints", () => {
  const plan = buildAdminDataLoadingPlan({
    generated_at: "2026-06-26T14:10:00.000Z",
    manifest_cache_ttl_ms: 30_000
  });
  const endpoints = new Map(plan.endpoints.map((endpoint) => [endpoint.endpoint, endpoint]));

  for (const route of plan.routes) {
    for (const endpointPath of route.endpoints) {
      const endpoint = endpoints.get(endpointPath);
      assert.ok(endpoint, `${route.route} references unregistered endpoint ${endpointPath}`);
      assert.notEqual(endpoint.scan_mode, "full-reconcile", endpointPath);
      assert.equal(adminScanModeProfile(endpoint.scan_mode).blocks_page_open, false, endpointPath);
    }
  }
});

test("explicit scan and maintenance commands have distinct scan modes", () => {
  const endpoints = endpointMap();
  const restorePlan = endpoints.get("/api/admin/command-snapshots/:snapshot_id/restore-plan");
  const restoreExecution = endpoints.get("/api/admin/command-snapshots/:snapshot_id/restore");

  assert.equal(endpoints.get("/api/admin/library/scan-preview")?.scan_mode, "folder-scan");
  assert.equal(endpoints.get("/api/admin/library/scan-preview")?.data_source, "source-folders");
  assert.equal(endpoints.get("/api/admin/library/scan-preview")?.scan_reason, "explicit-scan-preview");
  assert.equal(endpoints.get("/api/admin/library/scan")?.scan_mode, "folder-scan");
  assert.equal(endpoints.get("/api/admin/library/scan")?.scan_reason, "explicit-scan-apply");
  assert.equal(endpoints.get("/api/admin/read-model/reconcile")?.scan_mode, "full-reconcile");
  assert.equal(endpoints.get("/api/admin/read-model/reconcile")?.data_source, "read-model-reconcile");
  assert.equal(endpoints.get("/api/admin/read-model/reconcile/cancel")?.scan_mode, "no-scan");
  assert.equal(restorePlan?.method, "GET");
  assert.equal(restorePlan?.phase, "command");
  assert.equal(restorePlan?.refresh, "command-only");
  assert.equal(restorePlan?.scan_mode, "no-scan");
  assert.equal(restorePlan?.data_source, "command-snapshot");
  assert.equal(restorePlan?.scan_reason, "selected-record");
  assert.equal(restoreExecution?.method, "POST");
  assert.equal(restoreExecution?.phase, "command");
  assert.equal(restoreExecution?.refresh, "command-only");
  assert.equal(restoreExecution?.scan_mode, "no-scan");
  assert.equal(restoreExecution?.data_source, "command-snapshot");
  assert.equal(restoreExecution?.scan_reason, "selected-record");
});

test("runtime diagnostics history is a no-scan route-owned read model", () => {
  const plan = buildAdminDataLoadingPlan({
    generated_at: "2026-06-26T14:10:00.000Z",
    manifest_cache_ttl_ms: 30_000
  });
  const endpoints = new Map(plan.endpoints.map((endpoint) => [endpoint.endpoint, endpoint]));
  const diagnostics = endpoints.get("/api/admin/runtime/diagnostics/history");
  const doctorRoute = plan.routes.find((route) => route.route === "doctor");

  assert.equal(diagnostics?.phase, "route");
  assert.equal(diagnostics?.scan_mode, "no-scan");
  assert.equal(diagnostics?.data_source, "admin-read-model");
  assert.equal(diagnostics?.read_model, "runtime-diagnostics-history-v1");
  assert.equal(doctorRoute?.endpoints.includes("/api/admin/runtime/diagnostics/history"), true);
});

test("preprocess process history is a no-scan route-owned read model", () => {
  const endpoints = endpointMap();
  const processHistory = endpoints.get("/api/admin/preprocess/process-history");
  const readiness = endpoints.get("/api/admin/preprocess/process-history/readiness");
  const preprocessRoute = buildAdminDataLoadingPlan({
    generated_at: "2026-06-25T00:00:00.000Z",
    manifest_cache_ttl_ms: 1_000
  }).routes.find((route) => route.route === "preprocess-jobs");

  assert.equal(processHistory?.phase, "route");
  assert.equal(processHistory?.scan_mode, "no-scan");
  assert.equal(processHistory?.data_source, "admin-read-model");
  assert.equal(processHistory?.read_model, "admin-read-model-v1");
  assert.equal(processHistory?.default_limit, 50);
  assert.equal(readiness?.phase, "route");
  assert.equal(readiness?.cost, "cheap");
  assert.equal(readiness?.scan_mode, "no-scan");
  assert.equal(readiness?.scan_reason, "read-model-health");
  assert.equal(readiness?.read_model, "admin-read-model-v1");
  assert.equal(preprocessRoute?.endpoints.includes("/api/admin/preprocess/process-history/readiness"), true);
});

test("protection route includes read-model reconcile status without page scans", () => {
  const plan = buildAdminDataLoadingPlan({
    generated_at: "2026-06-25T00:00:00.000Z",
    manifest_cache_ttl_ms: 1_000
  });
  const endpoints = new Map(plan.endpoints.map((endpoint) => [endpoint.endpoint, endpoint]));
  const protectionRoute = plan.routes.find((route) => route.route === "protection");
  const reconcileStatus = endpoints.get("/api/admin/read-model/reconcile/status");

  assert.deepEqual(protectionRoute?.endpoints, [
    "/api/admin/operations/overview",
    "/api/admin/read-model/reconcile/status"
  ]);
  assert.equal(reconcileStatus?.phase, "route");
  assert.equal(reconcileStatus?.cost, "cheap");
  assert.equal(reconcileStatus?.scan_mode, "no-scan");
  assert.equal(reconcileStatus?.data_source, "read-model-reconcile");
  assert.equal(reconcileStatus?.scan_reason, "read-model-health");
  assert.equal(reconcileStatus?.read_model, "admin-read-model-v1");
});

test("index publish route owns pending publish and index-version loading", () => {
  const plan = buildAdminDataLoadingPlan({
    generated_at: "2026-06-25T00:00:00.000Z",
    manifest_cache_ttl_ms: 1_000
  });
  const endpoints = new Map(plan.endpoints.map((endpoint) => [endpoint.endpoint, endpoint]));
  const indexPublishRoute = plan.routes.find((route) => route.route === "index-publish");

  assert.deepEqual(indexPublishRoute?.endpoints, [
    "/api/admin/source-videos",
    "/api/admin/index/versions"
  ]);
  assert.equal(indexPublishRoute?.load_phase, "route-entry");
  assert.equal(indexPublishRoute?.prefetch, false);
  assert.equal(endpoints.get("/api/admin/source-videos")?.data_source, "admin-read-model");
  assert.equal(endpoints.get("/api/admin/source-videos")?.scan_mode, "paged-list");
  assert.equal(endpoints.get("/api/admin/index/versions")?.data_source, "index-version-packages");
  assert.equal(endpoints.get("/api/admin/index/versions")?.scan_mode, "paged-list");
});
