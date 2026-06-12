import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface TraceRow {
  id: string;
  status: string;
}

export interface DeliveryReadinessReport {
  ok: boolean;
  errors: string[];
  accepted_count: number;
  remaining_target_gates: string[];
  partial_delivery_gate: string;
}

const EXPECTED_REAL_TARGET_GATES = ["ACC-008", "ACC-009"] as const;
const EXPECTED_PARTIAL_DELIVERY_GATE = "DELIV-001";
const ACCEPTANCE_ARTIFACT_MIN_WIDTH = 640;
const ACCEPTANCE_ARTIFACT_MIN_HEIGHT = 360;

const ACCEPTANCE_ARTIFACT_REFERENCE_FILES = [
  "docs/acceptance/m3-ui-foundation.md",
  "docs/acceptance/m4-cutter-workbench.md",
  "docs/acceptance/m5-admin-console.md"
] as const;

const REQUIRED_FILES = [
  ".github/workflows/acceptance-evidence-kit.yml",
  ".github/workflows/cutter-desktop-windows.yml",
  ".github/workflows/docker-admin.yml",
  "docs/acceptance/evidence/README.md",
  "docs/acceptance/local-web-real-nas.md",
  "scripts/acceptance/delivery-readiness.ts",
  "scripts/acceptance/evidence-kit-manifest-self-check.ps1",
  "scripts/acceptance/evidence-kit-manifest-self-check.sh",
  "scripts/acceptance/evidence-kit-drafts.ts",
  "scripts/acceptance/evidence-kit-manifest.ts",
  "scripts/acceptance/final-target-evidence.ts",
  "scripts/acceptance/local-real-nas-phase.ts",
  "scripts/acceptance/local-web-sanity-report.ts",
  "scripts/acceptance/local-web-sanity.ts",
  "scripts/acceptance/nas-acc-009-collector.sh",
  "scripts/acceptance/nas-docker-compose-static.ts",
  "scripts/acceptance/package-evidence-kit.ts",
  "scripts/acceptance/sync-local-web-real-nas-record.ts",
  "scripts/acceptance/target-attachments.ts",
  "scripts/acceptance/target-evidence-readiness.ts",
  "scripts/acceptance/target-evidence-template.ts",
  "scripts/acceptance/target-evidence.ts",
  "scripts/acceptance/windows-acc-008-collector.ps1",
  "scripts/smoke/cutter-api-web.ts",
  "scripts/smoke/searchd-concurrency.ts",
  "scripts/smoke/searchd-nas-rehearsal.ts",
  "scripts/smoke/searchd-scale.ts",
  "packages/searchd/Cargo.toml",
  "packages/searchd/src/main.rs"
] as const;

const REQUIRED_SCRIPTS = [
  "server:searchd",
  "smoke:cutter-api-web",
  "smoke:searchd-concurrency",
  "smoke:searchd-scale",
  "build:searchd",
  "test:searchd",
  "validate:windows-evidence",
  "validate:nas-evidence",
  "validate:target-evidence",
  "audit:target-evidence-readiness",
  "template:windows-evidence",
  "template:nas-evidence",
  "collect:windows-evidence",
  "collect:nas-evidence",
  "package:evidence-kit",
  "validate:evidence-kit-manifest",
  "validate:evidence-kit-drafts",
  "validate:nas-docker-compose-static",
  "audit:local-real-nas-phase",
  "audit:local-web-sanity",
  "validate:local-web-sanity-report",
  "sync:local-real-nas-record",
  "smoke:searchd-nas-rehearsal",
  "test:acceptance-evidence",
  "audit:delivery-readiness"
] as const;

function readText(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

function hasPngSignature(bytes: Buffer): boolean {
  return bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a;
}

function readPngDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (!hasPngSignature(bytes) || bytes.length < 24 || bytes.subarray(12, 16).toString("ascii") !== "IHDR") {
    return null;
  }

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}

