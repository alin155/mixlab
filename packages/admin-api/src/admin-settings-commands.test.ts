import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  readAdminSettings,
  type AdminSourceFolder
} from "../../library-fs/src/index.ts";
import type { LibraryCounts, SourceVideoManifest } from "../../protocol/src/index.ts";
import { readAdminOperationLog } from "./admin-operation-log.ts";
import { adminCommandSnapshotRoot } from "./admin-command-snapshot.ts";
import {
  runAdminSettingsConfigCommand,
  runAdminSourceFolderAddCommand,
  runAdminSourceFolderRemoveCommand,
  runAdminSourceFolderUpdateCommand
} from "./admin-settings-commands.ts";
import {
  readAdminReadModelStoreStatus,
  writeAdminSourceVideoStatusReadModelStore
} from "./admin-read-model-store.ts";
import { buildAdminSourceVideoStatusReadModel } from "./admin-source-video-read-model.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-settings-commands-"));
}

async function readCommandSnapshotManifests(libraryRoot: string): Promise<Array<{
  command: string;
  snapshot_kind: string;
  file_summary: {
    captured_file_count: number;
  };
  files: Array<{
    label: string;
    status: string;
    snapshot_relative_path?: string;
  }>;
}>> {
  const root = adminCommandSnapshotRoot(libraryRoot);
  const directories = await readdir(root);
  return Promise.all(directories.map(async (directory) =>
    JSON.parse(await readFile(path.join(root, directory, "snapshot.json"), "utf8")) as {
      command: string;
      snapshot_kind: string;
      file_summary: {
        captured_file_count: number;
      };
      files: Array<{
        label: string;
        status: string;
        snapshot_relative_path?: string;
      }>;
    }
  ));
}

function leasePath(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library", "locks", "admin-writer.lock", "lease.json");
}

function libraryCounts(input?: Partial<LibraryCounts & { updated_at: string }>): LibraryCounts & { updated_at: string } {
  return {
    video_count: 1,
    ready_video_count: 1,
    processing_video_count: 0,
    queued_video_count: 0,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: "2026-06-26T09:00:00.000Z",
    ...input
  };
}

function sourceVideoManifest(input?: Partial<SourceVideoManifest>): SourceVideoManifest {
  const sourceVideoId = input?.source_video_id ?? "V000001";
  return {
    source_video_id: sourceVideoId,
    title: input?.title ?? "已就绪素材",
    relative_path: input?.relative_path ?? `课程/${sourceVideoId}.mp4`,
    logical_uri: input?.logical_uri ?? `library://source-video/${sourceVideoId}`,
    duration_ms: input?.duration_ms ?? 60_000,
    width: input?.width ?? 1920,
    height: input?.height ?? 1080,
    fps: input?.fps ?? 25,
    codec: input?.codec ?? "h264",
    file_size: input?.file_size ?? 1024,
    content_hash: input?.content_hash ?? `hash-${sourceVideoId}`,
    preprocess_status: input?.preprocess_status ?? "ready",
    visible_to_cutters: input?.visible_to_cutters ?? true,
    transcript_path: input?.transcript_path ?? `artifacts/${sourceVideoId}/transcript.json`,
    srt_path: input?.srt_path ?? `artifacts/${sourceVideoId}/transcript.srt`,
    keyframes_path: input?.keyframes_path ?? `artifacts/${sourceVideoId}/keyframes.json`,
    cover_path: input?.cover_path ?? `artifacts/${sourceVideoId}/cover.jpg`,
    description: input?.description ?? "测试素材描述",
    tags: input?.tags ?? ["测试"],
    lecturer: input?.lecturer ?? "测试讲师",
    course: input?.course ?? "测试课程",
    category: input?.category ?? "测试分类"
  };
}

async function writeFreshStore(input: {
  library_root: string;
  library: LibraryCounts & { updated_at: string };
}): Promise<void> {
  await writeAdminSourceVideoStatusReadModelStore({
    library_root: input.library_root,
    model: buildAdminSourceVideoStatusReadModel({
      library: input.library,
      generated_at: "2026-06-26T09:00:01.000Z",
      default_page_limit: 20,
      manifests: [sourceVideoManifest()]
    })
  });
}

