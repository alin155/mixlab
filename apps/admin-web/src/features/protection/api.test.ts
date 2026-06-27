import assert from "node:assert/strict";
import test from "node:test";
import { createFixtureAdminApiClient } from "../../api.ts";
import {
  loadProtectionCenterData,
  PROTECTION_CENTER_COMMAND_ENDPOINTS,
  PROTECTION_CENTER_ENDPOINTS,
  PROTECTION_CENTER_RECONCILE_CANCEL_ENDPOINT,
  PROTECTION_CENTER_RECONCILE_START_ENDPOINT,
  PROTECTION_CENTER_OVERVIEW_ENDPOINT,
  PROTECTION_CENTER_RECONCILE_STATUS_ENDPOINT,
  PROTECTION_CENTER_ROUTE,
  protectionCenterPlanEndpoints,
  protectionCenterPlanMatchesRouteEndpoints
} from "./api.ts";

test("protection center feature loader stays read-only and route-owned", async () => {
  const overview = await createFixtureAdminApiClient().getOperationsOverview();
  const readModelReconcileStatus = await createFixtureAdminApiClient().getReadModelReconcileStatus();
  const calls: string[] = [];
  const data = await loadProtectionCenterData({
    getOperationsOverview: async () => {
      calls.push(PROTECTION_CENTER_OVERVIEW_ENDPOINT);
      return overview;
    },
    getReadModelReconcileStatus: async () => {
      calls.push(PROTECTION_CENTER_RECONCILE_STATUS_ENDPOINT);
      return readModelReconcileStatus;
    }
  });

  assert.deepEqual(calls.sort(), [...PROTECTION_CENTER_ENDPOINTS].sort());
  assert.equal(data.route, PROTECTION_CENTER_ROUTE);
  assert.equal(data.read_only, true);
  assert.deepEqual(data.endpoints, PROTECTION_CENTER_ENDPOINTS);
  assert.equal(data.overview.title, "管理端运行保护中心");
  assert.equal(data.read_model_reconcile_status?.progress.current_step, "preprocess-job-snapshots");
  assert.equal(data.read_model_reconcile_error, "");
  assert.deepEqual(PROTECTION_CENTER_COMMAND_ENDPOINTS, [
    PROTECTION_CENTER_RECONCILE_START_ENDPOINT,
    PROTECTION_CENTER_RECONCILE_CANCEL_ENDPOINT
  ]);
  const readEndpoints: readonly string[] = data.endpoints;
  assert.equal(readEndpoints.includes(PROTECTION_CENTER_RECONCILE_START_ENDPOINT), false);
  assert.equal(readEndpoints.includes(PROTECTION_CENTER_RECONCILE_CANCEL_ENDPOINT), false);
});

test("protection center keeps overview when reconcile status is unavailable", async () => {
  const overview = await createFixtureAdminApiClient().getOperationsOverview();
  const data = await loadProtectionCenterData({
    getOperationsOverview: async () => overview,
    getReadModelReconcileStatus: async () => {
      throw new Error("状态端点暂不可用");
    }
  });

  assert.equal(data.overview.title, "管理端运行保护中心");
  assert.equal(data.read_model_reconcile_status, null);
  assert.equal(data.read_model_reconcile_error, "状态端点暂不可用");
});

test("protection center feature contract matches the data loading plan", async () => {
  const plan = await createFixtureAdminApiClient().getDataLoadingPlan();

  assert.deepEqual(protectionCenterPlanEndpoints(plan), PROTECTION_CENTER_ENDPOINTS);
  assert.equal(protectionCenterPlanMatchesRouteEndpoints(plan), true);
});
