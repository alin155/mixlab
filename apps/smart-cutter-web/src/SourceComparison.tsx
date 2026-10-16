import React, { useEffect, useRef, useState } from "react";
import { Button, Banner, Empty, Switch } from "./components.tsx";
import { request, mediaUrl, duration, type Job } from "./api.ts";
import type { ExportComparison, ExportSource } from "../../../packages/smart-cutter/src/provenance.ts";

export function SourceComparison({ job }: { job: Job }) {
  const [data, setData] = useState<ExportComparison | null>(null), [selectedId, setSelectedId] = useState(0);
  const [reference, setReference] = useState(false), [linked, setLinked] = useState(true), [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const film = useRef<HTMLVideoElement>(null), original = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let active = true;
    void request<ExportComparison>(`/smart/jobs/${job.id}/sources`).then(value => { if (active) { setData(value); setSelectedId(value.sources[0]?.segment_id ?? 0); } }).catch(failure => { if (active) setError((failure as Error).message); });
    return () => { active = false; };
  }, [job.id]);
  useEffect(() => {
    if (data?.reference?.status !== "downloading") return;
    let active = true;
    const timer = setInterval(() => { void request<ExportComparison>(`/smart/jobs/${job.id}/sources`).then(value => { if (active) setData(value); }).catch(failure => { if (active) setError((failure as Error).message); }); }, 1500);
    return () => { active = false; clearInterval(timer); };
  }, [job.id, data?.reference?.status]);
  const selected = data?.sources.find(item => item.segment_id === selectedId);
  async function act(operation: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await operation(); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  function sync() {
    if (!linked || reference || !data || !film.current) return;
    const time = film.current.currentTime * 1000;
    const current = data.sources.find(item => time >= item.output_begin_ms && time < item.output_end_ms) ?? data.sources.at(-1);
    if (!current) return;
    if (current.segment_id !== selectedId) { setSelectedId(current.segment_id); return; }
    align(current);
  }
  function align(source = selected) {
    if (!source || !film.current || !original.current || !original.current.readyState || reference) return;
    const time = Math.max(0, Math.min((source.end_ms - source.begin_ms) / 1000, film.current.currentTime - source.output_begin_ms / 1000));
    if (Math.abs(original.current.currentTime - time) > 0.3) original.current.currentTime = time;
    if (linked && !film.current.paused) { original.current.muted = true; void original.current.play().catch(() => undefined); }
    else if (linked) original.current.pause();
  }
  function choose(source: ExportSource) {
    setError(""); setReference(false); setSelectedId(source.segment_id);
    if (film.current) film.current.currentTime = source.output_begin_ms / 1000;
  }
  return <div className="source-comparison">
    {error && <Banner tone="amber">{error}</Banner>}
    {!data ? <Empty>{error ? "来源信息暂不可读取" : "正在读取这版成片的来源…"}</Empty> : <>
      <div className="row between"><div className="row"><Button small variant={!reference ? "primary" : ""} onClick={() => { setReference(false); original.current?.pause(); }}>素材原片</Button><Button small variant={reference ? "primary" : ""} onClick={() => { setReference(true); film.current?.pause(); }}>热点参考原视频</Button></div>{!reference && <div className="row"><span className="small">联动播放</span><Switch label="联动播放" checked={linked} onChange={value => { setLinked(value); if (!value) original.current?.pause(); }} /></div>}</div>
      <div className="comparison-players">
        <section><h3>本地成片</h3><video ref={film} aria-label="本地成片播放器" controls preload="metadata" src={mediaUrl(`/smart/media/jobs/${job.id}/video`)} onTimeUpdate={sync} onSeeked={sync} onPlay={sync} onPause={() => { if (linked && !reference) original.current?.pause(); }} /></section>
        <section><h3>{reference ? "热点参考原视频" : `素材原片 · ${selected?.title ?? ""}`}</h3>{reference ? data.reference?.available ? <video key="reference" aria-label="热点参考原视频播放器" controls preload="metadata" src={mediaUrl(`/smart/media/hot/${encodeURIComponent(data.reference.id)}/video`)} /> : <div className="comparison-empty"><Empty>{data.reference ? "参考原视频尚未保存在本机" : "这条作品由手动文案创建，没有关联热点参考视频"}</Empty>{data.reference && <><p>{data.reference.title}</p>{data.reference.error && <p className="error-note">{data.reference.error}</p>}<Button disabled={busy || data.reference.status === "downloading"} onClick={() => void act(async () => { await request(`/smart/hot/${encodeURIComponent(data.reference!.id)}/download`, "POST", {}); setData(await request<ExportComparison>(`/smart/jobs/${job.id}/sources`)); })}>{data.reference.status === "downloading" ? "正在加载原视频…" : "加载参考原视频"}</Button></>}</div> : selected && <video key={selected.segment_id} ref={original} aria-label="素材原片播放器" controls={!linked} muted={linked} preload="metadata" src={mediaUrl(`/smart/media/jobs/${job.id}/sources/${selected.segment_id}/preview`)} onLoadedMetadata={() => align()} onError={() => setError("原片暂时无法播放，请检查素材库连接后重新打开对比。")} />}</section>
      </div>
      {reference ? <p className="module-note">参考原视频独立播放，方便比较文案、结构和表达；参考视频不作为拼接素材。</p> : selected && <div className="row between"><p className="small muted">原片 {duration(selected.begin_ms)}–{duration(selected.end_ms)} ↔ 成片 {duration(selected.output_begin_ms)}–{duration(selected.output_end_ms)}{selected.rotation ? ` · 方向已校正 ${selected.rotation}°` : ""}</p><div className="row"><Button small onClick={() => { setLinked(false); film.current?.pause(); if (original.current) { original.current.muted = false; void original.current.play().catch(() => undefined); } }}>单独听原声</Button><Button small disabled={busy} onClick={() => void act(() => request(`/smart/media/jobs/${job.id}/sources/${selected.segment_id}/open`, "POST", {}))}>打开完整原视频</Button></div></div>}
      {!reference && <p className="small muted">联动时由左侧控制播放，原片静音；可关闭联动或点击“单独听原声”。</p>}{!reference && <div className="comparison-sources" aria-label="成片来源片段">{data.sources.map(source => <div className="comparison-source" key={source.segment_id}><Button variant={source.segment_id === selectedId ? "primary" : ""} onClick={() => choose(source)}>文案第 {source.segment_id} 句 · {source.title}</Button><p>{source.text}</p></div>)}</div>}
    </>}
  </div>;
}
