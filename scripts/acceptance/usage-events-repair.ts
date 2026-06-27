import { copyFile, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readUsageMetrics } from "../../packages/library-fs/src/usage-events.ts";

export interface UsageEventsRepairOptions {
  libraryRoot: string;
  apply?: boolean;
  artifactsDir?: string;
  now?: Date;
}

export interface UsageEventsRepairReport {
  ok: boolean;
  mode: "dry-run" | "apply";
  library_root: string;
  events_path: string;
  events_exists: boolean;
  line_count: number;
  valid_line_count: number;
  malformed_line_count: number;
  malformed_lines: number[];
  changed: boolean;
  backup_path: string;
  quarantine_path: string;
  report_json_path: string;
  report_md_path: string;
  rewrite_strategy: "none" | "rename" | "copy-fallback";
  warnings: string[];
}

interface UsageLine {
  line_number: number;
  text: string;
}

const DEFAULT_LIBRARY_ROOT = "/Volumes/MixLab/PublicLibrary";
const DEFAULT_ARTIFACTS_DIR = "docs/acceptance/artifacts";

function usageEventsPath(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library", "usage-events", "events.ndjson");
}

function usageEventsDir(libraryRoot: string): string {
  return path.dirname(usageEventsPath(libraryRoot));
}

function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function splitNonEmptyLines(raw: string): UsageLine[] {
  const lines = raw.split(/\r?\n/);
  const result: UsageLine[] = [];
  for (const [index, text] of lines.entries()) {
    if (text.trim() === "") {
      continue;
    }
    result.push({
      line_number: index + 1,
      text
    });
  }
  return result;
}

function isRecoverableReplaceError(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) {
    return false;
  }
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EBUSY" || code === "EXDEV" || code === "EPERM";
}

async function replaceFileWithFallback(targetPath: string, content: string, timestamp: string): Promise<"rename" | "copy-fallback"> {
  const tempPath = path.join(path.dirname(targetPath), `.events.ndjson.${timestamp}.tmp`);
  await writeFile(tempPath, content, { encoding: "utf8", mode: 0o600 });
  try {
    await rename(tempPath, targetPath);
    return "rename";
  } catch (error) {
    if (!isRecoverableReplaceError(error)) {
      throw error;
    }
    await copyFile(tempPath, targetPath);
    await unlink(tempPath).catch(() => undefined);
    return "copy-fallback";
  }
}

