import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  readPreprocessJobLog,
  readSourceVideoManifest
} from "../../library-fs/src/index.ts";
import type { LibraryCounts, SourceVideoManifest } from "../../protocol/src/index.ts";
import { AdminReadyProtectionError } from "./admin-protection.ts";
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
import { adminCommandSnapshotRoot } from "./admin-command-snapshot.ts";
import {
  runAdminBulkTransitionCommand,
  runAdminPipelineQueueCommand,
  runAdminSourceVideoTransitionCommand
} from "./admin-transition-commands.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-transition-commands-"));
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

async function readJob(libraryRoot: string, sourceVideoId: string): Promise<{
  status: string;
  attempt: number;
  claimed_at?: string;
  worker_id?: string;
}> {
  return JSON.parse(
    await readFile(path.join(videoDir(libraryRoot, sourceVideoId), "preprocess-job.json"), "utf8")
  ) as {
    status: string;
    attempt: number;
    claimed_at?: string;
    worker_id?: string;
  };
}

async function writeJob(
  libraryRoot: string,
  sourceVideoId: string,
  job: Record<string, unknown>
): Promise<void> {
  await mkdir(videoDir(libraryRoot, sourceVideoId), { recursive: true });
  await writeFile(
    path.join(videoDir(libraryRoot, sourceVideoId), "preprocess-job.json"),
    `${JSON.stringify({
      source_video_id: sourceVideoId,
      ...job
    }, null, 2)}\n`,
    "utf8"
  );
}

function sourceVideoManifest(input: {
  source_video_id: string;
  preprocess_status: SourceVideoManifest["preprocess_status"];
  title?: string;
  visible_to_cutters?: boolean;
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
    cover_path: input.preprocess_status === "ready" ? `artifacts/${input.source_video_id}/cover.jpg` : "",
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
      generated_at: "2026-06-26T10:00:01.000Z"
    })
  });
}

