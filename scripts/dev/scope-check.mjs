#!/usr/bin/env node
/**
 * 写入域守卫（自动化防冲突核心）：
 * 根据当前分支角色检查改动文件是否越界。
 *
 * 用法：
 *   node scripts/dev/scope-check.mjs --staged
 *   node scripts/dev/scope-check.mjs --range origin/dev/cutter
 *   node scripts/dev/scope-check.mjs --role windows --files "a.ts,b.ts"
 *
 * 规则：
 * - dev/cutter（Windows）：只能改剪辑端目录；共享内容只能"同步"（内容必须等于 dev/admin）。
 * - dev/admin（Mac）：只能改管理端/平台/共享内容；不能改剪辑端产品目录。
 * - 任何分支：禁止 .env / 密钥 / docs/acceptance/artifacts / node_modules。
 */
import { execFileSync } from "node:child_process";

const WINDOWS_WRITE = [
  "apps/cutter-web/",
  "apps/cutter-desktop/",
  "packages/cutter-api/",
  "packages/cutter-local/",
  "packages/ffmpeg-core/",
  "packages/desktop-runtime/",
  "packages/windows-test-runner/",
  "scripts/desktop/",
  "scripts/acceptance/windows-",
  "scripts/servers/cutter-api-server.ts",
  "docs/handoff/status/windows-latest.md",
  "docs/handoff/mail/outbox-windows/"
];
const SYNC_ONLY = [
  "packages/contracts/",
  "packages/library-format/",
  "packages/service-clients/",
  "packages/protocol/",
  "scripts/dev/",
  "scripts/smoke/",
  "docs/handoff/",
  ".github/workflows/sync-guard.yml",
  ".github/workflows/windows-status-notify.yml",
  "AGENTS.md"
];
const MAC_DENY = [ ...WINDOWS_WRITE.map((prefix) => prefix) ];
const FORBIDDEN = [
  "node_modules/",
  "docs/acceptance/artifacts/"
];
const FORBIDDEN_PATTERNS = [
  /(^|\/)\.env(\.|$)/,
  /\.pem$/,
  /\.key$/,
  /(^|\/)id_rsa/,
  /(^|\/)secrets?\./,
  /(^|\/)credentials?\./
];

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function gitTry(args) {
  try {
    return git(args);
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const parsed = { role: "", staged: false, range: "", files: "", json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--role") parsed.role = argv[++index] ?? "";
    else if (arg === "--staged") parsed.staged = true;
    else if (arg === "--range") parsed.range = argv[++index] ?? "";
    else if (arg === "--files") parsed.files = argv[++index] ?? "";
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--help" || arg === "-h") parsed.help = true;
  }
  return parsed;
}

function currentBranch() {
  return gitTry(["rev-parse", "--abbrev-ref", "HEAD"]) || "";
}

function inferRole(branch) {
  if (branch === "dev/cutter") return "windows";
  return "mac";
}

function listFiles(args, role) {
  if (args.files) return args.files.split(",").map((file) => file.trim()).filter(Boolean).sort();
  if (args.staged) {
    return (gitTry(["diff", "--cached", "--name-only", "--diff-filter=ACMRT"]) || "")
      .split("\n").filter(Boolean).sort();
  }
  if (args.range) {
    const output = gitTry(["diff", "--name-only", "--diff-filter=ACMRT", args.range + "..HEAD"]);
    return (output || "").split("\n").filter(Boolean).sort();
  }
  console.error("需要 --staged / --range <rev> / --files <列表> 之一");
  process.exit(2);
}

function startsWithAny(file, prefixes) {
  return prefixes.some((prefix) => file === prefix || file.startsWith(prefix));
}

function forbiddenReason(file) {
  if (startsWithAny(file, FORBIDDEN)) return "禁止提交的生成物/依赖目录";
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(file)) return "疑似密钥/环境变量文件";
  }
  return "";
}

function syncOnlyMatchesAdmin(files) {
  if (files.length === 0) return { ok: true, detail: "" };
  const diff = gitTry(["diff", "--stat", "origin/dev/admin", "--", ...files]);
  if (diff === null) {
    return { ok: false, detail: "无法读取 origin/dev/admin（先执行 git fetch origin dev/admin）" };
  }
  return diff === "" ? { ok: true, detail: "" } : { ok: false, detail: diff };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("用法: node scripts/dev/scope-check.mjs --staged | --range <rev> | --files <a,b> [--role mac|windows] [--json]");
    process.exit(0);
  }
  const branch = currentBranch();
  if (branch.startsWith("integ/") && !args.role) {
    console.log("SCOPE_CHECK=PASS (integration branch " + branch + ")");
    return;
  }
  const role = args.role || inferRole(branch);
  if (role !== "mac" && role !== "windows") {
    console.error("role 必须是 mac 或 windows");
    process.exit(2);
  }
  const files = listFiles(args, role);
  if (files.length === 0) {
    console.log("SCOPE_CHECK=PASS (no files)");
    return;
  }

  const violations = [];
  const syncFiles = [];
  let unknown = 0;

  for (const file of files) {
    const forbidden = forbiddenReason(file);
    if (forbidden) {
      violations.push({ file, reason: forbidden });
      continue;
    }
    if (role === "windows") {
      if (startsWithAny(file, WINDOWS_WRITE)) continue;
      if (startsWithAny(file, SYNC_ONLY)) {
        syncFiles.push(file);
        continue;
      }
      // 根级配置文件允许（package-lock 等），其余越界。
      if (file === "package-lock.json" || file === "package.json") continue;
      violations.push({ file, reason: "Windows 只能改剪辑端目录或同步共享内容" });
      continue;
    }
    if (startsWithAny(file, MAC_DENY)) {
      violations.push({ file, reason: "Mac 不能改剪辑端产品目录" });
      continue;
    }
    unknown += 0;
  }

  if (role === "windows" && syncFiles.length > 0) {
    const check = syncOnlyMatchesAdmin(syncFiles);
    if (!check.ok) {
      violations.push({ file: syncFiles.join(", "), reason: "共享内容与 dev/admin 不一致：" + check.detail.split("\n")[0] });
    }
  }

  const result = {
    ok: violations.length === 0,
    role,
    branch,
    checked_files: files.length,
    sync_only_files: syncFiles.length,
    violations
  };
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("角色: " + role + "  分支: " + branch + "  检查文件: " + files.length);
    if (syncFiles.length > 0) console.log("共享同步文件: " + syncFiles.length + "（需与 dev/admin 一致）");
    if (violations.length === 0) console.log("SCOPE_CHECK=PASS");
    else {
      console.log("SCOPE_CHECK=FAIL");
      for (const violation of violations) console.log(" - " + violation.file + " : " + violation.reason);
      console.log("");
      console.log("规则：Windows 只改剪辑端目录；共享包/脚本/协议只能从 dev/admin 同步；Mac 不改剪辑端目录。");
    }
  }
  process.exit(violations.length === 0 ? 0 : 1);
}

main();
