import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_TARGET_FILE = "apps/admin-web/src/api.ts";
const TERMS = ["fixture", "fallback", "mock", "legacy", "deprecated", "TODO"] as const;

type ApiHotspotKind =
  | "fixture-client-boundary"
  | "route-loading-fallback-contract"
  | "runtime-fallback-contract"
  | "usage-metrics-field"
  | "test-or-mock-boundary"
  | "legacy-debt-candidate";

type GateStatus = "pass" | "blocked";

interface ApiHotspotOccurrence {
  term: string;
  line: number;
  text: string;
  kind: ApiHotspotKind;
  cleanup_policy: string;
  required_evidence: string[];
}

interface ApiHotspotSummary {
  file: string;
  lines_scanned: number;
  occurrence_count: number;
  fixture_client_boundary_count: number;
  route_loading_fallback_contract_count: number;
  runtime_fallback_contract_count: number;
  usage_metrics_field_count: number;
  test_or_mock_boundary_count: number;
  legacy_debt_candidate_count: number;
}

interface ApiHotspotGate {
  id: string;
  status: GateStatus;
  evidence: string;
  blocks_cleanup: boolean;
}

export interface AdminApiFixtureFallbackClassificationReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-api-fixture-fallback-classification";
  scope: {
    target_file: string;
    terms: string[];
  };
  cleanup_allowed: false;
  classification_ready: boolean;
  summary: ApiHotspotSummary;
  occurrences: ApiHotspotOccurrence[];
  gates: ApiHotspotGate[];
  result: {
    status: "classified" | "blocked";
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

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineCount(text: string): number {
  return text ? text.split(/\r?\n/).length : 0;
}

function normalizeLine(text: string): string {
  return text.trim().replace(/\s+/g, " ").slice(0, 180);
}

function classifyLine(input: { term: string; line: string }): ApiHotspotKind {
  const lower = input.line.toLowerCase();

  if (/fallback_search_count|core_fallback_search_count/.test(input.line)) {
    return "usage-metrics-field";
  }
  if (input.term.toLowerCase() === "fixture") {
    return "fixture-client-boundary";
  }
  if (/\bfallback:\s*[A-Z][A-Za-z0-9_]*(,|\)|$)/.test(input.line)) {
    return "runtime-fallback-contract";
  }
  if (/\bfallback\s*:/.test(input.line)) {
    return "route-loading-fallback-contract";
  }
  if (input.term.toLowerCase() === "fallback") {
    return "runtime-fallback-contract";
  }
  if (lower.includes("mock")) {
    return "test-or-mock-boundary";
  }
  return "legacy-debt-candidate";
}

function cleanupPolicy(kind: ApiHotspotKind): string {
  switch (kind) {
    case "fixture-client-boundary":
      return "Keep until the fixture AdminApiClient boundary is split or typed into its own module with equivalent tests.";
    case "route-loading-fallback-contract":
      return "Keep as route-local loading/error contract unless replaced by the data-loading plan contract and page tests.";
    case "runtime-fallback-contract":
      return "Keep unless the runtime fallback behavior has an explicit replacement and failure-mode tests.";
    case "usage-metrics-field":
      return "Do not rename or remove without backend usage-metrics compatibility and dashboard contract tests.";
    case "test-or-mock-boundary":
      return "Classify as test-only before removal; prove no production client path depends on it.";
    case "legacy-debt-candidate":
      return "Needs manual ownership review before cleanup or extraction.";
  }
}

function requiredEvidence(kind: ApiHotspotKind): string[] {
  const common = [
    "focused Admin Web API tests",
    "typecheck",
    "post-change fixture/fallback classification artifact"
  ];

  switch (kind) {
    case "fixture-client-boundary":
      return [
        "replacement module path or explicit decision to keep fixture client in api.ts",
        "fixture client behavior parity tests",
        ...common
      ];
    case "route-loading-fallback-contract":
      return [
        "route loader/page tests proving local loading and error behavior",
        "data-loading plan contract still names fallback behavior",
        ...common
      ];
    case "runtime-fallback-contract":
      return [
        "failure-mode test proving runtime fallback behavior after refactor",
        ...common
      ];
    case "usage-metrics-field":
      return [
        "backend/admin dashboard compatibility tests for usage metric fields",
        ...common
      ];
    case "test-or-mock-boundary":
      return [
        "evidence the path is test-only and not bundled into runtime client behavior",
        ...common
      ];
    case "legacy-debt-candidate":
      return [
        "line-level ownership decision",
        ...common
      ];
  }
}

