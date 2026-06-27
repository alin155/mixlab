import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { readSourceVideoManifest } from "../../library-fs/src/index.ts";
import type { LibraryCounts, SourceVideoManifest } from "../../protocol/src/index.ts";
import {
  readAdminLibraryManifest,
  writeAdminLibraryManifest
} from "./admin-library-commands.ts";
import {
  readAdminReadModelStoreStatus,
  readAdminSourceVideoStatusPageFromStore,
  writeAdminSourceVideoStatusReadModelStore
} from "./admin-read-model-store.ts";
import { buildAdminSourceVideoStatusReadModel } from "./admin-source-video-read-model.ts";
import {
  runAdminSourceVideoCoverCommand,
  runAdminSourceVideoMetadataCommand
} from "./admin-source-video-commands.ts";
import { adminCommandSnapshotRoot } from "./admin-command-snapshot.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-source-video-commands-"));
}

async function readCommandSnapshotManifests(libraryRoot: string): Promise<Array<{
  command: string;
  snapshot_kind: string;
  file_summary: {
    captured_file_count: number;
    missing_file_count: number;
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
        missing_file_count: number;
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
  title?: string;
  visible_to_cutters?: boolean;
  cover_path?: string;
}): SourceVideoManifest {
  return {
    source_video_id: input.source_video_id,
    title: input.title ?? input.source_video_id,
    relative_path: `课程/${input.source_video_id}.mp4`,
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
    cover_path: input.cover_path ?? (input.preprocess_status === "ready" ? `artifacts/${input.source_video_id}/cover.jpg` : ""),
    description: "旧说明",
    tags: ["旧标签"],
    lecturer: "旧讲师",
    course: "旧课程",
    category: "旧分类"
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

async function seedLibrary(input: {
  library_root: string;
  manifests: SourceVideoManifest[];
  counts: LibraryCounts;
  updated_at: string;
}): Promise<void> {
  await writeAdminLibraryManifest({
    library_root: input.library_root,
    library_id: "test-library",
    library_name: "测试素材库",
    now: input.updated_at,
    counts: input.counts
  });
  for (const manifest of input.manifests) {
    await writeManifest(input.library_root, manifest);
  }
  await writeAdminSourceVideoStatusReadModelStore({
    library_root: input.library_root,
    model: buildAdminSourceVideoStatusReadModel({
      library: {
        ...input.counts,
        updated_at: input.updated_at
      },
      manifests: input.manifests,
      default_page_limit: 20,
      generated_at: "2026-06-26T12:00:01.000Z"
    })
  });
}

test("source-video cover command runs under writer lease and writes through manifest and sqlite", async () => {
  const libraryRoot = await makeLibraryRoot();
  const pngCoverBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64"
  );
  const manifest = sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "queued",
    visible_to_cutters: false,
    cover_path: ".mixlab-library/videos/V000001/cover.png"
  });
  await seedLibrary({
    library_root: libraryRoot,
    manifests: [manifest],
    counts: counts({
      video_count: 1,
      queued_video_count: 1
    }),
    updated_at: "2026-06-26T12:00:00.000Z"
  });
  const oldCoverBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]);
  await writeFile(path.join(videoDir(libraryRoot, "V000001"), "cover.png"), oldCoverBytes);

  let observedLeaseReason = "";
  const updated = await runAdminSourceVideoCoverCommand({
    library_root: libraryRoot,
    source_video_id: "V000001",
    command_now: "2026-06-26T12:01:00.000Z",
    body: {
      image_base64: pngCoverBytes.toString("base64"),
      content_type: "image/png"
    },
    now: () => {
      const lease = JSON.parse(readFileSync(leasePath(libraryRoot), "utf8")) as { reason: string };
      observedLeaseReason = lease.reason;
      return "2026-06-26T12:01:01.000Z";
    }
  });

  assert.equal(observedLeaseReason, "source-video-cover");
  assert.equal(updated?.cover_path, ".mixlab-library/videos/V000001/cover.png");
  assert.equal(
    Buffer.compare(
      await readFile(path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "cover.png")),
      pngCoverBytes
    ),
    0
  );
  assert.equal(
    (await readSourceVideoManifest(libraryRoot, "V000001")).cover_path,
    ".mixlab-library/videos/V000001/cover.png"
  );

  const library = await readAdminLibraryManifest(libraryRoot);
  const status = await readAdminReadModelStoreStatus({
    library_root: libraryRoot,
    library
  });
  assert.equal(status.freshness, "fresh");

  const page = await readAdminSourceVideoStatusPageFromStore({
    library_root: libraryRoot,
    library,
    status: "queued",
    offset: 0,
    limit: 1
  });
  assert.equal(page?.manifests[0]?.cover_path, ".mixlab-library/videos/V000001/cover.png");

  const snapshots = await readCommandSnapshotManifests(libraryRoot);
  const snapshot = snapshots.find((candidate) => candidate.command === "source-video-cover");
  assert.equal(snapshot?.snapshot_kind, "file-capture");
  assert.equal(snapshot?.file_summary.captured_file_count, 2);
  assert.equal(snapshot?.file_summary.missing_file_count, 2);
  const manifestEntry = snapshot?.files.find((file) => file.label === "source-video-manifest");
  const coverEntry = snapshot?.files.find((file) => file.label === "source-video-cover-png");
  assert.equal(manifestEntry?.status, "captured");
  assert.equal(coverEntry?.status, "captured");
  const capturedManifest = JSON.parse(
    await readFile(path.join(libraryRoot, manifestEntry!.snapshot_relative_path!), "utf8")
  ) as SourceVideoManifest;
  assert.equal(capturedManifest.cover_path, ".mixlab-library/videos/V000001/cover.png");
  assert.equal(
    Buffer.compare(
      await readFile(path.join(libraryRoot, coverEntry!.snapshot_relative_path!)),
      oldCoverBytes
    ),
    0
  );
});

