#!/usr/bin/env node
/**
 * Codex advisor feedback tracker.
 * Append-only JSONL: docs/handoff/advisor-feedback.jsonl
 * used by advisor.mjs (review packet) and dashboard (adoption rate).
 *
 * usage:
 *   node scripts/dev/advisor-feedback.mjs add --advisory <id> --suggestion <key> --decision adopted|rejected|deferred --reason "..." [--by mac] [--evidence "..."]
 *   node scripts/dev/advisor-feedback.mjs list [--json]
 *   node scripts/dev/advisor-feedback.mjs stats [--json]
 */
import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FEEDBACK_FILE = path.join(REPO, "docs/handoff/advisor-feedback.jsonl");
const DECISIONS = new Set(["adopted", "rejected", "deferred"]);

function parseArgs(argv) {
  const args = { command: argv[0] || "stats", json: false };
  for (let i = 1; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--json") args.json = true;
    else if (value === "--advisory") args.advisory = argv[++i];
    else if (value === "--suggestion") args.suggestion = argv[++i];
    else if (value === "--decision") args.decision = argv[++i];
    else if (value === "--reason") args.reason = argv[++i];
    else if (value === "--by") args.by = argv[++i] || "mac";
    else if (value === "--evidence") args.evidence = argv[++i];
  }
  return args;
}

async function readFeedback() {
  const raw = await readFile(FEEDBACK_FILE, "utf8").catch(() => "");
  return raw.split(String.fromCharCode(10)).filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function summarize(rows) {
  const counts = { adopted: 0, rejected: 0, deferred: 0 };
  const bySuggestion = new Map();
  for (const row of rows) {
    if (counts[row.decision] !== undefined) counts[row.decision] += 1;
    const key = String(row.suggestion || "unknown");
    const item = bySuggestion.get(key) || { suggestion: key, adopted: 0, rejected: 0, deferred: 0 };
    if (item[row.decision] !== undefined) item[row.decision] += 1;
    bySuggestion.set(key, item);
  }
  const decided = counts.adopted + counts.rejected;
  const adoptionRate = decided > 0 ? Math.round((counts.adopted / decided) * 100) : 0;
  return {
    total: rows.length,
    adopted: counts.adopted,
    rejected: counts.rejected,
    deferred: counts.deferred,
    decided: decided,
    adoption_rate: adoptionRate,
    by_suggestion: [...bySuggestion.values()].sort((a, b) => (b.adopted + b.rejected) - (a.adopted + a.rejected))
  };
}

async function add(args) {
  if (!args.advisory || !args.suggestion || !DECISIONS.has(args.decision) || !args.reason) {
    throw new Error("add requires --advisory --suggestion --decision adopted|rejected|deferred --reason");
  }
  const row = {
    schema_version: "1",
    advisory_id: args.advisory,
    suggestion: args.suggestion,
    decision: args.decision,
    reason: args.reason,
    decided_by: args.by || "mac",
    decided_at: new Date().toISOString(),
    ...(args.evidence ? { evidence: args.evidence } : {})
  };
  await appendFile(FEEDBACK_FILE, JSON.stringify(row) + String.fromCharCode(10), "utf8");
  console.log(JSON.stringify({ ok: true, row }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "add") return add(args);
  const rows = await readFeedback();
  if (args.command === "list") {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  console.log(JSON.stringify(summarize(rows), null, 2));
}

main().catch((error) => {
  console.error("advisor-feedback failed: " + (error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
