import type { SourceVideoManifest } from "../../protocol/src/index.ts";
import type { AdminReadModelReconcileControl } from "./admin-read-model-reconciler.ts";
import type { AdminReadModelStorePreprocessJobSnapshot } from "./admin-read-model-store.ts";

export const ADMIN_READ_MODEL_RECONCILE_PREPROCESS_JOB_BATCH_SIZE = 64;

export interface AdminReadModelReconcilePreprocessJobRecord {
  claimed_at?: string;
  completed_at?: string;
  indexed_at?: string;
  failed_at?: string;
}

export interface ReadPreprocessJobSnapshotsForAdminReadModelReconcileInput {
  library_root: string;
  manifests: SourceVideoManifest[];
  total_source_video_count: number;
  control: Pick<AdminReadModelReconcileControl, "update_progress" | "assert_not_cancelled">;
  batch_size?: number;
  read_preprocess_job: (
    sourceVideoId: string
  ) => Promise<AdminReadModelReconcilePreprocessJobRecord | null>;
}

function boundedReadModelReconcilePercent(completed: number, total: number): number {
  if (total <= 0) {
    return completed > 0 ? 100 : 0;
  }

  return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
}

export async function readPreprocessJobSnapshotsForAdminReadModelReconcile(
  input: ReadPreprocessJobSnapshotsForAdminReadModelReconcileInput
): Promise<AdminReadModelStorePreprocessJobSnapshot[]> {
  const totalJobs = input.manifests.length;
  const totalSourceVideos = input.total_source_video_count || totalJobs;
  const batchSize = Math.max(
    1,
    Math.floor(input.batch_size ?? ADMIN_READ_MODEL_RECONCILE_PREPROCESS_JOB_BATCH_SIZE)
  );
  const snapshots: AdminReadModelStorePreprocessJobSnapshot[] = [];

  input.control.update_progress({
    phase: "scanning",
    step: "preprocess-job-snapshots",
    scanned_source_video_count: input.manifests.length,
    total_source_video_count: totalSourceVideos,
    preprocess_job_snapshot_count: 0,
    total_preprocess_job_snapshot_count: totalJobs,
    step_completed_count: 0,
    step_total_count: totalJobs,
    step_percent: 0,
    percent: totalJobs > 0 ? 50 : 90,
    message: totalJobs > 0
      ? `正在读取 0/${totalJobs} 条 preprocess job 快照。`
      : "没有 preprocess job 快照需要读取。"
  });

  for (let offset = 0; offset < input.manifests.length; offset += batchSize) {
    input.control.assert_not_cancelled();
    const batch = input.manifests.slice(offset, offset + batchSize);
    const batchSnapshots = await Promise.all(batch.map(async (manifest) => {
      const job = await input.read_preprocess_job(manifest.source_video_id);

      return {
        source_video_id: manifest.source_video_id,
        claimed_at: job?.claimed_at ?? "",
        completed_at: job?.completed_at ?? "",
        indexed_at: job?.indexed_at ?? "",
        failed_at: job?.failed_at ?? ""
      };
    }));

    snapshots.push(...batchSnapshots);
    const completed = snapshots.length;
    const stepPercent = boundedReadModelReconcilePercent(completed, totalJobs);

    input.control.update_progress({
      phase: "scanning",
      step: "preprocess-job-snapshots",
      scanned_source_video_count: input.manifests.length,
      total_source_video_count: totalSourceVideos,
      preprocess_job_snapshot_count: completed,
      total_preprocess_job_snapshot_count: totalJobs,
      step_completed_count: completed,
      step_total_count: totalJobs,
      step_percent: stepPercent,
      percent: Math.min(90, 50 + Math.round(stepPercent * 0.4)),
      message: `已读取 ${completed}/${totalJobs} 条 preprocess job 快照。`
    });
  }

  input.control.assert_not_cancelled();

  return snapshots;
}
