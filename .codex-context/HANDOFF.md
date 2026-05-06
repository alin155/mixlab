# Handoff

## Task Goal
继续推进 MixLab V3 剪辑端项目层、素材定位、剪切任务与项目内数据收束的产品和工程落地。

## Non-goals
- 不修改无关业务模块。
- 不删除用户未确认的数据目录。
- 不改变管理端既有稳定功能，除非当前任务明确需要。

## Completed
- 已确认正确项目根目录是 `/Users/allen/Documents/mixlab`。
- 已将 `.codex-context` 初始化到 `/Users/allen/Documents/mixlab/.codex-context`。
- 已删除误建的 `/Users/allen/Documents/New project 2`，删除前确认其中没有真实业务文件，只有 `.DS_Store` 和误建的上下文文件。
- 剪辑端已进入项目层与剪切任务模块的产品落地阶段：项目启动页、项目切换器、素材定位、剪切队列、项目内搜索/剪切归属正在迭代。
- 当前工作区已有多处未提交改动，属于剪辑端项目层、素材定位、剪切任务、剪辑 API 的连续开发上下文。

## Modified Files
- `.codex-context/README.md`：说明本地上下文记录目录用途。
- `.codex-context/PROJECT.md`：记录 MixLab V3 项目摘要、重要目录和项目规则。
- `.codex-context/TASK.md`：记录当前任务目标、非目标、允许范围、验收方式和当前计划。
- `.codex-context/CHECKPOINT.md`：记录上下文目录修正过程和已知路径风险。
- `.codex-context/HANDOFF.md`：本交接文件。
- `apps/cutter-web/src/app/CutterApp.tsx`：剪辑端主应用状态、路由、项目层、项目切换、搜索定位和剪切队列相关逻辑有未提交改动。
- `apps/cutter-web/src/cutter-app.test.ts`：剪辑端应用级测试有未提交改动，覆盖项目层、搜索定位、队列刷新等行为。
- `apps/cutter-web/src/cutter-state.test.ts`：剪辑端状态测试有未提交改动，覆盖剪切队列、项目归属、命名等状态逻辑。
- `apps/cutter-web/src/features/cut-queue/CutQueuePage.tsx`：剪切任务页面有未提交改动，方向是项目内任务显示和任务数据收束。
- `apps/cutter-web/src/features/material-locator/MaterialLocatorPage.tsx`：素材定位页有未提交改动，包含搜索记录、候选素材、视频文案、剪切队列面板、项目内数据展示等。
- `apps/cutter-web/src/features/project-home/ProjectHomePage.tsx`：项目启动页有未提交改动，包含项目卡片、项目详情、开始搜索入口和项目选择交互。
- `apps/cutter-web/src/state/cut-queue.ts`：剪切队列状态与 API 映射有未提交改动，涉及项目归属、任务命名和队列数据。
- `apps/cutter-web/src/state/cutter-projects.ts`：剪辑项目状态有未提交改动，涉及项目创建、搜索记录、剪切片段归属等。
- `apps/cutter-web/src/styles.css`：剪辑端 UI 布局和项目/素材定位/队列样式有未提交改动。
- `packages/cutter-api/src/index.ts`：剪辑端 API 有未提交改动，涉及剪切任务、项目字段或本地工作区数据。
- `packages/cutter-api/src/index.test.ts`：剪辑端 API 测试有未提交改动。
- `docs/superpowers/plans/2026-05-05-cutter-project-scoped-cut-tasks.md`：新增项目内剪切任务收束的开发计划草稿。

## Current Problems
- 当前会话环境里曾出现错误 `cwd=/Users/allen/Documents/New project 2`，但该目录已删除；后续必须显式使用 `/Users/allen/Documents/mixlab`。
- 当前 Git 分支是 `codex/m11-worker-supervisor`，工作区未提交改动较多，新线程接力后不要先改代码，应先复述并确认。
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
- `git rev-parse --show-toplevel`：返回 `/Users/allen/Documents/mixlab`。
- `git branch --show-current`：返回 `codex/m11-worker-supervisor`。
- `git status --short`：显示 11 个已修改业务文件、1 个新增计划文档、以及新增 `.codex-context/`。
- `git diff --stat`：业务文件当前统计为 `11 files changed, 772 insertions(+), 213 deletions(-)`，不含未跟踪文件。
- `git diff --name-only`：列出剪辑端前端、剪辑端状态、剪辑 API 和测试文件。
- 本次交接未运行测试；这是交接保存，不是开发完成验证。

## Next Step for New Thread
1. 在 `/Users/allen/Documents/mixlab` 执行 `使用 $context-safe 接力`。
2. 新线程先读取 `.codex-context/PROJECT.md`、`.codex-context/TASK.md`、`.codex-context/CHECKPOINT.md`、`.codex-context/HANDOFF.md`。
3. 检查 `git status --short`、`git diff --stat`、`git diff --name-only`。
4. 先复述当前任务目标、非目标、已完成、待完成和风险，等用户确认。
5. 用户确认后，优先修复项目层与剪切任务的最新反馈：项目队列加载、启动页无项目状态、项目卡片选择/进入、启动页搜索布局、剪切队列信息与命名。

## Risks and Warnings
- 不要把任何目录误认为 `/Users/allen/Documents/mixlab`，尤其不要再使用已删除的 `/Users/allen/Documents/New project 2`。
- 当前未提交改动来自连续多轮产品迭代，禁止用 `git reset --hard`、`git checkout --` 或类似方式清掉。
- `.codex-context/` 是新建上下文记录目录，目前未跟踪；如果用户希望持久接力，应保留。
- 工作区里已有业务改动，接力时不要重新实现同一批功能，应先读现有 diff。
- 如果 `.codex-context` 与源码冲突，以源码为准；如果文档与测试结果冲突，以测试结果为准。

## Resume Prompt
```markdown
请使用 $context-safe 接力。

如果无法识别 $context-safe，请先阅读：
- .codex-context/PROJECT.md
- .codex-context/TASK.md
- .codex-context/CHECKPOINT.md
- .codex-context/HANDOFF.md

然后请检查：
- 当前项目路径
- 当前 Git 分支
- git status --short
- git diff --stat
- git diff --name-only

先不要改代码。
请先复述当前任务目标、非目标、已完成、待完成、下一步。
如果文档和代码冲突，以代码为准。
如果文档和测试结果冲突，以测试结果为准。
复述完停下来，等我确认。
```
