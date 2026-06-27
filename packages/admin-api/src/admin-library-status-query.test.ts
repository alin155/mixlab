import assert from "node:assert/strict";
import test from "node:test";
import type { SourceVideoManifest } from "../../protocol/src/index.ts";
import {
  adminLibraryIndexStatus,
  countAdminLibraryStatusByPreprocessStatus,
  getAdminLibraryStatus
} from "./admin-library-status-query.ts";

function manifest(
  sourceVideoId: string,
  preprocessStatus: SourceVideoManifest["preprocess_status"]
): SourceVideoManifest {
  return {
    source_video_id: sourceVideoId,
    preprocess_status: preprocessStatus
  } as SourceVideoManifest;
}

test("library status query counts manifests and reports active processing row", async () => {
  const status = await getAdminLibraryStatus({
    library_root: "/tmp/mixlab-library-status",
    library_id: "lib_test",
    library_name: "测试素材库",
    now: () => "2026-06-27T00:00:00.000Z",
    deps: {
      async read_library_manifest() {
        return null;
      },
      async read_source_video_manifests() {
        return [
          manifest("V000001", "ready"),
          manifest("V000002", "processing"),
          manifest("V000003", "index-required")
        ];
      },
      async read_current_index_version() {
        return "v000001";
      },
      async read_primary_source_videos_path() {
        return "/tmp/source-videos";
      },
      mixlab_library_path() {
        return "/tmp/mixlab-library-status/.mixlab-library";
      },
      async disk_usage() {
        return {
          total: 1000,
          available: 250
        };
      }
    }
  });

  assert.equal(status.library_id, "lib_test");
  assert.equal(status.name, "测试素材库");
  assert.equal(status.video_count, 3);
  assert.equal(status.ready_video_count, 1);
  assert.equal(status.processing_video_count, 1);
  assert.equal(status.index_required_video_count, 1);
  assert.equal(status.index_status, "needs-publish");
  assert.equal(status.active_task_label, "V000002 - processing");
  assert.equal(status.updated_at, "2026-06-27T00:00:00.000Z");
  assert.equal(status.disk_total_bytes, 1000);
  assert.equal(status.disk_available_bytes, 250);
});

test("library status query uses library manifest counts and schedules non-ready refresh", async () => {
  const refreshCalls: string[] = [];
  const status = await getAdminLibraryStatus({
    library_root: "/tmp/mixlab-library-status-manifest",
    deps: {
      async read_library_manifest() {
        return {
          library_id: "lib_manifest",
          name: "Manifest 素材库",
          version: "1.1",
          updated_at: "2026-06-26T10:00:00.000Z",
          video_count: 4,
          ready_video_count: 2,
          processing_video_count: 2,
          queued_video_count: 0,
          unprocessed_video_count: 0,
          failed_video_count: 0,
          index_required_video_count: 0
        };
      },
      async read_source_video_manifests() {
        throw new Error("manifest counts should avoid full manifest scan");
      },
      async read_current_index_version() {
        return "v000004";
      },
      async read_primary_source_videos_path() {
        return "/tmp/source-videos";
      },
      mixlab_library_path(libraryRoot) {
        return `${libraryRoot}/.mixlab-library`;
      },
      async disk_usage() {
        return {
          total: 0,
          available: 0
        };
      },
      on_non_ready_counts_from_manifest(libraryRoot) {
        refreshCalls.push(libraryRoot);
      }
    }
  });

  assert.equal(status.library_id, "lib_manifest");
  assert.equal(status.protocol_version, "1.1");
  assert.equal(status.active_task_label, "2 个任务正在处理");
  assert.deepEqual(refreshCalls, ["/tmp/mixlab-library-status-manifest"]);
});

test("library status helper classifies counts and index state", () => {
  assert.deepEqual(
    countAdminLibraryStatusByPreprocessStatus([
      manifest("V000001", "ready"),
      manifest("V000002", "failed"),
      manifest("V000003", "queued")
    ]),
    {
      video_count: 3,
      ready_video_count: 1,
      processing_video_count: 0,
      queued_video_count: 1,
      unprocessed_video_count: 0,
      failed_video_count: 1,
      index_required_video_count: 0
    }
  );

  assert.equal(
    adminLibraryIndexStatus({
      current_version: "",
      ready_video_count: 1,
      index_required_video_count: 0
    }),
    "error"
  );
});
