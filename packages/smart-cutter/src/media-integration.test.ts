import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SmartCore } from "./core.ts";
import { SmartError } from "./types.ts";
import { createSmartServer } from "./http.ts";
import { captionsToSrt, fileDigest } from "./media.ts";
import type { Job } from "./types.ts";
import { createAcceptanceLibrary } from "../../../scripts/smart-cutter/fixture.ts";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ai = { python: process.env.MIXLAB_SMART_PYTHON || path.join(repo, "apps/smart-cutter-desktop/src-tauri/runtime/python", process.platform === "win32" ? "python.exe" : "bin/python"),
  script: path.join(repo, "scripts/smart-cutter/ai-worker.py"), models: path.join(repo, "apps/smart-cutter-desktop/src-tauri/runtime/models") };
async function completed(core: SmartCore, id: string): Promise<Job> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const job = core.store.get<Job>("job", id)!;
    if (!["queued", "running"].includes(job.status)) return job;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error("real media test timed out");
}
test("real published source -> immutable plan -> playable MP4/SRT/provenance, with no public writes", { timeout: 180_000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "智能剪辑 真实媒体验收-"));
  const library = await createAcceptanceLibrary(path.join(root, "PublicLibrary"));
  const pointer = path.join(library, ".mixlab-library", "current-release.json");
  const before = await readFile(pointer, "utf8");
  const core = new SmartCore({ state_root: path.join(root, "private"), workspace_root: path.join(root, "workspace"), ai, auth_mode: "local_trusted" });
  await core.initialize();
  t.after(async () => { await core.close(); core.store.close(); await rm(root, { recursive: true, force: true }); });
  await core.updateSettings({ library_root: library });
  const input = "现金流是企业的血液。把事情做对，再把规模做大。";
  const work = core.createWork(input, undefined, '验收讲师');
  assert.throws(() => core.enqueue(work.id), /审核/);
  await core.generatePlan(work.id);
  const plan = core.work(work.id);
  assert.equal(plan.segments.length, 2);
  assert.ok(plan.segments.every(segment => segment.status === "exact"));
  const originalRange = plan.segments[0]!.selected!;
  assert.equal(originalRange.begin_ms, 0); assert.equal(originalRange.end_ms, 1700);
  assert.throws(() => core.selectSegment(work.id, 1, { revision: plan.revision, candidate_id: "forged-source-path" }), /真实片段/);
  core.updateWork(work.id, { settings: { crop_mode: "fit", subtitles: true } });
  const job = core.enqueue(work.id);
  assert.equal(core.enqueue(work.id).id, job.id, "duplicate submission must reuse the active revision");
  const result = await completed(core, job.id);
  assert.equal(result.status, "done", result.error);
  const media = await core.media.probe(result.output_path);
  assert.equal(media.width, 1080); assert.equal(media.height, 1920); assert.equal(media.audio, true);
  assert.ok(media.duration_ms > 3300 && media.duration_ms < 4000);
  const srt = await readFile(path.join(path.dirname(result.output_path), "subtitles.srt"), "utf8");
  assert.ok(srt.includes("现金流是企业的血液。") && srt.includes("把事情做对，再把规模做大。"));
  const manifest = JSON.parse(await readFile(result.manifest_path, "utf8"));
  assert.equal(manifest.original_input_script, input);
  assert.equal(manifest.origin.trigger, "manual");
  assert.equal(manifest.sources.length, 2);
  assert.equal(manifest.output.sha256, await fileDigest(result.output_path));
  assert.equal(await readFile(pointer, "utf8"), before);
  assert.ok(!JSON.stringify(manifest).includes("credential-key"));
  assert.throws(() => core.controlJob(job.id, "retry"), /当前任务状态/);
  core.updateWork(work.id, { script: "新的文案。" });
  assert.equal(core.work(work.id).original_script, input); assert.equal(core.work(work.id).segments.length, 0);
});
test("loopback API enforces origin/token and never exposes configured credentials", { timeout: 60_000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "smart-http-"));
  const core = new SmartCore({ state_root: path.join(root, "private"), workspace_root: path.join(root, "workspace"), ai, auth_mode: "local_trusted" });
  await core.initialize();
  const server = createSmartServer(core, "fixture-local-access");
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number }; const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await core.close(); await new Promise<void>(resolve => server.close(() => resolve())); core.store.close(); await rm(root, { recursive: true, force: true }); });
  assert.equal((await fetch(`${base}/smart/settings`)).status, 401);
  assert.equal((await fetch(`${base}/smart/settings`, { headers: { Origin: "https://untrusted.example", "X-Smart-Token": "fixture-local-access" } })).status, 403);
  const response = await fetch(`${base}/smart/settings`, { method: "PUT", headers: { "Content-Type": "application/json", "X-Smart-Token": "fixture-local-access" }, body: JSON.stringify({ tikhub_api_key: "fixture-configuration-only", asr_api_key: "fixture-asr-only" }) });
  assert.equal(response.status, 200);
  const returned = await response.text(); assert.ok(!returned.includes("fixture-configuration-only") && !returned.includes("fixture-asr-only"));
  const read = await fetch(`${base}/smart/settings`, { headers: { "X-Smart-Token": "fixture-local-access" } });
  const settings = await read.json() as { has_tikhub_key: boolean; has_asr_key: boolean };
  assert.equal(settings.has_tikhub_key, true); assert.equal(settings.has_asr_key, true);
  const ciphertext = await readFile(path.join(root, "private", "credentials.json"), "utf8"); assert.ok(!ciphertext.includes("fixture-configuration-only"));
  assert.ok(captionsToSrt([{ begin_ms: 0, end_ms: 1500, text: "原声" }]).includes("00:00:01,500"));
});
test('paused render survives application restart and reuses a verified clip checkpoint', { timeout: 120_000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'smart-restart-'));
  const library = await createAcceptanceLibrary(path.join(root, 'library'));
  const options = { state_root: path.join(root, 'state'), workspace_root: path.join(root, 'workspace'), ai, auth_mode: 'local_trusted' as const };
  let core = new SmartCore(options); await core.initialize();
  t.after(async () => { await core.close(); core.store.close(); await rm(root, { recursive: true, force: true }); });
  await core.updateSettings({ library_root: library });
  const work = core.createWork('现金流是企业的血液。把事情做对，再把规模做大。'.repeat(4), undefined, '验收讲师');
  await core.generatePlan(work.id); core.updateWork(work.id, { settings: { crop_mode: 'fit', subtitles: false } });
  const job = core.enqueue(work.id);
  const deadline = Date.now() + 30_000;
  let checkpoint: Job | null = null;
  while (Date.now() < deadline) {
    const value = core.store.get<Job>('job', job.id)!;
    if (value.completed_clips.length) { checkpoint = value; break; }
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.ok(checkpoint); assert.notEqual(checkpoint.status, 'done');
  const clip = path.join(options.workspace_root, 'cache/jobs', job.id, checkpoint.completed_clips[0]!);
  const before = await stat(clip); core.controlJob(job.id, 'pause');
  await core.close(); core.store.close();
  core = new SmartCore(options); await core.initialize();
  assert.equal(core.store.get<Job>('job', job.id)!.status, 'paused');
  core.controlJob(job.id, 'resume');
  const result = await completed(core, job.id); assert.equal(result.status, 'done', result.error);
  assert.equal((await stat(clip)).mtimeMs, before.mtimeMs, 'the completed clip was reused rather than encoded again');
  assert.ok((await core.media.probe(result.output_path)).duration_ms > 13_000);
});

