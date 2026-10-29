#!/usr/bin/env node
/**
 * 双端异步通信信箱（Git-based mailbox）——让 Mac DSH 与 Windows DSH 自动互相通知/回复。
 *
 * 设计：
 * - 每端只写自己的 outbox 目录：docs/handoff/mail/outbox-mac/ 或 outbox-windows/
 * - 消息是不可变 JSON 文件，发送 = commit + push；读取 = fetch 对方分支 + git show
 * - 已读状态保存在本机 .git/mixlab-mail/state-<role>.json，不提交
 * - 轮询由 DSH 定时提醒驱动（见 docs/handoff/MAIL.md）
 *
 * 命令：
 *   node scripts/dev/mail.mjs send --role mac --to windows --type notice --body "..."
 *   node scripts/dev/mail.mjs check --role mac [--mark-seen] [--json]
 *   node scripts/dev/mail.mjs status --role mac
 *   node scripts/dev/mail.mjs pause --role mac
 *   node scripts/dev/mail.mjs resume --role mac
 *
 * 退出码：check 有未读消息 -> 10；无 -> 0。
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ROLE_BRANCH = { mac: "dev/admin", windows: "dev/cutter" };
const PEER = { mac: "windows", windows: "mac" };
const MAIL_ROOT = "docs/handoff/mail";
const TYPES = new Set(["notice", "task", "reply", "ack", "control", "status"]);

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

function currentBranch() {
  return gitTry(["branch", "--show-current"]) ?? "";
}

/**
 * 通信停滞根因防护：mail 提交必须落在角色分支上。
 * 若在 main/integ/其它分支发送，commit 会落在当前分支，而 push 推的是角色分支，
 * 对端永远看不到这条消息（2026-10-29 集成冲刺曾因此停滞约 2 小时）。
 */
function assertMailBranch(role) {
  const expected = ROLE_BRANCH[role];
  const branch = currentBranch();
  if (branch !== expected) {
    throw new Error(
      "邮件必须在角色分支 " + expected + " 上发送（当前: " + (branch || "<detached>") + "）。" +
      "消息若提交到其它分支，对端永远读不到。请先执行: git switch " + expected + "，再重发本条消息。"
    );
  }
}

function warnMailBranch(role) {
  const expected = ROLE_BRANCH[role];
  const branch = currentBranch();
  if (branch && branch !== expected) {
    console.error("[mail][warn] 当前分支 " + branch + " ≠ 角色分支 " + expected + "；check 可读取，但 send 会被拒绝。");
  }
}

function parseArgs(argv) {
  const result = { command: "", role: "mac", to: "", type: "notice", body: "", thread: "", replyTo: "", action: "", markSeen: false, json: false, noFetch: false, noPush: false, quiet: false, blocking: false, needs: "", evidence: [] };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--role") result.role = argv[++index] ?? "mac";
    else if (arg === "--to") result.to = argv[++index] ?? "";
    else if (arg === "--from") result.role = argv[++index] ?? "mac";
    else if (arg === "--type") result.type = argv[++index] ?? "notice";
    else if (arg === "--body") result.body = argv[++index] ?? "";
    else if (arg === "--thread") result.thread = argv[++index] ?? "";
    else if (arg === "--reply-to") result.replyTo = argv[++index] ?? "";
    else if (arg === "--action") result.action = argv[++index] ?? "";
    else if (arg === "--mark-seen") result.markSeen = true;
    else if (arg === "--json") result.json = true;
    else if (arg === "--no-fetch") result.noFetch = true;
    else if (arg === "--no-push") result.noPush = true;
    else if (arg === "--quiet") result.quiet = true;
    else if (arg === "--blocking") result.blocking = true;
    else if (arg === "--needs") result.needs = argv[++index] ?? "";
    else if (arg === "--evidence") result.evidence.push(argv[++index] ?? "");
    else if (arg === "--help" || arg === "-h") result.help = true;
    else if (!arg.startsWith("--")) positional.push(arg);
  }
  result.command = positional[0] ?? "";
  return result;
}