test("source-video cover command rejects mismatched image content", async () => {
  const libraryRoot = await makeLibraryRoot();
  await seedLibrary({
    library_root: libraryRoot,
    manifests: [
      sourceVideoManifest({
        source_video_id: "V000001",
        preprocess_status: "queued",
        visible_to_cutters: false
      })
    ],
    counts: counts({
      video_count: 1,
      queued_video_count: 1
    }),
    updated_at: "2026-06-26T12:00:00.000Z"
  });

  await assert.rejects(
    () => runAdminSourceVideoCoverCommand({
      library_root: libraryRoot,
      source_video_id: "V000001",
      command_now: "2026-06-26T12:01:00.000Z",
      body: {
        image_base64: Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64"),
        content_type: "image/png"
      }
    }),
    /内容与类型不匹配/
  );
  assert.equal(existsSync(path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "cover.png")), false);
});

test("source-video metadata command updates only requested manifest by id and writes through sqlite", async () => {
  const libraryRoot = await makeLibraryRoot();
  const first = sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "queued",
    visible_to_cutters: false,
    title: "旧标题"
  });
  const second = sourceVideoManifest({
    source_video_id: "V000002",
    preprocess_status: "queued",
    visible_to_cutters: false,
    title: "另一个标题"
  });
  await seedLibrary({
    library_root: libraryRoot,
    manifests: [first, second],
    counts: counts({
      video_count: 2,
      queued_video_count: 2
    }),
    updated_at: "2026-06-26T12:00:00.000Z"
  });

  let observedLeaseReason = "";
  const updated = await runAdminSourceVideoMetadataCommand({
    library_root: libraryRoot,
    source_video_id: "V000001",
    command_now: "2026-06-26T12:02:00.000Z",
    body: {
      title: "新标题",
      description: "新公开说明",
      lecturer: "新讲师",
      course: "新课程",
      category: "新分类",
      tags: [" 新标签 ", "", 123]
    },
    now: () => {
      const lease = JSON.parse(readFileSync(leasePath(libraryRoot), "utf8")) as { reason: string };
      observedLeaseReason = lease.reason;
      return "2026-06-26T12:02:01.000Z";
    }
  });

  assert.equal(observedLeaseReason, "source-video-metadata");
  assert.equal(updated?.title, "新标题");
  assert.deepEqual(updated?.tags, ["新标签"]);

  const firstAfter = await readSourceVideoManifest(libraryRoot, "V000001");
  const secondAfter = await readSourceVideoManifest(libraryRoot, "V000002");
  assert.equal(firstAfter.title, "新标题");
  assert.equal(firstAfter.description, "新公开说明");
  assert.equal(firstAfter.lecturer, "新讲师");
  assert.equal(firstAfter.course, "新课程");
  assert.equal(firstAfter.category, "新分类");
  assert.deepEqual(firstAfter.tags, ["新标签"]);
  assert.equal(secondAfter.title, "另一个标题");
  assert.equal(secondAfter.description, "旧说明");

  const library = await readAdminLibraryManifest(libraryRoot);
  const status = await readAdminReadModelStoreStatus({
    library_root: libraryRoot,
    library
  });
  assert.equal(status.freshness, "fresh");

  const page = await readAdminSourceVideoStatusPageFromStore({
    library_root: libraryRoot,
    library,
    status: "queued",
    offset: 0,
    limit: 2
  });
  assert.equal(page?.manifests[0]?.title, "新标题");
  assert.equal(page?.manifests[1]?.title, "另一个标题");

  const snapshots = await readCommandSnapshotManifests(libraryRoot);
  const snapshot = snapshots.find((candidate) => candidate.command === "source-video-metadata");
  assert.equal(snapshot?.snapshot_kind, "file-capture");
  assert.equal(snapshot?.file_summary.captured_file_count, 1);
  const manifestEntry = snapshot?.files.find((file) => file.label === "source-video-manifest");
  assert.equal(manifestEntry?.status, "captured");
  const capturedManifest = JSON.parse(
    await readFile(path.join(libraryRoot, manifestEntry!.snapshot_relative_path!), "utf8")
  ) as SourceVideoManifest;
  assert.equal(capturedManifest.title, "旧标题");
  assert.equal(capturedManifest.description, "旧说明");

  const missing = await runAdminSourceVideoMetadataCommand({
    library_root: libraryRoot,
    source_video_id: "V999999",
    command_now: "2026-06-26T12:03:00.000Z",
    body: {
      title: "不存在"
    }
  });
  assert.equal(missing, null);
});
