import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_ARTIFACT_DIR = "docs/acceptance/artifacts";
const DEFAULT_RUNNER_BASE_URL = "http://192.168.1.20:3799";
const DEFAULT_EXPECTED_READY_COUNT = 10471;
const DEFAULT_EXPECTED_RELEASE_VERSION = "v010471";

type GateStatus = "pass" | "blocked";
type GateCategory = "safety" | "input" | "runner" | "proof";

interface PlanGate {
  id: string;
  title: string;
  category: GateCategory;
  status: GateStatus;
  evidence: string;
  blocks_plan_ready: boolean;
  required_evidence?: string;
}

interface PlanRequest {
  order: number;
  suite: "windows_acceptance" | "real_cut_smoke" | "desktop_ui_screenshot_smoke";
  purpose: string;
  method: "POST";
  endpoint: string;
  body: Record<string, unknown>;
  report_path_placeholder: string;
}

interface PlanSummary {
  total: number;
  passed: number;
  blocked: number;
  plan_blockers: string[];
}

export interface AdminCutterStagedProofPlanReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-cutter-staged-proof-plan";
  plan_ready: boolean;
  docker_upload_allowed: false;
  run_policy: {
    plan_only: true;
    windows_runner_touched: false;
    nas_runtime_touched: false;
    docker_touched: false;
    cutter_protocol_changed: false;
    secrets_recorded: false;
  };
  inputs: {
    runner_base_url: string;
    candidate_image_tag: string;
    expected_ready_count: number;
    expected_release_version: string;
    real_cut_query: string;
    include_desktop_screenshot: boolean;
  };
  request_templates: PlanRequest[];
  command_templates: {
    preflight: string[];
    start_runs: string[];
    poll_reports: string[];
    validate_proof: string;
  };
  gates: PlanGate[];
  summary: PlanSummary;
  next_actions: string[];
  result: {
    status: "ready-for-staged-cutter-proof" | "blocked";
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

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function gate(input: PlanGate): PlanGate {
  return input;
}

function summarize(gates: PlanGate[]): PlanSummary {
  const blockers = gates
    .filter((item) => item.blocks_plan_ready && item.status !== "pass")
    .map((item) => item.id);

  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    plan_blockers: blockers
  };
}

function runnerBaseIsMacReachable(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return host !== "127.0.0.1" && host !== "localhost" && host !== "::1";
  } catch {
    return false;
  }
}

function placeholderAuthOptions(): Record<string, unknown> {
  return {
    auth_headers: {
      device_id: "<approved-cutter-device-id>",
      session_token: "<approved-cutter-session-token>"
    }
  };
}

function requestTemplates(input: {
  runner_base_url: string;
  real_cut_query: string;
  include_desktop_screenshot: boolean;
}): PlanRequest[] {
  const baseOptions = placeholderAuthOptions();
  const requests: PlanRequest[] = [
    {
      order: 1,
      suite: "windows_acceptance",
      purpose: "Prove Cutter public library, search, transcript detail, reviewed auth, and cache remain compatible with the staged Admin Docker candidate.",
      method: "POST",
      endpoint: `${input.runner_base_url}/runs`,
      body: {
        suite: "windows_acceptance",
        options: baseOptions
      },
      report_path_placeholder: "<share_root>/reports/<windows_acceptance_run_id>/report.json"
    },
    {
      order: 2,
      suite: "real_cut_smoke",
      purpose: "Prove Cutter can still create and complete a real public-library cut after the staged Admin Docker candidate.",
      method: "POST",
      endpoint: `${input.runner_base_url}/runs`,
      body: {
        suite: "real_cut_smoke",
        options: {
          ...baseOptions,
          query: input.real_cut_query,
          cut_mode: "copy",
          max_duration_ms: 1500
        }
      },
      report_path_placeholder: "<share_root>/reports/<real_cut_smoke_run_id>/report.json"
    }
  ];

  if (input.include_desktop_screenshot) {
    requests.push({
      order: 3,
      suite: "desktop_ui_screenshot_smoke",
      purpose: "Optional UI smoke evidence for the staged Cutter desktop state.",
      method: "POST",
      endpoint: `${input.runner_base_url}/runs`,
      body: {
        suite: "desktop_ui_screenshot_smoke",
        options: baseOptions
      },
      report_path_placeholder: "<share_root>/reports/<desktop_ui_screenshot_smoke_run_id>/report.json"
    });
  }

  return requests;
}