function repoRoot() {
  return git(["rev-parse", "--show-toplevel"]);
}

function gitDir(repo) {
  const value = git(["rev-parse", "--git-dir"]);
  return path.isAbsolute(value) ? value : path.resolve(repo, value);
}

function statePath(repo, role) {
  return path.join(gitDir(repo), "mixlab-mail", "state-" + role + ".json");
}

async function loadState(repo, role) {
  try {
    return JSON.parse(await readFile(statePath(repo, role), "utf8"));
  } catch {
    return { seen_ids: [], paused: false, last_check: "", last_send: "" };
  }
}

async function saveState(repo, role, state) {
  const target = statePath(repo, role);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(state, null, 2) + "\n", "utf8");
}

function outboxDir(role) {
  return MAIL_ROOT + "/outbox-" + role;
}

function messagePath(id, role) {
  return outboxDir(role) + "/" + id + ".json";
}

async function localOutbox(repo, role) {
  const dir = path.join(repo, outboxDir(role));
  let names = [];
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();
  } catch {
    return [];
  }
  const messages = [];
  for (const name of names) {
    try {
      messages.push(JSON.parse(await readFile(path.join(dir, name), "utf8")));
    } catch {
      // 忽略损坏消息文件
    }
  }
  return messages;
}

async function sendMessage(args, repo) {
  const role = args.role;
  const to = args.to || PEER[role];
  if (!ROLE_BRANCH[role]) throw new Error("role 必须是 mac 或 windows");
  assertMailBranch(role);
  if (!TYPES.has(args.type)) throw new Error("type 必须是 " + [...TYPES].join("/"));
  if (args.type !== "ack" && !String(args.body ?? "").trim()) {
    throw new Error("除 ack 外，消息必须带 --body（Windows PowerShell 用单引号包住正文）");
  }
  const id = Date.now() + "-" + randomUUID().slice(0, 8);
  const defaultNeeds = args.type === "task" ? "action" : "none";
  const flags = {
    needs: args.needs || defaultNeeds,
    ...(args.blocking ? { blocking: true } : {}),
    ...(args.evidence.filter(Boolean).length > 0 ? { evidence: args.evidence.filter(Boolean) } : {})
  };
  const message = {
    schema_version: "1",
    id,
    from: role,
    to,
    type: args.type,
    ...(args.action ? { action: args.action } : {}),
    thread: args.thread || id,
    ...(args.replyTo ? { reply_to: args.replyTo } : {}),
    created_at: new Date().toISOString(),
    flags,
    body: args.body
  };
  const file = messagePath(id, role);
  await mkdir(path.join(repo, outboxDir(role)), { recursive: true });
  await writeFile(path.join(repo, file), JSON.stringify(message, null, 2) + "\n", "utf8");

  git(["add", file]);
  const commitMessage = "[mail][" + role + "→" + to + "] " + args.type + (args.action ? ":" + args.action : "") + " " + id;
  git(["commit", "-m", commitMessage]);
  if (!args.noPush) {
    const pushed = gitTry(["push", "origin", ROLE_BRANCH[role]]);
    if (pushed === null) throw new Error("git push 失败（网络/权限）；消息已本地提交，可稍后 git push origin " + ROLE_BRANCH[role]);
    // 推送核验：确认消息文件真的出现在对端读取的 origin/<角色分支> 上，避免"推错分支"式静默丢失。
    const remoteRef = "origin/" + ROLE_BRANCH[role];
    gitTry(["fetch", "origin", ROLE_BRANCH[role]]);
    if (gitTry(["cat-file", "-e", remoteRef + ":" + file]) === null) {
      throw new Error(
        "邮件推送核验失败：" + remoteRef + " 上找不到 " + file + "。消息可能提交到了其它分支，请检查当前分支并重发。"
      );
    }
  }
  const state = await loadState(repo, role);
  state.last_send = new Date().toISOString();
  await saveState(repo, role, state);
  console.log(JSON.stringify({ ok: true, id, file, pushed: !args.noPush }, null, 2));
  return id;
}

