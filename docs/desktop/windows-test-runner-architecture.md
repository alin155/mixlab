# MixLab Windows Test Runner 架构方案

更新时间：2026-06-16

## 结论

MixLab 需要的是一个长期运行的 Windows Test Runner，而不是继续扩大现有的共享文件夹 PowerShell 代理。

现有共享代理适合临时打通 Mac 到 Windows 的测试闭环，但不适合作为长期自动化测试基础设施。它把命令调度、安装执行、应用启动、心跳保活、日志回传都压在 SMB 共享目录和 PowerShell 轮询上，系统边界不清晰，容易进入“错一点修一点”的补丁循环。

长期方案应该改为：

- Windows 上常驻一个 Test Runner 服务。
- Mac/Codex 通过 HTTP 控制 Runner。
- 共享文件夹只保存安装包、截图、日志和测试报告。
- Runner 内部用明确的状态机执行安装、启动、API 检查、截图、日志采集、缓存检查、剪切验证。
- watchdog 只负责 Runner 进程存活，不再猜测每个测试步骤是否卡死。

## 现有方案复盘

### 当前链路

```text
Mac/Codex
  -> 写入共享目录 control/*.json
  -> Windows PowerShell 代理轮询命令
  -> 代理执行安装/启动/API/截图
  -> watchdog 按心跳判断代理是否卡死
  -> 结果写回共享目录 results/runs/<command_id>/
```

### 当前方案解决了什么

- 不需要 Windows 开 SSH 或 WinRM。
- 可以跨局域网下发有限白名单动作。
- 可以把安装包和测试证据集中放到共享文件夹。
- 可以在 Codex 侧读取 Windows 截图和日志。

### 当前方案的核心问题

1. 共享目录承担了过多职责

   共享目录同时承担命令队列、状态同步、日志仓库、安装包分发和结果回传。SMB 的缓存、文件锁、写入延迟、UNC 限制都会直接影响控制流。

2. 命令协议不够强

   目前依赖 JSON 文件轮询和 command_id 去重，缺少真正的任务状态机、任务取消、任务重试、任务租约和任务历史索引。

3. watchdog 职责过重

   watchdog 现在不仅负责拉起代理，还要根据心跳猜测代理是否卡死。安装包复制、哈希校验、Windows 安全扫描等慢步骤都会让 watchdog 误判。

4. 代理不是长期服务

   PowerShell 脚本适合快速验证，但不适合长期维护复杂状态机、并发队列、HTTP API、结构化日志和自更新。

5. 观测不足

   现在有日志和 checkpoint，但缺少一个完整测试报告模型。失败时常常需要从多处文件倒推：代理日志、watchdog 状态、应用日志、截图、API 返回。

6. 自更新边界混乱

   代理、watchdog 和应用包都在同一个共享目录更新。旧进程什么时候加载新脚本、新脚本是否已生效、失败后如何回滚，都不够清晰。

7. 无法可靠表达应用质量

   目前 smoke 测试偏向“能打开、API 有响应”，还不能稳定覆盖用户真正关心的：公共素材库首屏速度、搜索速度、剪切成功率、缓存增长、窗口缩放、滚动条、首启页是否消失。

## 推荐架构

### 总体结构

```text
Mac/Codex
  -> HTTP 调用 Windows Runner
  -> 读取共享目录中的产物和报告

Windows Test Runner
  -> 管理 MixLab Cutter 安装包
  -> 启停 MixLab Cutter
  -> 调用本机 sidecar API
  -> 执行 UI 截图和窗口检查
  -> 采集日志、缓存、测试报告

共享文件夹
  -> releases/ 安装包
  -> reports/ 测试报告
  -> screenshots/ 截图
  -> logs/ 运行日志
  -> artifacts/ 其他证据
```

### 控制通道

长期方案使用 HTTP，而不是共享文件轮询。

默认地址：

```text
http://<windows-ip>:3799
```

推荐 API：

```text
GET  /health
GET  /version
GET  /status
POST /runs
GET  /runs/:id
POST /runs/:id/cancel
GET  /runs/:id/report
POST /runner/restart
POST /runner/update
```

`POST /runs` 示例：

