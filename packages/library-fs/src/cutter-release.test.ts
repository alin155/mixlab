import assert from "node:assert/strict";
import {
  appendFile,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  validateReleaseManifestV2,
  type ReleaseManifestV2
} from "../../contracts/src/index.ts";
import { publishCutterRelease, readCurrentCutterRelease } from "./index.ts";
import {
  DEFAULT_RELEASE_MIN_CLIENT_VERSION,
  RELEASE_MIN_CLIENT_VERSION_ENV_VAR,
  readCutterReleaseManifestV2,
  readCurrentCutterReleaseManifestV2Summary,
  resolveCutterReleaseMinClientVersion,
  sealCutterReleaseManifestV2,
  verifyCutterReleaseBundle
} from "./cutter-release.ts";
import { hashFileSha256 } from "./file-hash.ts";

const READY_SOURCE_VIDEO_IDS = ["V000001"];

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "mixlab-cutter-release-"));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function mixlabRoot(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library");
}

function releasesRoot(libraryRoot: string): string {
  return path.join(mixlabRoot(libraryRoot), "releases");
}

function releaseRoot(libraryRoot: string, releaseVersion: string): string {
  return path.join(releasesRoot(libraryRoot), releaseVersion);
}

function currentReleasePointerPath(libraryRoot: string): string {
  return path.join(mixlabRoot(libraryRoot), "current-release.json");
}

async function writeReadySourceVideo(input: {
  library_root: string;
  source_video_id: string;
  relative_path?: string;
}): Promise<void> {
  const sourceVideoId = input.source_video_id;
  const relativePath = input.relative_path ?? "素材.mp4";
  const videoDir = path.join(mixlabRoot(input.library_root), "videos", sourceVideoId);

  await writeJson(path.join(videoDir, "source-video.json"), {
    source_video_id: sourceVideoId,
    title: "测试素材",
    relative_path: relativePath,
    source_folder_id: "src_default",
    source_folder_relative_path: relativePath,
    logical_uri: `library://source-video/${sourceVideoId}`,
    duration_ms: 1_000,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: "h264",
    file_size: 10,
    content_hash: "hash",
    preprocess_status: "ready",
    visible_to_cutters: true,
    transcript_path: `.mixlab-library/videos/${sourceVideoId}/transcript.json`,
    srt_path: `.mixlab-library/videos/${sourceVideoId}/subtitles.srt`,
    keyframes_path: `.mixlab-library/videos/${sourceVideoId}/keyframes.json`,
    cover_path: `.mixlab-library/videos/${sourceVideoId}/cover.jpg`
  });
}

async function writeIndexPackage(input: {
  library_root: string;
  index_version: string;
  source_video_ids?: string[];
}): Promise<void> {
  const sourceVideoIds = input.source_video_ids ?? READY_SOURCE_VIDEO_IDS;
  const indexRoot = path.join(
    mixlabRoot(input.library_root),
    "indexes",
    "source-transcript-index"
  );
  const versionDir = path.join(indexRoot, input.index_version);
  await mkdir(versionDir, { recursive: true });

  const db = new DatabaseSync(path.join(versionDir, "index.sqlite"));
  try {
    db.exec("CREATE TABLE segments (source_video_id TEXT NOT NULL, normalized_text TEXT NOT NULL);");
    const insertSegment = db.prepare(
      "INSERT INTO segments (source_video_id, normalized_text) VALUES (?, ?)"
    );
    for (const sourceVideoId of sourceVideoIds) {
      insertSegment.run(sourceVideoId, "测试文案内容");
    }
  } finally {
    db.close();
  }

  await writeJson(path.join(versionDir, "index-manifest.json"), {
    schema_version: "1.0",
    index_version: input.index_version,
    library_id: "lib_main_001",
    created_at: "2026-05-02T00:00:00.000Z",
    ready_video_count: sourceVideoIds.length,
    source_video_ids: sourceVideoIds
  });
  await writeJson(path.join(indexRoot, "current.json"), {
    library_id: "lib_main_001",
    current_version: input.index_version,
    updated_at: "2026-05-02T00:00:00.000Z"
  });
}

