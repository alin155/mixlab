# Cutter Release Protocol

## 目标

Cutter release 是管理端发布给剪辑端消费的不可变快照。

它的职责是让剪辑端打开首页、公共素材库、素材搜索和剪切任务时，不把 NAS 当运行时数据库反复扫描。

## 当前版本

当前已实现 release：

```text
PublicLibrary/
  .mixlab-library/
    current-release.json
    releases/
      v000001/
        release.json
        catalog.sqlite
        search-index/
          source-transcript-index/
            current.json
            <index-version>/
              index.sqlite
              index-manifest.json
        thumbnails/
        transcript-pack/
        source-path-map.json
```

当前还未包含：

- `media-checksums.json`

说明：

- `thumbnails/` 当前是懒加载缓存目录。release 中保留路径，但不要求发布阶段复制每个素材封面；剪辑端封面接口会优先读本机缓存，缺失时回退源封面。
- `transcript-pack/` 当前是预留目录。为避免发布阶段复制大量 NAS 小文件，选中素材后的完整文案由 release 内 `search-index/source-transcript-index/<version>/index.sqlite` 按 `source_video_id` 还原。

`media-checksums.json` 会在后续校验阶段补齐。

## current-release.json

位置：

```text
.mixlab-library/current-release.json
```

字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `schema_version` | string | 当前为 `1.0` |
| `library_id` | string | 公共素材库 ID |
| `current_version` | string | 当前 release 版本，默认与 source transcript index 版本一致 |
| `updated_at` | string | 指针更新时间 |
| `manifest_path` | string | release manifest 的库内相对路径 |

切换规则：

- 必须在 release 目录完整写入后再原子替换该指针。
- 剪辑端启动时优先读取该指针。
- 如果指针不存在或 release 损坏，当前代码回退旧 manifest / index 路径。

## release.json

位置：

```text
.mixlab-library/releases/<version>/release.json
```

字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `schema_version` | string | 当前为 `1.0` |
| `release_version` | string | release 版本 |
| `library_id` | string | 公共素材库 ID |
| `generated_at` | string | 生成时间 |
| `ready_video_count` | number | 当前 release 可见素材数量 |
| `source_index_version` | string | 对应的文案搜索 index 版本 |
| `catalog_path` | string | 当前固定为 `catalog.sqlite` |
| `source_path_map_path` | string | 当前固定为 `source-path-map.json` |
| `search_index_path` | string | 当前固定为 `search-index/source-transcript-index` |
| `thumbnails_path` | string | 当前固定为 `thumbnails` |
| `transcript_pack_path` | string | 当前固定为 `transcript-pack` |

## catalog.sqlite

用途：

- 剪辑端公共素材列表首屏和分页读取。
- 首页项目/素材规模摘要的候选数据源。
- 后续可扩展为筛选、排序、详情摘要的本地数据库。

当前表：

```sql
metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL)
source_videos(...)
```

`source_videos` 当前包含：

- `source_video_id`
- `title`
- `duration_ms`
- `width`
- `height`
- `fps`
- `codec`
- `file_size`
- `relative_path`
- `logical_uri`
- `source_folder_id`
- `source_folder_relative_path`
- `source_video_file_path`
- `cover_path`
- `transcript_path`
- `srt_path`
- `keyframes_path`
- `content_hash`
- `transcript_character_count`
- `description`
- `tags_json`
- `lecturer`
- `course`
- `category`

读取规则：

- 剪辑端列表优先读 `catalog.sqlite`。
- 默认按发布顺序 `position` 排序。
- 必须分页读取，禁止首屏扫描 `.mixlab-library/videos`。
- 素材搜索优先读 release 内 `search-index/source-transcript-index/<version>/index.sqlite`。
- 选中素材详情优先从 release 内 `search-index/source-transcript-index/<version>/index.sqlite` 还原完整文案；后续可用 `transcript-pack/` 做可选的懒加载详情缓存。
- `source_folder_id = src_default` 时，剪辑端可根据当前库根目录重新解析源视频路径，避免直接使用管理端机器上的绝对路径。

## source-path-map.json

用途：

- 为剪切预检和未来 cut temp 提供 source video id 到源视频位置的稳定映射。

字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `schema_version` | string | 当前为 `1.0` |
| `release_version` | string | release 版本 |
| `library_id` | string | 公共素材库 ID |
| `source_videos` | object | 按 `source_video_id` 索引的路径映射 |

每条映射包含：

- `relative_path`
- `source_folder_id`
- `source_folder_relative_path`
- `source_video_file_path`

cut preflight 必须基于这个映射做源视频路径存在性、Windows 可读性和剪切时间段合法性检查。运行时源视频样本预检已包含 FFprobe 媒体流探测；任务级 preflight 后续可继续复用同一探测口径。

