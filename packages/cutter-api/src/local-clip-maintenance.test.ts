import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { approveCutterUser, createCutterLoginApplication } from "../../library-fs/src/index.ts";
import {
  LOCAL_CLIP_MAINTENANCE_ERROR_CODES,
  type LocalClipCleanResult,
  type LocalClipIntegrity,
  type LocalClipMaintenanceService
} from "./local-clip-maintenance.ts";
import {
  createCutterApiServer,
  cutterLocalClipMaintenanceService,
  type CreateCutterApiServerInput
} from "./index.ts";

const LIBRARY_ID = "lib-test";
const CREATED_AT = "2026-05-02T10:00:00Z";

interface LocalClipFixture {
  base_root: string;
  library_root: string;
  workspace_root: string;
  export_root: string;
  asset_root: string;
}

interface LocalClipApiContext {
  base_url: string;
  headers: Record<string, string>;
  service: LocalClipMaintenanceService;
}

interface SeedLocalClipInput {
  id: string;
  title?: string;
  project_id?: string;
  project_title?: string;
  project_output_file?: string;
  media_bytes?: number;
  asset_bytes?: number;
}

async function createLocalClipFixture(): Promise<LocalClipFixture> {
  const baseRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-local-clip-api-"));
  const libraryRoot = path.join(baseRoot, "library");
  const workspaceRoot = path.join(baseRoot, "workspace");
  await mkdir(libraryRoot, { recursive: true });
  await mkdir(workspaceRoot, { recursive: true });

  return {
    base_root: baseRoot,
    library_root: libraryRoot,
    workspace_root: workspaceRoot,
    export_root: path.join(workspaceRoot, "export-clips"),
    asset_root: path.join(workspaceRoot, ".mixlab-library", "videos")
  };
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function seedLocalClip(fixture: LocalClipFixture, input: SeedLocalClipInput): Promise<{
  export_dir: string;
  asset_dir: string;
  project_output_path?: string;
}> {
  const exportDir = path.join(fixture.export_root, input.id);
  const assetDir = path.join(fixture.asset_root, input.id);
  const mediaBytes = input.media_bytes ?? 40;
  const assetBytes = input.asset_bytes ?? 60;

  await mkdir(exportDir, { recursive: true });
  await mkdir(assetDir, { recursive: true });
  await writeFile(path.join(exportDir, "media.mp4"), Buffer.alloc(mediaBytes, "m"));
  await writeFile(path.join(assetDir, "source.mp4"), Buffer.alloc(assetBytes, "s"));
  await writeJsonFile(path.join(assetDir, "source-video.json"), {
    schema_version: "1.0",
    source_video_id: input.id,
    title: input.title ?? input.id
  });

  const manifest: Record<string, unknown> = {
    export_clip_id: input.id,
    library_id: LIBRARY_ID,
    ...(input.project_id ? { project_id: input.project_id } : {}),
    ...(input.project_title ? { project_title: input.project_title } : {}),
    source_video_id: "V000001",
    title: input.title ?? input.id,
    source_title: "clip-source",
    begin_ms: 0,
    end_ms: 1000,
    selected_text: "clip",
    output_file: "export-clips/" + input.id + "/media.mp4",
    local_asset_relative_path: ".mixlab-library/videos/" + input.id + "/source.mp4",
    source_video_manifest_path: ".mixlab-library/videos/" + input.id + "/source-video.json",
    ...(input.project_output_file ? { project_output_file: input.project_output_file } : {}),
    created_at: CREATED_AT,
    cut_mode: "smart"
  };
  await writeJsonFile(path.join(exportDir, "export-clip.json"), manifest);

  if (!input.project_output_file) {
    return { export_dir: exportDir, asset_dir: assetDir };
  }

  const projectOutputPath = path.join(
    fixture.workspace_root,
    ...input.project_output_file.split("/")
  );
  await mkdir(path.dirname(projectOutputPath), { recursive: true });
  await writeFile(projectOutputPath, Buffer.alloc(20, "p"));
  return { export_dir: exportDir, asset_dir: assetDir, project_output_path: projectOutputPath };
}

async function seedClipListReference(
  fixture: LocalClipFixture,
  input: { clip_list_id: string; title: string; source_video_id: string }
): Promise<void> {
  await writeJsonFile(
    path.join(fixture.workspace_root, "clip-lists", input.clip_list_id, "clip-list.json"),
    {
      schema_version: "1.0",
      clip_list_id: input.clip_list_id,
      library_id: LIBRARY_ID,
      title: input.title,
      item_count: 1,
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
      items: [
        {
          item_id: "CLI000001",
          order: 1,
          source_video_id: input.source_video_id,
          source_title: "clip-source",
          source_relative_path: ".mixlab-library/videos/" + input.source_video_id + "/source.mp4",
          start_segment_id: input.source_video_id + "-S000001",
          end_segment_id: input.source_video_id + "-S000001",
          begin_ms: 0,
          end_ms: 1000,
          selected_text: "clip",
          cut_mode: "copy",
          pre_roll_ms: 0,
          post_roll_ms: 0
        }
      ]
    }
  );
}

async function seedCutJobReference(
  fixture: LocalClipFixture,
  input: {
    cut_job_id: string;
    status: "pending" | "running" | "failed" | "cancelled" | "done";
    source_video_id: string;
    export_clip_id?: string;
  }
): Promise<void> {
  await writeJsonFile(
    path.join(fixture.workspace_root, "clip-jobs", input.cut_job_id + ".json"),
    {
      schema_version: "1.0",
      cut_job_id: input.cut_job_id,
      clip_list_id: "CL20260502-0001",
      clip_list_item_id: "CLI000001",
      library_id: LIBRARY_ID,
      source_video_id: input.source_video_id,
      source_title: "clip-source",
      source_relative_path: "source-videos/clip-source.mp4",
      start_segment_id: input.source_video_id + "-S000001",
      end_segment_id: input.source_video_id + "-S000001",
      begin_ms: 0,
      end_ms: 1000,
      selected_text: "clip",
      cut_mode: "smart",
      status: input.status,
      ...(input.export_clip_id ? { export_clip_id: input.export_clip_id } : {}),
      created_at: CREATED_AT,
      updated_at: CREATED_AT
    }
  );
}

async function directoryFileBytes(root: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      total += await directoryFileBytes(entryPath);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    total += (await stat(entryPath)).size;
  }

  return total;
}

