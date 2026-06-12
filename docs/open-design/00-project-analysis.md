# MixLab Open Design 项目分析

本文档用于给 Open Design 生成 Web App UI 原型前理解当前真实项目。内容基于当前仓库代码、README、路由、页面组件、API 类型和状态管理扫描；不包含业务代码修改建议。

## 项目是做什么的

MixLab V3 是一个面向剪辑团队的本地 / 局域网视频素材搜索与剪切导出系统。

系统分为两个 Web App：

- 管理端：管理公共素材库、原视频元数据、预处理流水线、索引发布、系统检查、语音识别/运行配置、剪辑师用户审核。
- 剪辑端：剪辑师按项目搜索公共原素材和本地可复剪素材，查看完整文案，选择文案片段，提交剪切任务，管理本地素材和剪切任务。

系统底层包含公共素材库协议、文件系统扫描、预处理生命周期、FFmpeg 剪切、DashScope ASR、SQLite / searchd 搜索索引、Cutter API、Admin API 和本地工作区。

## 目标用户是谁

- 管理员 / 素材库维护者：负责公共素材库路径、素材来源、预处理、索引发布、运行状态和剪辑师权限。
- 剪辑师 / 内容编辑：负责在项目中搜索素材、验证画面、选择文案、提交剪切和复用本地素材。
- 技术运维 / NAS 维护者：负责 NAS 或挂载盘可用性、运行路径、FFmpeg、ASR 配置和故障排查。
- 需要确认：真实团队中是否存在“主管/审核员/只读观察者”等更多角色。

## 核心使用场景

- 管理员连接真实公共素材库，确认素材来源和系统运行环境可用。
- 管理员扫描新增原视频，把未处理视频进入预处理队列。
- 管理员观察预处理流水线，处理失败、停滞、待发布索引等问题。
- 管理员确认可搜索索引已经发布，剪辑端只看到 ready 且 visible 的素材。
- 管理员审核剪辑师登录申请和设备状态。
- 剪辑师新建或选择项目，在项目内搜索文案关键词或粘贴文案。
- 剪辑师在候选素材中选择公共原素材或本地素材，定位命中文案。
- 剪辑师在完整文案中单句、多句或文本精确选择片段，预览画面并提交剪切。
- 剪辑师在剪切任务页查看等待、剪切中、失败、完成任务，并重试失败任务。
- 剪辑师在本地素材库复用已剪素材，按当前项目或全部素材查看。

## 前端技术栈

- React 19
- TypeScript 5.9
- Vite 应用：`apps/admin-web`、`apps/cutter-web`
- Hash 路由，无独立 router 依赖
- 自研共享 UI 包：`packages/ui-foundation`
- CSS：应用级 `styles.css` + `ui-foundation` 的 `tokens.css`、`layout.css`
- 数据接入：Admin API、Cutter API；fixture client 仍存在，但真实本地 Web 应以 API 模式为目标。
- 状态持久化：剪辑端项目、任务归属、外观偏好等使用 `localStorage`；剪切、本地素材和公共库数据通过 API / workspace。

## 路由结构

### 管理端路由

主导航：

- `#/dashboard`：仪表盘
- `#/source-videos`：原视频管理
- `#/preprocess-jobs`：预处理
- `#/cutter-users`：剪辑师用户
- `#/settings`：设置

辅助或兼容路由：

- `#/source-detail`：原视频详情，通常从原视频管理进入。
- `#/doctor`：系统检查，当前不是主导航项，但页面存在。
- `#/index-publish`：兼容路由，实际映射到预处理。
- `#/library-settings`：兼容到设置。
- `#/index-health`：兼容到预处理。

### 剪辑端路由

主导航：

- `#/project-home`：首页 / 项目入口
- `#/material-locator`：素材搜索
- `#/cut-tasks`：剪切任务
- `#/local-library`：本地素材
- `#/public-library`：公共素材库
- `#/settings`：设置

辅助或兼容路由：

- `#/source-detail/:sourceVideoId`：原视频详情，支持 query 和 segmentIds 上下文。
- `#/search`：兼容到素材搜索。
- `#/cut-list`、`#/cut-queue`：兼容到剪切任务。

## 当前页面清单

### 管理端

