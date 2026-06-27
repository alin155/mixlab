import type {
  AdminCommandMutationTarget,
  AdminCommandName
} from "./admin-command-guard.ts";
import type { AdminScanMode } from "./admin-scan-modes.ts";

export type AdminWriteRouteMethod = "POST" | "PATCH" | "DELETE";

export type AdminWriteRouteOwner =
  | "command-runtime"
  | "readonly-preview"
  | "supervisor-runtime"
  | "maintenance-control"
  | "runtime-diagnostic";

export type AdminWriteRouteCommandRuntime = "direct" | "background" | "none";

export type AdminWriteRouteAuditSurface =
  | "command-audit"
  | "auth-response"
  | "runtime-status"
  | "diagnostic-response";

export type AdminWriteRouteMutationTarget =
  | AdminCommandMutationTarget
  | "admin-user-store"
  | "admin-session-store"
  | "preprocess-supervisor-runtime"
  | "diagnostic-report"
  | "runtime-secret-env"
  | "read-model-reconcile-control"
  | "none";

export interface AdminWriteRouteAuditEntry {
  endpoint: string;
  method: AdminWriteRouteMethod;
  owner: AdminWriteRouteOwner;
  command?: AdminCommandName;
  command_runtime: AdminWriteRouteCommandRuntime;
  scan_mode: AdminScanMode;
  uses_writer_lease: boolean;
  audit_surface: AdminWriteRouteAuditSurface;
  mutation_targets: AdminWriteRouteMutationTarget[];
  notes: string;
}

