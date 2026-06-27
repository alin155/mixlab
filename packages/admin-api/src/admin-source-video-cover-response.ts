import type { SourceVideoManifest } from "../../protocol/src/index.ts";
import type { AdminApiErrorEnvelope } from "./admin-route-adapter.ts";

export interface AdminSourceVideoCoverResponseApiInput {
  library_root: string;
}

export interface AdminSourceVideoCoverResponseDeps<TResponse> {
  read_source_video_manifest(libraryRoot: string, sourceVideoId: string): Promise<SourceVideoManifest>;
  resolve_artifact_path(input: {
    library_root: string;
    source_video_id: string;
    artifact_path: string;
    fallback_file_name?: string;
  }): string | null;
  file_exists(filePath: string): Promise<boolean>;
  image_content_type(filePath: string): string;
  write_json(response: TResponse, statusCode: number, body: AdminApiErrorEnvelope): void;
  write_stream(input: {
    response: TResponse;
    status_code: number;
    headers: Record<string, string>;
    file_path: string;
  }): void;
  api_error(errorCode: string, message: string): AdminApiErrorEnvelope;
}

export async function writeAdminSourceVideoCoverResponse<
  TApiInput extends AdminSourceVideoCoverResponseApiInput,
  TResponse
>(input: {
  response: TResponse;
  api_input: TApiInput;
  source_video_id: string;
  deps: AdminSourceVideoCoverResponseDeps<TResponse>;
}): Promise<void> {
  let manifest: SourceVideoManifest | null = null;
  try {
    manifest = await input.deps.read_source_video_manifest(
      input.api_input.library_root,
      input.source_video_id
    );
  } catch {
    manifest = null;
  }

  if (!manifest?.cover_path) {
    input.deps.write_json(input.response, 404, input.deps.api_error("not_found", "封面不存在"));
    return;
  }

  const coverPath = input.deps.resolve_artifact_path({
    library_root: input.api_input.library_root,
    source_video_id: input.source_video_id,
    artifact_path: manifest.cover_path,
    fallback_file_name: "cover.jpg"
  });

  if (!coverPath || !(await input.deps.file_exists(coverPath))) {
    input.deps.write_json(input.response, 404, input.deps.api_error("not_found", "封面不存在"));
    return;
  }

  input.deps.write_stream({
    response: input.response,
    status_code: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": input.deps.image_content_type(coverPath)
    },
    file_path: coverPath
  });
}
