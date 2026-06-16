# Windows 应用验收 Runner 扩展计划

更新时间：2026-06-16

## 目标

让 Codex 可以在 Windows 上自动完成 MixLab Cutter 桌面端真实应用验收，重点验证用户实际关心的问题：

- 应用启动是否稳定。
- 首启 / Doctor 页是否只在配置无效时出现。
- 页面是否有桌面应用不该出现的浏览器级滚动条。
- 公共素材库首屏是否快速加载真实数据。
- 搜索关键词是否快速返回真实候选素材。
- 选中素材后是否加载完整文案。
- 缓存数据是否真实增长、分类是否正确。
- 剪切任务是否能提交、执行、完成或给出明确失败原因。
- 关键页面视觉和布局是否可截图复核。

## 当前稳定基线

- Windows Test Runner 当前稳定版本：`0.1.7`。
- `0.1.7` 已具备：
  - `/health`、`/version`、`/status`
  - `probe_api`
  - `launch_app_probe`
  - `launch_runner`
- `launch_runner` 只作为 Runner 自更新 / 备用端口基础能力保留，不作为当前应用验收主线继续迭代。

## 非目标

- 不继续维护旧 `windows-shared-test-agent` / `watchdog`。
- 不用共享 JSON 轮询控制应用测试。
- 不为了某个临时 API 缺口零散扩 Runner。
- 不优先做 Runner 自更新、Windows 服务化、防火墙自动配置。
- 不在 Runner 里修应用业务逻辑。

## 需要一次性补齐的 Runner 能力

### 1. App Runtime Smoke

用途：确认 Windows 桌面端和 sidecar 已经真实可用。

检查项：

- `launch_app_probe`
- `/health`
- `/cutter/auth/mode`
- `/cutter/runtime-status`
- `/cutter/source-library?limit=20`

验收数据：

- app 是否已启动。
- sidecar API ready 耗时。
- auth mode 是否为 `local_trusted`。
- runtime status 耗时。
- 公共素材库首屏耗时。
- release cache / source video cache / source preflight 摘要。

### 2. Real Data Smoke

用途：确认真实公共素材库、搜索索引、完整文案链路可用。

检查项：

- 公共素材库首屏：`/cutter/source-library?limit=20`
- 搜索：`/cutter/source-search?query=<keyword>&limit=10`
- 详情：`/cutter/source-videos/<source_video_id>`
- 剪切队列可读：`/cutter/cut-jobs`

默认关键词：

```text
第一场
现金流
中国
2026
```

验收数据：

- 公共素材库 total / returned count。
- 每个 API 耗时。
- 命中的 query。
- 搜索返回组数、命中数、search mode、search ms。
- 选中素材 id、标题、完整文案字符数、segment 数。
- 剪切任务总数、pending/running/done/failed 数。

### 3. Non-destructive Cache Smoke

用途：确认缓存状态可观测，避免用户看到缓存永远 4KB 却不知道是否真实工作。

检查项：

- `/cutter/runtime-status` 中的：
  - release cache size
  - thumbnail cache size
  - source video cache size
  - source video cache file count
  - cut temp cache size

验收数据：

- 缓存根目录。
- 各缓存分类 size / file count。
- 是否有 last error。
- source video preflight 样本是否可读。

### 4. Destructive Cut Smoke

用途：真正验证剪切链路是否可用。该套件会写本地工作区，因此必须和非破坏性 smoke 分开。

默认策略：

- 从 Real Data Smoke 命中的素材里选择一个短文案片段。
- 创建 clip list。
- 提交 cut job。
- 执行 run-next。
- 等待 cut job 完成或失败。
- 验证本地输出存在。
- 记录 source video cache 前后变化。

验收数据：

- clip list id。
- cut job id。
- status / phase timings。
- output path。
- error message。
- source video cache before / after。
- cut temp before / after。

安全边界：

- 只写 Windows 本地工作区。
- 不写公共素材库。
- 默认短片段，避免长视频剪切拖慢测试。

### 5. UI Screenshot Smoke

用途：发现“像网页、不像桌面应用”的问题。

检查项：

- 应用窗口截图。
- 首页。
- 素材搜索。
- 剪切任务。
- 本地素材。
- 公共素材库。
- 缓存管理。
- 设置。

验收数据：

- 每页截图路径。
- 窗口尺寸。
- 是否停留首启 / Doctor 页。
- 是否出现浏览器级滚动条。
- 是否出现 loading 卡住。
- 是否出现错误 toast / 空白页。

实现方式：

- 优先使用 Windows Runner 启动 Playwright / WebView 可观测方式。
- 如果 WebView 无法 DOM 检查，则先做窗口截图 + API 状态证据。

## Runner 扩展套件设计

建议一次性新增以下 suites：

```text
app_runtime_smoke
real_data_smoke
cache_smoke
cut_smoke
ui_screenshot_smoke
windows_acceptance
```

其中 `windows_acceptance` 是组合套件，默认顺序：

```text
app_runtime_smoke
real_data_smoke
cache_smoke
ui_screenshot_smoke
```

`cut_smoke` 默认不自动包含，除非明确进入破坏性验收阶段。

## 报告结构

每次运行输出：

```text
reports/<run_id>/
├── report.json
├── summary.md
├── timeline.ndjson
├── screenshots/
├── api/
└── logs/
```

`report.json` 必须包含：

- runner_version
- app version / commit（能读到时）
- Windows IP / Runner URL
- API base URL
- public library count
- runtime/cache 摘要
- 搜索 / 文案 / 剪切 / UI 的独立状态
- 每个 API 的耗时
- 失败分类

## 失败分类

统一使用：

```text
app_launch_failure
api_auth_failure
real_data_unavailable
public_library_slow
search_failure
transcript_failure
cut_failure
cache_not_growing
ui_layout_regression
test_infra_failure
unknown
```

## 实施顺序

1. 先实现非破坏性套件：
   - `app_runtime_smoke`
   - `real_data_smoke`
   - `cache_smoke`
   - `windows_acceptance`
2. 发布 Runner 新版本。
3. 用 Windows 实机运行非破坏性验收。
4. 根据报告修应用问题。
5. 应用基础稳定后，再实现并运行 `cut_smoke`。
6. 最后补 UI screenshot 深度检查。

## 验收门槛

第一批 Runner 扩展完成必须满足：

- 本地 Runner 单元测试通过。
- GitHub Windows Test Runner Package 通过。
- 共享目录同步新 Runner。
- Windows 实机 `windows_acceptance` 报告生成成功。
- 报告能回答：
  - 应用是否启动。
  - 是否真实数据。
  - 公共素材库首屏是否快。
  - 搜索是否可用。
  - 完整文案是否可加载。
  - 缓存当前到底有多大。
  - 哪一步失败，失败原因是什么。

