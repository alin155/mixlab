import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { validateNasDockerComposeStatic } from "./nas-docker-compose-static.ts";

const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_WORK_ROOT = ".local-dev/admin-docker-local-smoke";
const DEFAULT_WEB_PORT = "18081";
const EXPECTED_MVP_MODE = "off";
const EXPECTED_LIBRARY_ROOT = "/data/PublicLibrary";
const LOCAL_RUNTIME_IMAGE = "mixlab-admin-runtime:local-mvp-smoke";
const LOCAL_WEB_IMAGE = "mixlab-admin-web:local-mvp-smoke";

type SmokeGateStatus = "pass" | "blocked" | "fail" | "skipped";
type SmokeGateCategory =
  | "safety"
  | "static-contract"
  | "operator-intent"
  | "docker-runtime"
  | "docker-build"
  | "compose"
  | "probe"
  | "worker-env"
  | "release-boundary";
type ProbeName = "admin_web_root" | "auth_status" | "library_status" | "release_gates" | "data_loading_plan";

export interface CommandResult {
  command: string;
  args: string[];
  exit_code: number | null;
  stdout: string;
  stderr: string;
  duration_ms: number;
  ok: boolean;
  error_code?: string;
  message?: string;
  timed_out?: boolean;
}

export type CommandRunner = (
  command: string,
  args: string[],
  options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeout_ms?: number;
  }
) => Promise<CommandResult>;

interface StaticContractCheck {
  id: string;
  status: "pass" | "fail";
  evidence: string;
}

interface StaticContractReport {
  ok: boolean;
  checks: StaticContractCheck[];
  paths: {
    runtime_dockerfile: string;
    web_dockerfile: string;
    compose: string;
    env_example: string;
  };
}

interface DockerAvailability {
  docker_cli: CommandResult;
  docker_compose: CommandResult;
}

interface LocalSmokeProbeResult {
  name: ProbeName;
  path: string;
  duration_ms: number;
  http_status: number | null;
  ok: boolean;
  api_ok: boolean | null;
  content_type: string;
  response_bytes: number;
  data: unknown;
  error_code?: string;
  message?: string;
}

interface WorkerEnvObservation {
  command: CommandResult | null;
  flags: Record<string, string>;
  library_roots: Record<string, string>;
}

interface BuildIdentity {
  image_tag: string;
  build_sha: string;
  build_version: string;
  mvp_mode: string;
}

interface LocalSmokeGate {
  id: string;
  title: string;
  category: SmokeGateCategory;
  status: SmokeGateStatus;
  evidence: string;
  blocks_local_smoke: boolean;
  blocks_docker_upload: boolean;
  required_evidence?: string;
}

interface LocalSmokeSummary {
  total: number;
  passed: number;
  blocked: number;
  failed: number;
  skipped: number;
  local_smoke_blockers: string[];
  docker_upload_blockers: string[];
}

export interface AdminDockerLocalSmokeReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-docker-local-smoke";
  run_requested: boolean;
  local_smoke_passed: boolean;
  docker_upload_allowed: false;
  nas_live_evidence: false;
  observations: {
    web_url: string;
    work_dir: string;
    compose_file: string;
    public_library_host_path: string;
    runtime_image: string;
    web_image: string;
    docker_cli_available: boolean;
    docker_compose_available: boolean;
    static_contract_ok: boolean;
  };
  build_identity: BuildIdentity;
  static_contract: StaticContractReport;
  commands: CommandResult[];
  probes: LocalSmokeProbeResult[];
  worker_env: WorkerEnvObservation;
  gates: LocalSmokeGate[];
  summary: LocalSmokeSummary;
  result: {
    status: "accepted" | "blocked" | "failed";
    summary: string;
  };
  run_instructions: string[];
  artifacts: {
    json_path: string;
    markdown_path: string;
  } | null;
}

interface ProbeDefinition {
  name: ProbeName;
  path: string;
  json: boolean;
  timeout_ms: number;
}

interface RunLocalSmokeInput {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  generated_at?: string;
  command?: string;
  commandRunner?: CommandRunner;
  fetcher?: typeof fetch;
  now?: () => Date;
}

function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function statusOf(pass: boolean): "pass" | "fail" {
  return pass ? "pass" : "fail";
}

function commandText(command: string, args: string[]): string {
  return [command, ...args].join(" ");
}

function compactOutput(value: string, maxLength = 1_500): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

function markdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function parseEnvLines(raw: string): Map<string, string> {
  const values = new Map<string, string>();

  for (const line of raw.split(/\r?\n/)) {
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

function pick(values: Map<string, string>, keys: string[]): Record<string, string> {
  const output: Record<string, string> = {};
  for (const key of keys) {
    output[key] = values.get(key) ?? "";
  }

  return output;
}

function defaultCommandRunner(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeout_ms?: number;
  } = {}
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const started = performance.now();
    let settled = false;
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let child;

    const finish = (result: Omit<CommandResult, "command" | "args" | "duration_ms" | "stdout" | "stderr">): void => {
      if (settled) {
        return;
      }

      settled = true;
      resolve({
        command,
        args,
        stdout: compactOutput(stdout, 8_000),
        stderr: compactOutput(stderr, 8_000),
        duration_ms: roundMs(performance.now() - started),
        ...result
      });
    };

    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env ?? process.env,
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (error) {
      finish({
        exit_code: null,
        ok: false,
        error_code: "spawn_failed",
        message: errorMessage(error)
      });
      return;
    }

    const timer = options.timeout_ms
      ? setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, options.timeout_ms)
      : null;

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (timer) {
        clearTimeout(timer);
      }

      finish({
        exit_code: null,
        ok: false,
        error_code: error.code ?? "command_error",
        message: error.message,
        timed_out: timedOut
      });
    });
    child.on("close", (code) => {
      if (timer) {
        clearTimeout(timer);
      }

      finish({
        exit_code: code,
        ok: code === 0 && !timedOut,
        error_code: timedOut ? "timeout" : code === 0 ? undefined : "non_zero_exit",
        message: timedOut ? "command timed out" : code === 0 ? undefined : `exit code ${code}`,
        timed_out: timedOut
      });
    });
  });
}

