import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const EXPECTED_TAG_REPOS = {
  "admin-api": "ghcr.io/alin155/mixlab-admin-runtime",
  "admin-worker": "ghcr.io/alin155/mixlab-admin-runtime",
  "admin-web": "ghcr.io/alin155/mixlab-admin-web"
} as const;

type AdminDockerService = keyof typeof EXPECTED_TAG_REPOS;
type GateStatus = "pass" | "blocked";
type GateCategory = "safety" | "evidence" | "image" | "rollback";

interface ImageProofGate {
  id: string;
  title: string;
  category: GateCategory;
  status: GateStatus;
  evidence: string;
  blocks_release_inputs: boolean;
  required_evidence?: string;
}

interface ImageProofSummary {
  total: number;
  passed: number;
  blocked: number;
  release_input_blockers: string[];
}

interface ImageProofSources {
  env_file: string;
  inspect_json: string;
}

interface ServiceImageObservation {
  service: AdminDockerService;
  container_name: string;
  image_reference: string;
  image_repository: string;
  image_tag: string;
}

export interface AdminDockerNasImageProofReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-docker-nas-image-proof";
  sources: ImageProofSources;
  proof_accepted: boolean;
  docker_deploy_allowed: false;
  observations: {
    env_file_present: boolean;
    inspect_json_present: boolean;
    env_image_tag: string;
    stable_rollback_tag: boolean;
    services: ServiceImageObservation[];
    missing_services: AdminDockerService[];
    inconsistent_tags: string[];
  };
  release_inputs: {
    current_image_tag: string;
    rollback_image_tag: string;
    workflow_inputs: string;
  };
  collection_instructions: string[];
  gates: ImageProofGate[];
  summary: ImageProofSummary;
  result: {
    status: "accepted" | "blocked";
    summary: string;
  };
  artifacts: {
    json_path: string;
    markdown_path: string;
  } | null;
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

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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

function parseInspectJson(rawJson: string): unknown[] {
  if (!rawJson.trim()) {
    return [];
  }

  const parsed = JSON.parse(rawJson) as unknown;
  return Array.isArray(parsed) ? parsed : [parsed];
}

function serviceFromContainer(container: Record<string, unknown>): AdminDockerService | null {
  const labels = asRecord(asRecord(container.Config).Labels);
  const composeService = asString(labels["com.docker.compose.service"]);
  const name = asString(container.Name).replace(/^\/+/, "");
  const candidate = composeService || name;

  for (const service of Object.keys(EXPECTED_TAG_REPOS) as AdminDockerService[]) {
    if (candidate === service || candidate.includes(service)) {
      return service;
    }
  }

  return null;
}

function splitImageReference(reference: string): { repository: string; tag: string } {
  const withoutDigest = reference.split("@")[0] ?? "";
  const lastSlash = withoutDigest.lastIndexOf("/");
  const lastColon = withoutDigest.lastIndexOf(":");

  if (lastColon === -1 || lastColon < lastSlash) {
    return {
      repository: withoutDigest,
      tag: ""
    };
  }

  return {
    repository: withoutDigest.slice(0, lastColon),
    tag: withoutDigest.slice(lastColon + 1)
  };
}

function serviceImagesFromInspect(rawJson: string): ServiceImageObservation[] {
  return parseInspectJson(rawJson)
    .map((item) => asRecord(item))
    .map((container) => {
      const service = serviceFromContainer(container);
      if (!service) {
        return null;
      }

      const config = asRecord(container.Config);
      const imageReference = asString(config.Image) || asString(container.Image);
      const image = splitImageReference(imageReference);

      return {
        service,
        container_name: asString(container.Name).replace(/^\/+/, ""),
        image_reference: imageReference,
        image_repository: image.repository,
        image_tag: image.tag
      };
    })
    .filter((item): item is ServiceImageObservation => item !== null);
}

