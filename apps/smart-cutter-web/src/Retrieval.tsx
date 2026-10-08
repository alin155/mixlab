import React, { useEffect, useRef, useState } from "react";
import { IconSearch, IconPlus, IconScissors, IconPlayerPlay, IconPlayerPause, IconArrowUp, IconArrowDown, IconTrash, IconListCheck, IconSparkles, IconArrowLeft } from "@tabler/icons-react";
import { Button, Badge, Modal, Empty, Banner } from "./components.tsx";
import { duration, mediaUrl } from "./api.ts";
import type { Basics, CutListItemInput, TextRange } from "./basics.ts";
export interface Supplement { workId: string; segmentId: number; revision: number; target: string }
export function Retrieval({ data, pro, supplement, onApply, onCancel, onSmart, onTasks }: { data: Basics; pro: boolean; supplement: Supplement | null;
  onApply: (item: CutListItemInput, range: TextRange) => Promise<void>; onCancel: () => void; onSmart: (script: string) => void; onTasks: () => void }) {
  const { detail, range, selected } = data;
  const transcript = detail?.transcript.segments ?? [];
  const transcriptRef = useRef<HTMLDivElement>(null), videoRef = useRef<HTMLVideoElement>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null), [timeStart, setTimeStart] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false), [showClips, setShowClips] = useState(false), [dialog, setDialog] = useState(false), [name, setName] = useState("");
  const [exportOpen, setExportOpen] = useState(false), [exportMode, setExportMode] = useState("separate");
  const [inPoint, setInPoint] = useState(""), [outPoint, setOutPoint] = useState("");
  const current = selected ? { ...selected, begin_ms: Math.round(Number(inPoint) * 1000), end_ms: Math.round(Number(outPoint) * 1000) } : null;
  const valid = !!current && !!inPoint && !!outPoint && Number.isFinite(current.begin_ms) && Number.isFinite(current.end_ms) && current.begin_ms >= 0 && current.end_ms > current.begin_ms && current.end_ms <= (detail?.duration_ms ?? 0);
  const publicHits = data.searched ? data.search.groups.map(group => ({ id: group.source_video_id, title: group.title, text: group.best_excerpt,
    cover: group.cover_url ? mediaUrl(group.cover_url) : undefined, kind: "public", width: undefined as number | undefined, height: undefined as number | undefined })) : data.library.videos.map(video => ({ id: video.source_video_id, title: video.title, text: video.description ?? "已发布 · 文案已索引", cover: video.cover_url, kind: "public", width: video.width, height: video.height }));
  const localHits = data.locals.clips.filter(clip => !data.searched || `${clip.title}${clip.selected_text}`.includes(data.searched)).map(clip => ({ id: clip.local_clip_id, title: clip.title, text: clip.selected_text ?? "", cover: clip.cover_url, kind: "local", width: clip.width, height: clip.height }));
  const hits = [...(data.scope === "local" ? [] : publicHits), ...(data.scope === "public" ? [] : localHits)].filter(hit => data.orientation === "all" || !hit.width || !hit.height || (data.orientation === "portrait" ? hit.height > hit.width : hit.width >= hit.height));
  useEffect(() => { setInPoint(selected ? String(selected.begin_ms / 1000) : ""); setOutPoint(selected ? String(selected.end_ms / 1000) : ""); setPlaying(false); }, [selected?.begin_ms, selected?.end_ms, selected?.selected_text]);
  useEffect(() => { setAnchor(null); setTimeStart(null); setPlaying(false); videoRef.current?.pause(); }, [detail?.source_video_id]);
  useEffect(() => { const resize = () => setAnchor(null); window.addEventListener("resize", resize); return () => window.removeEventListener("resize", resize); }, []);
  useEffect(() => { if (!supplement) return; data.setScope("public"); data.setQuery(supplement.target); }, [supplement?.workId, supplement?.segmentId]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!valid || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || (event.target as Element).closest("input,textarea,select,button,[contenteditable]")) return;
      if (event.code === "Space") { event.preventDefault(); void preview(); }
      if (event.key === "Enter") { event.preventDefault(); void cut(); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  });
  function clear() { data.setRange(null); setAnchor(null); setTimeStart(null); setPlaying(false); videoRef.current?.pause(); window.getSelection()?.removeAllRanges(); }
  function apply(next: TextRange, event: React.MouseEvent) {
    data.setRange(next); setPlaying(false); videoRef.current?.pause(); setTimeStart(null);
    const bounds = transcriptRef.current!.getBoundingClientRect();
    setAnchor({ left: Math.min(Math.max(event.clientX - 80, bounds.left + 8), bounds.right - 220), top: Math.max(bounds.top + 8, Math.min(event.clientY + 14, bounds.bottom - 48)) });
  }
  function endpoint(node: Node | null, offset: number) {
    const element = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node as Element | null;
    const text = element?.closest<HTMLElement>("[data-transcript-text]"); if (!text || !transcriptRef.current?.contains(text) || !node) return null;
    const prefix = document.createRange(); prefix.selectNodeContents(text); prefix.setEnd(node, offset);
    return { row: Number(text.dataset.transcriptText), offset: Array.from(prefix.toString()).length };
  }
  function drag(event: React.MouseEvent) {
    const selection = window.getSelection(); if (!selection || selection.isCollapsed) return;
    const a = endpoint(selection.anchorNode, selection.anchorOffset), b = endpoint(selection.focusNode, selection.focusOffset); if (!a || !b) return;
    const forward = a.row < b.row || a.row === b.row && a.offset < b.offset, first = forward ? a : b, last = forward ? b : a;
    apply({ start: first.row, end: last.row, from: first.offset, to: last.offset }, event); selection.removeAllRanges();
  }
  function selectTime(index: number, event: React.MouseEvent) {
    if (timeStart === null) { clear(); setTimeStart(index); return; }
    const start = Math.min(index, timeStart), end = Math.max(index, timeStart);
    apply({ start, end, from: 0, to: Array.from(transcript[end]!.text).length }, event);
  }
  async function preview() {
    const video = videoRef.current; if (!video || !current || !valid) return;
    if (playing) { video.pause(); setPlaying(false); return; }
    video.currentTime = current.begin_ms / 1000;
    try { await video.play(); setPlaying(true); } catch { data.act(async () => { throw new Error("视频暂时无法播放，请检查素材连接"); }); }
  }
  async function cut() {
    if (!valid || !current || data.busy) return;
    setAnchor(null); videoRef.current?.pause(); setPlaying(false);
    await data.act(() => supplement && range ? onApply(current, range) : data.cut([current]));
  }
  function textRow(text: string, index: number) {
    const chars = Array.from(text), query = data.searched, nodes: React.ReactNode[] = []; let chunk = "", previous = "";
    function flush(key: string) { if (!chunk) return; nodes.push(previous === "selected" ? <span className="drag-selected-text" key={key}>{chunk}</span> : previous === "hit" ? <mark key={key}>{chunk}</mark> : chunk); chunk = ""; }
    const from = range?.start === index ? range.from : 0, to = range?.end === index ? range.to : chars.length;
    const offset = text.indexOf(query), hitEnd = offset + query.length;
    chars.forEach((char, at) => { const state = range && index >= range.start && index <= range.end && at >= from && at < to ? "selected" : query && offset >= 0 && at >= offset && at < hitEnd ? "hit" : ""; if (state !== previous) { flush(`${index}-${at}`); previous = state; } chunk += char; }); flush(`${index}-end`); return nodes;
  }
  const items = data.project?.items ?? [];
  function move(index: number, offset: number) { const next = [...items]; [next[index], next[index + offset]] = [next[index + offset]!, next[index]!]; void data.act(() => data.saveItems(next)); }
  function jump(direction: number) {
    const matches = transcript.map((row, index) => ({ row, index })).filter(({ row }) => data.searched && row.text.includes(data.searched));
    if (!matches.length) return;
    const currentIndex = matches.findIndex(({ index }) => index === range?.start), target = matches[(currentIndex + direction + matches.length) % matches.length]!;
    data.setRange({ start: target.index, end: target.index, from: 0, to: Array.from(target.row.text).length });
    transcriptRef.current?.querySelector(`[data-row="${target.index}"]`)?.scrollIntoView({ block: "center" });
  }
  return <div className="retrieval-page"><h1 className="sr-only">文案检索</h1>
    {supplement && <div className="banner retrieval-context"><IconSparkles size={16} /><div><strong>为第 {supplement.segmentId} 句补选原声</strong><p>{supplement.target}</p><Button small icon={IconArrowLeft} onClick={onCancel}>返回原作品</Button></div></div>}
    <div className="row between retrieval-project-bar"><div className="row"><select aria-label="当前检索项目" value={data.projectId} onChange={event => data.setProjectId(event.target.value)}><option value="">剪切时自动建立项目</option>{data.projects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}</select><Button small icon={IconPlus} onClick={() => setDialog(true)}>新建项目</Button></div><div className="row"><Badge>原声剪切</Badge><Button small icon={IconListCheck} onClick={() => setShowClips(!showClips)}>切片清单 {items.length}</Button></div></div>
    <form className="panel retrieval-search row" onSubmit={event => { event.preventDefault(); void data.act(() => data.runSearch()); }}><IconSearch size={18} /><input aria-label="检索关键词" className="grow" placeholder="输入文案或关键词，定位可剪切片段" value={data.query} onChange={event => data.setQuery(event.target.value)} /><select aria-label="检索素材来源" value={data.scope} onChange={event => data.setScope(event.target.value)}><option value="public">公共素材</option><option value="local">本地素材</option><option value="all">全部素材</option></select><select aria-label="素材文件夹" value={data.folder} onChange={event => data.setFolder(event.target.value)}><option value="">全部文件夹</option>{data.folders.map(folder => <option key={folder.name}>{folder.name}</option>)}</select><select aria-label="视频方向" value={data.orientation} onChange={event => data.setOrientation(event.target.value)}><option value="all">全部方向</option><option value="portrait">竖屏</option><option value="landscape">横屏</option></select><Button variant="primary" disabled={data.busy} type="submit">{data.busy ? "读取中…" : "检索"}</Button></form>
    {data.failure && <Banner tone="amber">{data.failure}</Banner>}
    <div className="retrieval-workbench"><section><div className="workbench-heading"><h2>匹配素材 <span>{hits.length}</span></h2></div><div className="candidate-scroll">{hits.map(hit => <button className={`retrieval-source ${detail?.source_video_id === hit.id ? "selected" : ""}`} key={hit.id} onClick={() => void data.act(() => data.choose(hit.id, hit.kind))}>{hit.cover && <img src={hit.cover} alt="素材封面" />}<div><strong>{hit.title}</strong><span>{hit.kind === "local" ? "本地素材" : "公共素材"}</span><small>{hit.text}</small></div></button>)}{!hits.length && <Empty>{data.busy ? "正在读取素材" : "没有匹配素材"}</Empty>}{(data.searched ? data.search.has_more : data.library.videos.length < data.library.available_video_count) && data.scope !== "local" && <Button small disabled={data.busy} onClick={() => void data.act(() => data.searched ? data.runSearch(true) : data.loadLibrary(true))}>继续加载</Button>}</div></section>
      <section className="retrieval-transcript" aria-label="视频文案拖选面板"><div className="row between workbench-heading"><h2>视频文案</h2><div className="row"><button className="text-btn" onClick={() => jump(-1)}>上一个</button><button className="text-btn" onClick={() => jump(1)}>下一个</button></div></div><div className="transcript-caption"><span>{detail?.title ?? "选择左侧素材"}</span><span>拖选文字即可确定剪切范围</span></div><div className="natural-transcript" ref={transcriptRef} onMouseUp={drag}>{transcript.map((row, index) => <div className={`natural-transcript-row ${timeStart === index ? "time-pending" : ""}`} data-row={index} key={`${detail?.source_video_id}-${row.segment_id}`}><button className="transcript-time" aria-label={`${duration(row.begin_ms)} 作为选区时间点`} aria-pressed={timeStart === index} onMouseDown={event => event.preventDefault()} onClick={event => selectTime(index, event)}>{duration(row.begin_ms)}</button><span data-transcript-text={index} className="natural-transcript-text">{textRow(row.text, index)}</span></div>)}{!detail && <Empty>选择素材后，完整文案会显示在这里</Empty>}</div><div className="transcript-help">{timeStart !== null ? "再点击一个时间点，选择连续文案。" : "支持句内、跨句与反向拖选 · 空格试听 · Enter 剪切"}</div></section>
      <aside className="retrieval-selection" aria-label="画面验证与选区剪切">{detail ? <div className="real-media"><video ref={videoRef} key={detail.source_video_id} controls preload="metadata" src={detail.media_url} poster={detail.cover_url} onPause={() => setPlaying(false)} onTimeUpdate={() => { if (playing && current && videoRef.current && videoRef.current.currentTime >= current.end_ms / 1000) { videoRef.current.pause(); setPlaying(false); } }} onError={() => setPlaying(false)} /></div> : <Empty>源视频预览</Empty>}<div className="preview-position"><span>{valid && current ? `${duration(current.begin_ms)} – ${duration(current.end_ms)}` : "等待拖选文案"}</span><span>素材原声</span></div><div className="row between selection-heading"><h2>选区信息</h2>{valid && current && <Badge tone="blue">{((current.end_ms - current.begin_ms) / 1000).toFixed(1)} 秒</Badge>}</div><div className={`selection-copy ${selected ? "has-selection" : ""}`}>{selected?.selected_text || "在中间的视频文案中，按住鼠标拖选想剪下的文字。"}</div>{selected && <><div className="row selection-actions"><Button disabled={!valid} icon={playing ? IconPlayerPause : IconPlayerPlay} onClick={() => void preview()}>{playing ? "暂停试听" : "试听选区"}</Button><Button variant="primary" disabled={!valid || data.busy} icon={IconScissors} onClick={() => void cut()}>{supplement ? "使用并返回审核" : "剪切这段"}</Button></div><div className="row between selection-secondary"><button className="text-btn" onClick={clear}>取消选区</button>{!supplement && <button className="text-btn" disabled={!valid || data.busy} onClick={() => void data.act(async () => { await data.saveItems([...items, current!]); setShowClips(true); })}>加入清单</button>}</div><details className="selection-fine"><summary>微调剪切边界</summary><div className="trim-fields"><label>入点（秒）<input type="number" step="0.01" aria-label="入点（秒）" value={inPoint} onChange={event => { setInPoint(event.target.value); setAnchor(null); }} /></label><label>出点（秒）<input type="number" step="0.01" aria-label="出点（秒）" value={outPoint} onChange={event => { setOutPoint(event.target.value); setAnchor(null); }} /></label></div></details></>}
      <div className="selection-fine"><label>剪切方式</label><select aria-label="剪切方式" value={data.mode} onChange={event => data.setMode(event.target.value as typeof data.mode)}><option value="precise">精确剪切</option><option value="smart">智能快速剪切</option><option value="copy">极速无损剪切</option></select><p className="small muted">选区时间按转写片段定位，可试听并微调边界。</p></div>{data.jobs.jobs.length > 0 && <section className="retrieval-recent"><div className="row between"><h2>最近剪切任务</h2><button className="text-btn" onClick={onTasks}>查看全部</button></div>{data.jobs.jobs.slice(0, 2).map(job => <div className="retrieval-recent-job" key={job.cut_job_id}><Badge tone={job.status === "done" ? "green" : job.status === "failed" ? "red" : job.status === "pending" ? "amber" : "blue"}>{({ done: "已完成", failed: "需处理", pending: "等待中", running: "剪切中", cancelled: "已取消" })[job.status]}</Badge><p>{job.selected_text}</p></div>)}</section>}</aside>
    </div>
    {valid && anchor && <div className="drag-selection-bar" role="toolbar" aria-label="拖选后剪切操作" style={anchor}><span>已选 {((current!.end_ms - current!.begin_ms) / 1000).toFixed(1)} 秒</span><Button small variant="primary" disabled={data.busy} icon={IconScissors} onClick={() => void cut()}>{supplement ? "使用片段" : "剪切这段"}</Button></div>}
    {showClips && !supplement && <section className="panel clip-tray"><div className="panel-head"><h2>切片清单 · {items.length} 段</h2><div className="row">{pro && <Button small icon={IconSparkles} disabled={!items.length} onClick={() => onSmart(items.map(item => item.selected_text).join("\n"))}>转为文案成片</Button>}<Button small variant="primary" disabled={!items.length || data.busy} onClick={() => setExportOpen(true)}>导出清单</Button></div></div><div className="clip-items">{items.map((item, index) => <div className="clip-item" key={`${index}-${item.source_video_id}`}><span className="clip-number">{index + 1}</span><div className="grow"><strong>{item.selected_text}</strong><p>{item.source_title} · {duration(item.begin_ms)} – {duration(item.end_ms)}</p></div><button className="icon-btn" aria-label={`上移片段${index + 1}`} disabled={index === 0 || data.busy} onClick={() => move(index, -1)}><IconArrowUp size={15} /></button><button className="icon-btn" aria-label={`下移片段${index + 1}`} disabled={index === items.length - 1 || data.busy} onClick={() => move(index, 1)}><IconArrowDown size={15} /></button><button className="icon-btn" aria-label={`移除片段${index + 1}`} disabled={data.busy} onClick={() => void data.act(() => data.saveItems(items.filter((_, at) => at !== index)))}><IconTrash size={15} /></button></div>)}</div></section>}
    {exportOpen && <Modal title="提交检索剪辑任务" onClose={() => setExportOpen(false)} footer={<><Button onClick={() => setExportOpen(false)}>取消</Button><Button variant="primary" disabled={!items.length || data.busy} onClick={() => void data.act(async () => { await data.cut(items, exportMode === "merged"); setExportOpen(false); onTasks(); })}>提交本机任务</Button></>}><p>清单 {items.length} 段 · 按当前清单顺序处理。</p><div className="form-group"><label htmlFor="retrieval-export-mode">输出方式</label><select id="retrieval-export-mode" value={exportMode} onChange={event => setExportMode(event.target.value)}><option value="separate">每个片段独立导出</option><option value="merged">按清单顺序合并</option></select></div><p className="module-note">合并保留原声，画面按第一段方向适配；片段仍会保存为可复剪素材。字幕与来源记录一并保存。</p></Modal>}
    {dialog && <Modal title="新建检索项目" onClose={() => setDialog(false)} footer={<><Button onClick={() => setDialog(false)}>取消</Button><Button variant="primary" disabled={!name.trim() || data.busy} onClick={() => void data.act(async () => { await data.createProject(name); setName(""); setDialog(false); })}>创建项目</Button></>}><label>项目名称<input value={name} onChange={event => setName(event.target.value)} style={{ width: "100%" }} /></label></Modal>}
  </div>;
}
