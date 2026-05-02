import {
  GroupedForm,
  InspectorPanel,
  StatusRow
} from "@mixlab/ui-foundation";
import type { AdminDashboardData } from "../../api.ts";
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

export function DashboardPage({
  data,
  onScanSourceVideos,
  onQueueUnprocessedVideos,
  onRetryFailedVideos,
  onRunDoctor
}: {
  data: AdminDashboardData;
  onScanSourceVideos?: () => void;
  onQueueUnprocessedVideos?: () => void;
  onRetryFailedVideos?: () => void;
  onRunDoctor?: () => void;
}) {
  return (
    <>
      <div className="admin-main-column">
        <AdminPageHeader
          title="仪表盘"
          eyebrow="全局风险和产能"
          action={
            <section className="admin-action-row" aria-label="仪表盘操作">
              <AdminControlButton label="扫描源视频" state="m9b-api" reason="M9B 接入扫描接口。" onClick={onScanSourceVideos} />
              <AdminControlButton label="处理未处理" state="m9b-api" reason="M9B 接加入队接口。" variant="primary" onClick={onQueueUnprocessedVideos} />
              <AdminControlButton label="健康诊断" state="m9b-api" reason="M9B 接入健康诊断运行接口。" onClick={onRunDoctor} />
            </section>
          }
        />
        <CountStrip data={data} />
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
        </section>
        <DiskUsage data={data} />
        <section className="admin-list-panel">
          <h2>最近任务</h2>
          {data.jobs.jobs.slice(0, 4).map((job) => (
            <StatusRow
              tone={adminStatusTone(job.status)}
              label={job.source_video_id}
              detail={`${jobStageLabel(job.stage)} · ${chineseDiagnosticText(job.title)}`}
              value={
                job.status === "failed" && job.retryable
                  ? <AdminControlButton label="重试失败" state="m9b-api" reason="M9B 接入失败重试接口。" onClick={onRetryFailedVideos} />
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
