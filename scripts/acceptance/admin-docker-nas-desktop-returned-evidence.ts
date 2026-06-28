import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ARTIFACT_DIR = "docs/acceptance/artifacts";
const DEFAULT_LIBRARY_ROOT = "/data/PublicLibrary";

interface DesktopContainer {
  name?: string;
  image?: string;
  environment?: Record<string, string>;
}

interface DesktopReadonlyReport {
  generated_at?: string;
  mode?: string;
  containers?: DesktopContainer[];
}

interface LiveReadonlyReport {
  observed?: {
    library_status?: Record<string, unknown>;
  };
  requests?: Array<Record<string, unknown>>;
}

function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function splitImageReference(reference: string): { repository: string; tag: string } {
  const withoutDigest = reference.split("@")[0] ?? "";
  const lastSlash = withoutDigest.lastIndexOf("/");
  const lastColon = withoutDigest.lastIndexOf(":");

  if (lastColon === -1 || lastColon < lastSlash) {
    return { repository: withoutDigest, tag: "" };
  }

  return {
    repository: withoutDigest.slice(0, lastColon),
    tag: withoutDigest.slice(lastColon + 1)
  };
}

function serviceFromName(name: string): "admin-web" | "admin-api" | "admin-worker" | "" {
  if (name.includes("admin-web")) {
    return "admin-web";
  }
  if (name.includes("admin-api")) {
    return "admin-api";
  }
  if (name.includes("admin-worker")) {
    return "admin-worker";
  }
  return "";
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function latestArtifact(prefix: string, artifactDir = DEFAULT_ARTIFACT_DIR): Promise<string> {
  const files = await readdir(artifactDir);
  const candidates = files
    .filter((file) => file.startsWith(prefix) && file.endsWith(".json"))
    .sort();

  if (candidates.length === 0) {
    throw new Error(`No ${prefix}*.json artifact found in ${artifactDir}`);
  }

  return path.join(artifactDir, candidates[candidates.length - 1] ?? "");
}

async function optionalLatestArtifact(prefix: string, artifactDir = DEFAULT_ARTIFACT_DIR): Promise<string> {
  const files = await readdir(artifactDir);
  const candidates = files
    .filter((file) => file.startsWith(prefix) && file.endsWith(".json"))
    .sort();

  return candidates.length === 0 ? "" : path.join(artifactDir, candidates[candidates.length - 1] ?? "");
}

function adminContainers(report: DesktopReadonlyReport): DesktopContainer[] {
  return (report.containers ?? [])
    .filter((container) => serviceFromName(container.name ?? ""));
}

function imageTagFromContainers(containers: DesktopContainer[]): string {
  const tags = [...new Set(containers
    .map((container) => splitImageReference(container.image ?? "").tag)
    .filter(Boolean))];

  return tags.length === 1 ? tags[0] ?? "" : "";
}

function currentInspectJson(containers: DesktopContainer[]): string {
  const rows = containers
    .map((container) => {
      const name = container.name ?? "";
      const service = serviceFromName(name);
      return {
        Name: name.startsWith("/") ? name : `/${name}`,
        Config: {
          Image: container.image ?? "",
          Labels: {
            "com.docker.compose.service": service
          }
        }
      };
    })
    .sort((a, b) => String(a.Config.Labels["com.docker.compose.service"]).localeCompare(String(b.Config.Labels["com.docker.compose.service"])));

  return `${JSON.stringify(rows, null, 2)}\n`;
}

function envValue(container: DesktopContainer, key: string): string {
  return container.environment?.[key] ?? "";
}

function workerEnv(container: DesktopContainer): string {
  return [
    `MIXLAB_ADMIN_DOCKER_MVP_MODE=${envValue(container, "MIXLAB_ADMIN_DOCKER_MVP_MODE")}`,
    `MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=${envValue(container, "MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER")}`,
    `MIXLAB_ENABLE_READY_PUBLISH_WORKER=${envValue(container, "MIXLAB_ENABLE_READY_PUBLISH_WORKER")}`
  ].join("\n") + "\n";
}

function workerInspectJson(container: DesktopContainer): string {
  const rows = [
    {
      Name: container.name?.startsWith("/") ? container.name : `/${container.name ?? ""}`,
      Config: {
        Image: container.image ?? "",
        Env: [
          `MIXLAB_ADMIN_DOCKER_MVP_MODE=${envValue(container, "MIXLAB_ADMIN_DOCKER_MVP_MODE")}`,
          `MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=${envValue(container, "MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER")}`,
          `MIXLAB_ENABLE_READY_PUBLISH_WORKER=${envValue(container, "MIXLAB_ENABLE_READY_PUBLISH_WORKER")}`,
          `MIXLAB_ADMIN_LIBRARY_ROOT=${envValue(container, "MIXLAB_ADMIN_LIBRARY_ROOT")}`,
          `MIXLAB_PREPROCESS_LIBRARY_ROOT=${envValue(container, "MIXLAB_PREPROCESS_LIBRARY_ROOT")}`
        ]
      }
    }
  ];

  return `${JSON.stringify(rows, null, 2)}\n`;
}

function liveLibraryStatus(report: LiveReadonlyReport): Record<string, unknown> {
  const direct = report.observed?.library_status;
  if (isRecord(direct)) {
    return direct;
  }

  const request = (report.requests ?? []).find((item) => item.name === "library_status");
  const data = asRecord(request?.data);
  if (Object.keys(data).length > 0) {
    return data;
  }

  return {};
}

function liveDashboardDisk(report: LiveReadonlyReport): Record<string, unknown> {
  const request = (report.requests ?? []).find((item) => item.name === "dashboard_metrics");
  const data = asRecord(request?.data);
  const runtimeLoad = asRecord(data.runtime_load);
  return asRecord(runtimeLoad.disk);
}

function diskProofJson(input: {
  live: LiveReadonlyReport | null;
  generatedAt: string;
}): string {
  const status = input.live ? liveLibraryStatus(input.live) : {};
  const dashboardDisk = input.live ? liveDashboardDisk(input.live) : {};
  const totalBytes = asNumber(status.disk_total_bytes);
  const availableBytes = asNumber(status.disk_available_bytes);
  const usedBytes = totalBytes !== null && availableBytes !== null ? totalBytes - availableBytes : null;
  const computedUsagePercent = totalBytes && usedBytes !== null ? Math.round((usedBytes / totalBytes) * 1000) / 10 : null;
  const usagePercent = asNumber(dashboardDisk.usage_percent) ?? computedUsagePercent;

  const check = (id: string, service: string) => ({
    id,
    scope: "container",
    service,
    path: DEFAULT_LIBRARY_ROOT,
    filesystem: "nas-desktop-live-readonly-library-status",
    total_bytes: totalBytes,
    used_bytes: usedBytes,
    available_bytes: availableBytes,
    usage_percent: usagePercent
  });

  return `${JSON.stringify({
    schema_version: "1.0",
    mode: "admin-docker-nas-release-inputs-collector",
    collected_at: input.generatedAt,
    expected_library_root: DEFAULT_LIBRARY_ROOT,
    thresholds: {
      attention_usage_percent: 87,
      block_usage_percent: 92
    },
    checks: [
      check("admin-api-library-root", "admin-api"),
      check("admin-worker-library-root", "admin-worker")
    ]
  }, null, 2)}\n`;
}

function readme(input: {
  desktopReportPath: string;
  liveReportPath: string;
}): string {
  return `# Admin Docker NAS Release Inputs From Desktop Readonly

This directory is generated from a Playwright-observed NAS Docker Desktop
readonly report, not from a host-level docker compose collector.

Source desktop report:
${input.desktopReportPath}

Source live-readonly report:
${input.liveReportPath || "<not provided>"}

Safety rules:
- This evidence must not approve Docker upload or deploy by itself.
- Do not include NAS passwords, cookies, tokens, API keys, or full Docker inspect output.
- Use this path only to convert already-observed desktop/container facts into
  the same sanitized file shape consumed by the existing local validators.
- Positive release approval still requires the normal gates to pass.
`;
}

function manifest(input: {
  generatedAt: string;
}): string {
  const files = [
    "admin-docker-current.env",
    "admin-docker-current.inspect.json",
    "admin-worker.env",
    "admin-worker.inspect.json",
    "admin-docker-disk-proof.json",
    "README.md"
  ];

  const lines = [
    "schema_version=1.0",
    "mode=admin-docker-nas-release-inputs-collector",
    `collected_at=${input.generatedAt}`,
    "push_execution_allowed=false",
    "docker_deploy_allowed=false",
    "nas_writes_allowed=false",
    "worker_start_allowed=false",
    "secret_sanitization=sanitized-only",
    "forbidden_full_env=true",
    "forbidden_full_docker_inspect=true",
    "forbidden_secrets=true"
  ];

  for (const file of files) {
    lines.push(`file=${file} present=true size_bytes=deferred`);
  }
  lines.push("manifest_file=MANIFEST.txt");

  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const generatedAt = new Date().toISOString();
  const timestamp = timestampForFile(new Date(generatedAt));
  const desktopReportPath = process.env.MIXLAB_ADMIN_DOCKER_NAS_DESKTOP_READONLY_REPORT
    ?? await latestArtifact("admin-docker-nas-desktop-readonly");
  const liveReportPath = process.env.MIXLAB_ADMIN_DOCKER_LIVE_READONLY_REPORT
    ?? await optionalLatestArtifact("admin-docker-release-live-readonly");
  const outputDir = process.env.MIXLAB_ADMIN_DOCKER_NAS_DESKTOP_RETURNED_DIR
    ?? path.join(DEFAULT_ARTIFACT_DIR, `admin-docker-nas-desktop-returned-evidence-${timestamp}`, "admin-docker-release-inputs");

  const desktopReport = await readJson<DesktopReadonlyReport>(desktopReportPath);
  const liveReport = liveReportPath ? await readJson<LiveReadonlyReport>(liveReportPath) : null;
  const containers = adminContainers(desktopReport);
  const worker = containers.find((container) => serviceFromName(container.name ?? "") === "admin-worker");

  if (containers.length === 0) {
    throw new Error(`No Admin containers found in ${desktopReportPath}`);
  }
  if (!worker) {
    throw new Error(`No admin-worker container found in ${desktopReportPath}`);
  }

  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "admin-docker-current.env"), `MIXLAB_IMAGE_TAG=${imageTagFromContainers(containers)}\n`);
  await writeFile(path.join(outputDir, "admin-docker-current.inspect.json"), currentInspectJson(containers));
  await writeFile(path.join(outputDir, "admin-worker.env"), workerEnv(worker));
  await writeFile(path.join(outputDir, "admin-worker.inspect.json"), workerInspectJson(worker));
  await writeFile(path.join(outputDir, "admin-docker-disk-proof.json"), diskProofJson({ live: liveReport, generatedAt }));
  await writeFile(path.join(outputDir, "README.md"), readme({ desktopReportPath, liveReportPath }));
  await writeFile(path.join(outputDir, "MANIFEST.txt"), manifest({ generatedAt }));

  const summary = {
    mode: "admin-docker-nas-desktop-returned-evidence",
    output_dir: outputDir,
    desktop_report: desktopReportPath,
    live_readonly_report: liveReportPath,
    generated_files: [
      "admin-docker-current.env",
      "admin-docker-current.inspect.json",
      "admin-worker.env",
      "admin-worker.inspect.json",
      "admin-docker-disk-proof.json",
      "README.md",
      "MANIFEST.txt"
    ],
    docker_deploy_allowed: false,
    next_commands: [
      `MIXLAB_ADMIN_DOCKER_NAS_RETURNED_DIR=${outputDir} npm run precheck:admin-docker-nas-returned-evidence`,
      `MIXLAB_ADMIN_DOCKER_NAS_RETURNED_DIR=${outputDir} npm run intake:admin-docker-nas-release-inputs`
    ]
  };

  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error(errorMessage(error));
    process.exit(1);
  });
}
