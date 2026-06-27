import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  adminCommandAuditArea,
  adminCommandAuditDetails,
  appendAdminCommandAuditEvent,
  appendAdminCommandAuditEventBestEffort
} from "./admin-command-audit.ts";
import {
  readAdminOperationLog
} from "./admin-operation-log.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-command-audit-"));
}

test("admin command audit maps commands to operation-log areas", () => {
  assert.equal(adminCommandAuditArea("settings-config"), "settings");
  assert.equal(adminCommandAuditArea("library-scan"), "protection");
  assert.equal(adminCommandAuditArea("source-video-queue"), "preprocess");
  assert.equal(adminCommandAuditArea("preprocess-worker-claim"), "preprocess");
  assert.equal(adminCommandAuditArea("preprocess-worker-refresh-counts"), "preprocess");
  assert.equal(adminCommandAuditArea("source-video-publish"), "release");
  assert.equal(adminCommandAuditArea("read-model-reconcile"), "read-model");
  assert.equal(adminCommandAuditArea("command-snapshot-restore"), "protection");
  assert.equal(adminCommandAuditArea("admin-auth-login"), "system");
  assert.equal(adminCommandAuditArea("cutter-user-approve"), "users");
});

test("admin command audit details include command contract and read-model invalidation policy", () => {
  const details = adminCommandAuditDetails({
    command: "source-folder-update",
    holder: "test-holder",
    actor: {
      kind: "admin-user",
      source: "admin-session",
      admin_id: "AU000001",
      username: "owner",
      display_name: "Owner",
      role: "owner"
    },
    snapshot: {
      created: true,
      reason: "created",
      snapshot_kind: "metadata-only",
      rollback_status: "not-implemented",
      snapshot_id: "snapshot-1",
      snapshot_directory: "/tmp/snapshot-1",
      manifest_path: "/tmp/snapshot-1/snapshot.json",
      manifest_relative_path: ".mixlab-library/admin/command-snapshots/snapshot-1/snapshot.json",
      requested_file_count: 1,
      captured_file_count: 1,
      missing_file_count: 0,
      skipped_file_count: 0,
      failed_file_count: 0
    }
  });

  assert.equal(details.command, "source-folder-update");
  assert.equal(details.holder, "test-holder");
  assert.deepEqual(details.actor, {
    kind: "admin-user",
    source: "admin-session",
    admin_id: "AU000001",
    username: "owner",
    display_name: "Owner",
    role: "owner"
  });
  assert.equal(details.method, "PATCH");
  assert.equal(details.scope, "library");
  assert.equal(details.scan_mode, "no-scan");
  assert.deepEqual(details.mutation_targets, [
    "admin-settings",
    "source-folder-config",
    "read-model-cache"
  ]);
  assert.deepEqual(details.read_model_invalidation, {
    invalidates_source_video_read_model: true,
    requires_read_model_reconcile: true,
    reason: "source-folder-scope-change"
  });
  assert.deepEqual(details.command_snapshot, {
    created: true,
    reason: "created",
    snapshot_kind: "metadata-only",
    rollback_status: "not-implemented",
    snapshot_id: "snapshot-1",
    manifest_relative_path: ".mixlab-library/admin/command-snapshots/snapshot-1/snapshot.json",
    requested_file_count: 1,
    captured_file_count: 1,
    missing_file_count: 0,
    skipped_file_count: 0,
    failed_file_count: 0
  });
});

test("admin command audit details expose unavailable command snapshots", () => {
  const details = adminCommandAuditDetails({
    command: "library-scan",
    holder: "test-holder",
    snapshot: {
      created: false,
      reason: "write_failed",
      snapshot_kind: "metadata-only",
      rollback_status: "not-implemented",
      error_name: "Error",
      error_code: "EACCES",
      error_message: "snapshot store unavailable"
    }
  });

  assert.deepEqual(details.command_snapshot, {
    created: false,
    reason: "write_failed",
    snapshot_kind: "metadata-only",
    rollback_status: "not-implemented",
    error_name: "Error",
    error_code: "EACCES",
    error_message: "snapshot store unavailable"
  });
});

test("admin command audit details fall back to runtime holder actor", () => {
  const details = adminCommandAuditDetails({
    command: "library-init",
    holder: "test-holder"
  });

  assert.deepEqual(details.actor, {
    kind: "unknown",
    source: "runtime-holder",
    label: "test-holder"
  });
});

test("admin command audit appends sanitized failure details without stack traces", async () => {
  const libraryRoot = await makeLibraryRoot();
  const error = new Error("expected failure");
  (error as Error & { code: string }).code = "expected_code";

  await appendAdminCommandAuditEvent({
    library_root: libraryRoot,
    command: "source-video-metadata",
    occurred_at: "2026-06-26T00:00:00.000Z",
    event_type: "failed",
    holder: "test-holder",
    actor: {
      kind: "system",
      source: "system-task",
      label: "test-system"
    },
    error
  });

  const log = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-26T00:00:01.000Z",
    limit: 10
  });

  assert.equal(log.events[0]?.area, "protection");
  assert.equal(log.events[0]?.action, "source-video-metadata");
  assert.equal(log.events[0]?.event_type, "failed");
  assert.equal(log.events[0]?.details.error_code, "expected_code");
  assert.equal(log.events[0]?.details.error_message, "expected failure");
  assert.deepEqual(log.events[0]?.details.actor, {
    kind: "system",
    source: "system-task",
    label: "test-system"
  });
  assert.equal("stack" in log.events[0]!.details, false);
});

test("admin command audit best-effort helper swallows operation-log write failures", async () => {
  await appendAdminCommandAuditEventBestEffort({
    library_root: "/does/not/matter",
    command: "library-init",
    occurred_at: "2026-06-26T00:00:00.000Z",
    event_type: "started",
    holder: "test-holder",
    append_operation_log_event: async () => {
      throw new Error("log unavailable");
    }
  });

  assert.ok(true);
});
