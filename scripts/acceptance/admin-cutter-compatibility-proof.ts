import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_EXPECTED_READY_COUNT = 10471;

type GateStatus = "pass" | "blocked" | "not-provided";
type GateCategory = "safety" | "input" | "windows-acceptance" | "real-cut" | "optional-ui";

interface CompatibilityGate {
  id: string;
  title: string;
  category: GateCategory;
  status: GateStatus;
  evidence: string;
  blocks_docker_upload: boolean;
  required_evidence?: string;
}

interface CompatibilitySummary {
  total: number;
  passed: number;
  blocked: number;
  not_provided: number;
  upload_blockers: string[];
}

interface CompatibilitySources {
  windows_acceptance_report: string;
  real_cut_report: string;
  desktop_screenshot_report: string;
}

interface CompatibilityObservations {
  windows_acceptance_status: string;
  runner_version: string;
  auth_mode: string;
  local_trusted: boolean | null;
  available_video_count: number | null;
  returned_count: number | null;
  release_version: string;
  search_mode: string;
  search_returned_count: number | null;
  transcript_character_count: number | null;
  transcript_segment_count: number | null;
  real_cut_status: string;
  real_cut_run_next_status: string;
  real_cut_output_file: string;
  desktop_screenshot_status: string;
  desktop_screenshot_captured_count: number | null;
}

export interface AdminCutterCompatibilityProofReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-cutter-compatibility-proof";
  sources: CompatibilitySources;
  expected_ready_count: number;
  expected_release_version: string;
  proof_accepted: boolean;
  docker_upload_allowed: false;
  observations: CompatibilityObservations;
  gates: CompatibilityGate[];
  summary: CompatibilitySummary;
  result: {
    status: "accepted" | "blocked";
    summary: string;
  };
  collection_instructions: string[];
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

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function gate(input: CompatibilityGate): CompatibilityGate {
  return input;
}

function summarize(gates: CompatibilityGate[]): CompatibilitySummary {
  const uploadBlockers = gates
    .filter((item) => item.blocks_docker_upload && item.status !== "pass")
    .map((item) => item.id);

  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    not_provided: gates.filter((item) => item.status === "not-provided").length,
    upload_blockers: uploadBlockers
  };
}

function getPath(root: unknown, parts: string[]): unknown {
  let current: unknown = root;
  for (const part of parts) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const numberValue = asNumber(value);
    if (numberValue !== null) {
      return numberValue;
    }
  }
  return null;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const stringValue = asString(value);
    if (stringValue) {
      return stringValue;
    }
  }
  return "";
}

function firstBoolean(...values: unknown[]): boolean | null {
  for (const value of values) {
    const booleanValue = asBoolean(value);
    if (booleanValue !== null) {
      return booleanValue;
    }
  }
  return null;
}

function extractWindowsAcceptance(report: unknown): Record<string, unknown> {
  const root = asRecord(report);
  if (isRecord(root.windows_acceptance)) {
    return root.windows_acceptance;
  }

  const installLatestAndSmoke = asRecord(root.install_latest_and_smoke);
  return asRecord(installLatestAndSmoke.windows_acceptance);
}

function extractSearchReturned(search: Record<string, unknown>): number | null {
  return firstNumber(
    search.returned_group_count,
    search.total_hit_count,
    search.returned_count
  );
}

function phaseIsDone(report: Record<string, unknown>, phaseId: string): boolean {
  return asArray(report.phase_timings).some((item) => {
    const phase = asRecord(item);
    return phase.phase_id === phaseId && phase.status === "done";
  });
}

function findCheckBodyData(report: Record<string, unknown>, checkId: string): unknown {
  for (const item of asArray(report.checks)) {
    const check = asRecord(item);
    if (check.id === checkId) {
      return getPath(check, ["body", "data"]);
    }
  }

  return undefined;
}

function buildInstructions(): string[] {
  return [
    "Run Windows Runner windows_acceptance after a staged Docker release candidate exists and archive the report.json path.",
    "Run Windows Runner real_cut_smoke against the same Cutter installation and archive the report.json path.",
    "Pass the reports with MIXLAB_CUTTER_WINDOWS_ACCEPTANCE_REPORT and MIXLAB_CUTTER_REAL_CUT_REPORT.",
    "Optionally pass MIXLAB_CUTTER_DESKTOP_SCREENSHOT_REPORT to attach desktop UI smoke evidence.",
    "This proof only reads archived reports; it must not deploy Docker, mutate NAS data, or change Cutter protocols."
  ];
}

