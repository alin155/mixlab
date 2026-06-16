# Windows 共享测试代理

这套机制用于让 Codex/macOS 通过共享文件夹控制 Windows 上的 MixLab Cutter 测试流程。共享文件夹只负责传递命令和回传结果，Windows 端由一个稳定 watchdog 常驻，再由 watchdog 拉起真正执行动作的 PowerShell 测试代理。

它解决的问题是：

- 我在 macOS/Codex 侧写入测试命令。
- Windows 端代理自动读取命令并执行白名单动作。
- Windows 端把测试结果、截图、日志、诊断信息写回共享文件夹。
- 后续可以自动安装最新版、启动剪辑端、跑冒烟测试、收集失败日志。
- 代理脚本退出后由 watchdog 自动重启，避免反复手动启动。
- 代理脚本卡住但没有退出时，watchdog 会根据心跳过期自动杀掉旧代理并拉起共享目录里的新代理。
- 重新双击新版启动脚本时，watchdog 会先清理旧的共享测试代理进程，避免两个版本同时运行。

## Windows 端怎么启动代理

### 推荐方式：从共享文件夹启动

推荐双击共享目录里的：

```text
start-windows-shared-test-agent.cmd
```

它会启动 `windows-shared-agent-watchdog.ps1`。这个 watchdog 会常驻窗口，负责启动和重启真正的测试代理。

也可以在 Windows PowerShell 执行下面命令。请把共享路径替换成你 Windows 上实际能访问的路径：

```powershell
powershell -ExecutionPolicy Bypass -File "\\192.168.1.21\MixLabWindowsBuilds\windows-shared-agent-watchdog.ps1" `
  -ShareRoot "\\192.168.1.21\MixLabWindowsBuilds"
```

启动后这个窗口不要关闭。watchdog 会持续拉起代理，代理每 5 秒检查一次：

```text
control/commands/<command_id>.json
```

`control/cutter-command.json` 仍会写入一份兼容文件，但新版代理优先读取 `control/commands/` 下的唯一命令文件，避免 Windows SMB 对同一个 JSON 文件反复覆盖时出现缓存旧内容。

只要我在 macOS 侧写入新命令，Windows 端就会自动执行，并把结果写回：

```text
results/runs/<command_id>/result.json
```

### 如果想只执行一次

```powershell
powershell -ExecutionPolicy Bypass -File "\\192.168.1.21\MixLabWindowsBuilds\windows-shared-test-agent.ps1" `
  -ShareRoot "\\192.168.1.21\MixLabWindowsBuilds" `
  -Once
```

`-Once` 适合验证代理本体是否能正常读写共享目录。常驻自动测试不要直接启动代理本体，而是启动 watchdog。

### 如果 UNC 路径不好用

可以先把共享文件夹映射成 Windows 盘符，例如 `Z:`，再启动：

```powershell
net use Z: "\\192.168.1.21\MixLabWindowsBuilds"

powershell -ExecutionPolicy Bypass -File "Z:\windows-shared-test-agent.ps1" `
  -ShareRoot "Z:\"
```

常驻测试时应改为：

```powershell
powershell -ExecutionPolicy Bypass -File "Z:\windows-shared-agent-watchdog.ps1" `
  -ShareRoot "Z:\"
```

如果 Windows 连接 SMB 时要求用户名和密码，使用你的 Mac 登录用户名和密码。

## 默认共享目录

macOS 侧默认共享目录是：

```text
/Users/huaqihang/Public/MixLabWindowsBuilds
```

Windows 侧对应的是 SMB 路径，例如：

```text
\\192.168.1.21\MixLabWindowsBuilds
```

具体路径取决于 macOS 文件共享里暴露出来的共享名称。如果这个路径打不开，需要先在 Windows 文件资源管理器里确认实际共享路径。

## 共享文件夹结构

```text
MixLabWindowsBuilds/
├── LATEST.txt
├── SHA256SUMS.txt
├── MixLab Cutter_0.18.10_x64-setup.exe
├── start-windows-shared-test-agent.cmd
├── windows-shared-agent-watchdog.ps1
├── windows-shared-test-agent.ps1
├── control/
│   ├── cutter-command.json
│   ├── cutter-command.template.json
│   └── cutter-agent-state.json
├── logs/
│   ├── agent/windows-shared-agent-watchdog.ndjson
│   └── agent/windows-shared-test-agent.ndjson
├── releases/
│   └── latest.json
├── results/
│   └── runs/<command_id>/
│       ├── result.json
│       ├── screenshot.png
│       └── diagnostics/
├── agent-watchdog-status.json
├── agent-status.json
├── agent-heartbeat.json
└── agent-checkpoint.json
```

## 命令文件

代理读取这个文件：

```text
control/cutter-command.json
```

示例：

```json
{
  "schema_version": "1.0",
  "command_id": "win-smoke-20260615-0001",
  "action": "smoke_test",
  "payload": {}
}
```

注意：`command_id` 每次必须变化。代理会记录上一次执行过的 `command_id`，避免重复执行同一条命令。

## Codex/macOS 侧如何下发命令

在 macOS 项目目录下可以执行：

```bash
npm run control:windows-shared-agent -- smoke_test \
  --command-id win-smoke-20260615-0001
```

触发自动安装最新版并跑冒烟测试：

```bash
npm run control:windows-shared-agent -- install_latest_and_smoke \
  --command-id install-smoke-20260615-0001
```

只收集日志：

```bash
npm run control:windows-shared-agent -- collect_logs \
  --command-id collect-logs-20260615-0001
