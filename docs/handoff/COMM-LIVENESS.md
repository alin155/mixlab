# 双端通信存活机制（Communications Liveness）

> 状态：Mac 侧监控已实现；Windows 侧 watchdog 尚未安装。  
> 目标：避免"Mac 等 Windows、Windows 等 Mac"的静默停摆；禁止 watchdog 消费任务。

## 1. 故障模式

- Git Mailbox 是**拉取式**：发送 = commit+push；接收方必须主动 fetch/check。
- 双方依赖 DSH 会话/定时提醒轮询；一方会话空闲、提醒暂停或等待输入时，消息会停在远端。
- Mac 没有直接唤醒 Windows 进程的通道；仅靠"再发一条消息"无法唤醒。
- 2026-10-29 实际例子：Windows 最后活动 18:33 UTC，Mac 18:38 发任务，35+ 分钟无轮询。

## 2. 已实现：Mac 侧 liveness monitor

脚本：scripts/dev/mail-liveness.mjs

- **只读**：调用 mail.mjs pending --json --no-fetch，不调用 check --mark-seen；不会吞掉 DSH 未读任务。
- **不自动发消息**：不向 mailbox 写 notice/task，避免制造新队列。
- 指标：
  - awaiting_peer 条数与最久等待分钟；
  - Windows 最后活动（dev/cutter 最新 commit 与 status generated_at 的较晚者）；
  - pending 读取错误。
- 阈值：等待 10 分钟、peer 15 分钟（环境变量 MIXLAB_LIVENESS_PENDING_MIN / MIXLAB_LIVENESS_PEER_MIN）。
- 告警：macOS 通知 + ~/Library/Logs/MixLab/mail-liveness.log；同一异常 key 只通知一次，恢复后重新布防。
- 随看板启动/停止：mixlab-mail-dashboard-start.command / stop.command。

## 2.1 已实现：任务停滞 watchdog

脚本：scripts/dev/mail-watchdog.mjs

- **只读**：读取 pending 任务与远端分支 commit，不消费邮件、不自动发消息。
- 代码类任务必须在下发正文声明 `watch_branch: ui/xxx`；模板见 MAIL-TASK-TEMPLATE.md。
- 判定：
  - 任务创建后无新 commit，超过 20 分钟 = stall；
  - 最后一次 commit 超过 20 分钟 = stall；
  - 超过 30 分钟 = 建议 Mac 接管。
- 阈值可用 `--stall` / `--takeover` 调整；同一任务/状态只通知一次。
- 启动：随 dashboard start 脚本常驻，日志 ~/Library/Logs/MixLab/mail-watchdog.log。
- 手动检查：`node scripts/dev/mail-watchdog.mjs check --json`。

## 3. 尚未实现 / 下一步

### 3.1 协议（必须先修消费语义）

- 当前 pending 把"任何 reply_to 回复"视为办结；如果 Windows 先回 started，任务会提前消失。
- 先改 computeAttention：固定 task_id，状态 queued → started → done/failed；只有 done/failed 关闭待办；started 只表示执行中。
- 先只做超时告警，不做自动重派；未来需要自动接管再加 owner/epoch/expiry lease。

### 3.2 Windows OS watchdog（需 Windows 端验证）

- Task Scheduler 每 2~5 分钟运行：
  - fetch + mail.mjs check --role windows --json（观察用，不要先 --mark-seen）；
  - 写本地 poll/agent heartbeat；
  - 有待办时弹通知/尝试唤醒 DSH。
- **限制**：
  - 启动 DSH 窗口 ≠ 恢复会话/注入任务/执行；需验证 DSH 是否有受支持的无人值守入口。
  - 交互式任务需要用户已登录；S4U 模式无网络会影响 Git/模型调用。
  - 必须单实例锁、启动退避、超时、日志；不能与 DSH 并发提交。
- 未验证前：watchdog 只做"检查 + 通知"，不自动 --mark-seen，不自动重发。

### 3.3 Dashboard

- 后续把 liveness 状态显示为红色横幅（当前先依赖 macOS 通知 + 日志）。
- 不在每轮 commit 里写 heartbeat（会制造噪音）；本地状态优先。

## 4. 操作

手动检查：
    node scripts/dev/mail-liveness.mjs check --json
后台常驻：
    node scripts/dev/mail-liveness.mjs watch --interval 60
停止：dashboard stop 脚本会一并停止。

## 5. 原则

- watchdog 不得消费任务、不得自动发消息、不得自动切分支/rebase。
- 一次只给对端一个 active task；新任务等上一个终态。
- 业务串行不得阻塞 ack/reply/control。
- 不把通信改造混入 0.18.13.1/0.18.14 产品发布。
