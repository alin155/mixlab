#!/usr/bin/env node
/**
 * Round6 独立产品流水线（admin/cutter/smart 单产品）。
 * 步骤顺序：typecheck → 三仓共享包 hash 门禁 → contracts 6 项 → 单产品全量测试 → 可选 release manifest 校验。
 * 任一步失败即 exit 1（默认 fail-fast）；输出结构化 summary JSON，可被 CI 复用。
 *
 * 用法：
 *   node scripts/ci/product-pipeline.mjs --product admin  *     --admin-root /path/to/mixlab --cutter-root /path/to/mixlab-cutter --smart-root /path/to/smart  *     --summary-out ci-summary-admin.json [--json] [--dry-run]  *     [--release-manifest /path/to/release-manifest-v2.json] [--continue-on-error]
 * 选项：
 *   --product admin|cutter|smart（必填）
 *   --repos-root <dir>：同级目录约定 mixlab / mixlab-cutter / mixlab-smart-cutter（或显式三 root）
 *   --timeout-ms <n>：单步超时，默认 30 分钟
 *   --json：stdout 只输出 JSON summary（人类可读走 stderr）
 *   --dry-run：只打印计划步骤，不执行
 *   --manifest-path-check：附加只读检查 release manifest（可选，等价于 --release-manifest 的目录模式）
 * 退出码：0=PASS，1=失败，2=参数错误。
 */
import { spawn } from "node:child_process";
import { access, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const PRODUCTS = ["admin", "cutter", "smart"];

function parseArgs(argv) {
  const args = { product: "", json: false, dryRun: false, continueOnError: false, timeoutMs: DEFAULT_TIMEOUT_MS, summaryOut: "", releaseManifest: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = () => argv[++index];
    if (token === "--product") args.product = next() ?? "";
    else if (token === "--admin-root") args.adminRoot = next();
    else if (token === "--cutter-root") args.cutterRoot = next();
    else if (token === "--smart-root") args.smartRoot = next();
    else if (token === "--repos-root") args.reposRoot = next();
    else if (token === "--json") args.json = true;
    else if (token === "--dry-run") args.dryRun = true;
    else if (token === "--continue-on-error") args.continueOnError = true;
    else if (token === "--timeout-ms") args.timeoutMs = Math.max(1000, Number.parseInt(next() ?? "", 10) || DEFAULT_TIMEOUT_MS);
    else if (token === "--summary-out") args.summaryOut = next() ?? "";
    else if (token === "--release-manifest") args.releaseManifest = next() ?? "";
    else if (token === "--help" || token === "-h") { console.log("product-pipeline.mjs: 见文件头注释"); process.exit(0); }
    else { console.error("未知参数: " + token); process.exit(2); }
  }
  if (!PRODUCTS.includes(args.product)) {
    console.error("--product 必须是 admin|cutter|smart 之一");
    process.exit(2);
  }
  return args;
}

function resolveRepos(args) {
  const reposRoot = args.reposRoot ? path.resolve(args.reposRoot) : "";
  const pick = (flag, envName, dirName) => {
    const value = flag || process.env[envName] || (reposRoot ? path.join(reposRoot, dirName) : "");
    return value ? path.resolve(value) : "";
  };
  const repos = {
    admin: pick(args.adminRoot, "MIXLAB_ADMIN_ROOT", "mixlab"),
    cutter: pick(args.cutterRoot, "MIXLAB_CUTTER_ROOT", "mixlab-cutter"),
    smart: pick(args.smartRoot, "MIXLAB_SMART_ROOT", "mixlab-smart-cutter")
  };
  const missing = Object.entries(repos).filter(([, root]) => !root).map(([name]) => name);
  if (missing.length) {
    console.error("缺少仓库路径: " + missing.join(", ") + "（用 --admin-root/--cutter-root/--smart-root 或 --repos-root）");
    process.exit(2);
  }
  return repos;
}

async function localBin(repo, name) {
  for (const candidate of [path.join(repo, "node_modules", ".bin", name), path.join(repo, "node_modules", ".bin", name + ".cmd")]) {
    if (await access(candidate).then(() => true, () => false)) return candidate;
  }
  return "";
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); if (stdout.length > 2_000_000) stdout = stdout.slice(-2_000_000); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); if (stderr.length > 2_000_000) stderr = stderr.slice(-2_000_000); });
    child.on("error", (error) => resolve({ exit_code: -1, signal: null, timed_out: false, duration_ms: Date.now() - startedAt, stdout, stderr: stderr + "\n" + error.message }));
    child.on("close", (code, signal) => resolve({ exit_code: code === null ? -1 : code, signal, timed_out: signal === "SIGTERM" && Date.now() - startedAt >= (options.timeoutMs ?? DEFAULT_TIMEOUT_MS) - 1000, duration_ms: Date.now() - startedAt, stdout, stderr }));
  });
}