test('NAS retries are bounded, retain finished clips, and resume without reopening their sources', { timeout: 120_000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'smart-nas-recovery-'));
  const library = await createAcceptanceLibrary(path.join(root, 'library'));
  const options = { state_root: path.join(root, 'state'), workspace_root: path.join(root, 'workspace'), ai, auth_mode: 'local_trusted' as const };
  let core = new SmartCore(options); await core.initialize();
  t.after(async () => { await core.close(); core.store.close(); await rm(root, { recursive: true, force: true }); });
  await core.updateSettings({ library_root: library });
  const work = core.createWork('现金流是企业的血液。把事情做对，再把规模做大。', undefined, '验收讲师');
  await core.generatePlan(work.id); core.updateWork(work.id, { settings: { crop_mode: 'fit', subtitles: true } });
  const firstId = core.work(work.id).segments[0]!.selected!.id;
  const secondId = core.work(work.id).segments[1]!.selected!.id;
  const originalInput = core.media.input.bind(core.media); let failedReads = 0;
  core.media.input = async (candidate, ...args) => {
    if (candidate.id === secondId) { failedReads++; throw Object.assign(new Error('NAS close failed'), { code: 'EBADF' }); }
    return originalInput(candidate, ...args);
  };
  const submitted = core.enqueue(work.id); const failed = await completed(core, submitted.id);
  assert.equal(failed.status, 'failed'); assert.equal(failedReads, 4); assert.match(failed.error, /自动重试3次.*保留 1/);
  assert.deepEqual(failed.completed_clips, ['clip-001.mp4']);
  const clip = path.join(options.workspace_root, 'cache/jobs', submitted.id, 'clip-001.mp4');
  const checkpoint = await stat(clip), digest = await fileDigest(clip);
  // Existing users have checkpoints without checksums. Adopt only after probing the saved clip.
  delete failed.clip_checksums; core.store.set('job', failed);
  await core.close(); core.store.close(); core = new SmartCore(options); await core.initialize();
  const restoredInput = core.media.input.bind(core.media); let reconnectReads = 0;
  core.media.input = async (candidate, ...args) => {
    assert.notEqual(candidate.id, firstId, 'a completed clip must not depend on its NAS original during recovery');
    if (++reconnectReads === 1) throw Object.assign(new Error('NAS reconnected, reopen source'), { code: 'ENOTCONN' });
    return restoredInput(candidate, ...args);
  };
  core.controlJob(submitted.id, 'retry'); const result = await completed(core, submitted.id);
  assert.equal(result.status, 'done', result.error); assert.equal(reconnectReads, 2);
  assert.equal((await stat(clip)).mtimeMs, checkpoint.mtimeMs); assert.equal(await fileDigest(clip), digest);
  assert.equal(result.clip_checksums?.['clip-001.mp4'], digest);
  assert.equal((await core.media.probe(result.output_path)).audio, true);
  assert.ok((await readFile(path.join(path.dirname(result.output_path), 'subtitles.srt'), 'utf8')).includes('现金流'));
});

