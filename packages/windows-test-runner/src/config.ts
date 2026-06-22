import os from "node:os";
import path from "node:path";
import type { RunnerConfig } from "./types.ts";

export const RUNNER_VERSION = "0.1.27";

function readPort(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function defaultShareRoot(): string {
  if (process.env.MIXLAB_WINDOWS_TEST_RUNNER_SHARE_ROOT) {
    return process.env.MIXLAB_WINDOWS_TEST_RUNNER_SHARE_ROOT;
  }
  if (process.env.MIXLAB_WINDOWS_BUILDS_ROOT) {
    return process.env.MIXLAB_WINDOWS_BUILDS_ROOT;
  }
  if (process.platform === "win32") {
    return path.join(process.env.USERPROFILE ?? "C:\\", "MixLabWindowsBuilds");
  }
  return path.join(os.tmpdir(), "MixLabWindowsBuilds");
}

export function resolveRunnerConfig(env: NodeJS.ProcessEnv = process.env): RunnerConfig {
  const shareRoot = env.MIXLAB_WINDOWS_TEST_RUNNER_SHARE_ROOT
    ?? env.MIXLAB_WINDOWS_BUILDS_ROOT
    ?? defaultShareRoot();
  const reportsRoot = env.MIXLAB_WINDOWS_TEST_RUNNER_REPORTS_ROOT
    ?? path.join(shareRoot, "reports");

  return {
    host: env.MIXLAB_WINDOWS_TEST_RUNNER_HOST ?? "0.0.0.0",
    port: readPort(env.MIXLAB_WINDOWS_TEST_RUNNER_PORT, 3799),
    share_root: shareRoot,
    reports_root: reportsRoot,
    cutter_api_base_url: env.MIXLAB_CUTTER_API_BASE_URL ?? "http://127.0.0.1:3789",
    runner_version: RUNNER_VERSION
  };
}
