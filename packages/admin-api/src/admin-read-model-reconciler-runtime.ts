import type {
  LibraryCounts,
  SourceVideoManifest
} from "../../protocol/src/index.ts";
import { adminCommandSystemActor } from "./admin-command-audit.ts";
import { runAdminCommand } from "./admin-command-runtime.ts";
import type {
  AdminOperationLogAppendInput,
  AdminOperationLogEvent
} from "./admin-operation-log.ts";
import {
  createAdminReadModelReconciler,
  type AdminReadModelReconcileControl,
  type AdminReadModelReconcilerEvent
} from "./admin-read-model-reconciler.ts";
import {
  readPreprocessJobSnapshotsForAdminReadModelReconcile,
  type AdminReadModelReconcilePreprocessJobRecord
} from "./admin-read-model-reconcile-snapshot-reader.ts";

export type AdminReadModelReconcilerRuntime = ReturnType<typeof createAdminReadModelReconciler>;

export interface AdminReadModelReconcilerRuntimeDeps {
  clear_source_video_page_cache(libraryRoot: string): void;
  read_library_manifest(libraryRoot: string): Promise<(LibraryCounts & {
    updated_at?: string;
  }) | null>;
  read_all_source_video_manifests(libraryRoot: string): Promise<SourceVideoManifest[]>;
  read_preprocess_job(
    libraryRoot: string,
    sourceVideoId: string
  ): Promise<AdminReadModelReconcilePreprocessJobRecord | null>;
  append_operation_log_event(input: AdminOperationLogAppendInput): Promise<AdminOperationLogEvent>;
}

export function createAdminReadModelReconcilerRuntime(input: {
  library_root: string;
  default_page_limit: number;
  now: () => string;
  deps: AdminReadModelReconcilerRuntimeDeps;
}): AdminReadModelReconcilerRuntime {
  return createAdminReadModelReconciler({
    library_root: input.library_root,
    default_page_limit: input.default_page_limit,
    now: input.now,
    read_snapshot: (control) => readAdminReadModelReconcileSnapshot({
      library_root: input.library_root,
      control,
      deps: input.deps
    }),
    run_command: (operation) =>
      runAdminCommand({
        library_root: input.library_root,
        command: "read-model-reconcile",
        now: input.now(),
        actor: adminCommandSystemActor("后台读模型对账", "system-task"),
        append_operation_log_event: input.deps.append_operation_log_event
      }, operation),
    record_event: (event) => appendAdminReadModelReconcileRuntimeEvent({
      library_root: input.library_root,
      event,
      append_operation_log_event: input.deps.append_operation_log_event
    })
  });
}

async function readAdminReadModelReconcileSnapshot(input: {
  library_root: string;
  control: AdminReadModelReconcileControl;
  deps: AdminReadModelReconcilerRuntimeDeps;
}) {
  input.control.update_progress({
    phase: "scanning",
    step: "library-manifest",
    step_completed_count: 0,
    step_total_count: 1,
    step_percent: 0,
    message: "正在读取 library.json 概览。"
  });
  input.control.assert_not_cancelled();
  input.deps.clear_source_video_page_cache(input.library_root);
  const library = await input.deps.read_library_manifest(input.library_root);
  const total = library?.video_count ?? 0;
  input.control.update_progress({
    phase: "scanning",
    step: "source-video-manifests",
    total_source_video_count: total,
    step_completed_count: 0,
    step_total_count: total,
    step_percent: 0,
    percent: 5,
    message: "正在读取 source-video manifest 快照。"
  });
  input.control.assert_not_cancelled();
  const manifests = await input.deps.read_all_source_video_manifests(input.library_root);
  input.control.update_progress({
    phase: "scanning",
    step: "source-video-manifests",
    scanned_source_video_count: manifests.length,
    total_source_video_count: total || manifests.length,
    step_completed_count: manifests.length,
    step_total_count: total || manifests.length,
    step_percent: 100,
    percent: 50,
    message: `已读取 ${manifests.length} 条 source-video manifest 快照。`
  });
  input.control.assert_not_cancelled();
  const preprocessJobs = await readPreprocessJobSnapshotsForAdminReadModelReconcile({
    library_root: input.library_root,
    manifests,
    total_source_video_count: total || manifests.length,
    control: input.control,
    read_preprocess_job(sourceVideoId) {
      return input.deps.read_preprocess_job(input.library_root, sourceVideoId);
    }
  });
  input.control.assert_not_cancelled();

  return {
    library,
    manifests,
    preprocess_jobs: preprocessJobs
  };
}

async function appendAdminReadModelReconcileRuntimeEvent(input: {
  library_root: string;
  event: AdminReadModelReconcilerEvent;
  append_operation_log_event(input: AdminOperationLogAppendInput): Promise<AdminOperationLogEvent>;
}): Promise<void> {
  await input.append_operation_log_event({
    library_root: input.library_root,
    occurred_at: input.event.at,
    area: "read-model",
    action: "read-model-reconcile",
    event_type: input.event.event_type,
    message: input.event.message,
    details: {
      phase: input.event.phase,
      scanned_source_video_count: input.event.scanned_source_video_count,
      total_source_video_count: input.event.total_source_video_count
    }
  });
}
