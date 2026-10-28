import os from "node:os";
import path from "node:path";
import type { RunnerConfig } from "./types.ts";

export const RUNNER_VERSION = "0.1.35";
export const DEFAULT_RUNNER_HOST = "127.0.0.1";
export const DEFAULT_RUNNER_PORT = 3799;
export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
export const MIN_AUTH_TOKEN_LENGTH = 16;

function readPort(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function readList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return (
    normalized === "127.0.0.1" ||
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized.startsWith("127.")
  );
}

function defaultShareRoot(env: NodeJS.ProcessEnv): string {
  if (env.MIXLAB_WINDOWS_TEST_RUNNER_SHARE_ROOT) {
    return env.MIXLAB_WINDOWS_TEST_RUNNER_SHARE_ROOT;
  }
  if (env.MIXLAB_WINDOWS_BUILDS_ROOT) {
    return env.MIXLAB_WINDOWS_BUILDS_ROOT;
  }
  if (process.platform === "win32") {
    return path.join(process.env.USERPROFILE ?? "C:\\", "MixLabWindowsBuilds");
  }
  return path.join(os.tmpdir(), "MixLabWindowsBuilds");
}

export function resolveRunnerConfig(env: NodeJS.ProcessEnv = process.env): RunnerConfig {
  const host = env.MIXLAB_WINDOWS_TEST_RUNNER_HOST?.trim() || DEFAULT_RUNNER_HOST;
  const shareRoot = env.MIXLAB_WINDOWS_TEST_RUNNER_SHARE_ROOT
    ?? env.MIXLAB_WINDOWS_BUILDS_ROOT
    ?? defaultShareRoot(env);
  const reportsRoot = env.MIXLAB_WINDOWS_TEST_RUNNER_REPORTS_ROOT
    ?? path.join(shareRoot, "reports");
  const authToken = env.MIXLAB_WINDOWS_TEST_RUNNER_TOKEN?.trim() || undefined;
  const loopbackOnly = isLoopbackHost(host);
  const requireDestructiveConfirm = readBoolean(
    env.MIXLAB_WINDOWS_TEST_RUNNER_REQUIRE_CONFIRM,
    true
  );
  const requireInstallerSha256 = readBoolean(
    env.MIXLAB_WINDOWS_TEST_RUNNER_REQUIRE_INSTALLER_SHA256,
    Boolean(authToken) || !loopbackOnly
  );
  const maxBodyBytes = readPositiveInteger(
    env.MIXLAB_WINDOWS_TEST_RUNNER_MAX_BODY_BYTES,
    DEFAULT_MAX_BODY_BYTES
  );
  const allowedOrigins = readList(env.MIXLAB_WINDOWS_TEST_RUNNER_ALLOWED_ORIGINS);

  return {
    host,
    port: readPort(env.MIXLAB_WINDOWS_TEST_RUNNER_PORT, DEFAULT_RUNNER_PORT),
    share_root: shareRoot,
    reports_root: reportsRoot,
    cutter_api_base_url: env.MIXLAB_CUTTER_API_BASE_URL ?? "http://127.0.0.1:3789",
    runner_version: RUNNER_VERSION,
    ...(authToken ? { auth_token: authToken } : {}),
    require_destructive_confirm: requireDestructiveConfirm,
    require_installer_sha256: requireInstallerSha256,
    max_body_bytes: maxBodyBytes,
    ...(allowedOrigins.length > 0 ? { allowed_origins: allowedOrigins } : {})
  };
}

export function assertRunnerSecurityConfig(config: RunnerConfig): void {
  if (!isLoopbackHost(config.host) && !config.auth_token) {
    throw new Error(
      "MixLab Windows Test Runner 拒绝启动：监听非回环地址时必须设置 MIXLAB_WINDOWS_TEST_RUNNER_TOKEN（至少 " + MIN_AUTH_TOKEN_LENGTH + " 字符）。"
    );
  }
  if (config.auth_token && config.auth_token.length < MIN_AUTH_TOKEN_LENGTH) {
    throw new Error(
      "MixLab Windows Test Runner 拒绝启动：MIXLAB_WINDOWS_TEST_RUNNER_TOKEN 至少需要 " + MIN_AUTH_TOKEN_LENGTH + " 个字符。"
    );
  }
}
