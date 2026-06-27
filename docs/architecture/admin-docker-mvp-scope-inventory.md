# Admin Docker MVP Scope Inventory

更新时间：2026-06-27

## 目的

这份文档用于把当前 MixLab 管理端的页面、API、数据文件、Docker/Worker 入口做一次完整盘点，并给出 Docker MVP 版本的保留、隐藏、禁用和不可删除边界。

它不是删除清单，也不是上线批准书。它的作用是先建立共同地图，之后再逐项决定：

- 哪些功能必须保留到 Docker MVP；
- 哪些功能可以先只读开放；
- 哪些写操作必须默认禁用；
- 哪些旧功能可以隐藏但暂不删除；
- 哪些文件、协议和数据面绝对不能被管理端重构破坏。

## 当前环境边界

| 视角 | 当前事实 | MVP 处理原则 |
| --- | --- | --- |
| Mac 本机管理端 Web | `http://127.0.0.1:5176/#/dashboard` | 本机开发/验证入口，不代表 NAS Docker 已上线。 |
| Mac 本机管理端 API | `http://127.0.0.1:3889` | 本机 API 验证入口。 |
| NAS 只读观测入口 | `http://192.168.1.27:18080/` | 当前观测为旧管理端 API，不作为新版 Docker 通过证据。 |
| NAS 公共素材库 | `/data/PublicLibrary` | Docker 内路径；只读观测显示约 `11394` 总视频、`10471` ready、当前索引 `v010471`。 |
| Cutter 读取协议 | release/index/current + 搜索索引 + 源视频元数据 | Docker MVP 不能改变 Cutter 当前读取协议。 |

## 决策标记

| 标记 | 含义 |
| --- | --- |
| MVP keep | Docker MVP 首版保留并可使用。 |
| MVP keep read-only | 首版保留展示，但不允许执行写入、扫描、发布、恢复。 |
| MVP disable-by-default | 代码和入口保留，但按钮/命令默认禁用，必须通过门禁或明确开关启用。 |
| MVP hide | UI 暂时隐藏，后端可保留，避免用户误触。 |
| MVP defer | 不进入首版 MVP，后续迭代再讨论。 |
| Do not delete / protocol boundary | 不删除、不迁移、不改变协议；这是 Cutter 或 NAS 数据安全边界。 |
| User decision required | 需要产品方向确认后才能定。 |

## 风险等级

| 等级 | 范围 | 示例 |
| --- | --- | --- |
| L0 | UI/local only | 页面筛选、表格选择、返回导航。 |
| L1 | 管理端只读 | 读状态、读列表、读诊断、读操作日志。 |
| L2 | 管理配置/用户存储 | 管理员登录、剪辑师审批、设置保存。 |
| L3 | 素材 manifest/job/read-model 写入 | 入队、重试、恢复、metadata/cover 保存、read model reconcile。 |
| L4 | release/index/ready/Cutter 协议写入 | 发布到剪辑端、index repair、ready 状态变更。 |
| L5 | 高危维护/批量/恢复/自动 Worker | scan apply、批量预处理、命令快照恢复、后台 Worker 自动写生产库。 |

## 前端功能盘点