async function preparePublishableLibrary(): Promise<string> {
  const libraryRoot = await makeLibraryRoot();
  await writeReadySourceVideo({ library_root: libraryRoot, source_video_id: "V000001" });
  await writeIndexPackage({ library_root: libraryRoot, index_version: "v000001" });
  return libraryRoot;
}

async function releaseDirectoryEntries(libraryRoot: string): Promise<string[]> {
  try {
    return (await readdir(releasesRoot(libraryRoot))).sort();
  } catch {
    return [];
  }
}

test("reuses a complete release directory instead of rebuilding it", async () => {
  const libraryRoot = await preparePublishableLibrary();

  const first = await publishCutterRelease({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    release_version: "v000001",
    now: "2026-05-02T00:10:00.000Z"
  });
  const firstReleaseBytes = await readFile(
    path.join(releaseRoot(libraryRoot, "v000001"), "release.json"),
    "utf8"
  );
  assert.equal(first.generated_at, "2026-05-02T00:10:00.000Z");

  const second = await publishCutterRelease({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    release_version: "v000001",
    now: "2026-05-02T00:20:00.000Z"
  });

  assert.equal(
    await readFile(path.join(releaseRoot(libraryRoot, "v000001"), "release.json"), "utf8"),
    firstReleaseBytes
  );
  assert.equal(second.generated_at, "2026-05-02T00:10:00.000Z");
  assert.equal(
    (await readJson<{ current_version: string }>(currentReleasePointerPath(libraryRoot)))
      .current_version,
    "v000001"
  );

  const releaseEntries = await releaseDirectoryEntries(libraryRoot);
  assert.deepEqual(releaseEntries, ["v000001"]);
});

test("quarantines an incomplete same-version directory before publishing a complete one", async () => {
  const libraryRoot = await preparePublishableLibrary();
  const incompleteDir = releaseRoot(libraryRoot, "v000001");
  await mkdir(incompleteDir, { recursive: true });
  await writeFile(
    path.join(incompleteDir, "stale-marker.txt"),
    "incomplete release data",
    "utf8"
  );

  const release = await publishCutterRelease({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    release_version: "v000001",
    now: "2026-05-02T00:10:00.000Z"
  });

  assert.equal(release.release_version, "v000001");
  assert.equal(release.ready_video_count, READY_SOURCE_VIDEO_IDS.length);
  assert.equal(await pathExists(path.join(releaseRoot(libraryRoot, "v000001"), "catalog.sqlite")), true);
  assert.equal(
    await pathExists(path.join(releaseRoot(libraryRoot, "v000001"), "stale-marker.txt")),
    false
  );

  const current = await readCurrentCutterRelease(libraryRoot);
  assert.equal(current.release_version, "v000001");
  assert.equal(current.ready_video_count, READY_SOURCE_VIDEO_IDS.length);

  const releaseEntries = await releaseDirectoryEntries(libraryRoot);
  assert.deepEqual(releaseEntries, ["v000001"]);
});

test("keeps the previous release and pointer when the version directory rename fails", async () => {
  const libraryRoot = await preparePublishableLibrary();

  await publishCutterRelease({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    release_version: "v000001",
    now: "2026-05-02T00:10:00.000Z"
  });

  await writeIndexPackage({ library_root: libraryRoot, index_version: "v000002" });

  // A non-directory occupying the version path makes the final rename fail.
  const blockingPath = releaseRoot(libraryRoot, "v000002");
  await writeFile(blockingPath, "do-not-delete", "utf8");

  await assert.rejects(
    () => publishCutterRelease({
      library_root: libraryRoot,
      library_id: "lib_main_001",
      release_version: "v000002",
      now: "2026-05-02T00:20:00.000Z"
    })
  );

  assert.equal(await readFile(blockingPath, "utf8"), "do-not-delete");

  const pointer = await readJson<{ current_version: string }>(
    currentReleasePointerPath(libraryRoot)
  );
  assert.equal(pointer.current_version, "v000001");
  assert.equal((await readCurrentCutterRelease(libraryRoot)).release_version, "v000001");

  const previousRelease = await readJson<{ release_version: string; ready_video_count: number }>(
    path.join(releaseRoot(libraryRoot, "v000001"), "release.json")
  );
  assert.equal(previousRelease.release_version, "v000001");
  assert.equal(previousRelease.ready_video_count, READY_SOURCE_VIDEO_IDS.length);

  const releaseEntries = await releaseDirectoryEntries(libraryRoot);
  assert.equal(releaseEntries.some((entry) => entry.startsWith(".trash-")), false);
});