export function buildAdminCutterCompatibilityProofReport(input: {
  generated_at: string;
  command: string;
  windows_acceptance_report_path?: string;
  windows_acceptance_report?: unknown;
  real_cut_report_path?: string;
  real_cut_report?: unknown;
  desktop_screenshot_report_path?: string;
  desktop_screenshot_report?: unknown;
  expected_ready_count?: number;
  expected_release_version?: string;
}): AdminCutterCompatibilityProofReport {
  const expectedReadyCount = input.expected_ready_count ?? DEFAULT_EXPECTED_READY_COUNT;
  const expectedReleaseVersion = input.expected_release_version?.trim() ?? "";
  const windowsRoot = asRecord(input.windows_acceptance_report);
  const windowsAcceptance = extractWindowsAcceptance(input.windows_acceptance_report);
  const appRuntime = asRecord(windowsAcceptance.app_runtime_smoke);
  const realData = asRecord(windowsAcceptance.real_data_smoke);
  const cacheSmoke = asRecord(windowsAcceptance.cache_smoke);
  const runtimeStatus = mergedRecord(
    cacheSmoke.runtime_status,
    findCheckBodyData(cacheSmoke, "runtime_status"),
    appRuntime.runtime_status,
    findCheckBodyData(appRuntime, "runtime_status")
  );
  const sourceLibrary = asRecord(firstObject(realData.source_library, appRuntime.source_library));
  const selectedSearch = asRecord(firstObject(realData.selected_search, asArray(realData.searches)[0]));
  const selectedDetail = asRecord(realData.selected_detail);
  const realCutRoot = asRecord(input.real_cut_report);
  const realCut = asRecord(realCutRoot.real_cut_smoke);
  const desktopRoot = asRecord(input.desktop_screenshot_report);
  const screenshotSmoke = asRecord(desktopRoot.desktop_ui_screenshot_smoke);
  const authMode = firstString(appRuntime.auth_mode, getPath(runtimeStatus, ["auth_mode"]));
  const localTrusted = firstBoolean(appRuntime.local_trusted, getPath(runtimeStatus, ["local_trusted"]));
  const availableVideoCount = firstNumber(
    sourceLibrary.available_video_count,
    runtimeStatus.available_video_count,
    getPath(runtimeStatus, ["release_cache", "ready_video_count"])
  );
  const returnedCount = firstNumber(sourceLibrary.returned_count);
  const releaseVersion = firstString(
    getPath(runtimeStatus, ["release_cache", "active_release_version"]),
    getPath(runtimeStatus, ["release_cache", "source_release_version"]),
    getPath(runtimeStatus, ["search_backend", "index_version"])
  );
  const searchReturnedCount = extractSearchReturned(selectedSearch);
  const transcriptCharacterCount = firstNumber(selectedDetail.transcript_character_count);
  const transcriptSegmentCount = firstNumber(selectedDetail.transcript_segment_count);
  const realCutOutputFile = firstString(realCut.output_file);
  const gates = [
    gate({
      id: "proof-no-side-effects",
      title: "Compatibility proof has no runtime side effects",
      category: "safety",
      status: "pass",
      evidence: "This report reads archived Windows Runner JSON reports only; it does not contact Docker, Windows Runner, NAS, Admin API, or Cutter API.",
      blocks_docker_upload: false
    }),
    gate({
      id: "windows-acceptance-report-provided",
      title: "Windows acceptance report is provided",
      category: "input",
      status: input.windows_acceptance_report_path ? "pass" : "blocked",
      evidence: input.windows_acceptance_report_path || "MIXLAB_CUTTER_WINDOWS_ACCEPTANCE_REPORT is not provided.",
      blocks_docker_upload: !input.windows_acceptance_report_path,
      required_evidence: "Provide an archived windows_acceptance or install_latest_and_smoke report.json."
    }),
    gate({
      id: "windows-acceptance-passed",
      title: "Windows acceptance suite passed",
      category: "windows-acceptance",
      status: windowsRoot.status === "passed" ? "pass" : "blocked",
      evidence: `status=${asString(windowsRoot.status) || "unknown"}`,
      blocks_docker_upload: windowsRoot.status !== "passed",
      required_evidence: "Run Windows Runner windows_acceptance and require status=passed."
    }),
    gate({
      id: "reviewed-auth-mode",
      title: "Cutter uses reviewed auth, not local trusted mode",
      category: "windows-acceptance",
      status: authMode === "reviewed" && localTrusted === false ? "pass" : "blocked",
      evidence: `auth_mode=${authMode || "unknown"}, local_trusted=${localTrusted ?? "unknown"}`,
      blocks_docker_upload: !(authMode === "reviewed" && localTrusted === false),
      required_evidence: "Acceptance report must show auth_mode=reviewed and local_trusted=false."
    }),
    gate({
      id: "public-library-ready-count",
      title: "Cutter sees the expected public-library ready count",
      category: "windows-acceptance",
      status: availableVideoCount !== null && availableVideoCount >= expectedReadyCount ? "pass" : "blocked",
      evidence: `available_video_count=${availableVideoCount ?? "unknown"}, expected_ready_count>=${expectedReadyCount}`,
      blocks_docker_upload: !(availableVideoCount !== null && availableVideoCount >= expectedReadyCount),
      required_evidence: "Cutter runtime/source-library must expose the current ready release count."
    }),
    gate({
      id: "public-library-first-page-readable",
      title: "Public library first page is readable",
      category: "windows-acceptance",
      status: returnedCount !== null && returnedCount > 0 ? "pass" : "blocked",
      evidence: `returned_count=${returnedCount ?? "unknown"}`,
      blocks_docker_upload: !(returnedCount !== null && returnedCount > 0),
      required_evidence: "Cutter source-library first page must return at least one item."
    }),
    gate({
      id: "release-version-matches-expected",
      title: "Release/search version matches expected value when specified",
      category: "windows-acceptance",
      status: expectedReleaseVersion ? (releaseVersion === expectedReleaseVersion ? "pass" : "blocked") : "pass",
      evidence: expectedReleaseVersion
        ? `release_version=${releaseVersion || "unknown"}, expected=${expectedReleaseVersion}`
        : `release_version=${releaseVersion || "not asserted"}`,
      blocks_docker_upload: Boolean(expectedReleaseVersion && releaseVersion !== expectedReleaseVersion),
      required_evidence: "Set MIXLAB_CUTTER_EXPECTED_RELEASE_VERSION only when a specific staged release version must be enforced."
    }),
    gate({
      id: "search-protocol-readable",
      title: "Cutter search returns public-library results",
      category: "windows-acceptance",
      status: searchReturnedCount !== null && searchReturnedCount > 0 ? "pass" : "blocked",
      evidence: `search_mode=${asString(selectedSearch.search_mode) || "unknown"}, returned=${searchReturnedCount ?? "unknown"}`,
      blocks_docker_upload: !(searchReturnedCount !== null && searchReturnedCount > 0),
      required_evidence: "Acceptance report must include a source-search result with returned hits."
    }),
    gate({
      id: "transcript-detail-readable",
      title: "Cutter source detail includes transcript text and segments",
      category: "windows-acceptance",
      status: transcriptCharacterCount !== null && transcriptCharacterCount > 0 && transcriptSegmentCount !== null && transcriptSegmentCount > 0 ? "pass" : "blocked",
      evidence: `transcript_character_count=${transcriptCharacterCount ?? "unknown"}, transcript_segment_count=${transcriptSegmentCount ?? "unknown"}`,
      blocks_docker_upload: !(transcriptCharacterCount !== null && transcriptCharacterCount > 0 && transcriptSegmentCount !== null && transcriptSegmentCount > 0),
      required_evidence: "Acceptance report must prove a public-library source detail transcript remains readable."
    }),
    gate({
      id: "real-cut-report-provided",
      title: "Real cut smoke report is provided",
      category: "input",
      status: input.real_cut_report_path ? "pass" : "blocked",
      evidence: input.real_cut_report_path || "MIXLAB_CUTTER_REAL_CUT_REPORT is not provided.",
      blocks_docker_upload: !input.real_cut_report_path,
      required_evidence: "Provide an archived real_cut_smoke report.json for the same staged candidate."
    }),
    gate({
      id: "real-cut-smoke-passed",
      title: "Real cut smoke suite passed",
      category: "real-cut",
      status: realCutRoot.status === "passed" ? "pass" : "blocked",
      evidence: `status=${asString(realCutRoot.status) || "unknown"}`,
      blocks_docker_upload: realCutRoot.status !== "passed",
      required_evidence: "Run Windows Runner real_cut_smoke and require status=passed."
    }),
    gate({
      id: "real-cut-output-produced",
      title: "Real cut produced an output clip",
      category: "real-cut",
      status: realCut.run_next_status === "done" && realCutOutputFile ? "pass" : "blocked",
      evidence: `run_next_status=${asString(realCut.run_next_status) || "unknown"}, output_file=${realCutOutputFile || "missing"}`,
      blocks_docker_upload: !(realCut.run_next_status === "done" && realCutOutputFile),
      required_evidence: "real_cut_smoke must complete run-next and produce an output_file."
    }),
    gate({
      id: "real-cut-core-phases-done",
      title: "Real cut completed source resolution and media cut phases",
      category: "real-cut",
      status: phaseIsDone(realCut, "resolve_source") && phaseIsDone(realCut, "cut_media") ? "pass" : "blocked",
      evidence: `resolve_source_done=${phaseIsDone(realCut, "resolve_source")}, cut_media_done=${phaseIsDone(realCut, "cut_media")}`,
      blocks_docker_upload: !(phaseIsDone(realCut, "resolve_source") && phaseIsDone(realCut, "cut_media")),
      required_evidence: "real_cut_smoke phase_timings must include resolve_source and cut_media with status=done."
    }),
    gate({
      id: "desktop-screenshot-report-optional",
      title: "Desktop screenshot smoke is attached when available",
      category: "optional-ui",
      status: input.desktop_screenshot_report_path
        ? (desktopRoot.status === "passed" && firstNumber(screenshotSmoke.captured_count) !== null && firstNumber(screenshotSmoke.captured_count)! > 0 ? "pass" : "blocked")
        : "not-provided",
      evidence: input.desktop_screenshot_report_path
        ? `status=${asString(desktopRoot.status) || "unknown"}, captured_count=${firstNumber(screenshotSmoke.captured_count) ?? "unknown"}`
        : "No desktop screenshot report provided; this is optional for protocol compatibility proof.",
      blocks_docker_upload: false,
      required_evidence: "Optional: provide desktop_ui_screenshot_smoke report.json for UI smoke coverage."
    })
  ];
  const summary = summarize(gates);
  const proofAccepted = summary.upload_blockers.length === 0;

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-cutter-compatibility-proof",
    sources: {
      windows_acceptance_report: input.windows_acceptance_report_path ?? "",
      real_cut_report: input.real_cut_report_path ?? "",
      desktop_screenshot_report: input.desktop_screenshot_report_path ?? ""
    },
    expected_ready_count: expectedReadyCount,
    expected_release_version: expectedReleaseVersion,
    proof_accepted: proofAccepted,
    docker_upload_allowed: false,
    observations: {
      windows_acceptance_status: asString(windowsRoot.status),
      runner_version: asString(windowsRoot.runner_version),
      auth_mode: authMode,
      local_trusted: localTrusted,
      available_video_count: availableVideoCount,
      returned_count: returnedCount,
      release_version: releaseVersion,
      search_mode: asString(selectedSearch.search_mode),
      search_returned_count: searchReturnedCount,
      transcript_character_count: transcriptCharacterCount,
      transcript_segment_count: transcriptSegmentCount,
      real_cut_status: asString(realCutRoot.status),
      real_cut_run_next_status: asString(realCut.run_next_status),
      real_cut_output_file: realCutOutputFile,
      desktop_screenshot_status: asString(desktopRoot.status),
      desktop_screenshot_captured_count: firstNumber(screenshotSmoke.captured_count)
    },
    gates,
    summary,
    result: {
      status: proofAccepted ? "accepted" : "blocked",
      summary: proofAccepted
        ? "Cutter compatibility proof is accepted as archived evidence; this still does not allow Docker upload by itself."
        : "Cutter compatibility proof is blocked until required Windows acceptance and real cut evidence is provided and passes."
    },
    collection_instructions: buildInstructions(),
    artifacts: null
  };
}

