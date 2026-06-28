# Admin Docker MVP v0.1 Plan

更新时间：2026-06-28

## 决策结论

当前开发路线从完整 `Admin Architecture v1` 大重构，临时收敛为：

```text
Admin Docker MVP v0.1
= 新版 Docker 管理端可用
+ 管理端登录
+ 剪辑师管理
+ 受控预处理素材管理
+ Cutter 日常使用不受影响
```

这不是放弃 `Admin Architecture v1`，而是把它改成可上线、可验证、可逐步演进的路线。MVP v0.1 先验证核心架构和 Docker 运行闭环；通过后再逐步解锁发布、扫描、恢复、索引修复和深度页面重构。

## 用户确认的产品目标

用户已明确选择：

- 优先目标：尽快有一个新版 Docker 管理端可用。
- 可接受首版偏极简。
- 首版必须有：管理端登录、剪辑师管理、预处理素材管理、预处理可正常使用。
- 必须保证：剪辑端正常、ready 素材不被误伤。
- 除以上核心能力外，其他功能可以隐藏，必要时后续删除。
- 首版 Docker 不要求完整后台，只需要核心管理能力可用。
- 最担心风险：误伤已预处理数据、影响剪辑端。
- 长期方向：先验证核心架构，再继续中长期架构重构。

## 总目标

在不改变 Cutter release/index/search 协议、不重跑已 ready 素材、不迁移 NAS 目录结构的前提下，交付一个可在 NAS Docker 上运行的新版极简管理端。

MVP v0.1 必须做到：

1. 管理端可登录、会话稳定、用户存储可写。
2. 剪辑师管理可用，包括查看、审批、停用、重置密码。
3. 管理端可查看并管理预处理素材状态。
4. 预处理可运行，但必须处于受控预处理模式。
5. 预处理不能让 `ready` 素材重新入队、降级、下线或重新处理。
6. 首版不自动发布到 Cutter，避免影响当前 `v010471` release/index。
7. Cutter 日常使用不受影响，公共素材首屏、搜索、详情、剪切继续可用。

## 非目标

MVP v0.1 不做：

- 不做完整 Admin 页面重设计。
- 不开放全量 scan apply。
- 不自动发布到 Cutter。
- 不开放 index repair。
- 不开放 command snapshot restore。
- 不迁移 NAS 目录结构。
- 不改变 Cutter 读取协议。
- 不重跑或重建 `10471+` 已 ready 素材。
- 不做大面积物理删除代码。
- 不把 `admin.sqlite` 当作资产事实来源；它只是管理端查询优化。
- 不把当前旧 NAS `18080` 入口当作新版 Docker 通过证据。

## 当前环境基线

| 项目 | 当前事实 | MVP 约束 |
| --- | --- | --- |
| Mac 管理端 Web | `http://127.0.0.1:5176` | 本机开发验证入口。 |
| Mac 管理端 API | `http://127.0.0.1:3889` | 本机 API 验证入口。 |
| NAS 当前可见入口 | `http://192.168.1.27:18080` | 当前为旧管理端观测入口，不等于新版通过。 |
| NAS Compose 默认入口 | `8080` | 当前从 Mac 侧观测连接失败，后续 staging 需明确端口。 |
| NAS access preflight | SSH/DSM/Docker TCP/`8080` 关闭；`18080`/`9999` 打开；SMB `/Volumes/MixLab` 已挂载但未发现 compose/.env 或 returned evidence；最新证据 `docs/acceptance/artifacts/admin-docker-nas-access-preflight-20260628T105355Z.json` | 当前只能做只读观测，不能直接从 Mac 收集 NAS Docker release inputs。 |
| NAS release inputs | 未发现 `admin-docker-release-inputs/`、`admin-docker-current.env`、`admin-worker.inspect.json`、`admin-docker-disk-proof.json` | 必须通过 NAS desktop/本机 shell/临时 SSH 跑 collector 并把返回包带回 Mac 后才能继续 release review。 |
| Mac Docker capability | 未发现 `docker`、`docker compose`、Colima、Podman | 本机不能完成 local Docker smoke；需要 Docker-capable machine 或 GitHub/staging 证据替代。 |
| Windows Test Runner | `http://192.168.1.20:3799` 可达，runner `0.1.32` | 只能证明 Windows Runner 在线；没有 staged candidate 前不能作为 Docker MVP Cutter 兼容通过证据。 |
| Docker 公共素材库路径 | `/data/PublicLibrary` | Docker 内唯一正式库路径。 |
| Mac 公共素材库路径 | `/Volumes/MixLab/PublicLibrary` | Mac 本机验证路径，不能和 Docker 路径混淆。 |
| 生产 ready 基线 | `10471` | MVP 前后不得减少。 |
| 当前索引 | `v010471` | MVP v0.1 前后不得改变。 |
| 总视频观测 | `11394` | 用于上线前后只读对账。 |
| 磁盘风险 | 曾观测约 `98%` 且 blocked | 预处理必须受磁盘门禁约束。 |