function peerMessages(repo, role, args) {
  const peer = PEER[role];
  const peerBranch = ROLE_BRANCH[peer];
  if (!args.noFetch) {
    gitTry(["fetch", "origin", peerBranch]);
  }
  const remoteRef = "origin/" + peerBranch;
  const listing = gitTry(["ls-tree", "-r", "--name-only", remoteRef, "--", outboxDir(peer)]);
  if (listing === null) return { peer, peerBranch, messages: [], error: "无法读取 " + remoteRef };
  const files = listing.split("\n").filter((file) => file.endsWith(".json")).sort();
  const messages = [];
  for (const file of files) {
    const raw = gitTry(["show", remoteRef + ":" + file]);
    if (raw === null) continue;
    try {
      messages.push(JSON.parse(raw));
    } catch {
      // 忽略损坏消息文件，check 汇总里会显示跳过数量。
    }
  }
  return { peer, peerBranch, messages, error: "" };
}

function mergeMessages(...lists) {
  const byId = new Map();
  for (const list of lists) {
    for (const message of list) {
      if (message && typeof message.id === "string") byId.set(message.id, message);
    }
  }
  return [...byId.values()].sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)));
}

async function allMessages(repo, role, fetchFlag) {
  const local = await localOutbox(repo, role);
  const peer = peerMessages(repo, role, { noFetch: !fetchFlag }).messages;
  return mergeMessages(local, peer);
}

function briefMessage(message) {
  return {
    id: message.id,
    from: message.from,
    to: message.to,
    type: message.type,
    needs: message.flags?.needs ?? "",
    blocking: Boolean(message.flags?.blocking),
    created_at: message.created_at,
    reply_to: message.reply_to ?? "",
    preview: String(message.body ?? "").slice(0, 160)
  };
}

/**
 * 待办/阻塞派生：
 * - needs_you：对方发来、需要我回应的 action/decision
 * - decisions：需要人工决策的项
 * - awaiting_peer：我已发出、等对方回应的项
 * - blocking：其中被标记 blocking 的
 */
function computeAttention(messages, role) {
  const replies = new Map();
  for (const message of messages) {
    if (!message.reply_to) continue;
    const list = replies.get(message.reply_to) ?? [];
    list.push(message);
    replies.set(message.reply_to, list);
  }
  const unresolved = messages.filter((message) => {
    const needs = message.flags?.needs;
    if (needs !== "action" && needs !== "decision") return false;
    if (message.type !== "task" && message.type !== "notice") return false;
    return (replies.get(message.id) ?? []).length === 0;
  });
  return {
    needs_you: unresolved.filter((message) => message.from !== role).map(briefMessage),
    decisions: unresolved.filter((message) => message.flags?.needs === "decision").map(briefMessage),
    awaiting_peer: unresolved.filter((message) => message.from === role).map(briefMessage),
    blocking: unresolved.filter((message) => message.flags?.blocking).map(briefMessage)
  };
}

async function pending(args, repo) {
  warnMailBranch(args.role);
  const role = args.role;
  const messages = await allMessages(repo, role, !args.noFetch);
  const attention = computeAttention(messages, role);
  if (args.json) {
    console.log(JSON.stringify({ role, generated_at: new Date().toISOString(), attention }, null, 2));
    return;
  }
  console.log("=== MIXLAB MAIL PENDING ===");
  console.log("role: " + role);
  console.log("needs_you: " + attention.needs_you.length + "  decisions: " + attention.decisions.length + "  awaiting_peer: " + attention.awaiting_peer.length + "  blocking: " + attention.blocking.length);
  for (const [group, list] of Object.entries(attention)) {
    if (list.length === 0) continue;
    console.log("");
    console.log("[" + group + "]");
    for (const item of list) {
      console.log("- " + item.type + " id=" + item.id + " from=" + item.from + " needs=" + item.needs + (item.blocking ? " BLOCKING" : "") + " | " + item.preview.replace(/\n/g, " "));
    }
  }
  console.log("=== END MAIL PENDING ===");
}

