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


## 可视化看板（实时查看沟通记录）

### 桌面一键启动/停止

桌面有两个快捷图标（指向仓库脚本，仓库更新后自动生效）：

- **MixLab看板-启动.command**：未运行则后台启动服务并自动打开 <http://127.0.0.1:8791>；已运行则只打开页面（不会重复启动）。终端窗口可以直接关掉，服务在后台继续运行，也独立于 DSH 会话。
- **MixLab看板-停止.command**：停止看板服务。

重启电脑后，双击一次"启动"即可。日志：`~/Library/Logs/MixLab/mail-dashboard.log`。


在 Mac 上运行（只读、仅监听 127.0.0.1）：

```bash
cd ~/Documents/mixlab
node scripts/dev/mail-server.mjs --port 8791
```

浏览器打开：<http://127.0.0.1:8791>

- 页面每 2.5 秒自动刷新；服务端每 15 秒 `git fetch` 一次，Windows 消息通常在 push 后 15~20 秒内出现；
- 展示：双方消息（类型/方向/时间/线程）、暂停/恢复状态、双方最新状态报告；
- 只读：不写仓库、不 commit；可随时 Ctrl+C 停止；
- 需要后台常驻时：
  ```bash
  nohup node scripts/dev/mail-server.mjs --port 8791 > /tmp/mixlab-mail-dashboard.log 2>&1 &
  ```
- 参数：`--refresh 3000`（页面/API 刷新缓存）、`--fetch 15000`（Git 拉取间隔）、`--no-fetch`（离线只读本地）。


## 沟通准则与 SLA（Round7 补充）

### 判断表

| 情况 | 动作 |
|---|---|
| 改共享包/契约/protocol/行为语义 | 先发 task，Mac 单写者修改；Windows 同步后再继续 |
| 对契约/错误码/路径/格式不确定 | 发 task（附代码位置/期望），等 reply 再动手 |
| 平台差异（Windows/macOS/Linux） | 发 task + 证据（命令/日志/文件路径） |
| 被阻塞 ≥30 分钟 | 发 task 并加 `--blocking` |
| 需要人工决策（优先级/验收/上线） | 发 task `--needs decision` |
| 只改自己目录且测试全绿 | 不发消息（护栏自动校验） |

### 消息字段

```bash
node scripts/dev/mail.mjs send --role windows --to mac --type task \
  --needs action --blocking --evidence "C:/dev/logs/smoke.log" \
  --reply-to <可选> --body '一句话说明需要对方做什么'
```

- `--needs action|decision|none`：请求行动/请求决策/仅通知；
- `--blocking`：阻塞项；
- `--evidence <path>`：证据路径（可重复）；
- **除 ack 外正文不能为空**（脚本会拒绝）。

### SLA

- ACTIVE（轮询 180~300s）：task/reply 在下一次轮询处理，blocking 优先；
- PAUSED：只处理 control resume/request-resume；
- 48 小时无状态报告视为停滞。

### 待办/看板

- 终端：`node scripts/dev/mail.mjs pending --role mac|windows --json`（needs_you / decisions / awaiting_peer / blocking）
- 看板：<http://127.0.0.1:8791> 右侧"待处理 / 阻塞"面板会列出需要我/你处理的项，消息卡片显示"阻塞/需决策/需处理"标记。


## 防停滞硬规则（2026-10-29 起）

- **必须在角色分支执行 send**：mac 固定 `dev/admin`，windows 固定 `dev/cutter`。
  `mail.mjs send` 已加分支守卫：若当前分支不是角色分支，直接报错并给出 `git switch` 命令，避免消息提交到 main/integ 等分支后对端永远读不到。
- **推送核验**：send 成功后会 fetch 角色分支并确认消息文件已出现在 `origin/<角色分支>`；核验失败同样报错（不会静默丢失）。
- **切换分支/合并前先处理邮箱**：集成、发布或任何需要离开角色分支的操作前，先 `check` 并回复/发送完待发消息；完成后切回角色分支再继续通信。
- `check/pending/status` 在非角色分支仍可读取（会打印 warn），但需要回复时先切回角色分支。
- 若等待对端回复超过 30 分钟且对方 DSH 在线，先确认双方都在角色分支；必要时用 `git log origin/<对端分支> --oneline` 看对端是否真的没有新提交。

- **停滞预警**：`pending`/看板会对"已发出但对方 >30 分钟未回复"的任务标记 `stalled`（看板显示「可能停滞（>30 分钟）」）；出现时先确认双方仍在角色分支并检查对端是否真的没有新提交。

## Codex 第三方顾问（只读）

- `scripts/dev/advisor.mjs watch` 自动评审新 Mailbox 消息（默认 60s 一轮，批量提交给 Codex）。
- Codex 以只读沙箱运行在临时仓库快照内：`codex exec --sandbox read-only`，不能修改代码/不能 git 写/不能部署。
- 顾问意见写入 `outbox-mac`，消息标记 `from=codex-advisor`、`type=notice`、`needs=none`；不阻塞、不进入待办，可采纳或不采纳。
- 看板新增 Codex 顾问最新意见面板与筛选；日志 `~/Library/Logs/MixLab/advisor.log`。
- 暂停顾问：停掉 dashboard/launcher 中的 advisor watcher 进程即可；不影响双端通信。
