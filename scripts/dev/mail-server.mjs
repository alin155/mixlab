#!/usr/bin/env node
/**
 * MixLab 通信看板（本地只读 Web 服务，无需外部依赖）：
 *   node scripts/dev/mail-server.mjs [--port 8791] [--refresh 4000] [--fetch 20000]
 *
 * 打开 http://127.0.0.1:8791 实时查看 Mac ↔ Windows 的 Git Mailbox 聊天记录、
 * 双方最新状态报告、暂停/恢复状态。页面每 2.5 秒自动刷新，服务端定时 fetch 对方分支。
 *
 * 只读：不写仓库、不 commit、不需要登录（仅监听 127.0.0.1）。
 */
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const ROLE_BRANCH = { mac: "dev/admin", windows: "dev/cutter" };
const PEER = { mac: "windows", windows: "mac" };
const MAIL_ROOT = "docs/handoff/mail";

function parseArgs(argv) {
  const result = { port: 8791, host: "127.0.0.1", refreshMs: 4000, fetchMs: 20000, noFetch: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--port") result.port = Number(argv[++index] ?? 8791);
    else if (arg === "--host") result.host = argv[++index] ?? "127.0.0.1";
    else if (arg === "--refresh") result.refreshMs = Number(argv[++index] ?? 4000);
    else if (arg === "--fetch") result.fetchMs = Number(argv[++index] ?? 20000);
    else if (arg === "--no-fetch") result.noFetch = true;
    else if (arg === "--help" || arg === "-h") result.help = true;
  }
  return result;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20000 }).trim();
}

function gitTry(args) {
  try {
    return git(args);
  } catch {
    return null;
  }
}

function repoRoot() {
  return git(["rev-parse", "--show-toplevel"]);
}

async function localOutbox(repo, role) {
  const dir = path.join(repo, MAIL_ROOT, "outbox-" + role);
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
      // 忽略损坏消息
    }
  }
  return messages;
}

function remoteOutbox(repo, role) {
  const branch = ROLE_BRANCH[role];
  const remoteRef = "origin/" + branch;
  const dir = MAIL_ROOT + "/outbox-" + role;
  const listing = gitTry(["ls-tree", "-r", "--name-only", remoteRef, "--", dir]);
  if (listing === null) return [];
  const messages = [];
  for (const file of listing.split("\n").filter((name) => name.endsWith(".json")).sort()) {
    const raw = gitTry(["show", remoteRef + ":" + file]);
    if (raw === null) continue;
    try {
      messages.push(JSON.parse(raw));
    } catch {
      // 忽略损坏消息
    }
  }
  return messages;
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

function readRemoteFile(repo, role, relativePath) {
  const raw = gitTry(["show", "origin/" + ROLE_BRANCH[role] + ":" + relativePath]);
  return raw === null ? "" : raw;
}

async function readLocalFile(repo, relativePath) {
  try {
    return await readFile(path.join(repo, relativePath), "utf8");
  } catch {
    return "";
  }
}

function inferPaused(messages) {
  const latest = { mac: null, windows: null };
  for (const message of messages) {
    if (message.type === "control" && (message.action === "pause" || message.action === "resume")) {
      latest[message.from] = message.action;
    }
  }
  return { mac: latest.mac === "pause", windows: latest.windows === "pause" };
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
    age_minutes: (() => {
      const ms = Date.now() - Date.parse(String(message.created_at));
      return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 60000) : 0;
    })(),
    reply_to: message.reply_to ?? "",
    preview: String(message.body ?? "").slice(0, 160)
  };
}

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
  const awaitingPeer = unresolved.filter((message) => message.from === role).map(briefMessage);
  return {
    needs_you: unresolved.filter((message) => message.from !== role).map(briefMessage),
    decisions: unresolved.filter((message) => message.flags?.needs === "decision").map(briefMessage),
    awaiting_peer: awaitingPeer,
    blocking: unresolved.filter((message) => message.flags?.blocking).map(briefMessage),
    // 停滞预警：等待对端回复超过 30 分钟的项（2026-10-29 曾因消息落错分支静默停滞）。
    stalled: awaitingPeer.filter((item) => item.age_minutes >= 30)
  };
}

