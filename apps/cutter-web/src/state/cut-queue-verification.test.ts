import assert from "node:assert/strict";
import test from "node:test";
import type { CutJob, CutJobCatalog } from "../api.ts";
import {
  cutJobCompletionLabel,
  cutJobEffectiveMode,
  cutJobNeedsRecut,
  cutJobVerificationDetail,
  cutJobVerificationState,
  mapApiCutJobsToQueueJobs,
  type CutQueueJob
} from "./cut-queue.ts";

function queueJob(overrides: Partial<CutQueueJob> = {}): CutQueueJob {
  return {
    queue_job_id: "CJ-1",
    cut_list_item_id: "cut-1",
    source_video_id: "V000001",
    source_title: "现金流",
    title: "1-项目一-现金流",
    begin_ms: 1000,
    end_ms: 3000,
    duration_ms: 2000,
    selected_text: "现金流",
    cut_mode: "copy",
    status: "done",
    progress: 100,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

test("verification state distinguishes verified, failed and old-engine jobs", () => {
  assert.equal(cutJobVerificationState(queueJob()), "unverified");
  assert.equal(cutJobVerificationState(queueJob({ verification: undefined })), "unverified");
  assert.equal(cutJobVerificationState(queueJob({ verification: { passed: true } })), "verified");
  assert.equal(cutJobVerificationState(queueJob({ verification: { passed: false } })), "verification_failed");
  assert.equal(cutJobVerificationState(queueJob({ status: "running", verification: { passed: true } })), "unverified");

  const malformed = queueJob({
    verification: "not-an-object" as unknown as CutQueueJob["verification"]
  });
  assert.equal(cutJobVerificationState(malformed), "unverified");
});

test("completion labels never claim success without verification", () => {
  assert.equal(cutJobCompletionLabel("verified"), "剪切成功");
  assert.equal(cutJobCompletionLabel("verification_failed"), "已完成（未通过校验）");
  assert.equal(cutJobCompletionLabel("unverified"), "已完成（未校验）");
  assert.equal(cutJobNeedsRecut(queueJob()), true);
  assert.equal(cutJobNeedsRecut(queueJob({ verification: { passed: false } })), true);
  assert.equal(cutJobNeedsRecut(queueJob({ verification: { passed: true } })), false);
  assert.equal(cutJobNeedsRecut(queueJob({ status: "failed" })), true);
  assert.equal(cutJobNeedsRecut(queueJob({ status: "cancelled" })), true);
  assert.equal(cutJobNeedsRecut(queueJob({ status: "running" })), false);
});

test("effective cut mode prefers the mode the engine actually used", () => {
  assert.equal(cutJobEffectiveMode(queueJob()), "copy");
  assert.equal(cutJobEffectiveMode(queueJob({ cut_mode: "copy", cut_mode_used: "precise" })), "precise");
});

test("verification detail explains measurements and failed checks", () => {
  const verified = queueJob({
    verification: {
      passed: true,
      expected_duration_ms: 2000,
      actual_duration_ms: 1990,
      tolerance_ms: 200,
      checks: []
    }
  });
  assert.equal(
    cutJobVerificationDetail(verified),
    "校验通过 · 请求 2000ms · 实际 1990ms · 容差 ±200ms"
  );

  const failed = queueJob({
    verification: {
      passed: false,
      expected_duration_ms: 2000,
      actual_duration_ms: 1000,
      tolerance_ms: 200,
      checks: [{ check_id: "duration", passed: false, message: "too short" }]
    }
  });
  const failedDetail = cutJobVerificationDetail(failed);
  assert.match(failedDetail, /^校验未通过/);
  assert.match(failedDetail, /1 项检查失败/);

  const unverified = queueJob();
  assert.match(cutJobVerificationDetail(unverified), /旧版引擎未返回输出校验信息/);
  const unverifiedWithMeasurement = queueJob({
    verification: { passed: true, expected_duration_ms: 2000 } as unknown as CutQueueJob["verification"]
  });
  assert.equal(cutJobVerificationState(unverifiedWithMeasurement), "verified");
});

test("mapApiCutJobsToQueueJobs passes verification, drops malformed values and keeps old data safe", () => {
  const catalog: CutJobCatalog = {
    job_count: 2,
    jobs: [
      {
        cut_job_id: "CJ-1",
        clip_list_id: "CL-1",
        status: "done",
        cut_mode: "copy",
        cut_mode_used: "precise",
        begin_ms: 0,
        end_ms: 2000,
        verification: {
          passed: false,
          expected_duration_ms: 2000,
          actual_duration_ms: 1000,
          tolerance_ms: 200,
          checks: [{ check_id: "duration", passed: false }]
        }
      },
      {
        cut_job_id: "CJ-2",
        clip_list_id: "CL-1",
        status: "done",
        cut_mode: "copy",
        cut_mode_used: "weird" as unknown as CutJob["cut_mode_used"],
        verification: "garbage" as unknown as CutJob["verification"]
      }
    ]
  };

  const jobs = mapApiCutJobsToQueueJobs(catalog);
  const preciseJob = jobs.find((job) => job.queue_job_id === "CJ-1");
  const malformedJob = jobs.find((job) => job.queue_job_id === "CJ-2");
  assert.ok(preciseJob);
  assert.ok(malformedJob);

  assert.equal(preciseJob.cut_mode_used, "precise");
  assert.equal(preciseJob.verification?.passed, false);
  assert.equal(cutJobVerificationState(preciseJob), "verification_failed");
  assert.equal(malformedJob.cut_mode_used, undefined);
  assert.equal(malformedJob.verification, undefined);
  assert.equal(cutJobVerificationState(malformedJob), "unverified");
});
