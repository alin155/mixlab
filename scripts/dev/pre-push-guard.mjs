#!/usr/bin/env node
/**
 * pre-push 守卫：
 * 1) 拒绝向交付分支推送"落后远端"的提交（必须 pull --rebase）；
 * 2) 拒绝在交付分支上推送 merge commit；
 * 3) 按分支角色检查越界文件；
 * 4) Windows 分支推送前要求共享内容已与 dev/admin 同步。
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const DELIVERY_BRANCHES = new Set(["dev/admin", "dev/cutter"]);
const ROLE_BY_BRANCH = { "dev/admin": "mac", "dev/cutter": "windows" };
const SHARED_DIRS = ["packages/contracts", "packages/library-format", "packages/service-clients", "packages/protocol"];

function git(args, input) {
  return execFileSync("git", args, { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] }).trim();
}

function gitTry(args) {
  try {
    return git(args);
  } catch {
    return null;
  }
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function runNode(args) {
  try {
    return execFileSync("node", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

function main() {
  const input = readStdin();
  const lines = input.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    console.log("PRE_PUSH=PASS (no refs)");
    return;
  }
  const failures = [];
  for (const line of lines) {
    const [localRef, localSha, remoteRef, remoteSha] = line.split(" ");
    const branch = localRef.replace(/^refs\/heads\//, "");
    if (!DELIVERY_BRANCHES.has(branch)) continue;
    const role = ROLE_BY_BRANCH[branch];

    const fetched = gitTry(["fetch", "--quiet", "origin", branch]);
    if (fetched === null) {
      failures.push("git fetch origin " + branch + " 失败（网络/权限）");
      continue;
    }
    const latestRemote = gitTry(["rev-parse", "origin/" + branch]) || (remoteSha !== "0000000000000000000000000000000000000000" ? remoteSha : "");
    if (latestRemote) {
      const behind = Number(gitTry(["rev-list", "--count", localSha + ".." + latestRemote]) || "0");
      if (behind > 0) {
        failures.push("origin/" + branch + " 有 " + behind + " 个新提交，请先 git pull --rebase origin " + branch);
        continue;
      }
      const merges = (gitTry(["rev-list", "--merges", latestRemote + ".." + localSha]) || "").split("\n").filter(Boolean);
      if (merges.length > 0) {
        failures.push("交付分支禁止 merge commit（" + merges.length + " 个），请用 rebase/cherry-pick 或重新提交");
      }
      const scope = runNode(["scripts/dev/scope-check.mjs", "--range", latestRemote, "--role", role]);
      if (scope === null) {
        failures.push("写入域检查失败（scope-check 返回非 0）");
      }
      if (role === "windows") {
        const sharedDiff = gitTry(["diff", "--stat", "origin/dev/admin", "--", ...SHARED_DIRS]);
        if (sharedDiff === null) {
          failures.push("无法读取 origin/dev/admin，请先 git fetch origin dev/admin");
        } else if (sharedDiff !== "") {
          failures.push("共享内容与 dev/admin 不一致，请先执行 node scripts/dev/shared-sync.mjs --apply 并提交");
        }
      }
    }
  }
  if (failures.length > 0) {
    console.error("PRE_PUSH=FAIL");
    for (const failure of failures) console.error(" - " + failure);
    console.error("");
    console.error("如确实需要绕过（不推荐）：git push --no-verify");
    process.exit(1);
  }
  console.log("PRE_PUSH=PASS");
}

main();
