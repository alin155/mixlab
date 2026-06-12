import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type UIEvent,
  type MouseEvent as ReactMouseEvent,
  type SyntheticEvent
} from "react";
import {
  formatDuration,
  type LocalClipCatalog,
  type SearchResponse,
  type SearchHitSegment,
  type SourceLibraryResponse,
  type SourceVideoDetail,
  type TranscriptSegment
} from "../../api.ts";
import {
  buildMaterialLocatorSections,
  type MaterialLocatorResult,
  type MaterialSource,
  type MaterialSearchSourceFilter
} from "../../state/material-locator.ts";
import {
  videoOrientation,
  videoOrientationLabel,
  type VideoOrientationFilter
} from "../../state/video-orientation.ts";
import {
  continuousTranscriptSegments,
  shouldSuppressTranscriptClickAfterMouseUp
} from "../../state/transcript-selection.ts";
import {
  previewStartSeconds,
  selectionPlaybackWindow,
  shouldPauseSelectionPreview
} from "../../state/transcript-playback.ts";
import type { CutQueueJob } from "../../state/cut-queue.ts";
import type { CutMode } from "../../state/cut-list.ts";

function transcriptTextLength(text: string): number {
  return Array.from(text).length;
}

function clampTranscriptCharOffset(offset: number | undefined, text: string, fallback: number): number {
  if (typeof offset !== "number" || !Number.isFinite(offset)) {
    return fallback;
  }

  return Math.max(0, Math.min(Math.round(offset), transcriptTextLength(text)));
}

function sliceTranscriptText(text: string, start: number, end: number): string {
  return Array.from(text).slice(start, end).join("");
}

function transcriptTimeAtCharOffset(segment: TranscriptSegment, offset: number): number {
  const length = transcriptTextLength(segment.text);
  if (length <= 0) {
    return segment.begin_ms;
  }

  return Math.round(segment.begin_ms + (segment.end_ms - segment.begin_ms) * (offset / length));
}

function selectedBeginMs(
  segments: readonly TranscriptSegment[],
  startCharOffset?: number
): number | undefined {
  const first = segments[0];
  if (!first) {
    return undefined;
  }

  if (typeof startCharOffset !== "number") {
    return first.begin_ms;
  }

  return transcriptTimeAtCharOffset(
    first,
    clampTranscriptCharOffset(startCharOffset, first.text, 0)
  );
}

function selectedEndMs(
  segments: readonly TranscriptSegment[],
  endCharOffset?: number
): number | undefined {
  const last = segments[segments.length - 1];
  if (!last) {
    return undefined;
  }

  if (typeof endCharOffset !== "number") {
    return last.end_ms;
  }

  return transcriptTimeAtCharOffset(
    last,
    clampTranscriptCharOffset(endCharOffset, last.text, transcriptTextLength(last.text))
  );
}

function selectedDurationLabel(
  segments: readonly TranscriptSegment[],
  startCharOffset?: number,
  endCharOffset?: number
): string {
  const first = segments[0];
  const last = segments[segments.length - 1];
  if (!first || !last) {
    return "0 秒";
  }

  const beginMs = selectedBeginMs(segments, startCharOffset) ?? first.begin_ms;
  const endMs = selectedEndMs(segments, endCharOffset) ?? last.end_ms;

  return `${Math.max(1, Math.round((endMs - beginMs) / 1000))} 秒`;
}

export function materialLocatorTimeSelectionRange(input: {
  segments: readonly TranscriptSegment[];
  pendingStartSegmentId?: string;
  clickedSegmentId: string;
}):
  | { type: "pending"; pendingStartSegmentId: string }
  | {
      type: "range";
      startSegmentId: string;
      startCharOffset: number;
      endSegmentId: string;
      endCharOffset: number;
    } {
  if (!input.pendingStartSegmentId) {
    return { type: "pending", pendingStartSegmentId: input.clickedSegmentId };
  }

  const startIndex = input.segments.findIndex(
    (segment) => segment.segment_id === input.pendingStartSegmentId
  );
  const endIndex = input.segments.findIndex((segment) => segment.segment_id === input.clickedSegmentId);
  const firstIndex = startIndex >= 0 && endIndex >= 0 ? Math.min(startIndex, endIndex) : -1;
  const lastIndex = startIndex >= 0 && endIndex >= 0 ? Math.max(startIndex, endIndex) : -1;
  const first = firstIndex >= 0 ? input.segments[firstIndex] : undefined;
  const last = lastIndex >= 0 ? input.segments[lastIndex] : undefined;

  if (!first || !last) {
    return { type: "pending", pendingStartSegmentId: input.clickedSegmentId };
  }

  return {
    type: "range",
    startSegmentId: first.segment_id,
    startCharOffset: 0,
    endSegmentId: last.segment_id,
    endCharOffset: transcriptTextLength(last.text)
  };
}

function selectedTranscriptText(
  segments: readonly TranscriptSegment[],
  startCharOffset?: number,
  endCharOffset?: number
): string {
  const hasTextOffsets =
    typeof startCharOffset === "number" && typeof endCharOffset === "number";
  const text = hasTextOffsets
    ? segments
        .map((segment, index) => {
          const start = index === 0
            ? clampTranscriptCharOffset(startCharOffset, segment.text, 0)
            : 0;
          const end = index === segments.length - 1
            ? clampTranscriptCharOffset(endCharOffset, segment.text, transcriptTextLength(segment.text))
            : transcriptTextLength(segment.text);

          return sliceTranscriptText(segment.text, start, end);
        })
        .join("")
        .trim()
    : segments.map((segment) => segment.text.trim()).filter(Boolean).join(" ");
  return text;
}

function splitTextByQuery(
  text: string,
  query: string
): Array<{ text: string; highlighted: boolean; start: number; end: number }> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return [{ text, highlighted: false, start: 0, end: transcriptTextLength(text) }];
  }

  const parts: Array<{ text: string; highlighted: boolean; start: number; end: number }> = [];
  let cursor = 0;
  let index = text.indexOf(trimmedQuery, cursor);

  while (index >= 0) {
    if (index > cursor) {
      parts.push({
        text: text.slice(cursor, index),
        highlighted: false,
        start: transcriptTextLength(text.slice(0, cursor)),
        end: transcriptTextLength(text.slice(0, index))
      });
    }
    const highlightEnd = index + trimmedQuery.length;
    parts.push({
      text: text.slice(index, highlightEnd),
      highlighted: true,
      start: transcriptTextLength(text.slice(0, index)),
      end: transcriptTextLength(text.slice(0, highlightEnd))
    });
    cursor = highlightEnd;
    index = text.indexOf(trimmedQuery, cursor);
  }

  if (cursor < text.length) {
    parts.push({
      text: text.slice(cursor),
      highlighted: false,
      start: transcriptTextLength(text.slice(0, cursor)),
      end: transcriptTextLength(text)
    });
  }

  return parts.length > 0 ? parts : [{ text, highlighted: false, start: 0, end: transcriptTextLength(text) }];
}

