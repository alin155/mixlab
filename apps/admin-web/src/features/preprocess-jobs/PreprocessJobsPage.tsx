import {
  GroupedForm,
  InspectorPanel,
  SourceTable
} from "@mixlab/ui-foundation";
import type {
  AdminDashboardData,
  AdminPreprocessJob,
  AdminPreprocessJobLog
} from "../../api.ts";
import {
  chineseDiagnosticText,
  indexValidationMessageLabel,
  jobStageLabel,
  strictChineseDiagnosticText
} from "../../app/chinese.ts";
import { formatAdminDuration } from "../../app/view-model.ts";
import { AdminControlButton, AdminPageHeader, EmptyState, IndexTable, MetricBand } from "../shared.tsx";

function productionStatus(data: AdminDashboardData): { title: string; detail: string; tone: "healthy" | "attention" | "blocked" } {
  const supervisorRunning = data.jobs.supervisor.state === "running" || data.jobs.supervisor.state === "stopping";

  if (data.jobs.active_count > 0 && !supervisorRunning) {
    return {
      title: `${data.jobs.active_count} 个处理中任务需要恢复`,
      detail: "预处理服务未运行，但仍有视频停留在处理中。建议先恢复到队列，再启动预处理。",
      tone: "blocked"
    };
  }

  if (data.jobs.queued_count > 0 && data.jobs.active_count === 0 && !supervisorRunning) {
    return {
      title: `${data.jobs.queued_count} 个视频已排队，但预处理服务未运行`,
      detail: "建议启动预处理。启动后系统会继续提取音频、上传语音识别、生成文案、封面和关键帧。",
      tone: "attention"
    };
  }

  if (data.jobs.active_count > 0 && supervisorRunning) {
    return {
      title: `${data.jobs.active_count} 个视频正在处理`,
      detail: "系统正在按队列生产预处理产物，可在当前任务中查看阶段、耗时和失败信息。",
      tone: "healthy"
    };
  }

  if (data.status.unprocessed_video_count > 0 && data.jobs.queued_count === 0) {
    return {
      title: `${data.status.unprocessed_video_count} 个视频尚未加入队列`,
      detail: "建议启动预处理，系统会先扫描素材来源，再自动入队和持续预处理。",
      tone: "attention"
    };
  }

  if (data.jobs.failed_count > 0) {
    return {
      title: `${data.jobs.failed_count} 个视频处理失败`,
      detail: "失败视频可单独重试，不影响后续队列继续处理。",
      tone: "blocked"
    };
  }

  return {
    title: "预处理当前空闲",
    detail: "系统没有发现正在处理或等待处理的视频。",
    tone: "healthy"
  };
}

function percentLabel(value: number): string {
  return `${Math.round(value)}%`;
}

function timeLabel(value: string): string {
  if (!value) {
    return "暂无估算";
  }

  return value.replace("T", " ").slice(0, 16);
}

function preprocessThroughputLabel(data: AdminDashboardData, supervisorRunning: boolean): string {
  const label = data.jobs.observability.throughput_label;

  if (data.jobs.queued_count > 0 && label.includes("没有等待处理")) {
    return `${data.jobs.queued_count} 个视频正在等待处理`;
  }

  if (data.jobs.active_count > 0 && label.includes("没有等待处理")) {
    return supervisorRunning
      ? `${data.jobs.active_count} 个视频正在处理中`
      : `${data.jobs.active_count} 个视频停留在处理中，需恢复到队列`;
  }

  return label;
}

function safePreprocessErrorText(message: string): string {
  const readable = chineseDiagnosticText(message)
    .replace(
      /阿里云百炼语音识别 task [0-9a-f-]+ failed: /gi,
      "阿里云百炼语音识别失败："
    )
    .replaceAll("SUCCESS_WITH_NO_VALID_FRAGMENT", "未识别到有效语音片段")
    .replaceAll("failed:", "失败：");

  return strictChineseDiagnosticText(readable);
}

