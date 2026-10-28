#!/usr/bin/env node
/**
 * 会话开始自检（Mac/Windows 通用）：
 *   node scripts/dev/session-start.mjs
 *
 * 输出：分支/HEAD/工作区状态/远端领先落后/共享同步状态/对方最新状态/建议命令。
 * 只读，不修改仓库。
 */
import { execFileSync } from "node:child_process";

const SHARED_DIRS = ["packages/contracts", "packages/library-format", "packages/service-clients", "packages/protocol"];
const PEER_BY_BRANCH = { "dev/admin": "windows", "dev/cutter": "mac" };

function run(command, args) {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

function main() {
  const noFetch = process.argv.includes("--no-fetch");
  const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]) || "unknown";
  const head = run("git", ["rev-parse", "--short", "HEAD"]) || "unknown";
  const subject = run("git", ["log", "-1", "--pretty=%s"]) || "";
  const dirty = (run("git", ["status", "--porcelain"]) || "").split("\n").filter(Boolean).length;

  console.log("=== SESSION START ===");
  console.log("branch: " + branch + "@" + head + "  " + subject);
  console.log("dirty: " + dirty + " 项");

  if (!noFetch && ["dev/admin", "dev/cutter"].includes(branch)) {
    run("git", ["fetch", "origin", branch]);
    const behind = Number(run("git", ["rev-list", "--count", "HEAD..origin/" + branch]) || "0");
    const ahead = Number(run("git", ["rev-list", "--count", "origin/" + branch + "..HEAD"]) || "0");
    console.log("remote: behind " + behind + ", ahead " + ahead + (behind > 0 ? "  -> 先 git pull --rebase" : ""));
  }

  const sharedDiff = run("git", ["diff", "--stat", "origin/dev/admin", "--", ...SHARED_DIRS]);
  if (sharedDiff !== null) {
    console.log("shared_vs_admin: " + (sharedDiff === "" ? "SAME" : "DIFF（Windows 需 shared-sync；Mac 确认后同步）"));
  }

  const peer = PEER_BY_BRANCH[branch];
  if (peer) {
    console.log("");
    console.log("--- peer status (" + peer + ") ---");
    const output = run("node", ["scripts/dev/read-peer-status.mjs", "--peer", peer, "--no-fetch"]);
    console.log(output ?? "（暂无对方状态或读取失败）");
  }

  console.log("");
  console.log("建议：");
  console.log("1) 开始前 git pull --rebase");
  console.log("2) Windows: node scripts/dev/shared-sync.mjs --apply（有共享更新时）");
  console.log("3) 收工前 node scripts/dev/sync-report.mjs --role " + (branch === "dev/cutter" ? "windows" : "mac"));
  console.log("=== END SESSION START ===");
}

main();
