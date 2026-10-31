#!/usr/bin/env node
/**
 * MixLab task watchdog (Mac side, read-only).
 *
 * Purpose: detect a "still working" remote agent that stopped producing commits.
 * A task is monitored only when its body contains an explicit:
 *   watch_branch: ui/some-branch
 *
 * Rules:
 * - no commit on watch_branch after task creation = stall after --stall minutes
 * - no commit for --stall minutes after the last commit = stall
 * - --takeover minutes = recommend Mac takeover
 *
 * Never consumes mailbox messages or sends messages automatically.
 *
 * usage:
 *   node scripts/dev/mail-watchdog.mjs check [--json] [--no-notify] [--fetch] [--stall 20] [--takeover 30]
 *   node scripts/dev/mail-watchdog.mjs watch [--interval 60]
 */
import { execFileSync } from "node:child_process";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const STATE_PATH = path.join(REPO, ".git/mixlab-mail/watchdog-state.json");
const LOG_DIR = path.join(os.homedir(), "Library/Logs/MixLab");
const LOG_PATH = path.join(LOG_DIR, "mail-watchdog.log");

function parseArgs(argv) {
  const args = {
    command: argv[0] || "check",
    json: false,
    notify: true,
    fetch: false,
    stall: Number(process.env.MIXLAB_WATCHDOG_STALL_MIN || 20),
    takeover: Number(process.env.MIXLAB_WATCHDOG_TAKEOVER_MIN || 30),
    interval: 60
  };
  for (let i = 1; i < argv.length; i += 1) {
    if (argv[i] === "--json") args.json = true;
    else if (argv[i] === "--no-notify") args.notify = false;
    else if (argv[i] === "--fetch") args.fetch = true;
    else if (argv[i] === "--stall") args.stall = Number(argv[++i] || args.stall);
    else if (argv[i] === "--takeover") args.takeover = Number(argv[++i] || args.takeover);
    else if (argv[i] === "--interval") args.interval = Number(argv[++i] || args.interval);
  }
  return args;
}

function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: REPO, encoding: "utf8", timeout: 30000, ...options });
}

function git(args) {
  try {
    return run("git", args).trim();
  } catch {
    return "";
  }
}

function parseTime(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function minutesAgo(ms) {
  if (!ms) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / 60000));
}

