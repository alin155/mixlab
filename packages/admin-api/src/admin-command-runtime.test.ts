import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import {
  AdminWriterLeaseError,
  withAdminWriterLease
} from "../../library-fs/src/index.ts";
import {
  adminCommandHolder,
  runAdminCommand
} from "./admin-command-runtime.ts";
import {
  AdminDockerMvpCommandBlockedError
} from "./admin-command-guard.ts";
import {
  adminCommandSnapshotRoot
} from "./admin-command-snapshot.ts";
import {
  readAdminOperationLog
} from "./admin-operation-log.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-command-runtime-"));
}

function leasePath(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library", "locks", "admin-writer.lock", "lease.json");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function waitForFile(filePath: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await fileExists(filePath)) {
      return;
    }
    await delay(5);
  }
  assert.fail(`timed out waiting for ${filePath}`);
}

test("admin command runtime acquires writer lease with command contract reason", async () => {
  const libraryRoot = await makeLibraryRoot();
  const result = await runAdminCommand({
    library_root: libraryRoot,
    command: "source-video-metadata",
    now: "2026-06-25T00:00:00.000Z",
    holder: "test-admin-api",
    actor: {
      kind: "admin-user",
      source: "admin-session",
      admin_id: "AU000001",
      username: "owner",
      display_name: "Owner",
      role: "owner"
    }
  }, async () => {
    const snapshotDirectories = await readdir(adminCommandSnapshotRoot(libraryRoot));
    assert.equal(snapshotDirectories.length, 1);
    const snapshotManifest = JSON.parse(await readFile(path.join(
      adminCommandSnapshotRoot(libraryRoot),
      snapshotDirectories[0]!,
      "snapshot.json"
    ), "utf8")) as {
      command: string;
      holder: string;
      snapshot_kind: string;
      rollback_status: string;
    };
    assert.equal(snapshotManifest.command, "source-video-metadata");
    assert.equal(snapshotManifest.holder, "test-admin-api");
    assert.equal(snapshotManifest.snapshot_kind, "metadata-only");
    assert.equal(snapshotManifest.rollback_status, "not-implemented");

    const lease = JSON.parse(await readFile(leasePath(libraryRoot), "utf8")) as {
      holder: string;
      reason: string;
    };
    assert.equal(lease.holder, "test-admin-api");
    assert.equal(lease.reason, "source-video-metadata");
    return "done";
  });

  assert.equal(result, "done");

  const log = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-25T00:00:02.000Z",
    limit: 10
  });
  assert.deepEqual(log.events.map((event) => event.event_type), ["succeeded", "started"]);
  assert.deepEqual(log.events.map((event) => event.action), [
    "source-video-metadata",
    "source-video-metadata"
  ]);
  assert.equal(log.events[0]?.area, "protection");
  assert.equal(log.events[0]?.details.command, "source-video-metadata");
  assert.deepEqual(log.events[0]?.details.actor, {
    kind: "admin-user",
    source: "admin-session",
    admin_id: "AU000001",
    username: "owner",
    display_name: "Owner",
    role: "owner"
  });
  assert.deepEqual(log.events[1]?.details.actor, log.events[0]?.details.actor);
  assert.equal(log.events[0]?.details.lease_reason, "source-video-metadata");
  assert.equal(log.events[0]?.details.scan_mode, "single-id");
  assert.equal((log.events[0]?.details.command_snapshot as { created?: boolean })?.created, true);
  assert.equal((log.events[1]?.details.command_snapshot as { created?: boolean })?.created, true);
});

test("admin command runtime blocks high-risk commands in docker mvp mode before writer lease", async () => {
  const libraryRoot = await makeLibraryRoot();
  let operationExecuted = false;

  await assert.rejects(
    () => runAdminCommand({
      library_root: libraryRoot,
      command: "source-video-publish",
      now: "2026-06-27T00:00:00.000Z",
      holder: "test-admin-api",
      docker_mvp_mode: "v0.1"
    }, async () => {
      operationExecuted = true;
      return "unexpected";
    }),
    (error) => {
      assert.equal(error instanceof AdminDockerMvpCommandBlockedError, true);
      assert.equal((error as AdminDockerMvpCommandBlockedError).code, "admin_mvp_command_blocked");
      assert.equal((error as AdminDockerMvpCommandBlockedError).details.command, "source-video-publish");
      return true;
    }
  );

  assert.equal(operationExecuted, false);
  assert.equal(await fileExists(leasePath(libraryRoot)), false);

  const log = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-27T00:00:01.000Z",
    limit: 10
  });
  assert.deepEqual(log.events.map((event) => event.event_type), ["failed"]);
  assert.equal(log.events[0]?.action, "source-video-publish");
  assert.equal(log.events[0]?.details.error_code, "admin_mvp_command_blocked");
  assert.equal("command_snapshot" in log.events[0]!.details, false);
});

