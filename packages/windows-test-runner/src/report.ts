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
  if (record.launch_runner) {
    lines.push("", "## Launch Runner", "");
    lines.push(`- Requested port: ${record.launch_runner.requested_port}`);
    lines.push(`- Expected Runner: ${record.launch_runner.expected_runner_version ?? "n/a"}`);
    lines.push(`- Observed Runner: ${record.launch_runner.observed_runner_version ?? "n/a"}`);
    lines.push(`- Already ready: ${record.launch_runner.already_ready}`);
    lines.push(`- Ready: ${record.launch_runner.ready}`);
    lines.push(`- Ready elapsed: ${record.launch_runner.ready_elapsed_ms}ms`);
    lines.push(`- Source Runner: ${record.launch_runner.source_runner_path}`);
    lines.push(`- Local Runner: ${record.launch_runner.local_runner_path}`);
    if (record.launch_runner.child_pid) {
      lines.push(`- Child PID: ${record.launch_runner.child_pid}`);
    }
    if (record.launch_runner.launch_error) {
      lines.push(`- Launch error: ${record.launch_runner.launch_error}`);
    }
    if (record.launch_runner.ready_error) {
      lines.push(`- Ready error: ${record.launch_runner.ready_error}`);
    }
  }
  if (record.app_runtime_smoke) {
    lines.push("", "## App Runtime Smoke", "");
    lines.push(`- Auth mode: ${record.app_runtime_smoke.auth_mode ?? "n/a"}`);
    lines.push(`- Local trusted: ${record.app_runtime_smoke.local_trusted ?? "n/a"}`);
    if (record.app_runtime_smoke.runtime_status) {
      const runtime = record.app_runtime_smoke.runtime_status;
      lines.push(`- Runtime status: ${runtime.elapsed_ms}ms`);
      lines.push(`- Available videos: ${runtime.available_video_count ?? "n/a"}`);
      lines.push(`- Workspace enabled: ${runtime.workspace_enabled ?? "n/a"}`);
      lines.push(`- FFmpeg: ${runtime.ffmpeg_status ?? "n/a"} (${runtime.ffmpeg_source ?? "n/a"})`);
    }
    if (record.app_runtime_smoke.source_library) {
      const library = record.app_runtime_smoke.source_library;
      lines.push(`- Source library: ${library.returned_count} / ${library.available_video_count}, ${library.elapsed_ms}ms`);
      lines.push(`- First source: ${library.first_source_video_id ?? "n/a"} ${library.first_title ?? ""}`.trim());
    }
  }
  if (record.real_data_smoke) {
    lines.push("", "## Real Data Smoke", "");
    if (record.real_data_smoke.source_library) {
      const library = record.real_data_smoke.source_library;
      lines.push(`- Source library: ${library.returned_count} / ${library.available_video_count}, ${library.elapsed_ms}ms`);
    }
    for (const search of record.real_data_smoke.searches) {
      lines.push(`- Search "${search.query}": ${search.returned_group_count} groups, ${search.total_hit_count} hits, ${search.elapsed_ms}ms`);
    }
    if (record.real_data_smoke.selected_detail) {
      const detail = record.real_data_smoke.selected_detail;
      lines.push(`- Selected detail: ${detail.source_video_id}, transcript ${detail.transcript_character_count} chars / ${detail.transcript_segment_count} segments, ${detail.elapsed_ms}ms`);
    }
    if (record.real_data_smoke.cut_jobs) {
      const jobs = record.real_data_smoke.cut_jobs;
      lines.push(`- Cut jobs: total ${jobs.job_count}, pending ${jobs.pending_count}, running ${jobs.running_count}, done ${jobs.done_count}, failed ${jobs.failed_count}, ${jobs.elapsed_ms}ms`);
    }
  }
  if (record.cache_smoke) {
    lines.push("", "## Cache Smoke", "");
    lines.push(`- Observed buckets: ${record.cache_smoke.observed_cache_bucket_count}`);
    lines.push(`- Total observed cache size: ${record.cache_smoke.total_observed_cache_size_bytes} bytes`);
    const runtime = record.cache_smoke.runtime_status;
    if (runtime) {
      lines.push(`- Release cache: ${runtime.release_cache?.size_bytes ?? "n/a"} bytes @ ${runtime.release_cache?.cache_root_path ?? "n/a"}`);
      lines.push(`- Thumbnail cache: ${runtime.thumbnail_cache?.size_bytes ?? "n/a"} bytes @ ${runtime.thumbnail_cache?.cache_root_path ?? "n/a"}`);
      lines.push(`- Source video cache: ${runtime.source_video_cache?.size_bytes ?? "n/a"} bytes @ ${runtime.source_video_cache?.cache_root_path ?? "n/a"}`);
      lines.push(`- Cut temp cache: ${runtime.cut_temp_cache?.size_bytes ?? "n/a"} bytes @ ${runtime.cut_temp_cache?.cache_root_path ?? "n/a"}`);
    }
  }
  if (record.windows_acceptance) {
    lines.push("", "## Windows Acceptance", "");
    lines.push(`- API base URL: ${record.windows_acceptance.api_base_url}`);
    lines.push(`- App runtime: ${record.windows_acceptance.app_runtime_smoke ? "included" : "missing"}`);
    lines.push(`- Real data: ${record.windows_acceptance.real_data_smoke ? "included" : "missing"}`);
    lines.push(`- Cache: ${record.windows_acceptance.cache_smoke ? "included" : "missing"}`);
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
    launch_app_probe: record.launch_app_probe,
    launch_runner: record.launch_runner,
    app_runtime_smoke: record.app_runtime_smoke,
    real_data_smoke: record.real_data_smoke,
    cache_smoke: record.cache_smoke,
    windows_acceptance: record.windows_acceptance
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
