# Current Task

## Task Goal
继续推进 MixLab V3 剪辑端项目层、素材定位、剪切任务与项目内数据收束的产品和工程落地。

## Non-goals
- 不修改无关业务模块。
- 不改变管理端既有稳定功能，除非当前任务明确需要。
- 不改动用户本地素材、公共素材库原视频或已生成媒体资产。

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
1. 修复项目切换器“回到启动页”的无项目状态。
2. 修复从启动页进入素材定位后剪切队列加载当前项目任务。
3. 优化最近项目卡片：单击选中，卡片内显示“进入项目”，右侧项目详情随选中项目切换。
4. 优化启动页搜索入口：突出搜索、收起选项、弱化说明文字。
5. 优化素材定位页剪切队列：任务状态一行展示、更多剪切信息、更稳定的剪切命名规则。
6. 排查加入剪切任务时 UI 是否被剪切 API 阻塞。
7. 排查视频显示时长与真实视频时长不匹配、项目已剪片段数与真实数据不符。
8. 运行测试并交给用户浏览器测试。

## Progress
已完成项目层基础保存点提交：`ca2719a chore: checkpoint cutter project handoff`。