async function buildSnapshot(repo, options) {
  if (!options.noFetch) {
    gitTry(["fetch", "origin", "dev/cutter", "--quiet"]);
    gitTry(["fetch", "origin", "dev/admin", "--quiet"]);
  }
  const local = await localOutbox(repo, "mac");
  const remoteWindows = remoteOutbox(repo, "windows");
  const remoteMac = remoteOutbox(repo, "mac");
  const messages = mergeMessages(local, remoteMac, remoteWindows);
  const macHead = gitTry(["rev-parse", "dev/admin"]) || "";
  const windowsHead = gitTry(["rev-parse", "origin/dev/cutter"]) || "";
  const macStatus = (await readLocalFile(repo, "docs/handoff/status/mac-latest.md")) || readRemoteFile(repo, "mac", "docs/handoff/status/mac-latest.md");
  const windowsStatus = readRemoteFile(repo, "windows", "docs/handoff/status/windows-latest.md");
  return {
    generated_at: new Date().toISOString(),
    paused: inferPaused(messages),
    heads: { mac: macHead, windows: windowsHead },
    messages,
    attention: computeAttention(messages, "mac"),
    statuses: { mac: macStatus, windows: windowsStatus },
    counts: {
      total: messages.length,
      by_type: messages.reduce((acc, message) => {
        acc[message.type] = (acc[message.type] || 0) + 1;
        return acc;
      }, {})
    }
  };
}

