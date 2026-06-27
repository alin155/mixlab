import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import type { PreprocessStatus, SourceVideoManifest } from "../../protocol/src/index.ts";
import type { AdminPreprocessJobRecord } from "./admin-preprocess-jobs-query.ts";
import {
  getAdminSourceVideoDetail,
  toAdminSourceVideo
} from "./admin-source-video-detail-query.ts";
import {
  resolveAdminVideoArtifactPath
} from "./admin-source-video-artifact-path.ts";

function sourceVideoManifest(input: {
  source_video_id: string;
  preprocess_status?: PreprocessStatus;
  visible_to_cutters?: boolean;
  transcript_path?: string;
  srt_path?: string;
  cover_path?: string;
  keyframes_path?: string;
}): SourceVideoManifest {
  const status = input.preprocess_status ?? "ready";
  return {
    source_video_id: input.source_video_id,
    title: `${input.source_video_id} 标题`,
    relative_path: `course/${input.source_video_id}.mp4`,
    logical_uri: `library://source-video/${input.source_video_id}`,
    duration_ms: 60_000,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: "h264",
    file_size: 1024,
    content_hash: `hash-${input.source_video_id}`,
    preprocess_status: status,
    visible_to_cutters: input.visible_to_cutters ?? status === "ready",
    transcript_path: input.transcript_path ?? `artifacts/${input.source_video_id}/transcript.json`,
    srt_path: input.srt_path ?? `artifacts/${input.source_video_id}/transcript.srt`,
    keyframes_path: input.keyframes_path ?? `artifacts/${input.source_video_id}/keyframes.json`,
    cover_path: input.cover_path ?? `artifacts/${input.source_video_id}/cover.jpg`,
    description: "说明",
    tags: ["标签"],
    lecturer: "讲师",
    course: "课程",
    category: "分类"
  };
}

function makeReaders(input: {
  library_root?: string;
  manifests?: SourceVideoManifest[];
  jobs?: AdminPreprocessJobRecord[];
  json_files?: Record<string, unknown>;
  existing_files?: string[];
} = {}) {
  const libraryRoot = input.library_root ?? "/library";
  const manifests = new Map((input.manifests ?? []).map((manifest) => [
    manifest.source_video_id,
    manifest
  ]));
  const jobs = new Map((input.jobs ?? []).map((job) => [job.source_video_id, job]));
  const jsonFiles = new Map(Object.entries(input.json_files ?? {}));
  const existingFiles = new Set(input.existing_files ?? []);
  const calls = {
    read_manifest_ids: [] as string[],
    read_json_files: [] as string[]
  };

  return {
    calls,
    libraryRoot,
    readers: {
      async read_source_video_manifest(_libraryRoot: string, sourceVideoId: string) {
        calls.read_manifest_ids.push(sourceVideoId);
        const manifest = manifests.get(sourceVideoId);
        if (!manifest) {
          throw new Error(`missing manifest: ${sourceVideoId}`);
        }
        return manifest;
      },
      async read_preprocess_job(_libraryRoot: string, sourceVideoId: string) {
        return jobs.get(sourceVideoId) ?? null;
      },
      async read_json_file<T>(filePath: string) {
        calls.read_json_files.push(filePath);
        if (!jsonFiles.has(filePath)) {
          const error = new Error(`missing json: ${filePath}`) as NodeJS.ErrnoException;
          error.code = "ENOENT";
          throw error;
        }
        return jsonFiles.get(filePath) as T;
      },
      resolve_artifact_path(input: {
        library_root: string;
        source_video_id: string;
        artifact_path: string;
        fallback_file_name?: string;
      }) {
        return resolveAdminVideoArtifactPath(input);
      },
      async file_exists(filePath: string) {
        return existingFiles.has(filePath);
      },
      is_not_found_error(error: unknown) {
        return error instanceof Error &&
          "code" in error &&
          (error as NodeJS.ErrnoException).code === "ENOENT";
      }
    }
  };
}

