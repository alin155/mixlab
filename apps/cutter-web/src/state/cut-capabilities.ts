import {
  capabilityEnabled,
  isCapabilityTableV1,
  type CapabilityTableV1
} from "../../../../packages/contracts/src/capabilities.ts";
import { compareVersions } from "../../../../packages/contracts/src/release-manifest.ts";
import {
  contractErrorDefinition
} from "../../../../packages/contracts/src/errors.ts";

export type CutterCapabilityTable = CapabilityTableV1;

export type CutterFeatureState = "supported" | "unsupported" | "unknown";

export function parseCutterCapabilities(value: unknown): CutterCapabilityTable | null {
  return isCapabilityTableV1(value) ? value : null;
}

export function cutterFeatureState(
  capabilities: CutterCapabilityTable | null | undefined,
  feature: string
): CutterFeatureState {
  if (!capabilities) {
    return "unknown";
  }

  return capabilityEnabled(capabilities, feature) ? "supported" : "unsupported";
}

/**
 * Verification UI is field/capability driven:
 * - no capability endpoint (old engine / 404) => legacy field-based behaviour;
 * - capability advertised => follow it (absent feature = unsupported).
 */
export function cutVerificationUiEnabled(
  capabilities: CutterCapabilityTable | null | undefined
): boolean {
  return cutterFeatureState(capabilities, "cut_verification") !== "unsupported";
}

/** release_v2 UI is only shown when the server explicitly advertises the feature. */
export function releaseV2UiEnabled(
  capabilities: CutterCapabilityTable | null | undefined
): boolean {
  return capabilityEnabled(capabilities, "release_v2");
}

const SEMVER_PATTERN = /^\d+\.\d+\.\d+([-+].*)?$/;

function normalizedSemverInput(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/^v/i, "");
  return trimmed && SEMVER_PATTERN.test(trimmed) ? trimmed : undefined;
}

export function isSemverLike(value: string | undefined): boolean {
  return normalizedSemverInput(value) !== undefined;
}

/**
 * Client version used for min_client_version checks. Build commit hashes are not
 * semver, so an unknown client version never blocks the user with a fake
 * "upgrade required" prompt.
 */
export function resolveCutterClientVersion(input: {
  envClientVersion?: string;
  buildCommit?: string;
}): string | undefined {
  const envVersion = normalizedSemverInput(input.envClientVersion);
  if (envVersion) {
    return envVersion;
  }

  const buildCommit = normalizedSemverInput(input.buildCommit);
  if (buildCommit) {
    return buildCommit;
  }

  return undefined;
}

export interface CapabilityUpgradeNotice {
  code: "CONTRACT_TOO_OLD";
  required_version: string;
  message: string;
  remediation: string;
}

export function capabilityUpgradeNotice(
  capabilities: CutterCapabilityTable | null | undefined,
  clientVersion: string | undefined
): CapabilityUpgradeNotice | null {
  if (!capabilities || !clientVersion) {
    return null;
  }

  const requiredVersion = capabilities.min_client_version.trim();
  if (!requiredVersion || compareVersions(clientVersion, requiredVersion) >= 0) {
    return null;
  }

  const definition = contractErrorDefinition("CONTRACT_TOO_OLD");
  return {
    code: "CONTRACT_TOO_OLD",
    required_version: requiredVersion,
    message: definition?.user_message ?? "客户端版本过低，请升级",
    remediation: (definition?.remediation ?? "下载并安装最新客户端") +
      "（需要 v" + requiredVersion + " 及以上）"
  };
}
