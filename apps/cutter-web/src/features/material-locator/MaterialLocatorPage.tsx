import { useRef, type FormEvent } from "react";
import { InspectorPanel } from "@mixlab/ui-foundation";
import {
  formatDuration,
  type LocalClipCatalog,
  type SearchResponse,
  type SourceLibraryResponse,
  type SourceVideoDetail,
  type TranscriptSegment
} from "../../api.ts";
import {
  buildMaterialLocatorSections,
  type MaterialLocatorResult,
  type MaterialSearchSourceFilter
} from "../../state/material-locator.ts";
import {
  videoOrientation,
  type VideoOrientationFilter
} from "../../state/video-orientation.ts";
import type { CutQueueJob } from "../../state/cut-queue.ts";

function selectedText(segments: readonly TranscriptSegment[]): string {
  return segments.map((segment) => segment.text).join(" ");
}

function selectedDurationLabel(segments: readonly TranscriptSegment[]): string {
  const first = segments[0];
  const last = segments[segments.length - 1];
  if (!first || !last) {
    return "0 秒";
  }

  return `${Math.max(1, Math.round((last.end_ms - first.begin_ms) / 1000))} 秒`;
}

function countJobs(queue: readonly CutQueueJob[], status: CutQueueJob["status"]): number {
  return queue.filter((job) => job.status === status).length;
}

const sourceFilterOptions: Array<{ value: MaterialSearchSourceFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "local", label: "本地素材" },
  { value: "public", label: "公共原素材" }
];

const orientationFilterOptions: Array<{ value: VideoOrientationFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "landscape", label: "横版" },
  { value: "portrait", label: "竖版" }
];