## 当前已完成远端候选证据

2026-06-28 已完成 GitHub Docker-capable dry-run 证据收口，但仍不代表 NAS 已发布：

- branch dry-run：GitHub Actions run `28318729283`，ref `codex/windows-first-run-autostart-20260615104835`，head `b062bc387c1fdb2a391320c1c36233b782cb000a`，`push_images=false`，workflow success，`current-worktree-candidate-ready`。
- branch dry-run 证据：`docs/acceptance/artifacts/admin-docker-github-run-artifact-20260628T101106Z.json`，对应 artifact readiness 为 `candidate-ready`，`docker_deploy_allowed=false`。
- candidate tag：`admin-docker-candidate-b062bc387c1fdb2a391320c1c36233b782cb000a`，远端 tag 指向 `b062bc387c1fdb2a391320c1c36233b782cb000a`。
- tag dry-run：GitHub Actions run `28318925718`，ref `admin-docker-candidate-b062bc387c1fdb2a391320c1c36233b782cb000a`，`push_images=false`，workflow success，`github-run-candidate-ready`。
- candidate-ref proof：`docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260628T101658Z.json`，`candidate_ref_proof_accepted=true`，`docker_deploy_allowed=false`。
- pre-staging handoff：`docs/acceptance/artifacts/admin-docker-prestaging-handoff-20260628T102339Z.json`，`ready_to_request_release_inputs=true`，但 `staging_execution_ready=false`。
- release inputs：`docs/acceptance/artifacts/admin-docker-release-inputs-20260628T102350Z.json`，因缺 NAS image proof、current/rollback tag 仍 `blocked`，`push_execution_allowed=false`。
- NAS release-inputs handoff：`docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-20260628T103748Z.json`，`handoff_package_ready=true`，最新 bundle 指向 `b062bc387c1fdb2a391320c1c36233b782cb000a`，包含 `OPERATOR-CHECKLIST.md`，但不允许 push/deploy。
- NAS handoff portable kit：`docs/acceptance/artifacts/admin-docker-nas-handoff-kit-20260628T110013Z.json`，`kit_ready=true`，便携目录为 `dist/acceptance/admin-docker-nas-handoff-kit`，单文件包为 `dist/acceptance/admin-docker-nas-handoff-kit.tar.gz`，sha256 `d633d38dae7cd5c0991c78c4baae4aa7873b0a940a876a7450e4c8374346d3db`；包含 `KIT-SELF-CHECK.sh` 与 `KIT-FILES.sha256`，本机 self-check 与 tar 列表校验通过，可复制到 NAS desktop/NAS shell host 用于只读收集 `admin-docker-release-inputs/` 返回证据。
- release readiness summary：`docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T111155Z.json`，`release_review_ready=false`，`docker_upload_allowed=false`；已纳入 GitHub candidate artifact、NAS access preflight 与 handoff kit 证据，其中 Docker candidate smoke、`nas-collection-path-prepared` 和 `nas-handoff-kit-ready` 已通过，但仍有 `8` 个 release review blockers。

