import assert from "node:assert/strict";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { LibraryCounts, SourceVideoManifest } from "../../protocol/src/index.ts";
import { adminReadModelStorePath } from "./admin-read-model-store.ts";
import {
  createAdminReadModelReconciler,
  type AdminReadModelReconcileControl
} from "./admin-read-model-reconciler.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-read-model-reconciler-"));
}

async function fileOrDirExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function nowSequence(): () => string {
  let tick = 0;

  return () => {
    tick += 1;
    return `2026-06-25T12:00:${String(tick).padStart(2, "0")}.000Z`;
  };
}

function libraryCounts(input: Partial<LibraryCounts> = {}): LibraryCounts {
  return {
    video_count: 1,
    ready_video_count: 1,
    processing_video_count: 0,
    queued_video_count: 0,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    ...input
  };
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
    transcript_path: input.preprocess_status === "ready"
      ? `artifacts/${input.source_video_id}/transcript.json`
      : "",
    srt_path: input.preprocess_status === "ready"
      ? `artifacts/${input.source_video_id}/transcript.srt`
      : "",
    keyframes_path: input.preprocess_status === "ready"
      ? `artifacts/${input.source_video_id}/keyframes.json`
      : "",
    cover_path: input.preprocess_status === "ready"
      ? `artifacts/${input.source_video_id}/cover.jpg`
      : "",
    description: "测试素材描述",
    tags: ["测试"],
    lecturer: "测试讲师",
    course: "测试课程",
    category: "测试分类"
  };
}

test("read model reconciler exposes progress and bounded audit events", async () => {
  const libraryRoot = await makeLibraryRoot();
  const manifest = sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "ready"
  });
  const reconciler = createAdminReadModelReconciler({
    library_root: libraryRoot,
    default_page_limit: 20,
    now: nowSequence(),
    read_snapshot: async (control) => {
      assert.equal(control.signal.aborted, false);
      control.update_progress({
        phase: "scanning",
        total_source_video_count: 1,
        message: "测试读取 manifest 快照。"
      });

      return {
        library: libraryCounts(),
        manifests: [manifest]
      };
    },
    run_command: (operation) => operation()
  });

  const started = reconciler.start();

  assert.equal(started.accepted, true);
  assert.equal(started.status.status, "running");
  assert.equal(["starting", "scanning", "writing"].includes(started.status.phase), true);

  for (let attempt = 0; attempt < 20 && reconciler.status().status === "running"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  const status = reconciler.status();

  assert.equal(status.status, "succeeded");
  assert.equal(status.phase, "completed");
  assert.equal(status.progress.percent, 100);
  assert.equal(status.progress.current_step, "completed");
  assert.equal(status.snapshot_video_count, 1);
  assert.equal(status.result?.applied, true);
  assert.equal(status.events[0].event_type, "started");
  assert.equal(status.events.at(-1)?.event_type, "succeeded");
  assert.equal(await fileOrDirExists(adminReadModelStorePath(libraryRoot)), true);
});

test("read model reconciler preserves preprocess job snapshot progress", async () => {
  const libraryRoot = await makeLibraryRoot();
  const manifests = [
    sourceVideoManifest({
      source_video_id: "V000001",
      preprocess_status: "queued"
    }),
    sourceVideoManifest({
      source_video_id: "V000002",
      preprocess_status: "ready"
    })
  ];
  const reconciler = createAdminReadModelReconciler({
    library_root: libraryRoot,
    default_page_limit: 20,
    now: nowSequence(),
    read_snapshot: async (control) => {
      control.update_progress({
        phase: "scanning",
        step: "preprocess-job-snapshots",
        scanned_source_video_count: 2,
        total_source_video_count: 2,
        preprocess_job_snapshot_count: 0,
        total_preprocess_job_snapshot_count: 2,
        message: "正在读取 0/2 条 preprocess job 快照。"
      });
      control.update_progress({
        phase: "scanning",
        step: "preprocess-job-snapshots",
        scanned_source_video_count: 2,
        total_source_video_count: 2,
        preprocess_job_snapshot_count: 2,
        total_preprocess_job_snapshot_count: 2,
        message: "已读取 2/2 条 preprocess job 快照。"
      });

      return {
        library: libraryCounts({ video_count: 2, ready_video_count: 1, queued_video_count: 1 }),
        manifests,
        preprocess_jobs: [
          {
            source_video_id: "V000001",
            claimed_at: "2026-06-25T12:00:00.000Z",
            completed_at: "",
            indexed_at: "",
            failed_at: ""
          },
          {
            source_video_id: "V000002",
            claimed_at: "",
            completed_at: "2026-06-25T12:01:00.000Z",
            indexed_at: "2026-06-25T12:02:00.000Z",
            failed_at: ""
          }
        ]
      };
    },
    run_command: (operation) => operation()
  });

  const started = reconciler.start();

  assert.equal(started.accepted, true);

  for (let attempt = 0; attempt < 20 && reconciler.status().status === "running"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  const status = reconciler.status();
  const jobProgressEvents = status.events.filter((event) =>
    event.current_step === "preprocess-job-snapshots"
  );

  assert.equal(status.status, "succeeded");
  assert.equal(status.progress.current_step, "completed");
  assert.equal(status.progress.preprocess_job_snapshot_count, 2);
  assert.equal(status.progress.total_preprocess_job_snapshot_count, 2);
  assert.equal(jobProgressEvents.some((event) =>
    event.preprocess_job_snapshot_count === 0
      && event.total_preprocess_job_snapshot_count === 2
      && event.step_percent === 0
  ), true);
  assert.equal(jobProgressEvents.some((event) =>
    event.preprocess_job_snapshot_count === 2
      && event.total_preprocess_job_snapshot_count === 2
      && event.step_percent === 100
  ), true);
});

test("read model reconciler cancel stops before sqlite write at safe checkpoint", async () => {
  const libraryRoot = await makeLibraryRoot();
  let releaseSnapshot!: () => void;
  let enteredSnapshot!: () => void;
  const enteredSnapshotPromise = new Promise<void>((resolve) => {
    enteredSnapshot = resolve;
  });
  const releaseSnapshotPromise = new Promise<void>((resolve) => {
    releaseSnapshot = resolve;
  });
  const manifest = sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "ready"
  });
  const reconciler = createAdminReadModelReconciler({
    library_root: libraryRoot,
    default_page_limit: 20,
    now: nowSequence(),
    read_snapshot: async (control: AdminReadModelReconcileControl) => {
      control.update_progress({
        phase: "scanning",
        total_source_video_count: 1,
        message: "测试等待取消。"
      });
      enteredSnapshot();
      await releaseSnapshotPromise;
      control.assert_not_cancelled();

      return {
        library: libraryCounts(),
        manifests: [manifest]
      };
    },
    run_command: (operation) => operation()
  });

  const started = reconciler.start();

  assert.equal(started.accepted, true);
  await enteredSnapshotPromise;
  const cancel = reconciler.cancel();
  releaseSnapshot();

  assert.equal(cancel.accepted, true);
  assert.equal(cancel.status.cancel_requested, true);

  for (let attempt = 0; attempt < 20 && reconciler.status().status === "running"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  const status = reconciler.status();

  assert.equal(status.status, "cancelled");
  assert.equal(status.phase, "cancelled");
  assert.equal(status.cancel_requested, true);
  assert.equal(status.result, null);
  assert.equal(status.events.at(-1)?.event_type, "cancelled");
  assert.equal(await fileOrDirExists(adminReadModelStorePath(libraryRoot)), false);
});
