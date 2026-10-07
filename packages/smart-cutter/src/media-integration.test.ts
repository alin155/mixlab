import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SmartCore } from "./core.ts";
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
  const work = core.createWork(input);
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
