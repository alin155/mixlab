import React, { useEffect, useRef, useState, type ElementType } from "react";
import { IconAlertTriangle, IconChevronRight, IconX, IconMovie } from "@tabler/icons-react";
import { Button as FoundationButton, Badge as FoundationBadge, type BadgeTone } from "../../../packages/ui-foundation/src/index.ts";
import { sourceUrl, modeName, originName, duration, type WorkOrigin, type Candidate } from "./api.ts";

export function Button({ children, icon: Icon, variant = "", small, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ElementType; variant?: string; small?: boolean }) {
  return <FoundationButton {...props} variant={variant === "primary" || variant === "danger" ? variant : "secondary"} size={small ? "sm" : "md"} className={`btn ${variant} ${small ? "small-btn" : ""}`} leadingIcon={Icon ? <Icon size={15} stroke={1.7} /> : undefined}>{children}</FoundationButton>;
}
export function Badge({ children, tone = "" }: { children: React.ReactNode; tone?: string }) { return <FoundationBadge className={`badge ${tone}`} tone={({ green: "success", blue: "info", amber: "warning", red: "danger" } as Record<string, BadgeTone>)[tone] ?? "neutral"}>{children}</FoundationBadge>; }
export function Banner({ children, tone = "" }: { children: React.ReactNode; tone?: string }) { return <div className={`banner ${tone}`}><IconAlertTriangle size={17} /><div>{children}</div></div>; }
export function Header({ title, subtitle, children }: { title: string; subtitle: string; children?: React.ReactNode }) { return <div className="page-head"><div><h1>{title}</h1><p>{subtitle}</p></div><div className="row">{children}</div></div>; }
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) { return <button type="button" className={`switch ${checked ? "on" : ""}`} role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}><span /></button>; }
export function Steps({ active }: { active: number }) { return <div className="steps">{["输入文案", "匹配审核", "成片调整", "本机导出"].map((label, index) => <div className={`step ${index <= active ? "active" : ""}`} key={label}><span className="step-num">{index + 1}</span>{label}</div>)}</div>; }
export function Origin({ origin }: { origin: WorkOrigin }) { return <><Badge tone={origin.trigger === "automatic" ? "blue" : ""}>{modeName(origin)}</Badge><span>{originName(origin)}</span>{origin.account_name && <span>{origin.account_name}</span>}{origin.rule_name && <span>规则：{origin.rule_name}</span>}</>; }
export function Empty({ children }: { children: React.ReactNode }) { return <div className="empty"><IconMovie size={27} stroke={1.5} /><p style={{ marginTop: 12 }}>{children}</p></div>; }
export function Modal({ title, children, footer, onClose, wide }: { title: string; children: React.ReactNode; footer?: React.ReactNode; onClose: () => void; wide?: boolean }) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current!;
    (dialog.querySelector<HTMLElement>("input,textarea,select") || dialog.querySelector<HTMLElement>("button"))?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key === "Tab") {
        const controls = [...dialog.querySelectorAll<HTMLElement>("button,input,textarea,select,a[href],[tabindex]")].filter(element => !(element as HTMLButtonElement).disabled && element.offsetParent !== null);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("keydown", keyboard); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="modal-backdrop" onClick={onClose}><section ref={dialogRef} className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} onClick={event => event.stopPropagation()}><div className="modal-header"><h2>{title}</h2><button className="icon-btn" aria-label="关闭对话框" onClick={onClose}><IconX size={19} /></button></div><div className="modal-body">{children}</div>{footer && <div className="modal-foot">{footer}</div>}</section></div>;
}
export function MatchBadge({ status, accepted }: { status: string; accepted: boolean }) {
  return <Badge tone={status === "exact" || accepted ? "green" : status === "gap" || status === "conflict" ? "red" : "amber"}>{status === "exact" ? "原文匹配" : status === "gap" ? "缺少片段" : status === "conflict" ? "事实冲突 · 需修改" : accepted ? "近似已确认" : "近似 · 待确认"}</Badge>;
}
export function SourcePlayer({ workId, segmentId, candidate, className = "", children }: { workId: string; segmentId: number; candidate: Candidate | null; className?: string; children?: React.ReactNode }) {
  const video = useRef<HTMLVideoElement>(null);
  const [failure, setFailure] = useState("");
  useEffect(() => { setFailure(""); }, [candidate?.id]);
  if (!candidate) return <Empty>尚未选择可播放片段</Empty>;
  const begin = 0, end = (candidate.end_ms - candidate.begin_ms) / 1000;
  return <div className={`real-media ${className}`}><video ref={video} key={candidate.id} controls preload="metadata" src={sourceUrl(workId, segmentId, "media", candidate.id)}
    onLoadedMetadata={() => { if (video.current) video.current.currentTime = begin; }}
    onTimeUpdate={() => { if (video.current && video.current.currentTime >= end) { video.current.pause(); video.current.currentTime = begin; } }}
    onError={() => setFailure("此源片段暂时无法播放，请检查素材连接和媒体格式")}/>{children}{failure && <div className="media-error">{failure}</div>}<span className="real-source-range">源片段 {duration(candidate.begin_ms)} – {duration(candidate.end_ms)}</span></div>;
}
