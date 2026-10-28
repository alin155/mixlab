import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  applyReleaseRollback,
  listReleaseRollbackTargets,
  planReleaseRollback,
  verifyReleaseTarget
} from "./release-rollback.ts";

const LIB = async (): Promise<string> => mkdtemp(path.join(os.tmpdir(), "mixlab-rollback-"));
const mixlab = (root: string) => path.join(root, ".mixlab-library");
const releaseDir = (root: string, v: string) => path.join(mixlab(root), "releases", v);
const pointerPath = (root: string) => path.join(mixlab(root), "current-release.json");
const previousPath = (root: string) => path.join(mixlab(root), "previous-current-release.json");
const auditPath = (root: string) => path.join(mixlab(root), "release-rollback-audit.jsonl");

async function writePointer(root: string, version: string, file = pointerPath(root)): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ schema_version: "1.0", library_id: "lib_main_001", current_version: version, updated_at: "2026-10-01T00:00:00.000Z", manifest_path: ".mixlab-library/releases/" + version + "/release.json" }, null, 2) + "\n");
}

async function writeRelease(root: string, version: string, options: { createdAt?: string; legacy?: boolean; v2?: boolean; breakCatalog?: boolean } = {}): Promise<void> {
  const dir = releaseDir(root, version);
  const createdAt = options.createdAt ?? "2026-10-01T00:00:00.000Z";
  const indexDir = path.join(dir, "search-index", "source-transcript-index", version);
  await mkdir(indexDir, { recursive: true });
  await writeFile(path.join(indexDir, "index.sqlite"), version);
  await writeFile(path.join(dir, "catalog.sqlite"), options.breakCatalog ? "" : "catalog-" + version);
  if (options.breakCatalog) await rm(path.join(dir, "catalog.sqlite"));
  await writeFile(path.join(dir, "source-path-map.json"), JSON.stringify({ schema_version: "1.0", release_version: version, library_id: "lib_main_001", source_videos: {} }));
  if (options.legacy !== false) {
    await writeFile(path.join(dir, "release.json"), JSON.stringify({ schema_version: "1.0", release_version: version, library_id: "lib_main_001", generated_at: createdAt, ready_video_count: 1, source_index_version: version, catalog_path: "catalog.sqlite", source_path_map_path: "source-path-map.json", search_index_path: "search-index/source-transcript-index", thumbnails_path: "thumbnails", transcript_pack_path: "transcript-pack" }, null, 2));
  }
  if (options.v2) {
    await writeFile(path.join(dir, "release-manifest-v2.json"), JSON.stringify({ schema_version: "2.0", contract_version: "1.0.0", release_id: "rel-" + version, library_id: "lib_main_001", created_at: createdAt, min_client_version: "0.18.10", index_version: version, ready_video_count: 1, files: [{ path: "catalog.sqlite", role: "catalog", size: 1, sha256: "a".repeat(64) }] }));
  }
}

async function seededLibrary(): Promise<string> {
  const root = await LIB();
  await writeRelease(root, "v000001", { createdAt: "2026-09-01T00:00:00.000Z" });
  await writeRelease(root, "v000002", { createdAt: "2026-09-02T00:00:00.000Z", v2: true });
  await writeRelease(root, "v000003", { createdAt: "2026-09-03T00:00:00.000Z" });
  await writePointer(root, "v000003");
  return root;
}

test("dry-run lists rollback targets and prefers previous-current-release pointer", async () => {
  const root = await seededLibrary();
  await writePointer(root, "v000002", previousPath(root));
  const targets = await listReleaseRollbackTargets({ library_root: root });
  assert.equal(targets.current_version, "v000003");
  assert.equal(targets.previous_version, "v000002");
  assert.equal(targets.targets.length, 3);
  const plan = await planReleaseRollback({ library_root: root, reason: "回滚", operator: "tester", now: () => "2026-10-27T00:00:00.000Z" });
  assert.equal(plan.target_version, "v000002");
  assert.equal(plan.verification.ok, true);
  assert.equal(plan.previous_pointer_exists, true);
  assert.match(plan.commands.apply, /--apply/);
  // dry-run 不写任何指针/备份/审计。
  assert.equal((await readFile(pointerPath(root), "utf8")).includes("v000003"), true);
  await assert.rejects(() => stat(auditPath(root)), /ENOENT/);
  rm(root, { recursive: true, force: true }).catch(() => undefined);
});

