# Current Task

## Task Goal
继续推进 MixLab V3 剪辑端项目层、素材定位、剪切任务与项目内数据收束的产品和工程落地。

## Non-goals
- 不修改无关业务模块。
- 不删除用户未确认的数据目录。
- 不改变管理端既有稳定功能，除非当前任务明确需要。

## Allowed Change Scope
- `apps/cutter-web/`
- `packages/cutter-api/`
- `docs/`
- 与当前剪辑端项目层、搜索定位、剪切队列、项目数据归属相关的测试文件。

## Disallowed Change Scope
- 未确认的外部素材库数据。
- 用户本地视频素材。
- 与当前任务无关的全局配置。

## Done When
- 剪辑端项目层、搜索定位、剪切任务页面行为符合当前讨论结论。
- 项目内搜索词和剪切任务归属清晰。
- 核心测试通过。
- 用户可以在浏览器中测试对应流程。

## Validation
- `pnpm --filter @mixlab/cutter-web test`
- 必要时运行相关 API 测试。
- 浏览器验证 `#project-home`、`#material-locator`、`#cut-tasks`。

## Current Plan
1. 修正项目上下文目录到 `/Users/allen/Documents/mixlab`。
2. 保留并核对当前未提交改动。
3. 继续修复剪辑端项目切换、任务队列加载、项目主页交互和剪切任务命名。
4. 运行测试。
5. 交给用户浏览器测试。

## Progress
已将正确项目上下文目录初始化到 `/Users/allen/Documents/mixlab/.codex-context`。
