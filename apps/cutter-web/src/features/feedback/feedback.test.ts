import assert from "node:assert/strict";
import test from "node:test";
import {
  FEEDBACK_CATEGORIES,
  cutTaskFeedbackContext,
  recentFeedbackEvents,
  recordFeedbackEvent,
  sanitizeFeedbackContext
} from "./feedback.ts";

test("feedback categories match phase 1 spec", () => {
  assert.deepEqual([...FEEDBACK_CATEGORIES], ["找不到", "剪错了", "太慢", "卡住/报错", "建议"]);
});

test("feedback context strips credentials and keeps whitelisted product context", () => {
  const context = sanitizeFeedbackContext({
    page: "material-locator",
    search: { query: "测试", session_token: "secret", nested: { password: "no" } },
    api_token: "leak",
    project_id: "project-1"
  });
  assert.equal(context.page, "material-locator");
  assert.equal(context.project_id, "project-1");
  const serialized = JSON.stringify(context);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("session_token"), false);
  assert.equal(serialized.includes("password"), false);
  assert.equal(serialized.includes("api_token"), false);
});

test("feedback events keep bounded recent trail", () => {
  recordFeedbackEvent("open-feedback", "settings");
  const events = recentFeedbackEvents(5);
  assert.ok(events.some((event) => event.type === "open-feedback"));
});

test("cut failure feedback keeps only the latest three failed tasks with diagnostics", () => {
  const jobs = Array.from({ length: 5 }, (_, index) => ({
    queue_job_id: "CJ-" + index,
    status: index === 4 ? "done" : "failed",
    cut_mode: "copy" as const,
    cut_mode_used: "precise" as const,
    output_file: "",
    error_code: "output_missing_video_stream",
    error_message: "输出缺少视频流",
    begin_ms: 1000,
    end_ms: 2000,
    source_video_id: "V000001",
    source_title: "C0675",
    verification: {
      passed: false,
      expected_duration_ms: 1000,
      actual_duration_ms: 0,
      tolerance_ms: 200,
      checks: [{ id: "duration" }]
    }
  }));
  const context = cutTaskFeedbackContext(jobs);
  assert.equal(context.length, 3);
  assert.deepEqual(context.map((item) => item.job_id), ["CJ-0", "CJ-1", "CJ-2"]);
  assert.equal(context[0].error_code, "output_missing_video_stream");
  assert.equal(context[0].error_message, "输出缺少视频流");
  assert.equal(context[0].cut_mode_used, "precise");
  assert.deepEqual(context[0].verification, {
    passed: false,
    expected_duration_ms: 1000,
    actual_duration_ms: 0,
    tolerance_ms: 200,
    checks: [{ id: "duration" }]
  });
});
