import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type SyntheticEvent
} from "react";
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
import {
  cutQueueCurrentPhaseLabel,
  cutQueueJobElapsedMs,
  formatCutQueueElapsed
} from "../../state/cut-queue.ts";
import type { CutMode } from "../../state/cut-list.ts";

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

const cutModeOptions: Array<{ value: CutMode; label: string }> = [
  { value: "copy", label: "极速剪切" },
  { value: "precise", label: "精准剪切" }
];

export interface MaterialSearchHistoryItem {
  query: string;
  hitCount: number;
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
  highlightedSegmentIds = [],
  currentHitIndex = 0,
  currentHitSegmentId,
  globalHitCount,
  selectedMaterialKey,
  recentSearches = [],
  cutNotice = "",
  queue,
  cutMode = "copy",
  onSearch,
  onSelectMaterial,
  onSelectTranscriptSegment,
  onSelectTranscriptRange,
  onNavigateHit,
  onCutSelection,
  onCancelSelection,
  onOpenCutOutputDirectory,
  onSetCutMode
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
  currentHitIndex?: number;
  currentHitSegmentId?: string;
  globalHitCount?: number;
  selectedMaterialKey?: string;
  recentSearches?: readonly MaterialSearchHistoryItem[];
  cutNotice?: string;
  queue: readonly CutQueueJob[];
  cutMode?: CutMode;
  onSearch?: (query: string) => void;
  onSelectMaterial?: (result: MaterialLocatorResult) => void;
  onSelectTranscriptSegment?: (segmentId: string) => void;
  onSelectTranscriptRange?: (startSegmentId: string, endSegmentId: string) => void;
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
  const hitCount = globalHitCount ?? highlightedSegmentIds.length;
  const safeCurrentHitIndex =
    hitCount > 0
      ? Math.min(Math.max(currentHitIndex, 0), hitCount - 1)
      : 0;
  const activeHitSegmentId = currentHitSegmentId ?? highlightedSegmentIds[safeCurrentHitIndex];
  const currentHitOrdinal = hitCount > 0 && activeHitSegmentId ? safeCurrentHitIndex + 1 : 0;
  const orientation = focusedDetail ? videoOrientation(focusedDetail) : "landscape";
  const videoSource = focusedDetail?.media_url.startsWith("/fixture-media/") ? undefined : focusedDetail?.media_url;
  const runningCount = countJobs(queue, "running");
  const pendingCount = countJobs(queue, "pending");
  const doneCount = countJobs(queue, "done");
  const failedCount = countJobs(queue, "failed");
  const candidateCount = sections.reduce((sum, section) => sum + section.items.length, 0);
  const focusedMaterial = sections
    .flatMap((section) => section.items)
    .find((item) => `${item.source}:${item.id}` === selectedMaterialKey);
  const focusedMaterialHitCount = focusedMaterial?.hit_count ?? highlightedSegmentIds.length;
  const hasHitNavigation = hitCount > 0;
  const recentQueue = queue.slice(0, 5);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const segmentRefs = useRef(new Map<string, HTMLSpanElement>());
  const dragStartRef = useRef<string | null>(null);
  const dragEndRef = useRef<string | null>(null);
  const suppressClickRef = useRef(false);
  const previewEndMsRef = useRef<number | null>(null);
  const [selectionBarAnchor, setSelectionBarAnchor] = useState<{ left: number; top: number } | null>(null);
  const [previewActive, setPreviewActive] = useState(false);
  const [mediaDurationMs, setMediaDurationMs] = useState<number | undefined>();
  const [nowMs, setNowMs] = useState(() => Date.now());
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

  useEffect(() => {
    if (!queue.some((job) => job.status === "pending" || job.status === "running")) {
      return;
    }

    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [queue]);

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

  function pauseSelectionPreview() {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    previewEndMsRef.current = null;
    setPreviewActive(false);
  }

  function handleSegmentClick(event: ReactMouseEvent<HTMLSpanElement>, segment: TranscriptSegment) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    setSelectionBarAnchor(floatingAnchorFromEvent(event));
    seekToSegment(segment);
    playSegmentsPreview([segment]);
    onSelectTranscriptSegment?.(segment.segment_id);
  }

  function handleSegmentMouseDown(segment: TranscriptSegment) {
    dragStartRef.current = segment.segment_id;
    dragEndRef.current = segment.segment_id;
  }

  function handleSegmentMouseEnter(segment: TranscriptSegment) {
    if (dragStartRef.current) {
      dragEndRef.current = segment.segment_id;
    }
  }