## 发布规则

当前发布入口：

```ts
publishIndexRequiredSourceVideos(...)
```

成功发布新 source transcript index 后，会同步调用：

```ts
publishCutterRelease(...)
```

规则：

- release 版本默认等于当前 source transcript index 版本。
- 如果调用方指定 `release_version`，release builder 必须读取同版本 index manifest，不能读取正在变化的 current index 指针。
- release 只包含 `visible_to_cutters = true` 且 manifest 校验通过的视频。
- release 复用已有搜索索引和素材元数据，不重新预处理。
- 为避免 NAS 小文件复制拖慢发布，当前 release 不逐个复制 `transcript.json`、`cover.jpg`、`keyframes.json`；完整文案从 release search index 还原，封面走懒加载和源封面兜底。
- 如果没有新视频发布，不会生成新版本 release。
- 如果已有 current index 但缺少 current release，可以基于旧 index 和 ready artifacts 重建同版本 release，不需要重新预处理。

## 剪辑端读取规则

当前读取入口：

```ts
listCutterSourceLibrary(...)
```

NAS / 管理端本地读取顺序：

1. 读取 `.mixlab-library/current-release.json`。
2. 打开对应 release 的 `catalog.sqlite`。
3. 按分页返回素材卡片数据。
4. 如果 release 不存在或损坏，回退旧 manifest / index 读取路径。

剪辑端 API 读取顺序：

1. 启动或请求公共素材列表时，短超时检查 NAS `current-release.json`。
2. 如果发现新 release，将完整 release 目录同步到本机 cache：
   - `release.json`
   - `catalog.sqlite`
   - `search-index/`
   - `thumbnails/`，可为空，作为懒加载封面缓存目录
   - `transcript-pack/`，可为空，作为后续详情缓存预留目录
   - `source-path-map.json`
   - `current-release.json`
3. 公共素材列表优先读取本机 active release cache 的 `catalog.sqlite`。
4. 搜索优先读取本机 active release cache 的 `search-index`。
5. 素材详情优先读取本机 active release cache 的 `search-index` 并还原完整文案。
6. 同步超时或 NAS 不可用时，如果本机已有可用 release，继续使用上一次本机 release。
7. 本机 cache 不可用时，才回退旧 manifest / index 读取路径。
8. 调用方已经指定本机 release cache 时，读取失败必须快速失败，不再回退扫描 NAS。

默认本机 cache：

| 平台 | 默认路径 |
|---|---|
| Windows | `%LOCALAPPDATA%/MixLab Cutter/cache` |
| macOS / 本地开发 | `~/Movies/MixLabLocal/cache` |

可通过 `MIXLAB_CUTTER_RELEASE_CACHE_ROOT` 显式覆盖。

## 当前验收范围

已覆盖测试：

- 发布 ready 视频后生成同版本 release。
- release 写出 `catalog.sqlite`、`search-index/`、`source-path-map.json`、预留缓存目录和 `current-release.json`。
- 删除单个 `source-video.json` 后，素材列表仍可从 release catalog 读取。
- 剪辑端 API 可同步完整 release 到本机 cache，并在 NAS manifest 缺失时继续从本机 cache 读取素材列表。
- 本机 release search index 可用于 searchd 不可用时的搜索兜底。
- 本机 release search index 可用于选中素材后的完整文案详情加载。
- 本机 searchd 可通过 `--release-root` / `MIXLAB_SEARCHD_RELEASE_ROOT` 直接加载 active release search index。
- Cutter Desktop 和 Cutter API sidecar 已对齐到本地 workspace 下的 release cache root。
- 本机 release cache 已支持默认保留 2 个 release，并在同步后执行 LRU 清理。
- 剪辑端运行时状态已输出 release cache 版本、search index 版本、缓存大小、保留上限和本次清理结果。
- 剪切任务会在调用 ffmpeg 前执行源视频和时间段前置检查。
- 公共素材封面接口已支持本机 `source-thumbnails` 懒缓存和 LRU 清理。
- 公共素材封面懒缓存已写入 `source-thumbnails/.manifest.json`，记录缓存文件大小和 `sha256`。
- 工作区剪切任务已通过 `cache/cut-temp` 写入临时文件，成功后再落到正式导出目录，并执行 LRU 容量治理。
- 剪辑端运行时状态已输出本机缓存、缩略图 manifest 计数、剪切临时区与源视频样本“文件可读 + FFprobe 可解析”预检。
- 旧库或 release 损坏时，素材列表仍可回退旧读取路径。

未覆盖验收：

- 管理端 / 剪辑端更完整的 release 同步诊断页面。
- Windows 长时运行下的缓存增长、LRU 清理和源视频预检证据。
