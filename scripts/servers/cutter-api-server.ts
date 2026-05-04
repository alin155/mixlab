import { loadProjectEnv } from "../shared/load-project-env.ts";
import {
  createCutterApiServer,
  resolveCutterApiRuntimeConfigFromEnv
} from "../../packages/cutter-api/src/index.ts";

await loadProjectEnv();

const config = resolveCutterApiRuntimeConfigFromEnv();
const server = createCutterApiServer({
  library_root: config.library_root,
  workspace_root: config.workspace_root
});

server.listen(config.port, config.host, () => {
  console.log("Cutter API server started.");
  console.log(
    JSON.stringify(
      {
        url: `http://${config.host}:${config.port}`,
        library_root: config.library_root,
        workspace_root: config.workspace_root,
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
          "/cutter/clip-lists",
          "/cutter/cut-jobs",
          "/cutter/cut-jobs/run-next"
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
