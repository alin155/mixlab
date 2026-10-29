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
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ROLE_BRANCH = "dev/admin";
const PEER_BRANCH = "dev/cutter";
const OUTBOX_MAC = "docs/handoff/mail/outbox-mac";
const OUTBOX_WIN = "docs/handoff/mail/outbox-windows";
const STATE_FILE = ".git/mixlab-mail/advisor-state.json";
const ADVISOR_FROM = "codex-advisor";
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

function makePrompt(count) {
  return [
    "你是 MixLab Cutter 的第三方技术顾问（Codex），评审 Mac/Windows 通过 Git Mailbox 的方案与结果。",
    "严格约束：只给建议，不参与实施，不修改任何文件，不执行写操作或 git 写操作。",
    "当前目录是只读仓库快照；先读 REVIEW-PACKET.md，再按需阅读代码/docs 核实。",
    "对每一条新消息给出：事实判断、风险/遗漏、具体建议、结论（同意/警惕/需补充信息）。",
    "最后给 3-5 条跨消息总体建议。输出中文 Markdown，开头写【Codex 顾问意见】。",
    "本次消息数量：" + count
  ].join("\n");
}

async function snapshot(repo, messages) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mixlab-advisor-"));
  execFileSync("bash", ["-c", "git archive main | tar -x -C " + JSON.stringify(dir)], { cwd: repo, stdio: ["ignore", "pipe", "pipe"] });
  const statusWindows = gitTry(["show", "origin/dev/cutter:docs/handoff/status/windows-latest.md"]) || "";
  const recentLog = gitTry(["log", "--oneline", "-30"]) || "";
  const packet = [
    "# Codex advisor review packet",
    "- generated_at: " + new Date().toISOString(),
    "- branch: " + currentBranch(),
    "- main: " + (gitTry(["rev-parse", "main"]) || "").slice(0, 12),
    "",
    "## New messages (" + messages.length + ")",
    messages.map(summary).join("\n\n"),
    "",
    "## Recent commits",
    "~~~text",
    recentLog,
    "~~~",
    "",
    "## Windows status",
    "~~~text",
    statusWindows.slice(0, 4000),
    "~~~"
  ].join("\n");
  await writeFile(path.join(dir, "REVIEW-PACKET.md"), packet, "utf8");
  return dir;
}

function runCodex(dir, prompt) {
  const advicePath = path.join(dir, "ADVICE.md");
  const result = spawnSync(CODEX_CLI, [
    "exec", "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral",
    "-C", dir, "-o", advicePath, prompt
  ], { cwd: dir, encoding: "utf8", timeout: 600000, maxBuffer: 64 * 1024 * 1024, env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("codex exit=" + result.status + " " + String(result.stderr || "").slice(-1000));
  return readFile(advicePath, "utf8").then((text) => text.trim());
}

async function postAdvisory(repo, advice, messages, options) {
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
  const dir = await snapshot(repo, fresh);
  let advice = "";
  try { advice = await runCodex(dir, makePrompt(fresh.length)); }
  finally { await rm(dir, { recursive: true, force: true }); }
  const posted = await postAdvisory(repo, advice, fresh, args);
  state.reviewed_ids = state.reviewed_ids.concat(fresh.map((message) => message.id)).slice(-2000);
  state.last_run = new Date().toISOString();
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
