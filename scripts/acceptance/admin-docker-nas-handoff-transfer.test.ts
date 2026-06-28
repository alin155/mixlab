import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildAdminDockerNasHandoffTransferReport,
  runAdminDockerNasHandoffTransfer,
  toMarkdown
} from "./admin-docker-nas-handoff-transfer.ts";

test("NAS handoff transfer copies archive to safe share and verifies sha", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-nas-handoff-transfer-"));
  const sourceDir = path.join(tempRoot, "dist");
  const destinationDir = path.join(tempRoot, "安装包", "mixlab-admin-docker-handoff");
  const outputDir = path.join(tempRoot, "artifacts");
  const sourceArchive = path.join(sourceDir, "admin-docker-nas-handoff-kit.tar.gz");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(sourceArchive, "portable handoff kit");

  const report = await runAdminDockerNasHandoffTransfer({
    source_archive_path: sourceArchive,
    destination_dir: destinationDir,
    output_dir: outputDir,
    generated_at: "2026-06-28T00:00:00.000Z",
    command: "test transfer"
  });

  const copied = await stat(path.join(destinationDir, "admin-docker-nas-handoff-kit.tar.gz"));
  assert.equal(copied.isFile(), true);
  assert.equal(report.transfer_completed, true);
  assert.equal(report.result.status, "transferred");
  assert.equal(report.summary.transfer_blockers.length, 0);
  assert.equal(report.observations.source_archive?.sha256, report.observations.destination_archive?.sha256);
  assert.equal(report.push_execution_allowed, false);
  assert.equal(report.docker_deploy_allowed, false);
  assert.equal(report.nas_public_library_writes_allowed, false);
  assert.equal(report.docker_runtime_touched, false);
  assert.match(await readFile(report.artifacts?.markdown_path ?? "", "utf8"), /Docker runtime touched: no/);
});

test("NAS handoff transfer refuses PublicLibrary destinations", () => {
  const report = buildAdminDockerNasHandoffTransferReport({
    generated_at: "2026-06-28T00:00:00.000Z",
    command: "unit",
    source_archive_path: "dist/admin-docker-nas-handoff-kit.tar.gz",
    destination_dir: "/Volumes/MixLab/PublicLibrary/admin-docker",
    destination_archive_path: "/Volumes/MixLab/PublicLibrary/admin-docker/admin-docker-nas-handoff-kit.tar.gz",
    source_archive: {
      path: "dist/admin-docker-nas-handoff-kit.tar.gz",
      sha256: "abc",
      size_bytes: 1
    },
    destination_archive: null,
    dry_run: false
  });

  assert.equal(report.transfer_completed, false);
  assert.ok(report.summary.transfer_blockers.includes("destination-not-public-library"));
  assert.equal(report.observations.destination_is_public_library, true);
});

test("NAS handoff transfer dry-run does not mark transfer complete", () => {
  const report = buildAdminDockerNasHandoffTransferReport({
    generated_at: "2026-06-28T00:00:00.000Z",
    command: "unit",
    source_archive_path: "dist/admin-docker-nas-handoff-kit.tar.gz",
    destination_dir: "/Volumes/MixLab/安装包/mixlab-admin-docker-handoff",
    destination_archive_path: "/Volumes/MixLab/安装包/mixlab-admin-docker-handoff/admin-docker-nas-handoff-kit.tar.gz",
    source_archive: {
      path: "dist/admin-docker-nas-handoff-kit.tar.gz",
      sha256: "abc",
      size_bytes: 1
    },
    destination_archive: {
      path: "/Volumes/MixLab/安装包/mixlab-admin-docker-handoff/admin-docker-nas-handoff-kit.tar.gz",
      sha256: "abc",
      size_bytes: 1
    },
    dry_run: true
  });

  assert.equal(report.transfer_completed, false);
  assert.equal(report.result.status, "blocked");
  assert.equal(report.observations.dry_run, true);
  assert.match(toMarkdown(report), /Dry run: yes/);
});
