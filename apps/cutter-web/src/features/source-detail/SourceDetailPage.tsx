import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent
} from "react";
import { Button, InspectorPanel } from "@mixlab/ui-foundation";
import { formatDuration, type SourceVideoDetail, type TranscriptSegment } from "../../api.ts";

function transcriptTextLength(text: string): number {
  return Array.from(text).length;
}

function sliceTranscriptText(text: string, start: number, end: number): string {
  return Array.from(text).slice(start, end).join("");
}

function selectedText(
  segments: readonly TranscriptSegment[],
  startCharOffset?: number,
  endCharOffset?: number
): string {
  return segments
    .map((segment, index) => {
      const start = index === 0 && typeof startCharOffset === "number" ? startCharOffset : 0;
      const end =
        index === segments.length - 1 && typeof endCharOffset === "number"
          ? endCharOffset
          : transcriptTextLength(segment.text);

      return sliceTranscriptText(segment.text, start, end);
    })
    .join(" ");
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

  const begin = typeof startCharOffset === "number" ? first.begin_ms : first.begin_ms;
  const end = typeof endCharOffset === "number" ? last.end_ms : last.end_ms;
  return `${Math.max(1, Math.round((end - begin) / 1000))} 秒`;
}

function segmentIdsBetween(
  segments: readonly TranscriptSegment[],
  startSegmentId: string,
  endSegmentId: string
): string[] {
  const startIndex = segments.findIndex((segment) => segment.segment_id === startSegmentId);
  const endIndex = segments.findIndex((segment) => segment.segment_id === endSegmentId);
  if (startIndex < 0 || endIndex < 0) {
    return [];
  }

  const [from, to] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
  return segments.slice(from, to + 1).map((segment) => segment.segment_id);
}

function fullTranscriptSegmentSpans(
  segments: readonly TranscriptSegment[],
  fullText: string
): Array<{ segment: TranscriptSegment; start: number; end: number }> {
  let cursor = 0;
  return segments.map((segment) => {
    const foundAt = fullText.indexOf(segment.text, cursor);
    const start = foundAt >= 0 ? foundAt : cursor;
    const end = start + transcriptTextLength(segment.text);
    cursor = end;
    return { segment, start, end };
  });
}

function fullTranscriptEndpointFromNode(
  node: Node,
  offset: number,
  segments: readonly TranscriptSegment[],
  fullText: string
): { segmentId: string; charOffset: number } | null {
  const element = node.nodeType === Node.TEXT_NODE
    ? node.parentElement
    : node instanceof Element
      ? node
      : null;
  const fullTextElement = element?.closest<HTMLElement>(".cutter-full-text[data-full-transcript]");
  if (!fullTextElement || !fullTextElement.contains(node)) {
    return null;
  }

  const range = document.createRange();
  range.selectNodeContents(fullTextElement);
  range.setEnd(node, offset);
  const charOffset = transcriptTextLength(range.toString());
  const spans = fullTranscriptSegmentSpans(segments, fullText);
  const span = spans.find((item) => charOffset <= item.end) ?? spans[spans.length - 1];
  if (!span) {
    return null;
  }

  return {
    segmentId: span.segment.segment_id,
    charOffset: Math.min(Math.max(0, charOffset - span.start), transcriptTextLength(span.segment.text))
  };
}

