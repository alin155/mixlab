import type {
  CreateClipListRequest,
  CreateLocalClipRequest,
  SourceVideoCard,
  TranscriptSegment
} from "../api.ts";
import { sourceMaterialTitleFromStableName } from "./material-naming.ts";

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
  return Array.from(text).length;
}

function clampCharOffset(offset: number | undefined, text: string, fallback: number): number {
  if (typeof offset !== "number" || !Number.isFinite(offset)) {
    return fallback;
  }

  return Math.max(0, Math.min(Math.round(offset), textLength(text)));
}

function sliceTextByCharOffset(text: string, start: number, end: number): string {
  return Array.from(text).slice(start, end).join("");
}

function timeAtCharOffset(segment: TranscriptSegment, offset: number): number {
  const length = textLength(segment.text);
  if (length <= 0) {
    return segment.begin_ms;
  }

  const ratio = Math.max(0, Math.min(offset, length)) / length;
  return Math.round(segment.begin_ms + (segment.end_ms - segment.begin_ms) * ratio);
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

export function removeCutListItem(items: readonly CutListItem[], cutListItemId: string): CutListItem[] {
  return normalizeOrder(items.filter((item) => item.cut_list_item_id !== cutListItemId));
}

export function clearCutList(_items: readonly CutListItem[]): CutListItem[] {
  return [];
}

export function serializeCutList(items: readonly CutListItem[]): string {
  return JSON.stringify([...items].sort((left, right) => left.order - right.order));
}

export function deserializeCutList(serialized: string | null | undefined): CutListItem[] {
  if (!serialized) {
    return [];
  }

  const parsed = JSON.parse(serialized) as CutListItem[];
  return normalizeOrder(parsed.sort((left, right) => left.order - right.order));
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
