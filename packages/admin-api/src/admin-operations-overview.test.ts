import assert from "node:assert/strict";
import test from "node:test";
import type { PreprocessSafetyStatus } from "../../library-fs/src/index.ts";
import type { AdminDataLoadingPlan } from "./admin-data-loading-plan.ts";
import type { AdminProtectionStatus } from "./admin-protection.ts";
import {
  buildAdminWorkerEnvProofReadiness,
  buildCutterCompatibilityProofReadiness,
  buildDiskSpaceProtectionReadiness,
  buildProcessingRecoveryReadiness,
  buildUsageEventsRepairReadiness,
  buildVersionHealthParityReadiness,
  type AdminReleaseGatesStatus
} from "./admin-release-gates.ts";
import { buildAdminOperationsOverview } from "./admin-operations-overview.ts";

function protectionStatus(): AdminProtectionStatus {
  return {
    checked_at: "2026-06-25T00:00:00.000Z",
    mode: "preprocess-protection-v1",
    ready_video_count: 10471,
    processing_video_count: 1,
    queued_video_count: 903,
    index_required_video_count: 19,
    current_index_version: "v010471",
    scan_apply_requires_preview: true,
    ready_asset_policy: {
      immutable_status: "ready",
      allowed_ready_mutations: ["metadata", "cover", "ready -> ready"],
      blocked_ready_mutations: ["ready -> queued"]
    },
    scan_preview_endpoint: "/api/admin/library/scan-preview",
    release_gates_endpoint: "/api/admin/release-gates"
  };
}

function dataLoadingPlan(): AdminDataLoadingPlan {
  return {
    schema_version: "1.0",
    generated_at: "2026-06-25T00:00:00.000Z",
    strategy: "shell-first-route-owned-v1",
    shell_interactive_target_ms: 1000,
    route_timeout_ms: 8000,
    background_prefetch_default: false,
    hidden_full_scan_allowed: false,
    endpoints: [],
    routes: []
  };
}

function releaseGatesStatus(): AdminReleaseGatesStatus {
  const usage_event_store = {
    line_count: 0,
    valid_line_count: 0,
    malformed_line_count: 0,
    malformed_lines: [],
    warning: ""
  };
  const usage_events_repair = buildUsageEventsRepairReadiness({
    library_root: "/Volumes/MixLab/PublicLibrary",
    usage: {
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
      event_store: usage_event_store
    }
  });
  const safety: PreprocessSafetyStatus = {
    status: "blocked",
    safe_to_start: false,
    checked_at: "2026-06-25T00:00:00.000Z",
    disk: {
      total_bytes: 100,
      available_bytes: 1,
      used_bytes: 99,
      usage_percent: 99,
      block_usage_percent: 90,
      status: "blocked",
      last_error: ""
    },
    processing: {
      checked: true,
      processing_count: 1,
      source_video_ids: ["V001440"]
    },
    blockers: [
      {
        code: "disk-space-blocked",
        message: "blocked",
        source_video_ids: []
      }
    ]
  };

  return {
    checked_at: "2026-06-25T00:00:00.000Z",
    overall_status: "blocked",
    release_allowed: false,
    gates: [
      {
        code: "preprocess-disk",
        status: "blocked",
        message: "公共素材库磁盘空间不足，禁止继续预处理或 Docker 发布。"
      },
      {
        code: "build-version-health",
        status: "attention",
        message: "当前构建缺少正式版本信息；Docker 发布前需要镜像 tag、commit sha 和版本号。"
      }
    ],
    build: {
      sha: "local",
      version: "local",
      image_tag: ""
    },
    runtime: {
      library_root: "/Volumes/MixLab/PublicLibrary",
      source_videos_path: "/Volumes/MixLab/PublicLibrary/source-videos",
      path_profile: "mac-smb"
    },
    safety,
    usage_event_store,
    usage_events_repair,
    processing_recovery: buildProcessingRecoveryReadiness({ safety }),
    disk_space_protection: buildDiskSpaceProtectionReadiness({
      library_root: "/Volumes/MixLab/PublicLibrary",
      safety
    }),
    version_health_parity: buildVersionHealthParityReadiness({
      build: {
        sha: "local",
        version: "local",
        image_tag: ""
      }
    }),
    admin_worker_env_proof: buildAdminWorkerEnvProofReadiness(),
    cutter_compatibility_proof: buildCutterCompatibilityProofReadiness({
      ready_video_count: protectionStatus().ready_video_count
    })
  };
}

test("operations overview summarizes blocking gates and uses blocked actions first", () => {
  const overview = buildAdminOperationsOverview({
    generated_at: "2026-06-25T00:00:00.000Z",
    protection: protectionStatus(),
    release: releaseGatesStatus(),
    read_model: { freshness: "fresh" },
    data_loading: dataLoadingPlan()
  });

  assert.equal(overview.summary.overall_status, "blocked");
  assert.equal(overview.summary.release_allowed, false);
  assert.equal(overview.summary.blocked_gate_count, 1);
  assert.equal(overview.summary.attention_gate_count, 1);
  assert.equal(overview.summary.ready_video_count, 10471);
  assert.deepEqual(overview.next_actions.map((action) => action.key), ["preprocess-disk"]);
  assert.deepEqual(overview.read_model, { freshness: "fresh" });
  assert.equal(overview.data_loading.strategy, "shell-first-route-owned-v1");
});