test('changed sources fail immediately and unverified partial caches are never published', { timeout: 60_000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'smart-nas-integrity-'));
  const library = await createAcceptanceLibrary(path.join(root, 'library'));
  const core = new SmartCore({ state_root: path.join(root, 'state'), workspace_root: path.join(root, 'workspace'), ai, auth_mode: 'local_trusted' });
  await core.initialize(); t.after(async () => { await core.close(); core.store.close(); await rm(root, { recursive: true, force: true }); });
  await core.updateSettings({ library_root: library });
  const work = core.createWork('现金流是企业的血液。', undefined, '验收讲师'); await core.generatePlan(work.id);
  const candidate = core.work(work.id).segments[0]!.selected!;
  const cache = path.join(root, 'workspace/cache/source-videos');
  await assert.rejects(core.media.input({ ...candidate, content_hash: 'sha256:' + '0'.repeat(64) }, cache), /内容校验不一致/);
  await assert.rejects(stat(path.join(cache, candidate.id + '.media')), { code: 'ENOENT' });
  await assert.rejects(stat(path.join(cache, candidate.id + '.media.partial')), { code: 'ENOENT' });
  let attempts = 0;
  core.media.input = async () => { attempts++; throw new SmartError('source_changed', '源视频已经变化', 409); };
  const result = await completed(core, core.enqueue(work.id).id);
  assert.equal(result.status, 'failed'); assert.equal(attempts, 1); assert.match(result.error, /源视频已经变化/);
});

