import assert from "node:assert/strict";
import test from "node:test";
import type { PreprocessSafetyStatus } from "../../library-fs/src/index.ts";
import type { AdminOperationLogReadResult } from "./admin-operation-log.ts";
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
import type { AdminReadModelStoreStatus } from "./admin-read-model-store.ts";
import type {
  AdminSourceVideoStatusReadModelRuntimeStatus
} from "./admin-source-video-status-read-model-runtime.ts";
import {
  handleAdminReadModelRoutes,
  type AdminReadModelRouteDeps
} from "./admin-read-model-routes.ts";

const requestNow = "2026-05-02T12:00:00.000Z";

function storeStatus(): AdminReadModelStoreStatus {
  return {
    schema_version: "1.0",
    storage: "sqlite",
    path: "/tmp/PublicLibrary/.mixlab-library/admin-read-model/admin.sqlite",
    freshness: "fresh",
    exists: true,
    generated_at: requestNow,
    library_updated_at: requestNow,
    current_library_updated_at: requestNow,
    video_count: 1,
    current_video_count: 1,
    counts_by_status: {
      unprocessed: 0,
      queued: 0,
      processing: 0,
      ready: 1,
      failed: 0,
      "index-required": 0
    },
    invalidated_at: "",
    invalidation_reason: "",
    last_error: ""
  };
}

function sourceVideoStatus(): AdminSourceVideoStatusReadModelRuntimeStatus {
  return {
    name: "source-video-status-read-model-v1",
    storage: "persistent-json",
    path: "/tmp/PublicLibrary/.mixlab-library/admin/read-models/source-video-status-read-model-v1.json",
    freshness: "fresh",
    memory_cache: "fresh",
    persisted: "fresh",
    generated_at: requestNow,
    library_updated_at: requestNow,
    current_library_updated_at: requestNow,
    video_count: 1,
    current_video_count: 1,
    counts_by_status: {
      unprocessed: 0,
      queued: 0,
      processing: 0,
      ready: 1,
      failed: 0,
      "index-required": 0
    },
    cache_ttl_ms: 30_000
  };
}

function protectionStatus(): AdminProtectionStatus {
  return {
    checked_at: requestNow,
    mode: "preprocess-protection-v1",
    ready_video_count: 1,
    processing_video_count: 0,
    queued_video_count: 0,
    index_required_video_count: 0,
    current_index_version: "v000001",
    scan_apply_requires_preview: true,
    ready_asset_policy: {
      immutable_status: "ready",
      allowed_ready_mutations: ["metadata"],
      blocked_ready_mutations: ["ready -> queued"]
    },
    scan_preview_endpoint: "/api/admin/library/scan-preview",
    release_gates_endpoint: "/api/admin/release-gates"
  };
}