test("bulk preprocess transition command runs under writer lease and writes through manifests jobs logs library counts and sqlite", async () => {
  const libraryRoot = await makeLibraryRoot();
  const first = sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "unprocessed",
    visible_to_cutters: false
  });
  const second = sourceVideoManifest({
    source_video_id: "V000002",
    preprocess_status: "unprocessed",
    visible_to_cutters: false
  });
  const failed = sourceVideoManifest({
    source_video_id: "V000003",
    preprocess_status: "failed",
    visible_to_cutters: false
  });
  await seedLibrary({
    library_root: libraryRoot,
    manifests: [first, second, failed],
    counts: counts({
      video_count: 3,
      unprocessed_video_count: 2,
      failed_video_count: 1
    }),
    updated_at: "2026-06-26T10:00:00.000Z"
  });
  await writeFile(
    path.join(videoDir(libraryRoot, "V000001"), "source-video.json"),
    `${JSON.stringify({
      ...first,
      description: "stale-before-queue".repeat(128)
    }, null, 2)}\n${"\u0000".repeat(32)}`,
    "utf8"
  );
  await writeFile(
    path.join(videoDir(libraryRoot, "V000001"), "preprocess-job.json"),
    `${JSON.stringify({
      source_video_id: "V000001",
      status: "failed",
      attempt: 8,
      worker_id: "old-worker"
    }, null, 2)}\n${"\u0000".repeat(32)}`,
    "utf8"
  );

  let observedLeaseReason = "";
  const result = await runAdminBulkTransitionCommand({
    library_root: libraryRoot,
    library_id: "test-library",
    library_name: "测试素材库",
    command: "preprocess-queue-unprocessed",
    command_now: "2026-06-26T10:01:00.000Z",
    now: () => {
      const raw = readFileSync(leasePath(libraryRoot), "utf8");
      const lease = JSON.parse(raw) as { reason: string };
      observedLeaseReason = lease.reason;
      return "2026-06-26T10:01:01.000Z";
    }
  });

  assert.equal(observedLeaseReason, "preprocess-queue-unprocessed");
  assert.equal(result.affected_count, 2);
  assert.deepEqual(result.source_video_ids, ["V000001", "V000002"]);
  assert.equal(result.library_counts?.queued_video_count, 2);
  assert.equal(result.library_counts?.unprocessed_video_count, 0);
  assert.equal(result.library_counts?.failed_video_count, 1);

  assert.equal((await readSourceVideoManifest(libraryRoot, "V000001")).preprocess_status, "queued");
  assert.equal((await readSourceVideoManifest(libraryRoot, "V000002")).preprocess_status, "queued");
  assert.equal((await readSourceVideoManifest(libraryRoot, "V000003")).preprocess_status, "failed");

  const job = await readJob(libraryRoot, "V000001");
  assert.equal(job.status, "queued");
  assert.equal(job.attempt, 9);
  assert.equal(job.worker_id, "admin");
  assert.equal(job.claimed_at, "2026-06-26T10:01:01.000Z");
  const rawFirstManifest = await readFile(
    path.join(videoDir(libraryRoot, "V000001"), "source-video.json"),
    "utf8"
  );
  const rawFirstJob = await readFile(
    path.join(videoDir(libraryRoot, "V000001"), "preprocess-job.json"),
    "utf8"
  );
  assert.equal(rawFirstManifest.includes("\u0000"), false);
  assert.equal(rawFirstJob.includes("\u0000"), false);
  assert.equal((JSON.parse(rawFirstManifest) as SourceVideoManifest).preprocess_status, "queued");
  assert.equal((JSON.parse(rawFirstJob) as { status: string }).status, "queued");

  const log = await readPreprocessJobLog(libraryRoot, "V000001");
  assert.match(log.content, /queued-by-admin\tunprocessed -> queued/);

  const library = await readAdminLibraryManifest(libraryRoot);
  assert.equal(library?.updated_at, "2026-06-26T10:01:01.000Z");
  assert.equal(library?.queued_video_count, 2);
  assert.equal(library?.unprocessed_video_count, 0);

  const storeStatus = await readAdminReadModelStoreStatus({
    library_root: libraryRoot,
    library
  });
  assert.equal(storeStatus.freshness, "fresh");
  assert.equal(storeStatus.counts_by_status.queued, 2);
  assert.equal(storeStatus.counts_by_status.unprocessed, 0);
  assert.equal(storeStatus.counts_by_status.failed, 1);

  const queuedPage = await readAdminSourceVideoStatusPageFromStore({
    library_root: libraryRoot,
    library,
    status: "queued",
    offset: 0,
    limit: 2
  });
  assert.deepEqual(
    queuedPage?.manifests.map((manifest) => manifest.source_video_id),
    ["V000001", "V000002"]
  );

  const snapshot = (await readCommandSnapshotManifests(libraryRoot)).find(
    (manifest) => manifest.command === "preprocess-queue-unprocessed"
  );
  assert.equal(snapshot?.snapshot_kind, "file-capture");
  assert.deepEqual(snapshot?.file_summary, {
    requested_file_count: 5,
    captured_file_count: 4,
    missing_file_count: 1,
    skipped_file_count: 0,
    failed_file_count: 0
  });
  const capturedFirst = snapshot?.files.find((file) => file.label === "source-video-V000001-manifest");
  assert.equal(capturedFirst?.status, "captured");
  assert.equal(
    (JSON.parse(
      (await readFile(path.join(libraryRoot, capturedFirst!.snapshot_relative_path!), "utf8"))
        .replace(/\u0000+$/u, "")
    ) as {
      preprocess_status: string;
    }).preprocess_status,
    "unprocessed"
  );
});