test('transient NAS account checks retry while an explicit Pro revocation pauses the render', { timeout: 60_000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'smart-nas-auth-'));
  const library = await createAcceptanceLibrary(path.join(root, 'library'));
  const core = new SmartCore({ state_root: path.join(root, 'state'), workspace_root: path.join(root, 'workspace'), ai, auth_mode: 'local_trusted' });
  await core.initialize(); t.after(async () => { await core.close(); core.store.close(); await rm(root, { recursive: true, force: true }); });
  await core.updateSettings({ library_root: library });
  const work = core.createWork('现金流是企业的血液。', undefined, '验收讲师'); await core.generatePlan(work.id);
  let started!: () => void; const running = new Promise<void>(resolve => { started = resolve; });
  let renderSignal: AbortSignal;
  core.media.render = async (_job, signal) => {
    renderSignal = signal; started();
    await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));
    signal.throwIfAborted();
  };
  const job = core.enqueue(work.id); await running;
  const status = core.authStatus.bind(core); let checks = 0;
  core.authStatus = async () => {
    if (++checks === 1) throw new SmartError('library_unavailable', 'NAS temporarily offline', 503);
    return status();
  };
  const tick = () => (core as unknown as { tick(): Promise<void> }).tick();
  await tick(); assert.equal(core.store.get<Job>('job', job.id)!.status, 'running'); assert.equal(renderSignal!.aborted, false);
  core.authStatus = async () => ({ required: false, user: { user_id: 'local-test', username: 'test', tier: 'ordinary' as const } });
  await tick(); assert.equal(core.store.get<Job>('job', job.id)!.status, 'paused'); assert.equal(renderSignal!.aborted, true);
  assert.equal(core.work(work.id).status, 'ready');
});

test('a damaged saved clip is rebuilt instead of being silently merged', { timeout: 60_000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'smart-checkpoint-integrity-'));
  const library = await createAcceptanceLibrary(path.join(root, 'library'));
  const core = new SmartCore({ state_root: path.join(root, 'state'), workspace_root: path.join(root, 'workspace'), ai, auth_mode: 'local_trusted' });
  await core.initialize(); t.after(async () => { await core.close(); core.store.close(); await rm(root, { recursive: true, force: true }); });
  await core.updateSettings({ library_root: library });
  const work = core.createWork('现金流是企业的血液。把事情做对，再把规模做大。', undefined, '验收讲师'); await core.generatePlan(work.id);
  core.updateWork(work.id, { settings: { crop_mode: 'fit', subtitles: false } });
  const firstId = core.work(work.id).segments[0]!.selected!.id, secondId = core.work(work.id).segments[1]!.selected!.id;
  const input = core.media.input.bind(core.media);
  core.media.input = async (candidate, ...args) => {
    if (candidate.id === secondId) throw new SmartError('source_changed', 'test interruption', 409);
    return input(candidate, ...args);
  };
  const job = await completed(core, core.enqueue(work.id).id); assert.equal(job.status, 'failed');
  const file = path.join(core.settings.workspace_root, 'cache/jobs', job.id, 'clip-001.mp4');
  await writeFile(file, Buffer.concat([await readFile(file), Buffer.from('changed-after-checkpoint')]));
  const damagedHash = await fileDigest(file); let rereadFirst = 0;
  core.media.input = async (candidate, ...args) => { if (candidate.id === firstId) rereadFirst++; return input(candidate, ...args); };
  core.controlJob(job.id, 'retry'); const result = await completed(core, job.id);
  assert.equal(result.status, 'done', result.error); assert.equal(rereadFirst, 1);
  assert.notEqual(result.clip_checksums?.['clip-001.mp4'], damagedHash);
});
