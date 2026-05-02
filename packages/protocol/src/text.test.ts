import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTranscriptText } from "./index.ts";

test("normalizes transcript text without changing Chinese characters or numbers", () => {
  assert.equal(
    normalizeTranscriptText("现金流，是企业的血液。  EBITDA 2026！"),
    "现金流是企业的血液ebitda2026"
  );
});

test("normalization removes extra whitespace and common punctuation", () => {
  assert.equal(
    normalizeTranscriptText("  组织、人才；战略：增长？ yes / no  "),
    "组织人才战略增长yesno"
  );
});
