import assert from "node:assert/strict";
import test from "node:test";
import {
  validateReadyPublicationCandidate,
  validateSourceVideoManifest,
  type ReadyPublicationCandidate,
  type SourceVideoManifest
} from "./index.ts";

const readyManifest: SourceVideoManifest = {
  source_video_id: "V000001",
  title: "老板现金流课程",
  relative_path: "课程/老板现金流课程.mp4",
  logical_uri: "library://source-video/V000001",
  duration_ms: 3_600_000,
  width: 1920,
  height: 1080,
  fps: 25,
  codec: "h264",
  file_size: 1_234_567_890,
  content_hash: "sha256:example",
  preprocess_status: "ready",
  visible_to_cutters: true,
  transcript_path: "library://video/V000001/transcript.json",
  srt_path: "library://video/V000001/transcript.srt",
  keyframes_path: "library://video/V000001/keyframes.json",
  cover_path: "library://video/V000001/covers/cover.jpg"
};

test("validates ready source-video manifests for cutter visibility", () => {
  assert.deepEqual(validateSourceVideoManifest(readyManifest), {
    ok: true,
    errors: []
  });
});

test("rejects visible non-ready source-video manifests", () => {
  assert.deepEqual(
    validateSourceVideoManifest({
      ...readyManifest,
      preprocess_status: "processing",
      visible_to_cutters: true
    }),
    {
      ok: false,
      errors: ["visible_to_cutters=true requires preprocess_status=ready"]
    }
  );
});

test("rejects ready manifests with missing published artifact paths", () => {
  assert.deepEqual(
    validateSourceVideoManifest({
      ...readyManifest,
      transcript_path: "",
      cover_path: ""
    }),
    {
      ok: false,
      errors: [
        "ready video requires transcript_path",
        "ready video requires cover_path"
      ]
    }
  );
});

test("allows ready publication only after artifacts and searchable index are complete", () => {
  const candidate: ReadyPublicationCandidate = {
    manifest: readyManifest,
    artifacts: {
      transcript: true,
      srt: true,
      keyframes: true,
      cover: true,
      source_video_manifest: true
    },
    index_version: "v000027",
    index_searchable: true
  };

  assert.deepEqual(validateReadyPublicationCandidate(candidate), {
    ok: true,
    errors: []
  });
});

test("blocks ready publication when any artifact or index check is incomplete", () => {
  const candidate: ReadyPublicationCandidate = {
    manifest: readyManifest,
    artifacts: {
      transcript: true,
      srt: true,
      keyframes: true,
      cover: false,
      source_video_manifest: true
    },
    index_version: "27",
    index_searchable: false
  };

  assert.deepEqual(validateReadyPublicationCandidate(candidate), {
    ok: false,
    errors: [
      "cover artifact is required before ready publish",
      "index_version must use v000001 format",
      "video must be searchable in the target index before ready publish"
    ]
  });
});
