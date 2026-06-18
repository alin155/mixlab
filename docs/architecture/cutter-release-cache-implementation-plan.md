# MixLab Cutter Release / Local Cache Architecture Implementation Plan

## 目标

从底层架构解决管理端和剪辑端的卡顿问题，而不是继续做页面级补丁。

核心目标：

- 管理端负责生产和发布剪辑端可消费的 release。
- NAS 作为原视频和 release 的发布源，不再作为剪辑端运行时数据库。
- Windows 剪辑端优先读取本机缓存。
- 首页、公共素材库、关键词搜索、选中素材、剪切任务都不能被 NAS 慢 I/O 阻塞。
- 已经预处理好的旧视频不重新转写、不重新抽帧，只基于已有 artifacts 重新生成剪辑端 release。

## 是否先完整改管理端，再改剪辑端？

不建议。

原因：

- 如果先一次性把管理端全部改完，剪辑端没有同步消费能力，无法验证 release 设计是否真的适合 Windows 性能场景。
- 如果先完整改剪辑端，没有管理端稳定 release，剪辑端只能继续读旧 NAS 文件结构，仍然会卡。
- 最安全的方式是协议先行，然后每阶段做一条端到端闭环：管理端产出最小 release，剪辑端消费这个 release，并在 Windows 上验证性能。

推荐落地方式：

```text
协议冻结
  -> 管理端生成最小 release
  -> 剪辑端同步并读取最小 release
  -> Windows 验证首页 / 素材库不卡
  -> 扩展 search index
  -> Windows 验证搜索不卡
  -> 扩展 cut preflight / cut temp
  -> Windows 验证剪切不卡
```

也就是说，不是“管理端全改完再改剪辑端”，而是：

```text
按能力纵切，每一批同时改管理端和剪辑端，确保每一批都能真实验收。
```

## 总体架构

```text
管理端 / NAS 侧
  扫描原视频
  预处理文案、封面、索引
  生成不可变 cutter release
  原子切换 current-release.json

NAS 公共素材库
  保存 source-videos 原视频
  保存 .mixlab-library/releases
  不承担剪辑端运行时查询数据库职责

Windows 剪辑端
  启动读取本机 active release cache
  后台检查 NAS current-release.json
  后台同步新 release
  搜索走本机 search index
  素材列表走本机 catalog.sqlite
  剪切任务后台 preflight 和执行
```

## Release 目标结构

建议目标结构：

```text
PublicLibrary/
  source-videos/
    ...

  .mixlab-library/
    releases/
      v007728/
        release.json
        catalog.sqlite
        search-index/
        thumbnails/
        transcript-pack/
        source-path-map.json
        media-checksums.json

    current-release.json
```

说明：

| 文件 / 目录 | 作用 |
|---|---|
| `release.json` | release 元信息、版本、生成时间、素材数量、hash |
| `catalog.sqlite` | 剪辑端列表、筛选、详情摘要的本地数据库 |
| `search-index/` | 本机 searchd 可加载的关键词索引 |
| `thumbnails/` | 可选懒加载封面缓存目录；当前不在发布阶段全量复制 |
| `transcript-pack/` | 预留详情缓存目录；当前完整文案从 release search index 还原 |
| `source-path-map.json` | source video id 到真实源视频相对路径的映射 |
| `media-checksums.json` | 可选，用于抽样校验源视频一致性 |
| `current-release.json` | 当前可用 release 指针，必须原子切换 |

## 当前实施状态

更新日期：2026-06-14

已落地：

- 新增最小 Release Builder：`packages/library-fs/src/cutter-release.ts`。
- `publishIndexRequiredSourceVideos` 在成功发布新 index 后，同步生成同版本 cutter release。
- 当前 release 已输出：
  - `release.json`
  - `catalog.sqlite`
  - `search-index/source-transcript-index/`
  - `thumbnails/` 预留懒缓存目录
  - `transcript-pack/` 预留详情缓存目录
  - `source-path-map.json`
  - `.mixlab-library/current-release.json`
