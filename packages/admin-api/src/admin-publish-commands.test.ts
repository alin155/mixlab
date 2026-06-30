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
  readAdminOperationLog
} from "./admin-operation-log.ts";
import {
  readAdminReadModelStoreStatus,
  readAdminSourceVideoStatusPageFromStore,
  writeAdminSourceVideoStatusReadModelStore
} from "./admin-read-model-store.ts";
import { buildAdminSourceVideoStatusReadModel } from "./admin-source-video-read-model.ts";
import { adminCommandSnapshotRoot } from "./admin-command-snapshot.ts";
import { adminCommandSystemActor } from "./admin-command-audit.ts";
import {
  runAdminIndexRepairCommand,
  runAdminSourceVideoPublishCommand,
  runAdminSupervisorPublishCommand,
  type ReadyPublishMedia
} from "./admin-publish-commands.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-publish-commands-"));
}

async function readCommandSnapshotManifests(libraryRoot: string): Promise<Array<{
  command: string;
  snapshot_kind: string;
  file_summary: {
    requested_file_count: number;
    captured_file_count: number;
    missing_file_count: number;
    skipped_file_count: number;
    failed_file_count: number;
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
        requested_file_count: number;
        captured_file_count: number;
        missing_file_count: number;
        skipped_file_count: number;
        failed_file_count: number;
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

async function writeTranscriptArtifacts(libraryRoot: string, sourceVideoId: string): Promise<void> {
  await mkdir(videoDir(libraryRoot, sourceVideoId), { recursive: true });
  await writeFile(
    path.join(videoDir(libraryRoot, sourceVideoId), "transcript.json"),
    `${JSON.stringify({
      schema_version: "1.0",
      source_video_id: sourceVideoId,
      full_text: `${sourceVideoId} 文案`,
      duration_ms: 4_000,
      segments: [
        {
          segment_id: `${sourceVideoId}-S000001`,
          index: 0,
          begin_ms: 0,
          end_ms: 4_000,
          begin_char: 0,
          end_char: 8,
          normalized_begin_char: 0,
          normalized_end_char: 8,
          text: `${sourceVideoId} 文案`,
          normalized_text: `${sourceVideoId}文案`,
          confidence: 0.95
        }
      ]
    }, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(videoDir(libraryRoot, sourceVideoId), "subtitles.srt"),
    `1\n00:00:00,000 --> 00:00:04,000\n${sourceVideoId} 文案\n`,
    "utf8"
  );
}

function sourceVideoManifest(input: {
  source_video_id: string;
  relative_path: string;
  preprocess_status?: SourceVideoManifest["preprocess_status"];
  duration_ms?: number;
}): SourceVideoManifest {
  return {
    source_video_id: input.source_video_id,
    title: input.source_video_id,
    relative_path: input.relative_path,
    logical_uri: `library://source-video/${input.source_video_id}`,
    duration_ms: input.duration_ms ?? 60_000,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: "h264",
    file_size: 1024,
    content_hash: `hash-${input.source_video_id}`,
    preprocess_status: input.preprocess_status ?? "index-required",
    visible_to_cutters: false,
    transcript_path: `.mixlab-library/videos/${input.source_video_id}/transcript.json`,
    srt_path: `.mixlab-library/videos/${input.source_video_id}/subtitles.srt`,
    keyframes_path: "",
    cover_path: "",
    description: "测试素材描述",
    tags: ["测试"],
    lecturer: "测试讲师",
    course: "测试课程",
    category: "测试分类"
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

async function seedPublishLibrary(input: {
  library_root: string;
  manifests: SourceVideoManifest[];
  counts: LibraryCounts;
  updated_at: string;
}): Promise<void> {
  await mkdir(path.join(input.library_root, "source-videos"), { recursive: true });
  await writeAdminLibraryManifest({
    library_root: input.library_root,
    library_id: "test-library",
    library_name: "测试素材库",
    now: input.updated_at,
    counts: input.counts
  });
  for (const manifest of input.manifests) {
    await writeFile(path.join(input.library_root, "source-videos", manifest.relative_path), "video");
    await writeTranscriptArtifacts(input.library_root, manifest.source_video_id);
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
      generated_at: "2026-06-26T10:00:01.000Z"
    })
  });
}

function fakeMedia(createdCovers: string[]): ReadyPublishMedia {
  return {
    async create_cover(input) {
      createdCovers.push(input.output_path);
      await mkdir(path.dirname(input.output_path), { recursive: true });
      await writeFile(input.output_path, `cover from ${path.basename(input.source_path)}`, "utf8");
    }
  };
}

test("single source-video publish uses a midpoint cover frame for sub-second videos", async () => {
  const libraryRoot = await makeLibraryRoot();
  const manifest = sourceVideoManifest({
    source_video_id: "V000003",
    relative_path: "short.mp4",
    duration_ms: 960
  });
  await seedPublishLibrary({
    library_root: libraryRoot,
    manifests: [manifest],
    counts: counts({
      video_count: 1,
      index_required_video_count: 1
    }),
    updated_at: "2026-06-26T10:12:00.000Z"
  });

  const coverTimes: number[] = [];
  const result = await runAdminSourceVideoPublishCommand({
    library_root: libraryRoot,
    library_id: "test-library",
    command_now: "2026-06-26T10:13:00.000Z",
    now: () => "2026-06-26T10:13:01.000Z",
    source_video_id: "V000003",
    media: {
      async create_cover(input) {
        coverTimes.push(input.at_ms);
        await mkdir(path.dirname(input.output_path), { recursive: true });
        await writeFile(input.output_path, "cover", "utf8");
      }
    }
  });

  assert.deepEqual(coverTimes, [480]);
  assert.equal(result.published_count, 1);
  assert.deepEqual(result.published_source_video_ids, ["V000003"]);
  assert.equal((await readSourceVideoManifest(libraryRoot, "V000003")).preprocess_status, "ready");
});

test("publish preparation does not mark visual artifacts complete when cover output is missing", async () => {
  const libraryRoot = await makeLibraryRoot();
  const manifest = sourceVideoManifest({
    source_video_id: "V000004",
    relative_path: "missing-cover.mp4"
  });
  await seedPublishLibrary({
    library_root: libraryRoot,
    manifests: [manifest],
    counts: counts({
      video_count: 1,
      index_required_video_count: 1
    }),
    updated_at: "2026-06-26T10:14:00.000Z"
  });

  let createCoverCalls = 0;
  const result = await runAdminSourceVideoPublishCommand({
    library_root: libraryRoot,
    library_id: "test-library",
    command_now: "2026-06-26T10:15:00.000Z",
    now: () => "2026-06-26T10:15:01.000Z",
    source_video_id: "V000004",
    media: {
      async create_cover() {
        createCoverCalls += 1;
      }
    }
  });

  assert.equal(createCoverCalls, 1);
  assert.equal(result.published_count, 0);
  assert.deepEqual(result.prepared_source_video_ids, []);
  assert.deepEqual(result.skipped_source_video_ids, ["V000004"]);

  const nextManifest = await readSourceVideoManifest(libraryRoot, "V000004");
  assert.equal(nextManifest.preprocess_status, "index-required");
  assert.equal(nextManifest.visible_to_cutters, false);
  assert.equal(nextManifest.cover_path, "");
  assert.equal(nextManifest.keyframes_path, "");
});

test("index repair command runs under writer lease prepares artifacts publishes and writes through sqlite", async () => {
  const libraryRoot = await makeLibraryRoot();
  const first = sourceVideoManifest({
    source_video_id: "V000001",
    relative_path: "cashflow.mp4"
  });
  const second = sourceVideoManifest({
    source_video_id: "V000002",
    relative_path: "growth.mp4"
  });
  await seedPublishLibrary({
    library_root: libraryRoot,
    manifests: [first, second],
    counts: counts({
      video_count: 2,
      index_required_video_count: 2
    }),
    updated_at: "2026-06-26T10:00:00.000Z"
  });

  const createdCovers: string[] = [];
  let invalidated = 0;
  let observedLeaseReason = "";
  const result = await runAdminIndexRepairCommand({
    library_root: libraryRoot,
    library_id: "test-library",
    command_now: "2026-06-26T10:01:00.000Z",
    media: fakeMedia(createdCovers),
    invalidate_index_version_cache: () => {
      invalidated += 1;
    },
    now: () => {
      const raw = readFileSync(leasePath(libraryRoot), "utf8");
      const lease = JSON.parse(raw) as { reason: string };
      observedLeaseReason = lease.reason;
      return "2026-06-26T10:01:01.000Z";
    }
  });

  assert.equal(observedLeaseReason, "index-repair");
  assert.equal(invalidated, 1);
  assert.equal(result.published_count, 2);
  assert.equal(result.skipped_count, 0);
  assert.deepEqual(result.prepared_source_video_ids, ["V000001", "V000002"]);
  assert.deepEqual(result.published_source_video_ids, ["V000001", "V000002"]);
  assert.match(result.message, /已发布 2 个原视频/);
  assert.equal(createdCovers.length, 2);

  const firstManifest = await readSourceVideoManifest(libraryRoot, "V000001");
  assert.equal(firstManifest.preprocess_status, "ready");
  assert.equal(firstManifest.visible_to_cutters, true);
  assert.equal(firstManifest.cover_path, ".mixlab-library/videos/V000001/cover.jpg");
  assert.equal(firstManifest.keyframes_path, ".mixlab-library/videos/V000001/keyframes.json");
  assert.equal(existsSync(path.join(libraryRoot, firstManifest.cover_path)), true);
  assert.equal(existsSync(path.join(libraryRoot, firstManifest.keyframes_path)), true);

  const library = await readAdminLibraryManifest(libraryRoot);
  assert.equal(library?.ready_video_count, 2);
  assert.equal(library?.index_required_video_count, 0);

  const storeStatus = await readAdminReadModelStoreStatus({
    library_root: libraryRoot,
    library
  });
  assert.equal(storeStatus.freshness, "fresh");
  assert.equal(storeStatus.counts_by_status.ready, 2);
  assert.equal(storeStatus.counts_by_status["index-required"], 0);

  assert.equal((await readSourceVideoManifest(libraryRoot, "V000002")).preprocess_status, "ready");

  const snapshot = (await readCommandSnapshotManifests(libraryRoot)).find(
    (manifest) => manifest.command === "index-repair"
  );
  assert.equal(snapshot?.snapshot_kind, "file-capture");
  assert.deepEqual(snapshot?.file_summary, {
    requested_file_count: 10,
    captured_file_count: 3,
    missing_file_count: 7,
    skipped_file_count: 0,
    failed_file_count: 0
  });
  const capturedFirst = snapshot?.files.find((file) => file.label === "source-video-V000001-manifest");
  assert.equal(capturedFirst?.status, "captured");
  assert.equal(
    (JSON.parse(await readFile(path.join(libraryRoot, capturedFirst!.snapshot_relative_path!), "utf8")) as {
      preprocess_status: string;
    }).preprocess_status,
    "index-required"
  );
});

test("supervisor publish command runs under writer lease snapshots and audits system actor", async () => {
  const libraryRoot = await makeLibraryRoot();
  const manifest = sourceVideoManifest({
    source_video_id: "V000010",
    relative_path: "supervisor.mp4"
  });
  await seedPublishLibrary({
    library_root: libraryRoot,
    manifests: [manifest],
    counts: counts({
      video_count: 1,
      index_required_video_count: 1
    }),
    updated_at: "2026-06-26T10:05:00.000Z"
  });

  const createdCovers: string[] = [];
  let observedLeaseReason = "";
  const result = await runAdminSupervisorPublishCommand({
    library_root: libraryRoot,
    library_id: "test-library",
    command_now: "2026-06-26T10:06:00.000Z",
    media: fakeMedia(createdCovers),
    actor: adminCommandSystemActor("预处理流水线自动发布", "system-task"),
    now: () => {
      const raw = readFileSync(leasePath(libraryRoot), "utf8");
      const lease = JSON.parse(raw) as { reason: string };
      observedLeaseReason = lease.reason;
      return "2026-06-26T10:06:01.000Z";
    }
  });

  assert.equal(observedLeaseReason, "preprocess-supervisor-publish-ready");
  assert.equal(result.published_count, 1);
  assert.deepEqual(result.published_source_video_ids, ["V000010"]);
  assert.equal(createdCovers.length, 1);
  assert.equal((await readSourceVideoManifest(libraryRoot, "V000010")).preprocess_status, "ready");

  const snapshot = (await readCommandSnapshotManifests(libraryRoot)).find(
    (candidate) => candidate.command === "preprocess-supervisor-publish-ready"
  );
  assert.equal(snapshot?.snapshot_kind, "file-capture");
  assert.deepEqual(snapshot?.file_summary, {
    requested_file_count: 6,
    captured_file_count: 2,
    missing_file_count: 4,
    skipped_file_count: 0,
    failed_file_count: 0
  });
  assert.equal(
    snapshot?.files.some((file) => file.label === "source-video-V000010-manifest" && file.status === "captured"),
    true
  );

  const operationLog = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-26T10:06:02.000Z",
    limit: 10
  });
  const commandEvents = operationLog.events.filter(
    (event) => event.action === "preprocess-supervisor-publish-ready"
  );
  assert.deepEqual(
    commandEvents.map((event) => event.event_type).sort(),
    ["started", "succeeded"]
  );
  assert.equal(commandEvents.every((event) => event.area === "release"), true);
  const succeeded = commandEvents.find((event) => event.event_type === "succeeded");
  const details = succeeded?.details as {
    actor?: {
      kind?: string;
      source?: string;
      label?: string;
    };
    scan_mode?: string;
    command_snapshot?: {
      created?: boolean;
      snapshot_kind?: string;
      requested_file_count?: number;
    };
  } | undefined;
  assert.deepEqual(details?.actor, {
    kind: "system",
    source: "system-task",
    label: "预处理流水线自动发布"
  });
  assert.equal(details?.scan_mode, "status-scan");
  assert.equal(details?.command_snapshot?.created, true);
  assert.equal(details?.command_snapshot?.snapshot_kind, "file-capture");
  assert.equal(details?.command_snapshot?.requested_file_count, 6);
});

