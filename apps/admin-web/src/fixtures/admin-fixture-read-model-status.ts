import type { AdminReadModelReconcilerStatus } from "../api.ts";

export function fixtureReadModelReconcileStatus(videoCount: number): AdminReadModelReconcilerStatus {
  const stepCompletedCount = 64;
  const stepPercent = videoCount > 0 ? Math.round((stepCompletedCount / videoCount) * 100) : 0;
  const progressMessage = `已读取 ${stepCompletedCount}/${videoCount} 条 preprocess job 快照。`;

  return {
    schema_version: "1.0",
    command: "read-model-reconcile",
    status: "running",
    phase: "scanning",
    scan_mode: "full-reconcile",
    cancel_requested: false,
    started_at: "2024-05-07T10:29:00.000Z",
    finished_at: "",
    snapshot_video_count: 0,
    progress: {
      scanned_source_video_count: videoCount,
      total_source_video_count: videoCount,
      preprocess_job_snapshot_count: stepCompletedCount,
      total_preprocess_job_snapshot_count: videoCount,
      current_step: "preprocess-job-snapshots",
      step_completed_count: stepCompletedCount,
      step_total_count: videoCount,
      step_percent: stepPercent,
      percent: 70,
      message: progressMessage
    },
    events: [
      {
        at: "2024-05-07T10:30:00.000Z",
        event_type: "progress",
        phase: "scanning",
        message: progressMessage,
        scanned_source_video_count: videoCount,
        total_source_video_count: videoCount,
        preprocess_job_snapshot_count: stepCompletedCount,
        total_preprocess_job_snapshot_count: videoCount,
        current_step: "preprocess-job-snapshots",
        step_completed_count: stepCompletedCount,
        step_total_count: videoCount,
        step_percent: stepPercent
      },
      {
        at: "2024-05-07T10:29:00.000Z",
        event_type: "started",
        phase: "starting",
        message: "正在后台对账 admin.sqlite 读模型。",
        scanned_source_video_count: 0,
        total_source_video_count: 0,
        preprocess_job_snapshot_count: 0,
        total_preprocess_job_snapshot_count: 0,
        current_step: "starting",
        step_completed_count: 0,
        step_total_count: 0,
        step_percent: 0
      }
    ],
    message: "正在读取 preprocess job 快照。",
    result: null,
    error_code: "",
    error_message: ""
  };
}
