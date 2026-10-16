const fs = require('fs');
const path = require('path');
const cp = require('child_process');

// The installed Runner launches an executable without forwarding app_args.
// Keep the script path and arguments inside this disposable acceptance launcher.
const root = process.pkg ? path.dirname(process.execPath) : __dirname;
const powershell = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
const report = { started_at: new Date().toISOString(), scope: 'candidate test transport only', scripts: [] };
try {
  for (const script of ['diagnose-probe.ps1', 'install-and-probe.ps1']) {
    const result = cp.spawnSync(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, script)], {
      windowsHide: true, encoding: 'utf8', timeout: 240000
    });
    fs.writeFileSync(path.join(root, script + '.stdout.log'), result.stdout || '');
    fs.writeFileSync(path.join(root, script + '.stderr.log'), result.stderr || '');
    report.scripts.push({ script, exit_code: result.status, error: result.error?.message });
    if (result.status !== 0) throw new Error(script + ' failed; inspect stderr log');
  }
  report.status = 'completed';
} catch (error) {
  report.status = 'failed';
  report.error = String(error);
} finally {
  report.finished_at = new Date().toISOString();
  fs.writeFileSync(path.join(root, 'launcher-result.json'), JSON.stringify(report, null, 2));
}