- `listCutterSourceLibrary` 已优先读取当前 release 的 `catalog.sqlite`；调用方传入本机 release cache 时，读取失败会快速失败，不再回退扫描 NAS。
- 新增 Release Sync Manager：`packages/library-fs/src/cutter-release-cache.ts`。
- 剪辑端 API 已支持 `MIXLAB_CUTTER_RELEASE_CACHE_ROOT`，默认缓存到：
  - Windows：`%LOCALAPPDATA%/MixLab Cutter/cache`
  - macOS / 本地开发：`~/Movies/MixLabLocal/cache`
- `/cutter/source-library` 已优先同步并读取本机 release cache；同步超时或 NAS 不可用时，可回退到上一次本机缓存。
- `/cutter/source-search` 在 searchd 不可用时优先读取本机 release cache 内的 `search-index`，不再回退扫描 NAS 文案 artifacts。
- `/cutter/source-videos/:id` 已优先读取本机 release cache 内的 `search-index`，按素材 ID 还原完整文案。
- 素材封面已改为懒读取：本机 release thumbnail 缺失时，API 回退读取源封面，避免 release 发布阶段复制海量小文件。
- 剪切任务新增 `剪切前检查` 阶段，在调用 ffmpeg 前快速校验源视频路径、文件可读性和时间段合法性。
- `/cutter/runtime-status` 已返回 `release_cache` 状态，用于设置页展示当前 release 和缓存可用性。
- searchd 已支持 `--release-root` / `MIXLAB_SEARCHD_RELEASE_ROOT`，可直接从本机 release cache 的 active release 启动并加载同版本 search index。
- Cutter Desktop 启动 searchd 时已传入本机 release cache root，Cutter API sidecar 也固定使用本地 workspace 下的 `cache` 目录。
- Release Sync Manager 已具备版本保留和本机 LRU 清理：默认保留当前 release 与最近一个旧 release，可通过 `MIXLAB_CUTTER_RELEASE_CACHE_MAX_RELEASES` 调整。
- `/cutter/runtime-status` 的 `release_cache` 已返回 search index 版本、缓存版本列表、缓存大小、保留上限和本次清理版本。
- 公共素材封面已接入本机独立 thumbnail 懒缓存：首次读取源封面，之后从 `source-thumbnails` 本机缓存返回，并按 LRU 清理；上限可通过 `MIXLAB_CUTTER_THUMBNAIL_CACHE_MAX_BYTES` 调整。
- `source-thumbnails/.manifest.json` 已记录懒缓存封面的源文件、缓存文件大小和 `sha256`，运行时状态可显示缩略图索引 / 校验数量。
- 工作区剪切已改为先写入 `cache/cut-temp`，剪切成功后再落到正式导出目录；失败或完成后清理临时文件，并按 LRU 容量治理；上限可通过 `MIXLAB_CUTTER_CUT_TEMP_MAX_BYTES` 调整。
- `/cutter/runtime-status` 已返回 `local_cache` 与 `source_video_preflight`，设置页可展示缩略图缓存、缩略图索引、剪切临时区、源视频样本可读性和 FFprobe 媒体流探测状态。
- 源视频样本预检已升级为“文件可读 + FFprobe 可解析”两层检查；检查超时时先返回 `checking`，不阻塞页面进入。
- 已有预处理成果不需要重跑 ASR 或重新抽帧，release 直接复用 ready artifacts。

尚未落地：

- 管理端 / 剪辑端更完整的 release 同步诊断页面。
- Windows 长时运行的缓存增长、LRU 清理和源视频预检证据。

当前阶段边界：

- 当前实现解决的是“发布快照 / 本机列表 / 本机搜索 / 本机完整文案详情 / searchd 本机 release cache 启动 / release cache 容量治理 / thumbnail 懒缓存与 checksum manifest / cut temp LRU / 剪切前置校验 / 源视频文件可读与 FFprobe 样本预检”的主链路。
- 管理端可视化诊断、剪辑端更完整的缓存诊断页和 Windows 长时运行证据仍需要后续批次补齐。

## Windows 本机缓存目标结构

建议目标结构：

```text
%LOCALAPPDATA%/MixLab Cutter/
  cache/
    releases/
      v007728/
        release.json
        catalog.sqlite
        search-index/
        thumbnails/
        transcript-pack/

    runtime.db
    projects.db
    sync-state.json

  cut-temp/
    ...
```

默认缓存策略：

