import type { AdminDataLoadingPlan } from "./admin-data-loading-plan.ts";
import type { AdminProtectionStatus } from "./admin-protection.ts";
import {
  adminOperationActionForGate,
  type AdminGateStatus,
  type AdminReleaseGatesStatus
} from "./admin-release-gates.ts";

export interface AdminOperationsOverview {
  schema_version: "1.0";
  generated_at: string;
  title: "管理端运行保护中心";
  summary: {
    overall_status: AdminGateStatus;
    release_allowed: boolean;
    blocked_gate_count: number;
    attention_gate_count: number;
    ready_video_count: number;
    queued_video_count: number;
    processing_video_count: number;
    index_required_video_count: number;
    current_index_version: string;
  };
  next_actions: Array<{
    key: string;
    label: string;
    detail: string;
    route: string;
  }>;
  protection: AdminProtectionStatus;
  release: AdminReleaseGatesStatus;
  read_model: unknown;
  data_loading: AdminDataLoadingPlan;
}

export function buildAdminOperationsOverview(input: {
  generated_at: string;
  protection: AdminProtectionStatus;
  release: AdminReleaseGatesStatus;
  read_model: unknown;
  data_loading: AdminDataLoadingPlan;
}): AdminOperationsOverview {
  const blockedGates = input.release.gates.filter((gate) => gate.status === "blocked");
  const attentionGates = input.release.gates.filter((gate) => gate.status === "attention");
  const primaryGates = blockedGates.length > 0 ? blockedGates : attentionGates;

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    title: "管理端运行保护中心",
    summary: {
      overall_status: input.release.overall_status,
      release_allowed: input.release.release_allowed,
      blocked_gate_count: blockedGates.length,
      attention_gate_count: attentionGates.length,
      ready_video_count: input.protection.ready_video_count,
      queued_video_count: input.protection.queued_video_count,
      processing_video_count: input.protection.processing_video_count,
      index_required_video_count: input.protection.index_required_video_count,
      current_index_version: input.protection.current_index_version
    },
    next_actions: primaryGates.map(adminOperationActionForGate),
    protection: input.protection,
    release: input.release,
    read_model: input.read_model,
    data_loading: input.data_loading
  };
}