test("admin command runtime keeps existing writer lease conflict behavior", async () => {
  const libraryRoot = await makeLibraryRoot();
  await mkdir(path.join(libraryRoot, ".mixlab-library"), { recursive: true });

  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = withAdminWriterLease({
    library_root: libraryRoot,
    holder: "test-suite",
    reason: "hold-command",
    now: "2026-06-25T00:00:00.000Z"
  }, async () => {
    await held;
  });

  await waitForFile(leasePath(libraryRoot));
  await assert.rejects(
    () => runAdminCommand({
      library_root: libraryRoot,
      command: "library-scan",
      now: "2026-06-25T00:00:01.000Z",
      holder: "second-command"
    }, async () => "unexpected"),
    (error) => {
      assert.equal(error instanceof AdminWriterLeaseError, true);
      assert.equal((error as AdminWriterLeaseError).code, "admin_writer_busy");
      assert.equal((error as AdminWriterLeaseError).details.lease?.reason, "hold-command");
      return true;
    }
  );

  const log = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-25T00:00:02.000Z",
    limit: 10
  });
  assert.deepEqual(log.events.map((event) => event.event_type), ["failed"]);
  assert.equal(log.events[0]?.action, "library-scan");
  assert.equal(log.events[0]?.area, "protection");
  assert.equal(log.events[0]?.details.error_code, "admin_writer_busy");
  assert.equal("command_snapshot" in log.events[0]!.details, false);

  release();
  await first;
});

test("admin command runtime logs failed commands and preserves thrown errors", async () => {
  const libraryRoot = await makeLibraryRoot();
  const failure = new Error("operation failed");
  (failure as Error & { code: string }).code = "expected_failure";

  await assert.rejects(
    () => runAdminCommand({
      library_root: libraryRoot,
      command: "source-video-publish",
      now: "2026-06-25T00:00:00.000Z",
      holder: "test-admin-api"
    }, async () => {
      throw failure;
    }),
    failure
  );

  const log = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-25T00:00:01.000Z",
    limit: 10
  });
  assert.deepEqual(log.events.map((event) => event.event_type), ["failed", "started"]);
  assert.equal(log.events[0]?.area, "release");
  assert.equal(log.events[0]?.details.error_code, "expected_failure");
  assert.equal(log.events[0]?.details.error_message, "operation failed");
  assert.equal((log.events[0]?.details.command_snapshot as { created?: boolean })?.created, true);
});

test("admin command runtime captures snapshot files inside writer lease before command body", async () => {
  const libraryRoot = await makeLibraryRoot();
  const targetPath = path.join(libraryRoot, ".mixlab-library", "admin-settings.json");
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, "{\"library_name\":\"before\"}\n", "utf8");

  const result = await runAdminCommand({
    library_root: libraryRoot,
    command: "settings-config",
    now: "2026-06-25T00:00:00.000Z",
    holder: "test-admin-api",
    snapshot_files: [{
      label: "admin-settings",
      file_path: targetPath
    }]
  }, async () => {
    assert.equal(await fileExists(leasePath(libraryRoot)), true);
    const snapshotDirectories = await readdir(adminCommandSnapshotRoot(libraryRoot));
    assert.equal(snapshotDirectories.length, 1);
    const snapshotManifestPath = path.join(
      adminCommandSnapshotRoot(libraryRoot),
      snapshotDirectories[0]!,
      "snapshot.json"
    );
    const snapshotManifest = JSON.parse(await readFile(snapshotManifestPath, "utf8")) as {
      snapshot_kind: string;
      files: Array<{
        status: string;
        snapshot_relative_path?: string;
      }>;
    };
    assert.equal(snapshotManifest.snapshot_kind, "file-capture");
    assert.equal(snapshotManifest.files[0]?.status, "captured");
    assert.equal(
      await readFile(path.join(libraryRoot, snapshotManifest.files[0]!.snapshot_relative_path!), "utf8"),
      "{\"library_name\":\"before\"}\n"
    );
    await writeFile(targetPath, "{\"library_name\":\"after\"}\n", "utf8");
    return "done";
  });

  assert.equal(result, "done");

  const log = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-25T00:00:01.000Z",
    limit: 10
  });
  assert.equal((log.events[0]?.details.command_snapshot as { snapshot_kind?: string })?.snapshot_kind, "file-capture");
  assert.equal((log.events[0]?.details.command_snapshot as { captured_file_count?: number })?.captured_file_count, 1);
});