function normalizedHighlightRanges(
  text: string,
  ranges: readonly [number, number][] | undefined
): Array<[number, number]> {
  const maxLength = transcriptTextLength(text);
  const sorted = (ranges ?? [])
    .map(([start, end]) => [
      Math.max(0, Math.min(Math.round(start), maxLength)),
      Math.max(0, Math.min(Math.round(end), maxLength))
    ] as [number, number])
    .filter(([start, end]) => end > start)
    .sort(([leftStart], [rightStart]) => leftStart - rightStart);
  const merged: Array<[number, number]> = [];

  for (const [start, end] of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && start <= previous[1]) {
      previous[1] = Math.max(previous[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  return merged;
}

function splitTextByHighlightRanges(
  text: string,
  ranges: readonly [number, number][] | undefined,
  fallbackQuery: string
): Array<{ text: string; highlighted: boolean; start: number; end: number }> {
  const normalizedRanges = normalizedHighlightRanges(text, ranges);
  if (normalizedRanges.length === 0) {
    return splitTextByQuery(text, fallbackQuery);
  }

  const parts: Array<{ text: string; highlighted: boolean; start: number; end: number }> = [];
  let cursor = 0;

  for (const [start, end] of normalizedRanges) {
    if (start > cursor) {
      parts.push({
        text: sliceTranscriptText(text, cursor, start),
        highlighted: false,
        start: cursor,
        end: start
      });
    }
    parts.push({
      text: sliceTranscriptText(text, start, end),
      highlighted: true,
      start,
      end
    });
    cursor = end;
  }

  const totalLength = transcriptTextLength(text);
  if (cursor < totalLength) {
    parts.push({
      text: sliceTranscriptText(text, cursor, totalLength),
      highlighted: false,
      start: cursor,
      end: totalLength
    });
  }

  return parts;
}

function queueStatusLabel(status: CutQueueJob["status"]): string {
  switch (status) {
    case "pending":
      return "等待中";
    case "running":
      return "剪切中";
    case "done":
      return "已完成";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
  }
}

function sourceLabelFromMaterialKey(materialKey?: string): string {
  return materialKey?.startsWith("local:") ? "本地素材" : "公共原素材";
}

function transcriptCharacterCount(detail: SourceVideoDetail): number {
  return detail.transcript.full_text.replace(/\s+/g, "").length;
}

export function materialLocatorDisplayDurationMs(
  manifestDurationMs: number,
  mediaDurationMs?: number
): number {
  if (typeof mediaDurationMs === "number" && Number.isFinite(mediaDurationMs) && mediaDurationMs > 0) {
    return Math.round(mediaDurationMs);
  }

  return manifestDurationMs;
}

export function materialLocatorAutoSeekKey(
  detail: SourceVideoDetail | undefined,
  activeHitSegmentId: string | undefined
): string | undefined {
  if (!detail || !activeHitSegmentId) {
    return undefined;
  }

  return [detail.source_video_id, detail.media_url, activeHitSegmentId].join(":");
}

const TRANSCRIPT_VIRTUALIZATION_THRESHOLD = 160;
const TRANSCRIPT_ROW_ESTIMATED_HEIGHT = 56;
const TRANSCRIPT_RENDER_OVERSCAN = 18;
const TRANSCRIPT_INITIAL_RENDER_COUNT = 84;

interface TranscriptRenderRange {
  start: number;
  end: number;
}

function transcriptSegmentOrdinal(segment: TranscriptSegment, fallbackIndex: number): number {
  const match = segment.segment_id.match(/(\d+)$/);
  const numeric = match ? Number.parseInt(match[1]!, 10) : Number.NaN;

  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallbackIndex + 1;
}

function clampTranscriptRange(range: TranscriptRenderRange, total: number): TranscriptRenderRange {
  const start = Math.max(0, Math.min(range.start, total));
  const end = Math.max(start, Math.min(range.end, total));

  return { start, end };
}

function transcriptRangeAroundIndex(index: number, total: number): TranscriptRenderRange {
  if (total <= TRANSCRIPT_INITIAL_RENDER_COUNT) {
    return { start: 0, end: total };
  }

  const safeIndex = index >= 0 ? Math.min(index, total - 1) : 0;
  const start = Math.max(0, safeIndex - Math.floor(TRANSCRIPT_INITIAL_RENDER_COUNT / 2));
  const end = Math.min(total, start + TRANSCRIPT_INITIAL_RENDER_COUNT);

  return {
    start: Math.max(0, end - TRANSCRIPT_INITIAL_RENDER_COUNT),
    end
  };
}

function transcriptRangeFromScroll(scrollTop: number, viewportHeight: number, total: number): TranscriptRenderRange {
  const firstVisible = Math.floor(Math.max(0, scrollTop) / TRANSCRIPT_ROW_ESTIMATED_HEIGHT);
  const visibleCount = Math.ceil(Math.max(1, viewportHeight) / TRANSCRIPT_ROW_ESTIMATED_HEIGHT);
  const start = Math.max(0, firstVisible - TRANSCRIPT_RENDER_OVERSCAN);
  const end = Math.min(total, firstVisible + visibleCount + TRANSCRIPT_RENDER_OVERSCAN);

  return { start, end };
}

export interface MaterialSearchHistoryItem {
  query: string;
  hitCount: number;
}

export interface MaterialLocatorSearchStatus {
  indexLabel: string;
  syncLabel: string;
  searchLatencyLabel: string;
  nasLabel: string;
}

export function materialLocatorCandidateSummary(input: {
  hasActiveQuery: boolean;
  candidateCount: number;
  hitCount: number;
  isSearching: boolean;
  hasMoreSearchResults: boolean;
}): string {
  if (!input.hasActiveQuery) {
    return "等待搜索";
  }

  if (input.isSearching && input.candidateCount === 0) {
    return "首批匹配中";
  }

  if (input.candidateCount === 0) {
    return "0 条候选";
  }

  const loadingLabel = input.isSearching || input.hasMoreSearchResults
    ? "加载中"
    : "完成";

  return `已载入${input.candidateCount}条 · 命中${input.hitCount}处 · ${loadingLabel}`;
}

export function materialLocatorSectionFooterLabel(input: {
  sectionKey: MaterialSource;
  itemCount: number;
  isSearching: boolean;
  hasMoreSearchResults: boolean;
}): string {
  if (input.sectionKey === "public" && (input.isSearching || input.hasMoreSearchResults)) {
    return `继续加载中（已显示 ${input.itemCount}）`;
  }

  return `已显示全部（${input.itemCount}）`;
}

function shouldIgnoreSelectionShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    tagName === "button" ||
    tagName === "a";
}

export function materialLocatorSelectionShortcutAction(input: {
  key: string;
  code?: string;
  defaultPrevented?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  ignoreTarget?: boolean;
  hasSelectedText: boolean;
}): "cut" | "preview" | undefined {
  if (
    !input.hasSelectedText ||
    input.defaultPrevented ||
    input.altKey ||
    input.ctrlKey ||
    input.metaKey ||
    input.shiftKey ||
    input.ignoreTarget
  ) {
    return undefined;
  }

  if (input.key === "Enter") {
    return "cut";
  }

  if (input.key === " " || input.code === "Space") {
    return "preview";
  }

  return undefined;
}

export function MaterialLocatorPage({
  library,
  localClips,
  search,
  query,
  sourceFilter,
  orientationFilter,
  selectedDetail,
  selectedSegments = [],
  selectedStartCharOffset,
  selectedEndCharOffset,
  highlightedSegmentIds = [],
  highlightedHitSegments = [],
  currentHitIndex = 0,
  currentHitSegmentId,
  globalHitCount,
  selectedMaterialKey,
  isSearching = false,
  cutNotice = "",
  queue,
  onSearch,
  onSelectMaterial,
  onSelectTranscriptRange,
  onSelectTranscriptTextRange,
  onNavigateHit,
  onCutSelection,
  onCancelSelection,
  onOpenCutOutputDirectory
}: {
  library: SourceLibraryResponse;
  localClips: LocalClipCatalog;
  search: SearchResponse;
  query: string;
  sourceFilter: MaterialSearchSourceFilter;
  orientationFilter: VideoOrientationFilter;
  selectedDetail: SourceVideoDetail;
  selectedSegments?: readonly TranscriptSegment[];
  selectedStartCharOffset?: number;
  selectedEndCharOffset?: number;
  highlightedSegmentIds?: readonly string[];
  highlightedHitSegments?: readonly SearchHitSegment[];
  currentHitIndex?: number;
  currentHitSegmentId?: string;
  globalHitCount?: number;
  selectedMaterialKey?: string;
  isSearching?: boolean;
  recentSearches?: readonly MaterialSearchHistoryItem[];
  cutNotice?: string;
  searchStatus?: MaterialLocatorSearchStatus;
  queue: readonly CutQueueJob[];
  cutMode?: CutMode;
  onSearch?: (query: string) => void;
  onSelectMaterial?: (result: MaterialLocatorResult) => void;
  onSelectTranscriptRange?: (startSegmentId: string, endSegmentId: string) => void;
  onSelectTranscriptTextRange?: (
    startSegmentId: string,
    startCharOffset: number,
    endSegmentId: string,
    endCharOffset: number
  ) => void;
  onNavigateHit?: (direction: "previous" | "next") => void;
  onCutSelection?: () => void;
  onCancelSelection?: () => void;
  onOpenCutOutputDirectory?: () => void;
  onSetCutMode?: (mode: CutMode) => void;
}) {
  const sections = buildMaterialLocatorSections({
    query,
    sourceFilter,
    orientationFilter,
    localClips,
    library,
    search
  });
  const hasActiveQuery = query.trim().length > 0;
  const hasFocusedMaterial = hasActiveQuery && Boolean(selectedMaterialKey);
  const focusedDetail = hasFocusedMaterial ? selectedDetail : undefined;
  const selectedIds = new Set(selectedSegments.map((segment) => segment.segment_id));
  const highlightedIds = new Set(highlightedSegmentIds);
  const highlightedRangesBySegmentId = new Map<string, Array<[number, number]>>();
  for (const segment of highlightedHitSegments) {
    const ranges = segment.match_ranges ?? [];
    if (ranges.length === 0) {
      continue;
    }

    highlightedRangesBySegmentId.set(segment.segment_id, [
      ...(highlightedRangesBySegmentId.get(segment.segment_id) ?? []),
      ...ranges
    ]);
  }
  const hitCount = globalHitCount ?? highlightedSegmentIds.length;
  const safeCurrentHitIndex =
    hitCount > 0
      ? Math.min(Math.max(currentHitIndex, 0), hitCount - 1)
      : 0;
  const activeHitSegmentId = currentHitSegmentId ?? highlightedSegmentIds[safeCurrentHitIndex];
  const orientation = focusedDetail ? videoOrientation(focusedDetail) : "landscape";
  const focusedMediaUrl = focusedDetail?.media_url ?? "";
  const fixtureOnlyVideo =
    focusedMediaUrl.includes("/fixture-media/") ||
    focusedMediaUrl.includes("/local-clips/");
  const videoSource = fixtureOnlyVideo ? undefined : focusedMediaUrl;
  const focusedCoverUrl = focusedDetail?.cover_url ?? "";
  const usesDesignReferencePoster =
    fixtureOnlyVideo && focusedMediaUrl.includes("/fixture-media/cashflow.mp4");
  const usesCashflowPreviewPoster =
    fixtureOnlyVideo &&
    (focusedMediaUrl.includes("/fixture-media/cashflow.mp4") ||
      focusedCoverUrl.includes("/fixture-media/cashflow-cover.png"));
  const previewPosterUrl =
    usesDesignReferencePoster
      ? "/fixture-media/design-material-video-frame.png"
      : usesCashflowPreviewPoster
        ? "/fixture-media/cashflow-preview.png"
        : focusedCoverUrl;
  const transcriptSegments = focusedDetail?.transcript.segments ?? [];
  const transcriptSegmentCount = transcriptSegments.length;
  const activeHitSegmentIndex = activeHitSegmentId
    ? transcriptSegments.findIndex((segment) => segment.segment_id === activeHitSegmentId)
    : -1;
  const transcriptVirtualized = transcriptSegmentCount > TRANSCRIPT_VIRTUALIZATION_THRESHOLD;
  const candidateCount = sections.reduce((sum, section) => sum + section.items.length, 0);
  const activeHitSegment =
    activeHitSegmentIndex >= 0 ? transcriptSegments[activeHitSegmentIndex] : undefined;
  const focusedMaterial = sections
    .flatMap((section) => section.items)
    .find((item) => `${item.source}:${item.id}` === selectedMaterialKey);
  const focusedMaterialHitCount = focusedMaterial?.hit_count ?? highlightedSegmentIds.length;
  const isPreviewLoading = hasActiveQuery && !isSearching && candidateCount > 0 && !focusedDetail;
  const hasHitNavigation = hitCount > 0;
  const candidateHitCount = sections.reduce(
    (sum, section) => sum + section.items.reduce((sectionSum, item) => sectionSum + item.hit_count, 0),
    0
  );
  const hasMoreSearchResults = Boolean(search.has_more || search.next_cursor);
  const candidateSummaryLabel = materialLocatorCandidateSummary({
    hasActiveQuery,
    candidateCount,
    hitCount: candidateHitCount,
    isSearching,
    hasMoreSearchResults
  });
  const recentQueue = queue.slice(0, 5);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const transcriptBodyRef = useRef<HTMLDivElement | null>(null);
  const selectionBarRef = useRef<HTMLDivElement | null>(null);
  const segmentRefs = useRef(new Map<string, HTMLSpanElement>());
  const dragStartRef = useRef<string | null>(null);
  const dragEndRef = useRef<string | null>(null);
  const previewEndMsRef = useRef<number | null>(null);
  const lastAutoSeekKeyRef = useRef<string | undefined>(undefined);
  const [selectionBarAnchor, setSelectionBarAnchor] = useState<{ left: number; top: number } | null>(null);
  const [dragPreviewSegmentIds, setDragPreviewSegmentIds] = useState<readonly string[]>([]);
  const [timeSelectionStartSegmentId, setTimeSelectionStartSegmentId] = useState<string | undefined>();
  const [previewActive, setPreviewActive] = useState(false);
  const [mediaDurationMs, setMediaDurationMs] = useState<number | undefined>();
  const [transcriptRenderRange, setTranscriptRenderRange] = useState<TranscriptRenderRange>(() =>
    transcriptRangeAroundIndex(activeHitSegmentIndex, transcriptSegmentCount)
  );
  const safeTranscriptRenderRange = transcriptVirtualized
    ? clampTranscriptRange(transcriptRenderRange, transcriptSegmentCount)
    : { start: 0, end: transcriptSegmentCount };
  const renderedTranscriptSegments = transcriptSegments.slice(
    safeTranscriptRenderRange.start,
    safeTranscriptRenderRange.end
  );
  const transcriptTopSpacerHeight = transcriptVirtualized
    ? safeTranscriptRenderRange.start * TRANSCRIPT_ROW_ESTIMATED_HEIGHT
    : 0;
  const transcriptBottomSpacerHeight = transcriptVirtualized
    ? (transcriptSegmentCount - safeTranscriptRenderRange.end) * TRANSCRIPT_ROW_ESTIMATED_HEIGHT
    : 0;
  const focusedVideoLabel = focusedDetail
    ? [
        focusedDetail.title,
        sourceLabelFromMaterialKey(selectedMaterialKey),
        videoOrientationLabel(focusedDetail),
        formatDuration(materialLocatorDisplayDurationMs(focusedDetail.duration_ms, mediaDurationMs)),
        `文案 ${transcriptCharacterCount(focusedDetail)} 字`,
        `命中 ${focusedMaterialHitCount} 处`
      ].join(" · ")
    : "";
  const previewTimeLabel = activeHitSegment ? formatDuration(activeHitSegment.begin_ms) : "0:00";
  const previewDurationLabel = focusedDetail
    ? formatDuration(materialLocatorDisplayDurationMs(focusedDetail.duration_ms, mediaDurationMs))
    : "0:00";
  const staticPreviewStyle: CSSProperties | undefined = previewPosterUrl
    ? ({
        "--cutter-video-poster": `url("${previewPosterUrl}")`
      } as CSSProperties)
    : undefined;
  const selectedText = selectedTranscriptText(
    selectedSegments,
    selectedStartCharOffset,
    selectedEndCharOffset
  );
  const hasSelectedText = selectedSegments.length > 0 && Boolean(selectedText);
  const hasSelectedTextRange = hasSelectedText &&
    typeof selectedStartCharOffset === "number" &&
    typeof selectedEndCharOffset === "number";
  const showFloatingSelectionAction = Boolean(focusedDetail && hasSelectedTextRange && selectionBarAnchor);
  const selectedRangeBeginMs = selectedBeginMs(selectedSegments, selectedStartCharOffset);
  const selectedRangeEndMs = selectedEndMs(selectedSegments, selectedEndCharOffset);
  const dragPreviewIds = new Set(dragPreviewSegmentIds);
  const timeSelectionStartIds = new Set(timeSelectionStartSegmentId ? [timeSelectionStartSegmentId] : []);
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onSearch?.(String(formData.get("query") ?? ""));
  }

  function setSegmentRef(segmentId: string, node: HTMLSpanElement | null) {
    if (node) {
      segmentRefs.current.set(segmentId, node);
    } else {
      segmentRefs.current.delete(segmentId);
    }
  }

  function transcriptTextEndpointFromNode(node: Node, offset: number): {
    segmentId: string;
    charOffset: number;
  } | null {
    const element = node.nodeType === Node.TEXT_NODE
      ? node.parentElement
      : node instanceof Element
        ? node
        : null;
    const row = element?.closest<HTMLElement>(".cutter-transcript-row[data-segment-id]");
    const textElement = row?.querySelector<HTMLElement>(".cutter-transcript-text");
    const segmentId = row?.dataset.segmentId;
    if (!row || !textElement || !segmentId || !textElement.contains(node)) {
      return null;
    }

    const range = document.createRange();
    range.selectNodeContents(textElement);
    range.setEnd(node, offset);

    return {
      segmentId,
      charOffset: range.toString().length
    };
  }

  function selectedTranscriptTextRange(): {
    startSegmentId: string;
    startCharOffset: number;
    endSegmentId: string;
    endCharOffset: number;
  } | null {
    const selection = window.getSelection?.();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return null;
    }

    const anchor = transcriptTextEndpointFromNode(selection.anchorNode!, selection.anchorOffset);
    const focus = transcriptTextEndpointFromNode(selection.focusNode!, selection.focusOffset);
    if (!anchor || !focus) {
      return null;
    }

    const anchorIndex = transcriptSegments.findIndex((segment) => segment.segment_id === anchor.segmentId);
    const focusIndex = transcriptSegments.findIndex((segment) => segment.segment_id === focus.segmentId);
    if (anchorIndex < 0 || focusIndex < 0) {
      return null;
    }

    if (
      anchorIndex === focusIndex &&
      anchor.charOffset === focus.charOffset
    ) {
      return null;
    }

    if (
      anchorIndex < focusIndex ||
      (anchorIndex === focusIndex && anchor.charOffset < focus.charOffset)
    ) {
      return {
        startSegmentId: anchor.segmentId,
        startCharOffset: anchor.charOffset,
        endSegmentId: focus.segmentId,
        endCharOffset: focus.charOffset
      };
    }

    return {
      startSegmentId: focus.segmentId,
      startCharOffset: focus.charOffset,
      endSegmentId: anchor.segmentId,
      endCharOffset: anchor.charOffset
    };
  }

  function floatingAnchorFromEvent(event: ReactMouseEvent<HTMLElement>): { left: number; top: number } {
    return {
      left: Math.min(Math.max(event.clientX, 220), window.innerWidth - 220),
      top: Math.max(88, event.clientY - 8)
    };
  }

  function seekToSegment(segment: TranscriptSegment) {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.currentTime = previewStartSeconds(segment.begin_ms);
  }

  function playSegmentsPreview(segments: readonly TranscriptSegment[]) {
    const playbackWindow = selectionPlaybackWindow(segments);
    if (!playbackWindow || !videoRef.current) {
      return;
    }

    videoRef.current.currentTime = playbackWindow.startSeconds;
    previewEndMsRef.current = segments[segments.length - 1]?.end_ms ?? null;
    const playResult = videoRef.current.play();
    setPreviewActive(true);
    if (playResult && typeof playResult.catch === "function") {
      playResult.catch(() => setPreviewActive(false));
    }
  }

  function playCurrentSelectionPreview() {
    const first = selectedSegments[0];
    const last = selectedSegments[selectedSegments.length - 1];
    if (!first || !last || !videoRef.current) {
      return;
    }

    videoRef.current.currentTime = previewStartSeconds(selectedRangeBeginMs ?? first.begin_ms);
    previewEndMsRef.current = selectedRangeEndMs ?? last.end_ms;
    const playResult = videoRef.current.play();
    setPreviewActive(true);
    if (playResult && typeof playResult.catch === "function") {
      playResult.catch(() => setPreviewActive(false));
    }
  }

  function pauseSelectionPreview() {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    previewEndMsRef.current = null;
    setPreviewActive(false);
  }

  function handleSegmentMouseDown(segment: TranscriptSegment) {
    dragStartRef.current = segment.segment_id;
    dragEndRef.current = segment.segment_id;
    setDragPreviewSegmentIds([]);
  }

  function handleSegmentMouseEnter(segment: TranscriptSegment) {
    if (dragStartRef.current) {
      dragEndRef.current = segment.segment_id;
      if (focusedDetail && dragStartRef.current !== segment.segment_id) {
        setDragPreviewSegmentIds(
          continuousTranscriptSegments(focusedDetail.transcript.segments, {
            startSegmentId: dragStartRef.current,
            endSegmentId: segment.segment_id
          }).map((selectedSegment) => selectedSegment.segment_id)
        );
      }
    }
  }

  function handleTranscriptTimeClick(
    event: ReactMouseEvent<HTMLButtonElement>,
    segment: TranscriptSegment
  ) {
    event.preventDefault();
    event.stopPropagation();

    if (!focusedDetail) {
      return;
    }

    const result = materialLocatorTimeSelectionRange({
      segments: focusedDetail.transcript.segments,
      pendingStartSegmentId: timeSelectionStartSegmentId,
      clickedSegmentId: segment.segment_id
    });

    if (result.type === "pending") {
      pauseSelectionPreview();
      setSelectionBarAnchor(null);
      setTimeSelectionStartSegmentId(result.pendingStartSegmentId);
      return;
    }

    const selectedTimeSegments = continuousTranscriptSegments(focusedDetail.transcript.segments, {
      startSegmentId: result.startSegmentId,
      endSegmentId: result.endSegmentId
    });
    const firstSelectedTimeSegment = selectedTimeSegments[0];
    if (firstSelectedTimeSegment) {
      seekToSegment(firstSelectedTimeSegment);
    }

    setTimeSelectionStartSegmentId(undefined);
    setSelectionBarAnchor(floatingAnchorFromEvent(event));
    playSegmentsPreview(selectedTimeSegments);
    onSelectTranscriptTextRange?.(
      result.startSegmentId,
      result.startCharOffset,
      result.endSegmentId,
      result.endCharOffset
    );
  }

  function handleTranscriptMouseUp(event: ReactMouseEvent<HTMLDivElement>) {
    if (!focusedDetail) {
      return;
    }

    const textRange = selectedTranscriptTextRange();
    if (textRange) {
      dragStartRef.current = null;
      dragEndRef.current = null;
      setDragPreviewSegmentIds([]);
      setTimeSelectionStartSegmentId(undefined);
      const selectedTextSegments = continuousTranscriptSegments(focusedDetail.transcript.segments, {
        startSegmentId: textRange.startSegmentId,
        endSegmentId: textRange.endSegmentId
      });
      const firstSelectedTextSegment = selectedTextSegments[0];
      if (firstSelectedTextSegment) {
        seekToSegment(firstSelectedTextSegment);
      }
      setSelectionBarAnchor(floatingAnchorFromEvent(event));
      playSegmentsPreview(selectedTextSegments);
      onSelectTranscriptTextRange?.(
        textRange.startSegmentId,
        textRange.startCharOffset,
        textRange.endSegmentId,
        textRange.endCharOffset
      );
      window.getSelection?.()?.removeAllRanges();
      return;
    }

    const dragStartSegmentId = dragStartRef.current;
    const dragEndSegmentId = dragEndRef.current;
    if (!dragStartSegmentId) {
      dragStartRef.current = null;
      dragEndRef.current = null;
      setDragPreviewSegmentIds([]);
      return;
    }

    if (shouldSuppressTranscriptClickAfterMouseUp(dragStartSegmentId, dragEndSegmentId ?? undefined)) {
      const draggedSegments = continuousTranscriptSegments(focusedDetail.transcript.segments, {
        startSegmentId: dragStartSegmentId,
        endSegmentId: dragEndSegmentId ?? dragStartSegmentId
      });
      const firstDraggedSegment = draggedSegments[0];
      if (firstDraggedSegment) {
        seekToSegment(firstDraggedSegment);
      }
      setSelectionBarAnchor(floatingAnchorFromEvent(event));
      playSegmentsPreview(draggedSegments);
      onSelectTranscriptRange?.(dragStartSegmentId, dragEndSegmentId ?? dragStartSegmentId);
    }
    dragStartRef.current = null;
    dragEndRef.current = null;
    setDragPreviewSegmentIds([]);
    setTimeSelectionStartSegmentId(undefined);
  }

  function handleTranscriptScroll(event: UIEvent<HTMLDivElement>) {
    if (!transcriptVirtualized) {
      return;
    }

    const nextRange = transcriptRangeFromScroll(
      event.currentTarget.scrollTop,
      event.currentTarget.clientHeight,
      transcriptSegmentCount
    );

    setTranscriptRenderRange((current) =>
      current.start === nextRange.start && current.end === nextRange.end ? current : nextRange
    );
  }

  function handleToggleSelectionPreview() {
    if (previewActive) {
      pauseSelectionPreview();
      return;
    }

    playCurrentSelectionPreview();
  }

  function handleCutSelection() {
    pauseSelectionPreview();
    setSelectionBarAnchor(null);
    setTimeSelectionStartSegmentId(undefined);
    onCutSelection?.();
  }

  useEffect(() => {
    if (!hasSelectedTextRange) {
      setSelectionBarAnchor(null);
    }
  }, [hasSelectedTextRange, selectedMaterialKey]);

  useEffect(() => {
    setTimeSelectionStartSegmentId(undefined);
  }, [selectedMaterialKey]);

  useEffect(() => {
    if (!timeSelectionStartSegmentId) {
      return;
    }

    const listener = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-transcript-time-selector='true']")) {
        return;
      }

      setTimeSelectionStartSegmentId(undefined);
    };

    document.addEventListener("mousedown", listener);
    return () => document.removeEventListener("mousedown", listener);
  }, [timeSelectionStartSegmentId]);

  useEffect(() => {
    if (!showFloatingSelectionAction) {
      return;
    }

    const listener = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && selectionBarRef.current?.contains(target)) {
        return;
      }

      pauseSelectionPreview();
      setSelectionBarAnchor(null);
    };

    document.addEventListener("mousedown", listener);
    return () => document.removeEventListener("mousedown", listener);
  }, [showFloatingSelectionAction]);

  useEffect(() => {
    if (!selectedText) {
      return;
    }

    const listener = (event: KeyboardEvent) => {
      const action = materialLocatorSelectionShortcutAction({
        key: event.key,
        code: event.code,
        defaultPrevented: event.defaultPrevented,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        ignoreTarget: shouldIgnoreSelectionShortcutTarget(event.target),
        hasSelectedText: hasSelectedTextRange
      });

      if (action === "cut") {
        event.preventDefault();
        handleCutSelection();
        return;
      }

      if (action === "preview") {
        event.preventDefault();
        handleToggleSelectionPreview();
      }
    };

    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [handleCutSelection, hasSelectedTextRange, previewActive, selectedText]);

  function handleCancelSelection() {
    pauseSelectionPreview();
    setSelectionBarAnchor(null);
    setTimeSelectionStartSegmentId(undefined);
    onCancelSelection?.();
  }

  function handleVideoTimeUpdate() {
    const previewEndMs = previewEndMsRef.current;
    if (!previewEndMs || !videoRef.current) {
      return;
    }

    if (shouldPauseSelectionPreview(videoRef.current.currentTime, previewEndMs)) {
      pauseSelectionPreview();
    }
  }

  function handleVideoLoadedMetadata(event: SyntheticEvent<HTMLVideoElement>) {
    const durationSeconds = event.currentTarget.duration;
    if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
      setMediaDurationMs(Math.round(durationSeconds * 1000));
    }
  }

  useEffect(() => {
    setMediaDurationMs(undefined);
  }, [focusedDetail?.source_video_id, focusedDetail?.media_url, selectedMaterialKey]);

  useEffect(() => {
    setTranscriptRenderRange(transcriptRangeAroundIndex(activeHitSegmentIndex, transcriptSegmentCount));
    if (transcriptBodyRef.current) {
      transcriptBodyRef.current.scrollTop = Math.max(
        0,
        activeHitSegmentIndex * TRANSCRIPT_ROW_ESTIMATED_HEIGHT -
          transcriptBodyRef.current.clientHeight / 2
      );
    }
  }, [activeHitSegmentIndex, focusedDetail?.source_video_id, transcriptSegmentCount]);

  useEffect(() => {
    const autoSeekKey = materialLocatorAutoSeekKey(focusedDetail, activeHitSegmentId);
    if (!activeHitSegmentId || !focusedDetail || !autoSeekKey) {
      lastAutoSeekKeyRef.current = undefined;
      return;
    }

    if (lastAutoSeekKeyRef.current === autoSeekKey) {
      return;
    }

    lastAutoSeekKeyRef.current = autoSeekKey;

    if (transcriptVirtualized && activeHitSegmentIndex >= 0) {
      setTranscriptRenderRange(transcriptRangeAroundIndex(activeHitSegmentIndex, transcriptSegmentCount));
      window.requestAnimationFrame(() => {
        if (!transcriptBodyRef.current) {
          return;
        }

        transcriptBodyRef.current.scrollTop = Math.max(
          0,
          activeHitSegmentIndex * TRANSCRIPT_ROW_ESTIMATED_HEIGHT -
            transcriptBodyRef.current.clientHeight / 2
        );
      });
    } else {
      const currentHitNode = segmentRefs.current.get(activeHitSegmentId);
      currentHitNode?.scrollIntoView({ block: "center" });
    }

    const currentHitSegment = activeHitSegment ??
      focusedDetail.transcript.segments.find(
        (segment) => segment.segment_id === activeHitSegmentId
      );
    if (currentHitSegment) {
      seekToSegment(currentHitSegment);
    }
  }, [
    activeHitSegmentId,
    activeHitSegmentIndex,
    activeHitSegment,
    focusedDetail,
    transcriptSegmentCount,
    transcriptSegments,
    transcriptVirtualized
  ]);

  const selectionBarStyle: CSSProperties | undefined = selectionBarAnchor
    ? {
        left: selectionBarAnchor.left,
        top: selectionBarAnchor.top
      }
    : undefined;

  return (
    <section
      className="cutter-page cutter-material-locator"
      data-layout="search-select-cut"
      data-page="material-locator"
      data-product-page="material-search"
    >
      <div className="cutter-page-main">
        <section className="cutter-locator-command" aria-label="素材搜索">
          <div className="cutter-locator-command-header">
            <form className="cutter-search-form cutter-locator-search-form" key={query} onSubmit={handleSubmit}>
              <div className="cutter-search-box">
                <span className="cutter-search-icon" aria-hidden="true">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="M16.5 16.5L21 21" />
                  </svg>
                </span>
                <input
                  name="query"
                  defaultValue={query}
                  aria-label="搜索文案关键词或粘贴爆款文案"
                  placeholder="搜索文案关键词或粘贴爆款文案"
                />
              </div>
              <button className="cutter-locator-search-submit" type="submit">
                搜索
              </button>
            </form>
          </div>
        </section>

        <section className={`cutter-locator-workbench is-${orientation}`} aria-label="素材搜索工作台">
          <section className="cutter-locator-candidates" aria-label="候选素材">
              <header>
                <div>
                  <h2>候选素材</h2>
                  <span aria-live="polite">{candidateSummaryLabel}</span>
                </div>
              </header>
              <div className="cutter-locator-results">
                {!hasActiveQuery ? (
                  <div className="cutter-empty-state">
                    <strong>先搜索文案</strong>
                    <span>输入关键词或粘贴文案后，系统会列出可选素材。</span>
                  </div>
                ) : isSearching && sections.length === 0 ? (
                  <div className="cutter-empty-state">
                    <strong>正在匹配文案</strong>
                    <span>长文案会跨句检索，结果返回前不会判定为无命中。</span>
                  </div>
                ) : sections.length === 0 ? (
                  <div className="cutter-empty-state">
                    <strong>没有找到可选素材</strong>
                    <span>可以换一个关键词，或到公共素材库确认可用素材是否已经发布。</span>
                  </div>
                ) : (
                  sections.map((section) => (
                    <section className="cutter-locator-section" key={section.key}>
                      <header>
                        <h2>⌄ {section.label}（{section.items.length}）</h2>
                      </header>
                      <div className="cutter-locator-result-list">
                        {section.items.map((item) => (
                          <button
                            className={[
                              "cutter-locator-result",
                              selectedMaterialKey === `${item.source}:${item.id}` ? "is-selected" : ""
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            type="button"
                            key={`${item.source}-${item.id}`}
                            onClick={() => onSelectMaterial?.(item)}
                          >
                            {item.cover_url ? (
                              <img src={item.cover_url} alt="" />
                            ) : (
                              <span className="cutter-cover-placeholder" />
                            )}
                            <span className="cutter-locator-result-body">
                              <strong>{item.title}</strong>
                              <span className="cutter-locator-result-meta">
                                <small>{item.transcript_character_count.toLocaleString()} 字</small>
                                <small>{formatDuration(item.duration_ms)} · 命中 {item.hit_count}</small>
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                      <span className="cutter-locator-expand-button">
                        {materialLocatorSectionFooterLabel({
                          sectionKey: section.key,
                          itemCount: section.items.length,
                          isSearching,
                          hasMoreSearchResults
                        })}
                      </span>
                    </section>
                  ))
                )}
              </div>
            </section>

            <section
              className="cutter-natural-transcript"
              data-autoscroll-target={activeHitSegmentId}
              data-current-hit-segment-id={activeHitSegmentId}
              data-current-hit-time-ms={activeHitSegment?.begin_ms ?? ""}
              data-selection-mode="natural-text"
            >
              <header>
                <div className="cutter-transcript-heading">
                  <h2>视频文案</h2>
                  <div className="cutter-hit-navigation" aria-label="命中文案切换">
                    <button
                      type="button"
                      disabled={!hasHitNavigation}
                      onClick={() => onNavigateHit?.("previous")}
                    >
                      上一个
                    </button>
                    <button
                      type="button"
                      disabled={!hasHitNavigation}
                      onClick={() => onNavigateHit?.("next")}
                    >
                      下一个
                    </button>
                  </div>
                </div>
              </header>
              {focusedDetail ? (
                <div
                  className="cutter-transcript-body"
                  data-rendered-segments={renderedTranscriptSegments.length}
                  data-total-segments={transcriptSegmentCount}
                  data-virtualized={transcriptVirtualized ? "true" : "false"}
                  onMouseUp={handleTranscriptMouseUp}
                  onScroll={handleTranscriptScroll}
                  ref={transcriptBodyRef}
                >
                  {transcriptVirtualized && transcriptTopSpacerHeight > 0 ? (
                    <span
                      aria-hidden="true"
                      className="cutter-transcript-spacer"
                      style={{ height: transcriptTopSpacerHeight }}
                    />
                  ) : null}
                  {renderedTranscriptSegments.map((segment, renderedIndex) => {
                    const absoluteIndex = safeTranscriptRenderRange.start + renderedIndex;

                    return (
                    <span
                      className={[
                        "cutter-transcript-row",
                        selectedIds.has(segment.segment_id) ? "is-selected" : "",
                        dragPreviewIds.has(segment.segment_id) ? "is-drag-preview" : "",
                        timeSelectionStartIds.has(segment.segment_id) ? "is-time-selection-start" : "",
                        highlightedIds.has(segment.segment_id) ? "is-highlighted" : "",
                        segment.segment_id === activeHitSegmentId ? "is-current-hit" : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      data-segment-id={segment.segment_id}
                      key={segment.segment_id}
                      ref={(node) => setSegmentRef(segment.segment_id, node)}
                      onMouseDown={() => handleSegmentMouseDown(segment)}
                      onMouseEnter={() => handleSegmentMouseEnter(segment)}
                    >
                      <button
                        aria-label={`${formatDuration(segment.begin_ms)} 作为选区时间点`}
                        aria-pressed={timeSelectionStartIds.has(segment.segment_id)}
                        className="cutter-transcript-time"
                        data-transcript-time-selector="true"
                        onClick={(event) => handleTranscriptTimeClick(event, segment)}
                        onMouseDown={(event) => event.stopPropagation()}
                        type="button"
                      >
                        {formatDuration(segment.begin_ms)}
                      </button>
                      <span className="cutter-transcript-index">{transcriptSegmentOrdinal(segment, absoluteIndex)}</span>
                      <span className="cutter-transcript-text">
                        {splitTextByHighlightRanges(
                          segment.text,
                          highlightedRangesBySegmentId.get(segment.segment_id),
                          query
                        ).map((part, partIndex) =>
                          part.highlighted ? (
                            <mark
                              data-testid="transcript-hit"
                              key={`${segment.segment_id}-${partIndex}`}
                              onMouseDown={(event) => event.stopPropagation()}
                            >
                              {part.text}
                            </mark>
                          ) : (
                            <span key={`${segment.segment_id}-${partIndex}`}>{part.text}</span>
                          )
                        )}
                      </span>
                    </span>
                    );
                  })}
                  {transcriptVirtualized && transcriptBottomSpacerHeight > 0 ? (
                    <span
                      aria-hidden="true"
                      className="cutter-transcript-spacer"
                      style={{ height: transcriptBottomSpacerHeight }}
                    />
                  ) : null}
                </div>
              ) : (
                <div className="cutter-transcript-empty">
                  <strong>{isSearching ? "正在匹配文案" : isPreviewLoading ? "正在加载预览" : "先搜索文案"}</strong>
                  <span>
                    {isSearching
                      ? "搜索完成后会自动定位到第一处命中文案。"
                      : isPreviewLoading
                        ? "已找到候选素材，正在准备视频与文案高亮。"
                        : "点击候选素材后，这里会定位到命中文案并高亮显示。"}
                  </span>
                </div>
              )}
              {showFloatingSelectionAction ? (
                <div
                  className={[
                    "cutter-selection-bar",
                    "cutter-floating-selection-bar",
                    "cutter-compact-selection-bar",
                    "is-anchored"
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={selectionBarStyle}
                  ref={selectionBarRef}
                >
                  <strong>
                    已选 {selectedDurationLabel(selectedSegments, selectedStartCharOffset, selectedEndCharOffset)}
                  </strong>
                  <button className="cutter-primary-button" type="button" onClick={handleCutSelection}>
                    剪切这段
                  </button>
                </div>
              ) : null}
            </section>

          <aside className="cutter-locator-side-panel" aria-label="画面验证与单片段导出">
            <section className="cutter-locator-visual" aria-label="画面验证">
              <header>
                <div>
                  <h2>视频预览</h2>
                  <span>{focusedDetail ? focusedVideoLabel : "选择候选素材后验证画面"}</span>
                </div>
              </header>
              <section className="cutter-video-panel">
                {focusedDetail ? (
                  <div className="cutter-video-frame">
                    {videoSource ? (
                      <video
                        aria-label="视频预览"
                        data-testid="locator-video"
                        onLoadedMetadata={handleVideoLoadedMetadata}
                        onTimeUpdate={handleVideoTimeUpdate}
                        poster={previewPosterUrl}
                        preload="none"
                        ref={videoRef}
                        src={videoSource}
                        controls
                      />
                    ) : (
                      <div
                        aria-label="视频预览"
                        className={`cutter-video-poster-frame${usesDesignReferencePoster ? " is-reference-poster" : ""}`}
                        data-testid="locator-video-poster"
                        style={staticPreviewStyle}
                      >
                        {usesDesignReferencePoster ? null : (
                          <div className="cutter-video-poster-controls" aria-hidden="true">
                            <span className="cutter-video-play-icon" />
                            <span className="cutter-video-time-label">
                              {previewTimeLabel} / {previewDurationLabel}
                            </span>
                            <span className="cutter-video-volume-icon" />
                            <span className="cutter-video-fullscreen-icon" />
                            <span className="cutter-video-menu-icon" />
                            <span className="cutter-video-progress-track">
                              <span className="cutter-video-progress-value" />
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="cutter-video-empty">
                    <strong>{isSearching ? "正在匹配文案" : isPreviewLoading ? "正在加载预览" : "先搜索文案"}</strong>
                    <span>
                      {isSearching
                        ? "长文案需要跨句检索，请稍候。"
                        : isPreviewLoading
                          ? "已找到候选素材，正在定位命中文案。"
                          : "选择候选素材后，这里用于验证画面。"}
                    </span>
                  </div>
                )}
              </section>
            </section>

            <section className="cutter-locator-cut-panel" aria-label="选区导出">
              <header>
                <div>
                  <h2>选区信息</h2>
                  <span>
                    {selectedSegments.length > 0
                      ? `已选 ${selectedDurationLabel(selectedSegments, selectedStartCharOffset, selectedEndCharOffset)}`
                      : "暂无选区"}
                  </span>
                </div>
              </header>
              <div className="cutter-locator-cut-selection">
                <div className="cutter-locator-selected-copy">
                  <p>{selectedText || "暂无选区"}</p>
                </div>
              </div>
            </section>

            <section className="cutter-locator-queue-panel" aria-label="最近剪切任务">
              <header>
                <h2>最近剪切任务</h2>
                <a className="cutter-inline-action cutter-queue-all-action" href="#/cut-tasks">
                  查看全部任务
                </a>
              </header>
              {cutNotice ? (
                <div className="cutter-locator-queue-notice" role="status">
                  {cutNotice}
                </div>
              ) : null}
              <div className="cutter-locator-queue-table">
                <div className="cutter-locator-queue-head">
                  <span>状态</span>
                  <span>来源视频</span>
                  <span>时长</span>
                </div>
                {recentQueue.length > 0 ? (
                  recentQueue.map((job) => {
                    return (
                      <div className={`cutter-locator-queue-row is-${job.status}`} key={job.queue_job_id}>
                        <span>{queueStatusLabel(job.status)}</span>
                        <strong>{job.title}</strong>
                        <small>{formatDuration(job.duration_ms)}</small>
                      </div>
                    );
                  })
                ) : (
                  <span>暂无剪切任务</span>
                )}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </section>
  );
}
