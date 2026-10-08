import { readdir, lstat, rm } from "node:fs/promises";
import path from "node:path";
import type { SmartCore } from "./core.ts";
import type { Job } from "./types.ts";
import { SmartError } from "./types.ts";
import { ownedPath } from "./workspace.ts";

export type CacheKind = "source" | "temporary" | "index" | "reference";
interface CacheFile { relative: string; bytes: number; protected: boolean; kind: CacheKind }
export class WorkspaceCache {
  constructor(private core: SmartCore) {}
  private async files(): Promise<CacheFile[]> {
    const core = this.core, root = core.settings.workspace_root;
    const activeJobs = core.store.list<Job>("job").filter(job => ["queued", "running", "paused", "failed", "needs_review"].includes(job.status));
    const pins = new Set(activeJobs.flatMap(job => job.work.segments.map(segment => segment.selected?.id ?? "")));
    const manualBusy = await core.manual.busy();
    const busy = core.activeStreams > 0 || core.ai.indexStatus.running || core.assemblies.busy;
    const roots: Array<{ relative: string; kind: CacheKind; protected: boolean }> = [
      { relative: "cache/source-videos", kind: "source", protected: busy },
      { relative: "manual/cache/source-videos", kind: "source", protected: busy || manualBusy },
      { relative: "cache/assemblies", kind: "temporary", protected: core.store.listStatus("assembly", ["queued", "running", "paused", "failed"]).length > 0 || busy },
      { relative: "cache/previews", kind: "temporary", protected: busy },
      { relative: "cache/jobs", kind: "temporary", protected: busy },
      { relative: "manual/cache/cut-temp", kind: "temporary", protected: manualBusy || busy },
      { relative: "manual/cache/source-thumbnails", kind: "temporary", protected: manualBusy || busy },
      { relative: "cache/library-snapshots", kind: "index", protected: true },
      { relative: "manual/cache/.mixlab-library", kind: "index", protected: true },
      { relative: "cache/references", kind: "reference", protected: !!core.references.active || busy }
    ];
    const files: CacheFile[] = [];
    async function scan(relative: string, entry: typeof roots[number]): Promise<void> {
      const absolute = path.join(root, relative);
      const info = await lstat(absolute).catch(error => { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; });
      if (!info || info.isSymbolicLink()) return;
      if (info.isDirectory()) { for (const child of await readdir(absolute)) await scan(path.join(relative, child), entry); return; }
      if (!info.isFile()) return;
      const parts = relative.split(path.sep);
      const protectedFile = entry.protected || entry.kind === "source" && pins.has(path.basename(relative).split(".")[0]!) ||
        relative.startsWith(path.join("cache", "jobs")) && activeJobs.some(job => parts.includes(job.id));
      files.push({ relative, kind: entry.kind, bytes: info.size, protected: protectedFile });
    }
    for (const entry of roots) await scan(entry.relative, entry);
    return files;
  }
  async status() {
    const files = await this.files();
    return { entries: (["source", "temporary", "index", "reference"] as CacheKind[]).map(kind => {
      const group = files.filter(file => file.kind === kind);
      return { kind, used_bytes: group.reduce((sum, file) => sum + file.bytes, 0),
        clearable_bytes: group.filter(file => !file.protected).reduce((sum, file) => sum + file.bytes, 0),
        protected_bytes: group.filter(file => file.protected).reduce((sum, file) => sum + file.bytes, 0) };
    }), last_cleanup: this.core.store.get<{ at: string } & { id: string }>("cache", "last")?.at ?? "" };
  }
  async clear(kinds: unknown) {
    if (!Array.isArray(kinds) || kinds.some(kind => !["source", "temporary", "index", "reference"].includes(kind))) throw new SmartError("cache_kind", "清理分类无效");
    if (this.core.cacheClearing) throw new SmartError("cache_busy", "缓存正在清理，请稍后", 409);
    this.core.cacheClearing = true;
    try {
      let removedBytes = 0, removedFiles = 0;
      for (const file of await this.files()) {
        if (file.protected || !kinds.includes(file.kind)) continue;
        const target = await ownedPath(this.core.settings.workspace_root, file.relative);
        await rm(target, { force: true }); removedBytes += file.bytes; removedFiles++;
      }
      this.core.store.set("cache", { id: "last", at: new Date().toISOString() });
      return { removed_bytes: removedBytes, removed_files: removedFiles, ...await this.status() };
    } finally { this.core.cacheClearing = false; }
  }
}
