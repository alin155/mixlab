import {
  GroupedForm,
  InspectorPanel
} from "@mixlab/ui-foundation";
import type { AdminDashboardData } from "../../api.ts";
import { jobStageLabel } from "../../app/chinese.ts";
import { formatAdminDuration } from "../../app/view-model.ts";
import { AdminControlButton, AdminPageHeader, JobRows, MetricBand } from "../shared.tsx";

function productionStatus(data: AdminDashboardData): { title: string; detail: string; tone: "healthy" | "attention" | "blocked" } {
  const supervisorRunning = data.jobs.supervisor.state === "running" || data.jobs.supervisor.state === "stopping";

  if (data.jobs.queued_count > 0 && data.jobs.active_count === 0 && !supervisorRunning) {
    return {
      title: `${data.jobs.queued_count} 个视频已排队，但预处理服务未运行`,
      detail: "建议启动预处理流水线。启动后系统会继续提取音频、上传语音识别、生成文案、封面和关键帧。",
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
      detail: "建议启动预处理流水线，系统会先扫描素材来源，再自动入队和持续预处理。",
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

export function PreprocessJobsPage({
  data,
  onRetryFailedVideos,
  onStartPreprocessSupervisor,
  onStopPreprocessSupervisor
}: {
  data: AdminDashboardData;
  onRetryFailedVideos?: () => void;
  onStartPreprocessSupervisor?: () => void;
  onStopPreprocessSupervisor?: () => void;
}) {
  const running = data.jobs.jobs.filter((job) => job.status === "running");
  const queued = data.jobs.jobs.filter((job) => job.status === "queued");
  const done = data.jobs.jobs.filter((job) => job.status === "done");
  const failed = data.jobs.jobs.filter((job) => job.status === "failed");
  const supervisor = data.jobs.supervisor;
  const lastResult = supervisor.last_result;
  const status = productionStatus(data);
  const averageProcessMs = data.metrics.production.average_video_process_ms;
  const currentIndex = data.indexes.versions.find((version) => version.is_current);
  const runtimeLoad = data.metrics.runtime_load;
  const observability = data.jobs.observability;
  const currentJob = running[0];
  const canStartSupervisor = supervisor.state === "idle" || supervisor.state === "failed";
  const canStopSupervisor = supervisor.state === "running" || supervisor.state === "stopping";

  return (
    <>
      <div className="admin-main-column">
        <AdminPageHeader
          title="预处理"
          eyebrow="预处理流水线"
        />
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
            { label: "正在处理", value: data.jobs.active_count, caption: "预处理服务已领取" },
            { label: "队列中", value: data.jobs.queued_count, caption: "等待预处理" },
            { label: "最近完成", value: data.jobs.completed_count, caption: "已产生可发布产物" },
            { label: "失败可重试", value: data.jobs.failed_count, caption: "单个失败不阻塞队列" }
          ]}
        />
        <section className="admin-observability-grid" aria-label="流水线总览">
          <article className="admin-observability-card">
            <p>流水线总览</p>
            <h2>{percentLabel(observability.pipeline_progress_percent)}</h2>
            <span>整体完成比例</span>
          </article>
          <article className="admin-observability-card">
            <p>预计完成</p>
            <h2>{timeLabel(observability.estimated_all_done_at)}</h2>
            <span>{observability.throughput_label}</span>
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
            <p>当前处理视频</p>
            <h2>{currentJob ? `${currentJob.source_video_id} · ${currentJob.title}` : "暂无正在处理的视频"}</h2>
            <span>{currentJob ? `${currentJob.status_label} · ${currentJob.stage_label}` : "流水线空闲或等待启动"}</span>
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
        <section className="admin-action-row" aria-label="队列操作">
          <AdminControlButton label="重试失败" state="m9b-api" reason="M9B 接入失败重试接口。" onClick={onRetryFailedVideos} />
        </section>
        <section className="admin-job-groups">
          <div>
            <h2>正在处理</h2>
            <JobRows jobs={running} averageProcessMs={averageProcessMs} />
          </div>
          <div>
            <h2>队列中</h2>
            <JobRows jobs={queued} averageProcessMs={averageProcessMs} />
          </div>
          <div>
            <h2>最近完成</h2>
            <JobRows jobs={done} averageProcessMs={averageProcessMs} />
          </div>
          <div>
            <h2>失败可重试</h2>
            <JobRows jobs={failed} onRetryFailed={onRetryFailedVideos} averageProcessMs={averageProcessMs} />
          </div>
        </section>
      </div>
      <InspectorPanel title="任务控制">
        <GroupedForm
          groups={[
            {
              title: "队列参数",
              rows: [
                { label: "并发任务", value: data.jobs.active_count },
                { label: "排队任务", value: data.jobs.queued_count },
                { label: "完成任务", value: data.jobs.completed_count },
                { label: "失败任务", value: data.jobs.failed_count },
                { label: "失败策略", value: "单个视频失败不影响后续任务继续处理" }
              ]
            },
            {
              title: "阶段",
              rows: [
                { label: "当前阶段", value: running[0] ? (running[0].stage_label || jobStageLabel(running[0].stage)) : "暂无正在处理" },
                { label: "处理记录", value: "系统自动记录，导出诊断报告后查看" }
              ]
            },
            {
              title: "预处理服务",
              rows: [
                { label: "状态", value: supervisor.state_label },
                { label: "运行方式", value: supervisor.worker_id ? "本机持续预处理" : "尚未启动" },
                { label: "启动时间", value: supervisor.started_at || "未启动" },
                { label: "停止时间", value: supervisor.stopped_at || "未停止" },
                {
                  label: "上次处理",
                  value: lastResult
                    ? `领取 ${lastResult.total_claimed_count}，成功 ${lastResult.succeeded_count}，失败 ${lastResult.failed_count}`
                    : "暂无记录"
                },
                {
                  label: "本次限制",
                  value: `${data.settings.runtime_policy.concurrent_jobs} 个视频`
                },
                { label: "最近错误", value: supervisor.last_error || "无" }
              ]
            },
            {
              title: "运行负荷",
              rows: [
                { label: "CPU", value: `${percentLabel(runtimeLoad.cpu.usage_percent)} · ${runtimeLoad.cpu.label}` },
                { label: "内存", value: `${percentLabel(runtimeLoad.memory.usage_percent)} · ${runtimeLoad.memory.label}` },
                { label: "网络", value: `${runtimeLoad.network.active_interface_count} 个连接 · ${runtimeLoad.network.label}` },
                { label: "服务心跳", value: runtimeLoad.service.heartbeat_at || runtimeLoad.service.label }
              ]
            },
            {
              title: "负荷建议",
              rows: [
                { label: "建议", value: observability.load_advice },
                { label: "预计完成", value: timeLabel(observability.estimated_all_done_at) },
                { label: "预计队列耗时", value: formatAdminDuration(observability.estimated_queue_duration_ms) }
              ]
            }
          ]}
        />
        <section className="admin-action-stack">
          <AdminControlButton
            label="启动预处理流水线"
            state="m9b-api"
            reason="扫描、入队、预处理并自动发布索引。"
            onClick={canStartSupervisor ? onStartPreprocessSupervisor : undefined}
          />
          <AdminControlButton
            label="暂停预处理流水线"
            state="m9b-api"
            reason="请求当前流水线在安全边界内暂停。"
            onClick={canStopSupervisor ? onStopPreprocessSupervisor : undefined}
          />
        </section>
      </InspectorPanel>
    </>
  );
}
