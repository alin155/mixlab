import assert from "node:assert/strict";
import test from "node:test";
import { validateNoForbiddenUiPatterns, validateRequiredPages } from "@mixlab/ui-foundation";
import { ADMIN_NAV_ITEMS, routeFromHash } from "./navigation.ts";
import {
  adminStatusTone,
  assertAdminNavigationContract,
  formatAdminDuration,
  formatAdminFileSize,
  redactConfiguredSecret
} from "./view-model.ts";

test("admin navigation covers every required page", () => {
  const labels = ADMIN_NAV_ITEMS.map((item) => item.label);

  assert.deepEqual(validateRequiredPages("admin", labels), {
    ok: true,
    missing_pages: []
  });
  assert.equal(assertAdminNavigationContract().ok, true);
});

test("admin view markup rejects forbidden UI patterns", () => {
  assert.equal(validateNoForbiddenUiPatterns("<section class=\"ml-window\"></section>").ok, true);
  assert.deepEqual(validateNoForbiddenUiPatterns("<div class=\"hero heavy-dashboard-card\"></div>"), {
    ok: false,
    violations: ["hero", "heavy-dashboard-card"]
  });
});

test("maps admin statuses to visual tones", () => {
  assert.equal(adminStatusTone("failed"), "failed");
  assert.equal(adminStatusTone("index-required"), "warning");
  assert.equal(adminStatusTone("processing"), "processing");
  assert.equal(adminStatusTone("ready"), "ready");
});

test("formats admin time and file sizes", () => {
  assert.equal(formatAdminDuration(60_000), "01:00");
  assert.equal(formatAdminDuration(3_661_000), "01:01:01");
  assert.equal(formatAdminFileSize(2_480_000_000_000), "2.48 TB");
});

test("redacts configured secret labels", () => {
  assert.equal(redactConfiguredSecret(true), "已配置，已隐藏");
  assert.equal(redactConfiguredSecret(false), "未配置");
});

test("resolves hash routes", () => {
  assert.equal(routeFromHash("#/source-videos"), "source-videos");
  assert.equal(routeFromHash("#/unknown"), "dashboard");
});
