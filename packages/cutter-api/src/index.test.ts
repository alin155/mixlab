import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { Server } from "node:http";
import type { TranscriptSegment } from "../../protocol/src/index.ts";
import {
  claimNextPreprocessJob,
  completePreprocessArtifacts,
  publishReadySourceVideo,
  scanSourceVideos
} from "../../library-fs/src/index.ts";
import { createCutterApiServer } from "./index.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "mixlab-cutter-api-"));
}

async function writeDummyVideo(filePath: string, bytes = "dummy-video-bytes"): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, bytes);
}

function segment(input: {
  source_video_id: string;
  index: number;
  begin_ms: number;
  end_ms: number;
  text: string;
  normalized_text: string;
}): TranscriptSegment {
  return {
    segment_id: `${input.source_video_id}-S${String(input.index + 1).padStart(6, "0")}`,
    index: input.index,
    begin_ms: input.begin_ms,
    end_ms: input.end_ms,
    begin_char: 0,
    end_char: input.text.length,
    normalized_begin_char: 0,
    normalized_end_char: input.normalized_text.length,
    text: input.text,
    normalized_text: input.normalized_text,
    confidence: 0.96
  };
}

async function writeArtifacts(input: {
  library_root: string;
  source_video_id: string;
  full_text: string;
  segments: TranscriptSegment[];
}): Promise<void> {
  const videoDir = path.join(
    input.library_root,
    ".mixlab-library",
    "videos",
    input.source_video_id
  );

  await mkdir(videoDir, { recursive: true });
  await writeFile(
    path.join(videoDir, "transcript.json"),
    `${JSON.stringify(
      {
        schema_version: "1.0",
        source_video_id: input.source_video_id,
        provider: "dashscope",
        model: "paraformer-v2",
        generated_at: "2026-05-02T00:00:00Z",
        duration_ms: 12_000,
        full_text: input.full_text,
        segments: input.segments
      },
      null,
      2
    )}\n`
  );
  await writeFile(path.join(videoDir, "subtitles.srt"), "1\n00:00:01,000 --> 00:00:03,600\n现金流\n");
  await writeFile(
    path.join(videoDir, "keyframes.json"),
    `${JSON.stringify({ schema_version: "1.0", keyframes_ms: [0, 5000, 10000] }, null, 2)}\n`
  );
  await writeFile(path.join(videoDir, "cover.jpg"), "cover-bytes");
}

async function completeReady(input: {
  library_root: string;
  source_video_id: string;
}): Promise<void> {
  await completePreprocessArtifacts({
    library_root: input.library_root,
    source_video_id: input.source_video_id,
    now: "2026-05-02T00:10:00Z",
    media: {
      duration_ms: 12_000,
      width: 1920,
      height: 1080,
      fps: 29.97,
      codec: "h264",
      content_hash: `sha256:${input.source_video_id}`
    },
    artifacts: {
      transcript_path: `.mixlab-library/videos/${input.source_video_id}/transcript.json`,
      srt_path: `.mixlab-library/videos/${input.source_video_id}/subtitles.srt`,
      keyframes_path: `.mixlab-library/videos/${input.source_video_id}/keyframes.json`,
      cover_path: `.mixlab-library/videos/${input.source_video_id}/cover.jpg`
    }
  });
  await publishReadySourceVideo({
    library_root: input.library_root,
    source_video_id: input.source_video_id,
    index_version: "v000001",
    now: "2026-05-02T00:15:00Z"
  });
}

