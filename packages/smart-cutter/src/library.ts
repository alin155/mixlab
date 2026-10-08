import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  readCurrentCutterRelease, syncCutterReleaseCache,
  searchCutterSourceLibrary, getCutterSourceVideoDetail, listCutterSourceFolders,
  type CutterSourceVideoDetail
} from "../../library-fs/src/index.ts";
import { currentCutterReleaseSearchIndexFilePath } from "../../library-fs/src/cutter-release.ts";
import { normalizeTranscriptText } from "../../protocol/src/index.ts";
import { SmartStore } from "./store.ts";
import { SmartError, type Candidate, type Settings, type WorkSegment } from "./types.ts";

export interface LibrarySnapshot {
  id: string; root: string; library_root: string; version: string;
  index_path: string; ready_video_count: number; created_at: string;
}
export interface SemanticHit { source_video_id: string; segment_id: string; begin_ms: number; end_ms: number; text: string; score: number }
const hash = (value: string): string => createHash("sha256").update(value).digest("hex").slice(0, 32);

export function classifyMatch(target: string, actual: string): "exact" | "near" | "conflict" {
  if (normalizeTranscriptText(target) === normalizeTranscriptText(actual)) return "exact";
  const facts = (value: string): string => [
    ...(value.match(/\d+(?:\.\d+)?\s*[%％]?/gu) ?? []),
    ...(value.match(/[一二三四五六七八九十百千万]+(?=年|月|天|倍|成|个|元|万|亿)/gu) ?? [])
  ].sort().join("|");
  const negative = (value: string): boolean => /不|没|无|未|别|禁止|不能/u.test(value);
  if (facts(target) !== facts(actual) || negative(target) !== negative(actual)) return "conflict";
  return "near";
}

