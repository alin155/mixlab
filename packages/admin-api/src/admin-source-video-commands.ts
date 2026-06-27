import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readSourceVideoManifest } from "../../library-fs/src/index.ts";
import {
  validateSourceVideoManifest,
  type SourceVideoManifest
} from "../../protocol/src/index.ts";
import { adminCommandContract } from "./admin-command-guard.ts";
import { runAdminCommand } from "./admin-command-runtime.ts";
import type { AdminCommandActor } from "./admin-command-audit.ts";
import { readAdminLibraryManifest } from "./admin-library-commands.ts";
import {
  adminSourceVideoManifestPath as sourceVideoManifestPath,
  adminVideosRoot as videosRoot
} from "./admin-library-paths.ts";
import { writeAdminSourceVideoManifestToReadModelStore } from "./admin-read-model-store.ts";

const ADMIN_COVER_MAX_BYTES = 10 * 1024 * 1024;
const ADMIN_COVER_CONTENT_TYPES: Record<string, {
  extension: "jpg" | "png" | "webp";
  content_type: "image/jpeg" | "image/png" | "image/webp";
}> = {
  "image/jpeg": { extension: "jpg", content_type: "image/jpeg" },
  "image/jpg": { extension: "jpg", content_type: "image/jpeg" },
  "image/png": { extension: "png", content_type: "image/png" },
  "image/webp": { extension: "webp", content_type: "image/webp" }
};

interface AdminSourceVideoCommandContext {
  library_root: string;
  command_now: string;
  now?: () => string;
  actor?: AdminCommandActor;
}

function sourceVideoManifestSnapshotFiles(libraryRoot: string, sourceVideoId: string): {
  label: string;
  file_path: string;
}[] {
  return [{
    label: "source-video-manifest",
    file_path: sourceVideoManifestPath(libraryRoot, sourceVideoId)
  }];
}

function sourceVideoCoverSnapshotFiles(libraryRoot: string, sourceVideoId: string): {
  label: string;
  file_path: string;
}[] {
  const sourceVideoDirectory = path.join(videosRoot(libraryRoot), sourceVideoId);
  return [
    ...sourceVideoManifestSnapshotFiles(libraryRoot, sourceVideoId),
    {
      label: "source-video-cover-jpg",
      file_path: path.join(sourceVideoDirectory, "cover.jpg")
    },
    {
      label: "source-video-cover-png",
      file_path: path.join(sourceVideoDirectory, "cover.png")
    },
    {
      label: "source-video-cover-webp",
      file_path: path.join(sourceVideoDirectory, "cover.webp")
    }
  ];
}

function jsonBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function currentTime(input: AdminSourceVideoCommandContext): string {
  return input.now ? input.now() : input.command_now;
}

function requireRequestRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("请求 JSON 必须是对象");
  }

  return body as Record<string, unknown>;
}

function dataUrlParts(value: string): {
  content_type: string;
  image_base64: string;
} | null {
  const match = /^data:([^;,]+);base64,(.*)$/is.exec(value.trim());
  return match
    ? {
        content_type: match[1]?.toLowerCase() ?? "",
        image_base64: match[2] ?? ""
      }
    : null;
}

function normalizedCoverContentType(value: unknown): {
  extension: "jpg" | "png" | "webp";
  content_type: "image/jpeg" | "image/png" | "image/webp";
} | null {
  if (typeof value !== "string") {
    return null;
  }

  return ADMIN_COVER_CONTENT_TYPES[value.trim().toLowerCase()] ?? null;
}

function assertCoverBytesMatchContentType(bytes: Buffer, contentType: string): void {
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const isWebp = bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP";

  if (
    (contentType === "image/jpeg" && isJpeg) ||
    (contentType === "image/png" && isPng) ||
    (contentType === "image/webp" && isWebp)
  ) {
    return;
  }

  throw new Error("封面图片内容与类型不匹配");
}

function coverUpdateFromBody(body: unknown): {
  image_bytes: Buffer;
  content_type: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
} {
  const record = requireRequestRecord(body);
  const rawImageBase64 = typeof record.image_base64 === "string"
    ? record.image_base64
    : typeof record.data_base64 === "string"
      ? record.data_base64
      : typeof record.data_url === "string"
        ? record.data_url
        : "";
  const parsedDataUrl = dataUrlParts(rawImageBase64);
  const contentType = normalizedCoverContentType(parsedDataUrl?.content_type ?? record.content_type);

  if (!contentType) {
    throw new Error("封面图片仅支持 JPG、PNG 或 WebP");
  }

  const normalizedBase64 = (parsedDataUrl?.image_base64 ?? rawImageBase64).replace(/\s/g, "");
  if (
    normalizedBase64 === "" ||
    normalizedBase64.length % 4 === 1 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(normalizedBase64)
  ) {
    throw new Error("封面图片内容必须是有效的 base64");
  }

  const imageBytes = Buffer.from(normalizedBase64, "base64");
  if (imageBytes.length === 0) {
    throw new Error("封面图片内容不能为空");
  }

  if (imageBytes.length > ADMIN_COVER_MAX_BYTES) {
    throw new Error("封面图片不能超过 10MB");
  }

  assertCoverBytesMatchContentType(imageBytes, contentType.content_type);

  return {
    image_bytes: imageBytes,
    content_type: contentType.content_type,
    extension: contentType.extension
  };
}

function cleanOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function cleanTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const tags = value
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter(Boolean);

  return tags.length > 0 ? tags : undefined;
}

async function writeSourceVideoManifest(libraryRoot: string, manifest: SourceVideoManifest): Promise<void> {
  const validation = validateSourceVideoManifest(manifest);

  if (!validation.ok) {
    throw new Error(validation.errors.join("; "));
  }

  await mkdir(path.dirname(sourceVideoManifestPath(libraryRoot, manifest.source_video_id)), {
    recursive: true
  });
  await writeFile(sourceVideoManifestPath(libraryRoot, manifest.source_video_id), jsonBytes(manifest), "utf8");
}

async function readSourceVideoManifestOrNull(
  libraryRoot: string,
  sourceVideoId: string
): Promise<SourceVideoManifest | null> {
  try {
    return await readSourceVideoManifest(libraryRoot, sourceVideoId);
  } catch {
    return null;
  }
}

async function writeThroughSourceVideoManifest(input: {
  library_root: string;
  manifest: SourceVideoManifest;
  generated_at: string;
}): Promise<void> {
  try {
    await writeAdminSourceVideoManifestToReadModelStore({
      library_root: input.library_root,
      library: await readAdminLibraryManifest(input.library_root),
      manifest: input.manifest,
      generated_at: input.generated_at
    });
  } catch {
    // Store write-through is an optimization; stale/missing stores fall back to rebuild paths.
  }
}

async function updateSourceVideoCover(input: {
  library_root: string;
  source_video_id: string;
  body: unknown;
}): Promise<SourceVideoManifest | null> {
  const manifest = await readSourceVideoManifestOrNull(input.library_root, input.source_video_id);
  if (!manifest) {
    return null;
  }

  const coverUpdate = coverUpdateFromBody(input.body);
  const coverPath = `.mixlab-library/videos/${input.source_video_id}/cover.${coverUpdate.extension}`;
  const absoluteCoverPath = path.join(input.library_root, coverPath);

  await mkdir(path.dirname(absoluteCoverPath), { recursive: true });
  await writeFile(absoluteCoverPath, coverUpdate.image_bytes);

  const updated: SourceVideoManifest = {
    ...manifest,
    cover_path: coverPath
  };
  await writeSourceVideoManifest(input.library_root, updated);
  return updated;
}

async function updateSourceVideoMetadata(input: {
  library_root: string;
  source_video_id: string;
  body: Record<string, unknown>;
}): Promise<SourceVideoManifest | null> {
  const manifest = await readSourceVideoManifestOrNull(input.library_root, input.source_video_id);
  if (!manifest) {
    return null;
  }

  const nextManifest: SourceVideoManifest = {
    ...manifest,
    title: cleanOptionalText(input.body.title) ?? manifest.title,
    description: "description" in input.body ? cleanOptionalText(input.body.description) : manifest.description,
    lecturer: "lecturer" in input.body ? cleanOptionalText(input.body.lecturer) : manifest.lecturer,
    course: "course" in input.body ? cleanOptionalText(input.body.course) : manifest.course,
    category: "category" in input.body ? cleanOptionalText(input.body.category) : manifest.category,
    tags: "tags" in input.body ? cleanTags(input.body.tags) : manifest.tags
  };

  await writeSourceVideoManifest(input.library_root, nextManifest);
  return nextManifest;
}

export async function runAdminSourceVideoCoverCommand(input: AdminSourceVideoCommandContext & {
  source_video_id: string;
  body: unknown;
}): Promise<SourceVideoManifest | null> {
  const command = adminCommandContract("source-video-cover");
  return runAdminCommand({
    library_root: input.library_root,
    command: command.command,
    now: input.command_now,
    actor: input.actor,
    snapshot_files: sourceVideoCoverSnapshotFiles(input.library_root, input.source_video_id)
  }, async () => {
    const updated = await updateSourceVideoCover({
      library_root: input.library_root,
      source_video_id: input.source_video_id,
      body: input.body
    });
    if (updated) {
      await writeThroughSourceVideoManifest({
        library_root: input.library_root,
        manifest: updated,
        generated_at: currentTime(input)
      });
    }
    return updated;
  });
}

export async function runAdminSourceVideoMetadataCommand(input: AdminSourceVideoCommandContext & {
  source_video_id: string;
  body: Record<string, unknown>;
}): Promise<SourceVideoManifest | null> {
  const command = adminCommandContract("source-video-metadata");
  return runAdminCommand({
    library_root: input.library_root,
    command: command.command,
    now: input.command_now,
    actor: input.actor,
    snapshot_files: sourceVideoManifestSnapshotFiles(input.library_root, input.source_video_id)
  }, async () => {
    const updated = await updateSourceVideoMetadata({
      library_root: input.library_root,
      source_video_id: input.source_video_id,
      body: input.body
    });
    if (updated) {
      await writeThroughSourceVideoManifest({
        library_root: input.library_root,
        manifest: updated,
        generated_at: currentTime(input)
      });
    }
    return updated;
  });
}
