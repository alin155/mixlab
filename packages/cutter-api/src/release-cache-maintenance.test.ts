import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { approveCutterUser, createCutterLoginApplication } from "../../library-fs/src/index.ts";
import {
  RELEASE_CACHE_MAINTENANCE_ERROR_CODES,
  type ReleaseCacheEvictResult,
  type ReleaseCacheMaintenanceService,
  type ReleaseCachePinsInventory
} from "./release-cache-maintenance.ts";
import {
  createCutterApiServer,
  cutterReleaseCacheMaintenanceService,
  type CreateCutterApiServerInput
} from "./index.ts";

const CREATED_AT = "2026-05-02T10:00:00Z";
const ACTIVE_VERSION = "v000004";

interface ReleaseFixture {
  base_root: string;
  library_root: string;
  workspace_root: string;
  cache_root: string;
}

interface ReleaseApiContext {
  base_url: string;
  headers: Record<string, string>;
  service: ReleaseCacheMaintenanceService;
}

async function createReleaseFixture(): Promise<ReleaseFixture> {
  const baseRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-release-cache-api-"));
  const libraryRoot = path.join(baseRoot, "library");
  const workspaceRoot = path.join(baseRoot, "workspace");
  const cacheRoot = path.join(baseRoot, "cache");
  await mkdir(libraryRoot, { recursive: true });
  await mkdir(workspaceRoot, { recursive: true });
  await mkdir(path.join(cacheRoot, ".mixlab-library", "releases"), { recursive: true });
  return {
    base_root: baseRoot,
    library_root: libraryRoot,
    workspace_root: workspaceRoot,
    cache_root: cacheRoot
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

function releaseDirectory(cacheRoot: string, version: string): string {
  return path.join(cacheRoot, ".mixlab-library", "releases", version);
}

async function directoryBytes(root: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      total += await directoryBytes(entryPath);
      continue;
    }
    if (entry.isFile()) {
      total += (await stat(entryPath)).size;
    }
  }

  return total;
}

async function seedReleaseVersion(
  fixture: ReleaseFixture,
  input: { version: string; bytes: number }
): Promise<number> {
  const releaseRoot = releaseDirectory(fixture.cache_root, input.version);
  await mkdir(path.join(releaseRoot, "search-index"), { recursive: true });
  await writeFile(path.join(releaseRoot, "catalog.sqlite"), Buffer.alloc(input.bytes, "c"));
  await jsonWrite(path.join(releaseRoot, "release.json"), {
    schema_version: "1.0",
    release_version: input.version,
    library_id: "lib-test",
    generated_at: CREATED_AT,
    ready_video_count: 1,
    source_index_version: input.version,
    catalog_path: "catalog.sqlite",
    source_path_map_path: "source-path-map.json",
    search_index_path: "search-index",
    thumbnails_path: "thumbnails",
    transcript_pack_path: "transcript-pack"
  });
  return directoryBytes(releaseRoot);
}

