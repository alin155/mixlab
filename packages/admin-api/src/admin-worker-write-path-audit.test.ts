import assert from "node:assert/strict";
import test from "node:test";
import {
  adminWorkerWritePathAuditEntries,
  adminWorkerWritePathAuditEntry,
  adminWorkerWritePathAuditKeys,
  adminWorkerWritePathEntriesWithGaps
} from "./admin-worker-write-path-audit.ts";

const expectedWorkerWritePathKeys = [
  "admin-supervisor-pipeline-scan-and-queue",
  "admin-supervisor-publish-cycle",
  "admin-supervisor-worker-cycle",
  "docker-worker-loop-spawn",
  "library-fs-preprocess-lifecycle-primitives",
  "standalone-preprocess-worker",
  "standalone-ready-publish-worker"
].sort();

test("worker write-path audit enumerates current Admin background mutation surfaces", () => {
  assert.deepEqual(adminWorkerWritePathAuditKeys(), expectedWorkerWritePathKeys);
  assert.equal(
    new Set(adminWorkerWritePathAuditKeys()).size,
    adminWorkerWritePathAuditEntries.length,
    "worker write-path audit ids must be unique"
  );
});

test("Admin supervisor scan and queue path records command coverage and enforced runtime policy", () => {
  const entry = adminWorkerWritePathAuditEntry("admin-supervisor-pipeline-scan-and-queue");

  assert.ok(entry);
  assert.equal(entry.scan_mode, "folder-scan");
  assert.equal(entry.writer_lease_coverage, "full");
  assert.deepEqual(entry.command_names, ["library-scan", "preprocess-queue-unprocessed-pipeline"]);
  assert.ok(entry.functions.includes("runAdminLibraryScanCommand"));
  assert.ok(entry.functions.includes("runAdminPipelineQueueCommand"));
  assert.deepEqual(
    entry.runtime_policy_flags_used,
    ["auto_scan_enabled", "auto_queue_enabled"]
  );
  assert.deepEqual(entry.runtime_policy_flags_not_enforced, []);
  assert.equal(entry.safe_for_page_request, false);
  assert.match(entry.gap, /separate command transactions/);
});

test("Admin supervisor worker cycle uses command runtime for short lifecycle writes", () => {
  const entry = adminWorkerWritePathAuditEntry("admin-supervisor-worker-cycle");

  assert.ok(entry);
  assert.equal(entry.scan_mode, "single-id");
  assert.equal(entry.writer_lease_coverage, "partial");
  assert.deepEqual(entry.command_names, [
    "preprocess-worker-claim",
    "preprocess-worker-stage",
    "preprocess-worker-complete",
    "preprocess-worker-fail",
    "preprocess-worker-refresh-counts"
  ]);
  assert.deepEqual(entry.audit_surfaces, ["command-audit", "preprocess-job-log"]);
  assert.ok(entry.functions.includes("createAdminWorkerLifecycleCommands"));
  assert.ok(entry.functions.includes("runAdminWorkerClaimCommand"));
  assert.ok(entry.functions.includes("runAdminWorkerStageCommand"));
  assert.ok(entry.functions.includes("runAdminWorkerCompleteCommand"));
  assert.ok(entry.functions.includes("assertAdminWorkerTextArtifactCommitReady"));
  assert.ok(entry.functions.includes("runAdminWorkerFailCommand"));
  assert.ok(entry.functions.includes("runAdminWorkerRefreshCountsCommand"));
  assert.ok(entry.mutation_targets.includes("transcript-artifact"));
  assert.ok(entry.mutation_targets.includes("asr-audio-artifact"));
  assert.deepEqual(entry.runtime_policy_flags_used, ["audio_mode", "concurrent_jobs"]);
  assert.deepEqual(entry.runtime_policy_flags_not_enforced, []);
  assert.ok(entry.status_transitions.includes("queued -> processing"));
  assert.ok(entry.status_transitions.includes("processing -> index-required"));
  assert.ok(entry.status_transitions.includes("processing -> failed"));
  assert.equal(entry.visible_to_cutters_effect, "hide");
  assert.match(entry.gap, /verifies and snapshots required text artifacts/);
  assert.match(entry.gap, /ASR audio/);
  assert.match(entry.gap, /long-running media\/ASR work/);
});

