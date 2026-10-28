import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import {
  readAdminSettings,
  writeAdminSettings,
  type AdminWriterLeaseDetails
} from "../../packages/library-fs/src/index.ts";
import {
  adminOperationLogPath
} from "../../packages/admin-api/src/admin-operation-log.ts";
import {
  runReadyPublishWorker,
  type ReadyPublishWorkerDeps,
  type ReadyPublishWorkerOutcome
} from "./publish-ready-worker.ts";

interface LoggedOperationEvent {
  event_type: string;
  area: string;
  action: string;
  message: string;
  details: Record<string, unknown>;
}

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "mixlab-ready-publish-worker-"));
}

function lockDir(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library", "locks", "admin-writer.lock");
}

function leasePath(libraryRoot: string): string {
  return path.join(lockDir(libraryRoot), "lease.json");
}

function indexPointerPath(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library", "indexes", "source-transcript-index", "current.json");
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

async function seedBusyLease(
  libraryRoot: string,
  lease: Partial<AdminWriterLeaseDetails> = {}
): Promise<void> {
  await mkdir(lockDir(libraryRoot), { recursive: true });
  await writeFile(
    leasePath(libraryRoot),
    `${JSON.stringify({
      holder: "admin-api:4242",
      reason: "source-video-publish",
      acquired_at: "2026-06-27T00:00:00.000Z",
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      ...lease
    }, null, 2)}\n`,
    "utf8"
  );
}

async function readOperationEvents(libraryRoot: string): Promise<LoggedOperationEvent[]> {
  const raw = await readFile(adminOperationLogPath(libraryRoot), "utf8").catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw error;
  });
  return raw
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as LoggedOperationEvent);
}

function workerEnv(
  libraryRoot: string,
  extra: Record<string, string> = {}
): NodeJS.ProcessEnv {
  return {
    MIXLAB_ENABLE_READY_PUBLISH_WORKER: "1",
    MIXLAB_PREPROCESS_LIBRARY_ROOT: libraryRoot,
    MIXLAB_PREPROCESS_LIBRARY_ID: "lib_test",
    ...extra
  } as NodeJS.ProcessEnv;
}

function safeSafetyStatus(): unknown {
  return {
    checked_at: "2026-06-27T00:00:00.000Z",
    safe_to_start: true,
    status: "ok",
    disk: {},
    processing: {},
    blockers: []
  };
}

function emptyPublishResult(): unknown {
  return {
    index_version: "",
    published_source_video_ids: [],
    ready_video_count: 0,
    skipped_source_video_ids: []
  };
}

function workerDeps(overrides: Partial<ReadyPublishWorkerDeps> = {}): Partial<ReadyPublishWorkerDeps> {
  return {
    inspect_preprocess_safety: (async () =>
      safeSafetyStatus()) as unknown as ReadyPublishWorkerDeps["inspect_preprocess_safety"],
    read_all_source_video_manifests: (async () =>
      []) as unknown as ReadyPublishWorkerDeps["read_all_source_video_manifests"],
    publish_index_required_source_videos: (async () =>
      emptyPublishResult()) as unknown as ReadyPublishWorkerDeps["publish_index_required_source_videos"],
    ...overrides
  };
}

function summaryActor(details: Record<string, unknown>): Record<string, unknown> {
  return details.actor as Record<string, unknown>;
}

test("worker skips publication and audits auto_publish_index_disabled", async () => {
  const libraryRoot = await makeLibraryRoot();
  const settings = await readAdminSettings(libraryRoot);
  await writeAdminSettings(libraryRoot, {
    ...settings,
    runtime_policy: { ...settings.runtime_policy, auto_publish_index_enabled: false }
  });

  const outcome = await runReadyPublishWorker({
    env: workerEnv(libraryRoot),
    log: () => undefined,
    deps: workerDeps()
  });

  assert.equal(outcome.status, "skipped");
  if (outcome.status !== "skipped") {
    throw new Error("expected skipped outcome");
  }
  assert.equal(outcome.reason, "auto_publish_index_disabled");
  assert.equal(await exists(indexPointerPath(libraryRoot)), false);

  const events = await readOperationEvents(libraryRoot);
  const skipped = events.find((event) => event.event_type === "skipped");
  assert.ok(skipped);
  assert.equal(skipped.action, "preprocess-supervisor-publish-ready");
  assert.equal(skipped.area, "release");
  assert.equal(skipped.details.reason, "auto_publish_index_disabled");
  assert.deepEqual(summaryActor(skipped.details), {
    kind: "system",
    source: "system-task",
    label: "发布就绪 worker"
  });
  assert.match(String(skipped.details.holder), /^ready-publish-worker:\d+$/);
  assert.equal(
    (skipped.details.worker),
    "ready-publish-worker"
  );
});

test("worker lease timeout skips without touching already-completed artifacts", async () => {
  const libraryRoot = await makeLibraryRoot();
  const completedCover = path.join(
    libraryRoot,
    ".mixlab-library",
    "videos",
    "V000001",
    "cover.jpg"
  );
  await mkdir(path.dirname(completedCover), { recursive: true });
  await writeFile(completedCover, "completed-cover-bytes", "utf8");
  const before = await readFile(completedCover);
  await seedBusyLease(libraryRoot);

  const outcome = await runReadyPublishWorker({
    env: workerEnv(libraryRoot, { MIXLAB_READY_PUBLISH_LEASE_WAIT_MS: "20" }),
    wait_ms: 20,
    log: () => undefined,
    deps: workerDeps()
  });

  assert.equal(outcome.status, "skipped");
  if (outcome.status !== "skipped") {
    throw new Error("expected skipped outcome");
  }
  assert.equal(outcome.reason, "admin_writer_busy");
  assert.deepEqual(await readFile(completedCover), before);
  assert.equal(await exists(indexPointerPath(libraryRoot)), false);

  const events = await readOperationEvents(libraryRoot);
  const progress = events.find((event) => event.event_type === "progress");
  assert.ok(progress);
  assert.equal(progress.details.reason, "admin_writer_busy_wait");
  const skipped = events.find((event) => event.event_type === "skipped");
  assert.ok(skipped);
  assert.equal(skipped.details.reason, "admin_writer_busy");
  assert.equal((skipped.details.lease as AdminWriterLeaseDetails).holder, "admin-api:4242");
});