async function optionalRead(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

function addContainsCheck(input: {
  checks: StaticContractCheck[];
  id: string;
  raw: string;
  needle: string;
  passEvidence: string;
  failEvidence: string;
}): void {
  const pass = input.raw.includes(input.needle);
  input.checks.push({
    id: input.id,
    status: statusOf(pass),
    evidence: pass ? input.passEvidence : input.failEvidence
  });
}

export async function evaluateAdminDockerLocalSmokeStaticContract(input: {
  runtimeDockerfilePath?: string;
  webDockerfilePath?: string;
  composePath?: string;
  envExamplePath?: string;
} = {}): Promise<StaticContractReport> {
  const runtimeDockerfilePath = input.runtimeDockerfilePath ?? "docker/admin-runtime.Dockerfile";
  const webDockerfilePath = input.webDockerfilePath ?? "docker/admin-web.Dockerfile";
  const composePath = input.composePath ?? "deploy/nas/mixlab/docker-compose.yml";
  const envExamplePath = input.envExamplePath ?? "deploy/nas/mixlab/.env.example";
  const checks: StaticContractCheck[] = [];
  let runtimeRaw = "";
  let webRaw = "";

  try {
    runtimeRaw = await optionalRead(runtimeDockerfilePath);
  } catch (error) {
    checks.push({
      id: "runtime-dockerfile-readable",
      status: "fail",
      evidence: `${runtimeDockerfilePath} is not readable: ${errorMessage(error)}`
    });
  }

  try {
    webRaw = await optionalRead(webDockerfilePath);
  } catch (error) {
    checks.push({
      id: "web-dockerfile-readable",
      status: "fail",
      evidence: `${webDockerfilePath} is not readable: ${errorMessage(error)}`
    });
  }

  const composeReport = await validateNasDockerComposeStatic({
    composePath,
    envExamplePath
  });

  checks.push({
    id: "nas-compose-static-contract",
    status: statusOf(composeReport.ok),
    evidence: composeReport.ok
      ? "NAS compose static contract passes, including production Docker mode, disabled standalone workers, /data/PublicLibrary roots, and admin-web-only port publication."
      : composeReport.errors.join("; ")
  });

  if (runtimeRaw) {
    addContainsCheck({
      checks,
      id: "runtime-dockerfile-mvp-arg",
      raw: runtimeRaw,
      needle: "ARG MIXLAB_ADMIN_DOCKER_MVP_MODE=off",
      passEvidence: "admin-runtime Dockerfile defaults MIXLAB_ADMIN_DOCKER_MVP_MODE to off.",
      failEvidence: "admin-runtime Dockerfile must default MIXLAB_ADMIN_DOCKER_MVP_MODE to off."
    });
    addContainsCheck({
      checks,
      id: "runtime-dockerfile-mvp-env",
      raw: runtimeRaw,
      needle: "ENV MIXLAB_ADMIN_DOCKER_MVP_MODE=${MIXLAB_ADMIN_DOCKER_MVP_MODE}",
      passEvidence: "admin-runtime image persists MIXLAB_ADMIN_DOCKER_MVP_MODE into the runtime environment.",
      failEvidence: "admin-runtime image must persist MIXLAB_ADMIN_DOCKER_MVP_MODE into the runtime environment."
    });
  }

  if (webRaw) {
    addContainsCheck({
      checks,
      id: "web-dockerfile-mvp-arg",
      raw: webRaw,
      needle: "ARG MIXLAB_ADMIN_DOCKER_MVP_MODE=off",
      passEvidence: "admin-web Dockerfile defaults MIXLAB_ADMIN_DOCKER_MVP_MODE to off.",
      failEvidence: "admin-web Dockerfile must default MIXLAB_ADMIN_DOCKER_MVP_MODE to off."
    });
    addContainsCheck({
      checks,
      id: "web-dockerfile-mvp-vite-env",
      raw: webRaw,
      needle: "ENV VITE_MIXLAB_ADMIN_DOCKER_MVP_MODE=${MIXLAB_ADMIN_DOCKER_MVP_MODE}",
      passEvidence: "admin-web build receives VITE_MIXLAB_ADMIN_DOCKER_MVP_MODE from the Docker MVP mode arg.",
      failEvidence: "admin-web build must receive VITE_MIXLAB_ADMIN_DOCKER_MVP_MODE from the Docker MVP mode arg."
    });
  }

  return {
    ok: checks.every((check) => check.status === "pass"),
    checks,
    paths: {
      runtime_dockerfile: runtimeDockerfilePath,
      web_dockerfile: webDockerfilePath,
      compose: composePath,
      env_example: envExamplePath
    }
  };
}

async function detectDockerAvailability(commandRunner: CommandRunner, cwd: string, env: NodeJS.ProcessEnv): Promise<DockerAvailability> {
  const dockerCli = await commandRunner("docker", ["--version"], {
    cwd,
    env,
    timeout_ms: 10_000
  });
  const dockerCompose = dockerCli.ok
    ? await commandRunner("docker", ["compose", "version"], {
      cwd,
      env,
      timeout_ms: 10_000
    })
    : {
      command: "docker",
      args: ["compose", "version"],
      exit_code: null,
      stdout: "",
      stderr: "",
      duration_ms: 0,
      ok: false,
      error_code: "docker_cli_unavailable",
      message: "docker CLI is not available"
    };

  return {
    docker_cli: dockerCli,
    docker_compose: dockerCompose
  };
}

function buildLocalCompose(input: {
  publicLibraryHostPath: string;
  webPort: string;
  runtimeImage: string;
  webImage: string;
  buildSha: string;
  buildVersion: string;
  imageTag: string;
}): string {
  const volume = JSON.stringify(`${input.publicLibraryHostPath}:${EXPECTED_LIBRARY_ROOT}`);
  const webPort = JSON.stringify(`${input.webPort}:80`);

  return `services:
  admin-api:
    image: ${input.runtimeImage}
    environment:
      MIXLAB_ADMIN_API_HOST: 0.0.0.0
      MIXLAB_ADMIN_API_PORT: "3889"
      MIXLAB_ADMIN_AUTH_MODE: disabled
      MIXLAB_ADMIN_LIBRARY_ROOT: ${EXPECTED_LIBRARY_ROOT}
      MIXLAB_PREPROCESS_LIBRARY_ROOT: ${EXPECTED_LIBRARY_ROOT}
      MIXLAB_ADMIN_DOCKER_MVP_MODE: ${EXPECTED_MVP_MODE}
      MIXLAB_IMAGE_TAG: ${input.imageTag}
      MIXLAB_BUILD_SHA: ${input.buildSha}
      MIXLAB_BUILD_VERSION: ${input.buildVersion}
      MIXLAB_PREPROCESS_DISK_BLOCK_USAGE_PERCENT: "92"
      MIXLAB_FFMPEG_PATH: /usr/bin/ffmpeg
      MIXLAB_FFPROBE_PATH: /usr/bin/ffprobe
    volumes:
      - ${volume}
    healthcheck:
      test: ["CMD-SHELL", "node -e \\"fetch('http://127.0.0.1:3889/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\\""]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 10s

  admin-worker:
    image: ${input.runtimeImage}
    depends_on:
      - admin-api
    environment:
      MIXLAB_ADMIN_LIBRARY_ROOT: ${EXPECTED_LIBRARY_ROOT}
      MIXLAB_PREPROCESS_LIBRARY_ROOT: ${EXPECTED_LIBRARY_ROOT}
      MIXLAB_ADMIN_DOCKER_MVP_MODE: ${EXPECTED_MVP_MODE}
      MIXLAB_IMAGE_TAG: ${input.imageTag}
      MIXLAB_BUILD_SHA: ${input.buildSha}
      MIXLAB_BUILD_VERSION: ${input.buildVersion}
      MIXLAB_FFMPEG_PATH: /usr/bin/ffmpeg
      MIXLAB_FFPROBE_PATH: /usr/bin/ffprobe
      MIXLAB_WORKER_POLL_INTERVAL_SECONDS: "60"
      MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER: "0"
      MIXLAB_ENABLE_READY_PUBLISH_WORKER: "0"
      MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL: "25"
      MIXLAB_PREPROCESS_DISK_BLOCK_USAGE_PERCENT: "92"
    volumes:
      - ${volume}
    command: ["npm", "run", "worker:admin-loop"]

  admin-web:
    image: ${input.webImage}
    depends_on:
      - admin-api
    ports:
      - ${webPort}
`;
}

function probeDefinitions(): ProbeDefinition[] {
  return [
    {
      name: "admin_web_root",
      path: "/",
      json: false,
      timeout_ms: 5_000
    },
    {
      name: "auth_status",
      path: "/api/admin/auth/status",
      json: true,
      timeout_ms: 5_000
    },
    {
      name: "library_status",
      path: "/api/admin/library/status",
      json: true,
      timeout_ms: 8_000
    },
    {
      name: "release_gates",
      path: "/api/admin/release-gates",
      json: true,
      timeout_ms: 8_000
    },
    {
      name: "data_loading_plan",
      path: "/api/admin/data-loading/plan",
      json: true,
      timeout_ms: 5_000
    }
  ];
}

function envelopeData(parsed: unknown): {
  data: unknown;
  api_ok: boolean | null;
  error_code?: string;
  message?: string;
} {
  if (!isRecord(parsed)) {
    return {
      data: parsed,
      api_ok: null
    };
  }

  if ("ok" in parsed || "data" in parsed || "error_code" in parsed) {
    return {
      data: parsed.data ?? null,
      api_ok: asBoolean(parsed.ok),
      error_code: asString(parsed.error_code) || undefined,
      message: asString(parsed.message) || undefined
    };
  }

  return {
    data: parsed,
    api_ok: null
  };
}

async function fetchProbe(fetcher: typeof fetch, baseUrl: string, definition: ProbeDefinition): Promise<LocalSmokeProbeResult> {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, definition.timeout_ms);

  try {
    const response = await fetcher(new URL(definition.path, baseUrl), {
      method: "GET",
      signal: controller.signal
    });
    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    let data: unknown = null;
    let apiOk: boolean | null = null;
    let errorCode: string | undefined;
    let message: string | undefined;

    if (definition.json) {
      try {
        const parsed = JSON.parse(text) as unknown;
        const envelope = envelopeData(parsed);
        data = envelope.data;
        apiOk = envelope.api_ok;
        errorCode = envelope.error_code;
        message = envelope.message;
      } catch (error) {
        errorCode = "invalid_json";
        message = errorMessage(error);
      }
    }

    return {
      name: definition.name,
      path: definition.path,
      duration_ms: roundMs(performance.now() - started),
      http_status: response.status,
      ok: response.ok && (definition.json ? apiOk !== false && !errorCode : true),
      api_ok: apiOk,
      content_type: contentType,
      response_bytes: Buffer.byteLength(text),
      data,
      error_code: errorCode,
      message
    };
  } catch (error) {
    return {
      name: definition.name,
      path: definition.path,
      duration_ms: roundMs(performance.now() - started),
      http_status: null,
      ok: false,
      api_ok: null,
      content_type: "",
      response_bytes: 0,
      data: null,
      error_code: "request_failed",
      message: errorMessage(error)
    };
  } finally {
    clearTimeout(timer);
  }
}

