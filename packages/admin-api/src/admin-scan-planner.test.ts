import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  readAdminSettings,
  writeAdminSettings
} from "../../library-fs/src/index.ts";
import type { LibraryCounts, SourceVideoManifest } from "../../protocol/src/index.ts";
import { readAdminOperationLog } from "./admin-operation-log.ts";
import {
  initializeAdminLibrary,
  readAdminLibraryManifest,
  writeAdminLibraryManifest
} from "./admin-library-commands.ts";
import {
  readAdminReadModelStoreStatus,
  writeAdminSourceVideoStatusReadModelStore
} from "./admin-read-model-store.ts";
import { buildAdminSourceVideoStatusReadModel } from "./admin-source-video-read-model.ts";
import {
  AdminScanApplyBlockedError,
  runAdminLibraryScanApplyCommand,
  runAdminLibraryScanPreviewCommand
} from "./admin-scan-planner.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-scan-planner-"));
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function sourceVideosRoot(libraryRoot: string): string {
  return path.join(libraryRoot, "source-videos");
}

function videoDir(libraryRoot: string, sourceVideoId: string): string {
  return path.join(libraryRoot, ".mixlab-library", "videos", sourceVideoId);
}

async function writeManifest(libraryRoot: string, manifest: SourceVideoManifest): Promise<void> {
  await mkdir(videoDir(libraryRoot, manifest.source_video_id), { recursive: true });
  await writeFile(
    path.join(videoDir(libraryRoot, manifest.source_video_id), "source-video.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
}

function sourceVideoManifest(input: {
  source_video_id: string;
  preprocess_status: SourceVideoManifest["preprocess_status"];
  relative_path?: string;
  visible_to_cutters?: boolean;
}): SourceVideoManifest {
  return {
    source_video_id: input.source_video_id,
    title: input.source_video_id,
    relative_path: input.relative_path ?? `${input.source_video_id}.mp4`,
    logical_uri: `library://source-video/${input.source_video_id}`,
    duration_ms: 60_000,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: "h264",
    file_size: 1024,
    content_hash: `hash-${input.source_video_id}`,
    preprocess_status: input.preprocess_status,
    visible_to_cutters: input.visible_to_cutters ?? input.preprocess_status === "ready",
    transcript_path: input.preprocess_status === "ready" ? `artifacts/${input.source_video_id}/transcript.json` : "",
    srt_path: input.preprocess_status === "ready" ? `artifacts/${input.source_video_id}/transcript.srt` : "",
    keyframes_path: input.preprocess_status === "ready" ? `artifacts/${input.source_video_id}/keyframes.json` : "",
    cover_path: input.preprocess_status === "ready" ? `artifacts/${input.source_video_id}/cover.jpg` : ""
  };
}

function counts(input: Partial<LibraryCounts> = {}): LibraryCounts {
  return {
    video_count: 0,
    ready_video_count: 0,
    processing_video_count: 0,
    queued_video_count: 0,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    ...input
  };
}

async function writeFreshStore(input: {
  library_root: string;
  library: LibraryCounts & { updated_at?: string };
  manifests: SourceVideoManifest[];
}): Promise<void> {
  await writeAdminSourceVideoStatusReadModelStore({
    library_root: input.library_root,
    model: buildAdminSourceVideoStatusReadModel({
      library: input.library,
      manifests: input.manifests,
      default_page_limit: 20,
      generated_at: "2026-06-26T13:00:01.000Z"
    })
  });
}

async function seedBlockedReadyRemoval(input: {
  library_root: string;
  now: string;
}): Promise<SourceVideoManifest> {
  await initializeAdminLibrary({
    library_root: input.library_root,
    library_id: "test-library",
    library_name: "测试素材库",
    now: input.now
  });
  const readyManifest = sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "ready",
    relative_path: "旧目录/ready.mp4",
    visible_to_cutters: true
  });
  await writeManifest(input.library_root, readyManifest);
  const library = await writeAdminLibraryManifest({
    library_root: input.library_root,
    library_id: "test-library",
    library_name: "测试素材库",
    now: input.now,
    counts: counts({
      video_count: 1,
      ready_video_count: 1
    })
  });
  await writeFreshStore({
    library_root: input.library_root,
    library,
    manifests: [readyManifest]
  });

  const externalSource = path.join(input.library_root, "external-source");
  await mkdir(externalSource, { recursive: true });
  await writeFile(path.join(externalSource, "新素材.mp4"), "new video", "utf8");
  const settings = await readAdminSettings(input.library_root);
  await writeAdminSettings(input.library_root, {
    ...settings,
    source_folders: settings.source_folders.map((folder) =>
      folder.id === "src_default"
        ? { ...folder, path: externalSource }
        : folder
    )
  });

  return readyManifest;
}

test("scan preview planner reports ready-removal blockers through a service boundary", async () => {
  const libraryRoot = await makeLibraryRoot();
  await seedBlockedReadyRemoval({
    library_root: libraryRoot,
    now: "2026-06-26T13:00:00.000Z"
  });

  const preview = await runAdminLibraryScanPreviewCommand({
    library_root: libraryRoot,
    library_id: "test-library",
    library_name: "测试素材库",
    command_now: "2026-06-26T13:00:00.000Z"
  });

  assert.equal(preview.scan_mode, "full-source-folder-scan");
  assert.equal(preview.blocked, true);
  assert.equal(preview.inactive_ready_count, 1);
  assert.deepEqual(preview.inactive_ready_source_video_ids, ["V000001"]);
  assert.equal(preview.blockers[0]?.code, "ready-manifest-removal");
});