function requiredCollectionInstructions(): string[] {
  return [
    "On the NAS host, export the current Compose image tag without secrets: cp .env admin-docker-current.env",
    "On the NAS host, export running Admin container image metadata: docker inspect $(docker compose --env-file .env -f docker-compose.yml ps -q admin-web admin-api admin-worker) > admin-docker-current.inspect.json",
    "Copy those files into a local evidence folder and run: MIXLAB_ADMIN_DOCKER_NAS_ENV_FILE=<path>/admin-docker-current.env MIXLAB_ADMIN_DOCKER_NAS_INSPECT_JSON=<path>/admin-docker-current.inspect.json npm run validate:admin-docker-nas-image-proof",
    "Do not use MIXLAB_IMAGE_TAG=latest as rollback evidence; the GitHub push updates latest and makes it unsafe for rollback."
  ];
}

function gate(input: ImageProofGate): ImageProofGate {
  return input;
}

function summarize(gates: ImageProofGate[]): ImageProofSummary {
  const releaseInputBlockers = gates
    .filter((item) => item.blocks_release_inputs && item.status !== "pass")
    .map((item) => item.id);

  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    release_input_blockers: releaseInputBlockers
  };
}

function missingServices(services: ServiceImageObservation[]): AdminDockerService[] {
  const seen = new Set(services.map((item) => item.service));

  return (Object.keys(EXPECTED_TAG_REPOS) as AdminDockerService[]).filter((service) => !seen.has(service));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function stableRollbackTag(tag: string): boolean {
  return Boolean(tag && tag !== "latest" && !tag.includes("<") && !tag.includes(">"));
}

export function buildAdminDockerNasImageProofReport(input: {
  generated_at: string;
  command: string;
  env_file_path?: string;
  env_file_raw?: string;
  inspect_json_path?: string;
  inspect_json_raw?: string;
}): AdminDockerNasImageProofReport {
  const envValues = parseEnvLines(input.env_file_raw ?? "");
  const envImageTag = envValues.get("MIXLAB_IMAGE_TAG") ?? "";
  const services = serviceImagesFromInspect(input.inspect_json_raw ?? "");
  const missing = missingServices(services);
  const serviceTags = unique(services.map((item) => item.image_tag));
  const allTags = unique([envImageTag, ...serviceTags]);
  const stableTag = stableRollbackTag(envImageTag);
  const repositoriesMatch = services.every((item) => item.image_repository === EXPECTED_TAG_REPOS[item.service]);
  const allTagsMatch = envImageTag !== "" && allTags.length === 1;
  const envFilePresent = Boolean(input.env_file_path && input.env_file_raw);
  const inspectJsonPresent = Boolean(input.inspect_json_path && input.inspect_json_raw);
  const gates = [
    gate({
      id: "nas-image-proof-no-side-effects",
      title: "NAS image proof reads exported files only",
      category: "safety",
      status: "pass",
      evidence: "This report reads an exported .env and docker inspect JSON only; it does not contact NAS, Docker, GHCR, GitHub, Admin API, or Cutter API.",
      blocks_release_inputs: false
    }),
    gate({
      id: "nas-env-file-provided",
      title: "NAS Compose env file is provided",
      category: "evidence",
      status: envFilePresent ? "pass" : "blocked",
      evidence: input.env_file_path || "No MIXLAB_ADMIN_DOCKER_NAS_ENV_FILE path provided.",
      blocks_release_inputs: !envFilePresent,
      required_evidence: "Export the current NAS Compose .env before staging so MIXLAB_IMAGE_TAG can be used as the rollback input."
    }),
    gate({
      id: "nas-inspect-json-provided",
      title: "NAS Docker inspect JSON is provided",
      category: "evidence",
      status: inspectJsonPresent ? "pass" : "blocked",
      evidence: input.inspect_json_path || "No MIXLAB_ADMIN_DOCKER_NAS_INSPECT_JSON path provided.",
      blocks_release_inputs: !inspectJsonPresent,
      required_evidence: "Export docker inspect JSON for admin-web, admin-api, and admin-worker before staging."
    }),
    gate({
      id: "current-tag-stable-for-rollback",
      title: "Current image tag is stable for rollback",
      category: "rollback",
      status: stableTag ? "pass" : "blocked",
      evidence: `MIXLAB_IMAGE_TAG=${envImageTag || "missing"}`,
      blocks_release_inputs: !stableTag,
      required_evidence: "MIXLAB_IMAGE_TAG must be a stable tag such as a Git SHA, not latest, because push_images=true updates latest."
    }),
    gate({
      id: "all-admin-services-present",
      title: "All Admin Docker services are present",
      category: "image",
      status: missing.length === 0 ? "pass" : "blocked",
      evidence: missing.length === 0 ? "admin-web, admin-api, and admin-worker were found." : `Missing services: ${missing.join(", ")}`,
      blocks_release_inputs: missing.length > 0,
      required_evidence: "The inspect JSON must include running admin-web, admin-api, and admin-worker containers."
    }),
    gate({
      id: "admin-image-repositories-match",
      title: "Admin service images use expected GHCR repositories",
      category: "image",
      status: repositoriesMatch && services.length > 0 ? "pass" : "blocked",
      evidence: services.map((item) => `${item.service}=${item.image_repository || "missing"}`).join(", ") || "No services parsed.",
      blocks_release_inputs: !(repositoriesMatch && services.length > 0),
      required_evidence: "admin-api/admin-worker must use mixlab-admin-runtime and admin-web must use mixlab-admin-web."
    }),
    gate({
      id: "admin-image-tags-consistent",
      title: "Admin service image tags match the Compose tag",
      category: "rollback",
      status: allTagsMatch ? "pass" : "blocked",
      evidence: `env=${envImageTag || "missing"}, service_tags=${serviceTags.join(", ") || "missing"}`,
      blocks_release_inputs: !allTagsMatch,
      required_evidence: "MIXLAB_IMAGE_TAG and running admin-web/admin-api/admin-worker image tags must match before using the tag as rollback input."
    })
  ];
  const summary = summarize(gates);
  const proofAccepted = summary.release_input_blockers.length === 0;
  const releaseTag = proofAccepted ? envImageTag : "";

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-docker-nas-image-proof",
    sources: {
      env_file: input.env_file_path ?? "",
      inspect_json: input.inspect_json_path ?? ""
    },
    proof_accepted: proofAccepted,
    docker_deploy_allowed: false,
    observations: {
      env_file_present: envFilePresent,
      inspect_json_present: inspectJsonPresent,
      env_image_tag: envImageTag,
      stable_rollback_tag: stableTag,
      services,
      missing_services: missing,
      inconsistent_tags: allTagsMatch ? [] : allTags
    },
    release_inputs: {
      current_image_tag: releaseTag,
      rollback_image_tag: releaseTag,
      workflow_inputs: releaseTag ? `-f current_image_tag=${releaseTag} -f rollback_image_tag=${releaseTag}` : ""
    },
    collection_instructions: requiredCollectionInstructions(),
    gates,
    summary,
    result: {
      status: proofAccepted ? "accepted" : "blocked",
      summary: proofAccepted
        ? "NAS current Admin Docker image tag is stable and can be used for both current_image_tag and rollback_image_tag."
        : "NAS current Admin Docker image proof is blocked until stable current/rollback image evidence is exported."
    },
    artifacts: null
  };
}

