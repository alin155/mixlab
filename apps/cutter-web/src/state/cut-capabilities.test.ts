import assert from "node:assert/strict";
import test from "node:test";
import {
  capabilityUpgradeNotice,
  cutterFeatureState,
  cutVerificationUiEnabled,
  isSemverLike,
  parseCutterCapabilities,
  releaseV2UiEnabled,
  resolveCutterClientVersion,
  type CutterCapabilityTable
} from "./cut-capabilities.ts";

function capabilityTable(overrides: Partial<CutterCapabilityTable> = {}): CutterCapabilityTable {
  return {
    contract_version: "1.0.0",
    server_version: "2026.10",
    server_product: "cutter",
    min_client_version: "0.19.0",
    features: { release_v2: true, cut_verification: true },
    limits: { page_max: 200 },
    generated_at: "2026-10-27T02:00:00.000Z",
    ...overrides
  };
}

test("capability table parsing only accepts contract v1 tables", () => {
  assert.equal(parseCutterCapabilities(null), null);
  assert.equal(parseCutterCapabilities("x"), null);
  assert.equal(parseCutterCapabilities({ features: {} }), null);
  const table = capabilityTable();
  assert.deepEqual(parseCutterCapabilities(table), table);
});

test("feature negotiation distinguishes unknown / supported / unsupported", () => {
  assert.equal(cutterFeatureState(null, "cut_verification"), "unknown");
  assert.equal(cutterFeatureState(capabilityTable(), "cut_verification"), "supported");
  assert.equal(
    cutterFeatureState(capabilityTable({ features: {} }), "cut_verification"),
    "unsupported"
  );
});

test("verification UI is field-based when legacy, capability-gated when advertised", () => {
  assert.equal(cutVerificationUiEnabled(null), true);
  assert.equal(cutVerificationUiEnabled(capabilityTable()), true);
  assert.equal(cutVerificationUiEnabled(capabilityTable({ features: {} })), false);
  assert.equal(releaseV2UiEnabled(null), false);
  assert.equal(releaseV2UiEnabled(capabilityTable()), true);
  assert.equal(releaseV2UiEnabled(capabilityTable({ features: { release_v2: false } })), false);
});

test("client version resolution only accepts semver-like versions", () => {
  assert.equal(isSemverLike("0.19.0"), true);
  assert.equal(isSemverLike("1.2.3-beta.1"), true);
  assert.equal(isSemverLike("f4c1dc7"), false);
  assert.equal(isSemverLike(undefined), false);
  assert.equal(isSemverLike("v0.19.0"), true);
  assert.equal(resolveCutterClientVersion({ envClientVersion: "v0.19.0" }), "0.19.0");
  assert.equal(resolveCutterClientVersion({ envClientVersion: "0.19.0" }), "0.19.0");
  assert.equal(resolveCutterClientVersion({ buildCommit: "f4c1dc7" }), undefined);
  assert.equal(resolveCutterClientVersion({ envClientVersion: "", buildCommit: "1.2.3" }), "1.2.3");
});

test("min_client_version produces a CONTRACT_TOO_OLD upgrade notice", () => {
  const table = capabilityTable();
  assert.equal(capabilityUpgradeNotice(null, "0.18.9"), null);
  assert.equal(capabilityUpgradeNotice(table, undefined), null);
  assert.equal(capabilityUpgradeNotice(table, "0.19.0"), null);
  assert.equal(capabilityUpgradeNotice(table, "0.20.0"), null);

  const notice = capabilityUpgradeNotice(table, "0.18.9");
  assert.ok(notice);
  assert.equal(notice.code, "CONTRACT_TOO_OLD");
  assert.equal(notice.required_version, "0.19.0");
  assert.match(notice.message, /客户端版本过低/);
  assert.match(notice.remediation, /0\.19\.0/);
});
