import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CONTRACT_ERRORS,
  CONTRACT_VERSION,
  DEFAULT_CAPABILITY_LIMITS,
  isCapabilityTableV1,
  isContractErrorCode
} from "../../contracts/src/index.ts";
import {
  ADMIN_V1_CAPABILITIES_PATH,
  ADMIN_V1_ERRORS_PATH,
  ADMIN_V1_MIN_CLIENT_VERSION_DEFAULT,
  adminV1CapabilityFeatures,
  adminV1CapabilityLimits,
  buildAdminCapabilityTableV1,
  buildAdminContractErrorRegistryV1,
  handleAdminV1ContractRoutes,
  isPublicAdminV1ContractRoute,
  matchAdminV1CapabilitiesPath,
  matchAdminV1ErrorsPath
} from "./admin-v1-contract-routes.ts";

const NOW = "2026-10-27T02:00:00.000Z";

test("capabilities route builds a valid CapabilityTableV1 with evidence-based defaults", () => {
  const table = buildAdminCapabilityTableV1({
    env: {} as NodeJS.ProcessEnv,
    now: NOW,
    server_version: "2026.10.27",
    min_client_version: "0.19.0"
  });

  assert.equal(isCapabilityTableV1(table), true);
  assert.equal(table.contract_version, CONTRACT_VERSION);
  assert.equal(table.server_version, "2026.10.27");
  assert.equal(table.server_product, "admin");
  assert.equal(table.min_client_version, "0.19.0");
  assert.equal(table.generated_at, NOW);
  assert.deepEqual(table.features, {
    release_v2: false,
    event_batch: true,
    cut_verify: true,
    daily_scan_status: true,
    registration_requires_token: false
  });
  assert.deepEqual(table.limits, { ...DEFAULT_CAPABILITY_LIMITS });
});

test("capability features follow env switches for release_v2 and SEC-05 registration guard", () => {
  const releaseV2 = adminV1CapabilityFeatures({
    env: { MIXLAB_ADMIN_RELEASE_V2_ENABLED: "1" } as NodeJS.ProcessEnv
  });
  assert.equal(releaseV2.release_v2, true);

  const registrationGuarded = adminV1CapabilityFeatures({
    env: { MIXLAB_ADMIN_REGISTRATION_TOKEN: "  install-token  " } as NodeJS.ProcessEnv
  });
  assert.equal(registrationGuarded.registration_requires_token, true);

  const overrides = adminV1CapabilityFeatures({
    env: {
      MIXLAB_CAPABILITY_FEATURE_EVENT_BATCH: "0",
      MIXLAB_CAPABILITY_FEATURE_CUT_VERIFY: "false",
      MIXLAB_CAPABILITY_FEATURE_DAILY_SCAN_STATUS: "0"
    } as NodeJS.ProcessEnv
  });
  assert.equal(overrides.event_batch, false);
  assert.equal(overrides.cut_verify, false);
  assert.equal(overrides.daily_scan_status, false);

  const explicit = adminV1CapabilityFeatures({ release_v2_enabled: true, registration_requires_token: true, env: {} as NodeJS.ProcessEnv });
  assert.equal(explicit.release_v2, true);
  assert.equal(explicit.registration_requires_token, true);
});

test("capability limits use contract defaults and safe env overrides", () => {
  assert.deepEqual(adminV1CapabilityLimits({ env: {} as NodeJS.ProcessEnv }), {
    ...DEFAULT_CAPABILITY_LIMITS
  });
  assert.deepEqual(
    adminV1CapabilityLimits({
      env: {
        MIXLAB_CAPABILITY_LIMIT_EVENT_BATCH_MAX: "50",
        MIXLAB_CAPABILITY_LIMIT_PAGE_MAX: "321",
        MIXLAB_CAPABILITY_LIMIT_UPLOAD_MAX_BYTES: "2048",
        MIXLAB_CAPABILITY_LIMIT_REQUEST_BODY_MAX_BYTES: "not-a-number"
      } as NodeJS.ProcessEnv
    }),
    {
      event_batch_max: 50,
      page_max: 321,
      upload_max_bytes: 2048,
      request_body_max_bytes: DEFAULT_CAPABILITY_LIMITS.request_body_max_bytes
    }
  );
  assert.equal(
    adminV1CapabilityLimits({ env: { MIXLAB_CAPABILITY_LIMIT_PAGE_MAX: "0" } as NodeJS.ProcessEnv }).page_max,
    DEFAULT_CAPABILITY_LIMITS.page_max
  );
});

