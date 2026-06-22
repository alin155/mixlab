import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { reportPath } from "./report.ts";
import type { RunnerConfig, RunnerStatus, RunRecord, RunRequest, RunnerSuite } from "./types.ts";
import type { RunStore } from "./run-store.ts";

const STARTUP_RUN_POINTER_FILE = "startup-run-latest.json";
const TERMINAL_STATUSES = new Set<RunnerStatus>(["passed", "failed", "cancelled"]);
const SUPPORTED_STARTUP_SUITES = new Set<RunnerSuite>([
  "probe_api",
  "launch_app_probe",
  "launch_runner",
  "app_runtime_smoke",
  "real_data_smoke",
  "cache_smoke",
  "real_cut_smoke",
  "windows_acceptance",
  "desktop_ui_screenshot_smoke",
  "desktop_incident_diagnostics",
  "install_latest_and_smoke"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseStartupRunRequest(value: string | undefined): RunRequest | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  const parsed = JSON.parse(value) as unknown;
  if (!isRecord(parsed) || !SUPPORTED_STARTUP_SUITES.has(parsed.suite as RunnerSuite)) {
    throw new Error(`Unsupported startup run request: ${value}`);
  }
  return {
    suite: parsed.suite as RunnerSuite,
    options: isRecord(parsed.options) ? parsed.options : undefined
  };
}

async function writeStartupRunPointer(input: {
  config: RunnerConfig;
  record: RunRecord;
  phase: "created" | "updated";
}): Promise<void> {
  const pointerPath = path.join(input.config.reports_root, STARTUP_RUN_POINTER_FILE);
  await mkdir(input.config.reports_root, { recursive: true });
  await writeFile(pointerPath, `${JSON.stringify({
    schema_version: "1.0",
    runner_version: input.config.runner_version,
    phase: input.phase,
    run_id: input.record.run_id,
    suite: input.record.suite,
    status: input.record.status,
    failure_category: input.record.failure_category,
    failure_message: input.record.failure_message,
    report_path: reportPath(input.record.report_dir),
    summary_path: input.record.summary_path,
    updated_at: input.record.updated_at
  }, null, 2)}\n`, "utf8");
}

export function startStartupRun(input: {
  config: RunnerConfig;
  store: RunStore;
  request: RunRequest;
}): RunRecord {
  const record = input.store.createRun(input.request);
  void writeStartupRunPointer({ config: input.config, record, phase: "created" }).catch((error) => {
    console.error("MixLab Windows Test Runner failed to write startup run pointer.");
    console.error(error);
  });

  const timer = setInterval(() => {
    void writeStartupRunPointer({ config: input.config, record, phase: "updated" }).catch((error) => {
      console.error("MixLab Windows Test Runner failed to update startup run pointer.");
      console.error(error);
    });
    if (TERMINAL_STATUSES.has(record.status)) {
      clearInterval(timer);
    }
  }, 500);
  timer.unref?.();
  return record;
}
