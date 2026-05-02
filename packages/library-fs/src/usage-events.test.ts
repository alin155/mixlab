import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { appendUsageEvent, readUsageMetrics } from "./usage-events.ts";

type UsageEventInput = Parameters<typeof appendUsageEvent>[1];

async function makeRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-usage-events-"));
}

function eventsPath(root: string): string {
  return path.join(root, ".mixlab-library", "usage-events", "events.ndjson");
}

async function writeRawEvents(root: string, text: string): Promise<void> {
  await mkdir(path.dirname(eventsPath(root)), { recursive: true });
  await writeFile(eventsPath(root), text, "utf8");
}

function baseEvent(
  overrides: Partial<UsageEventInput> & Pick<UsageEventInput, "event_type">
): UsageEventInput {
  return {
    user_id: "CU000001",
    username: "小王",
    device_id: "device-1",
    occurred_at: "2026-05-03T10:00:00.000Z",
    ...overrides
  };
}

test("aggregates search, selection, cut success, active users, and per-user counts", async () => {
  const root = await makeRoot();

  await appendUsageEvent(
    root,
    baseEvent({
      event_type: "search",
      query: " 现金流 ",
      result_status: "success"
    })
  );
  await appendUsageEvent(
    root,
    baseEvent({
      event_type: "select_transcript_span",
      source_video_id: "V000002",
      selected_duration_ms: 2_500,
      occurred_at: "2026-05-03T10:01:00.000Z"
    })
  );
  await appendUsageEvent(
    root,
    baseEvent({
      event_type: "submit_cut_job",
      cut_job_id: "CJ000001",
      occurred_at: "2026-05-03T10:02:00.000Z"
    })
  );
  await appendUsageEvent(
    root,
    baseEvent({
      event_type: "cut_success",
      cut_job_id: "CJ000001",
      occurred_at: "2026-05-03T10:03:00.000Z"
    })
  );

  const metrics = await readUsageMetrics(root);

  assert.equal(metrics.search_request_count, 1);
  assert.equal(metrics.search_hit_count, 1);
  assert.equal(metrics.transcript_selection_count, 1);
  assert.equal(metrics.cut_submission_count, 1);
  assert.equal(metrics.cut_success_count, 1);
  assert.equal(metrics.active_user_count, 1);
  assert.deepEqual(metrics.recent_keywords, ["现金流"]);
  assert.deepEqual(metrics.most_used_source_video_ids, ["V000002"]);
  assert.deepEqual(metrics.users, [
    {
      user_id: "CU000001",
      username: "小王",
      search_request_count: 1,
      transcript_selection_count: 1,
      cut_submission_count: 1,
      cut_success_count: 1,
      local_clip_count: 0,
      last_used_at: "2026-05-03T10:03:00.000Z"
    }
  ]);
});

test("missing usage event store returns zero metrics and empty arrays", async () => {
  const metrics = await readUsageMetrics(await makeRoot());

  assert.deepEqual(metrics, {
    search_request_count: 0,
    search_hit_count: 0,
    search_empty_count: 0,
    source_detail_view_count: 0,
    transcript_selection_count: 0,
    cut_submission_count: 0,
    cut_success_count: 0,
    cut_failure_count: 0,
    local_clip_count: 0,
    active_user_count: 0,
    recent_keywords: [],
    most_used_source_video_ids: [],
    users: []
  });
});

test("malformed NDJSON throws Chinese error and append does not overwrite it", async () => {
  const root = await makeRoot();
  const malformed = `${JSON.stringify(
    baseEvent({ event_type: "search", query: "现金流", result_status: "success" })
  )}\n{ 这不是 json }\n`;
  await writeRawEvents(root, malformed);

  await assert.rejects(() => readUsageMetrics(root), /使用事件存储文件格式错误/);
  await assert.rejects(
    () =>
      appendUsageEvent(
        root,
        baseEvent({
          event_type: "search",
          query: "组织能力",
          result_status: "empty"
        })
      ),
    /使用事件存储文件格式错误/
  );
  assert.equal(await readFile(eventsPath(root), "utf8"), malformed);
});

