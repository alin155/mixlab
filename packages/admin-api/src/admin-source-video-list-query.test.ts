import assert from "node:assert/strict";
import test from "node:test";
import type { PreprocessStatus, SourceVideoManifest } from "../../protocol/src/index.ts";
import {
  listAdminSourceVideoManifests,
  type AdminSourceVideoFilteredListQueryReaderInput,
  type AdminSourceVideoListQueryReaderInput,
  type AdminSourceVideoStatusesListQueryReaderInput,
  type AdminSourceVideoStatusListQueryReaderInput
} from "./admin-source-video-list-query.ts";

function sourceVideoManifest(input: {
  source_video_id: string;
  preprocess_status: SourceVideoManifest["preprocess_status"];
  title?: string;
  relative_path?: string;
}): SourceVideoManifest {
  return {
    source_video_id: input.source_video_id,
    title: input.title ?? input.source_video_id,
    relative_path: input.relative_path ?? `课程/${input.source_video_id}.mp4`,
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

interface ReaderCalls {
  default_page: AdminSourceVideoListQueryReaderInput[];
  all: number;
  fresh_cached: number;
  indexed_ready: AdminSourceVideoListQueryReaderInput[];
  status_page: AdminSourceVideoStatusListQueryReaderInput[];
  statuses_page: AdminSourceVideoStatusesListQueryReaderInput[];
  filtered_page: AdminSourceVideoFilteredListQueryReaderInput[];
}

function makeReaders(input: {
  default_page?: SourceVideoManifest[];
  all?: SourceVideoManifest[];
  fresh_cached?: SourceVideoManifest[] | null;
  indexed_ready?: SourceVideoManifest[] | null;
  status_page?: SourceVideoManifest[];
  statuses_page?: SourceVideoManifest[];
  filtered_page?: SourceVideoManifest[];
} = {}) {
  const calls: ReaderCalls = {
    default_page: [],
    all: 0,
    fresh_cached: 0,
    indexed_ready: [],
    status_page: [],
    statuses_page: [],
    filtered_page: []
  };

  return {
    calls,
    readers: {
      filtered_query_scan_batch_limit: 8,
      async read_default_page(readerInput: AdminSourceVideoListQueryReaderInput) {
        calls.default_page.push(readerInput);
        return input.default_page ?? [];
      },
      async read_all_manifests() {
        calls.all += 1;
        return input.all ?? [];
      },
      read_fresh_cached_manifests() {
        calls.fresh_cached += 1;
        return input.fresh_cached ?? null;
      },
      async read_indexed_ready_page(readerInput: AdminSourceVideoListQueryReaderInput) {
        calls.indexed_ready.push(readerInput);
        return input.indexed_ready ?? null;
      },
      async read_status_page(readerInput: AdminSourceVideoStatusListQueryReaderInput) {
        calls.status_page.push(readerInput);
        return input.status_page ?? [];
      },
      async read_statuses_page(readerInput: AdminSourceVideoStatusesListQueryReaderInput) {
        calls.statuses_page.push(readerInput);
        return input.statuses_page ?? [];
      },
      async read_filtered_page(readerInput: AdminSourceVideoFilteredListQueryReaderInput) {
        calls.filtered_page.push(readerInput);
        return input.filtered_page ?? [];
      }
    }
  };
}

test("source-video list query uses default no-filter page before indexed fallback", async () => {
  const ready = sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "ready"
  });
  const { calls, readers } = makeReaders({
    default_page: [ready],
    indexed_ready: [sourceVideoManifest({
      source_video_id: "V000002",
      preprocess_status: "ready"
    })]
  });

  const result = await listAdminSourceVideoManifests({
    offset: 0,
    limit: 1,
    ...readers
  });

  assert.deepEqual(result.map((manifest) => manifest.source_video_id), ["V000001"]);
  assert.deepEqual(calls.default_page, [{ offset: 0, limit: 1 }]);
  assert.equal(calls.indexed_ready.length, 0);
  assert.equal(calls.all, 0);
});

test("source-video list query uses indexed ready fallback when default page is empty", async () => {
  const { calls, readers } = makeReaders({
    default_page: [],
    indexed_ready: [sourceVideoManifest({
      source_video_id: "V000002",
      preprocess_status: "ready"
    })]
  });

  const result = await listAdminSourceVideoManifests({
    offset: 3,
    limit: 2,
    ...readers
  });

  assert.deepEqual(result.map((manifest) => manifest.source_video_id), ["V000002"]);
  assert.deepEqual(calls.indexed_ready, [{ offset: 3, limit: 2, query: "" }]);
});