async function expectedLocalClipBytes(fixture: LocalClipFixture, localClipId: string): Promise<number> {
  return (
    (await directoryFileBytes(path.join(fixture.export_root, localClipId))) +
    (await directoryFileBytes(path.join(fixture.asset_root, localClipId)))
  );
}

async function createAuthHeaders(libraryRoot: string): Promise<Record<string, string>> {
  const application = await createCutterLoginApplication(libraryRoot, {
    username: "local-clip-user",
    device_id: "local-clip-device",
    device_name: "Local Clip Test Device",
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

async function withLocalClipApi(
  fixture: LocalClipFixture,
  fn: (context: LocalClipApiContext) => Promise<void>,
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
    const service = cutterLocalClipMaintenanceService(server);
    assert.ok(service, "local clip maintenance service should be registered per server instance");
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

async function withLocalClipFixture(
  fn: (fixture: LocalClipFixture) => Promise<void>
): Promise<void> {
  const fixture = await createLocalClipFixture();
  try {
    await fn(fixture);
  } finally {
    await rm(fixture.base_root, { recursive: true, force: true });
  }
}

async function readIntegrity(context: LocalClipApiContext): Promise<LocalClipIntegrity> {
  const response = await fetch(context.base_url + "/cutter/local-clips/integrity", {
    headers: context.headers
  });
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { data: LocalClipIntegrity };
  return payload.data;
}

async function postClean(
  context: LocalClipApiContext,
  body: unknown
): Promise<Response> {
  return fetch(context.base_url + "/cutter/local-clips/clean", {
    method: "POST",
    headers: {
      ...context.headers,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function readCleanResult(
  context: LocalClipApiContext,
  body: unknown
): Promise<LocalClipCleanResult> {
  const response = await postClean(context, body);
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { data: LocalClipCleanResult };
  return payload.data;
}

async function readError(response: Response): Promise<{
  code: string;
  message: string;
  remediation?: string;
  details?: Record<string, unknown>;
}> {
  const body = (await response.json()) as {
    error: {
      code: string;
      message: string;
      remediation?: string;
      details?: Record<string, unknown>;
    };
  };
  return body.error;
}

async function fileOrDirExists(targetPath: string): Promise<boolean> {
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

function referencedById(integrity: LocalClipIntegrity): Map<string, LocalClipIntegrity["referenced"][number]> {
  return new Map(integrity.referenced.map((entry) => [entry.local_clip_id, entry]));
}

async function seedReferencedAndOrphanFixture(fixture: LocalClipFixture): Promise<void> {
  await seedLocalClip(fixture, {
    id: "E000001",
    title: "project clip",
    project_id: "P-ALPHA",
    project_title: "alpha project",
    project_output_file: "projects/alpha/001-alpha-project-clip.mp4"
  });
  await seedLocalClip(fixture, { id: "E000002", title: "orphan clip" });
  await seedLocalClip(fixture, { id: "E000003", title: "clip list clip" });
  await seedLocalClip(fixture, { id: "E000004", title: "queued recut clip" });
  await seedClipListReference(fixture, {
    clip_list_id: "CL20260502-0001",
    title: "recut clip list",
    source_video_id: "E000003"
  });
  await seedCutJobReference(fixture, {
    cut_job_id: "CJ20260502-0001",
    status: "pending",
    source_video_id: "E000004"
  });
}

test("local clip integrity reports referenced and orphan local clips", async () => {
  await withLocalClipFixture(async (fixture) => {
    await seedReferencedAndOrphanFixture(fixture);

    await withLocalClipApi(fixture, async (context) => {
      const anonymous = await fetch(context.base_url + "/cutter/local-clips/integrity");
      assert.equal(anonymous.status, 401);

      const integrity = await readIntegrity(context);
      assert.deepEqual(
        integrity.referenced.map((entry) => entry.local_clip_id),
        ["E000001", "E000003", "E000004"]
      );
      assert.deepEqual(
        integrity.orphans.map((entry) => entry.local_clip_id),
        ["E000002"]
      );

      const referenced = referencedById(integrity);
      const projectReference = referenced.get("E000001")!;
      assert.equal(projectReference.referenced_by[0]?.kind, "project");
      assert.equal(projectReference.referenced_by[0]?.ref_id, "P-ALPHA");
      assert.equal(projectReference.referenced_by[0]?.title, "alpha project");

      const clipListReference = referenced.get("E000003")!;
      assert.equal(clipListReference.referenced_by[0]?.kind, "clip_list");
      assert.equal(clipListReference.referenced_by[0]?.ref_id, "CL20260502-0001");
      assert.equal(clipListReference.referenced_by[0]?.title, "recut clip list");

      const cutJobReference = referenced.get("E000004")!;
      assert.equal(cutJobReference.referenced_by[0]?.kind, "cut_job");
      assert.equal(cutJobReference.referenced_by[0]?.ref_id, "CJ20260502-0001");

      const orphan = integrity.orphans[0]!;
      assert.equal(
        orphan.path,
        path.join(fixture.export_root, "E000002")
      );
      assert.equal(orphan.size_bytes, await expectedLocalClipBytes(fixture, "E000002"));
      assert.match(orphan.reason, /未被/);

      assert.equal(integrity.total_bytes, orphan.size_bytes);
      assert.equal(integrity.expected_bytes, orphan.size_bytes);
      assert.equal(typeof integrity.confirm_token, "string");
      assert.ok(integrity.confirm_token.length >= 16);
    });
  });
});

test("local clip clean removes only orphan local clips and consumes the confirm token", async () => {
  await withLocalClipFixture(async (fixture) => {
    await seedReferencedAndOrphanFixture(fixture);

    await withLocalClipApi(fixture, async (context) => {
      const integrity = await readIntegrity(context);
      const orphan = integrity.orphans[0]!;
      const requestBody = {
        local_clip_ids: ["E000002"],
        confirm_token: integrity.confirm_token,
        expected_bytes: orphan.size_bytes
      };

      const result = await readCleanResult(context, requestBody);
      assert.deepEqual(result.removed, ["E000002"]);
      assert.equal(result.freed_bytes, orphan.size_bytes);
      assert.deepEqual(result.skipped, []);

      assert.equal(await fileOrDirExists(path.join(fixture.export_root, "E000002")), false);
      assert.equal(await fileOrDirExists(path.join(fixture.asset_root, "E000002")), false);
      assert.equal(await fileOrDirExists(path.join(fixture.export_root, "E000001")), true);
      assert.equal(
        await fileOrDirExists(path.join(fixture.asset_root, "E000001", "source.mp4")),
        true
      );
      assert.equal(
        await fileOrDirExists(path.join(fixture.workspace_root, "projects", "alpha", "001-alpha-project-clip.mp4")),
        true
      );

      const replay = await postClean(context, requestBody);
      assert.equal(replay.status, 409);
      assert.equal(
        (await readError(replay)).code,
        LOCAL_CLIP_MAINTENANCE_ERROR_CODES.local_clip_confirm_invalid
      );

      const refreshed = await readIntegrity(context);
      assert.deepEqual(refreshed.orphans, []);
      assert.equal(refreshed.expected_bytes, 0);

      const unknownResult = await readCleanResult(context, {
        local_clip_ids: ["E999999"],
        confirm_token: refreshed.confirm_token,
        expected_bytes: 0
      });
      assert.deepEqual(unknownResult.removed, []);
      assert.equal(unknownResult.skipped.length, 1);
      assert.equal(unknownResult.skipped[0]?.local_clip_id, "E999999");
      assert.equal(
        unknownResult.skipped[0]?.code,
        LOCAL_CLIP_MAINTENANCE_ERROR_CODES.local_clip_unknown
      );
    });
  });
});

test("local clip clean skips referenced local clips and keeps their files", async () => {
  await withLocalClipFixture(async (fixture) => {
    await seedReferencedAndOrphanFixture(fixture);

    await withLocalClipApi(fixture, async (context) => {
      const integrity = await readIntegrity(context);
      const result = await readCleanResult(context, {
        local_clip_ids: ["E000001"],
        confirm_token: integrity.confirm_token,
        expected_bytes: 0
      });

      assert.deepEqual(result.removed, []);
      assert.equal(result.freed_bytes, 0);
      assert.equal(result.skipped.length, 1);
      const skipped = result.skipped[0]!;
      assert.equal(skipped.local_clip_id, "E000001");
      assert.equal(skipped.code, LOCAL_CLIP_MAINTENANCE_ERROR_CODES.local_clip_referenced);
      assert.equal(skipped.referenced_by?.[0]?.kind, "project");

      assert.equal(
        await fileOrDirExists(path.join(fixture.export_root, "E000001", "media.mp4")),
        true
      );
      assert.equal(
        await fileOrDirExists(path.join(fixture.asset_root, "E000001", "source.mp4")),
        true
      );
    });
  });
});

test("local clip clean rejects mismatched expected bytes without deleting files", async () => {
  await withLocalClipFixture(async (fixture) => {
    await seedLocalClip(fixture, { id: "E000002", title: "orphan clip" });

    await withLocalClipApi(fixture, async (context) => {
      const integrity = await readIntegrity(context);
      const orphan = integrity.orphans[0]!;

      const response = await postClean(context, {
        local_clip_ids: ["E000002"],
        confirm_token: integrity.confirm_token,
        expected_bytes: orphan.size_bytes + 1
      });

      assert.equal(response.status, 409);
      assert.equal(
        (await readError(response)).code,
        LOCAL_CLIP_MAINTENANCE_ERROR_CODES.local_clip_expected_bytes_mismatch
      );
      assert.equal(
        await fileOrDirExists(path.join(fixture.export_root, "E000002", "media.mp4")),
        true
      );
    });
  });
});

test("local clip clean reports expired confirm tokens", async () => {
  await withLocalClipFixture(async (fixture) => {
    await seedLocalClip(fixture, { id: "E000002", title: "orphan clip" });

    await withLocalClipApi(
      fixture,
      async (context) => {
        const integrity = await readIntegrity(context);
        const orphan = integrity.orphans[0]!;
        await new Promise((resolve) => setTimeout(resolve, 25));

        const response = await postClean(context, {
          local_clip_ids: ["E000002"],
          confirm_token: integrity.confirm_token,
          expected_bytes: orphan.size_bytes
        });

        assert.equal(response.status, 409);
        assert.equal(
          (await readError(response)).code,
          LOCAL_CLIP_MAINTENANCE_ERROR_CODES.local_clip_confirm_expired
        );
        assert.equal(
          await fileOrDirExists(path.join(fixture.export_root, "E000002", "media.mp4")),
          true
        );
      },
      { local_clip_confirm_ttl_ms: 1 }
    );
  });
});

test("DELETE local clip returns local_clip_referenced and allows force with confirm token", async () => {
  await withLocalClipFixture(async (fixture) => {
    await seedReferencedAndOrphanFixture(fixture);

    await withLocalClipApi(fixture, async (context) => {
      const blocked = await fetch(
        context.base_url + "/cutter/local-clips/E000001",
        {
          method: "DELETE",
          headers: context.headers
        }
      );
      assert.equal(blocked.status, 409);
      const blockedError = await readError(blocked);
      assert.equal(
        blockedError.code,
        LOCAL_CLIP_MAINTENANCE_ERROR_CODES.local_clip_referenced
      );
      const referencedBy = blockedError.details?.referenced_by as
        | Array<{ kind: string }>
        | undefined;
      assert.ok(Array.isArray(referencedBy) && referencedBy.length > 0);
      assert.equal(referencedBy?.[0]?.kind, "project");
      assert.equal(
        await fileOrDirExists(path.join(fixture.export_root, "E000001", "media.mp4")),
        true
      );

      const forceWithoutToken = await fetch(
        context.base_url + "/cutter/local-clips/E000001?force=1",
        {
          method: "DELETE",
          headers: context.headers
        }
      );
      assert.equal(forceWithoutToken.status, 409);
      assert.equal(
        (await readError(forceWithoutToken)).code,
        LOCAL_CLIP_MAINTENANCE_ERROR_CODES.local_clip_confirm_invalid
      );

      const integrity = await readIntegrity(context);
      const forced = await fetch(
        context.base_url + "/cutter/local-clips/E000001?force=1",
        {
          method: "DELETE",
          headers: {
            ...context.headers,
            "X-MixLab-Cache-Confirm-Token": integrity.confirm_token
          }
        }
      );
      assert.equal(forced.status, 200);
      const forcedBody = (await forced.json()) as {
        data: { local_clip_id: string; deleted: boolean };
      };
      assert.deepEqual(forcedBody.data, { local_clip_id: "E000001", deleted: true });
      assert.equal(await fileOrDirExists(path.join(fixture.export_root, "E000001")), false);
      assert.equal(await fileOrDirExists(path.join(fixture.asset_root, "E000001")), false);

      const orphanDelete = await fetch(
        context.base_url + "/cutter/local-clips/E000002",
        {
          method: "DELETE",
          headers: context.headers
        }
      );
      assert.equal(orphanDelete.status, 200);
      const orphanBody = (await orphanDelete.json()) as {
        data: { local_clip_id: string; deleted: boolean };
      };
      assert.deepEqual(orphanBody.data, { local_clip_id: "E000002", deleted: true });
    });
  });
});

test("local clip clean rejects concurrent requests with local_clip_busy", async () => {
  await withLocalClipFixture(async (fixture) => {
    await seedLocalClip(fixture, { id: "E000002", title: "orphan clip" });

    await withLocalClipApi(fixture, async (context) => {
      const integrity = await readIntegrity(context);
      const orphan = integrity.orphans[0]!;
      const releaseBusy = context.service.tryBeginClean();
      assert.ok(releaseBusy);

      try {
        const busyResponse = await postClean(context, {
          local_clip_ids: ["E000002"],
          confirm_token: integrity.confirm_token,
          expected_bytes: orphan.size_bytes
        });
        assert.equal(busyResponse.status, 409);
        assert.equal(
          (await readError(busyResponse)).code,
          LOCAL_CLIP_MAINTENANCE_ERROR_CODES.local_clip_busy
        );
      } finally {
        releaseBusy();
      }

      const result = await readCleanResult(context, {
        local_clip_ids: ["E000002"],
        confirm_token: integrity.confirm_token,
        expected_bytes: orphan.size_bytes
      });
      assert.deepEqual(result.removed, ["E000002"]);
      assert.equal(result.freed_bytes, orphan.size_bytes);
    });
  });
});

test("local clip integrity is empty in legacy library-only mode", async () => {
  await withLocalClipFixture(async (fixture) => {
    const headers = await createAuthHeaders(fixture.library_root);
    const server = createCutterApiServer({
      library_root: fixture.library_root,
      workspace_lease_disabled: true
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });

    try {
      const address = server.address() as AddressInfo;
      const baseUrl = "http://127.0.0.1:" + address.port;
      const integrityResponse = await fetch(baseUrl + "/cutter/local-clips/integrity", {
        headers
      });
      assert.equal(integrityResponse.status, 200);
      const integrity = (await integrityResponse.json()) as { data: LocalClipIntegrity };
      assert.deepEqual(integrity.data.referenced, []);
      assert.deepEqual(integrity.data.orphans, []);
      assert.equal(integrity.data.total_bytes, 0);
      assert.equal(integrity.data.expected_bytes, 0);

      const cleanResponse = await fetch(baseUrl + "/cutter/local-clips/clean", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          local_clip_ids: ["E999999"],
          confirm_token: integrity.data.confirm_token,
          expected_bytes: 0
        })
      });
      assert.equal(cleanResponse.status, 200);
      const clean = (await cleanResponse.json()) as { data: LocalClipCleanResult };
      assert.deepEqual(clean.data.removed, []);
      assert.equal(
        clean.data.skipped[0]?.code,
        LOCAL_CLIP_MAINTENANCE_ERROR_CODES.local_clip_unknown
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});

test("runtime status exposes disk cache space fields", async () => {
  await withLocalClipFixture(async (fixture) => {
    await withLocalClipApi(fixture, async (context) => {
      const deadline = Date.now() + 3_000;
      let localCache: Record<string, unknown> = {};
      do {
        const response = await fetch(
          context.base_url + "/cutter/runtime-status?include_cache=1",
          { headers: context.headers }
        );
        assert.equal(response.status, 200);
        const body = (await response.json()) as {
          data: { local_cache?: Record<string, unknown> };
        };
        localCache = body.data.local_cache ?? {};
        if (typeof localCache.disk_free_bytes === "number") {
          break;
        }
        if (typeof localCache.disk_unavailable_reason === "string") {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      } while (Date.now() < deadline);

      assert.equal(typeof localCache.disk_low, "boolean");
      if (typeof localCache.disk_free_bytes === "number") {
        assert.equal(typeof localCache.disk_total_bytes, "number");
        const freeBytes = localCache.disk_free_bytes;
        const totalBytes = localCache.disk_total_bytes as number;
        assert.ok(totalBytes > 0);
        assert.ok(freeBytes >= 0);
        assert.ok(freeBytes <= totalBytes);
        assert.equal(localCache.disk_low, freeBytes / totalBytes < 0.05);
      } else {
        assert.equal(localCache.disk_low, false);
        assert.equal(typeof localCache.disk_unavailable_reason, "string");
      }
    });
  });
});
