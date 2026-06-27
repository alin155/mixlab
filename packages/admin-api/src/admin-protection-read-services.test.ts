import assert from "node:assert/strict";
import test from "node:test";
import type {
  PreprocessSafetyStatus,
  UsageMetrics
} from "../../library-fs/src/index.ts";
import { createAdminProtectionReadServices } from "./admin-protection-read-services.ts";

interface TestApiInput {
  library_root: string;
  now: () => string;
  env?: NodeJS.ProcessEnv;
  request_id: string;
}

function healthySafety(): PreprocessSafetyStatus {
  return {
    checked_at: "2026-06-27T00:00:00.000Z",
    safe_to_start: true,
    status: "healthy",
    disk: {
      total_bytes: 1000,
      available_bytes: 600,
      used_bytes: 400,
      usage_percent: 40,
      block_usage_percent: 92,
      status: "healthy",
      last_error: ""
    },
    processing: {
      checked: true,
      processing_count: 0,
      source_video_ids: []
    },
    blockers: []
  };
}

function usageMetrics(): UsageMetrics {
  return {
    search_request_count: 0,
    search_hit_count: 0,
    search_empty_count: 0,
    search_failure_count: 0,
    search_latency_p50_ms: 0,
    search_latency_p95_ms: 0,
    search_latency_max_ms: 0,
    searchd_search_count: 0,
    sqlite_index_search_count: 0,
    fallback_search_count: 0,
    search_backend_unknown_count: 0,
    core_search_request_count: 0,
    core_search_failure_count: 0,
    core_search_latency_p50_ms: 0,
    core_search_latency_p95_ms: 0,
    core_search_latency_max_ms: 0,
    core_searchd_search_count: 0,
    core_sqlite_index_search_count: 0,
    core_fallback_search_count: 0,
    core_search_backend_unknown_count: 0,
    source_detail_view_count: 0,
    transcript_selection_count: 0,
    add_to_cut_list_count: 0,
    cut_submission_count: 0,
    cut_success_count: 0,
    cut_failure_count: 0,
    local_clip_count: 0,
    reuse_local_clip_count: 0,
    active_user_count: 0,
    recent_keywords: [],
    most_used_source_video_ids: [],
    users: [],
    event_store: {
      line_count: 0,
      valid_line_count: 0,
      malformed_line_count: 0,
      malformed_lines: [],
      warning: ""
    }
  };
}

test("protection read services assemble protection, release, and path-check queries", async () => {
  const calls: string[] = [];
  const services = createAdminProtectionReadServices<TestApiInput, {
    ready_video_count: number;
    index_required_video_count: number;
    current_index_version: string;
  }>({
    async read_library_manifest(libraryRoot) {
      calls.push(`manifest:${libraryRoot}`);
      return {
        video_count: 4,
        ready_video_count: 2,
        processing_video_count: 1,
        queued_video_count: 1,
        failed_video_count: 0,
        unprocessed_video_count: 0,
        index_required_video_count: 1
      };
    },
    async read_current_index_version(libraryRoot) {
      calls.push(`current-index:${libraryRoot}`);
      return "v010471";
    },
    async read_primary_source_videos_path(libraryRoot) {
      calls.push(`source-path:${libraryRoot}`);
      return `${libraryRoot}/source-videos`;
    },
    async read_library_status(input) {
      calls.push(`library-status:${input.request_id}:${input.library_root}`);
      return {
        ready_video_count: 2,
        index_required_video_count: 1,
        current_index_version: "v010471"
      };
    },
    async read_preprocess_safety(input) {
      calls.push(`safety:${input.api_input.request_id}:${input.include_processing_guard}`);
      return healthySafety();
    },
    async read_usage_metrics(libraryRoot) {
      calls.push(`usage:${libraryRoot}`);
      return usageMetrics();
    },
    async read_settings_config(libraryRoot) {
      calls.push(`settings:${libraryRoot}`);
      return {
        source_folders: [{
          name: "默认素材",
          path: `${libraryRoot}/source-videos`,
          enabled: true
        }]
      };
    },
    mixlab_library_path(libraryRoot) {
      calls.push(`mixlab-root:${libraryRoot}`);
      return `${libraryRoot}/.mixlab-library`;
    },
    library_manifest_path(libraryRoot) {
      calls.push(`library-json:${libraryRoot}`);
      return `${libraryRoot}/.mixlab-library/library.json`;
    }
  });

  const apiInput = {
    library_root: "/tmp/PublicLibrary",
    request_id: "req-203",
    now: () => "2026-06-27T00:00:00.000Z",
    env: {
      MIXLAB_BUILD_SHA: "sha-r203",
      MIXLAB_BUILD_VERSION: "r203"
    } as NodeJS.ProcessEnv
  };

  const protection = await services.read_protection_status(apiInput);
  const release = await services.read_release_gates(apiInput);
  const checks = await services.read_path_checks(apiInput.library_root);

  assert.equal(protection.ready_video_count, 2);
  assert.equal(protection.current_index_version, "v010471");
  assert.equal(release.runtime.source_videos_path, "/tmp/PublicLibrary/source-videos");
  assert.equal(release.build.sha, "sha-r203");
  assert.equal(typeof release.release_allowed, "boolean");
  assert.equal(checks.some((check) => check.label === "素材来源：默认素材"), true);
  assert.deepEqual(calls, [
    "manifest:/tmp/PublicLibrary",
    "current-index:/tmp/PublicLibrary",
    "source-path:/tmp/PublicLibrary",
    "library-status:req-203:/tmp/PublicLibrary",
    "safety:req-203:true",
    "usage:/tmp/PublicLibrary",
    "settings:/tmp/PublicLibrary",
    "mixlab-root:/tmp/PublicLibrary",
    "library-json:/tmp/PublicLibrary"
  ]);
});