function shellSingleQuotedJson(value: unknown): string {
  return `'${JSON.stringify(value).replace(/'/g, "'\\''")}'`;
}

function buildCommandTemplates(input: {
  runner_base_url: string;
  requests: PlanRequest[];
  expected_ready_count: number;
  expected_release_version: string;
  include_desktop_screenshot: boolean;
}): AdminCutterStagedProofPlanReport["command_templates"] {
  const startRuns = input.requests.map((request) => [
    `# Start ${request.suite}; copy the returned run.id into the matching <..._run_id> placeholder below.`,
    `curl --noproxy '*' -sS -X POST '${request.endpoint}' -H 'content-type: application/json' --data-raw ${shellSingleQuotedJson(request.body)}`
  ].join("\n"));
  const pollReports = [
    `curl --noproxy '*' -sS '${input.runner_base_url}/runs/<windows_acceptance_run_id>/report' > '<share_root>/reports/<windows_acceptance_run_id>/report.json'`,
    `curl --noproxy '*' -sS '${input.runner_base_url}/runs/<real_cut_smoke_run_id>/report' > '<share_root>/reports/<real_cut_smoke_run_id>/report.json'`,
    ...(input.include_desktop_screenshot
      ? [`curl --noproxy '*' -sS '${input.runner_base_url}/runs/<desktop_ui_screenshot_smoke_run_id>/report' > '<share_root>/reports/<desktop_ui_screenshot_smoke_run_id>/report.json'`]
      : [])
  ];
  const screenshotEnv = input.include_desktop_screenshot
    ? " \\\nMIXLAB_CUTTER_DESKTOP_SCREENSHOT_REPORT='<share_root>/reports/<desktop_ui_screenshot_smoke_run_id>/report.json'"
    : "";

  return {
    preflight: [
      `curl --noproxy '*' -sS '${input.runner_base_url}/health'`,
      `curl --noproxy '*' -sS '${input.runner_base_url}/version'`,
      "Confirm the staged Admin Docker candidate is already deployed to the staging target and live-readonly/parity probes are rerun before starting these Cutter checks."
    ],
    start_runs: startRuns,
    poll_reports: pollReports,
    validate_proof: [
      `MIXLAB_CUTTER_WINDOWS_ACCEPTANCE_REPORT='<share_root>/reports/<windows_acceptance_run_id>/report.json' \\`,
      `MIXLAB_CUTTER_REAL_CUT_REPORT='<share_root>/reports/<real_cut_smoke_run_id>/report.json' \\`,
      `MIXLAB_CUTTER_EXPECTED_READY_COUNT=${input.expected_ready_count} \\`,
      `MIXLAB_CUTTER_EXPECTED_RELEASE_VERSION=${input.expected_release_version}${screenshotEnv} \\`,
      "npm run validate:admin-cutter-compatibility-proof"
    ].join("\n")
  };
}

function nextActions(input: {
  plan_ready: boolean;
  candidate_image_tag: string;
  expected_ready_count: number;
  expected_release_version: string;
}): string[] {
  if (!input.plan_ready) {
    return [
      "Keep this as plan-only evidence; do not run Windows Runner until the missing inputs are fixed.",
      "Provide a concrete staged candidate image tag and a Mac-reachable Windows Runner URL.",
      "Do not use current production Cutter smoke as staged-candidate proof."
    ];
  }

  return [
    `After the staged Admin Docker candidate ${input.candidate_image_tag} exists, run the preflight commands against the Windows Runner.`,
    "Start windows_acceptance and real_cut_smoke with an already approved Cutter session; do not store auth values in artifacts.",
    `Validate that Cutter still sees at least ${input.expected_ready_count} ready videos and release/index ${input.expected_release_version}.`,
    "Run the generated validate:admin-cutter-compatibility-proof command and archive the accepted proof before Docker MVP final review."
  ];
}