async function prepareLibrary(): Promise<string> {
  const libraryRoot = await makeLibraryRoot();

  await writeDummyVideo(path.join(libraryRoot, "source-videos", "01_现金流.mp4"));
  await writeDummyVideo(path.join(libraryRoot, "source-videos", "02_组织增长.mov"));
  await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-02T00:00:00Z"
  });

  await claimNextPreprocessJob({
    library_root: libraryRoot,
    worker_id: "worker-a",
    now: "2026-05-02T00:01:00Z"
  });
  await writeArtifacts({
    library_root: libraryRoot,
    source_video_id: "V000001",
    full_text: "现金流，是企业的血液。不是账面数字。",
    segments: [
      segment({
        source_video_id: "V000001",
        index: 0,
        begin_ms: 1000,
        end_ms: 3600,
        text: "现金流，是企业的血液。",
        normalized_text: "现金流是企业的血液"
      })
    ]
  });
  await completeReady({
    library_root: libraryRoot,
    source_video_id: "V000001"
  });

  await claimNextPreprocessJob({
    library_root: libraryRoot,
    worker_id: "worker-a",
    now: "2026-05-02T00:20:00Z"
  });
  await writeArtifacts({
    library_root: libraryRoot,
    source_video_id: "V000002",
    full_text: "组织效率决定增长。",
    segments: [
      segment({
        source_video_id: "V000002",
        index: 0,
        begin_ms: 1000,
        end_ms: 3600,
        text: "组织效率决定增长。",
        normalized_text: "组织效率决定增长"
      })
    ]
  });
  await completePreprocessArtifacts({
    library_root: libraryRoot,
    source_video_id: "V000002",
    now: "2026-05-02T00:25:00Z",
    media: {
      duration_ms: 12_000,
      width: 1920,
      height: 1080,
      fps: 29.97,
      codec: "h264",
      content_hash: "sha256:V000002"
    },
    artifacts: {
      transcript_path: ".mixlab-library/videos/V000002/transcript.json",
      srt_path: ".mixlab-library/videos/V000002/subtitles.srt",
      keyframes_path: ".mixlab-library/videos/V000002/keyframes.json",
      cover_path: ".mixlab-library/videos/V000002/cover.jpg"
    }
  });

  return libraryRoot;
}

async function withApiServer<T>(
  libraryRoot: string,
  fn: (baseUrl: string) => Promise<T>
): Promise<T> {
  const server = createCutterApiServer({ library_root: libraryRoot });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address() as AddressInfo;
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      (server as Server).close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

test("serves cutter source library, detail, and search JSON with API media URLs", async () => {
  const libraryRoot = await prepareLibrary();

  await withApiServer(libraryRoot, async (baseUrl) => {
    const catalogResponse = await fetch(`${baseUrl}/cutter/source-library`);
    assert.equal(catalogResponse.status, 200);
    assert.equal(catalogResponse.headers.get("access-control-allow-origin"), "*");

    const catalog = await catalogResponse.json() as any;
    assert.equal(catalog.schema_version, "1.0");
    assert.equal(catalog.data.available_video_count, 1);
    assert.equal(catalog.data.videos[0].source_video_id, "V000001");
    assert.equal(catalog.data.videos[0].detail_url, "/cutter/source-videos/V000001");
    assert.equal(catalog.data.videos[0].media_url, "/cutter/source-videos/V000001/media");
    assert.equal(catalog.data.videos[0].cover_url, "/cutter/source-videos/V000001/cover");

    const detailResponse = await fetch(`${baseUrl}${catalog.data.videos[0].detail_url}`);
    assert.equal(detailResponse.status, 200);
    const detail = await detailResponse.json() as any;
    assert.equal(detail.data.source_video_id, "V000001");
    assert.equal(detail.data.transcript.full_text, "现金流，是企业的血液。不是账面数字。");
    assert.deepEqual(detail.data.keyframes.keyframes_ms, [0, 5000, 10000]);

    const hiddenDetail = await fetch(`${baseUrl}/cutter/source-videos/V000002`);
    assert.equal(hiddenDetail.status, 404);

    const searchResponse = await fetch(`${baseUrl}/cutter/source-search?query=${encodeURIComponent("现金流")}&limit=10`);
    assert.equal(searchResponse.status, 200);
    const search = await searchResponse.json() as any;
    assert.deepEqual(
      search.data.groups.map((group: any) => group.source_video_id),
      ["V000001"]
    );
    assert.equal(search.data.groups[0].cover_url, "/cutter/source-videos/V000001/cover");

    const hiddenSearch = await fetch(`${baseUrl}/cutter/source-search?query=${encodeURIComponent("组织效率")}`);
    assert.deepEqual(((await hiddenSearch.json()) as any).data.groups, []);
  });
});

test("streams cover, subtitles, and source media with range support", async () => {
  const libraryRoot = await prepareLibrary();

  await withApiServer(libraryRoot, async (baseUrl) => {
    const coverResponse = await fetch(`${baseUrl}/cutter/source-videos/V000001/cover`);
    assert.equal(coverResponse.status, 200);
    assert.equal(coverResponse.headers.get("content-type"), "image/jpeg");
    assert.equal(await coverResponse.text(), "cover-bytes");

    const srtResponse = await fetch(`${baseUrl}/cutter/source-videos/V000001/subtitles.srt`);
    assert.equal(srtResponse.status, 200);
    assert.equal(srtResponse.headers.get("content-type"), "text/plain; charset=utf-8");
    assert.match(await srtResponse.text(), /现金流/);

    const rangeResponse = await fetch(`${baseUrl}/cutter/source-videos/V000001/media`, {
      headers: {
        Range: "bytes=0-4"
      }
    });
    assert.equal(rangeResponse.status, 206);
    assert.equal(rangeResponse.headers.get("accept-ranges"), "bytes");
    assert.equal(rangeResponse.headers.get("content-range"), "bytes 0-4/17");
    assert.equal(await rangeResponse.text(), "dummy");
  });
});

test("returns structured JSON errors for missing routes and invalid source ids", async () => {
  const libraryRoot = await prepareLibrary();

  await withApiServer(libraryRoot, async (baseUrl) => {
    const notFound = await fetch(`${baseUrl}/missing`);
    assert.equal(notFound.status, 404);
    assert.deepEqual(await notFound.json(), {
      error: {
        code: "not_found",
        message: "Route not found"
      }
    });

    const invalid = await fetch(`${baseUrl}/cutter/source-videos/not-safe/media`);
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), {
      error: {
        code: "invalid_source_video_id",
        message: "source_video_id must use V000001 format"
      }
    });
  });
});