test("two concurrent publishers: only one enters, the other skips as admin_writer_busy", async () => {
  const libraryRoot = await makeLibraryRoot();
  let entered!: () => void;
  const enteredGate = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let release!: () => void;
  const releaseGate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const first = runReadyPublishWorker({
    env: workerEnv(libraryRoot),
    log: () => undefined,
    deps: workerDeps({
      publish_index_required_source_videos: (async () => {
        entered();
        await releaseGate;
        return emptyPublishResult();
      }) as unknown as ReadyPublishWorkerDeps["publish_index_required_source_videos"]
    })
  });

  await enteredGate;
  const second = await runReadyPublishWorker({
    env: workerEnv(libraryRoot, { MIXLAB_READY_PUBLISH_LEASE_WAIT_MS: "30" }),
    wait_ms: 30,
    log: () => undefined,
    deps: workerDeps({
      publish_index_required_source_videos: (async () => {
        throw new Error("second publisher must not publish");
      }) as unknown as ReadyPublishWorkerDeps["publish_index_required_source_videos"]
    })
  });

  assert.equal(second.status, "skipped");
  if (second.status !== "skipped") {
    throw new Error("expected skipped outcome");
  }
  assert.equal(second.reason, "admin_writer_busy");

  release();
  const firstOutcome = (await first) as ReadyPublishWorkerOutcome;
  assert.equal(firstOutcome.status, "completed");

  const events = await readOperationEvents(libraryRoot);
  assert.equal(events.filter((event) => event.event_type === "started").length, 1);
  assert.equal(events.filter((event) => event.event_type === "succeeded").length, 1);
  const skipped = events.filter((event) => event.event_type === "skipped");
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0]?.details.reason, "admin_writer_busy");
});

test("worker waits for a busy lease, audits the wait, then publishes once free", async () => {
  const libraryRoot = await makeLibraryRoot();
  await seedBusyLease(libraryRoot);

  const pending = runReadyPublishWorker({
    env: workerEnv(libraryRoot, { MIXLAB_READY_PUBLISH_LEASE_WAIT_MS: "2000" }),
    wait_ms: 2_000,
    log: () => undefined,
    deps: workerDeps()
  });

  await delay(120);
  await rm(lockDir(libraryRoot), { recursive: true, force: true });
  const outcome = await pending;

  assert.equal(outcome.status, "completed");
  const events = await readOperationEvents(libraryRoot);
  assert.ok(events.some((event) => event.event_type === "progress" && event.details.reason === "admin_writer_busy_wait"));
  const started = events.find((event) => event.event_type === "started");
  const succeeded = events.find((event) => event.event_type === "succeeded");
  assert.ok(started);
  assert.ok(succeeded);
  assert.ok(events.indexOf(started) < events.indexOf(succeeded));
  for (const event of [started, succeeded]) {
    assert.equal(event.action, "preprocess-supervisor-publish-ready");
    assert.equal(event.area, "release");
    assert.deepEqual(summaryActor(event.details), {
      kind: "system",
      source: "system-task",
      label: "发布就绪 worker"
    });
    assert.match(String(event.details.holder), /^ready-publish-worker:\d+$/);
  }
});

test("worker stays disabled without the explicit enable flag and never touches the library", async () => {
  const libraryRoot = await makeLibraryRoot();
  const outcome = await runReadyPublishWorker({
    env: { MIXLAB_PREPROCESS_LIBRARY_ROOT: libraryRoot } as NodeJS.ProcessEnv,
    log: () => undefined,
    deps: workerDeps()
  });

  assert.equal(outcome.status, "skipped");
  if (outcome.status !== "skipped") {
    throw new Error("expected skipped outcome");
  }
  assert.match(outcome.reason, /MIXLAB_ENABLE_READY_PUBLISH_WORKER=1 is required/);
  const events = await readOperationEvents(libraryRoot);
  const skipped = events.find((event) => event.event_type === "skipped");
  assert.ok(skipped);
  assert.match(String(skipped.details.reason), /MIXLAB_ENABLE_READY_PUBLISH_WORKER=1 is required/);
  assert.equal(await exists(indexPointerPath(libraryRoot)), false);
});

test("worker skips and audits in Docker MVP mode", async () => {
  const libraryRoot = await makeLibraryRoot();
  const outcome = await runReadyPublishWorker({
    env: workerEnv(libraryRoot, { MIXLAB_ADMIN_DOCKER_MVP_MODE: "v0.1" }),
    log: () => undefined,
    deps: workerDeps()
  });

  assert.equal(outcome.status, "skipped");
  if (outcome.status !== "skipped") {
    throw new Error("expected skipped outcome");
  }
  assert.equal(outcome.reason, "admin_docker_mvp_blocks_ready_publish");
  const events = await readOperationEvents(libraryRoot);
  const skipped = events.find((event) => event.event_type === "skipped");
  assert.ok(skipped);
  assert.equal(skipped.details.reason, "admin_docker_mvp_blocks_ready_publish");
  assert.equal(skipped.action, "preprocess-supervisor-publish-ready");
});
