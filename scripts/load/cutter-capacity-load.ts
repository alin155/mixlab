/**
 * 0.19 发布门禁压测 harness：50 并发搜索 + 50 剪切排队，记录 search p95 / slot / 队列 / 租约泄漏 / CPU / 内存。
 *
 * 用法（本地/QA，自建临时库，不碰真实 NAS）：
 *   node --import tsx scripts/load/cutter-capacity-load.ts --clients=50 --search-ms=15000 --cut-jobs=50
 * 产出：stdout JSON + 可选 --report 路径写 markdown/JSON。
 *
 * 真实 0.19 发布门禁：需在 Windows 构建机上对真实 NAS 公共库执行 10 分钟版本（--search-ms=600000），
 * 并由测试负责人签字；本脚本只提供可重复的测量，不代替真实环境验收。
 */
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { createCutterApiServer } from "../../packages/cutter-api/src/index.ts";
import {
  approveCutterUser,
  claimNextPreprocessJob,
  completePreprocessArtifacts,
  createCutterLoginApplication,
  publishReadySourceVideo,
  scanSourceVideos
} from "../../packages/library-fs/src/index.ts";

function argValue(name: string, fallback: number): number {
  const match = process.argv.find((value) => value.startsWith("--" + name + "="));
  const parsed = match ? Number.parseInt(match.split("=")[1] ?? "", 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function argString(name: string): string | undefined {
  const match = process.argv.find((value) => value.startsWith("--" + name + "="));
  return match ? match.split("=").slice(1).join("=") : undefined;
}
function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)]!;
}
function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }

const CLIENTS = argValue("clients", 50);
const SEARCH_MS = argValue("search-ms", 15_000);
const CUT_JOBS = argValue("cut-jobs", 50);
const CUT_MS = argValue("cut-ms", 120);
const SLOTS = argValue("slots", 2);
const REPORT = argString("report");

async function prepareLibrary(): Promise<string> {
  const libraryRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-load-library-"));
  await mkdir(path.join(libraryRoot, "source-videos"), { recursive: true });
  await writeFile(path.join(libraryRoot, "source-videos", "01_现金流.mp4"), "dummy-video-bytes");
  await scanSourceVideos({ library_root: libraryRoot, library_id: "lib_main_001", library_name: "主素材库", now: "2026-05-02T00:00:00Z" });
  const job = await claimNextPreprocessJob({ library_root: libraryRoot, worker_id: "load", now: "2026-05-02T00:01:00Z" });
  if (!job) throw new Error("no preprocess job");
  const videoDir = path.join(libraryRoot, ".mixlab-library", "videos", job.source_video_id);
  await mkdir(videoDir, { recursive: true });
  const text = "现金流，是企业的血液。";
  await writeFile(path.join(videoDir, "transcript.json"), JSON.stringify({
    schema_version: "1.0", source_video_id: job.source_video_id, provider: "dashscope", model: "paraformer-v2",
    generated_at: "2026-05-02T00:00:00Z", duration_ms: 12_000, full_text: text,
    segments: [{ segment_id: job.source_video_id + "-S000001", index: 0, begin_ms: 1000, end_ms: 3600, begin_char: 0, end_char: text.length, normalized_begin_char: 0, normalized_end_char: text.length, text, normalized_text: "现金流是企业的血液", confidence: 0.96 }]
  }) + "\n");
  await writeFile(path.join(videoDir, "subtitles.srt"), "1\n00:00:01,000 --> 00:00:03,600\n现金流\n");
  await writeFile(path.join(videoDir, "keyframes.json"), JSON.stringify({ schema_version: "1.0", keyframes_ms: [0, 5000, 10000] }));
  await writeFile(path.join(videoDir, "cover.jpg"), "cover-bytes");
  await completePreprocessArtifacts({
    library_root: libraryRoot, source_video_id: job.source_video_id, now: "2026-05-02T00:10:00Z",
    media: { duration_ms: 12_000, width: 1920, height: 1080, fps: 29.97, codec: "h264", content_hash: "sha256:" + job.source_video_id },
    artifacts: {
      transcript_path: ".mixlab-library/videos/" + job.source_video_id + "/transcript.json",
      srt_path: ".mixlab-library/videos/" + job.source_video_id + "/subtitles.srt",
      keyframes_path: ".mixlab-library/videos/" + job.source_video_id + "/keyframes.json",
      cover_path: ".mixlab-library/videos/" + job.source_video_id + "/cover.jpg"
    }
  });
  await publishReadySourceVideo({ library_root: libraryRoot, source_video_id: job.source_video_id, index_version: "v000001", now: "2026-05-02T00:15:00Z" });
  return libraryRoot;
}

