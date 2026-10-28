#!/usr/bin/env node
/**
 * 共享内容单向同步（Windows 使用）：只从 dev/admin 同步 Mac 拥有的共享内容。
 *
 * 默认 dry-run（只检查）；--apply 才覆盖。覆盖前如果发现你手改过共享内容会拒绝执行
 * （需要 --force 才能覆盖），避免误删 Windows 侧改动。
 *
 * 用法：
 *   node scripts/dev/shared-sync.mjs
 *   node scripts/dev/shared-sync.mjs --apply
 */
import { execFileSync } from "node:child_process";

const SHARED_PATHS = [
  "packages/contracts",
  "packages/library-format",
  "packages/service-clients",
  "packages/protocol",
  "scripts/dev",
  "docs/handoff",
  ".github/workflows/sync-guard.yml",
  ".github/workflows/windows-status-notify.yml",
  "AGENTS.md"
];
const SOURCE_BRANCH = "dev/admin";
// 状态信箱里各端自己拥有的文件：同步时保留，不参与"共享一致性"比较。
const PARITY_EXCLUDES = ["docs/handoff/status/windows-latest.md"];
const EXCLUDE_PATHSPECS = PARITY_EXCLUDES.map((file) => ":(exclude)" + file);

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
  const parsed = { apply: false, force: false, source: SOURCE_BRANCH };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--apply") parsed.apply = true;
    else if (argv[index] === "--force") parsed.force = true;
    else if (argv[index] === "--source") parsed.source = argv[++index] ?? SOURCE_BRANCH;
    else if (argv[index] === "--help" || argv[index] === "-h") parsed.help = true;
  }
  return parsed;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("用法: node scripts/dev/shared-sync.mjs [--apply] [--force] [--source dev/admin]");
    process.exit(0);
  }
  const repoRoot = git(["rev-parse", "--show-toplevel"]);
  process.chdir(repoRoot);

  const currentBranch = gitTry(["rev-parse", "--abbrev-ref", "HEAD"]) || "unknown";
  if (currentBranch === args.source) {
    console.error("当前就在 " + args.source + " 分支，不需要从自己做单向同步。");
    process.exit(2);
  }

  const fetched = gitTry(["fetch", "origin", args.source]);
  if (fetched === null) {
    console.error("git fetch origin " + args.source + " 失败（网络或权限问题）");
    process.exit(1);
  }

  const statusLines = (gitTry(["status", "--porcelain", "--", ...SHARED_PATHS]) || "").split("\n").filter(Boolean);
  const diffStat = gitTry(["diff", "--stat", "origin/" + args.source, "--", ...SHARED_PATHS, ...EXCLUDE_PATHSPECS]) || "";
  // 如果本地改动"刚好等于来源内容"（例如刚刚 git checkout origin/dev/admin -- 共享目录），
  // 这些是待提交的同步结果，不应阻止 --apply。
  const stagedVsSource = gitTry(["diff", "--cached", "--stat", "origin/" + args.source, "--", ...SHARED_PATHS, ...EXCLUDE_PATHSPECS]) ?? "";
  const effectiveDirty = statusLines.length > 0 && stagedVsSource !== "" ? statusLines : [];

  console.log("当前分支: " + currentBranch);
  console.log("来源分支: origin/" + args.source);
  console.log("共享内容本地改动: " + statusLines.length + " 项");
  console.log("与来源的差异: " + (diffStat === "" ? "无（已同步）" : "有"));

  if (diffStat === "") {
    if (statusLines.length > 0) {
      console.log("注意：本地共享内容有未提交改动，但内容与来源一致；正常提交即可。");
    }
    console.log("SYNC_STATE=IN_SYNC");
    return;
  }

  console.log("");
  console.log(diffStat);

  if (!args.apply) {
    console.log("");
    console.log("这是 dry-run。确认没有手改共享内容后，执行：");
    console.log("  node scripts/dev/shared-sync.mjs --apply");
    process.exit(1);
  }

  if (effectiveDirty.length > 0 && !args.force) {
    console.error("");
    console.error("拒绝覆盖：本地共享内容有与来源不一致的未提交改动。请先确认这些改动不应保留（Windows 不允许修改共享包），");
    console.error("如确认要丢弃并覆盖，执行：node scripts/dev/shared-sync.mjs --apply --force");
    process.exit(1);
  }

  git(["checkout", "origin/" + args.source, "--", ...SHARED_PATHS]);
  const after = gitTry(["diff", "--stat", "origin/" + args.source, "--", ...SHARED_PATHS, ...EXCLUDE_PATHSPECS]) || "";
  const changed = (gitTry(["status", "--porcelain", "--", ...SHARED_PATHS]) || "").split("\n").filter(Boolean);
  console.log("");
  console.log("已从 origin/" + args.source + " 同步 " + changed.length + " 项共享内容。");
  console.log("SYNC_STATE=" + (after === "" ? "APPLIED" : "PARTIAL"));
  console.log("");
  console.log("下一步：");
  console.log("  git add -A");
  console.log("  git commit -m \"chore(windows): sync shared content from " + args.source + "\"");
  console.log("  git push origin " + currentBranch);
  if (after !== "") {
    console.log("");
    console.log("仍有差异（可能包含被忽略/冲突文件），请检查：");
    console.log(after);
    process.exit(1);
  }
}

main();
