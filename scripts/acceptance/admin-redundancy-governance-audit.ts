import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_SCAN_ROOTS = [
  "apps/admin-web/src",
  "packages/admin-api/src",
  "packages/library-fs/src"
];
const DEFAULT_LARGE_FILE_LINE_THRESHOLD = 700;
const GOVERNANCE_TERMS = ["fixture", "fallback", "legacy", "mock", "deprecated", "TODO"] as const;

type GovernanceGateStatus = "pass" | "blocked";
type GovernanceGateCategory = "safety" | "css" | "code-size" | "fallbacks" | "governance";

interface SourceFile {
  path: string;
  text: string;
}

interface DuplicateSelector {
  selector: string;
  count: number;
  files: string[];
}

interface LargeFile {
  path: string;
  line_count: number;
}

interface TermHotspot {
  path: string;
  count: number;
  terms: string[];
}

interface GovernanceGate {
  id: string;
  title: string;
  category: GovernanceGateCategory;
  status: GovernanceGateStatus;
  evidence: string;
  blocks_cleanup: boolean;
  required_evidence?: string;
}

interface GovernanceSummary {
  files_scanned: number;
  css_files_scanned: number;
  duplicate_selector_count: number;
  large_file_count: number;
  term_hotspot_count: number;
  cleanup_blockers: string[];
}

export interface AdminRedundancyGovernanceAuditReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-redundancy-governance-audit";
  scope: {
    scan_roots: string[];
    large_file_line_threshold: number;
    governance_terms: string[];
  };
  cleanup_ready: boolean;
  cleanup_allowed: false;
  observations: {
    duplicate_selectors: DuplicateSelector[];
    large_files: LargeFile[];
    term_hotspots: TermHotspot[];
  };
  gates: GovernanceGate[];
  summary: GovernanceSummary;
  result: {
    status: "ready-for-targeted-cleanup" | "blocked";
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

function lineCount(text: string): number {
  if (!text) {
    return 0;
  }
  return text.split(/\r?\n/).length;
}

function stripCssComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

function normalizeSelector(selector: string): string {
  return selector.replace(/\s+/g, " ").trim();
}

function cssSelectors(file: SourceFile): string[] {
  const selectors: string[] = [];
  const text = stripCssComments(file.text);
  const blocks = text.matchAll(/([^{}]+)\{[^{}]*\}/g);

  for (const match of blocks) {
    const raw = match[1]?.trim() ?? "";
    if (!raw || raw.startsWith("@")) {
      continue;
    }

    for (const selector of raw.split(",")) {
      const normalized = normalizeSelector(selector);
      if (normalized && !normalized.startsWith("@")) {
        selectors.push(normalized);
      }
    }
  }

  return selectors;
}

function duplicateSelectors(files: SourceFile[]): DuplicateSelector[] {
  const selectorFiles = new Map<string, string[]>();

  for (const file of files.filter((item) => item.path.endsWith(".css"))) {
    for (const selector of cssSelectors(file)) {
      const current = selectorFiles.get(selector) ?? [];
      current.push(file.path);
      selectorFiles.set(selector, current);
    }
  }

  return [...selectorFiles.entries()]
    .map(([selector, filePaths]) => ({
      selector,
      count: filePaths.length,
      files: [...new Set(filePaths)].sort()
    }))
    .filter((item) => item.count > 1)
    .sort((a, b) => b.count - a.count || a.selector.localeCompare(b.selector))
    .slice(0, 40);
}

function largeFiles(files: SourceFile[], threshold: number): LargeFile[] {
  return files
    .map((file) => ({ path: file.path, line_count: lineCount(file.text) }))
    .filter((file) => file.line_count >= threshold)
    .sort((a, b) => b.line_count - a.line_count || a.path.localeCompare(b.path))
    .slice(0, 40);
}

function termHotspots(files: SourceFile[]): TermHotspot[] {
  return files
    .map((file) => {
      const matches = GOVERNANCE_TERMS
        .map((term) => ({
          term,
          count: (file.text.match(new RegExp(`\\b${term}\\b`, "gi")) ?? []).length
        }))
        .filter((item) => item.count > 0);
      const count = matches.reduce((sum, item) => sum + item.count, 0);
      return {
        path: file.path,
        count,
        terms: matches.map((item) => item.term)
      };
    })
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
    .slice(0, 60);
}

function gate(input: GovernanceGate): GovernanceGate {
  return input;
}

function summarize(gates: GovernanceGate[], input: {
  files: SourceFile[];
  duplicateSelectors: DuplicateSelector[];
  largeFiles: LargeFile[];
  termHotspots: TermHotspot[];
}): GovernanceSummary {
  return {
    files_scanned: input.files.length,
    css_files_scanned: input.files.filter((file) => file.path.endsWith(".css")).length,
    duplicate_selector_count: input.duplicateSelectors.length,
    large_file_count: input.largeFiles.length,
    term_hotspot_count: input.termHotspots.length,
    cleanup_blockers: gates
      .filter((item) => item.blocks_cleanup && item.status !== "pass")
      .map((item) => item.id)
  };
}

export function buildAdminRedundancyGovernanceAuditReport(input: {
  generated_at: string;
  command: string;
  scan_roots: string[];
  files: SourceFile[];
  large_file_line_threshold?: number;
}): AdminRedundancyGovernanceAuditReport {
  const threshold = input.large_file_line_threshold ?? DEFAULT_LARGE_FILE_LINE_THRESHOLD;
  const duplicates = duplicateSelectors(input.files);
  const large = largeFiles(input.files, threshold);
  const terms = termHotspots(input.files);
  const gates = [
    gate({
      id: "audit-no-side-effects",
      title: "Redundancy audit has no source-code side effects",
      category: "safety",
      status: "pass",
      evidence: "This report reads source files and writes acceptance artifacts only; it does not delete, move, or rewrite production code.",
      blocks_cleanup: false
    }),
    gate({
      id: "cleanup-remains-targeted",
      title: "Cleanup remains evidence-led and targeted",
      category: "governance",
      status: "pass",
      evidence: "The audit records cleanup candidates but does not authorize broad deletion without replacement paths and tests.",
      blocks_cleanup: false
    }),
    gate({
      id: "css-duplicate-selectors-reviewed",
      title: "CSS duplicate selectors have been reviewed",
      category: "css",
      status: duplicates.length === 0 ? "pass" : "blocked",
      evidence: duplicates.length === 0
        ? "No duplicate CSS selectors detected in scanned files."
        : `${duplicates.length} duplicate CSS selector candidates require review.`,
      blocks_cleanup: duplicates.length > 0,
      required_evidence: "For each selected CSS duplicate cleanup, provide the replacement selector/component path and run Admin Web visual or browser QA."
    }),
    gate({
      id: "large-admin-files-reviewed",
      title: "Large Admin files have been reviewed before cleanup",
      category: "code-size",
      status: large.length === 0 ? "pass" : "blocked",
      evidence: large.length === 0
        ? `No scanned files exceed ${threshold} lines.`
        : `${large.length} files meet or exceed ${threshold} lines and need targeted ownership decisions.`,
      blocks_cleanup: large.length > 0,
      required_evidence: "Large files should be split only along established query/command/page/component boundaries with focused tests."
    }),
    gate({
      id: "fixture-fallback-legacy-hotspots-reviewed",
      title: "Fixture/fallback/legacy hotspots have been reviewed",
      category: "fallbacks",
      status: terms.length === 0 ? "pass" : "blocked",
      evidence: terms.length === 0
        ? "No governance terms detected in scanned files."
        : `${terms.length} files contain fixture/fallback/legacy/mock/deprecated/TODO terms and need classification before cleanup.`,
      blocks_cleanup: terms.length > 0,
      required_evidence: "Classify each cleanup candidate as test fixture, safe fallback, legacy compatibility, or removable dead code before editing."
    })
  ];
  const summary = summarize(gates, {
    files: input.files,
    duplicateSelectors: duplicates,
    largeFiles: large,
    termHotspots: terms
  });
  const cleanupReady = summary.cleanup_blockers.length === 0;

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-redundancy-governance-audit",
    scope: {
      scan_roots: input.scan_roots,
      large_file_line_threshold: threshold,
      governance_terms: [...GOVERNANCE_TERMS]
    },
    cleanup_ready: cleanupReady,
    cleanup_allowed: false,
    observations: {
      duplicate_selectors: duplicates,
      large_files: large,
      term_hotspots: terms
    },
    gates,
    summary,
    result: {
      status: cleanupReady ? "ready-for-targeted-cleanup" : "blocked",
      summary: cleanupReady
        ? "No redundancy hotspots were found by this audit; cleanup still needs explicit targeted scope."
        : "Redundancy cleanup remains blocked until candidates are reviewed and split into targeted cleanup slices."
    },
    artifacts: null
  };
}

