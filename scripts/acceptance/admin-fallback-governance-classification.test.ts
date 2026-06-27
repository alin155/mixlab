import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAdminFallbackGovernanceClassificationReport,
  classifyFallbackHotspot,
  renderMarkdown
} from "./admin-fallback-governance-classification.ts";

function reportFixture() {
  return buildAdminFallbackGovernanceClassificationReport({
    generated_at: "2026-06-27T00:00:00.000Z",
    command: "tsx scripts/acceptance/admin-fallback-governance-classification.ts",
    scan_roots: ["apps/admin-web/src", "packages/admin-api/src", "packages/library-fs/src"],
    files: [
      {
        path: "apps/admin-web/src/fixtures/admin-fixture-data.ts",
        text: "export const fixtureData = { fallback: true };"
      },
      {
        path: "packages/admin-api/src/admin-data-loading-plan.ts",
        text: "const fallback = 'route timeout tolerance';"
      },
      {
        path: "packages/admin-api/src/admin-source-video-status-page-query.ts",
        text: "export const reason = 'fallback reason from status-store';"
      },
      {
        path: "apps/admin-web/src/features/source-videos/SourceVideosPage.tsx",
        text: "const label = 'fallback reason visible to operators';"
      },
      {
        path: "packages/admin-api/src/admin-old-route.ts",
        text: "const routeMode = 'legacy compatibility alias';"
      },
      {
        path: "packages/admin-api/src/admin-unused-debug.ts",
        text: "const mockResult = true; // TODO deprecated"
      },
      {
        path: "packages/admin-api/src/admin-source-video-list-query.test.ts",
        text: "test('fallback query fixture', () => {});"
      }
    ]
  });
}

test("fallback governance classification assigns conservative categories", () => {
  assert.equal(
    classifyFallbackHotspot({
      path: "packages/admin-api/src/admin-source-video-list-query.test.ts",
      count: 1,
      terms: ["fallback"],
      term_counts: [{ term: "fallback", count: 1 }]
    }),
    "test-fixture"
  );
  assert.equal(
    classifyFallbackHotspot({
      path: "apps/admin-web/src/fixtures/admin-fixture-data.ts",
      count: 1,
      terms: ["fixture"],
      term_counts: [{ term: "fixture", count: 1 }]
    }),
    "fixture-runtime-boundary"
  );
  assert.equal(
    classifyFallbackHotspot({
      path: "packages/admin-api/src/admin-data-loading-plan.ts",
      count: 1,
      terms: ["fallback"],
      term_counts: [{ term: "fallback", count: 1 }]
    }),
    "safe-fallback"
  );
  assert.equal(
    classifyFallbackHotspot({
      path: "packages/admin-api/src/admin-source-video-status-page-query.ts",
      count: 1,
      terms: ["fallback"],
      term_counts: [{ term: "fallback", count: 1 }]
    }),
    "safe-fallback"
  );
  assert.equal(
    classifyFallbackHotspot({
      path: "apps/admin-web/src/features/source-videos/SourceVideosPage.tsx",
      count: 1,
      terms: ["fallback"],
      term_counts: [{ term: "fallback", count: 1 }]
    }),
    "safe-fallback"
  );
  assert.equal(
    classifyFallbackHotspot({
      path: "packages/admin-api/src/admin-old-route.ts",
      count: 1,
      terms: ["legacy"],
      term_counts: [{ term: "legacy", count: 1 }]
    }),
    "legacy-compatibility"
  );
  assert.equal(
    classifyFallbackHotspot({
      path: "packages/admin-api/src/admin-unused-debug.ts",
      count: 1,
      terms: ["mock"],
      term_counts: [{ term: "mock", count: 1 }]
    }),
    "removable-candidate"
  );
});

test("fallback governance report keeps broad cleanup blocked", () => {
  const report = reportFixture();

  assert.equal(report.classification_ready, true);
  assert.equal(report.cleanup_allowed, false);
  assert.equal(report.summary.hotspot_count, 7);
  assert.equal(report.summary.classification_counts["test-fixture"], 1);
  assert.equal(report.summary.classification_counts["fixture-runtime-boundary"], 1);
  assert.equal(report.summary.classification_counts["safe-fallback"], 3);
  assert.equal(report.summary.classification_counts["legacy-compatibility"], 1);
  assert.equal(report.summary.classification_counts["removable-candidate"], 1);
  assert.equal(report.gates.find((gate) => gate.id === "all-term-hotspots-classified")?.status, "pass");
  assert.equal(report.gates.find((gate) => gate.id === "broad-cleanup-still-blocked")?.status, "blocked");
});

test("fallback governance markdown includes classifications and required evidence", () => {
  const markdown = renderMarkdown(reportFixture());

  assert.match(markdown, /Admin Fallback Governance Classification/);
  assert.match(markdown, /fixture-runtime-boundary/);
  assert.match(markdown, /safe-fallback/);
  assert.match(markdown, /removable-candidate/);
  assert.match(markdown, /line-level owner review/);
  assert.match(markdown, /Cleanup allowed: no/);
});