export function buildAdminCutterStagedProofPlanReport(input: {
  generated_at: string;
  command: string;
  runner_base_url?: string;
  candidate_image_tag?: string;
  expected_ready_count?: number;
  expected_release_version?: string;
  real_cut_query?: string;
  include_desktop_screenshot?: boolean;
}): AdminCutterStagedProofPlanReport {
  const runnerBaseUrl = trimTrailingSlash(input.runner_base_url?.trim() || DEFAULT_RUNNER_BASE_URL);
  const candidateImageTag = input.candidate_image_tag?.trim() ?? "";
  const expectedReadyCount = input.expected_ready_count ?? DEFAULT_EXPECTED_READY_COUNT;
  const expectedReleaseVersion = input.expected_release_version?.trim() || DEFAULT_EXPECTED_RELEASE_VERSION;
  const realCutQuery = input.real_cut_query?.trim() || "第一场";
  const includeDesktopScreenshot = input.include_desktop_screenshot ?? true;
  const requests = requestTemplates({
    runner_base_url: runnerBaseUrl,
    real_cut_query: realCutQuery,
    include_desktop_screenshot: includeDesktopScreenshot
  });
  const commands = buildCommandTemplates({
    runner_base_url: runnerBaseUrl,
    requests,
    expected_ready_count: expectedReadyCount,
    expected_release_version: expectedReleaseVersion,
    include_desktop_screenshot: includeDesktopScreenshot
  });
  const runnerReachableFromMac = runnerBaseIsMacReachable(runnerBaseUrl);
  const gates = [
    gate({
      id: "plan-no-side-effects",
      title: "Staged Cutter proof plan has no runtime side effects",
      category: "safety",
      status: "pass",
      evidence: "This report only writes a local plan artifact; it does not contact Windows Runner, Docker, NAS, Admin API, or Cutter API.",
      blocks_plan_ready: false
    }),
    gate({
      id: "candidate-image-tag-provided",
      title: "Staged candidate image tag is explicit",
      category: "input",
      status: candidateImageTag ? "pass" : "blocked",
      evidence: `candidate_image_tag=${candidateImageTag || "missing"}`,
      blocks_plan_ready: !candidateImageTag,
      required_evidence: "Set MIXLAB_DOCKER_TARGET_IMAGE_TAG or provide the candidate image tag from the accepted Admin Docker smoke artifact."
    }),
    gate({
      id: "runner-base-url-mac-reachable",
      title: "Windows Runner URL is Mac-reachable",
      category: "runner",
      status: runnerReachableFromMac ? "pass" : "blocked",
      evidence: `runner_base_url=${runnerBaseUrl}`,
      blocks_plan_ready: !runnerReachableFromMac,
      required_evidence: "Use the Windows LAN address from the environment registry, not Mac localhost."
    }),
    gate({
      id: "expected-ready-count-positive",
      title: "Expected ready count is positive",
      category: "input",
      status: expectedReadyCount > 0 ? "pass" : "blocked",
      evidence: `expected_ready_count=${expectedReadyCount}`,
      blocks_plan_ready: expectedReadyCount <= 0,
      required_evidence: "MVP compatibility proof must assert the current ready baseline."
    }),
    gate({
      id: "expected-release-version-provided",
      title: "Expected release/index version is explicit",
      category: "input",
      status: expectedReleaseVersion ? "pass" : "blocked",
      evidence: `expected_release_version=${expectedReleaseVersion || "missing"}`,
      blocks_plan_ready: !expectedReleaseVersion,
      required_evidence: "Docker staging must prove Cutter release/index did not drift."
    }),
    gate({
      id: "required-suites-planned",
      title: "Required Windows Runner suites are planned",
      category: "proof",
      status: requests.some((item) => item.suite === "windows_acceptance") &&
        requests.some((item) => item.suite === "real_cut_smoke") ? "pass" : "blocked",
      evidence: `suites=${requests.map((item) => item.suite).join(", ")}`,
      blocks_plan_ready: !(requests.some((item) => item.suite === "windows_acceptance") &&
        requests.some((item) => item.suite === "real_cut_smoke")),
      required_evidence: "Plan must include both windows_acceptance and real_cut_smoke."
    }),
    gate({
      id: "auth-values-not-recorded",
      title: "Auth values are not recorded in the plan",
      category: "safety",
      status: "pass",
      evidence: "Request templates contain placeholders for approved Cutter auth headers only.",
      blocks_plan_ready: false
    }),
    gate({
      id: "proof-command-prepared",
      title: "Final compatibility proof command is prepared",
      category: "proof",
      status: commands.validate_proof.includes("validate:admin-cutter-compatibility-proof") ? "pass" : "blocked",
      evidence: "validate:admin-cutter-compatibility-proof command template is present.",
      blocks_plan_ready: !commands.validate_proof.includes("validate:admin-cutter-compatibility-proof"),
      required_evidence: "Plan must end with the existing proof validator."
    })
  ];
  const summary = summarize(gates);
  const planReady = summary.plan_blockers.length === 0;

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-cutter-staged-proof-plan",
    plan_ready: planReady,
    docker_upload_allowed: false,
    run_policy: {
      plan_only: true,
      windows_runner_touched: false,
      nas_runtime_touched: false,
      docker_touched: false,
      cutter_protocol_changed: false,
      secrets_recorded: false
    },
    inputs: {
      runner_base_url: runnerBaseUrl,
      candidate_image_tag: candidateImageTag,
      expected_ready_count: expectedReadyCount,
      expected_release_version: expectedReleaseVersion,
      real_cut_query: realCutQuery,
      include_desktop_screenshot: includeDesktopScreenshot
    },
    request_templates: requests,
    command_templates: commands,
    gates,
    summary,
    next_actions: nextActions({
      plan_ready: planReady,
      candidate_image_tag: candidateImageTag,
      expected_ready_count: expectedReadyCount,
      expected_release_version: expectedReleaseVersion
    }),
    result: {
      status: planReady ? "ready-for-staged-cutter-proof" : "blocked",
      summary: planReady
        ? "Staged Cutter proof plan is ready; it still does not contact Windows Runner or approve Docker upload."
        : "Staged Cutter proof plan is blocked until required inputs are explicit."
    },
    artifacts: null
  };
}

