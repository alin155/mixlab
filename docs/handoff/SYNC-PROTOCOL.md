# 双端协作协议（Git 状态信箱，无冲突）

两台机器的 DeepSeek Harness **不会互相通信**。我们通过 Git 仓库做"异步信箱"，不通过合并代码。

## 信箱位置

| 谁写 | 写到哪里（自己的分支） | 对方怎么读 |
|---|---|---|
| Mac | `dev/admin` 的 `docs/handoff/status/mac-latest.md` | Windows：`node scripts/dev/read-peer-status.mjs --peer mac` |
| Windows | `dev/cutter` 的 `docs/handoff/status/windows-latest.md` | Mac：`node scripts/dev/read-peer-status.mjs --peer windows` |

两个文件**不同名**，所以永远不会互相冲突。

## 报告节奏

每完成一个阶段至少报告一次：环境就绪、首次测试结果、每次 push、被阻塞、收工。报告文件由脚本自动生成，手写内容可追加到文件末尾的"人工说明"。

## 读取方注意

- 读取前脚本会自动 `git fetch origin`，拿的是对方最新 push。
- 报告里有时间戳，超过 48 小时视为过期，需对方重新生成。
- 读取不会修改工作区、不会 merge，完全安全。

## 人工兜底

如果 Git 不可用，Windows 端把 `docs/handoff/status/windows-latest.md` 的内容，或脚本输出的 SYNC-RESULT 块，复制给 Mac 侧用户转达。