function firstObject(...values: unknown[]): unknown {
  for (const value of values) {
    if (isRecord(value)) {
      return value;
    }
  }
  return {};
}

function mergedRecord(...values: unknown[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const value of values) {
    if (isRecord(value)) {
      Object.assign(merged, value);
    }
  }
  return merged;
}

export function toMarkdown(report: AdminCutterCompatibilityProofReport): string {
  const lines = [
    "# Admin Cutter Compatibility Proof",
    "",
    `Generated: ${report.generated_at}`,
    "",
    `Mode: ${report.mode}`,
    "",
    `Result: ${report.result.status}`,
    "",
    `Proof accepted: ${report.proof_accepted ? "yes" : "no"}`,
    "",
    `Docker upload allowed: ${report.docker_upload_allowed ? "yes" : "no"}`,
    "",
    "This report only reads archived Windows Runner JSON reports. It does not contact Windows Runner, Docker, NAS, Admin API, or Cutter API; it does not mutate files, deploy containers, enable workers, or change Cutter protocols.",
    "",
    "## Sources",
    "",
    `- Windows acceptance report: ${report.sources.windows_acceptance_report || "not provided"}`,
    `- Real cut report: ${report.sources.real_cut_report || "not provided"}`,
    `- Desktop screenshot report: ${report.sources.desktop_screenshot_report || "not provided"}`,
    "",
    "## Observations",
    "",
    `- Windows acceptance status: ${report.observations.windows_acceptance_status || "unknown"}`,
    `- Runner version: ${report.observations.runner_version || "unknown"}`,
    `- Auth: ${report.observations.auth_mode || "unknown"} / local_trusted=${report.observations.local_trusted ?? "unknown"}`,
    `- Public library: ${report.observations.returned_count ?? "unknown"} / ${report.observations.available_video_count ?? "unknown"} visible`,
    `- Release version: ${report.observations.release_version || "unknown"}`,
    `- Search: ${report.observations.search_mode || "unknown"} / returned=${report.observations.search_returned_count ?? "unknown"}`,
    `- Transcript: chars=${report.observations.transcript_character_count ?? "unknown"}, segments=${report.observations.transcript_segment_count ?? "unknown"}`,
    `- Real cut: status=${report.observations.real_cut_status || "unknown"}, run_next=${report.observations.real_cut_run_next_status || "unknown"}, output=${report.observations.real_cut_output_file || "missing"}`,
    `- Desktop screenshots: status=${report.observations.desktop_screenshot_status || "not provided"}, captured=${report.observations.desktop_screenshot_captured_count ?? "unknown"}`,
    "",
    "## Gates",
    "",
    "| Gate | Category | Status | Blocks Docker Upload | Evidence | Required Evidence |",
    "| --- | --- | --- | --- | --- | --- |",
    ...report.gates.map((item) => [
      item.id,
      item.category,
      item.status,
      item.blocks_docker_upload ? "yes" : "no",
      item.evidence,
      item.required_evidence ?? "n/a"
    ].join(" | ")),
    "",
    "## Collection Instructions",
    "",
    ...report.collection_instructions.map((item) => `- ${item}`),
    "",
    "## Artifacts",
    "",
    `- JSON: ${report.artifacts?.json_path ?? "not written"}`,
    `- Markdown: ${report.artifacts?.markdown_path ?? "not written"}`,
    ""
  ];

  return `${lines.join("\n")}\n`;
}