这批证据只清除了“远端 Docker 候选构建/本地 smoke/tag-ref 固定”和“NAS 返回证据采集包准备好”层面的门禁。当前总门禁视图显示 NAS 手工采集路径已准备好，但 NAS returned evidence intake、NAS staging、NAS current/rollback image proof、NAS disk proof、admin-worker 外部 proof、Cutter staged-candidate compatibility proof、本机/目标机 Docker smoke 和显式发布决策仍未完成。

## MVP 功能边界

### 必须保留并可用

| 功能 | 范围 | 验收 |
| --- | --- | --- |
| 管理端登录 | bootstrap/register/login/logout/status | Docker 内用户存储可写，登录不慢、不报存储写入错误。 |
| 剪辑师管理 | 列表、审批、停用、重置密码 | 写入 cutter user store，Cutter 登录准入符合预期。 |
| 预处理素材管理 | 查看 queued/processing/failed/index-required；查看任务日志；小批量 queue/retry/recover；start/stop supervisor | 仅非 ready 素材可进入预处理写操作，所有命令有门禁和审计。 |
| 素材状态查看 | 素材列表、筛选、详情、封面读取 | 不触发隐藏全库扫描，列表有分页或 read model 支持。 |
| 系统健康/门禁 | health、release gates、disk/path/asr/ffmpeg/preprocess safety | blocked 原因可见，禁止危险操作。 |

### 必须隐藏或默认禁用

| 功能 | MVP v0.1 决策 | 原因 |
| --- | --- | --- |
| scan apply | 隐藏/禁用 | 会写 library/source manifests。 |
| 自动 ready publish worker | 禁用 | 会改变 Cutter 可见 release/index。 |
| 发布到 Cutter | 禁用 | v0.1 不改变 `v010471`。 |
| index repair | 禁用 | 会写 index/release 和 manifest。 |
| command snapshot restore | 隐藏 | L5 高风险恢复操作。 |
| source folder 增删改 | 禁用 | 会改变后续扫描范围。 |
| 初始化生产素材库 | 禁用，除非协议缺失且单独维护 | 生产库已有协议树。 |
| ready 行 queue/retry/recover | 后端强阻断 | 防止 ready 重新预处理或下线。 |
| metadata/cover 编辑 | 默认禁用 | 非核心需求，v0.1 暂不开放。 |

## 受控预处理模式

MVP v0.1 的预处理不是“完全开放预处理”，而是 `Controlled Preprocess Mode`。

### 允许

- 查看预处理队列和处理历史。
- 查看单个任务日志。
- 对非 ready 素材执行 queue、retry、recover。
- 启动和停止预处理 supervisor。
- 让 worker 处理非 ready 素材。
- 处理完成后进入 `index-required`。

### 禁止

- 对 ready 素材执行 queue、retry、recover。
- 对 ready 素材重新处理。
- 自动把 `index-required` 发布到 Cutter。
- 自动改变当前 release/index。
- 在磁盘 blocked、ASR/FFmpeg/path 缺失、writer lease 被占用、supervisor 状态不安全时启动。

### 强制门禁

每个预处理写操作都必须通过：

- path profile 检查；
- Docker `/data/PublicLibrary` 路径检查；
- disk safety；
- ASR/FFmpeg readiness；
- writer lease；
- ready immutable guard；
- supervisor state guard；
- command audit；
- before/after ready count check；
- no Cutter release/index mutation check。

## 阶段计划

### Phase 0: MVP 基线与计划冻结

目标：

- 把本文件作为当前开发执行合同。
- 用只读方式确认 NAS/Mac/Docker/Cutter 边界。
- 明确首批代码改动文件和验收矩阵。

不做：

- 不改生产代码。
- 不写 NAS 数据。
- 不启动 worker。
- 不上传 Docker。

验收：

- 本文件存在并通过 markdown/diff 检查。
- 记录当前 ready/index/total/disk/API mismatch。
- 明确 Phase 1 具体改动范围。

### Phase 1: MVP 表面收敛与安全 Gate

目标：

