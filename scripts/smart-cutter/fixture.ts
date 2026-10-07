import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { scanSourceVideos, claimNextPreprocessJob, completePreprocessArtifacts, publishIndexRequiredSourceVideos, readSourceVideoManifest } from "../../packages/library-fs/src/index.ts";
import { publishCutterRelease } from "../../packages/library-fs/src/cutter-release.ts";
import { normalizeTranscriptText, type TranscriptSegment } from "../../packages/protocol/src/index.ts";
import { resolveFfmpegRuntime } from "../../packages/ffmpeg-core/src/index.ts";
import { runProcess } from "../../packages/smart-cutter/src/process.ts";
import { fileDigest } from "../../packages/smart-cutter/src/media.ts";

/** Isolated acceptance fixture: generated tones and known text metadata, never production seed data. */
export async function createAcceptanceLibrary(root: string, faceImage?: string, lecturer = '验收讲师'): Promise<string> {
  const ffmpeg = resolveFfmpegRuntime();
  const source = path.join(root, "source-videos", "验收素材", "原声拼接验收.mp4");
  await mkdir(path.dirname(source), { recursive: true });
  const videoInput = faceImage ? ["-loop", "1", "-i", faceImage] : ["-f", "lavfi", "-i", "color=c=navy:size=640x360:rate=30"];
  await runProcess(ffmpeg.ffmpeg_path, ["-hide_banner", "-nostdin", "-y", ...videoInput,
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "4", "-vf", "scale=640:360,setsar=1", "-r", "30",
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source]);
  const time = "2026-10-07T10:00:00.000Z";
  await scanSourceVideos({ library_root: root, library_id: "smart-acceptance-only", library_name: "智能端隔离验收库", now: time });
  await claimNextPreprocessJob({ library_root: root, worker_id: "smart-acceptance", now: time });
  const videoId = "V000001", folder = path.join(root, ".mixlab-library", "videos", videoId);
  await mkdir(folder, { recursive: true });
  const texts = ["现金流是企业的血液。", "把事情做对，再把规模做大。"];
  let character = 0, normalizedCharacter = 0;
  const segments: TranscriptSegment[] = texts.map((text, index) => {
    const normalized = normalizeTranscriptText(text);
    const value: TranscriptSegment = { segment_id: `${videoId}-S${String(index + 1).padStart(6, "0")}`, index,
      begin_ms: index * 2000, end_ms: index * 2000 + 1700, text, normalized_text: normalized,
      begin_char: character, end_char: character + text.length, normalized_begin_char: normalizedCharacter,
      normalized_end_char: normalizedCharacter + normalized.length, confidence: 1 };
    character += text.length; normalizedCharacter += normalized.length; return value;
  });
  await writeFile(path.join(folder, "transcript.json"), JSON.stringify({ schema_version: "1.0", source_video_id: videoId,
    provider: "acceptance-fixture", model: "known-metadata-not-speech-quality", generated_at: time, duration_ms: 4000, full_text: texts.join(""), segments }));
  await writeFile(path.join(folder, "subtitles.srt"), "1\n00:00:00,000 --> 00:00:01,700\n现金流是企业的血液。\n");
  await writeFile(path.join(folder, "keyframes.json"), JSON.stringify({ schema_version: "1.0", keyframes_ms: [0, 2000] }));
  await runProcess(ffmpeg.ffmpeg_path, ["-hide_banner", "-nostdin", "-y", "-i", source, "-frames:v", "1", path.join(folder, "cover.jpg")]);
  await completePreprocessArtifacts({ library_root: root, source_video_id: videoId, now: time,
    media: { duration_ms: 4000, width: 640, height: 360, fps: 30, codec: "h264", content_hash: `sha256:${await fileDigest(source)}` },
    artifacts: { transcript_path: `.mixlab-library/videos/${videoId}/transcript.json`, srt_path: `.mixlab-library/videos/${videoId}/subtitles.srt`,
      keyframes_path: `.mixlab-library/videos/${videoId}/keyframes.json`, cover_path: `.mixlab-library/videos/${videoId}/cover.jpg` } });
  const manifest = await readSourceVideoManifest(root, videoId);
  await writeFile(path.join(folder, "source-video.json"), JSON.stringify({ ...manifest, lecturer, course: "受控媒体验收" }));
  await publishIndexRequiredSourceVideos({ library_root: root, library_id: "smart-acceptance-only", now: time });
  await publishCutterRelease({ library_root: root, now: time });
  return root;
}
