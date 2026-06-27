export interface AdminSourceVideoMediaRouteApiInput {
  library_root: string;
}

export interface AdminSourceVideoMediaRouteDeps<TApiInput extends AdminSourceVideoMediaRouteApiInput, TResponse> {
  write_cover(input: {
    api_input: TApiInput;
    response: TResponse;
    source_video_id: string;
  }): Promise<void>;
}

export type AdminSourceVideoMediaRouteResult =
  | {
      handled: true;
    }
  | {
      handled: false;
    };

export interface HandleAdminSourceVideoMediaRoutesInput<
  TApiInput extends AdminSourceVideoMediaRouteApiInput,
  TResponse
> {
  method: string;
  pathname: string;
  api_input: TApiInput;
  response: TResponse;
  deps: AdminSourceVideoMediaRouteDeps<TApiInput, TResponse>;
}

export function matchAdminSourceVideoCoverPath(pathname: string): string | null {
  const match = /^\/api\/admin\/source-videos\/(V\d{6})\/cover$/.exec(pathname);
  return match?.[1] ?? null;
}

export async function handleAdminSourceVideoMediaRoutes<
  TApiInput extends AdminSourceVideoMediaRouteApiInput,
  TResponse
>(
  input: HandleAdminSourceVideoMediaRoutesInput<TApiInput, TResponse>
): Promise<AdminSourceVideoMediaRouteResult> {
  const sourceVideoId = matchAdminSourceVideoCoverPath(input.pathname);

  if (input.method === "GET" && sourceVideoId) {
    await input.deps.write_cover({
      api_input: input.api_input,
      response: input.response,
      source_video_id: sourceVideoId
    });

    return { handled: true };
  }

  return { handled: false };
}
