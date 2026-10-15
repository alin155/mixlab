import assert from 'node:assert/strict';
import test from 'node:test';
import { request, ApiError } from '../../../apps/smart-cutter-web/src/api.ts';

test('a stalled client read reports a retryable timeout rather than an invalid account', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new DOMException('read timed out', 'TimeoutError'); });
  await assert.rejects(request('/cutter/source-videos/V000001'), error => error instanceof ApiError && error.code === 'request_timeout' && error.status === 504 && error.message.includes('NAS'));
});

test('client preserves genuine credential errors separately from NAS unavailability', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: { code: 'login_failed', message: '用户名或密码错误' } }), { status: 401 }));
  await assert.rejects(request('/smart/auth/login', 'POST', {}), error => error instanceof ApiError && error.code === 'login_failed' && error.status === 401);
});
