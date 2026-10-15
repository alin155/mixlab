import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { constants } from 'node:fs';
import { cp, copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SmartCore } from './core.ts';
import { SmartAi } from './ai.ts';
import { workReady } from './types.ts';
import { createAcceptanceLibrary } from '../../../scripts/smart-cutter/fixture.ts';
import { publishCutterRelease } from '../../library-fs/src/cutter-release.ts';
import { publishIndexPackage } from '../../library-fs/src/index.ts';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ai = { python: path.join(repo, 'apps/smart-cutter-desktop/src-tauri/runtime/python/bin/python3'), script: path.join(repo, 'scripts/smart-cutter/ai-worker.py'), models: path.join(repo, 'apps/smart-cutter-desktop/src-tauri/runtime/models') };
async function fixture(t: TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mixlab-search-performance-'));
  const library = await createAcceptanceLibrary(path.join(root, 'library'));
  const core = new SmartCore({ state_root: path.join(root, 'state'), workspace_root: path.join(root, 'workspace'), auth_mode: 'local_trusted', ai });
  await core.initialize(); await core.updateSettings({ library_root: library });
  t.after(async () => { await core.close(); core.store.close(); await rm(root, { recursive: true, force: true }); });
  return { core, root, library };
}
async function publishUnchangedContent(library: string) {
  const source = path.join(library, '.mixlab-library/indexes/source-transcript-index/v000001');
  const file = path.join(library, 'next-index.sqlite');
  await copyFile(path.join(source, 'index.sqlite'), file);
  const db = new DatabaseSync(file); db.prepare("UPDATE metadata SET value='v000002' WHERE key='index_version'").run(); db.close();
  await publishIndexPackage({ library_root: library, manifest: { ...JSON.parse(await readFile(path.join(source, 'index-manifest.json'), 'utf8')), index_version: 'v000002', created_at: '2026-10-15T10:00:00.000Z' }, index_sqlite_bytes: await readFile(file) });
  await publishCutterRelease({ library_root: library, now: '2026-10-15T10:00:00.000Z' });
}

test('cold retrieval never builds the full corpus and incomplete misses cannot be exported', async t => {
  const { core } = await fixture(t);
  t.mock.method(core.ai, 'buildIndex', () => { assert.fail('interactive search must not build the corpus'); });
  const snapshot = await core.library.snapshot();
  const result = await core.ai.search(snapshot, '现金流是企业血液', '');
  assert.equal(result.mode, 'candidate'); assert.equal(result.complete, false);
  assert.equal(result.hits[0]?.source_video_id, 'V000001');
  const empty = await core.ai.search(snapshot, '现金流是企业血液', '不存在的文件夹');
  assert.equal(empty.hits.length, 0);
  const work = await core.generatePlan(core.createWork('ZZZXQW。', undefined, '验收讲师').id);
  assert.equal(work.segments[0]?.status, 'pending'); assert.equal(workReady(work), false);
  assert.throws(() => core.selectSegment(work.id, 1, { revision: work.revision, accepted: true }), /不能通过/);
});

