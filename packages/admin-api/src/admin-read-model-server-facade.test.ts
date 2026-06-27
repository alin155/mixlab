import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type {
  LibraryCounts,
  SourceVideoManifest
} from "../../protocol/src/index.ts";
import type {
  AdminOperationLogAppendInput,
  AdminOperationLogEvent
} from "./admin-operation-log.ts";
import type {
  AdminReadModelInvalidationHandoff
} from "./admin-read-model-invalidation.ts";
import {
  createAdminReadModelServerFacade
} from "./admin-read-model-server-facade.ts";
import {
  handleAdminReadModelRoutes
} from "./admin-read-model-routes.ts";

const requestNow = "2026-06-27T02:00:00.000Z";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-read-model-server-facade-"));
}

function libraryCounts(input: Partial<LibraryCounts> = {}): LibraryCounts & { updated_at: string } {
  return {
    video_count: 1,
    ready_video_count: 1,
    processing_video_count: 0,
    queued_video_count: 0,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: requestNow,
    ...input
  };
}

function sourceVideoManifest(sourceVideoId: string): SourceVideoManifest {
  return {
    source_video_id: sourceVideoId,
    title: sourceVideoId,
    relative_path: `课程/${sourceVideoId}.mp4`,
    logical_uri: `library://source-video/${sourceVideoId}`,
    duration_ms: 60_000,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: "h264",
    file_size: 1024,
    content_hash: `hash-${sourceVideoId}`,
    preprocess_status: "ready",
    visible_to_cutters: true,
    transcript_path: `artifacts/${sourceVideoId}/transcript.json`,
    srt_path: `artifacts/${sourceVideoId}/transcript.srt`,
    keyframes_path: `artifacts/${sourceVideoId}/keyframes.json`,
    cover_path: `artifacts/${sourceVideoId}/cover.jpg`
  };
}

function scanHandoff(): AdminReadModelInvalidationHandoff {
  return {
    command: "library-scan",
    invalidation_reason: "library-scan-or-init",
    stale_mark: {
      applied: true,
      reason: "invalidated",
      invalidated_at: requestNow,
      invalidation_reason: "library-scan-or-init"
    },
    reconciliation: {
      store_path: "/tmp/mixlab/admin-read-model/admin.sqlite",
      action: "rebuild",
      reason: "stale_store",
      scan_mode: "full-reconcile",
      requires_background_reconcile: true,
      safe_for_page_request: false
    }
  };
}

function appendedEvent(input: AdminOperationLogAppendInput, index: number): AdminOperationLogEvent {
  return {
    schema_version: "1.0",
    event_id: `evt-${index}`,
    occurred_at: input.occurred_at,
    area: input.area,
    action: input.action,
    event_type: input.event_type,
    message: input.message,
    details: input.details ?? {}
  };
}

