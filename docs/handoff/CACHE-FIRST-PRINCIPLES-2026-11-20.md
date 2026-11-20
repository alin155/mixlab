# Cutter 缓存问题的第一性原理分析

日期：2026-11-20  
范围：Cutter 客户端 Release 缓存 / searchd / 源视频预检 / 缓存同步  
状态：方案建议，未实现，未发布

## 1. 现象

近期缓存问题不是单一 bug，而是同一组结构性问题的不同表现：

- 阳慧机器 Release 缓存停在 v011224，服务端已 v012807；
- 缓存管理显示 Release 1/2 个版本、同步失败；
- 搜索索引仍为 11,335 条，当前应为 12,975 条；
- searchd 反复启动，sidecar 反复 starting/ready；
- 源视频预检命中读取错误后，整批缓存同步失败；
- 自有/项目缓存根目录在 C:、D:、项目目录之间切换；
- 客户端仍有旧 thumbnails 路径和旧 release 引用；
- 用户搜索 C1236 为 0，但索引已有 2 条；Windows 0.18.33 实测同索引可返回 2 条。

## 2. 第一性原理

缓存不是“复制一堆文件”，而是：

> 对服务端不可变 Release 的本地派生视图（materialized view）。

一个可靠的派生视图必须满足：

1. **单一版本**：任意时刻只服务一个明确的 Release。
2. **原子性**：要么完整可用，要么保留旧版本；不能半新半旧。
3. **可验证**：每个 Release 有 manifest 和哈希，客户端能校验。
4. **可恢复**：网络/文件失败可重试、续传，不要求人工猜。
5. **可丢弃**：缓存损坏时删除重建，不影响源素材和工程。
6. **故障隔离**：一个源视频不可读，不应让整个 Release 不可用。
7. **可观测**：客户端必须知道“目标版本 / 实际版本 / 同步阶段 / 最后错误”。

当前实现缺的不是某个清理函数，而是上述**缓存生命周期契约**。

## 3. 根因

### 根因 A：没有版本状态机

客户端没有权威的：

```
target_release  ->  syncing  ->  verified  ->  active
                         \-> failed (保留旧 active)
```

Release 文件、searchd 索引、thumbnails、配置各自独立更新，导致：

- 旧 release 的 search index 仍被 searchd 使用；
- 新 release 只同步了一部分；
- UI 显示“同步失败”，但 searchd 仍用旧数据；
- 重启后状态更混乱。

### 根因 B：同步是 all-or-nothing，且被源视频预检拖死

源视频预检失败 → 整批 Release 同步失败。  
但“源视频是否可读”与“Release 元数据/搜索索引是否可同步”是不同故障域，应该隔离：

- Release 同步：必须保证完整、可校验；
- 源视频读取：单文件失败应标记 `source_unavailable`，不应阻断搜索索引；
- 一个坏文件不能拖垮 13,000 条素材的搜索。

### 根因 C：缓存根目录不唯一

同一台机器上存在：

- `%LOCALAPPDATA%\MixLab Cutter\cache\searchd`
- `%USERPROFILE%\Videos\MixLabLocal\cache`
- `D:\MixLab Cutter\cache`
- 项目目录 `...\cache`

不同组件读不同根，旧路径残留，无法判断哪个是权威状态。

### 根因 D：searchd 生命周期没有监管

searchd 启动失败/索引不匹配时：

- 没有指数退避；
- 没有最大重启次数；
- 没有“当前缓存不可用”的明确错误；
- 没有在启动前校验 active release 与 index manifest 一致。

结果是无限重启循环，把缓存问题放大成整机卡死。

### 根因 E：大索引全量复制，没有增量/校验

每个 Release 复制约 2GB search index/thumbnails 到 Windows 本地。  
SMB 上任意抖动、磁盘空间、杀毒软件、旧文件锁都会导致全量失败，且无法只补差异。

## 4. 根本方案

### 4.1 单一缓存根 + 状态文件

```
%LOCALAPPDATA%\MixLab Cutter\cache\
  state.json
  releases\
    v012807\
      manifest.json
      catalog.sqlite
      search-index\
      thumbnails\
      transcript-pack\
  staging\
  quarantine\
```

