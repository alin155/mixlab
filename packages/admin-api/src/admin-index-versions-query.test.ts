import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { writeSourceTranscriptSqliteIndex } from "../../search-sqlite/src/index.ts";
import {
  clearAdminIndexVersionCache,
  listAdminIndexVersions,
  listAdminIndexVersionsWithRuntimeMeta
} from "./admin-index-versions-query.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-index-versions-"));
}

function indexRoot(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library", "indexes", "source-transcript-index");
}

async function writeIndexPackage(input: {
  library_root: string;
  index_version: string;
  ready_video_count?: number;
  source_video_ids?: string[];
  schema_version?: string;
  sqlite_video_count?: number;
}): Promise<void> {
  const root = indexRoot(input.library_root);
  const versionRoot = path.join(root, input.index_version);
  const sourceVideoIds = input.source_video_ids ?? [];
  await mkdir(versionRoot, { recursive: true });
  await writeFile(
    path.join(versionRoot, "index-manifest.json"),
    `${JSON.stringify({
      index_version: input.index_version,
      library_id: "lib_main_001",
      created_at: "2026-05-02T10:00:00.000Z",
      ready_video_count: input.ready_video_count ?? sourceVideoIds.length,
      source_video_ids: sourceVideoIds,
      schema_version: input.schema_version ?? "1.0"
    }, null, 2)}\n`,
    "utf8"
  );

  if (typeof input.sqlite_video_count === "number") {
    await writeSourceTranscriptSqliteIndex({
      index_file_path: path.join(versionRoot, "index.sqlite"),
      library_id: "lib_main_001",
      index_version: input.index_version,
      created_at: "2026-05-02T10:00:00.000Z",
      videos: Array.from({ length: input.sqlite_video_count }, (_, index) => ({
        source_video_id: `V${String(index + 1).padStart(6, "0")}`,
        title: `视频 ${index + 1}`,
        duration_ms: 1_000,
        relative_path: `video-${index + 1}.mp4`,
        cover_path: "",
        segments: []
      }))
    });
  }
}

async function writeCurrentPointer(libraryRoot: string, currentVersion: string): Promise<void> {
  await mkdir(indexRoot(libraryRoot), { recursive: true });
  await writeFile(
    path.join(indexRoot(libraryRoot), "current.json"),
    `${JSON.stringify({
      library_id: "lib_main_001",
      current_version: currentVersion,
      updated_at: "2026-05-02T10:06:00.000Z"
    }, null, 2)}\n`,
    "utf8"
  );
}

test("admin index versions query exposes pointer and package validation details", async () => {
  const libraryRoot = await makeLibraryRoot();
  await writeIndexPackage({
    library_root: libraryRoot,
    index_version: "v000001",
    ready_video_count: 2,
    source_video_ids: ["V000001"],
    schema_version: ""
  });
  await writeIndexPackage({
    library_root: libraryRoot,
    index_version: "v000002",
    source_video_ids: [],
    sqlite_video_count: 0
  });
  await writeCurrentPointer(libraryRoot, "v000003");

  const response = await listAdminIndexVersions(libraryRoot);

  assert.equal(response.current_version, "v000003");
  assert.equal(response.current_validation_status, "fail");
  assert.match(response.current_validation_message, /current\.json 指向不存在的索引版本/);

  const broken = response.versions.find((version) => version.index_version === "v000001");
  assert(broken);
  assert.equal(broken.validation_status, "fail");
  assert.match(broken.validation_message, /ready_video_count 与 source_video_ids 数量不一致/);
  assert.match(broken.validation_message, /schema_version 缺失/);
  assert.match(broken.validation_message, /index\.sqlite 不存在/);

  const valid = response.versions.find((version) => version.index_version === "v000002");
  assert(valid);
  assert.equal(valid.validation_status, "pass");
  assert.equal(valid.validation_message, "索引包校验通过");
});

test("admin index versions query defaults to recent packages while keeping current visible", async () => {
  const libraryRoot = await makeLibraryRoot();

  for (let index = 1; index <= 85; index += 1) {
    await writeIndexPackage({
      library_root: libraryRoot,
      index_version: `v${String(index).padStart(6, "0")}`,
      source_video_ids: []
    });
  }
  await writeCurrentPointer(libraryRoot, "v000001");

  const response = await listAdminIndexVersions(libraryRoot);

  assert.equal(response.total_count, 85);
  assert.equal(response.limit, 8);
  assert.equal(response.has_more, true);
  assert.equal(response.versions.length, 9);
  assert(response.versions.some((version) => version.index_version === "v000085"));
  assert.equal(
    response.versions.find((version) => version.index_version === "v000001")?.is_current,
    true
  );
});

