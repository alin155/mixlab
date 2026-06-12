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

function storedEvent(
  overrides: Partial<UsageEventInput> & Pick<UsageEventInput, "event_type">
): UsageEventInput {
  return {
    event_id: "evt-stored-1",
    ...baseEvent(overrides)
  };
}

test("aggregates search, selection, cut success, active users, and per-user counts", async () => {
  const root = await makeRoot();

  await appendUsageEvent(
    root,
    baseEvent({
      event_type: "search",
      query: " 现金流 ",
      search_mode: "searchd",
      search_elapsed_ms: 23,
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
  assert.equal(metrics.search_failure_count, 0);
  assert.equal(metrics.search_latency_p50_ms, 23);
  assert.equal(metrics.search_latency_p95_ms, 23);
  assert.equal(metrics.search_latency_max_ms, 23);
  assert.equal(metrics.searchd_search_count, 1);
  assert.equal(metrics.sqlite_index_search_count, 0);
  assert.equal(metrics.fallback_search_count, 0);
  assert.equal(metrics.search_backend_unknown_count, 0);
  assert.equal(metrics.core_search_request_count, 1);
  assert.equal(metrics.core_search_failure_count, 0);
  assert.equal(metrics.core_search_latency_p50_ms, 23);
  assert.equal(metrics.core_search_latency_p95_ms, 23);
  assert.equal(metrics.core_search_latency_max_ms, 23);
  assert.equal(metrics.core_searchd_search_count, 1);
  assert.equal(metrics.core_sqlite_index_search_count, 0);
  assert.equal(metrics.core_fallback_search_count, 0);
  assert.equal(metrics.core_search_backend_unknown_count, 0);
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
      search_failure_count: 0,
      add_to_cut_list_count: 0,
      transcript_selection_count: 1,
      cut_submission_count: 1,
      cut_success_count: 1,
      local_clip_count: 0,
      reuse_local_clip_count: 0,
      last_used_at: "2026-05-03T10:03:00.000Z"
    }
  ]);
});

test("core search metrics use a recent first-page window", async () => {
  const root = await makeRoot();

  await Promise.all(
    Array.from({ length: 25 }, (_, index) =>
      appendUsageEvent(
        root,
        baseEvent({
          event_type: "search",
          user_id: `CU${String(index).padStart(6, "0")}`,
          username: `用户${index}`,
          device_id: `device-${index}`,
          occurred_at: `2026-05-03T10:${String(index).padStart(2, "0")}:00.000Z`,
          query: "现金流",
          search_mode: index < 5 ? "transcript-artifact-fallback" : "searchd",
          search_elapsed_ms: index < 5 ? 7_000 : 20 + index,
          result_status: "success"
        })
      )
    )
  );
  await appendUsageEvent(
    root,
    baseEvent({
      event_type: "search",
      occurred_at: "2026-05-03T10:30:00.000Z",
      query: "现金流",
      search_mode: "searchd",
      search_page_type: "cursor",
      search_elapsed_ms: 9_000,
      result_status: "success"
    })
  );

  const metrics = await readUsageMetrics(root);

  assert.equal(metrics.search_request_count, 25);
  assert.equal(metrics.search_latency_p95_ms, 7000);
  assert.equal(metrics.fallback_search_count, 5);
  assert.equal(metrics.core_search_request_count, 20);
  assert.equal(metrics.core_search_latency_p95_ms, 43);
  assert.equal(metrics.core_searchd_search_count, 20);
  assert.equal(metrics.core_fallback_search_count, 0);
});