test("keeps the old pointer when the release pointer write fails", {
  skip: typeof process.getuid === "function" && process.getuid() === 0
}, async () => {
  const libraryRoot = await preparePublishableLibrary();

  await publishCutterRelease({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    release_version: "v000001",
    now: "2026-05-02T00:10:00.000Z"
  });

  await writeIndexPackage({ library_root: libraryRoot, index_version: "v000002" });

  const mixlabDir = mixlabRoot(libraryRoot);
  await chmod(mixlabDir, 0o500);

  try {
    await assert.rejects(
      () => publishCutterRelease({
        library_root: libraryRoot,
        library_id: "lib_main_001",
        release_version: "v000002",
        now: "2026-05-02T00:20:00.000Z"
      })
    );
  } finally {
    await chmod(mixlabDir, 0o700);
  }

  const pointer = await readJson<{ current_version: string }>(
    currentReleasePointerPath(libraryRoot)
  );
  assert.equal(pointer.current_version, "v000001");
  assert.equal((await readCurrentCutterRelease(libraryRoot)).release_version, "v000001");

  const previousRelease = await readJson<{ release_version: string; ready_video_count: number }>(
    path.join(releaseRoot(libraryRoot, "v000001"), "release.json")
  );
  assert.equal(previousRelease.ready_video_count, READY_SOURCE_VIDEO_IDS.length);

  // The newly built directory stays complete on disk even though the pointer update failed.
  const newRelease = await readJson<{ release_version: string; ready_video_count: number }>(
    path.join(releaseRoot(libraryRoot, "v000002"), "release.json")
  );
  assert.equal(newRelease.release_version, "v000002");
  assert.equal(await pathExists(path.join(releaseRoot(libraryRoot, "v000002"), "catalog.sqlite")), true);

  // A later publish retries the pointer switch and reuses the complete directory.
  const recovered = await publishCutterRelease({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    release_version: "v000002",
    now: "2026-05-02T00:30:00.000Z"
  });
  assert.equal(recovered.release_version, "v000002");
  assert.equal(
    (await readJson<{ current_version: string }>(currentReleasePointerPath(libraryRoot)))
      .current_version,
    "v000002"
  );
});

test("rejects release versions that would escape the releases directory", async () => {
  const libraryRoot = await makeLibraryRoot();
  const outsidePath = path.join(path.dirname(libraryRoot), "mixlab-release-escape");

  await assert.rejects(
    () => publishCutterRelease({
      library_root: libraryRoot,
      library_id: "lib_main_001",
      release_version: "../mixlab-release-escape",
      now: "2026-05-02T00:10:00.000Z"
    }),
    /发布版本号格式无效/
  );

  assert.equal(await pathExists(outsidePath), false);
  assert.equal(await pathExists(mixlabRoot(libraryRoot)), false);
});

async function publishedLibraryWithManifest(): Promise<{
  libraryRoot: string;
  releaseVersion: string;
  manifest: ReleaseManifestV2;
}> {
  const libraryRoot = await preparePublishableLibrary();
  await publishCutterRelease({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    release_version: "v000001",
    now: "2026-05-02T00:10:00.000Z",
    min_client_version: "0.1.0"
  });
  const manifest = await readCutterReleaseManifestV2(libraryRoot, "v000001");
  assert.ok(manifest);
  return { libraryRoot, releaseVersion: "v000001", manifest };
}

