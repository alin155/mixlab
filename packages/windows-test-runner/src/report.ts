import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RunRecord, RunReport, TimelineEvent } from "./types.ts";

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function writeTextWithRetry(filePath: string, text: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, text, "utf8");
      return;
    } catch (error) {
      lastError = error;
      await sleep(75 * (attempt + 1));
    }
  }
  throw new Error(`Failed to write ${filePath}: ${messageFromError(lastError)}`);
}

async function appendTextWithRetry(filePath: string, text: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await mkdir(path.dirname(filePath), { recursive: true });
      const existing = await readFile(filePath, "utf8").catch(() => "");
      await writeFile(filePath, `${existing}${text}`, "utf8");
      return;
    } catch (error) {
      lastError = error;
      await sleep(75 * (attempt + 1));
    }
  }
  throw new Error(`Failed to append ${filePath}: ${messageFromError(lastError)}`);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function runReportDir(reportsRoot: string, runId: string): string {
  return path.join(reportsRoot, runId);
}

export function timelinePath(reportDir: string): string {
  return path.join(reportDir, "timeline.ndjson");
}

export function reportPath(reportDir: string): string {
  return path.join(reportDir, "report.json");
}

export function summaryPath(reportDir: string): string {
  return path.join(reportDir, "summary.md");
}

export async function appendTimelineEvent(reportDir: string, event: TimelineEvent): Promise<void> {
  await appendTextWithRetry(timelinePath(reportDir), `${JSON.stringify(event)}\n`);
}

function writeSummary(record: RunRecord): string {
  const lines = [
    `# Windows Test Runner Run ${record.run_id}`,
    "",
    `- Suite: ${record.suite}`,
    `- Status: ${record.status}`,
    `- Runner: ${record.runner_version}`,
    `- Started: ${record.started_at}`,
    `- Updated: ${record.updated_at}`
  ];

  if (record.finished_at) {
    lines.push(`- Finished: ${record.finished_at}`);
  }
  if (record.failure_category) {
    lines.push(`- Failure category: ${record.failure_category}`);
  }
  if (record.failure_message) {
    lines.push(`- Failure message: ${record.failure_message}`);
  }
  if (record.report_write_error) {
    lines.push(`- Report write error: ${record.report_write_error}`);
  }
  if (record.probe_api) {
    lines.push("", "## API Probes", "");
    for (const probe of record.probe_api.probes) {
      const status = probe.ok ? "passed" : "failed";
      lines.push(`- ${probe.id}: ${status}, ${probe.elapsed_ms}ms, status ${probe.status_code ?? "n/a"}`);
    }
  }
  if (record.launch_app_probe) {
    lines.push("", "## Launch App Probe", "");
    lines.push(`- API ready before launch: ${record.launch_app_probe.api_ready_before_launch}`);
    lines.push(`- API ready: ${record.launch_app_probe.api_ready}`);
    lines.push(`- API ready elapsed: ${record.launch_app_probe.api_ready_elapsed_ms}ms`);
    lines.push(`- App started: ${record.launch_app_probe.app_started}`);
    if (record.launch_app_probe.app_executable_path) {
      lines.push(`- App executable: ${record.launch_app_probe.app_executable_path}`);
    }
    if (record.launch_app_probe.app_pid) {
      lines.push(`- App PID: ${record.launch_app_probe.app_pid}`);
    }
    if (record.launch_app_probe.launch_error) {
      lines.push(`- Launch error: ${record.launch_app_probe.launch_error}`);
    }
    if (record.launch_app_probe.health_error) {
      lines.push(`- Health error: ${record.launch_app_probe.health_error}`);
    }
    lines.push("", "### App Candidates", "");
    for (const candidate of record.launch_app_probe.candidates) {
      lines.push(`- ${candidate.exists ? "found" : "missing"}: ${candidate.path}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function serializeRunReport(record: RunRecord): RunReport {
  return {
    schema_version: record.schema_version,
    run_id: record.run_id,
    suite: record.suite,
    status: record.status,
    runner_version: record.runner_version,
    started_at: record.started_at,
    updated_at: record.updated_at,
    finished_at: record.finished_at,
    failure_category: record.failure_category,
    failure_message: record.failure_message,
    report_dir: record.report_dir,
    timeline_path: record.timeline_path,
    summary_path: record.summary_path,
    report_write_error: record.report_write_error,
    probe_api: record.probe_api,
    launch_app_probe: record.launch_app_probe
  };
}

export async function writeRunReport(record: RunRecord): Promise<void> {
  const reportText = `${JSON.stringify(serializeRunReport(record), null, 2)}\n`;
  await writeTextWithRetry(reportPath(record.report_dir), reportText);
  await writeTextWithRetry(summaryPath(record.report_dir), writeSummary(record));
}

export async function readRunReport(reportDir: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(reportPath(reportDir), "utf8")) as unknown;
  } catch {
    return null;
  }
}
