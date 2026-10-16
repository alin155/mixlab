import { SmartError, boundedNumber, type OutputSettings } from "./types.ts";
import type { SubtitleTemplate } from "./subtitle-presets.ts";
export { SYSTEM_TEMPLATES, type SubtitleTemplate } from "./subtitle-presets.ts";

/** Copy all resolved values into the job; later preset edits cannot alter historical exports. */
export function resolvedTemplate(settings: OutputSettings): SubtitleTemplate | null {
  return settings.subtitle_template ? { ...settings.subtitle_template, keywords: [...settings.subtitle_template.keywords], size: settings.subtitle_size,
    bottom: settings.subtitle_margin ?? settings.subtitle_template.bottom } : null;
}
export function validateTemplate(value: unknown): SubtitleTemplate {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SmartError("subtitle_template", "字幕模板格式无效");
  const v = value as Record<string, unknown>;
  const text = (key: string, max: number) => { if (typeof v[key] !== "string" || !v[key].trim() || v[key].length > max || /[\r\n,]/u.test(v[key])) throw new SmartError("subtitle_template", "字幕模板名称或标识无效"); return v[key] as string; };
  const color = (key: string) => { if (typeof v[key] !== "string" || !/^#[0-9a-f]{6}$/iu.test(v[key])) throw new SmartError("subtitle_template", "字幕颜色无效"); return v[key] as string; };
  const flag = (key: string) => { if (typeof v[key] !== "boolean") throw new SmartError("subtitle_template", "字幕模板开关无效"); return v[key] as boolean; };
  if (!["Noto Serif SC", "Noto Sans SC"].includes(String(v.font)) || v.max_lines !== 2 || !Number.isInteger(v.version) || Number(v.version) < 1) throw new SmartError("subtitle_template", "字幕字体、版本或行数无效");
  if (!Array.isArray(v.keywords) || v.keywords.length > 10 || v.keywords.some(word => typeof word !== "string" || !word.trim() || Array.from(word).length > 12 || /[\r\n{}\\]/u.test(word))) throw new SmartError("subtitle_template", "最多设置 10 个关键词，每个不超过 12 字");
  return { id: text("id", 80), version: Number(v.version), name: text("name", 30), font: v.font as SubtitleTemplate["font"],
    bold: flag("bold"), box: flag("box"), fade: flag("fade"), color: color("color"), accent: color("accent"), keywords: [...new Set(v.keywords as string[])],
    size: boundedNumber(v.size, 24, 100, "字幕字号"), bottom: boundedNumber(v.bottom, 0.03, 0.4, "字幕位置"),
    outline: boundedNumber(v.outline, 0, 12, "字幕描边"), spacing: boundedNumber(v.spacing, 0, 5, "字幕字距"),
    line_chars: boundedNumber(v.line_chars, 8, 20, "每行字数"), max_lines: 2, side_margin: boundedNumber(v.side_margin, 0.05, 0.2, "字幕安全边距") };
}

const units = (value: string) => Array.from(value).reduce((sum, char) => sum + (/[\x00-\xff]/u.test(char) ? 0.55 : 1), 0);
function wrap(text: string, capacity: number): string[] {
  const lines: string[] = []; let line = "";
  for (const char of Array.from(text.replace(/[\r\n]+/gu, " "))) {
    if (line && units(line + char) > capacity && !/[，。！？、；：,.!?;:]/u.test(char)) {
      const boundary = [...line.matchAll(/[，。！？、；：,.!?;: ]/gu)].at(-1)?.index;
      if (boundary !== undefined && units(line.slice(0, boundary + 1)) >= capacity * 0.55) { lines.push(line.slice(0, boundary + 1)); line = line.slice(boundary + 1); }
      else { lines.push(line); line = ""; }
    }
    line += char;
  }
  if (line) lines.push(line);
  return lines;
}
export function captionLayout(text: string, template: SubtitleTemplate, ratio: OutputSettings["ratio"]): { lines: string[]; size: number; reduced: boolean } {
  const width = ratio === "9:16" ? 1080 : 1920;
  const area = width * (1 - 2 * template.side_margin);
  let size = template.size;
  // A source sentence has one real interval. Fit it without inventing intra-sentence timestamps.
  let capacity = Math.min(template.line_chars, area / (size + template.spacing));
  let lines = wrap(text, capacity);
  while (lines.length > template.max_lines && size > 16) {
    size--; capacity = area / (size + template.spacing); lines = wrap(text, capacity);
  }
  if (lines.length > template.max_lines) throw new SmartError("subtitle_timing", "原句过长，现有句段时间戳无法支持清晰的两行字幕；请先在管理端细分转写，或关闭烧录字幕", 409);
  return { lines, size, reduced: size < template.size };
}
