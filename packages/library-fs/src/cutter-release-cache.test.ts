import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  readFastLocalCutterReleaseCacheStatus,
  readLocalCutterReleaseCacheStatus,
  syncCutterReleaseCache
} from "./cutter-release-cache.ts";

async function makeRoot(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

function releaseRoot(root: string, version: string): string {
  return path.join(root, ".mixlab-library", "releases", version);
}

async function fileOrDirExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function writePointer(root: string, version: string): Promise<void> {
  await mkdir(path.join(root, ".mixlab-library"), { recursive: true });
  await writeFile(
    path.join(root, ".mixlab-library", "current-release.json"),
    `${JSON.stringify({
      schema_version: "1.0",
      library_id: "lib_main_001",
      current_version: version,
      updated_at: "2026-06-14T00:00:00.000Z",
      manifest_path: `.mixlab-library/releases/${version}/release.json`
    }, null, 2)}\n`
  );
}

async function writeV2ReleaseManifest(input: {
  root: string;
  version: string;
  filePaths: string[];
  min_client_version?: string;
  release_id?: string;
  writeToFileName?: string;
}): Promise<void> {
  const bundleRoot = releaseRoot(input.root, input.version);
  const files = await Promise.all(
    input.filePaths.map(async (relativePath) => {
      const filePath = path.join(bundleRoot, ...relativePath.split("/"));
      const fileStat = await stat(filePath);
      const hash = createHash("sha256").update(await readFile(filePath)).digest("hex");
      return {
        path: relativePath,
        role: relativePath.endsWith(".sqlite") ? "catalog" : "other",
        size: fileStat.size,
        sha256: hash
      };
    })
  );
  const sessionReleaseId = input.release_id ?? input.version;
  await writeFile(
    path.join(bundleRoot, input.writeToFileName ?? "release-manifest-v2.json"),
    `${JSON.stringify({
      schema_version: "2.0",
      contract_version: "1.0.0",
      release_id: sessionReleaseId,
      library_id: "lib_main_001",
      created_at: "2026-06-14T00:00:00.000Z",
      min_client_version: input.min_client_version ?? "0.17.0",
      index_version: input.version,
      ready_video_count: 1,
      files
    }, null, 2)}\n`
  );
}

async function writeRelease(input: {
  root: string;
  version: string;
  search_index_version?: string;
  payload?: string;
}): Promise<void> {
  const searchIndexVersion = input.search_index_version ?? input.version;
  const root = releaseRoot(input.root, input.version);
  const indexDir = path.join(
    root,
    "search-index",
    "source-transcript-index",
    searchIndexVersion
  );

  await mkdir(indexDir, { recursive: true });
  await writeFile(path.join(indexDir, "index.sqlite"), input.payload ?? input.version);
  await writeFile(path.join(root, "catalog.sqlite"), input.payload ?? input.version);
  await writeFile(
    path.join(root, "source-path-map.json"),
    `${JSON.stringify({
      schema_version: "1.0",
      release_version: input.version,
      library_id: "lib_main_001",
      source_videos: {}
    }, null, 2)}\n`
  );
  await writeFile(
    path.join(root, "release.json"),
    `${JSON.stringify({
      schema_version: "1.0",
      release_version: input.version,
      library_id: "lib_main_001",
      generated_at: "2026-06-14T00:00:00.000Z",
      ready_video_count: 1,
      source_index_version: searchIndexVersion,
      catalog_path: "catalog.sqlite",
      source_path_map_path: "source-path-map.json",
      search_index_path: "search-index/source-transcript-index",
      thumbnails_path: "thumbnails",
      transcript_pack_path: "transcript-pack"
    }, null, 2)}\n`
  );
}

test("sync cutter release cache prunes old releases while keeping current and newest previous", async () => {
  const sourceRoot = await makeRoot("mixlab-release-source-");
  const cacheRoot = await makeRoot("mixlab-release-cache-");

  await writeRelease({
    root: sourceRoot,
    version: "v000003",
    search_index_version: "idx-v000003",
    payload: "current-release"
  });
  await writePointer(sourceRoot, "v000003");

  await writeRelease({
    root: cacheRoot,
    version: "v000001",
    search_index_version: "idx-v000001",
    payload: "old-release"
  });
  await writeRelease({
    root: cacheRoot,
    version: "v000002",
    search_index_version: "idx-v000002",
    payload: "newer-previous-release"
  });
  await writePointer(cacheRoot, "v000002");
  await utimes(releaseRoot(cacheRoot, "v000001"), new Date("2026-06-01"), new Date("2026-06-01"));
  await utimes(releaseRoot(cacheRoot, "v000002"), new Date("2026-06-02"), new Date("2026-06-02"));

  const result = await syncCutterReleaseCache({
    source_library_root: sourceRoot,
    cache_root: cacheRoot,
    max_cached_releases: 2
  });

  assert.equal(result.active_release_version, "v000003");
  assert.equal(result.search_index_version, "idx-v000003");
  assert.equal(result.max_cached_releases, 2);
  assert.deepEqual(result.cached_release_versions, ["v000002", "v000003"]);
  assert.deepEqual(result.pruned_release_versions, ["v000001"]);
  assert.equal(await fileOrDirExists(releaseRoot(cacheRoot, "v000001")), false);
  assert.equal(await fileOrDirExists(releaseRoot(cacheRoot, "v000002")), true);
  assert.equal(await fileOrDirExists(releaseRoot(cacheRoot, "v000003")), true);
  assert.ok(result.cache_size_bytes > 0);
});

test("local release cache status stays diagnostic when pointer is missing", async () => {
  const cacheRoot = await makeRoot("mixlab-release-cache-status-");

  await writeRelease({
    root: cacheRoot,
    version: "v000001",
    payload: "cached-but-not-current"
  });

  const status = await readLocalCutterReleaseCacheStatus({
    cache_root: cacheRoot,
    max_cached_releases: 3
  });

  assert.equal(status.cache_ready, false);
  assert.equal(status.active_release_version, "");
  assert.equal(status.search_index_version, "");
  assert.deepEqual(status.cached_release_versions, ["v000001"]);
  assert.equal(status.cached_release_count, 1);
  assert.equal(status.max_cached_releases, 3);
  assert.ok(status.cache_size_bytes > 0);
});

test("fast local release cache status confirms the active release without a full cache scan", async () => {
  const cacheRoot = await makeRoot("mixlab-release-cache-fast-status-");

  await writeRelease({
    root: cacheRoot,
    version: "v000002",
    search_index_version: "idx-v000002",
    payload: "cached-current"
  });
  await writeRelease({
    root: cacheRoot,
    version: "v000001",
    payload: "cached-previous"
  });
  await writePointer(cacheRoot, "v000002");

  const status = await readFastLocalCutterReleaseCacheStatus({
    cache_root: cacheRoot,
    max_cached_releases: 2
  });

  assert.equal(status.cache_ready, true);
  assert.equal(status.active_release_version, "v000002");
  assert.equal(status.search_index_version, "idx-v000002");
  assert.deepEqual(status.cached_release_versions, ["v000002"]);
  assert.equal(status.cached_release_count, 1);
  assert.equal(status.cache_size_bytes, 0);
});

/** 递归检查本机 Release 缓存树权限：目录 0750、文件 0640（POSIX）。 */
async function assertReleaseTreeModes(root: string): Promise<{ dirs: number; files: number }> {
  let dirs = 0;
  let files = 0;

  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        assert.equal((await stat(entryPath)).mode & 0o777, 0o750, `目录权限应为 0750: ${entryPath}`);
        dirs += 1;
        await visit(entryPath);
        continue;
      }

      if (entry.isFile()) {
        assert.equal((await stat(entryPath)).mode & 0o777, 0o640, `文件权限应为 0640: ${entryPath}`);
        files += 1;
      }
    }
  }

  await visit(root);
  return { dirs, files };
}