export class SmartLibrary {
  private syncing = new Map<string, Promise<LibrarySnapshot>>();
  private details = new Map<string, Promise<CutterSourceVideoDetail | null>>();
  constructor(private store: SmartStore, private settings: () => Settings,
    private semantic?: (snapshot: LibrarySnapshot, query: string, folder: string) => Promise<SemanticHit[]>) {}
  async snapshot(): Promise<LibrarySnapshot> {
    const config = this.settings();
    if (!config.library_root) throw new SmartError("library_missing", "请先在设置中选择已发布的公共素材库", 409);
    let release;
    try { release = await readCurrentCutterRelease(config.library_root); }
    catch { throw new SmartError("library_unavailable", "无法读取公共素材发布快照，请检查连接和发布状态", 503); }
    const key = hash(`${config.library_root}:${release.release_version}`);
    const saved = this.store.get<LibrarySnapshot>("snapshot", key);
    if (saved) return saved;
    if (!this.syncing.has(key)) this.syncing.set(key, this.copySnapshot(config));
    try { return await this.syncing.get(key)!; } finally { this.syncing.delete(key); }
  }
  private async copySnapshot(config: Settings): Promise<LibrarySnapshot> {
    const base = path.join(config.workspace_root, "cache", "library-snapshots");
    const incoming = path.join(base, `.incoming-${randomUUID()}`);
    await mkdir(incoming, { recursive: true });
    try {
      const result = await syncCutterReleaseCache({ source_library_root: config.library_root, cache_root: incoming, max_cached_releases: 1 });
      const id = hash(`${config.library_root}:${result.active_release_version}`);
      const root = path.join(base, id);
      try { await rename(incoming, root); }
      catch (error) {
        if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
        await rm(incoming, { recursive: true, force: true });
      }
      const snapshot: LibrarySnapshot = { id, root, library_root: config.library_root,
        version: result.active_release_version, index_path: await currentCutterReleaseSearchIndexFilePath({ release_root: root }),
        ready_video_count: result.ready_video_count, created_at: new Date().toISOString() };
      return this.store.set("snapshot", snapshot);
    } catch (error) { await rm(incoming, { recursive: true, force: true }); throw error; }
  }
  getSnapshot(id: string): LibrarySnapshot {
    const value = this.store.get<LibrarySnapshot>("snapshot", id);
    if (!value) throw new SmartError("snapshot_missing", "该作品的素材快照不可用，请重新生成匹配方案", 409);
    return value;
  }
  async source(snapshot: LibrarySnapshot, id: string): Promise<CutterSourceVideoDetail> {
    const key = `${snapshot.id}:${id}`;
    if (!this.details.has(key)) this.details.set(key, getCutterSourceVideoDetail({
      library_root: snapshot.library_root, release_root: snapshot.root, source_video_id: id
    }));
    const detail = await this.details.get(key)!;
    if (!detail) throw new SmartError("source_missing", "该源素材不在作品锁定的已发布快照中", 409);
    return detail;
  }
  async folders(): Promise<Array<{ name: string; count: number }>> {
    const snapshot = await this.snapshot();
    return listCutterSourceFolders({ library_root: snapshot.library_root, release_root: snapshot.root });
  }
  private async candidate(snapshot: LibrarySnapshot, target: string, sourceId: string,
    ids: string[], score: number): Promise<Candidate | null> {
    const detail = await this.source(snapshot, sourceId);
    const catalog = new DatabaseSync(path.join(snapshot.root, '.mixlab-library', 'releases', snapshot.version, 'catalog.sqlite'), { readOnly: true });
    let contentHash = '';
    try { contentHash = (catalog.prepare('SELECT content_hash FROM source_videos WHERE source_video_id=?').get(sourceId) as { content_hash: string } | undefined)?.content_hash ?? ''; }
    finally { catalog.close(); }
    const hits = detail.transcript.segments.filter(segment => ids.includes(segment.segment_id));
    if (!hits.length) return null;
    const begin = Math.min(...hits.map(item => item.begin_ms)), end = Math.max(...hits.map(item => item.end_ms));
    if (end <= begin || end - begin > 120_000) return null;
    const actualSegments = detail.transcript.segments.filter(segment => segment.begin_ms >= begin && segment.end_ms <= end);
    const actual = actualSegments.map(segment => segment.text).join("");
    if (!actual.trim()) return null;
    let fingerprint;
    try { const info = await stat(detail.source_video_file_path); if (detail.file_size > 0 && info.size !== detail.file_size) return null; fingerprint = { size: info.size, mtime_ms: info.mtimeMs }; }
    catch { return null; }
    return { id: hash(`${snapshot.id}:${sourceId}:${begin}:${end}`), snapshot_id: snapshot.id,
      source_video_id: sourceId, source_title: detail.title, source_folder: detail.source_folder_name,
      lecturer: detail.lecturer || "", segment_ids: actualSegments.map(item => item.segment_id),
      actual, begin_ms: begin, end_ms: end, kind: classifyMatch(target, actual), score,
      width: detail.width, height: detail.height, source_file_path: detail.source_video_file_path,
      cover_file_path: detail.cover_file_path, fingerprint, content_hash: contentHash };
  }
  async selectedRange(snapshot: LibrarySnapshot, target: string, input: Record<string, unknown>): Promise<Candidate> {
    if (typeof input.source_video_id !== "string" || !/^V\d{6}$/.test(input.source_video_id)) throw new SmartError("source_scope", "补选仅接受已发布的公共素材");
    const detail = await this.source(snapshot, input.source_video_id);
    const range = input.range as { start?: number; end?: number; from?: number; to?: number } | undefined;
    if (!range || ![range.start, range.end, range.from, range.to].every(Number.isSafeInteger)) throw new SmartError("selection_range", "拖选范围无效");
    const { start, end, from, to } = range as { start: number; end: number; from: number; to: number };
    const rows = detail.transcript.segments, first = rows[start], last = rows[end];
    if (!first || !last || start > end || from < 0 || to < 0 || from > Array.from(first.text).length || to > Array.from(last.text).length || start === end && to <= from) throw new SmartError("selection_range", "拖选范围已变化，请重新选择");
    const actual = rows.slice(start, end + 1).map((row, index) => Array.from(row.text).slice(index === 0 ? from : 0, start + index === end ? to : undefined).join("")).join("");
    const begin = Number(input.begin_ms), finish = Number(input.end_ms);
    if (!actual.trim() || !Number.isFinite(begin) || !Number.isFinite(finish) || begin < first.begin_ms || finish > last.end_ms || finish <= begin || finish - begin > 120000) throw new SmartError("selection_time", "剪切边界必须位于拖选文案对应的片段内");
    const candidate = await this.candidate(snapshot, target, detail.source_video_id, rows.slice(start, end + 1).map(row => row.segment_id), 1);
    if (!candidate) throw new SmartError("source_unavailable", "素材文件无法读取或已变化，请检查公共库", 409);
    return { ...candidate, id: hash(`${snapshot.id}:${detail.source_video_id}:${begin}:${finish}:${actual}`), actual,
      begin_ms: begin, end_ms: finish, kind: classifyMatch(target, actual) };
  }
  async candidates(snapshot: LibrarySnapshot, target: string, folder: string, query = target): Promise<Candidate[]> {
    const result = await searchCutterSourceLibrary({ library_root: snapshot.library_root,
      release_root: snapshot.root, query, limit: 8, ...(folder ? { source_folder_name: folder } : {}) });
    const candidates: Candidate[] = [];
    for (const group of result.groups) {
      const spans = new Map<string, string[]>();
      for (const hit of group.hit_segments) {
        const key = hit.match_id || hit.segment_id;
        spans.set(key, [...(spans.get(key) ?? []), hit.segment_id]);
      }
      for (const ids of spans.values()) {
        const item = await this.candidate(snapshot, target, group.source_video_id, ids, 1);
        if (item) candidates.push(item);
      }
    }
    if (!candidates.some(item => item.kind === "exact") && this.semantic) {
      const hits = await this.semantic(snapshot, query, folder);
      for (const hit of hits) {
        const item = await this.candidate(snapshot, target, hit.source_video_id, [hit.segment_id], hit.score);
        if (item) candidates.push(item);
      }
    }
    const unique = [...new Map(candidates.map(item => [item.id, item])).values()];
    return unique.sort((a, b) => Number(b.kind === "exact") - Number(a.kind === "exact") || b.score - a.score).slice(0, 12);
  }
  async plan(script: string[], folder: string): Promise<{ snapshot: LibrarySnapshot; segments: WorkSegment[] }> {
    const snapshot = await this.snapshot(); const segments: WorkSegment[] = [];
    for (const [index, target] of script.entries()) {
      const candidates = await this.candidates(snapshot, target, folder);
      const selected = candidates.find(candidate => candidate.kind === "exact") ?? candidates.find(candidate => candidate.kind === "near") ?? null;
      segments.push({ id: index + 1, target, actual: selected?.actual ?? "", status: selected?.kind ?? "gap",
        accepted: false, selected, candidates, reason: selected?.kind === "near" ? "实际原声表达不同，请确认" : selected ? "" : "没有找到可直接使用的原声片段" });
    }
    return { snapshot, segments };
  }
}
