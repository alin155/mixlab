import type { LibraryCounts, PreprocessStatus } from "../../protocol/src/index.ts";

export class AdminReadyProtectionError extends Error {
  readonly code = "preprocess_transition_blocked";
  readonly source_video_ids: string[];

  constructor(sourceVideoIds: string[], to: PreprocessStatus) {
    super(`保护模式阻断：${sourceVideoIds.join(", ")} 已是 ready，不能切换到 ${to}`);
    this.name = "AdminReadyProtectionError";
    this.source_video_ids = sourceVideoIds;
  }
}

export interface AdminProtectionStatus {
  checked_at: string;
  mode: "preprocess-protection-v1";
  ready_video_count: number;
  processing_video_count: number;
  queued_video_count: number;
  index_required_video_count: number;
  current_index_version: string;
  scan_apply_requires_preview: true;
  ready_asset_policy: {
    immutable_status: "ready";
    allowed_ready_mutations: string[];
    blocked_ready_mutations: string[];
  };
  scan_preview_endpoint: "/api/admin/library/scan-preview";
  release_gates_endpoint: "/api/admin/release-gates";
}

export function buildAdminProtectionStatus(input: {
  checked_at: string;
  library: Pick<
    LibraryCounts,
    "ready_video_count" | "processing_video_count" | "queued_video_count" | "index_required_video_count"
  > | null;
  current_index_version: string;
}): AdminProtectionStatus {
  return {
    checked_at: input.checked_at,
    mode: "preprocess-protection-v1",
    ready_video_count: input.library?.ready_video_count ?? 0,
    processing_video_count: input.library?.processing_video_count ?? 0,
    queued_video_count: input.library?.queued_video_count ?? 0,
    index_required_video_count: input.library?.index_required_video_count ?? 0,
    current_index_version: input.current_index_version,
    scan_apply_requires_preview: true,
    ready_asset_policy: {
      immutable_status: "ready",
      allowed_ready_mutations: ["metadata", "cover", "ready -> ready"],
      blocked_ready_mutations: [
        "ready -> queued",
        "ready -> processing",
        "ready -> failed",
        "ready -> unprocessed",
        "ready -> visible_to_cutters=false",
        "scan apply removing ready manifest"
      ]
    },
    scan_preview_endpoint: "/api/admin/library/scan-preview",
    release_gates_endpoint: "/api/admin/release-gates"
  };
}
