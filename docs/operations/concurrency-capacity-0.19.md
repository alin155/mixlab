# 0.19 并发容量治理与发布门禁（50+ 剪辑师）

> 本文件记录 0.19 Phase 2（并发容量）实现、压测 harness 与发布门禁状态。**0.19 未通过真实环境压测前不得发布；0.18.34 不发布。**

## 1. 剪切容量治理（cutter-local + cutter-api）

- 全局 slot：`MIXLAB_CUTTER_CUT_MAX_SLOTS`（默认 2，范围 1..8），每个任务启动前获取 slot 租约；任务结束 finally 释放，心跳 `MIXLAB_CUTTER_CUT_SLOT_HEARTBEAT_MS`（默认 5s），超时 `..._LEASE_TIMEOUT_MS`（默认 120s）视为泄漏自动回收并记录 `cut_slot_lease_reaped`。
- 排队与公平：pending 任务按创建时间 FIFO；每用户最多 `MIXLAB_CUTTER_CUT_MAX_SLOTS_PER_USER`（默认 1）个 slot，单个剪辑师不能占满全局 slot；50 请求同时到达时在 SQLite 队列中等待，无无限重试。
- 可观测：`GET /cutter/cut-queue/status` 返回 slot/每用户配额/active/排队数/每个排队任务 position 与预计等待；`GET /cutter/runtime-status` 含 `cut_capacity` 摘要。
- 搜索优先：`/cutter/source-search|source-library|source-folders` 活跃或慢搜索 p95>`MIXLAB_CUTTER_SEARCH_PRIORITY_P95_MS`（默认 150ms）时，派发暂停/降速（`search_priority_pause_ms`）；搜索流量结束后自动恢复，不影响 fallback。
- **跨客户端全局容量（NAS 共享目录 slot 锁）**：`<public_library_root>/.mixlab-library/capacity/cut-slots/` 下 N 个 `slot-XX.lock` 原子创建，50 台剪辑师共享 `MIXLAB_CUTTER_GLOBAL_MAX_SLOTS`（默认 4）；每次任务启动前 acquire 全局 slot、心跳刷 mtime（`MIXLAB_CUTTER_GLOBAL_HEARTBEAT_MS` 默认 10s）、任务结束 release；租约超时（TTL 60s）被其他客户端原子 rename 回收，覆盖客户端崩溃。
- 全局排队：等待票据 `queue/<created_at_ms>-<ticket>.json` 按创建时间排序得到全局 position/预计等待；API `/cutter/cut-queue/status` 返回 `global_capacity`（active/waiting/max_slots）与 `global_queue`（position/ETA）。
- **协调不可用降级**：NAS 共享目录不可读写时抛 `global_capacity_unavailable`，本地 governor 立即降级为 conservative 1 slot（不是 50*2 全放开），任务仍可本地排队执行；恢复后自动回到正常 slot。
- **剪辑端 UI**：队列页显示“全局剪切排队：本机第 N 位 · 预计等待 X 秒”和“全局剪切并发 active/max slot · 全局等待 N 个任务”，协调降级时显示“协调服务不可用，已降级为本地保守 1 slot”（`runtime-status.cut_queue` 驱动，新增 UI 测试）。

## 2. Release 同步防雪崩（library-fs）

- 同一 cache root 跨进程文件锁 `.release-sync.lock`（10 分钟陈旧回收）：另一个进程正在同步时直接返回当前状态，不并发全量复制。
- 首次复制前 jitter：`MIXLAB_RELEASE_SYNC_JITTER_MS`（desktop env 默认 3000），50 客户端同时启动时错峰；已有 active 缓存不等待（Phase1 已保证不重复复制）。
- NAS 高延迟：复制最多 3 次重试（500ms/1500ms 退避）+ Phase1 sync-state 真实错误，失败保留旧 active；不会整机卡死，后续同步/重启重试。

## 3. 启动顺序/单飞（review 修复）

