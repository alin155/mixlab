import { resolveRunnerConfig } from "./config.ts";
import { createWindowsTestRunnerServer } from "./server.ts";
import { parseStartupRunRequest, startStartupRun } from "./startup-run.ts";

export { resolveRunnerConfig, RUNNER_VERSION } from "./config.ts";
export { createWindowsTestRunnerServer } from "./server.ts";
export { RunStore } from "./run-store.ts";
export type {
  ApiProbeResult,
  FailureCategory,
  LaunchRunnerReport,
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

export function startWindowsTestRunner(options: {
  startupRunJson?: string;
} = {}): ReturnType<typeof createWindowsTestRunnerServer> {
  const config = resolveRunnerConfig();
  const runner = createWindowsTestRunnerServer(config);
  runner.server.on("error", (error) => {
    console.error("MixLab Windows Test Runner failed to start.");
    console.error(error);
    process.exitCode = 1;
  });
  runner.server.listen(config.port, config.host, () => {
    console.log("MixLab Windows Test Runner started.");
    console.log(JSON.stringify({
      url: `http://${config.host}:${config.port}`,
      runner_version: config.runner_version,
      share_root: config.share_root,
      reports_root: config.reports_root,
      cutter_api_base_url: config.cutter_api_base_url
    }, null, 2));
    const startupRunJson = options.startupRunJson ?? process.env.MIXLAB_WINDOWS_TEST_RUNNER_START_RUN_JSON;
    try {
      const startupRun = parseStartupRunRequest(startupRunJson);
      if (startupRun) {
        const record = startStartupRun({
          config,
          store: runner.store,
          request: startupRun
        });
        console.log("MixLab Windows Test Runner startup run accepted.");
        console.log(JSON.stringify({
          run_id: record.run_id,
          suite: record.suite,
          report_path: record.report_dir
        }, null, 2));
      }
    } catch (error) {
      console.error("MixLab Windows Test Runner ignored invalid startup run request.");
      console.error(error);
    }
  });
  return runner;
}