| 缓存类型 | 默认上限 |
|---|---:|
| release / catalog / search / lazy thumbnails | 10GB |
| cut temp | 30GB |
| 总默认上限 | 40GB |

缓存清理使用 LRU：最近最少使用的缓存优先删除。

## 阶段计划

### Phase 0: 协议冻结与现状审计

目标：

- 先冻结 release / cache / search / cut job 的协议，避免边写边改。
- 审计当前管理端和剪辑端已有 artifacts，确认旧预处理成果可复用。

管理端工作：

- 梳理现有 ready 素材 artifacts 字段。
- 确认 `source-video.json`、`transcript.json`、`cover.jpg`、`keyframes.json` 可迁移。
- 确认当前 published index 的字段和版本规则。

剪辑端工作：

- 梳理首页、公共素材库、素材搜索、剪切任务当前数据依赖。
- 标记所有直接或间接读 NAS 小文件的关键路径。
- 定义本机 cache root 和 active release 读取规则。

交付物：

- `docs/architecture/cutter-release-protocol.md`
- `docs/architecture/cutter-cache-protocol.md`
- `docs/architecture/cutter-cut-job-protocol.md`

验收：

- 明确旧视频不需要重新预处理。
- 明确最小 release 字段。
- 明确 Windows 本机缓存目录和上限。

### Phase 1: 最小 Release Builder + 本机 Catalog 消费

目标：

- 先解决首页和公共素材库列表卡顿。
- 生成最小可用 release，并让剪辑端从本机 catalog 读列表。

管理端工作：

- 新增 Release Builder。
- 从已有 ready artifacts 生成：
  - `release.json`
  - `catalog.sqlite`
  - `source-path-map.json`
  - `current-release.json`
- 加 release 校验：
  - catalog 可读
  - ready 素材数量一致
  - 抽样 source video 可读
  - source path map 无非法路径

剪辑端工作：

- 新增 Release Sync Manager。
- 首次配置后同步最小 release 到本机。
- 启动时优先读取本机 active release。
- 首页不再等待 NAS runtime 状态。
- 公共素材库列表改读本机 `catalog.sqlite`。
- 公共素材库分页读取，禁止首屏扫描 NAS 目录。

前端影响：

- 不重构页面。
- 首页和公共素材库只增加同步状态提示。

交付物：

- 管理端可生成 `releases/vxxxxxx/catalog.sqlite`。
- 剪辑端可同步 release。
- 首页和公共素材库可从本机 cache 打开。

验收：

| 场景 | 标准 |
|---|---|
| Windows 启动首页 | 有缓存时 1 秒内显示 |
| 公共素材库第一页 | 1 秒内显示文字数据 |
| NAS 临时不可用 | 可打开上一次缓存 |
| 列表分页 | 不扫描 `.mixlab-library/videos` |

### Phase 2: Search Index 本地化

目标：

- 解决关键词搜索卡顿。
- 搜索只依赖 Windows 本机 search index。

管理端工作：

- Release Builder 增加 `search-index/` 输出。
- 写入 search index 版本、hash、素材数量。
- 确保 search index 和 catalog 同一 release 版本。

剪辑端工作：

- Release Sync Manager 同步 search index。
- searchd 从本机 release cache 加载 index。
- 搜索接口只查本机 searchd。
- searchd 未就绪时返回明确状态，不阻塞页面。
- 搜索结果只返回素材摘要、命中数量和命中位置。

前端影响：

- 搜索页保留现有布局。
- 增加状态：
  - 搜索索引同步中
  - 搜索索引可用
  - 搜索索引不可用

交付物：

- 本机 searchd 可加载 release search index。
- 素材搜索不再读 NAS 文案和 SQLite。

验收：

| 场景 | 标准 |
|---|---|
| 普通关键词搜索 | 300-500ms 返回候选 |
| searchd 启动中 | 页面不卡，显示索引同步中 |
| NAS 不可用 | 已缓存 index 可继续搜索 |

### Phase 3: 完整文案与缩略图缓存

目标：

- 选中素材后快速显示完整文案。
- 公共素材库滚动和素材搜索候选图不卡。

管理端工作：

