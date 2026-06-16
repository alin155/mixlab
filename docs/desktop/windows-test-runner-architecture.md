# MixLab Windows Test Runner 架构方案

更新时间：2026-06-16

## 结论

MixLab 需要一个长期运行的 Windows Test Runner，而不是继续维护共享文件夹 PowerShell agent/watchdog。

旧 agent/watchdog 的问题不在于某一个脚本写得不够好，而在于控制通道本身不适合长期测试：它把命令队列、心跳、安装、启动、日志、状态恢复都压在 SMB 文件轮询上，任何缓存、锁、UNC、权限或安全弹窗都会把测试通道本身变成新的故障源。

新的正式路径：

- Windows 上运行 `MixLabWindowsTestRunner.exe`。
- Mac/Codex 通过 HTTP 调用 Runner。
- 共享文件夹只保存安装包、Runner 包、报告、截图、日志和其他证据。
- Runner 内部用状态机执行安装、启动、API 检查、截图、缓存检查、搜索和剪切验证。
- 前期由用户手动双击一次启动脚本；后续再做 Runner 自启动和自更新。
- Runner 自更新不再依赖旧 agent/watchdog。先由当前 Runner 通过 `launch_runner`
  在备用端口启动新版 Runner，验证通过后再切回主端口。

## 非目标

- 不再修复 `windows-shared-test-agent.ps1`。
- 不再修复 `windows-shared-agent-watchdog.ps1`。
- 不再通过 `control/cutter-command.json` 或 `control/commands/*.json` 下发正式测试命令。
- 不把旧 agent/watchdog 作为应急恢复路径继续保留。

## 新架构

```text
Mac / Codex
  -> HTTP: http://<windows-ip>:3799
  -> 读取共享目录中的 reports / screenshots / logs

Windows Test Runner
  -> 管理 MixLab Cutter 安装包
  -> 启停 MixLab Cutter
  -> 调用本机 sidecar API
  -> 执行 UI 截图和窗口检查
  -> 采集日志、缓存、测试报告

共享文件夹
  -> releases/ 安装包
  -> runner/ Runner 包
  -> reports/ 测试报告
  -> screenshots/ 截图
  -> logs/ 运行日志
  -> artifacts/ 其他证据
```

## 控制通道

默认地址：

```text
http://<windows-ip>:3799
```

第一阶段 API：

```text
GET  /health
GET  /version
GET  /status
POST /runs
GET  /runs/:id
GET  /runs/:id/report
```

后续 API：

```text
POST /runs/:id/cancel
POST /runner/update
POST /runner/restart
```

`POST /runs` 示例：

```json
{
  "suite": "probe_api"
}
```

```json
{
  "suite": "launch_runner",
  "options": {
    "port": 3800,
    "version_expected": "0.1.8"
  }
}
```

`launch_runner` 的职责是从共享目录 `runner/MixLabWindowsTestRunner.exe`
复制/启动一份 Runner 到备用端口，并验证 `/version`。它是 Runner 自升级的基础能力，
不使用共享文件夹轮询命令。

非破坏性真实链路 smoke：

```json
{
  "suite": "cutter_api_smoke",
  "options": {
    "queries": ["第一场", "现金流"],
    "source_limit": 20
  }
}
```

该套件验证 runtime/cache 摘要、公共素材库首屏、关键词搜索、选中素材完整文案加载、
剪切任务队列可读性，不创建剪切任务。

## 共享文件夹职责

共享文件夹是证据和产物交换区，不是控制面。

```text
MixLabWindowsBuilds/
├── releases/
│   ├── latest.json
│   └── MixLab Cutter_0.18.10_x64-setup.exe
├── runner/
│   ├── latest.json
│   └── MixLabWindowsTestRunner.exe
├── reports/
│   └── <run_id>/
├── screenshots/
│   └── <run_id>/
├── logs/
│   ├── runner/
│   └── app/
└── artifacts/
    └── <run_id>/
```

## Runner 职责

### 生命周期

- 启动后监听固定端口。
- 提供 `/health`、`/version`、`/status`。
- 写入结构化日志。
- 每次测试生成独立报告目录。
- 后续支持自启动和自更新。

### 安装包管理

- 读取 `releases/latest.json`。
- 复制安装包到 Windows 本机缓存。
- 校验 SHA-256。
- 解除网络来源阻止标记。
- 静默安装。
- 记录安装器退出码、耗时、版本和 commit。