function findOccurrences(input: { file: string; text: string }): ApiHotspotOccurrence[] {
  const occurrences: ApiHotspotOccurrence[] = [];
  const lines = input.text.split(/\r?\n/);

  lines.forEach((line, index) => {
    const lowerLine = line.toLowerCase();
    const terms = TERMS.filter((term) => lowerLine.includes(escapeRegExp(term).toLowerCase()));
    for (const term of terms) {
      const kind = classifyLine({ term, line });
      occurrences.push({
        term,
        line: index + 1,
        text: normalizeLine(line),
        kind,
        cleanup_policy: cleanupPolicy(kind),
        required_evidence: requiredEvidence(kind)
      });
    }
  });

  return occurrences.sort((a, b) => a.line - b.line || a.term.localeCompare(b.term));
}

function countKind(occurrences: ApiHotspotOccurrence[], kind: ApiHotspotKind): number {
  return occurrences.filter((item) => item.kind === kind).length;
}

function buildGates(occurrences: ApiHotspotOccurrence[]): ApiHotspotGate[] {
  const fixtureCount = countKind(occurrences, "fixture-client-boundary");
  const fallbackContractCount =
    countKind(occurrences, "route-loading-fallback-contract") +
    countKind(occurrences, "runtime-fallback-contract");
  const debtCount =
    countKind(occurrences, "legacy-debt-candidate") +
    countKind(occurrences, "test-or-mock-boundary");

  return [
    {
      id: "classification-no-side-effects",
      status: "pass",
      evidence: "The classification reads Admin Web api.ts and writes acceptance artifacts only.",
      blocks_cleanup: false
    },
    {
      id: "fixture-client-boundary-classified",
      status: fixtureCount > 0 ? "blocked" : "pass",
      evidence: fixtureCount > 0
        ? `${fixtureCount} fixture-client occurrences need a module ownership decision before extraction or cleanup.`
        : "No fixture-client boundary occurrences were detected.",
      blocks_cleanup: fixtureCount > 0
    },
    {
      id: "fallback-contracts-preserved",
      status: fallbackContractCount > 0 ? "blocked" : "pass",
      evidence: fallbackContractCount > 0
        ? `${fallbackContractCount} fallback contract occurrences must be preserved or replaced with tests before cleanup.`
        : "No fallback contract occurrences were detected.",
      blocks_cleanup: fallbackContractCount > 0
    },
    {
      id: "api-hotspot-cleanup-still-targeted",
      status: debtCount > 0 ? "blocked" : "pass",
      evidence: debtCount > 0
        ? `${debtCount} mock/legacy/debt candidates need line-level ownership review.`
        : "No mock/legacy/debt candidates were detected.",
      blocks_cleanup: debtCount > 0
    }
  ];
}

export function buildAdminApiFixtureFallbackClassificationReport(input: {
  generated_at: string;
  command: string;
  target_file: string;
  text: string;
}): AdminApiFixtureFallbackClassificationReport {
  const targetFile = normalizePath(input.target_file);
  const occurrences = findOccurrences({ file: targetFile, text: input.text });
  const gates = buildGates(occurrences);
  const summary: ApiHotspotSummary = {
    file: targetFile,
    lines_scanned: lineCount(input.text),
    occurrence_count: occurrences.length,
    fixture_client_boundary_count: countKind(occurrences, "fixture-client-boundary"),
    route_loading_fallback_contract_count: countKind(occurrences, "route-loading-fallback-contract"),
    runtime_fallback_contract_count: countKind(occurrences, "runtime-fallback-contract"),
    usage_metrics_field_count: countKind(occurrences, "usage-metrics-field"),
    test_or_mock_boundary_count: countKind(occurrences, "test-or-mock-boundary"),
    legacy_debt_candidate_count: countKind(occurrences, "legacy-debt-candidate")
  };
  const blocked = gates.some((gate) => gate.status === "blocked");

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-api-fixture-fallback-classification",
    scope: {
      target_file: targetFile,
      terms: [...TERMS]
    },
    cleanup_allowed: false,
    classification_ready: true,
    summary,
    occurrences,
    gates,
    result: {
      status: blocked ? "blocked" : "classified",
      summary: blocked
        ? "Admin Web api.ts fixture/fallback hotspots are classified; cleanup remains blocked until each selected boundary has replacement tests."
        : "Admin Web api.ts fixture/fallback hotspots are classified; broad cleanup still needs explicit targeted scope."
    },
    artifacts: null
  };
}