- 保持 release 轻量化，避免发布阶段复制每个素材的小文件。
- 补充 thumbnail manifest 或封面版本字段，用于剪辑端判断本机封面缓存是否过期。
- 只有当 search index 无法覆盖完整文案字段时，才补充可选 transcript manifest；当前实现优先从 search index 还原完整文案。

剪辑端工作：

- 选中素材后从本机 release search index 一次性还原这条视频完整文案。
- 完整文案数据一次加载，渲染层按行数决定是否虚拟化。
- 封面 lazy load：首屏优先，下一屏预加载，不可见不加载；本机缓存缺失时由 API 读取源封面并可写入本机 thumbnail cache。
- 增加 thumbnail cache 的大小统计、过期策略和 LRU 清理。

前端影响：

- 不改变素材搜索主界面。
- 文案区域需要支持大量行的渲染优化。

交付物：

- 选中素材后从本机 release index 加载完整文案。
- 素材列表封面从本机 thumbnail cache 读取；缺失时可透明兜底。

验收：

| 场景 | 标准 |
|---|---|
| 选中素材 | 1 秒内显示完整文案 |
| 命中定位 | 自动跳到第一个命中点 |
| 长文案 | 不明显卡顿 |
| 素材库滚动 | 封面渐进加载，不阻塞滚动 |

### Phase 4: Cut Preflight 与错误分层

目标：

- 点击剪切后 UI 不阻塞。
- 剪切失败原因必须可定位。

管理端工作：

- Release 中保证 `source-path-map.json` 可定位真实源视频相对路径。
- 提供 source video 抽样校验结果。

剪辑端工作：

- 点击剪切后立即创建任务。
- 任务进入 `preflight` 状态。
- preflight 检查：
  - 源视频路径存在
  - Windows 可读
  - ffprobe 可读
  - 时间段合法
  - 本地工作区可写
  - 磁盘空间足够
- 错误分类：
  - 源视频不可读
  - ffprobe 失败
  - 时间段非法
  - 磁盘空间不足
  - ffmpeg 剪切失败

前端影响：

- 剪切任务页增加 `preflight` 状态。
- 失败问题显示具体原因。
- 操作列根据失败类型显示重新剪切或检查路径。

交付物：

- 剪切任务后台化。
- 源视频不可读不会进入假“剪切中”。

验收：

| 场景 | 标准 |
|---|---|
| 点击剪切 | 立即生成任务，不阻塞页面 |
| 源视频不可读 | 明确显示不可读路径和原因 |
| ffmpeg 失败 | 明确显示 ffmpeg 错误摘要 |

### Phase 5: Cut Temp / LRU 本地剪切缓存

目标：

- 降低 Windows 通过 SMB 直接剪 NAS 大视频导致的慢和失败。

管理端工作：

- 暂无强依赖。
- 可选：为未来 NAS cut-worker 预留 cut job 协议字段。

剪辑端工作：

- 新增 `cut-temp/`。
- 支持按任务把源视频或必要片段复制到本机临时缓存。
- ffmpeg 优先从稳定本机路径读取。
- cut temp 使用 LRU 清理。
- 设置页支持配置 cut temp 上限。

前端影响：

- 设置页增加缓存上限和清理入口。
- 剪切任务显示：
  - 准备源视频
  - 剪切中
  - 清理缓存

交付物：

- 本机 cut temp 缓存。
- LRU 自动清理。

验收：

| 场景 | 标准 |
|---|---|
| 重复剪同一素材 | 第二次不重新从 NAS 拉完整源文件 |
| cut temp 超限 | 自动清理最久未使用缓存 |
| 清理过程中 | 不影响当前剪切任务 |

### Phase 6: 双端诊断与性能验收

目标：

- 问题可定位，性能可量化。

管理端工作：

- 仪表盘显示：
  - 当前 release
  - release 构建状态
  - release 校验失败原因
  - ready 素材数
  - search index 状态

剪辑端工作：

- 设置页 / 诊断页显示：
  - active release
  - 本机缓存大小
  - searchd 状态
  - 最近同步时间
  - 抽样源视频检查
  - 最近剪切错误
  - cut temp 使用量

交付物：

- 双端诊断面板。
- 性能 trace 日志。

验收：

