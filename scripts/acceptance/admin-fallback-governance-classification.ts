import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_SCAN_ROOTS = [
  "apps/admin-web/src",
  "packages/admin-api/src",
  "packages/library-fs/src"
];
const GOVERNANCE_TERMS = ["fixture", "fallback", "legacy", "mock", "deprecated", "TODO"] as const;
const PRODUCTION_SAFE_FALLBACK_PATHS = new Set([
  "apps/admin-web/src/features/source-videos/SourceVideosPage.tsx",
  "apps/admin-web/src/features/preprocess-jobs/PreprocessJobsPage.tsx",
  "packages/admin-api/src/admin-data-loading-plan.ts",
  "packages/admin-api/src/admin-preprocess-read-routes.ts",
  "packages/admin-api/src/admin-source-video-status-page-query.ts",
  "packages/library-fs/src/cutter-source-library.ts",
  "packages/library-fs/src/usage-events.ts"
]);
const RUNTIME_FIXTURE_BOUNDARY_PATHS = new Set([
  "apps/admin-web/src/api.ts"
]);

type GovernanceTerm = typeof GOVERNANCE_TERMS[number];
type FallbackClassificationKind =
  | "test-fixture"
  | "fixture-runtime-boundary"
  | "safe-fallback"
  | "legacy-compatibility"
  | "removable-candidate";
type FallbackGateStatus = "pass" | "blocked";

interface SourceFile {
  path: string;
  text: string;
}

interface TermMatch {
  term: GovernanceTerm;
  count: number;
}

interface TermHotspot {
  path: string;
  count: number;
  terms: GovernanceTerm[];
  term_counts: TermMatch[];
}

interface ClassifiedFallbackHotspot extends TermHotspot {
  classification: FallbackClassificationKind;
  cleanup_policy: string;
  required_evidence: string[];
}

interface FallbackGate {
  id: string;
  status: FallbackGateStatus;
  evidence: string;
  blocks_cleanup: boolean;
}

export interface AdminFallbackGovernanceClassificationReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-fallback-governance-classification";
  scope: {
    scan_roots: string[];
    governance_terms: string[];
  };
  classification_ready: boolean;
  cleanup_allowed: false;
  summary: {
    files_scanned: number;
    hotspot_count: number;
    classification_counts: Record<FallbackClassificationKind, number>;
    removable_candidate_count: number;
  };
  classified_hotspots: ClassifiedFallbackHotspot[];
  gates: FallbackGate[];
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

function isScannableFile(filePath: string): boolean {
  return /\.(css|ts|tsx)$/.test(filePath);
}

function isTestFile(filePath: string): boolean {
  return /\.(test|spec)\.(ts|tsx)$/.test(filePath);
}

function isFixtureRuntimeBoundary(filePath: string): boolean {
  return filePath.includes("/fixtures/") || RUNTIME_FIXTURE_BOUNDARY_PATHS.has(filePath);
}

function termMatches(text: string): TermMatch[] {
  return GOVERNANCE_TERMS
    .map((term) => ({
      term,
      count: (text.match(new RegExp(`\\b${term}\\b`, "gi")) ?? []).length
    }))
    .filter((item) => item.count > 0);
}

function termHotspots(files: SourceFile[]): TermHotspot[] {
  return files
    .map((file) => {
      const matches = termMatches(file.text);
      const count = matches.reduce((sum, item) => sum + item.count, 0);
      return {
        path: file.path,
        count,
        terms: matches.map((item) => item.term),
        term_counts: matches
      };
    })
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
    .slice(0, 80);
}

export function classifyFallbackHotspot(hotspot: TermHotspot): FallbackClassificationKind {
  if (isTestFile(hotspot.path)) {
    return "test-fixture";
  }
  if (isFixtureRuntimeBoundary(hotspot.path)) {
    return "fixture-runtime-boundary";
  }
  if (PRODUCTION_SAFE_FALLBACK_PATHS.has(hotspot.path)) {
    return "safe-fallback";
  }
  if (hotspot.terms.includes("legacy")) {
    return "legacy-compatibility";
  }
  return "removable-candidate";
}