async function waitForProbeSet(fetcher: typeof fetch, baseUrl: string): Promise<LocalSmokeProbeResult[]> {
  const deadline = Date.now() + 60_000;
  let latest: LocalSmokeProbeResult[] = [];

  while (Date.now() < deadline) {
    latest = [];
    for (const definition of probeDefinitions()) {
      latest.push(await fetchProbe(fetcher, baseUrl, definition));
    }

    if (latest.every((probe) => probe.ok)) {
      return latest;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }

  return latest;
}

function releaseGateMvpContractReady(releaseGates: unknown): boolean {
  const workerProof = asRecord(asRecord(releaseGates).admin_worker_env_proof);
  const flags = asRecord(workerProof.required_env_flags);
  const roots = asRecord(workerProof.required_library_roots);

  return asString(flags.MIXLAB_ADMIN_DOCKER_MVP_MODE) === EXPECTED_MVP_MODE &&
    asString(flags.MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER) === "0" &&
    asString(flags.MIXLAB_ENABLE_READY_PUBLISH_WORKER) === "0" &&
    asString(roots.MIXLAB_ADMIN_LIBRARY_ROOT) === EXPECTED_LIBRARY_ROOT &&
    asString(roots.MIXLAB_PREPROCESS_LIBRARY_ROOT) === EXPECTED_LIBRARY_ROOT;
}

function probeByName(probes: LocalSmokeProbeResult[], name: ProbeName): LocalSmokeProbeResult | undefined {
  return probes.find((probe) => probe.name === name);
}

function workerEnvFromCommand(command: CommandResult | null): WorkerEnvObservation {
  const values = parseEnvLines(command?.stdout ?? "");

  return {
    command,
    flags: pick(values, [
      "MIXLAB_ADMIN_DOCKER_MVP_MODE",
      "MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER",
      "MIXLAB_ENABLE_READY_PUBLISH_WORKER"
    ]),
    library_roots: pick(values, [
      "MIXLAB_ADMIN_LIBRARY_ROOT",
      "MIXLAB_PREPROCESS_LIBRARY_ROOT"
    ])
  };
}

function gate(input: LocalSmokeGate): LocalSmokeGate {
  return input;
}

function buildGates(input: {
  runRequested: boolean;
  staticContract: StaticContractReport;
  dockerAvailability: DockerAvailability;
  buildRuntime: CommandResult | null;
  buildWeb: CommandResult | null;
  composeUp: CommandResult | null;
  probes: LocalSmokeProbeResult[];
  workerEnv: WorkerEnvObservation;
}): LocalSmokeGate[] {
  const dockerCliAvailable = input.dockerAvailability.docker_cli.ok;
  const dockerComposeAvailable = input.dockerAvailability.docker_compose.ok;
  const buildRuntimeStatus: SmokeGateStatus = !input.runRequested || !dockerCliAvailable || !input.staticContract.ok
    ? "skipped"
    : input.buildRuntime?.ok ? "pass" : "fail";
  const buildWebStatus: SmokeGateStatus = !input.runRequested || !dockerCliAvailable || !input.staticContract.ok
    ? "skipped"
    : input.buildWeb?.ok ? "pass" : "fail";
  const composeUpStatus: SmokeGateStatus = !input.runRequested ||
    !dockerCliAvailable ||
    !dockerComposeAvailable ||
    !input.staticContract.ok ||
    input.buildRuntime?.ok !== true ||
    input.buildWeb?.ok !== true
    ? "skipped"
    : input.composeUp?.ok ? "pass" : "fail";
  const endpointProbesStatus: SmokeGateStatus = composeUpStatus !== "pass"
    ? "skipped"
    : input.probes.every((probe) => probe.ok) ? "pass" : "fail";
  const releaseGates = probeByName(input.probes, "release_gates")?.data ?? null;
  const releaseGateMvpReady = releaseGateMvpContractReady(releaseGates);
  const workerFlags = input.workerEnv.flags;
  const workerRoots = input.workerEnv.library_roots;
  const workerEnvPass = input.workerEnv.command?.ok === true &&
    workerFlags.MIXLAB_ADMIN_DOCKER_MVP_MODE === EXPECTED_MVP_MODE &&
    workerFlags.MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER === "0" &&
    workerFlags.MIXLAB_ENABLE_READY_PUBLISH_WORKER === "0" &&
    workerRoots.MIXLAB_ADMIN_LIBRARY_ROOT === EXPECTED_LIBRARY_ROOT &&
    workerRoots.MIXLAB_PREPROCESS_LIBRARY_ROOT === EXPECTED_LIBRARY_ROOT;
  const workerEnvStatus: SmokeGateStatus = composeUpStatus !== "pass"
    ? "skipped"
    : workerEnvPass ? "pass" : "fail";

  return [
    gate({
      id: "local-smoke-no-nas-side-effects",
      title: "Local Docker smoke uses isolated local library",
      category: "safety",
      status: "pass",
      evidence: "The script builds local images and mounts .local-dev/admin-docker-local-smoke/*/PublicLibrary when run; it never contacts NAS Docker, restarts live containers, writes NAS files, publishes indexes, or changes Cutter protocols.",
      blocks_local_smoke: false,
      blocks_docker_upload: false
    }),
    gate({
      id: "static-contract-ready",
      title: "Docker static contract is ready",
      category: "static-contract",
      status: input.staticContract.ok ? "pass" : "fail",
      evidence: input.staticContract.ok
        ? "Dockerfiles and NAS compose defaults preserve MVP mode, disabled standalone workers, /data/PublicLibrary roots, and admin-web-only publication."
        : input.staticContract.checks.filter((check) => check.status !== "pass").map((check) => `${check.id}: ${check.evidence}`).join("; "),
      blocks_local_smoke: !input.staticContract.ok,
      blocks_docker_upload: !input.staticContract.ok
    }),
    gate({
      id: "explicit-run-requested",
      title: "Operator explicitly requested container run",
      category: "operator-intent",
      status: input.runRequested ? "pass" : "blocked",
      evidence: input.runRequested
        ? "MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_RUN=1 is set."
        : "MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_RUN is not 1, so the script did not build images or start containers.",
      blocks_local_smoke: !input.runRequested,
      blocks_docker_upload: !input.runRequested,
      required_evidence: "Set MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_RUN=1 on a Docker-capable machine to run the full local smoke."
    }),
    gate({
      id: "docker-cli-available",
      title: "Docker CLI is available",
      category: "docker-runtime",
      status: dockerCliAvailable ? "pass" : "blocked",
      evidence: dockerCliAvailable
        ? compactOutput(input.dockerAvailability.docker_cli.stdout || input.dockerAvailability.docker_cli.stderr)
        : input.dockerAvailability.docker_cli.message || input.dockerAvailability.docker_cli.stderr || "docker CLI is unavailable.",
      blocks_local_smoke: !dockerCliAvailable,
      blocks_docker_upload: !dockerCliAvailable,
      required_evidence: "Install/start Docker Desktop, Colima, or a compatible Docker context before running this smoke."
    }),
    gate({
      id: "docker-compose-available",
      title: "Docker Compose is available",
      category: "docker-runtime",
      status: dockerComposeAvailable ? "pass" : "blocked",
      evidence: dockerComposeAvailable
        ? compactOutput(input.dockerAvailability.docker_compose.stdout || input.dockerAvailability.docker_compose.stderr)
        : input.dockerAvailability.docker_compose.message || input.dockerAvailability.docker_compose.stderr || "docker compose is unavailable.",
      blocks_local_smoke: !dockerComposeAvailable,
      blocks_docker_upload: !dockerComposeAvailable,
      required_evidence: "A working docker compose command is required for the local candidate smoke."
    }),
    gate({
      id: "admin-runtime-image-built",
      title: "Admin runtime image builds",
      category: "docker-build",
      status: buildRuntimeStatus,
      evidence: input.buildRuntime
        ? `${commandText(input.buildRuntime.command, input.buildRuntime.args)} -> ${input.buildRuntime.ok ? "ok" : input.buildRuntime.message ?? "failed"}`
        : "Image build was not attempted.",
      blocks_local_smoke: buildRuntimeStatus === "fail",
      blocks_docker_upload: buildRuntimeStatus === "fail"
    }),
    gate({
      id: "admin-web-image-built",
      title: "Admin web image builds",
      category: "docker-build",
      status: buildWebStatus,
      evidence: input.buildWeb
        ? `${commandText(input.buildWeb.command, input.buildWeb.args)} -> ${input.buildWeb.ok ? "ok" : input.buildWeb.message ?? "failed"}`
        : "Image build was not attempted.",
      blocks_local_smoke: buildWebStatus === "fail",
      blocks_docker_upload: buildWebStatus === "fail"
    }),
    gate({
      id: "local-compose-up",
      title: "Local compose stack starts",
      category: "compose",
      status: composeUpStatus,
      evidence: input.composeUp
        ? `${commandText(input.composeUp.command, input.composeUp.args)} -> ${input.composeUp.ok ? "ok" : input.composeUp.message ?? "failed"}`
        : "Compose up was not attempted.",
      blocks_local_smoke: composeUpStatus === "fail",
      blocks_docker_upload: composeUpStatus === "fail"
    }),
    gate({
      id: "local-endpoint-probes",
      title: "Local admin web/API probes pass",
      category: "probe",
      status: endpointProbesStatus,
      evidence: input.probes.length > 0
        ? input.probes.map((probe) => `${probe.name}=HTTP ${probe.http_status ?? "n/a"} ${probe.ok ? "ok" : probe.error_code ?? "failed"} ${probe.duration_ms}ms`).join("; ")
        : "Endpoint probes were not attempted.",
      blocks_local_smoke: endpointProbesStatus === "fail",
      blocks_docker_upload: endpointProbesStatus === "fail"
    }),
    gate({
      id: "release-gates-mvp-contract",
      title: "Release gates expose Docker production contract",
      category: "probe",
      status: endpointProbesStatus !== "pass" ? "skipped" : releaseGateMvpReady ? "pass" : "fail",
      evidence: endpointProbesStatus !== "pass"
        ? "Release-gates contract was not evaluated because endpoint probes did not pass."
        : releaseGateMvpReady
          ? "release-gates admin_worker_env_proof requires Docker mode off, disabled standalone workers, and /data/PublicLibrary roots."
          : "release-gates admin_worker_env_proof is missing the MVP mode/worker/root contract.",
      blocks_local_smoke: endpointProbesStatus === "pass" && !releaseGateMvpReady,
      blocks_docker_upload: endpointProbesStatus === "pass" && !releaseGateMvpReady
    }),
    gate({
      id: "admin-worker-env-local-proof",
      title: "Local admin-worker env has safe MVP flags",
      category: "worker-env",
      status: workerEnvStatus,
      evidence: input.workerEnv.command
        ? `mvp=${workerFlags.MIXLAB_ADMIN_DOCKER_MVP_MODE || "missing"}, preprocess=${workerFlags.MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER || "missing"}, publish=${workerFlags.MIXLAB_ENABLE_READY_PUBLISH_WORKER || "missing"}, adminRoot=${workerRoots.MIXLAB_ADMIN_LIBRARY_ROOT || "missing"}, preprocessRoot=${workerRoots.MIXLAB_PREPROCESS_LIBRARY_ROOT || "missing"}`
        : "admin-worker env was not collected.",
      blocks_local_smoke: workerEnvStatus === "fail",
      blocks_docker_upload: workerEnvStatus === "fail"
    }),
    gate({
      id: "local-smoke-not-nas-live-evidence",
      title: "Local smoke is not NAS live release evidence",
      category: "release-boundary",
      status: "blocked",
      evidence: "Passing this local smoke validates a Docker candidate shape only. Docker upload/deploy still requires NAS staging/live-readonly, worker-env proof from the NAS host, Cutter compatibility reports, disk gate, and rollback gate.",
      blocks_local_smoke: false,
      blocks_docker_upload: true,
      required_evidence: "Run the staged/NAS release gates after local Docker smoke passes."
    })
  ];
}

function summarize(gates: LocalSmokeGate[]): LocalSmokeSummary {
  return {
    total: gates.length,
    passed: gates.filter((gateItem) => gateItem.status === "pass").length,
    blocked: gates.filter((gateItem) => gateItem.status === "blocked").length,
    failed: gates.filter((gateItem) => gateItem.status === "fail").length,
    skipped: gates.filter((gateItem) => gateItem.status === "skipped").length,
    local_smoke_blockers: gates
      .filter((gateItem) => gateItem.blocks_local_smoke && gateItem.status !== "pass")
      .map((gateItem) => gateItem.id),
    docker_upload_blockers: gates
      .filter((gateItem) => gateItem.blocks_docker_upload && gateItem.status !== "pass")
      .map((gateItem) => gateItem.id)
  };
}

function buildRunInstructions(webPort: string): string[] {
  return [
    `MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_RUN=1 MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_WEB_PORT=${webPort} npm run validate:admin-docker-local-smoke`,
    "The smoke builds local-only images, starts an isolated local compose stack, probes admin-web and /api/admin/* through nginx, collects admin-worker env, then runs docker compose down.",
    "Do not use this as NAS live evidence. NAS release still needs live-readonly, worker-env proof, Cutter compatibility proof, disk gate, and rollback/staging approval."
  ];
}

function resultSummary(input: {
  localSmokePassed: boolean;
  staticContract: StaticContractReport;
  runRequested: boolean;
  dockerCliAvailable: boolean;
  dockerComposeAvailable: boolean;
  summary: LocalSmokeSummary;
}): AdminDockerLocalSmokeReport["result"] {
  if (input.localSmokePassed) {
    return {
      status: "accepted",
      summary: "Local Docker production smoke passed. This validates the local candidate shape only; Docker upload remains blocked until NAS/staging release gates pass."
    };
  }

  if (!input.staticContract.ok || input.summary.failed > 0) {
    return {
      status: "failed",
      summary: "Local Docker production smoke failed a static, build, compose, endpoint, or worker-env gate. Docker upload remains blocked."
    };
  }

  if (!input.runRequested) {
    return {
      status: "blocked",
      summary: "Local Docker production smoke was not executed because MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_RUN=1 was not set. Static checks still ran."
    };
  }

  if (!input.dockerCliAvailable || !input.dockerComposeAvailable) {
    return {
      status: "blocked",
      summary: "Local Docker production smoke is blocked because Docker CLI/Compose is unavailable on this machine."
    };
  }

  return {
    status: "blocked",
    summary: "Local Docker production smoke is blocked by missing runtime evidence. Docker upload remains blocked."
  };
}

export async function runAdminDockerLocalSmoke(input: RunLocalSmokeInput = {}): Promise<AdminDockerLocalSmokeReport> {
  const env = input.env ?? process.env;
  const cwd = input.cwd ?? process.cwd();
  const now = input.now ?? (() => new Date());
  const generatedAt = input.generated_at ?? now().toISOString();
  const stamp = timestampForFile(new Date(generatedAt));
  const runRequested = env.MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_RUN === "1";
  const webPort = env.MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_WEB_PORT || DEFAULT_WEB_PORT;
  const workRoot = env.MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_WORK_ROOT || DEFAULT_WORK_ROOT;
  const buildSha = env.MIXLAB_BUILD_SHA || "local-docker-smoke";
  const buildVersion = env.MIXLAB_BUILD_VERSION || "admin-docker-production";
  const imageTag = env.MIXLAB_IMAGE_TAG || "local-admin-docker-production";
  const workDir = path.join(workRoot, stamp);
  const publicLibraryHostPath = path.join(workDir, "PublicLibrary");
  const composeFile = path.join(workDir, "docker-compose.yml");
  const webUrl = `http://127.0.0.1:${webPort}/`;
  const commandRunner = input.commandRunner ?? defaultCommandRunner;
  const fetcher = input.fetcher ?? fetch;
  const commands: CommandResult[] = [];
  const staticContract = await evaluateAdminDockerLocalSmokeStaticContract();
  const dockerAvailability = await detectDockerAvailability(commandRunner, cwd, env);
  commands.push(dockerAvailability.docker_cli, dockerAvailability.docker_compose);
  let buildRuntime: CommandResult | null = null;
  let buildWeb: CommandResult | null = null;
  let composeUp: CommandResult | null = null;
  let workerEnvCommand: CommandResult | null = null;
  let probes: LocalSmokeProbeResult[] = [];

  if (runRequested && dockerAvailability.docker_cli.ok && dockerAvailability.docker_compose.ok && staticContract.ok) {
    await mkdir(publicLibraryHostPath, { recursive: true });
    await writeFile(composeFile, buildLocalCompose({
      publicLibraryHostPath: path.resolve(cwd, publicLibraryHostPath),
      webPort,
      runtimeImage: LOCAL_RUNTIME_IMAGE,
      webImage: LOCAL_WEB_IMAGE,
      buildSha,
      buildVersion,
      imageTag
    }));

    buildRuntime = await commandRunner("docker", [
      "build",
      "-f",
      "docker/admin-runtime.Dockerfile",
      "-t",
      LOCAL_RUNTIME_IMAGE,
      "--build-arg",
      `MIXLAB_ADMIN_DOCKER_MVP_MODE=${EXPECTED_MVP_MODE}`,
      "--build-arg",
      `MIXLAB_BUILD_SHA=${buildSha}`,
      "--build-arg",
      `MIXLAB_BUILD_VERSION=${buildVersion}`,
      "--build-arg",
      `MIXLAB_IMAGE_TAG=${imageTag}`,
      "."
    ], {
      cwd,
      env,
      timeout_ms: 10 * 60_000
    });
    commands.push(buildRuntime);

    if (buildRuntime.ok) {
      buildWeb = await commandRunner("docker", [
        "build",
        "-f",
        "docker/admin-web.Dockerfile",
        "-t",
        LOCAL_WEB_IMAGE,
        "--build-arg",
        `MIXLAB_ADMIN_DOCKER_MVP_MODE=${EXPECTED_MVP_MODE}`,
        "--build-arg",
        `MIXLAB_BUILD_SHA=${buildSha}`,
        "--build-arg",
        `MIXLAB_BUILD_VERSION=${buildVersion}`,
        "--build-arg",
        `MIXLAB_IMAGE_TAG=${imageTag}`,
        "."
      ], {
        cwd,
        env,
        timeout_ms: 10 * 60_000
      });
      commands.push(buildWeb);
    }

    if (buildRuntime.ok && buildWeb?.ok) {
      try {
        composeUp = await commandRunner("docker", [
          "compose",
          "-f",
          composeFile,
          "up",
          "-d"
        ], {
          cwd,
          env,
          timeout_ms: 2 * 60_000
        });
        commands.push(composeUp);

        if (composeUp.ok) {
          probes = await waitForProbeSet(fetcher, webUrl);
          workerEnvCommand = await commandRunner("docker", [
            "compose",
            "-f",
            composeFile,
            "exec",
            "-T",
            "admin-worker",
            "env"
          ], {
            cwd,
            env,
            timeout_ms: 30_000
          });
          commands.push(workerEnvCommand);
        }
      } finally {
        const composeDown = await commandRunner("docker", [
          "compose",
          "-f",
          composeFile,
          "down",
          "--remove-orphans"
        ], {
          cwd,
          env,
          timeout_ms: 60_000
        });
        commands.push(composeDown);
      }
    }
  }

  const workerEnv = workerEnvFromCommand(workerEnvCommand);
  const gates = buildGates({
    runRequested,
    staticContract,
    dockerAvailability,
    buildRuntime,
    buildWeb,
    composeUp,
    probes,
    workerEnv
  });
  const summary = summarize(gates);
  const localSmokePassed = summary.local_smoke_blockers.length === 0;
  const result = resultSummary({
    localSmokePassed,
    staticContract,
    runRequested,
    dockerCliAvailable: dockerAvailability.docker_cli.ok,
    dockerComposeAvailable: dockerAvailability.docker_compose.ok,
    summary
  });

  return {
    schema_version: "1.0",
    generated_at: generatedAt,
    command: input.command ?? process.argv.join(" "),
    mode: "admin-docker-local-smoke",
    run_requested: runRequested,
    local_smoke_passed: localSmokePassed,
    docker_upload_allowed: false,
    nas_live_evidence: false,
    observations: {
      web_url: webUrl,
      work_dir: workDir,
      compose_file: composeFile,
      public_library_host_path: publicLibraryHostPath,
      runtime_image: LOCAL_RUNTIME_IMAGE,
      web_image: LOCAL_WEB_IMAGE,
      docker_cli_available: dockerAvailability.docker_cli.ok,
      docker_compose_available: dockerAvailability.docker_compose.ok,
      static_contract_ok: staticContract.ok
    },
    build_identity: {
      image_tag: imageTag,
      build_sha: buildSha,
      build_version: buildVersion,
      mvp_mode: EXPECTED_MVP_MODE
    },
    static_contract: staticContract,
    commands,
    probes,
    worker_env: workerEnv,
    gates,
    summary,
    result,
    run_instructions: buildRunInstructions(webPort),
    artifacts: null
  };
}

export function renderAdminDockerLocalSmokeMarkdown(report: AdminDockerLocalSmokeReport): string {
  const lines = [
    "# Admin Docker Local Smoke",
    "",
    `Generated: ${report.generated_at}`,
    "",
    `Result: ${report.result.status}`,
    "",
    `Local smoke passed: ${report.local_smoke_passed ? "yes" : "no"}`,
    "",
    `Docker upload allowed: ${report.docker_upload_allowed ? "yes" : "no"}`,
    "",
    `NAS live evidence: ${report.nas_live_evidence ? "yes" : "no"}`,
    "",
    report.result.summary,
    "",
    "## Boundary",
    "",
    "- This is a local Docker candidate smoke only.",
    "- It uses an isolated local library under `.local-dev/admin-docker-local-smoke`.",
    "- It does not contact NAS Docker, restart live containers, write NAS files, publish indexes, or change Cutter protocols.",
    "",
    "## Observations",
    "",
    `- Run requested: ${report.run_requested ? "yes" : "no"}`,
    `- Web URL: ${report.observations.web_url}`,
    `- Work dir: ${report.observations.work_dir}`,
    `- Compose file: ${report.observations.compose_file}`,
    `- Public library host path: ${report.observations.public_library_host_path}`,
    `- Docker CLI available: ${report.observations.docker_cli_available ? "yes" : "no"}`,
    `- Docker Compose available: ${report.observations.docker_compose_available ? "yes" : "no"}`,
    `- Static contract ok: ${report.observations.static_contract_ok ? "yes" : "no"}`,
    "",
    "## Build Identity",
    "",
    `- Image tag: ${report.build_identity.image_tag || "missing"}`,
    `- Build SHA: ${report.build_identity.build_sha || "missing"}`,
    `- Build version: ${report.build_identity.build_version || "missing"}`,
    `- MVP mode: ${report.build_identity.mvp_mode || "missing"}`,
    "",
    "## Static Contract",
    "",
    "| Check | Status | Evidence |",
    "| --- | --- | --- |",
    ...report.static_contract.checks.map((check) => [
      check.id,
      check.status,
      markdownCell(check.evidence)
    ].join(" | ")),
    "",
    "## Probes",
    "",
    report.probes.length > 0
      ? "| Probe | Status | HTTP | Duration | Evidence |"
      : "No endpoint probes were run.",
    ...(report.probes.length > 0
      ? [
        "| --- | --- | --- | --- | --- |",
        ...report.probes.map((probe) => [
          probe.name,
          probe.ok ? "pass" : "fail",
          String(probe.http_status ?? "n/a"),
          `${probe.duration_ms}ms`,
          markdownCell(probe.error_code ? `${probe.error_code}: ${probe.message ?? ""}` : "ok")
        ].join(" | "))
      ]
      : []),
    "",
    "## Worker Env",
    "",
    `- Env collected: ${report.worker_env.command?.ok ? "yes" : "no"}`,
    `- Flags: mvp=${report.worker_env.flags.MIXLAB_ADMIN_DOCKER_MVP_MODE || "missing"}, preprocess=${report.worker_env.flags.MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER || "missing"}, publish=${report.worker_env.flags.MIXLAB_ENABLE_READY_PUBLISH_WORKER || "missing"}`,
    `- Roots: admin=${report.worker_env.library_roots.MIXLAB_ADMIN_LIBRARY_ROOT || "missing"}, preprocess=${report.worker_env.library_roots.MIXLAB_PREPROCESS_LIBRARY_ROOT || "missing"}`,
    "",
    "## Summary",
    "",
    `- Passed: ${report.summary.passed}`,
    `- Blocked: ${report.summary.blocked}`,
    `- Failed: ${report.summary.failed}`,
    `- Skipped: ${report.summary.skipped}`,
    `- Local smoke blockers: ${report.summary.local_smoke_blockers.join(", ") || "none"}`,
    `- Docker upload blockers: ${report.summary.docker_upload_blockers.join(", ") || "none"}`,
    "",
    "## Gates",
    "",
    "| Gate | Category | Status | Blocks Local Smoke | Blocks Docker Upload | Evidence | Required Evidence |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...report.gates.map((gateItem) => [
      gateItem.id,
      gateItem.category,
      gateItem.status,
      gateItem.blocks_local_smoke ? "yes" : "no",
      gateItem.blocks_docker_upload ? "yes" : "no",
      markdownCell(gateItem.evidence),
      markdownCell(gateItem.required_evidence ?? "n/a")
    ].join(" | ")),
    "",
    "## Run Instructions",
    "",
    ...report.run_instructions.map((item) => `- ${item}`),
    "",
    "## Artifacts",
    "",
    `- JSON: ${report.artifacts?.json_path ?? "not written"}`,
    `- Markdown: ${report.artifacts?.markdown_path ?? "not written"}`,
    ""
  ];

  return `${lines.join("\n")}\n`;
}