| 场景 | 标准 |
|---|---|
| 首页启动 | 记录耗时 |
| release 同步 | 记录耗时和字节数 |
| 搜索 | 记录耗时 |
| 选中素材 | 记录完整文案加载耗时 |
| 剪切 | 记录 preflight / temp / ffmpeg 各阶段耗时 |

## 推荐实施批次

### 第一批：打开不卡、列表不卡

包含：

- Phase 0
- Phase 1

目标：

- 完成最小 release。
- Windows 剪辑端读本机 catalog。
- 首页和公共素材库不再依赖 NAS 实时查询。

这是架构是否正确的第一道验证。

### 第二批：搜索不卡、选中素材不卡

包含：

- Phase 2
- Phase 3

目标：

- 搜索本地化。
- 选中素材加载完整文案。
- 缩略图懒缓存本地化。

### 第三批：剪切不卡、失败可定位

包含：

- Phase 4
- Phase 5

目标：

- 剪切后台化。
- 源视频 preflight。
- cut temp LRU。

### 第四批：诊断与验收

包含：

- Phase 6

目标：

- 双端都能看到 release、cache、search、cut 的真实状态。
- 后续性能问题不再靠猜。

## 关键设计决策

### 决策 1：旧素材是否重新预处理？

默认不重新预处理。

只基于已有 artifacts 重新发布 cutter release。

需要重新预处理的例外：

- 文案识别质量需要改善。
- 封面或关键帧质量需要改善。
- 原视频文件内容改变。
- transcript 缺少必要字段且无法迁移。

### 决策 2：剪辑端是否全量缓存原视频？

不全量缓存。

剪辑端只缓存：

- release metadata
- catalog
- search index
- lazy thumbnails
- 按需从 search index 还原的完整文案详情
- optional transcript pack，后续仅在 search index 无法覆盖详情字段时启用
- cut temp 最近使用源视频或片段

### 决策 3：公共素材剪切在哪里执行？

第一阶段仍可 Windows 本机执行，但必须加入 preflight 和 cut temp。

如果 SMB 读取大视频仍然不稳定，再进入 NAS cut-worker 方案：

```text
Windows 创建任务
NAS worker 本地读源视频并剪切
Windows 同步剪切结果
```

### 决策 4：前端页面是否重构？

不做视觉重构。

需要修改的是：

- 数据来源
- 加载状态
- 错误状态
- 诊断展示

现有页面框架应尽量保留。

## 验收总表

| 能力 | 验收标准 |
|---|---|
| 首页启动 | 有缓存时 1 秒内显示 |
| 公共素材库 | 1 秒内显示第一页文字数据 |
| 公共素材库滚动 | 封面渐进加载，不阻塞滚动 |
| 搜索 | 300-500ms 返回候选 |
| 选中素材 | 1 秒内显示完整文案 |
| 点击剪切 | 立即生成任务，UI 不阻塞 |
| 源视频不可读 | 显示明确路径和原因 |
| NAS 不可用 | 可打开上次缓存 release |
| 新 release | 后台同步，不中断当前操作 |
| 缓存超限 | LRU 自动清理 |

## 风险与控制

| 风险 | 控制方式 |
|---|---|
| release 协议设计不适合剪辑端 | Phase 1 做最小闭环，不一次性做大 |
| 旧 artifacts 字段不齐 | Phase 0 做迁移审计，必要时补迁移脚本 |
| search index 体积过大 | 设置版本缓存上限，只保留最近 1-2 个 release |
| cut temp 占用过高 | 默认 30GB 上限，LRU 清理 |
| NAS SMB 仍影响剪切 | Phase 5 后评估 NAS cut-worker |
| 前端状态混乱 | 只增加必要状态，不重做页面 |

## 当前推进状态与下一步

已完成第一批主链路，并已提前落地第二批中的本机 search index 读取、searchd 接入和选中素材完整文案加载。下一步直接进入后续性能批次：

```text
Phase 3: thumbnail 懒缓存、长文案渲染证据
Phase 4/5: cut temp、Windows 源视频可读性诊断
Phase 6: 管理端 / 剪辑端可视化 release 与 cache 诊断
```

推进原则：

- 不再等待逐项确认。
- 每个批次都保持端到端可运行。
- 每次提交都保留本机 Web 快路径 smoke 证据，避免再次变成页面级补丁。
