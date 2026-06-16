import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RunRecord, TimelineEvent } from "./types.ts";

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
  await mkdir(reportDir, { recursive: true });
  await writeFile(timelinePath(reportDir), `${JSON.stringify(event)}\n`, {
    encoding: "utf8",
    flag: "a"
  });
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
  if (record.probe_api) {
    lines.push("", "## API Probes", "");
    for (const probe of record.probe_api.probes) {
      const status = probe.ok ? "passed" : "failed";
      lines.push(`- ${probe.id}: ${status}, ${probe.elapsed_ms}ms, status ${probe.status_code ?? "n/a"}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export async function writeRunReport(record: RunRecord): Promise<void> {
  await mkdir(record.report_dir, { recursive: true });
  const reportText = `${JSON.stringify({
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
    probe_api: record.probe_api
  }, null, 2)}\n`;
  await writeFile(reportPath(record.report_dir), reportText, "utf8");
  await writeFile(summaryPath(record.report_dir), writeSummary(record), "utf8");
}

export async function readRunReport(reportDir: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(reportPath(reportDir), "utf8")) as unknown;
  } catch {
    return null;
  }
}
