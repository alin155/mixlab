import assert from "node:assert/strict";
import test from "node:test";
import type { LibraryCounts, PreprocessStatus, SourceVideoManifest } from "../../protocol/src/index.ts";
import { listAdminSourceVideoFilteredPage } from "./admin-source-video-filtered-page-query.ts";

function sourceVideoManifest(input: {
  source_video_id: string;
  preprocess_status: PreprocessStatus;
  title?: string;
  relative_path?: string;
}): SourceVideoManifest {
  return {
    source_video_id: input.source_video_id,
    title: input.title ?? input.source_video_id,
    relative_path: input.relative_path ?? `course/${input.source_video_id}.mp4`,
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
    transcript_path: input.preprocess_status === "ready" ? `artifacts/${input.source_video_id}/transcript.json` : "",
    srt_path: input.preprocess_status === "ready" ? `artifacts/${input.source_video_id}/transcript.srt` : "",
    keyframes_path: input.preprocess_status === "ready" ? `artifacts/${input.source_video_id}/keyframes.json` : "",
    cover_path: input.preprocess_status === "ready" ? `artifacts/${input.source_video_id}/cover.jpg` : "",
    description: "",
    tags: [],
    lecturer: "",
    course: "",
    category: ""
  };
}

function makeLibraryCounts(overrides: Partial<LibraryCounts> = {}): LibraryCounts {
  return {
    video_count: 0,
    ready_video_count: 0,
    queued_video_count: 0,
    processing_video_count: 0,
    failed_video_count: 0,
    unprocessed_video_count: 0,
    index_required_video_count: 0,
    ...overrides
  };
}

function makeReaders(input: {
  all_manifests?: SourceVideoManifest[];
  library?: LibraryCounts | null;
  sorted_ids?: string[];
  indexed_ready_ids?: string[] | null;
  manifest_catalog?: SourceVideoManifest[];
} = {}) {
  const catalog = new Map((input.manifest_catalog ?? input.all_manifests ?? []).map((manifest) => [
    manifest.source_video_id,
    manifest
  ]));
  const calls = {
    all: 0,
    library: 0,
    sorted_ids: 0,
    indexed_ready_ids: 0,
    by_ids: [] as string[][]
  };

  return {
    calls,
    readers: {
      async read_all_manifests() {
        calls.all += 1;
        return input.all_manifests ?? [];
      },
      async read_library_manifest() {
        calls.library += 1;
        return input.library ?? null;
      },
      async read_sorted_source_video_ids() {
        calls.sorted_ids += 1;
        return input.sorted_ids ?? [];
      },
      async read_indexed_ready_id_set() {
        calls.indexed_ready_ids += 1;
        return input.indexed_ready_ids
          ? new Set(input.indexed_ready_ids)
          : null;
      },
      async read_manifests_by_ids(readerInput: {
        source_video_ids: string[];
      }) {
        calls.by_ids.push(readerInput.source_video_ids);
        return readerInput.source_video_ids
          .map((sourceVideoId) => catalog.get(sourceVideoId))
          .filter((manifest): manifest is SourceVideoManifest => Boolean(manifest));
      }
    }
  };
}

function baseInput() {
  return {
    library_root: "library-filtered",
    offset: 0,
    limit: 2,
    filtered_scan_batch_size: 2
  };
}

test("filtered-page query uses all manifests for unlimited filtered requests", async () => {
  const { calls, readers } = makeReaders({
    all_manifests: [
      sourceVideoManifest({ source_video_id: "V000001", preprocess_status: "ready", title: "现金流 ready" }),
      sourceVideoManifest({ source_video_id: "V000002", preprocess_status: "queued", title: "现金流 queued" }),
      sourceVideoManifest({ source_video_id: "V000003", preprocess_status: "queued", title: "组织课" })
    ]
  });

  const result = await listAdminSourceVideoFilteredPage({
    ...baseInput(),
    limit: 0,
    query: "现金流",
    status: "queued",
    ...readers
  });

  assert.deepEqual(result.map((manifest) => manifest.source_video_id), ["V000002"]);
  assert.equal(calls.all, 1);
  assert.equal(calls.sorted_ids, 0);
});

test("filtered-page query exits early when status count is before the requested offset", async () => {
  const { calls, readers } = makeReaders({
    library: makeLibraryCounts({
      video_count: 4,
      queued_video_count: 1
    }),
    sorted_ids: ["V000001", "V000002", "V000003", "V000004"]
  });

  const result = await listAdminSourceVideoFilteredPage({
    ...baseInput(),
    offset: 3,
    status: "queued",
    ...readers
  });

  assert.deepEqual(result, []);
  assert.equal(calls.library, 1);
  assert.equal(calls.sorted_ids, 0);
  assert.equal(calls.by_ids.length, 0);
});