export function toMarkdown(report: AdminDockerNasImageProofReport): string {
  const lines = [
    "# Admin Docker NAS Image Proof",
    "",
    `Generated: ${report.generated_at}`,
    `Mode: ${report.mode}`,
    `Result: ${report.result.status}`,
    `Proof accepted: ${report.proof_accepted ? "yes" : "no"}`,
    "Docker deploy allowed: no",
    "",
    "## Release Inputs",
    "",
    `- current_image_tag: ${report.release_inputs.current_image_tag || "<blocked>"}`,
    `- rollback_image_tag: ${report.release_inputs.rollback_image_tag || "<blocked>"}`,
    `- workflow inputs: ${report.release_inputs.workflow_inputs || "<blocked>"}`,
    "",
    "## Observations",
    "",
    `- Env file: ${report.sources.env_file || "<missing>"}`,
    `- Inspect JSON: ${report.sources.inspect_json || "<missing>"}`,
    `- Env MIXLAB_IMAGE_TAG: ${report.observations.env_image_tag || "<missing>"}`,
    `- Stable rollback tag: ${report.observations.stable_rollback_tag ? "yes" : "no"}`,
    `- Missing services: ${report.observations.missing_services.join(", ") || "none"}`,
    `- Inconsistent tags: ${report.observations.inconsistent_tags.join(", ") || "none"}`,
    "",
    "| Service | Container | Image | Repository | Tag |",
    "| --- | --- | --- | --- | --- |",
    ...report.observations.services.map((item) => `| ${item.service} | ${item.container_name || "<missing>"} | ${item.image_reference || "<missing>"} | ${item.image_repository || "<missing>"} | ${item.image_tag || "<missing>"} |`),
    "",
    "## Gates",
    "",
    "| Gate | Category | Status | Blocks release inputs | Evidence |",
    "| --- | --- | --- | --- | --- |",
    ...report.gates.map((item) => `| ${item.id} | ${item.category} | ${item.status} | ${item.blocks_release_inputs ? "yes" : "no"} | ${item.evidence.replace(/\|/g, "/")} |`),
    "",
    "## Collection Instructions",
    "",
    ...report.collection_instructions.map((item) => `- ${item}`),
    "",
    "## Artifacts",
    "",
    `- JSON: ${report.artifacts?.json_path ?? "<not written>"}`,
    `- Markdown: ${report.artifacts?.markdown_path ?? "<not written>"}`,
    ""
  ];

  return lines.join("\n");
}

