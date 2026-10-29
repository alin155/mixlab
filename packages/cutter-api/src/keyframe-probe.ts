export interface CutKeyframeProbePlanInput {
  source_path: string;
  begin_ms: number;
  search_window_ms?: number;
}

const DEFAULT_SEARCH_WINDOW_MS = 10_000;

function formatSeconds(milliseconds: number): string {
  return (milliseconds / 1000).toFixed(3);
}

function parseNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Windows ffprobe 版本通常输出 best_effort_timestamp_time / pkt_pts_time，
 * 而不是 pts_time；显式请求 best_effort_timestamp_time 并兼容旧字段，
 * 避免 copy 模式因解析不到关键帧而全部误降级 precise。
 */
export function buildCutKeyframeProbeArgs(input: CutKeyframeProbePlanInput): string[] {
  const beginMs = Number.isFinite(input.begin_ms) ? Math.max(0, input.begin_ms) : 0;
  const windowMs = Number.isFinite(input.search_window_ms)
    ? Math.max(1_000, Math.floor(input.search_window_ms!))
    : DEFAULT_SEARCH_WINDOW_MS;
  const windowStartMs = Math.max(0, beginMs - windowMs);
  const windowEndMs = beginMs + 1_000;

  return [
    "-v",
    "error",
    "-print_format",
    "json",
    "-select_streams",
    "v:0",
    "-skip_frame",
    "nokey",
    "-show_entries",
    "frame=key_frame,best_effort_timestamp_time",
    "-read_intervals",
    `${formatSeconds(windowStartMs)}%${formatSeconds(windowEndMs)}`,
    input.source_path
  ];
}

/** 解析真实关键帧时间点（毫秒，升序去重），兼容不同 ffprobe 版本的字段名。 */
export function parseCutKeyframeProbeTimes(stdout: string): number[] {
  const output = JSON.parse(stdout) as {
    frames?: Array<{
      pts_time?: unknown;
      pkt_pts_time?: unknown;
      best_effort_timestamp_time?: unknown;
    }>;
  };
  const frames = Array.isArray(output.frames) ? output.frames : [];
  const times = new Set<number>();

  for (const frame of frames) {
    const rawTime = frame?.pts_time ?? frame?.pkt_pts_time ?? frame?.best_effort_timestamp_time;
    const seconds = parseNumber(rawTime);
    if (seconds !== undefined && seconds >= 0) {
      times.add(Math.round(seconds * 1000));
    }
  }

  return [...times].sort((left, right) => left - right);
}
