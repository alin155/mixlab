import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { readSourceVideoManifest } from "../../library-fs/src/index.ts";
import type { LibraryCounts, SourceVideoManifest } from "../../protocol/src/index.ts";
import { readAdminLibraryManifest, writeAdminLibraryManifest } from "./admin-library-commands.ts";
import { readAdminOperationLog } from "./admin-operation-log.ts";
import { planAdminCommandSnapshotRestore } from "./admin-command-restore-plan.ts";
import { adminCommandSnapshotRoot, type AdminCommandSnapshotManifest } from "./admin-command-snapshot.ts";
import {
  runAdminWorkerClaimCommand,
  runAdminWorkerCompleteCommand,
  runAdminWorkerFailCommand,
  runAdminWorkerRefreshCountsCommand,
  runAdminWorkerStageCommand
} from "./admin-worker-lifecycle-commands.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-worker-lifecycle-"));
}

function videoDir(libraryRoot: string, sourceVideoId: string): string {
  return path.join(libraryRoot, ".mixlab-library", "videos", sourceVideoId);
}

function preprocessJobPath(libraryRoot: string, sourceVideoId: string): string {
  return path.join(videoDir(libraryRoot, sourceVideoId), "preprocess-job.json");
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function readCommandSnapshotRecords(libraryRoot: string): Promise<Array<{
  manifest: AdminCommandSnapshotManifest;
  manifest_path: string;
}>> {
  const root = adminCommandSnapshotRoot(libraryRoot);
  const directories = await readdir(root);
  return Promise.all(directories.map(async (directory) => {
    const manifestPath = path.join(root, directory, "snapshot.json");
    return {
      manifest: JSON.parse(await readFile(manifestPath, "utf8")) as AdminCommandSnapshotManifest,
      manifest_path: manifestPath
    };
  }));
}

async function readCommandSnapshotManifests(
  libraryRoot: string
): Promise<AdminCommandSnapshotManifest[]> {
  return (await readCommandSnapshotRecords(libraryRoot)).map((record) => record.manifest);
}

function sourceVideoManifest(input: {
  source_video_id: string;
  preprocess_status: SourceVideoManifest["preprocess_status"];
}): SourceVideoManifest {
  return {
    source_video_id: input.source_video_id,
    title: input.source_video_id,
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
    visible_to_cutters: input.preprocess_status === "ready",
    transcript_path: "",
    srt_path: "",
    keyframes_path: "",
    cover_path: "",
    description: "",
    tags: [],
    lecturer: "",
    course: "",
    category: ""
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

async function writeManifest(
  libraryRoot: string,
  manifest: SourceVideoManifest
): Promise<void> {
  await mkdir(videoDir(libraryRoot, manifest.source_video_id), { recursive: true });
  await writeFile(
    path.join(videoDir(libraryRoot, manifest.source_video_id), "source-video.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
}

async function seedLibrary(input: {
  library_root: string;
  manifests: SourceVideoManifest[];
  counts: LibraryCounts;
  now: string;
}): Promise<void> {
  await writeAdminLibraryManifest({
    library_root: input.library_root,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: input.now,
    counts: input.counts
  });

  for (const manifest of input.manifests) {
    await writeManifest(input.library_root, manifest);
  }
}

async function writeTextArtifacts(libraryRoot: string, sourceVideoId: string): Promise<void> {
  const dir = videoDir(libraryRoot, sourceVideoId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "transcript.json"), "{\"segments\":[]}\n", "utf8");
  await writeFile(path.join(dir, "subtitles.srt"), "", "utf8");
}

const systemActor = {
  kind: "system" as const,
  source: "system-task" as const,
  label: "预处理工作器生命周期测试"
};

test("worker claim command acquires command audit and snapshots the candidate lifecycle files", async () => {
  const libraryRoot = await makeLibraryRoot();
  await seedLibrary({
    library_root: libraryRoot,
    manifests: [sourceVideoManifest({
      source_video_id: "V000001",
      preprocess_status: "queued"
    })],
    counts: counts({ video_count: 1, queued_video_count: 1 }),
    now: "2026-06-26T00:00:00.000Z"
  });

  const job = await runAdminWorkerClaimCommand({
    library_root: libraryRoot,
    worker_id: "worker-a",
    now: "2026-06-26T00:00:01.000Z",
    refresh_library_counts: false
  }, { actor: systemActor });

  assert.equal(job?.source_video_id, "V000001");
  const manifest = await readSourceVideoManifest(libraryRoot, "V000001");
  assert.equal(manifest.preprocess_status, "processing");
  assert.equal(manifest.visible_to_cutters, false);

  const snapshots = await readCommandSnapshotManifests(libraryRoot);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0]?.command, "preprocess-worker-claim");
  assert.deepEqual(
    snapshots[0]?.files.map((file) => file.label),
    [
      "library-manifest",
      "source-video-V000001-manifest",
      "source-video-V000001-preprocess-job",
      "source-video-V000001-preprocess-log"
    ]
  );

  const log = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-26T00:00:02.000Z",
    limit: 10
  });

  assert.deepEqual(log.events.map((event) => event.event_type), ["succeeded", "started"]);
  assert.deepEqual(log.events.map((event) => event.action), [
    "preprocess-worker-claim",
    "preprocess-worker-claim"
  ]);
  assert.equal(log.events[0]?.area, "preprocess");
  assert.deepEqual(log.events[0]?.details.actor, systemActor);
  assert.equal(log.events[0]?.details.scan_mode, "status-scan");
  assert.equal((log.events[0]?.details.command_snapshot as { created?: boolean })?.created, true);
});

