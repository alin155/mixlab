import { resolveRunnerConfig } from "./config.ts";
import { createWindowsTestRunnerServer } from "./server.ts";

export { resolveRunnerConfig, RUNNER_VERSION } from "./config.ts";
export { createWindowsTestRunnerServer } from "./server.ts";
export { RunStore } from "./run-store.ts";
export type {
  ApiProbeResult,
  FailureCategory,
  ProbeApiReport,
  RunnerConfig,
  RunnerStatus,
  RunnerSuite,
  RunRecord,
  RunReport,
  RunRequest,
  RunSummary,
  TimelineEvent
} from "./types.ts";

export function startWindowsTestRunner(): ReturnType<typeof createWindowsTestRunnerServer> {
  const config = resolveRunnerConfig();
  const runner = createWindowsTestRunnerServer(config);
  runner.server.listen(config.port, config.host, () => {
    console.log("MixLab Windows Test Runner started.");
    console.log(JSON.stringify({
      url: `http://${config.host}:${config.port}`,
      runner_version: config.runner_version,
      share_root: config.share_root,
      reports_root: config.reports_root,
      cutter_api_base_url: config.cutter_api_base_url
    }, null, 2));
  });
  return runner;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startWindowsTestRunner();
}
