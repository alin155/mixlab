#!/usr/bin/env node
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_ROOT = path.join("/Volumes/MixLab", "CutterFeedback");
const DEFAULT_LOCAL_ROOT = path.join(os.homedir(), "Library", "Application Support", "MixLab", "Feedback");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      out[key.slice(2)] = true;
      continue;
    }
    out[key.slice(2)] = value;
    i += 1;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.root || DEFAULT_ROOT);
const localRoot = path.resolve(args["local-root"] || DEFAULT_LOCAL_ROOT);
const inbox = path.join(root, "inbox");
const processed = path.join(root, "processed");
const rejected = path.join(root, "rejected");
const now = new Date().toISOString();

function safeId(value) {
  return typeof value === "string" && /^FB-[0-9]{8}-[0-9]{4,}$/.test(value.trim()) ? value.trim() : "";
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function formatContext(context) {
  if (!context || typeof context !== "object") return [];
  const lines = [];
  for (const [key, value] of Object.entries(context)) {
    if (value === null || value === undefined || value === "") continue;
    if (typeof value === "object") {
      lines.push("- " + key + ": " + JSON.stringify(value));
    } else {
      lines.push("- " + key + ": " + String(value));
    }
  }
  return lines;
}

async function copyDir(source, destination) {
  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true, force: true });
}

async function moveDir(source, destination) {
  try {
    await rename(source, destination);
  } catch {
    await copyDir(source, destination);
    await rm(source, { recursive: true, force: true });
  }
}

async function nextDestination(parent, id) {
  let candidate = path.join(parent, id);
  if (!(await readFile(path.join(candidate, "feedback.json")).catch(() => null))) return candidate;
  candidate = path.join(parent, id + "-" + Date.now());
  return candidate;
}

async function main() {
  await mkdir(inbox, { recursive: true });
  await mkdir(processed, { recursive: true });
  await mkdir(rejected, { recursive: true });
  await mkdir(localRoot, { recursive: true });

  const entries = await readdir(inbox, { withFileTypes: true }).catch(() => []);
  const received = [];
  const failed = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const source = path.join(inbox, entry.name);
    let feedback;
    try {
      feedback = JSON.parse(await readFile(path.join(source, "feedback.json"), "utf8"));
    } catch (error) {
      const target = await nextDestination(rejected, entry.name);
      await moveDir(source, target).catch(() => {});
      await writeFile(path.join(target, "error.txt"), String(error)).catch(() => {});
      failed.push({ id: entry.name, error: "invalid feedback.json" });
      continue;
    }
    const id = safeId(feedback.feedback_id) || safeId(entry.name);
    if (!id) {
      const target = await nextDestination(rejected, entry.name);
      await moveDir(source, target).catch(() => {});
      failed.push({ id: entry.name, error: "invalid feedback id" });
      continue;
    }
    const localDir = path.join(localRoot, "inbox", id);
    await copyDir(source, localDir);
    const repairAttempts = Array.isArray(feedback.repair_attempts)
      ? feedback.repair_attempts.map((item) => {
          const action = text(item?.action) || "unknown";
          const state = item?.ok === true ? "成功" : "失败";
          const error = text(item?.error);
          return "- " + action + ": " + state + (error ? "（" + error + "）" : "");
        })
      : [];
    const summary = [
      "# Feedback " + id,
      "",
      "- 时间: " + (text(feedback.created_at) || "unknown"),
      "- 来源: " + (text(feedback.source) || "cutter"),
      "- 需要管理员: " + (feedback.needs_admin === true ? "是" : "否"),
      "- 类别: " + (text(feedback.category) || "unknown"),
      "- 页面: " + (text(feedback.page) || "unknown"),
      "- 应用: " + (text(feedback.app_version) || "unknown"),
      "- 构建: " + (text(feedback.build_commit) || "unknown"),
      "- Release: " + (text(feedback.release_version) || "unknown"),
      "- 用户: " + (text(feedback.username) || "unknown"),
      ...(text(feedback.diagnosis) ? ["- 诊断分类: " + text(feedback.diagnosis)] : []),
      ...(text(feedback.case_id) ? ["- 诊断编号: " + text(feedback.case_id)] : []),
      "",
      "## 用户描述",
      "",
      text(feedback.message) || "(empty)",
      "",
      "## 期望结果",
      "",
      text(feedback.expected) || "(empty)",
      ...(repairAttempts.length > 0
        ? ["", "## 已尝试修复", "", ...repairAttempts]
        : []),
      "",
      "## 上下文",
      "",
      ...formatContext(feedback.context),
      "",
      "## 错误",
      "",
      ...(Array.isArray(feedback.errors) && feedback.errors.length > 0
        ? feedback.errors.map((item) => "- " + (typeof item === "string" ? item : JSON.stringify(item)))
        : ["- none"]),
      "",
      "## 附件",
      "",
      ...(Array.isArray(feedback.attachments) ? feedback.attachments.map((item) => "- " + item) : ["- none"]),
      ""
    ].join("\n");
    await writeFile(path.join(localDir, "summary.md"), summary, "utf8");
    const target = await nextDestination(processed, id);
    await moveDir(source, target);
    received.push({ id, summary: path.join(localDir, "summary.md") });
  }

  const report = { ok: failed.length === 0, checked_at: now, root, local_root: localRoot, received, failed };
  await writeFile(path.join(localRoot, "last-check.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, checked_at: now, error: String(error) }, null, 2));
  process.exit(1);
});