function selectedFullTranscriptParts(input: {
  segments: readonly TranscriptSegment[];
  fullText: string;
  selectedSegments: readonly TranscriptSegment[];
  startCharOffset?: number;
  endCharOffset?: number;
}): Array<{ text: string; selected: boolean }> {
  const first = input.selectedSegments[0];
  const last = input.selectedSegments[input.selectedSegments.length - 1];
  if (!first || !last) {
    return [{ text: input.fullText, selected: false }];
  }

  const spans = fullTranscriptSegmentSpans(input.segments, input.fullText);
  const firstSpan = spans.find((item) => item.segment.segment_id === first.segment_id);
  const lastSpan = spans.find((item) => item.segment.segment_id === last.segment_id);
  if (!firstSpan || !lastSpan) {
    return [{ text: input.fullText, selected: false }];
  }

  const startOffset = typeof input.startCharOffset === "number" ? input.startCharOffset : 0;
  const endOffset = typeof input.endCharOffset === "number"
    ? input.endCharOffset
    : transcriptTextLength(last.text);
  const start = Math.max(0, Math.min(firstSpan.start + startOffset, input.fullText.length));
  const end = Math.max(start, Math.min(lastSpan.start + endOffset, input.fullText.length));

  return [
    { text: input.fullText.slice(0, start), selected: false },
    { text: input.fullText.slice(start, end), selected: true },
    { text: input.fullText.slice(end), selected: false }
  ].filter((part) => part.text.length > 0);
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
  const row = element?.closest<HTMLElement>(".ml-segment-row[data-segment-id]");
  const textElement = row?.querySelector<HTMLElement>(".ml-segment-text");
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

function selectedTranscriptTextRange(segments: readonly TranscriptSegment[], fullText: string): {
  startSegmentId: string;
  startCharOffset: number;
  endSegmentId: string;
  endCharOffset: number;
} | null {
  const selection = window.getSelection?.();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  const anchor =
    transcriptTextEndpointFromNode(selection.anchorNode!, selection.anchorOffset) ??
    fullTranscriptEndpointFromNode(selection.anchorNode!, selection.anchorOffset, segments, fullText);
  const focus =
    transcriptTextEndpointFromNode(selection.focusNode!, selection.focusOffset) ??
    fullTranscriptEndpointFromNode(selection.focusNode!, selection.focusOffset, segments, fullText);
  if (!anchor || !focus) {
    return null;
  }

  const anchorIndex = segments.findIndex((segment) => segment.segment_id === anchor.segmentId);
  const focusIndex = segments.findIndex((segment) => segment.segment_id === focus.segmentId);
  if (anchorIndex < 0 || focusIndex < 0) {
    return null;
  }

  if (anchorIndex === focusIndex && anchor.charOffset === focus.charOffset) {
    return null;
  }

  if (anchorIndex < focusIndex || (anchorIndex === focusIndex && anchor.charOffset < focus.charOffset)) {
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

export function SourceDetailPage({
  detail,
  selectedSegments = [],
  selectedStartCharOffset,
  selectedEndCharOffset,
  highlightedSegmentIds = [],
  onSelectTranscriptRange,
  onSelectTranscriptTextRange,
  onCancelSelection,
  onAddToCutList
}: {
  detail: SourceVideoDetail;
  selectedSegments?: TranscriptSegment[];
  selectedStartCharOffset?: number;
  selectedEndCharOffset?: number;
  highlightedSegmentIds?: readonly string[];
  onSelectTranscriptRange?: (startSegmentId: string, endSegmentId: string) => void;
  onSelectTranscriptTextRange?: (
    startSegmentId: string,
    startCharOffset: number,
    endSegmentId: string,
    endCharOffset: number
  ) => void;
  onCancelSelection?: () => void;
  onAddToCutList?: () => void;
}) {
  const transcriptRef = useRef<HTMLElement | null>(null);
  const selectionBarRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<string | null>(null);
  const [selectionBarAnchor, setSelectionBarAnchor] = useState<{ left: number; top: number } | null>(null);
  const [dragPreviewSegmentIds, setDragPreviewSegmentIds] = useState<readonly string[]>([]);
  const firstSelected = selectedSegments[0];
  const lastSelected = selectedSegments[selectedSegments.length - 1];
  const selectedRange =
    firstSelected && lastSelected
      ? `${formatDuration(firstSelected.begin_ms)} - ${formatDuration(lastSelected.end_ms)}`
      : "未选择";
  const selectionTitle = selectedSegments.length > 0 ? `${detail.title} 片段` : "未选择片段";
  const canAddSelection = selectedSegments.length > 0 && Boolean(onAddToCutList);
  const videoSource = detail.media_url.startsWith("/fixture-media/") ? undefined : detail.media_url;
  const selectedSegmentIds = new Set(selectedSegments.map((segment) => segment.segment_id));
  const highlightedIds = new Set(highlightedSegmentIds);
  const previewIds = new Set(dragPreviewSegmentIds);
  const fullTranscriptParts = selectedFullTranscriptParts({
    segments: detail.transcript.segments,
    fullText: detail.transcript.full_text,
    selectedSegments,
    startCharOffset: selectedStartCharOffset,
    endCharOffset: selectedEndCharOffset
  });
  const showFloatingSelectionAction = canAddSelection && selectionBarAnchor;
  const selectionBarStyle: CSSProperties | undefined = selectionBarAnchor
    ? {
        position: "fixed",
        left: selectionBarAnchor.left,
        top: selectionBarAnchor.top,
        transform: "translate(-50%, -100%)"
      }
    : undefined;

  useEffect(() => {
    function handleDocumentMouseDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (
        target &&
        (selectionBarRef.current?.contains(target) || transcriptRef.current?.contains(target))
      ) {
        return;
      }

      setSelectionBarAnchor(null);
      setDragPreviewSegmentIds([]);
      onCancelSelection?.();
    }

    document.addEventListener("mousedown", handleDocumentMouseDown);
    return () => document.removeEventListener("mousedown", handleDocumentMouseDown);
  }, [onCancelSelection]);

  function handleTranscriptMouseUp(event: ReactMouseEvent<HTMLElement>) {
    const textRange = selectedTranscriptTextRange(detail.transcript.segments, detail.transcript.full_text);
    if (textRange && onSelectTranscriptTextRange) {
      onSelectTranscriptTextRange(
        textRange.startSegmentId,
        textRange.startCharOffset,
        textRange.endSegmentId,
        textRange.endCharOffset
      );
      setSelectionBarAnchor(floatingAnchorFromEvent(event));
      setDragPreviewSegmentIds([]);
      window.getSelection?.()?.removeAllRanges();
      return;
    }

    const endSegmentId = (event.target as HTMLElement | null)
      ?.closest<HTMLElement>(".ml-segment-row[data-segment-id]")
      ?.dataset.segmentId;
    if (dragStartRef.current && endSegmentId && dragStartRef.current !== endSegmentId) {
      onSelectTranscriptRange?.(dragStartRef.current, endSegmentId);
      setSelectionBarAnchor(floatingAnchorFromEvent(event));
    }

    dragStartRef.current = null;
    setDragPreviewSegmentIds([]);
  }

  function handleSegmentMouseDown(segmentId: string) {
    dragStartRef.current = segmentId;
    setDragPreviewSegmentIds([segmentId]);
  }

  function handleSegmentMouseEnter(segmentId: string) {
    if (!dragStartRef.current) {
      return;
    }

    setDragPreviewSegmentIds(segmentIdsBetween(detail.transcript.segments, dragStartRef.current, segmentId));
  }

  function handleCutSelection() {
    setSelectionBarAnchor(null);
    onAddToCutList?.();
  }

  return (
    <section className="cutter-page cutter-source-detail ml-workbench-page" data-page="source-detail">
      <div className="cutter-page-main ml-workbench-main ml-workbench-main--stack ml-scroll-region">
        <header className="cutter-page-header ml-workbench-header">
          <div>
            <p className="cutter-eyebrow ml-page-kicker">原视频详情</p>
            <h1 className="ml-page-title">原视频与完整文案</h1>
            <p className="ml-page-description">{detail.title}</p>
          </div>
        </header>

        <section className="cutter-video-panel ml-document-media-panel">
          <video className="ml-document-media-video" controls preload="none" poster={detail.cover_url} src={videoSource} />
          <div className="ml-document-media-meta">
            <strong>{detail.title}</strong>
            <span>{formatDuration(detail.duration_ms)}</span>
          </div>
        </section>

        <section
          className="cutter-transcript ml-document-panel"
          data-selection-mode="continuous"
          ref={transcriptRef}
          onMouseUp={handleTranscriptMouseUp}
        >
          <header className="ml-document-panel-header">
            <h2>完整文案</h2>
            <span className="ml-document-panel-meta">拖拉选择 · 已选 {selectedSegments.length} 句</span>
          </header>
          <p className="cutter-full-text ml-document-full-text" data-full-transcript="true">
            {fullTranscriptParts.map((part, index) =>
              part.selected ? (
                <mark className="cutter-full-text-selection" key={index}>
                  {part.text}
                </mark>
              ) : (
                <span key={index}>{part.text}</span>
              )
            )}
          </p>
          <div className="cutter-segment-list ml-segment-list">
            {detail.transcript.segments.map((segment) => {
              const isSelected = selectedSegmentIds.has(segment.segment_id);
              const isHighlighted = highlightedIds.has(segment.segment_id);
              const isDragPreview = previewIds.has(segment.segment_id);

              return (
                <span
                  className={[
                    "cutter-segment",
                    "ml-segment-row",
                    isSelected ? "is-selected" : "",
                    isHighlighted ? "is-highlighted" : "",
                    isDragPreview ? "is-drag-preview" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={segment.segment_id}
                  data-segment-id={segment.segment_id}
                  onMouseDown={() => handleSegmentMouseDown(segment.segment_id)}
                  onMouseEnter={() => handleSegmentMouseEnter(segment.segment_id)}
                >
                  <span className="ml-segment-time">{formatDuration(segment.begin_ms)}</span>
                  <span className="ml-segment-text">{segment.text}</span>
                </span>
              );
            })}
          </div>
          {showFloatingSelectionAction ? (
            <div
              className="cutter-selection-bar cutter-floating-selection-bar ml-floating-action-bar ml-floating-selection-anchor is-anchored"
              style={selectionBarStyle}
              ref={selectionBarRef}
            >
              <strong className="ml-floating-action-label">
                已选 {selectedDurationLabel(selectedSegments, selectedStartCharOffset, selectedEndCharOffset)}
              </strong>
              <Button type="button" onClick={handleCutSelection} size="sm" variant="primary">
                剪切这段
              </Button>
            </div>
          ) : null}
        </section>
      </div>

      <InspectorPanel
        title="连续选择"
        className="ml-inspector--workbench ml-workbench-inspector"
        action={
          <Button
            type="button"
            disabled={!canAddSelection}
            onClick={canAddSelection ? handleCutSelection : undefined}
            variant="primary"
          >
            剪切这段
          </Button>
        }
      >
        <div className="ml-detail-stack">
          <strong>{selectionTitle}</strong>
          <span>{selectedRange}</span>
          <p>{selectedText(selectedSegments, selectedStartCharOffset, selectedEndCharOffset)}</p>
          <span>拖拉文案后直接剪切这一段。</span>
        </div>
      </InspectorPanel>
    </section>
  );
}
