import type { CutterRoute } from "../app/navigation.ts";
import type { CutQueueJob, CutQueueStatus } from "./cut-queue.ts";

export type CutQueueSummary = Record<CutQueueStatus, number> & {
  total: number;
};

export interface AutoRefreshCutJobsInput {
  apiMode: boolean;
  hasData: boolean;
  loginGateVisible: boolean;
  route: CutterRoute;
  hasSubmittedCutJobs: boolean;
  jobs: readonly CutQueueJob[];
}

const refreshableRoutes = new Set<CutterRoute>(["material-locator", "cut-tasks"]);

export function cutQueueSummary(jobs: readonly CutQueueJob[]): CutQueueSummary {
  const summary: CutQueueSummary = {
    pending: 0,
    running: 0,
    done: 0,
    failed: 0,
    cancelled: 0,
    total: jobs.length
  };

  for (const job of jobs) {
    summary[job.status] += 1;
  }

  return summary;
}

export function hasActiveCutJobs(jobs: readonly CutQueueJob[]): boolean {
  return jobs.some((job) => job.status === "pending" || job.status === "running");
}

export function shouldAutoRefreshCutJobs(input: AutoRefreshCutJobsInput): boolean {
  return Boolean(
    input.apiMode &&
      input.hasData &&
      !input.loginGateVisible &&
      refreshableRoutes.has(input.route) &&
      (input.hasSubmittedCutJobs || hasActiveCutJobs(input.jobs))
  );
}

export function shouldRefreshLocalClipsAfterQueueUpdate(
  previousJobs: readonly CutQueueJob[],
  nextJobs: readonly CutQueueJob[]
): boolean {
  const previousDoneIds = new Set(
    previousJobs.filter((job) => job.status === "done").map((job) => job.queue_job_id)
  );

  return nextJobs.some((job) => job.status === "done" && !previousDoneIds.has(job.queue_job_id));
}
