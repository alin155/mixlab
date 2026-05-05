import { loadProjectEnv } from "../shared/load-project-env.ts";
import { createAdminApiServer } from "../../packages/admin-api/src/index.ts";
import { assertPersistentRuntimePath } from "../../packages/runtime-config/src/index.ts";

interface AdminApiRuntimeConfig {
  library_root: string;
  library_id: string;
  library_name: string;
  host: string;
  port: number;
}

function optionalTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveAdminApiRuntimeConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): AdminApiRuntimeConfig {
  const libraryRoot =
    optionalTrimmed(env.MIXLAB_ADMIN_LIBRARY_ROOT) ??
    optionalTrimmed(env.MIXLAB_PREPROCESS_LIBRARY_ROOT) ??
    optionalTrimmed(env.MIXLAB_CUTTER_LIBRARY_ROOT);

  if (!libraryRoot) {
    throw new Error(
      "MIXLAB_ADMIN_LIBRARY_ROOT, MIXLAB_PREPROCESS_LIBRARY_ROOT, or MIXLAB_CUTTER_LIBRARY_ROOT is required"
    );
  }

  const rawPort = optionalTrimmed(env.MIXLAB_ADMIN_API_PORT);
  const port = rawPort ? Number.parseInt(rawPort, 10) : 3889;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("MIXLAB_ADMIN_API_PORT must be an integer between 1 and 65535");
  }

  return {
    library_root: libraryRoot,
    library_id:
      optionalTrimmed(env.MIXLAB_ADMIN_LIBRARY_ID) ??
      optionalTrimmed(env.MIXLAB_PREPROCESS_LIBRARY_ID) ??
      "lib_main_001",
    library_name:
      optionalTrimmed(env.MIXLAB_ADMIN_LIBRARY_NAME) ??
      optionalTrimmed(env.MIXLAB_PREPROCESS_LIBRARY_NAME) ??
      "主素材库",
    host: optionalTrimmed(env.MIXLAB_ADMIN_API_HOST) ?? "127.0.0.1",
    port
  };
}

await loadProjectEnv();

const config = resolveAdminApiRuntimeConfigFromEnv();
assertPersistentRuntimePath({
  path_value: config.library_root,
  path_label: "公共素材库根目录"
});
const server = createAdminApiServer({
  library_root: config.library_root,
  library_id: config.library_id,
  library_name: config.library_name
});

server.listen(config.port, config.host, () => {
  console.log("Admin API server started.");
  console.log(
    JSON.stringify(
      {
        url: `http://${config.host}:${config.port}`,
        library_root: config.library_root,
        library_id: config.library_id,
        library_name: config.library_name,
        endpoints: [
          "/api/admin/library/status",
          "/api/admin/library/path-checks",
          "/api/admin/source-videos",
          "/api/admin/preprocess/jobs",
          "/api/admin/index/versions",
          "/api/admin/doctor/report",
          "/api/admin/settings/runtime",
          "/api/admin/library/init",
          "/api/admin/library/scan",
          "/api/admin/preprocess/queue-unprocessed",
          "/api/admin/preprocess/retry-failed",
          "/api/admin/index/repair",
          "/api/admin/doctor/run",
          "/api/admin/settings/test-asr",
          "/api/admin/source-videos/:source_video_id/metadata"
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
