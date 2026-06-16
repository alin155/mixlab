import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const agentScript = readFileSync("scripts/desktop/windows-shared-test-agent.ps1", "utf8");
const watchdogScript = readFileSync("scripts/desktop/windows-shared-agent-watchdog.ps1", "utf8");
const startCommand = readFileSync("scripts/desktop/start-windows-shared-test-agent.cmd", "utf8");
const commandTemplate = readFileSync("scripts/desktop/windows-shared-command.template.json", "utf8");
const issuerScript = readFileSync("scripts/desktop/issue-windows-shared-command.ts", "utf8");
const docs = readFileSync("docs/desktop/windows-shared-test-agent.md", "utf8");

test("Windows shared test agent exposes the shared-folder command contract", () => {
  assert.match(agentScript, /\[Parameter\(Mandatory = \$true\)\]\s*\[string\]\$ShareRoot/);
  assert.match(agentScript, /control", "cutter-command\.json"/);
  assert.match(agentScript, /control", "commands"/);
  assert.match(agentScript, /Get-PreferredCommandPath/);
  assert.match(agentScript, /results", "runs"/);
  assert.match(agentScript, /agent-status\.json/);
  assert.match(agentScript, /windows-shared-test-agent\.ndjson/);
});

test("Windows shared agent is supervised by a stable watchdog", () => {
  assert.match(watchdogScript, /agent-watchdog-status\.json/);
  assert.match(watchdogScript, /windows-shared-agent-watchdog\.ndjson/);
  assert.match(watchdogScript, /windows-shared-test-agent\.ps1/);
  assert.match(watchdogScript, /while \(\$true\)/);
  assert.match(watchdogScript, /MIXLAB_AGENT_WATCHDOG/);
  assert.match(watchdogScript, /StaleHeartbeatSeconds/);
  assert.match(watchdogScript, /WatchdogVersion = "0\.1\.7"/);
  assert.match(watchdogScript, /GetLastWriteTimeUtc/);
  assert.match(watchdogScript, /Get-FileStamp/);
  assert.match(watchdogScript, /agent_script_changed/);
  assert.match(watchdogScript, /checkpoint_is_diagnostic/);
  assert.match(watchdogScript, /Get-AgentHeartbeatSnapshot/);
  assert.match(watchdogScript, /Get-AgentLivenessSnapshot/);
  assert.match(watchdogScript, /agent-checkpoint\.json/);
  assert.match(watchdogScript, /Stop-AgentProcess/);
  assert.match(watchdogScript, /Stop-ExistingSharedAgentProcesses/);
  assert.match(agentScript, /MIXLAB_AGENT_WATCHDOG/);
  assert.match(agentScript, /AgentVersion = "0\.3\.6"/);
  assert.match(agentScript, /Read-TextFile/);
  assert.match(agentScript, /FileShare\]::ReadWrite/);
  assert.match(agentScript, /smoke_wait_health/);
  assert.match(agentScript, /api_health_probe/);
  assert.match(agentScript, /Get-LocalFixedDriveRoots/);
  assert.match(agentScript, /Test-NetworkDrivePath/);
  assert.match(agentScript, /Get-MixLabCutterAppProcesses/);
  assert.match(agentScript, /app_process_lookup_start/);
  assert.match(agentScript, /cutter-agent-app\.json/);
  assert.match(agentScript, /Get-CachedAppExePath/);
  assert.match(agentScript, /Write-CachedAppExePath/);
  assert.match(agentScript, /previous_watchdog_pid/);
  assert.match(agentScript, /mixlab-cutter-desktop/);
  assert.match(agentScript, /reused_existing/);
  assert.doesNotMatch(agentScript, /应用\\MixLab Cutter/);
  assert.match(agentScript, /poll_no_command\" -Details \$commandSnapshot/);
  assert.match(agentScript, /poll_command_snapshot_start/);
  assert.match(agentScript, /poll_command_read\" -Details/);
  assert.match(startCommand, /windows-shared-agent-watchdog\.ps1/);
  assert.match(startCommand, /-StopExistingProcesses/);
});

test("Windows shared test agent only exposes whitelisted actions", () => {
  for (const action of [
    "ping",
    "collect_logs",
    "probe_api",
    "start_test_runner",
    "capture_screenshot",
    "stop_app",
    "launch_app",
    "install_latest",
    "install_latest_and_smoke",
    "smoke_test",
    "restart_agent",
    "restart_watchdog"
  ]) {
    assert.match(agentScript, new RegExp(`"${action}"`));
    assert.match(docs, new RegExp(`\`${action}\``));
  }

  assert.doesNotMatch(agentScript, /Invoke-Expression|iex|Start-Job/);
  assert.match(agentScript, /Unsupported action/);
  assert.match(agentScript, /Resolve-LatestWindowsTestRunner/);
  assert.match(agentScript, /runner", "latest\.json"/);
  assert.match(agentScript, /Copy-RunnerToLocalCache/);
  assert.match(agentScript, /runner_copy_to_local_cache/);
  assert.match(agentScript, /Runner SHA-256 mismatch/);
  assert.match(agentScript, /Wait-WindowsTestRunnerHealth/);
  assert.match(agentScript, /MIXLAB_WINDOWS_TEST_RUNNER_SHARE_ROOT/);
  assert.match(agentScript, /MIXLAB_WINDOWS_TEST_RUNNER_PORT/);
});

test("Windows shared test agent supports current and future release manifests", () => {
  assert.match(agentScript, /releases", "latest\.json"/);
  assert.match(agentScript, /LATEST\.txt/);
  assert.match(agentScript, /Get-Sha256WithHeartbeat/);
  assert.match(agentScript, /Copy-FileWithHeartbeat/);
  assert.match(agentScript, /Copy-InstallerToLocalCache/);
  assert.match(agentScript, /Unblock-File -LiteralPath \$localInstallerPath/);
  assert.match(agentScript, /Wait-ProcessWithHeartbeat/);
  assert.match(agentScript, /Start-Process -FilePath \$localInstallerPath -ArgumentList \$silentArgs -PassThru/);
});

test("Windows shared command template is a valid smoke-test command", () => {
  const parsed = JSON.parse(commandTemplate) as {
    schema_version: string;
    command_id: string;
    action: string;
  };

  assert.equal(parsed.schema_version, "1.0");
  assert.ok(parsed.command_id);
  assert.equal(parsed.action, "smoke_test");
});

test("Mac-side command issuer writes the same control file contract", () => {
  assert.match(issuerScript, /DEFAULT_SHARE_ROOT = "\/Users\/huaqihang\/Public\/MixLabWindowsBuilds"/);
  assert.match(issuerScript, /control/);
  assert.match(issuerScript, /queue_command_path/);
  assert.match(issuerScript, /commands/);
  assert.match(issuerScript, /cutter-command\.json/);
  assert.match(issuerScript, /install_latest_and_smoke/);
  assert.match(issuerScript, /start_test_runner/);
  assert.match(issuerScript, /restart_watchdog/);
  assert.match(issuerScript, /--payload-json/);
});
