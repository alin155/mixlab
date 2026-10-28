import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { approveCutterUser, createCutterLoginApplication } from "../../library-fs/src/index.ts";
import {
  WORKSPACE_RESIDUE_ERROR_CODES,
  isWorkspaceResiduePathAllowed,
  type WorkspaceResidueCleanResult,
  type WorkspaceResidueInventory,
  type WorkspaceResidueService
} from "./workspace-residue.ts";
import {
  createCutterApiServer,
  cutterWorkspaceResidueService,
  type CreateCutterApiServerInput
} from "./index.ts";

const CREATED_AT = "2026-05-02T10:00:00Z";

interface ResidueFixture {
  base_root: string;
  library_root: string;
  workspace_root: string;
}

interface ResidueApiContext {
  base_url: string;
  headers: Record<string, string>;
  service: WorkspaceResidueService;
}

async function createResidueFixture(): Promise<ResidueFixture> {
  const baseRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-residue-api-"));
  const libraryRoot = path.join(baseRoot, "library");
  const workspaceRoot = path.join(baseRoot, "workspace");
  await mkdir(libraryRoot, { recursive: true });
  await mkdir(workspaceRoot, { recursive: true });
  return {
    base_root: baseRoot,
    library_root: libraryRoot,
    workspace_root: workspaceRoot
  };
}

async function writeBytes(filePath: string, bytes: number, fill = "x"): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, Buffer.alloc(bytes, fill));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function seedCutJob(
  fixture: ResidueFixture,
  input: { cut_job_id: string; status: string }
): Promise<void> {
  await writeJson(
    path.join(fixture.workspace_root, "clip-jobs", input.cut_job_id + ".json"),
    {
      schema_version: "1.0",
      cut_job_id: input.cut_job_id,
      clip_list_id: "CL20260502-0001",
      clip_list_item_id: "CLI000001",
      library_id: "lib-test",
      source_video_id: "V000001",
      source_title: "clip-source",
      source_relative_path: "source-videos/clip-source.mp4",
      start_segment_id: "V000001-S000001",
      end_segment_id: "V000001-S000001",
      begin_ms: 0,
      end_ms: 1000,
      selected_text: "clip",
      cut_mode: "smart",
      status: input.status,
      created_at: CREATED_AT,
      updated_at: CREATED_AT
    }
  );
}

async function seedFailedCutTemp(fixture: ResidueFixture): Promise<{
  cut_job_id: string;
  temp_path: string;
  bytes: number;
}> {
  const cutJobId = "CJ20260502-0001";
  const tempPath = path.join(
    fixture.workspace_root,
    "cache",
    "cut-temp",
    cutJobId + "-E000001-11111111-1111-1111-1111-111111111111.mp4"
  );
  await seedCutJob(fixture, { cut_job_id: cutJobId, status: "failed" });
  await writeBytes(tempPath, 64, "f");
  return { cut_job_id: cutJobId, temp_path: tempPath, bytes: 64 };
}

async function seedActiveCutTemp(fixture: ResidueFixture): Promise<{
  cut_job_id: string;
  temp_path: string;
}> {
  const cutJobId = "CJ20260502-0002";
  const tempPath = path.join(
    fixture.workspace_root,
    "cache",
    "cut-temp",
    cutJobId + "-E000002-22222222-2222-2222-2222-222222222222.mp4"
  );
  await seedCutJob(fixture, { cut_job_id: cutJobId, status: "pending" });
  await writeBytes(tempPath, 32, "a");
  return { cut_job_id: cutJobId, temp_path: tempPath };
}

async function seedUnownedCutTemp(fixture: ResidueFixture): Promise<{
  temp_path: string;
  bytes: number;
}> {
  const tempPath = path.join(
    fixture.workspace_root,
    "cache",
    "cut-temp",
    "CJ20260502-0003-E000003-33333333-3333-3333-3333-333333333333.mp4"
  );
  await writeBytes(tempPath, 48, "u");
  return { temp_path: tempPath, bytes: 48 };
}

async function seedExportTempFile(fixture: ResidueFixture): Promise<{
  temp_path: string;
  bytes: number;
}> {
  const tempPath = path.join(fixture.workspace_root, "export-clips", "export-temp-0001.part");
  await writeBytes(tempPath, 24, "e");
  return { temp_path: tempPath, bytes: 24 };
}