async function writeReport(report: AdminDockerLocalSmokeReport, outputDir: string): Promise<AdminDockerLocalSmokeReport> {
  const timestamp = timestampForFile(new Date(report.generated_at));
  const jsonPath = path.join(outputDir, `admin-docker-local-smoke-${timestamp}.json`);
  const markdownPath = path.join(outputDir, `admin-docker-local-smoke-${timestamp}.md`);
  const reportWithArtifacts: AdminDockerLocalSmokeReport = {
    ...report,
    artifacts: {
      json_path: jsonPath,
      markdown_path: markdownPath
    }
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(reportWithArtifacts, null, 2)}\n`);
  await writeFile(markdownPath, renderAdminDockerLocalSmokeMarkdown(reportWithArtifacts));

  return reportWithArtifacts;
}

export function shouldFailAdminDockerLocalSmokeCommand(
  report: AdminDockerLocalSmokeReport,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_REQUIRE_PASS === "1" && !report.local_smoke_passed;
}

async function main(): Promise<void> {
  const outputDir = process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
  const report = await runAdminDockerLocalSmoke();
  const reportWithArtifacts = await writeReport(report, outputDir);

  console.log(JSON.stringify(reportWithArtifacts, null, 2));
  if (shouldFailAdminDockerLocalSmokeCommand(reportWithArtifacts)) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