test("admin command runtime plans dynamic snapshot files inside writer lease before command body", async () => {
  const libraryRoot = await makeLibraryRoot();
  const targetPath = path.join(libraryRoot, ".mixlab-library", "library.json");
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, "{\"video_count\":1}\n", "utf8");

  let providerSawLease = false;
  let bodySawSnapshot = false;
  const result = await runAdminCommand({
    library_root: libraryRoot,
    command: "index-repair",
    now: "2026-06-25T00:00:00.000Z",
    holder: "test-admin-api",
    snapshot_files_provider: async () => {
      providerSawLease = await fileExists(leasePath(libraryRoot));
      return [{
        label: "library-manifest",
        file_path: targetPath
      }];
    }
  }, async () => {
    const snapshotDirectories = await readdir(adminCommandSnapshotRoot(libraryRoot));
    const snapshotManifest = JSON.parse(await readFile(path.join(
      adminCommandSnapshotRoot(libraryRoot),
      snapshotDirectories[0]!,
      "snapshot.json"
    ), "utf8")) as {
      snapshot_kind: string;
      files: Array<{
        label: string;
        status: string;
        snapshot_relative_path?: string;
      }>;
    };
    bodySawSnapshot = snapshotManifest.snapshot_kind === "file-capture" &&
      snapshotManifest.files[0]?.label === "library-manifest" &&
      snapshotManifest.files[0]?.status === "captured";
    await writeFile(targetPath, "{\"video_count\":2}\n", "utf8");
    return "done";
  });

  assert.equal(result, "done");
  assert.equal(providerSawLease, true);
  assert.equal(bodySawSnapshot, true);
});

test("admin command runtime does not fail commands when snapshot metadata is unavailable", async () => {
  const libraryRoot = await makeLibraryRoot();
  const result = await runAdminCommand({
    library_root: libraryRoot,
    command: "settings-config",
    now: "2026-06-25T00:00:00.000Z",
    holder: "test-admin-api",
    create_command_snapshot: async () => ({
      created: false,
      reason: "write_failed",
      snapshot_kind: "metadata-only",
      rollback_status: "not-implemented",
      error_name: "Error",
      error_code: "EACCES",
      error_message: "snapshot store unavailable"
    })
  }, async () => "done");

  assert.equal(result, "done");

  const log = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-25T00:00:01.000Z",
    limit: 10
  });
  assert.deepEqual(log.events.map((event) => event.event_type), ["succeeded", "started"]);
  assert.deepEqual(log.events[0]?.details.command_snapshot, {
    created: false,
    reason: "write_failed",
    snapshot_kind: "metadata-only",
    rollback_status: "not-implemented",
    error_name: "Error",
    error_code: "EACCES",
    error_message: "snapshot store unavailable"
  });
});

test("admin command runtime does not fail commands when audit logging fails", async () => {
  const libraryRoot = await makeLibraryRoot();
  const result = await runAdminCommand({
    library_root: libraryRoot,
    command: "settings-config",
    now: "2026-06-25T00:00:00.000Z",
    holder: "test-admin-api",
    append_operation_log_event: async () => {
      throw new Error("operation log unavailable");
    }
  }, async () => "done");

  assert.equal(result, "done");
});

test("admin command holder names the admin-api process", () => {
  assert.equal(adminCommandHolder(1234), "admin-api:1234");
});
