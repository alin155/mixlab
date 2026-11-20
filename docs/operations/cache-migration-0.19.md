# 0.19 缓存迁移与回滚（canonical release cache root）

> 适用版本：0.18.34（Phase 1 状态：sync-state/复制重试）→ 0.19 Phase 2（canonical root、迁移、searchd 生命周期）。不包含版本号/安装包/发布变更。

## 1. 新的 canonical release cache root

| 平台 | 默认路径 |
|---|---|
| Windows | `%LOCALAPPDATA%\MixLab Cutter\cache` |
| macOS | `~/Library/Application Support/MixLab Cutter/cache` |
| Linux | `$XDG_CACHE_HOME/mixlab-cutter/cache`（缺省 `~/.cache/mixlab-cutter/cache`） |

- 由 `packages/desktop-runtime` 统一解析：Tauri（searchd `--release-root` / `--cache-root`）、cutter-api sidecar、desktop-runtime 使用**同一个 root**；显式 `MIXLAB_CUTTER_RELEASE_CACHE_ROOT` 仍可覆盖（测试/运维）。
- 缓存不再绑定 `local_workspace_root`：工作区可以继续放 NAS/移动盘，缓存固定在本机用户目录，避免 network share 上的索引/复制抖动。
- searchd 缓存目录 = `<canonical root>/searchd`。

## 2. 从 0.18 迁移（旧 workspace/cache）

- 启动时 cutter-api（sidecar）检测 `<workspace>/cache`（例如 `Videos\MixLabLocal\cache`、`D:\MixLab Cutter\cache`）：
  - 若 canonical root **尚无** `current-release.json`：把旧 `.mixlab-library` 复制到 canonical root 的同盘临时目录，写 `cache-migration.json`（source/from/to/active/release_versions）后原子 rename；旧目录**保留不删**。
  - 若 canonical 已存在 active 指针：跳过迁移（`canonical_already_present`），不覆盖新缓存。
  - 若旧 active release 制品不完整（缺 catalog/source-path-map/index）：放弃复制并记录 `legacy_active_release_incomplete`，后续正常同步会从发布源安全重建（不会丢服务器权威数据）。
  - 迁移读写失败只记录日志（`release_cache_migration_skipped`），**不阻塞启动**。
- 迁移后 sync-state 写入 ready（target/active=旧 active），Phase 1 诊断字段继续可用。

## 3. 启动校验（active release / manifest / index）

- 启动时校验 canonical cache 的 `current-release.json`、release.json/catalog、搜索索引；无本地缓存（首次运行）视为正常等待同步，不写 failed。
- 有 active 但制品/索引不完整：保留当前指针与缓存（不删除、不切换），写失败 sync-state（`STARTUP_CACHE_INVALID`，含真实原因）；Cutter API/缓存管理页可看到 phase/last_error。修复后重新校验通过。
- 首次/空缓存不会因校验失败阻塞启动。

## 4. searchd 生命周期

- 启动/配置不匹配/健康检查失败：同一进程最多尝试 3 次，指数退避 2s → 10s → 60s；成功后计数归零。
- 达上限后停止重启循环并写 `searchd_start_attempts_exhausted` 日志，本机 Cutter API 继续启动，搜索降级为本地 sqlite/transcript fallback（不破坏既有 fallback）。
- 不因缓存未就绪/索引版本不匹配无限重启；缓存同步完成后下次启动或引擎重启可恢复 searchd。

## 5. 回滚路径（0.19 → 0.18.34）

1. 退出 0.19 应用/引擎。
2. 旧 `<workspace>/cache` 未被删除，可直接使用：启动旧版本（0.18.34）会继续读 workspace cache；或设置 `MIXLAB_CUTTER_RELEASE_CACHE_ROOT=<旧 cache 路径>` 指向旧目录。
3. 如需把 canonical 缓存回给旧版本：复制 canonical 内容到旧 workspace cache（旧版本只认 workspace/cache），保留 canonical 不动作为备份。
4. 回滚不影响公共库发布指针；已导出作品/历史引用保留（见 release-trains.md 回滚章节）。
5. 确认旧版本稳定前不要删除 canonical 或旧 cache；迁移标记文件可用于核对 from/to。

## 6. 验证命令

```bash
# 相关测试（本机，临时目录，不接触真实 NAS）
node --test --import tsx packages/desktop-runtime/src/index.test.ts
node --test --import tsx packages/library-fs/src/cutter-release-cache.test.ts
node --test --import tsx packages/cutter-api/src/index.test.ts
# Rust：searchd 退避/上限 + canonical root（Windows/macOS/Linux 纯函数）
(cd apps/cutter-desktop/src-tauri && cargo test --offline)
# 类型检查
npx tsc -p tsconfig.json --noEmit
```

已知边界：本机未做真实 Windows 安装包/真实 NAS 验收；canonical root 位于用户本机盘，磁盘空间不足时按 Phase 1 sync-state/缓存淘汰策略处理。
