import { useEffect, useRef, useState } from "react";
import { request, mediaUrl } from "./api.ts";
import type { SourceLibraryResponse, LocalClipCatalog, CutJobCatalog, SourceVideoDetail, SearchResponse, SourceFolderOption, CutListItemInput, CutMode, TranscriptSegment } from "../../cutter-web/src/api.ts";
import { localClipToSourceVideoDetail } from "../../cutter-web/src/state/material-locator.ts";
import type { BasicProject } from "../../../packages/smart-cutter/src/workspace.ts";
export type { BasicProject, CutListItemInput, SourceVideoDetail, TranscriptSegment };
export interface TextRange { start: number; end: number; from: number; to: number }
export const emptySearch: SearchResponse = { query: "", normalized_query: "", groups: [] };
export async function cutterRequest<T>(route: string, method = "GET", payload?: unknown): Promise<T> { return (await request<{ data: T }>(route, method, payload)).data; }
export function resolveMedia<T extends { media_url: string; cover_url?: string }>(item: T): T { return { ...item, media_url: mediaUrl(item.media_url), ...(item.cover_url ? { cover_url: mediaUrl(item.cover_url) } : {}) }; }
export function selectionFromText(detail: SourceVideoDetail, range: TextRange, mode: CutMode): CutListItemInput | null {
  const rows = detail.transcript.segments, first = rows[range.start], last = rows[range.end];
  if (!first || !last) return null;
  const firstChars = Array.from(first.text), lastChars = Array.from(last.text);
  const from = Math.max(0, Math.min(range.from, firstChars.length)), to = Math.max(0, Math.min(range.to, lastChars.length));
  const selected = rows.slice(range.start, range.end + 1).map((row, i) => Array.from(row.text).slice(i === 0 ? from : 0, range.start + i === range.end ? to : undefined).join("")).join("");
  const begin = Math.round(first.begin_ms + (first.end_ms - first.begin_ms) * from / Math.max(1, firstChars.length));
  const end = Math.round(last.begin_ms + (last.end_ms - last.begin_ms) * to / Math.max(1, lastChars.length));
  if (!selected.trim() || end <= begin) return null;
  return { source_video_id: detail.source_video_id, source_title: detail.title, source_relative_path: detail.relative_path ?? "", start_segment_id: first.segment_id,
    end_segment_id: last.segment_id, begin_ms: begin, end_ms: end, selected_text: selected, cut_mode: mode };
}
export function useBasics(authenticated: boolean, route: string, notify: (message: string) => void) {
  const [library, setLibrary] = useState<SourceLibraryResponse>({ available_video_count: 0, videos: [] });
  const [locals, setLocals] = useState<LocalClipCatalog>({ local_clip_count: 0, clips: [] });
  const [jobs, setJobs] = useState<CutJobCatalog>({ job_count: 0, jobs: [] });
  const [projects, setProjects] = useState<BasicProject[]>([]), [projectId, setProjectId] = useState("");
  const [detail, setDetail] = useState<SourceVideoDetail | null>(null), [range, setRange] = useState<TextRange | null>(null);
  const [query, setQuery] = useState(""), [searched, setSearched] = useState(""), [folder, setFolder] = useState("");
  const [scope, setScope] = useState("public"), [orientation, setOrientation] = useState("all");
  const [search, setSearch] = useState<SearchResponse>(emptySearch), [folders, setFolders] = useState<SourceFolderOption[]>([]);
  const [mode, setMode] = useState<CutMode>("precise"), [busy, setBusy] = useState(false), [failure, setFailure] = useState("");
  const localWindow = useRef(200), jobWindow = useRef(200), libraryGeneration = useRef(0);
  const generation = useRef(0), detailGeneration = useRef(0), alive = useRef(true);
  const project = projects.find(item => item.id === projectId) ?? null;
  const selected = detail && range ? selectionFromText(detail, range, mode) : null;
  async function act<T>(operation: () => Promise<T>): Promise<T | null> {
    setBusy(true); try { const value = await operation(); setFailure(""); return value; }
    catch (error) { setFailure((error as Error).message); notify((error as Error).message); return null; }
    finally { setBusy(false); }
  }
  async function refresh(): Promise<void> {
    const ticket = generation.current;
    const loadPages = async <T extends LocalClipCatalog | CutJobCatalog>(kind: "local-clips" | "cut-jobs", count: number): Promise<T> => {
      const pages = await Promise.all(Array.from({length:Math.ceil(count/200)}, (_,index)=>cutterRequest<T>(`/cutter/${kind}?limit=200&offset=${index*200}`)));
      const first = pages[0]!;
      return (kind === "local-clips" ? { ...first, clips: pages.flatMap(page=>(page as LocalClipCatalog).clips) } : { ...first, jobs: pages.flatMap(page=>(page as CutJobCatalog).jobs) }) as T;
    };
    const [localData, jobData, projectData] = await Promise.all([loadPages<LocalClipCatalog>("local-clips",localWindow.current), loadPages<CutJobCatalog>("cut-jobs",jobWindow.current), request<BasicProject[]>("/smart/projects")]);
    if (!alive.current || ticket !== generation.current) return;
    setLocals({ ...localData, clips: localData.clips.map(resolveMedia) }); setJobs(jobData); setProjects(projectData);
  }
  async function loadLibrary(more = false): Promise<void> {
    const ticket = generation.current, libraryTicket = ++libraryGeneration.current;
    const result = await cutterRequest<SourceLibraryResponse>(`/cutter/source-library?limit=20&offset=${more ? library.videos.length : 0}${folder ? `&source_folder_name=${encodeURIComponent(folder)}` : ""}`);
    if (!alive.current || ticket !== generation.current || libraryTicket !== libraryGeneration.current) return;
    setLibrary({ ...result, videos: more ? [...library.videos, ...result.videos.map(resolveMedia)] : result.videos.map(resolveMedia) });
  }
  async function loadMore(kind: "local" | "jobs"): Promise<void> { if (kind === "local") localWindow.current += 200; else jobWindow.current += 200; await refresh(); }
  async function choose(id: string, kind = "public"): Promise<void> {
    const ticket = ++detailGeneration.current, authTicket = generation.current; setRange(null);
    const value = kind === "local" ? localClipToSourceVideoDetail(resolveMedia(await cutterRequest<LocalClipCatalog["clips"][number]>(`/cutter/local-clips/${id}`))) : resolveMedia(await cutterRequest<SourceVideoDetail>(`/cutter/source-videos/${id}`));
    if (ticket !== detailGeneration.current || authTicket !== generation.current || !alive.current) return;
    setDetail(value);
  }
  async function runSearch(more = false): Promise<void> {
    const text = query.trim(); setSearched(text);
    if (!text || scope === "local") { setSearch({ ...emptySearch, query: text }); return; }
    const ticket = ++generation.current;
    const result = await cutterRequest<SearchResponse>(`/cutter/source-search?query=${encodeURIComponent(text)}&limit=20${folder ? `&source_folder_name=${encodeURIComponent(folder)}` : ""}${more && search.next_cursor ? `&cursor=${encodeURIComponent(search.next_cursor)}` : ""}`);
    if (ticket !== generation.current || !alive.current) return;
    setSearch(more ? { ...result, groups: [...search.groups, ...result.groups] } : result);
    if (!more && result.groups[0]) await choose(result.groups[0].source_video_id);
  }
  async function createProject(title = ""): Promise<BasicProject> {
    const value = await request<BasicProject>("/smart/projects", "POST", { title: title.trim() || selected?.selected_text.slice(0, 22) || query.trim() || "新建检索项目" });
    setProjectId(value.id); setProjects(rows => [value, ...rows]); return value;
  }
  async function saveItems(items: CutListItemInput[]): Promise<void> {
    const current = project ?? await createProject();
    const updated = await request<BasicProject>(`/smart/projects/${current.id}`, "PATCH", { items });
    setProjects(rows => rows.map(item => item.id === updated.id ? updated : item));
  }
  async function cut(items = selected ? [selected] : [], merged = false): Promise<void> {
    if (!items.length) return;
    const current = project ?? await createProject();
    const list = await cutterRequest<{ clip_list_id: string }>("/cutter/clip-lists", "POST", { library_id: library.library_id ?? "public-library", project_id: current.id, title: current.title, items });
    const submitted = await cutterRequest<import("../../cutter-web/src/api.ts").CutJobSubmission>("/cutter/cut-jobs", "POST", { clip_list_id: list.clip_list_id });
    if (merged) await request("/smart/assemblies", "POST", { project_id: current.id, cut_job_ids: submitted.jobs.map(job => job.cut_job_id) });
    notify("已加入真实剪切队列，完成后保存到本地素材"); await refresh();
  }
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current++; detailGeneration.current++; }; }, []);
  useEffect(() => {
    generation.current++; libraryGeneration.current++; detailGeneration.current++;
    if (!authenticated) { localWindow.current = 200; jobWindow.current = 200; setProjectId(""); setRange(null); setSearch(emptySearch); setFolders([]); setLocals({ local_clip_count: 0, clips: [] }); setProjects([]); setJobs({ job_count: 0, jobs: [] }); setDetail(null); setLibrary({ available_video_count: 0, videos: [] }); return; }
    void act(async () => { await refresh(); await loadLibrary(); const result = await cutterRequest<{ source_folders: SourceFolderOption[] }>("/cutter/source-folders"); if (alive.current && authenticated) setFolders(result.source_folders); });
  }, [authenticated]);
  useEffect(() => { if (authenticated) void act(() => loadLibrary()); }, [folder]);
  useEffect(() => {
    if (!authenticated || !["retrieve", "tasks", "local", "projects"].includes(route)) return;
    const timer = setInterval(() => { void refresh().catch(error => setFailure((error as Error).message)); }, 3000); return () => clearInterval(timer);
  }, [authenticated, route]);
  return { library, locals, jobs, projects, project, projectId, setProjectId, detail, range, setRange, query, setQuery, searched, search, folders, folder, setFolder,
    scope, setScope, orientation, setOrientation, mode, setMode, selected, busy, failure, act, refresh, loadLibrary, loadMore, choose, runSearch, createProject, saveItems, cut };
}
export type Basics = ReturnType<typeof useBasics>;
