import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminApiFixtureFallbackClassificationReport,
  toMarkdown
} from "./admin-api-fixture-fallback-classification.ts";

test("admin API fixture/fallback classification separates fixture, route fallback, runtime fallback, and usage fields", () => {
  const report = buildAdminApiFixtureFallbackClassificationReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    target_file: "apps/admin-web/src/api.ts",
    text: [
      "interface Usage { fallback_search_count: number; }",
      "const route = { fallback: \"Show route-local loading.\" };",
      "export function createFixtureAdminApiClient() { return fixtureStatus; }",
      "function timeout<T>(fallback: T) { return fallback; }"
    ].join("\n")
  });

  assert.equal(report.cleanup_allowed, false);
  assert.equal(report.classification_ready, true);
  assert.equal(report.summary.usage_metrics_field_count, 1);
  assert.equal(report.summary.route_loading_fallback_contract_count, 1);
  assert.equal(report.summary.fixture_client_boundary_count, 1);
  assert.equal(report.summary.runtime_fallback_contract_count, 1);
  assert.equal(report.gates.find((item) => item.id === "fixture-client-boundary-classified")?.status, "blocked");
  assert.equal(report.gates.find((item) => item.id === "fallback-contracts-preserved")?.status, "blocked");
});

test("admin API fixture/fallback classification keeps cleanup unauthorized without occurrences", () => {
  const report = buildAdminApiFixtureFallbackClassificationReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    target_file: "apps/admin-web/src/api.ts",
    text: "export const value = 1;\n"
  });

  assert.equal(report.summary.occurrence_count, 0);
  assert.equal(report.result.status, "classified");
  assert.equal(report.cleanup_allowed, false);
});

test("admin API fixture/fallback classification markdown records evidence-only scope", () => {
  const report = buildAdminApiFixtureFallbackClassificationReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    target_file: "apps/admin-web/src/api.ts",
    text: "const route = { fallback: \"Show route-local loading.\" };\n"
  });
  const markdown = toMarkdown(report);

  assert.match(markdown, /evidence-only/);
  assert.match(markdown, /does not delete, move, rewrite, or refactor Admin Web API code/);
  assert.match(markdown, /Cleanup allowed: no/);
});
