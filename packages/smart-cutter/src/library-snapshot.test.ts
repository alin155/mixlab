import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SmartCore } from './core.ts';
import { createSmartServer } from './http.ts';
import type { LibrarySnapshot } from './library.ts';
import { createAcceptanceLibrary } from '../../../scripts/smart-cutter/fixture.ts';

async function fixture(t: TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mixlab-snapshot-recovery-'));
  const library = await createAcceptanceLibrary(path.join(root, 'PublicLibrary'));
  const core = new SmartCore({ state_root: path.join(root, 'state'), workspace_root: path.join(root, 'workspace'), auth_mode: 'local_trusted', ai: { python: 'missing-test-runtime', script: '', models: '' } });
  await core.initialize(); await core.updateSettings({ library_root: library });
  t.after(async () => { await core.close(); core.store.close(); await rm(root, { recursive: true, force: true }); });
  return { library, core };
}

test('incomplete copies cannot become published snapshots with an empty version', async t => {
  const { library, core } = await fixture(t);
  const index = path.join(library, '.mixlab-library/releases/v000001/search-index/source-transcript-index/v000001/index.sqlite');
  await rename(index, index + '.missing');
  await assert.rejects(core.library.snapshot(), error => (error as { code?: string }).code === 'snapshot_incomplete');
  assert.equal(core.store.list('snapshot').length, 0);
  assert.deepEqual(await readdir(path.join(core.settings.workspace_root, 'cache/library-snapshots')), []);
});

test('a damaged saved snapshot is preserved for diagnosis and rebuilt before reuse', async t => {
  const { library, core } = await fixture(t);
  const snapshot = await core.library.snapshot();
  const pointer = path.join(snapshot.root, '.mixlab-library/current-release.json');
  const sourcePointer = await readFile(path.join(library, '.mixlab-library/current-release.json'), 'utf8');
  await writeFile(pointer, JSON.stringify({ ...JSON.parse(sourcePointer), current_version: 'v999999', manifest_path: '.mixlab-library/releases/v999999/release.json' }));
  const repaired = await core.library.snapshot();
  assert.equal(repaired.id, snapshot.id);
  assert.equal(repaired.version, 'v000001');
  assert.equal(JSON.parse(await readFile(pointer, 'utf8')).current_version, repaired.version);
  assert.equal((await core.library.source(repaired, 'V000001')).transcript.segments.length, 2);
  assert.equal((await readdir(path.dirname(snapshot.root))).filter(name => name.startsWith('.invalid-')).length, 1);
  assert.equal(await readFile(path.join(library, '.mixlab-library/current-release.json'), 'utf8'), sourcePointer);
});

test('index recovery resumes an owned pinned snapshot when the NAS publishes a newer version', async t => {
  const { library, core } = await fixture(t);
  const pinned = await core.library.snapshot();
  const pointer = path.join(library, '.mixlab-library/current-release.json');
  await writeFile(pointer, JSON.stringify({ ...JSON.parse(await readFile(pointer, 'utf8')), current_version: 'v000002' }));
  let resumed = '';
  t.mock.method(core.ai, 'buildIndex', async (snapshot: LibrarySnapshot) => { resumed = snapshot.id; });
  const server = createSmartServer(core, 'snapshot-test');
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const post = (snapshot_id: string) => fetch(base + '/smart/library/index', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Smart-Token': 'snapshot-test' }, body: JSON.stringify({ snapshot_id }) });
  assert.equal((await post(pinned.id)).status, 202);
  assert.equal(resumed, pinned.id);
  assert.equal((await post('../unknown-snapshot')).status, 409);
});