test("publish seals a complete manifest v2 with per-file size and sha256", async () => {
  const { libraryRoot, manifest } = await publishedLibraryWithManifest();
  const releaseDirectory = releaseRoot(libraryRoot, "v000001");

  assert.doesNotThrow(() => validateReleaseManifestV2(manifest));
  assert.equal(manifest.schema_version, "2.0");
  assert.equal(manifest.contract_version, "1.0.0");
  assert.match(manifest.release_id, /^rel_\d{8}T\d{6}Z_[a-f0-9]{12}$/);
  assert.equal(manifest.library_id, "lib_main_001");
  assert.equal(manifest.index_version, "v000001");
  assert.equal(manifest.ready_video_count, READY_SOURCE_VIDEO_IDS.length);
  assert.equal(manifest.min_client_version, "0.1.0");

  const filesByPath = new Map(manifest.files.map((file) => [file.path, file]));
  for (const requiredPath of [
    "catalog.sqlite",
    "source-path-map.json",
    "release.json",
    "search-index/source-transcript-index/current.json",
    "search-index/source-transcript-index/v000001/index.sqlite",
    "search-index/source-transcript-index/v000001/index-manifest.json"
  ]) {
    assert.equal(filesByPath.has(requiredPath), true, requiredPath);
  }

  assert.equal(filesByPath.get("catalog.sqlite")?.role, "catalog");
  assert.equal(filesByPath.get("source-path-map.json")?.role, "source-map");
  assert.equal(filesByPath.get("release.json")?.role, "other");
  assert.equal(
    filesByPath.get("search-index/source-transcript-index/v000001/index-manifest.json")?.role,
    "index-manifest"
  );

  let totalSize = 0;
  for (const file of manifest.files) {
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    const absolutePath = path.join(releaseDirectory, ...file.path.split("/"));
    const fileStat = await stat(absolutePath);
    const expectedSha256 = (await hashFileSha256(absolutePath)).replace(/^sha256:/, "");
    assert.equal(file.size, fileStat.size, file.path);
    assert.equal(file.sha256, expectedSha256, file.path);
    totalSize += file.size;
  }

  assert.equal(manifest.stats?.file_count, manifest.files.length);
  assert.equal(manifest.stats?.total_size_bytes, totalSize);
  assert.equal(
    manifest.files.some((file) => file.path === "release-manifest-v2.json"),
    false,
    "manifest must not self-reference"
  );

  const summary = await readCurrentCutterReleaseManifestV2Summary(libraryRoot);
  assert.equal(summary.manifest_available, true);
  assert.equal(summary.release_id, manifest.release_id);
  assert.equal(summary.index_version, "v000001");
  assert.equal(summary.ready_video_count, READY_SOURCE_VIDEO_IDS.length);
  assert.equal(summary.file_count, manifest.files.length);
  assert.equal(summary.min_client_version, "0.1.0");
  assert.equal(summary.created_at, "2026-05-02T00:10:00.000Z");
  assert.equal(summary.pointer_version, "v000001");
  assert.equal(summary.pointer_consistent, true);
  assert.equal(JSON.stringify(summary).includes(libraryRoot), false);

  const verifiedByReleaseId = await verifyCutterReleaseBundle({
    library_root: libraryRoot,
    release_id_or_version: manifest.release_id
  });
  assert.equal(verifiedByReleaseId.ok, true);
  assert.equal(verifiedByReleaseId.found, true);
  assert.equal(verifiedByReleaseId.manifest_valid, true);
  assert.equal(verifiedByReleaseId.release_id, manifest.release_id);
  assert.equal(verifiedByReleaseId.checked_file_count, manifest.files.length);
  assert.equal(verifiedByReleaseId.total_file_count, manifest.files.length);
  assert.deepEqual(verifiedByReleaseId.failures, []);
  assert.equal(verifiedByReleaseId.truncated, false);
});

