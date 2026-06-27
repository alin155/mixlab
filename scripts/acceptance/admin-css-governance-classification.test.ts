import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminCssGovernanceClassificationReport,
  toMarkdown
} from "./admin-css-governance-classification.ts";

test("admin CSS governance classification separates reference overlap from same-file duplicates", () => {
  const report = buildAdminCssGovernanceClassificationReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    sources: [
      {
        path: "apps/admin-web/src/styles.css",
        text: ".panel { color: red; }\n.panel { color: blue; }\n.button { color: black; }\n"
      },
      {
        path: "apps/admin-web/src/admin-reference.css",
        text: ".button { color: white; }\n"
      }
    ]
  });

  assert.equal(report.cleanup_allowed, false);
  assert.equal(report.classification_ready, true);
  assert.equal(report.summary.same_file_legacy_duplicate_count, 1);
  assert.equal(report.summary.reference_layer_overlap_count, 1);
  assert.equal(report.classified_duplicates.find((item) => item.selector === ".panel")?.kind, "same-file-legacy-duplicate");
  assert.equal(report.classified_duplicates.find((item) => item.selector === ".button")?.kind, "reference-layer-overlap");
  assert.equal(report.gates.find((item) => item.id === "same-file-legacy-duplicates-reviewed")?.status, "blocked");
});

test("admin CSS governance classification keeps cleanup unauthorized even without duplicates", () => {
  const report = buildAdminCssGovernanceClassificationReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    sources: [
      {
        path: "apps/admin-web/src/styles.css",
        text: ".panel { color: red; }\n"
      },
      {
        path: "apps/admin-web/src/admin-reference.css",
        text: ".button { color: white; }\n"
      }
    ]
  });

  assert.equal(report.summary.duplicate_selector_count, 0);
  assert.equal(report.cleanup_allowed, false);
  assert.equal(report.result.status, "blocked");
});

test("admin CSS governance classification markdown records evidence-only scope", () => {
  const report = buildAdminCssGovernanceClassificationReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    sources: []
  });
  const markdown = toMarkdown(report);

  assert.match(markdown, /evidence-only/);
  assert.match(markdown, /does not delete, move, rewrite, or refactor CSS/);
  assert.match(markdown, /Cleanup allowed: no/);
});