test("pruning keeps active, recent window, and versions referenced by local works", async () => {
  const sourceRoot = await makeRoot("mixlab-release-refsource-");
  const cacheRoot = await makeRoot("mixlab-release-refcache-");

  await writeRelease({ root: sourceRoot, version: "v000004", payload: "current-release" });
  await writePointer(sourceRoot, "v000004");

  for (const version of ["v000001", "v000002", "v000003"]) {
    await writeRelease({ root: cacheRoot, version, payload: `cached-${version}` });
  }
  await writePointer(cacheRoot, "v000002");
  await utimes(releaseRoot(cacheRoot, "v000001"), new Date("2026-06-01"), new Date("2026-06-01"));
  await utimes(releaseRoot(cacheRoot, "v000002"), new Date("2026-06-02"), new Date("2026-06-02"));
  await utimes(releaseRoot(cacheRoot, "v000003"), new Date("2026-06-03"), new Date("2026-06-03"));

  const result = await syncCutterReleaseCache({
    source_library_root: sourceRoot,
    cache_root: cacheRoot,
    max_cached_releases: 2,
    pinned_release_versions: ["v000001"]
  });

  assert.equal(result.active_release_version, "v000004");
  assert.deepEqual(result.pinned_release_versions, ["v000001"]);
  assert.deepEqual(result.kept_release_versions, ["v000001", "v000004"]);
  assert.equal(result.kept_release_reasons?.v000001, "workspace_reference");
  assert.equal(result.kept_release_reasons?.v000004, "active");
  assert.deepEqual(result.pruned_release_versions, ["v000002", "v000003"]);
  assert.deepEqual(result.prune_failed_release_versions, []);
  assert.match(result.message, /历史作品引用/);
  assert.equal(await fileOrDirExists(releaseRoot(cacheRoot, "v000001")), true);
  assert.equal(await fileOrDirExists(releaseRoot(cacheRoot, "v000002")), false);
  assert.equal(await fileOrDirExists(releaseRoot(cacheRoot, "v000003")), false);
});

