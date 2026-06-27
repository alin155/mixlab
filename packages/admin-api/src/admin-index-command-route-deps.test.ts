import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminIndexCommandRouteDeps,
  createAdminIndexCommandRouteServerDeps
} from "./admin-index-command-route-deps.ts";

interface TestApiInput {
  library_root: string;
  request_id: string;
}

interface TestMedia {
  cover: string;
}

interface TestIndexRepairResult {
  affected_count: number;
  published_source_video_ids: string[];
}

interface TestActor {
  id: string;
}

test("index command route deps preserve repair command context and cache helpers", async () => {
  const actor: TestActor = { id: "admin-1" };
  const media: TestMedia = { cover: "ready-publish-media" };
  const now = () => "2026-06-26T23:50:01.000Z";
  const calls: Array<{ name: string; input: unknown }> = [];
  const clearedIndexVersions: string[] = [];
  const clearedSourceVideos: string[] = [];

  const deps = createAdminIndexCommandRouteDeps<
    TestApiInput,
    TestMedia,
    TestIndexRepairResult,
    TestActor
  >({
    library_id: "mixlab",
    command_now: "2026-06-26T23:50:00.000Z",
    actor,
    now,
    media,
    async run_index_repair_command(input) {
      calls.push({
        name: "repair",
        input: {
          ...input,
          invalidate_index_version_cache: "function"
        }
      });
      input.invalidate_index_version_cache();
      return {
        affected_count: 2,
        published_source_video_ids: ["V000001", "V000002"]
      };
    },
    clear_index_version_cache(libraryRoot) {
      clearedIndexVersions.push(libraryRoot);
    },
    clear_source_video_page_cache(libraryRoot) {
      clearedSourceVideos.push(libraryRoot);
    }
  });

  const apiInput = {
    library_root: "/tmp/PublicLibrary",
    request_id: "req-1"
  };
  const result = await deps.run_index_repair_command({
    api_input: apiInput
  });
  deps.clear_source_video_page_cache(apiInput.library_root);

  assert.deepEqual(result, {
    affected_count: 2,
    published_source_video_ids: ["V000001", "V000002"]
  });
  assert.deepEqual(clearedIndexVersions, ["/tmp/PublicLibrary"]);
  assert.deepEqual(clearedSourceVideos, ["/tmp/PublicLibrary"]);
  assert.deepEqual(calls, [
    {
      name: "repair",
      input: {
        library_root: "/tmp/PublicLibrary",
        library_id: "mixlab",
        command_now: "2026-06-26T23:50:00.000Z",
        actor,
        now,
        media,
        invalidate_index_version_cache: "function"
      }
    }
  ]);
});

test("index command route deps leave cache invalidation under command control", async () => {
  const clearedIndexVersions: string[] = [];
  const deps = createAdminIndexCommandRouteDeps<
    TestApiInput,
    TestMedia,
    TestIndexRepairResult,
    TestActor
  >({
    library_id: "mixlab",
    command_now: "2026-06-26T23:51:00.000Z",
    media: {
      cover: "ready-publish-media"
    },
    async run_index_repair_command() {
      return {
        affected_count: 0,
        published_source_video_ids: []
      };
    },
    clear_index_version_cache(libraryRoot) {
      clearedIndexVersions.push(libraryRoot);
    },
    clear_source_video_page_cache() {
      return undefined;
    }
  });

  await deps.run_index_repair_command({
    api_input: {
      library_root: "/tmp/PublicLibrary",
      request_id: "req-1"
    }
  });

  assert.deepEqual(clearedIndexVersions, []);
});

test("index command route server deps wire direct repair service and cache helpers", async () => {
  const actor: TestActor = { id: "admin-2" };
  const media: TestMedia = { cover: "ready-publish-media-v2" };
  const now = () => "2026-06-27T04:20:01.000Z";
  const calls: Array<{ name: string; input: unknown }> = [];
  const clearedIndexVersions: string[] = [];
  const clearedSourceVideos: string[] = [];

  const deps = createAdminIndexCommandRouteServerDeps<
    TestApiInput,
    TestMedia,
    TestIndexRepairResult,
    TestActor
  >({
    library_id: "mixlab",
    command_now: "2026-06-27T04:20:00.000Z",
    actor,
    now,
    media,
    async run_index_repair_service(input) {
      calls.push({
        name: "repair-service",
        input: {
          ...input,
          invalidate_index_version_cache: "function"
        }
      });
      input.invalidate_index_version_cache();
      return {
        affected_count: 1,
        published_source_video_ids: ["V000003"]
      };
    },
    clear_index_version_cache(libraryRoot) {
      clearedIndexVersions.push(libraryRoot);
    },
    clear_source_video_page_cache(libraryRoot) {
      clearedSourceVideos.push(libraryRoot);
    }
  });

  const apiInput = {
    library_root: "/tmp/PublicLibrary",
    request_id: "req-2"
  };
  const result = await deps.run_index_repair_command({
    api_input: apiInput
  });
  deps.clear_source_video_page_cache(apiInput.library_root);

  assert.deepEqual(result, {
    affected_count: 1,
    published_source_video_ids: ["V000003"]
  });
  assert.deepEqual(clearedIndexVersions, ["/tmp/PublicLibrary"]);
  assert.deepEqual(clearedSourceVideos, ["/tmp/PublicLibrary"]);
  assert.deepEqual(calls, [
    {
      name: "repair-service",
      input: {
        library_root: "/tmp/PublicLibrary",
        library_id: "mixlab",
        command_now: "2026-06-27T04:20:00.000Z",
        actor,
        now,
        media,
        invalidate_index_version_cache: "function"
      }
    }
  ]);
});
