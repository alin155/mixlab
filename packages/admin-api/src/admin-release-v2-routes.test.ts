import assert from "node:assert/strict";
import test from "node:test";
import {
  CutterReleaseBundleCorruptError,
  type CutterReleaseManifestV2Summary,
  type CutterReleaseV2VerifyResult
} from "../../library-fs/src/cutter-release.ts";
import {
  createAdminReleaseV2RouteDeps,
  handleAdminReleaseV2Routes,
  matchAdminReleaseCurrentPath,
  matchAdminReleaseVerifyPath,
  type AdminReleaseV2RouteDeps
} from "./admin-release-v2-routes.ts";

function summary(overrides: Partial<CutterReleaseManifestV2Summary> = {}): CutterReleaseManifestV2Summary {
  return {
    schema_version: "2.0",
    manifest_available: true,
    legacy_release: false,
    release_version: "v000001",
    release_id: "rel_20261027T020000Z_0123456789ab",
    library_id: "lib_main_001",
    index_version: "v000001",
    ready_video_count: 12,
    file_count: 6,
    total_size_bytes: 8_192,
    created_at: "2026-10-27T02:00:00.000Z",
    min_client_version: "0.1.0",
    contract_version: "1.0.0",
    pointer_version: "v000001",
    pointer_consistent: true,
    manifest_path: ".mixlab-library/releases/v000001/release-manifest-v2.json",
    ...overrides
  };
}

function verifyResult(overrides: Partial<CutterReleaseV2VerifyResult> = {}): CutterReleaseV2VerifyResult {
  return {
    ok: true,
    found: true,
    manifest_valid: true,
    release_id: "rel_20261027T020000Z_0123456789ab",
    release_version: "v000001",
    checked_file_count: 6,
    total_file_count: 6,
    truncated: false,
    failures: [],
    failures_truncated: false,
    duration_ms: 12,
    ...overrides
  };
}

function makeDeps(overrides: Partial<AdminReleaseV2RouteDeps> = {}): AdminReleaseV2RouteDeps {
  return {
    async read_current_release_summary() {
      return summary();
    },
    async verify_release() {
      return verifyResult();
    },
    ...overrides
  };
}

function callRoute(input: {
  method?: string;
  pathname: string;
  search?: string;
  deps?: AdminReleaseV2RouteDeps;
}) {
  return handleAdminReleaseV2Routes({
    method: input.method ?? "GET",
    pathname: input.pathname,
    search_params: new URLSearchParams(input.search ?? ""),
    api_input: { library_root: "/tmp/PublicLibrary" },
    deps: input.deps ?? makeDeps()
  });
}

test("release v2 route matchers accept only exact read-only paths", () => {
  assert.equal(matchAdminReleaseCurrentPath("/api/admin/releases/current"), true);
  assert.equal(matchAdminReleaseCurrentPath("/api/admin/releases/current/extra"), false);
  assert.equal(matchAdminReleaseVerifyPath("/api/admin/releases/rel_20261027T020000Z_0123456789ab/verify"),
    "rel_20261027T020000Z_0123456789ab");
  assert.equal(matchAdminReleaseVerifyPath("/api/admin/releases/v000001/verify"), "v000001");
  assert.equal(matchAdminReleaseVerifyPath("/api/admin/releases/../verify"), null);
  assert.equal(matchAdminReleaseVerifyPath("/api/admin/releases/v000001"), null);
});

test("release v2 current endpoint returns a manifest summary without absolute paths", async () => {
  const result = await callRoute({
    pathname: "/api/admin/releases/current"
  });

  assert.equal(result.handled, true);
  if (result.handled) {
    assert.equal(result.status_code, 200);
    assert.equal(result.body.ok, true);
    if (result.body.ok) {
      const data = result.body.data as CutterReleaseManifestV2Summary;
      assert.equal(data.release_id, "rel_20261027T020000Z_0123456789ab");
      assert.equal(data.index_version, "v000001");
      assert.equal(data.ready_video_count, 12);
      assert.equal(data.file_count, 6);
      assert.equal(data.min_client_version, "0.1.0");
      assert.equal(data.pointer_consistent, true);
      assert.equal(JSON.stringify(result.body).includes("/tmp/PublicLibrary"), false);
    }
  }
});

