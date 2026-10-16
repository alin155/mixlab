import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  readCurrentCutterRelease, syncCutterReleaseCache, readFastLocalCutterReleaseCacheStatus,
  searchCutterSourceLibrary, getCutterSourceVideoDetail, listCutterSourceFolders,
  type CutterSourceVideoDetail
} from "../../library-fs/src/index.ts";
import { currentCutterReleaseSearchIndexFilePath } from "../../library-fs/src/cutter-release.ts";
import { normalizeTranscriptText } from "../../protocol/src/index.ts";
import { SmartStore } from "./store.ts";
import { SmartError, type Candidate, type Settings, type Work, type WorkSegment, type MatchActivity, type MatchPhase, type MatchProgress } from "./types.ts";

export interface LibrarySnapshot {
  id: string; root: string; library_root: string; version: string;
  index_path: string; ready_video_count: number; created_at: string;
}
export interface SemanticHit { source_video_id: string; segment_id: string; segment_ids?: string[]; begin_ms: number; end_ms: number; text: string; score: number }
export interface SemanticSearchResult { hits: SemanticHit[]; mode: "ann" | "candidate"; complete: boolean; examined: number; query_ms: number; encoded: number; reused: number }
const hash = (value: string): string => createHash("sha256").update(value).digest("hex").slice(0, 32);
const candidateOrder = (a: Candidate, b: Candidate): number => Number(b.kind === "exact") - Number(a.kind === "exact") || Number(a.kind === "conflict") - Number(b.kind === "conflict") || b.score - a.score;

export function classifyMatch(target: string, actual: string): "exact" | "near" | "conflict" {
  let expected = Array.from(normalizeTranscriptText(target)), spoken = Array.from(normalizeTranscriptText(actual));
  if (!expected.length || !spoken.length) return "conflict";
  if (expected.join("") === spoken.join("")) return "exact";
  const facts = (value: string): string => [
    ...(value.match(/\d+(?:\.\d+)?\s*[%％]?/gu) ?? []),
    ...(value.match(/[一二三四五六七八九十百千万]+(?=年|月|天|倍|成|个|元|万|亿)/gu) ?? [])
  ].sort().join("|");
  const negative = (value: string): boolean => /不|没|无|未|别|禁止|不能/u.test(value);
  if (facts(target) !== facts(actual) || negative(target) !== negative(actual)) return "conflict";
  // A repeated opening take is reviewable speech, never an exact automatic match.
  const opening = /^(\p{Script=Han}{4,16})\1/u;
  expected = Array.from(expected.join("").replace(opening, "$1"));
  spoken = Array.from(spoken.join("").replace(opening, "$1"));
  // Embedding similarity only recalls a topic; it cannot establish matching speech.
  // Reserve manual near-review for small transcript edits, never a different sentence.
  const longest = Math.max(expected.length, spoken.length), edits = Math.floor(longest * 0.12);
  if (Math.min(expected.length, spoken.length) < 6 || Math.abs(expected.length - spoken.length) > edits) return "conflict";
  let previous = spoken.map((_, index) => index + 1); previous.unshift(0);
  for (let row = 1; row <= expected.length; row++) {
    const current = [row];
    for (let column = 1; column <= spoken.length; column++) current.push(Math.min(
      current[column - 1]! + 1, previous[column]! + 1,
      previous[column - 1]! + Number(expected[row - 1] !== spoken[column - 1])
    ));
    previous = current;
  }
  return previous[spoken.length]! <= edits ? "near" : "conflict";
}

