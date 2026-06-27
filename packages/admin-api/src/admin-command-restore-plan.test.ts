import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createAdminCommandSnapshot,
  type AdminCommandSnapshotManifest
} from "./admin-command-snapshot.ts";
import {
  planAdminCommandSnapshotRestore
} from "./admin-command-restore-plan.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-command-restore-plan-"));
}

async function writeText(filePath: string, text: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text, "utf8");
}

async function readSnapshotManifest(filePath: string): Promise<AdminCommandSnapshotManifest> {
  return JSON.parse(await readFile(filePath, "utf8")) as AdminCommandSnapshotManifest;
}

async function writeSnapshotManifest(filePath: string, manifest: AdminCommandSnapshotManifest): Promise<void> {
  await writeText(filePath, `${JSON.stringify(manifest, null, 2)}\n`);
}

test("admin command restore plan verifies a captured file without leaking absolute paths", async () => {
  const libraryRoot = await makeLibraryRoot();
  const settingsPath = path.join(libraryRoot, ".mixlab-library", "admin-settings.json");
  await writeText(settingsPath, "{\"library_name\":\"before\"}\n");

  const snapshot = await createAdminCommandSnapshot({
    library_root: libraryRoot,
    command: "settings-config",
    created_at: "2026-06-26T00:00:00.000Z",
    holder: "test-holder",
    snapshot_id: "restore-ok",
    files: [{
      label: "admin-settings",
      file_path: settingsPath
    }]
  });
  await writeText(settingsPath, "{\"library_name\":\"after\"}\n");

  const plan = await planAdminCommandSnapshotRestore({
    library_root: libraryRoot,
    snapshot_manifest_path: snapshot.manifest_path,
    generated_at: "2026-06-26T00:01:00.000Z"
  });

  assert.equal(plan.can_restore, true);
  assert.equal(plan.command, "settings-config");
  assert.equal(plan.snapshot_id, "restore-ok");
  assert.equal(plan.snapshot_kind, "file-capture");
  assert.equal(plan.file_count, 1);
  assert.equal(plan.restorable_file_count, 1);
  assert.deepEqual(plan.blockers, []);
  assert.equal(plan.files[0]?.can_restore, true);
  assert.equal(plan.files[0]?.target_status, "exists");
  assert.equal(plan.files[0]?.snapshot_status, "exists");
  assert.equal(plan.files[0]?.source_relative_path, path.join(".mixlab-library", "admin-settings.json"));
  assert.ok(!plan.snapshot_manifest_relative_path?.startsWith(libraryRoot));
  assert.ok(!plan.files[0]?.source_relative_path?.startsWith(libraryRoot));
  assert.ok(!plan.files[0]?.snapshot_relative_path?.startsWith(libraryRoot));
});

test("admin command restore plan blocks metadata-only snapshots", async () => {
  const libraryRoot = await makeLibraryRoot();
  const snapshot = await createAdminCommandSnapshot({
    library_root: libraryRoot,
    command: "settings-config",
    created_at: "2026-06-26T00:00:00.000Z",
    holder: "test-holder",
    snapshot_id: "metadata-only"
  });

  const plan = await planAdminCommandSnapshotRestore({
    library_root: libraryRoot,
    snapshot_manifest_path: snapshot.manifest_path,
    generated_at: "2026-06-26T00:01:00.000Z"
  });

  assert.equal(plan.can_restore, false);
  assert.equal(plan.file_count, 0);
  assert.deepEqual(plan.blockers, ["snapshot_is_not_file_capture"]);
});

test("admin command restore plan blocks missing snapshot files", async () => {
  const libraryRoot = await makeLibraryRoot();
  const sourcePath = path.join(libraryRoot, ".mixlab-library", "admin-settings.json");
  await writeText(sourcePath, "{\"library_name\":\"before\"}\n");
  const snapshot = await createAdminCommandSnapshot({
    library_root: libraryRoot,
    command: "settings-config",
    created_at: "2026-06-26T00:00:00.000Z",
    holder: "test-holder",
    snapshot_id: "missing-file",
    files: [{ label: "admin-settings", file_path: sourcePath }]
  });
  const manifest = await readSnapshotManifest(snapshot.manifest_path);
  await rm(path.join(libraryRoot, manifest.files[0]!.snapshot_relative_path!));

  const plan = await planAdminCommandSnapshotRestore({
    library_root: libraryRoot,
    snapshot_manifest_path: snapshot.manifest_path,
    generated_at: "2026-06-26T00:01:00.000Z"
  });

  assert.equal(plan.can_restore, false);
  assert.equal(plan.files[0]?.snapshot_status, "missing");
  assert.deepEqual(plan.files[0]?.blockers, ["snapshot_file_missing"]);
  assert.deepEqual(plan.blockers, ["snapshot_file_missing"]);
});

