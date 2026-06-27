import {
  apiOk,
  type AdminApiEnvelope
} from "./admin-route-adapter.ts";

export interface AdminProtectionReadRouteApiInput {
  library_root: string;
}

export interface AdminProtectionReadRouteDeps<
  TApiInput extends AdminProtectionReadRouteApiInput,
  TProtectionStatus,
  TReleaseGates,
  TPathChecks
> {
  read_protection_status(input: TApiInput): Promise<TProtectionStatus>;
  read_release_gates(input: TApiInput): Promise<TReleaseGates>;
  read_path_checks(input: TApiInput): Promise<TPathChecks>;
}

export type AdminProtectionReadRouteResult =
  | {
      handled: true;
      status_code: number;
      body: AdminApiEnvelope<unknown>;
    }
  | {
      handled: false;
    };

export interface HandleAdminProtectionReadRoutesInput<
  TApiInput extends AdminProtectionReadRouteApiInput,
  TProtectionStatus,
  TReleaseGates,
  TPathChecks
> {
  method: string;
  pathname: string;
  api_input: TApiInput;
  deps: AdminProtectionReadRouteDeps<TApiInput, TProtectionStatus, TReleaseGates, TPathChecks>;
}

export function matchAdminProtectionStatusPath(pathname: string): boolean {
  return pathname === "/api/admin/protection/status";
}

export function matchAdminReleaseGatesPath(pathname: string): boolean {
  return pathname === "/api/admin/release-gates";
}

export function matchAdminLibraryPathChecksPath(pathname: string): boolean {
  return pathname === "/api/admin/library/path-checks";
}

export async function handleAdminProtectionReadRoutes<
  TApiInput extends AdminProtectionReadRouteApiInput,
  TProtectionStatus,
  TReleaseGates,
  TPathChecks
>(
  input: HandleAdminProtectionReadRoutesInput<TApiInput, TProtectionStatus, TReleaseGates, TPathChecks>
): Promise<AdminProtectionReadRouteResult> {
  if (input.method === "GET" && matchAdminProtectionStatusPath(input.pathname)) {
    return {
      handled: true,
      status_code: 200,
      body: apiOk(await input.deps.read_protection_status(input.api_input))
    };
  }

  if (input.method === "GET" && matchAdminReleaseGatesPath(input.pathname)) {
    return {
      handled: true,
      status_code: 200,
      body: apiOk(await input.deps.read_release_gates(input.api_input))
    };
  }

  if (input.method === "GET" && matchAdminLibraryPathChecksPath(input.pathname)) {
    return {
      handled: true,
      status_code: 200,
      body: apiOk(await input.deps.read_path_checks(input.api_input))
    };
  }

  return { handled: false };
}
