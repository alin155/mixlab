import assert from "node:assert/strict";
import test from "node:test";
import type { SourceVideoManifest } from "../../protocol/src/index.ts";
import { AdminReadyProtectionError } from "./admin-protection.ts";
import {
  adminCommandContract,
  adminDockerMvpCommandBlock,
  adminCommandInvalidatesSourceVideoReadModel,
  adminCommandNames,
  adminCommandReadModelInvalidationPolicy,
  adminCommandRequiresReadModelReconcile,
  adminCommandRequiresScanPreview,
  adminRecoverProcessingSupervisorBlock,
  adminTransitionCommandSpec,
  assertAdminDockerMvpCommandAllowed,
  assertAdminTransitionAllowed,
  AdminDockerMvpCommandBlockedError,
  resolveAdminDockerMvpAllowedCommands,
  resolveAdminDockerMvpMode
} from "./admin-command-guard.ts";

function sourceVideoManifest(input: {
  source_video_id: string;
  preprocess_status: SourceVideoManifest["preprocess_status"];
}): SourceVideoManifest {
  return {
    source_video_id: input.source_video_id,
    title: input.source_video_id,
    relative_path: `${input.source_video_id}.mp4`,
    logical_uri: `library://source-video/${input.source_video_id}`,
    duration_ms: 1_000,
    width: 1920,
    height: 1080,
    fps: 30,
    codec: "h264",
    file_size: 1024,
    content_hash: input.source_video_id,
    preprocess_status: input.preprocess_status,
    visible_to_cutters: input.preprocess_status === "ready",
    transcript_path: "",
    srt_path: "",
    keyframes_path: "",
    cover_path: "",
    description: "",
    tags: [],
    lecturer: "",
    course: "",
    category: ""
  };
}

