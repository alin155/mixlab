import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type {
  PreprocessSafetyStatus,
  UsageMetrics
} from "../../library-fs/src/index.ts";
import {
  getAdminProtectionPathChecks,
  getAdminProtectionStatus,
  getAdminReleaseGates
} from "./admin-protection-query.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-protection-query-"));
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

function cleanUsageMetrics(): UsageMetrics {
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

test("protection query builds status from library manifest and current index", async () => {
  const status = await getAdminProtectionStatus({
    api_input: {
      library_root: "/tmp/PublicLibrary",
      now: () => "2026-06-27T00:00:00.000Z"
    },
    deps: {
      async read_library_manifest(libraryRoot) {
        assert.equal(libraryRoot, "/tmp/PublicLibrary");
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
        assert.equal(libraryRoot, "/tmp/PublicLibrary");
        return "v010471";
      }
    }
  });

  assert.equal(status.checked_at, "2026-06-27T00:00:00.000Z");
  assert.equal(status.mode, "preprocess-protection-v1");
  assert.equal(status.ready_video_count, 2);
  assert.equal(status.processing_video_count, 1);
  assert.equal(status.current_index_version, "v010471");
  assert.equal(status.scan_apply_requires_preview, true);
});

test("release gate query assembles runtime, safety, library, and usage evidence", async () => {
  const events: string[] = [];
  const gates = await getAdminReleaseGates({
    api_input: {
      library_root: "/data/PublicLibrary",
      now: () => "2026-06-27T00:01:00.000Z",
      env: {
        MIXLAB_BUILD_SHA: "abc123",
        MIXLAB_BUILD_VERSION: "2026.06.27",
        MIXLAB_IMAGE_TAG: "admin-api:test"
      } as NodeJS.ProcessEnv
    },
    deps: {
      async read_primary_source_videos_path(libraryRoot) {
        events.push(`source:${libraryRoot}`);
        return "/data/PublicLibrary/source-videos";
      },
      async read_library_status(input) {
        events.push(`library:${input.library_root}`);
        return {
          ready_video_count: 10471,
          index_required_video_count: 0,
          current_index_version: "v010471"
        };
      },
      async read_preprocess_safety(input) {
        events.push(`safety:${input.api_input.library_root}:${input.include_processing_guard}`);
        return healthySafety();
      },
      async read_usage_metrics(libraryRoot) {
        events.push(`usage:${libraryRoot}`);
        return cleanUsageMetrics();
      }
    }
  });

  assert.equal(gates.checked_at, "2026-06-27T00:01:00.000Z");
  assert.equal(gates.runtime.path_profile, "docker");
  assert.equal(gates.runtime.source_videos_path, "/data/PublicLibrary/source-videos");
  assert.equal(gates.build.sha, "abc123");
  assert.equal(gates.release_allowed, false);
  assert.equal(gates.overall_status, "attention");
  assert.equal(gates.usage_event_store.malformed_line_count, 0);
  assert.equal(gates.usage_events_repair.repair_required, false);
  assert.equal(gates.usage_events_repair.status, "clean");
  assert.equal(gates.usage_events_repair.mutates_ready_assets, false);
  assert.match(gates.usage_events_repair.dry_run_command, /usage-events-repair/);
  assert.equal(gates.disk_space_protection.status, "healthy");
  assert.equal(gates.disk_space_protection.safe_to_preprocess, true);
  assert.equal(gates.disk_space_protection.release_blocked, false);
  assert.equal(gates.disk_space_protection.threshold_env_var, "MIXLAB_PREPROCESS_DISK_BLOCK_USAGE_PERCENT");
  assert.equal(gates.disk_space_protection.write_block_scope, "preprocess-and-docker-upload");
  assert.equal(gates.disk_space_protection.starts_workers, false);
  assert.equal(gates.disk_space_protection.mutates_ready_assets, false);
  assert.equal(gates.disk_space_protection.mutates_cutter_protocol, false);
  assert.equal(gates.version_health_parity.status, "ready");
  assert.equal(gates.version_health_parity.metadata_complete, true);
  assert.equal(gates.version_health_parity.image_tag, "admin-api:test");
  assert.deepEqual(gates.version_health_parity.expected_services, [
    "admin-web",
    "admin-api",
    "admin-worker"
  ]);
  assert.equal(gates.version_health_parity.safe_scope, "version-health-only");
  assert.equal(gates.version_health_parity.starts_workers, false);
  assert.equal(gates.version_health_parity.mutates_ready_assets, false);
  assert.equal(gates.version_health_parity.mutates_cutter_protocol, false);
  assert.equal(gates.admin_worker_env_proof.proof_required, true);
  assert.equal(gates.admin_worker_env_proof.status, "external-proof-required");
  assert.equal(gates.admin_worker_env_proof.safe_scope, "admin-worker-env-only");
  assert.equal(gates.admin_worker_env_proof.required_env_flags.MIXLAB_ADMIN_DOCKER_MVP_MODE, "off");
  assert.equal(gates.admin_worker_env_proof.required_env_flags.MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER, "0");
  assert.equal(gates.admin_worker_env_proof.required_env_flags.MIXLAB_ENABLE_READY_PUBLISH_WORKER, "0");
  assert.equal(gates.admin_worker_env_proof.required_library_roots.MIXLAB_ADMIN_LIBRARY_ROOT, "/data/PublicLibrary");
  assert.equal(gates.admin_worker_env_proof.records_secrets, false);
  assert.equal(gates.admin_worker_env_proof.starts_workers, false);
  assert.equal(gates.admin_worker_env_proof.mutates_ready_assets, false);
  assert.equal(gates.admin_worker_env_proof.mutates_cutter_protocol, false);
  assert.match(gates.admin_worker_env_proof.proof_command, /admin-worker-env-proof/);
  assert.equal(gates.cutter_compatibility_proof.proof_required, true);
  assert.equal(gates.cutter_compatibility_proof.status, "external-proof-required");
  assert.equal(gates.cutter_compatibility_proof.safe_scope, "cutter-compatibility-only");
  assert.equal(gates.cutter_compatibility_proof.expected_auth_mode, "reviewed");
  assert.equal(gates.cutter_compatibility_proof.expected_ready_count, 10471);
  assert.equal(gates.cutter_compatibility_proof.requires_staged_candidate, true);
  assert.equal(gates.cutter_compatibility_proof.contacts_windows_runner, false);
  assert.equal(gates.cutter_compatibility_proof.contacts_docker, false);
  assert.equal(gates.cutter_compatibility_proof.starts_workers, false);
  assert.equal(gates.cutter_compatibility_proof.mutates_ready_assets, false);
  assert.equal(gates.cutter_compatibility_proof.mutates_cutter_protocol, false);
  assert.match(gates.cutter_compatibility_proof.proof_command, /admin-cutter-compatibility-proof/);
  assert.equal(gates.processing_recovery.recovery_required, false);
  assert.equal(gates.processing_recovery.status, "clear");
  assert.equal(gates.processing_recovery.safe_scope, "processing-to-queued-only");
  const workerGate = gates.gates.find((gate) => gate.code === "admin-worker-env-proof");
  assert.equal(workerGate?.status, "attention");
  assert.equal(
    (workerGate?.details?.env_proof_readiness as { records_secrets?: boolean } | undefined)
      ?.records_secrets,
    false
  );
  const cutterGate = gates.gates.find((gate) => gate.code === "cutter-compatibility-proof");
  assert.equal(cutterGate?.status, "attention");
  assert.equal(
    (cutterGate?.details?.cutter_proof_readiness as { expected_auth_mode?: string } | undefined)
      ?.expected_auth_mode,
    "reviewed"
  );
  assert.deepEqual(events, [
    "source:/data/PublicLibrary",
    "library:/data/PublicLibrary",
    "safety:/data/PublicLibrary:true",
    "usage:/data/PublicLibrary"
  ]);
});

test("release gate query exposes version parity readiness when build metadata is incomplete", async () => {
  const gates = await getAdminReleaseGates({
    api_input: {
      library_root: "/data/PublicLibrary",
      now: () => "2026-06-27T00:05:00.000Z"
    },
    deps: {
      async read_primary_source_videos_path() {
        return "/data/PublicLibrary/source-videos";
      },
      async read_library_status() {
        return {
          ready_video_count: 10471,
          index_required_video_count: 0,
          current_index_version: "v010471"
        };
      },
      async read_preprocess_safety() {
        return healthySafety();
      },
      async read_usage_metrics() {
        return cleanUsageMetrics();
      }
    }
  });

  const versionGate = gates.gates.find((gate) => gate.code === "build-version-health");
  assert.equal(gates.release_allowed, false);
  assert.equal(versionGate?.status, "attention");
  assert.equal(gates.version_health_parity.status, "incomplete");
  assert.equal(gates.version_health_parity.metadata_complete, false);
  assert.equal(gates.version_health_parity.static_compose_gate, "image-tag-static-parity");
  assert.deepEqual(gates.version_health_parity.health_preflight_endpoints, [
    "GET /",
    "GET /health",
    "GET /api/admin/release-gates"
  ]);
  assert.equal(gates.version_health_parity.starts_workers, false);
  assert.equal(gates.version_health_parity.mutates_ready_assets, false);
  assert.equal(gates.version_health_parity.mutates_cutter_protocol, false);
  assert.equal(
    (versionGate?.details?.version_health_parity as { status?: string } | undefined)?.status,
    "incomplete"
  );
});

test("release gate query exposes disk-space protection readiness when disk blocks Docker", async () => {
  const safety = healthySafety();
  safety.safe_to_start = false;
  safety.status = "blocked";
  safety.disk = {
    total_bytes: 100,
    available_bytes: 3,
    used_bytes: 97,
    usage_percent: 97,
    block_usage_percent: 92,
    status: "blocked",
    last_error: ""
  };
  safety.blockers = [{
    code: "disk-space-blocked",
    message: "disk",
    source_video_ids: []
  }];

  const gates = await getAdminReleaseGates({
    api_input: {
      library_root: "/data/PublicLibrary",
      now: () => "2026-06-27T00:04:00.000Z"
    },
    deps: {
      async read_primary_source_videos_path() {
        return "/data/PublicLibrary/source-videos";
      },
      async read_library_status() {
        return {
          ready_video_count: 10471,
          index_required_video_count: 0,
          current_index_version: "v010471"
        };
      },
      async read_preprocess_safety() {
        return safety;
      },
      async read_usage_metrics() {
        return cleanUsageMetrics();
      }
    }
  });

  const diskGate = gates.gates.find((gate) => gate.code === "preprocess-disk");
  assert.equal(gates.release_allowed, false);
  assert.equal(diskGate?.status, "blocked");
  assert.equal(gates.disk_space_protection.status, "blocked");
  assert.equal(gates.disk_space_protection.safe_to_preprocess, false);
  assert.equal(gates.disk_space_protection.preprocess_write_blocked, true);
  assert.equal(gates.disk_space_protection.release_blocked, true);
  assert.deepEqual(gates.disk_space_protection.preflight_endpoints, [
    "GET /api/admin/release-gates",
    "GET /api/admin/preprocess/safety",
    "GET /api/admin/library/status"
  ]);
  assert.equal(gates.disk_space_protection.starts_workers, false);
  assert.equal(gates.disk_space_protection.mutates_ready_assets, false);
  assert.equal(gates.disk_space_protection.mutates_cutter_protocol, false);
  assert.equal(
    (diskGate?.details?.disk_space_protection as { release_blocked?: boolean } | undefined)
      ?.release_blocked,
    true
  );
});

test("release gate query exposes processing recovery preflight readiness", async () => {
  const safety = healthySafety();
  safety.safe_to_start = false;
  safety.status = "blocked";
  safety.processing = {
    checked: true,
    processing_count: 2,
    source_video_ids: ["V001440", "V001441"]
  };
  safety.blockers = [{
    code: "processing-needs-recovery",
    message: "processing",
    source_video_ids: ["V001440", "V001441"]
  }];

  const gates = await getAdminReleaseGates({
    api_input: {
      library_root: "/data/PublicLibrary",
      now: () => "2026-06-27T00:03:00.000Z"
    },
    deps: {
      async read_primary_source_videos_path() {
        return "/data/PublicLibrary/source-videos";
      },
      async read_library_status() {
        return {
          ready_video_count: 10471,
          index_required_video_count: 0,
          current_index_version: "v010471"
        };
      },
      async read_preprocess_safety() {
        return safety;
      },
      async read_usage_metrics() {
        return cleanUsageMetrics();
      }
    }
  });

  const processingGate = gates.gates.find((gate) => gate.code === "processing-recovery");
  assert.equal(gates.release_allowed, false);
  assert.equal(processingGate?.status, "blocked");
  assert.equal(gates.processing_recovery.recovery_required, true);
  assert.equal(gates.processing_recovery.status, "preflight-required");
  assert.deepEqual(gates.processing_recovery.source_video_ids, ["V001440", "V001441"]);
  assert.equal(gates.processing_recovery.supervisor_must_be_idle, true);
  assert.equal(gates.processing_recovery.mutates_ready_assets, false);
  assert.equal(gates.processing_recovery.mutates_cutter_protocol, false);
  assert.equal(
    gates.processing_recovery.single_recovery_endpoints.includes(
      "POST /api/admin/source-videos/V001440/recover-processing"
    ),
    true
  );
  assert.equal(
    (processingGate?.details?.recovery_readiness as { recovery_required?: boolean } | undefined)
      ?.recovery_required,
    true
  );
});

test("release gate query exposes usage-events repair readiness when bad rows block Docker", async () => {
  const usage = cleanUsageMetrics();
  usage.event_store = {
    line_count: 3,
    valid_line_count: 2,
    malformed_line_count: 1,
    malformed_lines: [2],
    warning: "bad row"
  };

  const gates = await getAdminReleaseGates({
    api_input: {
      library_root: "/Volumes/MixLab/PublicLibrary",
      now: () => "2026-06-27T00:02:00.000Z",
      env: {
        MIXLAB_BUILD_SHA: "abc123",
        MIXLAB_BUILD_VERSION: "2026.06.27",
        MIXLAB_IMAGE_TAG: "admin-api:test"
      } as NodeJS.ProcessEnv
    },
    deps: {
      async read_primary_source_videos_path() {
        return "/Volumes/MixLab/PublicLibrary/source-videos";
      },
      async read_library_status() {
        return {
          ready_video_count: 10471,
          index_required_video_count: 0,
          current_index_version: "v010471"
        };
      },
      async read_preprocess_safety() {
        return healthySafety();
      },
      async read_usage_metrics() {
        return usage;
      }
    }
  });

  const usageGate = gates.gates.find((gate) => gate.code === "usage-events-tolerance");
  assert.equal(gates.release_allowed, false);
  assert.equal(usageGate?.status, "blocked");
  assert.equal(gates.usage_events_repair.repair_required, true);
  assert.equal(gates.usage_events_repair.status, "dry-run-required");
  assert.match(gates.usage_events_repair.events_path, /usage-events\/events\.ndjson$/);
  assert.match(gates.usage_events_repair.projection_path, /admin-read-model\/usage-metrics\.sqlite$/);
  assert.match(gates.usage_events_repair.dry_run_command, /--library-root '\/Volumes\/MixLab\/PublicLibrary'/);
  assert.match(gates.usage_events_repair.apply_command, /--apply/);
  assert.equal(gates.usage_events_repair.mutates_ready_assets, false);
  assert.equal(gates.usage_events_repair.mutates_cutter_protocol, false);
  assert.equal(
    (usageGate?.details?.repair_readiness as { repair_required?: boolean } | undefined)?.repair_required,
    true
  );
});

test("protection path-check query reads configured source folders", async () => {
  const libraryRoot = await makeLibraryRoot();
  const sourceFolder = path.join(libraryRoot, "source-videos");
  await mkdir(sourceFolder, { recursive: true });
  await mkdir(path.join(libraryRoot, ".mixlab-library"), { recursive: true });
  await writeFile(path.join(libraryRoot, ".mixlab-library", "library.json"), "{}\n", "utf8");

  const checks = await getAdminProtectionPathChecks({
    library_root: libraryRoot,
    deps: {
      async read_settings_config(root) {
        assert.equal(root, libraryRoot);
        return {
          source_folders: [{
            name: "默认素材",
            path: sourceFolder,
            enabled: true
          }]
        };
      },
      mixlab_library_path(root) {
        return path.join(root, ".mixlab-library");
      },
      library_manifest_path(root) {
        return path.join(root, ".mixlab-library", "library.json");
      }
    }
  });

  assert.deepEqual(checks.map((check) => [check.label, check.status]), [
    ["公共素材库", "pass"],
    ["素材来源：默认素材", "pass"],
    [".mixlab-library", "pass"],
    ["library.json", "pass"]
  ]);
});