export function collectAcceptanceArtifactReferences(markdown: string): string[] {
  const references = markdown.match(/docs\/acceptance\/artifacts\/[^\s`)"']+\.png/g) ?? [];
  return [...new Set(references)].sort();
}

export function parseTraceRows(markdown: string): TraceRow[] {
  const rows: TraceRow[] = [];

  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^\|\s*([A-Z]+-\d+)\s*\|/);
    if (!match) {
      continue;
    }

    const cells = line
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim());

    const id = cells[0] ?? "";
    const status = cells[3] ?? "";
    if (id && status) {
      rows.push({ id, status });
    }
  }

  return rows;
}

function requireFile(filePath: string, errors: string[]): void {
  if (!existsSync(filePath)) {
    errors.push(`Missing required file: ${filePath}`);
  }
}

function requireText(filePath: string, pattern: RegExp, message: string, errors: string[]): void {
  if (!existsSync(filePath)) {
    const missingFileMessage = `Missing required file: ${filePath}`;
    if (!errors.includes(missingFileMessage)) {
      errors.push(missingFileMessage);
    }
    return;
  }

  const text = readText(filePath);
  if (!pattern.test(text)) {
    errors.push(`${filePath}: ${message}`);
  }
}

function rejectText(filePath: string, pattern: RegExp, message: string, errors: string[]): void {
  if (!existsSync(filePath)) {
    const missingFileMessage = `Missing required file: ${filePath}`;
    if (!errors.includes(missingFileMessage)) {
      errors.push(missingFileMessage);
    }
    return;
  }

  const text = readText(filePath);
  if (pattern.test(text)) {
    errors.push(`${filePath}: ${message}`);
  }
}

function auditTraceRows(rows: TraceRow[], errors: string[]): {
  acceptedCount: number;
  remainingTargetGates: string[];
  partialDeliveryGate: string;
} {
  const byId = new Map(rows.map((row) => [row.id, row.status]));
  const remainingTargetGates = EXPECTED_REAL_TARGET_GATES.filter((id) => byId.get(id) === "not-started");
  const partialDeliveryGate = byId.get(EXPECTED_PARTIAL_DELIVERY_GATE) === "partial"
    ? EXPECTED_PARTIAL_DELIVERY_GATE
    : "";

  for (const row of rows) {
    if (EXPECTED_REAL_TARGET_GATES.includes(row.id as (typeof EXPECTED_REAL_TARGET_GATES)[number])) {
      if (row.status !== "not-started") {
        errors.push(`${row.id} must remain not-started until real target evidence is validated`);
      }
      continue;
    }

    if (row.id === EXPECTED_PARTIAL_DELIVERY_GATE) {
      if (row.status !== "partial") {
        errors.push(`${row.id} must remain partial until ACC-008 and ACC-009 are validated`);
      }
      continue;
    }

    if (row.status !== "accepted") {
      errors.push(`${row.id} must be accepted before final real-target acceptance; found ${row.status}`);
    }
  }

  for (const gate of EXPECTED_REAL_TARGET_GATES) {
    if (byId.get(gate) !== "not-started") {
      errors.push(`${gate} is missing or no longer marked not-started`);
    }
  }
  if (byId.get(EXPECTED_PARTIAL_DELIVERY_GATE) !== "partial") {
    errors.push(`${EXPECTED_PARTIAL_DELIVERY_GATE} is missing or no longer marked partial`);
  }

  return {
    acceptedCount: rows.filter((row) => row.status === "accepted").length,
    remainingTargetGates,
    partialDeliveryGate
  };
}

function auditPackageScripts(errors: string[]): void {
  const packageJson = JSON.parse(readText("package.json")) as { scripts?: Record<string, string> };
  const scripts = packageJson.scripts ?? {};

  for (const script of REQUIRED_SCRIPTS) {
    if (!scripts[script]) {
      errors.push(`package.json is missing script ${script}`);
    }
  }
}

function auditAcceptanceArtifactReferences(errors: string[]): void {
  const artifactPaths = new Set<string>();

  for (const docPath of ACCEPTANCE_ARTIFACT_REFERENCE_FILES) {
    if (!existsSync(docPath)) {
      errors.push(`Missing required file: ${docPath}`);
      continue;
    }

    for (const artifactPath of collectAcceptanceArtifactReferences(readText(docPath))) {
      artifactPaths.add(artifactPath);
    }
  }

  if (artifactPaths.size === 0) {
    errors.push("Acceptance docs do not reference any screenshot artifacts");
  }

  for (const artifactPath of artifactPaths) {
    if (!existsSync(artifactPath)) {
      errors.push(`Missing referenced acceptance screenshot artifact: ${artifactPath}`);
      continue;
    }

    const stat = statSync(artifactPath);
    if (!stat.isFile()) {
      errors.push(`Referenced acceptance screenshot artifact must be a file: ${artifactPath}`);
      continue;
    }
    if (stat.size === 0) {
      errors.push(`Referenced acceptance screenshot artifact must not be empty: ${artifactPath}`);
      continue;
    }

    const bytes = readFileSync(artifactPath);
    const dimensions = readPngDimensions(bytes);
    if (!dimensions) {
      errors.push(`Referenced acceptance screenshot artifact must be a readable PNG: ${artifactPath}`);
      continue;
    }
    if (
      dimensions.width < ACCEPTANCE_ARTIFACT_MIN_WIDTH ||
      dimensions.height < ACCEPTANCE_ARTIFACT_MIN_HEIGHT
    ) {
      errors.push(
        `Referenced acceptance screenshot artifact must be at least `
        + `${ACCEPTANCE_ARTIFACT_MIN_WIDTH}x${ACCEPTANCE_ARTIFACT_MIN_HEIGHT}: `
        + `${artifactPath} (${dimensions.width}x${dimensions.height})`
      );
    }
  }
}

function auditEvidenceAutomation(errors: string[]): void {
  for (const filePath of REQUIRED_FILES) {
    requireFile(filePath, errors);
  }

  requireText(
    "docs/spec-traceability.md",
    /^\| ACC-008 \|[^\n]*npm run validate:target-evidence -- docs\/acceptance\/evidence\/windows-acc-008\.json docs\/acceptance\/evidence\/nas-acc-009\.json[^\n]*$/m,
    "ACC-008 row must require the final combined target evidence gate, not only the Windows preflight",
    errors
  );
  requireText(
    "docs/spec-traceability.md",
    /^\| ACC-009 \|[^\n]*npm run validate:target-evidence -- docs\/acceptance\/evidence\/windows-acc-008\.json docs\/acceptance\/evidence\/nas-acc-009\.json[^\n]*$/m,
    "ACC-009 row must require the final combined target evidence gate, not only the NAS preflight",
    errors
  );
  requireText(
    "scripts/acceptance/target-evidence.ts",
    /TARGET_GITHUB_REPOSITORY = "alin155\/mixlab"[\s\S]*artifact_provenance[\s\S]*repository_commit_sha[\s\S]*evidence_kit_workflow_run_url[\s\S]*deployment\.image_tag must match artifact_provenance\.repository_commit_sha/,
    "target evidence validator must require official repository artifact provenance and NAS image-tag-to-commit matching",
    errors
  );
  requireText(
    "scripts/acceptance/target-evidence.ts",
    /requirePositiveInteger[\s\S]*must be a positive integer[\s\S]*preprocess_count_refresh_interval/,
    "target evidence validator must require worker count-refresh proof in NAS deployment evidence",
    errors
  );
  requireText(
    "scripts/acceptance/target-evidence.ts",
    /SHA256_HEX_PATTERN[\s\S]*installer[\s\S]*file_sha256[\s\S]*64-character sha256 hex digest[\s\S]*installer\.file_name must include installer\.version/,
    "target evidence validator must require Windows installer SHA-256 and file-name/version consistency evidence",
    errors
  );
  requireText(
    "scripts/acceptance/package-evidence-kit.ts",
    /GITHUB_SHA[\s\S]*GITHUB_RUN_ID[\s\S]*Cutter Desktop Windows Package[\s\S]*Build Admin Docker Images/,
    "evidence kit packaging must prefill GitHub Actions provenance for Windows and NAS target runs",
    errors
  );
  requireText(
    "scripts/acceptance/package-evidence-kit.ts",
    /DEFAULT_NAS_PREPROCESS_COUNT_REFRESH_INTERVAL = 25[\s\S]*MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL[\s\S]*workflowName === "Build Admin Docker Images"[\s\S]*nas_preprocess_count_refresh_interval/,
    "evidence kit packaging must prefill the NAS Docker worker count-refresh interval for target evidence drafts",
    errors
  );
  requireText(
    "scripts/acceptance/package-evidence-kit.ts",
    /(?=[\s\S]*TESTER-CHECKLIST\.md)(?=[\s\S]*audit:local-web-sanity)(?=[\s\S]*validate:local-web-sanity-report)(?=[\s\S]*sync:local-real-nas-record)(?=[\s\S]*audit:local-real-nas-phase)(?=[\s\S]*audit:target-evidence-readiness)(?=[\s\S]*searchd_index\.index_version)(?=[\s\S]*material_locator\.search_index_version)(?=[\s\S]*dashboard_write_action_lock_labels)(?=[\s\S]*智能扫描)(?=[\s\S]*source_video_write_action_lock_labels)(?=[\s\S]*重试此视频)(?=[\s\S]*保存封面)(?=[\s\S]*保存公开说明)(?=[\s\S]*真实 NAS 安全边界)(?=[\s\S]*真实 NAS 写入动作)(?=[\s\S]*preprocess_safety_labels)(?=[\s\S]*preprocess_write_action_lock_labels)(?=[\s\S]*public_library_write_detected=false)(?=[\s\S]*source-machine preflight only)(?=[\s\S]*ACC-008)(?=[\s\S]*ACC-009)(?=[\s\S]*final combined target gate)(?=[\s\S]*Local Web Sanity)(?=[\s\S]*Windows ACC-008)(?=[\s\S]*NAS ACC-009)(?=[\s\S]*validate:target-evidence)/,
    "evidence kit packaging must generate an operator checklist that covers local web sanity, Windows, NAS, final validation, and the source-machine preflight boundary",
    errors
  );
  requireText(
    "scripts/acceptance/package-evidence-kit.ts",
    /MANIFEST\.json[\s\S]*SHA-256[\s\S]*validate:evidence-kit-manifest[\s\S]*evidence-kit-manifest-self-check\.ps1[\s\S]*evidence-kit-manifest-self-check\.sh[\s\S]*size_bytes[\s\S]*executable[\s\S]*writeEvidenceKitManifest[\s\S]*TARGET_EVIDENCE_KIT_ARTIFACT_NAME/,
    "evidence kit packaging must generate a machine-readable manifest with file hashes, sizes, executable flags, artifact identity, and packaged target-side self-checks",
    errors
  );
  requireText(
    "scripts/acceptance/evidence-kit-manifest-self-check.ps1",
    /MANIFEST\.json[\s\S]*mixlab-target-evidence-kit[\s\S]*Get-FileHash[\s\S]*sha256 does not match[\s\S]*not listed in MANIFEST\.json/,
    "Windows target-side evidence kit manifest self-check must validate hashes and unlisted files without the source repository",
    errors
  );
  requireText(
    "scripts/acceptance/evidence-kit-manifest-self-check.sh",
    /node is required[\s\S]*MANIFEST\.json[\s\S]*mixlab-target-evidence-kit[\s\S]*executable flag does not match[\s\S]*sha256 does not match[\s\S]*not listed in MANIFEST\.json/,
    "NAS target-side evidence kit manifest self-check must validate executable flags, hashes, and unlisted files without the source repository",
    errors
  );
  requireText(
    "scripts/acceptance/evidence-kit-manifest.ts",
    /validateEvidenceKitManifest[\s\S]*MANIFEST\.json[\s\S]*artifact_name[\s\S]*TARGET_EVIDENCE_KIT_ARTIFACT_NAME[\s\S]*size_bytes does not match[\s\S]*executable flag does not match[\s\S]*sha256 does not match[\s\S]*not listed in MANIFEST\.json/,
    "evidence kit manifest validator must check artifact identity, hashes, sizes, executable flags, missing files, and unlisted files",
    errors
  );
  requireText(
    "scripts/acceptance/evidence-kit-drafts.ts",
    /(?=[\s\S]*validateEvidenceKitDraftMetadata)(?=[\s\S]*Cutter Desktop Windows Package)(?=[\s\S]*windows\.installer\.file_sha256)(?=[\s\S]*Build Admin Docker Images)(?=[\s\S]*nas\.deployment\.image_tag)(?=[\s\S]*preprocess_count_refresh_interval)/,
    "evidence kit draft validator must check CI-prefilled Windows installer and NAS image/count-refresh metadata",
    errors
  );
  requireText(
    ".github/workflows/acceptance-evidence-kit.yml",
    /Set up Rust[\s\S]*npm ci[\s\S]*npm run test:searchd[\s\S]*npm run test:acceptance-evidence[\s\S]*npm run audit:delivery-readiness[\s\S]*local_evidence_count[\s\S]*must include local-web-real-nas\.md, local-web-sanity\.json, and real-nas-50-editor-report\.json together[\s\S]*npm run validate:local-web-sanity-report -- docs\/acceptance\/artifacts\/local-web-sanity\.json[\s\S]*npm run sync:local-real-nas-record[\s\S]*git diff --exit-code -- docs\/acceptance\/local-web-real-nas\.md[\s\S]*npm run audit:local-real-nas-phase[\s\S]*npm run package:evidence-kit[\s\S]*npm run validate:evidence-kit-manifest[\s\S]*npm run validate:evidence-kit-drafts[\s\S]*evidence-kit-manifest-self-check\.sh[\s\S]*npm run audit:target-evidence-readiness[\s\S]*npm run validate:target-evidence/,
    "target evidence kit workflow must run searchd tests, acceptance tests, delivery readiness, require all-or-none local source-machine evidence, validate local web reports, check local real NAS record sync, audit local real NAS phase evidence, package, validate manifest, run packaged self-check, summarize committed target evidence readiness, and validate committed target evidence",
    errors
  );
  requireText(
    ".github/workflows/acceptance-evidence-kit.yml",
    /scripts\/smoke\/cutter-api-web\.ts[\s\S]*scripts\/smoke\/searchd-concurrency\.ts[\s\S]*scripts\/smoke\/searchd-nas-rehearsal\.ts[\s\S]*scripts\/smoke\/searchd-scale\.ts[\s\S]*packages\/searchd\/\*\*[\s\S]*docs\/acceptance\/artifacts\/real-nas-50-editor-report\.json[\s\S]*docs\/acceptance\/local-web-real-nas\.md[\s\S]*docs\/acceptance\/m3-ui-foundation\.md[\s\S]*docs\/acceptance\/m4-cutter-workbench\.md[\s\S]*docs\/acceptance\/m5-admin-console\.md[\s\S]*docs\/acceptance\/m6-search-sqlite-index\.md[\s\S]*docs\/acceptance\/m8-cutter-workspace-ui-binding\.md/,
    "target evidence kit workflow must rerun when core searchd smoke scripts, Rust searchd, or acceptance screenshot docs change",
    errors
  );
  requireText(
    ".github/workflows/docker-admin.yml",
    /Set up Rust[\s\S]*npm run typecheck[\s\S]*npm run test:searchd[\s\S]*npm run test:acceptance-evidence[\s\S]*npm run audit:delivery-readiness[\s\S]*npm run package:evidence-kit[\s\S]*npm run validate:evidence-kit-manifest[\s\S]*npm run validate:evidence-kit-drafts[\s\S]*evidence-kit-manifest-self-check\.sh[\s\S]*docker\/build-push-action@v6/,
    "Admin Docker workflow must verify TypeScript, searchd, acceptance tooling, delivery readiness, evidence-kit manifest, draft metadata, and packaged self-check before publishing NAS images",
    errors
  );
  requireText(
    "package.json",
    /"server:searchd": "cargo run --manifest-path packages\/searchd\/Cargo\.toml --"[\s\S]*"smoke:cutter-api-web": "tsx scripts\/smoke\/cutter-api-web\.ts"[\s\S]*"smoke:searchd-concurrency": "tsx scripts\/smoke\/searchd-concurrency\.ts"[\s\S]*"smoke:searchd-nas-rehearsal": "tsx scripts\/smoke\/searchd-nas-rehearsal\.ts"[\s\S]*"smoke:searchd-scale": "tsx scripts\/smoke\/searchd-scale\.ts"[\s\S]*"validate:evidence-kit-manifest": "tsx scripts\/acceptance\/evidence-kit-manifest\.ts"[\s\S]*"validate:evidence-kit-drafts": "tsx scripts\/acceptance\/evidence-kit-drafts\.ts"[\s\S]*"validate:local-web-sanity-report": "tsx scripts\/acceptance\/local-web-sanity-report\.ts"[\s\S]*"sync:local-real-nas-record": "tsx scripts\/acceptance\/sync-local-web-real-nas-record\.ts"[\s\S]*"audit:local-real-nas-phase": "tsx scripts\/acceptance\/local-real-nas-phase\.ts"[\s\S]*"build:searchd": "cargo build --manifest-path packages\/searchd\/Cargo\.toml --release"[\s\S]*"test:searchd": "cargo test --manifest-path packages\/searchd\/Cargo\.toml"/,
    "package scripts must keep searchd server, Rust build/test, functional smoke, 50-editor smoke, NAS rehearsal, scale smoke, local web report validation, local real NAS record sync, local real NAS phase audit, evidence-kit manifest validation, and evidence-kit draft validation commands wired to real runners",
    errors
  );
  requireText(
    "package.json",
    /"validate:nas-docker-compose-static": "tsx scripts\/acceptance\/nas-docker-compose-static\.ts"/,
    "package scripts must expose a NAS Docker compose static validator for non-Docker source-machine checks",
    errors
  );
  requireText(
    "scripts/acceptance/nas-docker-compose-static.ts",
    /deploy\/nas\/mixlab\/docker-compose\.yml[\s\S]*deploy\/nas\/mixlab\/\.env\.example[\s\S]*admin-api[\s\S]*admin-worker[\s\S]*admin-web[\s\S]*\/data\/PublicLibrary[\s\S]*worker:admin-loop[\s\S]*PUBLIC_LIBRARY_HOST_PATH[\s\S]*MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL[\s\S]*DASHSCOPE_API_KEY must be blank/,
    "NAS Docker compose static validator must check services, public-library mount, worker command, count refresh interval, and blank ASR key example",
    errors
  );
  requireText(
    "scripts/acceptance/local-web-sanity.ts",
    /MIXLAB_ADMIN_WEB_URL[\s\S]*MIXLAB_ADMIN_API_BASE_URL[\s\S]*MIXLAB_CUTTER_WEB_URL[\s\S]*MIXLAB_CUTTER_API_BASE_URL[\s\S]*MIXLAB_SEARCHD_BASE_URL[\s\S]*MIXLAB_LOCAL_WEB_SANITY_QUERY[\s\S]*MIXLAB_LOCAL_WEB_SANITY_MATRIX_QUERIES/,
    "local web sanity audit must support configurable admin/cutter web/API/searchd endpoints, query text, and matrix keywords",
    errors
  );
  requireText(
    "scripts/acceptance/local-web-sanity.ts",
    /MIXLAB_LOCAL_WEB_SANITY_REPORT[\s\S]*writeLocalWebSanityReport[\s\S]*JSON\.stringify/,
    "local web sanity audit must support writing a JSON report artifact",
    errors
  );
  requireText(
    "scripts/acceptance/local-web-sanity.ts",
    /validateLocalWebSanityReport[\s\S]*admin web[\s\S]*cutter web[\s\S]*searchd_index[\s\S]*admin_real_nas_matrix[\s\S]*cutter_search_matrix[\s\S]*selected transcript text must include the audited search query[\s\S]*must not include secrets/,
    "local web sanity audit must support revalidating saved JSON reports including searchd, admin matrix, and cutter matrix parity",
    errors
  );
  requireText(
    "scripts/acceptance/local-web-sanity-report.ts",
    /validateLocalWebSanityReport[\s\S]*validateLocalWebSanityReportFile[\s\S]*MIXLAB_LOCAL_WEB_SANITY_REPORT/,
    "local web sanity report CLI must read and validate saved report artifacts",
    errors
  );
  requireText(
    "scripts/acceptance/local-real-nas-phase.ts",
    /(?=[\s\S]*validateLocalWebSanityReportFile)(?=[\s\S]*nas-50-editor-report-self-check\.sh)(?=[\s\S]*docs\/acceptance\/local-web-real-nas\.md)[\s\S]*acceptance record must include[\s\S]*does not complete ACC-008[\s\S]*does not complete ACC-009/,
    "local real NAS phase audit must revalidate the saved local Web report, run the 50-editor self-check, and bind the acceptance record to current evidence values",
    errors
  );
  requireText(
    "scripts/acceptance/sync-local-web-real-nas-record.ts",
    /validateLocalWebSanityReportFile[\s\S]*local-web-sanity\.json[\s\S]*real-nas-50-editor-report\.json[\s\S]*local-web-real-nas\.md[\s\S]*Searchd health[\s\S]*selection_proof_text[\s\S]*local_clip_id[\s\S]*cut_job_id[\s\S]*syncLocalWebRealNasRecord/,
    "local Web real NAS record sync must refresh volatile acceptance-record evidence from the saved local Web sanity report",
    errors
  );
  requireText(
    "docs/acceptance/local-web-real-nas.md",
    /Local Web Real NAS Preflight[\s\S]*does not complete ACC-008[\s\S]*does not complete ACC-009[\s\S]*\/Volumes\/MixLab\/PublicLibrary[\s\S]*MIXLAB_ADMIN_API_BASE_URL=http:\/\/127\.0\.0\.1:3889\/[\s\S]*MIXLAB_CUTTER_API_BASE_URL=http:\/\/127\.0\.0\.1:3789\/[\s\S]*MIXLAB_SEARCHD_BASE_URL=http:\/\/127\.0\.0\.1:3799\/[\s\S]*npm run validate:local-web-sanity-report -- docs\/acceptance\/artifacts\/local-web-sanity\.json[\s\S]*npm run sync:local-real-nas-record[\s\S]*searchd_index\.index_version[\s\S]*admin_real_nas_matrix[\s\S]*cutter_search_matrix/,
    "local Web real NAS acceptance record must document the real NAS preflight, saved report validation, and final Windows/NAS target gate boundary",
    errors
  );
  requireText(
    "docs/spec-traceability.md",
    /local Web real NAS preflight record and saved report[\s\S]*final delivery is waiting only on real Windows and NAS acceptance evidence under ACC-008 and ACC-009/,
    "traceability must mention the local Web real NAS preflight while keeping final delivery gated by ACC-008 and ACC-009",
    errors
  );
  requireText(
    "docs/spec-traceability.md",
    /v003022[\s\S]*50 active users[\s\S]*50 distinct source videos[\s\S]*5 distinct search queries[\s\S]*现金流[\s\S]*利润[\s\S]*客户[\s\S]*增长[\s\S]*品牌[\s\S]*3,022 indexed source videos[\s\S]*403,605 indexed transcript segments[\s\S]*search p95 609\.1ms[\s\S]*detail p95 478\.7ms[\s\S]*cut p95 160\.7ms[\s\S]*1000ms local Web phase SLA/,
    "traceability must include the latest local Web real NAS 50-editor source-machine evidence values",
    errors
  );
  requireText(
    "scripts/acceptance/local-web-sanity.ts",
    /adminDashboardUrl[\s\S]*核心链路健康[\s\S]*关键词定位[\s\S]*完整文案[\s\S]*选段剪切[\s\S]*50 人容量[\s\S]*搜索 p95[\s\S]*本地搜索覆盖[\s\S]*搜索失败[\s\S]*素材规模/,
    "local web sanity audit must verify admin dashboard core-path and 50-editor readiness signals",
    errors
  );
  requireText(
    "scripts/acceptance/local-web-sanity.ts",
    /parseCutterCapacity[\s\S]*active_cutter_count[\s\S]*cutter_capacity[\s\S]*cutter_capacity must be at least 50[\s\S]*active_cutter_count must not exceed cutter_capacity/,
    "local web sanity audit must require structured 50-editor capacity evidence",
    errors
  );
  requireText(
    "scripts/acceptance/local-web-sanity.ts",
    /fetchSearchdIndexHealth[\s\S]*adminDashboard\.current_index_version[\s\S]*validateSearchdIndexSanityState/,
    "local web sanity audit must require searchd health to match the admin current index version",
    errors
  );
  requireText(
    "scripts/acceptance/local-web-sanity.ts",
    /matched_admin_current_index[\s\S]*searchd index health must match the admin current index version/,
    "local web sanity report validation must reject searchd/admin index drift",
    errors
  );
  requireText(
    "scripts/acceptance/local-web-sanity.ts",
    /validateAdminRealNasMatrixState[\s\S]*PublicLibrary[\s\S]*source_ready_detail_transcript_segment_count[\s\S]*preprocess_job_count[\s\S]*web_routes[\s\S]*read_only_actions_skipped/,
    "local web sanity audit must require admin real NAS status, source detail, preprocess, route, and read-only matrix evidence",
    errors
  );
  requireText(
    "scripts/acceptance/local-web-sanity.ts",
    /validateCutterSearchMatrixState[\s\S]*query_count[\s\S]*all_queries_used_searchd[\s\S]*matched_searchd_index[\s\S]*search_ms must be <=[\s\S]*must use searchd/,
    "local web sanity audit must require multi-keyword cutter searchd matrix evidence",
    errors
  );
  requireText(
    "scripts/acceptance/local-web-sanity.ts",
    /validateLocalWebLayoutBox[\s\S]*horizontal_overflow[\s\S]*must not overflow horizontally[\s\S]*validateLocalWebLayoutSanityState[\s\S]*state\.cutter_workbench[\s\S]*state\.cutter_body[\s\S]*admin_statusbar_item_overflow_count/,
    "local web sanity audit must reject admin and cutter horizontal layout overflow",
    errors
  );
  requireText(
    "scripts/acceptance/local-web-sanity.ts",
    /LOCAL_WEB_LAYOUT_VIEWPORTS[\s\S]*desktop[\s\S]*1440[\s\S]*compact[\s\S]*1024[\s\S]*LocalWebRouteLayoutState[\s\S]*admin_route_layouts[\s\S]*cutter_route_layouts[\s\S]*validateLocalWebRouteLayoutState[\s\S]*validateLocalWebLayoutSanityState[\s\S]*ADMIN_WEB_ROUTE_CHECKS[\s\S]*CUTTER_WEB_ROUTE_CHECKS[\s\S]*must verify all required \$\{app\} routes/,
    "local web sanity audit must require route-level admin and cutter layout evidence",
    errors
  );
  requireText(
    "scripts/acceptance/local-web-sanity.ts",
    /search_status_text[\s\S]*search_index_version[\s\S]*material locator search_index_version must match searchd index_version/,
    "local web sanity report validation must reject Material Locator/searchd index drift",
    errors
  );
  requireText(
    "scripts/acceptance/local-web-sanity.ts",
    /LOCAL_WEB_SEARCH_P95_SLA_MS = 1_000[\s\S]*search_p95_ms[\s\S]*admin dashboard search_p95_ms must be <=/,
    "local web sanity audit must require structured millisecond search p95 evidence",
    errors
  );
  requireText(
    "scripts/acceptance/local-web-sanity.ts",
    /LOCAL_WEB_LOCAL_SEARCH_COVERAGE_MIN_PERCENT = 80[\s\S]*local_search_coverage_percent[\s\S]*admin dashboard local_search_coverage_percent must be >=/,
    "local web sanity audit must require structured local search coverage evidence",
    errors
  );
  requireText(
    "scripts/acceptance/local-web-sanity.ts",
    /search_failure_count[\s\S]*admin dashboard search_failure_count must be 0/,
    "local web sanity audit must require zero search failure evidence",
    errors
  );
  requireText(
    "scripts/acceptance/local-web-sanity.ts",
    /data-current-hit-time-ms[\s\S]*exact current hit time[\s\S]*global hit position[\s\S]*current-video hit count/,
    "local web sanity audit must verify Material Locator hit-to-transcript evidence",
    errors
  );
  requireText(
    "scripts/acceptance/local-web-sanity.ts",
    /parseMaterialLocatorHeader[\s\S]*current_hit_time_ms_value[\s\S]*global_hit_position[\s\S]*global_hit_count[\s\S]*current_video_hit_count[\s\S]*selected_sentence_count[\s\S]*full_transcript_char_count[\s\S]*must match transcript header/,
    "local web sanity audit must require structured Material Locator hit-to-transcript counters",
    errors
  );
  requireText(
    "scripts/acceptance/local-web-sanity.ts",
    /current_video_hit_count must not exceed global_hit_count[\s\S]*full_transcript_char_count must be greater than selected transcript text length/,
    "local web sanity audit must cross-check Material Locator hit totals and selected text size",
    errors
  );
  requireText(
    "scripts/acceptance/local-web-sanity.ts",
    /selected transcript text[\s\S]*cutting[\s\S]*local reusable materials before public materials|local library[\s\S]*selected transcript text[\s\S]*local reusable materials before public materials/,
    "local web sanity audit must verify Material Locator hit-to-transcript and local cut closed-loop evidence",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /(?=[\s\S]*TESTER-CHECKLIST\.md)(?=[\s\S]*local Web sanity checks)(?=[\s\S]*Windows ACC-008)(?=[\s\S]*NAS ACC-009)(?=[\s\S]*final repository validation)(?=[\s\S]*audit:local-web-sanity)(?=[\s\S]*validate:local-web-sanity-report)(?=[\s\S]*sync:local-real-nas-record)(?=[\s\S]*audit:local-real-nas-phase)(?=[\s\S]*audit:target-evidence-readiness)(?=[\s\S]*dashboard_write_action_lock_labels)(?=[\s\S]*智能扫描)(?=[\s\S]*source_video_write_action_lock_labels)(?=[\s\S]*重试此视频)(?=[\s\S]*保存封面)(?=[\s\S]*保存公开说明)(?=[\s\S]*真实 NAS 安全边界)(?=[\s\S]*真实 NAS 写入动作)(?=[\s\S]*preprocess_safety_labels)(?=[\s\S]*preprocess_write_action_lock_labels)(?=[\s\S]*public_library_write_detected = false)(?=[\s\S]*source-machine preflight only)(?=[\s\S]*ACC-008 Windows target evidence)(?=[\s\S]*ACC-009 NAS target evidence)(?=[\s\S]*final combined target gate)/,
    "target evidence README must point testers to the generated operator checklist and local Web source-machine preflight boundary",
    errors
  );
  requireText(
    "scripts/acceptance/package-evidence-kit.ts",
    /LOCAL_SOURCE_REPORTS_README[\s\S]*local-web-real-nas\.md[\s\S]*local-web-sanity\.json[\s\S]*real-nas-50-editor-report\.json[\s\S]*sync:local-real-nas-record[\s\S]*dashboard_write_action_lock_labels[\s\S]*智能扫描[\s\S]*source_video_write_action_lock_labels[\s\S]*重试此视频[\s\S]*保存封面[\s\S]*保存公开说明[\s\S]*preprocess_safety_labels[\s\S]*真实 NAS 安全边界[\s\S]*preprocess_write_action_lock_labels[\s\S]*启动预处理流水线[\s\S]*selection_proof_text[\s\S]*selected_text_is_broader_than_query=true[\s\S]*local_clip_id[\s\S]*cut_job_id[\s\S]*public_library_write_detected=false[\s\S]*source-machine Web preflight only[\s\S]*ACC-008\/ACC-009 combined gate/,
    "target evidence kit local README must document the source-machine Web real-NAS closed loop and target boundary",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /layout\.admin_statusbar[\s\S]*layout\.admin_statusbar_item_overflow_count[\s\S]*layout\.cutter_workbench[\s\S]*layout\.cutter_body[\s\S]*layout\.admin_route_layouts[\s\S]*layout\.cutter_route_layouts[\s\S]*horizontal overflow flags false/,
    "target evidence README must document local web layout overflow evidence",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /validate:nas-docker-compose-static[\s\S]*expected Compose services[\s\S]*public-library mount[\s\S]*worker command[\s\S]*count refresh default[\s\S]*does not replace `docker compose config`[\s\S]*real NAS target evidence/,
    "target evidence README must document the source-side NAS Docker compose static check and its real-target boundary",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /admin_dashboard\.search_p95_ms[\s\S]*no higher than 1000ms/,
    "target evidence README must document local web search p95 SLA evidence",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /admin_dashboard\.local_search_coverage_percent[\s\S]*at least 80%/,
    "target evidence README must document local web search coverage evidence",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /admin_dashboard\.search_failure_count[\s\S]*equal to 0/,
    "target evidence README must document local web zero search failure evidence",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /admin_dashboard\.active_cutter_count[\s\S]*admin_dashboard\.cutter_capacity[\s\S]*capacity at least 50/,
    "target evidence README must document structured local web 50-editor capacity evidence",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /admin_dashboard\.current_index_version[\s\S]*searchd_index\.index_version[\s\S]*admin_dashboard\.current_index_version/,
    "target evidence README must document local web searchd/admin index parity evidence",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /admin_real_nas_matrix[\s\S]*ready source detail transcript counts[\s\S]*cutter_search_matrix[\s\S]*multiple keyword searches/,
    "target evidence README must document local web admin real NAS and cutter multi-keyword matrix evidence",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /material_locator\.search_index_version[\s\S]*searchd_index\.index_version/,
    "target evidence README must document local web Material Locator/searchd index parity evidence",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /material_locator\.current_hit_time_ms_value[\s\S]*material_locator\.global_hit_position[\s\S]*material_locator\.global_hit_count[\s\S]*material_locator\.current_video_hit_count[\s\S]*material_locator\.selected_sentence_count[\s\S]*material_locator\.full_transcript_char_count/,
    "target evidence README must document structured local web Material Locator evidence",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /current-video hit count no higher than global hit count[\s\S]*full transcript character count greater than selected transcript text length/,
    "target evidence README must document local Material Locator consistency checks",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /material_locator_closed_loop[\s\S]*selection_proof_text[\s\S]*selected_text_char_count[\s\S]*selected_text_is_broader_than_query[\s\S]*selected transcript text broader than the query keyword alone/,
    "target evidence README must document local Material Locator selected-text context checks",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /material_locator_closed_loop\.selection_method[\s\S]*transcript-drag[\s\S]*material_locator_closed_loop\.selected_sentence_count[\s\S]*at least 2[\s\S]*material_locator_closed_loop\.selected_text_segment_count[\s\S]*at least 2/,
    "target evidence README must document local Web full-transcript drag selection evidence",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /Target Evidence Kit[\s\S]*all-or-none[\s\S]*local-web-real-nas\.md[\s\S]*local-web-sanity\.json[\s\S]*real-nas-50-editor-report\.json[\s\S]*validate:local-web-sanity-report -- docs\/acceptance\/artifacts\/local-web-sanity\.json[\s\S]*sync:local-real-nas-record[\s\S]*local real NAS phase audit[\s\S]*audit:delivery-readiness/,
    "target evidence README must explain CI validation for committed local web reports, local real NAS phase evidence, and delivery readiness",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /MANIFEST\.json[\s\S]*SHA-256 digests[\s\S]*byte sizes[\s\S]*executable flags[\s\S]*validate:evidence-kit-manifest[\s\S]*evidence-kit-manifest-self-check\.ps1[\s\S]*evidence-kit-manifest-self-check\.sh[\s\S]*collectors[\s\S]*self-checks[\s\S]*draft JSONs/,
    "target evidence README must document the generated manifest and target-side self-checks for copied target kit integrity checks",
    errors
  );
  requireText(
    "scripts/acceptance/nas-acc-009-collector.sh",
    /json_string_field_from_existing[\s\S]*first_non_empty[\s\S]*artifact_provenance\.repository_commit_sha[\s\S]*deployment\.image_tag/,
    "NAS collector must preserve CI-prefilled provenance and image tag from existing evidence drafts",
    errors
  );
  requireText(
    "scripts/acceptance/nas-acc-009-collector.sh",
    /MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL[\s\S]*first_positive_integer[\s\S]*deployment\.preprocess_count_refresh_interval[\s\S]*assert_worker_log_count_refresh_interval/,
    "NAS collector must record worker count-refresh configuration and reject mismatched worker logs",
    errors
  );
  requireText(
    "scripts/acceptance/nas-acc-009-collector.sh",
    /minimumIndexedSourceVideoCount = 2000[\s\S]*minimumIndexedTranscriptSegmentCount = 48000[\s\S]*indexed_transcript_segment_count/,
    "NAS collector must reject under-scale or unlocated 50-editor reports before copying them",
    errors
  );
  requireText(
    "scripts/acceptance/nas-acc-009-collector.sh",
    /workspaceIds[\s\S]*uniqueWorkspaceCount[\s\S]*no_cross_workspace_outputs/,
    "NAS collector must reject duplicate workspace ids before copying or deriving 50-editor evidence",
    errors
  );
  requireText(
    "scripts/acceptance/nas-acc-009-collector.sh",
    /latencyMetricMatchesEditorSessions[\s\S]*count === sessions\.length[\s\S]*max >= Math\.max/,
    "NAS collector must reject latency aggregates that do not match editor session timings",
    errors
  );
  requireText(
    "scripts/acceptance/nas-acc-009-collector.sh",
    /aggregateCountsMatchEditorSessions[\s\S]*editorCount === sessions\.length[\s\S]*activeUserCount === sessions\.length[\s\S]*currentUsageCount[\s\S]*sessions\.length/,
    "NAS collector must reject aggregate editor and usage counts that do not match editor sessions",
    errors
  );
  requireText(
    "scripts/acceptance/nas-acc-009-collector.sh",
    /slaFieldsByMetric[\s\S]*search_sla_ms[\s\S]*detail_sla_ms[\s\S]*cut_sla_ms[\s\S]*latencySummaryPasses\(currentMetric, slaMs\)/,
    "NAS collector must reject reports whose latency p95 exceeds the matching SLA field",
    errors
  );
  requireText(
    "scripts/acceptance/nas-acc-009-collector.sh",
    /latencySummaryPasses[\s\S]*min_ms[\s\S]*p50_ms[\s\S]*p95_ms[\s\S]*max_ms/,
    "NAS collector must reject 50-editor reports without complete monotonic latency summaries",
    errors
  );
  requireText(
    "scripts/acceptance/nas-acc-009-collector.sh",
    /all_searches_passed[\s\S]*all_cuts_written_to_local_workspaces[\s\S]*public_library_not_written_by_cutters[\s\S]*no_cross_workspace_outputs/,
    "NAS collector must require top-level 50-editor report pass booleans before copying or deriving evidence",
    errors
  );
  requireText(
    "scripts/acceptance/nas-acc-009-collector.sh",
    /search_result_segment_id[\s\S]*full_transcript_segment_id[\s\S]*location_verified/,
    "NAS collector must require search hit to full-transcript-location proof before copying the 50-editor report",
    errors
  );
  requireText(
    "scripts/acceptance/nas-acc-009-collector.sh",
    /fullTranscriptProofPasses[\s\S]*full_transcript_source_video_id[\s\S]*full_transcript_segment_count[\s\S]*full_transcript_char_count[\s\S]*full_transcript_text_sha256/,
    "NAS collector must require video-level full transcript context proof",
    errors
  );
  requireText(
    "scripts/acceptance/nas-acc-009-collector.sh",
    /selected_text_begin_char[\s\S]*selected_text_end_char[\s\S]*search_result_begin_char[\s\S]*search_result_end_char/,
    "NAS collector must require selected transcript ranges to include the search hit range",
    errors
  );
  requireText(
    "scripts/acceptance/nas-acc-009-collector.sh",
    /selectedTextRangeProofPasses[\s\S]*selected_text_char_count[\s\S]*charCount === end - begin/,
    "NAS collector must require selected transcript character counts to match selected ranges",
    errors
  );
  requireText(
    "scripts/acceptance/nas-acc-009-collector.sh",
    /localClipProofPasses[\s\S]*local_clip_source_video_id[\s\S]*local_clip_selected_text_sha256[\s\S]*selected_text_sha256/,
    "NAS collector must require local clip proof to match selected transcript and source video evidence",
    errors
  );
  requireText(
    "scripts/acceptance/nas-acc-009-collector.sh",
    /portableRelativePath[\s\S]*local_clip_relative_path/,
    "NAS collector must require local clip output paths to remain workspace-relative and portable",
    errors
  );
  requireText(
    "scripts/acceptance/nas-acc-009-collector.sh",
    /localClipProofPasses[\s\S]*local_clip_file_size_bytes[\s\S]*(?:atLeast\(localClipFileSizeBytes, 1\)|local_clip_file_size_bytes > 0)/,
    "NAS collector must require local clip output files to be non-empty",
    errors
  );
  requireText(
    "scripts/acceptance/nas-acc-009-collector.sh",
    /localClipProofPasses[\s\S]*local_clip_content_sha256[\s\S]*\^\[a-f0-9\]\{64\}/,
    "NAS collector must require local clip output content hashes",
    errors
  );
  requireText(
    "scripts/acceptance/nas-acc-009-collector.sh",
    /localClipProofPasses[\s\S]*local_clip_begin_ms[\s\S]*local_clip_end_ms[\s\S]*selected_begin_ms[\s\S]*selected_end_ms/,
    "NAS collector must require local clip timing proof to match selected transcript timing",
    errors
  );
  requireText(
    "scripts/acceptance/nas-acc-009-collector.sh",
    /search_result_text_sha256[\s\S]*sha256Hex\(searchQuery\)/,
    "NAS collector must require search hit text hashes to match the query",
    errors
  );
  requireText(
    "scripts/acceptance/nas-acc-009-collector.sh",
    /search_result_rank[\s\S]*search_result_group_count[\s\S]*search_result_limit[\s\S]*atMost\(rank, groupCount\)/,
    "NAS collector must require selected search result rank proof inside the returned result list",
    errors
  );
  requireText(
    "scripts/acceptance/nas-acc-009-collector.sh",
    /searchIndexVersionProofPasses[\s\S]*search_index_version[\s\S]*report\.search_index_version/,
    "NAS collector must require every editor search row to match the top-level searchd index version",
    errors
  );
  requireText(
    "scripts/acceptance/nas-acc-009-collector.sh",
    /searchdHealthProofPasses[\s\S]*searchd_health_source_video_count[\s\S]*indexed_source_video_count[\s\S]*searchd_health_segment_count[\s\S]*indexed_transcript_segment_count/,
    "NAS collector must require searchd health counts to match indexed report counts",
    errors
  );
  requireText(
    "scripts/acceptance/nas-acc-009-collector.sh",
    /distinctSourceVideoCount[\s\S]*sourceVideoIds\.size[\s\S]*uniqueSourceVideoCount/,
    "NAS collector must require 50-editor reports to cover distinct public source videos",
    errors
  );
  requireText(
    "scripts/acceptance/windows-acc-008-collector.ps1",
    /InstallerFilePath[\s\S]*InstallerFileSha256[\s\S]*Get-FileHash[\s\S]*file_sha256/,
    "Windows collector must record installer SHA-256 evidence",
    errors
  );
  requireText(
    "scripts/acceptance/windows-acc-008-collector.ps1",
    /AllPublicLibraryPathsPassed[\s\S]*AllFailureCasesPassed[\s\S]*RequireCurrentEnvironmentComplete[\s\S]*Assert-CurrentWindowsEnvironmentComplete[\s\S]*public_library_paths[\s\S]*failure_cases[\s\S]*diagnostics_samples/,
    "Windows collector must support complete matrix marking and reject incomplete current-environment evidence on the target machine",
    errors
  );
  requireText(
    "scripts/acceptance/final-target-evidence.ts",
    /windows\.provenance_commit_sha !== nas\.provenance_commit_sha[\s\S]*ACC-008 and ACC-009 artifact_provenance\.repository_commit_sha must match[\s\S]*acceptedTargetGates = ok/,
    "final target gate must require Windows and NAS evidence from the same repository commit",
    errors
  );
  requireText(
    "scripts/acceptance/final-target-evidence.ts",
    /validateNasMultiUserSummaryMatchesReport[\s\S]*multi_user\.editor_session_count must equal concurrency_report\.editor_sessions length[\s\S]*multi_user\.\$\{field\} must match concurrency_report\.\$\{field\}/,
    "final target gate must cross-check NAS multi_user summary fields against the report attachment",
    errors
  );
  requireText(
    "scripts/acceptance/target-attachments.ts",
    /NAS_CONCURRENCY_MIN_INDEXED_SOURCE_VIDEO_COUNT = 2000[\s\S]*NAS_CONCURRENCY_MIN_INDEXED_TRANSCRIPT_SEGMENT_COUNT = 48000[\s\S]*indexed_transcript_segment_count/,
    "target attachment validation must require large-index NAS evidence",
    errors
  );
  requireText(
    "scripts/acceptance/target-attachments.ts",
    /workspaceIds[\s\S]*unique workspace_id values/,
    "target attachment validation must require unique workspace evidence for each editor session",
    errors
  );
  requireText(
    "scripts/acceptance/target-attachments.ts",
    /search_result_segment_id[\s\S]*full_transcript_segment_id[\s\S]*location_verified/,
    "target attachment validation must require search-hit-to-full-transcript-location NAS evidence",
    errors
  );
  requireText(
    "scripts/acceptance/target-attachments.ts",
    /FORBIDDEN_CONCURRENCY_REPORT_RUN_ROOT_FIELDS[\s\S]*library_root[\s\S]*workspace_root[\s\S]*searchd_cache_root[\s\S]*portable target evidence/,
    "target attachment validation must reject non-portable run root fields in the 50-editor report",
    errors
  );
  requireText(
    "scripts/acceptance/nas-acc-009-collector.sh",
    /library_root[\s\S]*workspace_root[\s\S]*searchd_cache_root[\s\S]*50-editor report must prove passed 50-editor search\/detail\/cut closed-loop evidence before copying/,
    "NAS collector must reject non-portable run root fields before copying the 50-editor report",
    errors
  );
  rejectText(
    "scripts/smoke/searchd-concurrency.ts",
    /editor_sessions: editorRuns[\s\S]*library_root: libraryRoot[\s\S]*workspace_root: workspaceRoot[\s\S]*searchd_cache_root: searchdCacheRoot/,
    "searchd concurrency smoke must not write target-machine run root fields into the 50-editor report",
    errors
  );
  rejectText(
    "scripts/smoke/searchd-concurrency.ts",
    /const workspaceRoot = await createSearchdConcurrencyRunDirectory\("mixlab-searchd-concurrency-workspace-"\)/,
    "searchd concurrency smoke must not use one shared workspace root for all 50 editors",
    errors
  );
  requireText(
    "scripts/smoke/searchd-concurrency.ts",
    /startEditorApiRuntime[\s\S]*mixlab-searchd-concurrency-workspace-\$\{input\.editor\.user_id\}-[\s\S]*workspace_root: workspaceRoot[\s\S]*workspace_id: path\.basename\(workspaceRoot\)/,
    "searchd concurrency smoke must use per-editor Cutter API runtimes and per-editor workspace roots",
    errors
  );
  requireText(
    "scripts/smoke/searchd-concurrency.ts",
    /editorApiRuntimes\.push\(\.\.\.await Promise\.all\(editors\.map\(\(editor\) =>[\s\S]*startEditorApiRuntime/,
    "searchd concurrency smoke must start one Cutter API runtime per editor",
    errors
  );
  requireText(
    "scripts/smoke/searchd-concurrency.ts",
    /editorRuntime\.api_base_url[\s\S]*\/cutter\/source-search[\s\S]*editorRuntime\.api_base_url[\s\S]*\/cutter\/source-videos[\s\S]*editorRuntime\.api_base_url[\s\S]*\/cutter\/local-clips/,
    "searchd concurrency smoke must run each editor workflow through that editor's own API base URL",
    errors
  );
  requireText(
    "scripts/smoke/searchd-concurrency.ts",
    /(?=[\s\S]*SEARCH_QUERIES = \["现金流", "利润", "客户", "增长", "品牌"\])(?=[\s\S]*searchResultText !== searchQuery)(?=[\s\S]*search_result_text_sha256: sha256Hex\(searchResultText\))(?=[\s\S]*search_query_count: searchQueries\.length)(?=[\s\S]*search_query_distribution: searchQueryDistribution\(editorRuns\))/,
    "searchd concurrency smoke must prove each search hit range contains its query text and cover multiple search queries",
    errors
  );
  requireText(
    "scripts/smoke/searchd-concurrency.ts",
    /fullTranscriptProofForDetail[\s\S]*segments\.length < 4[\s\S]*full_transcript_source_video_id: fullTranscriptProof\.source_video_id[\s\S]*full_transcript_text_sha256: fullTranscriptProof\.text_sha256/,
    "searchd concurrency smoke must report video-level full transcript context proof",
    errors
  );
  requireText(
    "scripts/smoke/searchd-concurrency.ts",
    /selected_text_char_count: selectedText\.length/,
    "searchd concurrency smoke must report selected transcript text length",
    errors
  );
  requireText(
    "scripts/smoke/searchd-concurrency.ts",
    /local_clip_source_video_id: String\(cut\.value\.data\.source_video_id\)[\s\S]*local_clip_selected_text_sha256: sha256Hex\(String\(cut\.value\.data\.selected_text\)\)/,
    "searchd concurrency smoke must report local clip source and selected text hash proof",
    errors
  );
  requireText(
    "scripts/smoke/searchd-concurrency.ts",
    /local_clip_relative_path: String\(cut\.value\.data\.relative_path\)/,
    "searchd concurrency smoke must report local clip workspace-relative output path",
    errors
  );
  requireText(
    "scripts/smoke/searchd-concurrency.ts",
    /local_clip_file_size_bytes: Number\(cut\.value\.data\.file_size\)/,
    "searchd concurrency smoke must report local clip output file size",
    errors
  );
  requireText(
    "scripts/smoke/searchd-concurrency.ts",
    /local_clip_content_sha256: String\(cut\.value\.data\.content_hash\)/,
    "searchd concurrency smoke must report local clip output content hash",
    errors
  );
  requireText(
    "scripts/smoke/searchd-concurrency.ts",
    /selected_begin_ms: selectedSegment\.begin_ms[\s\S]*selected_end_ms: selectedSegment\.end_ms[\s\S]*local_clip_begin_ms: Number\(cut\.value\.data\.begin_ms\)[\s\S]*local_clip_end_ms: Number\(cut\.value\.data\.end_ms\)/,
    "searchd concurrency smoke must report selected transcript and local clip timing proof",
    errors
  );
  requireText(
    "scripts/smoke/searchd-concurrency.ts",
    /const DEFAULT_VIDEO_COUNT = EDITOR_COUNT[\s\S]*limit=\$\{EDITOR_COUNT\}[\s\S]*distinctSourceVideoCount !== EDITOR_COUNT[\s\S]*distinct_source_video_count/,
    "searchd concurrency smoke must distribute 50 editor loops across 50 distinct public source videos",
    errors
  );
  requireText(
    "scripts/smoke/searchd-concurrency.ts",
    /search_result_rank: groupIndex \+ 1[\s\S]*search_result_group_count: groups\.length[\s\S]*search_result_limit: EDITOR_COUNT/,
    "searchd concurrency smoke must report selected search result rank proof",
    errors
  );
  requireText(
    "scripts/smoke/searchd-concurrency.ts",
    /runtimeSearchIndexVersion[\s\S]*searchIndexVersion[\s\S]*search_index_version/,
    "searchd concurrency smoke must report one consistent searchd index version",
    errors
  );
  requireText(
    "scripts/smoke/searchd-concurrency.ts",
    /waitForSearchdReady[\s\S]*segment_count[\s\S]*searchd_health_source_video_count[\s\S]*searchd_health_segment_count/,
    "searchd concurrency smoke must report health-derived source video and segment counts",
    errors
  );
  requireText(
    "scripts/acceptance/target-attachments.ts",
    /validateLatencyMetricsMatchEditorSessions[\s\S]*count must equal concurrency_report\.editor_sessions length[\s\S]*max_ms must be at least the maximum/,
    "target attachment validation must require latency aggregates to match editor session timings",
    errors
  );
  requireText(
    "scripts/acceptance/target-attachments.ts",
    /validateAggregateCountsMatchEditorSessions[\s\S]*editor_count must equal concurrency_report\.editor_sessions length[\s\S]*active_user_count must equal concurrency_report\.editor_sessions length[\s\S]*metrics\.usage\.\$\{field\} must be at least concurrency_report\.editor_sessions length/,
    "target attachment validation must require editor and usage aggregates to be backed by editor sessions",
    errors
  );
  requireText(
    "scripts/acceptance/target-attachments.ts",
    /CONCURRENCY_REPORT_ZERO_USAGE_FIELDS[\s\S]*search_failure_count[\s\S]*metrics\.usage\.\$\{field\} must be 0/,
    "target attachment validation must reject NAS 50-editor reports with search failures",
    errors
  );
  requireText(
    "scripts/acceptance/target-attachments.ts",
    /distinct_source_video_count[\s\S]*unique source_video_id values[\s\S]*unique source_video_id values/,
    "target attachment validation must require 50-editor reports to cover distinct public source videos",
    errors
  );
  requireText(
    "scripts/acceptance/target-attachments.ts",
    /CONCURRENCY_REPORT_SLA_FIELDS[\s\S]*search_sla_ms[\s\S]*detail_sla_ms[\s\S]*cut_sla_ms[\s\S]*validateConcurrencyReportSla[\s\S]*validateLatencyMetricSummary\(metric, metricName, slaMs, errors\)/,
    "target attachment validation must require latency p95 to satisfy the matching SLA field",
    errors
  );
  requireText(
    "scripts/acceptance/target-attachments.ts",
    /validateLatencyMetricSummary[\s\S]*min_ms[\s\S]*p50_ms[\s\S]*p95_ms[\s\S]*max_ms[\s\S]*latency summary must satisfy min_ms <= p50_ms <= p95_ms <= max_ms/,
    "target attachment validation must require complete monotonic latency summaries in 50-editor reports",
    errors
  );
  requireText(
    "scripts/acceptance/target-attachments.ts",
    /all_searches_passed[\s\S]*all_cuts_written_to_local_workspaces[\s\S]*public_library_not_written_by_cutters[\s\S]*no_cross_workspace_outputs/,
    "target attachment validation must require top-level 50-editor report pass booleans",
    errors
  );
  requireText(
    "scripts/acceptance/target-attachments.ts",
    /search_result_begin_char[\s\S]*search_result_end_char[\s\S]*search_result character range must fall within full_transcript character offsets/,
    "target attachment validation must require search hit character ranges to map into full-transcript offsets",
    errors
  );
  requireText(
    "scripts/acceptance/target-attachments.ts",
    /search_result_text_sha256[\s\S]*sha256\(search_query\)[\s\S]*search_result character range length must equal search_query length/,
    "target attachment validation must require search hit text hashes to match the query",
    errors
  );
  requireText(
    "scripts/acceptance/target-attachments.ts",
    /search_result_limit[\s\S]*search_result_group_count[\s\S]*search_result_rank[\s\S]*search_result_rank must be no greater than search_result_group_count/,
    "target attachment validation must require selected search result rank proof inside the returned result list",
    errors
  );
  requireText(
    "scripts/acceptance/target-attachments.ts",
    /search_index_version[\s\S]*concurrency_report\.search_index_version/,
    "target attachment validation must require every editor search row to match the top-level searchd index version",
    errors
  );
  requireText(
    "scripts/acceptance/target-attachments.ts",
    /searchd_health_source_video_count[\s\S]*indexed_source_video_count[\s\S]*searchd_health_segment_count[\s\S]*indexed_transcript_segment_count/,
    "target attachment validation must require searchd health counts to match indexed report counts",
    errors
  );
  requireText(
    "scripts/acceptance/target-attachments.ts",
    /full_transcript_source_video_id[\s\S]*full_transcript_segment_count[\s\S]*full_transcript_char_count[\s\S]*full_transcript_text_sha256[\s\S]*full_transcript_char_count must be greater than selected_text_char_count/,
    "target attachment validation must require video-level full transcript context proof",
    errors
  );
  requireText(
    "scripts/acceptance/target-attachments.ts",
    /selected_text_begin_char[\s\S]*selected_text_end_char[\s\S]*selected_text character range must include the search_result character range/,
    "target attachment validation must require selected transcript ranges to include search hit ranges",
    errors
  );
  requireText(
    "scripts/acceptance/target-attachments.ts",
    /selected_text_char_count[\s\S]*selected_text_char_count must equal selected_text_end_char - selected_text_begin_char/,
    "target attachment validation must require selected transcript character counts to match selected ranges",
    errors
  );
  requireText(
    "scripts/acceptance/target-attachments.ts",
    /local_clip_source_video_id[\s\S]*local_clip_selected_text_sha256[\s\S]*local_clip_selected_text_sha256 must equal selected_text_sha256/,
    "target attachment validation must bind local clips to the selected transcript and source video",
    errors
  );
  requireText(
    "scripts/acceptance/target-attachments.ts",
    /local_clip_relative_path[\s\S]*workspace-relative portable path/,
    "target attachment validation must require local clip output paths to remain workspace-relative and portable",
    errors
  );
  requireText(
    "scripts/acceptance/target-attachments.ts",
    /local_clip_file_size_bytes[\s\S]*must be at least 1/,
    "target attachment validation must require local clip output files to be non-empty",
    errors
  );
  requireText(
    "scripts/acceptance/target-attachments.ts",
    /local_clip_content_sha256[\s\S]*64-character sha256 hex digest/,
    "target attachment validation must require local clip output content hashes",
    errors
  );
  requireText(
    "scripts/acceptance/target-attachments.ts",
    /selected_begin_ms[\s\S]*selected_end_ms[\s\S]*local_clip_begin_ms[\s\S]*local_clip_end_ms[\s\S]*local_clip_end_ms must equal selected_end_ms/,
    "target attachment validation must bind local clip timing to selected transcript timing",
    errors
  );
  requireText(
    "scripts/acceptance/target-attachments.ts",
    /worker-log[\s\S]*expected_count_refresh_interval[\s\S]*count_refresh_interval[\s\S]*deployment\.preprocess_count_refresh_interval/,
    "target attachment validation must require worker log count-refresh proof matching NAS deployment evidence",
    errors
  );
  requireText(
    "scripts/acceptance/target-attachments.ts",
    /expected_file_stem[\s\S]*doctor-pass[\s\S]*engine-status[\s\S]*admin-web[\s\S]*50-editor-report[\s\S]*attachment filename must be/,
    "target attachment validation must require attachment filenames to match evidence fields",
    errors
  );
  requireText(
    "scripts/acceptance/target-attachments.ts",
    /MIN_SCREENSHOT_WIDTH = 640[\s\S]*MIN_SCREENSHOT_HEIGHT = 360[\s\S]*readImageDimensions[\s\S]*screenshot attachment must be at least/,
    "target attachment validation must reject undersized screenshot attachments",
    errors
  );
  requireText(
    "scripts/acceptance/target-evidence.ts",
    /validateAcceptanceEvidenceFile[\s\S]*validateReferencedAttachments[\s\S]*attachment_count/,
    "individual target evidence preflight must validate referenced attachment files",
    errors
  );
  requireText(
    "scripts/smoke/searchd-nas-rehearsal.ts",
    /MIN_FINAL_VIDEO_COUNT = 2000[\s\S]*MIN_FINAL_TRANSCRIPT_SEGMENT_COUNT = 48000[\s\S]*DEFAULT_REPORT_PATH = "captures\/50-editor-report\.json"[\s\S]*runSearchdConcurrencySmoke/,
    "NAS rehearsal smoke must run the 50-editor report at final ACC-009 scale",
    errors
  );
  requireText(
    "docs/deployment/m19-nas-docker.md",
    /npm run smoke:searchd-nas-rehearsal[\s\S]*captures\/50-editor-report\.json[\s\S]*indexed_transcript_segment_count >= 48000[\s\S]*unique `user_id`[\s\S]*unique `workspace_id`[\s\S]*library_root[\s\S]*workspace_root[\s\S]*searchd_cache_root/,
    "NAS deployment docs must point testers at the final-scale rehearsal command",
    errors
  );
  requireText(
    "docs/deployment/m19-nas-docker.md",
    /search_result_begin_char[\s\S]*search_result_end_char[\s\S]*full-transcript character offsets/,
    "NAS deployment docs must require search hit character positions to map into full-transcript offsets",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /selected_text_begin_char[\s\S]*selected_text_end_char[\s\S]*include the search hit range/,
    "target evidence docs must require selected transcript ranges to include search hit ranges",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /selected_text_char_count[\s\S]*selected range length/,
    "target evidence docs must require selected transcript character counts to match selected ranges",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /local_clip_source_video_id[\s\S]*source_video_id[\s\S]*local_clip_selected_text_sha256[\s\S]*selected_text_sha256/,
    "target evidence docs must require local clip proof to match selected transcript and source video evidence",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /local_clip_relative_path[\s\S]*workspace-relative/,
    "target evidence docs must require local clip output paths to remain workspace-relative and portable",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /local_clip_file_size_bytes[\s\S]*positive/,
    "target evidence docs must require local clip output files to be non-empty",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /local_clip_content_sha256[\s\S]*sha256/,
    "target evidence docs must require local clip output content hashes",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /local_clip_begin_ms[\s\S]*local_clip_end_ms[\s\S]*selected_begin_ms[\s\S]*selected_end_ms/,
    "target evidence docs must require local clip timing proof to match selected transcript timing",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /search_result_text_sha256[\s\S]*sha256\(search_query\)/,
    "target evidence docs must require search hit text hashes to match the query",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /search_result_rank[\s\S]*search_result_group_count[\s\S]*search_result_limit[\s\S]*at least 50/,
    "target evidence docs must require selected search result rank proof",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /search_index_version[\s\S]*top-level `search_index_version`/,
    "target evidence docs must require every editor search row to match the top-level searchd index version",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /searchd_health_source_video_count[\s\S]*indexed_source_video_count[\s\S]*searchd_health_segment_count[\s\S]*indexed_transcript_segment_count/,
    "target evidence docs must require searchd health counts to match indexed report counts",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /full_transcript_source_video_id[\s\S]*source_video_id[\s\S]*full_transcript_segment_count[\s\S]*4[\s\S]*full_transcript_char_count[\s\S]*selected_text_char_count[\s\S]*full_transcript_text_sha256/,
    "target evidence docs must require video-level full transcript context proof",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /50 distinct `source_video_id` values[\s\S]*`distinct_source_video_count` equal to the unique `source_video_id` values/,
    "target evidence docs must require 50-editor reports to cover distinct public source videos",
    errors
  );
  requireText(
    "docs/deployment/m19-nas-docker.md",
    /selected_text_begin_char[\s\S]*selected_text_end_char[\s\S]*include the search hit range/,
    "NAS deployment docs must require selected transcript ranges to include search hit ranges",
    errors
  );
  requireText(
    "docs/deployment/m19-nas-docker.md",
    /selected_text_char_count[\s\S]*selected range length/,
    "NAS deployment docs must require selected transcript character counts to match selected ranges",
    errors
  );
  requireText(
    "docs/deployment/m19-nas-docker.md",
    /local_clip_source_video_id[\s\S]*source_video_id[\s\S]*local_clip_selected_text_sha256[\s\S]*selected_text_sha256/,
    "NAS deployment docs must require local clip proof to match selected transcript and source video evidence",
    errors
  );
  requireText(
    "docs/deployment/m19-nas-docker.md",
    /local_clip_relative_path[\s\S]*workspace-relative/,
    "NAS deployment docs must require local clip output paths to remain workspace-relative and portable",
    errors
  );
  requireText(
    "docs/deployment/m19-nas-docker.md",
    /local_clip_file_size_bytes[\s\S]*positive/,
    "NAS deployment docs must require local clip output files to be non-empty",
    errors
  );
  requireText(
    "docs/deployment/m19-nas-docker.md",
    /local_clip_content_sha256[\s\S]*sha256/,
    "NAS deployment docs must require local clip output content hashes",
    errors
  );
  requireText(
    "docs/deployment/m19-nas-docker.md",
    /local_clip_begin_ms[\s\S]*local_clip_end_ms[\s\S]*selected_begin_ms[\s\S]*selected_end_ms/,
    "NAS deployment docs must require local clip timing proof to match selected transcript timing",
    errors
  );
  requireText(
    "docs/deployment/m19-nas-docker.md",
    /search_result_text_sha256[\s\S]*sha256\(search_query\)/,
    "NAS deployment docs must require search hit text hashes to match the query",
    errors
  );
  requireText(
    "docs/deployment/m19-nas-docker.md",
    /search_result_rank[\s\S]*search_result_group_count[\s\S]*search_result_limit[\s\S]*at least 50/,
    "NAS deployment docs must require selected search result rank proof",
    errors
  );
  requireText(
    "docs/deployment/m19-nas-docker.md",
    /search_index_version[\s\S]*top-level searchd index version/,
    "NAS deployment docs must require every editor search row to match the top-level searchd index version",
    errors
  );
  requireText(
    "docs/deployment/m19-nas-docker.md",
    /searchd_health_source_video_count[\s\S]*indexed_source_video_count[\s\S]*searchd_health_segment_count[\s\S]*indexed_transcript_segment_count/,
    "NAS deployment docs must require searchd health counts to match indexed report counts",
    errors
  );
  requireText(
    "docs/deployment/m19-nas-docker.md",
    /full_transcript_source_video_id[\s\S]*source_video_id[\s\S]*full_transcript_segment_count >= 4[\s\S]*full_transcript_char_count[\s\S]*selected_text_char_count[\s\S]*full_transcript_text_sha256/,
    "NAS deployment docs must require video-level full transcript context proof",
    errors
  );
  requireText(
    "docs/deployment/m19-nas-docker.md",
    /50 distinct `source_video_id` values/,
    "NAS deployment docs must require 50-editor reports to cover distinct public source videos",
    errors
  );
  requireText(
    "docs/deployment/m19-nas-docker.md",
    /MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL[\s\S]*25[\s\S]*aggregate library counts[\s\S]*large public libraries/,
    "NAS deployment docs must document the large-library preprocessing count-refresh throttle",
    errors
  );
  requireText(
    "docs/deployment/m19-nas-docker.md",
    /validate:nas-docker-compose-static[\s\S]*Compose services[\s\S]*GHCR images[\s\S]*public-library mount[\s\S]*worker command[\s\S]*MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL=25[\s\S]*does not replace `docker compose config`[\s\S]*real NAS target evidence/,
    "NAS deployment docs must document the source-side static compose check and its Docker/NAS evidence boundary",
    errors
  );
  requireText(
    "scripts/acceptance/package-evidence-kit.ts",
    /MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL=25[\s\S]*worker-cycle end[\s\S]*failures still refresh immediately[\s\S]*count_refresh_interval[\s\S]*deployment\.preprocess_count_refresh_interval/,
    "target evidence kit must tell NAS operators how to keep large-library preprocessing counts efficient and prove them in worker logs",
    errors
  );
  requireText(
    "scripts/acceptance/package-evidence-kit.ts",
    /validate:nas-docker-compose-static[\s\S]*expected Compose services[\s\S]*public-library mount[\s\S]*worker command[\s\S]*count refresh default[\s\S]*does not replace docker compose config[\s\S]*real NAS target evidence/,
    "target evidence kit checklist must document the source-side NAS Docker compose static check and its real-target boundary",
    errors
  );
  requireText(
    "scripts/acceptance/package-evidence-kit.ts",
    /latency count equal to editor_sessions\.length[\s\S]*latency max_ms at least the maximum matching per-editor timing/,
    "target evidence kit must tell NAS operators to keep latency aggregates tied to editor session timings",
    errors
  );
  requireText(
    "scripts/acceptance/package-evidence-kit.ts",
    /editor_count and active_user_count equal to editor_sessions\.length[\s\S]*usage counts[\s\S]*at least editor_sessions\.length/,
    "target evidence kit must tell NAS operators to keep editor and usage aggregates tied to editor sessions",
    errors
  );
  requireText(
    "scripts/acceptance/package-evidence-kit.ts",
    /50 distinct source_video_id values[\s\S]*5 distinct search_query values[\s\S]*search_query_count[\s\S]*search_queries[\s\S]*distinct_source_video_count equal to the unique source_video_id values/,
    "target evidence kit must tell NAS operators to cover distinct public source videos and multiple search queries",
    errors
  );
  requireText(
    "scripts/acceptance/target-attachments.ts",
    /NAS_CONCURRENCY_MIN_SEARCH_QUERY_COUNT = 5[\s\S]*searchQueries\.size[\s\S]*search_query_count[\s\S]*search_queries/,
    "target attachment validation must require NAS 50-editor reports to cover multiple search queries",
    errors
  );
  requireText(
    "scripts/acceptance/nas-50-editor-report-self-check.sh",
    /minimumDistinctSearchQueryCount = 5[\s\S]*uniqueSearchQueries\.size[\s\S]*search_query_count[\s\S]*search_queries/,
    "raw NAS 50-editor report self-check must require multiple search queries",
    errors
  );
  requireText(
    "scripts/acceptance/nas-acc-009-collector.sh",
    /minimumDistinctSearchQueryCount = 5[\s\S]*searchQueries\.size[\s\S]*search_query_count[\s\S]*search_queries/,
    "NAS collector must reject 50-editor reports without multiple search queries before copying",
    errors
  );
  requireText(
    "docs/deployment/m19-nas-docker.md",
    /5 distinct `search_query` values[\s\S]*`search_query_count`[\s\S]*`search_queries`/,
    "NAS deployment docs must require 50-editor reports to cover multiple search queries",
    errors
  );
  requireText(
    "scripts/acceptance/package-evidence-kit.ts",
    /selected_text_begin_char\/selected_text_end_char[\s\S]*includes that hit/,
    "target evidence kit must tell NAS operators to prove selected transcript ranges include search hit ranges",
    errors
  );
  requireText(
    "scripts/acceptance/package-evidence-kit.ts",
    /full_transcript_source_video_id matching source_video_id[\s\S]*full_transcript_segment_count at least 4[\s\S]*full_transcript_char_count greater than selected_text_char_count[\s\S]*full_transcript_text_sha256/,
    "target evidence kit must tell NAS operators to prove video-level full transcript context",
    errors
  );
  requireText(
    "scripts/acceptance/package-evidence-kit.ts",
    /selected_text_char_count equal to selected range length/,
    "target evidence kit must tell NAS operators to prove selected transcript character counts match selected ranges",
    errors
  );
  requireText(
    "scripts/acceptance/package-evidence-kit.ts",
    /local_clip_source_video_id matching source_video_id[\s\S]*local_clip_selected_text_sha256 equal to selected_text_sha256/,
    "target evidence kit must tell NAS operators to bind local clips to selected transcript and source video evidence",
    errors
  );
  requireText(
    "scripts/acceptance/package-evidence-kit.ts",
    /local_clip_relative_path as a workspace-relative portable path/,
    "target evidence kit must tell NAS operators to keep local clip output paths workspace-relative and portable",
    errors
  );
  requireText(
    "scripts/acceptance/package-evidence-kit.ts",
    /local_clip_file_size_bytes as positive output file size/,
    "target evidence kit must tell NAS operators to prove local clip output files are non-empty",
    errors
  );
  requireText(
    "scripts/acceptance/package-evidence-kit.ts",
    /local_clip_content_sha256 as output file sha256/,
    "target evidence kit must tell NAS operators to prove local clip output content hashes",
    errors
  );
  requireText(
    "scripts/acceptance/package-evidence-kit.ts",
    /local_clip_begin_ms\/local_clip_end_ms matching selected_begin_ms\/selected_end_ms/,
    "target evidence kit must tell NAS operators to bind local clip timing to selected transcript timing",
    errors
  );
  requireText(
    "scripts/acceptance/package-evidence-kit.ts",
    /search_result_text_sha256 equal to sha256\(search_query\)/,
    "target evidence kit must tell NAS operators to prove search hit text hashes match the query",
    errors
  );
  requireText(
    "scripts/acceptance/package-evidence-kit.ts",
    /search_result_rank inside the returned result list[\s\S]*search_result_group_count at least search_result_limit[\s\S]*search_result_limit at least 50/,
    "target evidence kit must tell NAS operators to prove selected search result rank inside the returned result list",
    errors
  );
  requireText(
    "scripts/acceptance/package-evidence-kit.ts",
    /top-level search_index_version matching every per-editor search_index_version from searchd/,
    "target evidence kit must tell NAS operators to prove every editor search row matches the top-level searchd index version",
    errors
  );
  requireText(
    "scripts/acceptance/package-evidence-kit.ts",
    /searchd_health_source_video_count equal to indexed_source_video_count[\s\S]*searchd_health_segment_count equal to indexed_transcript_segment_count/,
    "target evidence kit must tell NAS operators to prove searchd health counts match indexed report counts",
    errors
  );
  requireText(
    "scripts/acceptance/package-evidence-kit.ts",
    /positive search_sla_ms, detail_sla_ms, and cut_sla_ms[\s\S]*matching SLA field/,
    "target evidence kit must tell NAS operators to include SLA fields and keep p95 below them",
    errors
  );
  requireText(
    "scripts/acceptance/package-evidence-kit.ts",
    /min_ms <= p50_ms <= p95_ms <= max_ms/,
    "target evidence kit must tell NAS operators to include complete monotonic latency summaries",
    errors
  );
  requireText(
    "scripts/acceptance/package-evidence-kit.ts",
    /top-level pass flag[\s\S]*all_searches_passed[\s\S]*all_cuts_written_to_local_workspaces[\s\S]*public_library_not_written_by_cutters[\s\S]*no_cross_workspace_outputs/,
    "target evidence kit must tell NAS operators to set top-level 50-editor report pass flags",
    errors
  );
  requireText(
    "scripts/acceptance/package-evidence-kit.ts",
    /metrics\.usage\.search_failure_count equal to 0/,
    "target evidence kit must tell NAS operators to prove zero search failures in the 50-editor report",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /metrics\.usage\.search_failure_count` equal to `0`/,
    "target evidence README must tell NAS operators to prove zero search failures in the 50-editor report",
    errors
  );
  requireText(
    "scripts/acceptance/package-evidence-kit.ts",
    /unique user_id[\s\S]*unique workspace_id[\s\S]*library_root[\s\S]*workspace_root[\s\S]*searchd_cache_root/,
    "target evidence kit must tell NAS operators to include unique users/workspaces and exclude target-machine run roots in the 50-editor report",
    errors
  );
  requireText(
    "scripts/acceptance/package-evidence-kit.ts",
    /nas-50-editor-report-self-check\.sh[\s\S]*captures\/50-editor-report\.json[\s\S]*copyFile\([\s\S]*nas-50-editor-report-self-check\.sh[\s\S]*chmod/,
    "target evidence kit must include the raw NAS 50-editor report self-check before collector copy",
    errors
  );
  requireText(
    "docs/deployment/m19-nas-docker.md",
    /nas-50-editor-report-self-check\.sh[\s\S]*captures\/50-editor-report\.json[\s\S]*does not replace the collector-side checks or final repository validators/,
    "NAS deployment docs must tell operators to run the raw 50-editor report self-check before collector copy",
    errors
  );
  requireText(
    "scripts/acceptance/package-evidence-kit.ts",
    /copy the completed evidence package back[\s\S]*windows-acc-008\.json[\s\S]*screenshots\/[\s\S]*nas-acc-009\.json[\s\S]*evidence\/[\s\S]*validate:evidence-kit-manifest[\s\S]*validate:evidence-kit-drafts[\s\S]*only the JSON/,
    "target evidence kit must tell operators to copy JSON files back with their attachment folders intact and validate manifest plus draft metadata",
    errors
  );
  requireText(
    "docs/acceptance/evidence/README.md",
    /windows-acc-008\.json[\s\S]*screenshots\/[\s\S]*nas-acc-009\.json[\s\S]*evidence\/[\s\S]*only the JSON files are copied back/,
    "evidence README must tell operators to copy JSON files back with their attachment folders intact",
    errors
  );
  requireText(
    "docs/acceptance/m18-1-windows-cutter-desktop.md",
    /RequireCurrentEnvironmentComplete[\s\S]*AllPublicLibraryPathsPassed[\s\S]*AllFailureCasesPassed[\s\S]*PassedPublicLibraryPath[\s\S]*PassedFailureCase/,
    "Windows desktop target docs must tell testers to run the current-environment completeness gate",
    errors
  );
  requireText(
    ".github/workflows/acceptance-evidence-kit.yml",
    /docs\/acceptance\/m18-1-windows-cutter-desktop\.md[\s\S]*docs\/deployment\/m19-nas-docker\.md[\s\S]*docs\/spec-traceability\.md[\s\S]*npm run test:acceptance-evidence[\s\S]*npm run package:evidence-kit[\s\S]*npm run validate:evidence-kit-manifest[\s\S]*evidence-kit-manifest-self-check\.sh[\s\S]*npm run validate:target-evidence[\s\S]*name: mixlab-target-evidence-kit[\s\S]*dist\/acceptance\/mixlab-evidence-kit/,
    "must trigger on target evidence docs, test, package, validate the manifest, run packaged self-check, conditionally validate committed target evidence, and upload mixlab-target-evidence-kit",
    errors
  );
  requireText(
    ".github/workflows/cutter-desktop-windows.yml",
    /docs\/acceptance\/m18-1-windows-cutter-desktop\.md[\s\S]*docs\/acceptance\/m18-3-github-actions-windows-package\.md[\s\S]*Get-FileHash[\s\S]*MIXLAB_WINDOWS_INSTALLER_FILE_NAME[\s\S]*MIXLAB_WINDOWS_INSTALLER_SHA256[\s\S]*npm run package:evidence-kit[\s\S]*npm run validate:evidence-kit-manifest[\s\S]*npm run validate:evidence-kit-drafts[\s\S]*evidence-kit-manifest-self-check\.ps1[\s\S]*name: mixlab-cutter-windows-exe[\s\S]*name: mixlab-target-evidence-kit[\s\S]*dist\/acceptance\/mixlab-evidence-kit/,
    "must trigger on Windows acceptance docs and upload both the Windows installer and matching manifest/draft/self-check-validated evidence kit with installer SHA-256 metadata",
    errors
  );
  requireText(
    ".github/workflows/docker-admin.yml",
    /deploy\/nas\/mixlab\/\*\*[\s\S]*docs\/deployment\/m19-nas-docker\.md[\s\S]*npm run package:evidence-kit[\s\S]*npm run validate:evidence-kit-manifest[\s\S]*npm run validate:evidence-kit-drafts[\s\S]*evidence-kit-manifest-self-check\.sh[\s\S]*docker\/build-push-action@v6[\s\S]*name: mixlab-target-evidence-kit[\s\S]*dist\/acceptance\/mixlab-evidence-kit/,
    "must trigger on NAS deployment assets and upload the manifest/draft/self-check-validated evidence kit beside pushed NAS Docker images",
    errors
  );
}

export function auditDeliveryReadiness(): DeliveryReadinessReport {
  const errors: string[] = [];
  const rows = parseTraceRows(readText("docs/spec-traceability.md"));

  if (rows.length === 0) {
    errors.push("docs/spec-traceability.md contains no traceability rows");
  }

  const traceSummary = auditTraceRows(rows, errors);
  auditPackageScripts(errors);
  auditAcceptanceArtifactReferences(errors);
  auditEvidenceAutomation(errors);

  return {
    ok: errors.length === 0,
    errors,
    accepted_count: traceSummary.acceptedCount,
    remaining_target_gates: traceSummary.remainingTargetGates,
    partial_delivery_gate: traceSummary.partialDeliveryGate
  };
}

async function main(): Promise<void> {
  const report = auditDeliveryReadiness();
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
