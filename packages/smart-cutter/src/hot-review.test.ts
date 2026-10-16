import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SmartCore } from './core.ts';
import { createSmartServer } from './http.ts';
import { type HotVideo, type WorkSegment, workReady } from './types.ts';
import { createAcceptanceLibrary } from '../../../scripts/smart-cutter/fixture.ts';

const ai = { python: 'missing-test-runtime', script: 'missing-test-runtime', models: 'missing-test-runtime' };
const hot = (): HotVideo => ({ id: 'douyin:72300000001', video_id: '72300000001', platform: 'douyin', account_id: 'account', author: '验收账号', title: '下载播放验收', published_at: '', duration_ms: 0, download_url: '', cover_url: '', observations: [], growth_per_hour: null, status: 'discovered', error: '', local_video_path: '', local_audio_path: '', transcript: '', asr_task_id: '', asr_model: '', updated_at: '' });
async function fixture(t: TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'smart-hot-review-'));
  const library = await createAcceptanceLibrary(path.join(root, 'library'));
  const core = new SmartCore({ state_root: path.join(root, 'state'), workspace_root: path.join(root, 'workspace'), auth_mode: 'local_trusted', ai });
  await core.initialize(); await core.updateSettings({ library_root: library });
  const server = createSmartServer(core, 'local-test');
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => { await core.close(); await new Promise<void>(resolve => server.close(() => resolve())); core.store.close(); await rm(root, { recursive: true, force: true }); });
  const api = (route: string, method = 'GET', payload?: unknown) => fetch(base + route, { method, headers: { 'X-Smart-Token': 'local-test', 'Content-Type': 'application/json' }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
  return { core, root, library, base, api };
}

test('download-only is single flight without ASR credentials, reuses local media, streams ranges and recovers after cleanup', async t => {
  const { core, root, library, base, api } = await fixture(t);
  const bytes = await readFile(path.join(library, 'source-videos/验收素材/原声拼接验收.mp4'));
  let providerCalls = 0, downloads = 0;
  t.mock.method(core.provider, 'video', async () => { providerCalls++; return { download_url: 'https://example.com/video.mp4' }; });
  t.mock.method(https, 'get', (_url: unknown, _options: unknown, callback: (value: unknown) => void) => {
    downloads++;
    const response = Object.assign(Readable.from([bytes]), { statusCode: 200, headers: { 'content-length': String(bytes.length) } });
    queueMicrotask(() => callback(response)); return new EventEmitter();
  });
  core.store.set('hot', hot());
  const first = core.references.download(hot().id), second = core.references.download(hot().id);
  assert.equal(first, second); await first;
  assert.equal(core.vault.has('dashscope'), false);
  assert.equal(core.store.get<HotVideo>('hot', hot().id)!.transcript, '');
  assert.equal(core.store.get<HotVideo>('hot', hot().id)!.status, 'discovered');
  await core.references.download(hot().id);
  assert.equal(providerCalls, 1); assert.equal(downloads, 1);
  const state = await core.state(); assert.equal(state.hot[0]!.video_cached, true);
  assert.ok(!JSON.stringify(state.hot).includes('local_video_path'));
  const route = `/smart/media/hot/${encodeURIComponent(hot().id)}/video`;
  assert.equal((await fetch(base + route)).status, 401);
  const range = await fetch(base + route + '?access=local-test', { headers: { Range: 'bytes=0-15' } });
  assert.equal(range.status, 206); assert.equal(range.headers.get('content-range'), `bytes 0-15/${bytes.length}`);
  assert.deepEqual(Buffer.from(await range.arrayBuffer()), bytes.subarray(0, 16));
  core.options.test_account_tier = 'ordinary'; assert.equal((await api(route)).status, 403);
  assert.equal((await api(`/smart/hot/${encodeURIComponent(hot().id)}/download`, 'POST', {})).status, 403);
  core.options.test_account_tier = 'pro';
  await core.cache.clear(['reference']); assert.equal((await core.state()).hot[0]!.video_cached, false);
  assert.equal((await api(route)).status, 404);
  await core.references.download(hot().id); assert.equal(downloads, 2);
  const file = (await core.references.videoPath(hot().id))!;
  await rm(file); const outside = path.join(root, 'outside.mp4'); await writeFile(outside, bytes); await symlink(outside, file);
  assert.equal((await api(route)).status, 403, 'a cached reference cannot point to arbitrary local files');
  assert.equal((await core.manual.busy()), false); assert.equal(core.store.list('work').length, 0);
});

test('bulk review is atomic and revision checked, leaves gaps/conflicts/pending untouched, and enforces Pro', async t => {
  const { core, api } = await fixture(t);
  const work = await core.generatePlan(core.createWork('现金流是企业的血液。', undefined, '验收讲师').id);
  const segment = work.segments[0]!;
  work.segments = [
    { ...segment, status: 'near', accepted: false },
    { ...segment, id: 2, status: 'near', accepted: false },
    ...(['gap', 'conflict', 'pending'] as const).map((status, index): WorkSegment => ({ ...segment, id: index + 3, status, selected: null, actual: '', accepted: false }))
  ];
  core.store.set('work', work);
  const route = `/smart/works/${work.id}/accept-all`;
  assert.equal((await api(route, 'POST', { revision: work.revision - 1 })).status, 409);
  assert.ok(core.work(work.id).segments.every(item => !item.accepted));
  core.options.test_account_tier = 'ordinary'; assert.equal((await api(route, 'POST', { revision: work.revision })).status, 403);
  core.options.test_account_tier = 'pro';
  const response = await api(route, 'POST', { revision: work.revision }); assert.equal(response.status, 200);
  const saved = core.work(work.id);
  assert.deepEqual(saved.segments.map(item => item.accepted), [true, true, false, false, false]);
  assert.equal(saved.revision, work.revision + 1); assert.equal(saved.status, 'review'); assert.equal(workReady(saved), false);
  assert.throws(() => core.enqueue(saved.id), /审核/);
  const noOp = core.acceptAllSegments(saved.id, { revision: saved.revision }); assert.equal(noOp.revision, saved.revision);
  noOp.segments = noOp.segments.slice(0, 2); core.store.set('work', noOp); assert.equal(workReady(noOp), true);
});

test('high semantic recall scores cannot select unrelated speech or pass review/export', async t => {
  const { core } = await fixture(t);
  t.mock.method(core.ai, 'search', async () => ({ hits: [{ source_video_id: 'V000001', segment_id: 'V000001-S000001', begin_ms: 0, end_ms: 1700, text: '现金流是企业的血液。', score: 0.99 }], mode: 'candidate' as const, complete: false, examined: 1, query_ms: 1, encoded: 0, reused: 0 }));
  const work = await core.generatePlan(core.createWork('思想深度高于常人的人，内心也更敏感。', undefined, '验收讲师').id);
  assert.ok(work.segments[0]!.candidates.length > 0);
  assert.ok(work.segments[0]!.candidates.every(candidate => candidate.kind === 'conflict'));
  assert.equal(work.segments[0]!.selected, null);
  assert.equal(work.segments[0]!.status, 'pending');
  assert.ok(core.acceptAllSegments(work.id, { revision: work.revision }).segments.every(segment => !segment.accepted));
  assert.throws(() => core.enqueue(work.id), /未处理句子/);
});

test('teacher identity constrains matching, candidate selection, bulk review, supplements and old exports', async t => {
  const { core, api } = await fixture(t);
  const work = core.createWork('现金流是企业的血液。');
  await assert.rejects(core.generatePlan(work.id), /选择目标老师/);
  core.updateWork(work.id, { settings: { teacher: '验收讲师' } }); await core.generatePlan(work.id);
  const plan = core.work(work.id), snapshot = core.library.getSnapshot(plan.snapshot_id);
  const legacy = structuredClone(plan); delete legacy.settings.teacher; core.store.set('work', legacy);
  const rebound = core.updateWork(work.id, { script: legacy.script, settings: { teacher: '验收讲师' } });
  assert.equal(rebound.snapshot_id, snapshot.id, 'choosing a teacher on an old work reuses its pinned index');
  assert.equal(rebound.segments.length, 0);
  core.store.set('work', plan);
  assert.deepEqual((await core.library.teachers()).map(item => item.name), ['验收讲师']);
  const other = core.createWork('现金流是企业的血液。', undefined, '另一位老师');
  await assert.rejects(core.generatePlan(other.id), /没有可用视频/);
  const original = plan.segments[0]!.selected!;
  // Deliberately alter only this disposable published catalog; cached candidate labels must not grant access.
  const db = new DatabaseSync(path.join(snapshot.root, '.mixlab-library/releases', snapshot.version, 'catalog.sqlite'));
  const sourceRow = db.prepare('SELECT * FROM source_videos LIMIT 1').get()!;
  const columns = Object.keys(sourceRow);
  db.prepare("UPDATE source_videos SET lecturer='另一位老师'").run();
  sourceRow.source_video_id = 'V000002'; sourceRow.position = 2; sourceRow.lecturer = '验收讲师';
  db.prepare(`INSERT INTO source_videos (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...Object.values(sourceRow)); db.close();
  // A fresh library object reads the new catalog instead of the earlier in-memory fixture rows.
  const { SmartLibrary } = await import('./library.ts');
  const scoped = new SmartLibrary(core.store, () => core.settings, async () => ({ hits: [{ source_video_id: original.source_video_id, segment_id: original.segment_ids[0]!, begin_ms: 0, end_ms: 1700, text: original.actual, score: 1 }], complete: false, mode: 'candidate', examined: 1, query_ms: 1, encoded: 0, reused: 0 }));
  const freshAssert = scoped.assertTeacher.bind(scoped);
  t.mock.method(core.library, 'assertTeacher', freshAssert);
  assert.throws(() => core.selectSegment(work.id, 1, { revision: plan.revision, candidate_id: original.id }), /没有可用视频|其他老师/);
  const near = core.work(work.id); near.segments[0]!.status = 'near'; core.store.set('work', near);
  assert.throws(() => core.acceptAllSegments(work.id, { revision: near.revision }), /没有可用视频|其他老师/);
  assert.equal(core.work(work.id).segments[0]!.accepted, false);
  assert.deepEqual(await scoped.candidates(snapshot, '现金流是企业血液', '', '现金流是企业血液', undefined, undefined, '验收讲师'), [], 'even a mis-scoped semantic hit must be discarded');
  const row = await scoped.candidates(snapshot, original.actual, '', original.actual, undefined, undefined, '另一位老师');
  assert.ok(row.every(item => item.source_video_id === original.source_video_id));
  const missing = { ...plan, settings: { ...plan.settings, teacher: '' } }; core.store.set('work', missing);
  assert.throws(() => core.enqueue(work.id), /选择目标老师/);
  await assert.rejects(core.supplementSegment(work.id, 1, { revision: missing.revision, source_video_id: original.source_video_id, range: { start: 0, end: 0, from: 0, to: 9 }, begin_ms: 0, end_ms: 1700 }), /选择目标老师|没有可用视频|其他老师/);
  assert.equal((await api('/smart/works', 'POST', { script: '文案' })).status, 400);
});