- 仪表盘：公共素材库生产总览、核心链路健康、下一步建议、生产吞吐、最近任务、风险摘要、磁盘空间。
- 原视频管理：原视频列表、搜索、状态筛选、分页、详情 Inspector、公开元数据、封面、单条预处理动作。
- 原视频详情：基本信息、技术信息、预处理状态、产物完整性、文案数据、视觉数据、公开元数据、剪辑师可见状态。
- 预处理：流水线状态、阶段进度、任务队列、任务日志、索引发布、处理控制。
- 系统检查：Doctor 检查摘要、检查项说明、检查报告导出。
- 剪辑师用户：用户申请/审批、设备数、使用指标、停用确认弹窗。
- 设置：素材库名称、素材来源、预处理设置、ASR 密钥、运行工具状态、初始化素材库、路径检查。

### 剪辑端

- 登录审核页：剪辑师输入用户名并申请使用，等待管理员审核。
- 首页 / 项目入口：开始搜索、最近项目、新建项目、进入项目、重命名、删除项目。
- 素材搜索：搜索框、搜索状态、候选素材、完整文案、命中切换、视频预览、选区信息、剪切模式、最近剪切任务。
- 公共素材库：已发布公共原素材 gallery、横竖版筛选、分页加载、资源信息 Inspector。
- 原视频详情：视频播放、完整文案、连续选择、加入待剪清单。
- 剪切任务：任务筛选、流水线状态、任务表、任务详情 Inspector、失败重试、打开文件目录。
- 本地素材：当前项目/全部素材、横竖版筛选、项目分组、素材预览、打开文件目录。
- 设置：服务状态、素材与工作区、默认素材来源、默认视频类型、剪切偏好、环境检查。
- Windows 桌面首启页：代码中存在，但用户当前目标优先 Web App；建议 Open Design 作为后续扩展，当前阶段可标注“需要确认是否纳入本次原型”。

## 当前组件结构

共享 UI 基础组件：

- `MacWindow`
- `Sidebar`
- `UnifiedToolbar`
- `SegmentedControl`
- `GalleryGrid`
- `SourceTable`
- `InspectorPanel`
- `GroupedForm`
- `StatusRow`
- `MediaPanel`
- `PageBoard`

管理端业务组件：

- `AdminPageHeader`
- `AdminControlButton`
- `MetricBand`
- `EmptyState`
- `CountStrip`
- `SourceVideoTable`
- `SourceMetadataInspector`
- `JobRows`
- `IndexTable`
- `DiskUsage`
- `JobSummaryForm`
- `CutterUserDisableDialog`

剪辑端业务组件：

- `CutterSidebarFooter`
- `CutterProjectSwitcher`
- `ProjectHomePage`
- `ProjectCreateDialog`
- `ProjectRenameDialog`
- `ProjectDeleteDialog`
- `MaterialLocatorPage`
- `PublicLibraryPage`
- `LocalLibraryPage`
- `CutQueuePage`
- `SourceDetailPage`
- `SettingsPage`
- `CutterLoginGate`
- `DesktopFirstRunPage`

## 当前数据字段

### 管理端核心字段

- 素材库状态：`library_id`、`name`、`root_path`、`source_videos_path`、`mixlab_library_path`、`protocol_version`、各状态视频数量、磁盘容量、`index_status`、`current_index_version`、`active_task_label`、`updated_at`。
- 原视频：`source_video_id`、`title`、`file_name`、`relative_path`、`cover_url`、`duration_ms`、`file_size`、`preprocess_status`、`visible_to_cutters`、`tags`、`description`、`lecturer`、`course`、`category`、`error_stage`、`error_message`、`updated_at`。
- 预处理状态：`unprocessed`、`queued`、`processing`、`ready`、`failed`、`index-required`。
- 预处理任务：`job_id`、`source_video_id`、`title`、`status`、`stage`、`progress`、`started_at`、`completed_at`、`failed_at`、`elapsed_ms`、`estimated_remaining_ms`、`estimated_start_at`、`estimated_done_at`、`queue_position`、`log_path`、`retryable`、`error_message`。
- Supervisor：`state`、`state_label`、`worker_id`、`started_at`、`stopped_at`、`last_error`、`stop_requested`、`last_result`。
- 索引版本：`index_version`、`created_at`、`ready_video_count`、`schema_version`、`validation_status`、`validation_message`、`is_current`、`published_by`。
- 运行配置：FFmpeg / FFprobe 可用性、来源、版本、错误；ASR provider、model、audio_mode、密钥状态、语言、说话人分离、存储模式、失败原因。
- 剪辑师用户：`user_id`、`username`、`display_name`、`status`、申请/审核/停用时间、最近登录、最近使用、备注、设备列表。
- 使用指标：搜索请求/命中/空结果/失败、搜索延迟、搜索后端、详情浏览、文案选区、加入待剪、剪切提交/成功/失败、本地素材复用、活跃用户、最近关键词、常用视频。

