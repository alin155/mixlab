import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createAdminCommandSnapshot,
  adminCommandSnapshotRoot,
  type AdminCommandSnapshotManifest
} from "./admin-command-snapshot.ts";
import {
  restoreAdminCommandSnapshot
} from "./admin-command-restore.ts";
import {
  readAdminOperationLog
} from "./admin-operation-log.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-command-restore-"));
}

async function writeText(filePath: string, text: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text, "utf8");
}

async function readSnapshotManifest(filePath: string): Promise<AdminCommandSnapshotManifest> {
  return JSON.parse(await readFile(filePath, "utf8")) as AdminCommandSnapshotManifest;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function readCommandSnapshotManifests(libraryRoot: string): Promise<AdminCommandSnapshotManifest[]> {
  const root = adminCommandSnapshotRoot(libraryRoot);
  const directories = await readdir(root);
  const manifests: AdminCommandSnapshotManifest[] = [];
  for (const directory of directories) {
    manifests.push(await readSnapshotManifest(path.join(root, directory, "snapshot.json")));
  }
  return manifests;
}

test("admin command snapshot restore runs under command lease and restores captured files", async () => {
  const libraryRoot = await makeLibraryRoot();
  const settingsPath = path.join(libraryRoot, ".mixlab-library", "admin-settings.json");
  await writeText(settingsPath, "{\"library_name\":\"before\"}\n");
  const snapshot = await createAdminCommandSnapshot({
    library_root: libraryRoot,
    command: "settings-config",
    created_at: "2026-06-26T00:00:00.000Z",
    holder: "test-holder",
    snapshot_id: "restore-service-ok",
    files: [{
      label: "admin-settings",
      file_path: settingsPath
    }]
  });
  await writeText(settingsPath, "{\"library_name\":\"after\"}\n");

  const result = await restoreAdminCommandSnapshot({
    library_root: libraryRoot,
    snapshot_manifest_path: snapshot.manifest_path,
    now: "2026-06-26T00:02:00.000Z",
    holder: "restore-test-holder"
  });

  assert.equal(result.status, "restored");
  assert.equal(result.restored_file_count, 1);
  assert.equal(result.blocked_file_count, 0);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.files[0]?.restored, true);
  assert.equal(await readFile(settingsPath, "utf8"), "{\"library_name\":\"before\"}\n");

  const manifests = await readCommandSnapshotManifests(libraryRoot);
  const restoreSnapshot = manifests.find((manifest) => manifest.command === "command-snapshot-restore");
  assert.ok(restoreSnapshot);
  assert.equal(restoreSnapshot.holder, "restore-test-holder");
  assert.equal(restoreSnapshot.snapshot_kind, "file-capture");
  assert.equal(restoreSnapshot.files[0]?.status, "captured");
  assert.equal(
    await readFile(path.join(libraryRoot, restoreSnapshot.files[0]!.snapshot_relative_path!), "utf8"),
    "{\"library_name\":\"after\"}\n"
  );

  const log = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-26T00:03:00.000Z",
    limit: 10
  });
  assert.deepEqual(log.events.map((event) => event.action), [
    "command-snapshot-restore",
    "read-model-invalidate",
    "command-snapshot-restore"
  ]);
  assert.deepEqual(log.events.map((event) => event.event_type), [
    "succeeded",
    "skipped",
    "started"
  ]);
  assert.equal(log.events[0]?.area, "protection");
  assert.equal(log.events[0]?.details.scan_mode, "no-scan");
  assert.equal(log.events[0]?.details.requires_inactive_supervisor, true);
  assert.equal((log.events[0]?.details.command_snapshot as { snapshot_kind?: string })?.snapshot_kind, "file-capture");
  assert.equal((log.events[0]?.details.command_snapshot as { captured_file_count?: number })?.captured_file_count, 1);
});

