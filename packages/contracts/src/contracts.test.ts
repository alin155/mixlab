import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTRACT_ERRORS,
  CONTRACT_VERSION,
  compareVersions,
  contractErrorDefinition,
  isCapabilityTableV1,
  isContractErrorCode,
  isLocalJobTerminal,
  releaseManifestIsCompatible,
  toContractErrorBody,
  validateEventEnvelopeV1,
  validateReleaseManifestV2,
  type ReleaseManifestV2
} from "./index.ts";

function validManifest(): ReleaseManifestV2 {
  return {
    schema_version: "2.0",
    contract_version: CONTRACT_VERSION,
    release_id: "rel_20261027_001",
    library_id: "lib_main_001",
    created_at: "2026-10-27T02:00:00.000Z",
    min_client_version: "0.19.0",
    index_version: "v001234",
    ready_video_count: 12869,
    files: [
      { path: "catalog.sqlite", role: "catalog", size: 1024, sha256: "a".repeat(64) },
      { path: "search-index/v001234/index.sqlite", role: "search-index", size: 2048, sha256: "b".repeat(64) }
    ]
  };
}

test("error registry codes are unique and stable", () => {
  const codes = CONTRACT_ERRORS.map((entry) => entry.code);
  assert.equal(new Set(codes).size, codes.length);
  for (const entry of CONTRACT_ERRORS) {
    assert.ok(entry.http_status >= 400 && entry.http_status <= 599);
    assert.ok(entry.user_message.length > 0);
    assert.ok(entry.remediation.length > 0);
  }
  assert.equal(isContractErrorCode("AUTH_REQUIRED"), true);
  assert.equal(isContractErrorCode("NOT_A_CODE"), false);
  assert.equal(contractErrorDefinition("CUT_OUTPUT_MISMATCH")?.http_status, 500);
});

test("toContractErrorBody keeps unknown codes visible but safe", () => {
  const known = toContractErrorBody({ code: "LOGIN_RATE_LIMITED", details: { retry_after_seconds: 30 } });
  assert.equal(known.ok, false);
  assert.equal(known.http_status, 429);
  assert.equal(known.retryable, "retryable");
  assert.deepEqual(known.details, { retry_after_seconds: 30 });

  const unknown = toContractErrorBody({ code: "SOMETHING_NEW" });
  assert.equal(unknown.error_code, "SOMETHING_NEW");
  assert.equal(unknown.http_status, 500);
  assert.equal(unknown.message, "操作失败，请稍后重试");
});

test("capability table validation accepts a complete table", () => {
  const table = {
    contract_version: CONTRACT_VERSION,
    server_version: "2026.10",
    server_product: "admin" as const,
    min_client_version: "0.19.0",
    features: { release_v2: true, event_batch: true, smart_beta: false },
    limits: { event_batch_max: 100, page_max: 200 },
    generated_at: "2026-10-27T02:00:00.000Z"
  };
  assert.equal(isCapabilityTableV1(table), true);
  assert.equal(isCapabilityTableV1({ ...table, features: undefined }), false);
  assert.equal(isCapabilityTableV1(null), false);
  assert.equal(isCapabilityTableV1({ ...table, features: [] }), false);
  assert.equal(isCapabilityTableV1({ ...table, limits: [] }), false);
  assert.equal(isCapabilityTableV1({ ...table, features: { release_v2: "yes" } }), false);
});

test("release manifest v2 validation accepts a valid bundle and rejects unsafe entries", () => {
  const manifest = validManifest();
  assert.equal(validateReleaseManifestV2(manifest).release_id, manifest.release_id);
  assert.equal(releaseManifestIsCompatible(manifest, "0.19.0"), true);
  assert.equal(releaseManifestIsCompatible(manifest, "0.18.9"), false);

  assert.throws(() => validateReleaseManifestV2({ ...manifest, schema_version: "1.0" }), /schema_version/);
  assert.throws(
    () => validateReleaseManifestV2({ ...manifest, files: [{ path: "../escape", role: "catalog", size: 1, sha256: "a".repeat(64) }] }),
    /safe relative path/
  );
  assert.throws(
    () => validateReleaseManifestV2({ ...manifest, files: [{ path: "a.sqlite", role: "catalog", size: 1, sha256: "zz" }] }),
    /sha256/
  );
  assert.throws(
    () => validateReleaseManifestV2({ ...manifest, files: [manifest.files[0], manifest.files[0]] }),
    /unique/
  );
});

test("event envelope v1 validation enforces idempotency key and payload bounds", () => {
  const event = {
    schema_version: "1.0" as const,
    event_id: "evt_01HQ1234567890ABCDEF",
    event_type: "cut_success" as const,
    occurred_at: "2026-10-27T02:03:04.000Z",
    device_id: "cutter-device-1",
    user_id: "CU000001",
    payload: { job_id: "CJ20261027-0001", duration_ms: 2000 },
    client: { product: "cutter" as const, version: "0.19.0", contract_version: CONTRACT_VERSION }
  };
  assert.equal(validateEventEnvelopeV1(event).event_id, event.event_id);
  assert.throws(() => validateEventEnvelopeV1({ ...event, event_id: "short" }), /event_id/);
  assert.throws(() => validateEventEnvelopeV1({ ...event, payload: { text: "x".repeat(9000) } }), /8 KiB/);
});

test("semver comparison and local job terminal states", () => {
  assert.equal(compareVersions("0.19.0", "0.19.0"), 0);
  assert.equal(compareVersions("0.20.0", "0.19.9"), 1);
  assert.equal(compareVersions("0.18.0", "0.19.0"), -1);
  assert.equal(compareVersions("1.0.0-beta.1", "1.0.0"), 0);
  assert.equal(isLocalJobTerminal("succeeded"), true);
  assert.equal(isLocalJobTerminal("verifying"), false);
});
