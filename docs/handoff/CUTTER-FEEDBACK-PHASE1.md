# MixLab Cutter 反馈系统 Phase 1 规格

- 版本目标：0.18.28
- 日期：2026-11-02
- 状态：用户已认可方案，进入实现

## 1. 核心原则

1. 剪辑师只描述“哪里不对”，不要求写技术细节。
2. 系统自动采集上下文、截图、日志、最近操作、性能数据。
3. 文案/选中内容允许采集，但密码、token、Cookie 永不采集。
4. NAS 不可用时本地排队，不丢反馈。
5. 每条反馈有唯一编号，自动写入 NAS 收件箱。
6. 反馈默认自动上传；用户可取消截图。

## 2. 用户入口

- 全局左下/侧栏底部增加“反馈”按钮，所有用户可用。
- 错误/空态/剪切失败处提供“反馈这里”快捷入口。
- 设置页保留“反馈”入口。
- 不占用顶栏主操作区。

## 3. 反馈表单

类别：

- 找不到
- 剪错了
- 太慢
- 卡住/报错
- 建议

用户填写：

- 一句话描述（必填）
- 期望结果（可选，剪错时建议填写）
- 截图复选框（默认勾选）

系统自动附带：

- 应用版本、build commit、release 版本
- Windows 版本、用户名、机器标识（哈希）
- 当前页面/路由、项目、筛选器
- 搜索词、老师筛选、结果数、选中文本、视频 ID、时间范围
- 剪切任务 ID、cut mode、输出路径、校验结果、degrade_reason
- 最近 2~5 分钟操作轨迹
- 最近错误、前端 console、Tauri/API/ffmpeg 日志尾部
- 关键耗时（搜索/页面/剪切/更新）
- NAS/公共库/API/searchd 状态
- 当前窗口截图（可选，失败也不阻塞提交）

提交后：

- 显示反馈编号，例如 `FB-20261102-0017`
- 上传成功：`已自动发送`
- 上传失败：`已保存到本机，连接 NAS 后自动发送`

## 4. 反馈包结构

NAS 收件箱：

```text
\\192.168.1.27\MixLab\CutterFeedback\
  inbox\
  processed\
  rejected\
```

每条反馈一个目录：

```text
inbox/FB-20261102-0017/
  feedback.json
  context.json
  events.jsonl
  screenshot.png
  logs/
    app.log
    cutter-api.log
    ffmpeg.log
```

`feedback.json` 核心字段：

```json
{
  "schema_version": "1.0",
  "feedback_id": "FB-20261102-0017",
  "created_at": "2026-11-02T09:00:00Z",
  "category": "剪错了",
  "message": "用户描述",
  "expected": "期望结果",
  "app_version": "0.18.28",
  "build_commit": "abc1234",
  "release_version": "v012759",
  "page": "material-locator",
  "context": {},
  "timings": {},
  "errors": [],
  "attachments": ["screenshot.png", "events.jsonl"]
}
```

## 5. 自动上传与离线队列

- 本地暂存：`%LOCALAPPDATA%\MixLab Cutter\feedback\pending\<id>\`
- 成功上传后移动到 `sent`。
- 启动时、每 5 分钟、网络恢复时重试 pending。
- 上传到 NAS 使用目录级原子复制：先写本地完整目录，再复制为 `inbox/<id>.partial`，完成后 rename 为 `<id>`。
- 失败原因写入本地 `upload-error.json`，设置页可见“待发送反馈 N 条”。
- 删除/清理不自动删除 sent；保留最近 30 天。

## 6. Mac 侧自动收取

新增 `scripts/dev/feedback-watch.mjs`：

- 每 5 分钟扫描 NAS `inbox`；
- 校验 `feedback.json` 和编号；
- 复制到本地 `~/Library/Application Support/MixLab/Feedback/inbox/<id>/`；
- 生成 `summary.md`：用户、版本、页面、类别、最近操作、错误摘要、截图路径；
- 写本地标记文件 `~/Library/Application Support/MixLab/Feedback/last-check.json`；
- 将 NAS 原目录移动到 `processed/`；
- 校验失败移动到 `rejected/`；
- 不删除原始证据；
- 由 DSH 定时任务读取 summary 并进入分析/修复队列。

## 7. 自动化处理流程

```text
剪辑师提交
  -> 本地打包
  -> NAS inbox
  -> feedback-watch
  -> summary.md
  -> DSH 定时检查
  -> AI 分类/复现/优先级
  -> 修复任务
  -> 版本说明回写
```

## 8. 隐私与安全

- 截图默认勾选，用户可取消；
- 不采集密码、token、Cookie、浏览器凭据；
- 日志中的绝对路径可保留；
- 使用机器哈希而非硬件指纹；
- NAS 目录仅内部读写；
- 保留 30 天后归档/清理策略后续确定。

## 9. 验收

1. 任意页面点击反馈，5 秒内完成提交；
2. 自动生成完整反馈包；
3. 截图可见，取消后不附带；
4. NAS 在线时自动出现在 inbox；
5. NAS 离线时进入 pending，恢复后自动发送；
6. watcher 自动生成 summary 并移动 processed；
7. 错误/剪切失败/搜索空态快捷入口可用；
8. 密码/token 不出现在包内；
9. 0.18.28 构建/升级/更新回归通过。

## 10. 分工

- Windows：Cutter 前端反馈入口、自动采集、Tauri 打包/上传/截图、本地队列、设置页状态。
- Mac：NAS 收件箱结构、feedback-watch、summary 生成、DSH 定时收取与分析。
- 发布：0.18.28 先小范围验证，再全员开启。
