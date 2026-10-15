import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UnifiedSettings } from '../../../apps/smart-cutter-web/src/Settings.tsx';

test('TikHub connection action supports unsaved input, saved keys and in-flight requests', () => {
  type Props = Parameters<typeof UnifiedSettings>[0];
  for (const scenario of [
    { key: '', saved: false, busy: false, label: '测试连接', disabled: true },
    { key: '  fixture-key  ', saved: false, busy: false, label: '保存并测试', disabled: false },
    { key: '', saved: true, busy: false, label: '测试连接', disabled: false },
    { key: 'fixture-key', saved: false, busy: true, label: '保存并测试', disabled: true },
  ]) {
    const settings = { library_root: '', workspace_root: '/fixture', monitor_platform: 'douyin', monitor_interval_minutes: 30, request_limit_per_day: 500, reference_cache_gb: 30, max_download_mb: 500, asr_model: 'paraformer-v2', credential_protection: 'fixture', has_tikhub_key: scenario.saved, has_asr_key: false,
      library_connection: { status: 'unchecked', message: '' }, runtime: { ffmpeg_ready: true, library_ready: false, ai_ready: true, semantic: { running: false } } } as Props['prefs'];
    const props: Props = { state: { settings, auth: { user: { username: 'fixture' } } } as Props['state'], prefs: settings, setPrefs: () => {}, pro: true, busy: scenario.busy, authenticated: true, tikhubKey: scenario.key, setTikhubKey: () => {}, asrKey: '', setAsrKey: () => {}, save: async () => {}, choose: async () => {}, act: async operation => operation(), login: null, onCache: () => {} };
    const html = renderToStaticMarkup(createElement(UnifiedSettings, props));
    const button = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(match => match[2]!.includes(scenario.label));
    assert.ok(button, scenario.label);
    assert.equal(/\bdisabled(?:=|\s|$)/.test(button[1]!), scenario.disabled, scenario.label);
    if (scenario.key.trim()) assert.ok(html.includes('当前 Key 尚未保存'));
  }
});
