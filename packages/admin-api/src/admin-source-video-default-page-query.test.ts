import assert from "node:assert/strict";
import test from "node:test";
import type { SourceVideoManifest } from "../../protocol/src/index.ts";
import {
  clearAdminSourceVideoDefaultPageCache,
  listAdminSourceVideoDefaultPage
} from "./admin-source-video-default-page-query.ts";

function sourceVideoManifest(input: {
  source_video_id: string;
  preprocess_status?: SourceVideoManifest["preprocess_status"];
  title?: string;
}): SourceVideoManifest {
  const status = input.preprocess_status ?? "ready";
  return {
    source_video_id: input.source_video_id,
    title: input.title ?? input.source_video_id,
    relative_path: `course/${input.source_video_id}.mp4`,
    logical_uri: `library://source-video/${input.source_video_id}`,
    duration_ms: 60_000,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: "h264",
    file_size: 1024,
    content_hash: `hash-${input.source_video_id}`,
    preprocess_status: status,
    visible_to_cutters: status === "ready",
    transcript_path: status === "ready" ? `artifacts/${input.source_video_id}/transcript.json` : "",
    srt_path: status === "ready" ? `artifacts/${input.source_video_id}/transcript.srt` : "",
    keyframes_path: status === "ready" ? `artifacts/${input.source_video_id}/keyframes.json` : "",
    cover_path: status === "ready" ? `artifacts/${input.source_video_id}/cover.jpg` : "",
    description: "",
    tags: [],
    lecturer: "",
    course: "",
    category: ""
  };
}

function makeReaders(input: {
  library_video_count?: number | null;
  default_page?: SourceVideoManifest[] | null;
  indexed_ids?: string[] | null;
  manifest_catalog?: SourceVideoManifest[];
  fallback_page?: SourceVideoManifest[];
} = {}) {
  const catalog = new Map((input.manifest_catalog ?? []).map((manifest) => [manifest.source_video_id, manifest]));
  const calls = {
    read_model: 0,
    library: 0,
    indexed: [] as string[][],
    by_ids: [] as string[][],
    fallback_page: [] as Array<{ library_root: string; offset: number; limit: number }>
  };

  return {
    calls,
    readers: {
      async read_status_read_model() {
        calls.read_model += 1;
        return input.default_page
          ? {
              default_source_video_page: {
                offset: 0,
                limit: input.default_page.length,
                manifests: input.default_page
              }
            }
          : null;
      },
      async read_library_manifest() {
        calls.library += 1;
        return typeof input.library_video_count === "number"
          ? { video_count: input.library_video_count }
          : null;
      },
      async read_indexed_manifest_map_by_ids(readerInput: {
        source_video_ids: string[];
      }) {
        calls.indexed.push(readerInput.source_video_ids);
        if (!input.indexed_ids) {
          return null;
        }

        return new Map(
          input.indexed_ids
            .map((sourceVideoId) => catalog.get(sourceVideoId))
            .filter((manifest): manifest is SourceVideoManifest => Boolean(manifest))
            .map((manifest) => [manifest.source_video_id, manifest])
        );
      },
      async read_manifests_by_ids(readerInput: {
        source_video_ids: string[];
      }) {
        calls.by_ids.push(readerInput.source_video_ids);
        return readerInput.source_video_ids
          .map((sourceVideoId) => catalog.get(sourceVideoId))
          .filter((manifest): manifest is SourceVideoManifest => Boolean(manifest));
      },
      async read_manifest_page(readerInput: {
        library_root: string;
        offset: number;
        limit: number;
      }) {
        calls.fallback_page.push(readerInput);
        return input.fallback_page ?? [];
      }
    }
  };
}

function baseInput(libraryRoot: string) {
  return {
    library_root: libraryRoot,
    offset: 0,
    limit: 2,
    route_default_limit: 20,
    page_scan_ahead: 0,
    manifest_read_concurrency: 2,
    cache_ttl_ms: 30_000,
    now_ms: () => 1_000
  };
}

