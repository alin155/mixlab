import type {
  AdminActionResult,
  AdminDashboardMetrics,
  AdminIndexVersion,
  AdminIndexVersionsResponse,
  AdminLibraryStatus,
  AdminPreprocessJob,
  AdminPreprocessJobsResponse,
  AdminPreprocessStatus,
  AdminSourceVideo,
  AdminSourceVideoCoverUpdate,
  AdminSourceVideoMetadataUpdate
} from "../api.ts";

export interface FixtureSourceVideoState {
  sourceVideos: AdminSourceVideo[];
  jobs: AdminPreprocessJobsResponse;
  indexes: AdminIndexVersionsResponse;
  status: AdminLibraryStatus;
  metrics: AdminDashboardMetrics;
}

export interface FixtureSourceVideoMutationResult {
  state: FixtureSourceVideoState;
  result: AdminActionResult;
}

export interface FixtureSourceVideoUpdateResult {
  sourceVideos: AdminSourceVideo[];
  updated: AdminSourceVideo;
}

export function recountFixtureSourceVideoState(
  state: Pick<FixtureSourceVideoState, "sourceVideos" | "status" | "metrics">
): Pick<FixtureSourceVideoState, "status" | "metrics"> {
  const status = {
    ...state.status,
    ready_video_count: state.sourceVideos.filter((video) => video.preprocess_status === "ready").length,
    processing_video_count: state.sourceVideos.filter((video) => video.preprocess_status === "processing").length,
    queued_video_count: state.sourceVideos.filter((video) => video.preprocess_status === "queued").length,
    unprocessed_video_count: state.sourceVideos.filter((video) => video.preprocess_status === "unprocessed").length,
    failed_video_count: state.sourceVideos.filter((video) => video.preprocess_status === "failed").length,
    index_required_video_count: state.sourceVideos.filter((video) => video.preprocess_status === "index-required").length
  };

  return {
    status,
    metrics: {
      ...state.metrics,
      material: {
        ...state.metrics.material,
        video_count: state.sourceVideos.length,
        ready_video_count: status.ready_video_count,
        unprocessed_duration_ms: state.sourceVideos
          .filter((video) => video.preprocess_status === "unprocessed")
          .reduce((total, video) => total + video.duration_ms, 0)
      },
      risk: {
        failed_video_count: status.failed_video_count,
        index_required_video_count: status.index_required_video_count
      }
    }
  };
}

export function queueFixtureSourceVideos(
  state: FixtureSourceVideoState,
  input: {
    statuses: AdminPreprocessStatus[];
    message: string;
    sourceVideoId?: string;
  }
): FixtureSourceVideoMutationResult {
  const affected = state.sourceVideos.filter((video) =>
    input.statuses.includes(video.preprocess_status) &&
    (!input.sourceVideoId || video.source_video_id === input.sourceVideoId)
  );
  const sourceVideos: AdminSourceVideo[] = state.sourceVideos.map((video) =>
    input.statuses.includes(video.preprocess_status) &&
      (!input.sourceVideoId || video.source_video_id === input.sourceVideoId)
      ? {
          ...video,
          preprocess_status: "queued",
          visible_to_cutters: false,
          error_stage: undefined,
          error_message: undefined,
          updated_at: "2024-05-07 10:30:00"
        }
      : video
  );
  let jobs = state.jobs;

  for (const video of affected) {
    const jobId = `J${video.source_video_id.slice(1)}`;
    const existing = jobs.jobs.find((job) => job.job_id === jobId);
    const nextJob: AdminPreprocessJob = {
      job_id: jobId,
      source_video_id: video.source_video_id,
      title: video.title,
      status: "queued",
      status_label: "等待处理",
      stage: "extract-audio",
      stage_label: "等待处理",
      progress: 0,
      elapsed_ms: 0,
      estimated_remaining_ms: state.metrics.production.average_video_process_ms,
      estimated_start_at: "",
      estimated_done_at: "",
      queue_position: jobs.jobs.filter((job) => job.status === "queued").length + 1,
      log_path: `.mixlab-library/logs/${video.source_video_id}.log`,
      retryable: false
    };

    jobs = {
      ...jobs,
      jobs: existing
        ? jobs.jobs.map((job) => job.job_id === jobId ? nextJob : job)
        : [nextJob, ...jobs.jobs]
    };
  }

  const counted = recountFixtureSourceVideoState({
    sourceVideos,
    status: state.status,
    metrics: state.metrics
  });

  return {
    state: {
      ...state,
      sourceVideos,
      jobs,
      status: counted.status,
      metrics: counted.metrics
    },
    result: {
      affected_count: affected.length,
      source_video_ids: affected.map((video) => video.source_video_id),
      message: input.message
    }
  };
}