test("capabilities route uses existing build info and env for versions", () => {
  const table = buildAdminCapabilityTableV1({
    env: {
      MIXLAB_BUILD_VERSION: "2026.10.27-build42",
      MIXLAB_ADMIN_MIN_CLIENT_VERSION: "0.20.0"
    } as NodeJS.ProcessEnv,
    now: NOW
  });
  assert.equal(table.server_version, "2026.10.27-build42");
  assert.equal(table.min_client_version, "0.20.0");

  const fallback = buildAdminCapabilityTableV1({
    env: { MIXLAB_ADMIN_SERVER_VERSION: "admin-local" } as NodeJS.ProcessEnv,
    now: NOW
  });
  assert.equal(fallback.server_version, "admin-local");
  assert.equal(
    buildAdminCapabilityTableV1({ env: {} as NodeJS.ProcessEnv, now: NOW }).min_client_version,
    ADMIN_V1_MIN_CLIENT_VERSION_DEFAULT
  );
});

test("GET /api/v1/capabilities is public and returns a valid capability table", async () => {
  const result = await handleAdminV1ContractRoutes({
    method: "GET",
    pathname: ADMIN_V1_CAPABILITIES_PATH,
    now: NOW,
    env: {} as NodeJS.ProcessEnv,
    deps: { server_version: "2026.10.27", min_client_version: "0.19.0" }
  });

  assert.equal(result.handled, true);
  if (!result.handled) {
    return;
  }
  assert.equal(result.status_code, 200);
  assert.equal(isCapabilityTableV1(result.body), true);
  const table = result.body as ReturnType<typeof buildAdminCapabilityTableV1>;
  assert.equal(table.server_version, "2026.10.27");
  assert.equal(table.generated_at, NOW);
  assert.equal(isPublicAdminV1ContractRoute("GET", ADMIN_V1_CAPABILITIES_PATH), true);
  assert.equal(isPublicAdminV1ContractRoute("POST", ADMIN_V1_CAPABILITIES_PATH), false);
  assert.equal(isPublicAdminV1ContractRoute("GET", "/api/admin/cutter-users"), false);
});

test("GET /api/v1/errors returns the shared CONTRACT_ERRORS registry", async () => {
  const result = await handleAdminV1ContractRoutes({
    method: "GET",
    pathname: ADMIN_V1_ERRORS_PATH,
    now: NOW,
    env: {} as NodeJS.ProcessEnv
  });

  assert.equal(result.handled, true);
  if (!result.handled) {
    return;
  }
  assert.equal(result.status_code, 200);
  const registry = result.body as ReturnType<typeof buildAdminContractErrorRegistryV1>;
  assert.equal(registry.contract_version, CONTRACT_VERSION);
  assert.equal(registry.generated_at, NOW);
  assert.equal(registry.errors.length, CONTRACT_ERRORS.length);
  assert.equal(registry.errors.every((entry) => isContractErrorCode(entry.code)), true);
  assert.equal(registry.errors.every((entry) => entry.http_status >= 400), true);
  assert.equal(registry.errors.some((entry) => entry.code === "AUTH_REQUIRED"), true);
  assert.equal(matchAdminV1ErrorsPath(ADMIN_V1_ERRORS_PATH), true);
  assert.equal(matchAdminV1CapabilitiesPath(ADMIN_V1_ERRORS_PATH), false);
});

