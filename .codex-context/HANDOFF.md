# Handoff

## Task Goal
继续推进 MixLab V3 剪辑端项目层、素材定位、剪切任务与项目内数据收束的产品和工程落地。

## Non-goals
- 不修改无关业务模块。
- 不改变管理端既有稳定功能，除非当前任务明确需要。
- 不改动用户本地素材、公共素材库原视频或已生成媒体资产。

## Completed
- 管理端已完成可用的公共素材库、预处理流水线、索引发布、用户审核和健康诊断主流程。
- 剪辑端已完成登录申请/审核、公共素材库、本地素材库、素材定位、剪切任务、设置等基础页面。
- 剪辑端素材定位页已形成“搜、选、剪”主工作台：搜索文案、候选素材、视频预览、自然文案、命中跳转、直接剪切。
- 剪辑端搜索已支持中文标点归一、跨分段长句匹配、ASR 误差容错和全局命中导航。
- 剪辑端已引入项目层：启动页、最近项目、项目切换器、首次剪切静默创建项目、搜索记录和剪切任务归属。
- 当前保存点已提交到 Git，提交为 `ca2719a chore: checkpoint cutter project handoff`。

## Modified Files
- `.codex-context/`：项目接力上下文。
- `docs/superpowers/plans/2026-05-05-cutter-project-scoped-cut-tasks.md`：项目内剪切任务收束计划。
- `apps/cutter-web/src/app/CutterApp.tsx`：剪辑端主应用、路由、项目层、项目切换、搜索定位和剪切队列逻辑。
- `apps/cutter-web/src/features/project-home/ProjectHomePage.tsx`：项目启动页和最近项目交互。
- `apps/cutter-web/src/features/material-locator/MaterialLocatorPage.tsx`：素材定位主工作台。
- `apps/cutter-web/src/features/cut-queue/CutQueuePage.tsx`：剪切任务页面。
- `apps/cutter-web/src/state/cutter-projects.ts`：项目状态、项目创建、搜索记录、剪切片段归属。
- `apps/cutter-web/src/state/cut-queue.ts`：剪切队列状态和 API 映射。
- `packages/cutter-api/src/index.ts`：剪辑端 API。
- 相关测试文件：`apps/cutter-web/src/cutter-app.test.ts`、`apps/cutter-web/src/cutter-state.test.ts`、`packages/cutter-api/src/index.test.ts`。

## Current Problems
- 用户最新反馈还未完成落地：
  - 从启动页进入素材定位页后，右侧剪切队列没有加载当前项目任务。
  - 点击项目切换器“回到启动页”后仍显示旧项目名；启动页应进入无项目状态，搜索应创建新项目。
  - 最近项目卡片应单击选中并更新右侧项目详情，选中卡片中间显示“进入项目”，而不是单击直接进入。
  - 启动页搜索入口应更像首页搜索：居中、放大、突出应用 Logo 和搜索框。
  - 素材定位页的剪切队列需要展示更多剪切信息，并使用更稳定的剪切命名规则，不应只用文案或导出 ID。
  - 剪切队列状态四项应一排显示。
  - 用户发现加入剪切任务时切换候选素材像卡住，需要排查是否 UI 等待剪切 API 导致交互阻塞。
  - 用户标注过视频显示时长与真实视频时长不匹配、项目已剪片段数与真实数据不符，需要后续排查。

## Commands and Results
- `npm test`：415 个测试通过。
- `npm run typecheck`：通过。
- 保存点提交：`ca2719a chore: checkpoint cutter project handoff`。

## Next Step for New Thread
1. 在 `/Users/allen/Documents/mixlab` 执行 `使用 $context-safe 接力`。
2. 新线程先读取 `.codex-context/PROJECT.md`、`.codex-context/TASK.md`、`.codex-context/HANDOFF.md`。
3. 检查 `git status --short` 和当前页面/服务状态。
4. 先复述当前产品目标、已完成、待完成和下一步，等用户确认。
5. 用户确认后，优先修复项目层与剪切任务最新反馈：项目队列加载、启动页无项目状态、项目卡片选择/进入、启动页搜索布局、剪切队列信息与命名。

## Risks and Warnings
- 接力后如果发现工作区有未提交业务改动，先读 `git diff --stat` 和相关源码，不要用 `git reset --hard`、`git checkout --` 清掉。
- 不要重新实现已经落地的项目层、素材定位和搜索容错能力；应基于现有代码继续修补最新反馈。
- 如果 `.codex-context` 与源码冲突，以源码为准；如果文档与测试结果冲突，以测试结果为准。

## Resume Prompt
```markdown
请使用 $context-safe 接力。

如果无法识别 $context-safe，请先阅读：
- .codex-context/PROJECT.md
- .codex-context/TASK.md
- .codex-context/HANDOFF.md

然后请检查：
- 当前项目路径
- 当前 Git 分支
- git status --short

先不要改代码。
请先复述当前任务目标、非目标、已完成、待完成、下一步。
如果文档和代码冲突，以代码为准。
如果文档和测试结果冲突，以测试结果为准。
复述完停下来，等我确认。
```
