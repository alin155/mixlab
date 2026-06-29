# Preprocess Production v1 Plan

更新时间：2026-06-29 UTC

## 总目标

在不影响 Admin Docker MVP 稳定性、Admin Architecture v1 中长期重构计划、以及 Windows 剪辑端日常使用的前提下，把管理端预处理从“可手动触发的高风险能力”升级为“可受控、可观察、可暂停、可恢复、可批量推进”的生产能力。

核心结果：

- 保护现有 `10471` 条 ready 素材不被误删、误重跑、误下线。
- 保护当前剪辑端 release/index `v010471`，预处理新增成果默认只进入 `index-required`，不自动对剪辑端可见。
- 让剩余 queued 素材可以从单条、小批量、长跑窗口逐步推进。
- 所有预处理动作都有前置快照、后置校验、审计证据、失败隔离和回滚边界。
- 不把预处理生产化和 Admin Architecture v1 的页面/API/read-model 重构混成一个不可控大改。

## 当前已验证状态

- NAS Docker 管理端运行候选仍是 `7f522691369862093257c228b4fdace00e20d1fa`。
- 验收工具修正提交为 `8b91445`，只影响本地/CI acceptance 脚本和证据，不刷新 Docker runtime/web/worker 镜像。
- NAS worker 默认保持受控：
  - `MIXLAB_ADMIN_DOCKER_MVP_MODE=v0.1`
  - `MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=0`
  - `MIXLAB_ENABLE_READY_PUBLISH_WORKER=0`
  - `MIXLAB_PREPROCESS_LIBRARY_ROOT=/data/PublicLibrary`
- 最新预处理 readiness：`docs/acceptance/artifacts/admin-preprocess-production-readiness-20260629T192534Z.json`
  - status: `ready-for-single-video-review`
  - phase 0/1 readiness ready: true
- 已真实执行单条 canary：
  - `V000038` -> `index-required`
  - `V000358` -> `index-required`
  - `V000107` -> `index-required`
  - `V000167` -> `index-required`
- 第一条完整 passing execute smoke：`docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T192603Z.json`
  - source: `V000167`
  - status: `passed`
  - ready after: `10471`
  - current index after: `v010471`
  - direct library after: queued `899`, processing `0`, index-required `24`
  - direct source/job/library JSON: no trailing NUL
  - SMB refresh was required and succeeded, proving previous direct-read failures were Mac SMB stale-view false negatives.

## 本计划不做什么

- 不发布新 Cutter index/release。
- 不让新增 `index-required` 自动对剪辑师可见。
- 不启用常驻自动 preprocess worker。
- 不自动处理全部 queued。
- 不重新预处理现有 ready 素材。
- 不改变 NAS 公共素材库目录结构。
- 不改变 Cutter 当前 release 读取协议。
- 不把 Admin Architecture v1 的 read-model、页面 IA、API 分层全部塞进预处理生产化阶段。

## 安全原则

1. 文件系统是资产事实来源，但页面查询和批量决策不能依赖临时全库扫描。
2. ready 素材不可变：除非进入单独发布/恢复门禁，否则预处理不能修改 ready 可见状态。
3. 单条和批量预处理只允许 `queued -> processing -> index-required`。
4. 每次真实执行必须记录 before/after：
   - ready count
   - queued count
   - processing count
   - index-required count
   - current index version
   - selected source id list
   - direct NAS files state
5. 任意一步失败，停止扩大批量；失败项保持 hidden，不影响剪辑端 ready release。
6. Mac SMB 直读证据必须允许 refresh/remount 后复核，避免把客户端缓存旧视图误判为 NAS 写入失败。

## 分阶段实施

### Phase 0：基线冻结与门禁

状态：已完成。

目标：

- 确认 NAS Docker 使用新版 MVP runtime。
- 确认 worker 不会自动跑全库。
- 确认 disk、library root、Cutter Windows baseline、ready/index 基线可验。

验收：

- NAS live readonly 报告显示 `/data/PublicLibrary`、ready `10471`、current index `v010471`。
- worker env proof accepted。
- Windows Cutter acceptance 报告显示 `available_video_count=10471`。
- readiness 进入 `ready-for-single-video-review`。

### Phase 1：单条真实 canary

状态：已完成首条 passing smoke。

目标：

