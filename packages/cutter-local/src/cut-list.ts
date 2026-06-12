import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  validateClipListManifest,
  type ClipListItem,
  type ClipListManifest,
  type CutMode
} from "../../protocol/src/index.ts";

export type { ClipListItem, ClipListManifest } from "../../protocol/src/index.ts";

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

export interface WriteClipListInput {
  workspace_root: string;
  library_id: string;
  project_id?: string;
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
const clipListMutationQueues = new Map<string, Promise<void>>();

async function withWorkspaceClipListMutationLock<T>(
  workspaceRoot: string,
  task: () => Promise<T>
): Promise<T> {
  const key = path.resolve(workspaceRoot);
  const previous = clipListMutationQueues.get(key) ?? Promise.resolve();
  let releaseCurrent!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  const chained = previous.catch(() => undefined).then(() => current);

  clipListMutationQueues.set(key, chained);
  await previous.catch(() => undefined);

  try {
    return await task();
  } finally {
    releaseCurrent();

    if (clipListMutationQueues.get(key) === chained) {
      clipListMutationQueues.delete(key);
    }
  }
}

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

function assertNonEmpty(value: string, field: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a non-empty string`);
  }
}

function normalizeProjectId(value: string | undefined): string | undefined {
  const projectId = value?.trim();
  if (!projectId) {
    return undefined;
  }

  if (!/^[A-Za-z0-9_-]{1,100}$/.test(projectId)) {
    throw new Error("project_id must be a safe project identifier");
  }

  return projectId;
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

function assertValidClipList(manifest: ClipListManifest): void {
  const result = validateClipListManifest(manifest);

  if (!result.ok) {
    throw new Error(result.errors.join("; "));
  }
}

export async function writeClipList(input: WriteClipListInput): Promise<ClipListManifest> {
  return withWorkspaceClipListMutationLock(input.workspace_root, async () => {
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
    const projectId = normalizeProjectId(input.project_id);
    const manifest: ClipListManifest = {
      schema_version: "1.0",
      clip_list_id: clipListId,
      library_id: input.library_id,
      ...(projectId ? { project_id: projectId } : {}),
      title: input.title.trim(),
      item_count: items.length,
      created_at: input.now,
      updated_at: input.now,
      items
    };
    assertValidClipList(manifest);

    const filePath = clipListManifestPath(input.workspace_root, clipListId);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, jsonBytes(manifest), "utf8");

    return manifest;
  });
}

export async function readClipList(
  input: ReadClipListInput
): Promise<ClipListManifest | null> {
  try {
    const manifest = JSON.parse(
      await readFile(clipListManifestPath(input.workspace_root, input.clip_list_id), "utf8")
    ) as ClipListManifest;
    assertValidClipList(manifest);
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
