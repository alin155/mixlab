import React, { useEffect, useState } from "react";
import { Card } from "../../../packages/ui-foundation/src/index.ts";
import { Button, Switch, Modal, Banner } from "./components.tsx";
import { SUBTITLE_STYLES } from "../../../packages/smart-cutter/src/presentation.ts";
import { SYSTEM_TEMPLATES, resolvedTemplate, type SubtitleTemplate } from "../../../packages/smart-cutter/src/templates.ts";
import { request, mediaUrl, type OutputSettings } from "./api.ts";

export function subtitlePreviewStyle(settings: OutputSettings): React.CSSProperties {
  const style = resolvedTemplate(settings) ?? SUBTITLE_STYLES[settings.subtitle_style];
  return { color: style.color, fontSize: Math.max(12, settings.subtitle_size * 0.23), fontWeight: style.bold ? 800 : 400,
    fontFamily: settings.subtitle_template?.font === "Noto Serif SC" ? '"Songti SC", SimSun, serif' : undefined,
    bottom: `${(settings.subtitle_margin ?? (100 / (settings.ratio === "9:16" ? 1920 : 1080))) * 100}%`,
    background: style.box ? "#0008" : "transparent", padding: style.box ? "4px 8px" : undefined,
    WebkitTextStroke: style.box ? undefined : `${style.outline * 0.23}px #101010`, paintOrder: "stroke fill",
    textShadow: style.box ? "none" : "0 1px 2px #000" };
}
const descriptions: Record<string, string> = { quiet: "默认 · 暖白宋体淡入", clear: "清晰黑体 · 轻描边", emphasis: "整句稳定 · 关键词标色", contrast: "半透明底板 · 强可读性" };
type Preview = { id: string; duration_ms: number; warnings: string[]; settings: string };
export function SubtitleOptions({ output, edit, workId }: { workId: string; output: OutputSettings; edit: <K extends keyof OutputSettings>(key: K, value: OutputSettings[K]) => void }) {
  const [mine, setMine] = useState<SubtitleTemplate[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [show, setShow] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const template = resolvedTemplate(output);
  const margin = output.subtitle_margin ?? 100 / (output.ratio === "9:16" ? 1920 : 1080);
  useEffect(() => { void request<SubtitleTemplate[]>("/smart/subtitle-templates").then(setMine).catch(error => setMessage(error.message)); }, []);
  async function generate(settings: OutputSettings) {
    setBusy(true); setMessage(""); setShow(true); setPreview(null);
    try { const result = await request<Omit<Preview, "settings">>(`/smart/works/${workId}/template-preview`, "POST", { settings }); setPreview({ ...result, settings: JSON.stringify(settings) }); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  function apply(value: SubtitleTemplate) {
    const next = { ...output, subtitles: true, subtitle_template: structuredClone(value), subtitle_size: value.size, subtitle_margin: value.bottom };
    edit("subtitle_template", next.subtitle_template); edit("subtitle_size", value.size); edit("subtitle_margin", value.bottom); edit("subtitles", true);
    void generate(next);
  }
  async function save() {
    setBusy(true); setMessage("");
    try { const saved = await request<SubtitleTemplate>("/smart/subtitle-templates", "POST", { name, settings: output }); setMine(previous => [saved, ...previous]); setName(""); setMessage("已另存为我的模板，下次可直接选用"); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return <><div className="scope-line"><span>烧录字幕</span><Switch label="烧录字幕" checked={output.subtitles} onChange={value => edit("subtitles", value)} /></div>
    <div className="scope-line"><span>自动纠正同音错字</span><Switch label="自动纠正同音错字" checked={!!output.subtitle_correction} onChange={value => edit("subtitle_correction", value)} /></div><p className="module-note">使用设置中的 DashScope Key 校对，保留原始转写及纠错记录；数字、否定和实体不改，不确定时进入审核。</p>
    <div className="form-group"><label>系统模板 · 点击查看真实短预览</label><div className="subtitle-presets">{SYSTEM_TEMPLATES.map(value => <Card key={value.id} selected={template?.id === value.id} bodyFlush bodyClassName="template-card-content"><span className={`template-swatch template-${value.id}`}><span>心宽一点<br /><em>善待自己</em></span></span><small>{descriptions[value.id]}</small><Button small disabled={busy} aria-pressed={template?.id === value.id} variant={template?.id === value.id ? "primary" : ""} onClick={() => apply(value)}>{value.name}</Button></Card>)}</div></div>
    {!template && <p className="module-note">当前作品保留旧版样式；选择系统模板后才会替换。</p>}
    {mine.length > 0 && <div className="form-group"><label htmlFor="my-template">我的模板</label><select id="my-template" disabled={busy} value={mine.some(item => item.id === template?.id) ? template!.id : ""} onChange={event => { const selected = mine.find(item => item.id === event.target.value); if (selected) apply(selected); }}><option value="">选择已保存的模板</option>{mine.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>}
    <div className="form-group"><label htmlFor="subtitle-size">成片字号 · {output.subtitle_size}</label><input id="subtitle-size" type="range" min="24" max="100" value={output.subtitle_size} onChange={event => edit("subtitle_size", Number(event.target.value))} /></div>
    <div className="form-group"><label htmlFor="subtitle-margin">距画面底部 · {Math.round(margin * 100)}%</label><input id="subtitle-margin" type="range" min="0.03" max="0.4" step="0.01" value={margin} onChange={event => edit("subtitle_margin", Number(event.target.value))} /></div>
    {template && <>
      <div className="form-group"><label htmlFor="subtitle-keywords">标色关键词（逗号分隔，最多 10 个）</label><input id="subtitle-keywords" key={template.id} defaultValue={template.keywords.join("，")} onChange={event => edit("subtitle_template", { ...template, keywords: event.target.value.split(/[,，]/u).map(word => word.trim()).filter(Boolean) })} placeholder="例如：自己，成长" /><p className="module-note">{template.highlight_lead ? "留空时强调每句开头不超过 12 字的完整短语；填写后仅标色指定词。" : "仅标色原声文案中实际出现的词，不改变文字内容。"}</p></div>
      <div className="form-group"><label htmlFor="subtitle-accent">关键词颜色</label><input id="subtitle-accent" type="color" value={template.accent} onChange={event => edit("subtitle_template", { ...template, accent: event.target.value })} /></div>
      <div className="form-group"><label htmlFor="template-name">另存为我的模板</label><div className="template-save"><input id="template-name" maxLength={30} value={name} onChange={event => setName(event.target.value)} placeholder="输入模板名称" /><Button small disabled={busy || !name.trim()} onClick={() => void save()}>保存</Button></div></div>
    </>}
    <Button disabled={busy} onClick={() => void generate(output)}>{busy ? "正在生成真实预览…" : "生成 8 秒真实预览"}</Button>
    {message && <p role="status" className="module-note">{message}</p>}
    <p className="module-note">预览从作品开头截取，使用真实原声、人物构图与烧录字幕；短作品按实际时长。字幕沿用已有句段时间戳，长句仅缩小字号，不模拟逐词跟读。</p>
    <details><summary>旧版字幕样式</summary><div className="subtitle-presets">{Object.entries(SUBTITLE_STYLES).map(([key, style]) => <Button key={key} small aria-pressed={!template && output.subtitle_style === key} variant={!template && output.subtitle_style === key ? "primary" : ""} onClick={() => { edit("subtitle_template", null); edit("subtitle_style", key as OutputSettings["subtitle_style"]); }}>{style.label}</Button>)}</div></details>
    {show && <Modal title="真实短预览" wide onClose={() => setShow(false)} footer={<><Button onClick={() => setShow(false)}>继续调整</Button><Button disabled={busy} onClick={() => void generate(output)}>重新生成</Button></>}>
      {busy ? <Banner>正在本机处理已选素材、人物构图和字幕。首次读取素材或分析人物可能稍久。</Banner> : preview ? <>
        {preview.settings !== JSON.stringify(output) && <Banner tone="amber">设定已变化，当前视频对应上一次预览；请重新生成后确认效果。</Banner>}
        <video className="template-real-preview" key={preview.id} src={mediaUrl(`/smart/media/template-previews/${preview.id}`)} controls preload="metadata" />
        <p className="module-note">真实预览 · {(preview.duration_ms / 1000).toFixed(1)} 秒 · 发布前请检查人脸、字幕及抖音界面遮挡。</p>
        {preview.warnings.map(warning => <Banner tone="amber" key={warning}>{warning}</Banner>)}
      </> : <Banner tone="amber">{message || "预览未生成，请重试"}</Banner>}
    </Modal>}
  </>;
}