- Tauri `desktop_start_engine` 先执行 `prepare_release_cache_before_engine`（sidecar exe + `MIXLAB_CUTTER_CACHE_PREPARE_ONLY=1`，30s 有界），完成 legacy→canonical 迁移+启动校验后，才启动 searchd/sidecar；失败降级不阻塞 UI。
- `prepareCutterReleaseCacheForStartup` 使用跨进程 `.cache-prepare.lock` + 进程内单飞 Promise；release sync 入口会 await 该维护完成，迁移/校验期间绝不并发同步。
- v2 缓存允许缺少 Phase1 sync-state，不再误判 `STARTUP_CACHE_INVALID`；首次升级 canonical 空但 legacy 有 active 时先迁移再启动。
- searchd 启动改为非阻塞：同步只做一次快速 spawn/健康探测，剩余 2 次重试在后台线程按 2s/10s 退避；最坏不阻塞 UI 60s+；达上限停止循环，Cutter API 搜索降级 fallback。

## 4. 压测 harness

```bash
# 本地/QA smoke（临时库，不碰真实 NAS）
node --import tsx scripts/load/cutter-capacity-load.ts --clients=50 --search-ms=15000 --cut-jobs=50 --cut-ms=120 --slots=2

# 真实 0.19 发布门禁（Windows 构建机 + 真实 NAS，测试负责人签字）
node --import tsx scripts/load/cutter-capacity-load.ts --clients=50 --search-ms=600000 --cut-jobs=50 --report=<报告路径>
```

harness 记录：search p50/p95/p99、错误数；剪切完成/失败、观测最大并发 slot、最大队列深度、结束 active_slots（租约泄漏判定）、CPU user/sys、RSS、wall time；输出 JSON + markdown。

### 跨进程（等价 50 客户端）全局容量门禁

```bash
node --import tsx scripts/load/cutter-global-capacity-load.ts --clients=50 --slots=4 --hold-ms=300 --report=<报告路径>
```

- 父进程 + 50 个独立 Node 子进程共用同一 NAS 等价共享目录，验证：全局 active 峰值 ≤ slots、出现等待队列、50/50 完成、结束无 slot/queue 残留（租约泄漏=0）。

**本地跨进程 smoke（2026-11-20T09:28:48.968Z，产物 capacity-0.19-global-process.json/.md）**：50 进程、global slots=4、hold 300ms → 全局 active 峰值 **4/4**、等待峰值 **42**、50/50 成功、结束 active/waiting 0、残留 slot/queue 文件 0；wall 5.3s。

### 本地 smoke（2026-11-20T09:22:39.737Z，产物见 capacity-0.19-smoke.json/.md）

- 搜索 50 并发、5208 请求、2s 窗口（与剪切同时进行）：p50 18ms / **p95 25ms** / p99 44ms，**0 错误**（目标 p95<150ms）——本机空载 + 临时库，仅证明 harness/搜索优先链路可用，不代表 NAS 真实环境。
- 剪切：**50/50 完成**，失败 0；观测最大并发 slot **2/2**，最大排队 50，结束 active_slots **0（无租约泄漏）**。
- 资源：wall 5.2s，CPU user 5.2s / sys 2.3s，RSS 97→414MB（含测试库/服务预热；真实环境以 10 分钟长稳压测为准）。

## 5. 发布门禁（BLOCKED）

0.19 发布前必须满足：

1. Windows 构建机 + 真实 NAS 公共库执行 `--search-ms=600000 --clients=50`，搜索 p95<150ms、0 错误、searchd 不进入重启循环；
2. 50 剪切请求并发 slot 受限（≤配置上限）、排队可观测、结束无 active 租约泄漏、搜索 p95 劣化 ≤2x；
3. NAS 延迟/错误注入下退避/恢复、无整机卡死；
4. 报告由测试负责人签字归档；**本文件本地 smoke 不替代真实门禁**。

当前状态：本地进程内 50-client smoke PASS + 50 跨进程全局 slot 门禁 smoke PASS（active 峰值 4/4、无泄漏）；**真实 Windows 构建机 + 真实 NAS 10 分钟 50 客户端门禁仍未执行并签字 → 0.19 不可发布**；0.18.34 继续不发布。