test("unknown historical references conservatively keep every cached release", async () => {
  const sourceRoot = await makeRoot("mixlab-release-unknown-source-");
  const cacheRoot = await makeRoot("mixlab-release-unknown-cache-");

  await writeRelease({ root: sourceRoot, version: "v000004", payload: "current-release" });
  await writePointer(sourceRoot, "v000004");

  for (const version of ["v000001", "v000002", "v000003"]) {
    await writeRelease({ root: cacheRoot, version, payload: `cached-${version}` });
  }
  await writePointer(cacheRoot, "v000003");

  const result = await syncCutterReleaseCache({
    source_library_root: sourceRoot,
    cache_root: cacheRoot,
    max_cached_releases: 2,
    preserve_cached_releases_for_unknown_references: true
  });

  assert.deepEqual(result.pruned_release_versions, []);
  assert.deepEqual(result.kept_release_versions, ["v000001", "v000002", "v000003", "v000004"]);
  for (const version of ["v000001", "v000002", "v000003"]) {
    assert.equal(
      result.kept_release_reasons?.[version],
      "workspace_reference_version_unknown"
    );
    assert.equal(await fileOrDirExists(releaseRoot(cacheRoot, version)), true);
  }
  assert.match(result.message, /保守保留/);
});

test("prune failures never block sync and are reported for audit", async () => {
  const sourceRoot = await makeRoot("mixlab-release-fail-source-");
  const cacheRoot = await makeRoot("mixlab-release-fail-cache-");

  await writeRelease({ root: sourceRoot, version: "v000003", payload: "current-release" });
  await writePointer(sourceRoot, "v000003");

  await writeRelease({ root: cacheRoot, version: "v000001", payload: "held-by-permissions" });
  await writeRelease({ root: cacheRoot, version: "v000002", payload: "recent-previous" });
  await writePointer(cacheRoot, "v000002");
  await utimes(releaseRoot(cacheRoot, "v000001"), new Date("2026-06-01"), new Date("2026-06-01"));
  await utimes(releaseRoot(cacheRoot, "v000002"), new Date("2026-06-02"), new Date("2026-06-02"));

  // 目录只读 → 递归删除失败；同步必须继续且报告被保留的版本。
  await chmod(releaseRoot(cacheRoot, "v000001"), 0o500);
  let result: Awaited<ReturnType<typeof syncCutterReleaseCache>>;
  try {
    result = await syncCutterReleaseCache({
      source_library_root: sourceRoot,
      cache_root: cacheRoot,
      max_cached_releases: 2
    });
  } finally {
    await chmod(releaseRoot(cacheRoot, "v000001"), 0o750);
  }

  assert.equal(result.active_release_version, "v000003");
  assert.deepEqual(result.pruned_release_versions, []);
  assert.deepEqual(result.prune_failed_release_versions, ["v000001"]);
  assert.match(result.kept_release_reasons?.v000001 ?? "", /^prune_failed:/);
  assert.equal(await fileOrDirExists(releaseRoot(cacheRoot, "v000001")), true);
  assert.match(result.message, /删除失败/);
});

