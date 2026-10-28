import assert from "node:assert/strict";
import test from "node:test";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  adminDashboardDataWithSourceVideoUpdated,
  createFixtureAdminApiClient,
  loadAdminDashboardData,
  type AdminDashboardData
} from "./api.ts";
import { AdminHttpError } from "./admin-http.ts";
import {
  adminActionErrorMessage
} from "./app/AdminApp.tsx";
import {
  ADMIN_ERROR_CODE_INFO,
  adminErrorCodeInfo,
  adminErrorTechnicalDetail
} from "./app/admin-error-codes.ts";
import {
  ADMIN_SEARCH_DEBOUNCE_MS,
  createAdminDebouncedCallback
} from "./app/debounce.ts";
import {
  formatAdminDateTime,
  formatAdminEventTime,
  formatAdminLocalTimeZoneLabel
} from "./app/datetime.ts";
import { startAdminRouteRequestLoad } from "./app/route-loading-runtime.ts";
import {
  adminBatchPublishImpact,
  adminLongAsrImpact,
  adminPausePreprocessImpact,
  adminStartPreprocessImpact
} from "./app/destructive-action-impact.ts";
import {
  AdminCommandProgressPanel,
  AdminConfirmDialog,
  AdminOperationResultDialog
} from "./features/shared.tsx";

async function fixtureData(): Promise<AdminDashboardData> {
  return loadAdminDashboardData(createFixtureAdminApiClient());
}

test("time formatter keeps legacy server-local strings and converts ISO strings with zone label", () => {
  assert.equal(formatAdminDateTime("2024-05-07 10:27:03"), "2024-05-07 10:27");
  assert.equal(formatAdminDateTime("2024-05-07 10:27:03", { withSeconds: true }), "2024-05-07 10:27:03");
  assert.equal(formatAdminDateTime("2024-05-07 10:27:03", { compact: true }), "05-07 10:27");
  assert.equal(formatAdminDateTime("2024-05-07", { compact: true }), "05-07");
  assert.equal(
    formatAdminDateTime("2026-01-01T00:00:00.000Z", { timeZone: "UTC" }),
    "2026-01-01 00:00（UTC）"
  );
  assert.equal(
    formatAdminDateTime("2026-01-01T00:00:00.000Z", { timeZone: "UTC", withSeconds: true }),
    "2026-01-01 00:00:00（UTC）"
  );
  assert.equal(
    formatAdminDateTime("2026-01-01T00:00:00.000Z", { timeZone: "Asia/Shanghai" }),
    "2026-01-01 08:00（Asia/Shanghai）"
  );
  assert.equal(
    formatAdminDateTime("2026-01-01T00:00:00.000Z", { timeZone: "UTC", compact: true }),
    "01-01 00:00（UTC）"
  );
  assert.equal(formatAdminEventTime("2026-01-01T00:00:00.000Z"), formatAdminDateTime("2026-01-01T00:00:00.000Z", { withSeconds: true }));
  assert.equal(formatAdminDateTime(""), "—");
  assert.equal(formatAdminDateTime("not-a-date"), "—");
  assert.equal(formatAdminDateTime("not-a-date", { fallback: "未知时间" }), "未知时间");
  assert.match(formatAdminLocalTimeZoneLabel(new Date("2026-01-01T00:00:00.000Z")), /^UTC([+-]\d{2}:\d{2})?$/);
});

test("formatter uses local timezone label for ISO strings without explicit zone", () => {
  const formatted = formatAdminDateTime("2026-01-01T00:00:00.000Z");
  assert.match(formatted, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}（UTC([+-]\d{2}:\d{2})?）$/);
});

test("required error codes map to actionable Chinese without leaking raw codes", () => {
  for (const code of [
    "login_required",
    "preprocess_start_blocked",
    "admin_mvp_command_blocked",
    "invalid_request",
    "registration_forbidden",
    "login_rate_limited"
  ]) {
    const info = adminErrorCodeInfo(code);
    assert.ok(info, `${code} should have a mapping`);
    assert.match(info.title, /[\u4e00-\u9fff]/);
    assert.match(info.action, /[\u4e00-\u9fff]/);

    const message = adminActionErrorMessage("执行操作", new AdminHttpError(code, "server text", 400));
    assert.match(message, /失败/);
    assert.doesNotMatch(message, new RegExp(code));
  }

  assert.equal(ADMIN_ERROR_CODE_INFO.login_required.title, "登录已过期");
  assert.equal(adminErrorCodeInfo("unknown_code"), null);

  const unknown = adminActionErrorMessage("执行操作", new AdminHttpError("some_unknown_code", "unexpected", 500));
  assert.match(unknown, /错误码：some_unknown_code/);

  const chineseServerMessage = adminActionErrorMessage("执行操作", new AdminHttpError("some_unknown_code", "服务端补充说明", 500));
  assert.match(chineseServerMessage, /服务端补充说明/);
  assert.match(chineseServerMessage, /错误码：some_unknown_code/);

  const technical = adminErrorTechnicalDetail(new AdminHttpError("login_rate_limited", "too many", 429, { retry_after_seconds: 5 }));
  assert.match(technical, /错误码: login_rate_limited/);
  assert.match(technical, /HTTP 状态: 429/);
  assert.match(technical, /服务端消息: too many/);
  assert.match(technical, /retry_after_seconds/);
});