test("admin index versions query uses current-pointer fast path for large index history", async () => {
  const libraryRoot = await makeLibraryRoot();

  for (let ordinal = 1_440; ordinal >= 1_433; ordinal -= 1) {
    await writeIndexPackage({
      library_root: libraryRoot,
      index_version: `v${String(ordinal).padStart(6, "0")}`,
      source_video_ids: []
    });
  }
  await writeCurrentPointer(libraryRoot, "v001440");

  const response = await listAdminIndexVersions(libraryRoot);

  assert.equal(response.current_validation_status, "pass");
  assert.equal(response.total_count, 1_440);
  assert.equal(response.returned_count, 8);
  assert.equal(response.has_more, true);
  assert.deepEqual(
    response.versions.map((version) => version.index_version),
    ["v001440", "v001439", "v001438", "v001437", "v001436", "v001435", "v001434", "v001433"]
  );
});

test("admin index versions query reports directory-page runtime metadata and cache hits", async () => {
  const libraryRoot = await makeLibraryRoot();
  await writeIndexPackage({
    library_root: libraryRoot,
    index_version: "v000001",
    source_video_ids: [],
    sqlite_video_count: 0
  });
  await writeCurrentPointer(libraryRoot, "v000001");

  const first = await listAdminIndexVersionsWithRuntimeMeta(libraryRoot);
  const second = await listAdminIndexVersionsWithRuntimeMeta(libraryRoot);

  assert.equal(first.runtime.actual_data_source, "index-version-packages");
  assert.equal(first.runtime.cache_status, "miss");
  assert.equal(first.runtime.query_strategy, "directory-page");
  assert.deepEqual(first.runtime.component_timings?.map((component) => component.name), [
    "current_pointer_fast_page",
    "directory_listing",
    "current_pointer_validation",
    "index_package_validation"
  ]);
  assert.equal(first.runtime.component_timings?.[0]?.cache_status, "miss");
  assert.equal(first.runtime.component_timings?.[1]?.data_source, "index-version-packages");
  assert.equal(first.runtime.component_timings?.[2]?.data_source, "current-index");
  assert.equal(first.runtime.component_timings?.[3]?.scan_mode, "paged-list");
  assert.equal(second.runtime.actual_data_source, "index-version-packages");
  assert.equal(second.runtime.cache_status, "hit");
  assert.equal(second.runtime.query_strategy, "cache-hit");
  assert.deepEqual(second.runtime.component_timings?.map((component) => component.name), ["cache_lookup"]);
  assert.equal(second.runtime.component_timings?.[0]?.scan_mode, "no-scan");
  assert.equal(second.response.current_version, "v000001");
});

test("admin index versions query preserves current-index source on cached fast-path pages", async () => {
  const libraryRoot = await makeLibraryRoot();

  for (let ordinal = 1_440; ordinal >= 1_433; ordinal -= 1) {
    await writeIndexPackage({
      library_root: libraryRoot,
      index_version: `v${String(ordinal).padStart(6, "0")}`,
      source_video_ids: []
    });
  }
  await writeCurrentPointer(libraryRoot, "v001440");

  const first = await listAdminIndexVersionsWithRuntimeMeta(libraryRoot);
  const second = await listAdminIndexVersionsWithRuntimeMeta(libraryRoot);

  assert.equal(first.runtime.actual_data_source, "current-index");
  assert.equal(first.runtime.cache_status, "miss");
  assert.equal(first.runtime.query_strategy, "current-pointer-fast-page");
  assert.deepEqual(first.runtime.component_timings?.map((component) => component.name), [
    "current_pointer_fast_page",
    "index_package_validation"
  ]);
  assert.equal(first.runtime.component_timings?.[0]?.cache_status, "hit");
  assert.match(first.runtime.component_timings?.[0]?.detail ?? "", /result=hit/);
  assert.equal(second.runtime.actual_data_source, "current-index");
  assert.equal(second.runtime.cache_status, "hit");
  assert.equal(second.runtime.query_strategy, "cache-hit");
  assert.deepEqual(second.runtime.component_timings?.map((component) => component.name), ["cache_lookup"]);
  assert.equal(second.response.total_count, 1_440);
});

test("admin index versions query reuses cache and clears it on invalidation", async () => {
  const libraryRoot = await makeLibraryRoot();
  await writeIndexPackage({
    library_root: libraryRoot,
    index_version: "v000001",
    source_video_ids: [],
    sqlite_video_count: 0
  });
  await writeCurrentPointer(libraryRoot, "v000001");

  const first = await listAdminIndexVersions(libraryRoot);
  await writeCurrentPointer(libraryRoot, "v000002");
  const cached = await listAdminIndexVersions(libraryRoot);
  clearAdminIndexVersionCache(libraryRoot);
  const refreshed = await listAdminIndexVersions(libraryRoot);

  assert.equal(first.current_version, "v000001");
  assert.equal(cached.current_version, "v000001");
  assert.equal(refreshed.current_version, "v000002");
  assert.equal(refreshed.current_validation_status, "fail");
});
