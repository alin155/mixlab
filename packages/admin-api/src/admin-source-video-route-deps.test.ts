import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAdminRuntimeEndpointMeta,
  type AdminRuntimeEndpointMeta
} from "./admin-runtime-observability.ts";
import {
  createAdminSourceVideoRouteDeps,
  createAdminSourceVideoRouteServerDeps
} from "./admin-source-video-route-deps.ts";
import type { AdminSourceVideoRouteListInput } from "./admin-source-video-routes.ts";

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
}

function runtimeMeta(): AdminRuntimeEndpointMeta {
  return buildAdminRuntimeEndpointMeta({
    endpoint: "/api/admin/source-videos",
    method: "GET",
    started_at_ms: 1,
    finished_at_ms: 2,
    scan_mode: "paged-list",
    data_source: "admin-read-model",
    scan_reason: "route-owned-page",
    actual_data_source: "admin-read-model",
    cache_status: "hit",
    result_count: 1,
    offset: 0,
    limit: 20
  });
}

test("source-video route deps preserve status validation and injected readers", async () => {
  let listInput: AdminSourceVideoRouteListInput | undefined;
  const recordedDiagnostics: Array<{
    library_root: string;
    endpoint: string;
  }> = [];
  const deps = createAdminSourceVideoRouteDeps<TestManifest, TestPublicSourceVideo, TestDetail>({
    async read_source_video_list(input) {
      listInput = input;
      return {
        manifests: [{
          source_video_id: "V000001",
          title: "第一条"
        }],
        actual_data_source: "admin-read-model",
        cache_status: "hit"
      };
    },
    to_public_source_video(manifest) {
      return {
        id: manifest.source_video_id,
        title: manifest.title
      };
    },
    read_source_video_detail: async (_libraryRoot, sourceVideoId) => ({
      source_video_id: sourceVideoId
    }),
    record_runtime_diagnostic(libraryRoot, runtime) {
      recordedDiagnostics.push({
        library_root: libraryRoot,
        endpoint: runtime.endpoint
      });
    }
  });

  assert.equal(deps.is_source_video_status("ready"), true);
  assert.equal(deps.is_source_video_status("index-required"), true);
  assert.equal(deps.is_source_video_status("unknown"), false);

  const list = await deps.read_source_video_list({
    library_root: "/tmp/PublicLibrary",
    offset: 2,
    limit: 20,
    query: "现金",
    status: "ready"
  });
  const detail = await deps.read_source_video_detail("/tmp/PublicLibrary", "V000001");
  await deps.record_runtime_diagnostic?.("/tmp/PublicLibrary", runtimeMeta());

  assert.deepEqual(listInput, {
    library_root: "/tmp/PublicLibrary",
    offset: 2,
    limit: 20,
    query: "现金",
    status: "ready"
  });
  assert.deepEqual(list.manifests.map(deps.to_public_source_video), [{
    id: "V000001",
    title: "第一条"
  }]);
  assert.deepEqual(detail, {
    source_video_id: "V000001"
  });
  assert.deepEqual(recordedDiagnostics, [{
    library_root: "/tmp/PublicLibrary",
    endpoint: "/api/admin/source-videos"
  }]);
});

test("source-video route server deps wire direct services and projections", async () => {
  let listInput: AdminSourceVideoRouteListInput | undefined;
  const detailInputs: Array<{
    library_root: string;
    source_video_id: string;
  }> = [];
  const diagnostics: Array<{
    library_root: string;
    endpoint: string;
  }> = [];

  const deps = createAdminSourceVideoRouteServerDeps<TestManifest, TestPublicSourceVideo, TestDetail>({
    async read_source_video_list_service(input) {
      listInput = input;
      return {
        manifests: [{
          source_video_id: "V000002",
          title: "第二条"
        }],
        actual_data_source: "admin-read-model",
        cache_status: "miss"
      };
    },
    project_public_source_video(manifest) {
      return {
        id: manifest.source_video_id,
        title: manifest.title
      };
    },
    async read_source_video_detail_service(libraryRoot, sourceVideoId) {
      detailInputs.push({
        library_root: libraryRoot,
        source_video_id: sourceVideoId
      });
      return {
        source_video_id: sourceVideoId
      };
    },
    record_runtime_diagnostic(libraryRoot, runtime) {
      diagnostics.push({
        library_root: libraryRoot,
        endpoint: runtime.endpoint
      });
    }
  });

  assert.equal(deps.is_source_video_status("processing"), true);
  assert.equal(deps.is_source_video_status("not-real"), false);

  const list = await deps.read_source_video_list({
    library_root: "/tmp/PublicLibrary",
    offset: 4,
    limit: 10,
    query: "第二",
    status: "processing",
    disable_store_repair: true
  });
  const detail = await deps.read_source_video_detail("/tmp/PublicLibrary", "V000002");
  await deps.record_runtime_diagnostic?.("/tmp/PublicLibrary", runtimeMeta());

  assert.deepEqual(listInput, {
    library_root: "/tmp/PublicLibrary",
    offset: 4,
    limit: 10,
    query: "第二",
    status: "processing",
    disable_store_repair: true
  });
  assert.deepEqual(list.manifests.map(deps.to_public_source_video), [{
    id: "V000002",
    title: "第二条"
  }]);
  assert.deepEqual(detail, {
    source_video_id: "V000002"
  });
  assert.deepEqual(detailInputs, [{
    library_root: "/tmp/PublicLibrary",
    source_video_id: "V000002"
  }]);
  assert.deepEqual(diagnostics, [{
    library_root: "/tmp/PublicLibrary",
    endpoint: "/api/admin/source-videos"
  }]);
});
