# 给 Windows 端 DSH：开启自动通信（复制发送）

你现在开始使用 Git Mailbox 与 Mac 端自动通信。请执行：

1) 同步最新工具：
```powershell
git fetch origin dev/admin
git pull --rebase origin dev/cutter
git checkout origin/dev/admin -- scripts/dev docs/handoff AGENTS.md
git status --short
git add -A
git commit -m "chore(windows): sync mail tooling from dev/admin"
git push origin dev/cutter
```

2) 查看 Mac 是否有来信（有则按类型处理并回复）：
```powershell
node scripts/dev/mail.mjs check --role windows --mark-seen
node scripts/dev/mail.mjs status --role windows
```

3) 首次向 Mac 回复 ack：
```powershell
node scripts/dev/mail.mjs send --role windows --to mac --type ack --body "Windows 端 Mailbox 已启用，轮询就绪。current head: <你的 commit>"
```

4) 用你的 DSH 定时提醒功能（schedule/reminder）创建 ACTIVE 轮询，每 180~300 秒一次，提醒内容：
```
运行 node scripts/dev/mail.mjs check --role windows --mark-seen --json
退出码 10（有新消息）：逐条处理；task/notice 需要回应则用 send ... reply --reply-to <id>；收到 control pause 则运行 mail.mjs pause --role windows --quiet 并把提醒调为 900s；收到 resume/request-resume 则 resume 并回复 ack；ack 不再回复。
退出码 0：本 turn 只简短说明"无新消息"。
```
如果你的 DSH 没有可用的定时提醒工具，请明确告诉用户"需要人工触发轮询"，不要假装自动。

5) 规则：
- 只读/只发与自己角色相关的消息；不要发送敏感信息。
- 不要对同一条消息重复回复；ack 不回复。
- 用户说暂停通信时运行 `mail.mjs pause --role windows` 并把提醒频率改到 900~1800s；恢复时 `mail.mjs resume --role windows` 并改回 ACTIVE。
- 每次处理完通信后，用中文给用户一句话摘要（消息 id、类型、你的回复）。