### 应用进程管理

- 停止 MixLab Cutter、sidecar、searchd。
- 启动 MixLab Cutter。
- 等待 `http://127.0.0.1:3789/health`。
- 记录 PID、启动耗时、API ready 耗时。

### API 验证

至少检查：

- `/health`
- `/cutter/auth/mode`
- `/cutter/runtime-status`
- `/cutter/source-library?limit=20`
- `/cutter/search`
- `/cutter/cache/status`
- `/cutter/cut-queue`

### UI 验证

第一阶段：

- 启动后截图。
- 检查是否异常停留在首启页。
- 检查窗口是否出现浏览器级滚动条。
- 检查左侧导航和主工作台是否可见。

第二阶段：

- 自动切换主要 tab。
- 每个页面截图。
- 检查空白、卡 loading、错误 toast、缩放溢出。

## 报告模型

每次运行生成：

```text
reports/<run_id>/
├── report.json
├── summary.md
├── timeline.ndjson
├── screenshots/
├── api/
├── logs/
└── artifacts/
```

`report.json` 必须包含：

- run_id
- runner_version
- app_version
- app_commit
- started_at / finished_at
- status
- failed_stage
- failure_category
- failure_message
- timings
- API 检查结果
- UI 截图路径
- 缓存状态
- 剪切测试结果

失败分类：

```text
runner_unreachable
runner_update_failed
installer_missing
installer_hash_mismatch
installer_failed
app_launch_failed
api_health_timeout
auth_failed
library_empty
library_slow
search_failed
search_slow
cut_submit_failed
cut_worker_failed
cache_not_growing
ui_first_run_unexpected
ui_scrollbar_unexpected
ui_loading_stuck
ui_blank_page
ui_layout_overflow
unknown
```

## 测试分层

### L0 Runner 健康

- `/health` 返回 ok。
- `/version` 返回 Runner 版本。
- 共享目录可写。
- 本机缓存目录可写。

### L1 安装包验证

- latest.json 可读。
- 安装包存在。
- SHA-256 正确。
- 可复制到本机缓存。

### L2 应用安装与启动

- 静默安装成功。
- 应用进程启动。
- sidecar API ready。
- auth mode 正确。

### L3 基础数据可用

- runtime status 可读。
- 公共素材库 count 大于 0。
- source-library 首屏小于目标耗时。
- 缓存状态可读。

### L4 核心功能 smoke

- 搜索关键词。
- 返回候选素材。
- 打开某条素材完整文案。
- 提交剪切任务。
- 任务进入队列。
- 成功生成产物或返回明确失败原因。

### L5 UI 桌面体验

- 首启页只在第一次或配置失效时出现。
- 主窗口无浏览器级滚动条。
- 每个页面内部滚动区域正确。
- 缩放窗口后布局不溢出。
- 关键页面截图可读。

## 状态机

```text
queued
starting
preflight
installing
launching
waiting_api
probing_api
running_ui_checks
running_feature_checks
collecting_logs
writing_report
passed
failed
cancelled
```

每个状态都有：

- started_at
- updated_at
- timeout_seconds
- progress
- last_message
- error

Runner 自己管理业务状态超时，不依赖外部 watchdog 猜测。

## 技术选型

Runner 使用 Node.js / TypeScript。

原因：

- 当前项目已经是 TypeScript/Node 生态。
- 可以复用现有脚本、JSON 类型、测试经验。
- HTTP 服务、文件 IO、日志、报告和状态机比 PowerShell 更适合长期维护。

PowerShell 只保留为可选安装脚本，不再作为测试控制通道。

## 最终验收标准

Codex 应该可以通过 HTTP Runner 独立执行：

```text
1. 查询 Windows Runner 是否在线
2. 安装最新 MixLab Cutter
3. 启动应用
4. 检查真实公共素材库
5. 搜索关键词
6. 提交一次剪切任务
7. 检查缓存变化
8. 截取关键页面
9. 收集日志
10. 输出一份可读测试报告
```

失败时报告必须回答：

- 是 Runner 问题，还是应用问题？
- 是安装失败，还是启动失败？
- 是 API 不通，还是数据为空？
- 是公共素材库慢，还是搜索慢？
- 是源视频不可读，还是剪切任务失败？
