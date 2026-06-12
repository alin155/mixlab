import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const DEFAULT_COMPOSE_PATH = "deploy/nas/mixlab/docker-compose.yml";
const DEFAULT_ENV_EXAMPLE_PATH = "deploy/nas/mixlab/.env.example";

export interface NasDockerComposeStaticReport {
  ok: boolean;
  errors: string[];
  compose_path: string;
  env_example_path: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function countOccurrences(value: string, needle: string): number {
  let count = 0;
  let offset = 0;

  while (true) {
    const next = value.indexOf(needle, offset);
    if (next === -1) {
      return count;
    }

    count += 1;
    offset = next + needle.length;
  }
}

function parseEnv(rawEnv: string): Map<string, string> {
  const values = new Map<string, string>();

  for (const line of rawEnv.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    values.set(trimmed.slice(0, equalsIndex), trimmed.slice(equalsIndex + 1));
  }

  return values;
}

function requireMatch(raw: string, pattern: RegExp, message: string, errors: string[]): void {
  if (!pattern.test(raw)) {
    errors.push(message);
  }
}

function requireEnvValue(env: Map<string, string>, key: string, expectedValue: string, errors: string[]): void {
  const actual = env.get(key);

  if (actual !== expectedValue) {
    errors.push(`.env.example ${key} must be ${JSON.stringify(expectedValue)}`);
  }
}

function serviceBlock(rawCompose: string, serviceName: string): string {
  const serviceHeaderPattern = new RegExp(`^  ${serviceName}:\\s*$`, "m");
  const match = serviceHeaderPattern.exec(rawCompose);

  if (!match) {
    return "";
  }

  const blockStart = match.index;
  const rest = rawCompose.slice(blockStart + match[0].length);
  const nextServiceMatch = /^  [A-Za-z0-9_-]+:\s*$/m.exec(rest);
  const blockEnd = nextServiceMatch
    ? blockStart + match[0].length + nextServiceMatch.index
    : rawCompose.length;

  return rawCompose.slice(blockStart, blockEnd);
}

function serviceDefinesNetworkPublication(rawCompose: string, serviceName: string): boolean {
  const block = serviceBlock(rawCompose, serviceName);

  return /^\s{4}(?:ports|expose):\s*$/m.test(block);
}

export async function validateNasDockerComposeStatic(input: {
  composePath?: string;
  envExamplePath?: string;
} = {}): Promise<NasDockerComposeStaticReport> {
  const composePath = input.composePath ?? DEFAULT_COMPOSE_PATH;
  const envExamplePath = input.envExamplePath ?? DEFAULT_ENV_EXAMPLE_PATH;
  const errors: string[] = [];
  let composeRaw = "";
  let envRaw = "";

  try {
    composeRaw = await readFile(composePath, "utf8");
  } catch (error) {
    errors.push(`${composePath} must be readable: ${errorMessage(error)}`);
  }

  try {
    envRaw = await readFile(envExamplePath, "utf8");
  } catch (error) {
    errors.push(`${envExamplePath} must be readable: ${errorMessage(error)}`);
  }

  if (!composeRaw || !envRaw) {
    return {
      ok: false,
      errors,
      compose_path: composePath,
      env_example_path: envExamplePath
    };
  }

  requireMatch(composeRaw, /^services:\s*$/m, "docker-compose.yml must define top-level services", errors);
  requireMatch(composeRaw, /^\s{2}admin-api:\s*$/m, "docker-compose.yml must define admin-api service", errors);
  requireMatch(composeRaw, /^\s{2}admin-worker:\s*$/m, "docker-compose.yml must define admin-worker service", errors);
  requireMatch(composeRaw, /^\s{2}admin-web:\s*$/m, "docker-compose.yml must define admin-web service", errors);
  requireMatch(
    composeRaw,
    /admin-api:[\s\S]*image: ghcr\.io\/alin155\/mixlab-admin-runtime:\$\{MIXLAB_IMAGE_TAG:-latest\}/,
    "admin-api must use the versioned GHCR admin runtime image",
    errors
  );
  requireMatch(
    composeRaw,
    /admin-worker:[\s\S]*image: ghcr\.io\/alin155\/mixlab-admin-runtime:\$\{MIXLAB_IMAGE_TAG:-latest\}/,
    "admin-worker must use the versioned GHCR admin runtime image",
    errors
  );
  requireMatch(
    composeRaw,
    /admin-web:[\s\S]*image: ghcr\.io\/alin155\/mixlab-admin-web:\$\{MIXLAB_IMAGE_TAG:-latest\}/,
    "admin-web must use the versioned GHCR admin web image",
    errors
  );
  requireMatch(
    composeRaw,
    /admin-api:[\s\S]*MIXLAB_ADMIN_API_HOST: 0\.0\.0\.0[\s\S]*MIXLAB_ADMIN_API_PORT: 3889/,
    "admin-api must listen on 0.0.0.0:3889 inside the NAS network",
    errors
  );
  requireMatch(
    composeRaw,
    /admin-api:[\s\S]*MIXLAB_ADMIN_LIBRARY_ROOT: \/data\/PublicLibrary[\s\S]*MIXLAB_FFMPEG_PATH: \/usr\/bin\/ffmpeg[\s\S]*MIXLAB_FFPROBE_PATH: \/usr\/bin\/ffprobe/,
    "admin-api must use the mounted /data/PublicLibrary root and bundled container FFmpeg paths",
    errors
  );
  requireMatch(
    composeRaw,
    /admin-worker:[\s\S]*MIXLAB_ADMIN_LIBRARY_ROOT: \/data\/PublicLibrary[\s\S]*MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL: \$\{MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL:-25\}/,
    "admin-worker must use the mounted /data/PublicLibrary root and default count refresh interval 25",
    errors
  );
  requireMatch(
    composeRaw,
    /admin-worker:[\s\S]*MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER: \$\{MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER:-1\}[\s\S]*MIXLAB_ENABLE_READY_PUBLISH_WORKER: \$\{MIXLAB_ENABLE_READY_PUBLISH_WORKER:-1\}/,
    "admin-worker must enable preprocess and ready-publish workers by default",
    errors
  );
  requireMatch(
    composeRaw,
    /admin-worker:[\s\S]*depends_on:\s*\n\s+- admin-api[\s\S]*command: \["npm", "run", "worker:admin-loop"\]/,
    "admin-worker must depend on admin-api and run worker:admin-loop",
    errors
  );
  requireMatch(
    composeRaw,
    /admin-web:[\s\S]*depends_on:\s*\n\s+- admin-api[\s\S]*ports:\s*\n\s+- "\$\{MIXLAB_ADMIN_WEB_PORT:-8080\}:80"/,
    "admin-web must depend on admin-api and expose MIXLAB_ADMIN_WEB_PORT defaulting to 8080",
    errors
  );
  if (serviceDefinesNetworkPublication(composeRaw, "admin-api")) {
    errors.push("admin-api must not publish host ports; only admin-web may be externally reachable");
  }
  if (serviceDefinesNetworkPublication(composeRaw, "admin-worker")) {
    errors.push("admin-worker must not publish host ports; only admin-web may be externally reachable");
  }

  const mountCount = countOccurrences(composeRaw, "${PUBLIC_LIBRARY_HOST_PATH}:/data/PublicLibrary");
  if (mountCount !== 2) {
    errors.push("docker-compose.yml must mount PUBLIC_LIBRARY_HOST_PATH into /data/PublicLibrary for admin-api and admin-worker");
  }

  const envFileCount = countOccurrences(composeRaw, "env_file:\n      - .env");
  if (envFileCount < 2) {
    errors.push("admin-api and admin-worker must both read .env");
  }

  const env = parseEnv(envRaw);
  requireEnvValue(env, "PUBLIC_LIBRARY_HOST_PATH", "/volume1/MixLab/PublicLibrary", errors);
  requireEnvValue(env, "MIXLAB_IMAGE_TAG", "latest", errors);
  requireEnvValue(env, "MIXLAB_ADMIN_WEB_PORT", "8080", errors);
  requireEnvValue(env, "MIXLAB_WORKER_POLL_INTERVAL_SECONDS", "60", errors);
  requireEnvValue(env, "MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER", "1", errors);
  requireEnvValue(env, "MIXLAB_ENABLE_READY_PUBLISH_WORKER", "1", errors);
  requireEnvValue(env, "MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL", "25", errors);

  if (env.get("DASHSCOPE_API_KEY") !== "") {
    errors.push(".env.example DASHSCOPE_API_KEY must be blank");
  }

  return {
    ok: errors.length === 0,
    errors,
    compose_path: composePath,
    env_example_path: envExamplePath
  };
}

async function main(): Promise<void> {
  const result = await validateNasDockerComposeStatic({
    composePath: process.argv[2] ?? DEFAULT_COMPOSE_PATH,
    envExamplePath: process.argv[3] ?? DEFAULT_ENV_EXAMPLE_PATH
  });

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