test("admin command contracts cover every current Admin mutation command", () => {
  assert.deepEqual(adminCommandNames, [
    "settings-config",
    "source-folder-add",
    "source-folder-update",
    "source-folder-remove",
    "library-init",
    "library-scan",
    "library-scan-new",
    "preprocess-queue-unprocessed",
    "preprocess-queue-unprocessed-pipeline",
    "preprocess-retry-failed",
    "preprocess-recover-processing",
    "preprocess-worker-claim",
    "preprocess-worker-stage",
    "preprocess-worker-complete",
    "preprocess-worker-fail",
    "preprocess-worker-refresh-counts",
    "source-video-queue",
    "source-video-retry",
    "source-video-recover-processing",
    "source-video-publish",
    "preprocess-supervisor-publish-ready",
    "source-video-cover",
    "index-repair",
    "source-video-metadata",
    "read-model-reconcile",
    "command-snapshot-restore",
    "admin-auth-register",
    "admin-auth-login",
    "admin-auth-logout",
    "cutter-user-approve",
    "cutter-user-disable",
    "cutter-user-password-reset"
  ]);
  assert.deepEqual(adminCommandContract("library-scan"), {
    command: "library-scan",
    method: "POST",
    scope: "library",
    scan_mode: "folder-scan",
    requires_writer_lease: true,
    requires_scan_preview: true,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: true,
    mutation_targets: ["library-manifest", "source-video-manifest", "read-model-cache"]
  });
  assert.deepEqual(adminCommandContract("library-scan-new"), {
    command: "library-scan-new",
    method: "POST",
    scope: "library",
    scan_mode: "folder-scan",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: true,
    mutation_targets: ["library-manifest", "source-video-manifest", "read-model-cache"]
  });
  assert.deepEqual(adminCommandContract("preprocess-queue-unprocessed-pipeline"), {
    command: "preprocess-queue-unprocessed-pipeline",
    method: "POST",
    scope: "bulk",
    scan_mode: "status-scan",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: true,
    mutation_targets: ["library-manifest", "source-video-manifest", "preprocess-job", "read-model-cache"]
  });
  assert.deepEqual(adminCommandContract("preprocess-worker-claim"), {
    command: "preprocess-worker-claim",
    method: "POST",
    scope: "single",
    scan_mode: "status-scan",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: true,
    mutation_targets: [
      "library-manifest",
      "source-video-manifest",
      "preprocess-job",
      "preprocess-job-log",
      "read-model-cache"
    ]
  });
  assert.deepEqual(adminCommandContract("preprocess-worker-stage"), {
    command: "preprocess-worker-stage",
    method: "POST",
    scope: "single",
    scan_mode: "single-id",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: false,
    mutation_targets: ["preprocess-job", "preprocess-job-log"]
  });
  assert.deepEqual(adminCommandContract("preprocess-worker-complete").mutation_targets, [
    "library-manifest",
    "source-video-manifest",
    "source-video-artifact",
    "preprocess-job",
    "preprocess-job-log",
    "read-model-cache"
  ]);
  assert.deepEqual(adminCommandContract("preprocess-worker-refresh-counts"), {
    command: "preprocess-worker-refresh-counts",
    method: "POST",
    scope: "library",
    scan_mode: "status-scan",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: true,
    mutation_targets: ["library-manifest", "read-model-cache"]
  });
  assert.deepEqual(adminCommandContract("source-video-publish").mutation_targets, [
    "library-manifest",
    "source-video-manifest",
    "preprocess-job",
    "index-release",
    "read-model-cache"
  ]);
  assert.deepEqual(adminCommandContract("preprocess-supervisor-publish-ready"), {
    command: "preprocess-supervisor-publish-ready",
    method: "POST",
    scope: "bulk",
    scan_mode: "status-scan",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: true,
    mutation_targets: [
      "library-manifest",
      "source-video-manifest",
      "source-video-artifact",
      "preprocess-job",
      "index-release",
      "read-model-cache"
    ]
  });
  assert.deepEqual(adminCommandContract("settings-config").mutation_targets, [
    "admin-settings",
    "runtime-secrets",
    "source-folder-config",
    "read-model-cache"
  ]);
  assert.deepEqual(adminCommandContract("source-folder-update").mutation_targets, [
    "admin-settings",
    "source-folder-config",
    "read-model-cache"
  ]);
  assert.equal(adminCommandContract("source-folder-update").invalidates_source_video_read_model, true);
  assert.deepEqual(adminCommandContract("source-video-cover").mutation_targets, [
    "source-video-artifact",
    "source-video-manifest",
    "read-model-cache"
  ]);
  assert.deepEqual(adminCommandContract("read-model-reconcile"), {
    command: "read-model-reconcile",
    method: "POST",
    scope: "library",
    scan_mode: "full-reconcile",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: true,
    mutation_targets: ["read-model-cache"]
  });
  assert.deepEqual(adminCommandContract("command-snapshot-restore"), {
    command: "command-snapshot-restore",
    method: "POST",
    scope: "library",
    scan_mode: "no-scan",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: true,
    invalidates_source_video_read_model: true,
    mutation_targets: [
      "admin-settings",
      "source-folder-config",
      "library-manifest",
      "source-video-manifest",
      "source-video-artifact",
      "preprocess-job",
      "index-release",
      "read-model-cache"
    ]
  });
  assert.deepEqual(adminCommandContract("admin-auth-register"), {
    command: "admin-auth-register",
    method: "POST",
    scope: "single",
    scan_mode: "no-scan",
    requires_writer_lease: false,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: false,
    mutation_targets: ["admin-user-store", "admin-session-store"]
  });
  assert.deepEqual(adminCommandContract("admin-auth-login"), {
    command: "admin-auth-login",
    method: "POST",
    scope: "single",
    scan_mode: "no-scan",
    requires_writer_lease: false,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: false,
    mutation_targets: ["admin-user-store", "admin-session-store"]
  });
  assert.deepEqual(adminCommandContract("admin-auth-logout"), {
    command: "admin-auth-logout",
    method: "POST",
    scope: "single",
    scan_mode: "no-scan",
    requires_writer_lease: false,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: false,
    mutation_targets: ["admin-session-store"]
  });
  assert.deepEqual(adminCommandContract("cutter-user-approve"), {
    command: "cutter-user-approve",
    method: "POST",
    scope: "single",
    scan_mode: "no-scan",
    requires_writer_lease: false,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: false,
    mutation_targets: ["cutter-user-store"]
  });
});