test("cached release trees are owner-only (0750/0640) on POSIX", async (t) => {
  if (process.platform === "win32") {
    t.skip("POSIX permission bits are not available on Windows");
    return;
  }

  const sourceRoot = await makeRoot("mixlab-release-mode-source-");
  const cacheRoot = await makeRoot("mixlab-release-mode-cache-");
  await writeRelease({ root: sourceRoot, version: "v000001", payload: "mode-check" });
  await writePointer(sourceRoot, "v000001");

  await syncCutterReleaseCache({
    source_library_root: sourceRoot,
    cache_root: cacheRoot,
    max_cached_releases: 2
  });

  const counts = await assertReleaseTreeModes(releaseRoot(cacheRoot, "v000001"));
  assert.ok(counts.dirs > 0 && counts.files > 0);
  assert.equal(
    (await stat(path.join(cacheRoot, ".mixlab-library", "current-release.json"))).mode & 0o777,
    0o640
  );
  await rm(cacheRoot, { recursive: true, force: true });
});

// --- Round3：Release Manifest v2 消费端（hash 校验 / fail-closed / legacy 回退） ----

function releaseV2FilePaths(version: string, searchIndexVersion: string): string[] {
  return [
    "release.json",
    "catalog.sqlite",
    "source-path-map.json",
    `search-index/source-transcript-index/${searchIndexVersion}/index.sqlite`
  ];
}

test("release manifest v2 sync verifies every file hash and switches the cache", async () => {
  const sourceRoot = await makeRoot("mixlab-release-v2-source-");
  const cacheRoot = await makeRoot("mixlab-release-v2-cache-");

  await writeRelease({
    root: sourceRoot,
    version: "v000020",
    search_index_version: "idx-v000020",
    payload: "v2-release"
  });
  await writePointer(sourceRoot, "v000020");
  await writeV2ReleaseManifest({
    root: sourceRoot,
    version: "v000020",
    filePaths: releaseV2FilePaths("v000020", "idx-v000020"),
    release_id: "rel-v000020"
  });

  const result = await syncCutterReleaseCache({
    source_library_root: sourceRoot,
    cache_root: cacheRoot,
    client_version: "0.18.10"
  });

  assert.equal(result.copied, true);
  assert.equal(result.cache_ready, true);
  assert.equal(result.active_release_version, "v000020");
  assert.equal(result.verification?.manifest_schema_version, "2.0");
  assert.equal(result.verification?.release_id, "rel-v000020");
  assert.equal(result.verification?.min_client_version, "0.17.0");
  assert.equal(result.verification?.verified_files, 4);
  assert.deepEqual(result.verification?.failed_files, []);
  assert.equal(result.verification?.fallback_reason, undefined);
  assert.equal(await fileOrDirExists(releaseRoot(cacheRoot, "v000020")), true);

  // 第二次同步命中校验 sidecar，不再重复 copy，但保持 verified。
  const second = await syncCutterReleaseCache({
    source_library_root: sourceRoot,
    cache_root: cacheRoot,
    client_version: "0.18.10"
  });
  assert.equal(second.copied, false);
  assert.equal(second.verification?.verified_files, 4);
  assert.equal(second.active_release_version, "v000020");
});