  function handleTranscriptMouseUp(event: ReactMouseEvent<HTMLParagraphElement>) {
    if (!focusedDetail) {
      return;
    }

    const dragStartSegmentId = dragStartRef.current;
    const dragEndSegmentId = dragEndRef.current;
    if (!dragStartSegmentId) {
      dragStartRef.current = null;
      dragEndRef.current = null;
      return;
    }

    if (shouldSuppressTranscriptClickAfterMouseUp(dragStartSegmentId, dragEndSegmentId ?? undefined)) {
      suppressClickRef.current = true;
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
  }

  function handleToggleSelectionPreview() {
    if (previewActive) {
      pauseSelectionPreview();
      return;
    }

    playSegmentsPreview(selectedSegments);
  }

  function handleCancelSelection() {
    pauseSelectionPreview();
    setSelectionBarAnchor(null);
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
    if (!activeHitSegmentId || !focusedDetail) {
      return;
    }

    const currentHitNode = segmentRefs.current.get(activeHitSegmentId);
    currentHitNode?.scrollIntoView({ block: "center" });

    const currentHitSegment = focusedDetail.transcript.segments.find(
      (segment) => segment.segment_id === activeHitSegmentId
    );
    if (currentHitSegment) {
      seekToSegment(currentHitSegment);
    }
  }, [activeHitSegmentId, focusedDetail]);

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
    >
      <div className="cutter-page-main">
        <section className="cutter-locator-command" aria-label="开始搜索">
          <div className="cutter-locator-command-header">
            <div>
              <h2>开始搜索</h2>
            </div>
            <form className="cutter-search-form cutter-locator-search-form" onSubmit={handleSubmit}>
              <label className="cutter-search-box">
                <span>⌕</span>
                <input
                  name="query"
                  defaultValue=""
                  aria-label="搜索文案关键词或粘贴爆款文案"
                  placeholder="搜索文案关键词或粘贴爆款文案"
                />
              </label>
              <button className="cutter-primary-button" type="submit">
                搜索
              </button>
            </form>
          </div>
        </section>

        <section className={`cutter-locator-workbench is-${orientation}`} aria-label="素材定位工作区">
          <section className="cutter-locator-top-row" aria-label="画面验证与剪切状态">
            <section className="cutter-locator-status" aria-label="工作台状态">
              <section className="cutter-locator-search-history" aria-label="搜索记录">
                <h2>搜索记录 · {recentSearches.length}次</h2>
                {recentSearches.length > 0 ? (
                  <div>
                    {recentSearches.map((searchItem) => (
                      <button
                        type="button"
                        key={searchItem.query}
                        onClick={() => onSearch?.(searchItem.query)}
                      >
                        <span>{searchItem.query}</span>
                        <strong>{searchItem.hitCount} 处命中</strong>
                      </button>
                    ))}
                  </div>
                ) : (
                  <span>暂无搜索记录</span>
                )}
              </section>
            </section>

            <section className="cutter-locator-visual" aria-label="画面验证">
              <section className="cutter-video-panel">
                {focusedDetail ? (
                  <>
                    <video
                      controls
                      data-testid="locator-video"
                      onLoadedMetadata={handleVideoLoadedMetadata}
                      onTimeUpdate={handleVideoTimeUpdate}
                      poster={focusedDetail.cover_url}
                      preload="none"
                      ref={videoRef}
                      src={videoSource}
                    />
                    <div>
                      <strong>{focusedVideoLabel}</strong>
                    </div>
                  </>
                ) : (
                  <div className="cutter-video-empty">
                    <strong>先搜索文案</strong>
                    <span>选择候选素材后，这里用于验证画面。</span>
                  </div>
                )}
              </section>
            </section>

