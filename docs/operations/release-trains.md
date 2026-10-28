# 发布列车与灰度/回滚运行手册（Round6 补充）

> 范围：公共素材库 release 指针（`<PublicLibrary>/.mixlab-library/current-release.json`）。工具：`scripts/operations/release-rollback.ts`（默认 dry-run）。本文件只描述发布/回滚操作，不改变管理端发布代码。

## 1. 发布列车（canary 流程）

1. **发布制品但不切指针**：管理端创建新 release 版本（`releases/<version>/`，含 legacy 制品 release.json/catalog.sqlite/source-path-map.json/search-index/**/index.sqlite；可附带 `release-manifest-v2.json`）。此阶段 `current-release.json` 保持不变，现网剪辑端继续读旧版本（客户端缓存/pin 不受影响）。
2. **小范围验证**：在隔离库/测试机用 `MIXLAB_CUTTER_RELEASE_CACHE_ROOT` 指向临时 cache，验证：源检索/文案/剪切/字幕/封面、v2 校验（若存在 manifest v2 则逐文件 hash 通过）、旧客户端可用。验证记录附件与版本号。
3. **切指针**：确认后由管理员原子切换 `current-release.json` 到新版本（发布流程自带 tmp+rename；旧指针建议保留备份）。
4. **观察窗口**：保留上一版本目录与 `previous-current-release.json`，观察客户端缓存同步、搜索/剪辑错误率；不要立即清理旧版本。
5. **回滚条件**：发布后出现成片错误、搜索不可用、客户端持续失败且无法在观察窗口内修复 → 执行回滚（见 §2）。

## 2. 回滚（切回上一可用 release）

回滚 = **原子切回上一 release 指针**，不删除新版本产物、不清理客户端缓存/历史作品。

```bash
# 1) dry-run：列出可回滚目标（上一条 previous 指针优先，其次最近可用历史版本）与命令
node --import tsx scripts/operations/release-rollback.ts --library-root "<PublicLibrary路径>"

# 2) 查看目标校验结果（legacy 制品完整性；仅 v2 无 legacy 的目标会被拒绝）
node --import tsx scripts/operations/release-rollback.ts --library-root "<路径>" --to v000123

# 3) 执行回滚（必须填写原因，写入审计 JSONL）
node --import tsx scripts/operations/release-rollback.ts --library-root "<路径>" --to v000123 \
  --apply --operator "<操作者>" --reason "v000124 灰度异常：..."

# 4) 校验
node --import tsx scripts/operations/release-rollback.ts --library-root "<路径>"   # current 已切回目标
cat "<路径>/.mixlab-library/previous-current-release.json"                            # 被回滚版本的指针备份
tail -n 3 "<路径>/.mixlab-library/release-rollback-audit.jsonl"                       # 审计记录
```

安全语义：
- **失败不动现指针**：目标校验失败、并发锁被占、指针在计划后被外部改动、写盘异常时，`current-release.json` 保持原样。
- 回滚前把旧指针备份到 `previous-current-release.json`，再 tmp+rename 原子切换；全程持有 `.release-rollback.lock`（陈旧 60s 可回收）。
- 审计 JSONL：`{schema_version, action:"release_rollback", at, operator, reason, from_version, to_version, verify:{ok,checks,blocking_reasons}}`，文件 0600。
- 目标必须能被当前 cutter 消费端读取：legacy 制品齐全；仅有 Manifest v2、没有 legacy 目录/文件的版本会被明确拒绝（提示消费端版本要求），需要先升级消费端或选择含 legacy 制品的版本。

## 3. 风险与边界

- **客户端缓存/pin**：回滚只改发布指针；剪辑端本地缓存按版本缓存，Round2 的 workspace 引用保护（pinned_release_versions）与 Round3 v2 校验 sidecar 不会因回滚被清理。客户端会在下一次同步时拉到“更旧”的 current 版本（版本号下降不是递增，客户端需按指针而非版本号大小判断）。
- **本地作品引用**：已导出的作品不受回滚影响；引用旧 release 的历史项目继续读本地 cache，若 cache 已被淘汰需按保留策略恢复（见发布缓存策略）。
- **v2 校验**：目标含 manifest v2 时，客户端会重新做逐文件 hash 校验；回滚前后应保留目标目录完整，不要清理。
- **发布列车禁止**：回滚期间不要同时发布/删除 releases；并发写由文件锁拒绝（`ROLLBACK_LOCKED`）。
- **审计**：审计文件默认写在库内 `.mixlab-library/`；如库对客户端只读，建议用 `--audit-file` 指向管理员本机路径。