function renderMarkdownReport(report: UsageEventsRepairReport): string {
  const status = report.ok ? "pass" : "blocked";
  return [
    `# Usage Events Repair ${report.mode}`,
    "",
    `- Status: ${status}`,
    `- Library root: \`${report.library_root}\``,
    `- Events file: \`${report.events_path}\``,
    `- Existing file: ${report.events_exists ? "yes" : "no"}`,
    `- Lines: ${report.line_count}`,
    `- Valid lines: ${report.valid_line_count}`,
    `- Malformed lines: ${report.malformed_line_count}`,
    `- Malformed line numbers: ${report.malformed_lines.length > 0 ? report.malformed_lines.join(", ") : "none"}`,
    `- Changed active file: ${report.changed ? "yes" : "no"}`,
    `- Rewrite strategy: ${report.rewrite_strategy}`,
    `- Backup: ${report.backup_path ? `\`${report.backup_path}\`` : "n/a"}`,
    `- Quarantine: ${report.quarantine_path ? `\`${report.quarantine_path}\`` : "n/a"}`,
    "",
    "## Notes",
    "",
    "- Dry-run mode never rewrites NAS data.",
    "- Apply mode copies the original file before rewriting and stores bad lines in quarantine.",
    "- This repair only affects usage analytics history; source-video manifests and ready artifacts are untouched.",
    ...(report.warnings.length > 0
      ? [
          "",
          "## Warnings",
          "",
          ...report.warnings.map((warning) => `- ${warning}`)
        ]
      : []),
    ""
  ].join("\n");
}

async function writeReportArtifacts(
  report: Omit<UsageEventsRepairReport, "report_json_path" | "report_md_path">,
  artifactsDir: string,
  timestamp: string
): Promise<UsageEventsRepairReport> {
  await mkdir(artifactsDir, { recursive: true });
  const reportJsonPath = path.join(artifactsDir, `usage-events-repair-${timestamp}.json`);
  const reportMdPath = path.join(artifactsDir, `usage-events-repair-${timestamp}.md`);
  const fullReport: UsageEventsRepairReport = {
    ...report,
    report_json_path: reportJsonPath,
    report_md_path: reportMdPath
  };
  await writeFile(reportJsonPath, formatJson(fullReport), "utf8");
  await writeFile(reportMdPath, renderMarkdownReport(fullReport), "utf8");
  return fullReport;
}

export async function repairUsageEvents(options: UsageEventsRepairOptions): Promise<UsageEventsRepairReport> {
  const libraryRoot = path.resolve(options.libraryRoot);
  const artifactsDir = options.artifactsDir ?? DEFAULT_ARTIFACTS_DIR;
  const timestamp = timestampForFile(options.now);
  const targetPath = usageEventsPath(libraryRoot);
  const usageDir = usageEventsDir(libraryRoot);
  const backupDir = path.join(usageDir, "backups");
  const quarantineDir = path.join(usageDir, "quarantine");
  const backupPath = path.join(backupDir, `events.ndjson.backup-${timestamp}`);
  const quarantinePath = path.join(quarantineDir, `events.malformed-${timestamp}.ndjson`);
  const mode = options.apply ? "apply" : "dry-run";
  const warnings: string[] = [];

  let raw = "";
  let eventsExists = true;
  try {
    raw = await readFile(targetPath, "utf8");
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      eventsExists = false;
    } else {
      throw new Error("无法读取 usage-events 存储文件", { cause: error });
    }
  }

  if (!eventsExists) {
    return writeReportArtifacts(
      {
        ok: true,
        mode,
        library_root: libraryRoot,
        events_path: targetPath,
        events_exists: false,
        line_count: 0,
        valid_line_count: 0,
        malformed_line_count: 0,
        malformed_lines: [],
        changed: false,
        backup_path: "",
        quarantine_path: "",
        rewrite_strategy: "none",
        warnings
      },
      artifactsDir,
      timestamp
    );
  }

  const metrics = await readUsageMetrics(libraryRoot);
  const allLines = splitNonEmptyLines(raw);
  const malformedLineSet = new Set(metrics.event_store.malformed_lines);
  const validLines = allLines.filter((line) => !malformedLineSet.has(line.line_number));
  const malformedLines = allLines.filter((line) => malformedLineSet.has(line.line_number));
  let changed = false;
  let rewriteStrategy: UsageEventsRepairReport["rewrite_strategy"] = "none";

  if (metrics.event_store.malformed_line_count > 0 && options.apply) {
    await mkdir(backupDir, { recursive: true });
    await mkdir(quarantineDir, { recursive: true });
    await copyFile(targetPath, backupPath);
    const quarantineContent = malformedLines
      .map((line) => JSON.stringify({ line_number: line.line_number, raw: line.text }))
      .join("\n");
    await writeFile(quarantinePath, quarantineContent ? `${quarantineContent}\n` : "", {
      encoding: "utf8",
      mode: 0o600
    });
    const repairedContent = validLines.length > 0 ? `${validLines.map((line) => line.text).join("\n")}\n` : "";
    rewriteStrategy = await replaceFileWithFallback(targetPath, repairedContent, timestamp);
    changed = true;
    if (rewriteStrategy === "copy-fallback") {
      warnings.push("rename replacement failed on the filesystem, so the tool used copy-fallback after creating a full backup.");
    }
  }

  return writeReportArtifacts(
    {
      ok: metrics.event_store.malformed_line_count === 0 || changed,
      mode,
      library_root: libraryRoot,
      events_path: targetPath,
      events_exists: true,
      line_count: metrics.event_store.line_count,
      valid_line_count: metrics.event_store.valid_line_count,
      malformed_line_count: metrics.event_store.malformed_line_count,
      malformed_lines: metrics.event_store.malformed_lines,
      changed,
      backup_path: changed ? backupPath : "",
      quarantine_path: changed ? quarantinePath : "",
      rewrite_strategy: rewriteStrategy,
      warnings
    },
    artifactsDir,
    timestamp
  );
}

function parseArgs(argv: string[]): UsageEventsRepairOptions {
  let libraryRoot = process.env.MIXLAB_ADMIN_LIBRARY_ROOT
    ?? process.env.MIXLAB_PREPROCESS_LIBRARY_ROOT
    ?? process.env.MIXLAB_USAGE_EVENTS_LIBRARY_ROOT
    ?? DEFAULT_LIBRARY_ROOT;
  let artifactsDir = DEFAULT_ARTIFACTS_DIR;
  let apply = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--library-root") {
      libraryRoot = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--artifacts-dir") {
      artifactsDir = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log([
        "Usage: tsx scripts/acceptance/usage-events-repair.ts [--library-root <path>] [--artifacts-dir <path>] [--apply]",
        "",
        "Default mode is dry-run. Use --apply to backup, quarantine malformed lines, and rewrite events.ndjson."
      ].join("\n"));
      process.exit(0);
    }
  }

  if (!libraryRoot.trim()) {
    throw new Error("--library-root 不能为空");
  }
  if (!artifactsDir.trim()) {
    throw new Error("--artifacts-dir 不能为空");
  }

  return {
    libraryRoot,
    artifactsDir,
    apply
  };
}

async function main(): Promise<void> {
  const report = await repairUsageEvents(parseArgs(process.argv.slice(2)));
  console.log(formatJson(report));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

const thisFilePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFilePath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