export function toMarkdown(report: AdminCutterStagedProofPlanReport): string {
  const lines = [
    "# Admin Cutter Staged Proof Plan",
    "",
    `Generated: ${report.generated_at}`,
    `Mode: ${report.mode}`,
    `Result: ${report.result.status}`,
    `Plan ready: ${report.plan_ready ? "yes" : "no"}`,
    "Docker upload allowed: no",
    "",
    "This is a plan-only artifact. It does not contact Windows Runner, Docker, NAS, Admin API, or Cutter API; it does not record Cutter auth values.",
    "",
    "## Inputs",
    "",
    `- Runner base URL: ${report.inputs.runner_base_url}`,
    `- Candidate image tag: ${report.inputs.candidate_image_tag || "<missing>"}`,
    `- Expected ready count: ${report.inputs.expected_ready_count}`,
    `- Expected release version: ${report.inputs.expected_release_version}`,
    `- Real cut query: ${report.inputs.real_cut_query}`,
    `- Include desktop screenshot: ${report.inputs.include_desktop_screenshot ? "yes" : "no"}`,
    "",
    "## Request Templates",
    "",
    ...report.request_templates.map((item) => [
      `### ${item.order}. ${item.suite}`,
      "",
      item.purpose,
      "",
      `Endpoint: ${item.method} ${item.endpoint}`,
      "",
      "```json",
      JSON.stringify(item.body, null, 2),
      "```",
      "",
      `Report path: ${item.report_path_placeholder}`,
      ""
    ].join("\n")),
    "## Command Templates",
    "",
    "### Preflight",
    "",
    "```bash",
    ...report.command_templates.preflight,
    "```",
    "",
    "### Start Runs",
    "",
    ...report.command_templates.start_runs.flatMap((item) => ["```bash", item, "```", ""]),
    "### Poll Reports",
    "",
    "```bash",
    ...report.command_templates.poll_reports,
    "```",
    "",
    "### Validate Proof",
    "",
    "```bash",
    report.command_templates.validate_proof,
    "```",
    "",
    "## Gates",
    "",
    "| Gate | Category | Status | Blocks Plan | Evidence | Required Evidence |",
    "| --- | --- | --- | --- | --- | --- |",
    ...report.gates.map((item) => [
      item.id,
      item.category,
      item.status,
      item.blocks_plan_ready ? "yes" : "no",
      item.evidence,
      item.required_evidence ?? "n/a"
    ].join(" | ")),
    "",
    "## Next Actions",
    "",
    ...report.next_actions.map((item) => `- ${item}`),
    "",
    "## Artifacts",
    "",
    `- JSON: ${report.artifacts?.json_path ?? "not written"}`,
    `- Markdown: ${report.artifacts?.markdown_path ?? "not written"}`,
    ""
  ];

  return `${lines.join("\n").trimEnd()}\n`;
}

