import assert from "node:assert/strict";
import test from "node:test";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CONTRACT_VERSION, type CapabilityTableV1 } from "../../../packages/contracts/src/index.ts";
import {
  AdminHttpError
} from "./admin-http.ts";
import {
  createAdminApiClient,
  createFixtureAdminApiClient,
  loadAdminDashboardData,
  type AdminDashboardData
} from "./api.ts";
import {
  ADMIN_LEGACY_TO_CONTRACT_CODE,
  adminErrorCodeInfo,
  adminErrorIsRetryable,
  resolveAdminContractErrorCode
} from "./app/admin-error-codes.ts";
import { adminCapabilityUnavailableMessage } from "./app/capabilities.ts";
import {
  adminServiceModeRows,
  adminServiceModesProvided,
  adminServiceModesSummary,
  parseAdminServiceModes
} from "./app/service-modes.ts";
import { DoctorPage } from "./features/doctor/DoctorPage.tsx";
import { SettingsPage } from "./features/settings/SettingsPage.tsx";

async function fixtureData(): Promise<AdminDashboardData> {
  return loadAdminDashboardData(createFixtureAdminApiClient());
}

function capabilityTable(): CapabilityTableV1 {
  return {
    contract_version: CONTRACT_VERSION,
    server_version: "2026.10",
    server_product: "admin",
    min_client_version: "0.19.0",
    features: { release_v2: false, event_batch: true },
    limits: { event_batch_max: 100 },
    generated_at: "2026-10-27T02:00:00.000Z"
  };
}

test("P3 error aliases align with admin-api contract mapping", () => {
  const cases: Array<[string, string, string]> = [
    ["release_busy", "RELEASE_BUSY", "retryable"],
    ["publication_busy", "RELEASE_BUSY", "retryable"],
    ["release_not_found", "RELEASE_NOT_FOUND", "after-fix"],
    ["release_pointer_invalid", "RELEASE_POINTER_INVALID", "after-fix"],
    ["release_bundle_corrupt", "RELEASE_BUNDLE_CORRUPT", "after-fix"],
    ["library_unavailable", "LIBRARY_UNAVAILABLE", "retryable"],
    ["library_timeout", "LIBRARY_UNAVAILABLE", "retryable"],
    ["library_not_ready", "LIBRARY_NOT_READY", "retryable"],
    ["contract_too_old", "CONTRACT_TOO_OLD", "after-fix"],
    ["capability_unavailable", "CAPABILITY_UNAVAILABLE", "never"],
    ["admin_writer_busy", "WORKSPACE_LEASE_UNAVAILABLE", "retryable"],
    ["agent_unavailable", "AGENT_UNAVAILABLE", "retryable"],
    ["auth_required", "AUTH_REQUIRED", "after-fix"],
    ["admin_required", "AUTH_FORBIDDEN", "after-fix"],
    ["route_missing", "NOT_FOUND", "never"]
  ];

  for (const [legacyCode, contractCode, retryable] of cases) {
    assert.equal(resolveAdminContractErrorCode(legacyCode), contractCode, legacyCode);
    const info = adminErrorCodeInfo(legacyCode);
    assert.equal(info?.contract_code, contractCode, legacyCode);
    assert.equal(info?.retryable, retryable, legacyCode);
    assert.equal(adminErrorIsRetryable(legacyCode), retryable === "retryable", legacyCode);
    assert.ok(ADMIN_LEGACY_TO_CONTRACT_CODE[legacyCode], legacyCode);
  }

  assert.equal(resolveAdminContractErrorCode("Release_Busy"), "RELEASE_BUSY");
  assert.equal(resolveAdminContractErrorCode("RELEASE_BUSY"), "RELEASE_BUSY");
  assert.equal(resolveAdminContractErrorCode("invalid_custom_field"), "VALIDATION_FAILED");
  assert.equal(resolveAdminContractErrorCode("something_not_found"), "NOT_FOUND");
  assert.equal(resolveAdminContractErrorCode("library_read_timeout"), "LIBRARY_UNAVAILABLE");
  assert.equal(resolveAdminContractErrorCode("unmapped_code"), "unmapped_code");
});