- 管理端 UI 只暴露 MVP 核心功能。
- 高风险按钮隐藏或禁用。
- 后端增加统一 Docker MVP safety gate，防止 UI 漏出时误写。

预计改动模块：

- `apps/admin-web/src/app/navigation.ts`
- `apps/admin-web/src/app/AdminApp.tsx`
- `apps/admin-web/src/features/admin-ui-contract.ts`
- `apps/admin-web/src/features/dashboard/DashboardPage.tsx`
- `apps/admin-web/src/features/source-videos/SourceVideosPage.tsx`
- `apps/admin-web/src/features/preprocess-jobs/PreprocessJobsPage.tsx`
- `apps/admin-web/src/features/cutter-users/CutterUsersPage.tsx`
- `apps/admin-web/src/features/settings/SettingsPage.tsx`
- `apps/admin-web/src/features/index-publish/IndexPublishPage.tsx`
- `packages/admin-api/src/admin-command-guard.ts`
- `packages/admin-api/src/admin-preprocess-command-routes.ts`
- `packages/admin-api/src/admin-source-video-command-routes.ts`
- `packages/admin-api/src/admin-library-command-routes.ts`
- `packages/admin-api/src/admin-index-command-routes.ts`
- `packages/admin-api/src/admin-write-route-audit.ts`

验收：

- MVP 导航只显示核心入口或危险入口只读化。
- 所有 L4/L5 操作在 MVP mode 下返回明确 blocked。
- ready 行预处理写操作返回 `409 preprocess_transition_blocked` 或等价错误。
- Admin Web 单元测试通过。
- Admin API command/gate 测试通过。

### Phase 2: 登录与剪辑师管理闭环

目标：

- Docker 内 admin user store 和 cutter user store 可稳定写入。
- 剪辑师管理进入 MVP 可用范围。

预计改动模块：

- `packages/library-fs/src/admin-users.ts`
- `packages/library-fs/src/cutter-users.ts`
- `packages/admin-api/src/admin-auth-routes.ts`
- `packages/admin-api/src/admin-cutter-user-command-routes.ts`
- `packages/admin-api/src/admin-cutter-user-commands.ts`
- `apps/admin-web/src/features/cutter-users/CutterUsersPage.tsx`
- `deploy/nas/mixlab/docker-compose.yml`

验收：

- `auth/bootstrap`、`auth/register`、`auth/login`、`auth/status`、`auth/logout` 通过。
- `cutter-users` 列表、审批、停用、重置密码通过。
- 明文密码、session token 不进入日志、审计或报告。
- 普通 session validation 不重写用户文件。

### Phase 3: 受控预处理模式闭环

目标：

- 预处理可在 Docker 管理端里使用。
- 仅非 ready 素材进入预处理。
- 预处理前后 Cutter 当前可见素材不变。

预计改动模块：

- `packages/admin-api/src/admin-preprocess-pipeline.ts`
- `packages/admin-api/src/admin-preprocess-command-routes.ts`
- `packages/admin-api/src/admin-transition-commands.ts`
- `packages/admin-api/src/admin-worker-lifecycle-commands.ts`
- `packages/admin-api/src/admin-worker-write-path-audit.ts`
- `packages/library-fs/src/preprocess-safety.ts`
- `packages/preprocess-core/src/library-worker.ts`
- `scripts/workers/preprocess-library-worker.ts`
- `scripts/docker/admin-worker-loop.ts`
- `deploy/nas/mixlab/docker-compose.yml`
- `apps/admin-web/src/features/preprocess-jobs/PreprocessJobsPage.tsx`

验收：

- disk blocked 时 start preprocess 被阻断。
- path/asr/ffmpeg 缺失时 start preprocess 被阻断。
- ready 素材无法 queue/retry/recover。
- queued/failed 非 ready 素材可小批量进入预处理。
- worker 默认关闭，只有受控启动路径能启用。
- 预处理完成后进入 `index-required`，不自动进入 Cutter release。
- ready count 和 current index 不变。

### Phase 4: Docker Staging 候选

目标：

