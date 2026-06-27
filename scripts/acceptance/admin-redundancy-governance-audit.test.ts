import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminRedundancyGovernanceAuditReport,
  toMarkdown
} from "./admin-redundancy-governance-audit.ts";

test("admin redundancy governance audit stays blocked when cleanup candidates exist", () => {
  const report = buildAdminRedundancyGovernanceAuditReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    scan_roots: ["fixture"],
    large_file_line_threshold: 3,
    files: [
      {
        path: "fixture/styles.css",
        text: ".panel { color: red; }\n.card, .panel { color: blue; }\n"
      },
      {
        path: "fixture/AdminApp.tsx",
        text: "const fallback = true;\nconst fixture = true;\nconst legacy = true;\nconst mock = true;\n"
      }
    ]
  });

  assert.equal(report.cleanup_ready, false);
  assert.equal(report.cleanup_allowed, false);
  assert.ok(report.summary.cleanup_blockers.includes("css-duplicate-selectors-reviewed"));
  assert.ok(report.summary.cleanup_blockers.includes("large-admin-files-reviewed"));
  assert.ok(report.summary.cleanup_blockers.includes("fixture-fallback-legacy-hotspots-reviewed"));
  assert.equal(report.observations.duplicate_selectors[0]?.selector, ".panel");
});

test("admin redundancy governance audit can become ready for targeted cleanup when no hotspots exist", () => {
  const report = buildAdminRedundancyGovernanceAuditReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    scan_roots: ["fixture"],
    large_file_line_threshold: 10,
    files: [
      {
        path: "fixture/styles.css",
        text: ".panel { color: red; }\n.card { color: blue; }\n"
      },
      {
        path: "fixture/Small.ts",
        text: "export const value = 1;\n"
      }
    ]
  });

  assert.equal(report.cleanup_ready, true);
  assert.equal(report.cleanup_allowed, false);
  assert.deepEqual(report.summary.cleanup_blockers, []);
});

test("admin redundancy governance audit markdown records evidence-only scope", () => {
  const report = buildAdminRedundancyGovernanceAuditReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    scan_roots: ["fixture"],
    files: []
  });
  const markdown = toMarkdown(report);

  assert.match(markdown, /evidence-only/);
  assert.match(markdown, /does not delete, move, rewrite, or refactor/);
  assert.match(markdown, /Cleanup allowed: no/);
});
