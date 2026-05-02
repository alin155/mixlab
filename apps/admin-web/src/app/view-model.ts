import { validateRequiredPages, type StatusTone } from "@mixlab/ui-foundation";
import type { AdminPreprocessStatus } from "../api.ts";
import { ADMIN_NAV_ITEMS } from "./navigation.ts";

export function adminStatusTone(status: AdminPreprocessStatus | string): StatusTone {
  if (status === "ready" || status === "done" || status === "pass") {
    return "ready";
  }

  if (status === "processing" || status === "running") {
    return "processing";
  }

  if (status === "failed" || status === "fail") {
    return "failed";
  }

  if (status === "index-required" || status === "warn" || status === "warning") {
    return "warning";
  }

  return "queued";
}

export function formatAdminDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatAdminFileSize(bytes: number): string {
  if (bytes >= 1_000_000_000_000) {
    return `${(bytes / 1_000_000_000_000).toFixed(2)} TB`;
  }

  if (bytes >= 1_000_000_000) {
    return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  }

  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(2)} MB`;
  }

  return `${bytes} B`;
}

export function redactConfiguredSecret(configured: boolean): string {
  return configured ? "已配置，已隐藏" : "未配置";
}

export function assertAdminNavigationContract() {
  return validateRequiredPages(
    "admin",
    ADMIN_NAV_ITEMS.map((item) => item.label)
  );
}