test("read-model server facade exposes route deps for data loading and reconciler status", async () => {
  const libraryRoot = await makeLibraryRoot();
  const facade = createAdminReadModelServerFacade({
    library_root: libraryRoot,
    default_page_limit: 20,
    manifest_cache_ttl_ms: 30_000,
    now: () => requestNow,
    deps: {
      clear_source_video_page_cache() {},
      async read_library_manifest() {
        return libraryCounts();
      },
      async read_all_source_video_manifests() {
        return [sourceVideoManifest("V000001")];
      },
      async read_preprocess_job() {
        return null;
      },
      async append_operation_log_event(input) {
        return appendedEvent(input, 1);
      },
      async read_admin_read_model_store_status() {
        return {
          schema_version: "1.0",
          storage: "sqlite",
          path: `${libraryRoot}/.mixlab-library/admin-read-model/admin.sqlite`,
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
      },
      plan_admin_read_model_store_reconciliation({ status }) {
        return {
          store_path: status.path,
          action: "none",
          reason: "fresh",
          scan_mode: "no-scan",
          requires_background_reconcile: false,
          safe_for_page_request: true
        };
      },
      async read_source_video_status_read_model_status() {
        return {
          name: "source-video-status-read-model-v1",
          storage: "persistent-json",
          path: `${libraryRoot}/.mixlab-library/admin/read-models/source-video-status-read-model-v1.json`,
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
      },
      async get_protection_status() {
        throw new Error("not needed for this route proof");
      },
      async get_release_gates() {
        throw new Error("not needed for this route proof");
      },
      async read_operation_log({ limit }) {
        return {
          schema_version: "1.0",
          generated_at: requestNow,
          path: `${libraryRoot}/.mixlab-library/admin/operation-log/events.ndjson`,
          events: [],
          limit: limit ?? 50,
          total_line_count: 0,
          malformed_line_count: 0,
          truncated: false
        };
      }
    }
  });

  const plan = await handleAdminReadModelRoutes({
    method: "GET",
    pathname: "/api/admin/data-loading/plan",
    search_params: new URLSearchParams(),
    request_now: requestNow,
    api_input: { library_root: libraryRoot, now: () => requestNow },
    deps: facade.read_model_route_deps
  });
  const status = await handleAdminReadModelRoutes({
    method: "GET",
    pathname: "/api/admin/read-model/reconcile/status",
    search_params: new URLSearchParams(),
    request_now: requestNow,
    api_input: { library_root: libraryRoot, now: () => requestNow },
    deps: facade.read_model_route_deps
  });

  assert.equal(plan.handled, true);
  if (plan.handled && plan.body.ok) {
    assert.equal((plan.body.data as { strategy: string }).strategy, "shell-first-route-owned-v1");
  }
  assert.equal(status.handled, true);
  if (status.handled && status.body.ok) {
    assert.equal((status.body.data as { status: string }).status, "idle");
  }
});

test("read-model server facade schedules post-scan reconcile through the owned runtime", async () => {
  const libraryRoot = await makeLibraryRoot();
  const appendedEvents: AdminOperationLogAppendInput[] = [];
  const clearedLibraries: string[] = [];
  const facade = createAdminReadModelServerFacade({
    library_root: libraryRoot,
    default_page_limit: 20,
    manifest_cache_ttl_ms: 30_000,
    now: () => requestNow,
    deps: {
      clear_source_video_page_cache(libraryRootToClear) {
        clearedLibraries.push(libraryRootToClear);
      },
      async read_library_manifest() {
        return libraryCounts();
      },
      async read_all_source_video_manifests() {
        return [sourceVideoManifest("V000001")];
      },
      async read_preprocess_job() {
        return {
          claimed_at: "2026-06-27T01:00:00.000Z",
          completed_at: "2026-06-27T01:10:00.000Z",
          indexed_at: "2026-06-27T01:11:00.000Z",
          failed_at: ""
        };
      },
      async append_operation_log_event(input) {
        appendedEvents.push(input);
        return appendedEvent(input, appendedEvents.length);
      },
      async read_admin_read_model_store_status() {
        throw new Error("not needed while scheduling reconcile");
      },
      plan_admin_read_model_store_reconciliation() {
        throw new Error("not needed while scheduling reconcile");
      },
      async read_source_video_status_read_model_status() {
        throw new Error("not needed while scheduling reconcile");
      },
      async get_protection_status() {
        throw new Error("not needed while scheduling reconcile");
      },
      async get_release_gates() {
        throw new Error("not needed while scheduling reconcile");
      },
      async read_operation_log() {
        throw new Error("not needed while scheduling reconcile");
      }
    }
  });

  const scheduled = facade.schedule_read_model_reconcile_after_scan({
    handoff: scanHandoff()
  });

  assert.equal(scheduled.policy, "post-scan-reconcile-v1");
  assert.equal(scheduled.requested, true);
  assert.equal(scheduled.accepted, true);
  assert.equal(scheduled.reason, "started");

  for (let attempt = 0; attempt < 20 && facade.read_model_reconciler.status().status === "running"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  assert.equal(facade.read_model_reconciler.status().status, "succeeded");
  assert.deepEqual(clearedLibraries, [libraryRoot]);
  assert.equal(
    appendedEvents.some((event) =>
      event.area === "read-model" &&
      event.action === "read-model-reconcile" &&
      event.event_type === "succeeded"
    ),
    true
  );
});