test("invalid usage event input throws Chinese validation error", async () => {
  const root = await makeRoot();

  await assert.rejects(
    () =>
      appendUsageEvent(root, {
        user_id: " ",
        username: "小王",
        device_id: "device-1",
        event_type: "search",
        occurred_at: "2026-05-03T10:00:00.000Z",
        query: "现金流",
        result_status: "success"
      }),
    /使用事件数据无效/
  );
  await assert.rejects(
    () =>
      appendUsageEvent(
        root,
        baseEvent({
          event_type: "select_transcript_span",
          selected_duration_ms: 1.5
        })
      ),
    /使用事件数据无效/
  );
  await assert.rejects(
    () =>
      appendUsageEvent(
        root,
        baseEvent({
          event_type: "search",
          result_status: "unknown" as "success"
        })
      ),
    /使用事件数据无效/
  );
});

test("concurrent appends preserve all events", async () => {
  const root = await makeRoot();

  await Promise.all(
    Array.from({ length: 30 }, (_, index) =>
      appendUsageEvent(
        root,
        baseEvent({
          event_type: "search",
          user_id: `CU${String(index).padStart(6, "0")}`,
          username: `用户${index}`,
          device_id: `device-${index}`,
          occurred_at: `2026-05-03T10:${String(index).padStart(2, "0")}:00.000Z`,
          query: `关键词${index}`,
          result_status: index % 2 === 0 ? "success" : "empty"
        })
      )
    )
  );

  const rawLines = (await readFile(eventsPath(root), "utf8")).trim().split("\n");
  const metrics = await readUsageMetrics(root);

  assert.equal(rawLines.length, 30);
  assert.equal(metrics.search_request_count, 30);
  assert.equal(metrics.search_hit_count, 15);
  assert.equal(metrics.search_empty_count, 15);
  assert.equal(metrics.active_user_count, 30);
});

test("aggregates all event categories and ranks keywords and source videos", async () => {
  const root = await makeRoot();
  const events: Parameters<typeof appendUsageEvent>[1][] = [
    baseEvent({
      event_type: "search",
      query: "现金流",
      result_status: "empty",
      occurred_at: "2026-05-03T10:00:00.000Z"
    }),
    baseEvent({
      event_type: "search",
      query: "组织能力",
      result_status: "success",
      occurred_at: "2026-05-03T10:01:00.000Z"
    }),
    baseEvent({
      event_type: "search",
      query: "现金流",
      result_status: "success",
      occurred_at: "2026-05-03T10:02:00.000Z"
    }),
    baseEvent({
      event_type: "view_source_video",
      source_video_id: "V000002",
      occurred_at: "2026-05-03T10:03:00.000Z"
    }),
    baseEvent({
      event_type: "view_transcript",
      source_video_id: "V000001",
      occurred_at: "2026-05-03T10:04:00.000Z"
    }),
    baseEvent({
      event_type: "add_to_cut_list",
      source_video_id: "V000002",
      occurred_at: "2026-05-03T10:05:00.000Z"
    }),
    baseEvent({
      event_type: "submit_cut_job",
      cut_job_id: "CJ000001",
      occurred_at: "2026-05-03T10:06:00.000Z"
    }),
    baseEvent({
      event_type: "cut_failure",
      cut_job_id: "CJ000001",
      occurred_at: "2026-05-03T10:07:00.000Z"
    }),
    baseEvent({
      event_type: "create_local_clip",
      source_video_id: "V000002",
      occurred_at: "2026-05-03T10:08:00.000Z"
    }),
    baseEvent({
      event_type: "reuse_local_clip",
      user_id: "CU000002",
      username: "小李",
      device_id: "device-2",
      source_video_id: "V000001",
      occurred_at: "2026-05-03T10:09:00.000Z"
    })
  ];

  for (const event of events) {
    await appendUsageEvent(root, event);
  }

  const metrics = await readUsageMetrics(root);

  assert.equal(metrics.search_request_count, 3);
  assert.equal(metrics.search_hit_count, 2);
  assert.equal(metrics.search_empty_count, 1);
  assert.equal(metrics.source_detail_view_count, 1);
  assert.equal(metrics.cut_submission_count, 1);
  assert.equal(metrics.cut_failure_count, 1);
  assert.equal(metrics.local_clip_count, 2);
  assert.deepEqual(metrics.recent_keywords, ["现金流", "组织能力"]);
  assert.deepEqual(metrics.most_used_source_video_ids, ["V000002", "V000001"]);
  assert.equal(metrics.users.find((user) => user.user_id === "CU000002")?.local_clip_count, 1);
});
