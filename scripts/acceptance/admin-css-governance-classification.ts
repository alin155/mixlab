import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_CSS_FILES = [
  "apps/admin-web/src/styles.css",
  "apps/admin-web/src/admin-reference.css"
];
const REFERENCE_CSS_FILE = "apps/admin-web/src/admin-reference.css";
const LEGACY_CSS_FILE = "apps/admin-web/src/styles.css";

type CssClassificationKind =
  | "reference-layer-overlap"
  | "same-file-legacy-duplicate"
  | "reference-internal-duplicate"
  | "other-duplicate";

type CssGateStatus = "pass" | "blocked";

interface CssSelectorOccurrence {
  file: string;
  line: number;
}

interface ClassifiedCssDuplicate {
  selector: string;
  count: number;
  files: string[];
  occurrences: CssSelectorOccurrence[];
  kind: CssClassificationKind;
  cleanup_policy: string;
  required_evidence: string[];
}

interface CssGate {
  id: string;
  status: CssGateStatus;
  evidence: string;
  blocks_cleanup: boolean;
}

export interface AdminCssGovernanceClassificationReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-css-governance-classification";
  scope: {
    css_files: string[];
    reference_css_file: string;
    legacy_css_file: string;
  };
  cleanup_allowed: false;
  classification_ready: boolean;
  summary: {
    css_files_scanned: number;
    duplicate_selector_count: number;
    reference_layer_overlap_count: number;
    same_file_legacy_duplicate_count: number;
    reference_internal_duplicate_count: number;
    other_duplicate_count: number;
  };
  classified_duplicates: ClassifiedCssDuplicate[];
  gates: CssGate[];
  result: {
    status: "classified" | "blocked";
    summary: string;
  };
  artifacts: {
    json_path: string;
    markdown_path: string;
  } | null;
}

interface CssSource {
  path: string;
  text: string;
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

function stripCssComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (comment) => "\n".repeat(comment.split(/\r?\n/).length - 1));
}

function normalizeSelector(selector: string): string {
  return selector.replace(/\s+/g, " ").trim();
}

function lineAtOffset(text: string, offset: number): number {
  return text.slice(0, offset).split(/\r?\n/).length;
}

function selectorOccurrences(source: CssSource): Array<{ selector: string; occurrence: CssSelectorOccurrence }> {
  const text = stripCssComments(source.text);
  const blocks = text.matchAll(/([^{}]+)\{[^{}]*\}/g);
  const occurrences: Array<{ selector: string; occurrence: CssSelectorOccurrence }> = [];

  for (const match of blocks) {
    const raw = match[1]?.trim() ?? "";
    const index = match.index ?? 0;
    if (!raw || raw.startsWith("@")) {
      continue;
    }

    for (const selector of raw.split(",")) {
      const normalized = normalizeSelector(selector);
      if (!normalized || normalized.startsWith("@")) {
        continue;
      }
      occurrences.push({
        selector: normalized,
        occurrence: {
          file: source.path,
          line: lineAtOffset(text, index)
        }
      });
    }
  }

  return occurrences;
}

function classifyDuplicate(files: string[]): CssClassificationKind {
  const uniqueFiles = new Set(files);
  const hasReference = uniqueFiles.has(REFERENCE_CSS_FILE);
  const hasLegacy = uniqueFiles.has(LEGACY_CSS_FILE);

  if (hasReference && hasLegacy) {
    return "reference-layer-overlap";
  }
  if (uniqueFiles.size === 1 && hasLegacy) {
    return "same-file-legacy-duplicate";
  }
  if (uniqueFiles.size === 1 && hasReference) {
    return "reference-internal-duplicate";
  }
  return "other-duplicate";
}

function cleanupPolicy(kind: CssClassificationKind): string {
  switch (kind) {
    case "reference-layer-overlap":
      return "Do not delete the reference layer first; classify the legacy rule it intentionally overrides, then prove final computed UI with browser QA.";
    case "same-file-legacy-duplicate":
      return "Candidate for a targeted styles.css cleanup slice after confirming the later rule is the intended contract.";
    case "reference-internal-duplicate":
      return "Review inside the reference layer before editing; this may be a responsive override rather than dead CSS.";
    case "other-duplicate":
      return "Needs manual ownership review before cleanup.";
  }
}