test("verify detects tampered and missing release bundle files", async () => {
  const { libraryRoot, manifest } = await publishedLibraryWithManifest();
  const catalogPath = path.join(releaseRoot(libraryRoot, "v000001"), "catalog.sqlite");
  const catalogSize = (await stat(catalogPath)).size;

  // Same size, different content: must be caught by the sha256 check.
  await writeFile(catalogPath, Buffer.alloc(catalogSize, 0x41));

  const tampered = await verifyCutterReleaseBundle({
    library_root: libraryRoot,
    release_id_or_version: "v000001"
  });
  assert.equal(tampered.ok, false);
  assert.equal(tampered.found, true);
  assert.equal(tampered.manifest_valid, true);
  const catalogFailure = tampered.failures.find((failure) => failure.path === "catalog.sqlite");
  assert.equal(catalogFailure?.reason, "sha256_mismatch");
  assert.equal(catalogFailure?.expected_sha256?.length, 64);
  assert.equal(catalogFailure?.actual_sha256?.length, 64);

  await rm(path.join(releaseRoot(libraryRoot, "v000001"), ...manifest.files
    .find((file) => file.path.endsWith("/index.sqlite"))!
    .path.split("/")));
  const missing = await verifyCutterReleaseBundle({
    library_root: libraryRoot,
    release_id_or_version: manifest.release_id
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.failures.some((failure) => failure.reason === "missing"), true);
});

test("verify bounds file checks and reports unknown releases", async () => {
  const { libraryRoot, manifest } = await publishedLibraryWithManifest();

  const truncated = await verifyCutterReleaseBundle({
    library_root: libraryRoot,
    release_id_or_version: "v000001",
    max_files: 1
  });
  assert.equal(truncated.found, true);
  assert.equal(truncated.truncated, true);
  assert.equal(truncated.ok, false);
  assert.equal(truncated.checked_file_count, 1);
  assert.equal(truncated.total_file_count, manifest.files.length);

  const unknown = await verifyCutterReleaseBundle({
    library_root: libraryRoot,
    release_id_or_version: "rel_does_not_exist"
  });
  assert.equal(unknown.found, false);
  assert.equal(unknown.ok, false);
});

test("corrupt manifest v2 aborts republish and keeps the old release and pointer", async () => {
  const { libraryRoot } = await publishedLibraryWithManifest();
  const manifestPath = path.join(releaseRoot(libraryRoot, "v000001"), "release-manifest-v2.json");
  const releaseJsonBefore = await readFile(
    path.join(releaseRoot(libraryRoot, "v000001"), "release.json"),
    "utf8"
  );
  await writeFile(manifestPath, "{ \"schema_version\": \"2.0\" }", "utf8");

  await assert.rejects(
    () => publishCutterRelease({
      library_root: libraryRoot,
      library_id: "lib_main_001",
      release_version: "v000001",
      now: "2026-05-02T00:20:00.000Z"
    }),
    /manifest v2/
  );

  assert.equal(
    (await readJson<{ current_version: string }>(currentReleasePointerPath(libraryRoot)))
      .current_version,
    "v000001"
  );
  assert.equal((await readCurrentCutterRelease(libraryRoot)).release_version, "v000001");
  assert.equal(
    await readFile(path.join(releaseRoot(libraryRoot, "v000001"), "release.json"), "utf8"),
    releaseJsonBefore
  );
  assert.equal(await pathExists(path.join(releaseRoot(libraryRoot, "v000001"), "catalog.sqlite")), true);
});

test("republishing a legacy bundle without manifest v2 seals it once", async () => {
  const { libraryRoot, manifest } = await publishedLibraryWithManifest();
  await rm(path.join(releaseRoot(libraryRoot, "v000001"), "release-manifest-v2.json"));

  const summaryBefore = await readCurrentCutterReleaseManifestV2Summary(libraryRoot);
  assert.equal(summaryBefore.manifest_available, false);
  assert.equal(summaryBefore.legacy_release, true);
  assert.equal(summaryBefore.index_version, "v000001");

  await publishCutterRelease({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    release_version: "v000001",
    now: "2026-05-02T00:25:00.000Z",
    min_client_version: "0.1.0"
  });

  const sealed = await readCutterReleaseManifestV2(libraryRoot, "v000001");
  assert.ok(sealed);
  assert.equal(sealed.library_id, manifest.library_id);
  assert.equal(sealed.index_version, "v000001");
  assert.equal(sealed.files.length, manifest.files.length);
  assert.equal(
    (await verifyCutterReleaseBundle({
      library_root: libraryRoot,
      release_id_or_version: sealed.release_id
    })).ok,
    true
  );
  assert.equal((await readCurrentCutterRelease(libraryRoot)).release_version, "v000001");
});

test("manifest v2 maps artifact roles and covers every file in a synthetic bundle", async () => {
  const libraryRoot = await makeLibraryRoot();
  const releaseDirectory = releaseRoot(libraryRoot, "v000009");
  const writeBundleFile = async (relativePath: string, content: string): Promise<void> => {
    const absolutePath = path.join(releaseDirectory, ...relativePath.split("/"));
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, "utf8");
  };

  await writeBundleFile("catalog.sqlite", "catalog-bytes");
  await writeBundleFile("source-path-map.json", "{}");
  await writeBundleFile("release.json", "{}");
  await writeBundleFile("search-index/source-transcript-index/current.json", "{}");
  await writeBundleFile("search-index/source-transcript-index/v000009/index.sqlite", "sqlite-bytes");
  await writeBundleFile("search-index/source-transcript-index/v000009/index-manifest.json", "{}");
  await writeBundleFile("transcript-pack/V000001/transcript.json", "{}");
  await writeBundleFile("transcript-pack/V000001/subtitles.srt", "1\n00:00 ---> 00:01\n文案\n");
  await writeBundleFile("transcript-pack/V000001/keyframes.json", "{}");
  await writeBundleFile("thumbnails/V000001/cover.jpg", "jpeg-bytes");
  await writeBundleFile("extra/readme.txt", "notes");

  const manifest = await sealCutterReleaseManifestV2({
    library_root: libraryRoot,
    release_dir: releaseDirectory,
    library_id: "lib_main_001",
    index_version: "v000009",
    created_at: "2026-10-27T03:00:00.000Z",
    ready_video_count: 1,
    min_client_version: "0.1.0"
  });

  assert.equal(manifest.files.length, 11);
  assert.equal(manifest.stats?.file_count, 11);
  assert.deepEqual(
    manifest.files.map((file) => [file.path, file.role]),
    [
      ["catalog.sqlite", "catalog"],
      ["extra/readme.txt", "other"],
      ["release.json", "other"],
      ["search-index/source-transcript-index/current.json", "search-index"],
      ["search-index/source-transcript-index/v000009/index-manifest.json", "index-manifest"],
      ["search-index/source-transcript-index/v000009/index.sqlite", "search-index"],
      ["source-path-map.json", "source-map"],
      ["thumbnails/V000001/cover.jpg", "cover"],
      ["transcript-pack/V000001/keyframes.json", "keyframes"],
      ["transcript-pack/V000001/subtitles.srt", "srt"],
      ["transcript-pack/V000001/transcript.json", "transcript"]
    ]
  );

  const srtEntry = manifest.files.find((file) => file.path.endsWith("subtitles.srt"));
  assert.ok(srtEntry);
  assert.equal(
    srtEntry.sha256,
    (await hashFileSha256(path.join(releaseDirectory, ...srtEntry.path.split("/")))).replace(/^sha256:/, "")
  );
});

