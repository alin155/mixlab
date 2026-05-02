import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CutMode } from "../../protocol/src/index.ts";

export interface WriteClipListItemInput {
  source_video_id: string;
  source_title: string;
  source_relative_path: string;
  start_segment_id: string;
  end_segment_id: string;
  begin_ms: number;
  end_ms: number;
  selected_text: string;
  cut_mode: CutMode;
  pre_roll_ms?: number;
  post_roll_ms?: number;
}

export interface ClipListItem extends WriteClipListItemInput {
  item_id: string;
  order: number;
  pre_roll_ms: number;
  post_roll_ms: number;
}

export interface ClipListManifest {
  schema_version: "1.0";
  clip_list_id: string;
  library_id: string;
  title: string;
  item_count: number;
  created_at: string;
  updated_at: string;
  items: ClipListItem[];
}

export interface WriteClipListInput {
  workspace_root: string;
  library_id: string;
  title: string;
  items: WriteClipListItemInput[];
  now: string;
}

export interface ReadClipListInput {
  workspace_root: string;
  clip_list_id: string;
}

export interface ListClipListsInput {
  workspace_root: string;
}

export interface ClipListCatalog {
  clip_list_count: number;
  clip_lists: ClipListManifest[];
}

const CLIP_LIST_ID_PATTERN = /^CL\d{8}-\d{4}$/;
const CUT_MODES = new Set<CutMode>(["copy", "smart", "precise"]);

function clipListsRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, "clip-lists");
}

function clipListManifestPath(workspaceRoot: string, clipListId: string): string {
  assertClipListId(clipListId);
  return path.join(clipListsRoot(workspaceRoot), clipListId, "clip-list.json");
}

function jsonBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assertClipListId(clipListId: string): void {
  if (!CLIP_LIST_ID_PATTERN.test(clipListId)) {
    throw new Error("clip_list_id must use CLYYYYMMDD-0001 format");
  }
}

function dateStampFromIso(now: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T/.exec(now);

  if (!match) {
    throw new Error("now must be an ISO timestamp");
  }

  return `${match[1]}${match[2]}${match[3]}`;
}

function numericClipListSequence(clipListId: string): number {
  const match = /^CL\d{8}-(\d{4})$/.exec(clipListId);
  return match ? Number.parseInt(match[1] ?? "0", 10) : 0;
}

function formatClipListId(dateStamp: string, sequence: number): string {
  return `CL${dateStamp}-${String(sequence).padStart(4, "0")}`;
}

export async function allocateNextClipListId(input: {
  workspace_root: string;
  now: string;
}): Promise<string> {
  const dateStamp = dateStampFromIso(input.now);
  let entries;

  try {
    entries = await readdir(clipListsRoot(input.workspace_root), { withFileTypes: true });
  } catch {
    return formatClipListId(dateStamp, 1);
  }

  let maxSequence = 0;

  for (const entry of entries) {
    if (
      entry.isDirectory() &&
      entry.name.startsWith(`CL${dateStamp}-`) &&
      CLIP_LIST_ID_PATTERN.test(entry.name)
    ) {
      maxSequence = Math.max(maxSequence, numericClipListSequence(entry.name));
    }
  }

  return formatClipListId(dateStamp, maxSequence + 1);
}

function isPortablePath(value: string): boolean {
  const normalized = value.replace(/\\/g, "/");

  if (
    normalized.trim() === "" ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    return false;
  }

  return !normalized.split("/").filter(Boolean).includes("..");
}