test("tampered release v2 file fails closed, keeps the old cache, and never prunes old versions", async () => {
  const sourceRoot = await makeRoot("mixlab-release-v2-tamper-source-");
  const cacheRoot = await makeRoot("mixlab-release-v2-tamper-cache-");

  await writeRelease({
    root: cacheRoot,
    version: "v000010",
    search_index_version: "idx-v000010",
    payload: "old-cached-release"
  });
  await writePointer(cacheRoot, "v000010");
  await utimes(releaseRoot(cacheRoot, "v000010"), new Date("2026-06-01"), new Date("2026-06-01"));

  await writeRelease({
    root: sourceRoot,
    version: "v000021",
    search_index_version: "idx-v000021",
    payload: "tampered-release"
  });
  await writePointer(sourceRoot, "v000021");
  await writeV2ReleaseManifest({
    root: sourceRoot,
    version: "v000021",
    filePaths: releaseV2FilePaths("v000021", "idx-v000021"),
    release_id: "rel-v000021"
  });
  // manifest 写完后篡改 catalog.sqlite：size 与 sha256 均会失配。
  await writeFile(path.join(releaseRoot(sourceRoot, "v000021"), "catalog.sqlite"), "tampered!", "utf8");

  const result = await syncCutterReleaseCache({
    source_library_root: sourceRoot,
    cache_root: cacheRoot,
    client_version: "0.18.10"
  });

  assert.equal(result.copied, false);
  assert.equal(result.verification?.manifest_schema_version, "2.0");
  assert.equal(result.verification?.fallback_reason, "file_verification_failed");
  assert.ok((result.verification?.failed_files.length ?? 0) >= 1);
  assert.ok(result.verification?.failed_files.some((file) => file.path === "catalog.sqlite"));
  assert.match(result.message, /校验失败/);
  // fail-closed：不切换、不复制新版本、不淘汰旧版本。
  // active_release_version 保持旧缓存；source_release_version 记录源指针想切换到的版本。
  assert.equal(result.active_release_version, "v000010");
  assert.equal(result.source_release_version, "v000021");
  assert.deepEqual(result.pruned_release_versions, []);
  assert.equal(await fileOrDirExists(releaseRoot(cacheRoot, "v000021")), false);
  assert.equal(await fileOrDirExists(releaseRoot(cacheRoot, "v000010")), true);
});

test("missing release manifest v2 falls back to legacy directory verification", async () => {
  const sourceRoot = await makeRoot("mixlab-release-legacy-source-");
  const cacheRoot = await makeRoot("mixlab-release-legacy-cache-");

  await writeRelease({
    root: sourceRoot,
    version: "v000030",
    search_index_version: "idx-v000030",
    payload: "legacy-only"
  });
  await writePointer(sourceRoot, "v000030");

  const result = await syncCutterReleaseCache({
    source_library_root: sourceRoot,
    cache_root: cacheRoot,
    client_version: "0.18.10"
  });

  assert.equal(result.copied, true);
  assert.equal(result.cache_ready, true);
  assert.equal(result.active_release_version, "v000030");
  assert.equal(result.verification?.manifest_schema_version, "none");
  assert.equal(result.verification?.fallback_reason, "manifest_v2_missing");
  assert.deepEqual(result.verification?.failed_files, []);
});

test("incompatible min_client_version reports CONTRACT_TOO_OLD and keeps the legacy path usable", async () => {
  const sourceRoot = await makeRoot("mixlab-release-v2-too-old-source-");
  const cacheRoot = await makeRoot("mixlab-release-v2-too-old-cache-");

  await writeRelease({
    root: sourceRoot,
    version: "v000040",
    search_index_version: "idx-v000040",
    payload: "future-release"
  });
  await writePointer(sourceRoot, "v000040");
  await writeV2ReleaseManifest({
    root: sourceRoot,
    version: "v000040",
    filePaths: releaseV2FilePaths("v000040", "idx-v000040"),
    min_client_version: "9.9.9",
    release_id: "rel-v000040"
  });

  const result = await syncCutterReleaseCache({
    source_library_root: sourceRoot,
    cache_root: cacheRoot,
    client_version: "0.18.10"
  });

  assert.equal(result.verification?.fallback_reason, "contract_too_old");
  assert.equal(result.verification?.contract_error_code, "CONTRACT_TOO_OLD");
  assert.match(result.verification?.contract_error_message ?? "", /客户端版本过低/);
  // 旧路径不受影响：legacy 制品可读时仍按既有目录校验同步成功。
  assert.equal(result.copied, true);
  assert.equal(result.active_release_version, "v000040");
  assert.match(result.message, /CONTRACT_TOO_OLD/);
});