function releaseGates(): AdminReleaseGatesStatus {
  const usage_event_store = {
    line_count: 0,
    valid_line_count: 0,
    malformed_line_count: 0,
    malformed_lines: [],
    warning: ""
  };
  const safety: PreprocessSafetyStatus = {
    checked_at: requestNow,
    safe_to_start: true,
    status: "healthy",
    disk: {
      total_bytes: 100,
      available_bytes: 50,
      used_bytes: 50,
      usage_percent: 50,
      block_usage_percent: 95,
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

  return {
    checked_at: requestNow,
    overall_status: "pass",
    release_allowed: true,
    gates: [],
    build: {
      sha: "local",
      version: "local",
      image_tag: ""
    },
    runtime: {
      library_root: "/tmp/PublicLibrary",
      source_videos_path: "/tmp/PublicLibrary/source-videos",
      path_profile: "local"
    },
    safety,
    usage_event_store,
    usage_events_repair: buildUsageEventsRepairReadiness({
      library_root: "/tmp/PublicLibrary",
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
    }),
    processing_recovery: buildProcessingRecoveryReadiness({ safety }),
    disk_space_protection: buildDiskSpaceProtectionReadiness({
      library_root: "/tmp/PublicLibrary",
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
      ready_video_count: 1
    })
  };
}

function operationLog(limit: number | undefined): AdminOperationLogReadResult {
  return {
    schema_version: "1.0",
    generated_at: requestNow,
    path: "/tmp/PublicLibrary/.mixlab-library/admin/operation-log/events.ndjson",
    events: [],
    limit: limit ?? 50,
    total_line_count: 0,
    malformed_line_count: 0,
    truncated: false
  };
}

function makeDeps(overrides: Partial<AdminReadModelRouteDeps> = {}): AdminReadModelRouteDeps {
  return {
    manifest_cache_ttl_ms: 30_000,
    read_model_reconciler: {
      status: () => ({ status: "idle" }),
      start: () => ({ accepted: true }),
      cancel: () => ({ accepted: true })
    },
    read_library_manifest: async () => ({
      video_count: 1,
      ready_video_count: 1,
      processing_video_count: 0,
      queued_video_count: 0,
      unprocessed_video_count: 0,
      failed_video_count: 0,
      index_required_video_count: 0,
      updated_at: requestNow
    }),
    read_admin_read_model_store_status: async () => storeStatus(),
    plan_admin_read_model_store_reconciliation: ({ status }) => ({
      store_path: status.path,
      action: "none",
      reason: "fresh",
      scan_mode: "no-scan",
      requires_background_reconcile: false,
      safe_for_page_request: true
    }),
    read_source_video_status_read_model_status: async () => sourceVideoStatus(),
    get_protection_status: async () => protectionStatus(),
    get_release_gates: async () => releaseGates(),
    read_operation_log: async ({ limit }) => operationLog(limit),
    ...overrides
  };
}

async function callRoute(input: {
  method?: string;
  pathname: string;
  query?: string;
  deps?: AdminReadModelRouteDeps;
}) {
  return handleAdminReadModelRoutes({
    method: input.method ?? "GET",
    pathname: input.pathname,
    search_params: new URLSearchParams(input.query ?? ""),
    request_now: requestNow,
    api_input: {
      library_root: "/tmp/PublicLibrary",
      now: () => requestNow
    },
    deps: input.deps ?? makeDeps()
  });
}

test("read model routes handle data-loading plan and ignore unrelated routes", async () => {
  const plan = await callRoute({ pathname: "/api/admin/data-loading/plan" });
  const unrelated = await callRoute({ pathname: "/api/admin/source-videos" });

  assert.equal(plan.handled, true);
  if (plan.handled) {
    assert.equal(plan.status_code, 200);
    assert.equal(plan.body.ok, true);
    assert.equal((plan.body.data as { strategy: string }).strategy, "shell-first-route-owned-v1");
  }
  assert.deepEqual(unrelated, { handled: false });
});

test("read model routes build status and operations overview from explicit dependencies", async () => {
  const status = await callRoute({ pathname: "/api/admin/read-model/status" });
  const overview = await callRoute({ pathname: "/api/admin/operations/overview" });

  assert.equal(status.handled, true);
  assert.equal(overview.handled, true);
  if (status.handled && status.body.ok) {
    const data = status.body.data as {
      admin_read_model: { freshness: string; reconciliation: { scan_mode: string } };
      source_video_status: { freshness: string };
    };
    assert.equal(data.admin_read_model.freshness, "fresh");
    assert.equal(data.admin_read_model.reconciliation.scan_mode, "no-scan");
    assert.equal(data.source_video_status.freshness, "fresh");
  }
  if (overview.handled && overview.body.ok) {
    const data = overview.body.data as { title: string; summary: { ready_video_count: number } };
    assert.equal(data.title, "管理端运行保护中心");
    assert.equal(data.summary.ready_video_count, 1);
  }
});

test("read model routes preserve reconcile status codes", async () => {
  const accepted = await callRoute({
    method: "POST",
    pathname: "/api/admin/read-model/reconcile"
  });
  const alreadyRunning = await callRoute({
    method: "POST",
    pathname: "/api/admin/read-model/reconcile",
    deps: makeDeps({
      read_model_reconciler: {
        status: () => ({ status: "running" }),
        start: () => ({ accepted: false }),
        cancel: () => ({ accepted: true })
      }
    })
  });
  const cancel = await callRoute({
    method: "POST",
    pathname: "/api/admin/read-model/reconcile/cancel"
  });

  assert.equal(accepted.handled, true);
  assert.equal(alreadyRunning.handled, true);
  assert.equal(cancel.handled, true);
  if (accepted.handled) {
    assert.equal(accepted.status_code, 202);
  }
  if (alreadyRunning.handled) {
    assert.equal(alreadyRunning.status_code, 200);
  }
  if (cancel.handled) {
    assert.equal(cancel.status_code, 200);
  }
});

test("read model routes preserve operation-log bounded limit semantics", async () => {
  const seenLimits: Array<number | undefined> = [];
  const deps = makeDeps({
    read_operation_log: async ({ limit }) => {
      seenLimits.push(limit);
      return operationLog(limit);
    }
  });

  const valid = await callRoute({
    pathname: "/api/admin/operation-log",
    query: "limit=12",
    deps
  });
  const capped = await callRoute({
    pathname: "/api/admin/operation-log",
    query: "limit=1200",
    deps
  });
  const invalid = await callRoute({
    pathname: "/api/admin/operation-log",
    query: "limit=abc",
    deps
  });

  assert.equal(valid.handled, true);
  assert.equal(capped.handled, true);
  assert.equal(invalid.handled, true);
  assert.deepEqual(seenLimits, [12, 100, undefined]);
});
