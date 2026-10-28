import {
  adminDashboardFieldSource,
  type AdminDashboardData
} from "../api.ts";

export interface AdminActionImpact {
  title: string;
  summary: string;
  items: string[];
  target_count: number;
}

function supervisorUnconfirmedNote(data: AdminDashboardData): string[] {
  const source = adminDashboardFieldSource(data, "supervisor").source;

  return source === "api"
    ? []
    : ["注意：预处理服务状态当前未确认，影响范围按最后一次已知统计估算。"];
}

export function adminBatchPublishImpact(data: AdminDashboardData): AdminActionImpact {
  const targetCount = Math.max(0, data.status.index_required_video_count);

  return {
    title: "上线全部已处理素材",
    summary: targetCount > 0
      ? `将把 ${targetCount} 个已处理待上线素材批量上线到剪辑端。`
      : "当前摘要显示没有待上线素材；执行后会再次确认并可能无实际变更。",
    items: [
      `目标数量：${targetCount} 个已处理待上线素材`,
      "上线后剪辑师可立即搜索、打开详情并选段剪切",
      "已上线素材不会被重跑或下线；本操作不支持一键回滚",
      `当前索引：${data.indexes.current_version || "暂无索引"}`,
      "建议先确认这些素材已审核，再执行批量上线"
    ],
    target_count: targetCount
  };
}

export function adminStartPreprocessImpact(data: AdminDashboardData): AdminActionImpact {
  const unprocessed = Math.max(0, data.status.unprocessed_video_count);
  const queued = Math.max(0, data.jobs.queued_count);

  return {
    title: "启动预处理",
    summary: "启动前会先扫描新增素材，然后由预处理服务持续处理队列，直到全部完成或手动暂停。",
    items: [
      `待发现/未处理视频：${unprocessed} 个`,
      `当前队列：${queued} 个`,
      "启动会先执行一次新增素材扫描（会遍历素材来源目录）",
      "服务将持续处理队列，可随时“暂停预处理”停止领取新任务",
      "已完成/已上线素材不会被重跑",
      ...supervisorUnconfirmedNote(data)
    ],
    target_count: unprocessed + queued
  };
}

export function adminPausePreprocessImpact(data: AdminDashboardData): AdminActionImpact {
  const active = Math.max(0, data.jobs.active_count);
  const queued = Math.max(0, data.jobs.queued_count);

  return {
    title: "暂停预处理",
    summary: "暂停后预处理服务会停止领取新任务；当前任务可能继续到安全检查点。",
    items: [
      `处理中任务：${active} 个`,
      `队列中等待：${queued} 个（会保留，重新启动后继续）`,
      "已完成与已上线素材不受影响",
      "暂停后可再次点击“启动预处理”恢复处理",
      ...supervisorUnconfirmedNote(data)
    ],
    target_count: active + queued
  };
}

export function adminLongAsrImpact(data: AdminDashboardData): AdminActionImpact {
  const longAsrJobs = data.jobs.jobs.filter((job) =>
    job.long_task_recommended && (job.status === "failed" || job.status === "queued")
  );
  const sourceVideoIds = [...new Set(longAsrJobs.map((job) => job.source_video_id))];
  const sample = sourceVideoIds.slice(0, 5).join("、");

  return {
    title: "长任务语音识别",
    summary: sourceVideoIds.length > 0
      ? `将用长等待模式重新识别 ${sourceVideoIds.length} 个超长素材。`
      : "当前没有需要长任务语音识别的素材。",
    items: [
      `目标素材：${sourceVideoIds.length} 个${sample ? `（${sample}${sourceVideoIds.length > 5 ? " 等" : ""}）` : ""}`,
      "长任务会使用更长的语音识别等待时间，比普通任务耗时更久",
      "失败素材会先重新入队，再由预处理服务领取",
      "不会修改或删除已有文案产物之外的素材内容"
    ],
    target_count: sourceVideoIds.length
  };
}