async function seedStagingDirs(fixture: ResidueFixture): Promise<{
  export_staging: string;
  job_staging: string;
}> {
  const exportStaging = path.join(fixture.workspace_root, "export-clips", ".staging-batch-a");
  const jobStaging = path.join(fixture.workspace_root, "clip-jobs", ".staging-batch-b");
  await writeBytes(path.join(exportStaging, "media.mp4.part"), 12, "s");
  await writeJson(path.join(jobStaging, "CJ20260502-0009.json"), { cut_job_id: "CJ20260502-0009" });
  return { export_staging: exportStaging, job_staging: jobStaging };
}

async function seedUnfinishedExportDir(fixture: ResidueFixture): Promise<{
  export_dir: string;
  bytes: number;
}> {
  const exportDir = path.join(fixture.workspace_root, "export-clips", "E000007");
  await writeBytes(path.join(exportDir, "media.mp4"), 56, "i");
  return { export_dir: exportDir, bytes: 56 };
}

async function seedUnsafeExportDir(fixture: ResidueFixture): Promise<{
  export_dir: string;
  project_output_path: string;
}> {
  const exportDir = path.join(fixture.workspace_root, "export-clips", "E000008");
  const projectOutputPath = path.join(
    fixture.workspace_root,
    "projects",
    "alpha",
    "001-alpha-project-output.mp4"
  );
  await writeBytes(path.join(exportDir, "media.mp4"), 40, "w");
  await writeJson(path.join(exportDir, "export-clip.json"), {
    export_clip_id: "E000008",
    project_output_file: "projects/alpha/001-alpha-project-output.mp4"
  });
  await writeBytes(projectOutputPath, 20, "p");
  return { export_dir: exportDir, project_output_path: projectOutputPath };
}

async function createAuthHeaders(libraryRoot: string): Promise<Record<string, string>> {
  const application = await createCutterLoginApplication(libraryRoot, {
    username: "residue-user",
    device_id: "residue-device",
    device_name: "Residue Test Device",
    now: CREATED_AT
  });
  const approved = await approveCutterUser(libraryRoot, {
    user_id: application.user_id,
    now: "2026-05-02T09:01:00Z"
  });

  return {
    "X-MixLab-Device-Id": approved.session.device_id,
    "X-MixLab-Session-Token": approved.session.session_token
  };
}

