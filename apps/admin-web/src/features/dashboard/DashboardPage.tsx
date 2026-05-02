import {
  GroupedForm,
  InspectorPanel,
  StatusRow
} from "@mixlab/ui-foundation";
import type { AdminDashboardData } from "../../api.ts";
import { adminStatusTone } from "../../app/view-model.ts";
import { AdminControlButton, AdminPageHeader, CountStrip, DiskUsage, JobSummaryForm } from "../shared.tsx";

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
              <AdminControlButton label="Doctor" state="m9b-api" reason="M9B 接入 Doctor 运行接口。" onClick={onRunDoctor} />
            </section>
          }
        />
        <CountStrip data={data} />
        <DiskUsage data={data} />
        <section className="admin-list-panel">
          <h2>最近任务</h2>
          {data.jobs.jobs.slice(0, 4).map((job) => (
            <StatusRow
              tone={adminStatusTone(job.status)}
              label={job.source_video_id}
              detail={`${job.stage} · ${job.title}`}
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
                { label: "current", value: data.indexes.current_version },
                { label: "状态", value: data.status.index_status },
                { label: "Index Required", value: data.status.index_required_video_count },
                { label: "更新", value: data.status.updated_at }
              ]
            }
          ]}
        />
      </InspectorPanel>
    </>
  );
}
