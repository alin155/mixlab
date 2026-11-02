#!/usr/bin/env node
/** Pure advisor routing policy: decide when Codex should review mailbox messages. */

export const DEFAULT_MODE = "hybrid";
export const DEFAULT_BATCH_SIZE = 8;
export const DEFAULT_BATCH_AGE_MS = 3 * 60 * 60 * 1000;

const SKIP_TYPES = new Set(["ack", "acknowledge", "status"]);

const HIGH_RISK_PATTERNS = [
  /installer/i, /update\.json/i, /LATEST/i, /release/i, /publish/i, /deploy/i,
  /rollback/i, /code\s*sign/i, /auth/i, /token/i, /secret/i, /privacy/i,
  /screenshot/i, /feedback\s*upload/i, /delete/i, /migration/i, /index\s*repair/i,
  /NAS/i, /升级/i, /安装包/i, /发布/i, /部署/i, /回滚/i, /签名/i,
  /隐私/i, /截图/i, /上传/i, /删除/i, /迁移/i, /索引修复/i
];

const MILESTONE_PATTERNS = [
  /spec/i, /规格/i, /candidate/i, /候选/i, /build/i, /构建/i,
  /acceptance/i, /验收/i, /evidence/i, /证据/i, /sha256/i,
  /commit/i, /diff/i, /milestone/i, /里程碑/i, /交付/i
];

function textOf(message) {
  return String(message?.body || "");
}

export function isReviewableMessage(message) {
  if (!message || typeof message.id !== "string") return false;
  if (message.from !== "mac" && message.from !== "windows") return false;
  if (SKIP_TYPES.has(String(message.type || "").toLowerCase())) return false;
  return textOf(message).trim().length > 0;
}

export function classifyMessage(message) {
  if (!isReviewableMessage(message)) return "skip";
  const body = textOf(message);
  if (HIGH_RISK_PATTERNS.some((pattern) => pattern.test(body))) return "high";
  if (MILESTONE_PATTERNS.some((pattern) => pattern.test(body))) return "milestone";
  return "normal";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function dedupeMessages(messages) {
  const seen = new Set();
  const out = [];
  for (const message of messages) {
    if (!message || seen.has(message.id)) continue;
    seen.add(message.id);
    out.push(message);
  }
  return out;
}

export function selectReviewScope(input) {
  const mode = input.mode || DEFAULT_MODE;
  const batchSize = input.batchSize || DEFAULT_BATCH_SIZE;
  const batchAgeMs = input.batchAgeMs || DEFAULT_BATCH_AGE_MS;
  const now = input.now ? new Date(input.now) : new Date();
  const reviewed = new Set(input.reviewedIds || []);
  const all = dedupeMessages(input.messages || []);
  const byId = new Map(all.map((message) => [message.id, message]));
  const pending = unique(input.pendingIds || []).map((id) => byId.get(id)).filter(Boolean);
  const fresh = all.filter((message) => isReviewableMessage(message) && !reviewed.has(message.id));
  const freshByRisk = { high: [], milestone: [], normal: [] };
  for (const message of fresh) {
    const risk = classifyMessage(message);
    if (risk === "skip") continue;
    freshByRisk[risk].push(message);
  }

  if (mode === "every") {
    const selected = dedupeMessages(fresh);
    return { selected, pendingIds: [], pendingSince: "", reviewKind: "every", reason: "every-mode" };
  }

  if (mode === "milestone") {
    const selected = dedupeMessages([...pending, ...freshByRisk.milestone, ...freshByRisk.high]);
    return selected.length > 0
      ? { selected, pendingIds: [], pendingSince: "", reviewKind: "milestone", reason: "milestone-mode" }
      : { selected: [], pendingIds: unique([...pending.map((m) => m.id), ...freshByRisk.normal.map((m) => m.id)]), pendingSince: input.pendingSince || now.toISOString(), reviewKind: "none", reason: "milestone-waiting" };
  }

  if (freshByRisk.high.length > 0) {
    const selected = dedupeMessages([...pending, ...freshByRisk.high]);
    return { selected, pendingIds: [], pendingSince: "", reviewKind: "high", reason: "high-risk-trigger" };
  }

  const pendingIds = unique([...pending.map((m) => m.id), ...freshByRisk.normal.map((m) => m.id)]);
  const pendingSince = input.pendingSince || (pendingIds.length > 0 ? now.toISOString() : "");
  const pendingAgeMs = pendingSince ? now.getTime() - new Date(pendingSince).getTime() : 0;
  if (freshByRisk.milestone.length > 0) {
    const selected = dedupeMessages([...pending, ...freshByRisk.milestone]);
    return { selected, pendingIds: [], pendingSince: "", reviewKind: "milestone", reason: "milestone-trigger" };
  }
  if (pendingIds.length >= batchSize || pendingAgeMs >= batchAgeMs) {
    const selected = dedupeMessages([...pending, ...freshByRisk.normal]);
    return { selected, pendingIds: [], pendingSince: "", reviewKind: "batch", reason: pendingIds.length >= batchSize ? "batch-size" : "batch-age" };
  }
  return { selected: [], pendingIds, pendingSince, reviewKind: "none", reason: "hybrid-waiting" };
}
