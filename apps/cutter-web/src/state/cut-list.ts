import type {
  CreateClipListRequest,
  CreateLocalClipRequest,
  SourceVideoCard,
  TranscriptSegment
} from "../api.ts";
import { sourceMaterialTitleFromStableName } from "./material-naming.ts";
import {
  codePointLength,
  codePointSlice,
  normalizeCodePointOffset,
  timeAtCodePointOffset
} from "./text-offsets.ts";

export type CutMode = NonNullable<CreateLocalClipRequest["cut_mode"]>;

export const CUT_LIST_STORAGE_KEY = "mixlab.cutter.cutList";

export interface CutListItem {
  cut_list_item_id: string;
  source_video_id: string;
  source_title: string;
  source_relative_path: string;
  start_segment_id: string;
  end_segment_id: string;
  begin_ms: number;
  end_ms: number;
  duration_ms: number;
  selected_text: string;
  cut_mode: CutMode;
  order: number;
  title?: string;
  pre_roll_ms?: number;
  post_roll_ms?: number;
}

export interface CreateCutListItemInput {
  sourceVideo: SourceVideoCard;
  segments: TranscriptSegment[];
  cutMode?: CutMode;
  order?: number;
  title?: string;
  preRollMs?: number;
  postRollMs?: number;
  startCharOffset?: number;
  endCharOffset?: number;
}

export type MoveDirection = "up" | "down";

function stableCutListId(input: {
  sourceVideoId: string;
  first: TranscriptSegment;
  last: TranscriptSegment;
  startCharOffset?: number;
  endCharOffset?: number;
}): string {
  const rangeSuffix =
    typeof input.startCharOffset === "number" && typeof input.endCharOffset === "number"
      ? `-${input.startCharOffset}-${input.endCharOffset}`
      : "";

  return `cut-${input.sourceVideoId}-${input.first.segment_id}-${input.last.segment_id}${rangeSuffix}`;
}

function normalizeOrder(items: CutListItem[]): CutListItem[] {
  return items.map((item, index) => ({
    ...item,
    order: index + 1
  }));
}

function textLength(text: string): number {
  return codePointLength(text);
}

function clampCharOffset(offset: number | undefined, text: string, fallback: number): number {
  return normalizeCodePointOffset(offset, text, fallback);
}

function sliceTextByCharOffset(text: string, start: number, end: number): string {
  return codePointSlice(text, start, end);
}

function timeAtCharOffset(segment: TranscriptSegment, offset: number): number {
  return timeAtCodePointOffset(segment, offset);
}

function selectedTextFromSegments(input: {
  segments: TranscriptSegment[];
  startCharOffset?: number;
  endCharOffset?: number;
}): string {
  if (
    typeof input.startCharOffset !== "number" ||
    typeof input.endCharOffset !== "number"
  ) {
    return input.segments.map((segment) => segment.text).join(" ");
  }

  return input.segments
    .map((segment, index) => {
      const start = index === 0 ? input.startCharOffset ?? 0 : 0;
      const end = index === input.segments.length - 1
        ? input.endCharOffset ?? textLength(segment.text)
        : textLength(segment.text);

      return sliceTextByCharOffset(segment.text, start, end);
    })
    .join("");
}

export function createCutListItemFromSegments(input: CreateCutListItemInput): CutListItem {
  if (input.segments.length === 0) {
    throw new Error("At least one transcript segment is required");
  }

  const segments = [...input.segments].sort((left, right) => left.begin_ms - right.begin_ms);
  const first = segments[0]!;
  const last = segments[segments.length - 1]!;
  const startCharOffset = clampCharOffset(input.startCharOffset, first.text, 0);
  const endCharOffset = clampCharOffset(input.endCharOffset, last.text, textLength(last.text));
  const hasTextOffsets =
    typeof input.startCharOffset === "number" && typeof input.endCharOffset === "number";
  const beginMs = hasTextOffsets ? timeAtCharOffset(first, startCharOffset) : first.begin_ms;
  const endMs = hasTextOffsets ? timeAtCharOffset(last, endCharOffset) : last.end_ms;
  const selectedText = selectedTextFromSegments({
    segments,
    ...(hasTextOffsets
      ? {
          startCharOffset,
          endCharOffset
        }
      : {})
  });

  if (endMs <= beginMs || selectedText.trim() === "") {
    throw new Error("Selected transcript text must span a positive duration");
  }

  return {
    cut_list_item_id: stableCutListId({
      sourceVideoId: input.sourceVideo.source_video_id,
      first,
      last,
      ...(hasTextOffsets
        ? {
            startCharOffset,
            endCharOffset
          }
        : {})
    }),
    source_video_id: input.sourceVideo.source_video_id,
    source_title: input.sourceVideo.title,
    source_relative_path: input.sourceVideo.relative_path ?? "",
    start_segment_id: first.segment_id,
    end_segment_id: last.segment_id,
    begin_ms: beginMs,
    end_ms: endMs,
    duration_ms: Math.max(0, endMs - beginMs),
    selected_text: selectedText,
    cut_mode: input.cutMode ?? "copy",
    order: input.order ?? 1,
    title: input.title,
    pre_roll_ms: input.preRollMs ?? 0,
    post_roll_ms: input.postRollMs ?? 0
  };
}