function cleanupPolicy(kind: FallbackClassificationKind): string {
  switch (kind) {
    case "test-fixture":
      return "Keep as test-only coverage unless the owning test is replaced with equivalent assertions.";
    case "fixture-runtime-boundary":
      return "Keep as the deterministic fixture/runtime boundary until the Admin fixture client or fixture data contract is replaced and tested.";
    case "safe-fallback":
      return "Keep as a production tolerance or compatibility fallback; do not remove without a measured replacement path and regression tests.";
    case "legacy-compatibility":
      return "Keep until the legacy compatibility contract is retired with explicit migration evidence.";
    case "removable-candidate":
      return "Candidate for a future targeted cleanup only after owner review proves the code is unreachable or fully replaced.";
  }
}

function requiredEvidence(kind: FallbackClassificationKind): string[] {
  switch (kind) {
    case "test-fixture":
      return [
        "replacement test assertions or approved test deletion",
        "focused test run for the owning package"
      ];
    case "fixture-runtime-boundary":
      return [
        "replacement fixture/runtime contract",
        "Admin Web fixture tests and at least one browser QA route"
      ];
    case "safe-fallback":
      return [
        "runtime metric or compatibility proof showing the fallback is no longer needed",
        "focused production-path tests covering missing/malformed/old data",
        "rollback note"
      ];
    case "legacy-compatibility":
      return [
        "explicit migration or deprecation decision",
        "tests proving old data/routes/users are no longer supported or are safely migrated"
      ];
    case "removable-candidate":
      return [
        "line-level owner review",
        "replacement path or unreachable-code proof",
        "focused tests plus targeted browser/API QA when user-facing"
      ];
  }
}

function classifyHotspots(hotspots: TermHotspot[]): ClassifiedFallbackHotspot[] {
  return hotspots.map((hotspot) => {
    const classification = classifyFallbackHotspot(hotspot);
    return {
      ...hotspot,
      classification,
      cleanup_policy: cleanupPolicy(classification),
      required_evidence: requiredEvidence(classification)
    };
  });
}

function emptyCounts(): Record<FallbackClassificationKind, number> {
  return {
    "test-fixture": 0,
    "fixture-runtime-boundary": 0,
    "safe-fallback": 0,
    "legacy-compatibility": 0,
    "removable-candidate": 0
  };
}

function classificationCounts(hotspots: ClassifiedFallbackHotspot[]): Record<FallbackClassificationKind, number> {
  const counts = emptyCounts();
  for (const hotspot of hotspots) {
    counts[hotspot.classification] += 1;
  }
  return counts;
}

function gate(input: FallbackGate): FallbackGate {
  return input;
}

export function buildAdminFallbackGovernanceClassificationReport(input: {
  generated_at: string;
  command: string;
  scan_roots: string[];
  files: SourceFile[];
}): AdminFallbackGovernanceClassificationReport {
  const hotspots = classifyHotspots(termHotspots(input.files));
  const counts = classificationCounts(hotspots);
  const removableCandidates = counts["removable-candidate"];
  const classificationReady = hotspots.every((item) => Boolean(item.classification));
  const gates = [
    gate({
      id: "classification-no-side-effects",
      status: "pass",
      evidence: "This report reads source files and writes acceptance artifacts only; it does not delete, move, or rewrite production code.",
      blocks_cleanup: false
    }),
    gate({
      id: "all-term-hotspots-classified",
      status: classificationReady ? "pass" : "blocked",
      evidence: classificationReady
        ? `${hotspots.length} term hotspots classified.`
        : "One or more term hotspots did not receive a classification.",
      blocks_cleanup: !classificationReady
    }),
    gate({
      id: "broad-cleanup-still-blocked",
      status: "blocked",
      evidence: `Cleanup remains targeted only; ${removableCandidates} removable candidates still require line-level proof before edits.`,
      blocks_cleanup: true
    })
  ];

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-fallback-governance-classification",
    scope: {
      scan_roots: input.scan_roots,
      governance_terms: [...GOVERNANCE_TERMS]
    },
    classification_ready: classificationReady,
    cleanup_allowed: false,
    summary: {
      files_scanned: input.files.length,
      hotspot_count: hotspots.length,
      classification_counts: counts,
      removable_candidate_count: removableCandidates
    },
    classified_hotspots: hotspots,
    gates,
    result: {
      status: classificationReady ? "classified" : "blocked",
      summary: classificationReady
        ? "fallback/fixture/legacy hotspots are classified for future targeted cleanup"
        : "fallback/fixture/legacy hotspot classification is incomplete"
    },
    artifacts: null
  };
}