test("admin command contracts expose scan preview and read-model invalidation gates", () => {
  assert.equal(adminCommandRequiresScanPreview("library-scan"), true);
  assert.equal(adminCommandRequiresScanPreview("source-video-publish"), false);
  assert.equal(adminCommandRequiresScanPreview("preprocess-supervisor-publish-ready"), false);
  assert.equal(adminCommandInvalidatesSourceVideoReadModel("source-video-metadata"), true);
  assert.equal(adminCommandInvalidatesSourceVideoReadModel("source-folder-remove"), true);
  assert.equal(adminCommandRequiresReadModelReconcile("source-folder-remove"), true);
  assert.equal(adminCommandRequiresReadModelReconcile("source-video-cover"), false);
  assert.equal(adminCommandRequiresReadModelReconcile("command-snapshot-restore"), true);
  assert.equal(adminCommandInvalidatesSourceVideoReadModel("cutter-user-disable"), false);
  assert.equal(adminCommandRequiresReadModelReconcile("cutter-user-password-reset"), false);
  assert.equal(adminCommandInvalidatesSourceVideoReadModel("admin-auth-login"), false);
  assert.equal(adminCommandRequiresReadModelReconcile("admin-auth-register"), false);
  assert.equal(adminCommandInvalidatesSourceVideoReadModel("preprocess-worker-stage"), false);
  assert.equal(adminCommandInvalidatesSourceVideoReadModel("preprocess-worker-complete"), true);
  assert.equal(adminCommandInvalidatesSourceVideoReadModel("preprocess-worker-fail"), true);
  assert.equal(adminCommandRequiresReadModelReconcile("preprocess-worker-refresh-counts"), true);
});

test("docker mvp command policy allows only login cutter-user and controlled preprocess writes", () => {
  assert.equal(resolveAdminDockerMvpMode({}), "off");
  assert.equal(resolveAdminDockerMvpMode({ MIXLAB_ADMIN_DOCKER_MVP_MODE: "v0.1" }), "v0.1");
  assert.equal(resolveAdminDockerMvpMode({ MIXLAB_ADMIN_DOCKER_MVP_MODE: "docker-mvp-v0.1" }), "v0.1");

  for (const command of [
    "admin-auth-login",
    "admin-auth-logout",
    "cutter-user-approve",
    "cutter-user-disable",
    "cutter-user-password-reset",
    "source-video-queue",
    "source-video-retry",
    "source-video-recover-processing",
    "preprocess-queue-unprocessed",
    "preprocess-retry-failed",
    "preprocess-recover-processing",
    "library-scan-new",
    "preprocess-worker-claim",
    "preprocess-worker-stage",
    "preprocess-worker-complete",
    "preprocess-worker-fail",
    "preprocess-worker-refresh-counts",
    "admin-auth-register"
  ] as const) {
    assert.equal(adminDockerMvpCommandBlock({ command, mode: "v0.1" }), null, command);
    assert.doesNotThrow(() => assertAdminDockerMvpCommandAllowed({ command, mode: "v0.1" }), command);
  }

  for (const command of [
    "settings-config",
    "library-init",
    "library-scan",
    "source-video-publish",
    "preprocess-supervisor-publish-ready",
    "source-video-cover",
    "source-video-metadata",
    "index-repair",
    "read-model-reconcile",
    "command-snapshot-restore"
  ] as const) {
    const block = adminDockerMvpCommandBlock({ command, mode: "v0.1" });
    assert.equal(block?.error_code, "admin_mvp_command_blocked", command);
    assert.equal(block?.details.command, command);
    assert.throws(
      () => assertAdminDockerMvpCommandAllowed({ command, mode: "v0.1" }),
      AdminDockerMvpCommandBlockedError,
      command
    );
  }

  assert.equal(adminDockerMvpCommandBlock({ command: "source-video-publish", mode: "off" }), null);
});

test("docker mvp command policy supports explicit per-command allowlist", () => {
  assert.deepEqual(resolveAdminDockerMvpAllowedCommands({}), []);
  assert.deepEqual(resolveAdminDockerMvpAllowedCommands({
    MIXLAB_ADMIN_DOCKER_MVP_ALLOW_COMMANDS: " source-video-publish,missing-command,source-video-publish "
  }), ["source-video-publish"]);

  assert.equal(adminDockerMvpCommandBlock({
    command: "source-video-publish",
    mode: "v0.1",
    allowed_commands: ["source-video-publish"]
  }), null);

  const block = adminDockerMvpCommandBlock({
    command: "index-repair",
    mode: "v0.1",
    allowed_commands: ["source-video-publish"]
  });
  assert.equal(block?.error_code, "admin_mvp_command_blocked");
  assert.deepEqual(block?.details.allowed_commands, ["source-video-publish"]);
  assert.throws(
    () => assertAdminDockerMvpCommandAllowed({
      command: "index-repair",
      mode: "v0.1",
      allowed_commands: ["source-video-publish"]
    }),
    AdminDockerMvpCommandBlockedError
  );
});