```json
{
  "suite": "windows_desktop_smoke",
  "release": {
    "source": "shared_latest"
  },
  "options": {
    "install": true,
    "launch": true,
    "capture_screenshot": true,
    "collect_logs": true
  }
}
```

### 共享文件夹的新职责

共享文件夹只做证据和产物交换，不做主控制通道。

```text
MixLabWindowsBuilds/
├── releases/
│   ├── latest.json
│   └── MixLab Cutter_0.18.10_x64-setup.exe
├── runner/
│   ├── latest.json
│   └── MixLabWindowsTestRunner.exe
├── reports/
│   └── <run_id>/report.json
├── screenshots/
│   └── <run_id>/*.png
├── logs/
│   ├── runner/*.ndjson
│   └── app/<run_id>/
└── artifacts/
    └── <run_id>/
```

保留共享命令文件只作为兼容和应急通道，不作为日常主路径。

## Windows Test Runner 职责

### 1. Runner 自身生命周期

- 启动后监听固定端口。
- 写入本机状态文件和共享状态文件。
- 提供 `/health` 和 `/version`。
- 支持自更新，但自更新必须是独立动作。
- 支持开机自启动。
- 崩溃后由轻量 watchdog 或 Windows 任务计划自动拉起。

### 2. 安装包管理

- 从共享目录读取 `releases/latest.json`。
- 下载或复制安装包到 Windows 本机缓存。
- 校验 SHA-256。
- 解除 Windows 网络来源阻止标记。
- 静默安装。
- 记录安装器退出码、耗时、版本、commit。

### 3. 应用进程管理

- 停止 MixLab Cutter、sidecar、searchd。
- 启动 MixLab Cutter。
- 等待 `http://127.0.0.1:3789/health`。
- 记录进程 PID、启动耗时、API ready 耗时。
- 支持启动失败后的日志采集。

### 4. API 验证

至少检查：

- `/health`
- `/cutter/auth/mode`
- `/cutter/runtime-status`
- `/cutter/source-library?limit=20`
- `/cutter/search`
- `/cutter/cache/status`
- `/cutter/cut-queue`

后续增加：

- 公共素材库首屏耗时。
- 搜索关键词耗时。
- 选中素材后完整文案加载耗时。
- 剪切任务提交耗时。
- 剪切产物生成耗时。
- 源视频本机缓存命中率。

### 5. UI 验证

Runner 需要能做基础 UI 验证，但不追求复杂视觉还原。

第一阶段：

- 启动后截图。
- 检查是否停留在首启页。
- 检查窗口是否出现浏览器滚动条。
- 检查左侧导航和主工作台是否可见。

第二阶段：

- 自动点击主要 tab。
- 截图每个页面。
- 检查页面是否空白、卡 loading、出现错误 toast。
- 检查窗口缩放后是否出现不该有的滚动条。

### 6. 日志与报告

