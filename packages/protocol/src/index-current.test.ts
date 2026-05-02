import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveIndexCurrentPointerPath,
  validateIndexCurrentPointer,
  type IndexCurrentPointer
} from "./index.ts";

test("validates current index pointer against published versions", () => {
  const pointer: IndexCurrentPointer = {
    library_id: "lib_main_001",
    current_version: "v000027",
    updated_at: "2026-05-01T00:00:00Z"
  };

  assert.deepEqual(validateIndexCurrentPointer(pointer, ["v000026", "v000027"]), {
    ok: true,
    errors: []
  });
});

test("rejects current index pointers that reference unavailable versions", () => {
  const pointer: IndexCurrentPointer = {
    library_id: "lib_main_001",
    current_version: "v000028",
    updated_at: "2026-05-01T00:00:00Z"
  };

  assert.deepEqual(validateIndexCurrentPointer(pointer, ["v000026", "v000027"]), {
    ok: false,
    errors: ["current_version does not reference a published index package"]
  });
});

test("resolves current index pointer path on macOS and Windows", () => {
  assert.equal(
    resolveIndexCurrentPointerPath({
      mount_root: "/Volumes/MixLab-NAS-Simulated"
    }),
    "/Volumes/MixLab-NAS-Simulated/.mixlab-library/indexes/source-transcript-index/current.json"
  );

  assert.equal(
    resolveIndexCurrentPointerPath({
      mount_root: "Z:\\"
    }),
    "Z:\\.mixlab-library\\indexes\\source-transcript-index\\current.json"
  );
});
