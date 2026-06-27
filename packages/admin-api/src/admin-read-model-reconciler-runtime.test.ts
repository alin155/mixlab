import assert from "node:assert/strict";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { LibraryCounts, SourceVideoManifest } from "../../protocol/src/index.ts";
import type {
  AdminOperationLogAppendInput,
  AdminOperationLogEvent
} from "./admin-operation-log.ts";
import { adminReadModelStorePath } from "./admin-read-model-store.ts";
import {
  createAdminReadModelReconcilerRuntime
} from "./admin-read-model-reconciler-runtime.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-read-model-reconciler-runtime-"));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
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
    return `2026-06-26T22:30:${String(tick).padStart(2, "0")}.000Z`;
  };
}

function libraryCounts(input: Partial<LibraryCounts> = {}): LibraryCounts {
  return {
    video_count: 2,
    ready_video_count: 1,
    processing_video_count: 0,
    queued_video_count: 1,
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
      : ""
  };
}

test("read-model reconciler runtime assembles snapshot reads command guard and audit events", async () => {
  const libraryRoot = await makeLibraryRoot();
  const appendedEvents: AdminOperationLogAppendInput[] = [];
  const clearedLibraries: string[] = [];
  const jobReads: string[] = [];
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
  const reconciler = createAdminReadModelReconcilerRuntime({
    library_root: libraryRoot,
    default_page_limit: 20,
    now: nowSequence(),
    deps: {
      clear_source_video_page_cache(libraryRootToClear) {
        clearedLibraries.push(libraryRootToClear);
      },
      async read_library_manifest() {
        return libraryCounts();
      },
      async read_all_source_video_manifests() {
        return manifests;
      },
      async read_preprocess_job(_libraryRoot, sourceVideoId) {
        jobReads.push(sourceVideoId);
        return {
          claimed_at: sourceVideoId === "V000001" ? "2026-06-26T22:00:00.000Z" : "",
          completed_at: sourceVideoId === "V000002" ? "2026-06-26T22:10:00.000Z" : "",
          indexed_at: sourceVideoId === "V000002" ? "2026-06-26T22:11:00.000Z" : "",
          failed_at: ""
        };
      },
      async append_operation_log_event(input) {
        appendedEvents.push(input);
        return {
          schema_version: "1.0",
          event_id: `evt-${appendedEvents.length}`,
          occurred_at: input.occurred_at,
          area: input.area,
          action: input.action,
          event_type: input.event_type,
          message: input.message,
          details: input.details ?? {}
        } satisfies AdminOperationLogEvent;
      }
    }
  });

  const started = reconciler.start();

  assert.equal(started.accepted, true);

  for (let attempt = 0; attempt < 20 && reconciler.status().status === "running"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  const status = reconciler.status();

  assert.equal(status.status, "succeeded");
  assert.equal(status.progress.percent, 100);
  assert.equal(status.snapshot_video_count, 2);
  assert.equal(await fileExists(adminReadModelStorePath(libraryRoot)), true);
  assert.deepEqual(clearedLibraries, [libraryRoot]);
  assert.deepEqual(jobReads, ["V000001", "V000002"]);
  assert.equal(
    appendedEvents.some((event) =>
      event.area === "read-model" &&
      event.action === "read-model-reconcile" &&
      event.event_type === "started" &&
      event.details?.actor
    ),
    true
  );
  assert.equal(
    appendedEvents.some((event) =>
      event.area === "read-model" &&
      event.action === "read-model-reconcile" &&
      event.event_type === "succeeded" &&
      event.details?.phase === "completed"
    ),
    true
  );
});
