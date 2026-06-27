import type {
  AdminArtifactDetail,
  AdminLibraryStatus,
  AdminPreprocessJobsResponse,
  AdminSourceVideo,
  AdminSourceVideoDetail,
  AdminSourceVideoListOptions
} from "../api.ts";

function artifact(sourceVideoId: string, fileName: string, exists = true): AdminArtifactDetail {
  const path = `.mixlab-library/videos/${sourceVideoId}/${fileName}`;
  return {
    path,
    file_path: `/Volumes/PublicLibrary/${path}`,
    exists
  };
}

export function makeSourceVideoDetail(
  video: AdminSourceVideo,
  input: {
    jobs: AdminPreprocessJobsResponse;
    status: AdminLibraryStatus;
  }
): AdminSourceVideoDetail {
  const job = input.jobs.jobs.find((candidate) => candidate.source_video_id === video.source_video_id);
  const ready = video.preprocess_status === "ready";

  return {
    source_video: {
      ...video,
      tags: [...video.tags]
    },
    technical: {
      duration_ms: video.duration_ms,
      width: ready ? 1920 : 0,
      height: ready ? 1080 : 0,
      fps: ready ? 25 : 0,
      codec: ready ? "h264" : "",
      file_size: video.file_size,
      content_hash: ready ? `${video.source_video_id.toLowerCase()}-content-hash` : "",
      relative_path: video.relative_path
    },
    visibility: {
      visible_to_cutters: video.preprocess_status === "ready" && video.visible_to_cutters,
      label: video.preprocess_status === "ready" && video.visible_to_cutters ? "剪辑师可见" : "剪辑师暂不可见",
      reason: video.preprocess_status === "ready" && video.visible_to_cutters
        ? ""
        : video.preprocess_status !== "ready"
          ? "视频尚未完成预处理"
          : "管理员尚未开放给剪辑师"
    },
    preprocess: {
      status: video.preprocess_status,
      job_id: `J${video.source_video_id.slice(1)}`,
      stage: job?.stage ?? video.preprocess_status,
      attempt: ready ? 1 : 0,
      started_at: job?.started_at ?? "",
      completed_at: job?.completed_at ?? "",
      failed_at: job?.failed_at ?? "",
      error_stage: video.error_stage ?? "",
      error_message: video.error_message ?? ""
    },
    artifacts: {
      transcript: artifact(video.source_video_id, "transcript.json", ready),
      subtitles: artifact(video.source_video_id, "subtitles.srt", ready),
      cover: artifact(video.source_video_id, "cover.jpg", ready),
      keyframes: artifact(video.source_video_id, "keyframes.json", ready),
      index_version: ready ? input.status.current_index_version : ""
    },
    transcript: {
      full_text: ready ? "现金流，是企业经营中的关键安全边界。" : "",
      segment_count: ready ? 12 : 0,
      character_count: ready ? 19 : 0
    }
  };
}

export function adminSourceVideoMatchesOptions(
  video: AdminSourceVideo,
  options?: AdminSourceVideoListOptions
): boolean {
  const matchesStatus = !options?.status || options.status === "all" || video.preprocess_status === options.status;
  const normalizedQuery = options?.query?.trim().toLocaleLowerCase() ?? "";

  if (!matchesStatus) {
    return false;
  }

  if (!normalizedQuery) {
    return true;
  }

  const searchableText = [
    video.source_video_id,
    video.title,
    video.file_name,
    video.relative_path,
    video.description,
    video.lecturer,
    video.course,
    video.category,
    ...video.tags
  ].join(" ").toLocaleLowerCase();

  return searchableText.includes(normalizedQuery);
}
