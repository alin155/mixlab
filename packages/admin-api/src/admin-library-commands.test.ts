import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { LibraryCounts } from "../../protocol/src/index.ts";
import {
  readAdminSettings,
  scanSourceVideos,
  writeAdminSettings
} from "../../library-fs/src/index.ts";
import {
  adminCommandSnapshotRoot,
  type AdminCommandSnapshotManifest
} from "./admin-command-snapshot.ts";
import {
  planAdminCommandSnapshotRestore
} from "./admin-command-restore-plan.ts";
import { readAdminOperationLog } from "./admin-operation-log.ts";
import {
  initializeAdminLibrary,
  readAdminLibraryManifest,
  runAdminLibraryInitCommand,
  runAdminLibraryScanCommand
} from "./admin-library-commands.ts";
import {
  readAdminReadModelStoreStatus,
  writeAdminSourceVideoStatusReadModelStore
} from "./admin-read-model-store.ts";
import { buildAdminSourceVideoStatusReadModel } from "./admin-source-video-read-model.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-library-commands-"));
}

interface CommandSnapshotRecord {
  directory_name: string;
  manifest_path: string;
  manifest: AdminCommandSnapshotManifest;
}

function leasePath(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library", "locks", "admin-writer.lock", "lease.json");
}

function sourceVideosRoot(libraryRoot: string): string {
  return path.join(libraryRoot, "source-videos");
}

function emptyLibraryCounts(input?: Partial<LibraryCounts & { updated_at: string }>): LibraryCounts & { updated_at: string } {
  return {
    video_count: 0,
    ready_video_count: 0,
    processing_video_count: 0,
    queued_video_count: 0,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: "2026-06-26T10:00:00.000Z",
    ...input
  };
}

async function writeFreshEmptyStore(input: {
  library_root: string;
  library: LibraryCounts & { updated_at: string };
}): Promise<void> {
  await writeAdminSourceVideoStatusReadModelStore({
    library_root: input.library_root,
    model: buildAdminSourceVideoStatusReadModel({
      library: input.library,
      generated_at: "2026-06-26T10:00:01.000Z",
      default_page_limit: 20,
      manifests: []
    })
  });
}

async function writeText(filePath: string, text: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text, "utf8");
}

async function readCommandSnapshotRecords(libraryRoot: string): Promise<CommandSnapshotRecord[]> {
  const root = adminCommandSnapshotRoot(libraryRoot);
  const directories = await readdir(root);
  const records: CommandSnapshotRecord[] = [];
  for (const directory of directories) {
    const manifestPath = path.join(root, directory, "snapshot.json");
    records.push({
      directory_name: directory,
      manifest_path: manifestPath,
      manifest: JSON.parse(await readFile(manifestPath, "utf8")) as AdminCommandSnapshotManifest
    });
  }
  return records;
}

async function readSnapshotFileText(
  libraryRoot: string,
  snapshot: AdminCommandSnapshotManifest,
  label: string
): Promise<string> {
  const entry = snapshot.files.find((file) => file.label === label);
  assert.ok(entry?.snapshot_relative_path, `missing captured snapshot file for ${label}`);
  return readFile(path.join(libraryRoot, entry.snapshot_relative_path), "utf8");
}

function snapshotFileStatus(
  snapshot: AdminCommandSnapshotManifest,
  label: string
): string | undefined {
  return snapshot.files.find((file) => file.label === label)?.status;
}

async function seedScannedLibrary(input: {
  library_root: string;
  now: string;
  source_files: string[];
}): Promise<void> {
  for (const sourceFile of input.source_files) {
    await writeText(path.join(sourceVideosRoot(input.library_root), sourceFile), "fake video bytes");
  }
  await scanSourceVideos({
    library_root: input.library_root,
    library_id: "test-library",
    library_name: "测试素材库",
    now: input.now
  });
}

async function writePreprocessJob(libraryRoot: string, sourceVideoId: string): Promise<void> {
  await writeText(
    path.join(libraryRoot, ".mixlab-library", "videos", sourceVideoId, "preprocess-job.json"),
    `${JSON.stringify({
      source_video_id: sourceVideoId,
      status: "queued",
      attempt: 1,
      current_stage: "queued"
    }, null, 2)}\n`
  );
}

