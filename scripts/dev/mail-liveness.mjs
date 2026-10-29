#!/usr/bin/env node
/**
 * MixLab communication liveness monitor (Mac side, read-only).
 *
 * IMPORTANT:
 * - never calls mail.mjs check --mark-seen; it must not consume tasks
 * - never sends mailbox messages automatically
 * - only warns the local user when the peer looks inactive or a task waits too long
 *
 * usage:
 *   node scripts/dev/mail-liveness.mjs check [--json] [--no-notify]
 *   node scripts/dev/mail-liveness.mjs watch [--interval 60]
 */
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const STATE_PATH = path.join(REPO, ".git/mixlab-mail/liveness-state.json");
const LOG_DIR = path.join(os.homedir(), "Library/Logs/MixLab");
const LOG_PATH = path.join(LOG_DIR, "mail-liveness.log");
const PENDING_THRESHOLD_MIN = Number(process.env.MIXLAB_LIVENESS_PENDING_MIN || 10);
const PEER_THRESHOLD_MIN = Number(process.env.MIXLAB_LIVENESS_PEER_MIN || 15);

function parseArgs(argv) {
  const args = { command: argv[0] || "check", json: false, notify: true, interval: 60 };
  for (let i = 1; i < argv.length; i += 1) {
    if (argv[i] === "--json") args.json = true;
    else if (argv[i] === "--no-notify") args.notify = false;
    else if (argv[i] === "--interval") args.interval = Number(argv[++i] || 60);
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

function peerActivity() {
  const commitTime = parseTime(git(["log", "-1", "--format=%cI", "origin/dev/cutter"]));
  let statusTime = null;
  try {
    const status = git(["show", "origin/dev/cutter:docs/handoff/status/windows-latest.md"]);
    const match = status.match(/generated_at:\s*([^\n]+)/i);
    statusTime = match ? parseTime(match[1].trim()) : null;
  } catch {
    statusTime = null;
  }
  const times = [commitTime, statusTime].filter((value) => value !== null);
  return {
    commit_time: commitTime ? new Date(commitTime).toISOString() : null,
    status_time: statusTime ? new Date(statusTime).toISOString() : null,
    last_activity: times.length ? new Date(Math.max(...times)).toISOString() : null,
    age_minutes: times.length ? minutesAgo(Math.max(...times)) : null
  };
}

function loadPending() {
  try {
    const raw = run(process.execPath, ["scripts/dev/mail.mjs", "pending", "--role", "mac", "--json", "--no-fetch"]);
    return JSON.parse(raw);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function readState() {
  try {
    return JSON.parse(await readFile(STATE_PATH, "utf8"));
  } catch {
    return { last_alert_key: "", last_alert_at: "", last_check: "" };
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
  const peer = peerActivity();
  const attention = pending.attention || {};
  const awaiting = Array.isArray(attention.awaiting_peer) ? attention.awaiting_peer : [];
  const oldest = awaiting.reduce((max, item) => Math.max(max, Number(item.age_minutes) || 0), 0);
  const peerAge = peer.age_minutes;
  const alerts = [];

  if (awaiting.length > 0 && oldest >= PENDING_THRESHOLD_MIN) {
    alerts.push("有 " + awaiting.length + " 条任务等待回复，最久 " + oldest + " 分钟");
  }
  if (awaiting.length > 0 && peerAge !== null && peerAge >= PEER_THRESHOLD_MIN) {
    alerts.push("Windows 最后活动 " + peerAge + " 分钟前");
  }

  const result = {
    checked_at: new Date().toISOString(),
    awaiting_count: awaiting.length,
    oldest_wait_minutes: oldest,
    peer,
    alerts,
    pending_error: pending.error || ""
  };

  if (alerts.length > 0) {
    const key = awaiting.map((item) => item.id).sort().join(",") + "|" + alerts.join("|");
    result.alert_key = key;
    if (key !== state.last_alert_key) {
      const message = alerts.join("；") + "。请检查 Windows 会话或终端轮询。";
      const notified = args.notify ? notify("MixLab 通信异常", message) : false;
      try {
        await mkdir(LOG_DIR, { recursive: true });
        await appendFile(LOG_PATH, new Date().toISOString() + " ALERT " + message + " notified=" + notified + String.fromCharCode(10), "utf8");
      } catch {
        // logging is best-effort
      }
      await writeState({
        ...state,
        last_alert_key: key,
        last_alert_at: new Date().toISOString(),
        last_check: result.checked_at,
        last_result: result
      });
    } else {
      await writeState({ ...state, last_check: result.checked_at, last_result: result });
    }
    console.log(args.json ? JSON.stringify(result, null, 2) : "ALERT: " + alerts.join("；"));
    return 2;
  }

  await writeState({ ...state, last_alert_key: "", last_check: result.checked_at, last_result: result });
  console.log(args.json ? JSON.stringify(result, null, 2) : "OK: 无通信异常");
  return 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "watch") {
    const loop = async () => {
      try {
        const code = await check({ ...args, json: false });
        if (code === 2) {
          // already logged/notified; continue watching
        }
      } catch (error) {
        try {
          await mkdir(LOG_DIR, { recursive: true });
          await appendFile(LOG_PATH, new Date().toISOString() + " ERROR " + (error instanceof Error ? error.message : String(error)) + String.fromCharCode(10), "utf8");
        } catch {
          // ignore
        }
      }
      setTimeout(loop, Math.max(15, args.interval) * 1000);
    };
    await loop();
    return;
  }
  const code = await check(args);
  process.exitCode = code;
}

main().catch((error) => {
  console.error("mail-liveness failed: " + (error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
