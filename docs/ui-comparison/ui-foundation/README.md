# MixLab UI Foundation 对比实验归档

> 状态：已归档。隔离实验应用 `apps/ui-foundation-lab` 已删除，真实落地方向已迁移到 `packages/ui-foundation`。

## 目标

本实验用于验证一条新的三端 UI 路线：

- 自研 MixLab Cutter / Admin 视觉系统。
- 不使用 Ant Design、Material UI、Bootstrap 等大型视觉组件库接管 UI。
- 后续可使用成熟 headless primitives 处理 Dialog、Popover、Tooltip、Tabs、Focus Trap、Keyboard Navigation 等复杂交互。
- 页面业务结构保持当前 MixLab 的信息架构和主要工作流。
- 控件、卡片、表格、状态、字体、间距、圆角、阴影由统一组件层管理。

## 原实验边界

本实验曾只在以下目录内实现：

- `apps/ui-foundation-lab`
- `docs/ui-comparison/ui-foundation`

不修改生产应用：

- `apps/admin-web`
- `apps/cutter-web`
- `apps/cutter-desktop`
- `packages/ui-foundation`

## 生命周期结果

`apps/ui-foundation-lab` 只是验证 UI Foundation 方向的临时脚手架。真实 `packages/ui-foundation v1` 开始落地后：

- 已删除 `apps/ui-foundation-lab`。
- 已删除已被否定的 `apps/antd-ui-lab`。
- 不把两个隔离三端实验 app 继续维护成长期项目。
- 只保留必要的结论文档和 checkpoint 记录。

## 不是从零重构业务布局

这条路线不是重新发明 MixLab 的产品结构，而是做 UI 系统标准化。

保留：

- 管理端的仪表盘、原视频、预处理、索引发布、用户、设置结构。
- 剪辑端的首页、素材搜索、剪切任务、本地素材、公共素材库、缓存管理、设置结构。
- 素材搜索的候选素材 / 视频文案 / 视频验证与选区信息工作流。
- 桌面端固定工作台的使用方式。
- Web 和桌面端均不使用额外的大圆角应用外框；外层容器应由浏览器窗口或系统应用窗口承担。

允许优化：

- 字体层级、间距、密度、对齐。
- 卡片、表格、状态、按钮、搜索框、详情面板统一。
- 页面滚动边界、表头固定、选区动作、状态色等 UI 体验问题。

不允许：

- 把素材搜索改成通用后台表格。
- 把桌面端改成浏览器式后台页面。
- 把页面里的按钮、卡片、表格继续写成局部样式。

## 组件范围

实验中的 Foundation 组件包含：

- `AppShell`
- `Sidebar`
- `WorkbenchCard`
- `Button`
- `IconButton`
- `Input`
- `SearchBox`
- `Tabs`
- `Dialog`
- `Popover`
- `Tooltip`
- `StatusBadge`
- `DataTable`
- `MediaCard`
- `InspectorPanel`
- `EmptyState`
- `LoadingState`
- `TranscriptPanel`
- `FloatingCutAction`

## 对比入口

这些隔离预览入口已经停用。后续 UI 验证以真实三端路由和 `packages/ui-foundation` 为准。

## 评估重点

- 三端是否能使用同一套基础控件。
- 当前业务布局是否被保留。
- 字体、间距、按钮、表格、状态色是否明显更稳定。
- 剪辑端素材搜索是否仍然像创作者工作台，而不是后台系统。
- Windows 桌面端是否仍然像桌面应用，而不是网页套壳。
