import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { approveCutterUser, createCutterLoginApplication } from "../../library-fs/src/index.ts";
import {
  GOVERNANCE_AUDIT_ERROR_CODES,
  GOVERNANCE_AUDIT_MAX_ENTRIES,
  createGovernanceAuditStore,
  type GovernanceAuditEntry,
  type GovernanceAuditRecordInput
} from "./governance-audit.ts";
import {
  createCutterApiServer,
  type CreateCutterApiServerInput
} from "./index.ts";

const CREATED_AT = "2026-05-02T10:00:00Z";

interface AuditFixture {
  base_root: string;
  library_root: string;
  workspace_root: string;
}

async function createAuditFixture(): Promise<AuditFixture> {
  const baseRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-governance-audit-"));
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

async function withAuditFixture(fn: (fixture: AuditFixture) => Promise<void>): Promise<void> {
  const fixture = await createAuditFixture();
  try {
    await fn(fixture);
  } finally {
    await rm(fixture.base_root, { recursive: true, force: true });
  }
}

function makeAuditEntry(index: number): GovernanceAuditRecordInput {
  return {
    at: new Date(Date.UTC(2026, 4, 2, 10, 0, index)).toISOString(),
    operation: "cache_clean",
    targets: ["searchd"],
    removed_count: 1,
    freed_bytes: index,
    skipped_count: 0,
    errors: [],
    result: "ok",
    duration_ms: index
  };
}

async function auditLineCount(filePath: string): Promise<number> {
  const content = await readFile(filePath, "utf8");
  return content.split("\n").filter((line) => line.trim() !== "").length;
}

async function createAuthHeaders(libraryRoot: string): Promise<Record<string, string>> {
  const application = await createCutterLoginApplication(libraryRoot, {
    username: "audit-user",
    device_id: "audit-device",
    device_name: "Audit Test Device",
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

interface AuditApiContext {
  base_url: string;
  headers: Record<string, string>;
}

async function withAuditApi(
  fixture: AuditFixture,
  fn: (context: AuditApiContext) => Promise<void>,
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
    await fn({
      base_url: "http://127.0.0.1:" + address.port,
      headers
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function fetchAudit(
  context: AuditApiContext,
  limit?: string
): Promise<Response> {
  const query = limit === undefined ? "" : "?limit=" + encodeURIComponent(limit);
  return fetch(context.base_url + "/cutter/governance/audit" + query, {
    headers: context.headers
  });
}

async function readAudit(
  context: AuditApiContext,
  limit?: string
): Promise<{
  entries: GovernanceAuditEntry[];
  audit_error?: string;
}> {
  const response = await fetchAudit(context, limit);
  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    data: { entries: GovernanceAuditEntry[]; audit_error?: string };
  };
  return payload.data;
}

async function readErrorCode(response: Response): Promise<string> {
  const body = (await response.json()) as { error: { code: string } };
  return body.error.code;
}

async function seedSearchdCache(fixture: AuditFixture, bytes = 32): Promise<void> {
  const cacheDir = path.join(fixture.workspace_root, "cache", "searchd", "tantivy");
  await mkdir(cacheDir, { recursive: true });
  await writeFile(path.join(cacheDir, "segment.idx"), Buffer.alloc(bytes, "s"));
}

async function cleanSearchdCache(context: AuditApiContext): Promise<Response> {
  const inventoryResponse = await fetch(
    context.base_url + "/cutter/cache/inventory?include=searchd",
    { headers: context.headers }
  );
  assert.equal(inventoryResponse.status, 200);
  const inventory = (await inventoryResponse.json()) as {
    data: { expected_bytes: number; confirm_token: string };
  };

  return fetch(context.base_url + "/cutter/cache/clean", {
    method: "POST",
    headers: {
      ...context.headers,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      targets: ["searchd"],
      confirm_token: inventory.data.confirm_token,
      expected_bytes: inventory.data.expected_bytes
    })
  });
}

test("governance audit store appends entries and reads newest first", async () => {
  await withAuditFixture(async (fixture) => {
    const store = createGovernanceAuditStore({ workspace_root: fixture.workspace_root });
    assert.equal(store.isEnabled(), true);
    assert.ok(store.auditPath()?.endsWith("governance-audit.jsonl"));

    for (const index of [1, 2, 3]) {
      const result = await store.record(makeAuditEntry(index));
      assert.deepEqual(result, { ok: true });
    }

    const read = await store.readRecent(10);
    assert.equal(read.error, undefined);
    assert.deepEqual(
      read.entries.map((entry) => entry.freed_bytes),
      [3, 2, 1]
    );

    const newest = read.entries[0]!;
    assert.equal(newest.at, makeAuditEntry(3).at);
    assert.equal(newest.operation, "cache_clean");
    assert.deepEqual(newest.targets, ["searchd"]);
    assert.equal(newest.removed_count, 1);
    assert.equal(newest.freed_bytes, 3);
    assert.equal(newest.skipped_count, 0);
    assert.deepEqual(newest.errors, []);
    assert.equal(newest.result, "ok");
    assert.equal(newest.duration_ms, 3);
    assert.equal(await auditLineCount(store.auditPath()!), 3);
  });
});

test("governance audit store rotates to the newest 50 entries", async () => {
  await withAuditFixture(async (fixture) => {
    const store = createGovernanceAuditStore({ workspace_root: fixture.workspace_root });
    for (let index = 1; index <= 55; index += 1) {
      const result = await store.record(makeAuditEntry(index));
      assert.equal(result.ok, true);
    }

    assert.equal(await auditLineCount(store.auditPath()!), GOVERNANCE_AUDIT_MAX_ENTRIES);
    const read = await store.readRecent(50);
    assert.equal(read.entries.length, 50);
    assert.equal(read.entries[0]?.freed_bytes, 55);
    assert.equal(read.entries[49]?.freed_bytes, 6);
  });
});

test("governance audit store is a no-op without workspace root", async () => {
  const store = createGovernanceAuditStore({});
  assert.equal(store.isEnabled(), false);
  assert.deepEqual(await store.record(makeAuditEntry(1)), { ok: true });
  assert.deepEqual(await store.readRecent(10), { entries: [] });
});

test("governance audit readRecent clamps limit and tolerates malformed lines", async () => {
  await withAuditFixture(async (fixture) => {
    const store = createGovernanceAuditStore({ workspace_root: fixture.workspace_root });
    for (const index of [1, 2, 3, 4, 5]) {
      await store.record(makeAuditEntry(index));
    }

    assert.deepEqual(
      (await store.readRecent(2)).entries.map((entry) => entry.freed_bytes),
      [5, 4]
    );
    assert.equal((await store.readRecent(100)).entries.length, 5);
    assert.equal((await store.readRecent(0)).entries.length, 1);

    const auditPath = store.auditPath()!;
    const content = await readFile(auditPath, "utf8");
    await writeFile(auditPath, "not-json\n" + content, "utf8");
    assert.equal((await store.readRecent(10)).entries.length, 5);
  });
});

test("governance audit read failure returns empty entries with audit_error", async () => {
  await withAuditFixture(async (fixture) => {
    const store = createGovernanceAuditStore({ workspace_root: fixture.workspace_root });
    const auditPath = store.auditPath()!;
    await mkdir(auditPath, { recursive: true });

    const read = await store.readRecent(10);
    assert.deepEqual(read.entries, []);
    assert.equal(typeof read.error, "string");
    assert.match(read.error ?? "", /读取失败/);

    const record = await store.record(makeAuditEntry(1));
    assert.equal(record.ok, false);
    assert.match(record.error ?? "", /写入失败/);
  });
});

test("governance audit write failure is returned instead of thrown", async () => {
  await withAuditFixture(async (fixture) => {
    const store = createGovernanceAuditStore({
      workspace_root: fixture.workspace_root,
      writer: async () => {
        throw new Error("audit disk unavailable");
      }
    });

    const result = await store.record(makeAuditEntry(1));
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /治理操作审计写入失败/);
    assert.match(result.error ?? "", /audit disk unavailable/);
  });
});

test("governance audit endpoint requires session and validates limit", async () => {
  await withAuditFixture(async (fixture) => {
    await withAuditApi(fixture, async (context) => {
      const anonymous = await fetch(context.base_url + "/cutter/governance/audit");
      assert.equal(anonymous.status, 401);

      for (const limit of ["0", "51", "abc", "-3"]) {
        const response = await fetchAudit(context, limit);
        assert.equal(response.status, 400);
        assert.equal(
          await readErrorCode(response),
          GOVERNANCE_AUDIT_ERROR_CODES.governance_audit_invalid_limit
        );
      }

      const valid = await readAudit(context, "50");
      assert.deepEqual(valid.entries, []);
      assert.equal(valid.audit_error, undefined);
    });
  });
});

test("cache clean writes a governance audit entry", async () => {
  await withAuditFixture(async (fixture) => {
    await seedSearchdCache(fixture);

    await withAuditApi(fixture, async (context) => {
      const cleanResponse = await cleanSearchdCache(context);
      assert.equal(cleanResponse.status, 200);
      const cleanPayload = (await cleanResponse.json()) as {
        data: { cleaned: string[]; freed_bytes: number; audit_error?: string };
      };
      assert.deepEqual(cleanPayload.data.cleaned, ["searchd"]);
      assert.equal(cleanPayload.data.freed_bytes, 32);
      assert.equal(cleanPayload.data.audit_error, undefined);

      const audit = await readAudit(context);
      assert.equal(audit.entries.length, 1);
      const entry = audit.entries[0]!;
      assert.equal(entry.operation, "cache_clean");
      assert.deepEqual(entry.targets, ["searchd"]);
      assert.equal(entry.removed_count, 1);
      assert.equal(entry.freed_bytes, 32);
      assert.equal(entry.skipped_count, 0);
      assert.deepEqual(entry.errors, []);
      assert.equal(entry.result, "ok");
      assert.equal(typeof entry.duration_ms, "number");
      assert.ok(entry.duration_ms >= 0);
      assert.equal(Number.isNaN(Date.parse(entry.at)), false);
    });
  });
});

test("governance audit write failure does not block cache clean", async () => {
  await withAuditFixture(async (fixture) => {
    await seedSearchdCache(fixture);

    await withAuditApi(
      fixture,
      async (context) => {
        const cleanResponse = await cleanSearchdCache(context);
        assert.equal(cleanResponse.status, 200);
        const payload = (await cleanResponse.json()) as {
          data: { cleaned: string[]; freed_bytes: number; audit_error?: string };
        };
        assert.deepEqual(payload.data.cleaned, ["searchd"]);
        assert.equal(payload.data.freed_bytes, 32);
        assert.equal(typeof payload.data.audit_error, "string");
        assert.match(payload.data.audit_error ?? "", /治理操作审计写入失败/);
      },
      {
        governance_audit_writer: async () => {
          throw new Error("audit writer unavailable");
        }
      }
    );
  });
});

test("governance audit endpoint returns audit_error when read fails", async () => {
  await withAuditFixture(async (fixture) => {
    await withAuditApi(fixture, async (context) => {
      const auditPath = path.join(
        fixture.workspace_root,
        ".mixlab-library",
        "ops",
        "governance-audit.jsonl"
      );
      await mkdir(auditPath, { recursive: true });

      const audit = await readAudit(context);
      assert.deepEqual(audit.entries, []);
      assert.equal(typeof audit.audit_error, "string");
      assert.match(audit.audit_error ?? "", /读取失败/);
    });
  });
});

test("local clip force delete writes a governance audit entry", async () => {
  await withAuditFixture(async (fixture) => {
    const exportDir = path.join(fixture.workspace_root, "export-clips", "E000001");
    const assetDir = path.join(fixture.workspace_root, ".mixlab-library", "videos", "E000001");
    const projectOutputPath = path.join(
      fixture.workspace_root,
      "projects",
      "alpha",
      "001-alpha-project-output.mp4"
    );
    await mkdir(exportDir, { recursive: true });
    await mkdir(assetDir, { recursive: true });
    await mkdir(path.dirname(projectOutputPath), { recursive: true });
    await writeFile(path.join(exportDir, "media.mp4"), Buffer.alloc(24, "m"));
    await writeFile(path.join(assetDir, "source.mp4"), Buffer.alloc(16, "s"));
    await writeFile(projectOutputPath, Buffer.alloc(8, "p"));
    await writeFile(
      path.join(exportDir, "export-clip.json"),
      JSON.stringify({
        export_clip_id: "E000001",
        library_id: "lib-test",
        project_id: "P-ALPHA",
        project_title: "alpha project",
        source_video_id: "V000001",
        title: "project clip",
        source_title: "clip-source",
        begin_ms: 0,
        end_ms: 1000,
        selected_text: "clip",
        output_file: "export-clips/E000001/media.mp4",
        project_output_file: "projects/alpha/001-alpha-project-output.mp4",
        local_asset_relative_path: ".mixlab-library/videos/E000001/source.mp4",
        created_at: CREATED_AT,
        cut_mode: "smart"
      }),
      "utf8"
    );

    await withAuditApi(fixture, async (context) => {
      const integrityResponse = await fetch(
        context.base_url + "/cutter/local-clips/integrity",
        { headers: context.headers }
      );
      assert.equal(integrityResponse.status, 200);
      const integrity = (await integrityResponse.json()) as {
        data: { confirm_token: string };
      };

      const deleteResponse = await fetch(
        context.base_url + "/cutter/local-clips/E000001?force=1",
        {
          method: "DELETE",
          headers: {
            ...context.headers,
            "X-MixLab-Cache-Confirm-Token": integrity.data.confirm_token
          }
        }
      );
      assert.equal(deleteResponse.status, 200);
      const deletePayload = (await deleteResponse.json()) as {
        data: { local_clip_id: string; deleted: boolean; audit_error?: string };
      };
      assert.equal(deletePayload.data.deleted, true);
      assert.equal(deletePayload.data.audit_error, undefined);

      const audit = await readAudit(context);
      assert.equal(audit.entries.length, 1);
      const entry = audit.entries[0]!;
      assert.equal(entry.operation, "local_clip_force_delete");
      assert.deepEqual(entry.targets, ["E000001"]);
      assert.equal(entry.removed_count, 1);
      assert.ok(entry.freed_bytes > 0);
      assert.equal(entry.result, "ok");
    });
  });
});