test("read-model invalidation policy separates source-folder scope changes from single-id write-through commands", () => {
  assert.deepEqual(adminCommandReadModelInvalidationPolicy("source-folder-remove"), {
    command: "source-folder-remove",
    invalidates_source_video_read_model: true,
    requires_read_model_reconcile: true,
    reason: "source-folder-scope-change",
    scan_mode: "no-scan",
    mutation_targets: ["admin-settings", "source-folder-config", "read-model-cache"]
  });
  assert.deepEqual(adminCommandReadModelInvalidationPolicy("settings-config"), {
    command: "settings-config",
    invalidates_source_video_read_model: true,
    requires_read_model_reconcile: true,
    reason: "source-folder-scope-change",
    scan_mode: "no-scan",
    mutation_targets: ["admin-settings", "runtime-secrets", "source-folder-config", "read-model-cache"]
  });
  assert.deepEqual(adminCommandReadModelInvalidationPolicy("library-scan"), {
    command: "library-scan",
    invalidates_source_video_read_model: true,
    requires_read_model_reconcile: true,
    reason: "library-scan-or-init",
    scan_mode: "folder-scan",
    mutation_targets: ["library-manifest", "source-video-manifest", "read-model-cache"]
  });
  assert.deepEqual(adminCommandReadModelInvalidationPolicy("library-scan-new"), {
    command: "library-scan-new",
    invalidates_source_video_read_model: true,
    requires_read_model_reconcile: true,
    reason: "library-scan-or-init",
    scan_mode: "folder-scan",
    mutation_targets: ["library-manifest", "source-video-manifest", "read-model-cache"]
  });
  assert.deepEqual(adminCommandReadModelInvalidationPolicy("source-video-cover"), {
    command: "source-video-cover",
    invalidates_source_video_read_model: true,
    requires_read_model_reconcile: false,
    reason: "source-video-manifest-change",
    scan_mode: "single-id",
    mutation_targets: ["source-video-artifact", "source-video-manifest", "read-model-cache"]
  });
  assert.deepEqual(adminCommandReadModelInvalidationPolicy("preprocess-supervisor-publish-ready"), {
    command: "preprocess-supervisor-publish-ready",
    invalidates_source_video_read_model: true,
    requires_read_model_reconcile: false,
    reason: "source-video-manifest-change",
    scan_mode: "status-scan",
    mutation_targets: [
      "library-manifest",
      "source-video-manifest",
      "source-video-artifact",
      "preprocess-job",
      "index-release",
      "read-model-cache"
    ]
  });
  assert.deepEqual(adminCommandReadModelInvalidationPolicy("read-model-reconcile"), {
    command: "read-model-reconcile",
    invalidates_source_video_read_model: true,
    requires_read_model_reconcile: false,
    reason: "read-model-rebuild",
    scan_mode: "full-reconcile",
    mutation_targets: ["read-model-cache"]
  });
  assert.deepEqual(adminCommandReadModelInvalidationPolicy("command-snapshot-restore"), {
    command: "command-snapshot-restore",
    invalidates_source_video_read_model: true,
    requires_read_model_reconcile: true,
    reason: "read-model-rebuild",
    scan_mode: "no-scan",
    mutation_targets: [
      "admin-settings",
      "source-folder-config",
      "library-manifest",
      "source-video-manifest",
      "source-video-artifact",
      "preprocess-job",
      "index-release",
      "read-model-cache"
    ]
  });
  assert.deepEqual(adminCommandReadModelInvalidationPolicy("cutter-user-password-reset"), {
    command: "cutter-user-password-reset",
    invalidates_source_video_read_model: false,
    requires_read_model_reconcile: false,
    reason: "none",
    scan_mode: "no-scan",
    mutation_targets: ["cutter-user-store"]
  });
  assert.deepEqual(adminCommandReadModelInvalidationPolicy("admin-auth-login"), {
    command: "admin-auth-login",
    invalidates_source_video_read_model: false,
    requires_read_model_reconcile: false,
    reason: "none",
    scan_mode: "no-scan",
    mutation_targets: ["admin-user-store", "admin-session-store"]
  });
  assert.deepEqual(adminCommandReadModelInvalidationPolicy("admin-auth-logout"), {
    command: "admin-auth-logout",
    invalidates_source_video_read_model: false,
    requires_read_model_reconcile: false,
    reason: "none",
    scan_mode: "no-scan",
    mutation_targets: ["admin-session-store"]
  });
  assert.deepEqual(adminCommandReadModelInvalidationPolicy("preprocess-worker-stage"), {
    command: "preprocess-worker-stage",
    invalidates_source_video_read_model: false,
    requires_read_model_reconcile: false,
    reason: "none",
    scan_mode: "single-id",
    mutation_targets: ["preprocess-job", "preprocess-job-log"]
  });
  assert.deepEqual(adminCommandReadModelInvalidationPolicy("preprocess-worker-complete"), {
    command: "preprocess-worker-complete",
    invalidates_source_video_read_model: true,
    requires_read_model_reconcile: false,
    reason: "source-video-manifest-change",
    scan_mode: "single-id",
    mutation_targets: [
      "library-manifest",
      "source-video-manifest",
      "source-video-artifact",
      "preprocess-job",
      "preprocess-job-log",
      "read-model-cache"
    ]
  });
  assert.deepEqual(adminCommandReadModelInvalidationPolicy("preprocess-worker-refresh-counts"), {
    command: "preprocess-worker-refresh-counts",
    invalidates_source_video_read_model: true,
    requires_read_model_reconcile: true,
    reason: "library-scan-or-init",
    scan_mode: "status-scan",
    mutation_targets: ["library-manifest", "read-model-cache"]
  });
});