export function moveCutListItem(
  items: readonly CutListItem[],
  cutListItemId: string,
  direction: MoveDirection
): CutListItem[] {
  const next = [...items].sort((left, right) => left.order - right.order);
  const index = next.findIndex((item) => item.cut_list_item_id === cutListItemId);

  if (index === -1) {
    return normalizeOrder(next);
  }

  const targetIndex = direction === "up" ? index - 1 : index + 1;

  if (targetIndex < 0 || targetIndex >= next.length) {
    return normalizeOrder(next);
  }

  const current = next[index]!;
  next[index] = next[targetIndex]!;
  next[targetIndex] = current;

  return normalizeOrder(next);
}

/**
 * Move one item to an absolute position (drag & drop target index) and renumber
 * every remaining item to 1..N. Unknown ids and out-of-range targets are
 * normalised instead of throwing so a stale drag never corrupts the list.
 */
export function reorderCutListItem(
  items: readonly CutListItem[],
  cutListItemId: string,
  targetIndex: number
): CutListItem[] {
  const next = [...items].sort((left, right) => left.order - right.order);
  const index = next.findIndex((item) => item.cut_list_item_id === cutListItemId);

  if (index === -1 || !Number.isFinite(targetIndex)) {
    return normalizeOrder(next);
  }

  const clampedTarget = Math.max(0, Math.min(next.length - 1, Math.trunc(targetIndex)));

  if (clampedTarget === index) {
    return normalizeOrder(next);
  }

  const [moved] = next.splice(index, 1);
  if (!moved) {
    return normalizeOrder(next);
  }

  next.splice(clampedTarget, 0, moved);

  return normalizeOrder(next);
}

export function removeCutListItem(items: readonly CutListItem[], cutListItemId: string): CutListItem[] {
  return normalizeOrder(items.filter((item) => item.cut_list_item_id !== cutListItemId));
}

export function clearCutList(_items: readonly CutListItem[]): CutListItem[] {
  return [];
}

export function serializeCutList(items: readonly CutListItem[]): string {
  return JSON.stringify([...items].sort((left, right) => left.order - right.order));
}

export const CUT_LIST_CORRUPT_STORAGE_KEY = "mixlab.cutter.cutList.corrupt";