test("library init command runs under writer lease and initializes library manifest paths", async () => {
  const libraryRoot = await makeLibraryRoot();
  let observedLeaseReason = "";

  const manifest = await runAdminLibraryInitCommand({
    library_root: libraryRoot,
    library_id: "test-library",
    library_name: "测试素材库",
    command_now: "2026-06-26T10:01:00.000Z",
    now: () => {
      const raw = readFileSync(leasePath(libraryRoot), "utf8");
      const lease = JSON.parse(raw) as { reason: string };
      observedLeaseReason = lease.reason;
      return "2026-06-26T10:01:01.000Z";
    }
  });

  assert.equal(observedLeaseReason, "library-init");
  assert.equal(manifest.library_id, "test-library");
  assert.equal(manifest.name, "测试素材库");
  assert.equal(manifest.video_count, 0);
  assert.equal(manifest.updated_at, "2026-06-26T10:01:01.000Z");
  assert.equal(existsSync(sourceVideosRoot(libraryRoot)), true);
  assert.equal(existsSync(path.join(libraryRoot, ".mixlab-library", "videos")), true);
  assert.equal(existsSync(path.join(libraryRoot, ".mixlab-library", "indexes", "source-transcript-index")), true);

  const persisted = await readAdminLibraryManifest(libraryRoot);
  assert.equal(persisted?.library_id, "test-library");

  const log = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-26T10:01:02.000Z"
  });
  const invalidationEvents = log.events.filter((event) => event.action === "read-model-invalidate");
  const commandEvents = log.events.filter((event) => event.action === "library-init");
  assert.equal(invalidationEvents.length, 1);
  assert.equal(commandEvents.length, 2);
  assert.deepEqual(commandEvents.map((event) => event.event_type), ["succeeded", "started"]);
  assert.equal(invalidationEvents[0]?.details.command, "library-init");
  assert.equal(invalidationEvents[0]?.details.stale_mark_result, "missing");
});

test("library init command captures previous library and settings files before overwrite", async () => {
  const libraryRoot = await makeLibraryRoot();
  const libraryPath = path.join(libraryRoot, ".mixlab-library", "library.json");
  const settingsPath = path.join(libraryRoot, ".mixlab-library", "admin-settings.json");
  await writeText(libraryPath, "{\"library_id\":\"old-library\",\"video_count\":7}\n");
  await writeText(settingsPath, "{\"schema_version\":\"1.0\",\"library_name\":\"旧设置\"}\n");

  await runAdminLibraryInitCommand({
    library_root: libraryRoot,
    library_id: "test-library",
    library_name: "测试素材库",
    command_now: "2026-06-26T10:01:00.000Z",
    now: () => "2026-06-26T10:01:01.000Z"
  });

  const snapshots = await readCommandSnapshotRecords(libraryRoot);
  const snapshot = snapshots.find((record) => record.manifest.command === "library-init")?.manifest;
  assert.ok(snapshot);
  assert.equal(snapshot.snapshot_kind, "file-capture");
  assert.equal(snapshot.file_summary.requested_file_count, 2);
  assert.equal(snapshot.file_summary.captured_file_count, 2);
  assert.equal(snapshotFileStatus(snapshot, "library-manifest"), "captured");
  assert.equal(snapshotFileStatus(snapshot, "admin-settings"), "captured");
  assert.equal(await readSnapshotFileText(libraryRoot, snapshot, "library-manifest"), "{\"library_id\":\"old-library\",\"video_count\":7}\n");
  assert.equal(await readSnapshotFileText(libraryRoot, snapshot, "admin-settings"), "{\"schema_version\":\"1.0\",\"library_name\":\"旧设置\"}\n");
});

