import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminProtectionReadRouteDeps,
  createAdminProtectionReadRouteServerDeps
} from "./admin-protection-read-route-deps.ts";

interface TestApiInput {
  library_root: string;
  request_id: string;
}

test("protection read route deps preserve protection, release, and path-check inputs", async () => {
  const calls: Array<{ name: string; input: unknown }> = [];
  const deps = createAdminProtectionReadRouteDeps<
    TestApiInput,
    { mode: string; request_id: string },
    { release_allowed: boolean; root: string },
    Array<{ label: string; path: string; status: string }>
  >({
    async read_protection_status(input) {
      calls.push({ name: "protection", input });
      return {
        mode: "preprocess-protection-v1",
        request_id: input.request_id
      };
    },
    async read_release_gates(input) {
      calls.push({ name: "release-gates", input });
      return {
        release_allowed: true,
        root: input.library_root
      };
    },
    async read_path_checks(libraryRoot) {
      calls.push({ name: "path-checks", input: libraryRoot });
      return [{
        label: "公共素材库",
        path: libraryRoot,
        status: "pass"
      }];
    }
  });

  const apiInput = {
    library_root: "/tmp/PublicLibrary",
    request_id: "req-1"
  };

  const protection = await deps.read_protection_status(apiInput);
  const releaseGates = await deps.read_release_gates(apiInput);
  const pathChecks = await deps.read_path_checks(apiInput);

  assert.deepEqual(protection, {
    mode: "preprocess-protection-v1",
    request_id: "req-1"
  });
  assert.deepEqual(releaseGates, {
    release_allowed: true,
    root: "/tmp/PublicLibrary"
  });
  assert.deepEqual(pathChecks, [{
    label: "公共素材库",
    path: "/tmp/PublicLibrary",
    status: "pass"
  }]);
  assert.deepEqual(calls, [
    {
      name: "protection",
      input: apiInput
    },
    {
      name: "release-gates",
      input: apiInput
    },
    {
      name: "path-checks",
      input: "/tmp/PublicLibrary"
    }
  ]);
});

test("protection read route server deps wire protection, release, and path-check services", async () => {
  const calls: Array<{ name: string; input: unknown }> = [];
  const deps = createAdminProtectionReadRouteServerDeps<
    TestApiInput,
    { mode: string; request_id: string },
    { release_allowed: boolean; root: string },
    Array<{ label: string; path: string; status: string }>
  >({
    async read_protection_status_service(input) {
      calls.push({ name: "protection", input });
      return {
        mode: "preprocess-protection-v1",
        request_id: input.request_id
      };
    },
    async read_release_gates_service(input) {
      calls.push({ name: "release-gates", input });
      return {
        release_allowed: false,
        root: input.library_root
      };
    },
    async read_path_checks_service(libraryRoot) {
      calls.push({ name: "path-checks", input: libraryRoot });
      return [{
        label: "公共素材库",
        path: libraryRoot,
        status: "blocked"
      }];
    }
  });

  const apiInput = {
    library_root: "/tmp/PublicLibrary",
    request_id: "req-2"
  };

  const protection = await deps.read_protection_status(apiInput);
  const releaseGates = await deps.read_release_gates(apiInput);
  const pathChecks = await deps.read_path_checks(apiInput);

  assert.deepEqual(protection, {
    mode: "preprocess-protection-v1",
    request_id: "req-2"
  });
  assert.deepEqual(releaseGates, {
    release_allowed: false,
    root: "/tmp/PublicLibrary"
  });
  assert.deepEqual(pathChecks, [{
    label: "公共素材库",
    path: "/tmp/PublicLibrary",
    status: "blocked"
  }]);
  assert.deepEqual(calls, [
    {
      name: "protection",
      input: apiInput
    },
    {
      name: "release-gates",
      input: apiInput
    },
    {
      name: "path-checks",
      input: "/tmp/PublicLibrary"
    }
  ]);
});
