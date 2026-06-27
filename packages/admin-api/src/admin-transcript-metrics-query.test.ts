import test from "node:test";
import assert from "node:assert/strict";
import type { SourceVideoManifest } from "../../protocol/src/index.ts";
import { getAdminTranscriptMetrics } from "./admin-transcript-metrics-query.ts";

function manifest(id: string): SourceVideoManifest {
  return {
    source_video_id: id,
    title: id,
    relative_path: `${id}.mp4`,
    logical_uri: `mixlab://source-video/${id}`,
    duration_ms: 1_000,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: "h264",
    file_size: 1024,
    content_hash: `${id}-hash`,
    preprocess_status: "ready",
    visible_to_cutters: true,
    transcript_path: "",
    srt_path: "",
    keyframes_path: "",
    cover_path: ""
  };
}

test("transcript metrics query summarizes transcript artifacts for small libraries", async () => {
  const manifests = [manifest("V000001"), manifest("V000002"), manifest("V000003")];
  const reads: string[] = [];

  const metrics = await getAdminTranscriptMetrics({
    library_root: "/tmp/library",
    manifests,
    full_transcript_metrics_max_manifests: 100,
    async read_current_index_metadata() {
      throw new Error("small libraries should not use index metadata");
    },
    async read_transcript_summary(_libraryRoot, item) {
      reads.push(item.source_video_id);
      if (item.source_video_id === "V000001") {
        return { full_text: "hello", character_count: 5, segment_count: 2 };
      }
      if (item.source_video_id === "V000002") {
        return { full_text: "", character_count: 0, segment_count: 0 };
      }
      return { full_text: "artifact text", character_count: 13, segment_count: 0 };
    }
  });

  assert.deepEqual(reads, ["V000001", "V000002", "V000003"]);
  assert.deepEqual(metrics, {
    transcript_video_count: 2,
    character_count: 18,
    segment_count: 2
  });
});

test("transcript metrics query uses current index metadata for large libraries", async () => {
  let transcriptReadCount = 0;

  const metrics = await getAdminTranscriptMetrics({
    library_root: "/tmp/library",
    manifests: [manifest("V000001"), manifest("V000002"), manifest("V000003")],
    full_transcript_metrics_max_manifests: 2,
    async read_current_index_metadata() {
      return {
        source_video_count: 10471,
        segment_count: 972776
      };
    },
    async read_transcript_summary() {
      transcriptReadCount += 1;
      throw new Error("large library should use current index metadata");
    }
  });

  assert.equal(transcriptReadCount, 0);
  assert.deepEqual(metrics, {
    transcript_video_count: 10471,
    character_count: 0,
    segment_count: 972776
  });
});

test("transcript metrics query falls back to transcript artifacts when large-library metadata is missing", async () => {
  const manifests = [manifest("V000001"), manifest("V000002"), manifest("V000003")];
  const reads: string[] = [];

  const metrics = await getAdminTranscriptMetrics({
    library_root: "/tmp/library",
    manifests,
    full_transcript_metrics_max_manifests: 2,
    async read_current_index_metadata() {
      return null;
    },
    async read_transcript_summary(_libraryRoot, item) {
      reads.push(item.source_video_id);
      return item.source_video_id === "V000002"
        ? { full_text: "", character_count: 0, segment_count: 0 }
        : { full_text: "", character_count: 10, segment_count: 1 };
    }
  });

  assert.deepEqual(reads, ["V000001", "V000002", "V000003"]);
  assert.deepEqual(metrics, {
    transcript_video_count: 2,
    character_count: 20,
    segment_count: 2
  });
});

test("transcript metrics query only uses metadata above the manifest threshold", async () => {
  let metadataReadCount = 0;

  await getAdminTranscriptMetrics({
    library_root: "/tmp/library",
    manifests: [manifest("V000001"), manifest("V000002")],
    full_transcript_metrics_max_manifests: 2,
    async read_current_index_metadata() {
      metadataReadCount += 1;
      return {
        source_video_count: 2,
        segment_count: 2
      };
    },
    async read_transcript_summary() {
      return { full_text: "ok", character_count: 2, segment_count: 1 };
    }
  });

  assert.equal(metadataReadCount, 0);
});