function requiredEvidence(kind: CssClassificationKind): string[] {
  const common = [
    "focused Admin Web tests for affected route/component",
    "desktop and mobile browser QA with no horizontal overflow",
    "post-cleanup CSS governance classification artifact"
  ];
  if (kind === "reference-layer-overlap") {
    return [
      "computed-style or screenshot evidence proving admin-reference remains the final visual contract",
      ...common
    ];
  }
  if (kind === "same-file-legacy-duplicate") {
    return [
      "line-level replacement decision showing which styles.css block is canonical",
      ...common
    ];
  }
  return common;
}

function classifyDuplicates(sources: CssSource[]): ClassifiedCssDuplicate[] {
  const bySelector = new Map<string, CssSelectorOccurrence[]>();

  for (const source of sources) {
    for (const item of selectorOccurrences(source)) {
      const current = bySelector.get(item.selector) ?? [];
      current.push(item.occurrence);
      bySelector.set(item.selector, current);
    }
  }

  return [...bySelector.entries()]
    .map(([selector, occurrences]) => {
      const files = [...new Set(occurrences.map((item) => item.file))].sort();
      const kind = classifyDuplicate(files);
      return {
        selector,
        count: occurrences.length,
        files,
        occurrences,
        kind,
        cleanup_policy: cleanupPolicy(kind),
        required_evidence: requiredEvidence(kind)
      };
    })
    .filter((item) => item.count > 1)
    .sort((a, b) => {
      const kindOrder = a.kind.localeCompare(b.kind);
      return kindOrder || b.count - a.count || a.selector.localeCompare(b.selector);
    });
}

function buildGates(duplicates: ClassifiedCssDuplicate[]): CssGate[] {
  const referenceOverlaps = duplicates.filter((item) => item.kind === "reference-layer-overlap");
  const sameFileLegacy = duplicates.filter((item) => item.kind === "same-file-legacy-duplicate");

  return [
    {
      id: "classification-no-side-effects",
      status: "pass",
      evidence: "The classification reads CSS files and writes acceptance artifacts only.",
      blocks_cleanup: false
    },
    {
      id: "reference-layer-not-deleted-first",
      status: "pass",
      evidence: `${referenceOverlaps.length} reference-layer overlaps are classified as requiring browser/computed-style proof before deleting legacy rules.`,
      blocks_cleanup: false
    },
    {
      id: "same-file-legacy-duplicates-reviewed",
      status: sameFileLegacy.length === 0 ? "pass" : "blocked",
      evidence: sameFileLegacy.length === 0
        ? "No same-file styles.css duplicate selectors were detected."
        : `${sameFileLegacy.length} same-file styles.css duplicate selector candidates need line-level ownership review.`,
      blocks_cleanup: sameFileLegacy.length > 0
    },
    {
      id: "css-cleanup-still-targeted",
      status: "blocked",
      evidence: "This report classifies cleanup candidates but does not authorize broad CSS deletion.",
      blocks_cleanup: true
    }
  ];
}

