import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { runWindowsAcceptance } from "./windows-app-acceptance.ts";
import type {
  FailureCategory,
  InstallLatestAndSmokeReport,
  ProcessExitSummary,
  RunnerConfig
} from "../types.ts";

interface InstallLatestAndSmokeOptions {
  installer_path?: string;
  installer_sha256?: string;
  silent_args?: string[];
  install_timeout_ms?: number;
  acceptance_options?: Record<string, unknown>;
}

interface ProcessResult extends ProcessExitSummary {
  timed_out?: boolean;
}

const DEFAULT_INSTALL_TIMEOUT_MS = 180_000;
const INSTALLER_FILE_PATTERN = /^MixLab Cutter_.*setup.*\.exe$/i;
const PROCESS_NAMES_TO_STOP = [
  "MixLab Cutter.exe",
  "cutter-api-sidecar-x86_64-pc-windows-msvc.exe",
  "mixlab-searchd-x86_64-pc-windows-msvc.exe"
];

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    return undefined;
  }
  return value;
}

function readPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function readOptions(value: Record<string, unknown> | undefined): InstallLatestAndSmokeOptions {
  return {
    installer_path: readString(value?.installer_path),
    installer_sha256: readString(value?.installer_sha256)?.toLowerCase(),
    silent_args: readStringArray(value?.silent_args),
    install_timeout_ms: readPositiveNumber(value?.install_timeout_ms, DEFAULT_INSTALL_TIMEOUT_MS),
    acceptance_options: value?.acceptance_options && typeof value.acceptance_options === "object" && !Array.isArray(value.acceptance_options)
      ? value.acceptance_options as Record<string, unknown>
      : undefined
  };
}

function tail(text: string, maxLength = 4000): string | undefined {
  if (!text) {
    return undefined;
  }
  return text.length > maxLength ? text.slice(-maxLength) : text;
}

function runProcess(input: {
  command: string;
  args: string[];
  timeoutMs: number;
  allowNonZero?: boolean;
}): Promise<ProcessResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(input.command, input.args, {
      windowsHide: true
    });
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      child.kill();
      settled = true;
      resolve({
        command: input.command,
        args: input.args,
        exit_code: null,
        elapsed_ms: Date.now() - started,
        stdout_tail: tail(stdout),
        stderr_tail: tail(stderr),
        error: "Process timed out.",
        timed_out: true
      });
    }, input.timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      clearTimeout(timeout);
      settled = true;
      resolve({
        command: input.command,
        args: input.args,
        exit_code: null,
        elapsed_ms: Date.now() - started,
        stdout_tail: tail(stdout),
        stderr_tail: tail(stderr),
        error: error.message
      });
    });
    child.on("exit", (code) => {
      if (settled) {
        return;
      }
      clearTimeout(timeout);
      settled = true;
      resolve({
        command: input.command,
        args: input.args,
        exit_code: code,
        elapsed_ms: Date.now() - started,
        stdout_tail: tail(stdout),
        stderr_tail: tail(stderr),
        error: code === 0 || input.allowNonZero ? undefined : `Process exited with ${code ?? "unknown"}.`
      });
    });
  });
}

function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function newestInstallerPath(shareRoot: string): Promise<string | undefined> {
  const entries = await readdir(shareRoot, { withFileTypes: true });
  const candidates: Array<{ file_path: string; mtime_ms: number }> = [];
  for (const entry of entries) {
    if (!entry.isFile() || !INSTALLER_FILE_PATTERN.test(entry.name)) {
      continue;
    }
    const filePath = path.join(shareRoot, entry.name);
    const info = await stat(filePath);
    candidates.push({
      file_path: filePath,
      mtime_ms: info.mtimeMs
    });
  }
  candidates.sort((left, right) => right.mtime_ms - left.mtime_ms);
  return candidates[0]?.file_path;
}

function localInstallerPath(sourcePath: string): string {
  const root = path.join(os.tmpdir(), "MixLabWindowsTestRunner", "installers");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(root, `${stamp}-${path.basename(sourcePath)}`);
}

async function stopKnownProcesses(): Promise<ProcessExitSummary[]> {
  if (process.platform !== "win32") {
    return [];
  }
  const results: ProcessExitSummary[] = [];
  for (const processName of PROCESS_NAMES_TO_STOP) {
    results.push(await runProcess({
      command: "taskkill.exe",
      args: ["/IM", processName, "/F", "/T"],
      timeoutMs: 15_000,
      allowNonZero: true
    }));
  }
  return results;
}

