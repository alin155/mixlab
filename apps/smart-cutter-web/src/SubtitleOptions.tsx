import React from "react";
import { Button, Switch } from "./components.tsx";
import { SUBTITLE_STYLES } from "../../../packages/smart-cutter/src/presentation.ts";
import type { OutputSettings } from "./api.ts";

export function subtitlePreviewStyle(settings: OutputSettings): React.CSSProperties {
  const style = SUBTITLE_STYLES[settings.subtitle_style];
  return { color: style.color, fontSize: Math.max(12, settings.subtitle_size * 0.23), fontWeight: style.bold ? 800 : 400,
    bottom: `${(settings.subtitle_margin ?? (100 / (settings.ratio === "9:16" ? 1920 : 1080))) * 100}%`,
    background: style.box ? "#0008" : "transparent", padding: style.box ? "4px 8px" : undefined,
    WebkitTextStroke: style.box ? undefined : `${style.outline * 0.23}px #101010`, paintOrder: "stroke fill",
    textShadow: style.box ? "none" : "0 1px 2px #000" };
}
export function SubtitleOptions({ output, edit }: { output: OutputSettings; edit: <K extends keyof OutputSettings>(key: K, value: OutputSettings[K]) => void }) {
  const margin = output.subtitle_margin ?? 100 / (output.ratio === "9:16" ? 1920 : 1080);
  return <><div className="scope-line"><span>烧录字幕</span><Switch label="烧录字幕" checked={output.subtitles} onChange={value => edit("subtitles", value)} /></div>
    <div className="form-group"><label>字幕模板</label><div className="subtitle-presets">{Object.entries(SUBTITLE_STYLES).map(([key, style]) => <Button key={key} small aria-pressed={output.subtitle_style === key} variant={output.subtitle_style === key ? "primary" : ""} onClick={() => edit("subtitle_style", key as OutputSettings["subtitle_style"])}>{style.label}</Button>)}</div></div>
    <div className="form-group"><label htmlFor="subtitle-size">成片字号 · {output.subtitle_size}</label><input id="subtitle-size" type="range" min="24" max="100" value={output.subtitle_size} onChange={event => edit("subtitle_size", Number(event.target.value))} /></div>
    <div className="form-group"><label htmlFor="subtitle-margin">距画面底部 · {Math.round(margin * 100)}%</label><input id="subtitle-margin" type="range" min="0.03" max="0.4" step="0.01" value={margin} onChange={event => edit("subtitle_margin", Number(event.target.value))} /></div>
    <p className="module-note">模板、字号和位置用于烧录成片；同时保存不带样式的 SRT。弹入与淡入按整句呈现。</p></>;
}
