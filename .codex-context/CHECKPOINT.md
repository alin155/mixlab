# Checkpoint

## Last Updated
2026-05-06

## Current State
MixLab V3 剪辑端项目层、素材定位和剪切任务模块已进入连续产品迭代阶段。当前重点是把剪辑师的“搜、选、剪”闭环收束到项目内，让搜索记录、剪切任务、本地素材和项目启动页形成稳定工作流。

## Saved Commit
- `ca2719a chore: checkpoint cutter project handoff`

## Verification
- `npm test`：415 个测试通过。
- `npm run typecheck`：通过。

## Product Focus
- 启动页：搜索优先、最近项目、项目详情、项目切换。
- 素材定位：搜索文案、候选素材、视频预览、自然文案、命中跳转、直接剪切。
- 剪切任务：项目内任务列表、任务状态、剪切命名、剪切结果进入本地素材。
- 项目归属：搜索词、剪切任务、本地素材复用都应归属到当前项目。

## Suggested Next Step
继续修复最新用户反馈：项目队列加载、启动页无项目状态、最近项目选择/进入交互、启动页搜索布局、剪切任务信息密度和命名规则。