每次运行都必须生成完整 run 目录：

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
- status: passed / failed / cancelled
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
unknown
```

## 测试分层

### L0 Runner 健康

目标：证明 Windows Runner 本身可用。

- `/health` 返回 ok。
- `/version` 返回 runner version。
- 共享目录可写。
- 本机缓存目录可写。

### L1 安装包验证

目标：证明最新安装包可以被 Windows 读取和校验。

- latest.json 可读。
- 安装包存在。
- SHA-256 正确。
- 可复制到本机缓存。

### L2 应用安装与启动

目标：证明 Windows 端可以安装并启动最新版本。

- 静默安装成功。
- 应用进程启动。
- sidecar API ready。
- auth mode 正确。

### L3 基础数据可用

目标：证明应用能看到真实数据。

- runtime status 可读。
- 公共素材库 count 大于 0。
- source-library 首屏小于目标耗时。
- 缓存状态可读。

### L4 核心功能 smoke

目标：证明剪辑端主链路可用。

- 搜索关键词。
- 返回候选素材。
- 打开某条素材完整文案。
- 提交剪切任务。
- 任务进入队列。
- 成功生成产物或返回明确失败原因。

### L5 UI 桌面体验

目标：证明应用像桌面应用，不像套了浏览器壳。

- 首启页只在第一次或配置失效时出现。
- 主窗口无浏览器滚动条。
- 每个页面内部滚动区域正确。
- 缩放窗口后布局不溢出。
- 关键页面截图可读。

## 状态机

每个 run 使用明确状态：

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

Runner 自己管理状态超时，watchdog 不参与业务状态判断。

## 技术选型建议

### 推荐：Node.js / TypeScript Runner

原因：

- 当前项目已经是 TypeScript/Node 生态。
- 可以复用现有脚本、JSON 类型、Playwright 经验。
- HTTP 服务、文件 IO、日志、报告生成都更适合长期维护。
- 比 PowerShell 更适合做状态机和测试编排。

推荐结构：

```text
packages/windows-test-runner/
├── src/
│   ├── server.ts
│   ├── runs/
│   ├── actions/
│   ├── probes/
│   ├── reporters/
│   ├── windows/
│   └── shared/
├── package.json
└── README.md
```

### PowerShell 的保留职责

PowerShell 不再做主 Runner，只保留为：

- 安装 Runner。
- 注册开机自启动。
- 极简 watchdog。
- 应急启动脚本。

## 落地计划

### Phase 1：Runner v0 最小可用

目标：替代共享 JSON 命令轮询，建立 HTTP 控制面。

工作项：

- 新建 `packages/windows-test-runner`。
- 实现 `/health`、`/version`、`/status`。
- 实现 `POST /runs`。
- 实现 `probe_api` run。
- 生成 `reports/<run_id>/report.json`。
- 共享目录只用于输出报告。

验收：

- Mac/Codex 可以直接调用 Windows Runner。
- 不依赖 `control/*.json` 才能执行测试。
- 每次测试有独立报告目录。

### Phase 2：安装与启动自动化

目标：Runner 可以独立完成安装最新版和启动应用。

工作项：

- 读取 `releases/latest.json`。
- 本机复制安装包。
- SHA-256 校验。
- 静默安装。
- 停止旧应用进程。
- 启动 MixLab Cutter。
- 等待 sidecar API。

验收：

- 一条 HTTP 命令完成安装 + 启动。
- 失败时能明确区分安装失败、启动失败、API 超时。

### Phase 3：应用 smoke 套件

目标：覆盖用户最关心的真实功能。

工作项：

- 检查 auth mode。
- 检查 runtime status。
- 检查公共素材库首屏。
- 检查搜索关键词。
- 检查素材完整文案加载。
- 检查剪切任务提交。
- 检查缓存状态。

验收：

- 报告能说明：公共素材库是否慢、搜索是否慢、剪切是否失败、缓存是否增长。

### Phase 4：UI 桌面体验检查

目标：自动发现首启页、滚动条、页面 loading、缩放溢出等问题。

工作项：

- 截取窗口截图。
- 检查首启页是否异常出现。
- 检查窗口滚动条。
- 逐个 tab 截图。
- 窗口尺寸切换后复查。

验收：

- 报告中包含每个页面截图。
- 明确标记 UI 异常。

### Phase 5：Runner 自更新与开机自启

目标：减少人工启动和人工升级。

工作项：

- Runner 版本 manifest。
- 自更新下载和替换。
- 开机自启。
- 极简 watchdog。
- 更新失败回滚。

验收：

- 用户只需要保证 Windows 开机和共享目录可访问。
- Runner 后续升级不需要反复手动双击。

## 过渡策略

短期不删除现有共享代理。它作为应急通道保留：

- Runner 未安装时，用共享代理安装 Runner。
- Runner HTTP 不可达时，用共享代理采集基础日志。
- Runner 自更新失败时，用共享代理恢复。

但新增能力不再继续堆到旧 PowerShell 代理里。

## 不再继续投入的方向

- 不继续把共享 JSON 文件轮询做成复杂任务队列。
- 不继续让 watchdog 理解业务阶段。
- 不继续在 PowerShell 里扩展复杂 UI 测试。
- 不继续依赖用户反复手动安装新包和截图。

## 最终验收标准

长期 Windows Test Runner 完成后，Codex 应该可以独立执行：

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

如果失败，报告必须能回答：

- 是 Runner 问题，还是应用问题？
- 是安装失败，还是启动失败？
- 是 API 不通，还是数据为空？
- 是公共素材库慢，还是搜索慢？
- 是源视频不可读，还是剪切任务失败？
- 是缓存没有写入，还是 UI 显示没有更新？

这才是后续稳定迭代 Windows 端的基础。
