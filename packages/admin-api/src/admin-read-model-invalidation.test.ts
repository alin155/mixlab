import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { LibraryCounts, SourceVideoManifest } from "../../protocol/src/index.ts";
import { readAdminOperationLog } from "./admin-operation-log.ts";
import {
  adminReadModelStoreInvalidationReason,
  markAdminReadModelStoreStaleForCommand
} from "./admin-read-model-invalidation.ts";
import {
  readAdminReadModelStoreStatus,
  writeAdminSourceVideoStatusReadModelStore
} from "./admin-read-model-store.ts";
import { buildAdminSourceVideoStatusReadModel } from "./admin-source-video-read-model.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-read-model-invalidation-"));
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
    updated_at: "2026-06-26T08:00:00.000Z",
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
      generated_at: "2026-06-26T08:00:01.000Z",
      default_page_limit: 20,
      manifests: [sourceVideoManifest()]
    })
  });
}

test("read-model invalidation reason maps only full-reconcile commands to store stale reasons", () => {
  assert.equal(adminReadModelStoreInvalidationReason("source-video-cover"), null);
  assert.equal(adminReadModelStoreInvalidationReason("source-video-metadata"), null);
  assert.equal(adminReadModelStoreInvalidationReason("source-folder-add"), "source-folder-scope-change");
  assert.equal(adminReadModelStoreInvalidationReason("settings-config"), "source-folder-scope-change");
  assert.equal(adminReadModelStoreInvalidationReason("library-scan"), "library-scan-or-init");
  assert.equal(adminReadModelStoreInvalidationReason("command-snapshot-restore"), "manual");
});

test("source-folder commands mark existing admin sqlite stale and append operation-log handoff", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = libraryCounts();
  await writeFreshStore({
    library_root: libraryRoot,
    library
  });

  const before = await readAdminReadModelStoreStatus({
    library_root: libraryRoot,
    library
  });
  assert.equal(before.freshness, "fresh");

  const handoff = await markAdminReadModelStoreStaleForCommand({
    library_root: libraryRoot,
    command: "source-folder-add",
    invalidated_at: "2026-06-26T08:02:00.000Z",
    read_library_manifest: async () => library
  });

  assert.ok(handoff);
  assert.equal(handoff.command, "source-folder-add");
  assert.equal(handoff.invalidation_reason, "source-folder-scope-change");
  assert.equal(handoff.stale_mark.applied, true);
  assert.equal(handoff.stale_mark.reason, "invalidated");
  assert.equal(handoff.reconciliation?.action, "rebuild");
  assert.equal(handoff.reconciliation?.reason, "stale_store");
  assert.equal(handoff.reconciliation?.scan_mode, "full-reconcile");
  assert.equal(handoff.reconciliation?.requires_background_reconcile, true);
  assert.equal(handoff.reconciliation?.safe_for_page_request, false);

  const after = await readAdminReadModelStoreStatus({
    library_root: libraryRoot,
    library
  });
  assert.equal(after.freshness, "stale");
  assert.equal(after.invalidated_at, "2026-06-26T08:02:00.000Z");
  assert.equal(after.invalidation_reason, "source-folder-scope-change");

  const log = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-26T08:03:00.000Z"
  });
  assert.equal(log.events.length, 1);
  assert.equal(log.events[0]?.area, "read-model");
  assert.equal(log.events[0]?.action, "read-model-invalidate");
  assert.equal(log.events[0]?.event_type, "succeeded");
  assert.equal(log.events[0]?.details.command, "source-folder-add");
  assert.equal(log.events[0]?.details.invalidation_reason, "source-folder-scope-change");
  assert.equal(log.events[0]?.details.stale_mark_applied, true);
});

test("missing admin sqlite returns skipped handoff and build reconcile plan without blocking command", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = libraryCounts();

  const handoff = await markAdminReadModelStoreStaleForCommand({
    library_root: libraryRoot,
    command: "library-scan",
    invalidated_at: "2026-06-26T08:04:00.000Z",
    read_library_manifest: async () => library
  });

  assert.ok(handoff);
  assert.equal(handoff.command, "library-scan");
  assert.equal(handoff.invalidation_reason, "library-scan-or-init");
  assert.equal(handoff.stale_mark.applied, false);
  assert.equal(handoff.stale_mark.reason, "missing");
  assert.equal(handoff.reconciliation?.action, "build");
  assert.equal(handoff.reconciliation?.reason, "missing_store");
  assert.equal(handoff.reconciliation?.scan_mode, "full-reconcile");
  assert.equal(handoff.reconciliation?.requires_background_reconcile, true);
  assert.equal(handoff.reconciliation?.safe_for_page_request, false);

  const log = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-26T08:05:00.000Z"
  });
  assert.equal(log.events.length, 1);
  assert.equal(log.events[0]?.event_type, "skipped");
  assert.equal(log.events[0]?.details.command, "library-scan");
  assert.equal(log.events[0]?.details.stale_mark_result, "missing");
});

test("commands that do not require full reconcile return no handoff and write no log", async () => {
  const libraryRoot = await makeLibraryRoot();

  const handoff = await markAdminReadModelStoreStaleForCommand({
    library_root: libraryRoot,
    command: "source-video-cover",
    invalidated_at: "2026-06-26T08:06:00.000Z"
  });

  assert.equal(handoff, null);

  const log = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-26T08:07:00.000Z"
  });
  assert.equal(log.events.length, 0);
});