export function publishFixtureSourceVideos(
  state: FixtureSourceVideoState,
  input: {
    sourceVideoId?: string;
    alwaysPublishIndex?: boolean;
  } = {}
): FixtureSourceVideoMutationResult {
  const affected = state.sourceVideos.filter((video) =>
    video.preprocess_status === "index-required" &&
    (!input.sourceVideoId || video.source_video_id === input.sourceVideoId)
  );
  const sourceVideos: AdminSourceVideo[] = state.sourceVideos.map((video) =>
    video.preprocess_status === "index-required" &&
      (!input.sourceVideoId || video.source_video_id === input.sourceVideoId)
      ? {
          ...video,
          preprocess_status: "ready",
          visible_to_cutters: true,
          updated_at: "2024-05-07 10:31:00"
        }
      : video
  );
  const shouldPublishIndex = input.alwaysPublishIndex || affected.length > 0;
  const indexes = shouldPublishIndex
    ? fixturePublishedIndexes(state.indexes, sourceVideos)
    : state.indexes;
  const status = shouldPublishIndex
    ? {
        ...state.status,
        current_index_version: "v000028",
        index_status: "ready" as const
      }
    : state.status;
  const counted = recountFixtureSourceVideoState({
    sourceVideos,
    status,
    metrics: state.metrics
  });

  return {
    state: {
      ...state,
      sourceVideos,
      indexes,
      status: counted.status,
      metrics: counted.metrics
    },
    result: {
      affected_count: affected.length,
      prepared_source_video_ids: affected.map((video) => video.source_video_id),
      published_source_video_ids: affected.map((video) => video.source_video_id),
      skipped_source_video_ids: [],
      published_count: affected.length,
      skipped_count: 0,
      ready_video_count: sourceVideos.filter((video) => video.preprocess_status === "ready").length,
      message: affected.length > 0
        ? `已发布 ${affected.length} 个原视频，当前可用 ${counted.status.ready_video_count} 个。`
        : "没有需要发布的待索引视频。"
    }
  };
}

export function updateFixtureSourceVideoMetadata(
  sourceVideos: AdminSourceVideo[],
  sourceVideoId: string,
  metadata: AdminSourceVideoMetadataUpdate
): FixtureSourceVideoUpdateResult {
  let updated: AdminSourceVideo | undefined;
  const nextSourceVideos = sourceVideos.map((video) => {
    if (video.source_video_id !== sourceVideoId) {
      return video;
    }

    updated = {
      ...video,
      ...metadata,
      tags: metadata.tags ?? video.tags,
      updated_at: "2024-05-07 10:32:00"
    };
    return updated;
  });

  if (!updated) {
    throw new Error(`source video not found: ${sourceVideoId}`);
  }

  return { sourceVideos: nextSourceVideos, updated };
}

export function updateFixtureSourceVideoCover(
  sourceVideos: AdminSourceVideo[],
  sourceVideoId: string,
  coverUpdate: AdminSourceVideoCoverUpdate
): FixtureSourceVideoUpdateResult {
  let updated: AdminSourceVideo | undefined;
  const nextSourceVideos = sourceVideos.map((video) => {
    if (video.source_video_id !== sourceVideoId) {
      return video;
    }

    updated = {
      ...video,
      cover_url: `data:${coverUpdate.content_type};base64,${coverUpdate.image_base64}`,
      updated_at: "2024-05-07 10:33:00"
    };
    return updated;
  });

  if (!updated) {
    throw new Error(`source video not found: ${sourceVideoId}`);
  }

  return { sourceVideos: nextSourceVideos, updated };
}

function fixturePublishedIndexes(
  indexes: AdminIndexVersionsResponse,
  sourceVideos: AdminSourceVideo[]
): AdminIndexVersionsResponse {
  const nextVersion: AdminIndexVersion = {
    index_version: "v000028",
    created_at: "2024-05-07 10:31:00",
    ready_video_count: sourceVideos.filter((video) => video.preprocess_status === "ready").length,
    schema_version: "1.0.0",
    validation_status: "pass",
    validation_message: "索引包校验通过",
    is_current: true,
    published_by: "admin"
  };

  return {
    current_version: nextVersion.index_version,
    current_validation_status: "pass",
    current_validation_message: "current.json 指向 v000028",
    versions: [
      nextVersion,
      ...indexes.versions.map((version) => ({ ...version, is_current: false }))
    ]
  };
}