| 页面 | 当前用途 | 关键读取 | 当前写/命令入口 | MVP 建议 | Cutter 影响 |
| --- | --- | --- | --- | --- | --- |
| 总览 Dashboard | 看全局风险、产能、Supervisor 状态和数据加载策略 | `/api/admin/library/status`、`/api/admin/settings/config`、`/api/admin/preprocess/supervisor/status`、`/api/admin/data-loading/plan`、后台 `/api/admin/dashboard/metrics` | 扫描新增素材、执行下一步建议 | MVP keep；总览只做轻量状态页；命令按钮 disable-by-default 或隐藏 | 只读无影响；扫描/建议执行可能触发生产写入 |
| 保护中心 Protection | 看发布门禁、读模型状态、数据加载策略 | `/api/admin/operations/overview`、`/api/admin/read-model/reconcile/status` | 读模型 reconcile start/cancel 可能出现在页面实现中 | MVP keep read-only；reconcile start/cancel disable-by-default | 只读无影响；reconcile 写 `admin.sqlite`，原则上不改 Cutter 协议 |
| 素材库 Source Videos | 查询、筛选、查看原视频与处理状态 | `/api/admin/source-videos`、单条 `/api/admin/source-videos/:id` | 加入预处理、重新处理、恢复、发布、保存封面、保存素材信息 | MVP keep；查询/筛选/详情保留；所有写操作 disable-by-default | 查询无影响；发布/恢复/入队会影响生产状态，发布会影响 Cutter 可见素材 |
| 原视频详情 Source Detail | 单条素材详情 | `/api/admin/source-videos/:id` | 主要继承素材库动作 | MVP keep read-only；写操作跟随素材库门禁 | 只读无影响 |
| 预处理 Preprocess Jobs | 监控队列、处理历史、运行状态 | `/api/admin/preprocess/jobs`、`/api/admin/preprocess/process-history`、`/api/admin/preprocess/process-history/readiness`、`/api/admin/index/versions` | 启动/暂停预处理、重试失败、恢复卡住任务、发布到剪辑端、看日志 | MVP keep read-only；启动/重试/恢复/发布 disable-by-default；日志可读 | 读队列无影响；预处理和发布会改变生产库与 Cutter 可见数据 |
| 发布与索引 Index Publish | 看 index-required、索引版本、发布状态 | `/api/admin/source-videos`、`/api/admin/index/versions` | 发布到剪辑端、校验/修复索引 | MVP keep read-only；发布/repair disable-by-default | 索引发布直接影响 Cutter 搜索与公共素材可见性 |
| 剪辑师 Cutter Users | 剪辑师申请、审核、停用、重置密码 | `/api/admin/cutter-users` | 通过申请、停用用户、重置密码 | MVP keep；是否允许写入建议单独确认；至少需要用户存储写入测试通过 | 影响 Cutter 登录准入，不影响公共素材协议 |
| 系统检查 Doctor | 系统路径、工具、索引、运行诊断 | `/api/admin/doctor/report`、`/api/admin/runtime/diagnostics/history` | 重新检查、导出报告、ASR 检查 | MVP keep；诊断可执行，导出可保留；不得把 Doctor 作为页面加载依赖 | 诊断本身无影响；不能让 Doctor 自动修复生产数据 |
| 设置 Settings | 素材来源、路径、ASR/FFmpeg、运行参数 | `/api/admin/library/path-checks`、`/api/admin/settings/runtime`、`/api/admin/settings/config` | 初始化素材库、保存设置、增删素材来源、检查 ASR | MVP keep minimal；路径/运行时可见；保存设置和素材来源变更 disable-by-default 或强门禁 | 改 source folder 会改变后续扫描范围，间接高风险 |
| 操作记录 Operation Log | 查看审计事件、读模型失效原因、命令快照恢复预检 | `/api/admin/operation-log`、`/api/admin/command-snapshots/:snapshot_id/restore-plan` | 准备恢复、确认执行恢复 | MVP keep read-only；restore execution 必须 hide 或 disable-by-default | 恢复可能改 settings、manifest、artifact、index，属于最高风险 |

## API 盘点与 MVP 建议

### 健康、认证、会话

| API | 风险 | MVP 建议 | 说明 |
| --- | --- | --- | --- |
| `GET /health` | L1 | MVP keep | Docker healthcheck 依赖。 |
| `GET /api/admin/auth/bootstrap` | L1 | MVP keep | 判断是否需要首个管理员。 |
| `GET /api/admin/auth/status` | L1 | MVP keep | 管理端会话状态。 |
| `POST /api/admin/auth/register` | L2 | MVP keep | 写管理员用户/会话；必须保留但要有持久化和权限测试。 |
| `POST /api/admin/auth/login` | L2 | MVP keep | 写 last-login/session metadata，不触碰素材库。 |
| `POST /api/admin/auth/logout` | L2 | MVP keep | 删除会话，不触碰素材库。 |

### 系统只读与路由加载

| API | 风险 | MVP 建议 | 说明 |
| --- | --- | --- | --- |
| `GET /api/admin/library/status` | L1 | MVP keep | 读 `library.json` 和当前索引指针，不枚举视频。 |
| `GET /api/admin/settings/config` | L1 | MVP keep | 读管理配置。 |
| `GET /api/admin/settings/runtime` | L1 | MVP keep | 读运行环境探针。 |
| `GET /api/admin/library/path-checks` | L1 | MVP keep | 读路径状态，不扫描素材。 |
| `GET /api/admin/data-loading/plan` | L1 | MVP keep | 让前端知道哪些端点会扫描/后台加载。 |
| `GET /api/admin/dashboard/metrics` | L1/L3 | MVP keep but background-only | 可能读 usage/read-model，不能阻塞 shell。 |
| `GET /api/admin/doctor/report` | L1 | MVP keep | 路由内诊断，不作为全局依赖。 |
| `GET /api/admin/runtime/diagnostics/history` | L1 | MVP keep | 读有界诊断历史。 |

### 素材查询