test("admin transition command specs centralize queue retry and recover rules", () => {
  assert.deepEqual(adminTransitionCommandSpec("preprocess-queue-unprocessed"), {
    command: "preprocess-queue-unprocessed",
    scope: "bulk",
    from: ["unprocessed"],
    to: "queued",
    reason: "queued-by-admin"
  });
  assert.deepEqual(adminTransitionCommandSpec("preprocess-queue-unprocessed-pipeline"), {
    command: "preprocess-queue-unprocessed-pipeline",
    scope: "bulk",
    from: ["unprocessed"],
    to: "queued",
    reason: "queued-by-pipeline"
  });
  assert.deepEqual(adminTransitionCommandSpec("source-video-recover-processing"), {
    command: "source-video-recover-processing",
    scope: "single",
    from: ["processing"],
    to: "queued",
    reason: "recover-processing-by-admin"
  });
});

test("recover processing commands are blocked while supervisor is active", () => {
  assert.equal(adminRecoverProcessingSupervisorBlock({
    command: "source-video-recover-processing",
    supervisor_state: "idle"
  }), null);
  assert.deepEqual(adminRecoverProcessingSupervisorBlock({
    command: "preprocess-recover-processing",
    supervisor_state: "running"
  }), {
    error_code: "invalid_request",
    message: "预处理流水线仍在运行，不能恢复正在处理的任务。"
  });
  assert.deepEqual(adminRecoverProcessingSupervisorBlock({
    command: "command-snapshot-restore",
    supervisor_state: "running"
  }), {
    error_code: "invalid_request",
    message: "预处理流水线仍在运行，不能恢复正在处理的任务。"
  });
});

test("admin transition guard blocks targeted ready status downgrade", () => {
  assert.throws(() => {
    assertAdminTransitionAllowed({
      manifests: [
        sourceVideoManifest({
          source_video_id: "V000001",
          preprocess_status: "ready"
        })
      ],
      from: ["unprocessed"],
      to: "queued",
      requested_source_video_ids: new Set(["V000001"])
    });
  }, AdminReadyProtectionError);
});

test("admin transition guard allows unrelated ready rows in bulk non-ready transitions", () => {
  assert.doesNotThrow(() => {
    assertAdminTransitionAllowed({
      manifests: [
        sourceVideoManifest({
          source_video_id: "V000001",
          preprocess_status: "ready"
        }),
        sourceVideoManifest({
          source_video_id: "V000002",
          preprocess_status: "unprocessed"
        })
      ],
      from: ["unprocessed"],
      to: "queued"
    });
  });
});
