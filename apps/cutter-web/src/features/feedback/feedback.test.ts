import assert from "node:assert/strict";
import test from "node:test";
import {
  FEEDBACK_CATEGORIES,
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