async function optionalRead(filePath: string | undefined): Promise<string> {
  return filePath ? await readFile(filePath, "utf8") : "";
}

export async function runAdminDockerNasImageProof(input: {
  env_file_path?: string;
  inspect_json_path?: string;
  output_dir?: string;
  generated_at?: string;
  command?: string;
}): Promise<AdminDockerNasImageProofReport> {
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  const report = buildAdminDockerNasImageProofReport({
    generated_at: generatedAt,
    command: input.command ?? process.argv.join(" "),
    env_file_path: input.env_file_path,
    env_file_raw: await optionalRead(input.env_file_path),
    inspect_json_path: input.inspect_json_path,
    inspect_json_raw: await optionalRead(input.inspect_json_path)
  });
  const timestamp = timestampForFile(new Date(generatedAt));
  const jsonPath = path.join(outputDir, `admin-docker-nas-image-proof-${timestamp}.json`);
  const markdownPath = path.join(outputDir, `admin-docker-nas-image-proof-${timestamp}.md`);
  const reportWithArtifacts: AdminDockerNasImageProofReport = {
    ...report,
    artifacts: {
      json_path: jsonPath,
      markdown_path: markdownPath
    }
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(reportWithArtifacts, null, 2)}\n`);
  await writeFile(markdownPath, toMarkdown(reportWithArtifacts));

  return reportWithArtifacts;
}

async function main(): Promise<void> {
  const report = await runAdminDockerNasImageProof({
    env_file_path: process.env.MIXLAB_ADMIN_DOCKER_NAS_ENV_FILE ?? process.argv[2],
    inspect_json_path: process.env.MIXLAB_ADMIN_DOCKER_NAS_INSPECT_JSON ?? process.argv[3],
    output_dir: process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR,
    command: process.argv.join(" ")
  });

  console.log(JSON.stringify({
    mode: report.mode,
    status: report.result.status,
    proof_accepted: report.proof_accepted,
    docker_deploy_allowed: report.docker_deploy_allowed,
    current_image_tag: report.release_inputs.current_image_tag,
    rollback_image_tag: report.release_inputs.rollback_image_tag,
    release_input_blockers: report.summary.release_input_blockers,
    json_path: report.artifacts?.json_path,
    markdown_path: report.artifacts?.markdown_path
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