function markdownEscape(value: string): string {
  return value.replace(/\|/g, "\\|");
}

export function toMarkdown(report: AdminApiFixtureFallbackClassificationReport): string {
  const rows = report.occurrences.slice(0, 80).map((item) => [
    String(item.line),
    item.term,
    item.kind,
    markdownEscape(item.text),
    item.cleanup_policy
  ].join(" | "));

  return [
    "# Admin API Fixture/Fallback Classification",
    "",
    `Generated: ${report.generated_at}`,
    "",
    `Mode: ${report.mode}`,
    "",
    `Result: ${report.result.status}`,
    "",
    `Cleanup allowed: ${report.cleanup_allowed ? "yes" : "no"}`,
    "",
    "This report is evidence-only. It does not delete, move, rewrite, or refactor Admin Web API code.",
    "",
    "## Summary",
    "",
    `- Target file: ${report.summary.file}`,
    `- Lines scanned: ${report.summary.lines_scanned}`,
    `- Occurrences: ${report.summary.occurrence_count}`,
    `- Fixture client boundary: ${report.summary.fixture_client_boundary_count}`,
    `- Route loading fallback contract: ${report.summary.route_loading_fallback_contract_count}`,
    `- Runtime fallback contract: ${report.summary.runtime_fallback_contract_count}`,
    `- Usage metrics field: ${report.summary.usage_metrics_field_count}`,
    `- Test or mock boundary: ${report.summary.test_or_mock_boundary_count}`,
    `- Legacy debt candidate: ${report.summary.legacy_debt_candidate_count}`,
    "",
    "## Gates",
    "",
    "| Gate | Status | Blocks Cleanup | Evidence |",
    "| --- | --- | --- | --- |",
    ...report.gates.map((gate) => [
      gate.id,
      gate.status,
      gate.blocks_cleanup ? "yes" : "no",
      gate.evidence
    ].join(" | ")),
    "",
    "## Classified Occurrences",
    "",
    "| Line | Term | Kind | Text | Cleanup Policy |",
    "| --- | --- | --- | --- | --- |",
    ...(rows.length > 0 ? rows : ["| n/a | n/a | n/a | n/a | No occurrences detected. |"]),
    "",
    "## Required Evidence For Cleanup",
    "",
    ...[...new Set(report.occurrences.flatMap((item) => item.required_evidence))]
      .sort()
      .map((item) => `- ${item}`),
    "",
    "## Artifacts",
    "",
    `- JSON: ${report.artifacts?.json_path ?? "not written"}`,
    `- Markdown: ${report.artifacts?.markdown_path ?? "not written"}`,
    ""
  ].join("\n");
}

async function main(): Promise<void> {
  const outputDir = process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
  const targetFile = normalizePath(process.env.MIXLAB_ADMIN_API_FALLBACK_TARGET ?? DEFAULT_TARGET_FILE);
  const timestamp = timestampForFile();
  const jsonPath = path.join(outputDir, `admin-api-fixture-fallback-classification-${timestamp}.json`);
  const markdownPath = path.join(outputDir, `admin-api-fixture-fallback-classification-${timestamp}.md`);
  const report = buildAdminApiFixtureFallbackClassificationReport({
    generated_at: new Date().toISOString(),
    command: process.argv.join(" "),
    target_file: targetFile,
    text: await readFile(targetFile, "utf8")
  });
  const reportWithArtifacts: AdminApiFixtureFallbackClassificationReport = {
    ...report,
    artifacts: {
      json_path: jsonPath,
      markdown_path: markdownPath
    }
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(reportWithArtifacts, null, 2)}\n`);
  await writeFile(markdownPath, `${toMarkdown(reportWithArtifacts)}\n`);
  console.log(JSON.stringify(reportWithArtifacts, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
