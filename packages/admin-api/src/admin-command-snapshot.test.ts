import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  adminCommandSnapshotRoot,
  adminCommandSnapshotSafeSegment,
  buildAdminCommandSnapshotManifest,
  createAdminCommandSnapshot,
  createAdminCommandSnapshotBestEffort
} from "./admin-command-snapshot.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-command-snapshot-"));
}

test("admin command snapshot safe segment blocks path traversal segments", () => {
  assert.equal(adminCommandSnapshotSafeSegment("2026-06-26T00:00:00.000Z"), "2026-06-26T00-00-00.000Z");
  assert.equal(adminCommandSnapshotSafeSegment("../source folder"), "..-source-folder");
  assert.equal(adminCommandSnapshotSafeSegment(".."), "unknown");
  assert.equal(adminCommandSnapshotSafeSegment("   "), "unknown");
});

test("admin command snapshot manifest records command contract and rollback status", () => {
  const manifest = buildAdminCommandSnapshotManifest({
    snapshot_id: "snapshot-1",
    created_at: "2026-06-26T00:00:00.000Z",
    command: "source-video-publish",
    holder: "test-holder"
  });

  assert.equal(manifest.schema_version, "1.0");
  assert.equal(manifest.snapshot_id, "snapshot-1");
  assert.equal(manifest.command, "source-video-publish");
  assert.equal(manifest.holder, "test-holder");
  assert.equal(manifest.snapshot_kind, "metadata-only");
  assert.equal(manifest.rollback_status, "not-implemented");
  assert.deepEqual(manifest.files, []);
  assert.deepEqual(manifest.file_summary, {
    requested_file_count: 0,
    captured_file_count: 0,
    missing_file_count: 0,
    skipped_file_count: 0,
    failed_file_count: 0
  });
  assert.equal(manifest.contract.method, "POST");
  assert.equal(manifest.contract.scope, "single");
  assert.equal(manifest.contract.scan_mode, "single-id");
  assert.deepEqual(manifest.contract.mutation_targets, [
    "library-manifest",
    "source-video-manifest",
    "preprocess-job",
    "index-release",
    "read-model-cache"
  ]);
  assert.deepEqual(manifest.read_model_invalidation, {
    invalidates_source_video_read_model: true,
    requires_read_model_reconcile: false,
    reason: "source-video-manifest-change"
  });
});

test("admin command snapshot writes metadata-only snapshot manifest", async () => {
  const libraryRoot = await makeLibraryRoot();
  const result = await createAdminCommandSnapshot({
    library_root: libraryRoot,
    command: "source-folder-update",
    created_at: "2026-06-26T00:00:00.000Z",
    holder: "test-holder",
    snapshot_id: "snapshot-abc"
  });

  assert.equal(result.created, true);
  assert.equal(result.snapshot_kind, "metadata-only");
  assert.equal(result.rollback_status, "not-implemented");
  assert.equal(result.snapshot_directory.startsWith(adminCommandSnapshotRoot(libraryRoot)), true);
  assert.equal(
    result.manifest_relative_path,
    path.join(
      ".mixlab-library",
      "admin",
      "command-snapshots",
      "2026-06-26T00-00-00.000Z-source-folder-update-snapshot-abc",
      "snapshot.json"
    )
  );

  const manifest = JSON.parse(await readFile(result.manifest_path, "utf8")) as {
    command: string;
    holder: string;
    snapshot_kind: string;
    rollback_status: string;
    contract: {
      scan_mode: string;
      mutation_targets: string[];
    };
    read_model_invalidation: {
      requires_read_model_reconcile: boolean;
    };
    file_summary: {
      requested_file_count: number;
    };
  };

  assert.equal(manifest.command, "source-folder-update");
  assert.equal(manifest.holder, "test-holder");
  assert.equal(manifest.snapshot_kind, "metadata-only");
  assert.equal(manifest.rollback_status, "not-implemented");
  assert.equal(manifest.file_summary.requested_file_count, 0);
  assert.equal(manifest.contract.scan_mode, "no-scan");
  assert.deepEqual(manifest.contract.mutation_targets, [
    "admin-settings",
    "source-folder-config",
    "read-model-cache"
  ]);
  assert.equal(manifest.read_model_invalidation.requires_read_model_reconcile, true);
});

