import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SmartCore } from './core.ts';
import { createSmartServer } from './http.ts';
import type { LibrarySnapshot } from './library.ts';
import type { MatchProgress, Work } from './types.ts';
import { createAcceptanceLibrary } from '../../../scripts/smart-cutter/fixture.ts';
import { MatchingProgress } from '../../../apps/smart-cutter-web/src/MatchingProgress.tsx';

async function fixture(t: TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mixlab-matching-progress-'));
  const library = await createAcceptanceLibrary(path.join(root, 'library'));
  const core = new SmartCore({ state_root: path.join(root, 'state'), workspace_root: path.join(root, 'workspace'), auth_mode: 'local_trusted', ai: { python: 'missing-test-runtime', script: '', models: '' } });
  await core.initialize(); await core.updateSettings({ library_root: library });
  t.after(async () => { await core.close(); core.store.close(); await rm(root, { recursive: true, force: true }); });
  return core;
}
async function until(check: () => boolean) {
  for (let i = 0; i < 300; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  assert.fail('progress did not reach expected stage');
}

test('interactive matching reports progress and completes while another snapshot index is still running', async t => {
  const core = await fixture(t);
  const snapshot = await core.library.snapshot();
  const other: LibrarySnapshot = { ...snapshot, id: 'older-snapshot', version: 'v000000' };
  core.store.set('snapshot', other);
  let finishIndex!: () => void;
  const indexGate = new Promise<void>(resolve => { finishIndex = resolve; });
  let finishSearch!: () => void;
  const searchGate = new Promise<void>(resolve => { finishSearch = resolve; });
  let updateIndex!: (value: { done: number; total: number }) => void;
  t.mock.method(core.ai, 'request', async (payload: Record<string, unknown>, progress?: typeof updateIndex) => {
    if (payload.op === 'build_index' && core.ai.indexStatus.snapshot_id === other.id) {
      updateIndex = progress!; progress!({ done: 5, total: 20 }); await indexGate; return { done: 20, total: 20 };
    }
    if (payload.op === 'hybrid_search') { await searchGate; return { hits: [], mode: 'candidate', complete: false, examined: 0, encoded: 0, reused: 0, query_ms: 1 }; }
    assert.fail('interactive matching must not start another full index');
  });
  const indexTask = core.ai.buildIndex(other);
  const work = core.createWork('现金流是企业的血液。这个句子不存在于验收素材。', undefined, '验收讲师');
  const planning = core.generatePlan(work.id);
  t.after(async () => { finishSearch(); finishIndex(); await indexTask; await planning.catch(() => {}); });
  await until(() => core.work(work.id).match_progress?.phase === 'semantic_search');
  const server = createSmartServer(core, 'progress-fixture');
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/smart/works/${work.id}`;
  const read = async () => (await fetch(url, { headers: { 'X-Smart-Token': 'progress-fixture' } })).json() as Promise<Work>;
  const waiting = (await read()).match_progress!;
  assert.equal(waiting.completed_sentences, 1); assert.equal(waiting.current_sentence, 2);
  assert.equal(waiting.total_sentences, 2); assert.equal(waiting.exact_matches, 1);
  assert.equal(waiting.snapshot_id, snapshot.id); assert.equal(waiting.snapshot_version, 'v000001');
  assert.equal(waiting.semantic?.version, 'v000000'); assert.equal(waiting.semantic?.done, 5);
  updateIndex({ done: 13, total: 20 });
  assert.equal((await read()).match_progress?.semantic?.done, 13);
  finishSearch();
  const result = await planning;
  assert.equal(core.ai.indexStatus.running, true, 'the work must finish before the unrelated index');
  assert.equal(result.match_progress?.phase, 'complete');
  assert.equal(result.match_progress?.completed_sentences, 2);
  assert.equal(result.match_progress?.missing_matches, 0);
  assert.equal(result.match_progress?.pending_matches, 1);
  assert.equal(result.segments[1]?.status, 'pending');
  assert.equal(result.status, 'review');
  core.updateWork(work.id, { script: '新的文案。' });
  assert.equal(core.work(work.id).match_progress, undefined);
  finishIndex(); await indexTask;
});

test('failed matching preserves the actual last completed counts and a terminal phase', async t => {
  const core = await fixture(t);
  t.mock.method(core.ai, 'search', async () => { throw new Error('fixture semantic failure'); });
  const work = core.createWork('现金流是企业的血液。找不到的另一句。', undefined, '验收讲师');
  await assert.rejects(core.generatePlan(work.id), /fixture semantic failure/);
  const result = core.work(work.id);
  assert.equal(result.status, 'failed'); assert.equal(result.match_progress?.phase, 'failed');
  assert.equal(result.match_progress?.completed_sentences, 1);
  assert.equal(result.match_progress?.exact_matches, 1);
});

test('matching panel distinguishes index scope, sentence completion and unmeasured progress', () => {
  const progress: MatchProgress = { phase: 'semantic_wait', started_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    total_sentences: 4, completed_sentences: 1, current_sentence: 2, exact_matches: 1, near_matches: 0, missing_matches: 0,
    snapshot_id: 'current', snapshot_version: 'v000002', semantic: { snapshot_id: 'previous', version: 'v000001', running: true, done: 25, total: 100, error: '' } };
  const work = { status: 'matching', updated_at: progress.started_at, match_progress: progress } as Work;
  let html = renderToStaticMarkup(createElement(MatchingProgress, { work }));
  for (const text of ['第 2 / 4 句', '已完成 1 / 4 句', '25%', '25 / 100 段', '当前作品使用 v000002', 'v000001', '不代表整条作品']) assert.ok(html.includes(text), text);
  assert.ok(html.includes('value="25" max="100"'));
  html = renderToStaticMarkup(createElement(MatchingProgress, { work: { ...work, match_progress: { ...progress, phase: 'snapshot_sync', semantic: undefined, snapshot_id: undefined } } }));
  assert.ok(html.includes('正在同步素材快照 v000002，尚未完成')); assert.ok(!html.includes('<progress'));
  html = renderToStaticMarkup(createElement(MatchingProgress, { work: { ...work, match_progress: undefined } }));
  assert.ok(html.includes('正在读取本次匹配的实际进度')); assert.ok(!html.includes('0%'));
});
