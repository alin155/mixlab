# Windows Test Runner 落地计划

更新时间：2026-06-16

## 目标

把 Windows 自动测试从旧共享文件夹 agent/watchdog 切换到长期 Windows Test Runner。

最终效果：

- Windows 端运行 `MixLabWindowsTestRunner.exe`。
- Codex/macOS 通过 HTTP 直接下发测试。
- 共享目录只做安装包、Runner 包、日志、截图和报告交换。
- 每次测试都有结构化报告。
- Windows 端应用安装、启动、API、搜索、剪切、缓存、UI 截图可以自动验证。

## 已停止维护的旧路径

以下旧路径不再作为正式方案存在：

- `windows-shared-test-agent.ps1`
- `windows-shared-agent-watchdog.ps1`
- `start-windows-shared-test-agent.cmd`
- `control/cutter-command.json`
- `control/commands/*.json`
- `npm run control:windows-shared-agent`

原因：

- SMB 文件轮询和命令覆盖容易出现缓存、锁、延迟和权限问题。
- watchdog 会误判安装、启动、扫描等慢步骤。
- PowerShell agent 不适合继续承载状态机、并发队列、HTTP API、报告模型和自更新。

## 当前阶段：人工启动 Runner

在 Runner 自启动完成前，Windows 端由用户手动启动一次：

```text
\\192.168.1.21\MixLabWindowsBuilds\start-windows-test-runner.cmd
```

脚本会：

1. 找到共享目录里的 `runner/MixLabWindowsTestRunner.exe`。
2. 复制到 Windows 本机缓存：

   ```text
   %LOCALAPPDATA%\MixLab\TestRunner\
   ```

3. 复制 `runner/latest.json`。
4. 尝试执行 `Unblock-File`，避免网络来源安全提示。
5. 设置 Runner 环境变量。
6. 启动本机缓存里的 Runner。

这不是 agent，不轮询共享命令，也不执行测试动作。它只是前期人工 bootstrap。

## Phase 1：Runner v0 控制面

### 目标

建立稳定 HTTP Runner，不碰复杂安装和 UI 测试。

### 工作项

1. 新建 `packages/windows-test-runner`。
2. 实现 HTTP 服务：

   ```text
   GET  /health
   GET  /version
   GET  /status
   POST /runs
   GET  /runs/:id
   GET  /runs/:id/report
   ```

3. 实现 run 状态机：

   ```text
   queued -> starting -> running -> writing_report -> passed/failed/cancelled
   ```

4. 实现 `probe_api` 动作：

   - `/health`
   - `/cutter/auth/mode`
   - `/cutter/runtime-status`
   - `/cutter/source-library?limit=20`

5. 输出报告：

   ```text
   reports/<run_id>/report.json
   reports/<run_id>/summary.md
   reports/<run_id>/timeline.ndjson
   ```

### 验收

- Mac/Codex 可以访问 `http://<windows-ip>:3799/health`。
- Mac/Codex 可以发起一次 `probe_api` run。
- 不依赖共享目录 command JSON。
- 失败报告能区分 Runner 不通和应用 API 不通。
- GitHub Actions 能产出 `mixlab-windows-test-runner` artifact。

## Phase 2：安装和启动

### 目标

Runner 自己完成安装最新包、启动应用、等待 API ready。

### 工作项

1. 读取共享目录 `releases/latest.json`。
2. 复制安装包到 Windows 本机缓存：

   ```text
   %LOCALAPPDATA%\MixLab\TestRunner\installers\
   ```

3. SHA-256 校验。
4. 停止旧进程：

   - MixLab Cutter
   - cutter-api-sidecar
   - mixlab-searchd

5. 静默安装。
6. 启动 MixLab Cutter。
7. 等待 `127.0.0.1:3789/health`。

### 验收

- 一次 HTTP run 可以完成 `install_latest + launch_app`。
- 报告包含安装器路径、SHA-256、安装耗时、退出码、app PID、API ready 耗时。

## Phase 3：真实应用 Smoke

### 目标