test("admin command restore plan blocks snapshot file size mismatches", async () => {
  const libraryRoot = await makeLibraryRoot();
  const sourcePath = path.join(libraryRoot, ".mixlab-library", "admin-settings.json");
  await writeText(sourcePath, "{\"library_name\":\"before\"}\n");
  const snapshot = await createAdminCommandSnapshot({
    library_root: libraryRoot,
    command: "settings-config",
    created_at: "2026-06-26T00:00:00.000Z",
    holder: "test-holder",
    snapshot_id: "size-mismatch",
    files: [{ label: "admin-settings", file_path: sourcePath }]
  });
  const manifest = await readSnapshotManifest(snapshot.manifest_path);
  await writeText(path.join(libraryRoot, manifest.files[0]!.snapshot_relative_path!), "changed\n");

  const plan = await planAdminCommandSnapshotRestore({
    library_root: libraryRoot,
    snapshot_manifest_path: snapshot.manifest_path,
    generated_at: "2026-06-26T00:01:00.000Z"
  });

  assert.equal(plan.can_restore, false);
  assert.equal(plan.files[0]?.snapshot_status, "size-mismatch");
  assert.deepEqual(plan.files[0]?.blockers, ["snapshot_file_size_mismatch"]);
});

test("admin command restore plan blocks unsafe source and snapshot paths", async () => {
  const libraryRoot = await makeLibraryRoot();
  const sourcePath = path.join(libraryRoot, ".mixlab-library", "admin-settings.json");
  await writeText(sourcePath, "{\"library_name\":\"before\"}\n");
  const snapshot = await createAdminCommandSnapshot({
    library_root: libraryRoot,
    command: "settings-config",
    created_at: "2026-06-26T00:00:00.000Z",
    holder: "test-holder",
    snapshot_id: "unsafe-paths",
    files: [{ label: "admin-settings", file_path: sourcePath }]
  });
  const manifest = await readSnapshotManifest(snapshot.manifest_path);
  manifest.files[0] = {
    ...manifest.files[0]!,
    source_relative_path: "../outside-admin-settings.json",
    snapshot_relative_path: "../outside-snapshot.json"
  };
  await writeSnapshotManifest(snapshot.manifest_path, manifest);

  const plan = await planAdminCommandSnapshotRestore({
    library_root: libraryRoot,
    snapshot_manifest_path: snapshot.manifest_path,
    generated_at: "2026-06-26T00:01:00.000Z"
  });

  assert.equal(plan.can_restore, false);
  assert.equal(plan.files[0]?.snapshot_status, "unsafe");
  assert.equal(plan.files[0]?.target_status, "unsafe");
  assert.deepEqual(plan.files[0]?.blockers, [
    "snapshot_file_path_unsafe",
    "source_path_unsafe"
  ]);
});

test("admin command restore plan blocks targets that are directories", async () => {
  const libraryRoot = await makeLibraryRoot();
  const sourcePath = path.join(libraryRoot, ".mixlab-library", "admin-settings.json");
  await writeText(sourcePath, "{\"library_name\":\"before\"}\n");
  const snapshot = await createAdminCommandSnapshot({
    library_root: libraryRoot,
    command: "settings-config",
    created_at: "2026-06-26T00:00:00.000Z",
    holder: "test-holder",
    snapshot_id: "target-directory",
    files: [{ label: "admin-settings", file_path: sourcePath }]
  });
  await rm(sourcePath);
  await mkdir(sourcePath);

  const plan = await planAdminCommandSnapshotRestore({
    library_root: libraryRoot,
    snapshot_manifest_path: snapshot.manifest_path,
    generated_at: "2026-06-26T00:01:00.000Z"
  });

  assert.equal(plan.can_restore, false);
  assert.equal(plan.files[0]?.target_status, "not-file");
  assert.deepEqual(plan.files[0]?.blockers, ["target_is_not_file"]);
});

test("admin command restore plan blocks malformed manifests without uncaught JSON errors", async () => {
  const libraryRoot = await makeLibraryRoot();
  const manifestPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "admin",
    "command-snapshots",
    "bad-snapshot",
    "snapshot.json"
  );
  await writeText(manifestPath, "{bad json");

  const plan = await planAdminCommandSnapshotRestore({
    library_root: libraryRoot,
    snapshot_manifest_path: manifestPath,
    generated_at: "2026-06-26T00:01:00.000Z"
  });

  assert.equal(plan.can_restore, false);
  assert.deepEqual(plan.blockers, ["snapshot_manifest_invalid_json"]);
});

test("admin command restore plan blocks manifests with invalid schema", async () => {
  const libraryRoot = await makeLibraryRoot();
  const manifestPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "admin",
    "command-snapshots",
    "bad-schema",
    "snapshot.json"
  );
  await writeText(manifestPath, "{\"schema_version\":\"0.0\",\"files\":[]}\n");

  const plan = await planAdminCommandSnapshotRestore({
    library_root: libraryRoot,
    snapshot_manifest_path: manifestPath,
    generated_at: "2026-06-26T00:01:00.000Z"
  });

  assert.equal(plan.can_restore, false);
  assert.deepEqual(plan.blockers, ["snapshot_manifest_invalid_schema"]);
});

test("admin command restore plan rejects manifests outside the command snapshot root", async () => {
  const libraryRoot = await makeLibraryRoot();
  const manifestPath = path.join(libraryRoot, ".mixlab-library", "not-command-snapshot", "snapshot.json");
  await writeText(manifestPath, "{}\n");

  const plan = await planAdminCommandSnapshotRestore({
    library_root: libraryRoot,
    snapshot_manifest_path: manifestPath,
    generated_at: "2026-06-26T00:01:00.000Z"
  });

  assert.equal(plan.can_restore, false);
  assert.deepEqual(plan.blockers, ["snapshot_manifest_outside_command_snapshot_root"]);
});
