#!/usr/bin/env node
/**
 * Codex third-party advisor (read-only). Reviews new Git Mailbox messages and posts
 * an advisory message back to outbox-mac. Codex runs in a read-only sandbox over a
 * temporary repo snapshot; it has no git/deploy write access.
 *
 * usage: node scripts/dev/advisor.mjs run [--limit 20] [--no-push]
 *        node scripts/dev/advisor.mjs watch [--interval 60]
 */
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ROLE_BRANCH = "dev/admin";
const PEER_BRANCH = "dev/cutter";
const OUTBOX_MAC = "docs/handoff/mail/outbox-mac";
const OUTBOX_WIN = "docs/handoff/mail/outbox-windows";
const STATE_FILE = ".git/mixlab-mail/advisor-state.json";
const ADVISOR_FROM = "codex-advisor";
const NL = String.fromCharCode(10);
const CODEX_CLI = process.env.MIXLAB_CODEX_CLI || "/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex";

function parseArgs(argv) {
  const args = { command: "run", interval: 60, limit: 20, noPush: false };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "run" || value === "watch") args.command = value;
    else if (value === "--interval") args.interval = Math.max(15, Number(argv[++i] || 60));
    else if (value === "--limit") args.limit = Math.max(1, Number(argv[++i] || 20));
    else if (value === "--no-push") args.noPush = true;
  }
  return args;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function gitTry(args) {
  try { return git(args); } catch { return null; }
}

function currentBranch() { return gitTry(["branch", "--show-current"]) || ""; }

function parseJson(text) { try { return JSON.parse(text); } catch { return null; } }

async function localMessages(repo, relativeDir) {
  const dir = path.join(repo, relativeDir);
  let names = [];
  try { names = (await readdir(dir)).filter((name) => name.endsWith(".json")); } catch { return []; }
  const messages = [];
  for (const name of names) {
    const raw = await readFile(path.join(dir, name), "utf8").catch(() => null);
    const message = raw ? parseJson(raw) : null;
    if (message && typeof message.id === "string") messages.push(message);
  }
  return messages;
}

function remoteMessages(branch, relativeDir) {
  gitTry(["fetch", "origin", branch]);
  const ref = "origin/" + branch;
  const listing = gitTry(["ls-tree", "-r", "--name-only", ref, "--", relativeDir]);
  if (!listing) return [];
  const messages = [];
  for (const file of listing.split("\n").filter((name) => name.endsWith(".json"))) {
    const raw = gitTry(["show", ref + ":" + file]);
    const message = raw ? parseJson(raw) : null;
    if (message && typeof message.id === "string") messages.push(message);
  }
  return messages;
}

async function loadState(repo) {
  const raw = await readFile(path.join(repo, STATE_FILE), "utf8").catch(() => null);
  const parsed = raw ? parseJson(raw) : null;
  return {
    reviewed_ids: Array.isArray(parsed?.reviewed_ids) ? parsed.reviewed_ids : [],
    last_run: typeof parsed?.last_run === "string" ? parsed.last_run : ""
  };
}

async function saveState(repo, state) {
  await mkdir(path.join(repo, ".git/mixlab-mail"), { recursive: true });
  await writeFile(path.join(repo, STATE_FILE), JSON.stringify(state, null, 2) + "\n", "utf8");
}

function summary(message) {
  return [
    "### " + message.id,
    "- from=" + message.from + " to=" + message.to + " type=" + message.type,
    "- created_at=" + message.created_at,
    "",
    "~~~text",
    String(message.body || "").slice(0, 4000),
    "~~~"
  ].join("\n");
}

function makePrompt(count, info) {
  const lines = [
    "你是 MixLab Cutter 的第三方技术顾问（Codex），独立评审 Mac/Windows 通过 Git Mailbox 的方案与结果。",
    "评审对象：仓库快照已切换到 " + (info.target || "main") + "（" + (info.targetCommit || "").slice(0, 12) + "）；对比基线 main（" + (info.mainCommit || "").slice(0, 12) + "）。",
    "严格约束：只给建议，不参与实施，不修改任何文件，不执行写操作或 git 写操作。",
    "先读 REVIEW-PACKET.md；可继续阅读快照里的代码、docs、DIFF.patch、TARGET-COMMITS.txt 核实事实。",
    "输出格式（中文 Markdown，开头写【Codex 顾问意见】）：",
    "## 总体判断",
    "一段话说明本批是否可推进/是否阻塞发布。",
    "### 消息 <message_id>",
    "- 判定：同意 / 警惕 / 需补充信息 / 阻塞发布",
    "- 严重级别：P0/P1/P2/P3",
    "- 事实判断：引用代码或证据",
    "- 问题/风险：具体、可执行",
    "- 建议：具体到下一步",
    "- 需要证据：如果没有就写无",
    "## 跨消息建议",
    "3-5 条。不要重复之前顾问已提出且未出现回归的事项；每条消息意见尽量不超过 300 字。"
  ];
  lines.push("本次评审消息数量：" + count);
  return lines.join(NL);
}

