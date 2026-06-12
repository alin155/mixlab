import { loadProjectEnv } from "../shared/load-project-env.ts";
import {
  createCutterApiServer,
  resolveCutterApiRuntimeConfigFromEnv
} from "../../packages/cutter-api/src/index.ts";
import { assertPersistentRuntimePath } from "../../packages/runtime-config/src/index.ts";

await loadProjectEnv();

const config = resolveCutterApiRuntimeConfigFromEnv();
assertPersistentRuntimePath({
  path_value: config.library_root,
  path_label: "公共素材库根目录"
});
if (config.workspace_root) {
  assertPersistentRuntimePath({
    path_value: config.workspace_root,
    path_label: "剪辑端本地工作区"
  });
}
const server = createCutterApiServer({
  library_root: config.library_root,
  workspace_root: config.workspace_root,
  searchd_base_url: config.searchd_base_url,
  auth_mode: config.auth_mode,
  trusted_user_id: config.trusted_user_id,
  trusted_username: config.trusted_username
});

server.listen(config.port, config.host, () => {
  console.log("Cutter API server started.");
  console.log(
    JSON.stringify(
      {
        url: `http://${config.host}:${config.port}`,
        library_root: config.library_root,
        workspace_root: config.workspace_root,
        searchd_base_url: config.searchd_base_url ?? "",
        auth_mode: config.auth_mode ?? "reviewed",
        endpoints: [
          "/health",
          "/cutter/runtime-status",
          "/cutter/source-library",
          "/cutter/source-videos/:source_video_id",
          "/cutter/source-search?query=现金流",
          "/cutter/source-videos/:source_video_id/media",
          "/cutter/source-videos/:source_video_id/cover",
          "/cutter/source-videos/:source_video_id/subtitles.srt",
          "/cutter/local-clips",
          "/cutter/local-clips/:local_clip_id",
          "/cutter/local-clips/:local_clip_id/media",
          "/cutter/local-clips/:local_clip_id/cover",
          "/cutter/local-clips/:local_clip_id/subtitles.srt",
          "/cutter/clip-lists",
          "/cutter/cut-jobs",
          "/cutter/cut-jobs/run-next",
          "/cutter/workspace/open-export-directory",
          "/cutter/cut-jobs/:cut_job_id/retry"
        ]
      },
      null,
      2
    )
  );
});

function shutdown(): void {
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
