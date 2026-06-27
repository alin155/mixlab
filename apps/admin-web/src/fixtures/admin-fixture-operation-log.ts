import type {
  AdminCommandRestorePlan,
  AdminCommandSnapshotRestoreResult,
  AdminOperationLogEvent,
  AdminOperationLogResponse
} from "../api.ts";

export function fixtureOperationLog(limit = 50): AdminOperationLogResponse {
  const events: AdminOperationLogEvent[] = [
    {
      schema_version: "1.0",
      event_id: "fixture-command-snapshot-source-video-metadata",
      occurred_at: "2024-05-07T10:32:00.000Z",
      area: "protection",
      action: "source-video-metadata",
      event_type: "succeeded",
      message: "Admin command source-video-metadata succeeded.",
      details: {
        command: "source-video-metadata",
        holder: "admin-api:source-video-metadata",
        actor: {
          kind: "admin-user",
          source: "admin-session",
          admin_id: "AU000001",
          username: "owner",
          display_name: "Owner",
          role: "owner"
        },
        mutation_targets: ["source-video-manifest"],
        command_snapshot: {
          created: true,
          reason: "created",
          snapshot_kind: "file-capture",
          rollback_status: "not-implemented",
          snapshot_id: "fixture-source-video-metadata-snapshot",
          manifest_relative_path: ".mixlab-library/admin/command-snapshots/20240507103200-source-video-metadata/snapshot.json",
          requested_file_count: 1,
          captured_file_count: 1,
          missing_file_count: 0,
          skipped_file_count: 0,
          failed_file_count: 0
        }
      }
    },
    {
      schema_version: "1.0",
      event_id: "fixture-cutter-user-approve",
      occurred_at: "2024-05-07T10:31:30.000Z",
      area: "users",
      action: "cutter-user-approve",
      event_type: "succeeded",
      message: "Admin command cutter-user-approve succeeded.",
      details: {
        command: "cutter-user-approve",
        holder: "admin-api:cutter-user-approve",
        actor: {
          kind: "admin-user",
          source: "admin-session",
          admin_id: "AU000001",
          username: "owner",
          display_name: "Owner",
          role: "owner"
        },
        mutation_targets: ["cutter-user-store"],
        command_snapshot: {
          created: true,
          reason: "created",
          snapshot_kind: "file-capture",
          rollback_status: "not-implemented",
          snapshot_id: "fixture-cutter-user-approve-snapshot",
          manifest_relative_path: ".mixlab-library/admin/command-snapshots/20240507103130-cutter-user-approve/snapshot.json",
          requested_file_count: 1,
          captured_file_count: 1,
          missing_file_count: 0,
          skipped_file_count: 0,
          failed_file_count: 0
        }
      }
    },
    {
      schema_version: "1.0",
      event_id: "fixture-read-model-reconcile-succeeded",
      occurred_at: "2024-05-07T10:30:00.000Z",
      area: "read-model",
      action: "read-model-reconcile",
      event_type: "succeeded",
      message: "已从 127 条 manifest 快照重建 admin.sqlite。",
      details: {
        phase: "completed",
        scanned_source_video_count: 127,
        total_source_video_count: 127
      }
    },
    {
      schema_version: "1.0",
      event_id: "fixture-read-model-reconcile-started",
      occurred_at: "2024-05-07T10:29:00.000Z",
      area: "read-model",
      action: "read-model-reconcile",
      event_type: "started",
      message: "正在后台对账 admin.sqlite 读模型。",
      details: {
        phase: "starting",
        scanned_source_video_count: 0,
        total_source_video_count: 0
      }
    },
    {
      schema_version: "1.0",
      event_id: "fixture-read-model-invalidate-settings",
      occurred_at: "2024-05-07T10:28:00.000Z",
      area: "read-model",
      action: "read-model-invalidate",
      event_type: "succeeded",
      message: "Admin read model 已标记为需要对账。",
      details: {
        command: "settings-config",
        invalidation_reason: "source-folder-scope-change",
        stale_mark_applied: true,
        stale_mark_result: "invalidated"
      }
    }
  ];
  const normalizedLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(100, Math.floor(limit)))
    : 50;

  return {
    schema_version: "1.0",
    generated_at: "2024-05-07T10:31:00.000Z",
    path: "/fixture/.mixlab-library/admin/operation-log/events.ndjson",
    events: events.slice(0, normalizedLimit),
    limit: normalizedLimit,
    total_line_count: events.length,
    malformed_line_count: 0,
    truncated: events.length > normalizedLimit
  };
}

export function fixtureCommandSnapshotRestorePlan(snapshotId: string): AdminCommandRestorePlan {
  return {
    schema_version: "1.0",
    generated_at: "2024-05-07T10:33:00.000Z",
    can_restore: snapshotId === "fixture-source-video-metadata-snapshot",
    command: "source-video-metadata",
    snapshot_id: snapshotId,
    snapshot_kind: "file-capture",
    snapshot_manifest_relative_path:
      ".mixlab-library/admin/command-snapshots/20240507103200-source-video-metadata/snapshot.json",
    file_count: 1,
    restorable_file_count: snapshotId === "fixture-source-video-metadata-snapshot" ? 1 : 0,
    blocked_file_count: snapshotId === "fixture-source-video-metadata-snapshot" ? 0 : 1,
    blockers: snapshotId === "fixture-source-video-metadata-snapshot"
      ? []
      : ["snapshot_manifest_missing"],
    files: [
      {
        label: "source-video-V000042-manifest",
        can_restore: snapshotId === "fixture-source-video-metadata-snapshot",
        status: snapshotId === "fixture-source-video-metadata-snapshot" ? "restorable" : "blocked",
        source_relative_path: ".mixlab-library/videos/V000042/source-video.json",
        snapshot_relative_path:
          ".mixlab-library/admin/command-snapshots/20240507103200-source-video-metadata/files/001-source-video-V000042-manifest",
        target_status: "exists",
        snapshot_status: snapshotId === "fixture-source-video-metadata-snapshot" ? "exists" : "missing",
        expected_size_bytes: 4096,
        snapshot_size_bytes: snapshotId === "fixture-source-video-metadata-snapshot" ? 4096 : undefined,
        blockers: snapshotId === "fixture-source-video-metadata-snapshot"
          ? []
          : ["snapshot_manifest_missing"]
      }
    ]
  };
}

export function fixtureCommandSnapshotRestoreResult(snapshotId: string): AdminCommandSnapshotRestoreResult {
  const plan = fixtureCommandSnapshotRestorePlan(snapshotId);
  const restored = plan.can_restore;

  return {
    schema_version: "1.0",
    restored_at: "2024-05-07T10:34:00.000Z",
    status: restored ? "restored" : "blocked",
    restored_file_count: restored ? plan.restorable_file_count : 0,
    blocked_file_count: restored ? 0 : plan.file_count,
    blockers: restored ? [] : ["restore_plan_blocked"],
    plan,
    files: plan.files.map((file) => ({
      label: file.label,
      restored,
      source_relative_path: file.source_relative_path,
      snapshot_relative_path: file.snapshot_relative_path
    }))
  };
}