function safeJobStageLabel(job: AdminPreprocessJob): string {
  const fallback = jobStageLabel(job.stage);
  const label = job.stage_label?.trim();

  if (!label) {
    return fallback;
  }

  if (/failed:|task [0-9a-f-]{8,}|SUCCESS_|[A-Za-z]{4,}/i.test(label)) {
    return fallback;
  }

  return label;
}

export function PreprocessJobsPage({
  data,
  isLoadingJobs = false,
  selectedJobLog,
  onRetryFailedVideos,
  onRecoverProcessingVideos,
  onStartPreprocessSupervisor,
  onStopPreprocessSupervisor,
  onRepairIndex,
  onOpenPreprocessJobLog
}: {
  data: AdminDashboardData;
  isLoadingJobs?: boolean;
  selectedJobLog?: {
    loading: boolean;
    error: string;
    log: AdminPreprocessJobLog | null;
  };
  onRetryFailedVideos?: () => void;
  onRecoverProcessingVideos?: () => void;
  onStartPreprocessSupervisor?: () => void;
  onStopPreprocessSupervisor?: () => void;
  onRepairIndex?: () => void;
  onOpenPreprocessJobLog?: (jobId: string) => void;
}) {
  const running = data.jobs.jobs.filter((job) => job.status === "running");
  const queued = data.jobs.jobs.filter((job) => job.status === "queued");
  const done = data.jobs.jobs.filter((job) => job.status === "done");
  const failed = data.jobs.jobs.filter((job) => job.status === "failed");
  const supervisor = data.jobs.supervisor;
  const supervisorRunning = supervisor.state === "running" || supervisor.state === "stopping";
  const lastResult = supervisor.last_result;
  const status = productionStatus(data);
  const averageProcessMs = data.metrics.production.average_video_process_ms;
  const currentIndex = data.indexes.versions.find((version) => version.is_current);
  const runtimeLoad = data.metrics.runtime_load;
  const observability = data.jobs.observability;
  const currentJob = running[0];
  const canStartSupervisor = supervisor.state === "idle" || supervisor.state === "failed";
  const canStopSupervisor = supervisor.state === "running" || supervisor.state === "stopping";
  const nasWriteState = "m9b-api" as const;
  const gatedNasWriteAction = <T extends (...args: never[]) => void>(handler?: T): T | undefined =>
    handler;
  const nasWriteReason = (reason: string) => reason;
  const runningStageCaption = supervisorRunning ? "当前阶段" : "停留阶段";
  const pipelineStages = [
    { label: "扫描素材", value: data.status.video_count, caption: "已发现" },
    { label: "提取音频", value: running.filter((job) => job.stage === "extract-audio").length, caption: runningStageCaption },
    { label: "语音识别", value: running.filter((job) => job.stage === "asr").length, caption: runningStageCaption },
    { label: "生成文案", value: data.metrics.transcript.transcript_video_count, caption: "已有文案" },
    { label: "封面关键帧", value: running.filter((job) => job.stage === "build-keyframes").length, caption: runningStageCaption },
    { label: "发布索引", value: data.status.index_required_video_count, caption: "待发布" }
  ];
  const compactJobs = [...running, ...queued, ...failed, ...done].slice(0, 12);
  const throughputLabel = preprocessThroughputLabel(data, supervisorRunning);
  const currentValidationMessage = indexValidationMessageLabel(data.indexes.current_validation_message);
  const currentJobStatusText = currentJob
    ? supervisorRunning
      ? `${currentJob.status_label} · ${safeJobStageLabel(currentJob)}`
      : `待恢复 · ${safeJobStageLabel(currentJob)}`
    : "流水线空闲或等待启动";
  const currentJobHeading = currentJob
    ? `${currentJob.source_video_id} · ${currentJob.title}`
    : supervisorRunning
      ? "暂无正在处理的视频"
      : "暂无待恢复的视频";
  const activeMetricLabel = supervisorRunning ? "正在处理" : "待恢复";
  const activeMetricCaption = supervisorRunning ? "预处理服务已领取" : "服务未运行，停留在处理中";
  const currentStageSummary = running[0]
    ? supervisorRunning
      ? safeJobStageLabel(running[0])
      : `待恢复 · ${safeJobStageLabel(running[0])}`
    : "暂无待恢复或正在处理";
  const jobStageText = (job: AdminPreprocessJob): string => {
    const stage = safeJobStageLabel(job);

    if (job.status === "failed" && job.error_message) {
      return `${stage} · ${safePreprocessErrorText(job.error_message)}`;
    }

    if (job.status === "running" && !supervisorRunning) {
      return `待恢复 · ${stage}`;
    }

    return stage;
  };
  const jobProgressText = (job: AdminPreprocessJob): string => {
    if (job.status === "queued") {
      return "等待处理";
    }

    if (job.status === "running" && !supervisorRunning) {
      return "待恢复";
    }

    return `${job.progress}%`;
  };
  const jobActions = (job: AdminPreprocessJob) => {
    const actions = [];

    actions.push(
      <AdminControlButton
        label="详情"
        state="m9b-api"
        reason="查看这条任务的处理记录。"
        onClick={onOpenPreprocessJobLog ? () => onOpenPreprocessJobLog(job.job_id) : undefined}
        key={`${job.job_id}-log`}
      />
    );

    return <span className="admin-row-actions">{actions}</span>;
  };

  return (
    <>
      <div className="admin-main-column">
        <section className="admin-console-hero">
          <AdminPageHeader
            title="预处理"
            eyebrow="预处理流水线与索引发布"
          />
          <div className="admin-console-statusbar" aria-label="预处理状态">
            <span>
              <strong>服务状态</strong>
              {supervisor.state_label}
            </span>
            <span>
              <strong>当前任务</strong>
              {currentJob ? supervisorRunning ? currentJob.source_video_id : `待恢复 ${currentJob.source_video_id}` : "空闲"}
            </span>
            <span>
              <strong>当前索引</strong>
              {data.indexes.current_version || "暂无索引"}
            </span>
            <span>
              <strong>预计完成</strong>
              {timeLabel(observability.estimated_all_done_at)}
            </span>
          </div>
        </section>
        <section className={`admin-production-status-card is-${status.tone}`} aria-label="生产状态">
          <p>生产状态</p>
          <h2>{status.title}</h2>
          <span>{status.detail}</span>
        </section>
        <MetricBand
          items={[
            { label: "未处理原视频", value: data.status.unprocessed_video_count, caption: "等待加入队列" },
            { label: "将加入", value: data.status.unprocessed_video_count, caption: "流水线启动后自动入队" },
            { label: "预计总时长", value: formatAdminDuration(data.metrics.material.unprocessed_duration_ms), caption: "按原视频时长估算" },
            { label: activeMetricLabel, value: data.jobs.active_count, caption: activeMetricCaption },
            { label: "队列中", value: data.jobs.queued_count, caption: "等待预处理" },
            { label: "最近完成", value: data.jobs.completed_count, caption: "已产生可发布产物" },
            { label: "失败可重试", value: data.jobs.failed_count, caption: "单个失败不阻塞队列" }
          ]}
        />
        <section className="admin-pipeline-strip" aria-label="流水线阶段">
          {pipelineStages.map((stage, index) => (
            <article className="admin-pipeline-stage" key={stage.label}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{stage.label}</strong>
              <p>{stage.value} · {stage.caption}</p>
            </article>
          ))}
        </section>
        <section className="admin-observability-grid" aria-label="流水线总览">
          <article className="admin-observability-card">
            <p>流水线总览</p>
            <h2>{percentLabel(observability.pipeline_progress_percent)}</h2>
            <span>整体完成比例</span>
          </article>
          <article className="admin-observability-card">
            <p>预计完成</p>
            <h2>{timeLabel(observability.estimated_all_done_at)}</h2>
            <span>{throughputLabel}</span>
          </article>
          <article className="admin-observability-card">
            <p>今日完成</p>
            <h2>{data.metrics.production.completed_today_count}</h2>
            <span>今日失败 {data.metrics.production.failed_today_count} 个</span>
          </article>
          <article className={`admin-observability-card is-${runtimeLoad.overall_status}`}>
            <p>负荷建议</p>
            <h2>{runtimeLoad.overall_status === "healthy" ? "可继续" : runtimeLoad.overall_status === "attention" ? "需观察" : "需处理"}</h2>
            <span>{observability.load_advice}</span>
          </article>
        </section>
        <section className="admin-current-job-card" aria-label="当前处理视频">
          <div>
            <p>{supervisorRunning ? "当前处理视频" : "待恢复视频"}</p>
            <h2>{currentJobHeading}</h2>
            <span>{currentJobStatusText}</span>
          </div>
          <div className="admin-current-job-meter">
            <strong>阶段进度</strong>
            <meter min={0} max={100} value={currentJob?.progress ?? 0}>{currentJob?.progress ?? 0}%</meter>
            <dl>
              <div>
                <dt>已用时</dt>
                <dd>{currentJob ? formatAdminDuration(currentJob.elapsed_ms) : "-"}</dd>
              </div>
              <div>
                <dt>预计剩余</dt>
                <dd>{currentJob ? formatAdminDuration(currentJob.estimated_remaining_ms) : "-"}</dd>
              </div>
              <div>
                <dt>预计完成</dt>
                <dd>{currentJob ? timeLabel(currentJob.estimated_done_at) : "暂无估算"}</dd>
              </div>
            </dl>
          </div>
        </section>
        <section className="admin-list-section admin-job-table-panel" aria-label="预处理队列清单">
          <header className="admin-section-header">
            <h2>任务队列</h2>
            <p>按待恢复或处理中、排队、失败、完成的顺序展示最近任务，方便快速判断是否卡在某个阶段。</p>
          </header>
          {isLoadingJobs ? (
            <EmptyState title="任务明细后台同步中" detail="队列统计已显示，明细回来后会自动补上。" />
          ) : compactJobs.length ? (
            <SourceTable
              columns={["任务", "原视频", "阶段", "排队", "进度", "耗时", "预计开始", "预计完成", "操作"]}
              rows={compactJobs.map((job, index) => [
                job.job_id,
                `${job.source_video_id} · ${job.title}`,
                jobStageText(job),
                job.status === "queued" ? `排队第 ${job.queue_position || index + 1} 位` : "-",
                <span className="admin-progress-cell" key={`${job.job_id}-progress`}>
                  <meter min={0} max={100} value={job.progress}>{job.progress}%</meter>
                  <strong>{jobProgressText(job)}</strong>
                </span>,
                job.elapsed_ms > 0 ? formatAdminDuration(job.elapsed_ms) : "-",
                job.estimated_start_at ? timeLabel(job.estimated_start_at) : "-",
                job.estimated_done_at ? timeLabel(job.estimated_done_at) : "暂无估算",
                jobActions(job)
              ])}
            />
          ) : (
            <EmptyState title="暂无预处理任务" detail="当前没有正在处理、排队或失败的视频。" />
          )}
        </section>
        <section className="admin-list-section admin-index-publish-panel" aria-label="索引发布">
          <header className="admin-section-header">
            <h2>索引发布</h2>
            <p>剪辑端搜索只读取当前索引。预处理完成但待发布的视频需要进入索引后才可搜索。</p>
          </header>
          <div className="admin-index-summary-grid">
            <article>
              <span>当前索引</span>
              <strong>{data.indexes.current_version || "暂无索引"}</strong>
              <p>
                {currentIndex?.ready_video_count ?? data.status.ready_video_count} 个可搜索视频 · {currentValidationMessage}
              </p>
            </article>
            <article>
              <span>待发布视频</span>
              <strong>{data.status.index_required_video_count}</strong>
              <p>{data.settings.runtime_policy.auto_publish_index_enabled ? "自动增量发布已开启" : "需要手动发布"}</p>
            </article>
            <article>
              <span>系统检查</span>
              <strong>{data.doctor.summary.fail > 0 ? "需处理" : data.doctor.summary.warn > 0 ? "需观察" : "通过"}</strong>
              <p>警告 {data.doctor.summary.warn} · 失败 {data.doctor.summary.fail}</p>
            </article>
          </div>
          <section className="admin-action-row">
            <AdminControlButton
              label="发布到剪辑端"
              state={nasWriteState}
              reason={nasWriteReason("发布完成预处理但尚未进入搜索索引的视频。")}
              variant="primary"
              onClick={gatedNasWriteAction(onRepairIndex)}
            />
          </section>
          {data.status.index_required_video_count === 0 ? (
            <p className="admin-note">没有待发布索引的视频。</p>
          ) : null}
          <IndexTable versions={data.indexes.versions} />
        </section>
        <GroupedForm
          groups={[{
            title: "素材来源",
            rows: data.settings.source_folders.map((folder) => ({
              label: folder.name,
              value: `${folder.enabled ? "启用" : "停用"} · ${folder.discovered_video_count ?? 0} 个原视频 · ${folder.path}`
            }))
          }, {
            title: "索引状态",
            rows: [
              { label: "当前索引", value: data.indexes.current_version || "暂无索引" },
              { label: "当前索引状态", value: currentValidationMessage },
              { label: "已发布可用视频", value: currentIndex?.ready_video_count ?? data.status.ready_video_count },
              { label: "待发布索引", value: data.status.index_required_video_count },
              {
                label: "自动增量发布",
                value: data.status.index_required_video_count > 0
                  ? "流水线会在产物完成后自动发布"
                  : "当前没有待发布视频"
              }
            ]
          }]}
        />
      </div>
      <InspectorPanel title="处理控制">
        <GroupedForm
          groups={[
            {
              title: "状态摘要",
              rows: [
                { label: "服务状态", value: supervisor.state_label },
                { label: "当前阶段", value: currentStageSummary },
                { label: "队列中", value: data.jobs.queued_count },
                { label: "失败任务", value: data.jobs.failed_count },
                { label: "预计完成", value: timeLabel(observability.estimated_all_done_at) }
              ]
            },
            {
              title: "处理结果",
              rows: [
                { label: "最近完成", value: data.jobs.completed_count },
                { label: "待发布索引", value: data.status.index_required_video_count },
                {
                  label: "上次处理",
                  value: lastResult
                    ? `领取 ${lastResult.total_claimed_count}，成功 ${lastResult.succeeded_count}，失败 ${lastResult.failed_count}`
                    : "暂无记录"
                }
              ]
            }
          ]}
        />
        {selectedJobLog ? (
        <section className="admin-job-log-panel" aria-label="任务处理详情">
          <h2>任务处理详情</h2>
          {selectedJobLog.loading ? (
            <p>正在读取日志</p>
          ) : selectedJobLog.error ? (
            <p>{selectedJobLog.error}</p>
          ) : selectedJobLog.log ? (
            <>
              <p>{selectedJobLog.log.job_id} · {selectedJobLog.log.source_video_id}</p>
              <pre>{selectedJobLog.log.content || "暂无处理记录"}</pre>
            </>
          ) : (
            <p>暂无处理记录。</p>
          )}
        </section>
        ) : null}
        <section className="admin-action-stack">
          {canStartSupervisor || canStopSupervisor ? (
            <AdminControlButton
              label={canStopSupervisor ? "暂停预处理" : "启动预处理"}
              state={nasWriteState}
              reason={canStopSupervisor ? "暂停当前预处理流水线。" : "扫描、入队、预处理并自动发布索引。"}
              variant="primary"
              onClick={canStopSupervisor ? onStopPreprocessSupervisor : onStartPreprocessSupervisor}
            />
          ) : null}
          {data.jobs.failed_count > 0 ? (
            <AdminControlButton
              label="重试失败视频"
              state={nasWriteState}
              reason="将失败视频重新加入预处理队列。"
              onClick={gatedNasWriteAction(onRetryFailedVideos)}
            />
          ) : null}
          {data.jobs.active_count > 0 && supervisor.state !== "running" && supervisor.state !== "stopping" ? (
            <AdminControlButton
              label="恢复卡住任务"
              state={nasWriteState}
              reason="预处理服务未运行时，将停留在处理中的任务恢复到队列。"
              onClick={gatedNasWriteAction(onRecoverProcessingVideos)}
            />
          ) : null}
        </section>
      </InspectorPanel>
    </>
  );
}