export function MaterialLocatorPage({
  library,
  localClips,
  search,
  query,
  sourceFilter,
  orientationFilter,
  selectedDetail,
  selectedSegments = [],
  highlightedSegmentIds = [],
  queue,
  onSearch,
  onSelectMaterial,
  onSelectTranscriptSegment,
  onSelectTranscriptRange,
  onCutSelection,
  onCancelSelection,
  onSetSourceFilter,
  onSetOrientationFilter
}: {
  library: SourceLibraryResponse;
  localClips: LocalClipCatalog;
  search: SearchResponse;
  query: string;
  sourceFilter: MaterialSearchSourceFilter;
  orientationFilter: VideoOrientationFilter;
  selectedDetail: SourceVideoDetail;
  selectedSegments?: readonly TranscriptSegment[];
  highlightedSegmentIds?: readonly string[];
  queue: readonly CutQueueJob[];
  onSearch?: (query: string) => void;
  onSelectMaterial?: (result: MaterialLocatorResult) => void;
  onSelectTranscriptSegment?: (segmentId: string) => void;
  onSelectTranscriptRange?: (startSegmentId: string, endSegmentId: string) => void;
  onCutSelection?: () => void;
  onCancelSelection?: () => void;
  onSetSourceFilter?: (filter: MaterialSearchSourceFilter) => void;
  onSetOrientationFilter?: (filter: VideoOrientationFilter) => void;
}) {
  const sections = buildMaterialLocatorSections({
    query,
    sourceFilter,
    orientationFilter,
    localClips,
    library,
    search
  });
  const selectedIds = new Set(selectedSegments.map((segment) => segment.segment_id));
  const highlightedIds = new Set(highlightedSegmentIds);
  const orientation = videoOrientation(selectedDetail);
  const videoSource = selectedDetail.media_url.startsWith("/fixture-media/") ? undefined : selectedDetail.media_url;
  const runningCount = countJobs(queue, "running");
  const pendingCount = countJobs(queue, "pending");
  const doneCount = countJobs(queue, "done");
  const dragStartRef = useRef<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onSearch?.(String(formData.get("query") ?? ""));
  }

  return (
    <section className="cutter-page cutter-material-locator" data-page="material-locator">
      <div className="cutter-page-main">
        <header className="cutter-page-header cutter-locator-header">
          <div>
            <p className="cutter-eyebrow">搜、选、剪</p>
            <h1>素材定位</h1>
            <p>
              本地素材 {localClips.local_clip_count} · 公共原素材 {library.available_video_count} · 剪切中 {runningCount}
            </p>
          </div>
          <form className="cutter-search-form" onSubmit={handleSubmit}>
            <label className="cutter-search-box">
              <span>⌕</span>
              <input
                name="query"
                defaultValue={query}
                aria-label="搜索文案关键词或粘贴文案"
                placeholder="搜索文案关键词或粘贴文案"
              />
            </label>
            <button className="cutter-primary-button" type="submit">
              搜索
            </button>
          </form>
        </header>

        <section className="cutter-locator-filters" aria-label="素材定位筛选">
          <div>
            {sourceFilterOptions.map((option) => (
              <button
                className={option.value === sourceFilter ? "is-active" : ""}
                type="button"
                key={option.value}
                onClick={() => onSetSourceFilter?.(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div>
            {orientationFilterOptions.map((option) => (
              <button
                className={option.value === orientationFilter ? "is-active" : ""}
                type="button"
                key={option.value}
                onClick={() => onSetOrientationFilter?.(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <section className="cutter-locator-results">
          {sections.length === 0 ? (
            <div className="cutter-empty-state">
              <strong>没有找到可选素材</strong>
              <span>可以换一个关键词，或到公共素材库确认可用素材是否已经发布。</span>
            </div>
          ) : (
            sections.map((section) => (
              <section className="cutter-locator-section" key={section.key}>
                <header>
                  <h2>{section.label}</h2>
                  <span>{section.items.length} 个候选视频</span>
                </header>
                <div className="cutter-locator-result-list">
                  {section.items.map((item) => (
                    <button
                      className="cutter-locator-result"
                      type="button"
                      key={`${item.source}-${item.id}`}
                      onClick={() => onSelectMaterial?.(item)}
                    >
                      {item.cover_url ? <img src={item.cover_url} alt="" /> : <span className="cutter-cover-placeholder" />}
                      <span>
                        <strong>{item.title}</strong>
                        <small>
                          {item.source === "local" ? "本地素材" : "公共原素材"} · {item.orientation_label} ·{" "}
                          {formatDuration(item.duration_ms)}
                        </small>
                        <em>{item.excerpt}</em>
                      </span>
                      <b>{item.hit_count} 处命中</b>
                    </button>
                  ))}
                </div>
              </section>
            ))
          )}
        </section>

        <section className={`cutter-locator-workspace is-${orientation}`}>
          <section className="cutter-video-panel">
            <video controls preload="none" poster={selectedDetail.cover_url} src={videoSource} />
            <div>
              <strong>{selectedDetail.title}</strong>
              <span>{formatDuration(selectedDetail.duration_ms)}</span>
            </div>
          </section>

          <section className="cutter-natural-transcript" data-selection-mode="natural-text">
            <header>
              <div>
                <h2>完整文案</h2>
                <span>点击定位视频，拖选文案后剪切这段。</span>
              </div>
              <span>自然文案</span>
            </header>
            <p>
              {selectedDetail.transcript.segments.map((segment) => (
                <span
                  className={[
                    selectedIds.has(segment.segment_id) ? "is-selected" : "",
                    highlightedIds.has(segment.segment_id) ? "is-highlighted" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  data-segment-id={segment.segment_id}
                  key={segment.segment_id}
                  onMouseDown={() => {
                    dragStartRef.current = segment.segment_id;
                  }}
                  onMouseUp={() => {
                    if (dragStartRef.current && dragStartRef.current !== segment.segment_id) {
                      onSelectTranscriptRange?.(dragStartRef.current, segment.segment_id);
                    }
                    dragStartRef.current = null;
                  }}
                  onClick={() => onSelectTranscriptSegment?.(segment.segment_id)}
                >
                  {segment.text}
                </span>
              ))}
            </p>
            {selectedSegments.length > 0 ? (
              <div className="cutter-selection-bar">
                <strong>已选中一段文案 · 预计 {selectedDurationLabel(selectedSegments)}</strong>
                <span>{selectedText(selectedSegments)}</span>
                <button className="cutter-secondary-button" type="button">
                  播放预览
                </button>
                <button className="cutter-primary-button" type="button" onClick={onCutSelection}>
                  剪切这段
                </button>
                <button className="cutter-secondary-button" type="button" onClick={onCancelSelection}>
                  取消
                </button>
              </div>
            ) : null}
          </section>
        </section>
      </div>

      <InspectorPanel title="剪切任务">
        <div className="cutter-inspector-stack">
          <strong>
            剪切中 {runningCount} · 等待 {pendingCount} · 完成 {doneCount}
          </strong>
          <span>剪切任务在后台执行，当前页面可以继续搜索和选段。</span>
          <a className="cutter-inline-action" href="#cut-tasks">
            查看全部任务
          </a>
        </div>
      </InspectorPanel>
    </section>
  );
}
