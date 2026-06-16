import crypto from "node:crypto";
import {
  appendTimelineEvent,
  nowIso,
  reportPath,
  runReportDir,
  summaryPath,
  timelinePath,
  writeRunReport
} from "./report.ts";
import { runCutterApiSmoke } from "./actions/cutter-api-smoke.ts";
import { runLaunchAppProbe } from "./actions/launch-app-probe.ts";
import { runLaunchRunner } from "./actions/launch-runner.ts";
import { runProbeApi } from "./actions/probe-api.ts";
import type {
  RunRecord,
  RunnerConfig,
  RunnerStatus,
  RunRequest,
  RunSummary,
  TimelineEvent
} from "./types.ts";

function createRunId(suite: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${suite}-${stamp}-${crypto.randomUUID().slice(0, 8)}`;
}

export class RunStore {
  readonly runs = new Map<string, RunRecord>();

  constructor(private readonly config: RunnerConfig) {}

  createRun(request: RunRequest): RunRecord {
    const runId = createRunId(request.suite);
    const reportDir = runReportDir(this.config.reports_root, runId);
    const createdAt = nowIso();
    const record: RunRecord = {
      schema_version: "1.0",
      run_id: runId,
      suite: request.suite,
      status: "queued",
      runner_version: this.config.runner_version,
      started_at: createdAt,
      updated_at: createdAt,
      report_dir: reportDir,
      timeline_path: timelinePath(reportDir),
      summary_path: summaryPath(reportDir),
      request,
      timeline: []
    };
    this.runs.set(runId, record);
    void this.executeRun(record);
    return record;
  }

  getRun(runId: string): RunRecord | undefined {
    return this.runs.get(runId);
  }

  getStatus(): {
    runner_version: string;
    share_root: string;
    reports_root: string;
    cutter_api_base_url: string;
    runs: RunSummary[];
  } {
    return {
      runner_version: this.config.runner_version,
      share_root: this.config.share_root,
      reports_root: this.config.reports_root,
      cutter_api_base_url: this.config.cutter_api_base_url,
      runs: [...this.runs.values()].map((run) => this.toSummary(run))
    };
  }

  toSummary(record: RunRecord): RunSummary {
    return {
      run_id: record.run_id,
      suite: record.suite,
      status: record.status,
      failure_category: record.failure_category,
      failure_message: record.failure_message,
      report_path: reportPath(record.report_dir),
      summary_path: record.summary_path
    };
  }

  private async addTimeline(record: RunRecord, stage: string, message: string, details?: unknown): Promise<void> {
    record.updated_at = nowIso();
    const event: TimelineEvent = {
      at: record.updated_at,
      stage,
      message,
      details
    };
    record.timeline.push(event);
    try {
      await appendTimelineEvent(record.report_dir, event);
    } catch (error) {
      record.report_write_error = error instanceof Error ? error.message : String(error);
      console.error("MixLab Windows Test Runner failed to write timeline.");
      console.error(error);
    }
  }

  private async setStatus(record: RunRecord, status: RunnerStatus, message: string, details?: unknown): Promise<void> {
    record.status = status;
    record.updated_at = nowIso();
    const event: TimelineEvent = {
      at: record.updated_at,
      stage: status,
      message,
      details
    };
    record.timeline.push(event);
    try {
      await appendTimelineEvent(record.report_dir, event);
    } catch (error) {
      record.report_write_error = error instanceof Error ? error.message : String(error);
      console.error("MixLab Windows Test Runner failed to write timeline.");
      console.error(error);
    }
  }

  private async tryWriteRunReport(record: RunRecord): Promise<void> {
    try {
      await writeRunReport(record);
    } catch (error) {
      record.report_write_error = error instanceof Error ? error.message : String(error);
      console.error("MixLab Windows Test Runner failed to write report.");
      console.error(error);
    }
  }

  private async executeRun(record: RunRecord): Promise<void> {
    try {
      await this.setStatus(record, "starting", "Run accepted.");
      await this.setStatus(record, "running", `Running suite ${record.suite}.`);
      if (record.suite === "probe_api") {
        const result = await runProbeApi({
          apiBaseUrl: this.config.cutter_api_base_url,
          timeoutMs: typeof record.request.options?.timeout_ms === "number"
            ? record.request.options.timeout_ms
            : undefined
        });
        record.probe_api = result.report;
        if (!result.passed) {
          record.failure_category = result.failure_category;
          record.failure_message = result.failure_message;
          throw new Error(result.failure_message ?? "probe_api failed");
        }
      } else if (record.suite === "launch_app_probe") {
        const result = await runLaunchAppProbe({
          apiBaseUrl: this.config.cutter_api_base_url,
          options: record.request.options,
          onEvent: (stage, message, details) => this.addTimeline(record, stage, message, details)
        });
        record.launch_app_probe = result.report;
        record.probe_api = result.report.probe_api;
        if (!result.passed) {
          record.failure_category = result.failure_category;
          record.failure_message = result.failure_message;
          throw new Error(result.failure_message ?? "launch_app_probe failed");
        }
      } else if (record.suite === "launch_runner") {
        const result = await runLaunchRunner({
          config: this.config,
          options: record.request.options,
          onEvent: (stage, message, details) => this.addTimeline(record, stage, message, details)
        });
        record.launch_runner = result.report;
        if (!result.passed) {
          record.failure_category = result.failure_category;
          record.failure_message = result.failure_message;
          throw new Error(result.failure_message ?? "launch_runner failed");
        }
      } else if (record.suite === "cutter_api_smoke") {
        const result = await runCutterApiSmoke({
          apiBaseUrl: this.config.cutter_api_base_url,
          options: record.request.options,
          onEvent: (stage, message, details) => this.addTimeline(record, stage, message, details)
        });
        record.cutter_api_smoke = result.report;
        if (!result.passed) {
          record.failure_category = result.failure_category;
          record.failure_message = result.failure_message;
          throw new Error(result.failure_message ?? "cutter_api_smoke failed");
        }
      }

      await this.setStatus(record, "writing_report", "Writing report.");
      record.finished_at = nowIso();
      record.status = "passed";
      record.updated_at = record.finished_at;
      await this.tryWriteRunReport(record);
      await this.setStatus(record, "passed", "Run passed.");
      await this.tryWriteRunReport(record);
    } catch (error) {
      record.failure_category ??= "unknown";
      record.failure_message ??= error instanceof Error ? error.message : String(error);
      await this.setStatus(record, "writing_report", "Writing failure report.");
      record.finished_at = nowIso();
      record.status = "failed";
      record.updated_at = record.finished_at;
      await this.tryWriteRunReport(record);
      await this.setStatus(record, "failed", record.failure_message);
      await this.tryWriteRunReport(record);
    }
  }
}
