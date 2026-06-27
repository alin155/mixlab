import { getJson, getJsonWithMeta, listQuery, sendJson } from "./admin-http.ts";
import {
  resolveSourceVideoDetailMedia,
  resolveSourceVideoMedia
} from "./admin-source-video-media.ts";
import type {
  AdminActionResult,
  AdminSourceVideo,
  AdminSourceVideoCoverUpdate,
  AdminSourceVideoDetail,
  AdminSourceVideoListOptions,
  AdminSourceVideoListResult,
  AdminSourceVideoMetadataUpdate
} from "./api.ts";

export interface AdminSourceVideoClientContext {
  fetchImpl: typeof fetch;
  baseUrl: string;
  protectedHeaders?: HeadersInit;
}

export interface AdminSourceVideoClientMethods {
  listSourceVideos(options?: AdminSourceVideoListOptions): Promise<AdminSourceVideo[]>;
  listSourceVideosWithRuntime(options?: AdminSourceVideoListOptions): Promise<AdminSourceVideoListResult>;
  getSourceVideoDetail(sourceVideoId: string): Promise<AdminSourceVideoDetail>;
  queueSourceVideo(sourceVideoId: string): Promise<AdminActionResult>;
  retrySourceVideo(sourceVideoId: string): Promise<AdminActionResult>;
  recoverProcessingSourceVideo(sourceVideoId: string): Promise<AdminActionResult>;
  publishSourceVideo(sourceVideoId: string): Promise<AdminActionResult>;
  updateSourceVideoMetadata(
    sourceVideoId: string,
    metadata: AdminSourceVideoMetadataUpdate
  ): Promise<AdminSourceVideo>;
  updateSourceVideoCover(
    sourceVideoId: string,
    cover: AdminSourceVideoCoverUpdate
  ): Promise<AdminSourceVideo>;
}

export function createAdminSourceVideoClientMethods({
  fetchImpl,
  baseUrl,
  protectedHeaders
}: AdminSourceVideoClientContext): AdminSourceVideoClientMethods {
  const listSourceVideosWithRuntime = (options?: AdminSourceVideoListOptions) =>
    getJsonWithMeta<AdminSourceVideo[]>(
      fetchImpl,
      baseUrl,
      `/api/admin/source-videos${listQuery(options)}`,
      protectedHeaders
    )
      .then((result) => ({
        source_videos: result.data.map((video) => resolveSourceVideoMedia(baseUrl, video)),
        ...(result.meta?.runtime ? { runtime: result.meta.runtime } : {})
      }));

  return {
    listSourceVideos: (options) =>
      listSourceVideosWithRuntime(options).then((result) => result.source_videos),
    listSourceVideosWithRuntime,
    getSourceVideoDetail: (sourceVideoId) =>
      getJson<AdminSourceVideoDetail>(fetchImpl, baseUrl, `/api/admin/source-videos/${sourceVideoId}`, protectedHeaders)
        .then((detail) => resolveSourceVideoDetailMedia(baseUrl, detail)),
    queueSourceVideo: (sourceVideoId) =>
      sendJson<AdminActionResult>(
        fetchImpl,
        baseUrl,
        `/api/admin/source-videos/${sourceVideoId}/queue`,
        "POST",
        undefined,
        protectedHeaders
      ),
    retrySourceVideo: (sourceVideoId) =>
      sendJson<AdminActionResult>(
        fetchImpl,
        baseUrl,
        `/api/admin/source-videos/${sourceVideoId}/retry`,
        "POST",
        undefined,
        protectedHeaders
      ),
    recoverProcessingSourceVideo: (sourceVideoId) =>
      sendJson<AdminActionResult>(
        fetchImpl,
        baseUrl,
        `/api/admin/source-videos/${sourceVideoId}/recover-processing`,
        "POST",
        undefined,
        protectedHeaders
      ),
    publishSourceVideo: (sourceVideoId) =>
      sendJson<AdminActionResult>(
        fetchImpl,
        baseUrl,
        `/api/admin/source-videos/${sourceVideoId}/publish`,
        "POST",
        undefined,
        protectedHeaders
      ),
    updateSourceVideoMetadata: (sourceVideoId, metadata) =>
      sendJson<AdminSourceVideo>(
        fetchImpl,
        baseUrl,
        `/api/admin/source-videos/${sourceVideoId}/metadata`,
        "PATCH",
        metadata,
        protectedHeaders
      ).then((video) => resolveSourceVideoMedia(baseUrl, video)),
    updateSourceVideoCover: (sourceVideoId, cover) =>
      sendJson<AdminSourceVideo>(
        fetchImpl,
        baseUrl,
        `/api/admin/source-videos/${sourceVideoId}/cover`,
        "PATCH",
        cover,
        protectedHeaders
      )
        .then((video) => resolveSourceVideoMedia(baseUrl, video))
  };
}
