import assert from "node:assert/strict";
import test from "node:test";
import {
  LibraryFormatError,
  RELEASE_MANIFEST_V2_FILE_NAMES,
  SHA256_HEX_PATTERN,
  assertSha256,
  isReleaseManifestV2Compatible,
  isSha256,
  normalizeSha256,
  parseReleaseManifestV2,
  parseReleaseManifestV2Json,
  resolveReleaseFormatState,
  selectReleaseManifestV2File,
  sha256Hex,
  sha256Prefixed
} from "./index.ts";

const sha = (char: string) => char.repeat(64);
const validV2 = () => ({
  schema_version: "2.0",
  contract_version: "1.0.0",
  release_id: "rel_20261027_verify",
  library_id: "lib_verify",
  created_at: "2026-10-27T02:00:00.000Z",
  min_client_version: "0.19.0",
  index_version: "v000002",
  ready_video_count: 1,
  files: [
    { path: "catalog.sqlite", role: "catalog", size: 10, sha256: sha("a") },
    { path: "search-index/source-transcript-index/v000002/index.sqlite", role: "search-index", size: 20, sha256: sha("b") }
  ]
});
const validV1 = () => ({
  schema_version: "1.0" as const,
  release_version: "v000002",
  library_id: "lib_verify",
  generated_at: "2026-10-27T02:00:00.000Z",
  ready_video_count: 1,
  source_index_version: "v000002",
  catalog_path: "catalog.sqlite" as const,
  source_path_map_path: "source-path-map.json" as const
});

test("sha256 helpers use prefixed canonical form and reject invalid values", () => {
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(sha256Prefixed("abc"), "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(SHA256_HEX_PATTERN.test(sha256Hex("x")), true);
  assert.equal(normalizeSha256("sha256:" + sha("A")), sha("a"));
  assert.equal(normalizeSha256(sha("b")), sha("b"));
  for (const value of ["", "abc", sha("g"), null, 1]) {
    assert.equal(isSha256(value), false, String(value));
    assert.throws(() => assertSha256(value), (error: unknown) =>
      error instanceof LibraryFormatError && error.code === "HASH_INVALID");
  }
  assert.equal(assertSha256("sha256:" + sha("C")), sha("c"));
});

test("manifest v2 parsing/validation wraps shared contract errors", () => {
  const manifest = parseReleaseManifestV2(validV2());
  assert.equal(manifest.release_id, "rel_20261027_verify");
  assert.equal(parseReleaseManifestV2Json(JSON.stringify(validV2())).index_version, "v000002");
  for (const override of [
    { schema_version: "1.0" },
    { files: [] },
    { files: [{ path: "../escape", role: "catalog", size: 1, sha256: sha("a") }] },
    { files: [{ path: "catalog.sqlite", role: "catalog", size: -1, sha256: sha("a") }] },
    { files: [{ path: "catalog.sqlite", role: "catalog", size: 1, sha256: "zz" }] },
    { ready_video_count: -1 }
  ]) {
    assert.throws(() => parseReleaseManifestV2({ ...validV2(), ...override }), (error: unknown) =>
      error instanceof LibraryFormatError && error.code === "MANIFEST_INVALID", JSON.stringify(override));
  }
  assert.throws(() => parseReleaseManifestV2Json("{bad"), LibraryFormatError);
});

test("manifest v2 file selection prefers canonical name and compat alias works", () => {
  assert.deepEqual([...RELEASE_MANIFEST_V2_FILE_NAMES], ["release-manifest-v2.json", "manifest-v2.json"]);
  assert.equal(selectReleaseManifestV2File(["manifest-v2.json"]), "manifest-v2.json");
  assert.equal(selectReleaseManifestV2File(["release-manifest-v2.json", "manifest-v2.json"]), "release-manifest-v2.json");
  assert.equal(selectReleaseManifestV2File(["release.json"]), null);
  assert.equal(selectReleaseManifestV2File([]), null);
});

test("release format resolution prefers valid v2 and falls back to legacy only with v1", () => {
  const v2 = parseReleaseManifestV2(validV2());
  assert.equal(isReleaseManifestV2Compatible(v2, "0.19.0"), true);
  assert.equal(isReleaseManifestV2Compatible(v2, "0.18.9"), false);

  const v2State = resolveReleaseFormatState({ release_manifest_v2: validV2() });
  assert.equal(v2State.kind, "v2");
  if (v2State.kind === "v2") assert.equal(v2State.compatible, true);

  const incompatible = resolveReleaseFormatState({
    release_manifest_v2: validV2(),
    client_version: "0.18.0"
  });
  assert.equal(incompatible.kind, "v2");
  if (incompatible.kind === "v2") assert.equal(incompatible.compatible, false);

  const aliasState = resolveReleaseFormatState({
    release_manifest_v2: validV2(),
    available_files: ["manifest-v2.json"]
  });
  assert.equal(aliasState.kind, "v2");
  if (aliasState.kind === "v2") assert.equal(aliasState.manifest_file, "manifest-v2.json");

  const legacyMissing = resolveReleaseFormatState({ release_manifest_v1: validV1() });
  assert.equal(legacyMissing.kind, "legacy");
  if (legacyMissing.kind === "legacy") assert.equal(legacyMissing.reason, "manifest_v2_missing");

  const legacyInvalidV2 = resolveReleaseFormatState({
    release_manifest_v1: validV1(),
    release_manifest_v2: { schema_version: "1.0" }
  });
  assert.equal(legacyInvalidV2.kind, "legacy");
  if (legacyInvalidV2.kind === "legacy") assert.equal(legacyInvalidV2.reason, "manifest_v2_invalid");

  const invalidOnly = resolveReleaseFormatState({ release_manifest_v2: { schema_version: "1.0" } });
  assert.equal(invalidOnly.kind, "invalid");
  assert.equal(resolveReleaseFormatState({}).kind, "none");
});