test("min client version defaults to the compatible consumer baseline and honors env overrides", () => {
  assert.equal(DEFAULT_RELEASE_MIN_CLIENT_VERSION, "0.19.0");
  assert.equal(resolveCutterReleaseMinClientVersion({} as NodeJS.ProcessEnv), "0.19.0");
  assert.equal(
    resolveCutterReleaseMinClientVersion({
      [RELEASE_MIN_CLIENT_VERSION_ENV_VAR]: "0.20.1"
    } as NodeJS.ProcessEnv),
    "0.20.1"
  );
});

test("readers accept the compat alias manifest-v2.json for already sealed bundles", async () => {
  const { libraryRoot, releaseVersion, manifest } = await publishedLibraryWithManifest();
  const releaseDirectory = releaseRoot(libraryRoot, releaseVersion);
  const primaryPath = path.join(releaseDirectory, "release-manifest-v2.json");
  const compatPath = path.join(releaseDirectory, "manifest-v2.json");
  await writeFile(compatPath, await readFile(primaryPath, "utf8"), "utf8");
  await rm(primaryPath);

  const aliased = await readCutterReleaseManifestV2(libraryRoot, releaseVersion);
  assert.equal(aliased?.release_id, manifest.release_id);

  const summary = await readCurrentCutterReleaseManifestV2Summary(libraryRoot);
  assert.equal(summary.manifest_available, true);
  assert.equal(summary.release_id, manifest.release_id);

  const verified = await verifyCutterReleaseBundle({
    library_root: libraryRoot,
    release_id_or_version: manifest.release_id
  });
  assert.equal(verified.ok, true);
});