test("worker stage complete and refresh-count commands preserve lifecycle semantics", async () => {
  const libraryRoot = await makeLibraryRoot();
  await seedLibrary({
    library_root: libraryRoot,
    manifests: [sourceVideoManifest({
      source_video_id: "V000001",
      preprocess_status: "queued"
    })],
    counts: counts({ video_count: 1, queued_video_count: 1 }),
    now: "2026-06-26T00:01:00.000Z"
  });

  await runAdminWorkerClaimCommand({
    library_root: libraryRoot,
    worker_id: "worker-a",
    now: "2026-06-26T00:01:01.000Z",
    refresh_library_counts: false
  }, { actor: systemActor });
  await runAdminWorkerStageCommand({
    library_root: libraryRoot,
    source_video_id: "V000001",
    stage: "asr",
    now: "2026-06-26T00:01:02.000Z"
  }, { actor: systemActor });
  await writeTextArtifacts(libraryRoot, "V000001");
  await runAdminWorkerCompleteCommand({
    library_root: libraryRoot,
    source_video_id: "V000001",
    now: "2026-06-26T00:01:03.000Z",
    refresh_library_counts: false,
    media: {
      duration_ms: 4_000,
      width: 1280,
      height: 720,
      fps: 25,
      codec: "h264",
      content_hash: "sha256:V000001"
    },
    artifacts: {
      transcript_path: ".mixlab-library/videos/V000001/transcript.json",
      srt_path: ".mixlab-library/videos/V000001/subtitles.srt",
      keyframes_path: "",
      cover_path: ""
    }
  }, { actor: systemActor });
  await runAdminWorkerRefreshCountsCommand({
    library_root: libraryRoot,
    now: "2026-06-26T00:01:04.000Z"
  }, { actor: systemActor });

  const manifest = await readSourceVideoManifest(libraryRoot, "V000001");
  assert.equal(manifest.preprocess_status, "index-required");
  assert.equal(manifest.visible_to_cutters, false);
  assert.equal(manifest.transcript_path, ".mixlab-library/videos/V000001/transcript.json");

  const job = await readJson<Record<string, unknown>>(preprocessJobPath(libraryRoot, "V000001"));
  assert.equal(job.status, "index-required");
  assert.equal(job.current_stage, undefined);

  const library = await readAdminLibraryManifest(libraryRoot);
  assert.equal(library?.index_required_video_count, 1);
  assert.equal(library?.queued_video_count, 0);
  assert.equal(library?.processing_video_count, 0);

  const log = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-26T00:01:05.000Z",
    limit: 20
  });
  const succeededActions = log.events
    .filter((event) => event.event_type === "succeeded")
    .map((event) => event.action)
    .sort();

  assert.deepEqual(succeededActions, [
    "preprocess-worker-claim",
    "preprocess-worker-complete",
    "preprocess-worker-refresh-counts",
    "preprocess-worker-stage"
  ].sort());

  const stageEvent = log.events.find((event) =>
    event.action === "preprocess-worker-stage" && event.event_type === "succeeded"
  );
  assert.equal(stageEvent?.details.invalidates_source_video_read_model, false);
  assert.deepEqual(stageEvent?.details.mutation_targets, ["preprocess-job", "preprocess-job-log"]);

  const snapshotRecords = await readCommandSnapshotRecords(libraryRoot);
  const snapshots = snapshotRecords.map((record) => record.manifest);
  assert.deepEqual(
    snapshots.map((snapshot) => snapshot.command).sort(),
    [
      "preprocess-worker-claim",
      "preprocess-worker-complete",
      "preprocess-worker-refresh-counts",
      "preprocess-worker-stage"
    ].sort()
  );

  const completeSnapshot = snapshotRecords.find((record) =>
    record.manifest.command === "preprocess-worker-complete"
  );
  assert.ok(completeSnapshot);
  assert.deepEqual(
    completeSnapshot.manifest.files.map((file) => file.label),
    [
      "library-manifest",
      "source-video-V000001-manifest",
      "source-video-V000001-preprocess-job",
      "source-video-V000001-preprocess-log",
      "source-video-V000001-transcript-artifact",
      "source-video-V000001-srt-artifact"
    ]
  );
  assert.deepEqual(
    completeSnapshot.manifest.files
      .filter((file) => file.label.endsWith("-artifact"))
      .map((file) => ({
        label: file.label,
        status: file.status,
        source_relative_path: file.source_relative_path
      })),
    [
      {
        label: "source-video-V000001-transcript-artifact",
        status: "captured",
        source_relative_path: ".mixlab-library/videos/V000001/transcript.json"
      },
      {
        label: "source-video-V000001-srt-artifact",
        status: "captured",
        source_relative_path: ".mixlab-library/videos/V000001/subtitles.srt"
      }
    ]
  );

  const restorePlan = await planAdminCommandSnapshotRestore({
    library_root: libraryRoot,
    snapshot_manifest_path: completeSnapshot.manifest_path,
    generated_at: "2026-06-26T00:01:06.000Z"
  });
  assert.equal(restorePlan.can_restore, true);
  assert.deepEqual(
    restorePlan.files
      .filter((file) => file.label.endsWith("-artifact"))
      .map((file) => ({
        label: file.label,
        can_restore: file.can_restore,
        status: file.status,
        snapshot_status: file.snapshot_status,
        target_status: file.target_status
      })),
    [
      {
        label: "source-video-V000001-transcript-artifact",
        can_restore: true,
        status: "restorable",
        snapshot_status: "exists",
        target_status: "exists"
      },
      {
        label: "source-video-V000001-srt-artifact",
        can_restore: true,
        status: "restorable",
        snapshot_status: "exists",
        target_status: "exists"
      }
    ]
  );
});