test("admin command snapshot restore creates missing target directories", async () => {
  const libraryRoot = await makeLibraryRoot();
  const manifestPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "videos",
    "V000001",
    "source-video.json"
  );
  await writeText(manifestPath, "{\"source_video_id\":\"V000001\",\"preprocess_status\":\"queued\"}\n");
  const snapshot = await createAdminCommandSnapshot({
    library_root: libraryRoot,
    command: "source-video-metadata",
    created_at: "2026-06-26T00:00:00.000Z",
    holder: "test-holder",
    snapshot_id: "restore-missing-dir",
    files: [{
      label: "source-video-V000001-manifest",
      file_path: manifestPath
    }]
  });
  await rm(path.dirname(manifestPath), { recursive: true, force: true });
  assert.equal(await fileExists(manifestPath), false);

  const result = await restoreAdminCommandSnapshot({
    library_root: libraryRoot,
    snapshot_manifest_path: snapshot.manifest_path,
    now: "2026-06-26T00:02:00.000Z"
  });

  assert.equal(result.status, "restored");
  assert.equal(result.restored_file_count, 1);
  assert.equal(result.plan.files[0]?.target_status, "missing");
  assert.equal(await readFile(manifestPath, "utf8"), "{\"source_video_id\":\"V000001\",\"preprocess_status\":\"queued\"}\n");
});

test("admin command snapshot restore blocks missing snapshot files without copying", async () => {
  const libraryRoot = await makeLibraryRoot();
  const settingsPath = path.join(libraryRoot, ".mixlab-library", "admin-settings.json");
  await writeText(settingsPath, "{\"library_name\":\"before\"}\n");
  const snapshot = await createAdminCommandSnapshot({
    library_root: libraryRoot,
    command: "settings-config",
    created_at: "2026-06-26T00:00:00.000Z",
    holder: "test-holder",
    snapshot_id: "restore-missing-snapshot-file",
    files: [{
      label: "admin-settings",
      file_path: settingsPath
    }]
  });
  const manifest = await readSnapshotManifest(snapshot.manifest_path);
  await rm(path.join(libraryRoot, manifest.files[0]!.snapshot_relative_path!));
  await writeText(settingsPath, "{\"library_name\":\"after\"}\n");

  let copyCount = 0;
  const result = await restoreAdminCommandSnapshot({
    library_root: libraryRoot,
    snapshot_manifest_path: snapshot.manifest_path,
    now: "2026-06-26T00:02:00.000Z",
    copy_file: async () => {
      copyCount += 1;
    }
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.restored_file_count, 0);
  assert.equal(result.blockers.includes("snapshot_file_missing"), true);
  assert.equal(result.blockers.includes("restore_plan_blocked"), true);
  assert.equal(copyCount, 0);
  assert.equal(await readFile(settingsPath, "utf8"), "{\"library_name\":\"after\"}\n");
});

test("admin command snapshot restore blocks metadata-only snapshots without copying", async () => {
  const libraryRoot = await makeLibraryRoot();
  const snapshot = await createAdminCommandSnapshot({
    library_root: libraryRoot,
    command: "settings-config",
    created_at: "2026-06-26T00:00:00.000Z",
    holder: "test-holder",
    snapshot_id: "restore-metadata-only"
  });

  let copyCount = 0;
  const result = await restoreAdminCommandSnapshot({
    library_root: libraryRoot,
    snapshot_manifest_path: snapshot.manifest_path,
    now: "2026-06-26T00:02:00.000Z",
    copy_file: async () => {
      copyCount += 1;
    }
  });

  assert.equal(result.status, "blocked");
  assert.deepEqual(result.blockers, [
    "snapshot_is_not_file_capture",
    "restore_plan_blocked",
    "restore_plan_empty"
  ]);
  assert.equal(copyCount, 0);
});

test("admin command snapshot restore blocks manifests outside snapshot root without copying", async () => {
  const libraryRoot = await makeLibraryRoot();
  const manifestPath = path.join(libraryRoot, ".mixlab-library", "not-command-snapshot", "snapshot.json");
  await writeText(manifestPath, "{}\n");

  let copyCount = 0;
  const result = await restoreAdminCommandSnapshot({
    library_root: libraryRoot,
    snapshot_manifest_path: manifestPath,
    now: "2026-06-26T00:02:00.000Z",
    copy_file: async () => {
      copyCount += 1;
    }
  });

  assert.equal(result.status, "blocked");
  assert.deepEqual(result.blockers, [
    "snapshot_manifest_outside_command_snapshot_root",
    "restore_plan_blocked",
    "restore_plan_empty"
  ]);
  assert.equal(copyCount, 0);
});