| API | 风险 | MVP 建议 | 说明 |
| --- | --- | --- | --- |
| `GET /api/admin/source-videos` | L1 | MVP keep | 首版必须保留；默认走分页/read model，不做隐藏全库扫描。 |
| `GET /api/admin/source-videos/:source_video_id` | L1 | MVP keep | 单条详情。 |
| `GET /api/admin/source-videos/:source_video_id/cover` | L1 | MVP keep | 读封面。 |

### 预处理与索引只读

| API | 风险 | MVP 建议 | 说明 |
| --- | --- | --- | --- |
| `GET /api/admin/preprocess/jobs` | L1 | MVP keep | 队列页核心；必须分页/有界。 |
| `GET /api/admin/preprocess/jobs/:job_id/log` | L1 | MVP keep | 单任务日志可读。 |
| `GET /api/admin/preprocess/supervisor/status` | L1 | MVP keep | Supervisor 状态只读。 |
| `GET /api/admin/preprocess/safety` | L1 | MVP keep | 安全门禁只读。 |
| `GET /api/admin/preprocess/process-history` | L1 | MVP keep | 处理历史来自 read model。 |
| `GET /api/admin/preprocess/process-history/readiness` | L1 | MVP keep | 解释 read model 是否完整。 |
| `GET /api/admin/index/versions` | L1 | MVP keep | 索引版本列表，必须分页/缓存。 |
| `GET /api/admin/release-gates` | L1 | MVP keep | 发布门禁只读。 |

### 读模型、保护、操作日志

| API | 风险 | MVP 建议 | 说明 |
| --- | --- | --- | --- |
| `GET /api/admin/read-model/status` | L1 | MVP keep | 只读新鲜度。 |
| `GET /api/admin/read-model/reconcile/status` | L1 | MVP keep | 只读后台对账状态。 |
| `GET /api/admin/operations/overview` | L1 | MVP keep | 保护中心聚合。 |
| `GET /api/admin/operation-log` | L1 | MVP keep | 有界审计 tail。 |
| `GET /api/admin/command-snapshots/:snapshot_id/restore-plan` | L1/L5 | MVP keep read-only | 只允许看预检，不允许执行恢复。 |

### 写入/命令端点

| API | 风险 | MVP 建议 | 说明 |
| --- | --- | --- | --- |
| `PATCH /api/admin/settings/config` | L2/L3 | MVP disable-by-default | 改 source folder 会影响扫描范围；必须门禁。 |
| `POST /api/admin/settings/source-folders` | L2/L3 | MVP disable-by-default | 增加素材来源，后续扫描影响大。 |
| `PATCH /api/admin/settings/source-folders/:source_folder_id` | L2/L3 | MVP disable-by-default | 修改扫描范围。 |
| `DELETE /api/admin/settings/source-folders/:source_folder_id` | L2/L3 | MVP disable-by-default | 移除扫描范围；不能误删配置。 |
| `POST /api/admin/library/init` | L3 | MVP disable-by-default | 仅协议缺失时才可用。 |
| `POST /api/admin/library/scan-preview` | L1/L3 | MVP keep command-only | 允许作为显式预览；必须只读、不写生产数据。 |
| `POST /api/admin/library/scan` | L5 | MVP disable-by-default | scan apply 会写 library/source manifest/read model。 |
| `POST /api/admin/preprocess/supervisor/start` | L5 | MVP disable-by-default | 会启动后台生产链路。 |
| `POST /api/admin/preprocess/supervisor/stop` | L3 | MVP disable-by-default | 改 runtime 状态，需确认当前 worker 归属。 |
| `POST /api/admin/preprocess/queue-unprocessed` | L5 | MVP disable-by-default | 批量入队高风险。 |
| `POST /api/admin/preprocess/retry-failed` | L5 | MVP disable-by-default | 批量重试高风险。 |
| `POST /api/admin/preprocess/recover-processing` | L5 | MVP disable-by-default | 批量恢复高风险。 |
| `PATCH /api/admin/source-videos/:source_video_id/cover` | L3 | MVP disable-by-default | 写 artifact/manifest。 |
| `PATCH /api/admin/source-videos/:source_video_id/metadata` | L3 | MVP disable-by-default | 可考虑后续开放，但首版先门禁。 |
| `POST /api/admin/source-videos/:source_video_id/queue` | L3/L5 | MVP disable-by-default | 单条入队也可能降级/覆盖状态。 |
| `POST /api/admin/source-videos/:source_video_id/retry` | L3/L5 | MVP disable-by-default | 单条重试。 |
| `POST /api/admin/source-videos/:source_video_id/recover-processing` | L3/L5 | MVP disable-by-default | 单条恢复。 |
| `POST /api/admin/source-videos/:source_video_id/publish` | L4/L5 | MVP disable-by-default | 写 index/release，直接影响 Cutter。 |
| `POST /api/admin/index/repair` | L4/L5 | MVP disable-by-default | 可能重写 manifest/job/index/release。 |
| `POST /api/admin/read-model/reconcile` | L3 | MVP disable-by-default | 只写 read model，但属于全量后台维护；可作为受控维护开关。 |
| `POST /api/admin/read-model/reconcile/cancel` | L2 | MVP keep if reconcile enabled | 取消对账本身安全，但只有开放 start 时才需要。 |
| `POST /api/admin/doctor/run` | L1/L2 | MVP keep | 诊断可执行；不能自动修复生产数据。 |
| `POST /api/admin/doctor/export` | L1/L2 | MVP keep | 只写诊断报告。 |
| `POST /api/admin/settings/test-asr` | L1/L2 | MVP keep | 只测运行配置。 |
| `POST /api/admin/cutter-users/:user_id/approve` | L2 | User decision required | 影响 Cutter 登录准入，不影响素材协议。 |
| `POST /api/admin/cutter-users/:user_id/disable` | L2 | User decision required | 同上。 |
| `POST /api/admin/cutter-users/:user_id/password` | L2 | User decision required | 同上，必须保证明文密码不进日志。 |
| `POST /api/admin/command-snapshots/:snapshot_id/restore` | L5 | MVP hide | 恢复会写多个生产面，首版不应开放。 |