export class SmartLibrary {
  private syncing = new Map<string, Promise<LibrarySnapshot>>();
  private details = new Map<string, Promise<CutterSourceVideoDetail | null>>();
  private teacherRows = new Map<string, Array<{ source_video_id: string; lecturer: string; source_folder_name: string }>>();
  constructor(private store: SmartStore, private settings: () => Settings,
    private semantic?: (snapshot: LibrarySnapshot, query: string, folder: string, progress?: (phase: MatchPhase) => void) => Promise<SemanticSearchResult>) {}
  async snapshot(progress?: (value: MatchActivity) => void): Promise<LibrarySnapshot> {
    progress?.({ phase: "snapshot_check" });
    const config = this.settings();
    if (!config.library_root) throw new SmartError("library_missing", "请先在设置中选择已发布的公共素材库", 409);
    let release;
    try { release = await readCurrentCutterRelease(config.library_root); }
    catch { throw new SmartError("library_unavailable", "无法读取公共素材发布快照，请检查连接和发布状态", 503); }
    const key = hash(`${config.library_root}:${release.release_version}`);
    const saved = this.store.get<LibrarySnapshot>("snapshot", key);
    if (saved) {
      const status = await readFastLocalCutterReleaseCacheStatus({ cache_root: saved.root });
      if (status.cache_ready && status.active_release_version === saved.version) {
        progress?.({ phase: "snapshot_ready", snapshot_id: saved.id, snapshot_version: saved.version }); return saved;
      }
    }
    progress?.({ phase: "snapshot_sync", snapshot_version: release.release_version });
    if (!this.syncing.has(key)) this.syncing.set(key, this.copySnapshot(config));
    try {
      const snapshot = await this.syncing.get(key)!;
      progress?.({ phase: "snapshot_ready", snapshot_id: snapshot.id, snapshot_version: snapshot.version }); return snapshot;
    } finally { this.syncing.delete(key); }
  }
  private async copySnapshot(config: Settings): Promise<LibrarySnapshot> {
    const base = path.join(config.workspace_root, "cache", "library-snapshots");
    const incoming = path.join(base, `.incoming-${randomUUID()}`);
    await mkdir(incoming, { recursive: true });
    try {
      const result = await syncCutterReleaseCache({ source_library_root: config.library_root, cache_root: incoming, max_cached_releases: 1 });
      if (!result.cache_ready || !result.active_release_version) throw new SmartError("snapshot_incomplete", "素材快照同步未完成，请重新同步公共库", 503);
      const id = hash(`${config.library_root}:${result.active_release_version}`);
      const root = path.join(base, id);
      try { await rename(incoming, root); }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code ?? '';
        const windowsExistingDirectory = process.platform === 'win32' && code === 'EPERM' && (await stat(root).catch(() => null))?.isDirectory();
        if (!['EEXIST', 'ENOTEMPTY'].includes(code) && !windowsExistingDirectory) throw error;
        const existing = await readFastLocalCutterReleaseCacheStatus({ cache_root: root });
        if (existing.cache_ready && existing.active_release_version === result.active_release_version) {
          await rm(incoming, { recursive: true, force: true });
        } else {
          await rename(root, path.join(base, `.invalid-${id}-${randomUUID()}`));
          await rename(incoming, root);
        }
      }
      const snapshot: LibrarySnapshot = { id, root, library_root: config.library_root,
        version: result.active_release_version, index_path: await currentCutterReleaseSearchIndexFilePath({ release_root: root }),
        ready_video_count: result.ready_video_count, created_at: new Date().toISOString() };
      return this.store.set("snapshot", snapshot);
    } catch (error) {
      await rm(incoming, { recursive: true, force: true });
      if (error instanceof SmartError) throw error;
      throw new SmartError("snapshot_incomplete", "素材快照同步或校验未完成，请重新同步公共库后重试", 503);
    }
  }
  getSnapshot(id: string): LibrarySnapshot {
    const value = this.store.get<LibrarySnapshot>("snapshot", id);
    if (!value) throw new SmartError("snapshot_missing", "该作品的素材快照不可用，请重新生成匹配方案", 409);
    return value;
  }
  private async availableSnapshot(progress?: (value: MatchActivity) => void, pinned?: string): Promise<LibrarySnapshot> {
    const config = this.settings();
    const snapshots = pinned ? [this.getSnapshot(pinned)] : this.store.list<LibrarySnapshot>("snapshot").filter(item => item.library_root === config.library_root).sort((a, b) => b.version.localeCompare(a.version));
    for (const snapshot of snapshots) {
      if (snapshot.library_root !== config.library_root) continue;
      const status = await readFastLocalCutterReleaseCacheStatus({ cache_root: snapshot.root });
      if (status.cache_ready && status.active_release_version === snapshot.version) {
        progress?.({ phase: "snapshot_ready", snapshot_id: snapshot.id, snapshot_version: snapshot.version }); return snapshot;
      }
    }
    if (pinned) throw new SmartError("snapshot_incomplete", "作品锁定的素材快照不完整，请先同步公共素材库", 503);
    return this.snapshot(progress);
  }
  async source(snapshot: LibrarySnapshot, id: string): Promise<CutterSourceVideoDetail> {
    const key = `${snapshot.id}:${id}`;
    if (!this.details.has(key)) this.details.set(key, getCutterSourceVideoDetail({
      library_root: snapshot.library_root, release_root: snapshot.root, source_video_id: id
    }).catch(error => {
      this.details.delete(key);
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new SmartError("snapshot_incomplete", "作品锁定的素材快照不完整，请重新同步公共库后重试", 503);
      throw error;
    }));
    const detail = await this.details.get(key)!;
    if (!detail) throw new SmartError("source_missing", "该源素材不在作品锁定的已发布快照中", 409);
    return detail;
  }
  async folders(): Promise<Array<{ name: string; count: number }>> {
    const snapshot = await this.snapshot();
    return listCutterSourceFolders({ library_root: snapshot.library_root, release_root: snapshot.root });
  }
  private rows(snapshot: LibrarySnapshot) {
    if (!this.teacherRows.has(snapshot.id)) {
      const db = new DatabaseSync(path.join(snapshot.root, '.mixlab-library', 'releases', snapshot.version, 'catalog.sqlite'), { readOnly: true });
      try { this.teacherRows.set(snapshot.id, db.prepare('SELECT source_video_id,lecturer,source_folder_name FROM source_videos').all() as Array<{ source_video_id: string; lecturer: string; source_folder_name: string }>); }
      finally { db.close(); }
    }
    return this.teacherRows.get(snapshot.id)!;
  }
  private teacherName(row: { lecturer: string; source_folder_name: string }): string {
    return row.lecturer?.trim() || this.settings().teacher_folder_bindings?.[row.source_folder_name] || row.source_folder_name;
  }
  async teachers() {
    const snapshot = await this.availableSnapshot();
    const groups = new Map<string, { name: string; count: number; folders: string[]; from_folder: boolean }>();
    for (const row of this.rows(snapshot)) {
      const name = this.teacherName(row); if (!name) continue;
      const group = groups.get(name) ?? { name, count: 0, folders: [], from_folder: false };
      group.count++; group.from_folder ||= !row.lecturer?.trim();
      if (!group.folders.includes(row.source_folder_name)) group.folders.push(row.source_folder_name);
      groups.set(name, group);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  }
  private teacherFolders(snapshot: LibrarySnapshot, teacher: string): string[] {
    if (!teacher.trim()) throw new SmartError("teacher_required", "请先选择目标老师，再匹配该老师的素材", 409);
    const folders = [...new Set(this.rows(snapshot).filter(row => this.teacherName(row) === teacher).map(row => row.source_folder_name))];
    if (!folders.length) throw new SmartError("teacher_missing", "该老师在作品素材快照中没有可用视频，请选择老师后重新匹配", 409);
    return folders;
  }
  assertTeacher(snapshot: LibrarySnapshot, teacher: string, candidate: Candidate): void {
    this.teacherFolders(snapshot, teacher);
    const row = this.rows(snapshot).find(item => item.source_video_id === candidate.source_video_id);
    if (!row || this.teacherName(row) !== teacher) throw new SmartError("teacher_scope", "不能使用其他老师的视频，请在目标老师范围内重新匹配或补选", 409);
  }
  assertWorkTeacher(work: Work): void {
    if (!work.settings.teacher) throw new SmartError("teacher_required", "请先选择目标老师并重新匹配，旧方案不能跨老师导出", 409);
    const snapshot = this.getSnapshot(work.snapshot_id);
    for (const segment of work.segments) if (!segment.skipped && segment.selected) this.assertTeacher(snapshot, work.settings.teacher, segment.selected);
  }
  directionKey(candidate: Candidate): string { return hash(`${candidate.source_file_path}:${candidate.fingerprint.size}:${candidate.fingerprint.mtime_ms}`); }
  sourceRotation(candidate: Candidate): NonNullable<Candidate["rotation"]> {
    return this.store.get<{ rotation: NonNullable<Candidate["rotation"]> }>("source-direction", this.directionKey(candidate))?.rotation ?? 0;
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
    const candidate: Candidate = { id: hash(`${snapshot.id}:${sourceId}:${begin}:${end}`), snapshot_id: snapshot.id,
      source_video_id: sourceId, source_title: detail.title, source_folder: detail.source_folder_name,
      lecturer: detail.lecturer || "", segment_ids: actualSegments.map(item => item.segment_id),
      actual, begin_ms: begin, end_ms: end, kind: classifyMatch(target, actual), score,
      width: detail.width, height: detail.height, source_file_path: detail.source_video_file_path,
      cover_file_path: detail.cover_file_path, fingerprint, content_hash: contentHash };
    candidate.rotation = this.sourceRotation(candidate);
    if (this.store.get("source-direction", this.directionKey(candidate))) candidate.direction_source = "manual";
    return candidate;
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
  async candidates(snapshot: LibrarySnapshot, target: string, folder: string, query = target, progress?: (phase: MatchPhase) => void, coverage?: (value: WorkSegment["retrieval"]) => void, teacher = ""): Promise<Candidate[]> {
    if (!teacher) return this.folderCandidates(snapshot, target, folder, query, progress, coverage);
    const folders = this.teacherFolders(snapshot, teacher).filter(item => !folder || item === folder);
    if (!folders.length) throw new SmartError("teacher_scope", "当前素材范围不属于目标老师，请重新选择素材范围", 409);
    const candidates: Candidate[] = [], results: NonNullable<WorkSegment["retrieval"]>[] = [];
    for (const name of folders) candidates.push(...await this.folderCandidates(snapshot, target, name, query, progress, value => { if (value) results.push(value); }, teacher));
    if (results.length) coverage?.({ mode: results.every(item => item.mode === "ann") ? "ann" : "candidate", complete: results.every(item => item.complete), examined: results.reduce((sum, item) => sum + item.examined, 0) });
    return candidates.sort(candidateOrder).slice(0, 12);
  }
  private async folderCandidates(snapshot: LibrarySnapshot, target: string, folder: string, query: string, progress?: (phase: MatchPhase) => void, coverage?: (value: WorkSegment["retrieval"]) => void, teacher = ""): Promise<Candidate[]> {
    progress?.("text_search");
    const result = await searchCutterSourceLibrary({ library_root: snapshot.library_root,
      release_root: snapshot.root, query, limit: 8, ...(folder ? { source_folder_name: folder } : {}) });
    const candidates: Candidate[] = [];
    progress?.("source_check");
    for (const group of result.groups) {
      const spans = new Map<string, string[]>();
      for (const hit of group.hit_segments) {
        const key = hit.match_id || hit.segment_id;
        spans.set(key, [...(spans.get(key) ?? []), hit.segment_id]);
      }
      for (const ids of spans.values()) {
        const item = await this.candidate(snapshot, target, group.source_video_id, ids, 1);
        if (item && (!teacher || this.rows(snapshot).some(row => row.source_video_id === item.source_video_id && this.teacherName(row) === teacher))) candidates.push(item);
      }
    }
    if (!candidates.some(item => item.kind === "exact") && this.semantic) {
      const result = await this.semantic(snapshot, query, folder, progress);
      coverage?.({ mode: result.mode, complete: result.complete, examined: result.examined });
      progress?.("source_check");
      for (const hit of result.hits) {
        const item = await this.candidate(snapshot, target, hit.source_video_id, hit.segment_ids ?? [hit.segment_id], hit.score);
        if (item && (!teacher || this.rows(snapshot).some(row => row.source_video_id === item.source_video_id && this.teacherName(row) === teacher))) candidates.push(item);
      }
    }
    const unique = [...new Map(candidates.map(item => [item.id, item])).values()];
    return unique.sort(candidateOrder).slice(0, 12);
  }
  async plan(script: string[], folder: string, progress?: (value: Partial<MatchProgress>) => void, pinned?: string, teacher = ""): Promise<{ snapshot: LibrarySnapshot; segments: WorkSegment[] }> {
    const snapshot = await this.availableSnapshot(progress, pinned); const segments: WorkSegment[] = [];
    this.teacherFolders(snapshot, teacher);
    for (const [index, target] of script.entries()) {
      progress?.({ current_sentence: index + 1 });
      let retrieval: WorkSegment["retrieval"];
      const candidates = await this.candidates(snapshot, target, folder, target, phase => progress?.({ phase }), value => { retrieval = value; }, teacher);
      const selected = candidates.find(candidate => candidate.kind === "exact") ?? candidates.find(candidate => candidate.kind === "near") ?? null;
      const incomplete = retrieval?.complete === false;
      segments.push({ id: index + 1, target, actual: selected?.actual ?? "", status: selected?.kind ?? (incomplete ? "pending" : "gap"),
        accepted: false, selected, candidates, ...(retrieval ? { retrieval } : {}), reason: selected?.kind === "near" ? "实际原声表达不同，请确认" : selected ? "" : incomplete ? "快速候选检索尚未找到可用原声，全库语义索引未就绪；可手动补选，或索引就绪后重新匹配。" : "没有找到可直接使用的原声片段" });
      progress?.({ completed_sentences: segments.length, exact_matches: segments.filter(item => item.status === "exact").length,
        near_matches: segments.filter(item => item.status === "near").length, missing_matches: segments.filter(item => item.status === "gap").length,
        pending_matches: segments.filter(item => item.status === "pending").length });
    }
    progress?.({ phase: "complete" });
    return { snapshot, segments };
  }
}