test("cursor search pages do not inflate user search funnel metrics", async () => {
  const root = await makeRoot();

  await appendUsageEvent(
    root,
    baseEvent({
      event_type: "search",
      query: "现金流",
      search_mode: "searchd",
      search_page_type: "first",
      search_elapsed_ms: 12,
      result_status: "success"
    })
  );
  await appendUsageEvent(
    root,
    baseEvent({
      event_type: "search",
      query: "现金流",
      search_mode: "searchd",
      search_page_type: "cursor",
      search_elapsed_ms: 80,
      result_status: "success",
      occurred_at: "2026-05-03T10:01:00.000Z"
    })
  );

  const metrics = await readUsageMetrics(root);

  assert.equal(metrics.search_request_count, 1);
  assert.equal(metrics.search_hit_count, 1);
  assert.equal(metrics.search_empty_count, 0);
  assert.equal(metrics.search_failure_count, 0);
  assert.equal(metrics.search_latency_p50_ms, 12);
  assert.equal(metrics.search_latency_p95_ms, 12);
  assert.equal(metrics.search_latency_max_ms, 12);
  assert.equal(metrics.searchd_search_count, 1);
  assert.equal(metrics.active_user_count, 1);
  assert.deepEqual(metrics.recent_keywords, ["现金流"]);
  assert.equal(metrics.users[0]?.search_request_count, 1);
  assert.equal(metrics.users[0]?.last_used_at, "2026-05-03T10:01:00.000Z");
});

test("failed cursor searches are observable without inflating first-page funnel metrics", async () => {
  const root = await makeRoot();

  await appendUsageEvent(
    root,
    baseEvent({
      event_type: "search",
      query: "现金流",
      search_mode: "searchd",
      search_page_type: "cursor",
      search_elapsed_ms: 120,
      result_status: "failure",
      occurred_at: "2026-05-03T10:01:00.000Z"
    })
  );

  const metrics = await readUsageMetrics(root);

  assert.equal(metrics.search_request_count, 0);
  assert.equal(metrics.search_hit_count, 0);
  assert.equal(metrics.search_empty_count, 0);
  assert.equal(metrics.search_failure_count, 1);
  assert.equal(metrics.search_latency_p50_ms, 0);
  assert.equal(metrics.searchd_search_count, 0);
  assert.equal(metrics.active_user_count, 1);
  assert.deepEqual(metrics.recent_keywords, []);
  assert.equal(metrics.users[0]?.search_request_count, 0);
  assert.equal(metrics.users[0]?.search_failure_count, 1);
  assert.equal(metrics.users[0]?.last_used_at, "2026-05-03T10:01:00.000Z");
});

test("recent keywords keep append order when search timestamps are equal", async () => {
  const root = await makeRoot();

  await appendUsageEvent(
    root,
    baseEvent({
      event_type: "search",
      query: "现金流",
      search_mode: "transcript-artifact-fallback",
      result_status: "success",
      occurred_at: "2026-05-03T10:00:00.000Z"
    })
  );
  await appendUsageEvent(
    root,
    baseEvent({
      event_type: "search",
      query: "组织效率",
      search_mode: "transcript-artifact-fallback",
      result_status: "empty",
      occurred_at: "2026-05-03T10:00:00.000Z"
    })
  );

  const metrics = await readUsageMetrics(root);

  assert.deepEqual(metrics.recent_keywords, ["组织效率", "现金流"]);
});

test("missing usage event store returns zero metrics and empty arrays", async () => {
  const metrics = await readUsageMetrics(await makeRoot());

  assert.deepEqual(metrics, {
    search_request_count: 0,
    search_hit_count: 0,
    search_empty_count: 0,
    search_failure_count: 0,
    search_latency_p50_ms: 0,
    search_latency_p95_ms: 0,
    search_latency_max_ms: 0,
    searchd_search_count: 0,
    sqlite_index_search_count: 0,
    fallback_search_count: 0,
    search_backend_unknown_count: 0,
    core_search_request_count: 0,
    core_search_failure_count: 0,
    core_search_latency_p50_ms: 0,
    core_search_latency_p95_ms: 0,
    core_search_latency_max_ms: 0,
    core_searchd_search_count: 0,
    core_sqlite_index_search_count: 0,
    core_fallback_search_count: 0,
    core_search_backend_unknown_count: 0,
    source_detail_view_count: 0,
    transcript_selection_count: 0,
    add_to_cut_list_count: 0,
    cut_submission_count: 0,
    cut_success_count: 0,
    cut_failure_count: 0,
    local_clip_count: 0,
    reuse_local_clip_count: 0,
    active_user_count: 0,
    recent_keywords: [],
    most_used_source_video_ids: [],
    users: []
  });
});

