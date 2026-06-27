import assert from "node:assert/strict";
import test from "node:test";
import type { PreprocessStatus } from "../../protocol/src/index.ts";
import {
  handleAdminSourceVideoRoutes,
  type AdminSourceVideoRouteDeps,
  type AdminSourceVideoRouteListInput
} from "./admin-source-video-routes.ts";

interface TestManifest {
  source_video_id: string;
  title: string;
}

interface TestPublicSourceVideo {
  id: string;
  title: string;
}

interface TestDetail {
  source_video_id: string;
  transcript_segment_count: number;
}

const statuses = new Set<PreprocessStatus>([
  "unprocessed",
  "queued",
  "processing",
  "ready",
  "failed",
  "index-required"
]);

function makeDeps(overrides: Partial<AdminSourceVideoRouteDeps<TestManifest, TestPublicSourceVideo, TestDetail>> = {}) {
  const deps: AdminSourceVideoRouteDeps<TestManifest, TestPublicSourceVideo, TestDetail> = {
    is_source_video_status(value): value is PreprocessStatus {
      return statuses.has(value as PreprocessStatus);
    },
    read_source_video_list: async () => ({
      manifests: [
        {
          source_video_id: "V000001",
          title: "第一条"
        }
      ],
      actual_data_source: "admin-read-model",
      cache_status: "hit"
    }),
    to_public_source_video(manifest) {
      return {
        id: manifest.source_video_id,
        title: manifest.title
      };
    },
    read_source_video_detail: async (_libraryRoot, sourceVideoId) => ({
      source_video_id: sourceVideoId,
      transcript_segment_count: 3
    }),
    ...overrides
  };
  return deps;
}

async function callRoute(input: {
  method?: string;
  pathname: string;
  query?: string;
  disable_store_repair?: boolean;
  deps?: AdminSourceVideoRouteDeps<TestManifest, TestPublicSourceVideo, TestDetail>;
}) {
  return handleAdminSourceVideoRoutes({
    method: input.method ?? "GET",
    pathname: input.pathname,
    search_params: new URLSearchParams(input.query ?? ""),
    disable_store_repair: input.disable_store_repair,
    api_input: {
      library_root: "/tmp/PublicLibrary"
    },
    deps: input.deps ?? makeDeps()
  });
}

test("source-video route handles paged list parameters and runtime metadata", async () => {
  let captured: AdminSourceVideoRouteListInput | undefined;
  const runtimeSamples = [10, 2_520];
  const result = await callRoute({
    pathname: "/api/admin/source-videos",
    query: "query=%E7%8E%B0%E9%87%91&status=index-required&limit=999&offset=2",
    deps: makeDeps({
      runtime_now_ms: () => runtimeSamples.shift() ?? 2_520,
      read_source_video_list: async (input) => {
        captured = input;
        return {
          manifests: [
            {
              source_video_id: "V000019",
              title: "现金流课程"
            }
          ],
          actual_data_source: "current-index",
          cache_status: "hit",
          fallback_reason: "status-store:store-not-fresh",
          component_timings: [
            {
              name: "library_counts",
              duration_ms: 3,
              data_source: "library-manifest",
              scan_mode: "no-scan",
              scan_reason: "shell-summary",
              cache_status: "not-applicable"
            },
            {
              name: "status_store_page",
              duration_ms: 20,
              data_source: "admin-read-model",
              scan_mode: "paged-list",
              scan_reason: "route-owned-page",
              cache_status: "miss",
              detail: "status=index-required"
            }
          ]
        };
      }
    })
  });

  assert.equal(result.handled, true);
  if (!result.handled) {
    return;
  }

  assert.equal(result.status_code, 200);
  assert.equal(result.body.ok, true);
  if (!result.body.ok) {
    return;
  }

  assert.deepEqual(result.body.data, [
    {
      id: "V000019",
      title: "现金流课程"
    }
  ]);
  assert.deepEqual(captured, {
    library_root: "/tmp/PublicLibrary",
    offset: 2,
    limit: 500,
    query: "现金",
    status: "index-required"
  });
  assert.equal(result.body.meta?.runtime.endpoint, "/api/admin/source-videos");
  assert.equal(result.body.meta?.runtime.method, "GET");
  assert.equal(result.body.meta?.runtime.scan_mode, "paged-list");
  assert.equal(result.body.meta?.runtime.data_source, "admin-read-model");
  assert.equal(result.body.meta?.runtime.scan_reason, "route-owned-page");
  assert.equal(result.body.meta?.runtime.actual_data_source, "current-index");
  assert.equal(result.body.meta?.runtime.cache_status, "hit");
  assert.equal(result.body.meta?.runtime.fallback_reason, "status-store:store-not-fresh");
  assert.equal(result.body.meta?.runtime.result_count, 1);
  assert.equal(result.body.meta?.runtime.offset, 2);
  assert.equal(result.body.meta?.runtime.limit, 500);
  assert.equal(result.body.meta?.runtime.slow, true);
  assert.equal(result.body.meta?.runtime.slow_reason, "source-video-status-page-above-target");
  assert.deepEqual(
    result.body.meta?.runtime.components?.map((component) => component.name),
    ["library_counts", "status_store_page"]
  );
  assert.equal(result.body.meta?.runtime.components?.[1]?.detail, "status=index-required");
});

test("source-video route forwards explicit no-repair probe mode to the list reader", async () => {
  let captured: AdminSourceVideoRouteListInput | undefined;
  const result = await callRoute({
    pathname: "/api/admin/source-videos",
    query: "status=processing&limit=20",
    disable_store_repair: true,
    deps: makeDeps({
      read_source_video_list: async (input) => {
        captured = input;
        return {
          manifests: [],
          actual_data_source: "source-video-manifest",
          cache_status: "miss",
          fallback_reason: "status-store:incomplete-manifest-rows"
        };
      }
    })
  });

  assert.equal(result.handled, true);
  assert.deepEqual(captured, {
    library_root: "/tmp/PublicLibrary",
    offset: 0,
    limit: 20,
    query: "",
    status: "processing",
    disable_store_repair: true
  });
});

