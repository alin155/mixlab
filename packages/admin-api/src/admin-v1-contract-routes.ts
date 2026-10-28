import {
  CONTRACT_ERRORS,
  CONTRACT_VERSION,
  DEFAULT_CAPABILITY_LIMITS,
  isCapabilityTableV1,
  toContractErrorBody,
  type CapabilityTableV1,
  type ContractErrorDefinition
} from "../../contracts/src/index.ts";
import { buildInfo } from "./admin-release-gates.ts";
import {
  adminRegistrationRequiresToken,
  readAdminRegistrationGuard
} from "./admin-auth-routes.ts";

export const ADMIN_V1_CAPABILITIES_PATH = "/api/v1/capabilities";
export const ADMIN_V1_ERRORS_PATH = "/api/v1/errors";
export const ADMIN_V1_MIN_CLIENT_VERSION_DEFAULT = "0.19.0";

export type AdminV1CapabilityFeatureName =
  | "release_v2"
  | "event_batch"
  | "cut_verify"
  | "daily_scan_status"
  | "registration_requires_token";

type AdminV1CapabilityLimitName = keyof typeof DEFAULT_CAPABILITY_LIMITS;

const FEATURE_ENV_PREFIX = "MIXLAB_CAPABILITY_FEATURE_";

const LIMIT_ENV_BY_NAME: Record<AdminV1CapabilityLimitName, string> = {
  event_batch_max: "MIXLAB_CAPABILITY_LIMIT_EVENT_BATCH_MAX",
  page_max: "MIXLAB_CAPABILITY_LIMIT_PAGE_MAX",
  upload_max_bytes: "MIXLAB_CAPABILITY_LIMIT_UPLOAD_MAX_BYTES",
  request_body_max_bytes: "MIXLAB_CAPABILITY_LIMIT_REQUEST_BODY_MAX_BYTES"
};

function envInput(input: { env?: NodeJS.ProcessEnv }): NodeJS.ProcessEnv {
  return input.env ?? process.env;
}