test("destructive action impact summaries expose counts and irreversibility notes", async () => {
  const data = await fixtureData();
  const batch = adminBatchPublishImpact(data);
  assert.equal(batch.target_count, data.status.index_required_video_count);
  assert.match(batch.title, /上线/);
  assert.ok(batch.items.some((item) => item.includes("不支持一键回滚")));

  const start = adminStartPreprocessImpact(data);
  assert.match(start.title, /启动预处理/);
  assert.ok(start.items.some((item) => item.includes("扫描")));
  assert.equal(start.target_count, data.status.unprocessed_video_count + data.jobs.queued_count);

  const pause = adminPausePreprocessImpact(data);
  assert.match(pause.title, /暂停预处理/);
  assert.ok(pause.items.length >= 3);

  const longAsr = adminLongAsrImpact(data);
  assert.match(longAsr.title, /长任务/);
  assert.ok(longAsr.target_count >= 0);

  const fallbackData: AdminDashboardData = {
    ...data,
    data_source: {
      ...data.data_source,
      supervisor: { source: "fallback" }
    }
  };
  assert.ok(adminStartPreprocessImpact(fallbackData).items.some((item) => item.includes("未确认")));
});

test("source video update merge replaces only matching row", async () => {
  const data = await fixtureData();
  const target = data.source_videos[0];
  assert.ok(target);
  const updated = { ...target, title: "审核后的新标题", visible_to_cutters: true };
  const merged = adminDashboardDataWithSourceVideoUpdated(data, updated);

  assert.equal(merged.source_videos.length, data.source_videos.length);
  assert.equal(merged.source_videos[0]?.title, "审核后的新标题");
  assert.equal(merged.source_videos[0]?.visible_to_cutters, true);
  assert.equal(merged.source_videos[1], data.source_videos[1]);

  const missing = { ...target, source_video_id: "V999999", title: "不存在" };
  const unchanged = adminDashboardDataWithSourceVideoUpdated(data, missing);
  assert.equal(unchanged.source_videos, data.source_videos);
});

test("search debounce coalesces rapid input and supports cancel/flush", async () => {
  assert.equal(ADMIN_SEARCH_DEBOUNCE_MS, 300);

  const calls: string[] = [];
  const debounced = createAdminDebouncedCallback((value: string) => calls.push(value), 20);

  debounced.schedule("a");
  debounced.schedule("ab");
  debounced.schedule("abc");
  assert.deepEqual(calls, []);
  await new Promise((resolve) => setTimeout(resolve, 45));
  assert.deepEqual(calls, ["abc"]);

  debounced.schedule("cancelled");
  debounced.cancel();
  await new Promise((resolve) => setTimeout(resolve, 45));
  assert.deepEqual(calls, ["abc"]);

  debounced.schedule("flushed");
  debounced.flush();
  assert.deepEqual(calls, ["abc", "flushed"]);
});

test("confirmation, progress and result dialogs render impact details", () => {
  const confirmHtml = renderToStaticMarkup(h(AdminConfirmDialog, {
    view: {
      title: "上线全部已处理素材",
      summary: "将把 5 个素材上线到剪辑端。",
      items: ["目标数量：5 个", "不支持一键回滚"],
      confirmLabel: "确认批量上线",
      danger: true
    },
    onConfirm: () => undefined,
    onCancel: () => undefined
  }));
  assert.match(confirmHtml, /执行前确认/);
  assert.match(confirmHtml, /不支持一键回滚/);
  assert.match(confirmHtml, /确认批量上线/);

  const progressHtml = renderToStaticMarkup(h(AdminCommandProgressPanel, {
    label: "批量上线",
    detail: "第 1 批完成：已上线 10 个",
    percent: 50,
    stopRequested: false,
    onStop: () => undefined
  }));
  assert.match(progressHtml, /停止后续批次/);
  assert.match(progressHtml, /第 1 批完成/);

  const resultHtml = renderToStaticMarkup(h(AdminOperationResultDialog, {
    title: "批量上线完成",
    items: ["执行批次：1 批", "本次上线：10 个"],
    onClose: () => undefined
  }));
  assert.match(resultHtml, /执行结果/);
  assert.match(resultHtml, /本次上线：10 个/);
});

test("index publish route shares the index-required loader", async () => {
  const calls: string[] = [];
  const execution = startAdminRouteRequestLoad({
    key: "indexRequiredVideos",
    route: "index-publish",
    loading: false,
    createRequestScope: () => ({
      abort: () => calls.push("abort")
    }),
    request: async () => {
      calls.push("request");
      return "ok";
    },
    onSuccess: (value) => calls.push(`success:${value}`),
    onError: (error) => calls.push(`error:${String(error)}`)
  });

  assert.ok(execution, "index-publish 路由应启动待上线列表加载");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls, ["request", "success:ok"]);
});
