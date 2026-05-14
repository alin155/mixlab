import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAdminWorkerCycle,
  parseWorkerPollIntervalSeconds,
  resolveNpmExecutable,
} from "./docker-worker.ts";

describe("docker worker config", () => {
  it("uses a 60 second default poll interval", () => {
    assert.equal(parseWorkerPollIntervalSeconds({}), 60);
  });

  it("parses a configured positive poll interval", () => {
    assert.equal(parseWorkerPollIntervalSeconds({ MIXLAB_WORKER_POLL_INTERVAL_SECONDS: "15" }), 15);
  });

  it("rejects invalid poll intervals", () => {
    assert.throws(
      () => parseWorkerPollIntervalSeconds({ MIXLAB_WORKER_POLL_INTERVAL_SECONDS: "0" }),
      /positive integer/,
    );
    assert.throws(
      () => parseWorkerPollIntervalSeconds({ MIXLAB_WORKER_POLL_INTERVAL_SECONDS: "abc" }),
      /positive integer/,
    );
  });

  it("resolves the npm command for Windows and Unix platforms", () => {
    assert.equal(resolveNpmExecutable("win32"), "npm.cmd");
    assert.equal(resolveNpmExecutable("linux"), "npm");
    assert.equal(resolveNpmExecutable("darwin"), "npm");
  });

  it("builds disabled commands by default", () => {
    assert.deepEqual(
      buildAdminWorkerCycle({}).map((command) => [command.name, command.enabled]),
      [
        ["preprocess-library", false],
        ["publish-ready", false],
      ],
    );
  });

  it("enables configured worker commands", () => {
    assert.deepEqual(
      buildAdminWorkerCycle({
        MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER: "1",
        MIXLAB_ENABLE_READY_PUBLISH_WORKER: "1",
      }).map((command) => [command.name, command.enabled]),
      [
        ["preprocess-library", true],
        ["publish-ready", true],
      ],
    );
  });
});