async function snapshot(repo, messages) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mixlab-advisor-"));
  const target = process.env.MIXLAB_ADVISOR_TARGET_BRANCH ||
    (gitTry(["rev-parse", "--verify", "origin/hotfix/0.18.13"]) ? "origin/hotfix/0.18.13" : "main");
  const targetCommit = gitTry(["rev-parse", target]) || "";
  const mainCommit = gitTry(["rev-parse", "main"]) || "";
  let archiveTarget = target;
  try {
    execFileSync("bash", ["-c", "git archive " + archiveTarget + " | tar -x -C " + JSON.stringify(dir)], { cwd: repo, stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    archiveTarget = "main";
    execFileSync("bash", ["-c", "git archive main | tar -x -C " + JSON.stringify(dir)], { cwd: repo, stdio: ["ignore", "pipe", "pipe"] });
  }
  const targetLog = gitTry(["log", target, "--oneline", "-30"]) || "";
  const mainLog = gitTry(["log", "main", "--oneline", "-15"]) || "";
  const diffStat = gitTry(["diff", "--stat", "main..." + target]) || "";
  const diffPatch = (gitTry(["diff", "main..." + target]) || "").slice(0, 120000);
  const statusWindows = gitTry(["show", "origin/dev/cutter:docs/handoff/status/windows-latest.md"]) || "";
  const statusMac = gitTry(["show", "dev/admin:docs/handoff/status/mac-latest.md"]) || "";
  const previous = (await localMessages(repo, OUTBOX_MAC))
    .filter((message) => message.from === ADVISOR_FROM)
    .slice(-3);
  const packet = [
    "# Codex advisor review packet",
    "- generated_at: " + new Date().toISOString(),
    "- snapshot_branch: " + archiveTarget,
    "- snapshot_commit: " + (gitTry(["rev-parse", archiveTarget]) || ""),
    "- target_branch: " + target,
    "- target_commit: " + targetCommit,
    "- main_commit: " + mainCommit,
    "- new_message_count: " + messages.length,
    "",
    "## New messages",
    messages.map(summary).join(NL + NL),
    "",
    "## Diff stat (main...target)",
    "~~~text",
    diffStat.slice(0, 12000),
    "~~~",
    "",
    "## Target commits",
    "~~~text",
    targetLog,
    "~~~",
    "",
    "## Main recent commits",
    "~~~text",
    mainLog,
    "~~~",
    "",
    "## Windows status",
    "~~~text",
    statusWindows.slice(0, 6000),
    "~~~",
    "",
    "## Mac status",
    "~~~text",
    statusMac.slice(0, 4000),
    "~~~",
    "",
    "## Previous advisor opinions（避免重复；只有出现回归才重申）",
    previous.map((message) => message.id + ":" + NL + String(message.body || "").slice(0, 1200)).join(NL + NL)
  ].join(NL);
  await writeFile(path.join(dir, "REVIEW-PACKET.md"), packet, "utf8");
  await writeFile(path.join(dir, "DIFF.patch"), diffPatch, "utf8");
  await writeFile(path.join(dir, "TARGET-COMMITS.txt"), targetLog, "utf8");
  return { dir: dir, target: target, archiveTarget: archiveTarget, targetCommit: targetCommit, mainCommit: mainCommit };
}

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function runCodex(dir, prompt) {
  const advicePath = path.join(dir, "ADVICE.md");
  const attempts = Math.max(1, Number(process.env.MIXLAB_ADVISOR_RETRIES || 3));
  const model = (process.env.MIXLAB_ADVISOR_MODEL || "").trim();
  let lastError = "";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const args = [
      "exec", "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral",
      "-C", dir, "-o", advicePath
    ];
    if (model) {
      args.push("-m", model);
    }
    args.push(prompt);
    const result = spawnSync(CODEX_CLI, args, { cwd: dir, encoding: "utf8", timeout: 600000, maxBuffer: 64 * 1024 * 1024, env: process.env });
    if (result.error) {
      lastError = result.error.message;
    } else if (result.status === 0) {
      const advice = requireReadFile(advicePath);
      if (advice) return advice;
      lastError = "codex produced empty advice";
    } else {
      lastError = "codex exit=" + result.status + " " + String(result.stderr || "").slice(-800);
    }
    console.error("[advisor] codex attempt " + attempt + "/" + attempts + " failed: " + lastError.slice(0, 400));
    if (attempt < attempts) {
      sleepSync(30000 * attempt);
    }
  }
  throw new Error("codex failed after retries: " + lastError.slice(0, 1000));
}