## 数据面盘点

| 数据/目录 | 作用 | MVP 处理原则 | Cutter 影响 |
| --- | --- | --- | --- |
| `source-videos/**` 原始视频目录 | 原始素材事实来源 | Do not delete / protocol boundary；管理端不得移动或删除 | Cutter 剪切可能需要读取源视频或源视频缓存 |
| `.mixlab-library/library.json` | 素材库摘要和索引指针 | 只读保留；写入必须命令门禁 | 影响管理端状态，间接影响发布判断 |
| `.mixlab-library/videos/Vxxxxxx/source-video.json` | 单条素材事实/状态 | Do not delete；ready 行不可误降级；写入必须快照/审计/锁 | 影响 Cutter 可见素材元数据和发布状态 |
| `.mixlab-library/videos/Vxxxxxx/preprocess-job.json` | 预处理任务状态 | 保留；恢复/重试必须门禁 | 错误写入会导致重复预处理或状态混乱 |
| `.mixlab-library/videos/Vxxxxxx/transcript.json` | 文稿产物 | Do not delete；新架构只能复用，不得强制重跑 | Cutter 详情、搜索和剪辑依赖 |
| `.mixlab-library/videos/Vxxxxxx/subtitles.srt` | 字幕产物 | Do not delete | Cutter 剪辑/字幕相关能力依赖 |
| `.mixlab-library/videos/Vxxxxxx/keyframes.json` | 关键帧产物 | Do not delete | Cutter 预览/定位可能依赖 |
| `.mixlab-library/videos/Vxxxxxx/cover.*` | 封面产物 | Do not delete；保存封面需门禁 | Cutter 列表展示依赖 |
| `.mixlab-library/indexes/source-transcript-index/current.json` | 当前搜索索引指针 | Do not change in MVP unless release gate passes | Cutter 搜索核心入口 |
| `.mixlab-library/indexes/source-transcript-index/v*/index.sqlite` | 发布索引包 | Do not delete；repair/publish 默认禁用 | Cutter 搜索核心数据 |
| `.mixlab-library/admin-read-model/admin.sqlite` | 管理端查询索引/read model | MVP keep；可重建；reconcile 受控 | Cutter 不直接依赖，适合承载管理端性能优化 |
| 管理员用户/会话存储 | 管理端登录 | MVP keep；必须验证 Docker 可写、原子写、权限 | 不影响素材协议 |
| 剪辑师用户存储 | Cutter 用户准入 | MVP keep；写操作是否开放需确认 | 影响 Cutter 登录 |
| `usage-events/events.ndjson` 与 usage projection | 使用数据/统计 | 保留；损坏时容错/修复，不阻塞登录 | 不影响 Cutter 协议 |
| operation log / command snapshots | 审计和恢复 | operation log 只读开放；restore 执行隐藏 | restore 可写多数据面，最高风险 |
| runtime diagnostics/export artifacts | 诊断报告 | 可写报告，不写生产协议 | 无直接影响 |
| settings/source folders/runtime secrets | 素材来源和运行配置 | 只读优先；保存/修改默认禁用 | 改素材来源会影响后续扫描与预处理 |

