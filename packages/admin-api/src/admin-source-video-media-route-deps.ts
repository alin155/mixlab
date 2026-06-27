import type {
  AdminSourceVideoMediaRouteApiInput,
  AdminSourceVideoMediaRouteDeps
} from "./admin-source-video-media-routes.ts";

export interface CreateAdminSourceVideoMediaRouteDepsInput<
  TApiInput extends AdminSourceVideoMediaRouteApiInput,
  TResponse
> {
  write_cover(response: TResponse, apiInput: TApiInput, sourceVideoId: string): Promise<void>;
}

export function createAdminSourceVideoMediaRouteDeps<
  TApiInput extends AdminSourceVideoMediaRouteApiInput,
  TResponse
>(
  input: CreateAdminSourceVideoMediaRouteDepsInput<TApiInput, TResponse>
): AdminSourceVideoMediaRouteDeps<TApiInput, TResponse> {
  return {
    write_cover({ api_input, response, source_video_id }) {
      return input.write_cover(response, api_input, source_video_id);
    }
  };
}