test("source-video list query filters a fresh manifest cache before fallback readers", async () => {
  const { calls, readers } = makeReaders({
    fresh_cached: [
      sourceVideoManifest({
        source_video_id: "V000001",
        preprocess_status: "ready",
        title: "现金流课程"
      }),
      sourceVideoManifest({
        source_video_id: "V000002",
        preprocess_status: "queued",
        title: "排队素材"
      }),
      sourceVideoManifest({
        source_video_id: "V000003",
        preprocess_status: "ready",
        title: "其他课程"
      })
    ],
    filtered_page: [sourceVideoManifest({
      source_video_id: "V999999",
      preprocess_status: "ready"
    })]
  });

  const result = await listAdminSourceVideoManifests({
    offset: 0,
    limit: 5,
    query: "现金流",
    status: "ready",
    ...readers
  });

  assert.deepEqual(result.map((manifest) => manifest.source_video_id), ["V000001"]);
  assert.equal(calls.fresh_cached, 1);
  assert.equal(calls.filtered_page.length, 0);
  assert.equal(calls.indexed_ready.length, 0);
});

test("source-video list query sends query-only searches through indexed ready then non-ready statuses", async () => {
  const { calls, readers } = makeReaders({
    indexed_ready: [
      sourceVideoManifest({
        source_video_id: "V000001",
        preprocess_status: "ready",
        title: "现金流 ready 1"
      })
    ],
    statuses_page: [sourceVideoManifest({
      source_video_id: "V000050",
      preprocess_status: "queued",
      title: "现金流 queued"
    })]
  });

  const firstPage = await listAdminSourceVideoManifests({
    offset: 0,
    limit: 1,
    query: "现金流",
    ...readers
  });
  assert.deepEqual(firstPage.map((manifest) => manifest.source_video_id), ["V000001"]);
  assert.equal(calls.statuses_page.length, 0);

  const secondPage = await listAdminSourceVideoManifests({
    offset: 1,
    limit: 1,
    query: "现金流",
    ...readers
  });
  assert.deepEqual(secondPage.map((manifest) => manifest.source_video_id), ["V000050"]);
  assert.deepEqual(calls.statuses_page[0]?.statuses, [
    "processing",
    "queued",
    "failed",
    "index-required",
    "unprocessed"
  ] satisfies PreprocessStatus[]);
  assert.equal(calls.statuses_page[0]?.offset, 0);
  assert.equal(calls.statuses_page[0]?.limit, 1);
});

test("source-video list query routes ready and non-ready status filters to their dedicated readers", async () => {
  const readyReaders = makeReaders({
    indexed_ready: [
      sourceVideoManifest({
        source_video_id: "V000001",
        preprocess_status: "ready"
      }),
      sourceVideoManifest({
        source_video_id: "V000002",
        preprocess_status: "queued"
      })
    ]
  });

  const ready = await listAdminSourceVideoManifests({
    offset: 0,
    limit: 10,
    status: "ready",
    ...readyReaders.readers
  });
  assert.deepEqual(ready.map((manifest) => manifest.source_video_id), ["V000001"]);
  assert.deepEqual(readyReaders.calls.indexed_ready, [{ offset: 0, limit: 10, query: "" }]);
  assert.equal(readyReaders.calls.status_page.length, 0);

  const queuedReaders = makeReaders({
    status_page: [sourceVideoManifest({
      source_video_id: "V000002",
      preprocess_status: "queued"
    })]
  });
  const queued = await listAdminSourceVideoManifests({
    offset: 4,
    limit: 3,
    status: "queued",
    query: "排队",
    ...queuedReaders.readers
  });
  assert.deepEqual(queued.map((manifest) => manifest.source_video_id), ["V000002"]);
  assert.deepEqual(queuedReaders.calls.status_page, [{
    status: "queued",
    offset: 4,
    limit: 3,
    query: "排队"
  }]);
});

test("source-video list query falls back to bounded filtered scan when indexed paths are unavailable", async () => {
  const { calls, readers } = makeReaders({
    indexed_ready: null,
    filtered_page: [sourceVideoManifest({
      source_video_id: "V000080",
      preprocess_status: "ready",
      title: "fallback"
    })]
  });

  const result = await listAdminSourceVideoManifests({
    offset: 2,
    limit: 5,
    query: "fallback",
    ...readers
  });

  assert.deepEqual(result.map((manifest) => manifest.source_video_id), ["V000080"]);
  assert.deepEqual(calls.filtered_page, [{
    offset: 2,
    limit: 5,
    query: "fallback",
    status: undefined,
    max_scan_batches: 8
  }]);
});
