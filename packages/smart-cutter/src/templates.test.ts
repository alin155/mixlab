import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { SYSTEM_TEMPLATES, captionLayout, validateTemplate } from "./templates.ts";
import { captionsToAss } from "./media.ts";
import { DEFAULT_OUTPUT, SmartError, type Job } from "./types.ts";
import { SmartCore } from "./core.ts";
import { createSmartServer } from "./http.ts";
import { createAcceptanceLibrary } from "../../../scripts/smart-cutter/fixture.ts";

test("subtitle layout preserves real intervals, escapes ASS and fits long sentences without fabricated word timing", () => {
  const template = { ...SYSTEM_TEMPLATES[2]!, keywords: ["原声"] };
  const sentence = "这一段原声包含较长的句子，必须保留真实文字和已有时间戳。";
  const layout = captionLayout(sentence, template, "9:16");
  assert.ok(layout.lines.length <= 2);
  assert.equal(layout.lines.join(""), sentence);
  const ass = captionsToAss([{ begin_ms: 235, end_ms: 6175, text: sentence }, { begin_ms: 6800, end_ms: 7990, text: "原声{\\pos(0,0)}" }], { ...DEFAULT_OUTPUT, subtitle_template: template }, "unused");
  assert.equal((ass.match(/^Dialogue:/gm) ?? []).length, 2);
  assert.ok(ass.includes("0:00:00.23,0:00:06.17"));
  assert.ok(ass.includes("0:00:06.80,0:00:07.99"));
  assert.ok(ass.includes("\\c&H6ae0ff&"));
  assert.ok(!ass.includes("{\\pos"));
  for (const override of [{ font: "unbundled" }, { color: "#fff,{\\pos(1,2)}" }, { keywords: ["{\\an8}"] }, { size: 101 }, { max_lines: 5 }]) assert.throws(() => validateTemplate({ ...template, ...override }));
});

test("four real template previews reuse selected footage, preserve work/history, enforce access and export immutable recipes", { timeout: 120_000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mixlab-templates-"));
  const library = await createAcceptanceLibrary(path.join(root, "library"));
  const core = new SmartCore({ state_root: path.join(root, "state"), workspace_root: path.join(root, "workspace"), auth_mode: "local_trusted", ai: { python: "unused", script: "", models: "" } });
  await core.initialize(); await core.updateSettings({ library_root: library });
  const server = createSmartServer(core, "template-fixture"); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await core.close(); core.store.close(); await rm(root, { recursive: true, force: true }); });
  const work = core.createWork("现金流是企业的血液。把事情做对，再把规模做大。", undefined, "验收讲师");
  await core.generatePlan(work.id);
  core.updateWork(work.id, { settings: { crop_mode: "fit", subtitle_template: null } });
  async function complete(job: Job): Promise<Job> {
    const deadline = Date.now() + 45_000;
    while (["queued", "running"].includes(job.status) && Date.now() < deadline) { await new Promise(resolve => setTimeout(resolve, 100)); job = core.store.get<Job>("job", job.id)!; }
    assert.equal(job.status, "done", job.error); return job;
  }
  const old = await complete(core.enqueue(work.id)), oldManifest = await readFile(old.manifest_path, "utf8");
  const source = core.work(work.id).segments[0]!.selected!.source_file_path;
  await rename(source, source + ".offline");
  const before = JSON.stringify(core.work(work.id)), jobs = core.store.count("job");
  t.mock.method(core.library, "plan", async () => { throw new Error("preview must not re-match/index"); });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`, headers = { "X-Smart-Token": "template-fixture", "Content-Type": "application/json" };
  const images: Buffer[] = [];
  for (const preset of SYSTEM_TEMPLATES) {
    const template = { ...preset, keywords: preset.id === "emphasis" ? ["现金流"] : [] };
    const response = await fetch(`${base}/smart/works/${work.id}/template-preview`, { method: "POST", headers, body: JSON.stringify({ settings: { subtitle_template: template, subtitle_size: template.size, subtitle_margin: template.bottom } }) });
    assert.equal(response.status, 200, await response.clone().text());
    const preview = await response.json() as { id: string; duration_ms: number };
    assert.ok(preview.duration_ms > 3300 && preview.duration_ms <= 8100);
    assert.equal((await fetch(`${base}/smart/media/template-previews/${preview.id}`)).status, 401);
    const media = await fetch(`${base}/smart/media/template-previews/${preview.id}`, { headers: { ...headers, Range: "bytes=0-127" } });
    assert.equal(media.status, 206); assert.equal((await media.arrayBuffer()).byteLength, 128);
    const saved = core.templatePreviews.get(preview.id)!;
    const pixels = spawnSync(core.media.ffmpeg.ffmpeg_path, ["-v", "error", "-ss", "0.7", "-i", saved.file, "-vf", "scale=270:480,format=rgb24", "-frames:v", "1", "-f", "rawvideo", "pipe:1"]);
    assert.equal(pixels.status, 0, pixels.stderr.toString()); images.push(pixels.stdout);
    const info = await core.media.probe(saved.file); assert.equal(info.audio, true); assert.equal(info.height, 1920);
  }
  for (let i = 0; i < images.length; i++) for (let j = i + 1; j < images.length; j++) assert.notDeepEqual(images[i], images[j], "presets must render different visible pixels");
  let measurements = 0;
  t.mock.method(core.media, "analyze", async () => { measurements++; return { usable: true, reason: "", multiple_faces: false, source_aspect: 16 / 9, points: [{ at_ms: 0, x: 0.5, y: 0.4, height: 0.15, confidence: 1 }] }; });
  for (const template of SYSTEM_TEMPLATES.slice(0, 2)) await core.previewTemplate(work.id, { settings: { crop_mode: "portrait", subtitle_template: template } });
  assert.equal(measurements, 2, "switching templates must reuse both measured shots, even with the public source offline");
  assert.equal(JSON.stringify(core.work(work.id)), before);
  assert.equal(core.store.count("job"), jobs);
  assert.equal(await readFile(old.manifest_path, "utf8"), oldManifest);
  const saved = core.saveSubtitleTemplate({ name: "团队访谈", settings: { ...core.work(work.id).settings, subtitle_template: SYSTEM_TEMPLATES[0], subtitle_size: 66 } });
  assert.equal(saved.size, 66);
  core.updateWork(work.id, { settings: { subtitle_template: saved, subtitle_size: saved.size, subtitle_margin: saved.bottom } });
  const exported = await complete(core.enqueue(work.id));
  const manifest = JSON.parse(await readFile(exported.manifest_path, "utf8"));
  assert.equal(manifest.subtitle_template.id, saved.id); assert.equal(manifest.subtitle_template.size, 66); assert.equal(manifest.subtitle_template.font, "Noto Serif SC");
  core.store.set("subtitle-template", { ...saved, size: 90, version: 2 });
  assert.equal(JSON.parse(await readFile(exported.manifest_path, "utf8")).subtitle_template.size, 66);
  t.mock.method(core, "requirePro", async () => { throw new SmartError("pro_required", "Pro required", 403); });
  assert.equal((await fetch(`${base}/smart/subtitle-templates`, { headers })).status, 403);
  assert.equal((await fetch(`${base}/smart/works/${work.id}/template-preview`, { method: "POST", headers, body: "{}" })).status, 403);
});