export function toMarkdown(report: AdminRedundancyGovernanceAuditReport): string {
  const listRows = (items: Array<Record<string, unknown>>, empty: string) => {
    if (items.length === 0) {
      return [`- ${empty}`];
    }
    return items.slice(0, 20).map((item) => `- ${Object.entries(item)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
      .join("; ")}`);
  };
  const lines = [
    "# Admin Redundancy Governance Audit",
    "",
    `Generated: ${report.generated_at}`,
    "",
    `Mode: ${report.mode}`,
    "",
    `Result: ${report.result.status}`,
    "",
    `Cleanup ready: ${report.cleanup_ready ? "yes" : "no"}`,
    "",
    `Cleanup allowed: ${report.cleanup_allowed ? "yes" : "no"}`,
    "",
    "This audit is evidence-only. It does not delete, move, rewrite, or refactor production code.",
    "",
    "## Scope",
    "",
    `- Scan roots: ${report.scope.scan_roots.join(", ")}`,
    `- Large file threshold: ${report.scope.large_file_line_threshold} lines`,
    `- Governance terms: ${report.scope.governance_terms.join(", ")}`,
    "",
    "## Summary",
    "",
    `- Files scanned: ${report.summary.files_scanned}`,
    `- CSS files scanned: ${report.summary.css_files_scanned}`,
    `- Duplicate selector candidates: ${report.summary.duplicate_selector_count}`,
    `- Large file candidates: ${report.summary.large_file_count}`,
    `- Term hotspot candidates: ${report.summary.term_hotspot_count}`,
    `- Cleanup blockers: ${report.summary.cleanup_blockers.join(", ") || "none"}`,
    "",
    "## Gates",
    "",
    "| Gate | Category | Status | Blocks Cleanup | Evidence | Required Evidence |",
    "| --- | --- | --- | --- | --- | --- |",
    ...report.gates.map((item) => [
      item.id,
      item.category,
      item.status,
      item.blocks_cleanup ? "yes" : "no",
      item.evidence,
      item.required_evidence ?? "n/a"
    ].join(" | ")),
    "",
    "## Duplicate Selectors",
    "",
    ...listRows(report.observations.duplicate_selectors, "No duplicate selector candidates."),
    "",
    "## Large Files",
    "",
    ...listRows(report.observations.large_files, "No large file candidates."),
    "",
    "## Term Hotspots",
    "",
    ...listRows(report.observations.term_hotspots, "No fixture/fallback/legacy/mock hotspots."),
    "",
    "## Artifacts",
    "",
    `- JSON: ${report.artifacts?.json_path ?? "not written"}`,
    `- Markdown: ${report.artifacts?.markdown_path ?? "not written"}`,
    ""
  ];

  return `${lines.join("\n")}\n`;
}

async function walkFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return walkFiles(fullPath);
    }
    if (entry.isFile() && /\.(ts|tsx|css)$/.test(entry.name)) {
      return [fullPath];
    }
    return [];
  }));

  return files.flat();
}

async function readSourceFiles(scanRoots: string[]): Promise<SourceFile[]> {
  const files = (await Promise.all(scanRoots.map(walkFiles))).flat().sort();
  return Promise.all(files.map(async (filePath) => ({
    path: normalizePath(path.relative(process.cwd(), filePath)),
    text: await readFile(filePath, "utf8")
  })));
}

async function main(): Promise<void> {
  const outputDir = process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
  const scanRoots = (process.env.MIXLAB_ADMIN_REDUNDANCY_SCAN_ROOTS ?? DEFAULT_SCAN_ROOTS.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const threshold = Number.parseInt(process.env.MIXLAB_ADMIN_REDUNDANCY_LARGE_FILE_THRESHOLD ?? "", 10);
  const timestamp = timestampForFile();
  const jsonPath = path.join(outputDir, `admin-redundancy-governance-audit-${timestamp}.json`);
  const markdownPath = path.join(outputDir, `admin-redundancy-governance-audit-${timestamp}.md`);
  const report = buildAdminRedundancyGovernanceAuditReport({
    generated_at: new Date().toISOString(),
    command: process.argv.join(" "),
    scan_roots: scanRoots,
    files: await readSourceFiles(scanRoots),
    large_file_line_threshold: Number.isFinite(threshold) ? threshold : DEFAULT_LARGE_FILE_LINE_THRESHOLD
  });
  const reportWithArtifacts: AdminRedundancyGovernanceAuditReport = {
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