export function buildAdminCssGovernanceClassificationReport(input: {
  generated_at: string;
  command: string;
  sources: CssSource[];
  css_files?: string[];
}): AdminCssGovernanceClassificationReport {
  const cssFiles = input.css_files ?? input.sources.map((source) => source.path);
  const duplicates = classifyDuplicates(input.sources);
  const gates = buildGates(duplicates);
  const referenceLayerOverlapCount = duplicates.filter((item) => item.kind === "reference-layer-overlap").length;
  const sameFileLegacyDuplicateCount = duplicates.filter((item) => item.kind === "same-file-legacy-duplicate").length;
  const referenceInternalDuplicateCount = duplicates.filter((item) => item.kind === "reference-internal-duplicate").length;
  const otherDuplicateCount = duplicates.filter((item) => item.kind === "other-duplicate").length;

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-css-governance-classification",
    scope: {
      css_files: cssFiles,
      reference_css_file: REFERENCE_CSS_FILE,
      legacy_css_file: LEGACY_CSS_FILE
    },
    cleanup_allowed: false,
    classification_ready: true,
    summary: {
      css_files_scanned: input.sources.length,
      duplicate_selector_count: duplicates.length,
      reference_layer_overlap_count: referenceLayerOverlapCount,
      same_file_legacy_duplicate_count: sameFileLegacyDuplicateCount,
      reference_internal_duplicate_count: referenceInternalDuplicateCount,
      other_duplicate_count: otherDuplicateCount
    },
    classified_duplicates: duplicates,
    gates,
    result: {
      status: gates.some((gate) => gate.status === "blocked") ? "blocked" : "classified",
      summary: sameFileLegacyDuplicateCount > 0
        ? "CSS duplicates are classified; same-file legacy duplicates must be reviewed before cleanup."
        : "CSS duplicates are classified; broad cleanup still needs explicit targeted scope."
    },
    artifacts: null
  };
}

export function toMarkdown(report: AdminCssGovernanceClassificationReport): string {
  const rows = report.classified_duplicates.slice(0, 40).map((item) => [
    item.selector,
    item.kind,
    String(item.count),
    item.files.join(", "),
    item.cleanup_policy
  ].join(" | "));

  return [
    "# Admin CSS Governance Classification",
    "",
    `Generated: ${report.generated_at}`,
    "",
    `Result: ${report.result.status}`,
    "",
    `Cleanup allowed: ${report.cleanup_allowed ? "yes" : "no"}`,
    "",
    "This report is evidence-only. It does not delete, move, rewrite, or refactor CSS.",
    "",
    "## Summary",
    "",
    `- CSS files scanned: ${report.summary.css_files_scanned}`,
    `- Duplicate selectors: ${report.summary.duplicate_selector_count}`,
    `- Reference-layer overlaps: ${report.summary.reference_layer_overlap_count}`,
    `- Same-file legacy duplicates: ${report.summary.same_file_legacy_duplicate_count}`,
    `- Reference-internal duplicates: ${report.summary.reference_internal_duplicate_count}`,
    `- Other duplicates: ${report.summary.other_duplicate_count}`,
    "",
    "## Gates",
    "",
    "| Gate | Status | Blocks Cleanup | Evidence |",
    "| --- | --- | --- | --- |",
    ...report.gates.map((gate) => `${gate.id} | ${gate.status} | ${gate.blocks_cleanup ? "yes" : "no"} | ${gate.evidence}`),
    "",
    "## Classified Duplicates",
    "",
    "| Selector | Kind | Count | Files | Cleanup Policy |",
    "| --- | --- | --- | --- | --- |",
    ...(rows.length > 0 ? rows : ["| n/a | n/a | 0 | n/a | No duplicate selectors detected. |"]),
    "",
    "## Artifacts",
    "",
    `- JSON: ${report.artifacts?.json_path ?? "not written"}`,
    `- Markdown: ${report.artifacts?.markdown_path ?? "not written"}`,
    ""
  ].join("\n");
}

async function readSources(cssFiles: string[]): Promise<CssSource[]> {
  return Promise.all(cssFiles.map(async (filePath) => ({
    path: normalizePath(filePath),
    text: await readFile(filePath, "utf8")
  })));
}

async function main(): Promise<void> {
  const outputDir = process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
  const cssFiles = (process.env.MIXLAB_ADMIN_CSS_GOVERNANCE_FILES ?? DEFAULT_CSS_FILES.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map(normalizePath);
  const timestamp = timestampForFile();
  const jsonPath = path.join(outputDir, `admin-css-governance-classification-${timestamp}.json`);
  const markdownPath = path.join(outputDir, `admin-css-governance-classification-${timestamp}.md`);
  const report = buildAdminCssGovernanceClassificationReport({
    generated_at: new Date().toISOString(),
    command: process.argv.join(" "),
    sources: await readSources(cssFiles),
    css_files: cssFiles
  });
  const reportWithArtifacts: AdminCssGovernanceClassificationReport = {
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