test("creates, lists, reads, and streams local clips", async () => {
  const libraryRoot = await prepareLibrary();
  const cutOutputs: Array<{ output_path: string; begin_ms: number; end_ms: number }> = [];

  const server = createCutterApiServer({
    library_root: libraryRoot,
    now: () => "2026-05-02T10:00:00Z",
    cut_runner: async (input) => {
      cutOutputs.push({
        output_path: input.output_path,
        begin_ms: input.begin_ms,
        end_ms: input.end_ms
      });
      await mkdir(path.dirname(input.output_path), { recursive: true });
      await writeFile(input.output_path, "local-clip-bytes");
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const createResponse = await fetch(`${baseUrl}/cutter/local-clips`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        source_video_id: "V000001",
        start_segment_id: "V000001-S000001",
        end_segment_id: "V000001-S000001",
        pre_roll_ms: 250,
        post_roll_ms: 400,
        cut_mode: "copy"
      })
    });

    assert.equal(createResponse.status, 201);
    const created = await createResponse.json() as any;
    assert.equal(created.data.local_clip_id, "LC000001");
    assert.equal(created.data.source_video_id, "V000001");
    assert.equal(created.data.begin_ms, 750);
    assert.equal(created.data.end_ms, 4000);
    assert.equal(created.data.media_url, "/cutter/local-clips/LC000001/media");
    assert.equal(cutOutputs.length, 1);
    assert.equal(path.basename(cutOutputs[0]?.output_path ?? ""), "clip.mp4");

    const list = await (await fetch(`${baseUrl}/cutter/local-clips`)).json() as any;
    assert.equal(list.data.local_clip_count, 1);
    assert.equal(list.data.clips[0].local_clip_id, "LC000001");

    const detail = await (await fetch(`${baseUrl}/cutter/local-clips/LC000001`)).json() as any;
    assert.equal(detail.data.selected_text, "现金流，是企业的血液。");

    const media = await fetch(`${baseUrl}/cutter/local-clips/LC000001/media`, {
      headers: {
        Range: "bytes=0-4"
      }
    });
    assert.equal(media.status, 206);
    assert.equal(media.headers.get("content-range"), "bytes 0-4/16");
    assert.equal(await media.text(), "local");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});
