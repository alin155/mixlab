import assert from "node:assert/strict";
import test from "node:test";
import {
  handleAdminProtectionReadRoutes,
  matchAdminLibraryPathChecksPath,
  matchAdminProtectionStatusPath,
  matchAdminReleaseGatesPath,
  type AdminProtectionReadRouteApiInput,
  type AdminProtectionReadRouteDeps
} from "./admin-protection-read-routes.ts";

interface TestApiInput extends AdminProtectionReadRouteApiInput {
  library_id: string;
}

type TestDeps = AdminProtectionReadRouteDeps<
  TestApiInput,
  { mode: string; root: string },
  { release_allowed: boolean; root: string },
  Array<{ label: string; path: string; status: string }>
>;

function makeDeps(overrides: Partial<TestDeps> = {}): TestDeps {
  return {
    read_protection_status: async (input) => ({
      mode: "preprocess-protection-v1",
      root: `${input.library_id}:${input.library_root}`
    }),
    read_release_gates: async (input) => ({
      release_allowed: true,
      root: `${input.library_id}:${input.library_root}`
    }),
    read_path_checks: async (input) => [
      {
        label: "公共素材库",
        path: input.library_root,
        status: input.library_id
      }
    ],
    ...overrides
  };
}

function callRoute(input: {
  method?: string;
  pathname: string;
  deps?: TestDeps;
}) {
  return handleAdminProtectionReadRoutes({
    method: input.method ?? "GET",
    pathname: input.pathname,
    api_input: {
      library_root: "/tmp/PublicLibrary",
      library_id: "lib_test"
    },
    deps: input.deps ?? makeDeps()
  });
}

test("protection read route matchers identify only exact endpoints", () => {
  assert.equal(matchAdminProtectionStatusPath("/api/admin/protection/status"), true);
  assert.equal(matchAdminReleaseGatesPath("/api/admin/release-gates"), true);
  assert.equal(matchAdminLibraryPathChecksPath("/api/admin/library/path-checks"), true);

  assert.equal(matchAdminProtectionStatusPath("/api/admin/protection/status/extra"), false);
  assert.equal(matchAdminReleaseGatesPath("/api/admin/release-gates/extra"), false);
  assert.equal(matchAdminLibraryPathChecksPath("/api/admin/library/status"), false);
});

test("protection status route dispatches with full API input", async () => {
  const result = await callRoute({
    pathname: "/api/admin/protection/status"
  });

  assert.equal(result.handled, true);
  if (result.handled) {
    assert.deepEqual(result.body, {
      ok: true,
      data: {
        mode: "preprocess-protection-v1",
        root: "lib_test:/tmp/PublicLibrary"
      }
    });
  }
});

test("release gates route dispatches with full API input", async () => {
  const result = await callRoute({
    pathname: "/api/admin/release-gates"
  });

  assert.equal(result.handled, true);
  if (result.handled) {
    assert.equal(result.status_code, 200);
    assert.deepEqual(result.body, {
      ok: true,
      data: {
        release_allowed: true,
        root: "lib_test:/tmp/PublicLibrary"
      }
    });
  }
});

test("path checks route dispatches with full API input", async () => {
  const events: string[] = [];
  const result = await callRoute({
    pathname: "/api/admin/library/path-checks",
    deps: makeDeps({
      read_path_checks: async (input) => {
        events.push(`${input.library_id}:${input.library_root}`);
        return [{
          label: "source-folder",
          path: input.library_root,
          status: "pass"
        }];
      }
    })
  });

  assert.equal(result.handled, true);
  assert.deepEqual(events, ["lib_test:/tmp/PublicLibrary"]);
  if (result.handled) {
    assert.deepEqual(result.body, {
      ok: true,
      data: [{
        label: "source-folder",
        path: "/tmp/PublicLibrary",
        status: "pass"
      }]
    });
  }
});

test("protection read routes ignore unrelated routes and non-get methods", async () => {
  assert.deepEqual(await callRoute({
    method: "POST",
    pathname: "/api/admin/protection/status"
  }), {
    handled: false
  });
  assert.deepEqual(await callRoute({
    method: "GET",
    pathname: "/api/admin/operations/overview"
  }), {
    handled: false
  });
  assert.deepEqual(await callRoute({
    method: "PATCH",
    pathname: "/api/admin/library/path-checks"
  }), {
    handled: false
  });
});