test("scan preview planner does not initialize library metadata", async () => {
  const libraryRoot = await makeLibraryRoot();
  await mkdir(path.join(sourceVideosRoot(libraryRoot), "课程"), { recursive: true });
  await writeFile(path.join(sourceVideosRoot(libraryRoot), "课程", "001.mp4"), "fake video", "utf8");

  const preview = await runAdminLibraryScanPreviewCommand({
    library_root: libraryRoot,
    library_id: "test-library",
    library_name: "测试素材库",
    command_now: "2026-06-26T13:05:00.000Z"
  });

  assert.equal(preview.blocked, false);
  assert.equal(preview.total_video_count, 1);
  assert.equal(preview.new_video_count, 1);
  assert.deepEqual(preview.source_video_ids, ["V000001"]);
  assert.equal(await pathExists(path.join(libraryRoot, ".mixlab-library")), false);
});

test("scan apply planner converts ready-removal protection into typed blocked result without stale marking", async () => {
  const libraryRoot = await makeLibraryRoot();
  const readyManifest = await seedBlockedReadyRemoval({
    library_root: libraryRoot,
    now: "2026-06-26T13:00:00.000Z"
  });
  const beforeStatus = await readAdminReadModelStoreStatus({
    library_root: libraryRoot,
    library: await readAdminLibraryManifest(libraryRoot)
  });
  const beforeLog = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-26T13:00:02.000Z"
  });

  await assert.rejects(
    () => runAdminLibraryScanApplyCommand({
      library_root: libraryRoot,
      library_id: "test-library",
      library_name: "测试素材库",
      command_now: "2026-06-26T13:00:00.000Z"
    }),
    (error: unknown) => {
      assert.equal(error instanceof AdminScanApplyBlockedError, true);
      const blocked = error as AdminScanApplyBlockedError;
      assert.equal(blocked.code, "scan_blocked");
      assert.equal(blocked.preview.blocked, true);
      assert.deepEqual(blocked.preview.inactive_ready_source_video_ids, ["V000001"]);
      return true;
    }
  );

  const afterStatus = await readAdminReadModelStoreStatus({
    library_root: libraryRoot,
    library: await readAdminLibraryManifest(libraryRoot)
  });
  const afterLog = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-26T13:00:03.000Z"
  });
  const protectedManifest = JSON.parse(
    await readFile(path.join(videoDir(libraryRoot, "V000001"), "source-video.json"), "utf8")
  ) as SourceVideoManifest;

  assert.equal(beforeStatus.freshness, "fresh");
  assert.equal(afterStatus.freshness, "fresh");
  assert.equal(afterStatus.invalidated_at, "");
  assert.deepEqual(
    afterLog.events
      .filter((event) => event.action === "read-model-invalidate")
      .map((event) => event.event_id),
    beforeLog.events
      .filter((event) => event.action === "read-model-invalidate")
      .map((event) => event.event_id)
  );
  assert.equal(afterLog.events.some((event) =>
    event.action === "library-scan" &&
    event.event_type === "failed"
  ), true);
  assert.equal(protectedManifest.preprocess_status, readyManifest.preprocess_status);
  assert.equal(protectedManifest.visible_to_cutters, true);
});

test("scan apply planner delegates successful scans and returns read-model reconcile handoff", async () => {
  const libraryRoot = await makeLibraryRoot();
  const initialLibrary = await writeAdminLibraryManifest({
    library_root: libraryRoot,
    library_id: "test-library",
    library_name: "测试素材库",
    now: "2026-06-26T13:10:00.000Z",
    counts: counts()
  });
  await writeFreshStore({
    library_root: libraryRoot,
    library: initialLibrary,
    manifests: []
  });
  await mkdir(path.join(sourceVideosRoot(libraryRoot), "课程"), { recursive: true });
  await writeFile(path.join(sourceVideosRoot(libraryRoot), "课程", "001.mp4"), "fake video", "utf8");

  const result = await runAdminLibraryScanApplyCommand({
    library_root: libraryRoot,
    library_id: "test-library",
    library_name: "测试素材库",
    command_now: "2026-06-26T13:11:00.000Z",
    now: () => "2026-06-26T13:11:01.000Z"
  });

  assert.equal(result.total_video_count, 1);
  assert.equal(result.new_video_count, 1);
  assert.deepEqual(result.source_video_ids, ["V000001"]);
  assert.equal(result.read_model?.command, "library-scan");
  assert.equal(result.read_model?.stale_mark.applied, true);
  assert.equal(result.read_model?.reconciliation?.scan_mode, "full-reconcile");

  const status = await readAdminReadModelStoreStatus({
    library_root: libraryRoot,
    library: await readAdminLibraryManifest(libraryRoot)
  });
  assert.equal(status.freshness, "stale");
  assert.equal(status.invalidation_reason, "library-scan-or-init");
});
