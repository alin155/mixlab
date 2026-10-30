import test from "node:test";
import assert from "node:assert/strict";
import {
  WORKSPACE_RESIDUE_NOTICE_STORAGE_KEY,
  WORKSPACE_RESIDUE_NOTICE_TTL_MS,
  readWorkspaceResidueNoticeDismissal,
  shouldShowWorkspaceResidueNotice,
  writeWorkspaceResidueNoticeDismissal
} from "./workspace-residue-notice.ts";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); }
  };
}

test("workspace residue notice dismissal is scoped to count for 24h", () => {
  const storage = memoryStorage();
  const now = 1_800_000_000_000;
  const read = () => readWorkspaceResidueNoticeDismissal(storage);
  writeWorkspaceResidueNoticeDismissal(5, now, storage);
  assert.deepEqual(read(), { count: 5, dismissed_at: now });
  assert.equal(shouldShowWorkspaceResidueNotice({ count: 5, now: now + 1_000, dismissal: read() }), false);
  assert.equal(shouldShowWorkspaceResidueNotice({ count: 4, now: now + 1_000, dismissal: read() }), true);
  assert.equal(shouldShowWorkspaceResidueNotice({ count: 0, now: now + 1_000, dismissal: read() }), false);
  assert.equal(shouldShowWorkspaceResidueNotice({ count: 5, now: now + WORKSPACE_RESIDUE_NOTICE_TTL_MS, dismissal: read() }), true);
  assert.equal(shouldShowWorkspaceResidueNotice({ count: 5, now: now + WORKSPACE_RESIDUE_NOTICE_TTL_MS - 1, dismissal: read() }), false);
});

test("workspace residue notice dismissal ignores corrupt or empty storage", () => {
  const storage = memoryStorage();
  storage.setItem(WORKSPACE_RESIDUE_NOTICE_STORAGE_KEY, "not-json");
  assert.equal(readWorkspaceResidueNoticeDismissal(storage), null);
  storage.setItem(WORKSPACE_RESIDUE_NOTICE_STORAGE_KEY, JSON.stringify({ count: -1, dismissed_at: 1 }));
  assert.equal(readWorkspaceResidueNoticeDismissal(storage), null);
  assert.equal(shouldShowWorkspaceResidueNotice({ count: 5, now: Date.now(), dismissal: null }), true);
  assert.equal(shouldShowWorkspaceResidueNotice({ count: 0, now: Date.now(), dismissal: null }), false);
});