const PAGE = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MixLab 双端通信看板</title>
<style>
  :root { color-scheme: dark; --bg:#0d1117; --panel:#161b22; --border:#30363d; --text:#e6edf3; --muted:#8b949e; --mac:#58a6ff; --win:#3fb950; --warn:#d29922; --bad:#f85149; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
  header { position:sticky; top:0; z-index:5; background:rgba(13,17,23,.92); backdrop-filter:blur(8px); border-bottom:1px solid var(--border); padding:12px 20px; display:flex; flex-wrap:wrap; gap:12px; align-items:center; }
  h1 { font-size:17px; margin:0 12px 0 0; }
  .chip { border:1px solid var(--border); border-radius:999px; padding:3px 10px; color:var(--muted); font-size:12px; }
  .chip.mac { color:var(--mac); border-color:rgba(88,166,255,.4); }
  .chip.win { color:var(--win); border-color:rgba(63,185,80,.4); }
  .chip.paused { color:var(--warn); border-color:rgba(210,153,34,.5); background:rgba(210,153,34,.1); }
  .spacer { flex:1; }
  main { display:grid; grid-template-columns:minmax(0,1fr) 360px; gap:16px; padding:16px 20px; max-width:1500px; margin:0 auto; }
  @media (max-width: 980px) { main { grid-template-columns:1fr; } }
  .panel { background:var(--panel); border:1px solid var(--border); border-radius:10px; }
  .panel h2 { margin:0; padding:10px 14px; font-size:13px; color:var(--muted); border-bottom:1px solid var(--border); text-transform:uppercase; letter-spacing:.04em; }
  #messages { padding:12px; max-height:calc(100vh - 150px); overflow:auto; display:flex; flex-direction:column; gap:10px; }
  .msg { border:1px solid var(--border); border-left:4px solid var(--muted); border-radius:8px; padding:10px 12px; background:#0f141b; }
  .msg.mac { border-left-color:var(--mac); }
  .msg.windows { border-left-color:var(--win); }
  .msg.advisor { border-left-color:var(--warn); background:rgba(210,153,34,.07); }
  .badge.advisory { color:var(--warn); }
  .filters { display:flex; gap:6px; padding:8px 12px; border-bottom:1px solid var(--border); align-items:center; flex-wrap:wrap; }
  .filters button { background:#21262d; color:var(--text); border:1px solid var(--border); border-radius:6px; padding:3px 9px; font-size:12px; cursor:pointer; }
  .filters button.active { border-color:var(--mac); color:var(--mac); }
  .filters input { background:#0d1117; color:var(--text); border:1px solid var(--border); border-radius:6px; padding:4px 8px; font-size:12px; min-width:180px; }
  .msg .meta { display:flex; flex-wrap:wrap; gap:8px; align-items:center; color:var(--muted); font-size:12px; }
  .badge { border-radius:5px; padding:1px 7px; font-size:11px; background:#21262d; border:1px solid var(--border); }
  .badge.notice { color:#79c0ff; } .badge.task { color:#f0883e; } .badge.reply { color:#3fb950; } .badge.ack { color:#8b949e; } .badge.control { color:#d29922; } .badge.status { color:#bc8cff; }
  .msg .body { margin-top:6px; white-space:pre-wrap; word-break:break-word; }
  .msg .id { color:#484f58; font-family:ui-monospace,SFMono-Regular,monospace; font-size:11px; }
  .empty { color:var(--muted); text-align:center; padding:40px 10px; }
  .side { display:flex; flex-direction:column; gap:16px; }
  .statusbox { padding:12px 14px; }
  .statusbox pre { margin:0; white-space:pre-wrap; word-break:break-word; font-size:11.5px; color:#c9d1d9; max-height:320px; overflow:auto; }
  details summary { cursor:pointer; color:var(--muted); font-size:12px; }
  .attn-item { border-left:3px solid var(--border); padding:6px 8px; margin-bottom:8px; background:#0f141b; border-radius:5px; font-size:12px; }
  .attn-item.blocking { border-left-color:var(--bad); }
  .attn-item.decision { border-left-color:var(--warn); }
  .attn-item .attn-meta { color:var(--muted); font-size:11px; }
  .chip.attn { color:var(--warn); border-color:rgba(210,153,34,.5); }
  .footer { color:var(--muted); font-size:11px; padding:8px 20px 24px; text-align:center; }
  a { color:var(--mac); }
</style>
</head>
<body>
<header>
  <h1>MixLab 双端通信看板</h1>
  <span class="chip mac" id="mac-head">Mac: …</span>
  <span class="chip win" id="win-head">Windows: …</span>
  <span class="chip" id="updated">更新中…</span>
  <span class="chip paused" id="paused-chip" style="display:none">通信已暂停</span>
  <span class="spacer"></span>
  <span class="chip" id="counts">消息 0</span>
  <span class="chip attn" id="attn-count">待处理 0</span>
  <label class="chip"><input type="checkbox" id="autoscroll" checked /> 自动滚动</label>
</header>
<main>
  <section class="panel">
    <h2>通信记录（Mac ↔ Windows ↔ Codex 顾问）</h2>
    <div class="filters">
      <button data-filter="all" class="active">全部</button>
      <button data-filter="mac">Mac</button>
      <button data-filter="windows">Windows</button>
      <button data-filter="advisor">Codex 顾问</button>
      <input id="filter-text" placeholder="搜索内容…" />
    </div>
    <div id="messages"><div class="empty">加载中…</div></div>
  </section>
  <aside class="side">
    <section class="panel">
      <h2>Codex 顾问（最新意见）</h2>
      <div class="statusbox" id="advisor-box" style="white-space:pre-wrap;max-height:360px;overflow:auto;color:#d29922;font-size:12px">暂无顾问意见</div>
    </section>
    <section class="panel">
      <h2>待处理 / 阻塞</h2>
      <div class="statusbox" id="attention" style="color:var(--muted)">加载中…</div>
    </section>
    <section class="panel">
      <h2>双方最新状态</h2>
      <div class="statusbox">
        <details open><summary>Windows 状态报告</summary><pre id="win-status">加载中…</pre></details>
        <details><summary>Mac 状态报告</summary><pre id="mac-status">加载中…</pre></details>
      </div>
    </section>
    <section class="panel">
      <h2>说明</h2>
      <div class="statusbox" style="color:var(--muted);font-size:12px">
        数据来源：Git Mailbox（outbox-mac / outbox-windows）。本页面只读，每 2.5 秒自动刷新一次。<br/>
        暂停/恢复通信由两端 DSH 通过 control 消息协商；这里只展示状态。<br/>
        服务端命令：<code>node scripts/dev/mail-server.mjs</code>
      </div>
    </section>
  </aside>
</main>
<footer>MixLab · Git Mailbox 看板 · 仅监听 127.0.0.1</footer>
<script>
const $ = (id) => document.getElementById(id);
let lastSeen = "";
function fmtTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
function esc(value) { return String(value ?? ""); }
function attnItem(item, kind) {
  const div = document.createElement("div");
  div.className = "attn-item" + (item.blocking ? " blocking" : "") + (item.needs === "decision" ? " decision" : "");
  const head = document.createElement("div");
  head.textContent = "[" + kind + "] " + item.type + " · " + (item.from === "mac" ? "Mac" : "Windows") + " → " + (item.to === "mac" ? "Mac" : "Windows") + (item.blocking ? " · 阻塞" : "") + (item.needs === "decision" ? " · 需决策" : "");
  const meta = document.createElement("div");
  meta.className = "attn-meta";
  meta.textContent = fmtTime(item.created_at) + " · " + item.id;
  const body = document.createElement("div");
  body.textContent = item.preview || "";
  div.append(head, meta, body);
  return div;
}

function renderAttention(attention) {
  const box = $("attention");
  box.textContent = "";
  const groups = [
    ["需要你处理", attention.needs_you || []],
    ["需要人工决策", attention.decisions || []],
    ["等待 Windows 回复", attention.awaiting_peer || []],
    ["可能停滞（>30 分钟）", attention.stalled || []],
    ["阻塞项", attention.blocking || []]
  ];
  const total = groups.reduce((sum, [, list]) => sum + list.length, 0);
  $("attn-count").textContent = "待处理 " + total;
  if (total === 0) {
    const empty = document.createElement("div");
    empty.textContent = "没有待处理/阻塞项。";
    box.appendChild(empty);
    return;
  }
  for (const [title, list] of groups) {
    if (!list || list.length === 0) continue;
    const heading = document.createElement("div");
    heading.style.cssText = "color:var(--muted);font-size:11px;margin:2px 0 6px;text-transform:uppercase;letter-spacing:.04em";
    heading.textContent = title + " (" + list.length + ")";
    box.appendChild(heading);
    for (const item of list) box.appendChild(attnItem(item, title));
  }
}

let activeFilter = "all";
let searchText = "";
let latestSnapshot = null;
function senderLabel(from) {
  return from === "codex-advisor" ? "Codex 顾问" : (from === "mac" ? "Mac" : "Windows");
}
function render(snapshot) {
  latestSnapshot = snapshot;
  const messages = snapshot.messages || [];
  $("mac-head").textContent = "Mac: " + (snapshot.heads?.mac || "?").slice(0, 8);
  $("win-head").textContent = "Windows: " + (snapshot.heads?.windows || "?").slice(0, 8);
  $("updated").textContent = "更新于 " + fmtTime(snapshot.generated_at);
  const paused = snapshot.paused || {};
  const pausedChip = $("paused-chip");
  pausedChip.style.display = paused.mac || paused.windows ? "" : "none";
  pausedChip.textContent = "通信已暂停" + (paused.mac ? " (Mac)" : "") + (paused.windows ? " (Windows)" : "");
  const visibleMessages = messages.filter((message) => {
    const sender = message.from === "codex-advisor" ? "advisor" : message.from;
    if (activeFilter !== "all" && sender !== activeFilter) return false;
    if (!searchText) return true;
    return (String(message.body || "") + " " + String(message.from || "") + " " + String(message.type || "")).toLowerCase().includes(searchText);
  });
  $("counts").textContent = "消息 " + (visibleMessages.length === messages.length ? messages.length : visibleMessages.length + "/" + messages.length);
  const advisorMessages = messages.filter((message) => message.from === "codex-advisor");
  const latestAdvisor = advisorMessages[advisorMessages.length - 1];
  $("advisor-box").textContent = latestAdvisor ? String(latestAdvisor.body || "").slice(0, 4000) : "暂无顾问意见";
  renderAttention(snapshot.attention || {});
  $("win-status").textContent = snapshot.statuses?.windows || "（暂无 Windows 状态报告）";
  $("mac-status").textContent = snapshot.statuses?.mac || "（暂无 Mac 状态报告）";

  const container = $("messages");
  const scrollNearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 60;
  container.textContent = "";
  if (visibleMessages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = messages.length === 0 ? "还没有任何通信记录。" : "没有符合筛选条件的消息。";
    container.appendChild(empty);
    return;
  }
  for (const message of visibleMessages) {
    const card = document.createElement("article");
    card.className = "msg " + (message.from === "codex-advisor" ? "advisor" : (message.from === "mac" ? "mac" : "windows"));
    const meta = document.createElement("div");
    meta.className = "meta";
    const badge = document.createElement("span");
    badge.className = "badge " + message.type;
    badge.textContent = message.type + (message.action ? ":" + message.action : "");
    const direction = document.createElement("span");
    direction.textContent = senderLabel(message.from) + " → " + (message.to === "all" ? "全部" : senderLabel(message.to));
    const time = document.createElement("span");
    time.textContent = fmtTime(message.created_at);
    const id = document.createElement("span");
    id.className = "id";
    id.textContent = message.id + (message.reply_to ? " ↳ " + message.reply_to : "");
    meta.append(badge);
    if (message.flags?.blocking) {
      const flag = document.createElement("span"); flag.className = "badge control"; flag.textContent = "阻塞"; meta.appendChild(flag);
    }
    if (message.flags?.needs === "decision") {
      const flag = document.createElement("span"); flag.className = "badge control"; flag.textContent = "需决策"; meta.appendChild(flag);
    }
    if (message.flags?.needs === "action" && message.from !== "mac") {
      const flag = document.createElement("span"); flag.className = "badge task"; flag.textContent = "需处理"; meta.appendChild(flag);
    }
    meta.append(direction, time, id);
    const body = document.createElement("div");
    body.className = "body";
    body.textContent = message.body ?? "";
    card.append(meta, body);
    container.appendChild(card);
  }
  if ($("autoscroll").checked && (scrollNearBottom || lastSeen !== snapshot.generated_at)) {
    // 只在新消息到达/接近底部时滚动，避免打断用户查看历史。
    if (messages.length > 0 && (scrollNearBottom || lastSeen === "")) container.scrollTop = container.scrollHeight;
  }
  lastSeen = snapshot.generated_at;
}
async function refresh() {
  try {
    const response = await fetch("/api/messages", { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    render(await response.json());
  } catch (error) {
    $("updated").textContent = "刷新失败: " + error.message;
  }
}
const filterText = $("filter-text");
if (filterText) {
  filterText.addEventListener("input", (event) => {
    searchText = String(event.target.value || "").trim().toLowerCase();
    if (latestSnapshot) render(latestSnapshot);
  });
}
for (const button of document.querySelectorAll("[data-filter]")) {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter || "all";
    for (const item of document.querySelectorAll("[data-filter]")) item.classList.toggle("active", item === button);
    if (latestSnapshot) render(latestSnapshot);
  });
}
refresh();
setInterval(refresh, 2500);
</script>
</body>
</html>`;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("用法: node scripts/dev/mail-server.mjs [--port 8791] [--refresh 4000] [--fetch 20000] [--no-fetch]");
    return;
  }
  const repo = repoRoot();
  process.chdir(repo);
  let snapshot = await buildSnapshot(repo, options).catch(() => ({ generated_at: new Date().toISOString(), messages: [], statuses: {}, heads: {}, paused: {} }));

  const refresh = async () => {
    snapshot = await buildSnapshot(repo, options).catch((error) => ({ ...snapshot, generated_at: new Date().toISOString(), error: String(error) }));
  };
  const timer = setInterval(refresh, Math.max(options.refreshMs, 2000));
  timer.unref?.();

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/api/messages") {
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        response.end(JSON.stringify(snapshot));
        return;
      }
      if (url.pathname === "/health") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: true, generated_at: snapshot.generated_at }));
        return;
      }
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      response.end(PAGE);
    } catch (error) {
      response.writeHead(500, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    }
  });

  server.listen(options.port, options.host, () => {
    console.log("MixLab mail dashboard: http://" + options.host + ":" + options.port);
    console.log("repo: " + repo + "  refresh: " + options.refreshMs + "ms  fetch: " + (options.noFetch ? "(disabled)" : options.fetchMs + "ms"));
  });
  process.on("SIGINT", () => { server.close(); process.exit(0); });
  process.on("SIGTERM", () => { server.close(); process.exit(0); });
}

main().catch((error) => {
  console.error("mail-server failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