function trimmed(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(trimmed(value) ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function booleanFlag(value: string | undefined): boolean | undefined {
  const normalized = trimmed(value)?.toLowerCase();
  if (normalized === "1" || normalized === "true") {
    return true;
  }
  if (normalized === "0" || normalized === "false") {
    return false;
  }
  return undefined;
}

export interface AdminV1CapabilityFeatureInput {
  env?: NodeJS.ProcessEnv;
  registration_requires_token?: boolean;
  release_v2_enabled?: boolean;
}

/**
 * Default feature truth is evidence-based:
 * - release_v2: management release producer is Round3 work, gated by env until the
 *   v2 producer + consumer end-to-end acceptance lands (MIXLAB_ADMIN_RELEASE_V2_ENABLED=1).
 * - event_batch: usage EventEnvelopeV1 batching/outbox contract is available.
 * - cut_verify: cutter output verification contract (Round1 CUT-P0) is available.
 * - daily_scan_status: Admin daily scan scheduler/status is available.
 * - registration_requires_token: follows the live SEC-05 registration guard config.
 * Any feature can be overridden with MIXLAB_CAPABILITY_FEATURE_<NAME>=0|1.
 */
export function adminV1CapabilityFeatures(
  input: AdminV1CapabilityFeatureInput = {}
): Record<AdminV1CapabilityFeatureName, boolean> {
  const env = envInput(input);
  const readFlag = (name: AdminV1CapabilityFeatureName, fallback: boolean): boolean =>
    booleanFlag(env[`${FEATURE_ENV_PREFIX}${name.toUpperCase()}`]) ?? fallback;
  const releaseV2FromEnv =
    booleanFlag(env.MIXLAB_ADMIN_RELEASE_V2_ENABLED) ?? readFlag("release_v2", false);

  return {
    release_v2: input.release_v2_enabled ?? releaseV2FromEnv,
    event_batch: readFlag("event_batch", true),
    cut_verify: readFlag("cut_verify", true),
    daily_scan_status: readFlag("daily_scan_status", true),
    registration_requires_token:
      input.registration_requires_token ??
      adminRegistrationRequiresToken(readAdminRegistrationGuard(env))
  };
}

export function adminV1CapabilityLimits(input: { env?: NodeJS.ProcessEnv } = {}): Record<string, number> {
  const env = envInput(input);
  return {
    event_batch_max: positiveInteger(
      env[LIMIT_ENV_BY_NAME.event_batch_max],
      DEFAULT_CAPABILITY_LIMITS.event_batch_max
    ),
    page_max: positiveInteger(env[LIMIT_ENV_BY_NAME.page_max], DEFAULT_CAPABILITY_LIMITS.page_max),
    upload_max_bytes: positiveInteger(
      env[LIMIT_ENV_BY_NAME.upload_max_bytes],
      DEFAULT_CAPABILITY_LIMITS.upload_max_bytes
    ),
    request_body_max_bytes: positiveInteger(
      env[LIMIT_ENV_BY_NAME.request_body_max_bytes],
      DEFAULT_CAPABILITY_LIMITS.request_body_max_bytes
    )
  };
}

export interface BuildAdminCapabilityTableV1Input extends AdminV1CapabilityFeatureInput {
  now?: string;
  server_version?: string;
  min_client_version?: string;
  /** Test/Lead wiring overrides; env is the production source of truth. */
  features?: Partial<Record<AdminV1CapabilityFeatureName, boolean>>;
  limits?: Partial<Record<AdminV1CapabilityLimitName, number>>;
}

export function adminV1ServerVersion(input: { env?: NodeJS.ProcessEnv; server_version?: string } = {}): string {
  const explicit = trimmed(input.server_version);
  if (explicit) {
    return explicit;
  }
  const env = envInput(input);
  return trimmed(env.MIXLAB_ADMIN_SERVER_VERSION) ?? trimmed(buildInfo(env).version) ?? "local";
}

export function adminV1MinClientVersion(input: { env?: NodeJS.ProcessEnv; min_client_version?: string } = {}): string {
  return (
    trimmed(input.min_client_version) ??
    trimmed(envInput(input).MIXLAB_ADMIN_MIN_CLIENT_VERSION) ??
    ADMIN_V1_MIN_CLIENT_VERSION_DEFAULT
  );
}

export function buildAdminCapabilityTableV1(input: BuildAdminCapabilityTableV1Input = {}): CapabilityTableV1 {
  const table: CapabilityTableV1 = {
    contract_version: CONTRACT_VERSION,
    server_version: adminV1ServerVersion(input),
    server_product: "admin",
    min_client_version: adminV1MinClientVersion(input),
    features: { ...adminV1CapabilityFeatures(input), ...(input.features ?? {}) },
    limits: { ...adminV1CapabilityLimits(input), ...(input.limits ?? {}) },
    generated_at: input.now ?? new Date().toISOString()
  };

  if (!isCapabilityTableV1(table)) {
    // Build-time invariant: never serve a table that clients cannot validate.
    throw new Error("capability table v1 is invalid");
  }

  return table;
}

export interface AdminContractErrorRegistryV1 {
  contract_version: string;
  generated_at: string;
  errors: readonly ContractErrorDefinition[];
}

export function buildAdminContractErrorRegistryV1(input: { now?: string } = {}): AdminContractErrorRegistryV1 {
  return {
    contract_version: CONTRACT_VERSION,
    generated_at: input.now ?? new Date().toISOString(),
    errors: CONTRACT_ERRORS
  };
}

export interface AdminV1ContractRouteDeps {
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  server_version?: string;
  min_client_version?: string;
  features?: Partial<Record<AdminV1CapabilityFeatureName, boolean>>;
  limits?: Partial<Record<AdminV1CapabilityLimitName, number>>;
}

export interface AdminV1ContractRouteApiInput {
  env?: NodeJS.ProcessEnv;
  now?: () => string;
}

export interface AdminV1ContractHandleInput {
  method: string;
  pathname: string;
  api_input?: AdminV1ContractRouteApiInput;
  env?: NodeJS.ProcessEnv;
  now?: string;
  deps?: AdminV1ContractRouteDeps;
}

export type AdminV1ContractRouteResult =
  | { handled: true; status_code: number; body: unknown }
  | { handled: false };

export function matchAdminV1CapabilitiesPath(pathname: string): boolean {
  return pathname === ADMIN_V1_CAPABILITIES_PATH;
}

export function matchAdminV1ErrorsPath(pathname: string): boolean {
  return pathname === ADMIN_V1_ERRORS_PATH;
}

/** Versioned v1 endpoints are public (no Admin session) so clients can negotiate before login. */
export function isPublicAdminV1ContractRoute(method: string | undefined, pathname: string): boolean {
  return method === "GET" && (matchAdminV1CapabilitiesPath(pathname) || matchAdminV1ErrorsPath(pathname));
}

function v1ErrorBody(input: {
  code: string;
  message?: string;
  httpStatus?: number;
  details?: Record<string, unknown>;
}): unknown {
  return toContractErrorBody({
    code: input.code,
    ...(input.message ? { message: input.message } : {}),
    ...(input.httpStatus ? { httpStatus: input.httpStatus } : {}),
    ...(input.details ? { details: input.details } : {}),
    contractVersion: CONTRACT_VERSION
  });
}

export async function handleAdminV1ContractRoutes(
  input: AdminV1ContractHandleInput
): Promise<AdminV1ContractRouteResult> {
  const env = input.env ?? input.api_input?.env ?? process.env;
  const now = input.deps?.now?.() ?? input.api_input?.now?.() ?? input.now ?? new Date().toISOString();

  if (!input.pathname.startsWith("/api/v1/")) {
    return { handled: false };
  }

  if (input.method !== "GET") {
    return {
      handled: true,
      status_code: 405,
      body: v1ErrorBody({
        code: "VALIDATION_FAILED",
        message: "合同接口仅支持 GET",
        httpStatus: 405,
        details: { method: input.method, pathname: input.pathname }
      })
    };
  }

  if (matchAdminV1CapabilitiesPath(input.pathname)) {
    const deps = input.deps ?? {};
    return {
      handled: true,
      status_code: 200,
      body: buildAdminCapabilityTableV1({
        env,
        now,
        ...(deps.server_version ? { server_version: deps.server_version } : {}),
        ...(deps.min_client_version ? { min_client_version: deps.min_client_version } : {}),
        ...(deps.features ? { features: deps.features } : {}),
        ...(deps.limits ? { limits: deps.limits } : {})
      })
    };
  }

  if (matchAdminV1ErrorsPath(input.pathname)) {
    return {
      handled: true,
      status_code: 200,
      body: buildAdminContractErrorRegistryV1({ now })
    };
  }

  return {
    handled: true,
    status_code: 404,
    body: v1ErrorBody({
      code: "NOT_FOUND",
      message: "合同接口不存在",
      httpStatus: 404,
      details: { pathname: input.pathname }
    })
  };
}