async function latestArtifact(artifactDir: string, prefix: string): Promise<string> {
  const files = await readdir(artifactDir).catch(() => []);
  const candidates = files
    .filter((file) => file.startsWith(prefix) && file.endsWith(".json"))
    .sort();

  return candidates.length > 0 ? path.join(artifactDir, candidates[candidates.length - 1] ?? "") : "";
}

async function candidateFromReadinessReport(filePath: string): Promise<string> {
  if (!filePath) {
    return "";
  }
  const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  return asString(asRecord(asRecord(parsed).observations).github_candidate_image_tag);
}

export async function runAdminCutterStagedProofPlan(input: {
  output_dir?: string;
  artifact_dir?: string;
  generated_at?: string;
  command?: string;
  runner_base_url?: string;
  candidate_image_tag?: string;
  readiness_report_path?: string;
  expected_ready_count?: number;
  expected_release_version?: string;
  real_cut_query?: string;
  include_desktop_screenshot?: boolean;
}): Promise<AdminCutterStagedProofPlanReport> {
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  const artifactDir = input.artifact_dir ?? DEFAULT_ARTIFACT_DIR;
  const timestamp = timestampForFile(new Date(generatedAt));
  const jsonPath = path.join(outputDir, `admin-cutter-staged-proof-plan-${timestamp}.json`);
  const markdownPath = path.join(outputDir, `admin-cutter-staged-proof-plan-${timestamp}.md`);
  const readinessPath = input.readiness_report_path ?? await latestArtifact(artifactDir, "admin-docker-release-readiness-summary-");
  const candidateFromReadiness = await candidateFromReadinessReport(readinessPath).catch(() => "");
  const report = buildAdminCutterStagedProofPlanReport({
    generated_at: generatedAt,
    command: input.command ?? process.argv.join(" "),
    runner_base_url: input.runner_base_url,
    candidate_image_tag: input.candidate_image_tag || candidateFromReadiness,
    expected_ready_count: input.expected_ready_count,
    expected_release_version: input.expected_release_version,
    real_cut_query: input.real_cut_query,
    include_desktop_screenshot: input.include_desktop_screenshot
  });
  const reportWithArtifacts: AdminCutterStagedProofPlanReport = {
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
  const expectedReadyCount = parsePositiveInt(process.env.MIXLAB_CUTTER_EXPECTED_READY_COUNT, DEFAULT_EXPECTED_READY_COUNT);
  const includeScreenshot = process.env.MIXLAB_CUTTER_INCLUDE_DESKTOP_SCREENSHOT === "0" ? false : true;
  const report = await runAdminCutterStagedProofPlan({
    output_dir: process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR,
    artifact_dir: process.env.MIXLAB_ACCEPTANCE_ARTIFACT_DIR ?? DEFAULT_ARTIFACT_DIR,
    runner_base_url: process.env.MIXLAB_WINDOWS_RUNNER_BASE_URL ?? DEFAULT_RUNNER_BASE_URL,
    candidate_image_tag: process.env.MIXLAB_DOCKER_TARGET_IMAGE_TAG ?? process.env.MIXLAB_DOCKER_CANDIDATE_IMAGE_TAG,
    readiness_report_path: process.env.MIXLAB_ADMIN_DOCKER_RELEASE_READINESS_SUMMARY_REPORT,
    expected_ready_count: expectedReadyCount,
    expected_release_version: process.env.MIXLAB_CUTTER_EXPECTED_RELEASE_VERSION ?? DEFAULT_EXPECTED_RELEASE_VERSION,
    real_cut_query: process.env.MIXLAB_CUTTER_REAL_CUT_QUERY,
    include_desktop_screenshot: includeScreenshot,
    command: process.argv.join(" ")
  });

  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