`state.json` 至少包含：

```json
{
  "schema_version": 1,
  "target_release": "v012807",
  "active_release": "v012806",
  "status": "syncing",
  "manifest_sha256": "...",
  "last_error": "",
  "updated_at": "..."
}
```

规则：

- 只允许一个缓存根；
- 旧 root 启动时迁移/清理，不再作为可选路径；
- `active_release` 只能指向已验证 Release；
- searchd 启动参数只接受 `active_release` 目录；
- 状态文件原子写。

### 4.2 事务式 Release 同步

1. 读取服务端 `current-release.json` 和 manifest SHA256；
2. 下载到 `staging/<release>.<pid>`；
3. 每个文件校验 size + SHA256；
4. 全部完成后原子重命名到 `releases/<release>`；
5. 更新 `state.json`：`target=active=<release>`；
6. 启动/重启 searchd；
7. GC 保留 active + 上一版，其余删除。

失败时：

- 保留旧 active；
- staging 标记 failed；
- UI 展示具体失败文件和阶段；
- 重试只补失败项。

### 4.3 源视频预检与 Release 同步解耦

- Release 同步不再遍历所有源视频；
- 源视频可用性只在打开/剪取时校验；
- 预检发现不可读文件：
  - 记录 `source_unavailable`；
  - 继续同步 Release；
  - UI 单独展示“不可读源视频”列表；
- 一个坏文件不再阻断全库搜索。

### 4.4 searchd 监管

- 启动前校验：
  - `active_release` 存在；
  - index manifest 的 `source_index_version` 与 active 一致；
  - catalog/search index 完整；
- 启动失败指数退避（1s/5s/30s/5min），最多 3 次；
- 超过上限：停止重启，上报 `cache_runtime_unavailable`，Cutter 降级到 API/服务端搜索；
- UI 提供“一键修复缓存”，但不再要求用户理解 sidecar。

### 4.5 增量交付

Release manifest 使用内容寻址：

- 文件级 SHA256；
- 未变化文件不重复下载；
- 大索引分块，支持 Range/续传；
- 客户端按 hash 组装，不依赖“版本目录整体复制”。

这是把 2GB 全量复制变成“只传变化块”，从根上降低 SMB 抖动影响。

### 4.6 服务端权威搜索（中长期）

如果本地索引仍然是故障源，最彻底的方案是：

- Cutter 搜索默认走服务端 search API；
- 本地只缓存缩略图/最近访问的 transcript；
- 本地 searchd 作为离线/LAN 不可用时的可选降级。

这样客户端缓存不再决定搜索是否可用。

## 5. 分阶段落地

### Phase 1：止血（0.18.33.x）

- 源视频预检失败不阻断 Release 同步；
- searchd 重启加退避和上限；
- 缓存根唯一化，旧路径迁移；
- 增加 `state.json` 和缓存诊断包；
- 一键修复缓存保留为兜底。

### Phase 2：事务缓存

- staging + 校验 + 原子切换 + GC；
- searchd 只服务 active release；
- UI 显示目标版本/实际版本/同步阶段。

### Phase 3：增量交付

- manifest 文件哈希；
- 断点续传；
- 只下载变化内容。

### Phase 4：服务端搜索

- 搜索服务端权威；
- 本地缓存降级为可选。

## 6. 验证指标

- 缓存版本与服务端 release 一致率；
- 同步成功率/失败阶段分布；
- searchd 重启次数/小时；
- 不可读源视频数量与具体路径；
- C1236 等回归用例命中率；
- 一次同步平均耗时/流量；
- “一键修复缓存”使用率与二次失败率。

## 7. 结论

阳慧机器的问题不是“缓存脏了”，而是：

> 客户端把一个全局、版本化、可校验的 Release，当成了多目录、可变、无事务、无健康检查的本地文件集合。

清理缓存只能恢复单机；  
要从根本解决，必须把缓存升级为**单根、版本化、事务化、可验证、故障隔离**的派生视图。