test("bulk preprocess transition command respects batch limit", async () => {
  const libraryRoot = await makeLibraryRoot();
  await seedLibrary({
    library_root: libraryRoot,
    manifests: [
      sourceVideoManifest({
        source_video_id: "V000001",
        preprocess_status: "unprocessed",
        visible_to_cutters: false
      }),
      sourceVideoManifest({
        source_video_id: "V000002",
        preprocess_status: "unprocessed",
        visible_to_cutters: false
      }),
      sourceVideoManifest({
        source_video_id: "V000003",
        preprocess_status: "unprocessed",
        visible_to_cutters: false
      }),
      sourceVideoManifest({
        source_video_id: "V000004",
        preprocess_status: "ready",
        visible_to_cutters: true
      })
    ],
    counts: counts({
      video_count: 4,
      unprocessed_video_count: 3,
      ready_video_count: 1
    }),
    updated_at: "2026-06-26T10:10:00.000Z"
  });

  const result = await runAdminBulkTransitionCommand({
    library_root: libraryRoot,
    library_id: "test-library",
    library_name: "测试素材库",
    command: "preprocess-queue-unprocessed",
    command_now: "2026-06-26T10:11:00.000Z",
    now: () => "2026-06-26T10:11:01.000Z",
    limit: 2
  });

  assert.equal(result.affected_count, 2);
  assert.deepEqual(result.source_video_ids, ["V000001", "V000002"]);
  assert.equal(result.library_counts?.queued_video_count, 2);
  assert.equal(result.library_counts?.unprocessed_video_count, 1);
  assert.equal(result.library_counts?.ready_video_count, 1);

  assert.equal((await readSourceVideoManifest(libraryRoot, "V000001")).preprocess_status, "queued");
  assert.equal((await readSourceVideoManifest(libraryRoot, "V000002")).preprocess_status, "queued");
  assert.equal((await readSourceVideoManifest(libraryRoot, "V000003")).preprocess_status, "unprocessed");
  assert.equal((await readSourceVideoManifest(libraryRoot, "V000004")).preprocess_status, "ready");
});

test("pipeline queue command has its own writer lease reason job log and sqlite write-through", async () => {
  const libraryRoot = await makeLibraryRoot();
  const unprocessed = sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "unprocessed",
    visible_to_cutters: false
  });
  const failed = sourceVideoManifest({
    source_video_id: "V000002",
    preprocess_status: "failed",
    visible_to_cutters: false
  });
  await seedLibrary({
    library_root: libraryRoot,
    manifests: [unprocessed, failed],
    counts: counts({
      video_count: 2,
      unprocessed_video_count: 1,
      failed_video_count: 1
    }),
    updated_at: "2026-06-26T10:20:00.000Z"
  });

  let observedLeaseReason = "";
  const result = await runAdminPipelineQueueCommand({
    library_root: libraryRoot,
    library_id: "test-library",
    library_name: "测试素材库",
    command_now: "2026-06-26T10:21:00.000Z",
    now: () => {
      const raw = readFileSync(leasePath(libraryRoot), "utf8");
      const lease = JSON.parse(raw) as { reason: string };
      observedLeaseReason = lease.reason;
      return "2026-06-26T10:21:01.000Z";
    }
  });

  assert.equal(observedLeaseReason, "preprocess-queue-unprocessed-pipeline");
  assert.equal(result.affected_count, 1);
  assert.deepEqual(result.source_video_ids, ["V000001"]);
  assert.equal(result.library_counts?.queued_video_count, 1);
  assert.equal(result.library_counts?.unprocessed_video_count, 0);
  assert.equal(result.library_counts?.failed_video_count, 1);

  assert.equal((await readSourceVideoManifest(libraryRoot, "V000001")).preprocess_status, "queued");
  assert.equal((await readSourceVideoManifest(libraryRoot, "V000002")).preprocess_status, "failed");

  const job = await readJob(libraryRoot, "V000001");
  assert.equal(job.status, "queued");
  assert.equal(job.attempt, 1);
  assert.equal(job.worker_id, "admin");
  assert.equal(job.claimed_at, "2026-06-26T10:21:01.000Z");

  const log = await readPreprocessJobLog(libraryRoot, "V000001");
  assert.match(log.content, /queued-by-pipeline\tunprocessed -> queued/);

  const library = await readAdminLibraryManifest(libraryRoot);
  assert.equal(library?.updated_at, "2026-06-26T10:21:01.000Z");
  assert.equal(library?.queued_video_count, 1);
  assert.equal(library?.unprocessed_video_count, 0);

  const storeStatus = await readAdminReadModelStoreStatus({
    library_root: libraryRoot,
    library
  });
  assert.equal(storeStatus.freshness, "fresh");
  assert.equal(storeStatus.counts_by_status.queued, 1);
  assert.equal(storeStatus.counts_by_status.failed, 1);
});