### 剪辑端核心字段

- 公共原素材：`source_video_id`、`title`、`duration_ms`、`width`、`height`、`fps`、`codec`、`file_size`、`relative_path`、`description`、`tags`、`category`、`course`、`lecturer`、`publish_status`、`media_url`、`cover_url`、`detail_url`、`subtitles_url`。
- 文案段落：`segment_id`、`begin_ms`、`end_ms`、`text`。
- 搜索结果组：`source_video_id`、`title`、`duration_ms`、`hit_count`、`best_excerpt`、`hit_segments`、`transcript_character_count`、媒体/封面/详情/字幕 URL。
- 搜索响应：`query`、`normalized_query`、`groups`、`cursor`、`next_cursor`、`has_more`、`returned_count`、`limit`、`index_version`、`search_ms`、`search_mode`。
- 本地素材：`local_clip_id`、`project_id`、`title`、`source_video_id`、`source_title`、`relative_path`、`begin_ms`、`end_ms`、`duration_ms`、`selected_text`、`cover_url`、`media_url`、`detail_url`、`transcript_segments`。
- 剪切项目：`project_id`、`title`、`title_source`、`status`、`created_at`、`updated_at`、`clip_count`、`running_count`、`failed_count`、`searches`、`cover_url`、`source_title`。
- 剪切任务：`queue_job_id`、`clip_list_id`、`cut_list_item_id`、`project_id`、`source_video_id`、`source_title`、`title`、`begin_ms`、`end_ms`、`duration_ms`、`selected_text`、`cut_mode`、`status`、`current_phase`、`phase_timings`、`progress`、时间戳、`error_message`、`output_file`。
- 剪辑端运行状态：API 模式、公共库路径、可用素材数、本地工作区路径、本地素材数、FFmpeg 状态、搜索后端状态、当前用户。

## 当前用户操作

### 管理端操作

- 扫描新增素材。
- 执行下一步建议。
- 搜索原视频。
- 按预处理状态筛选原视频。
- 原视频列表上一页/下一页/继续加载。
- 打开原视频详情。
- 编辑公开标题、标签、说明、讲师、课程、分类。
- 上传并保存封面。
- 将单条原视频加入预处理、重新处理、恢复到队列、发布到剪辑端。
- 启动/暂停预处理服务。
- 重试失败视频。
- 恢复卡住任务。
- 查看任务处理日志。
- 发布到剪辑端 / 修复索引。
- 运行系统检查、导出系统检查报告。
- 新增/编辑/移除素材来源。
- 保存设置、初始化素材库、检查语音识别。
- 审核剪辑师申请、停用用户。

### 剪辑端操作

- 申请使用剪辑师工作台。
- 新建项目、选择项目、进入项目、重命名项目、删除项目。
- 在首页或搜索页搜索文案关键词。
- 清空搜索。
- 选择候选素材。
- 上一个/下一个命中。
- 选中当前命中。
- 选择极速剪切或精准剪切。
- 点击单句、拖拽多句、直接选择文案生成精确选区。
- 预览选区、暂停预览、复制选中文案。
- 剪切这段。
- 查看全部任务。
- 按任务状态筛选剪切任务。
- 重试失败任务。
- 打开输出文件目录。
- 切换本地素材当前项目 / 全部素材。
- 切换横版 / 竖版 / 全部。
- 设置默认素材来源、默认视频类型、默认剪切模式、显示模式。

## 当前页面状态