test("source-video route forwards explicit manifest fallback policy to the list reader", async () => {
  let captured: AdminSourceVideoRouteListInput | undefined;
  const result = await callRoute({
    pathname: "/api/admin/source-videos",
    query: "status=processing&limit=20&manifest_fallback=forbid",
    deps: makeDeps({
      read_source_video_list: async (input) => {
        captured = input;
        return {
          manifests: [],
          actual_data_source: "admin-read-model",
          cache_status: "miss",
          fallback_reason: "manifest-fallback:forbidden"
        };
      }
    })
  });

  assert.equal(result.handled, true);
  assert.deepEqual(captured, {
    library_root: "/tmp/PublicLibrary",
    offset: 0,
    limit: 20,
    query: "",
    status: "processing",
    manifest_fallback_policy: "forbid"
  });

  if (result.handled && result.body.ok) {
    assert.equal(result.body.meta?.runtime.actual_data_source, "admin-read-model");
    assert.equal(result.body.meta?.runtime.cache_status, "miss");
    assert.equal(result.body.meta?.runtime.fallback_reason, "manifest-fallback:forbidden");
  }
});

test("source-video route carries read-model repair reason in runtime metadata", async () => {
  const result = await callRoute({
    pathname: "/api/admin/source-videos",
    query: "status=processing&limit=20",
    deps: makeDeps({
      read_source_video_list: async () => ({
        manifests: [
          {
            source_video_id: "V000020",
            title: "修复后命中"
          }
        ],
        actual_data_source: "admin-read-model",
        cache_status: "hit",
        repair_reason: "status-store:repaired-incomplete-manifest-rows"
      })
    })
  });

  assert.equal(result.handled, true);
  if (!result.handled || !result.body.ok) {
    return;
  }

  assert.equal(result.body.meta?.runtime.actual_data_source, "admin-read-model");
  assert.equal(result.body.meta?.runtime.cache_status, "hit");
  assert.equal(result.body.meta?.runtime.fallback_reason, "");
  assert.equal(result.body.meta?.runtime.repair_reason, "status-store:repaired-incomplete-manifest-rows");
});

test("source-video route records runtime diagnostics best-effort", async () => {
  const recorded: Array<{ libraryRoot: string; endpoint: string; cacheStatus: string }> = [];
  const result = await callRoute({
    pathname: "/api/admin/source-videos",
    query: "limit=1",
    deps: makeDeps({
      record_runtime_diagnostic: async (libraryRoot, runtime) => {
        recorded.push({
          libraryRoot,
          endpoint: runtime.endpoint,
          cacheStatus: runtime.cache_status
        });
      }
    })
  });

  assert.equal(result.handled, true);
  assert.deepEqual(recorded, [{
    libraryRoot: "/tmp/PublicLibrary",
    endpoint: "/api/admin/source-videos",
    cacheStatus: "hit"
  }]);

  const ignoredRecorderFailure = await callRoute({
    pathname: "/api/admin/source-videos",
    deps: makeDeps({
      record_runtime_diagnostic: () => {
        throw new Error("diagnostic write failed");
      }
    })
  });

  assert.equal(ignoredRecorderFailure.handled, true);
  if (ignoredRecorderFailure.handled) {
    assert.equal(ignoredRecorderFailure.status_code, 200);
  }
});

test("source-video route preserves absent limit as zero and ignores invalid status", async () => {
  let captured: AdminSourceVideoRouteListInput | undefined;
  const result = await callRoute({
    pathname: "/api/admin/source-videos",
    query: "status=unknown",
    deps: makeDeps({
      read_source_video_list: async (input) => {
        captured = input;
        return {
          manifests: [],
          actual_data_source: "admin-read-model",
          cache_status: "unknown"
        };
      }
    })
  });

  assert.equal(result.handled, true);
  if (!result.handled) {
    return;
  }

  assert.equal(result.status_code, 200);
  assert.equal(result.body.ok, true);
  assert.deepEqual(captured, {
    library_root: "/tmp/PublicLibrary",
    offset: 0,
    limit: 0,
    query: "",
    status: undefined
  });
  if (result.body.ok) {
    assert.equal(result.body.meta?.runtime.limit, 0);
    assert.equal(result.body.meta?.runtime.result_count, 0);
  }
});

test("source-video route handles detail found and missing states", async () => {
  const found = await callRoute({ pathname: "/api/admin/source-videos/V000123" });
  const missing = await callRoute({
    pathname: "/api/admin/source-videos/V000404",
    deps: makeDeps({
      read_source_video_detail: async () => null
    })
  });

  assert.equal(found.handled, true);
  assert.equal(missing.handled, true);

  if (found.handled) {
    assert.equal(found.status_code, 200);
    assert.deepEqual(found.body, {
      ok: true,
      data: {
        source_video_id: "V000123",
        transcript_segment_count: 3
      }
    });
  }

  if (missing.handled) {
    assert.equal(missing.status_code, 404);
    assert.deepEqual(missing.body, {
      ok: false,
      error_code: "not_found",
      message: "原视频不存在"
    });
  }
});

test("source-video route ignores unrelated routes and non-get methods", async () => {
  assert.deepEqual(await callRoute({ pathname: "/api/admin/source-videos/V000001/cover" }), {
    handled: false
  });
  assert.deepEqual(await callRoute({ method: "POST", pathname: "/api/admin/source-videos" }), {
    handled: false
  });
});
