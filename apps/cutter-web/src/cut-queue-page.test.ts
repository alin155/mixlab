import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { CutQueuePage } from "./features/cut-queue/CutQueuePage.tsx";

test("cut queue page displays global queue position and estimated wait to cutters", () => {
  const html = renderToStaticMarkup(
    createElement(CutQueuePage, {
      jobs: [],
      queueStatus: {
        queued_jobs: 2,
        queue: [
          { position: 2, estimated_wait_ms: 60_000 },
          { position: 3, estimated_wait_ms: 120_000 }
        ],
        global_capacity: {
          available: true,
          degraded: false,
          max_slots: 4,
          active_count: 4,
          waiting_count: 3
        },
        global_capacity_degraded: false
      }
    })
  );

  assert.match(html, /全局剪切排队/);
  assert.match(html, /本机第 2 位/);
  assert.match(html, /约 1 分钟/);
  assert.match(html, /4\/4 slot/);
});

test("cut queue page shows degraded global coordination notice", () => {
  const html = renderToStaticMarkup(
    createElement(CutQueuePage, {
      jobs: [],
      queueStatus: {
        queued_jobs: 1,
        queue: [{ position: 1, estimated_wait_ms: 5_000 }],
        global_capacity_degraded: true
      }
    })
  );

  assert.match(html, /协调服务不可用/);
  assert.match(html, /本地保守 1 slot/);
});

test("cut queue page hides queue notice when idle", () => {
  const html = renderToStaticMarkup(
    createElement(CutQueuePage, {
      jobs: [],
      queueStatus: {
        queued_jobs: 0,
        queue: [],
        global_capacity: { available: true, degraded: false, max_slots: 4, active_count: 0, waiting_count: 0 },
        global_capacity_degraded: false
      }
    })
  );

  assert.equal(html.includes("全局剪切排队"), false);
});