- loading：管理端初次加载、原视频首批加载、任务明细加载、原视频详情加载、剪辑端搜索匹配、候选素材详情加载、登录申请提交、桌面首启检查。
- empty：无原视频、无匹配原视频、无预处理任务、无剪辑师申请、无项目、无候选素材、无公共素材、当前项目无本地素材、当前筛选无任务。
- error：管理端服务不可连接、接口不可用、原视频详情失败、剪辑端登录失效、搜索失败、任务失败、Doctor 失败、运行环境检查失败。
- success：设置保存、扫描完成、预处理动作完成、检查通过、剪切任务完成、登录通过。
- processing：预处理运行中、任务排队中、素材库索引更新中、剪切中、搜索继续加载中。
- disabled：没有登录权限、任务不可重试、无选区不可剪切、没有当前项目时当前项目本地素材为空、写入动作需要显式确认或管理权限。

## 当前 UI 存在的问题

- 管理端信息量过大，仪表盘存在较多指标、卡片和动作入口，用户容易不知道下一步该做什么。
- 管理端仍有较多工程态概念，例如索引版本、搜索后端、协议、路径、日志、Doctor 等；应尽量转换为用户可理解的“可搜索素材、生产状态、系统检查、处理建议”。
- 高风险写入动作较多，主页面不应突出“解锁/安全开关”概念，应把危险动作放在详情、设置或确认弹窗里。
- 管理端 dashboard 的多个健康指标容易形成闪烁或“整页刷新感”；设计应表达局部刷新、更新时间和稳定 loading，不应让整页跳动。
- 原视频管理的列表、分页、筛选和 Inspector 同时存在，需要更强信息层级。
- 预处理页承载“启动服务、恢复停滞、重试失败、发布索引、查看日志”等复杂操作，需要整理成主路径和例外处理。
- 剪辑端素材搜索是核心工作台，但候选、文案、视频、选区、任务密度很高，需要重点设计空间分配。
- 剪辑端首页已作为项目入口，但项目卡片、搜索入口和项目详情之间的信息层级仍需更清楚。
- 公共素材库与素材搜索中的“公共原素材 / 本地素材”关系需要明确，避免用户误以为本地素材会写回公共库。
- 大数据量页面必须分页、虚拟化或渐进加载，避免首屏超过 1 秒。

## 哪些业务逻辑不能改

- 剪辑端不能修改公共素材库，只能读取 ready 且 visible_to_cutters 的公共原素材。
- 管理端负责公共素材库写入、扫描、预处理、索引发布、设置和用户审核。
- 公共素材进入剪辑端必须经过预处理和索引发布边界。
- 预处理状态机不能被 UI 改写：`unprocessed`、`queued`、`processing`、`ready`、`failed`、`index-required`。
- 搜索结果必须来自当前已发布索引或受保护的 fallback 路径，不能把未发布素材展示给剪辑师。
- 剪辑端剪切结果写入本地工作区，本地素材属于本机工作区，不写回公共库。
- 登录审核和设备身份边界不能弱化：未 approved 的剪辑师不能进入工作台。
- ASR 密钥只能显示配置状态，不能明文展示。
- FFmpeg、ASR、Doctor、索引、路径检查等运行条件需要真实反馈，不能只做静态装饰。
- 原视频详情、搜索命中、剪切时间段必须保持 segment / begin_ms / end_ms 的准确关系。

## 哪些只是 UI 层，可以安全重构

- 页面布局、视觉层级、卡片/表格/Inspector 的组织方式。
- 导航文案、页面标题、空状态和错误状态文案。
- 指标展示方式，例如把多个 KPI 合并为生产摘要、状态条、趋势区。
- 按钮分组、主次层级、低频动作收纳、危险动作确认方式。
- Status Tag、Badge、Progress、Timeline 等视觉表达。
- 表格列顺序、密度、固定表头、行选择、详情面板布局。
- 搜索框、筛选条、分页控件、加载更多控件的视觉与交互。
- 项目首页的信息架构和项目卡片布局。
- 素材搜索工作台的三栏/两栏布局、候选列表、文案高亮、视频预览和选区面板的视觉结构。
- 响应式布局策略。
- 需要确认：是否允许在原型中调整主导航分组，例如把 Doctor 放入设置/系统检查入口，而非单独主导航。