- 新版 admin-web/admin-api/admin-worker 可作为 staging 候选运行。
- 新旧入口不混淆。
- Docker 内路径、版本、健康检查可验证。

预计改动模块：

- `deploy/nas/mixlab/docker-compose.yml`
- `deploy/nas/mixlab/.env.example`
- `docker/admin-runtime.Dockerfile`
- `docker/admin-web.Dockerfile`
- `.github/workflows/docker-admin.yml`
- `scripts/acceptance/admin-docker-candidate-contract-proof.ts`
- `scripts/acceptance/admin-docker-candidate-ref-proof.ts`
- `scripts/acceptance/admin-docker-release-readiness-summary.ts`
- `scripts/acceptance/admin-worker-env-proof.ts`

验收：

- `/health` 通过。
- `/api/admin/auth/status` 不是旧 API 404。
- `/api/admin/data-loading/plan` 可用。
- `/api/admin/release-gates` 可用。
- Docker 内 `MIXLAB_ADMIN_LIBRARY_ROOT=/data/PublicLibrary`。
- `MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=0` 默认。
- `MIXLAB_ENABLE_READY_PUBLISH_WORKER=0` 默认。
- 候选 release ref 固定到已 smoke 的 commit，tag-ref `push_images=false` dry-run 通过。

### Phase 5: Cutter 不受影响验收

目标：

- 新 Docker MVP 启动和受控预处理不会影响 Cutter 日常使用。

验收：

- Docker MVP 前后 ready count 均为 `10471`。
- Docker MVP 前后 current index 均为 `v010471`。
- Cutter 公共素材首屏可用。
- Cutter 搜索可用。
- Cutter 详情可用。
- Cutter 真实剪切 smoke 可用。
- Cutter 登录/剪辑师准入符合预期。

### Phase 6: MVP 后中长期架构继续

MVP v0.1 通过后再进入：

- v0.2：受控发布 canary。
- v0.3：scan-preview/scan-apply 完整化。
- v0.4：read model 全面化和慢列表深度优化。
- v0.5：页面信息架构精修。
- v0.6：冗余代码删除和旧路由清理。
- v1.0：正式替换旧 NAS 管理端入口。

## 第一批实施目标

第一批只做 Phase 1 的最小可验证切片：

1. 新增 MVP mode contract。
2. 前端隐藏或禁用非 MVP 高风险入口。
3. 后端对 L4/L5 命令加 MVP blocked gate。
4. 保留登录、剪辑师、预处理只读和受控预处理入口。
5. 补充测试，证明 UI 漏出也不能越过后端 gate。

第一批不做 Docker 上传，不跑真实 NAS 写操作，不启动真实 worker。

## 通过标准

MVP v0.1 只有在以下全部满足时才算完成：

- 管理端登录可用。
- 剪辑师管理可用。
- 预处理可在受控模式下处理非 ready 素材。
- ready 素材不被误改。
- current index 不变。
- Cutter smoke 通过。
- Docker health/version/path/gate 通过。
- 高风险命令默认禁用或隐藏。
- worker 默认不自动写生产库。
- 回滚路径明确。

## 回滚策略

- Docker staging 不替换旧入口前，回滚为停止 staging 容器。
- 若替换旧入口，必须保留旧镜像 tag、旧 compose/env、旧端口记录。
- 任何涉及用户存储、usage-events、index、admin-read-model 的上线前必须有只读备份清单。
- MVP v0.1 不修改 Cutter release/index，因此 Cutter 回滚应不需要发布索引回退。

## 专业角色审评

Project Architect 结论：

- 通过。该计划没有缩小长期 `Admin Architecture v1`，而是把当前目标收敛成可上线、可验证的核心架构 MVP。
- 风险控制正确：预处理被保留，但放入受控模式；发布、扫描、恢复、索引修复被推迟。

Delivery Lead 结论：

- 通过但有约束。第一批只能做 MVP surface/gate，不允许 NAS 写入、Docker 上传、worker 启动、Cutter 协议变更。
- 每个后续阶段必须保留 before/after ready count、current index、Cutter smoke 证据。