test("worker complete command blocks missing text artifacts before index-required commit", async () => {
  const libraryRoot = await makeLibraryRoot();
  await seedLibrary({
    library_root: libraryRoot,
    manifests: [sourceVideoManifest({
      source_video_id: "V000001",
      preprocess_status: "queued"
    })],
    counts: counts({ video_count: 1, queued_video_count: 1 }),
    now: "2026-06-26T00:01:30.000Z"
  });

  await runAdminWorkerClaimCommand({
    library_root: libraryRoot,
    worker_id: "worker-a",
    now: "2026-06-26T00:01:31.000Z",
    refresh_library_counts: false
  }, { actor: systemActor });

  await assert.rejects(
    () => runAdminWorkerCompleteCommand({
      library_root: libraryRoot,
      source_video_id: "V000001",
      now: "2026-06-26T00:01:32.000Z",
      refresh_library_counts: false,
      media: {
        duration_ms: 4_000,
        width: 1280,
        height: 720,
        fps: 25,
        codec: "h264",
        content_hash: "sha256:V000001"
      },
      artifacts: {
        transcript_path: ".mixlab-library/videos/V000001/transcript.json",
        srt_path: ".mixlab-library/videos/V000001/subtitles.srt",
        keyframes_path: "",
        cover_path: ""
      }
    }, { actor: systemActor }),
    (error) => {
      assert.equal((error as { code?: string }).code, "artifact_commit_blocked");
      assert.match((error as Error).message, /transcript_path file is missing/);
      return true;
    }
  );

  const manifest = await readSourceVideoManifest(libraryRoot, "V000001");
  assert.equal(manifest.preprocess_status, "processing");
  assert.equal(manifest.visible_to_cutters, false);
  assert.equal(manifest.transcript_path, "");

  const job = await readJson<Record<string, unknown>>(preprocessJobPath(libraryRoot, "V000001"));
  assert.equal(job.status, "processing");

  const log = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-26T00:01:33.000Z",
    limit: 10
  });
  const completeEvents = log.events.filter((event) => event.action === "preprocess-worker-complete");
  assert.deepEqual(
    completeEvents.map((event) => event.event_type),
    ["failed", "started"]
  );
  assert.equal(completeEvents[0]?.details.error_code, "artifact_commit_blocked");
  assert.match(String(completeEvents[0]?.details.error_message), /srt_path file is missing/);
});