test("invalid release manifest v2 fails closed without switching the cache", async () => {
  const sourceRoot = await makeRoot("mixlab-release-v2-invalid-source-");
  const cacheRoot = await makeRoot("mixlab-release-v2-invalid-cache-");

  await writeRelease({
    root: sourceRoot,
    version: "v000050",
    search_index_version: "idx-v000050",
    payload: "invalid-manifest-release"
  });
  await writePointer(sourceRoot, "v000050");
  await writeFile(
    path.join(releaseRoot(sourceRoot, "v000050"), "release-manifest-v2.json"),
    JSON.stringify({ schema_version: "2.0", release_id: "broken" }),
    "utf8"
  );

  const result = await syncCutterReleaseCache({
    source_library_root: sourceRoot,
    cache_root: cacheRoot,
    client_version: "0.18.10"
  });

  assert.equal(result.copied, false);
  assert.equal(result.verification?.fallback_reason, "manifest_v2_invalid");
  assert.ok((result.verification?.failed_files.length ?? 0) >= 1);
  assert.match(result.message, /清单 v2 无效/);
  assert.equal(result.active_release_version, "");
  assert.equal(await fileOrDirExists(releaseRoot(cacheRoot, "v000050")), false);
});

// --- Round5：v2 manifest 解析切换到 library-format 后的一致性回归 ---

test("round5 wiring accepts the compat alias manifest-v2.json and keeps canonical precedence", async () => {
  const sourceRoot = await makeRoot("mixlab-release-v2-alias-source-");
  const cacheRoot = await makeRoot("mixlab-release-v2-alias-cache-");

  await writeRelease({
    root: sourceRoot,
    version: "v000060",
    search_index_version: "idx-v000060",
    payload: "alias-manifest-release"
  });
  await writePointer(sourceRoot, "v000060");
  await writeV2ReleaseManifest({
    root: sourceRoot,
    version: "v000060",
    filePaths: releaseV2FilePaths("v000060", "idx-v000060"),
    release_id: "rel-v000060-alias",
    writeToFileName: "manifest-v2.json"
  });

  const result = await syncCutterReleaseCache({
    source_library_root: sourceRoot,
    cache_root: cacheRoot,
    client_version: "0.18.10"
  });

  assert.equal(result.cache_ready, true);
  assert.equal(result.active_release_version, "v000060");
  assert.equal(result.verification?.manifest_schema_version, "2.0");
  assert.equal(result.verification?.release_id, "rel-v000060-alias");
  assert.equal(result.verification?.fallback_reason, undefined);
});

test("round5 wiring fails closed on non-JSON manifest v2 text without switching cache", async () => {
  const sourceRoot = await makeRoot("mixlab-release-v2-nonjson-source-");
  const cacheRoot = await makeRoot("mixlab-release-v2-nonjson-cache-");

  await writeRelease({
    root: sourceRoot,
    version: "v000061",
    search_index_version: "idx-v000061",
    payload: "nonjson-manifest-release"
  });
  await writePointer(sourceRoot, "v000061");
  await writeFile(
    path.join(releaseRoot(sourceRoot, "v000061"), "release-manifest-v2.json"),
    "{ this is not json",
    "utf8"
  );

  const result = await syncCutterReleaseCache({
    source_library_root: sourceRoot,
    cache_root: cacheRoot,
    client_version: "0.18.10"
  });

  assert.equal(result.copied, false);
  assert.equal(result.verification?.fallback_reason, "manifest_v2_invalid");
  assert.equal(result.active_release_version, "");
  assert.equal(await fileOrDirExists(releaseRoot(cacheRoot, "v000061")), false);
  assert.match(result.message, /清单 v2 无效/);
});
