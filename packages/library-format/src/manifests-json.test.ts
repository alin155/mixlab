import assert from "node:assert/strict";
import test from "node:test";
import {
  LibraryFormatError,
  assertPointerMatchesManifest,
  isCompleteReleaseManifestV1,
  parseCurrentReleasePointer,
  parseCurrentReleasePointerJson,
  parseIndexCurrentPointer,
  parseIndexPackageManifest,
  parseJsonText,
  parseReleaseManifestV1,
  parseReleaseManifestV1Json,
  parseSourceVideoManifest
} from "./index.ts";

const validReleaseJson = () => ({
  schema_version: "1.0",
  release_version: "v000002",
  library_id: "lib_verify",
  generated_at: "2026-10-27T02:00:00.000Z",
  ready_video_count: 3,
  source_index_version: "v000002",
  catalog_path: "catalog.sqlite",
  source_path_map_path: "source-path-map.json",
  search_index_path: "search-index/source-transcript-index",
  thumbnails_path: "thumbnails",
  transcript_pack_path: "transcript-pack"
});

const validPointer = () => ({
  schema_version: "1.0",
  library_id: "lib_verify",
  current_version: "v000002",
  updated_at: "2026-10-27T02:00:00.000Z",
  manifest_path: ".mixlab-library/releases/v000002/release.json"
});

const validSourceVideo = () => ({
  source_video_id: "V000001",
  title: "验收素材",
  relative_path: "source-videos/a.mp4",
  logical_uri: "library://source-video/V000001",
  duration_ms: 1000,
  width: 1920,
  height: 1080,
  fps: 25,
  codec: "h264",
  file_size: 1024,
  content_hash: "sha256:" + "a".repeat(64),
  preprocess_status: "ready",
  visible_to_cutters: true,
  transcript_path: ".mixlab-library/videos/V000001/transcript.json"
});

test("v1 release manifest parses canonical complete layout", () => {
  const manifest = parseReleaseManifestV1(validReleaseJson());
  assert.equal(manifest.release_version, "v000002");
  assert.equal(manifest.catalog_path, "catalog.sqlite");
  assert.equal(manifest.search_index_path, "search-index/source-transcript-index");
  assert.equal(isCompleteReleaseManifestV1(validReleaseJson(), "v000002"), true);
  assert.equal(isCompleteReleaseManifestV1(validReleaseJson(), "v000003"), false);
  const repaired = { ...validReleaseJson() };
  delete (repaired as Record<string, unknown>).search_index_path;
  assert.equal(isCompleteReleaseManifestV1(repaired, "v000002"), false);
});

test("v1 release manifest rejects corrupt/invalid/unsafe payloads", () => {
  assert.throws(() => parseReleaseManifestV1Json("{not json"), (error: unknown) =>
    error instanceof LibraryFormatError && error.code === "FORMAT_INVALID");
  assert.throws(() => parseReleaseManifestV1Json(""), LibraryFormatError);
  for (const override of [
    { schema_version: "2.0" },
    { release_version: "v1" },
    { release_version: "../escape" },
    { library_id: "" },
    { ready_video_count: -1 },
    { ready_video_count: 1.5 },
    { source_index_version: "v1/../x" },
    { catalog_path: "evil.sqlite" },
    { source_path_map_path: "evil.json" },
    { thumbnails_path: "../thumbnails" }
  ]) {
    assert.throws(() => parseReleaseManifestV1({ ...validReleaseJson(), ...override }), LibraryFormatError, JSON.stringify(override));
  }
  assert.throws(() => parseReleaseManifestV1(null), LibraryFormatError);
  assert.throws(() => parseReleaseManifestV1([validReleaseJson()]), LibraryFormatError);
});

test("release pointer parses and must match manifest version", () => {
  const pointer = parseCurrentReleasePointer(validPointer());
  assert.equal(pointer.current_version, "v000002");
  assert.equal(pointer.manifest_path, ".mixlab-library/releases/v000002/release.json");
  assertPointerMatchesManifest(pointer, parseReleaseManifestV1(validReleaseJson()));
  assert.throws(() => assertPointerMatchesManifest({ ...pointer, current_version: "v000001" }, parseReleaseManifestV1(validReleaseJson())),
    (error: unknown) => error instanceof LibraryFormatError && error.code === "POINTER_INVALID");
  for (const override of [
    { current_version: "v1" },
    { current_version: "../v000002" },
    { manifest_path: "../../outside.json" },
    { manifest_path: "/absolute/release.json" },
    { schema_version: "2.0" }
  ]) {
    assert.throws(() => parseCurrentReleasePointer({ ...validPointer(), ...override }), LibraryFormatError, JSON.stringify(override));
  }
  assert.throws(() => parseCurrentReleasePointerJson("{bad"), LibraryFormatError);
});

test("index manifest and current pointer validation", () => {
  const manifest = parseIndexPackageManifest({
    schema_version: "1.0",
    index_version: "v000002",
    library_id: "lib_verify",
    created_at: "2026-10-27T02:00:00.000Z",
    ready_video_count: 2,
    source_video_ids: ["V000001", "V000002"]
  });
  assert.deepEqual(manifest.source_video_ids, ["V000001", "V000002"]);
  for (const override of [
    { source_video_ids: ["V1"] },
    { source_video_ids: ["V000001", "V000001"] },
    { source_video_ids: "V000001" },
    { ready_video_count: -1 },
    { index_version: "../v000001" }
  ]) {
    assert.throws(() => parseIndexPackageManifest({
      schema_version: "1.0", index_version: "v000002", library_id: "lib_verify",
      created_at: "2026-10-27T02:00:00.000Z", ready_video_count: 1, source_video_ids: ["V000001"], ...override
    }), LibraryFormatError, JSON.stringify(override));
  }
  assert.equal(parseIndexCurrentPointer({ current_version: "v000002" }).current_version, "v000002");
  assert.throws(() => parseIndexCurrentPointer({ current_version: "../x" }), LibraryFormatError);
});

test("source video manifest validation rejects traversal and bad types", () => {
  const manifest = parseSourceVideoManifest(validSourceVideo());
  assert.equal(manifest.source_video_id, "V000001");
  assert.equal(manifest.transcript_path, ".mixlab-library/videos/V000001/transcript.json");
  for (const override of [
    { source_video_id: "V1" },
    { relative_path: "../../outside.mp4" },
    { relative_path: "/abs/a.mp4" },
    { transcript_path: "../transcript.json" },
    { visible_to_cutters: "yes" },
    { duration_ms: -1 }
  ]) {
    assert.throws(() => parseSourceVideoManifest({ ...validSourceVideo(), ...override }), LibraryFormatError, JSON.stringify(override));
  }
});

test("parseJsonText guards empty/corrupt content without leaking it", () => {
  assert.deepEqual(parseJsonText("{\"a\":1}", "x"), { a: 1 });
  for (const value of ["", "  ", "{bad", null, 1]) {
    assert.throws(() => parseJsonText(value, "x"), LibraryFormatError);
  }
});
