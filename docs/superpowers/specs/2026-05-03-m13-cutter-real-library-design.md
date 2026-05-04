# M13 剪辑端真实素材库接入设计

## 目标

M13 让剪辑师工作台从 fixture 展示进入真实使用：剪辑师通过管理端审核后的账号进入工作台，公共原素材库读取管理端已经发布的 ready 素材，进入原视频详情可以播放真实原视频并查看完整文案，查看行为回流管理端统计。

## 范围

本轮只交付剪辑端第一条真实主路径：

- 登录：运行 API 模式时必须通过剪辑师用户审核，fixture 模式继续免登录。
- 公共原素材库：只显示管理端发布后 `preprocess_status=ready` 且 `visible_to_cutters=true` 的素材。
- 资源地址：剪辑端所有封面、原视频、字幕、本地片段媒体 URL 都要解析到 Cutter API 服务地址，不能错误请求 Vite 前端服务。
- 详情进入：公共素材库卡片提供明确的“查看详情”入口，进入后按素材 ID 加载对应原视频详情。
- 行为统计：详情请求继续通过 Cutter API 写入 `view_source_video` 使用事件，绑定剪辑师用户和设备。

本轮不展开高级搜索交互、真实剪切队列产物体验和本地素材库复用闭环；这些进入 M14、M15。

## 用户路径

1. 剪辑师打开工作台。
2. 如果没有审核通过的会话，输入用户名申请。
3. 管理端审核通过后，剪辑端自动进入工作台。
4. 公共原素材库显示当前可用素材数量和所有可用资源。
5. 剪辑师点击某个素材的“查看详情”。
6. 剪辑端加载该素材的真实详情，视频播放器使用 Cutter API 的媒体地址，文案使用发布产物。
7. 管理端仪表盘的详情浏览统计增加。

## 关键设计

### 数据源

剪辑端不直接读 `.mixlab-library` 文件，也不从管理端 API 读取数据。剪辑端只访问 Cutter API：

- `GET /cutter/source-library`
- `GET /cutter/source-videos/:id`
- `GET /cutter/source-videos/:id/media`
- `GET /cutter/source-videos/:id/cover`
- `GET /cutter/source-videos/:id/subtitles.srt`

Cutter API 负责权限校验、ready 可见性过滤、路径解析和使用事件记录。

### 前端状态

剪辑端保留 `primaryDetail` 作为当前详情数据。本轮新增 URL hash 中的素材 ID 解析：

- `#public-library`：公共素材库。
- `#source-detail/V000001`：进入指定原视频详情。
- 老地址 `#source-detail` 继续可用，使用当前或第一条可用素材。

### URL 解析

Cutter API 返回的媒体 URL 是相对路径，例如 `/cutter/source-videos/V000001/media`。剪辑端运行在 Vite 端口时，必须通过 `client.resolveApiUrl()` 转成完整 API 地址，例如 `http://127.0.0.1:3789/cutter/source-videos/V000001/media`。

## 验收标准

- 剪辑端 API 模式下，没有审核会话不能看到工作台。
- 审核通过后，公共原素材库显示真实 `ready` 素材数量。
- 公共素材卡片有“查看详情”，点击后 hash 变为 `#source-detail/Vxxxxxx`。
- 详情页视频 `src` 和封面 `poster` 指向 Cutter API，而不是前端 Vite 服务。
- 请求详情后，管理端使用统计能看到 `source_detail_view_count` 增加。
- 现有测试、类型检查通过。
