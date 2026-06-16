import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  FailureCategory,
  LaunchRunnerReport,
  RunnerConfig
} from "../types.ts";

interface LaunchRunnerOptions {
  port?: number;
  host?: string;
  timeout_ms?: number;
  runner_path?: string;
  runner_args?: string[];
  copy_runner?: boolean;
  version_expected?: string;
}

interface RunnerManifest {
  version?: string;
  executable_file?: string;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    return undefined;
  }
  return value;
}

function readPort(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > 65535) {
    return fallback;
  }
  return value;
}

function readPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function readOptions(value: Record<string, unknown> | undefined): LaunchRunnerOptions {
  return {
    port: readPort(value?.port, 3800),
    host: readString(value?.host),
    timeout_ms: readPositiveNumber(value?.timeout_ms, 10000),
    runner_path: readString(value?.runner_path),
    runner_args: readStringArray(value?.runner_args),
    copy_runner: typeof value?.copy_runner === "boolean" ? value.copy_runner : undefined,
    version_expected: readString(value?.version_expected)
  };
}

function defaultLocalRunnerRoot(): string {
  if (process.env.MIXLAB_WINDOWS_TEST_RUNNER_LOCAL_ROOT) {
    return process.env.MIXLAB_WINDOWS_TEST_RUNNER_LOCAL_ROOT;
  }
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA ?? path.join(process.env.USERPROFILE ?? "C:\\", "AppData", "Local"), "MixLab", "TestRunner");
  }
  return path.join(os.tmpdir(), "MixLab", "TestRunner");
}

async function readManifest(manifestPath: string): Promise<RunnerManifest> {
  try {
    return JSON.parse(await readFile(manifestPath, "utf8")) as RunnerManifest;
  } catch {
    return {};
  }
}

