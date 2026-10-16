import { SmartError, type Composition, type OutputSettings } from "./types.ts";

export const SUBTITLE_STYLES = {
  white: { label: "清晰白字", color: "#ffffff", outline: 2.4, bold: false, box: false, fade: false },
  yellow: { label: "醒目黄字", color: "#ffe900", outline: 2.4, bold: false, box: false, fade: false },
  outline: { label: "粗体描边", color: "#ffffff", outline: 4, bold: true, box: false, fade: false },
  box: { label: "半透明底板", color: "#ffffff", outline: 8, bold: false, box: true, fade: false },
  cinema: { label: "简约电影", color: "#fff4dc", outline: 1.2, bold: false, box: false, fade: true },
  pop: { label: "活力弹入", color: "#ffe900", outline: 4, bold: true, box: false, fade: true }
} as const;

/** A fixed scale per shot avoids zoom pumping; all shots share one feasible face ratio. */
export function unifyPortraits(compositions: Composition[], settings: OutputSettings): void {
  const ratio = settings.ratio === "9:16" ? 9 / 16 : 16 / 9;
  const measurements = compositions.map(composition => {
    const heights = composition.points.map(point => point.height ?? 0).filter(value => value > 0 && value < 1).sort((a, b) => a - b);
    if (!composition.usable || !heights.length || !composition.source_aspect) throw new SmartError("composition_review", composition.reason || "无法稳定测量人物大小，请更换素材或选择跟随主讲人/保留全景", 409);
    const face = heights[Math.floor(heights.length / 2)]!;
    const full = Math.min(1, composition.source_aspect / ratio);
    return { composition, face, full };
  });
  const lower = Math.max(...measurements.map(item => item.face / item.full));
  const upper = Math.min(...measurements.map(item => item.face / item.full * 3));
  if (lower > upper || lower > 0.5) throw new SmartError("composition_review", "素材远近差异过大，无法在三倍裁切范围内统一人物大小；请替换极近/极远素材，或选择跟随主讲人", 409);
  const preferred = settings.shot_size === "wide" ? 0.18 : settings.shot_size === "close" ? 0.3 : 0.24;
  const target = Math.max(lower, Math.min(upper, preferred));
  for (const { composition, face } of measurements) {
    composition.crop_height = face / target;
    composition.target_face_ratio = target;
  }
}
