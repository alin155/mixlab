export interface AdminWorkerCommand {
  name: string;
  command: string[];
  enabled: boolean;
}

export function parseWorkerPollIntervalSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const rawValue = env.MIXLAB_WORKER_POLL_INTERVAL_SECONDS?.trim();
  if (!rawValue) return 60;

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("MIXLAB_WORKER_POLL_INTERVAL_SECONDS must be a positive integer");
  }

  return parsed;
}

export function resolveNpmExecutable(platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? "npm.cmd" : "npm";
}

export function isAdminDockerMvpMode(env: NodeJS.ProcessEnv = process.env): boolean {
  const mode = env.MIXLAB_ADMIN_DOCKER_MVP_MODE?.trim().toLowerCase();
  return mode === "v0.1" || mode === "docker-mvp-v0.1" || mode === "true";
}

export function buildAdminWorkerCycle(env: NodeJS.ProcessEnv = process.env): AdminWorkerCommand[] {
  const npm = resolveNpmExecutable();
  const dockerMvpMode = isAdminDockerMvpMode(env);
  return [
    {
      name: "preprocess-library",
      command: [npm, "run", "worker:preprocess-library"],
      enabled: env.MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER === "1",
    },
    {
      name: "publish-ready",
      command: [npm, "run", "worker:publish-ready"],
      enabled: !dockerMvpMode && env.MIXLAB_ENABLE_READY_PUBLISH_WORKER === "1",
    },
  ];
}