test("library scan command scans source videos and returns read-model invalidation handoff", async () => {
  const libraryRoot = await makeLibraryRoot();
  await initializeAdminLibrary({
    library_root: libraryRoot,
    library_id: "test-library",
    library_name: "测试素材库",
    now: "2026-06-26T10:02:00.000Z"
  });
  const initialLibrary = emptyLibraryCounts({
    updated_at: "2026-06-26T10:02:00.000Z"
  });
  await writeFreshEmptyStore({
    library_root: libraryRoot,
    library: initialLibrary
  });
  await mkdir(path.join(sourceVideosRoot(libraryRoot), "课程"), { recursive: true });
  await writeFile(path.join(sourceVideosRoot(libraryRoot), "课程", "001.mp4"), "fake video bytes", "utf8");

  const result = await runAdminLibraryScanCommand({
    library_root: libraryRoot,
    library_id: "test-library",
    library_name: "测试素材库",
    command_now: "2026-06-26T10:03:00.000Z",
    now: () => "2026-06-26T10:03:01.000Z"
  });

  assert.equal(result.total_video_count, 1);
  assert.equal(result.new_video_count, 1);
  assert.equal(result.existing_video_count, 0);
  assert.deepEqual(result.source_video_ids, ["V000001"]);
  assert.equal(result.read_model?.command, "library-scan");
  assert.equal(result.read_model?.invalidation_reason, "library-scan-or-init");
  assert.equal(result.read_model?.stale_mark.applied, true);
  assert.equal(result.read_model?.stale_mark.reason, "invalidated");
  assert.equal(result.read_model?.reconciliation?.action, "rebuild");
  assert.equal(result.read_model?.reconciliation?.scan_mode, "full-reconcile");

  const status = await readAdminReadModelStoreStatus({
    library_root: libraryRoot,
    library: await readAdminLibraryManifest(libraryRoot)
  });
  assert.equal(status.freshness, "stale");
  assert.equal(status.invalidated_at, "2026-06-26T10:03:01.000Z");
  assert.equal(status.invalidation_reason, "library-scan-or-init");

  const manifestText = await readFile(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json"),
    "utf8"
  );
  assert.match(manifestText, /"preprocess_status": "unprocessed"/);

  const log = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-26T10:04:00.000Z"
  });
  const invalidationEvents = log.events.filter((event) => event.action === "read-model-invalidate");
  const commandEvents = log.events.filter((event) => event.action === "library-scan");
  assert.equal(invalidationEvents.length, 1);
  assert.equal(commandEvents.length, 2);
  assert.deepEqual(commandEvents.map((event) => event.event_type), ["succeeded", "started"]);
  assert.equal(invalidationEvents[0]?.event_type, "succeeded");
  assert.equal(invalidationEvents[0]?.details.command, "library-scan");
  assert.equal(invalidationEvents[0]?.details.stale_mark_applied, true);
});

test("library scan command captures bounded pre-scan manifest and job evidence", async () => {
  const libraryRoot = await makeLibraryRoot();
  await initializeAdminLibrary({
    library_root: libraryRoot,
    library_id: "test-library",
    library_name: "测试素材库",
    now: "2026-06-26T10:02:00.000Z"
  });
  await seedScannedLibrary({
    library_root: libraryRoot,
    now: "2026-06-26T10:02:01.000Z",
    source_files: ["保留.mp4", "移除.mp4"]
  });
  await writePreprocessJob(libraryRoot, "V000001");
  await writePreprocessJob(libraryRoot, "V000002");
  await writeAdminSettings(libraryRoot, {
    ...(await readAdminSettings(libraryRoot)),
    library_name: "扫描前设置"
  });
  const previousLibrary = await readFile(path.join(libraryRoot, ".mixlab-library", "library.json"), "utf8");
  const previousSettings = await readFile(path.join(libraryRoot, ".mixlab-library", "admin-settings.json"), "utf8");
  const previousInactiveManifest = await readFile(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000002", "source-video.json"),
    "utf8"
  );

  await rm(path.join(sourceVideosRoot(libraryRoot), "移除.mp4"));
  await writeText(path.join(sourceVideosRoot(libraryRoot), "新增.mp4"), "fake video bytes");

  const result = await runAdminLibraryScanCommand({
    library_root: libraryRoot,
    library_id: "test-library",
    library_name: "测试素材库",
    command_now: "2026-06-26T10:03:00.000Z",
    now: () => "2026-06-26T10:03:01.000Z"
  });

  assert.deepEqual(result.source_video_ids, ["V000001", "V000003"]);
  await assert.rejects(
    () => readFile(path.join(libraryRoot, ".mixlab-library", "videos", "V000002", "source-video.json"), "utf8"),
    /ENOENT/
  );

  const snapshots = await readCommandSnapshotRecords(libraryRoot);
  const snapshot = snapshots.find((record) => record.manifest.command === "library-scan")?.manifest;
  assert.ok(snapshot);
  assert.equal(snapshot.snapshot_kind, "file-capture");
  assert.equal(snapshotFileStatus(snapshot, "library-manifest"), "captured");
  assert.equal(snapshotFileStatus(snapshot, "admin-settings"), "captured");
  assert.equal(snapshotFileStatus(snapshot, "source-video-V000001-manifest"), "captured");
  assert.equal(snapshotFileStatus(snapshot, "source-video-V000001-preprocess-job"), "captured");
  assert.equal(snapshotFileStatus(snapshot, "source-video-V000002-manifest"), "captured");
  assert.equal(snapshotFileStatus(snapshot, "source-video-V000002-preprocess-job"), "captured");
  assert.equal(snapshotFileStatus(snapshot, "source-video-V000003-manifest"), "missing");
  assert.equal(snapshotFileStatus(snapshot, "source-video-V000003-preprocess-job"), "missing");
  assert.equal(await readSnapshotFileText(libraryRoot, snapshot, "library-manifest"), previousLibrary);
  assert.equal(await readSnapshotFileText(libraryRoot, snapshot, "admin-settings"), previousSettings);
  assert.equal(await readSnapshotFileText(libraryRoot, snapshot, "source-video-V000002-manifest"), previousInactiveManifest);
});

