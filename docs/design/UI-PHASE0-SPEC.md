# MixLab Cutter UI Phase 0 实施规格（AppShell + 首页）

> 状态：已确认实施  
> 基线：main 288e7a2（0.18.14 发布后）  
> 设计输入：docs/design/cutter-ui-audit.md、docs/design/mockups/home.html、docs/design/windows-baseline/README.md  
> 实施方：Windows（剪辑端代码 owned）；Mac 负责设计/审查/发布  
> 分支：ui/phase0-shell-home（从 main 新建）

## 1. 目标

建立统一 AppShell 与设计令牌，并把首页重排为可行动的工作台首页；同时修掉真机确认的顶部提示条裁切问题。

## 2. 本轮范围（必须做）

1. **设计令牌/基础样式**
   - 颜色、字号、间距、圆角、阴影按 docs/design/mockups/assets/styles.css 的 token 落地到剪辑端样式；
   - 不引入新的重型 UI 框架/外部 CDN；
   - 沿用现有 UI Foundation 组件能复用的组件。

2. **AppShell**
   - 侧栏、顶栏 64px、页面标题区（eyebrow + H1 + 说明 + 右侧操作）、内容区 24px padding；
   - 统一 Card/Button/Badge/Empty/Loading 的样式；
   - 现有所有页面路由都必须经过 AppShell，不能出现双重顶栏/侧栏。

3. **顶部提示条修复**
   - 真机问题：.cutter-contract-notice 被裁切（rect top=0, bottom=41.5，正文不可见）；
   - 修复为 AppShell 内容流的一部分（在顶栏下方、页面内容上方），可关闭/可跳转；
   - 保证 1536×1024、1440×900 下正文完整可见，不遮挡页面标题。

4. **顶栏项目切换器（Phase 0 的轻量版）**
   - 顶栏显示当前项目（无项目显示“未选择项目”）；
   - 点击弹出最近项目列表，可切换/进入项目；
   - 明确标识“切换项目”而不是隐式过滤；
   - 本阶段暂不实现全站“全部项目”默认作用域（放到 Phase 1），避免改变现有数据过滤逻辑造成回归；
   - 侧栏底部当前项目信息保留，但不要与顶栏冲突。

5. **首页重排**
   - 按 docs/design/mockups/home.html：
     - Hero：标题/说明 + 搜索入口 + 主要操作；
     - 最近项目：有项目显示卡片，无项目显示友好空态 + 新建/先搜索；
     - 快速开始：新建项目、搜索素材、剪切任务、本地素材；
     - 最近剪切摘要（2~3 条），完整列表跳转任务页；
     - 保留现有“进入项目/打开文件目录/重命名/删除项目”等动作，不丢功能；
   - 不改变搜索/剪切/项目归档的业务规则；Phase 0 只做视觉与入口组织。
   - 首页不再出现英文面包屑 “Cutter / Project Home”。

6. **验证**
   - typecheck、产品测试通过；
   - Windows 安装版截图：首页、新建项目弹窗、其他 1~2 个页面（确认 AppShell 没破坏）在 1536×1024、1440×900；
   - 与 mockup 对比，记录差异；
   - 顶部提示条正文完整可见；
   - 项目切换器实际切换成功；
   - 不引入横向滚动/遮挡；现有快捷入口可点。

## 3. 本轮不做（明确排除）

- 素材搜索/剪切任务/本地素材的内容重排（Phase 1）；
- 全站“全部项目/未归属/进入项目视图”作用域语义（Phase 1）；
- 悬浮剪切按钮定位修复（Phase 1，与素材搜索一起做）；
- 极速溢出模式；
- 任何 API/协议/业务规则改动；
- 发布安装包（先 push 分支，Mac 审查后再定）。

## 4. 交付

- 分支/commit、修改文件列表；
- typecheck/测试结果；
- 截图路径 + 与 mockup 的差异说明；
- 已知限制/下一步建议；
- 不要直接升版本号/发布。

## 5. 设计参考

- 首页 mockup：docs/design/mockups/home.html；
- 截图：docs/design/mockups/screenshots/home-1536.png；
- Windows 真机基线：docs/design/windows-baseline/README.md；
- 审计：docs/design/cutter-ui-audit.md。
