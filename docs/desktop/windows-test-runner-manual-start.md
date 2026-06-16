# Windows Test Runner 手动启动说明

更新时间：2026-06-16

这是新的 Windows 自动测试入口。它不是旧 agent，也不是 watchdog。

## 你需要做什么

1. 在 Windows 文件资源管理器打开共享目录：

   ```text
   \\192.168.1.21\MixLabWindowsBuilds
   ```

   如果你已经映射成盘符，也可以打开类似：

   ```text
   P:\MixLabWindowsBuilds
   ```

2. 双击：

   ```text
   start-windows-test-runner.cmd
   ```

3. 脚本会把 Runner 复制到本机：

   ```text
   %LOCALAPPDATA%\MixLab\TestRunner\
   ```

4. Runner 会在当前 CMD 窗口前台运行。这个窗口先不要关闭。

5. 在 Windows 浏览器访问：

   ```text
   http://127.0.0.1:3799/health
   ```

6. 如果看到 `ok: true`，告诉 Codex：

   ```text
   Runner 已启动
   ```

## 如果打不开

先确认共享目录里有：

```text
runner\MixLabWindowsTestRunner.exe
runner\latest.json
start-windows-test-runner.cmd
```

如果 Windows 弹出安全提醒，选择“运行”。启动脚本会复制到本机缓存再运行，后续会减少这类网络来源弹窗。

如果 `http://127.0.0.1:3799/health` 无法访问，查看共享目录里的启动日志：

```text
logs\runner\bootstrap.log
```

## 为什么不是旧 agent/watchdog

旧方案是 Mac 写共享 JSON，Windows PowerShell 轮询文件，再由 watchdog 猜测脚本是否卡住。这个链路本身不稳定，已经影响真正的应用测试。

新方案是 Windows 本地运行一个长期 Runner，Codex 直接通过 HTTP 调用它。共享文件夹只负责放安装包、Runner、报告、截图和日志。
