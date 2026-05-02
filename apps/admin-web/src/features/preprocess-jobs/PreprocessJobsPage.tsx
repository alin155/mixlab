import {
  GroupedForm,
  InspectorPanel
} from "@mixlab/ui-foundation";
import type { AdminDashboardData } from "../../api.ts";
import { AdminPageHeader, JobRows } from "../shared.tsx";

export function PreprocessJobsPage({ data }: { data: AdminDashboardData }) {
  const running = data.jobs.jobs.filter((job) => job.status === "running");
  const queued = data.jobs.jobs.filter((job) => job.status === "queued");
  const done = data.jobs.jobs.filter((job) => job.status === "done");
  const failed = data.jobs.jobs.filter((job) => job.status === "failed");

  return (
    <>
      <div className="admin-main-column">
        <AdminPageHeader title="预处理任务" eyebrow="单个视频失败不影响后续任务继续处理" />
        <section className="admin-job-groups">
          <div>
            <h2>正在处理</h2>
            <JobRows jobs={running} />
          </div>
          <div>
            <h2>队列中</h2>
            <JobRows jobs={queued} />
          </div>
          <div>
            <h2>最近完成</h2>
            <JobRows jobs={done} />
          </div>
          <div>
            <h2>失败可重试</h2>
            <JobRows jobs={failed} />
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
                { label: "失败策略", value: "继续后续视频" }
              ]
            },
            {
              title: "阶段",
              rows: [
                { label: "当前阶段", value: "build-keyframes" },
                { label: "日志入口", value: ".mixlab-library/logs/P000043.log" }
              ]
            }
          ]}
        />
        <button className="admin-primary-button" type="button">启动队列</button>
      </InspectorPanel>
    </>
  );
}