## Docker 与 Worker 入口

| 服务/入口 | 当前作用 | MVP 建议 |
| --- | --- | --- |
| `admin-api` | 管理端 API，Docker 内 `/data/PublicLibrary` | MVP keep；必须通过 `/health`、auth、只读路由、路径门禁。 |
| `admin-web` | nginx 托管管理端前端 | MVP keep；默认端口以 NAS `.env` 为准。 |
| `admin-worker` | 循环执行后台 worker | 容器可保留，但 worker flags 默认关闭。 |
| `MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER` | 启用预处理 worker | MVP 默认 `0`；只允许 canary/scratch 或明确维护窗口开启。 |
| `MIXLAB_ENABLE_READY_PUBLISH_WORKER` | 启用 ready 发布 worker | MVP 默认 `0`；未通过 release gate 前不自动发布。 |
| `scripts/workers/preprocess-library-worker.ts` | 运行真实预处理、ASR、FFmpeg、写产物 | L5；首版不自动运行。 |
| `scripts/workers/publish-ready-worker.ts` | 把 `index-required` 发布为 ready/index | L5；首版不自动运行。 |
| `MIXLAB_PREPROCESS_DISK_BLOCK_USAGE_PERCENT` | 磁盘保护阈值 | 必须保留；NAS 98% blocked 时不得启动写入型 worker。 |

## Docker MVP 首版建议形态

首版 Docker MVP 应该是“生产库只读控制台 + 低风险账户/诊断能力”，而不是完整预处理生产系统。

建议首版开启：

- 管理端登录、登出、首个管理员注册；
- Dashboard 轻量状态；
- 保护中心只读；
- 素材库查询、筛选、单条详情、封面读取；
- 预处理队列/处理历史只读；
- 索引版本只读；
- 系统检查、诊断导出、ASR 测试；
- 操作日志只读；
- 剪辑师用户管理是否允许写入，单独确认。

建议首版默认禁用或隐藏：

- scan apply；
- 自动预处理 worker；
- 自动 ready publish worker；
- 批量入队/重试/恢复；
- 单条入队/重试/恢复；
- 发布到剪辑端；
- index repair；
- command snapshot restore；
- source folder 增删改；
- 初始化生产素材库；
- ready 行任何可能导致重新预处理、降级、下线的命令。

## 上线前验收门禁

| 门禁 | 验收方式 | 通过标准 |
| --- | --- | --- |
| 数据不变 | Docker MVP 前后只读采样 | `10471` ready 和 `v010471` 当前索引不被首版启动改变。 |
| Cutter 不受影响 | Windows/Cutter 或 API smoke | 公共素材首屏、搜索、详情、剪切仍可用。 |
| 无隐藏全库扫描 | data-loading plan + 慢接口观测 | 登录、Dashboard、默认列表不触发全库扫描。 |
| 写入口默认关闭 | UI + API/配置检查 | 高风险按钮隐藏或禁用，worker flags 为 `0`。 |
| 磁盘保护 | NAS 只读探测 + API 门禁 | 磁盘 blocked 时所有 L4/L5 写操作不可启动。 |
| 回滚可行 | Docker tag/compose/runbook | 可恢复旧管理端入口或停掉新容器，不影响 Cutter。 |
| 用户存储可写 | auth/cutter-user store smoke | 登录、注册、用户读取不再出现 store 写入错误。 |
| 诊断可解释 | Doctor + operations overview | 失败时能指出路径、磁盘、权限、read model 或旧 API 差异。 |

## 待讨论决策

1. Docker MVP 是否允许剪辑师审批、停用、重置密码，还是先只读展示？
2. 素材 metadata/cover 编辑是否进入首版，还是等只读 Docker MVP 稳定后再放开？
3. read-model reconcile 是否允许手动启动，还是首版只显示状态？
4. 预处理 Supervisor 控件是隐藏，还是显示但禁用并解释门禁？
5. NAS Docker MVP 使用哪个端口作为新版 staging 入口，避免和旧 `18080` 混淆？
6. 首版 Docker MVP 是严格只读，还是允许“账户/诊断”这类 L2 写入？

## 下一步建议

1. 基于本清单做一次“保留/隐藏/禁用/删除候选”评审。
2. 先不要物理删除代码，先用路由/功能开关收敛 Docker MVP 表面。
3. 为 L4/L5 命令加统一 Docker MVP gate，确保即使 UI 漏出也不能误写生产库。
4. 单独产出 `admin-docker-mvp-implementation-plan.md`，列出具体文件改动和测试验收。
5. 只读 Docker MVP 验证通过后，再讨论预处理生产链路的 canary 策略。
