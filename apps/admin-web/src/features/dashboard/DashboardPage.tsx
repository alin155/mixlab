import {
  GroupedForm,
  InspectorPanel,
  StatusRow
} from "@mixlab/ui-foundation";
import type { AdminDashboardData } from "../../api.ts";
import { adminStatusTone } from "../../app/view-model.ts";
import { AdminPageHeader, CountStrip, DiskUsage, JobSummaryForm } from "../shared.tsx";

export function DashboardPage({ data }: { data: AdminDashboardData }) {
  return (
    <>
      <div className="admin-main-column">
        <AdminPageHeader title="仪表盘" eyebrow={data.status.name} />
        <CountStrip data={data} />
        <DiskUsage data={data} />
        <section className="admin-list-panel">
          <h2>最近任务</h2>
          {data.jobs.jobs.slice(0, 4).map((job) => (
            <StatusRow
              tone={adminStatusTone(job.status)}
              label={job.source_video_id}
              detail={`${job.stage} · ${job.title}`}
              value={job.status === "failed" && job.retryable ? "重试" : `${job.progress}%`}
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
