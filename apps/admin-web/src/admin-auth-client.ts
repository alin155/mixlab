import { getJson, sendJson } from "./admin-http.ts";
import type {
  AdminAuthBootstrapStatus,
  AdminAuthResult,
  AdminAuthStatus
} from "./api.ts";

export interface AdminAuthClientContext {
  fetchImpl: typeof fetch;
  baseUrl: string;
  protectedHeaders?: HeadersInit;
}

export interface AdminAuthClientMethods {
  getAuthBootstrap(): Promise<AdminAuthBootstrapStatus>;
  getAuthStatus(): Promise<AdminAuthStatus>;
  registerAdmin(input: { username: string; password: string; display_name?: string }): Promise<AdminAuthResult>;
  loginAdmin(input: { username: string; password: string }): Promise<AdminAuthResult>;
  logoutAdmin(): Promise<{ removed: boolean }>;
}

export function createAdminAuthClientMethods({
  fetchImpl,
  baseUrl,
  protectedHeaders
}: AdminAuthClientContext): AdminAuthClientMethods {
  return {
    getAuthBootstrap: () =>
      getJson<AdminAuthBootstrapStatus>(fetchImpl, baseUrl, "/api/admin/auth/bootstrap"),
    getAuthStatus: () =>
      getJson<AdminAuthStatus>(fetchImpl, baseUrl, "/api/admin/auth/status", protectedHeaders),
    registerAdmin: (registerInput) =>
      sendJson<AdminAuthResult>(
        fetchImpl,
        baseUrl,
        "/api/admin/auth/register",
        "POST",
        registerInput
      ),
    loginAdmin: (loginInput) =>
      sendJson<AdminAuthResult>(
        fetchImpl,
        baseUrl,
        "/api/admin/auth/login",
        "POST",
        loginInput
      ),
    logoutAdmin: () =>
      sendJson<{ removed: boolean }>(
        fetchImpl,
        baseUrl,
        "/api/admin/auth/logout",
        "POST",
        {},
        protectedHeaders
      )
  };
}
