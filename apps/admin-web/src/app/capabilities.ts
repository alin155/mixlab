import {
  CONTRACT_VERSION,
  capabilityEnabled,
  compareVersions,
  isCapabilityTableV1,
  type CapabilityTableV1
} from "../../../../packages/contracts/src/index.ts";
import { isAdminHttpError } from "../admin-http.ts";

export const ADMIN_WEB_CLIENT_VERSION = "0.1.0";

export type AdminCapabilityStatus = "loading" | "ready" | "unavailable";

export interface AdminCapabilityState {
  status: AdminCapabilityStatus;
  table?: CapabilityTableV1;
  message?: string;
}

export interface AdminCapabilityFeatureRow {
  key: string;
  label: string;
  enabled: boolean;
}

export interface AdminCapabilityCompatibility {
  compatible: boolean;
  client_version: string;
  min_client_version: string;
  label: string;
}

const CAPABILITY_FEATURE_LABELS: Record<string, string> = {
  release_v2: "发布 v2（发布清单/原子发布）",
  event_batch: "事件批量上报",
  smart_beta: "智能分析（Beta）",
  searchd: "本地搜索服务",
  workspace_lease: "工作区租约",
  local_agent: "本机剪辑引擎",
  asset_cache: "素材缓存",
  admin_capabilities: "管理端能力发现"
};

export function adminCapabilityFeatureLabel(feature: string): string {
  return CAPABILITY_FEATURE_LABELS[feature] ?? feature;
}

export function resolveAdminClientVersion(envValue?: string | null): string {
  const trimmed = envValue?.trim();
  return trimmed ? trimmed : ADMIN_WEB_CLIENT_VERSION;
}

export function parseAdminCapabilityTable(value: unknown): CapabilityTableV1 | null {
  return isCapabilityTableV1(value) ? value : null;
}

/** 404/路由未实现等“接口暂未就绪”场景降级为“版本信息不可用”，其它错误保留原因。 */
export function adminCapabilityUnavailableMessage(error: unknown): string {
  if (isAdminHttpError(error)) {
    const normalizedCode = error.code.toUpperCase();
    const notProvided = error.status === 404 ||
      normalizedCode === "NOT_FOUND" ||
      error.code === "not_found" ||
      error.code === "route_not_found" ||
      (error.status === 404 && error.code === "invalid_response");

    if (notProvided) {
      return "版本信息不可用：当前管理端 API 未提供 v1 capabilities 接口（可稍后重试）。";
    }

    return `版本信息不可用：${error.serverMessage || error.code}（错误码：${error.code}）`;
  }

  if (error instanceof Error && error.message.trim()) {
    return `版本信息不可用：${error.message.trim()}`;
  }

  return "版本信息不可用：无法连接管理端 API。";
}

export function adminCapabilityFeatureRows(table: CapabilityTableV1 | null | undefined): AdminCapabilityFeatureRow[] {
  if (!table) {
    return [];
  }

  return Object.entries(table.features)
    .map(([key, enabled]) => ({
      key,
      label: adminCapabilityFeatureLabel(key),
      enabled: Boolean(enabled)
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
}

export function adminCapabilityEnabled(
  state: AdminCapabilityState | null | undefined,
  feature: string
): boolean {
  return state?.status === "ready" && capabilityEnabled(state.table, feature);
}

/** 能力缺失时入口应隐藏或降级提示；返回 visible=false 时 UI 需展示 reason。 */
export function adminCapabilityGate(
  state: AdminCapabilityState | null | undefined,
  feature: string
): { visible: boolean; reason: string } {
  if (!state || state.status !== "ready") {
    return {
      visible: false,
      reason: state?.status === "unavailable"
        ? state.message ?? "版本信息不可用，无法确认该能力是否启用。"
        : "正在读取服务端能力信息，暂不展示该入口。"
    };
  }

  if (!capabilityEnabled(state.table, feature)) {
    return {
      visible: false,
      reason: `当前服务端未启用「${adminCapabilityFeatureLabel(feature)}」，该入口已隐藏；如需使用请升级或联系管理员。`
    };
  }

  return { visible: true, reason: "" };
}

export function adminCapabilityCompatibility(
  table: CapabilityTableV1,
  clientVersion: string
): AdminCapabilityCompatibility {
  const difference = compareVersions(clientVersion, table.min_client_version);

  return {
    compatible: difference >= 0,
    client_version: clientVersion,
    min_client_version: table.min_client_version,
    label: difference >= 0
      ? "客户端版本满足服务端最低要求"
      : `客户端版本低于最低要求（${table.min_client_version}），请升级管理端`
  };
}

export function adminCapabilityContractLabel(table: CapabilityTableV1 | null | undefined): string {
  return table?.contract_version || CONTRACT_VERSION;
}

export function adminCapabilityFeatureSummary(table: CapabilityTableV1 | null | undefined): string {
  const rows = adminCapabilityFeatureRows(table);

  if (rows.length === 0) {
    return "未提供能力清单";
  }

  const enabled = rows.filter((row) => row.enabled).map((row) => row.label);
  const disabled = rows.filter((row) => !row.enabled).map((row) => row.label);

  return [
    enabled.length > 0 ? `已启用：${enabled.join("、")}` : "已启用：无",
    disabled.length > 0 ? `未启用：${disabled.join("、")}` : ""
  ].filter(Boolean).join("；");
}
