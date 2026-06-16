# Windows Test Runner 落地计划

更新时间：2026-06-16

## 目标

把现有临时共享文件夹测试代理升级为长期 Windows Test Runner。

最终效果：

- Windows 端常驻 Runner。
- Codex/macOS 可通过 HTTP 直接下发测试。
- 共享目录只做安装包、日志、截图和报告交换。
- 每次测试都有结构化报告。
- Windows 端应用安装、启动、API、搜索、剪切、缓存、UI 截图可以自动验证。

## 当前不继续做的事

- 不继续在 `windows-shared-test-agent.ps1` 里扩展复杂业务测试。
- 不继续让 `windows-shared-agent-watchdog.ps1` 判断安装、剪切、搜索是否卡死。
- 不继续把共享目录 JSON 轮询做成正式任务队列。
- 不再把每次失败都当成孤立 bug 打补丁。

## 目录规划

新增：

```text
packages/windows-test-runner/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── server.ts
│   ├── config.ts
│   ├── run-store.ts
│   ├── report.ts
│   ├── actions/
│   │   ├── probe-api.ts
│   │   ├── install-latest.ts
│   │   ├── launch-app.ts
│   │   ├── smoke.ts
│   │   └── collect-logs.ts
│   ├── windows/
│   │   ├── processes.ts
│   │   ├── installer.ts
│   │   ├── screenshot.ts
│   │   └── paths.ts
│   └── types.ts
└── README.md
```

保留：

```text
scripts/desktop/windows-shared-test-agent.ps1
scripts/desktop/windows-shared-agent-watchdog.ps1
```

保留原因：作为安装 Runner 或 Runner 故障恢复的应急通道。

## Phase 1：Runner v0 控制面

### 目标

先建立稳定 HTTP Runner，不碰复杂安装和 UI 测试。

### 打包边界

Runner 的源码、单元测试和轻量 bundle 可以在 Mac/Codex 侧完成；正式 Windows `.exe` 必须在 Windows 构建机上完成。

原因：

- Mac 侧 `pkg` 生成 Windows exe 不稳定，已经出现过底层 `spawn Unknown system error -86`。
- Runner 是长期测试基础设施，不能依赖不确定的跨平台打包行为。
- 与剪辑端 Windows 安装包保持一致，统一由 Windows/GitHub Actions 产出正式 Windows 可执行文件。

当前约定：

```text
Mac/Codex:
  npm run package:windows-test-runner -- --skip-package

Windows/GitHub Actions:
  npm run package:windows-test-runner
```

`--skip-package` 只用于本机 bundle/manifest 自检，不会发布到共享目录，避免 Windows 端读取到没有 exe 和 SHA-256 的半成品 manifest。

正式产物：

```text
dist/windows-test-runner/MixLabWindowsTestRunner.exe
dist/windows-test-runner/latest.json
```

共享目录发布位：

```text
/Users/huaqihang/Public/MixLabWindowsBuilds/runner/MixLabWindowsTestRunner.exe
/Users/huaqihang/Public/MixLabWindowsBuilds/runner/latest.json
```

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

- Mac/Codex 可以直接访问 `http://<windows-ip>:3799/health`。
- Mac/Codex 可以发起一次 `probe_api` run。
- 不依赖共享目录 command JSON。
- 失败报告能区分 Runner 不通和应用 API 不通。
- GitHub Actions `Windows Test Runner Package` 能产出 `mixlab-windows-test-runner` artifact。

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
- 报告包含：

   - installer_path
   - installer_sha256
   - install_elapsed_ms
   - installer_exit_code
   - app_pid
   - api_ready_elapsed_ms

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

- 报告明确显示：

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
- 报告中能看到 UI 失败分类：

   ```text
   ui_first_run_unexpected
   ui_scrollbar_unexpected
   ui_loading_stuck
   ui_blank_page
   ui_layout_overflow
   ```

## Phase 5：Runner 自启动和自更新

### 目标

减少 Windows 端人工操作。

### 工作项

1. Runner 注册开机自启动。
2. Runner 提供 `/runner/update`。
3. 共享目录提供：

   ```text
   runner/latest.json
   runner/MixLabWindowsTestRunner.exe
   ```

4. 极简 watchdog 只负责：

   - Runner 未运行则启动
   - Runner 崩溃则重启
   - Runner 更新后重启

5. 更新失败回滚到上一版。

### 验收

- Windows 开机后 Runner 自动在线。
- Codex 可查看 Runner 版本。
- Runner 更新不需要用户反复手动启动。

## 第一批实施范围

第一批只做 Phase 1。

原因：

- 先把长期控制面打稳。
- 不再继续扩大旧代理。
- 先验证 HTTP Runner 是否能替代共享目录命令。

第一批完成后再做 Phase 2。

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

## 旧代理的短期保留策略

在 Runner v0 没有完成前，旧共享代理只做两件事：

1. 启动或恢复 Windows Runner。
2. 收集 Runner 故障时的基础日志。

不再向旧代理添加新的应用测试能力。