            <section className="cutter-locator-queue-panel" aria-label="剪切队列">
              <div className="cutter-locator-queue-actions">
                <a className="cutter-inline-action cutter-queue-top-action" href="#cut-tasks">
                  查看全部任务
                </a>
                {onOpenCutOutputDirectory ? (
                  <button
                    className="cutter-inline-action cutter-queue-top-action"
                    type="button"
                    onClick={onOpenCutOutputDirectory}
                  >
                    打开文件目录
                  </button>
                ) : null}
              </div>
              {cutNotice ? (
                <div className="cutter-locator-queue-notice" role="status">
                  {cutNotice}
                </div>
              ) : null}
              <div className="cutter-locator-queue-counts" aria-label="剪切队列状态">
                <span>剪切中 {runningCount}</span>
                <span>等待 {pendingCount}</span>
                <span>完成 {doneCount}</span>
                <span>失败 {failedCount}</span>
              </div>
              <div className="cutter-locator-queue-list">
                {recentQueue.length > 0 ? (
                  recentQueue.map((job) => {
                    const phaseLabel = cutQueueCurrentPhaseLabel(job);
                    const elapsedLabel = formatCutQueueElapsed(cutQueueJobElapsedMs(job, nowMs));
                    const progress = Math.max(0, Math.min(100, Math.round(job.progress)));

                    return (
                      <div className={`cutter-locator-queue-item is-${job.status}`} key={job.queue_job_id}>
                        <span>{queueStatusLabel(job.status)}</span>
                        <div className="cutter-locator-queue-title">
                          <strong>{job.title}</strong>
                          <div className="cutter-locator-task-progress" aria-label={`${phaseLabel} ${progress}%`}>
                            <span style={{ width: `${progress}%` }} />
                          </div>
                          <small>{progress}%</small>
                        </div>
                        <small className="cutter-locator-queue-meta">
                          {phaseLabel} · 已耗时 {elapsedLabel} · {formatDuration(job.begin_ms)} - {formatDuration(job.end_ms)}
                          {job.selected_text ? ` · ${job.selected_text}` : ""}
                        </small>
                      </div>
                    );
                  })
                ) : (
                  <span>暂无剪切任务</span>
                )}
              </div>
            </section>
          </section>

          <section className="cutter-locator-bottom-row" aria-label="候选素材与视频文案">
            <section className="cutter-locator-candidates" aria-label="候选素材">
              <header>
                <div>
                  <h2>候选素材 · {candidateCount} 个可选结果</h2>
                </div>
              </header>
              <div className="cutter-locator-results">
                {!hasActiveQuery ? (
                  <div className="cutter-empty-state">
                    <strong>先搜索文案</strong>
                    <span>输入关键词或粘贴文案后，系统会列出可选素材。</span>
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
                        <h2>{section.label}</h2>
                        <span>{section.items.length} 个候选视频</span>
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
                            <span>
                              <strong>{item.title}</strong>
                              <small>
                                文案 {item.transcript_character_count} 字
                              </small>
                              <b>{item.hit_count} 处命中</b>
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))
                )}
              </div>
            </section>

            <section
              className="cutter-natural-transcript"
              data-autoscroll-target={activeHitSegmentId}
              data-current-hit-segment-id={activeHitSegmentId}
              data-selection-mode="natural-text"
            >
              <header>
                <div className="cutter-transcript-heading">
                  <h2>视频文案</h2>
                  <span>
                    命中 {currentHitOrdinal} / {hitCount} · 已选 {selectedSegments.length} 句
                  </span>
                </div>
                <div className="cutter-transcript-actions">
                  <div className="cutter-cut-mode-toggle" role="group" aria-label="剪切模式">
                    {cutModeOptions.map((option) => (
                      <button
                        className={cutMode === option.value ? "is-active" : ""}
                        type="button"
                        key={option.value}
                        aria-pressed={cutMode === option.value}
                        onClick={() => onSetCutMode?.(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
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
                <p onMouseUp={handleTranscriptMouseUp}>
                  {focusedDetail.transcript.segments.map((segment) => (
                    <span
                      className={[
                        selectedIds.has(segment.segment_id) ? "is-selected" : "",
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
                      onClick={(event) => handleSegmentClick(event, segment)}
                    >
                      {segment.text}
                    </span>
                  ))}
                </p>
              ) : (
                <div className="cutter-transcript-empty">
                  <strong>先搜索文案</strong>
                  <span>点击候选素材后，这里会定位到命中文案并高亮显示。</span>
                </div>
              )}
              {focusedDetail && selectedSegments.length > 0 ? (
                <div
                  className={[
                    "cutter-selection-bar",
                    "cutter-floating-selection-bar",
                    "cutter-compact-selection-bar",
                    selectionBarAnchor ? "is-anchored" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={selectionBarStyle}
                >
                  <strong>已选 {selectedDurationLabel(selectedSegments)}</strong>
                  <button
                    className="cutter-secondary-button"
                    data-testid="preview-selection"
                    type="button"
                    onClick={handleToggleSelectionPreview}
                  >
                    {previewActive || selectedSegments.length > 0 ? "暂停预览" : "预览"}
                  </button>
                  <button className="cutter-primary-button" type="button" onClick={onCutSelection}>
                    剪切这段
                  </button>
                  <button className="cutter-secondary-button" type="button" onClick={handleCancelSelection}>
                    取消
                  </button>
                </div>
              ) : null}
            </section>
          </section>
        </section>
      </div>
    </section>
  );
}
