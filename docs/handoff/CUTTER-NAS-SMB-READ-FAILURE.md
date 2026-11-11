# Cutter 剪切失败：NAS public library SMB 读取错误（P1 待排查）

- 反馈：FB-20261111-30439968（卢小兰，0.18.28，剪切3秒一直等待）
- 反馈：FB-20261111-59541048（肖锦森，0.18.31，老是剪辑失败）
- 共同日志：
  `cutter_api_stream_file_failed`，路径为：
  \\192.168.1.27\MixLab\PublicLibrary\source-videos\...
  error=UNKNOWN: unknown error, read
- Mac 侧 NAS 当前可 ping、SMB 3.1.1 挂载、样例 MP4 可读；因此更可能是 Windows SMB 客户端/会话/负载或大文件长距离读取，而不是 Cutter 接口本身。

## 排查要求

1. 在两个反馈包中确认 cutter-api stream file failed 与失败剪切任务的时间/源文件相关性；
2. 在 Windows 上检查 SMB 会话/事件日志/网络错误；
3. Cutter API 对 UNC 文件流读取增加可观测性：
   - 记录 source_video_id/路径、range、重试次数、错误码；
   - 对可重试读错误做有限重试/回退，不要直接让剪切失败；
4. 前端反馈 context 的 cut_tasks 必须带 error_code/error_message（已另发任务）；
5. 如确认是 NAS/网络，明确环境结论，不为 Cutter 代码背锅；同时给用户重试/升级建议。
