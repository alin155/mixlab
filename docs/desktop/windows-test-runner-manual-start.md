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
logs\runner\bootstrap-3799.log
```

如果需要临时启动到备用端口，可以在 CMD 中运行：

```text
start-windows-test-runner.cmd 3800
```

对应健康检查地址是：

```text
http://127.0.0.1:3800/health
```

## 关于多出来的共享盘符

旧版启动脚本曾用 `pushd` 进入 UNC 共享目录。Windows 会把 UNC 路径临时映射成盘符；如果脚本被中断或 Runner 自替换失败，可能留下多个指向同一个共享目录的盘符。

新版脚本直接使用 `%~dp0` 绝对路径复制 Runner，不再用 `pushd`，后续启动不应再新增这类盘符。已有残留盘符不要在 Runner 正在运行时急着删除，避免影响当前报告写入；完成测试后再只清理指向 `MixLabWindowsBuilds` 的多余映射。

## 为什么不是旧 agent/watchdog

旧方案是 Mac 写共享 JSON，Windows PowerShell 轮询文件，再由 watchdog 猜测脚本是否卡住。这个链路本身不稳定，已经影响真正的应用测试。

新方案是 Windows 本地运行一个长期 Runner，Codex 直接通过 HTTP 调用它。共享文件夹只负责放安装包、Runner、报告、截图和日志。
