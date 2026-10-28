# 双端自动通信（Git Mailbox）

目标：Mac 与 Windows 的两个 DeepSeek Harness 会话**不通过人工复制粘贴**也能互相通知/回复。

## 原理

- 每端只写自己的发件箱（不会冲突）：
  - Mac：`docs/handoff/mail/outbox-mac/*.json` → 提交/推送到 `dev/admin`
  - Windows：`docs/handoff/mail/outbox-windows/*.json` → 提交/推送到 `dev/cutter`
- 发送 = 新 JSON 文件 + `git commit/push`；接收 = 对方分支 `git fetch` + `git show` 读取。
- 已读状态存本机 `.git/mixlab-mail/state-<role>.json`（不提交）。
- **轮询驱动**：两端的 DSH 用"定时提醒（schedule）"每隔几分钟运行一次检查命令；有新消息就处理并回复。
- **不存在实时 socket**：延迟 = 轮询间隔（建议 ACTIVE 3 分钟）；两端 DSH 程序需要保持打开。

## 命令

```bash
# 发送
node scripts/dev/mail.mjs send --role mac --to windows --type notice --body "说明"
node scripts/dev/mail.mjs send --role windows --to mac --type reply --reply-to <id> --body "回复"

# 检查（有未读退出码 10，无未读 0）
node scripts/dev/mail.mjs check --role mac
node scripts/dev/mail.mjs check --role mac --mark-seen --json

# 状态
node scripts/dev/mail.mjs status --role mac

# 暂停 / 恢复（会通知对方）
node scripts/dev/mail.mjs pause --role mac
node scripts/dev/mail.mjs resume --role mac
```

## 消息类型

| type | 含义 | 收到后 |
|---|---|---|
| notice | 通知，无需立即回复 | 阅读，必要时回复 ack |
| task | 请求对方做事 | 执行后回复 reply（带 reply_to） |
| reply | 对某个消息的回复 | 继续处理/更新状态 |
| ack | 确认收到 | 不再回复（避免循环） |
| control | 暂停/恢复指令（action=pause/resume） | 调整自己的轮询频率，必要时回 ack |
| status | 状态汇报 | 记录/转给用户 |

## 轮询行为（DSH 代理）

ACTIVE 模式（每 180~300 秒运行一次）：
```bash
node scripts/dev/mail.mjs check --role mac --mark-seen --json
```
- 退出码 10 = 有新消息：逐条按 type 处理；处理完用 `send ... reply --reply-to <id>` 回复（task/notice 需要回应时）。
- 退出码 0 = 无新消息：本 turn 简短说明即可，不要重复回复。
- 收到 `control pause`：运行 `node scripts/dev/mail.mjs pause --role mac --quiet` 并把提醒频率调低（如 900s），只检查 `resume/request-resume`。
- 收到 `control resume` 或 `request-resume`：运行 `node scripts/dev/mail.mjs resume --role mac --quiet`，恢复 180~300s 轮询，并回复 ack。

PAUSED 模式（每 900~1800 秒）：
- 只检查 control 消息；若收到 `resume/request-resume` 自动恢复并回复。
- 用户说"暂停通信"：运行 `mail.mjs pause --role mac`，同时把提醒改为 PAUSED 频率（不要删除提醒，否则无法自动恢复）。
- 用户说"恢复通信"：运行 `mail.mjs resume --role mac`，提醒改回 ACTIVE 频率。

## 防止循环

- 不要对 `ack` 再回复；
- 同一条消息的 reply 只发一次；
- 自己发出的消息不会被自己的 check 读到（只读对方 outbox）。

## 安全与限制

- 信箱内容会进入 Git 历史，**不要发送密码/token/真实素材路径**。
- 每次发送都会产生一次 commit+push；轮询无新消息时不会写文件。
- 延迟取决于轮询间隔与 DSH 是否打开；两端都关闭时消息在 Git 里排队，下次打开后处理。
- 如 Git 网络不可用：发送失败不会丢消息（本地已提交），下次可 `git push` 补推。
