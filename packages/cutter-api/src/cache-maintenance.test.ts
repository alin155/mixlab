import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { approveCutterUser, createCutterLoginApplication } from "../../library-fs/src/index.ts";
import { pinCachePath } from "../../cutter-local/src/index.ts";
import {
  CACHE_MAINTENANCE_ERROR_CODES,
  type CacheCleanResult,
  type CacheInventory,
  type CacheMaintenanceService
} from "./cache-maintenance.ts";
import {
  createCutterApiServer,
  cutterCacheMaintenanceService,
  type CreateCutterApiServerInput
} from "./index.ts";

const SEARCHD_BYTES = 123;
const THUMBNAIL_BYTES = 40;
const SOURCE_VIDEO_BYTES = 50;
const CUT_TEMP_BYTES = 30;
const RELEASE_BYTES = 7;
const THUMBNAIL_MANIFEST_CONTENT =
  '{"schema_version":"1.0","generated_at":"2026-01-01T00:00:00.000Z","entries":{}}';

interface CacheFixture {
  base_root: string;
  library_root: string;
  workspace_root: string;
  cache_root: string;
  searchd_root: string;
  thumbnail_root: string;
  source_video_root: string;
  cut_temp_root: string;
  release_mixlab_root: string;
}

interface CacheApiContext {
  base_url: string;
  headers: Record<string, string>;
  service: CacheMaintenanceService;
}

async function createCacheFixture(): Promise<CacheFixture> {
  const baseRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-cache-api-"));
  const libraryRoot = path.join(baseRoot, "library");
  const workspaceRoot = path.join(baseRoot, "workspace");
  const cacheRoot = path.join(workspaceRoot, "cache");
  await mkdir(libraryRoot, { recursive: true });
  await mkdir(cacheRoot, { recursive: true });

  return {
    base_root: baseRoot,
    library_root: libraryRoot,
    workspace_root: workspaceRoot,
    cache_root: cacheRoot,
    searchd_root: path.join(cacheRoot, "searchd"),
    thumbnail_root: path.join(cacheRoot, "source-thumbnails"),
    source_video_root: path.join(cacheRoot, "source-videos"),
    cut_temp_root: path.join(workspaceRoot, "cache", "cut-temp"),
    release_mixlab_root: path.join(cacheRoot, ".mixlab-library")
  };
}

async function writeBytes(filePath: string, bytes: number): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, Buffer.alloc(bytes, "x"));
}

async function seedCacheFiles(fixture: CacheFixture): Promise<void> {
  await writeBytes(
    path.join(fixture.searchd_root, "tantivy", "v000001", "segment.idx"),
    SEARCHD_BYTES
  );
  await writeBytes(path.join(fixture.thumbnail_root, "V000001-cover.webp"), THUMBNAIL_BYTES);
  await writeFile(
    path.join(fixture.thumbnail_root, ".manifest.json"),
    THUMBNAIL_MANIFEST_CONTENT
  );
  await writeBytes(path.join(fixture.source_video_root, "V000001-cached-bytes.mp4"), SOURCE_VIDEO_BYTES);
  await writeBytes(
    path.join(fixture.cut_temp_root, "CJ20260101-0001-E000001-temp.mp4"),
    CUT_TEMP_BYTES
  );
  await writeBytes(
    path.join(fixture.release_mixlab_root, "releases", "v000001", "release.json"),
    RELEASE_BYTES
  );
}

