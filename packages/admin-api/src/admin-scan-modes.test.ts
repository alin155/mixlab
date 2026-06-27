import assert from "node:assert/strict";
import test from "node:test";
import { adminCommandContract, adminCommandNames } from "./admin-command-guard.ts";
import {
  ADMIN_SCAN_MODES,
  adminScanModeProfile,
  isAdminScanMode
} from "./admin-scan-modes.ts";
import {
  planAdminReadModelStoreReconciliation,
  type AdminReadModelStoreStatus
} from "./admin-read-model-store.ts";

function storeStatus(
  freshness: AdminReadModelStoreStatus["freshness"]
): AdminReadModelStoreStatus {
  return {
    schema_version: "1.0",
    storage: "sqlite",
    path: "/tmp/admin.sqlite",
    freshness,
    exists: freshness !== "missing",
    generated_at: "2026-06-26T14:00:00.000Z",
    library_updated_at: "2026-06-26T14:00:00.000Z",
    current_library_updated_at: "2026-06-26T14:00:00.000Z",
    video_count: 0,
    current_video_count: 0,
    counts_by_status: {
      unprocessed: 0,
      queued: 0,
      processing: 0,
      ready: 0,
      failed: 0,
      "index-required": 0
    },
    invalidated_at: "",
    invalidation_reason: "",
    last_error: ""
  };
}

test("admin scan mode taxonomy covers page-safe and maintenance scan decisions", () => {
  assert.deepEqual(ADMIN_SCAN_MODES, [
    "no-scan",
    "single-id",
    "paged-list",
    "folder-scan",
    "status-scan",
    "full-reconcile"
  ]);

  assert.equal(adminScanModeProfile("no-scan").blocks_page_open, false);
  assert.equal(adminScanModeProfile("single-id").default_data_source, "source-video-manifest");
  assert.equal(adminScanModeProfile("paged-list").default_reason, "route-owned-page");
  assert.equal(adminScanModeProfile("folder-scan").scans_source_folders, true);
  assert.equal(adminScanModeProfile("folder-scan").blocks_page_open, true);
  assert.equal(adminScanModeProfile("status-scan").scans_manifest_tree, true);
  assert.equal(adminScanModeProfile("full-reconcile").default_data_source, "read-model-reconcile");
  assert.equal(adminScanModeProfile("full-reconcile").blocks_page_open, true);
});

test("admin command contracts use the shared scan mode taxonomy", () => {
  for (const command of adminCommandNames) {
    assert.equal(isAdminScanMode(adminCommandContract(command).scan_mode), true, command);
  }

  assert.equal(adminCommandContract("library-scan").scan_mode, "folder-scan");
  assert.equal(adminCommandContract("read-model-reconcile").scan_mode, "full-reconcile");
  assert.equal(adminCommandContract("source-video-publish").scan_mode, "single-id");
});

test("read-model reconciliation plans use shared no-scan and full-reconcile modes", () => {
  assert.equal(
    planAdminReadModelStoreReconciliation({
      status: storeStatus("fresh"),
      library_available: true
    }).scan_mode,
    "no-scan"
  );
  assert.equal(
    planAdminReadModelStoreReconciliation({
      status: storeStatus("missing"),
      library_available: true
    }).scan_mode,
    "full-reconcile"
  );
  assert.equal(
    planAdminReadModelStoreReconciliation({
      status: storeStatus("stale"),
      library_available: true
    }).scan_mode,
    "full-reconcile"
  );
});