test("Admin supervisor publish cycle records ready visibility and enforced auto-publish policy", () => {
  const entry = adminWorkerWritePathAuditEntry("admin-supervisor-publish-cycle");

  assert.ok(entry);
  assert.equal(entry.scan_mode, "status-scan");
  assert.equal(entry.writer_lease_coverage, "full");
  assert.deepEqual(entry.command_names, ["preprocess-supervisor-publish-ready"]);
  assert.deepEqual(entry.audit_surfaces, ["command-audit", "preprocess-job-log"]);
  assert.deepEqual(entry.runtime_policy_flags_used, ["auto_publish_index_enabled"]);
  assert.deepEqual(entry.runtime_policy_flags_not_enforced, []);
  assert.ok(entry.status_transitions.includes("index-required -> ready"));
  assert.equal(entry.visible_to_cutters_effect, "show");
  assert.ok(entry.mutation_targets.includes("index-release"));
  assert.ok(entry.mutation_targets.includes("cutter-release"));
  assert.match(entry.gap, /scan\/init and standalone worker publication/);
});

test("standalone workers are explicitly enabled and record their remaining mvp-safe gaps", () => {
  const preprocess = adminWorkerWritePathAuditEntry("standalone-preprocess-worker");
  const publish = adminWorkerWritePathAuditEntry("standalone-ready-publish-worker");

  assert.ok(preprocess);
  assert.ok(publish);
  assert.equal(preprocess.requires_explicit_enable_flag, true);
  assert.equal(publish.requires_explicit_enable_flag, true);
  assert.equal(preprocess.writer_lease_coverage, "partial");
  assert.equal(publish.writer_lease_coverage, "none");
  assert.deepEqual(preprocess.command_names, [
    "preprocess-worker-claim",
    "preprocess-worker-stage",
    "preprocess-worker-complete",
    "preprocess-worker-fail",
    "preprocess-worker-refresh-counts"
  ]);
  assert.deepEqual(publish.command_names, []);
  assert.equal(preprocess.scan_mode, "folder-scan");
  assert.equal(publish.scan_mode, "status-scan");
  assert.ok(preprocess.functions.includes("createAdminWorkerLifecycleCommands"));
  assert.ok(preprocess.audit_surfaces.includes("command-audit"));
  assert.match(preprocess.gap, /NAS Docker defaults the flag to 0/);
  assert.match(publish.gap, /NAS Docker defaults the flag to 0/);
  assert.match(preprocess.gap, /scan_before_claim=false/);
  assert.match(preprocess.gap, /claim_statuses=\[queued\]/);
  assert.match(publish.gap, /refuses to schedule it in Docker MVP v0\.1/);
  assert.match(publish.gap, /exits before publishing in MVP mode/);
});

test("low-level lifecycle primitives must not be treated as complete command protection", () => {
  const entry = adminWorkerWritePathAuditEntry("library-fs-preprocess-lifecycle-primitives");

  assert.ok(entry);
  assert.equal(entry.writer_lease_coverage, "none");
  assert.equal(entry.audit_surfaces.includes("preprocess-job-log"), true);
  assert.ok(entry.status_transitions.includes("index-required -> ready"));
  assert.match(entry.gap, /callers must provide/);
});

test("all mutating worker paths stay out of page-request loading", () => {
  for (const entry of adminWorkerWritePathAuditEntries) {
    assert.equal(entry.safe_for_page_request, false, `${entry.id} must not be page-request safe`);
  }
});

test("current worker write-path gaps are explicit and actionable", () => {
  const gapIds = adminWorkerWritePathEntriesWithGaps().map((entry) => entry.id).sort();

  assert.deepEqual(gapIds, expectedWorkerWritePathKeys);
  for (const entry of adminWorkerWritePathEntriesWithGaps()) {
    assert.ok(entry.gap.length > 40, `${entry.id} needs an explanatory gap`);
  }
});