async function check(args, repo) {
  warnMailBranch(args.role);
  const role = args.role;
  const state = await loadState(repo, role);
  const { peer, peerBranch, messages, error } = peerMessages(repo, role, args);
  const seen = new Set(state.seen_ids);
  const unread = messages.filter((message) => !seen.has(message.id));
  state.last_check = new Date().toISOString();
  if (args.markSeen) {
    for (const message of unread) state.seen_ids.push(message.id);
    if (state.seen_ids.length > 5000) state.seen_ids = state.seen_ids.slice(-5000);
  }
  await saveState(repo, role, state);

  if (args.json) {
    console.log(JSON.stringify({ role, peer, peer_branch: peerBranch, paused: state.paused, unread: unread.map((message) => message), error }, null, 2));
  } else {
    console.log("=== MIXLAB MAIL CHECK ===");
    console.log("role: " + role + "  peer: " + peer + " (" + peerBranch + ")  paused: " + state.paused);
    if (error) console.log("warning: " + error);
    console.log("unread: " + unread.length + " / total: " + messages.length);
    for (const message of unread) {
      console.log("");
      console.log("--- " + message.type + (message.action ? ":" + message.action : "") + "  id=" + message.id);
      console.log("from: " + message.from + "  to: " + message.to + "  time: " + message.created_at + (message.reply_to ? "  reply_to: " + message.reply_to : "") + (message.flags ? "  flags: " + JSON.stringify(message.flags) : ""));
      console.log(message.body);
    }
    console.log("");
    console.log("=== END MAIL CHECK ===");
  }
  process.exitCode = unread.length > 0 ? 10 : 0;
}

async function status(args, repo) {
  warnMailBranch(args.role);
  const role = args.role;
  const state = await loadState(repo, role);
  const { peer, messages } = peerMessages(repo, role, { ...args, noFetch: true });
  const seen = new Set(state.seen_ids);
  const unread = messages.filter((message) => !seen.has(message.id));
  console.log(JSON.stringify({
    role,
    peer,
    paused: state.paused,
    unread: unread.length,
    total_peer_messages: messages.length,
    last_check: state.last_check,
    last_send: state.last_send
  }, null, 2));
}

async function control(args, repo, action) {
  const role = args.role;
  const state = await loadState(repo, role);
  state.paused = action === "pause";
  await saveState(repo, role, state);
  await sendMessage({ ...args, role, type: "control", action, body: args.body || (action === "pause" ? "通信暂停：收到本消息后进入低频轮询（仅检查 resume）。" : "通信恢复：收到本消息后恢复常规轮询。") }, repo);
  if (!args.quiet) console.log("control sent: " + action);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.command) {
    console.log("用法：node scripts/dev/mail.mjs <send|check|status|pending|pause|resume> --role mac|windows [options]");
    console.log("详见 docs/handoff/MAIL.md");
    process.exit(args.help ? 0 : 2);
  }
  const repo = repoRoot();
  process.chdir(repo);
  if (args.command === "send") await sendMessage(args, repo);
  else if (args.command === "check") await check(args, repo);
  else if (args.command === "status") await status(args, repo);
  else if (args.command === "pending") await pending(args, repo);
  else if (args.command === "pause") await control(args, repo, "pause");
  else if (args.command === "resume") await control(args, repo, "resume");
  else {
    console.error("未知命令: " + args.command);
    process.exit(2);
  }
}

main().catch((error) => {
  console.error("mail failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