export const adminWriteRouteAuditEntries: readonly AdminWriteRouteAuditEntry[] = [
  {
    endpoint: "/api/admin/auth/register",
    method: "POST",
    owner: "command-runtime",
    command: "admin-auth-register",
    command_runtime: "direct",
    scan_mode: "no-scan",
    uses_writer_lease: true,
    audit_surface: "command-audit",
    mutation_targets: ["admin-user-store", "admin-session-store"],
    notes: "First-admin bootstrap writes the Admin user/session store through Auth Command v1 with metadata-only snapshots so credentials and session tokens are not copied into command details."
  },
  {
    endpoint: "/api/admin/auth/login",
    method: "POST",
    owner: "command-runtime",
    command: "admin-auth-login",
    command_runtime: "direct",
    scan_mode: "no-scan",
    uses_writer_lease: true,
    audit_surface: "command-audit",
    mutation_targets: ["admin-user-store", "admin-session-store"],
    notes: "Login may write last-login and session metadata through Auth Command v1 but stays separate from source-video and release command semantics."
  },
  {
    endpoint: "/api/admin/auth/logout",
    method: "POST",
    owner: "command-runtime",
    command: "admin-auth-logout",
    command_runtime: "direct",
    scan_mode: "no-scan",
    uses_writer_lease: true,
    audit_surface: "command-audit",
    mutation_targets: ["admin-session-store"],
    notes: "Logout removes one Admin session through Auth Command v1 without touching library assets or source-video read models."
  },
  {
    endpoint: "/api/admin/settings/config",
    method: "PATCH",
    owner: "command-runtime",
    command: "settings-config",
    command_runtime: "direct",
    scan_mode: "no-scan",
    uses_writer_lease: true,
    audit_surface: "command-audit",
    mutation_targets: ["admin-settings", "runtime-secrets", "source-folder-config", "read-model-cache"],
    notes: "Settings mutations are command-gated and invalidate the read model when source-folder scope changes."
  },
  {
    endpoint: "/api/admin/settings/source-folders",
    method: "POST",
    owner: "command-runtime",
    command: "source-folder-add",
    command_runtime: "direct",
    scan_mode: "no-scan",
    uses_writer_lease: true,
    audit_surface: "command-audit",
    mutation_targets: ["admin-settings", "source-folder-config", "read-model-cache"],
    notes: "Source-folder add is a settings command, not a hidden scan."
  },
  {
    endpoint: "/api/admin/settings/source-folders/:source_folder_id",
    method: "PATCH",
    owner: "command-runtime",
    command: "source-folder-update",
    command_runtime: "direct",
    scan_mode: "no-scan",
    uses_writer_lease: true,
    audit_surface: "command-audit",
    mutation_targets: ["admin-settings", "source-folder-config", "read-model-cache"],
    notes: "Source-folder update is a settings command and must not scan source videos during route handling."
  },
  {
    endpoint: "/api/admin/settings/source-folders/:source_folder_id",
    method: "DELETE",
    owner: "command-runtime",
    command: "source-folder-remove",
    command_runtime: "direct",
    scan_mode: "no-scan",
    uses_writer_lease: true,
    audit_surface: "command-audit",
    mutation_targets: ["admin-settings", "source-folder-config", "read-model-cache"],
    notes: "Source-folder removal is command-gated because it can change the next scan scope."
  },
  {
    endpoint: "/api/admin/library/init",
    method: "POST",
    owner: "command-runtime",
    command: "library-init",
    command_runtime: "direct",
    scan_mode: "no-scan",
    uses_writer_lease: true,
    audit_surface: "command-audit",
    mutation_targets: ["library-manifest", "read-model-cache"],
    notes: "Library initialization creates library metadata but must not enumerate all source videos."
  },
  {
    endpoint: "/api/admin/library/scan",
    method: "POST",
    owner: "command-runtime",
    command: "library-scan",
    command_runtime: "direct",
    scan_mode: "folder-scan",
    uses_writer_lease: true,
    audit_surface: "command-audit",
    mutation_targets: ["library-manifest", "source-video-manifest", "read-model-cache"],
    notes: "Scan apply is explicit, command-gated, preview-protected, and never a page-load side effect."
  },
  {
    endpoint: "/api/admin/library/scan-preview",
    method: "POST",
    owner: "readonly-preview",
    command_runtime: "none",
    scan_mode: "folder-scan",
    uses_writer_lease: false,
    audit_surface: "diagnostic-response",
    mutation_targets: ["none"],
    notes: "Scan preview is intentionally read-only. It may traverse source folders but must not mutate production data."
  },
  {
    endpoint: "/api/admin/preprocess/supervisor/start",
    method: "POST",
    owner: "supervisor-runtime",
    command_runtime: "none",
    scan_mode: "status-scan",
    uses_writer_lease: false,
    audit_surface: "runtime-status",
    mutation_targets: ["preprocess-supervisor-runtime", "runtime-secret-env"],
    notes: "Supervisor start controls a background runtime after safety checks. Worker-side writes require a separate pipeline write-path audit."
  },
  {
    endpoint: "/api/admin/preprocess/supervisor/stop",
    method: "POST",
    owner: "supervisor-runtime",
    command_runtime: "none",
    scan_mode: "no-scan",
    uses_writer_lease: false,
    audit_surface: "runtime-status",
    mutation_targets: ["preprocess-supervisor-runtime"],
    notes: "Supervisor stop changes in-memory runtime state and does not directly mutate manifests."
  },
  {
    endpoint: "/api/admin/preprocess/queue-unprocessed",
    method: "POST",
    owner: "command-runtime",
    command: "preprocess-queue-unprocessed",
    command_runtime: "direct",
    scan_mode: "status-scan",
    uses_writer_lease: true,
    audit_surface: "command-audit",
    mutation_targets: ["library-manifest", "source-video-manifest", "preprocess-job", "read-model-cache"],
    notes: "Bulk queue is command-gated and ready downgrade blockers apply."
  },
  {
    endpoint: "/api/admin/preprocess/retry-failed",
    method: "POST",
    owner: "command-runtime",
    command: "preprocess-retry-failed",
    command_runtime: "direct",
    scan_mode: "status-scan",
    uses_writer_lease: true,
    audit_surface: "command-audit",
    mutation_targets: ["library-manifest", "source-video-manifest", "preprocess-job", "read-model-cache"],
    notes: "Bulk retry is command-gated and bounded to failed records."
  },
  {
    endpoint: "/api/admin/preprocess/recover-processing",
    method: "POST",
    owner: "command-runtime",
    command: "preprocess-recover-processing",
    command_runtime: "direct",
    scan_mode: "status-scan",
    uses_writer_lease: true,
    audit_surface: "command-audit",
    mutation_targets: ["library-manifest", "source-video-manifest", "preprocess-job", "read-model-cache"],
    notes: "Bulk processing recovery is command-gated and requires inactive supervisor state."
  },
  {
    endpoint: "/api/admin/source-videos/:source_video_id/cover",
    method: "PATCH",
    owner: "command-runtime",
    command: "source-video-cover",
    command_runtime: "direct",
    scan_mode: "single-id",
    uses_writer_lease: true,
    audit_surface: "command-audit",
    mutation_targets: ["source-video-artifact", "source-video-manifest", "read-model-cache"],
    notes: "Cover mutation is a single-id source-video command with snapshot capture."
  },
  {
    endpoint: "/api/admin/source-videos/:source_video_id/metadata",
    method: "PATCH",
    owner: "command-runtime",
    command: "source-video-metadata",
    command_runtime: "direct",
    scan_mode: "single-id",
    uses_writer_lease: true,
    audit_surface: "command-audit",
    mutation_targets: ["source-video-manifest", "read-model-cache"],
    notes: "Metadata mutation is allowed for ready rows but still command-gated and audited."
  },
  {
    endpoint: "/api/admin/source-videos/:source_video_id/queue",
    method: "POST",
    owner: "command-runtime",
    command: "source-video-queue",
    command_runtime: "direct",
    scan_mode: "single-id",
    uses_writer_lease: true,
    audit_surface: "command-audit",
    mutation_targets: ["library-manifest", "source-video-manifest", "preprocess-job", "read-model-cache"],
    notes: "Single-id queue is command-gated and blocks ready downgrade."
  },
  {
    endpoint: "/api/admin/source-videos/:source_video_id/retry",
    method: "POST",
    owner: "command-runtime",
    command: "source-video-retry",
    command_runtime: "direct",
    scan_mode: "single-id",
    uses_writer_lease: true,
    audit_surface: "command-audit",
    mutation_targets: ["library-manifest", "source-video-manifest", "preprocess-job", "read-model-cache"],
    notes: "Single-id retry is command-gated."
  },
  {
    endpoint: "/api/admin/source-videos/:source_video_id/recover-processing",
    method: "POST",
    owner: "command-runtime",
    command: "source-video-recover-processing",
    command_runtime: "direct",
    scan_mode: "single-id",
    uses_writer_lease: true,
    audit_surface: "command-audit",
    mutation_targets: ["library-manifest", "source-video-manifest", "preprocess-job", "read-model-cache"],
    notes: "Single-id recovery is command-gated and requires inactive supervisor state."
  },
  {
    endpoint: "/api/admin/source-videos/:source_video_id/publish",
    method: "POST",
    owner: "command-runtime",
    command: "source-video-publish",
    command_runtime: "direct",
    scan_mode: "single-id",
    uses_writer_lease: true,
    audit_surface: "command-audit",
    mutation_targets: ["library-manifest", "source-video-manifest", "preprocess-job", "index-release", "read-model-cache"],
    notes: "Single-id publish is command-gated and clears index-version cache."
  },
  {
    endpoint: "/api/admin/index/repair",
    method: "POST",
    owner: "command-runtime",
    command: "index-repair",
    command_runtime: "direct",
    scan_mode: "status-scan",
    uses_writer_lease: true,
    audit_surface: "command-audit",
    mutation_targets: ["library-manifest", "source-video-manifest", "preprocess-job", "index-release", "read-model-cache"],
    notes: "Index repair is command-gated and must not run as a page-load side effect."
  },
  {
    endpoint: "/api/admin/read-model/reconcile",
    method: "POST",
    owner: "command-runtime",
    command: "read-model-reconcile",
    command_runtime: "background",
    scan_mode: "full-reconcile",
    uses_writer_lease: true,
    audit_surface: "command-audit",
    mutation_targets: ["read-model-cache"],
    notes: "The route starts the reconciler; the background reconciler executes through runAdminCommand with writer lease and command audit."
  },
  {
    endpoint: "/api/admin/read-model/reconcile/cancel",
    method: "POST",
    owner: "maintenance-control",
    command_runtime: "none",
    scan_mode: "no-scan",
    uses_writer_lease: false,
    audit_surface: "runtime-status",
    mutation_targets: ["read-model-reconcile-control"],
    notes: "Cancel requests a safe checkpoint stop and does not scan or mutate library facts."
  },
  {
    endpoint: "/api/admin/doctor/run",
    method: "POST",
    owner: "runtime-diagnostic",
    command_runtime: "none",
    scan_mode: "status-scan",
    uses_writer_lease: false,
    audit_surface: "diagnostic-response",
    mutation_targets: ["runtime-secret-env"],
    notes: "Doctor run refreshes runtime secrets and returns diagnostics; it is not a library mutation command."
  },
  {
    endpoint: "/api/admin/doctor/export",
    method: "POST",
    owner: "runtime-diagnostic",
    command_runtime: "none",
    scan_mode: "status-scan",
    uses_writer_lease: false,
    audit_surface: "diagnostic-response",
    mutation_targets: ["runtime-secret-env", "diagnostic-report"],
    notes: "Doctor export may write a diagnostic report artifact but must not mutate source-video or release facts."
  },
  {
    endpoint: "/api/admin/settings/test-asr",
    method: "POST",
    owner: "runtime-diagnostic",
    command_runtime: "none",
    scan_mode: "no-scan",
    uses_writer_lease: false,
    audit_surface: "diagnostic-response",
    mutation_targets: ["runtime-secret-env"],
    notes: "ASR test only validates runtime configuration."
  },
  {
    endpoint: "/api/admin/cutter-users/:user_id/approve",
    method: "POST",
    owner: "command-runtime",
    command: "cutter-user-approve",
    command_runtime: "direct",
    scan_mode: "no-scan",
    uses_writer_lease: true,
    audit_surface: "command-audit",
    mutation_targets: ["cutter-user-store"],
    notes: "Cutter user approval is command-gated but does not invalidate source-video read models."
  },
  {
    endpoint: "/api/admin/cutter-users/:user_id/disable",
    method: "POST",
    owner: "command-runtime",
    command: "cutter-user-disable",
    command_runtime: "direct",
    scan_mode: "no-scan",
    uses_writer_lease: true,
    audit_surface: "command-audit",
    mutation_targets: ["cutter-user-store"],
    notes: "Cutter user disable is command-gated and keeps password/session details redacted."
  },
  {
    endpoint: "/api/admin/cutter-users/:user_id/password",
    method: "POST",
    owner: "command-runtime",
    command: "cutter-user-password-reset",
    command_runtime: "direct",
    scan_mode: "no-scan",
    uses_writer_lease: true,
    audit_surface: "command-audit",
    mutation_targets: ["cutter-user-store"],
    notes: "Cutter password reset is command-gated and must never log plaintext passwords."
  },
  {
    endpoint: "/api/admin/command-snapshots/:snapshot_id/restore",
    method: "POST",
    owner: "command-runtime",
    command: "command-snapshot-restore",
    command_runtime: "direct",
    scan_mode: "no-scan",
    uses_writer_lease: true,
    audit_surface: "command-audit",
    mutation_targets: [
      "admin-settings",
      "source-folder-config",
      "library-manifest",
      "source-video-manifest",
      "source-video-artifact",
      "preprocess-job",
      "index-release",
      "read-model-cache"
    ],
    notes: "Restore execution is command-gated, supervisor-blocked, and preflighted by restore-plan."
  }
];

export function adminWriteRouteAuditKey(input: {
  endpoint: string;
  method: AdminWriteRouteMethod;
}): string {
  return `${input.method} ${input.endpoint}`;
}

export function adminWriteRouteAuditKeys(): string[] {
  return adminWriteRouteAuditEntries.map(adminWriteRouteAuditKey).sort();
}

export function adminWriteRouteAuditEntry(
  input: { endpoint: string; method: AdminWriteRouteMethod }
): AdminWriteRouteAuditEntry | null {
  return adminWriteRouteAuditEntries.find((entry) =>
    entry.endpoint === input.endpoint &&
    entry.method === input.method
  ) ?? null;
}
