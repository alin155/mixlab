import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { writeSourceTranscriptSqliteIndex } from "../../search-sqlite/src/index.ts";
import {
  readIndexedAdminSourceVideoIdSet,
  readIndexedAdminSourceVideoManifestMapByIds,
  readIndexedAdminSourceVideoManifests
} from "./admin-source-video-index-query.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-source-video-index-query-"));
}

function indexRoot(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library", "indexes", "source-transcript-index");
}

function queryContext(libraryRoot: string, currentVersion: string) {
  return {
    library_root: libraryRoot,
    read_current_index_version: async () => currentVersion,
    index_root_from_library_root: indexRoot
  };
}

function video(input: {
  source_video_id: string;
  title: string;
  relative_path?: string;
  cover_path?: string;
  duration_ms?: number;
}) {
  return {
    source_video_id: input.source_video_id,
    title: input.title,
    duration_ms: input.duration_ms ?? 60_000,
    relative_path: input.relative_path ?? `source-videos/${input.source_video_id}.mp4`,
    cover_path: input.cover_path ?? `.mixlab-library/videos/${input.source_video_id}/cover.jpg`,
    segments: []
  };
}

async function writeCurrentIndex(input: {
  library_root: string;
  index_version?: string;
  videos?: Array<ReturnType<typeof video>>;
}): Promise<string> {
  const indexVersion = input.index_version ?? "v000001";
  await writeSourceTranscriptSqliteIndex({
    index_file_path: path.join(indexRoot(input.library_root), indexVersion, "index.sqlite"),
    library_id: "lib_main_001",
    index_version: indexVersion,
    created_at: "2026-05-02T10:00:00.000Z",
    videos: input.videos ?? []
  });
  return indexVersion;
}

test("source-video index query reads a current-index ready page", async () => {
  const libraryRoot = await makeLibraryRoot();
  const indexVersion = await writeCurrentIndex({
    library_root: libraryRoot,
    videos: [
      video({ source_video_id: "V000001", title: "第一课" }),
      video({ source_video_id: "V000002", title: "第二课" }),
      video({ source_video_id: "V000003", title: "第三课" })
    ]
  });

  const manifests = await readIndexedAdminSourceVideoManifests({
    ...queryContext(libraryRoot, indexVersion),
    offset: 1,
    limit: 2
  });

  assert.deepEqual(manifests?.map((manifest) => manifest.source_video_id), ["V000002", "V000003"]);
  assert.equal(manifests?.[0]?.preprocess_status, "ready");
  assert.equal(manifests?.[0]?.visible_to_cutters, true);
});

test("source-video index query escapes SQLite LIKE wildcards", async () => {
  const libraryRoot = await makeLibraryRoot();
  const indexVersion = await writeCurrentIndex({
    library_root: libraryRoot,
    videos: [
      video({ source_video_id: "V000001", title: "增长 100% 课程" }),
      video({ source_video_id: "V000002", title: "增长 100x 课程" }),
      video({ source_video_id: "V000003", title: "组织增长", relative_path: "团队_增长.mp4" })
    ]
  });

  const percentResult = await readIndexedAdminSourceVideoManifests({
    ...queryContext(libraryRoot, indexVersion),
    offset: 0,
    limit: 10,
    query: "100%"
  });
  const underscoreResult = await readIndexedAdminSourceVideoManifests({
    ...queryContext(libraryRoot, indexVersion),
    offset: 0,
    limit: 10,
    query: "团队_"
  });

  assert.deepEqual(percentResult?.map((manifest) => manifest.source_video_id), ["V000001"]);
  assert.deepEqual(underscoreResult?.map((manifest) => manifest.source_video_id), ["V000003"]);
});

test("source-video index query reads a by-id manifest map", async () => {
  const libraryRoot = await makeLibraryRoot();
  const indexVersion = await writeCurrentIndex({
    library_root: libraryRoot,
    videos: [
      video({ source_video_id: "V000001", title: "第一课" }),
      video({ source_video_id: "V000002", title: "第二课" }),
      video({ source_video_id: "V000003", title: "第三课" })
    ]
  });

  const manifestMap = await readIndexedAdminSourceVideoManifestMapByIds({
    ...queryContext(libraryRoot, indexVersion),
    source_video_ids: ["V000003", "V999999", "V000001"]
  });

  assert.deepEqual([...manifestMap?.keys() ?? []], ["V000001", "V000003"]);
  assert.equal(manifestMap?.get("V000003")?.title, "第三课");
  assert.equal(manifestMap?.has("V999999"), false);
});

test("source-video index query reads indexed ready ids", async () => {
  const libraryRoot = await makeLibraryRoot();
  const indexVersion = await writeCurrentIndex({
    library_root: libraryRoot,
    videos: [
      video({ source_video_id: "V000001", title: "第一课" }),
      video({ source_video_id: "V000002", title: "第二课" })
    ]
  });

  const ids = await readIndexedAdminSourceVideoIdSet(queryContext(libraryRoot, indexVersion));

  assert.deepEqual([...ids ?? []], ["V000001", "V000002"]);
});

test("source-video index query returns null when current index is unavailable", async () => {
  const libraryRoot = await makeLibraryRoot();

  assert.equal(await readIndexedAdminSourceVideoManifests({
    ...queryContext(libraryRoot, ""),
    offset: 0,
    limit: 10
  }), null);
  assert.equal(await readIndexedAdminSourceVideoIdSet(queryContext(libraryRoot, "v404")), null);
  assert.equal(await readIndexedAdminSourceVideoManifestMapByIds({
    ...queryContext(libraryRoot, "v404"),
    source_video_ids: ["V000001"]
  }), null);
});