function requireReadFile(filePath) {
  try {
    return readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

async function postAdvisory(repo, advice, messages, options, info) {
  const id = Date.now() + "-" + randomUUID().slice(0, 8);
  const message = {
    schema_version: "1",
    id: id,
    from: ADVISOR_FROM,
    to: "all",
    type: "notice",
    thread: id,
    created_at: new Date().toISOString(),
    flags: { needs: "none", advisor: true, reviewed_ids: messages.map((message) => message.id).slice(-100) },
    body: "【Codex 顾问意见｜自动评审 " + messages.length + " 条】\n\n" + advice
  };
  const relativeFile = OUTBOX_MAC + "/" + id + ".json";
  await mkdir(path.join(repo, OUTBOX_MAC), { recursive: true });
  await writeFile(path.join(repo, relativeFile), JSON.stringify(message, null, 2) + "\n", "utf8");
  git(["add", relativeFile]);
  git(["commit", "-m", "[mail][codex-advisor→all] advisory " + id]);
  if (!options.noPush) {
    if (gitTry(["push", "origin", ROLE_BRANCH]) === null) throw new Error("advisor push failed");
    gitTry(["fetch", "origin", ROLE_BRANCH]);
    if (gitTry(["cat-file", "-e", "origin/" + ROLE_BRANCH + ":" + relativeFile]) === null) {
      throw new Error("advisor push verification failed");
    }
  }
  return { id: id, file: relativeFile };
}

async function runOnce(args) {
  const repo = git(["rev-parse", "--show-toplevel"]);
  process.chdir(repo);
  if (currentBranch() !== ROLE_BRANCH) {
    console.log("[advisor] skip: current branch " + (currentBranch() || "detached") + " != " + ROLE_BRANCH);
    return { skipped: true };
  }
  const state = await loadState(repo);
  const messages = [...await localMessages(repo, OUTBOX_MAC), ...remoteMessages(PEER_BRANCH, OUTBOX_WIN)]
    .filter((message) => message.from === "mac" || message.from === "windows")
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const reviewed = new Set(state.reviewed_ids);
  let fresh = messages.filter((message) => !reviewed.has(message.id));
  if (state.reviewed_ids.length === 0) fresh = fresh.slice(-args.limit);
  if (fresh.length > args.limit) fresh = fresh.slice(-args.limit);
  if (fresh.length === 0) {
    state.last_run = new Date().toISOString();
    await saveState(repo, state);
    console.log("[advisor] no new messages");
    return { reviewed: 0 };
  }
  console.log("[advisor] reviewing " + fresh.length + " messages");
  const startedAt = Date.now();
  const info = await snapshot(repo, fresh);
  console.log("[advisor] snapshot ready target=" + info.target + "@" + (info.targetCommit || "").slice(0, 12));
  let advice = "";
  try {
    console.log("[advisor] codex start");
    advice = await runCodex(info.dir, makePrompt(fresh.length, info));
    console.log("[advisor] codex done");
  } finally {
    await rm(info.dir, { recursive: true, force: true });
  }
  if (currentBranch() !== ROLE_BRANCH) {
    console.log("[advisor] branch changed during review to " + (currentBranch() || "detached") + "；跳过发布，下轮重试。");
    return { reviewed: 0, skipped_branch_change: true };
  }

  const posted = await postAdvisory(repo, advice, fresh, args, info);
  state.reviewed_ids = state.reviewed_ids.concat(fresh.map((message) => message.id)).slice(-2000);
  state.last_run = new Date().toISOString();
  state.last_target = info.target;
  state.last_target_commit = info.targetCommit;
  state.last_duration_ms = Date.now() - startedAt;
  await saveState(repo, state);
  console.log("[advisor] posted " + posted.id + " (" + posted.file + ")");
  return { reviewed: fresh.length, advisory_id: posted.id };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "watch") {
    console.log("[advisor] watch interval=" + args.interval + "s");
    const loop = async () => {
      try { await runOnce(args); } catch (error) { console.error("[advisor] error: " + (error instanceof Error ? error.message : String(error))); }
      setTimeout(loop, args.interval * 1000);
    };
    await loop();
    return;
  }
  console.log(JSON.stringify(await runOnce(args)));
}

main().catch((error) => { console.error("[advisor] fatal: " + (error instanceof Error ? error.stack || error.message : String(error))); process.exit(1); });
