import assert from "node:assert/strict";
import test from "node:test";
import { isSourceConnectionError, retrySourceConnection } from "./network-retry.ts";

test("source reconnect retries transient errors and preserves the successful result", async () => {
  let attempts = 0; const retries: number[] = [];
  const value = await retrySourceConnection(async () => {
    if (++attempts === 1) throw Object.assign(new Error("NAS disconnected"), { code: "EBADF" });
    return "ready";
  }, { onRetry: retry => { retries.push(retry); } });
  assert.equal(value, "ready"); assert.equal(attempts, 2); assert.deepEqual(retries, [1]);
});

test("permanent errors and cancellation do not retry", async () => {
  for (const code of ["EACCES", "ENOSPC", "source_changed", "source_hash_changed", "source_range", "pro_required"]) {
    let attempts = 0;
    const failure = Object.assign(new Error("operation rejected"), { code });
    await assert.rejects(retrySourceConnection(async () => { attempts++; throw failure; }), error => error === failure);
    assert.equal(attempts, 1);
  }
  const controller = new AbortController(); let attempts = 0;
  await assert.rejects(retrySourceConnection(async () => {
    attempts++; throw Object.assign(new Error("offline"), { code: "ENOTCONN" });
  }, { signal: controller.signal, onRetry: () => controller.abort() }), { name: "AbortError" });
  assert.equal(attempts, 1);
  assert.equal(isSourceConnectionError(Object.assign(new Error("ffmpeg: Connection reset by peer"), { code: "runtime_process" })), true);
  assert.equal(isSourceConnectionError(new Error("invalid video data")), false);
});