async function createAuthHeaders(libraryRoot: string, deviceId: string): Promise<Record<string, string>> {
  const application = await createCutterLoginApplication(libraryRoot, {
    username: "cache-user-" + deviceId,
    device_id: deviceId,
    device_name: "Cache Test Device",
    now: "2026-05-02T09:00:00Z"
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

async function withCacheApi(
  fixture: CacheFixture,
  fn: (context: CacheApiContext) => Promise<void>,
  extraInput: Partial<CreateCutterApiServerInput> = {}
): Promise<void> {
  const headers = await createAuthHeaders(fixture.library_root, "cache-device");
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
    const service = cutterCacheMaintenanceService(server);
    assert.ok(service, "cache maintenance service should be registered per server instance");
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

async function withCacheFixture(fn: (fixture: CacheFixture) => Promise<void>): Promise<void> {
  const fixture = await createCacheFixture();
  try {
    await fn(fixture);
  } finally {
    await rm(fixture.base_root, { recursive: true, force: true });
  }
}

async function getInventoryRequest(
  context: CacheApiContext,
  include?: string
): Promise<Response> {
  const query = include === undefined ? "" : "?include=" + encodeURIComponent(include);
  return fetch(context.base_url + "/cutter/cache/inventory" + query, {
    headers: context.headers
  });
}

async function readInventory(context: CacheApiContext, include?: string): Promise<CacheInventory> {
  const response = await getInventoryRequest(context, include);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: CacheInventory };
  return body.data;
}

async function postCleanRequest(context: CacheApiContext, body: unknown): Promise<Response> {
  return fetch(context.base_url + "/cutter/cache/clean", {
    method: "POST",
    headers: {
      ...context.headers,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function readCleanResult(context: CacheApiContext, body: unknown): Promise<CacheCleanResult> {
  const response = await postCleanRequest(context, body);
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { data: CacheCleanResult };
  return payload.data;
}

async function readError(
  response: Response
): Promise<{ code: string; message: string; remediation?: string }> {
  const body = (await response.json()) as {
    error: { code: string; message: string; remediation?: string };
  };
  return body.error;
}

async function fileOrDirExists(targetPath: string): Promise<boolean> {
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

function inventoryTargets(inventory: CacheInventory): Map<string, CacheInventory["targets"][number]> {
  return new Map(inventory.targets.map((target) => [target.id, target]));
}

const ALL_TARGETS = ["searchd", "thumbnail", "source_video", "cut_temp", "release"];
const DELETABLE_TARGETS = ["searchd", "thumbnail", "source_video", "cut_temp"];

test("cache inventory reports disk cache targets with a bound confirm token", async () => {
  await withCacheFixture(async (fixture) => {
    await seedCacheFiles(fixture);

    await withCacheApi(fixture, async (context) => {
      const anonymous = await fetch(context.base_url + "/cutter/cache/inventory?include=searchd");
      assert.equal(anonymous.status, 401);

      const inventory = await readInventory(context, ALL_TARGETS.join(","));
      assert.deepEqual(
        inventory.targets.map((target) => target.id),
        ALL_TARGETS
      );

      const targets = inventoryTargets(inventory);

      const searchd = targets.get("searchd")!;
      assert.equal(searchd.path, fixture.searchd_root);
      assert.equal(searchd.size_bytes, SEARCHD_BYTES);
      assert.equal(searchd.file_count, 1);
      assert.equal(searchd.writable, true);
      assert.equal(searchd.deletable, true);
      assert.equal(searchd.deletable_bytes, SEARCHD_BYTES);
      assert.equal(typeof searchd.updated_at, "string");

      const thumbnail = targets.get("thumbnail")!;
      assert.equal(thumbnail.path, fixture.thumbnail_root);
      // .manifest.json 是索引元数据，不计入 size_bytes/file_count。
      assert.equal(thumbnail.size_bytes, THUMBNAIL_BYTES);
      assert.equal(thumbnail.file_count, 1);
      assert.equal(thumbnail.writable, true);
      assert.equal(thumbnail.deletable, true);
      assert.equal(thumbnail.deletable_bytes, THUMBNAIL_BYTES);
      assert.match(thumbnail.reason ?? "", /manifest/);

      const sourceVideo = targets.get("source_video")!;
      assert.equal(sourceVideo.path, fixture.source_video_root);
      assert.equal(sourceVideo.size_bytes, SOURCE_VIDEO_BYTES);
      assert.equal(sourceVideo.deletable, true);
      assert.equal(sourceVideo.deletable_bytes, SOURCE_VIDEO_BYTES);

      const cutTemp = targets.get("cut_temp")!;
      assert.equal(cutTemp.path, fixture.cut_temp_root);
      assert.equal(cutTemp.size_bytes, CUT_TEMP_BYTES);
      assert.equal(cutTemp.deletable, true);
      assert.equal(cutTemp.deletable_bytes, CUT_TEMP_BYTES);

      const release = targets.get("release")!;
      assert.equal(release.path, fixture.release_mixlab_root);
      assert.equal(release.size_bytes, RELEASE_BYTES);
      assert.equal(release.file_count, 1);
      assert.equal(release.deletable, false);
      assert.equal(release.deletable_bytes, 0);
      assert.ok(release.reason);

      assert.equal(
        inventory.expected_bytes,
        SEARCHD_BYTES + THUMBNAIL_BYTES + SOURCE_VIDEO_BYTES + CUT_TEMP_BYTES
      );
      assert.equal(typeof inventory.confirm_token, "string");
      assert.ok(inventory.confirm_token.length >= 16);
      assert.deepEqual(inventory.protected, []);

      const warningCodes = inventory.warnings.map((warning) => warning.code);
      assert.ok(warningCodes.includes("release_cache_deferred"));
      assert.ok(warningCodes.includes("thumbnail_manifest_preserved"));
    });
  });
});

test("cache clean removes disk cache and invalidates the consumed confirm token", async () => {
  await withCacheFixture(async (fixture) => {
    await seedCacheFiles(fixture);

    await withCacheApi(fixture, async (context) => {
      const inventory = await readInventory(context);
      const requestBody = {
        targets: DELETABLE_TARGETS,
        confirm_token: inventory.confirm_token,
        expected_bytes: inventory.expected_bytes
      };

      const result = await readCleanResult(context, requestBody);
      assert.deepEqual(result.cleaned, DELETABLE_TARGETS);
      assert.equal(result.freed_bytes, inventory.expected_bytes);
      assert.deepEqual(result.skipped, []);
      assert.deepEqual(result.errors, []);

      assert.equal(await fileOrDirExists(fixture.searchd_root), false);
      assert.equal(
        await fileOrDirExists(path.join(fixture.thumbnail_root, "V000001-cover.webp")),
        false
      );
      assert.equal(await fileOrDirExists(path.join(fixture.thumbnail_root, ".manifest.json")), true);
      assert.equal(
        await fileOrDirExists(path.join(fixture.source_video_root, "V000001-cached-bytes.mp4")),
        false
      );
      assert.equal(
        await fileOrDirExists(
          path.join(fixture.cut_temp_root, "CJ20260101-0001-E000001-temp.mp4")
        ),
        false
      );

      const replay = await postCleanRequest(context, requestBody);
      assert.equal(replay.status, 409);
      assert.equal(
        (await readError(replay)).code,
        CACHE_MAINTENANCE_ERROR_CODES.cache_confirm_invalid
      );
    });
  });
});

test("cache clean supports a subset of the inventory targets", async () => {
  await withCacheFixture(async (fixture) => {
    await seedCacheFiles(fixture);

    await withCacheApi(fixture, async (context) => {
      const inventory = await readInventory(context, "searchd,thumbnail");
      assert.equal(inventory.expected_bytes, SEARCHD_BYTES + THUMBNAIL_BYTES);

      const result = await readCleanResult(context, {
        targets: ["thumbnail"],
        confirm_token: inventory.confirm_token,
        expected_bytes: THUMBNAIL_BYTES
      });

      assert.deepEqual(result.cleaned, ["thumbnail"]);
      assert.equal(result.freed_bytes, THUMBNAIL_BYTES);
      assert.equal(
        await fileOrDirExists(path.join(fixture.thumbnail_root, "V000001-cover.webp")),
        false
      );
      assert.equal(
        await fileOrDirExists(path.join(fixture.searchd_root, "tantivy", "v000001", "segment.idx")),
        true
      );
    });
  });
});

test("cache clean rejects unknown targets with cache_target_unknown", async () => {
  await withCacheFixture(async (fixture) => {
    await seedCacheFiles(fixture);

    await withCacheApi(fixture, async (context) => {
      const inventoryResponse = await getInventoryRequest(context, "searchd,unknown_target");
      assert.equal(inventoryResponse.status, 400);
      assert.equal(
        (await readError(inventoryResponse)).code,
        CACHE_MAINTENANCE_ERROR_CODES.cache_target_unknown
      );

      const cleanResponse = await postCleanRequest(context, {
        targets: ["unknown_target"],
        confirm_token: "not-a-real-token",
        expected_bytes: 0
      });
      assert.equal(cleanResponse.status, 400);
      assert.equal(
        (await readError(cleanResponse)).code,
        CACHE_MAINTENANCE_ERROR_CODES.cache_target_unknown
      );
      assert.equal(
        await fileOrDirExists(path.join(fixture.searchd_root, "tantivy", "v000001", "segment.idx")),
        true
      );
    });
  });
});

test("cache clean rejects stale expected bytes without deleting files", async () => {
  await withCacheFixture(async (fixture) => {
    await seedCacheFiles(fixture);

    await withCacheApi(fixture, async (context) => {
      const inventory = await readInventory(context);
      const response = await postCleanRequest(context, {
        targets: DELETABLE_TARGETS,
        confirm_token: inventory.confirm_token,
        expected_bytes: inventory.expected_bytes + 1
      });

      assert.equal(response.status, 409);
      const error = await readError(response);
      assert.equal(error.code, CACHE_MAINTENANCE_ERROR_CODES.cache_expected_bytes_mismatch);
      assert.equal(typeof error.remediation, "string");

      assert.equal(
        await fileOrDirExists(path.join(fixture.searchd_root, "tantivy", "v000001", "segment.idx")),
        true
      );
      assert.equal(
        await fileOrDirExists(
          path.join(fixture.cut_temp_root, "CJ20260101-0001-E000001-temp.mp4")
        ),
        true
      );
    });
  });
});

test("cache clean preserves the thumbnail cache manifest file", async () => {
  await withCacheFixture(async (fixture) => {
    await seedCacheFiles(fixture);

    await withCacheApi(fixture, async (context) => {
      const inventory = await readInventory(context, "thumbnail");
      const result = await readCleanResult(context, {
        targets: ["thumbnail"],
        confirm_token: inventory.confirm_token,
        expected_bytes: THUMBNAIL_BYTES
      });

      assert.deepEqual(result.cleaned, ["thumbnail"]);
      assert.equal(result.freed_bytes, THUMBNAIL_BYTES);
      assert.equal(
        await fileOrDirExists(path.join(fixture.thumbnail_root, "V000001-cover.webp")),
        false
      );
      const manifest = await readFile(path.join(fixture.thumbnail_root, ".manifest.json"), "utf8");
      assert.equal(manifest, THUMBNAIL_MANIFEST_CONTENT);
    });
  });
});

test("cache clean skips pinned cache files and reports them as protected", async () => {
  await withCacheFixture(async (fixture) => {
    await seedCacheFiles(fixture);
    const pinnedPath = path.join(fixture.cut_temp_root, "CJ20260101-0002-E000001-pinned.mp4");
    await writeBytes(pinnedPath, 77);
    const releasePin = pinCachePath(pinnedPath);

    try {
      await withCacheApi(fixture, async (context) => {
        const inventory = await readInventory(context, "cut_temp");
        const cutTemp = inventoryTargets(inventory).get("cut_temp")!;
        assert.equal(cutTemp.deletable, true);
        assert.equal(cutTemp.deletable_bytes, CUT_TEMP_BYTES);
        assert.ok(
          inventory.protected.some(
            (item) => item.kind === "pinned_cache" && item.ref_id.includes("pinned.mp4")
          )
        );

        const result = await readCleanResult(context, {
          targets: ["cut_temp"],
          confirm_token: inventory.confirm_token,
          expected_bytes: inventory.expected_bytes
        });

        assert.deepEqual(result.cleaned, ["cut_temp"]);
        assert.equal(result.freed_bytes, CUT_TEMP_BYTES);
        assert.ok(
          result.skipped.some(
            (item) => item.id === "cut_temp" && item.reason.includes("已 pin")
          )
        );
        assert.equal(await fileOrDirExists(pinnedPath), true);
        assert.equal(
          await fileOrDirExists(
            path.join(fixture.cut_temp_root, "CJ20260101-0001-E000001-temp.mp4")
          ),
          false
        );
      });
    } finally {
      releasePin();
    }
  });
});

test("cache clean defers release cache deletion to the release eviction endpoint", async () => {
  await withCacheFixture(async (fixture) => {
    await seedCacheFiles(fixture);

    await withCacheApi(fixture, async (context) => {
      const inventory = await readInventory(context);
      const result = await readCleanResult(context, {
        targets: ["release"],
        confirm_token: inventory.confirm_token,
        expected_bytes: 0
      });

      assert.deepEqual(result.cleaned, []);
      assert.equal(result.freed_bytes, 0);
      assert.equal(result.skipped.length, 1);
      assert.equal(result.skipped[0]?.id, "release");
      assert.match(result.skipped[0]?.reason ?? "", /D4/);
      assert.equal(
        await fileOrDirExists(
          path.join(fixture.release_mixlab_root, "releases", "v000001", "release.json")
        ),
        true
      );
    });
  });
});

test("cache clean reports expired confirm tokens", async () => {
  await withCacheFixture(async (fixture) => {
    await seedCacheFiles(fixture);

    await withCacheApi(
      fixture,
      async (context) => {
        const inventory = await readInventory(context);
        await new Promise((resolve) => setTimeout(resolve, 25));

        const response = await postCleanRequest(context, {
          targets: DELETABLE_TARGETS,
          confirm_token: inventory.confirm_token,
          expected_bytes: inventory.expected_bytes
        });

        assert.equal(response.status, 409);
        assert.equal(
          (await readError(response)).code,
          CACHE_MAINTENANCE_ERROR_CODES.cache_confirm_expired
        );
        assert.equal(
          await fileOrDirExists(
            path.join(fixture.searchd_root, "tantivy", "v000001", "segment.idx")
          ),
          true
        );
      },
      { cache_confirm_ttl_ms: 1 }
    );
  });
});

test("cache inventory marks a file target as not writable and clean rejects it", async () => {
  await withCacheFixture(async (fixture) => {
    await mkdir(fixture.cache_root, { recursive: true });
    await writeFile(path.join(fixture.cache_root, "source-thumbnails"), "not-a-directory");

    await withCacheApi(fixture, async (context) => {
      const inventory = await readInventory(context, "thumbnail");
      const thumbnail = inventoryTargets(inventory).get("thumbnail")!;
      assert.equal(thumbnail.writable, false);
      assert.equal(thumbnail.deletable, false);
      assert.equal(thumbnail.deletable_bytes, 0);
      assert.equal(inventory.expected_bytes, 0);
      assert.ok(thumbnail.reason);

      const response = await postCleanRequest(context, {
        targets: ["thumbnail"],
        confirm_token: inventory.confirm_token,
        expected_bytes: 0
      });

      assert.equal(response.status, 403);
      assert.equal(
        (await readError(response)).code,
        CACHE_MAINTENANCE_ERROR_CODES.cache_path_not_writable
      );
      assert.equal(
        await fileOrDirExists(path.join(fixture.cache_root, "source-thumbnails")),
        true
      );
    });
  });
});

test("cache clean rejects concurrent requests with cache_busy", async () => {
  await withCacheFixture(async (fixture) => {
    await seedCacheFiles(fixture);

    await withCacheApi(fixture, async (context) => {
      const inventory = await readInventory(context);
      const releaseBusy = context.service.tryBeginClean();
      assert.ok(releaseBusy);

      try {
        const busyResponse = await postCleanRequest(context, {
          targets: ["searchd"],
          confirm_token: inventory.confirm_token,
          expected_bytes: SEARCHD_BYTES
        });
        assert.equal(busyResponse.status, 409);
        assert.equal(
          (await readError(busyResponse)).code,
          CACHE_MAINTENANCE_ERROR_CODES.cache_busy
        );
      } finally {
        releaseBusy();
      }

      assert.equal(
        await fileOrDirExists(path.join(fixture.searchd_root, "tantivy", "v000001", "segment.idx")),
        true
      );

      const result = await readCleanResult(context, {
        targets: ["searchd"],
        confirm_token: inventory.confirm_token,
        expected_bytes: SEARCHD_BYTES
      });
      assert.deepEqual(result.cleaned, ["searchd"]);
      assert.equal(result.freed_bytes, SEARCHD_BYTES);
      assert.equal(await fileOrDirExists(fixture.searchd_root), false);
    });
  });
});