function assertNonEmpty(value: string, field: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a non-empty string`);
  }
}

function assertNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
}

function normalizeClipListItem(
  item: WriteClipListItemInput,
  index: number
): ClipListItem {
  assertNonEmpty(item.source_video_id, "source_video_id");
  assertNonEmpty(item.source_title, "source_title");
  assertNonEmpty(item.source_relative_path, "source_relative_path");
  assertNonEmpty(item.start_segment_id, "start_segment_id");
  assertNonEmpty(item.end_segment_id, "end_segment_id");
  assertNonEmpty(item.selected_text, "selected_text");
  assertNonNegativeInteger(item.begin_ms, "begin_ms");
  assertNonNegativeInteger(item.end_ms, "end_ms");

  if (item.end_ms <= item.begin_ms) {
    throw new Error("end_ms must be greater than begin_ms");
  }

  if (!isPortablePath(item.source_relative_path)) {
    throw new Error("source_relative_path must be portable");
  }

  if (!CUT_MODES.has(item.cut_mode)) {
    throw new Error("cut_mode must be copy, smart, or precise");
  }

  const preRollMs = item.pre_roll_ms ?? 0;
  const postRollMs = item.post_roll_ms ?? 0;
  assertNonNegativeInteger(preRollMs, "pre_roll_ms");
  assertNonNegativeInteger(postRollMs, "post_roll_ms");

  return {
    ...item,
    source_relative_path: item.source_relative_path.replace(/\\/g, "/"),
    item_id: `CLI${String(index + 1).padStart(6, "0")}`,
    order: index + 1,
    pre_roll_ms: preRollMs,
    post_roll_ms: postRollMs
  };
}

function validateClipList(manifest: ClipListManifest): void {
  assertClipListId(manifest.clip_list_id);
  assertNonEmpty(manifest.library_id, "library_id");
  assertNonEmpty(manifest.title, "title");
  assertNonEmpty(manifest.created_at, "created_at");
  assertNonEmpty(manifest.updated_at, "updated_at");

  if (!Array.isArray(manifest.items) || manifest.items.length === 0) {
    throw new Error("items must contain at least one cut-list row");
  }

  if (manifest.item_count !== manifest.items.length) {
    throw new Error("item_count must equal items.length");
  }
}

export async function writeClipList(input: WriteClipListInput): Promise<ClipListManifest> {
  assertNonEmpty(input.library_id, "library_id");
  assertNonEmpty(input.title, "title");

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("items must contain at least one cut-list row");
  }

  const clipListId = await allocateNextClipListId({
    workspace_root: input.workspace_root,
    now: input.now
  });
  const items = input.items.map(normalizeClipListItem);
  const manifest: ClipListManifest = {
    schema_version: "1.0",
    clip_list_id: clipListId,
    library_id: input.library_id,
    title: input.title.trim(),
    item_count: items.length,
    created_at: input.now,
    updated_at: input.now,
    items
  };
  validateClipList(manifest);

  const filePath = clipListManifestPath(input.workspace_root, clipListId);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, jsonBytes(manifest), "utf8");

  return manifest;
}

export async function readClipList(
  input: ReadClipListInput
): Promise<ClipListManifest | null> {
  try {
    const manifest = JSON.parse(
      await readFile(clipListManifestPath(input.workspace_root, input.clip_list_id), "utf8")
    ) as ClipListManifest;
    validateClipList(manifest);
    return manifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function listClipLists(
  input: ListClipListsInput
): Promise<ClipListCatalog> {
  let entries;

  try {
    entries = await readdir(clipListsRoot(input.workspace_root), { withFileTypes: true });
  } catch {
    return {
      clip_list_count: 0,
      clip_lists: []
    };
  }

  const clipLists: ClipListManifest[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !CLIP_LIST_ID_PATTERN.test(entry.name)) {
      continue;
    }

    const clipList = await readClipList({
      workspace_root: input.workspace_root,
      clip_list_id: entry.name
    });

    if (clipList) {
      clipLists.push(clipList);
    }
  }

  clipLists.sort((left, right) => {
    const createdCompare = right.created_at.localeCompare(left.created_at);
    return createdCompare || right.clip_list_id.localeCompare(left.clip_list_id);
  });

  return {
    clip_list_count: clipLists.length,
    clip_lists: clipLists
  };
}