test("single source-video publish command only publishes the requested index-required source video", async () => {
  const libraryRoot = await makeLibraryRoot();
  const first = sourceVideoManifest({
    source_video_id: "V000001",
    relative_path: "cashflow.mp4"
  });
  const second = sourceVideoManifest({
    source_video_id: "V000002",
    relative_path: "growth.mp4"
  });
  await seedPublishLibrary({
    library_root: libraryRoot,
    manifests: [first, second],
    counts: counts({
      video_count: 2,
      index_required_video_count: 2
    }),
    updated_at: "2026-06-26T10:10:00.000Z"
  });

  const createdCovers: string[] = [];
  let invalidated = 0;
  const result = await runAdminSourceVideoPublishCommand({
    library_root: libraryRoot,
    library_id: "test-library",
    command_now: "2026-06-26T10:11:00.000Z",
    now: () => "2026-06-26T10:11:01.000Z",
    media: fakeMedia(createdCovers),
    source_video_id: "V000001",
    invalidate_index_version_cache: () => {
      invalidated += 1;
    }
  });

  assert.equal(invalidated, 1);
  assert.equal(result.published_count, 1);
  assert.deepEqual(result.prepared_source_video_ids, ["V000001"]);
  assert.deepEqual(result.published_source_video_ids, ["V000001"]);
  assert.equal(createdCovers.length, 1);

  assert.equal((await readSourceVideoManifest(libraryRoot, "V000001")).preprocess_status, "ready");
  assert.equal((await readSourceVideoManifest(libraryRoot, "V000002")).preprocess_status, "index-required");

  const library = await readAdminLibraryManifest(libraryRoot);
  assert.equal(library?.ready_video_count, 1);
  assert.equal(library?.index_required_video_count, 1);

  const indexRequiredPage = await readAdminSourceVideoStatusPageFromStore({
    library_root: libraryRoot,
    library,
    status: "index-required",
    offset: 0,
    limit: 1
  });
  assert.deepEqual(
    indexRequiredPage?.manifests.map((manifest) => manifest.source_video_id),
    ["V000002"]
  );

  const rawCurrent = await readFile(
    path.join(libraryRoot, ".mixlab-library", "indexes", "source-transcript-index", "current.json"),
    "utf8"
  );
  assert.match(rawCurrent, new RegExp(result.index_version));

  const snapshot = (await readCommandSnapshotManifests(libraryRoot)).find(
    (manifest) => manifest.command === "source-video-publish"
  );
  assert.equal(snapshot?.snapshot_kind, "file-capture");
  assert.deepEqual(snapshot?.file_summary, {
    requested_file_count: 6,
    captured_file_count: 2,
    missing_file_count: 4,
    skipped_file_count: 0,
    failed_file_count: 0
  });
  assert.equal(
    snapshot?.files.some((file) => file.label.includes("V000002")),
    false
  );
});
