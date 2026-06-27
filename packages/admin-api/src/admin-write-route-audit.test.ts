import assert from "node:assert/strict";
import test from "node:test";
import {
  adminCommandContract,
  adminCommandNames,
  type AdminCommandName
} from "./admin-command-guard.ts";
import { buildAdminDataLoadingPlan } from "./admin-data-loading-plan.ts";
import {
  adminWriteRouteAuditEntries,
  adminWriteRouteAuditEntry,
  adminWriteRouteAuditKey,
  adminWriteRouteAuditKeys
} from "./admin-write-route-audit.ts";

const expectedNonGetRouteKeys = [
  "DELETE /api/admin/settings/source-folders/:source_folder_id",
  "PATCH /api/admin/settings/config",
  "PATCH /api/admin/settings/source-folders/:source_folder_id",
  "PATCH /api/admin/source-videos/:source_video_id/cover",
  "PATCH /api/admin/source-videos/:source_video_id/metadata",
  "POST /api/admin/auth/login",
  "POST /api/admin/auth/logout",
  "POST /api/admin/auth/register",
  "POST /api/admin/command-snapshots/:snapshot_id/restore",
  "POST /api/admin/cutter-users/:user_id/approve",
  "POST /api/admin/cutter-users/:user_id/disable",
  "POST /api/admin/cutter-users/:user_id/password",
  "POST /api/admin/doctor/export",
  "POST /api/admin/doctor/run",
  "POST /api/admin/index/repair",
  "POST /api/admin/library/init",
  "POST /api/admin/library/scan",
  "POST /api/admin/library/scan-preview",
  "POST /api/admin/preprocess/queue-unprocessed",
  "POST /api/admin/preprocess/recover-processing",
  "POST /api/admin/preprocess/retry-failed",
  "POST /api/admin/preprocess/supervisor/start",
  "POST /api/admin/preprocess/supervisor/stop",
  "POST /api/admin/read-model/reconcile",
  "POST /api/admin/read-model/reconcile/cancel",
  "POST /api/admin/settings/source-folders",
  "POST /api/admin/settings/test-asr",
  "POST /api/admin/source-videos/:source_video_id/publish",
  "POST /api/admin/source-videos/:source_video_id/queue",
  "POST /api/admin/source-videos/:source_video_id/recover-processing",
  "POST /api/admin/source-videos/:source_video_id/retry"
].sort();

test("write route audit enumerates every current Admin non-GET route", () => {
  assert.deepEqual(adminWriteRouteAuditKeys(), expectedNonGetRouteKeys);
  assert.equal(
    new Set(adminWriteRouteAuditKeys()).size,
    adminWriteRouteAuditEntries.length,
    "route audit keys must be unique"
  );
});

test("command-runtime routes match the command guard contract", () => {
  for (const entry of adminWriteRouteAuditEntries) {
    if (entry.owner !== "command-runtime") {
      assert.equal(entry.command, undefined, `${adminWriteRouteAuditKey(entry)} must not declare a command`);
      continue;
    }

    assert.ok(entry.command, `${adminWriteRouteAuditKey(entry)} must declare its Admin command`);
    const contract = adminCommandContract(entry.command);
    assert.equal(entry.method, contract.method, `${entry.command} method mismatch`);
    assert.equal(entry.scan_mode, contract.scan_mode, `${entry.command} scan mode mismatch`);
    assert.equal(entry.uses_writer_lease, contract.requires_writer_lease, `${entry.command} writer lease mismatch`);
    assert.deepEqual(
      [...entry.mutation_targets].sort(),
      [...contract.mutation_targets].sort(),
      `${entry.command} mutation targets mismatch`
    );
    assert.equal(entry.audit_surface, "command-audit", `${entry.command} must use command audit`);
  }
});

test("every public Admin command has route ownership or is explicitly system-only", () => {
  const routedCommands = new Set(
    adminWriteRouteAuditEntries
      .map((entry) => entry.command)
      .filter((command): command is AdminCommandName => Boolean(command))
  );
  const systemOnlyCommands = new Set<AdminCommandName>([
    "preprocess-queue-unprocessed-pipeline",
    "preprocess-worker-claim",
    "preprocess-worker-stage",
    "preprocess-worker-complete",
    "preprocess-worker-fail",
    "preprocess-worker-refresh-counts",
    "preprocess-supervisor-publish-ready"
  ]);

  for (const command of adminCommandNames) {
    assert.equal(
      routedCommands.has(command) || systemOnlyCommands.has(command),
      true,
      `${command} must be routed or documented as system-only`
    );
  }
});

test("explicit non-command exceptions stay narrow and do not claim writer lease coverage", () => {
  const exceptionOwners = new Set([
    "readonly-preview",
    "supervisor-runtime",
    "maintenance-control",
    "runtime-diagnostic"
  ]);

  for (const entry of adminWriteRouteAuditEntries) {
    if (!exceptionOwners.has(entry.owner)) {
      continue;
    }

    assert.equal(entry.command_runtime, "none", `${adminWriteRouteAuditKey(entry)} is not a command runtime route`);
    assert.equal(entry.uses_writer_lease, false, `${adminWriteRouteAuditKey(entry)} must not claim writer lease`);
    assert.notEqual(entry.audit_surface, "command-audit", `${adminWriteRouteAuditKey(entry)} must not claim command audit`);
    assert.ok(entry.notes.length > 40, `${adminWriteRouteAuditKey(entry)} must document why it is outside command runtime`);
  }
});

test("data-loading plan non-GET endpoints are represented in the write-route audit", () => {
  const plan = buildAdminDataLoadingPlan({
    generated_at: "2026-06-26T00:00:00.000Z",
    manifest_cache_ttl_ms: 30_000
  });

  for (const endpoint of plan.endpoints) {
    if (endpoint.method === "GET") {
      continue;
    }

    assert.ok(
      adminWriteRouteAuditEntry({
        endpoint: endpoint.endpoint,
        method: endpoint.method
      }),
      `${endpoint.method} ${endpoint.endpoint} must be represented in write-route audit`
    );
  }
});