export function renderMarkdown(report: AdminFallbackGovernanceClassificationReport): string {
  const counts = report.summary.classification_counts;
  const rows = report.classified_hotspots
    .map((item) =>
      `| ${item.path} | ${item.count} | ${item.terms.join(", ")} | ${item.classification} | ${item.cleanup_policy.replaceAll("|", "\\|")} | ${item.required_evidence.join("<br>").replaceAll("|", "\\|")} |`
    )
    .join("\n");
  const gateRows = report.gates
    .map((item) =>
      `| ${item.id} | ${item.status} | ${item.blocks_cleanup ? "yes" : "no"} | ${item.evidence.replaceAll("|", "\\|")} |`
    )
    .join("\n");

  return `# Admin Fallback Governance Classification

Generated: ${report.generated_at}

Mode: ${report.mode}

Result: ${report.result.status}

Cleanup allowed: ${report.cleanup_allowed ? "yes" : "no"}

This report classifies fixture/fallback/legacy hotspots before any cleanup. It does not delete, move, rewrite, or refactor production code.

## Summary

- Files scanned: ${report.summary.files_scanned}
- Term hotspots: ${report.summary.hotspot_count}
- Test fixtures: ${counts["test-fixture"]}
- Fixture runtime boundaries: ${counts["fixture-runtime-boundary"]}
- Safe fallbacks: ${counts["safe-fallback"]}
- Legacy compatibility: ${counts["legacy-compatibility"]}
- Removable candidates: ${counts["removable-candidate"]}

## Gates

| Gate | Status | Blocks Cleanup | Evidence |
| --- | --- | --- | --- |
${gateRows}

## Classified Hotspots

| Path | Count | Terms | Classification | Cleanup Policy | Required Evidence |
| --- | ---: | --- | --- | --- | --- |
${rows || "| n/a | 0 | n/a | n/a | n/a | n/a |"}

## Artifacts

- JSON: ${report.artifacts?.json_path ?? "not written"}
- Markdown: ${report.artifacts?.markdown_path ?? "not written"}
`;
}

async function collectFiles(root: string): Promise<SourceFile[]> {
  const files: SourceFile[] = [];

  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      console.warn(`Skipping ${current}: ${errorMessage(error)}`);
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist") {
          continue;
        }
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !isScannableFile(fullPath)) {
        continue;
      }
      const text = await readFile(fullPath, "utf8");
      files.push({ path: normalizePath(fullPath), text });
    }
  }

  await walk(root);
  return files;
}

export async function runAdminFallbackGovernanceClassification(input: {
  outputDir?: string;
  scanRoots?: string[];
  generatedAt?: Date;
} = {}): Promise<AdminFallbackGovernanceClassificationReport> {
  const generatedAt = input.generatedAt ?? new Date();
  const stamp = timestampForFile(generatedAt);
  const outputDir = input.outputDir ?? process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
  const scanRoots = input.scanRoots ?? DEFAULT_SCAN_ROOTS;
  const files = (await Promise.all(scanRoots.map(collectFiles))).flat();
  const jsonPath = path.join(outputDir, `admin-fallback-governance-classification-${stamp}.json`);
  const markdownPath = path.join(outputDir, `admin-fallback-governance-classification-${stamp}.md`);
  const reportBase = buildAdminFallbackGovernanceClassificationReport({
    generated_at: generatedAt.toISOString(),
    command: "tsx scripts/acceptance/admin-fallback-governance-classification.ts",
    scan_roots: scanRoots,
    files
  });
  const report: AdminFallbackGovernanceClassificationReport = {
    ...reportBase,
    artifacts: {
      json_path: jsonPath,
      markdown_path: markdownPath
    }
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderMarkdown(report), "utf8");

  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runAdminFallbackGovernanceClassification()
    .then((report) => {
      console.log(report.result.summary);
      console.log(`hotspots=${report.summary.hotspot_count}`);
      console.log(`removable_candidates=${report.summary.removable_candidate_count}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