test("settings config command runs under writer lease and refreshes runtime secrets without read-model invalidation", async () => {
  const libraryRoot = await makeLibraryRoot();
  let refreshCount = 0;
  let leaseReason = "";
  const defaultSettings = await readAdminSettings(libraryRoot);
  const settingsPath = path.join(libraryRoot, ".mixlab-library", "admin-settings.json");
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(defaultSettings, null, 2)}\n`, "utf8");

  const settings = await runAdminSettingsConfigCommand({
    library_root: libraryRoot,
    now: "2026-06-26T09:01:00.000Z",
    mutation: {
      settings_patch: {
        library_name: "测试管理素材库"
      },
      runtime_secrets_patch: {
        dashscope_api_key: "test-secret"
      }
    },
    refresh_runtime_secrets: async () => {
      refreshCount += 1;
      const lease = JSON.parse(await readFile(leasePath(libraryRoot), "utf8")) as {
        reason: string;
      };
      leaseReason = lease.reason;
    }
  });

  assert.equal(settings.library_name, "测试管理素材库");
  assert.equal(refreshCount, 1);
  assert.equal(leaseReason, "settings-config");

  const log = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-26T09:01:01.000Z"
  });
  assert.deepEqual(log.events.map((event) => event.action), ["settings-config", "settings-config"]);
  assert.deepEqual(log.events.map((event) => event.event_type), ["succeeded", "started"]);
  assert.equal(log.events[0]?.details.command, "settings-config");
  assert.equal((log.events[0]?.details.command_snapshot as { snapshot_kind?: string })?.snapshot_kind, "file-capture");
  assert.equal((log.events[0]?.details.command_snapshot as { captured_file_count?: number })?.captured_file_count, 1);

  const snapshots = await readCommandSnapshotManifests(libraryRoot);
  const snapshot = snapshots.find((candidate) => candidate.command === "settings-config");
  assert.equal(snapshot?.snapshot_kind, "file-capture");
  assert.equal(snapshot?.file_summary.captured_file_count, 1);
  assert.equal(snapshot?.files[0]?.label, "admin-settings");
  assert.equal(snapshot?.files[0]?.status, "captured");
  const capturedSettings = JSON.parse(
    await readFile(path.join(libraryRoot, snapshot!.files[0]!.snapshot_relative_path!), "utf8")
  ) as { library_name: string };
  assert.equal(capturedSettings.library_name, "主素材库");
});

test("source-folder commands mutate settings and append read-model invalidation events", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = libraryCounts();
  await writeFreshStore({
    library_root: libraryRoot,
    library
  });

  const added = await runAdminSourceFolderAddCommand({
    library_root: libraryRoot,
    now: "2026-06-26T09:02:00.000Z",
    invalidated_at: "2026-06-26T09:02:01.000Z",
    folder: {
      name: "新增素材来源",
      path: path.join(libraryRoot, "source-videos-extra"),
      enabled: true
    },
    read_library_manifest: async () => library
  });
  const addedFolder = added.source_folders.find((folder): folder is AdminSourceFolder => folder.id !== "src_default");
  assert.ok(addedFolder);
  assert.equal(addedFolder.name, "新增素材来源");
  const addedFolderId = addedFolder.id;

  const updated = await runAdminSourceFolderUpdateCommand({
    library_root: libraryRoot,
    now: "2026-06-26T09:03:00.000Z",
    invalidated_at: "2026-06-26T09:03:01.000Z",
    source_folder_id: addedFolderId,
    patch: {
      name: "已更新素材来源",
      enabled: false
    },
    read_library_manifest: async () => library
  });
  assert.equal(updated.source_folders.find((folder) => folder.id === addedFolderId)?.name, "已更新素材来源");
  assert.equal(updated.source_folders.find((folder) => folder.id === addedFolderId)?.enabled, false);

  const removed = await runAdminSourceFolderRemoveCommand({
    library_root: libraryRoot,
    now: "2026-06-26T09:04:00.000Z",
    invalidated_at: "2026-06-26T09:04:01.000Z",
    source_folder_id: addedFolderId,
    read_library_manifest: async () => library
  });
  assert.equal(removed.source_folders.some((folder) => folder.id === addedFolderId), false);

  const persisted = await readAdminSettings(libraryRoot);
  assert.equal(persisted.source_folders.some((folder) => folder.id === addedFolderId), false);

  const status = await readAdminReadModelStoreStatus({
    library_root: libraryRoot,
    library
  });
  assert.equal(status.freshness, "stale");
  assert.equal(status.invalidation_reason, "source-folder-scope-change");
  assert.equal(status.invalidated_at, "2026-06-26T09:04:01.000Z");

  const log = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-26T09:05:00.000Z"
  });
  const invalidationEvents = log.events.filter((event) => event.action === "read-model-invalidate");
  const commandEvents = log.events.filter((event) => event.action.startsWith("source-folder-"));
  assert.equal(invalidationEvents.length, 3);
  assert.equal(commandEvents.length, 6);
  assert.deepEqual(
    invalidationEvents.map((event) => event.details.command),
    ["source-folder-remove", "source-folder-update", "source-folder-add"]
  );
  assert.equal(invalidationEvents[0]?.event_type, "succeeded");
  assert.equal(invalidationEvents[0]?.details.invalidation_reason, "source-folder-scope-change");
});
