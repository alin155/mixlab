import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildAdminDockerNasHandoffKitReport,
  runAdminDockerNasHandoffKit,
  toMarkdown
} from "./admin-docker-nas-handoff-kit.ts";

const TARGET_SHA = "b062bc387c1fdb2a391320c1c36233b782cb000a";
const TARGET_REF = `admin-docker-candidate-${TARGET_SHA}`;

function handoffReport(overrides: Record<string, unknown> = {}): unknown {
  return {
    mode: "admin-docker-nas-release-inputs-handoff",
    handoff_package_ready: true,
    push_execution_allowed: false,
    docker_deploy_allowed: false,
    observations: {
      candidate_sha: TARGET_SHA,
      candidate_release_ref: TARGET_REF
    },
    result: {
      status: "ready-for-nas-collection"
    },
    artifacts: {
      bundle_dir: "handoff-latest"
    },
    ...overrides
  };
}

function report(input: {
  handoff?: unknown;
  missing?: string[];
  hits?: string[];
  files?: Array<{ path: string; sha256: string; size_bytes: number; executable: boolean }>;
} = {}) {
  return buildAdminDockerNasHandoffKitReport({
    generated_at: "2026-06-28T00:00:00.000Z",
    command: "test",
    handoff_report_path: "handoff.json",
    handoff_bundle_dir: "handoff-latest",
    handoff_report: input.handoff ?? handoffReport(),
    missing_required_files: input.missing ?? [],
    strict_sensitive_scan_hits: input.hits ?? [],
    packaged_files: input.files ?? [
      { path: "README.md", sha256: "a".repeat(64), size_bytes: 1, executable: false },
      { path: "OPERATOR-CHECKLIST.md", sha256: "b".repeat(64), size_bytes: 1, executable: false },
      { path: "MANIFEST.json", sha256: "c".repeat(64), size_bytes: 1, executable: false },
      { path: "KIT-README.md", sha256: "d".repeat(64), size_bytes: 1, executable: false },
      { path: "KIT-SELF-CHECK.sh", sha256: "e".repeat(64), size_bytes: 1, executable: true },
      { path: "KIT-FILES.sha256", sha256: "4".repeat(64), size_bytes: 1, executable: false },
      { path: "KIT-MANIFEST.json", sha256: "5".repeat(64), size_bytes: 1, executable: false },
      { path: "nas/RUN_ON_NAS.sh", sha256: "f".repeat(64), size_bytes: 1, executable: true },
      { path: "nas/admin-docker-nas-release-inputs-collector.sh", sha256: "1".repeat(64), size_bytes: 1, executable: true },
      { path: "local/install-nas-runner.sh", sha256: "2".repeat(64), size_bytes: 1, executable: true },
      { path: "local/validate-returned-evidence.sh", sha256: "3".repeat(64), size_bytes: 1, executable: true }
    ]
  });
}

async function writeBundle(root: string): Promise<void> {
  await mkdir(path.join(root, "nas"), { recursive: true });
  await mkdir(path.join(root, "local"), { recursive: true });
  await writeFile(path.join(root, "README.md"), "# Handoff\n");
  await writeFile(path.join(root, "OPERATOR-CHECKLIST.md"), "# Admin Docker NAS Operator Checklist\n");
  await writeFile(path.join(root, "MANIFEST.json"), `${JSON.stringify({
    schema_version: "1.0",
    mode: "admin-docker-nas-release-inputs-handoff",
    candidate_sha: TARGET_SHA,
    candidate_release_ref: TARGET_REF
  }, null, 2)}\n`);
  await writeFile(path.join(root, "nas", "RUN_ON_NAS.sh"), "#!/usr/bin/env sh\nsh ./nas/admin-docker-nas-release-inputs-collector.sh\n");
  await writeFile(path.join(root, "nas", "admin-docker-nas-release-inputs-collector.sh"), "#!/usr/bin/env sh\necho collect\n");
  await writeFile(path.join(root, "local", "install-nas-runner.sh"), "#!/usr/bin/env sh\necho install\n");
  await writeFile(path.join(root, "local", "validate-returned-evidence.sh"), "#!/usr/bin/env sh\necho validate\n");
  await chmod(path.join(root, "nas", "RUN_ON_NAS.sh"), 0o755);
  await chmod(path.join(root, "nas", "admin-docker-nas-release-inputs-collector.sh"), 0o755);
  await chmod(path.join(root, "local", "install-nas-runner.sh"), 0o755);
  await chmod(path.join(root, "local", "validate-returned-evidence.sh"), 0o755);
}