test("worker fail command records failed status and command audit", async () => {
  const libraryRoot = await makeLibraryRoot();
  await seedLibrary({
    library_root: libraryRoot,
    manifests: [sourceVideoManifest({
      source_video_id: "V000001",
      preprocess_status: "queued"
    })],
    counts: counts({ video_count: 1, queued_video_count: 1 }),
    now: "2026-06-26T00:02:00.000Z"
  });

  await runAdminWorkerClaimCommand({
    library_root: libraryRoot,
    worker_id: "worker-a",
    now: "2026-06-26T00:02:01.000Z",
    refresh_library_counts: false
  }, { actor: systemActor });
  await runAdminWorkerFailCommand({
    library_root: libraryRoot,
    source_video_id: "V000001",
    now: "2026-06-26T00:02:02.000Z",
    error_stage: "asr",
    error_message: "DashScope task failed"
  }, { actor: systemActor });

  const manifest = await readSourceVideoManifest(libraryRoot, "V000001");
  assert.equal(manifest.preprocess_status, "failed");
  assert.equal(manifest.visible_to_cutters, false);

  const job = await readJson<Record<string, unknown>>(preprocessJobPath(libraryRoot, "V000001"));
  assert.equal(job.status, "failed");
  assert.equal(job.error_stage, "asr");
  assert.equal(job.error_message, "DashScope task failed");

  const library = await readAdminLibraryManifest(libraryRoot);
  assert.equal(library?.failed_video_count, 1);
  assert.equal(library?.processing_video_count, 0);

  const log = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-26T00:02:03.000Z",
    limit: 10
  });
  const failedCommandEvent = log.events.find((event) =>
    event.action === "preprocess-worker-fail" && event.event_type === "succeeded"
  );

  assert.ok(failedCommandEvent);
  assert.equal(failedCommandEvent.area, "preprocess");
  assert.equal(failedCommandEvent.details.invalidates_source_video_read_model, true);
});

test("worker claim command skips command audit when no candidate exists", async () => {
  const libraryRoot = await makeLibraryRoot();
  await seedLibrary({
    library_root: libraryRoot,
    manifests: [],
    counts: counts(),
    now: "2026-06-26T00:03:00.000Z"
  });

  const job = await runAdminWorkerClaimCommand({
    library_root: libraryRoot,
    worker_id: "worker-a",
    now: "2026-06-26T00:03:01.000Z",
    refresh_library_counts: false
  }, { actor: systemActor });

  assert.equal(job, null);
  const log = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-26T00:03:02.000Z",
    limit: 10
  });
  assert.deepEqual(log.events, []);
});

test("worker claim command never claims ready videos under queued-only mvp claim policy", async () => {
  const libraryRoot = await makeLibraryRoot();
  await seedLibrary({
    library_root: libraryRoot,
    manifests: [
      sourceVideoManifest({
        source_video_id: "V000001",
        preprocess_status: "ready"
      }),
      sourceVideoManifest({
        source_video_id: "V000002",
        preprocess_status: "queued"
      })
    ],
    counts: counts({ video_count: 2, ready_video_count: 1, queued_video_count: 1 }),
    now: "2026-06-27T00:03:00.000Z"
  });

  const job = await runAdminWorkerClaimCommand({
    library_root: libraryRoot,
    worker_id: "worker-a",
    now: "2026-06-27T00:03:01.000Z",
    claim_statuses: ["queued"],
    refresh_library_counts: false
  }, { actor: systemActor });

  assert.equal(job?.source_video_id, "V000002");
  const ready = await readSourceVideoManifest(libraryRoot, "V000001");
  const queued = await readSourceVideoManifest(libraryRoot, "V000002");
  assert.equal(ready.preprocess_status, "ready");
  assert.equal(ready.visible_to_cutters, true);
  assert.equal(queued.preprocess_status, "processing");
  assert.equal(queued.visible_to_cutters, false);
});