test("service modes parse from capabilities/health with default legacy fallback", () => {
  const capabilities = {
    ...capabilityTable(),
    accounts_service: {
      mode: "service",
      migration_status: "done",
      migrated_count: 120,
      pending_count: 0,
      legacy_write_enabled: false
    },
    usage_service: {
      mode: "legacy",
      migration_status: "in_progress",
      pending_count: 7
    }
  };
  const fromCapabilities = parseAdminServiceModes({ capabilities });
  assert.equal(fromCapabilities.source, "capabilities");
  assert.equal(fromCapabilities.accounts.mode, "service");
  assert.equal(fromCapabilities.accounts.mode_label, "独立服务模式");
  assert.equal(fromCapabilities.accounts.migration_label, "迁移完成");
  assert.equal(fromCapabilities.accounts.migrated_count, 120);
  assert.equal(fromCapabilities.usage.mode, "legacy");
  assert.equal(fromCapabilities.usage.migration_label, "迁移中");
  assert.equal(fromCapabilities.usage.pending_count, 7);
  assert.equal(adminServiceModesProvided(fromCapabilities), true);

  const nested = parseAdminServiceModes({
    capabilities: { ...capabilityTable(), services: { accounts: "service", usage: "legacy" } }
  });
  assert.equal(nested.accounts.mode, "service");
  assert.equal(nested.usage.mode, "legacy");

  const healthOnly = parseAdminServiceModes({
    health: {
      accounts_service: { mode: "legacy", migration_status: "not_required" },
      usage_service: { mode: "service", migration_status: "done" }
    }
  });
  assert.equal(healthOnly.source, "health");
  assert.equal(healthOnly.usage.mode, "service");

  const priority = parseAdminServiceModes({
    capabilities: { accounts_service: "service", usage_service: "service" },
    health: { accounts_service: "legacy", usage_service: "legacy" }
  });
  assert.equal(priority.source, "capabilities");
  assert.equal(priority.accounts.mode, "service");

  const defaulted = parseAdminServiceModes({});
  assert.equal(defaulted.source, "default");
  assert.equal(defaulted.accounts.mode, "legacy");
  assert.equal(defaulted.accounts.mode_label, "旧共享文件模式");
  assert.equal(adminServiceModesProvided(defaulted), false);
  assert.match(adminServiceModesSummary(defaulted), /旧共享文件模式/);
  assert.ok(adminServiceModeRows(defaulted).some((row) => row.label === "账号服务模式"));
  assert.ok(adminServiceModeRows(defaulted).some((row) => row.value.includes("缺省")));

  const unknown = parseAdminServiceModes({ capabilities: { usage_service: "mystery-mode" } });
  assert.equal(unknown.usage.mode, "unknown");
  assert.equal(unknown.usage.mode_label, "模式未知");
});

test("admin client accepts both raw and enveloped capabilities and unwraps health", async () => {
  const requested: string[] = [];
  const table = capabilityTable();
  const client = createAdminApiClient({
    base_url: "http://127.0.0.1:3889",
    fetch: async (resource) => {
      const pathname = new URL(String(resource)).pathname;
      requested.push(pathname);

      if (pathname === "/api/v1/capabilities") {
        return new Response(JSON.stringify(table), {
          headers: { "content-type": "application/json" }
        });
      }

      return new Response(JSON.stringify({
        ok: true,
        data: {
          status: "ok",
          accounts_service: { mode: "legacy", migration_status: "not_required" },
          usage_service: { mode: "legacy", migration_status: "not_required" }
        },
        contract_version: CONTRACT_VERSION
      }), { headers: { "content-type": "application/json" } });
    }
  });

  const capabilities = await client.getCapabilities();
  const health = await client.getHealth();

  assert.equal(capabilities.contract_version, CONTRACT_VERSION);
  assert.deepEqual(requested.sort(), ["/api/v1/capabilities", "/health"]);
  assert.equal(parseAdminServiceModes({ health }).source, "health");
});

test("capabilities 404 contract error still degrades to unavailable and remains visible", async () => {
  const client = createAdminApiClient({
    base_url: "http://127.0.0.1:3889",
    fetch: async () => new Response(JSON.stringify({
      ok: false,
      error_code: "NOT_FOUND",
      code: "NOT_FOUND",
      message: "合同接口不存在",
      http_status: 404,
      contract_version: CONTRACT_VERSION
    }), { status: 404, headers: { "content-type": "application/json" } })
  });

  let caught: unknown = null;

  try {
    await client.getCapabilities();
  } catch (error) {
    caught = error;
  }

  assert.ok(caught instanceof AdminHttpError);
  assert.equal((caught as AdminHttpError).status, 404);
  assert.match(adminCapabilityUnavailableMessage(caught), /版本信息不可用/);
});

test("doctor and settings pages show service modes or the legacy default", async () => {
  const data = await fixtureData();
  const serviceModes = parseAdminServiceModes({
    capabilities: {
      accounts_service: { mode: "service", migration_status: "done", migrated_count: 88 },
      usage_service: { mode: "legacy", migration_status: "in_progress", pending_count: 3 }
    }
  });

  const doctorHtml = renderToStaticMarkup(h(DoctorPage, {
    data,
    serviceModes,
    clientVersion: "0.1.0"
  }));
  assert.match(doctorHtml, /服务模式与迁移/);
  assert.match(doctorHtml, /独立服务模式/);
  assert.match(doctorHtml, /旧共享文件模式/);
  assert.match(doctorHtml, /服务端已提供/);

  const doctorDefault = renderToStaticMarkup(h(DoctorPage, { data }));
  assert.match(doctorDefault, /缺省旧共享文件模式/);

  const settingsHtml = renderToStaticMarkup(h(SettingsPage, {
    data,
    serviceModes
  }));
  assert.match(settingsHtml, /服务模式与迁移/);
  assert.match(settingsHtml, /账号服务模式/);
  assert.match(settingsHtml, /事件服务模式/);
  assert.match(settingsHtml, /独立服务模式/);
});