function parseTestCounts(text) {
  const grab = (label) => {
    const match = new RegExp("ℹ " + label + " ([0-9]+)").exec(text);
    return match ? Number(match[1]) : undefined;
  };
  return { tests: grab("tests"), pass: grab("pass"), fail: grab("fail") };
}

function logTail(text, max = 1500) {
  const trimmed = String(text ?? "").trim();
  return trimmed.length > max ? trimmed.slice(-max) : trimmed;
}

function step(name, status, extra = {}) {
  return { name, status, ...extra };
}

async function main() {
  const startedAt = new Date().toISOString();
  const args = parseArgs(process.argv.slice(2));
  const repos = resolveRepos(args);
  const productRepo = repos[args.product];
  const steps = [];
  const plan = [
    { name: "typecheck", detail: "tsc -p tsconfig.json --noEmit" },
    { name: "shared_packages_gate", detail: "contracts + library-format + service-clients 三仓 sha256" },
    { name: "contracts_6_invariants", detail: "node --test packages/contracts/src/contracts.test.ts" },
    { name: "product_tests", detail: "npm test" },
    { name: "release_manifest_check", detail: args.releaseManifest ? "validate " + args.releaseManifest : "skipped（未提供 --release-manifest）" }
  ];

  if (args.dryRun) {
    const summary = { pipeline: "product-pipeline", product: args.product, repo: productRepo, dry_run: true, ok: true, started_at: startedAt, steps: plan.map((item) => step(item.name, "planned", { detail: item.detail })) };
    emit(summary, args);
    if (args.summaryOut) await writeFile(args.summaryOut, JSON.stringify(summary, null, 2) + "\n", "utf8");
    return 0;
  }

  const record = (entry) => { steps.push(entry); if (entry.status === "failed" && !args.continueOnError) throw new PipelineFailure(entry.name); };

  try {
  // 1) typecheck
  {
    const tsc = await localBin(productRepo, "tsc");
    const command = tsc || "npx";
    const commandArgs = tsc ? ["-p", "tsconfig.json", "--noEmit"] : ["--no-install", "tsc", "-p", "tsconfig.json", "--noEmit"];
    const result = await run(command, commandArgs, { cwd: productRepo, timeoutMs: args.timeoutMs });
    record(step("typecheck", result.exit_code === 0 ? "passed" : "failed", {
      exit_code: result.exit_code, duration_ms: result.duration_ms,
      detail: tsc ? "local tsc" : "npx --no-install tsc",
      log_tail: result.exit_code === 0 ? "" : logTail(result.stdout + "\n" + result.stderr)
    }));
  }

  // 2) 共享包 hash 门禁（子进程保证与 CI/本地一致）
  {
    const result = await run(process.execPath, [path.join(SCRIPT_DIR, "shared-packages-gate.mjs"),
      "--admin-root", repos.admin, "--cutter-root", repos.cutter, "--smart-root", repos.smart, "--json"],
      { cwd: productRepo, timeoutMs: Math.min(args.timeoutMs, 120_000) });
    let gateSummary = null;
    try { gateSummary = JSON.parse(result.stdout); } catch { gateSummary = null; }
    record(step("shared_packages_gate", result.exit_code === 0 && gateSummary?.ok === true ? "passed" : "failed", {
      exit_code: result.exit_code, duration_ms: result.duration_ms,
      detail: gateSummary ? "packages=" + gateSummary.packages.map((item) => item.package + ":" + item.status).join(",") : "无法解析 gate 输出",
      log_tail: result.exit_code === 0 ? "" : logTail(result.stdout + "\n" + result.stderr)
    }));
  }

  // 3) contracts 6 项
  {
    const result = await run(process.execPath, ["--test", "--import", "tsx", "packages/contracts/src/contracts.test.ts"], { cwd: productRepo, timeoutMs: Math.min(args.timeoutMs, 300_000) });
    const counts = parseTestCounts(result.stdout);
    const ok = result.exit_code === 0 && (counts.fail ?? 1) === 0 && (counts.tests ?? 0) >= 6;
    record(step("contracts_6_invariants", ok ? "passed" : "failed", {
      exit_code: result.exit_code, duration_ms: result.duration_ms,
      detail: "tests=" + (counts.tests ?? "?") + " pass=" + (counts.pass ?? "?") + " fail=" + (counts.fail ?? "?"),
      log_tail: ok ? "" : logTail(result.stdout + "\n" + result.stderr)
    }));
  }

  // 4) 单产品全量测试
  {
    const result = await run("npm", ["test"], { cwd: productRepo, timeoutMs: args.timeoutMs, env: { CI: "1", NO_COLOR: "1" } });
    const counts = parseTestCounts(result.stdout);
    record(step("product_tests", result.exit_code === 0 ? "passed" : "failed", {
      exit_code: result.exit_code, duration_ms: result.duration_ms,
      detail: "tests=" + (counts.tests ?? "?") + " pass=" + (counts.pass ?? "?") + " fail=" + (counts.fail ?? "?"),
      log_tail: result.exit_code === 0 ? "" : logTail(result.stdout + "\n" + result.stderr, 3000)
    }));
  }

  // 5) 可选 release manifest check（只读）
  if (args.releaseManifest) {
    const result = await run(process.execPath, ["--import", "tsx", path.join(SCRIPT_DIR, "check-release-manifest.mjs"),
      "--repo", productRepo, "--manifest", args.releaseManifest, "--json"], { cwd: productRepo, timeoutMs: Math.min(args.timeoutMs, 120_000) });
    let check = null;
    try { check = JSON.parse(result.stdout); } catch { check = null; }
    record(step("release_manifest_check", result.exit_code === 0 && check?.ok === true ? "passed" : "failed", {
      exit_code: result.exit_code, duration_ms: result.duration_ms,
      detail: check ? "release_id=" + (check.release_id || "?") + " files=" + (check.file_count ?? "?") : "无法解析 manifest check 输出",
      log_tail: result.exit_code === 0 ? "" : logTail(result.stdout + "\n" + result.stderr)
    }));
  } else {
    steps.push(step("release_manifest_check", "skipped", { detail: "未提供 --release-manifest" }));
  }
  } catch (error) {
    if (!(error instanceof PipelineFailure)) throw error;
  }

  const summary = { pipeline: "product-pipeline", product: args.product, repo: productRepo, ok: steps.every((entry) => entry.status === "passed" || entry.status === "skipped"), started_at: startedAt, finished_at: new Date().toISOString(), steps };
  emit(summary, args);
  if (args.summaryOut) await writeFile(args.summaryOut, JSON.stringify(summary, null, 2) + "\n", "utf8");
  return summary.ok ? 0 : 1;
}

class PipelineFailure extends Error {
  constructor(stepName) { super("步骤失败: " + stepName); this.stepName = stepName; }
}

function emit(summary, args) {
  const lines = ["== 产品流水线: " + summary.product + " (" + summary.repo + ") =="];
  for (const entry of summary.steps) {
    lines.push("[" + entry.status + "] " + entry.name + (entry.detail ? "  " + entry.detail : ""));
  }
  lines.push("结论: " + (summary.ok ? "PASS" : "FAIL"));
  if (args.json) {
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
    process.stderr.write(lines.join("\n") + "\n");
  } else {
    console.log(lines.join("\n"));
  }
}

main().then((code) => {
  process.exit(typeof code === "number" ? code : 1);
}).catch((error) => {
  if (error instanceof PipelineFailure) process.exit(1);
  console.error("product-pipeline 异常: " + (error?.stack || error));
  process.exit(1);
});
