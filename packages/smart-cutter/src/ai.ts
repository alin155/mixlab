import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { runProcess } from "./process.ts";
import { SmartError, type Composition, type MatchPhase } from "./types.ts";
import type { LibrarySnapshot, SemanticSearchResult } from "./library.ts";

export interface AiRuntime { python: string; script: string; models: string }
export class SmartAi {
  private worker: ChildProcessWithoutNullStreams | null = null;
  private queryWorker: ChildProcessWithoutNullStreams | null = null;
  private indexing: Promise<void> | null = null;
  private pending = new Map<string, { child: ChildProcessWithoutNullStreams; resolve: (value: unknown) => void; reject: (error: Error) => void; progress?: (value: { done: number; total: number }) => void }>();
  indexStatus = { running: false, done: 0, total: 0, error: "", snapshot_id: "", phase: "idle", encoded: 0, reused: 0 };
  constructor(readonly runtime: AiRuntime) {}
  async ready(): Promise<boolean> {
    try { const result = await Promise.race([this.request<{ ready: boolean }>({ op: "ping" }), new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error("AI startup timeout")), 15_000); timer.unref(); })]); return result.ready; } catch { this.close(); return false; }
  }
  private launch(query: boolean): ChildProcessWithoutNullStreams {
    const existing = query ? this.queryWorker : this.worker;
    if (existing) return existing;
    const child = spawn(this.runtime.python, ["-u", this.runtime.script, this.runtime.models], {
      windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", OMP_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1" }
    });
    if (query) this.queryWorker = child; else this.worker = child;
    child.stdin.on("error", () => { /* Process failure is reported below. */ });
    child.stderr.resume();
    createInterface({ input: child.stdout }).on("line", line => {
      let data: { id: string; result?: unknown; error?: string; progress?: { done: number; total: number } };
      try { data = JSON.parse(line); } catch { return; }
      const task = this.pending.get(data.id); if (!task) return;
      if (data.progress) { task.progress?.(data.progress); return; }
      this.pending.delete(data.id);
      if (data.error) task.reject(new SmartError("ai_processing", `本机分析失败：${data.error}`, 422)); else task.resolve(data.result);
    });
    const failed = () => {
      if (query ? this.queryWorker !== child : this.worker !== child) return;
      if (query) this.queryWorker = null; else this.worker = null;
      for (const [id, task] of this.pending) if (task.child === child) { task.reject(new SmartError("ai_runtime", "本机 AI 组件不可用，请检查运行环境", 503)); this.pending.delete(id); }
    };
    child.once("error", failed); child.once("exit", failed);
    return child;
  }
  request<T>(payload: Record<string, unknown>, progress?: (value: { done: number; total: number }) => void, query = false): Promise<T> {
    const child = this.launch(query); const id = randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { child, resolve: value => resolve(value as T), reject, progress });
      child.stdin.write(JSON.stringify({ ...payload, id }) + "\n");
    });
  }
  private cache(snapshot: LibrarySnapshot): string { return path.join(snapshot.root, "semantic-vectors.sqlite"); }
  private async paths(snapshot: LibrarySnapshot) {
    const base = path.dirname(snapshot.root);
    const legacy = await Promise.all((await readdir(base, { withFileTypes: true })).filter(item => item.isDirectory() && !item.name.startsWith('.')).map(async item => {
      const file = path.join(base, item.name, "semantic-vectors.sqlite");
      return (await stat(file).catch(() => null))?.isFile() ? file : "";
    }));
    return { cache_path: this.cache(snapshot), index_path: snapshot.index_path,
      embedding_cache_root: path.join(path.dirname(base), "semantic-embeddings"), legacy_cache_paths: legacy.filter(Boolean).slice(-8) };
  }
  async search(snapshot: LibrarySnapshot, query: string, folder: string, progress?: (phase: MatchPhase) => void): Promise<SemanticSearchResult> {
    progress?.("semantic_search");
    return this.request<SemanticSearchResult>({ op: "hybrid_search", ...await this.paths(snapshot), query, folder }, undefined, true);
  }
  async buildIndex(snapshot: LibrarySnapshot): Promise<void> {
    if (this.indexing) {
      if (this.indexStatus.snapshot_id === snapshot.id) return this.indexing;
      throw new SmartError("index_running", "语义索引正在建立，请等待或停止当前任务", 409);
    }
    this.indexStatus = { running: true, done: 0, total: 0, error: "", snapshot_id: snapshot.id, phase: "vectors", encoded: 0, reused: 0 };
    const operation = (async () => { try {
      const result = await this.request<{ done: number; total: number }>({ op: "build_index", ...await this.paths(snapshot) }, progress => { this.indexStatus = { ...this.indexStatus, ...progress }; });
      this.indexStatus = { ...this.indexStatus, ...result, running: false };
    } catch (error) { this.indexStatus.running = false; this.indexStatus.error = (error as Error).message; throw error; } })();
    this.indexing = operation;
    try { await operation; } finally { if (this.indexing === operation) this.indexing = null; }
  }
  stopIndex(): void {
    for (const [id, task] of this.pending) if (task.child === this.worker) { task.reject(new SmartError("index_stopped", "已停止本机索引任务", 409)); this.pending.delete(id); }
    this.worker?.kill(); this.worker = null;
    this.indexStatus.running = false; this.indexStatus.error = "已停止，可继续建立索引";
  }
  async faces(frames: Array<{ file_path: string; at_ms: number }>, ratio: number, signal?: AbortSignal): Promise<Composition> {
    const output = await runProcess(this.runtime.python, ["-u", this.runtime.script, this.runtime.models], {
      signal, input: JSON.stringify({ id: "face", op: "faces", frames, ratio }) + "\n",
      env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", OMP_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1" }
    });
    const result = JSON.parse(output.trim().split(/\r?\n/).at(-1) ?? "{}") as { result?: Composition; error?: string };
    if (!result.result) throw new SmartError("ai_runtime", "人物分析组件不可用，请检查本机运行环境", 503);
    return result.result;
  }
  close(): void {
    for (const task of this.pending.values()) task.reject(new SmartError("ai_stopped", "本机分析已停止", 409));
    this.pending.clear(); this.worker?.kill(); this.queryWorker?.kill(); this.worker = null; this.queryWorker = null;
  }
}