async function main(): Promise<void> {
  const libraryRoot = await prepareLibrary();
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-load-workspace-"));
  const app = await createCutterLoginApplication(libraryRoot, { username: "load-cutter", device_id: "load-device", device_name: "Load Device", now: "2026-05-02T09:00:00Z" });
  const approved = await approveCutterUser(libraryRoot, { user_id: app.user_id, now: "2026-05-02T09:01:00Z" });
  const headers = { "X-MixLab-Device-Id": approved.session.device_id, "X-MixLab-Session-Token": approved.session.session_token, "Content-Type": "application/json" };
  let activeCuts = 0;
  let maxActiveCuts = 0;
  const server = createCutterApiServer({
    library_root: libraryRoot,
    workspace_root: workspaceRoot,
    auto_run_cut_queue: true,
    cut_capacity: { max_concurrent_jobs: SLOTS, max_jobs_per_user: CLIENTS },
    source_duration_probe: async () => ({ duration_ms: 4_000 }),
    cut_runner: async (input) => {
      activeCuts += 1; maxActiveCuts = Math.max(maxActiveCuts, activeCuts);
      try { await mkdir(path.dirname(input.output_path), { recursive: true }); await writeFile(input.output_path, "load-bytes"); await sleep(CUT_MS); }
      finally { activeCuts -= 1; }
    },
    cover_runner: async (input) => { await writeFile(input.output_path, "cover-bytes"); }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  const startedAt = Date.now();
  const cpuStart = process.cpuUsage();
  const memStart = process.memoryUsage().rss;

  try {
    const clipListResponse = await fetch(baseUrl + "/cutter/clip-lists", {
      method: "POST", headers,
      body: JSON.stringify({ library_id: "lib_main_001", project_id: "P-LOAD", title: "并发压测", items: Array.from({ length: CUT_JOBS }, () => ({
        source_video_id: "V000001", source_title: "01_现金流.mp4", source_relative_path: "source-videos/01_现金流.mp4",
        start_segment_id: "V000001-S000001", end_segment_id: "V000001-S000001", begin_ms: 1000, end_ms: 2000,
        selected_text: "现金流，是企业的血液。", cut_mode: "smart"
      })) })
    });
    if (clipListResponse.status !== 201) throw new Error("clip list failed: " + clipListResponse.status);
    const clipList = (await clipListResponse.json() as any).data;
    const submitResponse = await fetch(baseUrl + "/cutter/cut-jobs", { method: "POST", headers, body: JSON.stringify({ clip_list_id: clipList.clip_list_id }) });
    if (submitResponse.status !== 201) throw new Error("cut submit failed: " + submitResponse.status);

    const latencies: number[] = [];
    const errors: string[] = [];
    let maxQueueDepth = 0;
    let maxActiveSlots = 0;
    const searchDeadline = Date.now() + SEARCH_MS;
    const stopPolling = new Promise<void>((resolve) => {
      void (async () => {
        while (Date.now() < searchDeadline) {
          try {
            const statusResponse = await fetch(baseUrl + "/cutter/cut-queue/status", { headers });
            if (statusResponse.status === 200) {
              const status = (await statusResponse.json() as any).data;
              maxQueueDepth = Math.max(maxQueueDepth, status.queued_jobs ?? 0);
              maxActiveSlots = Math.max(maxActiveSlots, status.capacity?.active_slots ?? 0);
            }
          } catch { /* polling best-effort */ }
          await sleep(100);
        }
        resolve();
      })();
    });
    const searchWorkers = Array.from({ length: CLIENTS }, async () => {
      while (Date.now() < searchDeadline) {
        const requestStarted = Date.now();
        try {
          const response = await fetch(baseUrl + "/cutter/source-search?query=" + encodeURIComponent("现金流") + "&limit=5", { headers });
          if (response.status !== 200) errors.push("http_" + response.status);
          await response.arrayBuffer();
          latencies.push(Date.now() - requestStarted);
        } catch (error) { errors.push(String(error)); }
      }
    });
    await Promise.all([...searchWorkers, stopPolling]);

    let finished = false;
    let jobsTotal = 0, jobsDone = 0, jobsFailed = 0;
    for (let attempt = 0; attempt < 600 && !finished; attempt += 1) {
      const jobsResponse = await fetch(baseUrl + "/cutter/cut-jobs?limit=200", { headers });
      if (jobsResponse.status === 200) {
        const data = (await jobsResponse.json() as any).data;
        jobsTotal = data.total ?? data.jobs?.length ?? 0;
        jobsDone = (data.jobs ?? []).filter((job: any) => job.status === "done").length;
        jobsFailed = (data.jobs ?? []).filter((job: any) => job.status === "failed").length;
        finished = jobsTotal >= CUT_JOBS && jobsDone + jobsFailed >= CUT_JOBS;
      }
      if (!finished) await sleep(100);
    }
    const leaseResponse = await fetch(baseUrl + "/cutter/cut-queue/status", { headers });
    const finalStatus = (await leaseResponse.json() as any).data;
    const cpu = process.cpuUsage(cpuStart);
    const wallMs = Date.now() - startedAt;
    const report = {
      generated_at: new Date().toISOString(),
      environment: { platform: process.platform, arch: process.arch, node: process.version, clients: CLIENTS, slots: SLOTS, cut_jobs: CUT_JOBS, cut_duration_ms: CUT_MS, search_duration_ms: SEARCH_MS },
      search: { requests: latencies.length, errors: errors.length, error_samples: errors.slice(0, 5), p50_ms: percentile(latencies, 0.5), p95_ms: percentile(latencies, 0.95), p99_ms: percentile(latencies, 0.99), target_p95_ms: 150, p95_pass: latencies.length > 0 && percentile(latencies, 0.95) < 150 && errors.length === 0 },
      cuts: { submitted: CUT_JOBS, done: jobsDone, failed: jobsFailed, max_concurrent_slots_observed: maxActiveCuts, configured_slots: SLOTS, max_queue_depth_observed: maxQueueDepth, max_active_slots_observed: maxActiveSlots, final_active_slots: finalStatus?.capacity?.active_slots ?? -1, lease_leak: (finalStatus?.capacity?.active_slots ?? 1) !== 0, final_queued_jobs: finalStatus?.queued_jobs ?? -1 },
      resources: { wall_ms: wallMs, cpu_user_ms: Math.round(cpu.user / 1000), cpu_system_ms: Math.round(cpu.system / 1000), rss_start_mb: Math.round(memStart / 1024 / 1024), rss_end_mb: Math.round(process.memoryUsage().rss / 1024 / 1024) },
      gate: { local_smoke_pass: false, release_gate: "0.19 发布门禁未通过：需 Windows 构建机 + 真实 NAS 10 分钟 50 客户端压测报告并签字；0.18.34 不发布" }
    };
    report.gate.local_smoke_pass = report.search.p95_pass && report.cuts.done === CUT_JOBS && report.cuts.failed === 0 && !report.cuts.lease_leak && report.cuts.max_concurrent_slots_observed <= SLOTS;
    const markdown = [
      "# 0.19 并发容量压测（本地 smoke：" + report.generated_at + "）",
      "",
      "- 环境：" + JSON.stringify(report.environment),
      "- 搜索：" + report.search.requests + " 次，p50 " + report.search.p50_ms + "ms / p95 " + report.search.p95_ms + "ms / p99 " + report.search.p99_ms + "ms，错误 " + report.search.errors + "（目标 p95<150ms）",
      "- 剪切：" + report.cuts.done + "/" + report.cuts.submitted + " 完成，失败 " + report.cuts.failed + "；观测最大并发 slot " + report.cuts.max_concurrent_slots_observed + "/" + SLOTS + "，最大排队 " + report.cuts.max_queue_depth_observed + "，结束 active_slots " + report.cuts.final_active_slots + "（无泄漏=" + !report.cuts.lease_leak + "）",
      "- 资源：wall " + report.resources.wall_ms + "ms，CPU user " + report.resources.cpu_user_ms + "ms / sys " + report.resources.cpu_system_ms + "ms，RSS " + report.resources.rss_start_mb + "->" + report.resources.rss_end_mb + "MB",
      "- 本地 smoke：**" + (report.gate.local_smoke_pass ? "PASS" : "FAIL") + "**",
      "- 发布门禁：**BLOCKED** —— " + report.gate.release_gate,
      "",
      "> 真实门禁命令：node --import tsx scripts/load/cutter-capacity-load.ts --clients=50 --search-ms=600000 --cut-jobs=50 --report=<报告路径>（Windows + 真实 NAS，需 0 错误、搜索 p95<150ms、无租约泄漏、searchd 不进入重启循环）。"
    ].join("\n");
    console.log(JSON.stringify(report, null, 2));
    if (REPORT) {
      await mkdir(path.dirname(REPORT), { recursive: true });
      await writeFile(REPORT.replace(/\.json$/, "") + ".json", JSON.stringify(report, null, 2));
      await writeFile(REPORT.replace(/\.json$/, "") + ".md", markdown + "\n");
      console.log("report written to " + REPORT);
    }
    if (!report.gate.local_smoke_pass) process.exitCode = 1;
  } finally {
    (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