test("admin command snapshot captures selected safe library files", async () => {
  const libraryRoot = await makeLibraryRoot();
  const settingsPath = path.join(libraryRoot, ".mixlab-library", "admin-settings.json");
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, "{\"old\":true}\n", "utf8");

  const result = await createAdminCommandSnapshot({
    library_root: libraryRoot,
    command: "source-folder-update",
    created_at: "2026-06-26T00:00:00.000Z",
    holder: "test-holder",
    snapshot_id: "snapshot-files",
    files: [{
      label: "admin-settings",
      file_path: settingsPath
    }]
  });

  assert.equal(result.snapshot_kind, "file-capture");
  assert.equal(result.requested_file_count, 1);
  assert.equal(result.captured_file_count, 1);
  assert.equal(result.missing_file_count, 0);
  assert.equal(result.skipped_file_count, 0);

  const manifest = JSON.parse(await readFile(result.manifest_path, "utf8")) as {
    snapshot_kind: string;
    files: Array<{
      label: string;
      status: string;
      source_relative_path?: string;
      snapshot_relative_path?: string;
    }>;
    file_summary: {
      captured_file_count: number;
    };
  };
  const file = manifest.files[0]!;

  assert.equal(manifest.snapshot_kind, "file-capture");
  assert.equal(manifest.file_summary.captured_file_count, 1);
  assert.equal(file.label, "admin-settings");
  assert.equal(file.status, "captured");
  assert.equal(file.source_relative_path, path.join(".mixlab-library", "admin-settings.json"));
  assert.ok(file.snapshot_relative_path);
  assert.equal(
    await readFile(path.join(libraryRoot, file.snapshot_relative_path!), "utf8"),
    "{\"old\":true}\n"
  );
});

test("admin command snapshot records missing and unsafe files without failing", async () => {
  const libraryRoot = await makeLibraryRoot();
  const outsidePath = path.join(await makeLibraryRoot(), "outside.json");

  const result = await createAdminCommandSnapshot({
    library_root: libraryRoot,
    command: "source-video-metadata",
    created_at: "2026-06-26T00:00:00.000Z",
    holder: "test-holder",
    snapshot_id: "snapshot-mixed",
    files: [
      {
        label: "missing-manifest",
        file_path: path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json")
      },
      {
        label: "outside-library",
        file_path: outsidePath
      }
    ]
  });

  assert.equal(result.created, true);
  assert.equal(result.snapshot_kind, "file-capture");
  assert.equal(result.requested_file_count, 2);
  assert.equal(result.captured_file_count, 0);
  assert.equal(result.missing_file_count, 1);
  assert.equal(result.skipped_file_count, 1);

  const manifest = JSON.parse(await readFile(result.manifest_path, "utf8")) as {
    files: Array<{
      label: string;
      status: string;
      source_relative_path?: string;
    }>;
  };

  assert.equal(manifest.files[0]?.status, "missing");
  assert.equal(
    manifest.files[0]?.source_relative_path,
    path.join(".mixlab-library", "videos", "V000001", "source-video.json")
  );
  assert.equal(manifest.files[1]?.status, "skipped-unsafe");
  assert.equal(manifest.files[1]?.source_relative_path, undefined);
});

test("admin command snapshot best-effort result exposes write failures without throwing", async () => {
  const result = await createAdminCommandSnapshotBestEffort({
    library_root: "/does/not/matter",
    command: "library-init",
    created_at: "2026-06-26T00:00:00.000Z",
    holder: "test-holder",
    make_directory: async () => {
      throw Object.assign(new Error("snapshot store unavailable"), { code: "EACCES" });
    }
  });

  assert.equal(result.created, false);
  assert.equal(result.reason, "write_failed");
  assert.equal(result.snapshot_kind, "metadata-only");
  assert.equal(result.rollback_status, "not-implemented");
  assert.equal(result.error_code, "EACCES");
  assert.equal(result.error_message, "snapshot store unavailable");
});