- 选一条 queued 且 hidden 的真实小视频。
- 使用 Admin API 执行 `limit=1 + source_video_id`。
- 验证只处理目标视频，结果进入 `index-required`。
- 验证 ready count 和 current index 不变。

当前证据：

- passing execute smoke：`admin-preprocess-single-video-smoke-20260629T192603Z.json`
- source `V000167` 从 queued 进入 `index-required`。
- ready `10471` 和 `v010471` 保持不变。

### Phase 2：小批量 5-10 条受控预处理

状态：下一步。

目标：

- 选择 5-10 条 queued、hidden、源文件实际存在、单文件体积适中的视频。
- 顺序执行，不并发；每条仍走 single-target 命令，避免一次命令影响多个未知项。
- 每条完成后立即做 API + direct NAS post-check。
- 任意一条失败即停止批次，生成 batch report。

建议实现：

- 新增 `admin-preprocess-small-batch-smoke.ts`，复用 single-video smoke。
- 输入为显式 source id 列表，不自动全库扫描。
- 默认 `max_count=5`，后续可扩到 `10`。
- 支持 `stop_on_failure=true`。
- 支持 batch before/after 汇总和每条 artifact 链接。

验收：

- batch report status: `passed`。
- 每条 source/job 进入 `index-required` 且 `visible_to_cutters=false`。
- ready count 保持 `10471`。
- current index 保持 `v010471`。
- processing count 归零。
- failed count 不新增，或失败项被隔离并记录。
- Windows Cutter acceptance 可复用现有 release cache，公共素材数量仍 `10471`。

### Phase 3：低并发长跑窗口

状态：未开始。

目标：

- 从顺序单条扩展为低并发或小步长长跑，例如每轮 10-20 条。
- 每轮之间做安全检查和磁盘检查。
- 可暂停、可恢复、可查看进度。

门禁：

- 不启用常驻 worker。
- 只允许维护窗口内手动启动 supervisor。
- 每轮必须有 batch report。
- 连续失败超过阈值自动停止。

验收：

- 至少 2 轮小批量通过。
- 每轮后 ready/index 不变。
- NAS disk 仍 healthy。
- Cutter Windows acceptance 或 real cut smoke 至少保留一份最近证据。

### Phase 4：生产化运行策略

状态：未开始。

目标：

- 明确 queued 存量处理节奏。
- 建立错误分类：ASR 失败、FFmpeg 失败、源文件缺失、SMB/NAS 读写异常、manifest 格式异常。
- 建立 dashboard/protection center 可读的 progress 和 failure summary。

验收：

- 管理端可以看到 batch progress、last run、failure isolation、retry candidate。
- 失败视频不会阻断后续视频。
- 可从 report 恢复某个明确 source id，不做模糊批量恢复。

### Phase 5：发布与剪辑端可见性

状态：不在当前阶段执行。

目标：

- 当足够多视频进入 `index-required` 后，再进入单独发布计划。
- 发布计划必须重新验证 Cutter release/index、Windows acceptance、真实剪切和回滚。

当前限制：

- Preprocess Production v1 只负责生成 `index-required`。
- 是否发布给剪辑端是单独 release decision。

## 下一步执行目标

1. 实现 `admin-preprocess-small-batch-smoke.ts`，只接受显式 source id 列表。
2. 自动选择候选时只用 Admin read-model/API 分页，不做全库 NAS 扫描。
3. 先 dry-run 生成 batch candidate report。
4. 执行 5 条小批量，stop-on-failure。
5. 补 Windows Cutter acceptance 或引用最新未漂移证据。
6. 通过后再讨论是否扩到 10 条和长跑窗口。

## 回滚与停止条件

立即停止扩大批量的条件：

- ready count 不是 `10471`。
- current index 不是 `v010471`。
- 任一处理后视频变成 `visible_to_cutters=true`。
- processing count 长时间不归零。
- direct NAS 文件出现不可解析 JSON。
- 新增 trailing NUL 且 refresh/remount 后仍存在。
- Windows Cutter public library 数量或真实剪切失败。
- NAS disk 进入 warning/block。

可回滚范围：

- 当前阶段不发布 index，因此 Cutter 可见素材可通过保持 `v010471` 不变来保护。
- 单条预处理失败只隔离该 source id，不影响 ready release。
- 若 batch report 失败，下一批不得继续，先修复失败分类和恢复策略。