test("release v2 current endpoint reports missing current release and corrupt manifests", async () => {
  const missing = await callRoute({
    pathname: "/api/admin/releases/current",
    deps: makeDeps({
      async read_current_release_summary() {
        const error = new Error("ENOENT: no such file or directory");
        (error as NodeJS.ErrnoException).code = "ENOENT";
        throw error;
      }
    })
  });

  assert.equal(missing.handled, true);
  if (missing.handled) {
    assert.equal(missing.status_code, 404);
    assert.equal(missing.body.ok, false);
    if (missing.body.ok === false) {
      assert.equal(missing.body.error_code, "RELEASE_NOT_FOUND");
    }
  }

  const corrupt = await callRoute({
    pathname: "/api/admin/releases/current",
    deps: makeDeps({
      async read_current_release_summary() {
        throw new CutterReleaseBundleCorruptError("manifest v2 invalid at /secret/path");
      }
    })
  });

  assert.equal(corrupt.handled, true);
  if (corrupt.handled) {
    assert.equal(corrupt.status_code, 500);
    assert.equal(corrupt.body.ok, false);
    if (corrupt.body.ok === false) {
      assert.equal(corrupt.body.error_code, "RELEASE_BUNDLE_CORRUPT");
      assert.equal(JSON.stringify(corrupt.body).includes("/secret/path"), false);
    }
  }
});

test("release v2 verify endpoint returns verification reports and not-found errors", async () => {
  const verified = await callRoute({
    pathname: "/api/admin/releases/rel_20261027T020000Z_0123456789ab/verify",
    search: "max_files=100"
  });

  assert.equal(verified.handled, true);
  if (verified.handled) {
    assert.equal(verified.status_code, 200);
    assert.equal(verified.body.ok, true);
    if (verified.body.ok) {
      const data = verified.body.data as CutterReleaseV2VerifyResult;
      assert.equal(data.ok, true);
      assert.equal(data.checked_file_count, 6);
      assert.equal(data.total_file_count, 6);
    }
  }

  const failedVerification = await callRoute({
    pathname: "/api/admin/releases/v000001/verify",
    deps: makeDeps({
      async verify_release(input) {
        assert.deepEqual(input, {
          library_root: "/tmp/PublicLibrary",
          release_id_or_version: "v000001"
        });
        return verifyResult({
          ok: false,
          checked_file_count: 2,
          failures: [{
            path: "catalog.sqlite",
            reason: "sha256_mismatch",
            expected_sha256: "a".repeat(64),
            actual_sha256: "b".repeat(64)
          }]
        });
      }
    })
  });

  assert.equal(failedVerification.handled, true);
  if (failedVerification.handled) {
    assert.equal(failedVerification.status_code, 200);
    assert.equal(failedVerification.body.ok, true);
    if (failedVerification.body.ok) {
      const data = failedVerification.body.data as CutterReleaseV2VerifyResult;
      assert.equal(data.ok, false);
      assert.equal(data.failures[0]?.reason, "sha256_mismatch");
    }
  }

  const notFound = await callRoute({
    pathname: "/api/admin/releases/rel_missing/verify",
    deps: makeDeps({
      async verify_release() {
        return verifyResult({
          ok: false,
          found: false,
          manifest_valid: false,
          release_id: "",
          release_version: "",
          checked_file_count: 0,
          total_file_count: 0
        });
      }
    })
  });

  assert.equal(notFound.handled, true);
  if (notFound.handled) {
    assert.equal(notFound.status_code, 404);
    assert.equal(notFound.body.ok, false);
    if (notFound.body.ok === false) {
      assert.equal(notFound.body.error_code, "RELEASE_NOT_FOUND");
    }
  }
});

test("release v2 verify endpoint validates max_files and ignores unrelated routes", async () => {
  const invalid = await callRoute({
    pathname: "/api/admin/releases/v000001/verify",
    search: "max_files=0"
  });

  assert.equal(invalid.handled, true);
  if (invalid.handled) {
    assert.equal(invalid.status_code, 400);
    assert.equal(invalid.body.ok, false);
    if (invalid.body.ok === false) {
      assert.equal(invalid.body.error_code, "VALIDATION_FAILED");
    }
  }

  assert.deepEqual(await callRoute({ pathname: "/api/admin/releases" }), { handled: false });
  assert.deepEqual(await callRoute({ pathname: "/api/admin/releases/v000001" }), { handled: false });
  assert.deepEqual(
    await callRoute({ method: "POST", pathname: "/api/admin/releases/current" }),
    { handled: false }
  );
});

test("release v2 route deps default wiring resolves library-fs bundle services", () => {
  const deps = createAdminReleaseV2RouteDeps();
  assert.equal(typeof deps.read_current_release_summary, "function");
  assert.equal(typeof deps.verify_release, "function");
});