test("apply atomically switches pointer, backs up previous pointer, and writes audit", async () => {
  const root = await seededLibrary();
  const plan = await planReleaseRollback({ library_root: root, to: "v000002", reason: "v3 灰度异常", operator: "tester", now: () => "2026-10-27T01:02:03.000Z" });
  const result = await applyReleaseRollback({ library_root: root, plan });
  assert.equal(result.ok, true);
  assert.equal(result.from_version, "v000003");
  assert.equal(result.to_version, "v000002");
  const pointer = JSON.parse(await readFile(pointerPath(root), "utf8"));
  assert.equal(pointer.current_version, "v000002");
  assert.equal(pointer.updated_at, "2026-10-27T01:02:03.000Z");
  const previous = JSON.parse(await readFile(previousPath(root), "utf8"));
  assert.equal(previous.current_version, "v000003");
  const audit = (await readFile(auditPath(root), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(audit.length, 1);
  assert.equal(audit[0].operator, "tester");
  assert.equal(audit[0].reason, "v3 灰度异常");
  assert.equal(audit[0].from_version, "v000003");
  assert.equal(audit[0].to_version, "v000002");
  assert.equal(audit[0].verify.ok, true);
  rm(root, { recursive: true, force: true }).catch(() => undefined);
});

test("apply refuses corrupted target and never touches the current pointer", async () => {
  const root = await LIB();
  await writeRelease(root, "v000010");
  await writeRelease(root, "v000011", { createdAt: "2026-09-02T00:00:00.000Z", breakCatalog: true });
  await writePointer(root, "v000010");
  const verification = await verifyReleaseTarget({ library_root: root, release_version: "v000011" });
  assert.equal(verification.ok, false);
  assert.ok(verification.blocking_reasons.some((reason) => reason.includes("catalog")));

  const plan = await planReleaseRollback({ library_root: root, to: "v000011" });
  assert.equal(plan.verification.ok, false);
  const result = await applyReleaseRollback({ library_root: root, plan });
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /不可被当前消费端接受/);
  assert.equal(JSON.parse(await readFile(pointerPath(root), "utf8")).current_version, "v000010");
  await assert.rejects(() => stat(auditPath(root)), /ENOENT/);
  rm(root, { recursive: true, force: true }).catch(() => undefined);
});

test("v2-only target is explicitly rejected because cutter consumers need legacy artifacts", async () => {
  const root = await LIB();
  await writeRelease(root, "v000020");
  await writeRelease(root, "v000021", { createdAt: "2026-09-02T00:00:00.000Z", legacy: false, v2: true });
  await writePointer(root, "v000020");
  const verification = await verifyReleaseTarget({ library_root: root, release_version: "v000021" });
  assert.equal(verification.ok, false);
  assert.ok(verification.blocking_reasons.some((reason) => reason.includes("缺少 release.json") && reason.includes("v2")));
  const targets = await listReleaseRollbackTargets({ library_root: root });
  assert.equal(targets.targets.find((target) => target.release_version === "v000021")?.eligible, false);
  rm(root, { recursive: true, force: true }).catch(() => undefined);
});

test("fresh lock blocks apply; stale lock is reclaimed", async () => {
  const root = await seededLibrary();
  const lockPath = path.join(mixlab(root), ".release-rollback.lock");
  const plan = await planReleaseRollback({ library_root: root, to: "v000001", reason: "lock test" });
  await writeFile(lockPath, JSON.stringify({ pid: process.pid }));
  await assert.rejects(() => applyReleaseRollback({ library_root: root, plan }), /正在进行/);
  assert.equal(JSON.parse(await readFile(pointerPath(root), "utf8")).current_version, "v000003");

  const old = new Date(Date.now() - 10 * 60 * 1000);
  await utimes(lockPath, old, old);
  const result = await applyReleaseRollback({ library_root: root, plan });
  assert.equal(result.ok, true);
  assert.equal(JSON.parse(await readFile(pointerPath(root), "utf8")).current_version, "v000001");
  rm(root, { recursive: true, force: true }).catch(() => undefined);
});