export async function runInstallLatestAndSmoke(input: {
  config: RunnerConfig;
  options?: Record<string, unknown>;
  onEvent?: (stage: string, message: string, details?: unknown) => Promise<void>;
}): Promise<{
  report: InstallLatestAndSmokeReport;
  passed: boolean;
  failure_category?: FailureCategory;
  failure_message?: string;
}> {
  const options = readOptions(input.options);
  const installerSourcePath = options.installer_path ?? await newestInstallerPath(input.config.share_root);
  if (!installerSourcePath) {
    return {
      report: {
        installer_source_path: "",
        installer_local_path: "",
        copied_installer: false,
        stopped_processes: [],
        install_exit_code: null,
        install_elapsed_ms: 0,
        installer_error: "No MixLab Cutter installer was found."
      },
      passed: false,
      failure_category: "installer_missing",
      failure_message: `No MixLab Cutter installer was found in ${input.config.share_root}.`
    };
  }

  const installerLocalPath = localInstallerPath(installerSourcePath);
  const report: InstallLatestAndSmokeReport = {
    installer_source_path: installerSourcePath,
    installer_local_path: installerLocalPath,
    expected_sha256: options.installer_sha256,
    copied_installer: false,
    stopped_processes: [],
    install_exit_code: null,
    install_elapsed_ms: 0
  };

  try {
    await input.onEvent?.("copy_installer", "Copying installer to local temp storage.", {
      installer_source_path: installerSourcePath,
      installer_local_path: installerLocalPath
    });
    await mkdir(path.dirname(installerLocalPath), { recursive: true });
    await copyFile(installerSourcePath, installerLocalPath);
    report.copied_installer = true;
    report.actual_sha256 = await sha256File(installerLocalPath);
  } catch (error) {
    report.installer_error = error instanceof Error ? error.message : String(error);
    return {
      report,
      passed: false,
      failure_category: "installer_missing",
      failure_message: `Failed to copy installer: ${report.installer_error}`
    };
  }

  if (options.installer_sha256 && report.actual_sha256 !== options.installer_sha256) {
    return {
      report,
      passed: false,
      failure_category: "installer_hash_mismatch",
      failure_message: `Installer SHA-256 mismatch: expected ${options.installer_sha256}, got ${report.actual_sha256 ?? "unknown"}.`
    };
  }

  if (process.platform === "win32") {
    await input.onEvent?.("unblock_installer", "Removing Windows downloaded-file marker if present.");
    report.unblocked_installer = await runProcess({
      command: "powershell.exe",
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "Unblock-File -LiteralPath $args[0]", installerLocalPath],
      timeoutMs: 30_000,
      allowNonZero: true
    });
  }

  await input.onEvent?.("stop_existing_app", "Stopping existing MixLab Cutter processes.");
  report.stopped_processes = await stopKnownProcesses();

  await input.onEvent?.("install_app", "Running MixLab Cutter installer silently.", {
    installer_local_path: installerLocalPath
  });
  const install = await runProcess({
    command: installerLocalPath,
    args: options.silent_args ?? ["/S"],
    timeoutMs: options.install_timeout_ms ?? DEFAULT_INSTALL_TIMEOUT_MS
  });
  report.install_exit_code = install.exit_code;
  report.install_elapsed_ms = install.elapsed_ms;
  report.installer_stdout_tail = install.stdout_tail;
  report.installer_stderr_tail = install.stderr_tail;
  report.installer_error = install.error;
  if (install.exit_code !== 0) {
    return {
      report,
      passed: false,
      failure_category: "installer_failed",
      failure_message: install.error ?? `Installer exited with ${install.exit_code ?? "unknown"}.`
    };
  }

  await input.onEvent?.("windows_acceptance_after_install", "Running Windows acceptance after install.");
  const acceptance = await runWindowsAcceptance({
    apiBaseUrl: input.config.cutter_api_base_url,
    options: options.acceptance_options ?? input.options,
    onEvent: input.onEvent
  });
  report.windows_acceptance = acceptance.report;
  if (!acceptance.passed) {
    return {
      report,
      passed: false,
      failure_category: acceptance.failure_category,
      failure_message: acceptance.failure_message
    };
  }

  return { report, passed: true };
}
