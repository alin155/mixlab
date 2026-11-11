# Cutter 反馈增强：剪切失败要带可定位的错误原因

- 反馈：FB-20261111-24688204
- 用户：阳慧
- 版本：0.18.28
- 现象：素材搜索页“剪辑失败”；CJ20261111-0001/0002 两个 copy 任务 status=failed、verification=failed、output_path 为空。
- 问题：当前反馈 context 的 cut_tasks 只记录 status/verification，没有 error_code/error_message/校验项，无法定位是源文件、关键帧、时长校验还是 NAS 读取问题。

## 修复要求

反馈 context 的剪切任务补充：

- error_code
- error_message
- cut_mode_used
- degrade_reason（如有）
- verification 的完整 checks（哪一项失败、期望/实际/容差）
- begin_ms/end_ms
- source_video_id / source_title
- 最近 3 个失败任务即可，避免包过大

要求：

1. 0.18.33+ 的前端反馈采集能拿到当前 queueJobs 的错误字段；如果字段已被映射丢失，补齐映射。
2. 测试：构造 failed job，断言 feedback.context.cut_tasks 含 error_code/message 和 verification 明细。
3. 不改变反馈包 schema_version；只新增可选字段。

## 对本次反馈的处理

- 先让阳慧升级到 0.18.33 后重试；
- 如仍失败，用新版本反馈，届时应包含具体 error_code/checks；
- 若 0.18.28 已有 job 文件，可另行让管理员读取，但不默认要求剪辑师手工找日志。