test("v1 routes fail safely for unknown paths, wrong methods and non-v1 paths", async () => {
  const unknown = await handleAdminV1ContractRoutes({
    method: "GET",
    pathname: "/api/v1/not-a-contract",
    now: NOW,
    env: {} as NodeJS.ProcessEnv
  });
  assert.equal(unknown.handled, true);
  if (unknown.handled) {
    assert.equal(unknown.status_code, 404);
    const body = unknown.body as Record<string, unknown>;
    assert.equal(body.ok, false);
    assert.equal(body.code, "NOT_FOUND");
    assert.equal(body.contract_version, CONTRACT_VERSION);
    assert.equal(isContractErrorCode(body.code), true);
  }

  const wrongMethod = await handleAdminV1ContractRoutes({
    method: "POST",
    pathname: ADMIN_V1_CAPABILITIES_PATH,
    now: NOW,
    env: {} as NodeJS.ProcessEnv
  });
  assert.equal(wrongMethod.handled, true);
  if (wrongMethod.handled) {
    assert.equal(wrongMethod.status_code, 405);
    const body = wrongMethod.body as Record<string, unknown>;
    assert.equal(body.code, "VALIDATION_FAILED");
    assert.equal(body.http_status, 405);
  }

  assert.deepEqual(
    await handleAdminV1ContractRoutes({
      method: "GET",
      pathname: "/api/admin/auth/status",
      env: {} as NodeJS.ProcessEnv
    }),
    { handled: false }
  );
});

test("capability deps overrides let wiring advertise release_v2 without changing contract types", () => {
  const table = buildAdminCapabilityTableV1({
    env: {} as NodeJS.ProcessEnv,
    now: NOW,
    server_version: "2026.10.27",
    features: { release_v2: true },
    limits: { page_max: 123 }
  });
  assert.equal(isCapabilityTableV1(table), true);
  assert.equal(table.features.release_v2, true);
  assert.equal(table.limits.page_max, 123);
  assert.equal(table.limits.event_batch_max, DEFAULT_CAPABILITY_LIMITS.event_batch_max);
});

test("real admin server exposes v1 contract routes publicly and keeps legacy auth envelopes", async () => {
  const { createAdminApiServer } = await import("./index.ts");
  const libraryRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-v1-contract-"));
  const server = createAdminApiServer({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "契约测试库",
    auth_mode: "password",
    env: {
      MIXLAB_BUILD_VERSION: "2026.10.27-contract"
    } as NodeJS.ProcessEnv
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${(address as { port: number }).port}`;

    const capabilitiesResponse = await fetch(`${baseUrl}${ADMIN_V1_CAPABILITIES_PATH}`);
    assert.equal(capabilitiesResponse.status, 200);
    const capabilityTable = await capabilitiesResponse.json();
    assert.equal(isCapabilityTableV1(capabilityTable), true);
    assert.equal((capabilityTable as { server_version: string }).server_version, "2026.10.27-contract");

    const errorsResponse = await fetch(`${baseUrl}${ADMIN_V1_ERRORS_PATH}`);
    assert.equal(errorsResponse.status, 200);
    const registry = await errorsResponse.json() as { contract_version: string; errors: Array<{ code: string }> };
    assert.equal(registry.contract_version, CONTRACT_VERSION);
    assert.equal(registry.errors.length, CONTRACT_ERRORS.length);

    // The v1 contract endpoints must stay session-free even in password auth mode.
    const unknownResponse = await fetch(`${baseUrl}/api/v1/unknown`);
    assert.equal(unknownResponse.status, 404);
    const unknownBody = await unknownResponse.json() as { code: string; contract_version: string };
    assert.equal(unknownBody.code, "NOT_FOUND");
    assert.equal(unknownBody.contract_version, CONTRACT_VERSION);

    // Legacy admin route envelope stays backward compatible while adding contract fields.
    const badRegister = await fetch(`${baseUrl}/api/admin/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{"
    });
    assert.equal(badRegister.status, 400);
    const badRegisterBody = await badRegister.json() as Record<string, unknown>;
    assert.equal(badRegisterBody.ok, false);
    assert.equal(badRegisterBody.error_code, "invalid_request");
    assert.equal(badRegisterBody.code, "VALIDATION_FAILED");
    assert.equal(badRegisterBody.contract_version, CONTRACT_VERSION);
    assert.equal(typeof badRegisterBody.message, "string");
  } finally {
    server.close();
    await once(server, "close");
  }
});
