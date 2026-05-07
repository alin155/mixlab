# MixLab Cutter Material 3 UI 优化规范

## 全局视觉规范

### 色彩

使用浅色主题，整体背景和 surface 分层应接近 Material 3。

- App 背景：`#F8FAFD`
- Surface：`#FFFFFF`
- Surface container：`#F1F5FA`
- Surface container high：`#E8EEF7`
- Primary：`#1A73E8`
- Primary container：`#D8E7FF`
- Secondary / selection：`#0F766E`
- Search hit：`#F9AB00`
- Success：`#188038`
- Warning：`#F9AB00`
- Error：`#B3261E`
- Main text：`#1F2937`
- Secondary text：`#5F6B7A`
- Separator：`#D7DCE5`

不要让页面被单一蓝色铺满。蓝色只用于主操作、当前选中、焦点和少量强调。成功、等待、失败必须有明确状态色。

### 字体与排版

- 使用系统 sans-serif，优先 `Roboto`, `Noto Sans SC`, `PingFang SC`, `system-ui`。
- 页面标题：24-28px，650-700 weight。
- 区块标题：14-16px，650 weight。
- 正文：13-14px。
- 辅助信息：12px。
- 不使用负字距，不使用随视口变化的字体大小。
- 中文长文案最多展示 2-3 行摘要，详情放入详情面板或 transcript 区域。

### 间距、圆角、阴影

- 基础间距按 8px 节奏：4 / 8 / 12 / 16 / 24 / 32。
- App shell 间距：16-24px。
- Cards / surface containers：16px radius。
- Buttons / inputs：20-28px radius，搜索框可用 28-32px。
- Chips：pill shape。
- 阴影保持克制：只用于浮层、浮动 selection bar、重要 surface。普通卡片优先用 surface 色 + 1px 边界。

## 全局布局规范

### App Shell

所有主页面使用一致结构：

- 左侧 permanent navigation drawer，宽度 240-256px。
- 主内容区包含 top app bar、页面标题/状态、主要工作区。
- 左侧导航选中项使用 filled pill，高度 40px 左右。
- 左侧底部保留剪辑师和素材状态：`Allen`、`18 本地素材`、`41 公共素材库`。

导航项顺序固定：

1. `项目首页`
2. `素材定位`
3. `剪切任务`
4. `本地素材库`
5. `公共素材库`
6. `设置`

### 顶部栏

每个页面应有清晰标题和动作区：

- 标题说明当前位置，例如 `素材定位`、`剪切任务`。
- 辅助说明只写业务上下文，不写教程式说明。
- 右侧使用 icon button 放刷新、帮助、设置等辅助动作。
- 主操作必须使用 filled button，次要操作用 outlined 或 text button。

### Surface 与 Card

- 不要把页面大区块做成多层嵌套卡片。
- Card 只用于独立对象：项目、素材、任务、设置组、详情面板。
- 页面区块使用 surface container，内部对象用 list row 或 compact card。
- 右侧详情面板是固定模式：标题 + 当前对象信息 + 主要动作 + 次要动作。

## 组件规范

### Search Bar

用于 `项目首页` 和 `素材定位`。

- 使用大圆角 filled search bar。
- 左侧 search icon，右侧 clear icon 或选项入口。
- 搜索按钮为 primary filled。
- 搜索框占主内容宽度的主要部分，不要压缩到小 input。

### Filter Chips

替代原来的小按钮或 select：

- 素材来源：`全部素材`、`本地素材`、`公共原素材`
- 视频方向：`全部`、`横版`、`竖版`
- 本地素材库：`全部`、`横版`、`竖版`
- 公共素材库：`全部`、`横版`、`竖版`

选中 chip 使用 primary container 或 secondary container。

### Buttons

- 主任务按钮：filled，例如 `搜索`、`剪切这段`、`重试失败`、`进入项目`。
- 次要但明确的动作：outlined，例如 `取消选择`、`显示文件夹`。
- 低权重导航动作：text，例如 `查看全部任务`、`打开素材详情`。
- 图标按钮必须有 tooltip 或 aria-label。

### Status Chips

统一状态词：

- `等待中`：amber container。
- `剪切中`：primary/teal container。
- `已完成`：green container。
- `失败`：red container。
- `已取消`：neutral container。

状态 chip 应放在列表行固定位置，避免藏在长文案中。

### Video Panel

- 视频预览必须有稳定 16:9 容器。
- 横版视频 `object-fit: contain`，不要裁掉字幕或讲台画面。
- 下方放 metadata assist chips：素材名、来源、方向、时长、文案字数、命中数。
- 视频动作放在 metadata 下方：`从当前句预览`、`打开素材详情`。

### Transcript

用于 `素材定位` 和 `原视频详情`。

- 长文案是核心操作区，必须保持足够宽度和行高。
- 搜索命中使用 amber 高亮。
- 当前命中使用 amber outline。
- 已选句子范围使用 light teal/blue container。
- 时间码用 small pill chip，例如 `04:12`。
- 浮动 selection bar 使用 elevated rounded pill，包含 `已选 14 秒`、`预览`、`剪切这段`、`取消`。
- 浮动条不得遮挡当前选区的主要文字。

### Lists 与 Grids

- 候选素材列表：Material list row，缩略图 + 标题 + metadata + 命中 chip。
- 本地素材库：compact media card grid，最多 3 行摘要，右侧详情面板显示完整来源追踪。
- 公共素材库：media card grid，显示编码、分辨率、时长、体积和 `查看详情`。
- 剪切任务：用 table-like list，稳定列为状态、任务、来源/时间段、选中文案、输出/问题、操作。
