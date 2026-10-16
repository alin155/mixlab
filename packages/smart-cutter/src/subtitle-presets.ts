export interface SubtitleTemplate {
  id: string;
  version: number;
  name: string;
  font: "Noto Serif SC" | "Noto Sans SC";
  bold: boolean;
  size: number;
  bottom: number;
  color: string;
  accent: string;
  keywords: string[];
  highlight_lead?: boolean;
  outline: number;
  box: boolean;
  fade: boolean;
  spacing: number;
  line_chars: number;
  max_lines: 2;
  side_margin: number;
}
const base: SubtitleTemplate = { id: "quiet", version: 1, name: "沉静访谈", font: "Noto Serif SC", bold: false,
  size: 70, bottom: 0.12, color: "#f0ede6", accent: "#ffe06a", keywords: [], highlight_lead: false, outline: 1.2, box: false,
  fade: true, spacing: 3, line_chars: 13, max_lines: 2, side_margin: 0.08 };
export const SYSTEM_TEMPLATES: readonly SubtitleTemplate[] = [
  base,
  { ...base, id: "clear", name: "清晰口播", font: "Noto Sans SC", bold: true, size: 64, color: "#ffffff", outline: 2.4, spacing: 0, fade: false },
  { ...base, id: "emphasis", version: 2, name: "重点标色", font: "Noto Sans SC", bold: true, size: 68, color: "#ffffff", outline: 3, spacing: 0, fade: false, highlight_lead: true },
  { ...base, id: "contrast", name: "高对比底板", font: "Noto Sans SC", size: 62, color: "#ffffff", outline: 10, spacing: 0, box: true, fade: false }
];
