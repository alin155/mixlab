import assert from "node:assert/strict";
import test from "node:test";
import {
  handleAdminIndexCommandRoutes,
  matchAdminIndexRepairPath,
  type AdminIndexCommandRouteDeps,
  type AdminIndexRepairRouteCommandInput
} from "./admin-index-command-routes.ts";

interface TestApiInput {
  library_root: string;
  request_id: string;
}

interface TestIndexRepairResult {
  published_count: number;
  skipped_count: number;
  affected_count: number;
  published_source_video_ids: string[];
  message: string;
}

type TestDeps = AdminIndexCommandRouteDeps<TestApiInput, TestIndexRepairResult>;

function makeDeps(overrides: Partial<TestDeps> = {}): TestDeps {
  return {
    run_index_repair_command: async () => ({
      published_count: 1,
      skipped_count: 0,
      affected_count: 1,
      published_source_video_ids: ["V000001"],
      message: "已发布 1 个原视频，当前可用 1 个。"
    }),
    clear_source_video_page_cache: () => undefined,
    ...overrides
  };
}

function callRoute(input: {
  method?: string;
  pathname: string;
  deps?: TestDeps;
}) {
  return handleAdminIndexCommandRoutes({
    method: input.method ?? "POST",
    pathname: input.pathname,
    api_input: {
      library_root: "/tmp/PublicLibrary",
      request_id: "req-1"
    },
    deps: input.deps ?? makeDeps()
  });
}

test("index command routes match only the repair endpoint", async () => {
  assert.equal(matchAdminIndexRepairPath("/api/admin/index/repair"), true);
  assert.equal(matchAdminIndexRepairPath("/api/admin/index/repair/now"), false);
  assert.equal(matchAdminIndexRepairPath("/api/admin/index/versions"), false);

  assert.deepEqual(await callRoute({
    method: "GET",
    pathname: "/api/admin/index/repair"
  }), {
    handled: false
  });
  assert.deepEqual(await callRoute({
    pathname: "/api/admin/index/versions"
  }), {
    handled: false
  });
});

test("index repair route dispatches through injected command service and clears source-video caches", async () => {
  const calls: Array<AdminIndexRepairRouteCommandInput<TestApiInput>> = [];
  const cleared: string[] = [];
  const result = await callRoute({
    pathname: "/api/admin/index/repair",
    deps: makeDeps({
      run_index_repair_command: async (input) => {
        calls.push(input);
        return {
          published_count: 2,
          skipped_count: 1,
          affected_count: 2,
          published_source_video_ids: ["V000001", "V000002"],
          message: "已发布 2 个原视频，当前可用 2 个。"
        };
      },
      clear_source_video_page_cache: (libraryRoot) => {
        cleared.push(libraryRoot);
      }
    })
  });

  assert.equal(result.handled, true);
  if (!result.handled) {
    return;
  }

  assert.deepEqual(calls, [
    {
      api_input: {
        library_root: "/tmp/PublicLibrary",
        request_id: "req-1"
      }
    }
  ]);
  assert.deepEqual(cleared, ["/tmp/PublicLibrary"]);
  assert.equal(result.status_code, 200);
  assert.deepEqual(result.body, {
    ok: true,
    data: {
      published_count: 2,
      skipped_count: 1,
      affected_count: 2,
      published_source_video_ids: ["V000001", "V000002"],
      message: "已发布 2 个原视频，当前可用 2 个。"
    }
  });
});

test("index repair route leaves caches untouched when command fails", async () => {
  let clearCalls = 0;
  await assert.rejects(
    () => callRoute({
      pathname: "/api/admin/index/repair",
      deps: makeDeps({
        run_index_repair_command: async () => {
          throw new Error("publish command failed");
        },
        clear_source_video_page_cache: () => {
          clearCalls += 1;
        }
      })
    }),
    /publish command failed/
  );
  assert.equal(clearCalls, 0);
});