test("retry failed transition skips permanent source failures", async () => {
  const libraryRoot = await makeLibraryRoot();
  const corrupted = sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "failed",
    visible_to_cutters: false
  });
  const retryable = sourceVideoManifest({
    source_video_id: "V000002",
    preprocess_status: "failed",
    visible_to_cutters: false
  });
  const missing = sourceVideoManifest({
    source_video_id: "V000003",
    preprocess_status: "failed",
    visible_to_cutters: false
  });
  const noSpeech = sourceVideoManifest({
    source_video_id: "V000004",
    preprocess_status: "failed",
    visible_to_cutters: false
  });
  await seedLibrary({
    library_root: libraryRoot,
    manifests: [corrupted, retryable, missing, noSpeech],
    counts: counts({
      video_count: 4,
      failed_video_count: 4
    }),
    updated_at: "2026-06-26T10:30:00.000Z"
  });
  await writeJob(libraryRoot, "V000001", {
    status: "failed",
    attempt: 3,
    error_message: "moov atom not found"
  });
  await writeJob(libraryRoot, "V000002", {
    status: "failed",
    attempt: 2,
    error_message: "DashScope task timeout"
  });
  await writeJob(libraryRoot, "V000003", {
    status: "failed",
    attempt: 1,
    error_message: "No such file or directory"
  });
  await writeJob(libraryRoot, "V000004", {
    status: "failed",
    attempt: 1,
    error_message: "ASR_RESPONSE_HAVE_NO_WORDS"
  });

  const result = await runAdminBulkTransitionCommand({
    library_root: libraryRoot,
    library_id: "test-library",
    library_name: "测试素材库",
    command: "preprocess-retry-failed",
    command_now: "2026-06-26T10:31:00.000Z",
    now: () => "2026-06-26T10:31:01.000Z"
  });

  assert.equal(result.affected_count, 1);
  assert.deepEqual(result.source_video_ids, ["V000002"]);
  assert.equal(result.skipped_count, 3);
  assert.deepEqual(result.skipped_source_video_ids, ["V000001", "V000003", "V000004"]);
  assert.equal(result.library_counts?.queued_video_count, 1);
  assert.equal(result.library_counts?.failed_video_count, 3);
  assert.equal((await readSourceVideoManifest(libraryRoot, "V000001")).preprocess_status, "failed");
  assert.equal((await readSourceVideoManifest(libraryRoot, "V000002")).preprocess_status, "queued");
  assert.equal((await readSourceVideoManifest(libraryRoot, "V000003")).preprocess_status, "failed");
  assert.equal((await readSourceVideoManifest(libraryRoot, "V000004")).preprocess_status, "failed");
  assert.equal((await readJob(libraryRoot, "V000002")).attempt, 3);
});

