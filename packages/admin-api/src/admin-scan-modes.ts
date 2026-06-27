export const ADMIN_SCAN_MODES = [
  "no-scan",
  "single-id",
  "paged-list",
  "folder-scan",
  "status-scan",
  "full-reconcile"
] as const;

export type AdminScanMode = (typeof ADMIN_SCAN_MODES)[number];

export type AdminScanDataSource =
  | "admin-settings"
  | "admin-read-model"
  | "command-snapshot"
  | "current-index"
  | "data-loading-contract"
  | "doctor-probes"
  | "index-version-packages"
  | "library-manifest"
  | "operation-log"
  | "path-checks"
  | "read-model-reconcile"
  | "runtime-telemetry"
  | "runtime-secrets"
  | "source-folders"
  | "source-video-manifest"
  | "supervisor-runtime"
  | "transcript-artifacts"
  | "usage-events"
  | "user-store";

export type AdminScanReason =
  | "background-metrics"
  | "doctor-route"
  | "explicit-reconcile-cancel"
  | "explicit-read-model-reconcile"
  | "explicit-scan-apply"
  | "explicit-scan-preview"
  | "index-version-page"
  | "operation-log-tail"
  | "read-model-health"
  | "route-owned-page"
  | "selected-record"
  | "settings-route"
  | "shell-contract"
  | "shell-summary"
  | "user-management-route";

export interface AdminScanModeProfile {
  mode: AdminScanMode;
  blocks_page_open: boolean;
  scans_source_folders: boolean;
  scans_manifest_tree: boolean;
  default_data_source: AdminScanDataSource;
  default_reason: AdminScanReason;
}

const adminScanModeProfiles = {
  "no-scan": {
    mode: "no-scan",
    blocks_page_open: false,
    scans_source_folders: false,
    scans_manifest_tree: false,
    default_data_source: "library-manifest",
    default_reason: "shell-summary"
  },
  "single-id": {
    mode: "single-id",
    blocks_page_open: false,
    scans_source_folders: false,
    scans_manifest_tree: false,
    default_data_source: "source-video-manifest",
    default_reason: "selected-record"
  },
  "paged-list": {
    mode: "paged-list",
    blocks_page_open: false,
    scans_source_folders: false,
    scans_manifest_tree: false,
    default_data_source: "admin-read-model",
    default_reason: "route-owned-page"
  },
  "folder-scan": {
    mode: "folder-scan",
    blocks_page_open: true,
    scans_source_folders: true,
    scans_manifest_tree: true,
    default_data_source: "source-folders",
    default_reason: "explicit-scan-preview"
  },
  "status-scan": {
    mode: "status-scan",
    blocks_page_open: false,
    scans_source_folders: false,
    scans_manifest_tree: true,
    default_data_source: "admin-read-model",
    default_reason: "route-owned-page"
  },
  "full-reconcile": {
    mode: "full-reconcile",
    blocks_page_open: true,
    scans_source_folders: false,
    scans_manifest_tree: true,
    default_data_source: "read-model-reconcile",
    default_reason: "explicit-read-model-reconcile"
  }
} satisfies Record<AdminScanMode, AdminScanModeProfile>;

export function adminScanModeProfile(mode: AdminScanMode): AdminScanModeProfile {
  return adminScanModeProfiles[mode];
}

export function isAdminScanMode(value: string): value is AdminScanMode {
  return ADMIN_SCAN_MODES.includes(value as AdminScanMode);
}
