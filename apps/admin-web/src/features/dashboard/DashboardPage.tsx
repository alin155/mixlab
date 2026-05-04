import {
  GroupedForm,
  InspectorPanel,
  StatusRow
} from "@mixlab/ui-foundation";
import type { AdminDashboardData, AdminPreprocessJob } from "../../api.ts";
import {
  createAdminSmartScanReport,
  type AdminSmartScanAction,
  type AdminSmartScanReport
} from "../../api.ts";
import {
  chineseDiagnosticText,
  indexStatusLabel,
  jobStageLabel
} from "../../app/chinese.ts";
import {
  adminStatusTone,
  formatAdminDuration,
  formatAdminFileSize
} from "../../app/view-model.ts";
import {
  AdminControlButton,
  AdminPageHeader,
  CountStrip,
  DiskUsage,
  JobSummaryForm
} from "../shared.tsx";

function compactDateTimeLabel(value: string): string {
  const normalized = value.trim().replace("T", " ");

  if (!normalized) {
    return "暂无估算";
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/.exec(normalized);
  if (match) {
    return `${match[2]}-${match[3]} ${match[4]}:${match[5]}`;
  }

  return normalized.length > 16 ? `${normalized.slice(0, 16)}...` : normalized;
}

function DashboardPanel({
  title,
  rows
}: {
  title: string;
  rows: Array<{ label: string; value: string | number }>;
}) {
  return (
    <article className="admin-dashboard-panel">
      <h2>{title}</h2>
      <dl>
        {rows.map((row) => (
          <div className="admin-dashboard-panel-row" key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function percentLabel(value: number): string {
  return `${Math.round(value)}%`;
}

function recentJobDetail(job: AdminPreprocessJob, queuePosition: number, averageProcessMs: number): string {
  const title = chineseDiagnosticText(job.title);

  if (job.status === "queued") {
    const estimatedDuration = averageProcessMs > 0
      ? formatAdminDuration(averageProcessMs)
      : "等待估算";

    return `${title} · 等待处理 · 排队第 ${queuePosition} 位 · 预计耗时 ${estimatedDuration}`;
  }

  if (job.status === "running") {
    return `${title} · ${jobStageLabel(job.stage)} · 已用时 ${formatAdminDuration(job.elapsed_ms)}`;
  }

  if (job.status === "failed") {
    return `${title} · ${jobStageLabel(job.stage)}${job.error_message ? ` · ${chineseDiagnosticText(job.error_message)}` : ""}`;
  }

  return `${title} · ${jobStageLabel(job.stage)} · 已完成`;
}

export function DashboardPage({
  data,
  onRetryFailedVideos,
  onRunSmartScan,
  onApplySmartScanPrimaryAction,
  smartScanReport
}: {
  data: AdminDashboardData;
  onRetryFailedVideos?: () => void;
  onRunSmartScan?: () => void;
  onApplySmartScanPrimaryAction?: (action: AdminSmartScanAction) => void;
  smartScanReport?: AdminSmartScanReport;
}) {
  const report = smartScanReport ?? createAdminSmartScanReport(data);
  const averageProcessMs = data.metrics.production.average_video_process_ms;
  const runtimeLoad = data.metrics.runtime_load;
  const queuedPositionByJobId = new Map(
    data.jobs.jobs
      .filter((job) => job.status === "queued")
      .map((job, index) => [job.job_id, index + 1])
  );

  return (
    <>
      <div className="admin-main-column">
        <AdminPageHeader
          title="仪表盘"
          eyebrow="全局风险和产能"
          action={
            <section className="admin-action-row" aria-label="仪表盘操作">
              <AdminControlButton
                label="智能扫描"
                state="m9b-api"
                reason="扫描素材来源、运行健康诊断并生成下一步处理建议。"
                variant="primary"
                onClick={onRunSmartScan}
              />
            </section>
          }
        />
        <CountStrip data={data} />
        <section className={`admin-smart-scan-card is-${report.severity}`} aria-label="智能扫描建议">
          <div className="admin-smart-scan-copy">
            <p>智能扫描建议</p>
            <h2>{report.title}</h2>
            <span>{report.detail}</span>
          </div>
          {report.primary_action !== "none" ? (
            <AdminControlButton
              label={report.primary_label}
              state="m9b-api"
              reason="执行智能扫描推荐的下一步动作。"
              variant="primary"
              onClick={() => onApplySmartScanPrimaryAction?.(report.primary_action)}
            />
          ) : null}
          <div className="admin-smart-scan-suggestions">
            {report.suggestions.length ? report.suggestions.map((item) => (
              <article key={item.key}>
                <strong>{item.label}</strong>
                <span>{item.detail}</span>
              </article>
            )) : (
              <article>
                <strong>暂无待办</strong>
                <span>系统没有发现需要立即处理的生产动作。</span>
              </article>
            )}
          </div>
        </section>
        <section className="admin-dashboard-grid" aria-label="仪表盘关键指标">
          <DashboardPanel
            title="素材规模"
            rows={[
              { label: "原视频总时长", value: formatAdminDuration(data.metrics.material.total_duration_ms) },
              { label: "可用总时长", value: formatAdminDuration(data.metrics.material.ready_duration_ms) },
              { label: "未处理时长", value: formatAdminDuration(data.metrics.material.unprocessed_duration_ms) },
              { label: "原视频容量", value: formatAdminFileSize(data.metrics.material.total_size_bytes) }
            ]}
          />
          <DashboardPanel
            title="文案与索引"
            rows={[
              { label: "文案视频", value: data.metrics.transcript.transcript_video_count },
              { label: "文案总字数", value: data.metrics.transcript.character_count },
              { label: "文案段落", value: data.metrics.transcript.segment_count },
              { label: "当前索引", value: data.metrics.transcript.current_index_version }
            ]}
          />
          <DashboardPanel
            title="预处理产能"
            rows={[
              { label: "今日完成", value: data.metrics.production.completed_today_count },
              { label: "今日失败", value: data.metrics.production.failed_today_count },
              { label: "平均耗时", value: formatAdminDuration(data.metrics.production.average_video_process_ms) },
              { label: "预计完成", value: compactDateTimeLabel(data.metrics.production.estimated_queue_done_at) }
            ]}
          />
          <DashboardPanel
            title="剪辑端使用"
            rows={[
              { label: "搜索请求", value: data.metrics.usage.search_request_count },
              { label: "命中搜索", value: data.metrics.usage.search_hit_count },
              { label: "加入待剪", value: data.metrics.usage.add_to_cut_list_count },
              { label: "活跃剪辑师", value: data.metrics.usage.active_user_count }
            ]}
          />
          <DashboardPanel
            title="风险摘要"
            rows={[
              { label: "处理失败", value: data.metrics.risk.failed_video_count },
              { label: "待发布索引", value: data.metrics.risk.index_required_video_count },
              { label: "空搜索", value: data.metrics.usage.search_empty_count },
              { label: "剪切失败", value: data.metrics.usage.cut_failure_count }
            ]}
          />
          <DashboardPanel
            title="设备负荷"
            rows={[
              { label: "CPU", value: `${percentLabel(runtimeLoad.cpu.usage_percent)} · ${runtimeLoad.cpu.label}` },
              { label: "内存", value: `${percentLabel(runtimeLoad.memory.usage_percent)} · ${runtimeLoad.memory.label}` },
              { label: "网络", value: `${runtimeLoad.network.active_interface_count} 个连接 · ${runtimeLoad.network.label}` },
              { label: "服务心跳", value: runtimeLoad.service.heartbeat_at || runtimeLoad.service.label }
            ]}
          />
        </section>
        <DiskUsage data={data} />
        <section className="admin-list-panel">
          <h2>最近任务</h2>
          {data.jobs.jobs.slice(0, 4).map((job) => (
            <StatusRow
              tone={adminStatusTone(job.status)}
              label={job.source_video_id}
              detail={recentJobDetail(job, queuedPositionByJobId.get(job.job_id) ?? 1, averageProcessMs)}
              value={
                job.status === "failed" && job.retryable
                  ? <AdminControlButton label="重试失败" state="m9b-api" reason="M9B 接入失败重试接口。" onClick={onRetryFailedVideos} />
                  : job.status === "queued"
                    ? "等待处理"
                  : `${job.progress}%`
              }
              key={job.job_id}
            />
          ))}
        </section>
      </div>
      <InspectorPanel title="公共素材库健康摘要">
        <JobSummaryForm data={data} />
        <GroupedForm
          groups={[
            {
              title: "索引状态",
              rows: [
                { label: "当前索引", value: data.indexes.current_version },
                { label: "状态", value: indexStatusLabel(data.status.index_status) },
                { label: "待发布索引", value: data.status.index_required_video_count },
                { label: "更新", value: data.status.updated_at }
              ]
            }
          ]}
        />
      </InspectorPanel>
    </>
  );
}
