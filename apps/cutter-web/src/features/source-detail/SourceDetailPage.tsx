import { InspectorPanel, SegmentedControl } from "@mixlab/ui-foundation";
import { formatDuration, type SourceVideoDetail, type TranscriptSegment } from "../../api.ts";

function selectedText(segments: readonly TranscriptSegment[]): string {
  return segments.map((segment) => segment.text).join(" ");
}

export function SourceDetailPage({
  detail,
  selectedSegments = detail.transcript.segments.slice(1, 4),
  onAddToCutList
}: {
  detail: SourceVideoDetail;
  selectedSegments?: TranscriptSegment[];
  onAddToCutList?: () => void;
}) {
  const firstSelected = selectedSegments[0];
  const lastSelected = selectedSegments[selectedSegments.length - 1];
  const selectedRange =
    firstSelected && lastSelected
      ? `${formatDuration(firstSelected.begin_ms)} - ${formatDuration(lastSelected.end_ms)}`
      : "未选择";
  const videoSource = detail.media_url.startsWith("/fixture-media/") ? undefined : detail.media_url;

  return (
    <section className="cutter-page cutter-source-detail" data-page="source-detail">
      <div className="cutter-page-main">
        <header className="cutter-page-header">
          <div>
            <p className="cutter-eyebrow">原视频详情</p>
            <h1>原视频与完整文案</h1>
            <p>{detail.title}</p>
          </div>
          <SegmentedControl options={["播放器", "完整文案", "关键帧"]} active="完整文案" />
        </header>

        <section className="cutter-video-panel">
          <video controls preload="none" poster={detail.cover_url} src={videoSource} />
          <div>
            <strong>{detail.title}</strong>
            <span>{formatDuration(detail.duration_ms)}</span>
          </div>
        </section>

        <section className="cutter-transcript" data-selection-mode="continuous">
          <header>
            <h2>完整文案</h2>
            <span>连续选择 · 已选 {selectedSegments.length} 句</span>
          </header>
          <p className="cutter-full-text">{detail.transcript.full_text}</p>
          <div className="cutter-segment-list">
            {detail.transcript.segments.map((segment) => (
              <button
                className={`cutter-segment${
                  selectedSegments.some((selected) => selected.segment_id === segment.segment_id)
                    ? " is-selected"
                    : ""
                }`}
                type="button"
                key={segment.segment_id}
              >
                <span>{formatDuration(segment.begin_ms)}</span>
                <p>{segment.text}</p>
              </button>
            ))}
          </div>
        </section>
      </div>

      <InspectorPanel
        title="连续选择"
        action={
          <button className="cutter-primary-button" type="button" onClick={onAddToCutList}>
            加入待剪清单
          </button>
        }
      >
        <div className="cutter-inspector-stack">
          <strong>现金流短片开场</strong>
          <span>{selectedRange}</span>
          <p>{selectedText(selectedSegments)}</p>
          <span>一次连续选择只生成一个待剪片段。</span>
        </div>
      </InspectorPanel>
    </section>
  );
}