async function jsonWrite(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function seedReleaseCache(fixture: ReleaseFixture): Promise<Record<string, number>> {
  const sizes: Record<string, number> = {};
  for (const [version, bytes] of [
    ["v000001", 32],
    ["v000002", 48],
    ["v000003", 64],
    ["v000004", 80]
  ] as const) {
    sizes[version] = await seedReleaseVersion(fixture, { version, bytes });
  }
  await jsonWrite(
    path.join(fixture.cache_root, ".mixlab-library", "current-release.json"),
    {
      schema_version: "1.0",
      library_id: "lib-test",
      current_version: ACTIVE_VERSION,
      updated_at: CREATED_AT
    }
  );
  return sizes;
}

async function seedWorkspaceReference(
  fixture: ReleaseFixture,
  input: { version: string; project_id: string; project_title: string }
): Promise<void> {
  await jsonWrite(
    path.join(fixture.workspace_root, "export-clips", "E000001", "export-clip.json"),
    {
      export_clip_id: "E000001",
      release_version: input.version,
      project_id: input.project_id,
      project_title: input.project_title,
      source_video_id: "V000001"
    }
  );
}

async function createAuthHeaders(libraryRoot: string): Promise<Record<string, string>> {
  const application = await createCutterLoginApplication(libraryRoot, {
    username: "release-user",
    device_id: "release-device",
    device_name: "Release Test Device",
    now: CREATED_AT
  });
  const approved = await approveCutterUser(libraryRoot, {
    user_id: application.user_id,
    now: "2026-05-02T09:01:00Z"
  });

  return {
    "X-MixLab-Device-Id": approved.session.device_id,
    "X-MixLab-Session-Token": approved.session.session_token
  };
}

async function withReleaseApi(
  fixture: ReleaseFixture,
  fn: (context: ReleaseApiContext) => Promise<void>,
  extraInput: Partial<CreateCutterApiServerInput> = {}
): Promise<void> {
  const headers = await createAuthHeaders(fixture.library_root);
  const server = createCutterApiServer({
    library_root: fixture.library_root,
    workspace_root: fixture.workspace_root,
    release_cache_root: fixture.cache_root,
    workspace_lease_disabled: true,
    ...extraInput
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  try {
    const address = server.address() as AddressInfo;
    const service = cutterReleaseCacheMaintenanceService(server);
    assert.ok(service, "release cache maintenance service should be registered per server instance");
    await fn({
      base_url: "http://127.0.0.1:" + address.port,
      headers,
      service
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function withReleaseFixture(fn: (fixture: ReleaseFixture) => Promise<void>): Promise<void> {
  const fixture = await createReleaseFixture();
  try {
    await fn(fixture);
  } finally {
    await rm(fixture.base_root, { recursive: true, force: true });
  }
}

async function readPins(context: ReleaseApiContext): Promise<ReleaseCachePinsInventory> {
  const response = await fetch(context.base_url + "/cutter/release-cache/pins", {
    headers: context.headers
  });
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { data: ReleaseCachePinsInventory };
  return payload.data;
}

async function postEvict(context: ReleaseApiContext, body: unknown): Promise<Response> {
  return fetch(context.base_url + "/cutter/release-cache/evict", {
    method: "POST",
    headers: {
      ...context.headers,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function readEvictResult(
  context: ReleaseApiContext,
  body: unknown
): Promise<ReleaseCacheEvictResult> {
  const response = await postEvict(context, body);
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { data: ReleaseCacheEvictResult };
  return payload.data;
}

async function readError(response: Response): Promise<{
  code: string;
  message: string;
  remediation?: string;
}> {
  const body = (await response.json()) as {
    error: { code: string; message: string; remediation?: string };
  };
  return body.error;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

test("release cache pins lists pinned, unpinned and active versions with a confirm token", async () => {
  await withReleaseFixture(async (fixture) => {
    const sizes = await seedReleaseCache(fixture);
    await seedWorkspaceReference(fixture, {
      version: "v000002",
      project_id: "P-ALPHA",
      project_title: "alpha project"
    });

    await withReleaseApi(fixture, async (context) => {
      const anonymous = await fetch(context.base_url + "/cutter/release-cache/pins");
      assert.equal(anonymous.status, 401);

      const pins = await readPins(context);
      assert.deepEqual(
        pins.pinned.map((entry) => entry.version),
        ["v000002"]
      );
      const pinned = pins.pinned[0]!;
      assert.equal(pinned.size_bytes, sizes.v000002);
      assert.equal(pinned.referenced_by[0]?.project_id, "P-ALPHA");
      assert.equal(pinned.referenced_by[0]?.title, "alpha project");
      assert.equal(typeof pinned.last_used_at, "string");

      assert.deepEqual(
        pins.unpinned.map((entry) => entry.version),
        ["v000001", "v000003", "v000004"]
      );
      assert.equal(pins.active_release_version, ACTIVE_VERSION);
      assert.equal(pins.max_cached_releases, 2);
      assert.equal(pins.expected_bytes, sizes.v000001! + sizes.v000003!);
      assert.equal(typeof pins.confirm_token, "string");
      assert.ok(pins.confirm_token.length >= 16);
    });
  });
});

test("release cache evict removes an unpinned version and frees bytes", async () => {
  await withReleaseFixture(async (fixture) => {
    const sizes = await seedReleaseCache(fixture);

    await withReleaseApi(fixture, async (context) => {
      const pins = await readPins(context);
      const result = await readEvictResult(context, {
        versions: ["v000001"],
        confirm_token: pins.confirm_token,
        expected_bytes: sizes.v000001
      });

      assert.deepEqual(result.evicted, ["v000001"]);
      assert.equal(result.freed_bytes, sizes.v000001);
      assert.deepEqual(result.blocked, []);
      assert.equal(await pathExists(releaseDirectory(fixture.cache_root, "v000001")), false);
      assert.equal(await pathExists(releaseDirectory(fixture.cache_root, "v000002")), true);
      assert.equal(await pathExists(releaseDirectory(fixture.cache_root, ACTIVE_VERSION)), true);

      const refreshed = await readPins(context);
      assert.deepEqual(
        refreshed.unpinned.map((entry) => entry.version),
        ["v000002", "v000003", ACTIVE_VERSION]
      );
      assert.equal(refreshed.expected_bytes, sizes.v000002! + sizes.v000003!);
    });
  });
});

test("release cache evict blocks pinned and active versions", async () => {
  await withReleaseFixture(async (fixture) => {
    const sizes = await seedReleaseCache(fixture);
    await seedWorkspaceReference(fixture, {
      version: "v000002",
      project_id: "P-ALPHA",
      project_title: "alpha project"
    });

    await withReleaseApi(fixture, async (context) => {
      const pins = await readPins(context);
      const pinnedResult = await readEvictResult(context, {
        versions: ["v000002"],
        confirm_token: pins.confirm_token,
        expected_bytes: 0
      });
      assert.deepEqual(pinnedResult.evicted, []);
      assert.equal(
        pinnedResult.blocked[0]?.reason,
        RELEASE_CACHE_MAINTENANCE_ERROR_CODES.release_cache_pinned
      );
      assert.equal(pinnedResult.blocked[0]?.referenced_by?.[0]?.project_id, "P-ALPHA");
      assert.equal(await pathExists(releaseDirectory(fixture.cache_root, "v000002")), true);

      const pinsForActive = await readPins(context);
      const activeResult = await readEvictResult(context, {
        versions: [ACTIVE_VERSION],
        confirm_token: pinsForActive.confirm_token,
        expected_bytes: 0
      });
      assert.deepEqual(activeResult.evicted, []);
      assert.equal(
        activeResult.blocked[0]?.reason,
        RELEASE_CACHE_MAINTENANCE_ERROR_CODES.release_cache_in_use
      );
      assert.equal(
        await pathExists(releaseDirectory(fixture.cache_root, ACTIVE_VERSION)),
        true
      );
      assert.equal(sizes[ACTIVE_VERSION]! > 0, true);
    });
  });
});

test("release cache evict blocks unknown versions", async () => {
  await withReleaseFixture(async (fixture) => {
    await seedReleaseCache(fixture);

    await withReleaseApi(fixture, async (context) => {
      const pins = await readPins(context);
      const result = await readEvictResult(context, {
        versions: ["v000099"],
        confirm_token: pins.confirm_token,
        expected_bytes: 0
      });
      assert.deepEqual(result.evicted, []);
      assert.equal(
        result.blocked[0]?.reason,
        RELEASE_CACHE_MAINTENANCE_ERROR_CODES.release_cache_unknown
      );
    });
  });
});

test("release cache evict rejects mismatched expected bytes without deleting", async () => {
  await withReleaseFixture(async (fixture) => {
    const sizes = await seedReleaseCache(fixture);

    await withReleaseApi(fixture, async (context) => {
      const pins = await readPins(context);
      const response = await postEvict(context, {
        versions: ["v000001"],
        confirm_token: pins.confirm_token,
        expected_bytes: sizes.v000001! + 1
      });

      assert.equal(response.status, 409);
      assert.equal(
        (await readError(response)).code,
        RELEASE_CACHE_MAINTENANCE_ERROR_CODES.release_cache_expected_bytes_mismatch
      );
      assert.equal(await pathExists(releaseDirectory(fixture.cache_root, "v000001")), true);
    });
  });
});

test("release cache evict reports expired confirm tokens", async () => {
  await withReleaseFixture(async (fixture) => {
    const sizes = await seedReleaseCache(fixture);

    await withReleaseApi(
      fixture,
      async (context) => {
        const pins = await readPins(context);
        await new Promise((resolve) => setTimeout(resolve, 25));

        const response = await postEvict(context, {
          versions: ["v000001"],
          confirm_token: pins.confirm_token,
          expected_bytes: sizes.v000001
        });
        assert.equal(response.status, 409);
        assert.equal(
          (await readError(response)).code,
          RELEASE_CACHE_MAINTENANCE_ERROR_CODES.release_cache_confirm_expired
        );
      },
      { release_cache_evict_confirm_ttl_ms: 1 }
    );
  });
});

test("release cache evict invalidates the consumed confirm token", async () => {
  await withReleaseFixture(async (fixture) => {
    const sizes = await seedReleaseCache(fixture);

    await withReleaseApi(fixture, async (context) => {
      const pins = await readPins(context);
      const body = {
        versions: ["v000001"],
        confirm_token: pins.confirm_token,
        expected_bytes: sizes.v000001
      };
      const first = await readEvictResult(context, body);
      assert.deepEqual(first.evicted, ["v000001"]);

      const replay = await postEvict(context, body);
      assert.equal(replay.status, 409);
      assert.equal(
        (await readError(replay)).code,
        RELEASE_CACHE_MAINTENANCE_ERROR_CODES.release_cache_confirm_invalid
      );
    });
  });
});

test("release cache evict rejects concurrent requests with release_cache_busy", async () => {
  await withReleaseFixture(async (fixture) => {
    const sizes = await seedReleaseCache(fixture);

    await withReleaseApi(fixture, async (context) => {
      const pins = await readPins(context);
      const releaseBusy = context.service.tryBeginEvict();
      assert.ok(releaseBusy);

      try {
        const busyResponse = await postEvict(context, {
          versions: ["v000001"],
          confirm_token: pins.confirm_token,
          expected_bytes: sizes.v000001
        });
        assert.equal(busyResponse.status, 409);
        assert.equal(
          (await readError(busyResponse)).code,
          RELEASE_CACHE_MAINTENANCE_ERROR_CODES.release_cache_busy
        );
      } finally {
        releaseBusy();
      }

      const result = await readEvictResult(context, {
        versions: ["v000001"],
        confirm_token: pins.confirm_token,
        expected_bytes: sizes.v000001
      });
      assert.deepEqual(result.evicted, ["v000001"]);
      assert.equal(await pathExists(releaseDirectory(fixture.cache_root, "v000001")), false);
    });
  });
});

test("release cache pins conservatively keeps versions when workspace artifacts lack release metadata", async () => {
  await withReleaseFixture(async (fixture) => {
    await seedReleaseCache(fixture);
    await jsonWrite(
      path.join(fixture.workspace_root, "cut-jobs", "CJ-1.json"),
      { cut_job_id: "CJ-1", status: "done" }
    );

    await withReleaseApi(fixture, async (context) => {
      const pins = await readPins(context);
      assert.deepEqual(
        pins.pinned.map((entry) => entry.version),
        ["v000001", "v000002", "v000003", ACTIVE_VERSION]
      );
      assert.ok(pins.warnings?.some((warning) => warning.code === "release_cache_references_unknown"));
      assert.equal(pins.expected_bytes, 0);
      assert.deepEqual(pins.unpinned, []);
    });
  });
});