test("published release keeps independent copies of shared index files (P2-1: copyFile, not hard link, 0640)", async () => {
  const { libraryRoot, releaseVersion, manifest } = await publishedLibraryWithManifest();
  const sharedIndexRoot = path.join(mixlabRoot(libraryRoot), "indexes", "source-transcript-index");
  const sharedIndexPath = path.join(sharedIndexRoot, releaseVersion, "index.sqlite");
  const sharedPointerPath = path.join(sharedIndexRoot, "current.json");
  const publishedIndexRoot = path.join(
    releaseRoot(libraryRoot, releaseVersion),
    "search-index",
    "source-transcript-index"
  );
  const publishedIndexPath = path.join(publishedIndexRoot, releaseVersion, "index.sqlite");
  const publishedPointerPath = path.join(publishedIndexRoot, "current.json");
  const summary = await readCurrentCutterReleaseManifestV2Summary(libraryRoot);
  const manifestPath = path.join(libraryRoot, summary.manifest_path);
  const publishedIndexBytes = await readFile(publishedIndexPath);
  const publishedPointerBytes = await readFile(publishedPointerPath);
  const manifestBytes = await readFile(manifestPath, "utf8");

  // 1) 独立副本：内容一致但 inode 不同；权限 0640（POSIX）。
  assert.deepEqual(await readFile(publishedIndexPath), await readFile(sharedIndexPath));
  const [publishedStat, sharedStat] = await Promise.all([
    stat(publishedIndexPath),
    stat(sharedIndexPath)
  ]);
  if (process.platform !== "win32") {
    assert.notEqual(publishedStat.ino, sharedStat.ino, "发布副本不能是共享索引的硬链接");
    assert.equal(publishedStat.mode & 0o777, 0o640);
    assert.equal((await stat(publishedPointerPath)).mode & 0o777, 0o640);
  }

  // 2) 发布后原地修改共享索引：已发布文件与封存 manifest 必须保持不变。
  await appendFile(sharedIndexPath, "\nshared-index-mutated-after-publish\n");
  await writeFile(
    sharedPointerPath,
    JSON.stringify({ library_id: "lib_main_001", current_version: releaseVersion, mutated: true }, null, 2),
    "utf8"
  );
  assert.deepEqual(await readFile(publishedIndexPath), publishedIndexBytes);
  assert.deepEqual(await readFile(publishedPointerPath), publishedPointerBytes);
  assert.equal(await readFile(manifestPath, "utf8"), manifestBytes);

  // 3) 封存 manifest 的 hash 只覆盖发布副本，篡改共享索引后仍然 verify 通过。
  const verification = await verifyCutterReleaseBundle({
    library_root: libraryRoot,
    release_id_or_version: releaseVersion
  });
  assert.equal(verification.ok, true, JSON.stringify(verification.failures));
  const indexEntry = manifest.files.find((file) => file.path.endsWith("index.sqlite"));
  assert.ok(indexEntry);
  assert.equal(
    indexEntry.sha256,
    (await hashFileSha256(publishedIndexPath)).replace(/^sha256:/, "")
  );
});

test("published bundle uses 0640 files and 0750 directories", {
  skip: process.platform === "win32"
}, async () => {
  const { libraryRoot, releaseVersion } = await publishedLibraryWithManifest();
  const releaseDirectory = releaseRoot(libraryRoot, releaseVersion);

  for (const relativePath of [
    "catalog.sqlite",
    "release.json",
    "source-path-map.json",
    "release-manifest-v2.json",
    "search-index/source-transcript-index/current.json",
    `search-index/source-transcript-index/${releaseVersion}/index.sqlite`,
    `search-index/source-transcript-index/${releaseVersion}/index-manifest.json`
  ]) {
    const fileStat = await stat(path.join(releaseDirectory, ...relativePath.split("/")));
    assert.equal(fileStat.isFile(), true, relativePath);
    assert.equal(fileStat.mode & 0o777, 0o640, relativePath + " must be 0640");
  }

  for (const directory of [
    releasesRoot(libraryRoot),
    releaseDirectory,
    path.join(releaseDirectory, "search-index"),
    path.join(releaseDirectory, "search-index", "source-transcript-index"),
    path.join(releaseDirectory, "search-index", "source-transcript-index", releaseVersion),
    path.join(releaseDirectory, "thumbnails"),
    path.join(releaseDirectory, "transcript-pack")
  ]) {
    const directoryStat = await stat(directory);
    assert.equal(directoryStat.isDirectory(), true, directory);
    assert.equal(directoryStat.mode & 0o777, 0o750, directory + " must be 0750");
  }
});