test("blocked ready-removal library scans still capture bounded pre-scan evidence", async () => {
  const libraryRoot = await makeLibraryRoot();
  await seedScannedLibrary({
    library_root: libraryRoot,
    now: "2026-06-26T10:05:00.000Z",
    source_files: ["已发布.mp4"]
  });
  const manifestPath = path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
  await writeFile(
    manifestPath,
    `${JSON.stringify({
      ...manifest,
      preprocess_status: "ready",
      visible_to_cutters: true,
      transcript_path: ".mixlab-library/videos/V000001/transcript.json",
      srt_path: ".mixlab-library/videos/V000001/subtitles.srt",
      keyframes_path: ".mixlab-library/videos/V000001/keyframes.json",
      cover_path: ".mixlab-library/videos/V000001/cover.jpg"
    }, null, 2)}\n`,
    "utf8"
  );
  await rm(path.join(sourceVideosRoot(libraryRoot), "已发布.mp4"));
  await writeText(path.join(sourceVideosRoot(libraryRoot), "新增.mp4"), "fake video bytes");

  await assert.rejects(
    () => runAdminLibraryScanCommand({
      library_root: libraryRoot,
      library_id: "test-library",
      library_name: "测试素材库",
      command_now: "2026-06-26T10:06:00.000Z",
      now: () => "2026-06-26T10:06:01.000Z"
    }),
    /已发布 ready 视频/
  );

  const snapshots = await readCommandSnapshotRecords(libraryRoot);
  const snapshot = snapshots.find((record) => record.manifest.command === "library-scan")?.manifest;
  assert.ok(snapshot);
  assert.equal(snapshotFileStatus(snapshot, "source-video-V000001-manifest"), "captured");
  assert.equal(snapshotFileStatus(snapshot, "source-video-V000002-manifest"), "missing");
  const capturedReadyManifest = await readSnapshotFileText(libraryRoot, snapshot, "source-video-V000001-manifest");
  assert.match(capturedReadyManifest, /"preprocess_status": "ready"/);

  const log = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-26T10:07:00.000Z"
  });
  const commandEvents = log.events.filter((event) => event.action === "library-scan");
  assert.deepEqual(commandEvents.map((event) => event.event_type), ["failed", "started"]);
  assert.equal((commandEvents[0]?.details.command_snapshot as { captured_file_count?: number })?.captured_file_count, 3);
});

test("library scan snapshots with captured files remain restore-plan compatible", async () => {
  const libraryRoot = await makeLibraryRoot();
  await seedScannedLibrary({
    library_root: libraryRoot,
    now: "2026-06-26T10:08:00.000Z",
    source_files: ["稳定.mp4"]
  });
  await writePreprocessJob(libraryRoot, "V000001");

  await runAdminLibraryScanCommand({
    library_root: libraryRoot,
    library_id: "test-library",
    library_name: "测试素材库",
    command_now: "2026-06-26T10:09:00.000Z",
    now: () => "2026-06-26T10:09:01.000Z"
  });

  const snapshots = await readCommandSnapshotRecords(libraryRoot);
  const snapshot = snapshots.find((record) => record.manifest.command === "library-scan");
  assert.ok(snapshot);
  const plan = await planAdminCommandSnapshotRestore({
    library_root: libraryRoot,
    snapshot_manifest_path: snapshot.manifest_path,
    generated_at: "2026-06-26T10:10:00.000Z"
  });

  assert.equal(plan.can_restore, true);
  assert.equal(plan.file_count, 4);
  assert.equal(plan.restorable_file_count, 4);
  assert.deepEqual(plan.blockers, []);
  assert.ok(!plan.snapshot_manifest_relative_path?.startsWith(libraryRoot));
  for (const file of plan.files) {
    assert.equal(file.can_restore, true);
    assert.ok(!file.source_relative_path?.startsWith(libraryRoot));
    assert.ok(!file.snapshot_relative_path?.startsWith(libraryRoot));
  }
});
