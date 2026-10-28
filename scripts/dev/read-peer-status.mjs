#!/usr/bin/env node
/**
 * 读取对方机器的状态报告（Git 信箱）。
 *
 * 用法：node scripts/dev/read-peer-status.mjs --peer windows [--no-fetch]
 *
 * 自动 git fetch 对方分支，然后 git show 读取 docs/handoff/status/<peer>-latest.md，
 * 不修改工作区、不 merge。
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

const PEER_BRANCH = { mac: "dev/admin", windows: "dev/cutter" };

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function gitTry(args) {
  try {
    return git(args);
  } catch (error) {
    return null;
  }
}

function parseArgs(argv) {
  const parsed = { peer: "", noFetch: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--peer") parsed.peer = argv[++index] ?? "";
    else if (argv[index] === "--no-fetch") parsed.noFetch = true;
    else if (argv[index] === "--help" || argv[index] === "-h") parsed.help = true;
  }
  return parsed;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.peer) {
    console.log("用法: node scripts/dev/read-peer-status.mjs --peer mac|windows [--no-fetch]");
    process.exit(args.help ? 0 : 2);
  }
  const branch = PEER_BRANCH[args.peer];
  if (!branch) {
    console.error("peer 必须是 mac 或 windows");
    process.exit(2);
  }
  const repoRoot = git(["rev-parse", "--show-toplevel"]);
  process.chdir(repoRoot);

  if (!args.noFetch) {
    const fetched = gitTry(["fetch", "origin", branch]);
    if (fetched === null) {
      console.error("git fetch origin " + branch + " 失败（网络或权限问题）");
      process.exit(1);
    }
  }

  const remoteHead = gitTry(["rev-parse", "origin/" + branch]);
  const reportPath = "docs/handoff/status/" + args.peer + "-latest.md";
  const content = gitTry(["show", "origin/" + branch + ":" + reportPath]);
  if (content === null) {
    console.log("还没有找到 " + args.peer + " 的状态报告：" + reportPath);
    console.log("请对方执行：node scripts/dev/sync-report.mjs --role " + args.peer);
    console.log("然后 git add/commit/push 到自己的分支。");
    process.exit(1);
  }

  console.log("=== PEER STATUS ===");
  console.log("peer: " + args.peer);
  console.log("branch: origin/" + branch + " @ " + (remoteHead ? remoteHead.slice(0, 8) : "unknown"));
  console.log("path: " + reportPath);
  console.log("");
  console.log(content);
  console.log("");
  console.log("=== END PEER STATUS ===");
}

main();