function loadPending() {
  try {
    const raw = run(process.execPath, ["scripts/dev/mail.mjs", "pending", "--role", "mac", "--json", "--no-fetch"]);
    return JSON.parse(raw);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function readMessageBody(id) {
  const candidates = [
    path.join(REPO, "docs/handoff/mail/outbox-mac", id + ".json"),
    path.join(REPO, "docs/handoff/mail/outbox-windows", id + ".json")
  ];
  for (const file of candidates) {
    try {
      const parsed = JSON.parse(await readFile(file, "utf8"));
      return String(parsed.body || "");
    } catch {
      // try next
    }
  }
  return "";
}

function watchBranchFromBody(body) {
  const matches = body.match(/watch_branch\s*:\s*([A-Za-z0-9._\/-]+)/g) || [];
  if (matches.length === 0) return "";
  const value = matches[0].split(":")[1].trim();
  if (!value || value.toLowerCase() === "none") return "";
  return value;
}

function normalizeRemoteBranch(branch) {
  return branch.startsWith("origin/") ? branch : "origin/" + branch;
}

function branchLastCommit(branch, fetch) {
  const remote = normalizeRemoteBranch(branch);
  if (fetch) {
    try {
      run("git", ["fetch", "--quiet", "origin", branch.replace(/^origin\//, "")]);
    } catch {
      // offline is fine; use existing ref
    }
  }
  const time = parseTime(git(["log", "-1", "--format=%cI", remote]));
  return {
    branch: remote,
    commit_time: time ? new Date(time).toISOString() : null,
    commit_age_minutes: time ? minutesAgo(time) : null
  };
}

async function readState() {
  try {
    return JSON.parse(await readFile(STATE_PATH, "utf8"));
  } catch {
    return { last_alert_key: "", last_alert_at: "" };
  }
}

async function writeState(state) {
  await mkdir(path.dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2) + String.fromCharCode(10), "utf8");
}

function notify(title, message) {
  const script = "display notification " + JSON.stringify(message) + " with title " + JSON.stringify(title);
  try {
    run("osascript", ["-e", script]);
    return true;
  } catch {
    return false;
  }
}

async function check(args) {
  const state = await readState();
  const pending = loadPending();
  const awaiting = Array.isArray(pending.attention?.awaiting_peer)
    ? pending.attention.awaiting_peer
    : [];
  const tasks = [];

  for (const task of awaiting) {
    const body = await readMessageBody(task.id);
    const branch = watchBranchFromBody(body);
    if (!branch) continue;
    const createdMs = parseTime(task.created_at);
    const lastCommit = branchLastCommit(branch, args.fetch);
    const lastCommitMs = parseTime(lastCommit.commit_time);
    const referenceMs = Math.max(createdMs || 0, lastCommitMs || 0);
    const idleMinutes = referenceMs ? minutesAgo(referenceMs) : Number(task.age_minutes) || 0;
    let status = "ok";
    if (idleMinutes >= args.takeover) status = "takeover";
    else if (idleMinutes >= args.stall) status = "stall";
    tasks.push({
      id: task.id,
      branch: lastCommit.branch,
      task_created_at: task.created_at || null,
      last_commit_at: lastCommit.commit_time,
      last_commit_age_minutes: lastCommit.commit_age_minutes,
      idle_minutes: idleMinutes,
      status
    });
  }

  const alerts = tasks.filter((task) => task.status !== "ok");
  const result = {
    checked_at: new Date().toISOString(),
    stall_minutes: args.stall,
    takeover_minutes: args.takeover,
    watched_tasks: tasks,
    alerts,
    pending_error: pending.error || ""
  };

  if (alerts.length > 0) {
    const key = alerts.map((task) => task.id + ":" + task.status).sort().join(",");
    if (key !== state.last_alert_key) {
      const message =
        alerts.map((task) => task.id + " · " + task.branch + " 已 " + task.idle_minutes + " 分钟无新 commit").join("；") +
        "。建议检查 Windows 会话；达到 " + args.takeover + " 分钟请接管。";
      const notified = args.notify ? notify("MixLab 任务可能停滞", message) : false;
      try {
        await mkdir(LOG_DIR, { recursive: true });
        await appendFile(LOG_PATH, new Date().toISOString() + " ALERT " + message + " notified=" + notified + String.fromCharCode(10), "utf8");
      } catch {
        // best-effort
      }
      await writeState({ ...state, last_alert_key: key, last_alert_at: new Date().toISOString(), last_result: result });
    } else {
      await writeState({ ...state, last_result: result });
    }
    console.log(args.json ? JSON.stringify(result, null, 2) : "ALERT: " + alerts.map((task) => task.id + " " + task.status).join("；"));
    return 2;
  }

  await writeState({ ...state, last_alert_key: "", last_result: result });
  console.log(args.json ? JSON.stringify(result, null, 2) : "OK: 无停滞任务");
  return 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "watch") {
    const loop = async () => {
      try {
        await check({ ...args, json: false });
      } catch (error) {
        try {
          await mkdir(LOG_DIR, { recursive: true });
          await appendFile(LOG_PATH, new Date().toISOString() + " ERROR " + (error instanceof Error ? error.message : String(error)) + String.fromCharCode(10), "utf8");
        } catch {
          // ignore
        }
      }
      setTimeout(loop, Math.max(30, args.interval) * 1000);
    };
    await loop();
    return;
  }
  process.exitCode = await check(args);
}

main().catch((error) => {
  console.error("mail-watchdog failed: " + (error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
