import { readFile } from "node:fs/promises";
import { SmartError, includedSegments, type Job } from "./types.ts";

export interface ExportSource {
  segment_id: number;
  source_video_id: string;
  title: string;
  text: string;
  begin_ms: number;
  end_ms: number;
  output_begin_ms: number;
  output_end_ms: number;
  rotation: number;
}
export interface ExportComparison {
  job_id: string;
  sources: ExportSource[];
  reference: { id: string; title: string; available: boolean; status: string; error: string } | null;
}
export async function exportSources(job: Job): Promise<ExportSource[]> {
  if (job.status !== "done") throw new SmartError("output_missing", "成片尚未完成", 409);
  const manifest = JSON.parse(await readFile(job.manifest_path, "utf8")) as {
    job_id: string; sources: Array<{ work_segment_id: number; source_video_id: string; output_begin_ms: number; output_end_ms: number }>;
  };
  if (manifest.job_id !== job.id || !Array.isArray(manifest.sources)) throw new SmartError("source_manifest", "成片来源记录不完整，无法可靠对比", 409);
  return includedSegments(job.work).map(segment => {
    const candidate = segment.selected!;
    const entry = manifest.sources.find(item => item.work_segment_id === segment.id && item.source_video_id === candidate.source_video_id);
    if (!entry || !Number.isFinite(entry.output_begin_ms) || !Number.isFinite(entry.output_end_ms) || entry.output_end_ms <= entry.output_begin_ms) throw new SmartError("source_manifest", "片段时间映射不完整，无法可靠对比", 409);
    return { segment_id: segment.id, source_video_id: candidate.source_video_id, title: candidate.source_title, text: segment.actual,
      begin_ms: candidate.begin_ms, end_ms: candidate.end_ms, output_begin_ms: entry.output_begin_ms, output_end_ms: entry.output_end_ms, rotation: candidate.rotation ?? 0 };
  });
}