```

这些命令会自动写入共享文件夹里的：

```text
control/cutter-command.json
```

## 支持的动作

代理只支持白名单动作，不接受任意 shell 命令。

- `ping`：测试代理能否读写共享文件夹。
- `collect_logs`：收集 MixLab Cutter 日志和配置候选文件。
- `probe_api`：不启动应用，只探测当前 `127.0.0.1:3789` API，并回传 `/health`、`/cutter/auth/mode`、`/cutter/runtime-status`、`/cutter/source-library?limit=20` 等结果。
- `capture_screenshot`：截取 Windows 主屏幕。
- `stop_app`：停止 MixLab Cutter、cutter-api-sidecar、mixlab-searchd。
- `launch_app`：启动 MixLab Cutter，并等待 `http://127.0.0.1:3789/health` 可用。
- `install_latest`：校验安装包 SHA-256，停止旧进程，静默安装最新版本。
- `install_latest_and_smoke`：安装最新版、启动剪辑端、跑 API 冒烟测试、截图并收集日志。

安装动作会先把共享文件夹中的安装包复制到 Windows 本机临时目录，再校验 SHA-256 并运行。这样可以避免从网络共享位置直接启动 `.exe` 时出现 Windows “打开文件 - 安全警告”弹窗。
- `smoke_test`：如果需要则启动剪辑端，然后检查 `/health`、`/cutter/auth/mode`、`/cutter/runtime-status`、`/cutter/source-library?limit=20`，并截图、收集日志。
- `restart_agent`：通知代理退出并由 watchdog 从共享目录重新启动最新版代理，用于升级代理脚本后自动切换到新版。
- `restart_watchdog`：通知当前代理拉起共享目录里的最新版 watchdog，再退出当前代理。用于升级外层 watchdog，不需要手动关闭 CMD 窗口。

## Release 描述文件

代理优先读取：

```text
releases/latest.json
```

示例：

```json
{
  "schema_version": "1.0",
  "version": "0.18.10",
  "commit": "996858c",
  "installer_file": "../MixLab Cutter_0.18.10_x64-setup.exe",
  "sha256": "f559ca9b3a251b14fe3b9a6cb225f44fb0171c67ab063411aba3af7142f84e92",
  "silent_args": "/S"
}
```

如果 `releases/latest.json` 不存在，代理会退回读取现有的 `LATEST.txt`，并默认使用 `/S` 作为 NSIS 静默安装参数。

## 结果文件

代理执行后写入：

```text
results/runs/<command_id>/result.json
```

里面会包含：

- 命令编号和动作。
- 执行状态：`passed` 或 `failed`。
- `/health` 检查结果。
- `/cutter/auth/mode` 检查结果。
- `/cutter/runtime-status` 检查结果。
- `/cutter/source-library?limit=20` 检查结果。
- 截图路径。
- 收集到的日志路径。
- 错误信息。

## 诊断日志

代理自身日志：

```text
logs/agent/windows-shared-test-agent.ndjson
```

每一行是一条 JSON 事件，方便 Codex 后续自动分析。

MixLab Cutter 运行日志会被复制到：

```text
results/runs/<command_id>/diagnostics/
```

## 安全边界

这个代理不会执行共享文件夹里的任意命令。它只会执行代码里写死的白名单动作：

```text
ping / collect_logs / probe_api / capture_screenshot / stop_app / launch_app /
install_latest / install_latest_and_smoke / smoke_test / restart_agent / restart_watchdog
```

这是为了避免共享文件夹被误写或被其他程序写入后，Windows 端执行危险命令。

## 常见问题

### 如何确认代理是不是最新版

运行 `start-windows-shared-test-agent.cmd` 后，窗口开头会先显示 watchdog 版本，再显示代理版本，例如：

```text
MixLab Windows shared agent watchdog v0.1.5
MixLab Windows shared test agent v0.3.2
```

共享目录里的 `agent-watchdog-status.json`、`agent-status.json`、`agent-heartbeat.json`、`logs/agent/windows-shared-agent-watchdog.ndjson` 和 `logs/agent/windows-shared-test-agent.ndjson` 也会记录版本。代理本体更新后，可以通过 `restart_agent` 让 watchdog 拉起新版代理；如果代理卡住没有响应，watchdog 会在心跳过期后自动重启它。

### 代理启动后没有反应

检查共享目录里是否存在：

```text
control/cutter-command.json
```

并确认 `command_id` 和上一次不同。

### Windows 提示无法运行脚本

使用：

```powershell
powershell -ExecutionPolicy Bypass -File "<脚本路径>" -ShareRoot "<共享目录>"
```

### Windows 找不到 MixLab Cutter

代理会自动从默认安装目录、注册表、开始菜单快捷方式、正在运行的进程、历史日志里的 sidecar 路径，以及类似 `D:\应用\MixLab Cutter` 的自定义目录查找主程序。

如果仍然找不到，可以手动加：

```powershell
-AppExePath "C:\你的安装目录\MixLab Cutter.exe"
```

也可以在单次命令的 `payload.app_exe_path` 里传入主程序路径，用于临时验证某个自定义安装目录。

完整示例：

```powershell
powershell -ExecutionPolicy Bypass -File "Z:\windows-shared-test-agent.ps1" `
  -ShareRoot "Z:\" `
  -AppExePath "C:\Users\Allen\AppData\Local\Programs\MixLab Cutter\MixLab Cutter.exe"
```
