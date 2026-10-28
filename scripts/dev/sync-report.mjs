#!/usr/bin/env node
/**
 * 双端状态报告生成器（Mac/Windows 通用）。
 *
 * 用法：
 *   node scripts/dev/sync-report.mjs --role mac
 *   node scripts/dev/sync-report.mjs --role windows --fetch
 *
 * 输出默认写入 docs/handoff/status/<role>-latest.md，并保留文件内 MANUAL 区块。
 * 只读仓库信息，不修改代码、不提交、不推送。
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SHARED_DIRS = [
  "packages/contracts",
  "packages/library-format",
  "packages/service-clients"
];
const ROLE_BRANCH = { mac: "dev/admin", windows: "dev/cutter" };
const PEER_BY_ROLE = { mac: "windows", windows: "mac" };

function git(args, options = {}) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options }).trim();
}

function gitTry(args) {
  try {
    return git(args);
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const parsed = { role: process.env.MIXLAB_DEV_ROLE || "", out: "", fetch: false, note: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--role") parsed.role = argv[++index] ?? "";
    else if (arg === "--out") parsed.out = argv[++index] ?? "";
    else if (arg === "--note") parsed.note = argv[++index] ?? "";
    else if (arg === "--fetch") parsed.fetch = true;
    else if (arg === "--help" || arg === "-h") parsed.help = true;
  }
  return parsed;
}

function countDirty() {
  const lines = (gitTry(["status", "--porcelain"]) || "").split("\n").filter(Boolean);
  let tracked = 0;
  let untracked = 0;
  for (const line of lines) {
    if (line.startsWith("??")) untracked += 1;
    else tracked += 1;
  }
  return { tracked, untracked, total: lines.length };
}

function hashFile(absolutePath) {
  return readFile(absolutePath).then((buffer) => createHash("sha256").update(buffer).digest("hex"));
}

async function hashSharedDir(relativeDir) {
  const output = gitTry(["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", relativeDir]);
  if (output === null) return { files: 0, sha256: "unavailable" };
  const files = output.split("\0").filter(Boolean).sort();
  const lines = [];
  let counted = 0;
  for (const file of files) {
    try {
      const digest = await hashFile(file);
      lines.push(file + "\0" + digest + "\n");
      counted += 1;
    } catch {
      // 文件在工作区被删除等情况：跳过但记录条目。
      lines.push(file + "\0missing\n");
    }
  }
  return {
    files: counted,
    sha256: createHash("sha256").update(lines.join("")).digest("hex")
  };
}

function sharedVsAdmin() {
  const diff = gitTry(["diff", "--stat", "origin/dev/admin", "--", ...SHARED_DIRS]);
  if (diff === null) return { state: "unknown", detail: "origin/dev/admin 不可用（请先 git fetch）" };
  if (diff === "") return { state: "SAME", detail: "" };
  return { state: "DIFF", detail: diff };
}

function manualBlock(existing) {
  const begin = "<!-- MANUAL:BEGIN -->";
  const end = "<!-- MANUAL:END -->";
  const start = existing?.indexOf(begin) ?? -1;
  const stop = existing?.indexOf(end) ?? -1;
  if (start >= 0 && stop > start) return existing.slice(start, stop + end.length);
  return [
    begin,
    "## 人工补充（自检/阻塞/下一步）",
    "",
    "- typecheck: 待填写",
    "- tests: 待填写",
    "- blockers: 待填写",
    "- next: 待填写",
    end
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.role) {
    console.log("用法: node scripts/dev/sync-report.mjs --role mac|windows [--fetch] [--out <path>] [--note <text>]");
    process.exit(args.help ? 0 : 2);
  }
  if (!ROLE_BRANCH[args.role]) {
    console.error("role 必须是 mac 或 windows");
    process.exit(2);
  }

  const repoRoot = git(["rev-parse", "--show-toplevel"]);
  process.chdir(repoRoot);

  if (args.fetch) {
    gitTry(["fetch", "origin", "dev/admin"]);
  }

  const branch = gitTry(["rev-parse", "--abbrev-ref", "HEAD"]) || "unknown";
  const head = gitTry(["rev-parse", "HEAD"]) || "unknown";
  const headSubject = gitTry(["log", "-1", "--pretty=%s"]) || "";
  const headTime = gitTry(["log", "-1", "--pretty=%cI"]) || "";
  const dirty = countDirty();
  const shared = {};
  for (const dir of SHARED_DIRS) {
    shared[dir] = await hashSharedDir(dir);
  }
  const vsAdmin = sharedVsAdmin();
  const outPath = path.resolve(args.out || path.join("docs", "handoff", "status", args.role + "-latest.md"));
  let existing = "";
  try {
    existing = await readFile(outPath, "utf8");
  } catch {
    existing = "";
  }
  const manual = manualBlock(existing);
  const now = new Date().toISOString();
  const expectedBranch = ROLE_BRANCH[args.role];
  const lines = [
    "# " + args.role + " 状态报告",
    "",
    "- generated_at: " + now,
    "- role: " + args.role,
    "- host: " + os.hostname(),
    "- platform: " + process.platform + " " + process.arch,
    "- node_version: " + process.version,
    "- repo_root: " + repoRoot,
    "- branch: " + branch + (branch === expectedBranch ? "" : "（注意：预期 " + expectedBranch + "）"),
    "- head: " + head,
    "- head_subject: " + headSubject,
    "- head_time: " + headTime,
    "- dirty_tracked: " + dirty.tracked,
    "- dirty_untracked: " + dirty.untracked,
    "- peer_branch: " + (PEER_BY_ROLE[args.role] ? ROLE_BRANCH[PEER_BY_ROLE[args.role]] : "unknown"),
    "- shared_vs_admin: " + vsAdmin.state,
    "",
    "## 共享包指纹（当前工作区）",
    "",
    "| 目录 | 文件数 | sha256 |",
    "|---|---|---|"
  ];
  for (const dir of SHARED_DIRS) {
    lines.push("| " + dir + " | " + shared[dir].files + " | " + shared[dir].sha256 + " |");
  }
  if (args.note) {
    lines.push("", "## 本次说明", "", args.note);
  }
  if (vsAdmin.state === "DIFF") {
    lines.push("", "## 与 dev/admin 的共享包差异", "", "```", vsAdmin.detail, "```");
  }
  lines.push("", manual, "");
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, lines.join("\n"), "utf8");

  console.log(JSON.stringify({
    ok: true,
    role: args.role,
    branch,
    head: head.slice(0, 8),
    dirty,
    shared_vs_admin: vsAdmin.state,
    report: path.relative(repoRoot, outPath)
  }, null, 2));
}

main().catch((error) => {
  console.error("sync-report failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