async function loadOptionalJson(filePath?: string): Promise<unknown> {
  if (!filePath) {
    return undefined;
  }
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`Failed to read JSON report at ${filePath}: ${errorMessage(error)}`);
  }
}

async function main(): Promise<void> {
  const outputDir = process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
  const expectedReadyCount = Number.parseInt(process.env.MIXLAB_CUTTER_EXPECTED_READY_COUNT ?? "", 10);
  const timestamp = timestampForFile();
  const jsonPath = path.join(outputDir, `admin-cutter-compatibility-proof-${timestamp}.json`);
  const markdownPath = path.join(outputDir, `admin-cutter-compatibility-proof-${timestamp}.md`);
  const windowsAcceptancePath = process.env.MIXLAB_CUTTER_WINDOWS_ACCEPTANCE_REPORT;
  const realCutPath = process.env.MIXLAB_CUTTER_REAL_CUT_REPORT;
  const desktopScreenshotPath = process.env.MIXLAB_CUTTER_DESKTOP_SCREENSHOT_REPORT;
  const report = buildAdminCutterCompatibilityProofReport({
    generated_at: new Date().toISOString(),
    command: process.argv.join(" "),
    windows_acceptance_report_path: windowsAcceptancePath,
    windows_acceptance_report: await loadOptionalJson(windowsAcceptancePath),
    real_cut_report_path: realCutPath,
    real_cut_report: await loadOptionalJson(realCutPath),
    desktop_screenshot_report_path: desktopScreenshotPath,
    desktop_screenshot_report: await loadOptionalJson(desktopScreenshotPath),
    expected_ready_count: Number.isFinite(expectedReadyCount) ? expectedReadyCount : DEFAULT_EXPECTED_READY_COUNT,
    expected_release_version: process.env.MIXLAB_CUTTER_EXPECTED_RELEASE_VERSION
  });
  const reportWithArtifacts: AdminCutterCompatibilityProofReport = {
    ...report,
    artifacts: {
      json_path: jsonPath,
      markdown_path: markdownPath
    }
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(reportWithArtifacts, null, 2)}\n`);
  await writeFile(markdownPath, toMarkdown(reportWithArtifacts));
  console.log(JSON.stringify(reportWithArtifacts, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
