import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { createAdminApiServer } from '../../admin-api/src/index.ts';
import { createAcceptanceLibrary } from '../../../scripts/smart-cutter/fixture.ts';
import { SmartCore } from './core.ts';
import { createSmartServer } from './http.ts';
import { runProcess } from './process.ts';

test('real Admin and client APIs share reviewed accounts, tier changes, password reset and disable', { timeout: 60000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mixlab-mac-accounts-'));
  const library = await createAcceptanceLibrary(path.join(root, 'PublicLibrary'));
  const core = new SmartCore({ state_root: path.join(root, 'state'), workspace_root: path.join(root, 'workspace'), auth_mode: 'reviewed', ai: { python: 'missing-test-runtime', script: '', models: '' } });
  await core.initialize();
  const admin = createAdminApiServer({ library_root: library, library_id: 'smart-acceptance-only', library_name: '独立账号验收', auth_mode: 'password' });
  const client = createSmartServer(core, 'account-acceptance');
  async function listen(server: Server) { await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); return `http://127.0.0.1:${(server.address() as { port: number }).port}`; }
  const adminUrl = await listen(admin), clientUrl = await listen(client);
  let adminToken = '';
  t.after(async () => { await core.close(); await Promise.all([admin, client].map(server => new Promise<void>(resolve => server.close(() => resolve())))); core.store.close(); await rm(root, { recursive: true, force: true }); });
  async function api(base: string, route: string, method = 'GET', payload?: unknown, status = 200) {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', 'X-Smart-Token': 'account-acceptance', ...(base === adminUrl && adminToken ? { 'X-Mixlab-Admin-Session-Token': adminToken } : {}) }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
    const value = await response.json(); assert.equal(response.status, status, `${route}: ${JSON.stringify(value)}`); return value;
  }
  assert.equal((await api(clientUrl, '/smart/library/check', 'POST', {})).status, 'not_configured');
  await api(clientUrl, '/smart/settings', 'PUT', { library_root: path.join(root, 'not-mounted') });
  assert.equal((await api(clientUrl, '/smart/library/check', 'POST', {})).status, 'unavailable');
  await api(clientUrl, '/smart/settings', 'PUT', { library_root: library });
  const connection = await api(clientUrl, '/smart/library/check', 'POST', {});
  assert.equal(connection.status, 'published'); assert.equal(connection.count, 1);
  await api(clientUrl, '/cutter/source-library', 'GET', undefined, 401);
  const password = 'MixLabMacTest12345', username = 'mac-reviewed-account';
  const user = await api(clientUrl, '/smart/auth/register', 'POST', { username, password }, 201);
  await api(clientUrl, '/smart/auth/login', 'POST', { username, password }, 401);
  await api(adminUrl, `/api/admin/cutter-users/${user.user_id}/approve`, 'POST', {}, 401);
  const administrator = await api(adminUrl, '/api/admin/auth/register', 'POST', { username: 'acceptance-admin', password: 'MixLabAdminTest12345' }, 201);
  adminToken = administrator.data.session.session_token;
  await api(adminUrl, `/api/admin/cutter-users/${user.user_id}/approve`, 'POST', {});
  await api(clientUrl, '/smart/auth/login', 'POST', { username, password });
  assert.equal((await core.authStatus()).user?.tier, 'ordinary');
  await api(clientUrl, '/smart/works', 'POST', { script: '现金流是企业的血液。' }, 403);
  const upgraded = await api(adminUrl, `/api/admin/cutter-users/${user.user_id}/tier`, 'POST', { tier: 'pro' });
  assert.equal(upgraded.ok, true); assert.equal(upgraded.data.tier, 'pro');
  await api(clientUrl, '/smart/works', 'POST', { script: '现金流是企业的血液。' }, 201);
  await api(adminUrl, `/api/admin/cutter-users/${user.user_id}/tier`, 'POST', { tier: 'ordinary' });
  await api(clientUrl, '/smart/works', 'POST', { script: '现金流是企业的血液。' }, 403);
  assert.equal((await core.state()).works.length, 0);
  const newPassword = 'MixLabMacReset12345';
  await api(adminUrl, `/api/admin/cutter-users/${user.user_id}/password`, 'POST', { new_password: newPassword });
  await api(clientUrl, '/cutter/source-library', 'GET', undefined, 401);
  await api(clientUrl, '/smart/auth/login', 'POST', { username, password }, 401);
  await api(clientUrl, '/smart/auth/login', 'POST', { username, password: newPassword });
  await api(adminUrl, `/api/admin/cutter-users/${user.user_id}/disable`, 'POST', {});
  await api(clientUrl, '/cutter/source-library', 'GET', undefined, 401);
  await api(clientUrl, '/smart/auth/login', 'POST', { username, password: newPassword }, 401);
});

test('blocked volume reads return a connection timeout and recover without another blocking open', { timeout: 30000, skip: process.platform === 'win32' }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mixlab-volume-timeout-'));
  const library = await createAcceptanceLibrary(path.join(root, 'PublicLibrary'));
  const core = new SmartCore({ state_root: path.join(root, 'state'), workspace_root: path.join(root, 'workspace'), ai: { python: 'missing-test-runtime', script: '', models: '' } });
  await core.initialize(); await core.updateSettings({ library_root: library });
  t.after(async () => { await core.close(); core.store.close(); await rm(root, { recursive: true, force: true }); });
  const pointer = path.join(library, '.mixlab-library/current-release.json');
  const value = await readFile(pointer, 'utf8');
  await rename(pointer, pointer + '.original');
  await runProcess('/usr/bin/mkfifo', [pointer]);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const blocked = core.checkLibrary();
  t.mock.timers.tick(10000);
  assert.equal((await blocked).status, 'unavailable');
  assert.match(core.libraryConnection.message, /超时/);
  const recovery = core.checkLibrary();
  await writeFile(pointer, value);
  assert.equal((await recovery).status, 'published');
});

test('Mac rejects a mounted network workspace before creating its directory', { timeout: 30000, skip: process.platform !== 'darwin' }, async t => {
  const mounts = await runProcess('/sbin/mount', []);
  const networkRoot = mounts.split('\n').map(line => / on (.+) \((?:smbfs|nfs|afpfs|webdav)(?:,|\))/.exec(line)?.[1]).find(Boolean);
  if (!networkRoot) { t.skip('no mounted network volume'); return; }
  const root = await mkdtemp(path.join(os.tmpdir(), 'mixlab-local-workspace-'));
  const core = new SmartCore({ state_root: path.join(root, 'state'), workspace_root: path.join(root, 'workspace'), ai: { python: 'missing-test-runtime', script: '', models: '' } });
  await core.initialize();
  t.after(async () => { await core.close(); core.store.close(); await rm(root, { recursive: true, force: true }); });
  const before = core.settings.workspace_root;
  await assert.rejects(core.updateSettings({ workspace_root: path.join(networkRoot, 'mixlab-must-not-create-' + path.basename(root)) }), /NAS|网络卷宗/);
  assert.equal(core.settings.workspace_root, before);
});
