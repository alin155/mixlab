import { Button, InspectorPanel } from "@mixlab/ui-foundation";
import { formatDuration, type SourceVideoDetail, type TranscriptSegment } from "../../api.ts";

function selectedText(segments: readonly TranscriptSegment[]): string {
  return segments.map((segment) => segment.text).join(" ");
}

export function SourceDetailPage({
  detail,
  selectedSegments = detail.transcript.segments.slice(1, 4),
  highlightedSegmentIds = [],
  onSelectSegment,
  onAddToCutList
}: {
  detail: SourceVideoDetail;
  selectedSegments?: TranscriptSegment[];
  highlightedSegmentIds?: readonly string[];
  onSelectSegment?: (segmentId: string) => void;
  onAddToCutList?: () => void;
}) {
  const firstSelected = selectedSegments[0];
  const lastSelected = selectedSegments[selectedSegments.length - 1];
  const selectedRange =
    firstSelected && lastSelected
      ? `${formatDuration(firstSelected.begin_ms)} - ${formatDuration(lastSelected.end_ms)}`
      : "未选择";
  const selectionTitle = selectedSegments.length > 0 ? `${detail.title} 片段` : "未选择片段";
  const canAddSelection = selectedSegments.length > 0 && Boolean(onAddToCutList);
  const videoSource = detail.media_url.startsWith("/fixture-media/") ? undefined : detail.media_url;

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

        <section className="cutter-transcript ml-document-panel" data-selection-mode="continuous">
          <header className="ml-document-panel-header">
            <h2>完整文案</h2>
            <span className="ml-document-panel-meta">连续选择 · 已选 {selectedSegments.length} 句</span>
          </header>
          <p className="cutter-full-text ml-document-full-text">{detail.transcript.full_text}</p>
          <div className="cutter-segment-list ml-segment-list">
            {detail.transcript.segments.map((segment) => {
              const isSelected = selectedSegments.some((selected) => selected.segment_id === segment.segment_id);
              const isHighlighted = highlightedSegmentIds.includes(segment.segment_id);

              return (
                <button
                  className={[
                    "cutter-segment",
                    "ml-segment-row",
                    isSelected ? "is-selected" : "",
                    isHighlighted ? "is-highlighted" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  type="button"
                  key={segment.segment_id}
                  aria-pressed={isSelected}
                  onClick={() => onSelectSegment?.(segment.segment_id)}
                >
                  <span className="ml-segment-time">{formatDuration(segment.begin_ms)}</span>
                  <p className="ml-segment-text">{segment.text}</p>
                  <small className="ml-segment-action">选择此句</small>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <InspectorPanel
        title="连续选择"
        className="ml-inspector--workbench ml-workbench-inspector"
        action={
          <Button
            type="button"
            disabled={!canAddSelection}
            onClick={canAddSelection ? onAddToCutList : undefined}
            variant="primary"
          >
            加入待剪清单
          </Button>
        }
      >
        <div className="ml-detail-stack">
          <strong>{selectionTitle}</strong>
          <span>{selectedRange}</span>
          <p>{selectedText(selectedSegments)}</p>
          <span>一次连续选择只生成一个待剪片段。</span>
        </div>
      </InspectorPanel>
    </section>
  );
}