覆盖用户最关心的真实链路：公共素材库、搜索、剪切、缓存。

### 工作项

1. 公共素材库检查：

   - count > 0
   - first page <= 1 秒目标
   - 返回 20 条以内首屏数据

2. 搜索检查：

   - 指定关键词
   - 返回候选素材
   - 记录搜索耗时

3. 素材详情检查：

   - 选中一条素材
   - 加载完整文案
   - 记录文案加载耗时

4. 剪切检查：

   - 提交一次短片段剪切
   - 检查任务进入队列
   - 等待完成或明确失败
   - 收集失败原因

5. 缓存检查：

   - 剪切前缓存状态
   - 剪切后缓存状态
   - 源视频缓存是否增长
   - 临时剪切区是否增长

### 验收

报告明确显示：

```text
public_library: passed/failed/slow
search: passed/failed/slow
transcript: passed/failed/slow
cut: passed/failed
cache: passed/failed/not_changed
```

## Phase 4：UI 桌面体验检查

### 目标

自动发现 Windows 应用不像桌面应用的问题。

### 工作项

1. 截取主窗口。
2. 检查是否异常出现首启页。
3. 检查页面是否有浏览器级滚动条。
4. 逐个 tab 截图：

   - 首页
   - 素材搜索
   - 剪切任务
   - 本地素材
   - 公共素材库
   - 缓存管理
   - 设置

5. 改变窗口尺寸后再次截图。
6. 检查页面是否卡在 loading 或空白。

### 验收

- 每个页面都有截图。
- 报告中能看到 UI 失败分类。

## Phase 5：Runner 自启动和自更新

### 目标

减少 Windows 端人工操作，但不回到旧 agent/watchdog。

### 当前进度

- 已新增 `launch_runner` run suite：当前 Runner 可以启动共享目录里的新版 Runner
  到备用端口，例如 `3800`，并验证新版 Runner 的 `/version`。
- 已新增版本同步测试：`packages/windows-test-runner/package.json` 的版本必须和运行时
  `/version` 暴露的版本一致。
- 后续的完整自更新应基于 `launch_runner`，而不是通过 `launch_app_probe` 执行任意
  PowerShell 命令。

### 工作项

1. Runner 注册当前用户开机自启动。
2. Runner 提供备用端口启动新版 Runner 的 `launch_runner` run suite。
3. 共享目录提供：

   ```text
   runner/latest.json
   runner/MixLabWindowsTestRunner.exe
   ```

4. Runner 提供 `/runner/update` 或等价 run suite，完成主端口切换。
5. Runner 自己完成更新下载、替换和重启。
6. 更新失败回滚到上一版。

### 验收

- Windows 开机后 Runner 自动在线。
- Codex 可查看 Runner 版本。
- Runner 更新不需要用户反复手动启动。

## 第一批实施范围

第一批只做 Phase 1 + 人工 bootstrap。

原因：

- 先把长期控制面打稳。
- 不再继续扩大旧代理。
- 先验证 HTTP Runner 是否能替代共享目录命令。

## 第一批验收命令

Mac/Codex 侧：

```bash
curl http://<windows-ip>:3799/health
curl http://<windows-ip>:3799/version
curl http://<windows-ip>:3799/status
curl -X POST http://<windows-ip>:3799/runs \
  -H 'content-type: application/json' \
  -d '{"suite":"probe_api"}'
```

报告位置：

```text
/Users/huaqihang/Public/MixLabWindowsBuilds/reports/<run_id>/
```

## 用户前期需要做什么

1. 在 Windows 打开共享目录：

   ```text
   \\192.168.1.21\MixLabWindowsBuilds
   ```

2. 双击：

   ```text
   start-windows-test-runner.cmd
   ```

3. 看到 Runner 窗口后保持它打开。
4. 在 Windows 浏览器访问：

   ```text
   http://127.0.0.1:3799/health
   ```

5. 如果返回 `ok: true`，告诉 Codex：`Runner 已启动`。

之后 Codex 通过 HTTP Runner 继续测试，不再要求你启动旧 agent/watchdog。
