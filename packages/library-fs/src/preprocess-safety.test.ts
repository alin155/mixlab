import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertPreprocessSafeToStart,
  inspectPreprocessSafety
} from "./preprocess-safety.ts";
import type { SourceVideoManifest } from "../../protocol/src/index.ts";

async function makeRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-preprocess-safety-"));
}

function manifest(overrides: Partial<SourceVideoManifest>): SourceVideoManifest {
  return {
    source_video_id: "V000001",
    title: "测试视频",
    relative_path: "test.mp4",
    logical_uri: "library://source-video/V000001",
    duration_ms: 1000,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: "h264",
    file_size: 1024,
    content_hash: "pending:size:1024",
    preprocess_status: "queued",
    visible_to_cutters: false,
    transcript_path: "",
    srt_path: "",
    keyframes_path: "",
    cover_path: "",
    ...overrides
  };
}

async function writeManifest(root: string, item: SourceVideoManifest): Promise<void> {
  const target = path.join(
    root,
    ".mixlab-library",
    "videos",
    item.source_video_id,
    "source-video.json"
  );
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(item, null, 2)}\n`, "utf8");
}

test("preprocess safety allows an empty library below the disk block threshold", async () => {
  const root = await makeRoot();
  const safety = await inspectPreprocessSafety({
    library_root: root,
    now: "2026-06-25T00:00:00.000Z",
    disk_block_usage_percent: 100
  });

  assert.equal(safety.safe_to_start, true);
  assert.equal(safety.status === "healthy" || safety.status === "attention", true);
  assert.equal(safety.processing.checked, true);
  assert.equal(safety.processing.processing_count, 0);
  assert.deepEqual(safety.blockers, []);
});

test("preprocess safety blocks when disk usage reaches the configured threshold", async () => {
  const root = await makeRoot();
  const safety = await inspectPreprocessSafety({
    library_root: root,
    now: "2026-06-25T00:00:00.000Z",
    disk_block_usage_percent: 1
  });

  assert.equal(safety.safe_to_start, false);
  assert.equal(safety.status, "blocked");
  assert.equal(safety.blockers[0]?.code, "disk-space-blocked");
  assert.throws(() => assertPreprocessSafeToStart(safety), /磁盘空间不足/);
});

test("preprocess safety blocks existing processing tasks until they are recovered", async () => {
  const root = await makeRoot();
  await writeManifest(root, manifest({
    source_video_id: "V001440",
    preprocess_status: "processing"
  }));

  const safety = await inspectPreprocessSafety({
    library_root: root,
    now: "2026-06-25T00:00:00.000Z",
    disk_block_usage_percent: 100
  });

  assert.equal(safety.safe_to_start, false);
  assert.equal(safety.status, "blocked");
  assert.equal(safety.processing.processing_count, 1);
  assert.deepEqual(safety.processing.source_video_ids, ["V001440"]);
  assert.equal(safety.blockers[0]?.code, "processing-needs-recovery");
  assert.throws(() => assertPreprocessSafeToStart(safety), /V001440/);
});

test("preprocess safety can use a processing snapshot instead of scanning manifests", async () => {
  const root = await makeRoot();
  await writeManifest(root, manifest({
    source_video_id: "V001440",
    preprocess_status: "processing"
  }));

  const safety = await inspectPreprocessSafety({
    library_root: root,
    now: "2026-06-25T00:00:00.000Z",
    disk_block_usage_percent: 100,
    processing_source_video_ids: []
  });

  assert.equal(safety.safe_to_start, true);
  assert.equal(safety.processing.checked, true);
  assert.equal(safety.processing.processing_count, 0);
  assert.deepEqual(safety.processing.source_video_ids, []);
  assert.deepEqual(safety.blockers, []);
});

test("preprocess safety can run as a shallow disk-only health check", async () => {
  const root = await makeRoot();
  await writeManifest(root, manifest({
    source_video_id: "V001440",
    preprocess_status: "processing"
  }));

  const safety = await inspectPreprocessSafety({
    library_root: root,
    now: "2026-06-25T00:00:00.000Z",
    disk_block_usage_percent: 100,
    include_processing_guard: false
  });

  assert.equal(safety.safe_to_start, true);
  assert.equal(safety.processing.checked, false);
  assert.equal(safety.processing.processing_count, 0);
  assert.deepEqual(safety.blockers, []);
});