test("malformed NDJSON throws Chinese error and append does not overwrite it", async () => {
  const root = await makeRoot();
  const malformed = `${JSON.stringify(
    storedEvent({ event_type: "search", query: "现金流", result_status: "success" })
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

test("stored event without event_id throws Chinese storage error and append does not overwrite it", async () => {
  const root = await makeRoot();
  const corrupted = `${JSON.stringify(
    baseEvent({ event_type: "search", query: "现金流", result_status: "success" })
  )}\n`;
  await writeRawEvents(root, corrupted);

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
  assert.equal(await readFile(eventsPath(root), "utf8"), corrupted);
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
          search_elapsed_ms: 1.5
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
  await assert.rejects(
    () =>
      appendUsageEvent(
        root,
        baseEvent({
          event_type: "search",
          search_mode: "unknown" as "searchd"
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
          search_page_type: "middle" as "first"
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
          search_mode: index % 3 === 0
            ? "searchd"
            : index % 3 === 1
              ? "sqlite-index"
              : "transcript-artifact-fallback",
          search_elapsed_ms: index + 1,
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
  assert.equal(metrics.search_failure_count, 0);
  assert.equal(metrics.search_latency_p50_ms, 15);
  assert.equal(metrics.search_latency_p95_ms, 29);
  assert.equal(metrics.search_latency_max_ms, 30);
  assert.equal(metrics.searchd_search_count, 10);
  assert.equal(metrics.sqlite_index_search_count, 10);
  assert.equal(metrics.fallback_search_count, 10);
  assert.equal(metrics.search_backend_unknown_count, 0);
  assert.equal(metrics.core_search_request_count, 20);
  assert.equal(metrics.core_search_latency_p95_ms, 29);
  assert.equal(metrics.core_searchd_search_count, 6);
  assert.equal(metrics.core_sqlite_index_search_count, 7);
  assert.equal(metrics.core_fallback_search_count, 7);
  assert.equal(metrics.active_user_count, 30);
  assert.equal(metrics.recent_keywords.length, 8);
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
  assert.equal(metrics.search_failure_count, 0);
  assert.equal(metrics.source_detail_view_count, 1);
  assert.equal(metrics.add_to_cut_list_count, 1);
  assert.equal(metrics.cut_submission_count, 1);
  assert.equal(metrics.cut_failure_count, 1);
  assert.equal(metrics.local_clip_count, 1);
  assert.equal(metrics.reuse_local_clip_count, 1);
  assert.equal(metrics.search_backend_unknown_count, 3);
  assert.deepEqual(metrics.recent_keywords, ["现金流", "组织能力"]);
  assert.deepEqual(metrics.most_used_source_video_ids, ["V000002", "V000001"]);
  const firstUser = metrics.users.find((user) => user.user_id === "CU000001");
  assert.equal(firstUser?.add_to_cut_list_count, 1);
  assert.equal(firstUser?.local_clip_count, 1);
  assert.equal(firstUser?.reuse_local_clip_count, 0);
  const secondUser = metrics.users.find((user) => user.user_id === "CU000002");
  assert.equal(secondUser?.local_clip_count, 0);
  assert.equal(secondUser?.reuse_local_clip_count, 1);
});

test("caps recent keywords and most used source videos to 8", async () => {
  const root = await makeRoot();

  for (let index = 0; index < 10; index += 1) {
    await appendUsageEvent(
      root,
      baseEvent({
        event_type: "search",
        query: `关键词${index}`,
        result_status: "success",
        occurred_at: `2026-05-03T10:${String(index).padStart(2, "0")}:00.000Z`
      })
    );
    await appendUsageEvent(
      root,
      baseEvent({
        event_type: "view_source_video",
        source_video_id: `V${String(index).padStart(6, "0")}`,
        occurred_at: `2026-05-03T11:${String(index).padStart(2, "0")}:00.000Z`
      })
    );
  }

  const metrics = await readUsageMetrics(root);

  assert.deepEqual(metrics.recent_keywords, [
    "关键词9",
    "关键词8",
    "关键词7",
    "关键词6",
    "关键词5",
    "关键词4",
    "关键词3",
    "关键词2"
  ]);
  assert.deepEqual(metrics.most_used_source_video_ids, [
    "V000000",
    "V000001",
    "V000002",
    "V000003",
    "V000004",
    "V000005",
    "V000006",
    "V000007"
  ]);
});
