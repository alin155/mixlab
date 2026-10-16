import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { createAcceptanceLibrary } from "../../../scripts/smart-cutter/fixture.ts";
import { SmartCore } from "./core.ts";
import { createSmartServer } from "./http.ts";
import { runProcess } from "./process.ts";
import { SmartError, DEFAULT_OUTPUT, type Job, type Candidate } from "./types.ts";
import { captionsToAss } from "./media.ts";
import { SUBTITLE_STYLES } from "./presentation.ts";
import { resolveFfmpegRuntime } from "../../ffmpeg-core/src/index.ts";

test("consistent shots render equal face height; historical provenance plays cached originals with access checks", { timeout: 120_000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mixlab-quality-"));
  const library = await createAcceptanceLibrary(path.join(root, "library"));
  const core = new SmartCore({ state_root: path.join(root, "state"), workspace_root: path.join(root, "workspace"), auth_mode: "local_trusted", ai: { python: "unused-geometry-fixture", script: "", models: "" } });
  await core.initialize();
  const server = createSmartServer(core, "quality-fixture"); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await core.close(); core.store.close(); await rm(root, { recursive: true, force: true }); });
  await core.updateSettings({ library_root: library });
  const work = core.createWork("现金流是企业的血液。把事情做对，再把规模做大。", { trigger: "manual", kind: "hot_manual", hot_id: "douyin:reference" }, "验收讲师");
  await core.generatePlan(work.id);
  const source = core.work(work.id).segments[0]!.selected!.source_file_path;
  // Known rectangles isolate the geometry from detector quality. Each shot starts at a different distance.
  await runProcess(core.media.ffmpeg.ffmpeg_path, ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=navy:size=640x360:rate=30", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "4", "-vf", "drawbox=x=288:y=126:w=64:h=36:color=white:t=fill:enable='lt(t,2)',drawbox=x=256:y=108:w=128:h=72:color=white:t=fill:enable='gte(t,2)'", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", source]);
  const info = await stat(source);
  const current = core.work(work.id);
  for (const segment of current.segments) {
    segment.selected!.fingerprint = { size: info.size, mtime_ms: info.mtimeMs }; delete segment.selected!.content_hash;
  }
  core.store.set("work", current);
  core.updateWork(work.id, { settings: { crop_mode: "portrait", subtitles: false, shot_size: "medium" } });
  t.mock.method(core.media, "analyze", async (candidate: Candidate) => ({ usable: true, reason: "", multiple_faces: false, source_aspect: 640 / 360,
    points: [0, 1000].map(at_ms => ({ at_ms, x: 0.5, y: 0.4, height: candidate.begin_ms < 2000 ? 0.1 : 0.2, confidence: 1 })) }));
  const submitted = core.enqueue(work.id); let job: Job = submitted;
  const deadline = Date.now() + 60_000;
  while (["queued", "running"].includes(job.status) && Date.now() < deadline) { await new Promise(resolve => setTimeout(resolve, 100)); job = core.store.get<Job>("job", submitted.id)!; }
  assert.equal(job.status, "done", job.error);
  const heights = [];
  for (const name of job.completed_clips) {
    const result = spawnSync(core.media.ffmpeg.ffmpeg_path, ["-v", "error", "-ss", "0.5", "-i", path.join(job.workspace_root, "cache/jobs", job.id, name), "-vf", "scale=108:192,format=rgb24", "-frames:v", "1", "-f", "rawvideo", "pipe:1"]);
    assert.equal(result.status, 0, result.stderr.toString());
    let height = 0;
    for (let y = 0; y < 192; y++) { const offset = (y * 108 + 54) * 3; if (result.stdout[offset]! > 220 && result.stdout[offset + 1]! > 220 && result.stdout[offset + 2]! > 220) height++; }
    heights.push(height);
  }
  assert.ok(heights.every(height => Math.abs(height - 192 * 0.24) <= 2), `rendered face sizes: ${heights}`);
  const originalManifest = await readFile(job.manifest_path, "utf8");
  core.store.set("hot", { id: "douyin:reference", title: "关联参考原视频", status: "ready", error: "" });
  t.mock.method(core.references, "videoPath", async () => job.output_path);
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`, headers = { "X-Smart-Token": "quality-fixture" };
  const route = `/smart/jobs/${job.id}/sources`;
  assert.equal((await fetch(base + route)).status, 401);
  const response = await fetch(base + route, { headers }); assert.equal(response.status, 200);
  const data = await response.json() as any;
  assert.equal(data.sources.length, 2); assert.equal(data.sources[1].output_begin_ms, JSON.parse(originalManifest).sources[1].output_begin_ms);
  assert.equal(data.reference.id, "douyin:reference"); assert.equal(data.reference.available, true);
  assert.ok(!JSON.stringify(data).includes("source_file_path"));
  await rename(source, source + ".offline");
  const preview = await fetch(base + `/smart/media/jobs/${job.id}/sources/1/preview`, { headers: { ...headers, Range: "bytes=0-127" } });
  assert.equal(preview.status, 206); assert.equal((await preview.arrayBuffer()).byteLength, 128);
  assert.equal((await fetch(base + `/smart/media/jobs/${job.id}/sources/999/preview`, { headers })).status, 404);
  assert.equal((await fetch(base + `/smart/media/jobs/${job.id}/sources/1/open`, { method: "POST", headers })).status, 409);
  assert.equal(await readFile(job.manifest_path, "utf8"), originalManifest, "historical provenance must not be rewritten");
  t.mock.method(core, "requirePro", async () => { throw new SmartError("pro_required", "Pro required", 403); });
  assert.equal((await fetch(base + route, { headers })).status, 403);
});

test("all subtitle templates render visible distinct pixels at the saved vertical position", { timeout: 60_000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mixlab-subtitle-styles-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fonts = path.resolve("apps/smart-cutter-desktop/src-tauri/runtime/fonts").replaceAll("\\", "/").replaceAll(":", "\\:");
  const hashes = new Set<string>();
  for (const style of Object.keys(SUBTITLE_STYLES) as Array<keyof typeof SUBTITLE_STYLES>) {
    await writeFile(path.join(root, "subtitle.ass"), captionsToAss([{ begin_ms: 0, end_ms: 1000, text: "原声字幕效果" }], { ...DEFAULT_OUTPUT, subtitle_template: undefined, subtitle_style: style, subtitle_size: 72, subtitle_margin: 0.2 }, "Noto Sans SC"));
    const result = spawnSync(resolveFfmpegRuntime().ffmpeg_path, ["-v", "error", "-f", "lavfi", "-i", "color=c=navy:s=1080x1920:r=30:d=1", "-ss", "0.5", "-vf", `ass=filename='subtitle.ass':fontsdir='${fonts}',scale=270:480,format=rgb24`, "-frames:v", "1", "-f", "rawvideo", "pipe:1"], { cwd: root });
    assert.equal(result.status, 0, result.stderr.toString());
    const pixels = result.stdout, rows: number[] = [];
    for (let y = 0; y < 480; y++) for (let x = 0; x < 270; x++) {
      const offset = (y * 270 + x) * 3;
      if (pixels[offset]! > 150 && pixels[offset + 1]! > 150) rows.push(y);
    }
    assert.ok(rows.length > 100, `${style} has visible text`);
    assert.ok(Math.max(...rows) <= 387 && Math.min(...rows) > 320, `${style} obeys the configured bottom margin`);
    hashes.add(pixels.toString("base64"));
  }
  assert.equal(hashes.size, Object.keys(SUBTITLE_STYLES).length, "templates must produce different rendered appearances");
});