const CUT_MODES: readonly CutMode[] = ["copy", "smart", "precise"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizedCutMode(value: unknown): CutMode {
  return typeof value === "string" && (CUT_MODES as readonly string[]).includes(value)
    ? (value as CutMode)
    : "copy";
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return isFiniteNumber(value) ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizedCutListItem(value: unknown, index: number): CutListItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const cutListItemId = optionalString(value.cut_list_item_id);
  const sourceVideoId = optionalString(value.source_video_id);
  const sourceTitle = optionalString(value.source_title);
  const startSegmentId = optionalString(value.start_segment_id);
  const endSegmentId = optionalString(value.end_segment_id);
  const beginMs = optionalFiniteNumber(value.begin_ms);
  const endMs = optionalFiniteNumber(value.end_ms);

  if (
    !cutListItemId ||
    !sourceVideoId ||
    sourceTitle === undefined ||
    !startSegmentId ||
    !endSegmentId ||
    beginMs === undefined ||
    endMs === undefined
  ) {
    return null;
  }

  const durationMs = optionalFiniteNumber(value.duration_ms) ?? Math.max(0, endMs - beginMs);
  const order = optionalFiniteNumber(value.order) ?? index + 1;
  const title = optionalString(value.title);
  const preRollMs = optionalFiniteNumber(value.pre_roll_ms);
  const postRollMs = optionalFiniteNumber(value.post_roll_ms);

  return {
    cut_list_item_id: cutListItemId,
    source_video_id: sourceVideoId,
    source_title: sourceTitle,
    source_relative_path: optionalString(value.source_relative_path) ?? "",
    start_segment_id: startSegmentId,
    end_segment_id: endSegmentId,
    begin_ms: beginMs,
    end_ms: endMs,
    duration_ms: durationMs,
    selected_text: optionalString(value.selected_text) ?? "",
    cut_mode: normalizedCutMode(value.cut_mode),
    order,
    ...(title ? { title } : {}),
    ...(preRollMs !== undefined ? { pre_roll_ms: preRollMs } : {}),
    ...(postRollMs !== undefined ? { post_roll_ms: postRollMs } : {})
  };
}

export interface CutListParseResult {
  items: CutListItem[];
  corrupted: boolean;
}

export function parseCutList(serialized: string | null | undefined): CutListParseResult {
  if (!serialized) {
    return { items: [], corrupted: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return { items: [], corrupted: true };
  }

  if (!Array.isArray(parsed)) {
    return { items: [], corrupted: true };
  }

  let corrupted = false;
  const items: CutListItem[] = [];

  for (const [index, entry] of parsed.entries()) {
    const item = normalizedCutListItem(entry, index);
    if (!item) {
      corrupted = true;
      continue;
    }

    items.push(item);
  }

  return {
    items: normalizeOrder(items.sort((left, right) => left.order - right.order)),
    corrupted
  };
}

export function deserializeCutList(serialized: string | null | undefined): CutListItem[] {
  return parseCutList(serialized).items;
}

function defaultStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function storeCorruptCutList(storage: Storage, raw: string): void {
  try {
    storage.setItem(CUT_LIST_CORRUPT_STORAGE_KEY, raw);
  } catch {
    // Best-effort backup only; the UI must keep booting with an empty cut list.
  }
}

export function readCutListFromStorage(storage: Storage | null = defaultStorage()): CutListItem[] {
  if (!storage) {
    return [];
  }

  let raw: string | null = null;
  try {
    raw = storage.getItem(CUT_LIST_STORAGE_KEY);
  } catch {
    return [];
  }

  if (!raw) {
    return [];
  }

  const parsed = parseCutList(raw);
  if (parsed.corrupted) {
    storeCorruptCutList(storage, raw);
  }

  return parsed.items;
}

export function toCreateLocalClipRequest(item: CutListItem): CreateLocalClipRequest {
  return {
    source_video_id: item.source_video_id,
    start_segment_id: item.start_segment_id,
    end_segment_id: item.end_segment_id,
    begin_ms: item.begin_ms,
    end_ms: item.end_ms,
    selected_text: item.selected_text,
    pre_roll_ms: item.pre_roll_ms ?? 0,
    post_roll_ms: item.post_roll_ms ?? 0,
    cut_mode: item.cut_mode,
    ...(item.title ? { title: item.title } : {})
  };
}

function isPortableRelativePath(value: string): boolean {
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

export function toCreateClipListRequest(input: {
  libraryId: string;
  projectId?: string;
  title: string;
  items: readonly CutListItem[];
}): CreateClipListRequest {
  const items = [...input.items].sort((left, right) => left.order - right.order);

  return {
    library_id: input.libraryId,
    ...(input.projectId ? { project_id: input.projectId } : {}),
    title: input.title,
    items: items.map((item) => {
      if (!isPortableRelativePath(item.source_relative_path)) {
        throw new Error("source_relative_path is required for clip-list submission");
      }

      return {
        source_video_id: item.source_video_id,
        source_title: sourceMaterialTitleFromStableName(item.source_title),
        source_relative_path: item.source_relative_path.replace(/\\/g, "/"),
        start_segment_id: item.start_segment_id,
        end_segment_id: item.end_segment_id,
        begin_ms: item.begin_ms,
        end_ms: item.end_ms,
        selected_text: item.selected_text,
        cut_mode: item.cut_mode,
        pre_roll_ms: item.pre_roll_ms ?? 0,
        post_roll_ms: item.post_roll_ms ?? 0
      };
    })
  };
}