test("default-page query uses read-model shortcut and caches the page", async () => {
  const libraryRoot = "library-read-model-shortcut";
  clearAdminSourceVideoDefaultPageCache(libraryRoot);
  const { calls, readers } = makeReaders({
    default_page: [
      sourceVideoManifest({ source_video_id: "V000001" }),
      sourceVideoManifest({ source_video_id: "V000002" })
    ]
  });

  const first = await listAdminSourceVideoDefaultPage({
    ...baseInput(libraryRoot),
    ...readers
  });
  const second = await listAdminSourceVideoDefaultPage({
    ...baseInput(libraryRoot),
    ...readers
  });

  assert.deepEqual(first.map((manifest) => manifest.source_video_id), ["V000001", "V000002"]);
  assert.deepEqual(second.map((manifest) => manifest.source_video_id), ["V000001", "V000002"]);
  assert.equal(calls.read_model, 1);
  assert.equal(calls.library, 0);
});

test("default-page query clears cached pages by library root", async () => {
  const libraryRoot = "library-cache-clear";
  clearAdminSourceVideoDefaultPageCache(libraryRoot);
  const pageOne = sourceVideoManifest({ source_video_id: "V000001" });
  const pageTwo = sourceVideoManifest({ source_video_id: "V000002" });
  const { readers } = makeReaders({
    fallback_page: [pageOne]
  });

  const first = await listAdminSourceVideoDefaultPage({
    ...baseInput(libraryRoot),
    ...readers
  });
  readers.read_manifest_page = async () => [pageTwo];
  const cached = await listAdminSourceVideoDefaultPage({
    ...baseInput(libraryRoot),
    ...readers
  });
  clearAdminSourceVideoDefaultPageCache(libraryRoot);
  const refreshed = await listAdminSourceVideoDefaultPage({
    ...baseInput(libraryRoot),
    ...readers
  });

  assert.deepEqual(first.map((manifest) => manifest.source_video_id), ["V000001"]);
  assert.deepEqual(cached.map((manifest) => manifest.source_video_id), ["V000001"]);
  assert.deepEqual(refreshed.map((manifest) => manifest.source_video_id), ["V000002"]);
});

test("default-page query mixes current-index and disk manifests from library counts", async () => {
  const libraryRoot = "library-index-mixed";
  clearAdminSourceVideoDefaultPageCache(libraryRoot);
  const { calls, readers } = makeReaders({
    library_video_count: 3,
    indexed_ids: ["V000001", "V000003"],
    manifest_catalog: [
      sourceVideoManifest({ source_video_id: "V000001" }),
      sourceVideoManifest({ source_video_id: "V000002", preprocess_status: "queued" }),
      sourceVideoManifest({ source_video_id: "V000003" })
    ]
  });

  const result = await listAdminSourceVideoDefaultPage({
    ...baseInput(libraryRoot),
    limit: 3,
    ...readers
  });

  assert.deepEqual(result.map((manifest) => manifest.source_video_id), ["V000001", "V000002", "V000003"]);
  assert.deepEqual(calls.indexed, [["V000001", "V000002", "V000003"]]);
  assert.deepEqual(calls.by_ids, [["V000002"]]);
  assert.equal(calls.fallback_page.length, 0);
});

test("default-page query uses manifest-only library count page when index is unavailable", async () => {
  const libraryRoot = "library-manifest-count";
  clearAdminSourceVideoDefaultPageCache(libraryRoot);
  const { calls, readers } = makeReaders({
    library_video_count: 3,
    indexed_ids: null,
    manifest_catalog: [
      sourceVideoManifest({ source_video_id: "V000001" }),
      sourceVideoManifest({ source_video_id: "V000002" }),
      sourceVideoManifest({ source_video_id: "V000003" })
    ]
  });

  const result = await listAdminSourceVideoDefaultPage({
    ...baseInput(libraryRoot),
    limit: 2,
    ...readers
  });

  assert.deepEqual(result.map((manifest) => manifest.source_video_id), ["V000001", "V000002"]);
  assert.deepEqual(calls.by_ids, [["V000001", "V000002"]]);
  assert.equal(calls.fallback_page.length, 0);
});

test("default-page query falls back to sorted-id manifest page when library counts are unavailable", async () => {
  const libraryRoot = "library-fallback-page";
  clearAdminSourceVideoDefaultPageCache(libraryRoot);
  const { calls, readers } = makeReaders({
    library_video_count: null,
    indexed_ids: null,
    fallback_page: [sourceVideoManifest({ source_video_id: "V000009" })]
  });

  const result = await listAdminSourceVideoDefaultPage({
    ...baseInput(libraryRoot),
    ...readers
  });

  assert.deepEqual(result.map((manifest) => manifest.source_video_id), ["V000009"]);
  assert.deepEqual(calls.fallback_page, [{ library_root: libraryRoot, offset: 0, limit: 2 }]);
});