test("Admin Docker NAS handoff kit becomes ready from a ready handoff bundle", () => {
  const built = report();

  assert.equal(built.kit_ready, true);
  assert.equal(built.result.status, "ready-for-transfer");
  assert.equal(built.push_execution_allowed, false);
  assert.equal(built.docker_deploy_allowed, false);
  assert.deepEqual(built.summary.kit_blockers, []);
  assert.equal(built.observations.candidate_sha, TARGET_SHA);
  assert.equal(built.observations.candidate_release_ref, TARGET_REF);
});

test("Admin Docker NAS handoff kit blocks missing bundle files", () => {
  const built = report({
    missing: ["nas/RUN_ON_NAS.sh"]
  });

  assert.equal(built.kit_ready, false);
  assert.equal(built.result.status, "blocked");
  assert.ok(built.summary.kit_blockers.includes("bundle-required-files-present"));
});

test("Admin Docker NAS handoff kit fails if source handoff approves push or deploy", () => {
  const built = report({
    handoff: handoffReport({
      push_execution_allowed: true,
      docker_deploy_allowed: true
    })
  });

  assert.equal(built.kit_ready, false);
  assert.equal(built.result.status, "failed");
  assert.ok(built.summary.kit_blockers.includes("handoff-safety-flags"));
});

test("Admin Docker NAS handoff kit markdown records transfer boundary", () => {
  const markdown = toMarkdown(report());

  assert.match(markdown, /ready-for-transfer/);
  assert.match(markdown, /Push execution allowed: no/);
  assert.match(markdown, /Docker deploy allowed: no/);
  assert.match(markdown, /Transfer/);
});

test("Admin Docker NAS handoff kit CLI writes a portable kit and report", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-admin-nas-kit-"));
  const handoffPath = path.join(tempRoot, "handoff.json");
  const bundleDir = path.join(tempRoot, "handoff-latest");
  const kitDir = path.join(tempRoot, "kit");
  const artifactDir = path.join(tempRoot, "artifacts");

  await writeBundle(bundleDir);
  await writeFile(handoffPath, `${JSON.stringify(handoffReport({
    artifacts: {
      bundle_dir: bundleDir
    }
  }), null, 2)}\n`);

  const built = await runAdminDockerNasHandoffKit({
    handoff_report_path: handoffPath,
    handoff_bundle_dir: bundleDir,
    output_dir: kitDir,
    artifact_dir: artifactDir,
    generated_at: "2026-06-28T00:00:00.000Z",
    command: "test"
  });

  assert.equal(built.kit_ready, true);
  assert.equal(built.artifacts?.json_path, path.join(artifactDir, "admin-docker-nas-handoff-kit-20260628T000000Z.json"));
  assert.match(await readFile(path.join(kitDir, "KIT-README.md"), "utf8"), /KIT-SELF-CHECK\.sh/);
  assert.match(await readFile(path.join(kitDir, "KIT-FILES.sha256"), "utf8"), /KIT-SELF-CHECK\.sh/);
  assert.match(await readFile(path.join(kitDir, "KIT-MANIFEST.json"), "utf8"), /KIT-README\.md/);
  assert.match(await readFile(path.join(kitDir, "KIT-MANIFEST.json"), "utf8"), /KIT-FILES\.sha256/);
  assert.match(await readFile(path.join(kitDir, "KIT-MANIFEST.json"), "utf8"), /KIT-SELF-CHECK\.sh/);
  assert.match(await readFile(built.artifacts?.markdown_path ?? "", "utf8"), /ready-for-transfer/);
  assert.match(await readFile(built.artifacts?.latest_markdown_path ?? "", "utf8"), /ready-for-transfer/);
  assert.ok((await stat(path.join(kitDir, "KIT-SELF-CHECK.sh"))).mode & 0o111);
  assert.ok((await stat(path.join(kitDir, "nas", "RUN_ON_NAS.sh"))).mode & 0o111);
  assert.ok((await stat(path.join(kitDir, "nas", "admin-docker-nas-release-inputs-collector.sh"))).mode & 0o111);
  assert.ok((await stat(path.join(kitDir, "local", "validate-returned-evidence.sh"))).mode & 0o111);
  assert.deepEqual(built.observations.strict_sensitive_scan_hits, []);
  const selfCheck = spawnSync("sh", ["./KIT-SELF-CHECK.sh"], {
    cwd: kitDir,
    encoding: "utf8"
  });
  assert.equal(selfCheck.status, 0, `${selfCheck.stdout}\n${selfCheck.stderr}`);
  assert.match(selfCheck.stdout, /self-check passed/);
});
