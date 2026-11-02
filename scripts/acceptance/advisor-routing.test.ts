import assert from "node:assert/strict";
import test from "node:test";

// @ts-ignore advisor routing is plain ESM shared with the CLI
const routing = await import("../dev/advisor-routing.mjs");
const { classifyMessage, selectReviewScope } = routing as any;

function message(id: string, type: string, body: string) {
  return { id, from: "windows", to: "mac", type, body, created_at: "2026-11-02T10:00:00.000Z" };
}

test("advisor routing classifies skip, normal, high risk, and milestone messages", () => {
  assert.equal(classifyMessage(message("1", "ack", "收到")), "skip");
  assert.equal(classifyMessage(message("2", "reply", "普通实现完成，测试通过。")), "normal");
  assert.equal(classifyMessage(message("3", "task", "请部署 0.18.28 安装包并更新 update.json。")), "high");
  assert.equal(classifyMessage(message("4", "reply", "规格确认，附 spec 和 sha256 证据。")), "milestone");
});

test("advisor hybrid mode reviews high risk immediately and batches normal changes", () => {
  const normal = message("2", "reply", "普通实现完成，测试通过。");
  const pending = selectReviewScope({ messages: [normal], reviewedIds: [], mode: "hybrid", batchSize: 8, batchAgeMs: 99999999, now: "2026-11-02T10:00:00.000Z" });
  assert.deepEqual(pending.selected, []);
  assert.deepEqual(pending.pendingIds, ["2"]);
  assert.equal(pending.reviewKind, "none");

  const high = message("3", "task", "请部署 0.18.28 安装包并更新 update.json。");
  const immediate = selectReviewScope({ messages: [normal, high], reviewedIds: [], pendingIds: ["2"], mode: "hybrid", batchSize: 8, batchAgeMs: 99999999, now: "2026-11-02T10:00:00.000Z" });
  assert.deepEqual(immediate.selected.map((item: any) => item.id), ["2", "3"]);
  assert.equal(immediate.reviewKind, "high");
});

test("advisor hybrid mode flushes pending at milestone and batch threshold", () => {
  const normal = message("2", "reply", "普通实现完成，测试通过。");
  const milestone = message("4", "reply", "候选构建完成，附 build 和 sha256 证据。");
  const flushed = selectReviewScope({ messages: [normal, milestone], reviewedIds: [], pendingIds: ["2"], mode: "hybrid", batchSize: 8, batchAgeMs: 99999999, now: "2026-11-02T10:00:00.000Z" });
  assert.deepEqual(flushed.selected.map((item: any) => item.id), ["2", "4"]);
  assert.equal(flushed.reviewKind, "milestone");

  const batch = selectReviewScope({ messages: [normal], reviewedIds: [], pendingIds: ["2"], mode: "hybrid", batchSize: 1, batchAgeMs: 99999999, now: "2026-11-02T10:00:00.000Z" });
  assert.deepEqual(batch.selected.map((item: any) => item.id), ["2"]);
  assert.equal(batch.reviewKind, "batch");
});