async function probeVersion(versionUrl: string, timeoutMs: number): Promise<{
  ok: boolean;
  runner_version?: string;
  error?: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(versionUrl, { signal: controller.signal });
    if (!response.ok) {
      return { ok: false, error: `Version probe returned HTTP ${response.status}` };
    }
    const body = await response.json() as Record<string, unknown>;
    return {
      ok: typeof body.runner_version === "string",
      runner_version: typeof body.runner_version === "string" ? body.runner_version : undefined,
      error: typeof body.runner_version === "string" ? undefined : "Version response did not include runner_version."
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForRunner(input: {
  versionUrl: string;
  expectedVersion?: string;
  timeoutMs: number;
}): Promise<{
  ok: boolean;
  elapsed_ms: number;
  runner_version?: string;
  error?: string;
}> {
  const started = Date.now();
  let latest: Awaited<ReturnType<typeof probeVersion>> | undefined;
  while (Date.now() - started < input.timeoutMs) {
    latest = await probeVersion(input.versionUrl, Math.min(1500, input.timeoutMs));
    if (latest.ok && (!input.expectedVersion || latest.runner_version === input.expectedVersion)) {
      return {
        ok: true,
        elapsed_ms: Date.now() - started,
        runner_version: latest.runner_version
      };
    }
    await sleep(300);
  }
  return {
    ok: false,
    elapsed_ms: Date.now() - started,
    runner_version: latest?.runner_version,
    error: latest?.runner_version && input.expectedVersion && latest.runner_version !== input.expectedVersion
      ? `Runner version ${latest.runner_version} did not match expected ${input.expectedVersion}.`
      : latest?.error ?? "Runner did not become ready before timeout."
  };
}

function versionUrlForPort(port: number): string {
  return `http://127.0.0.1:${port}/version`;
}

function healthUrlForPort(port: number): string {
  return `http://127.0.0.1:${port}/health`;
}

export async function runLaunchRunner(input: {
  config: RunnerConfig;
  options?: Record<string, unknown>;
  onEvent?: (stage: string, message: string, details?: unknown) => Promise<void>;
}): Promise<{
  report: LaunchRunnerReport;
  passed: boolean;
  failure_category?: FailureCategory;
  failure_message?: string;
}> {
  const options = readOptions(input.options);
  const port = options.port ?? 3800;
  const host = options.host ?? "0.0.0.0";
  const manifestPath = path.join(input.config.share_root, "runner", "latest.json");
  const manifest = await readManifest(manifestPath);
  const sourceRunnerPath = options.runner_path
    ?? path.join(input.config.share_root, "runner", manifest.executable_file ?? "MixLabWindowsTestRunner.exe");
  const expectedVersion = options.version_expected ?? manifest.version ?? input.config.runner_version;
  const copyRunner = options.copy_runner ?? !options.runner_path;
  const localRunnerPath = copyRunner
    ? path.join(defaultLocalRunnerRoot(), `runner-${expectedVersion}-port-${port}`, path.basename(sourceRunnerPath))
    : sourceRunnerPath;
  const versionUrl = versionUrlForPort(port);
  const report: LaunchRunnerReport = {
    requested_port: port,
    host,
    health_url: healthUrlForPort(port),
    version_url: versionUrl,
    already_ready: false,
    ready: false,
    ready_elapsed_ms: 0,
    expected_runner_version: expectedVersion,
    shared_manifest_path: manifestPath,
    shared_manifest_version: manifest.version,
    source_runner_path: sourceRunnerPath,
    local_runner_path: localRunnerPath,
    copied_runner: copyRunner
  };

  const existing = await probeVersion(versionUrl, 500);
  if (existing.ok && (!expectedVersion || existing.runner_version === expectedVersion)) {
    report.already_ready = true;
    report.ready = true;
    report.observed_runner_version = existing.runner_version;
    await input.onEvent?.("runner_already_ready", "Requested Runner port is already ready.", {
      port,
      runner_version: existing.runner_version
    });
    return { report, passed: true };
  }

  if (existing.ok && expectedVersion && existing.runner_version !== expectedVersion) {
    report.observed_runner_version = existing.runner_version;
    report.ready_error = `Port ${port} already has Runner ${existing.runner_version}, expected ${expectedVersion}.`;
    return {
      report,
      passed: false,
      failure_category: "runner_launch_failure",
      failure_message: report.ready_error
    };
  }

  await input.onEvent?.("copying_runner", "Preparing Runner executable.", {
    source_runner_path: sourceRunnerPath,
    local_runner_path: localRunnerPath,
    copied_runner: copyRunner
  });

  try {
    if (copyRunner) {
      await mkdir(path.dirname(localRunnerPath), { recursive: true });
      await copyFile(sourceRunnerPath, localRunnerPath);
    }
  } catch (error) {
    report.launch_error = error instanceof Error ? error.message : String(error);
    return {
      report,
      passed: false,
      failure_category: "runner_launch_failure",
      failure_message: `Failed to prepare Runner executable: ${report.launch_error}`
    };
  }

  await input.onEvent?.("launching_runner", "Launching Runner on backup port.", {
    port,
    host,
    expected_runner_version: expectedVersion
  });

  try {
    const child = spawn(localRunnerPath, options.runner_args ?? [], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: {
        ...process.env,
        MIXLAB_WINDOWS_TEST_RUNNER_SHARE_ROOT: input.config.share_root,
        MIXLAB_WINDOWS_BUILDS_ROOT: input.config.share_root,
        MIXLAB_WINDOWS_TEST_RUNNER_REPORTS_ROOT: input.config.reports_root,
        MIXLAB_WINDOWS_TEST_RUNNER_HOST: host,
        MIXLAB_WINDOWS_TEST_RUNNER_PORT: String(port),
        MIXLAB_CUTTER_API_BASE_URL: input.config.cutter_api_base_url
      }
    });
    child.unref();
    report.child_pid = child.pid;
  } catch (error) {
    report.launch_error = error instanceof Error ? error.message : String(error);
    return {
      report,
      passed: false,
      failure_category: "runner_launch_failure",
      failure_message: report.launch_error
    };
  }

  const ready = await waitForRunner({
    versionUrl,
    expectedVersion,
    timeoutMs: options.timeout_ms ?? 10000
  });
  report.ready = ready.ok;
  report.ready_elapsed_ms = ready.elapsed_ms;
  report.observed_runner_version = ready.runner_version;
  report.ready_error = ready.error;

  if (!ready.ok) {
    return {
      report,
      passed: false,
      failure_category: "runner_ready_timeout",
      failure_message: ready.error
    };
  }

  return { report, passed: true };
}