test("source-video detail query builds ready detail with transcript job and artifacts", async () => {
  const libraryRoot = "/library-ready";
  const manifest = sourceVideoManifest({ source_video_id: "V000001" });
  const transcriptPath = path.join(libraryRoot, "artifacts", "V000001", "transcript.json");
  const coverPath = path.join(libraryRoot, "artifacts", "V000001", "cover.jpg");
  const { readers } = makeReaders({
    library_root: libraryRoot,
    manifests: [manifest],
    jobs: [{
      source_video_id: "V000001",
      status: "ready",
      attempt: 2,
      claimed_at: "2026-06-25T00:00:00.000Z",
      indexed_at: "2026-06-25T00:03:00.000Z",
      current_stage: "publish-index",
      index_version: "v000001"
    }],
    json_files: {
      [transcriptPath]: {
        segments: [{ text: "第一段" }, { text: "第二段" }]
      }
    },
    existing_files: [transcriptPath, coverPath]
  });

  const detail = await getAdminSourceVideoDetail({
    library_root: libraryRoot,
    source_video_id: "V000001",
    readers
  });

  assert.equal(detail?.source_video.source_video_id, "V000001");
  assert.equal(detail?.source_video.file_name, "V000001.mp4");
  assert.equal(detail?.visibility.label, "剪辑师可见");
  assert.equal(detail?.preprocess.stage, "publish-ready");
  assert.equal(detail?.preprocess.attempt, 2);
  assert.equal(detail?.artifacts.index_version, "v000001");
  assert.equal(detail?.artifacts.transcript.exists, true);
  assert.equal(detail?.artifacts.cover.exists, true);
  assert.equal(detail?.transcript.full_text, "第一段第二段");
  assert.equal(detail?.transcript.segment_count, 2);
  assert.equal(detail?.transcript.character_count, "第一段第二段".length);
});

test("source-video detail query returns empty transcript and default cover for unprocessed manifest", async () => {
  const manifest = sourceVideoManifest({
    source_video_id: "V000002",
    preprocess_status: "unprocessed",
    visible_to_cutters: false,
    transcript_path: "",
    srt_path: "",
    cover_path: "",
    keyframes_path: ""
  });
  const { readers, libraryRoot } = makeReaders({ manifests: [manifest] });

  const detail = await getAdminSourceVideoDetail({
    library_root: libraryRoot,
    source_video_id: "V000002",
    readers
  });

  assert.equal(detail?.source_video.cover_url.startsWith("data:image/svg+xml,"), true);
  assert.equal(detail?.visibility.visible_to_cutters, false);
  assert.equal(detail?.visibility.reason, "视频尚未完成预处理");
  assert.deepEqual(detail?.transcript, {
    full_text: "",
    segment_count: 0,
    character_count: 0
  });
  assert.equal(detail?.artifacts.cover.file_path, "");
  assert.equal(detail?.artifacts.cover.exists, false);
});

test("source-video detail query returns null when manifest is missing", async () => {
  const { readers, libraryRoot } = makeReaders();

  const detail = await getAdminSourceVideoDetail({
    library_root: libraryRoot,
    source_video_id: "V000999",
    readers
  });

  assert.equal(detail, null);
});

test("source-video detail query never exposes unsafe artifact paths", async () => {
  const manifest = sourceVideoManifest({
    source_video_id: "V000003",
    transcript_path: "/absolute/transcript.json",
    srt_path: "../subtitles.srt",
    cover_path: "library://video/V000004/cover.jpg",
    keyframes_path: "C:/bad/keyframes.json"
  });
  const { calls, readers, libraryRoot } = makeReaders({ manifests: [manifest] });

  const detail = await getAdminSourceVideoDetail({
    library_root: libraryRoot,
    source_video_id: "V000003",
    readers
  });

  assert.deepEqual(calls.read_json_files, [
    path.join(libraryRoot, ".mixlab-library", "videos", "V000003", "transcript.json")
  ]);
  assert.equal(detail?.transcript.full_text, "");
  assert.equal(
    detail?.artifacts.transcript.file_path,
    path.join(libraryRoot, ".mixlab-library", "videos", "V000003", "transcript.json")
  );
  assert.equal(
    detail?.artifacts.subtitles.file_path,
    path.join(libraryRoot, ".mixlab-library", "videos", "V000003", "subtitles.srt")
  );
  assert.equal(detail?.artifacts.cover.file_path, "");
  assert.equal(
    detail?.artifacts.keyframes.file_path,
    path.join(libraryRoot, ".mixlab-library", "videos", "V000003", "keyframes.json")
  );
  assert.equal(detail?.artifacts.cover.exists, false);
});

test("source-video public projection preserves failed status error placeholders", () => {
  const publicVideo = toAdminSourceVideo(sourceVideoManifest({
    source_video_id: "V000004",
    preprocess_status: "failed",
    visible_to_cutters: false
  }));

  assert.equal(publicVideo.preprocess_status, "failed");
  assert.equal(publicVideo.error_stage, "");
  assert.equal(publicVideo.error_message, "");
});