async function withResidueApi(
  fixture: ResidueFixture,
  fn: (context: ResidueApiContext) => Promise<void>,
  extraInput: Partial<CreateCutterApiServerInput> = {}
): Promise<void> {
  const headers = await createAuthHeaders(fixture.library_root);
  const server = createCutterApiServer({
    library_root: fixture.library_root,
    workspace_root: fixture.workspace_root,
    workspace_lease_disabled: true,
    ...extraInput
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  try {
    const address = server.address() as AddressInfo;
    const service = cutterWorkspaceResidueService(server);
    assert.ok(service, "workspace residue service should be registered per server instance");
    await fn({
      base_url: "http://127.0.0.1:" + address.port,
      headers,
      service
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function withResidueFixture(fn: (fixture: ResidueFixture) => Promise<void>): Promise<void> {
  const fixture = await createResidueFixture();
  try {
    await fn(fixture);
  } finally {
    await rm(fixture.base_root, { recursive: true, force: true });
  }
}

async function readInventory(context: ResidueApiContext): Promise<WorkspaceResidueInventory> {
  const response = await fetch(context.base_url + "/cutter/workspace/residue", {
    headers: context.headers
  });
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { data: WorkspaceResidueInventory };
  return payload.data;
}

async function postClean(context: ResidueApiContext, body: unknown): Promise<Response> {
  return fetch(context.base_url + "/cutter/workspace/residue/clean", {
    method: "POST",
    headers: {
      ...context.headers,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function readCleanResult(
  context: ResidueApiContext,
  body: unknown
): Promise<WorkspaceResidueCleanResult> {
  const response = await postClean(context, body);
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { data: WorkspaceResidueCleanResult };
  return payload.data;
}

async function readError(response: Response): Promise<{
  code: string;
  message: string;
  remediation?: string;
}> {
  const body = (await response.json()) as {
    error: { code: string; message: string; remediation?: string };
  };
  return body.error;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function findItem(
  inventory: WorkspaceResidueInventory,
  predicate: (item: WorkspaceResidueInventory["items"][number]) => boolean
): WorkspaceResidueInventory["items"][number] | undefined {
  return inventory.items.find(predicate);
}

async function seedReadOnlyScenario(fixture: ResidueFixture): Promise<{
  failed: Awaited<ReturnType<typeof seedFailedCutTemp>>;
  active: Awaited<ReturnType<typeof seedActiveCutTemp>>;
  unowned: Awaited<ReturnType<typeof seedUnownedCutTemp>>;
  export_temp: Awaited<ReturnType<typeof seedExportTempFile>>;
  staging: Awaited<ReturnType<typeof seedStagingDirs>>;
  unfinished: Awaited<ReturnType<typeof seedUnfinishedExportDir>>;
}> {
  return {
    failed: await seedFailedCutTemp(fixture),
    active: await seedActiveCutTemp(fixture),
    unowned: await seedUnownedCutTemp(fixture),
    export_temp: await seedExportTempFile(fixture),
    staging: await seedStagingDirs(fixture),
    unfinished: await seedUnfinishedExportDir(fixture)
  };
}

test("workspace residue inventory lists residue kinds read-only", async () => {
  await withResidueFixture(async (fixture) => {
    const scenario = await seedReadOnlyScenario(fixture);

    await withResidueApi(fixture, async (context) => {
      const anonymous = await fetch(context.base_url + "/cutter/workspace/residue");
      assert.equal(anonymous.status, 401);

      const inventory = await readInventory(context);
      assert.ok(inventory.items.length >= 5);

      const failedItem = findItem(
        inventory,
        (item) => item.kind === "failed_cut_temp" && item.path === scenario.failed.temp_path
      );
      assert.ok(failedItem, "failed cut temp residue should be listed");
      assert.equal(failedItem?.size_bytes, scenario.failed.bytes);
      assert.equal(failedItem?.safe_to_delete, true);
      assert.match(failedItem?.reason ?? "", /失败|取消/);
      assert.equal(Number.isNaN(Date.parse(failedItem?.created_at ?? "")), false);

      const exportItem = findItem(
        inventory,
        (item) => item.kind === "failed_export" && item.path === scenario.export_temp.temp_path
      );
      assert.ok(exportItem, "export temp file should be listed as failed_export");
      assert.equal(exportItem?.size_bytes, scenario.export_temp.bytes);
      assert.equal(exportItem?.safe_to_delete, true);

      const unownedItem = findItem(
        inventory,
        (item) => item.kind === "restart_temp" && item.path === scenario.unowned.temp_path
      );
      assert.ok(unownedItem, "unowned cut temp file should be listed as restart_temp");
      assert.match(unownedItem?.reason ?? "", /找不到归属/);

      const unfinishedItem = findItem(
        inventory,
        (item) => item.kind === "restart_temp" && item.path === scenario.unfinished.export_dir
      );
      assert.ok(unfinishedItem, "unfinished export dir should be listed as restart_temp");
      assert.equal(unfinishedItem?.size_bytes, scenario.unfinished.bytes);
      assert.equal(unfinishedItem?.safe_to_delete, true);

      for (const stagingPath of [scenario.staging.export_staging, scenario.staging.job_staging]) {
        const stagingItem = findItem(inventory, (item) => item.path === stagingPath);
        assert.ok(stagingItem, "staging directory should be listed: " + stagingPath);
        assert.equal(stagingItem?.safe_to_delete, true);
      }

      const activeItem = findItem(
        inventory,
        (item) => item.path === scenario.active.temp_path
      );
      assert.equal(activeItem, undefined, "pending job temp file must not be residue");
      assert.ok(
        inventory.items.every((item) => !item.path.includes("projects" + path.sep)),
        "project outputs must never be listed as residue"
      );

      const expectedBytes = inventory.items.reduce(
        (total, item) => total + (item.safe_to_delete ? item.size_bytes : 0),
        0
      );
      assert.equal(inventory.expected_bytes, expectedBytes);
      assert.equal(
        inventory.total_bytes,
        inventory.items.reduce((total, item) => total + item.size_bytes, 0)
      );
      assert.equal(typeof inventory.confirm_token, "string");
      assert.ok(inventory.confirm_token.length >= 16);

      assert.equal(await pathExists(scenario.failed.temp_path), true);
      assert.equal(await pathExists(scenario.export_temp.temp_path), true);
      assert.equal(await pathExists(scenario.unfinished.export_dir), true);
      assert.equal(await pathExists(scenario.staging.job_staging), true);
    });
  });
});

test("workspace residue clean removes safe residue and reports freed bytes", async () => {
  await withResidueFixture(async (fixture) => {
    const scenario = await seedReadOnlyScenario(fixture);
    const unsafe = await seedUnsafeExportDir(fixture);

    await withResidueApi(fixture, async (context) => {
      const inventory = await readInventory(context);
      const unsafeItem = findItem(inventory, (item) => item.path === unsafe.export_dir);
      assert.ok(unsafeItem);
      assert.equal(unsafeItem?.safe_to_delete, false);

      const safeIds = inventory.items
        .filter((item) => item.safe_to_delete)
        .map((item) => item.id);
      const cleanResult = await readCleanResult(context, {
        ids: safeIds,
        confirm_token: inventory.confirm_token,
        expected_bytes: inventory.expected_bytes
      });

      assert.deepEqual(cleanResult.skipped, []);
      assert.deepEqual(cleanResult.errors, []);
      assert.equal(cleanResult.removed.length, safeIds.length);
      assert.equal(cleanResult.freed_bytes, inventory.expected_bytes);

      assert.equal(await pathExists(scenario.failed.temp_path), false);
      assert.equal(await pathExists(scenario.export_temp.temp_path), false);
      assert.equal(await pathExists(scenario.unfinished.export_dir), false);
      assert.equal(await pathExists(scenario.staging.export_staging), false);
      assert.equal(await pathExists(scenario.staging.job_staging), false);
      assert.equal(await pathExists(unsafe.export_dir), true);
      assert.equal(await pathExists(unsafe.project_output_path), true);
      assert.equal(await pathExists(scenario.active.temp_path), true);

      const replay = await postClean(context, {
        ids: safeIds,
        confirm_token: inventory.confirm_token,
        expected_bytes: inventory.expected_bytes
      });
      assert.equal(replay.status, 409);
      assert.equal(
        (await readError(replay)).code,
        WORKSPACE_RESIDUE_ERROR_CODES.workspace_residue_confirm_invalid
      );

      const refreshed = await readInventory(context);
      assert.equal(refreshed.expected_bytes, 0);
      assert.deepEqual(
        refreshed.items.map((item) => item.path),
        [unsafe.export_dir]
      );
    });
  });
});

test("workspace residue clean skips unsafe residue with a stable reason", async () => {
  await withResidueFixture(async (fixture) => {
    const unsafe = await seedUnsafeExportDir(fixture);

    await withResidueApi(fixture, async (context) => {
      const inventory = await readInventory(context);
      const unsafeItem = findItem(inventory, (item) => item.path === unsafe.export_dir);
      assert.ok(unsafeItem);
      assert.equal(unsafeItem?.safe_to_delete, false);
      assert.match(unsafeItem?.reason ?? "", /项目成片/);

      const result = await readCleanResult(context, {
        ids: [unsafeItem!.id],
        confirm_token: inventory.confirm_token,
        expected_bytes: 0
      });

      assert.deepEqual(result.removed, []);
      assert.equal(result.freed_bytes, 0);
      assert.equal(result.skipped.length, 1);
      assert.equal(result.skipped[0]?.id, unsafeItem?.id);
      assert.match(result.skipped[0]?.reason ?? "", /项目成片/);
      assert.equal(await pathExists(unsafe.export_dir), true);
    });
  });
});

test("workspace residue clean rejects mismatched expected bytes without deleting", async () => {
  await withResidueFixture(async (fixture) => {
    const failed = await seedFailedCutTemp(fixture);

    await withResidueApi(fixture, async (context) => {
      const inventory = await readInventory(context);
      const response = await postClean(context, {
        ids: inventory.items.map((item) => item.id),
        confirm_token: inventory.confirm_token,
        expected_bytes: inventory.expected_bytes + 1
      });

      assert.equal(response.status, 409);
      assert.equal(
        (await readError(response)).code,
        WORKSPACE_RESIDUE_ERROR_CODES.workspace_residue_expected_bytes_mismatch
      );
      assert.equal(await pathExists(failed.temp_path), true);
    });
  });
});

test("workspace residue clean reports expired confirm tokens", async () => {
  await withResidueFixture(async (fixture) => {
    const failed = await seedFailedCutTemp(fixture);

    await withResidueApi(
      fixture,
      async (context) => {
        const inventory = await readInventory(context);
        await new Promise((resolve) => setTimeout(resolve, 25));

        const response = await postClean(context, {
          ids: inventory.items.map((item) => item.id),
          confirm_token: inventory.confirm_token,
          expected_bytes: inventory.expected_bytes
        });

        assert.equal(response.status, 409);
        assert.equal(
          (await readError(response)).code,
          WORKSPACE_RESIDUE_ERROR_CODES.workspace_residue_confirm_expired
        );
        assert.equal(await pathExists(failed.temp_path), true);
      },
      { workspace_residue_confirm_ttl_ms: 1 }
    );
  });
});

test("workspace residue clean rejects concurrent requests with workspace_residue_busy", async () => {
  await withResidueFixture(async (fixture) => {
    const failed = await seedFailedCutTemp(fixture);

    await withResidueApi(fixture, async (context) => {
      const inventory = await readInventory(context);
      const releaseBusy = context.service.tryBeginClean();
      assert.ok(releaseBusy);

      try {
        const busyResponse = await postClean(context, {
          ids: inventory.items.map((item) => item.id),
          confirm_token: inventory.confirm_token,
          expected_bytes: inventory.expected_bytes
        });
        assert.equal(busyResponse.status, 409);
        assert.equal(
          (await readError(busyResponse)).code,
          WORKSPACE_RESIDUE_ERROR_CODES.workspace_residue_busy
        );
      } finally {
        releaseBusy();
      }

      assert.equal(await pathExists(failed.temp_path), true);
      const result = await readCleanResult(context, {
        ids: inventory.items.map((item) => item.id),
        confirm_token: inventory.confirm_token,
        expected_bytes: inventory.expected_bytes
      });
      assert.deepEqual(result.errors, []);
      assert.equal(result.freed_bytes, inventory.expected_bytes);
      assert.equal(await pathExists(failed.temp_path), false);
    });
  });
});

test("workspace residue path whitelist rejects projects and unknown paths", async () => {
  await withResidueFixture(async (fixture) => {
    const workspaceRoot = fixture.workspace_root;
    const allowed = (targetPath: string) =>
      isWorkspaceResiduePathAllowed({ workspace_root: workspaceRoot, target_path: targetPath });

    assert.equal(allowed(path.join(workspaceRoot, "projects", "alpha", "out.mp4")), false);
    assert.equal(
      allowed(path.join(workspaceRoot, "cache", "cut-temp", "CJ20260502-0001-E000001-x.mp4")),
      true
    );
    assert.equal(allowed(path.join(workspaceRoot, "cache", "cut-temp")), false);
    assert.equal(allowed(path.join(workspaceRoot, "cache", "other", "x.mp4")), false);
    assert.equal(allowed(path.join(workspaceRoot, "export-clips", "export-temp-0001.part")), true);
    assert.equal(allowed(path.join(workspaceRoot, "export-clips", ".staging-batch-a")), true);
    assert.equal(allowed(path.join(workspaceRoot, "export-clips", "E000007")), true);
    assert.equal(
      allowed(path.join(workspaceRoot, "export-clips", "E000001", "media.mp4")),
      false
    );
    assert.equal(allowed(path.join(workspaceRoot, "clip-jobs", ".staging-batch-b")), true);
    assert.equal(allowed(path.join(workspaceRoot, "clip-jobs", "CJ20260502-0001.json")), false);
    assert.equal(allowed(path.join(workspaceRoot, "worker.tmp")), false);
    assert.equal(allowed(workspaceRoot), false);
    assert.equal(allowed(path.join(fixture.base_root, "outside", "x.tmp")), false);
  });
});

test("runtime status exposes workspace residue count and bytes", async () => {
  await withResidueFixture(async (fixture) => {
    await seedFailedCutTemp(fixture);
    await seedExportTempFile(fixture);

    await withResidueApi(fixture, async (context) => {
      const deadline = Date.now() + 3_000;
      let payload: {
        workspace_residue_count?: number;
        workspace_residue_bytes?: number;
        workspace_residue_reason?: string;
        api_ready?: boolean;
      } = {};
      do {
        const response = await fetch(
          context.base_url + "/cutter/runtime-status?include_cache=1",
          { headers: context.headers }
        );
        assert.equal(response.status, 200);
        const body = (await response.json()) as { data: typeof payload };
        payload = body.data;
        if (typeof payload.workspace_residue_count === "number") {
          break;
        }
        if (typeof payload.workspace_residue_reason === "string") {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      } while (Date.now() < deadline);

      assert.equal(payload.api_ready, true);
      if (typeof payload.workspace_residue_count === "number") {
        assert.ok(payload.workspace_residue_count >= 2);
        assert.equal(typeof payload.workspace_residue_bytes, "number");
        assert.ok((payload.workspace_residue_bytes ?? 0) > 0);
      } else {
        assert.equal(typeof payload.workspace_residue_reason, "string");
      }
    });
  });
});
