# MixLab Cutter 素材搜索与预处理审计（2026-11-19）

## 结论先行

今天剪辑师“关键词搜不到素材”不是一个问题，至少有三条独立原因：

1. **新素材没有进入预处理/索引流水线**
   - 最近一次素材扫描/索引：2026-11-11 10:40
   - 索引生成后新增了 60 个媒体文件、10 个目录（2611北京 10 个 + 王牧笛 50 个），索引中全部缺失
   - admin 设置里 auto_scan_enabled=false、auto_queue_enabled=false，每日扫描默认关闭

2. **搜索框不支持按文件夹路径/场次名检索**
   - 阳慧连续 4 条反馈把完整 NAS 路径粘进搜索框，例如：
     \\192.168.1.27\MixLab\PublicLibrary\source-videos\陶矜2\2026年素材\陶矜2610成都
   - 当前搜索只匹配台词/素材名，路径被当成普通文本，结果 0

3. **部分机器的 searchd 不可用**
   - Jiao 机器 3790 health 失败、searchd 启动 ready_timeout；修复工具又被 active lease 卡住
   - 这是另一个 P1 故障链，不等于素材缺失

## 关键证据

### 索引/发布状态

- current-release.json: v012806，更新于 2026-11-11T10:40:07Z
- 当前 index：source_videos=12,916，segments=1,329,425
- library：video_count=12,977，ready=12,916，failed=61，queued=0，processing=0
- 当前 index 的 source_videos.relative_path 无空值
- 对 12,977 个 source-video.json 做了完整审计：
  - ready 12,916，failed 61
  - missing_transcripts = 0（ready 素材的 transcript 文件都存在）
  - meta_not_in_index = 61，且全部是 failed（不是漏索引）
  - index_not_in_meta = 0
  - metadata_after_index_time = 0（索引后没有任何新 metadata 写入）

### 扫描状态

admin/library-scan-new-status.json：

- 状态：completed
- 开始：2026-11-11T10:34:51Z
- 完成：2026-11-11T10:35:20Z
- discovered/indexed：12,977
- new_video_count：0

此后没有新的扫描/发布记录。

### 新素材缺口

按常见视频扩展名实测，source-videos 下当前有 **12,872** 个媒体文件；索引里是 12,916 条，数量对不上，存在索引/磁盘不一致。

更关键的是，**索引生成后新增了 60 个媒体文件、分布在 10 个目录**：

- 陶矜2/2026年素材/陶矜2611北京：10 个 MP4（2026-11-15 19:42–20:29）
- 王牧笛/2026年素材/王牧笛 26.10.16 线下课：6 个
- 王牧笛/2026年素材/王牧笛 26.10.24 线下课：12 个
- 王牧笛/2026年素材/王牧笛 26.11.07 线下课：12 个
- 王牧笛/2026年素材/王牧笛 26.7.10 线下课：11 个
- 王牧笛/2026年素材/王牧笛26.7.24 线下课：5 个
- 其余零散目录：4 个

抽验新文件在索引中均为 0 条：

- 20261016_C1344.mp4 → 0
- 20261023_C1368.mp4 → 0
- 20261023_C1369.mp4 → 0
- 040A9895.MP4 → 0

并且全量审计发现：

- metadata_after_index_time = 0
- 这 60 个文件在 .mixlab-library/videos 下没有新的 source-video.json
- 即：它们不是“有 metadata 但索引没发布”，而是**扫描阶段根本没发现**

另外按常见扩展名实测磁盘 12,872 个媒体文件，索引 12,916 条，差 44 条，需要单独做索引/磁盘对账（可能是已删除素材、不可见素材或扩展名统计差异）。

### 配置缺口

admin-settings.json：

- runtime_policy.auto_scan_enabled = false
- runtime_policy.auto_queue_enabled = false
- auto_publish_index_enabled = true
- source_folders[0].last_scanned_at = 2026-11-11

代码行为：

- runAdminDailyScanOnce 在 auto_scan_enabled=false 时直接返回 auto-scan-disabled
- 每日扫描还需 MIXLAB_ADMIN_DAILY_SCAN_ENABLED=1
- 因此即使预处理器本身可用，也不会自动发现 2611 这批新文件

### 后台读模型问题

admin-read-model/admin.sqlite：

- source_video_status 共 12,977 行
- 其中 12,895 行 relative_path 为空、source_folder_name 为空
- 只有 82 行有完整路径

影响：

- 后台素材列表/按目录筛选/路径诊断基本不可用
- 不影响 Cutter 当前 searchd 索引（索引里路径完整），但会掩盖后台素材管理问题

### 预处理失败

- 61 个视频 preprocess_status=failed
- 失败样例集中在老素材、照片 .mov、部分 2022/2023 MP4
- 当前没有自动重试/告警；这些素材对搜索永久不可见

### searchd 故障（另一条链）

- Jiao：3789=200，3790=失败；searchd_ready_timeout 30s，旧 searchd 仍占 3790
- 修复工具把 active lease 当不可修复，导致剪辑师连续提交 4 次专家包

## 建议修复顺序

### P0：先恢复今天可见性

1. 手动执行“扫描新增”，发现索引后新增的 60 个媒体文件（2611北京 10 + 王牧笛 50）；
2. 入队预处理，完成后发布新索引；
3. 验证 current-release 版本变化、source_videos 从 12,916 增加到约 12,976（以实际 ready 为准）；
4. 用 C1141/2607、C1236/2609、2611、王牧笛新场次实测关键词/路径。

### P1：把“不会自动发现新素材”修掉

- 开启每日扫描，或上传完成后触发 scan；
- 设置 auto_scan_enabled=true、auto_queue_enabled=true；
- 配置 MIXLAB_ADMIN_DAILY_SCAN_ENABLED=1，并确认 admin 服务实际重启；
- 增加 watchdog：源文件 mtime/数量 > release 时间/索引计数时告警或自动扫描；
- 预处理器失败要有重试/告警，不能静默 61 条 failed。

### P1：搜索框支持路径/文件夹

- 输入是 UNC/本地路径或包含 source-videos 时，解析出目录；
- 按相对路径前缀过滤 source_videos，而不是把整条路径当搜索词；
- 增加“按场次/文件夹筛选”入口；
- 搜不到时提示“可按文件夹名/路径搜索”。

### P2：修复后台读模型

- 重新生成 admin.sqlite/source_video_status，补回 relative_path/source_folder_name；
- 或修复读模型投影，避免 12,895 行空路径；
- 加读模型一致性校验：行数、状态计数、路径非空率。

### P1：searchd/lease 恢复

- 3790 不健康时允许安全重启 searchd，不应被 active lease 卡死；
- 补充 searchd 日志/stderr；
- 修复工具在 Cutter 健康运行时不要误报专家介入。

## 一句话

> 搜索索引本身没有整体坏掉；真正的问题是“新素材没被扫描/索引”、 “搜索框不识别文件夹路径”，以及“部分机器 searchd 起不来”。先手动补 2611 和调度，再修路径搜索与读模型，才能解释今天的多数反馈。