test("filtered-page query excludes indexed ready ids before scanning non-ready manifests", async () => {
  const { calls, readers } = makeReaders({
    sorted_ids: ["V000001", "V000002", "V000003"],
    indexed_ready_ids: ["V000001"],
    manifest_catalog: [
      sourceVideoManifest({ source_video_id: "V000001", preprocess_status: "ready" }),
      sourceVideoManifest({ source_video_id: "V000002", preprocess_status: "queued" }),
      sourceVideoManifest({ source_video_id: "V000003", preprocess_status: "failed" })
    ]
  });

  const result = await listAdminSourceVideoFilteredPage({
    ...baseInput(),
    exclude_indexed_ready: true,
    ...readers
  });

  assert.deepEqual(result.map((manifest) => manifest.source_video_id), ["V000002", "V000003"]);
  assert.equal(calls.indexed_ready_ids, 1);
  assert.deepEqual(calls.by_ids, [["V000002", "V000003"]]);
});

test("filtered-page query respects max scan batches", async () => {
  const { calls, readers } = makeReaders({
    sorted_ids: ["V000001", "V000002", "V000003", "V000004", "V000005"],
    manifest_catalog: [
      sourceVideoManifest({ source_video_id: "V000001", preprocess_status: "ready" }),
      sourceVideoManifest({ source_video_id: "V000002", preprocess_status: "ready" }),
      sourceVideoManifest({ source_video_id: "V000003", preprocess_status: "ready" }),
      sourceVideoManifest({ source_video_id: "V000004", preprocess_status: "ready" }),
      sourceVideoManifest({ source_video_id: "V000005", preprocess_status: "ready" })
    ]
  });

  const result = await listAdminSourceVideoFilteredPage({
    ...baseInput(),
    limit: 5,
    max_scan_batches: 1,
    ...readers
  });

  assert.deepEqual(result.map((manifest) => manifest.source_video_id), ["V000001", "V000002"]);
  assert.deepEqual(calls.by_ids, [["V000001", "V000002"]]);
});

test("filtered-page query stops query scanning after the requested page has a match", async () => {
  const { calls, readers } = makeReaders({
    sorted_ids: ["V000001", "V000002", "V000003", "V000004"],
    manifest_catalog: [
      sourceVideoManifest({ source_video_id: "V000001", preprocess_status: "ready", title: "普通课" }),
      sourceVideoManifest({ source_video_id: "V000002", preprocess_status: "ready", title: "现金流课" }),
      sourceVideoManifest({ source_video_id: "V000003", preprocess_status: "ready", title: "现金流课 2" }),
      sourceVideoManifest({ source_video_id: "V000004", preprocess_status: "ready", title: "现金流课 3" })
    ]
  });

  const result = await listAdminSourceVideoFilteredPage({
    ...baseInput(),
    limit: 1,
    query: "现金流",
    ...readers
  });

  assert.deepEqual(result.map((manifest) => manifest.source_video_id), ["V000002"]);
  assert.deepEqual(calls.by_ids, [["V000001", "V000002"]]);
});

test("filtered-page query uses status counts to avoid extra scan batches", async () => {
  const { calls, readers } = makeReaders({
    library: makeLibraryCounts({
      video_count: 5,
      queued_video_count: 2
    }),
    sorted_ids: ["V000001", "V000002", "V000003", "V000004", "V000005"],
    manifest_catalog: [
      sourceVideoManifest({ source_video_id: "V000001", preprocess_status: "queued" }),
      sourceVideoManifest({ source_video_id: "V000002", preprocess_status: "ready" }),
      sourceVideoManifest({ source_video_id: "V000003", preprocess_status: "queued" }),
      sourceVideoManifest({ source_video_id: "V000004", preprocess_status: "queued" }),
      sourceVideoManifest({ source_video_id: "V000005", preprocess_status: "queued" })
    ]
  });

  const result = await listAdminSourceVideoFilteredPage({
    ...baseInput(),
    limit: 4,
    status: "queued",
    ...readers
  });

  assert.deepEqual(result.map((manifest) => manifest.source_video_id), ["V000001", "V000003", "V000004"]);
  assert.deepEqual(calls.by_ids, [["V000001", "V000002"], ["V000003", "V000004"]]);
});