test("single source-video transition command updates only requested id and preserves ready guard", async () => {
  const libraryRoot = await makeLibraryRoot();
  const failed = sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "failed",
    visible_to_cutters: false
  });
  const otherFailed = sourceVideoManifest({
    source_video_id: "V000002",
    preprocess_status: "failed",
    visible_to_cutters: false
  });
  const ready = sourceVideoManifest({
    source_video_id: "V000003",
    preprocess_status: "ready",
    visible_to_cutters: true
  });
  await seedLibrary({
    library_root: libraryRoot,
    manifests: [failed, otherFailed, ready],
    counts: counts({
      video_count: 3,
      ready_video_count: 1,
      failed_video_count: 2
    }),
    updated_at: "2026-06-26T10:10:00.000Z"
  });

  const result = await runAdminSourceVideoTransitionCommand({
    library_root: libraryRoot,
    library_id: "test-library",
    library_name: "测试素材库",
    command: "source-video-retry",
    source_video_id: "V000001",
    command_now: "2026-06-26T10:11:00.000Z",
    now: () => "2026-06-26T10:11:01.000Z"
  });

  assert.equal(result.affected_count, 1);
  assert.deepEqual(result.source_video_ids, ["V000001"]);
  assert.equal((await readSourceVideoManifest(libraryRoot, "V000001")).preprocess_status, "queued");
  assert.equal((await readSourceVideoManifest(libraryRoot, "V000002")).preprocess_status, "failed");
  assert.equal((await readSourceVideoManifest(libraryRoot, "V000003")).preprocess_status, "ready");

  const library = await readAdminLibraryManifest(libraryRoot);
  assert.equal(library?.queued_video_count, 1);
  assert.equal(library?.failed_video_count, 1);
  assert.equal(library?.ready_video_count, 1);

  const failedPage = await readAdminSourceVideoStatusPageFromStore({
    library_root: libraryRoot,
    library,
    status: "failed",
    offset: 0,
    limit: 1
  });
  assert.deepEqual(
    failedPage?.manifests.map((manifest) => manifest.source_video_id),
    ["V000002"]
  );

  let readyError: unknown;
  try {
    await runAdminSourceVideoTransitionCommand({
      library_root: libraryRoot,
      library_id: "test-library",
      library_name: "测试素材库",
      command: "source-video-queue",
      source_video_id: "V000003",
      command_now: "2026-06-26T10:12:00.000Z",
      now: () => "2026-06-26T10:12:01.000Z"
    });
  } catch (error) {
    readyError = error;
  }
  assert.equal(readyError instanceof AdminReadyProtectionError, true);
  assert.equal((await readSourceVideoManifest(libraryRoot, "V000003")).preprocess_status, "ready");
  assert.equal((await readSourceVideoManifest(libraryRoot, "V000003")).visible_to_cutters, true);
  assert.equal(existsSync(path.join(videoDir(libraryRoot, "V000003"), "preprocess-job.json")), false);

  const blockedSnapshot = (await readCommandSnapshotManifests(libraryRoot)).find(
    (manifest) => manifest.command === "source-video-queue"
  );
  assert.equal(blockedSnapshot?.snapshot_kind, "file-capture");
  const capturedReady = blockedSnapshot?.files.find((file) => file.label === "source-video-V000003-manifest");
  assert.equal(capturedReady?.status, "captured");
  assert.equal(
    (JSON.parse(await readFile(path.join(libraryRoot, capturedReady!.snapshot_relative_path!), "utf8")) as {
      preprocess_status: string;
      visible_to_cutters: boolean;
    }).preprocess_status,
    "ready"
  );
});

test("single source-video retry skips permanent source failure", async () => {
  const libraryRoot = await makeLibraryRoot();
  const failed = sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "failed",
    visible_to_cutters: false
  });
  await seedLibrary({
    library_root: libraryRoot,
    manifests: [failed],
    counts: counts({
      video_count: 1,
      failed_video_count: 1
    }),
    updated_at: "2026-06-26T10:40:00.000Z"
  });
  await writeJob(libraryRoot, "V000001", {
    status: "failed",
    attempt: 2,
    error_message: "ffprobe output did not include a video stream"
  });

  const result = await runAdminSourceVideoTransitionCommand({
    library_root: libraryRoot,
    library_id: "test-library",
    library_name: "测试素材库",
    command: "source-video-retry",
    source_video_id: "V000001",
    command_now: "2026-06-26T10:41:00.000Z",
    now: () => "2026-06-26T10:41:01.000Z"
  });

  assert.equal(result.affected_count, 0);
  assert.equal(result.skipped_count, 1);
  assert.deepEqual(result.skipped_source_video_ids, ["V000001"]);
  assert.equal((await readSourceVideoManifest(libraryRoot, "V000001")).preprocess_status, "failed");
  assert.equal((await readJob(libraryRoot, "V000001")).attempt, 2);
  const library = await readAdminLibraryManifest(libraryRoot);
  assert.equal(library?.failed_video_count, 1);
  assert.equal(library?.queued_video_count, 0);
});
