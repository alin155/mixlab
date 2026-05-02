import {
  GroupedForm,
  InspectorPanel
} from "@mixlab/ui-foundation";
import type { AdminDashboardData } from "../../api.ts";
import { AdminControlButton, AdminPageHeader, JobRows, MetricBand } from "../shared.tsx";

export function PreprocessJobsPage({
  data,
  onQueueUnprocessedVideos,
  onRetryFailedVideos
}: {
  data: AdminDashboardData;
  onQueueUnprocessedVideos?: () => void;
  onRetryFailedVideos?: () => void;
}) {
  const running = data.jobs.jobs.filter((job) => job.status === "running");
  const queued = data.jobs.jobs.filter((job) => job.status === "queued");
  const done = data.jobs.jobs.filter((job) => job.status === "done");
  const failed = data.jobs.jobs.filter((job) => job.status === "failed");

  return (
    <>
      <div className="admin-main-column">
        <AdminPageHeader
          title="预处理任务"
          eyebrow="生产队列"
          action={
            <section className="admin-action-row" aria-label="队列操作">
              <AdminControlButton label="处理未处理" state="m9b-api" reason="M9B 接加入队接口。" variant="primary" onClick={onQueueUnprocessedVideos} />
              <AdminControlButton label="重试失败" state="m9b-api" reason="M9B 接入失败重试接口。" onClick={onRetryFailedVideos} />
            </section>
          }
        />
        <MetricBand
          items={[
            { label: "正在处理", value: data.jobs.active_count, caption: "worker 已领取" },
            { label: "队列中", value: data.jobs.queued_count, caption: "等待预处理" },
            { label: "最近完成", value: data.jobs.completed_count, caption: "已产生可发布产物" },
            { label: "失败可重试", value: data.jobs.failed_count, caption: "单个失败不阻塞队列" }
          ]}
        />
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
            <JobRows jobs={failed} onRetryFailed={onRetryFailedVideos} />
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
                { label: "当前阶段", value: "build-keyframes" },
                { label: "日志入口", value: ".mixlab-library/logs/P000043.log" }
              ]
            }
          ]}
        />
        <section className="admin-action-stack">
          <AdminControlButton label="处理未处理" state="m9b-api" reason="M9B 接加入队接口。" variant="primary" onClick={onQueueUnprocessedVideos} />
          <AdminControlButton label="启动 Worker" state="native-boundary" reason="长期 Worker 由服务端脚本或桌面壳托管。" />
        </section>
      </InspectorPanel>
    </>
  );
}