test('encoding is reused across releases, changed text is recomputed, and ANN respects scope', async t => {
  const { core, library, root } = await fixture(t);
  const first = await core.library.snapshot();
  await core.ai.buildIndex(first);
  const cold = core.ai.indexStatus as typeof core.ai.indexStatus & { encoded: number; reused: number };
  assert.equal(cold.encoded, 2);
  const indexed = await core.ai.search(first, '现金流是企业的血液。', '验收素材');
  assert.equal(indexed.mode, 'ann'); assert.equal(indexed.complete, true);
  assert.equal(indexed.hits[0]?.source_video_id, 'V000001'); assert.ok(indexed.hits[0]!.score > 0.99);
  assert.deepEqual((await core.ai.search(first, '现金流是企业的血液。', '其他范围')).hits, []);
  const firstVectors = new DatabaseSync(path.join(first.root, 'semantic-vectors.sqlite'), { readOnly: true });
  const manifest = JSON.parse((firstVectors.prepare("SELECT value FROM meta WHERE key='ann'").get() as { value: string }).value) as { files: Record<string, string> };
  firstVectors.close();
  await rm(path.join(first.root, Object.values(manifest.files)[0]!));
  assert.equal((await core.ai.search(first, '现金流是企业的血液。', '验收素材')).mode, 'candidate', 'missing derived ANN files must not block matching');
  await publishUnchangedContent(library);
  const second = await core.library.snapshot();
  assert.notEqual(second.id, first.id);
  await core.ai.buildIndex(second);
  assert.equal((core.ai.indexStatus as typeof cold).encoded, 0);
  assert.equal((core.ai.indexStatus as typeof cold).reused, 2);
  const changedRoot = path.join(path.dirname(second.root), 'changed-text-fixture');
  await cp(path.join(second.root, '.mixlab-library'), path.join(changedRoot, '.mixlab-library'), { recursive: true, mode: constants.COPYFILE_FICLONE });
  const changed = { ...second, id: 'changed-text-fixture', root: changedRoot, index_path: second.index_path.replace(second.root, changedRoot) };
  const db = new DatabaseSync(changed.index_path);
  db.prepare('UPDATE segments SET text=? WHERE segment_index=0').run('新的原声表达必须重新计算。'); db.close();
  await core.ai.buildIndex(changed);
  assert.equal((core.ai.indexStatus as typeof cold).encoded, 1);
  assert.equal((core.ai.indexStatus as typeof cold).reused, 1);
  const changedModels = path.join(root, 'different-tokenizer');
  await cp(ai.models, changedModels, { recursive: true, mode: constants.COPYFILE_FICLONE });
  const tokenizer = path.join(changedModels, 'tokenizer.json');
  await writeFile(tokenizer, await readFile(tokenizer, 'utf8') + '\n');
  const changedEncoder = new SmartAi({ ...ai, models: changedModels });
  t.after(() => changedEncoder.close());
  await changedEncoder.buildIndex(changed);
  assert.equal(changedEncoder.indexStatus.encoded, 2, 'a different tokenizer must invalidate reuse');
});

test('verified legacy vectors are adopted without encoding the same text again', async t => {
  const { core, root } = await fixture(t);
  const snapshot = await core.library.snapshot(); await core.ai.buildIndex(snapshot);
  const freshRoot = path.join(root, 'fresh/cache/library-snapshots/current');
  await cp(path.join(snapshot.root, '.mixlab-library'), path.join(freshRoot, '.mixlab-library'), { recursive: true });
  const legacyRoot = path.join(root, 'fresh/cache/library-snapshots/legacy');
  await cp(path.join(snapshot.root, '.mixlab-library'), path.join(legacyRoot, '.mixlab-library'), { recursive: true });
  const file = path.join(legacyRoot, 'semantic-vectors.sqlite');
  await copyFile(path.join(snapshot.root, 'semantic-vectors.sqlite'), file);
  const legacy = new DatabaseSync(file); legacy.exec("DELETE FROM meta WHERE key IN ('encoder','ann','ready')"); legacy.close();
  const fresh = { ...snapshot, id: 'fresh', root: freshRoot, index_path: snapshot.index_path.replace(snapshot.root, freshRoot) };
  await core.ai.buildIndex(fresh);
  assert.equal(core.ai.indexStatus.encoded, 0); assert.equal(core.ai.indexStatus.reused, 2);
});

test('matching reuses a validated local snapshot while explicit sync discovers the new release', async t => {
  const { core, library } = await fixture(t);
  const pinned = await core.library.snapshot();
  await publishUnchangedContent(library);
  const work = await core.generatePlan(core.createWork('现金流是企业的血液。', undefined, '验收讲师').id);
  assert.equal(work.snapshot_id, pinned.id);
  const latest = await core.library.snapshot(); assert.notEqual(latest.id, pinned.id);
  const resumed = await core.generatePlan(work.id); assert.equal(resumed.snapshot_id, pinned.id);
});

test('stopping the builder cannot cancel a request running in the interactive worker', async t => {
  const { root } = await fixture(t);
  const script = path.join(root, 'separate-lanes.py');
  await writeFile(script, `import json,sys,time\nfor line in sys.stdin:\n r=json.loads(line)\n if r['op']=='build_index':\n  print(json.dumps({'id':r['id'],'progress':{'done':1,'total':20}}),flush=True)\n  time.sleep(30)\n else:\n  time.sleep(.1)\n  print(json.dumps({'id':r['id'],'result':{'ok':True}}),flush=True)\n`);
  const runtime = new SmartAi({ ...ai, script }); t.after(() => runtime.close());
  let running!: () => void;
  const started = new Promise<void>(resolve => { running = resolve; });
  const building = runtime.request({ op: 'build_index' }, running);
  const stopped = assert.rejects(building, /已停止本机索引任务/);
  await started;
  const query = runtime.request<{ ok: boolean }>({ op: 'hybrid_search' }, undefined, true);
  runtime.stopIndex();
  assert.equal((await query).ok, true); await stopped;
});
