import type {
  AdminProtectionReadRouteApiInput,
  AdminProtectionReadRouteDeps
} from "./admin-protection-read-routes.ts";

export interface CreateAdminProtectionReadRouteDepsInput<
  TApiInput extends AdminProtectionReadRouteApiInput,
  TProtectionStatus,
  TReleaseGates,
  TPathChecks
> {
  read_protection_status(input: TApiInput): Promise<TProtectionStatus>;
  read_release_gates(input: TApiInput): Promise<TReleaseGates>;
  read_path_checks(libraryRoot: string): Promise<TPathChecks>;
}

export interface CreateAdminProtectionReadRouteServerDepsInput<
  TApiInput extends AdminProtectionReadRouteApiInput,
  TProtectionStatus,
  TReleaseGates,
  TPathChecks
> {
  read_protection_status_service(input: TApiInput): Promise<TProtectionStatus>;
  read_release_gates_service(input: TApiInput): Promise<TReleaseGates>;
  read_path_checks_service(libraryRoot: string): Promise<TPathChecks>;
}

export function createAdminProtectionReadRouteDeps<
  TApiInput extends AdminProtectionReadRouteApiInput,
  TProtectionStatus,
  TReleaseGates,
  TPathChecks
>(
  input: CreateAdminProtectionReadRouteDepsInput<
    TApiInput,
    TProtectionStatus,
    TReleaseGates,
    TPathChecks
  >
): AdminProtectionReadRouteDeps<TApiInput, TProtectionStatus, TReleaseGates, TPathChecks> {
  return {
    read_protection_status: input.read_protection_status,
    read_release_gates: input.read_release_gates,
    read_path_checks(apiInput) {
      return input.read_path_checks(apiInput.library_root);
    }
  };
}

export function createAdminProtectionReadRouteServerDeps<
  TApiInput extends AdminProtectionReadRouteApiInput,
  TProtectionStatus,
  TReleaseGates,
  TPathChecks
>(
  input: CreateAdminProtectionReadRouteServerDepsInput<
    TApiInput,
    TProtectionStatus,
    TReleaseGates,
    TPathChecks
  >
): AdminProtectionReadRouteDeps<TApiInput, TProtectionStatus, TReleaseGates, TPathChecks> {
  return createAdminProtectionReadRouteDeps({
    read_protection_status: input.read_protection_status_service,
    read_release_gates: input.read_release_gates_service,
    read_path_checks: input.read_path_checks_service
  });
}
