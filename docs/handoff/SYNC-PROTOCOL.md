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


## 自动化护栏（三层，避免协同冲突）

1. **本地钩子**（每台机器安装一次）：
   ```bash
   node scripts/dev/install-hooks.mjs
   ```
   - pre-commit：写入域检查（`scope-check --staged`）；
   - pre-push：落后远端/merge commit/越界/共享未同步拦截。
2. **CI（GitHub Actions）**：`.github/workflows/sync-guard.yml`
   - 写入域检查（按 dev/admin / dev/cutter 角色）；
   - 禁止交付分支 merge commit；
   - dev/cutter 的共享目录必须与 dev/admin 完全一致。
3. **状态通知（可选）**：`.github/workflows/windows-status-notify.yml`
   - dev/cutter push 状态报告时，自动创建/更新 Issue `[windows-status]`。

### 为什么这样能"避免冲突"

- 两条分支**从不 merge**（CI 直接拒绝 merge commit），所以不存在合并冲突；
- 两台机器可写文件集合**不相交**（钩子/CI 拒绝越界），所以不存在同文件并发编辑；
- 共享内容**单写者 + 自动一致性校验**，Windows 只能同步、不能改，所以永远不会在共享内容上分叉。

唯一仍可能"冲突"的情况：两台机器同时修改同一个 git 引用（如同时 push）——pre-push 会检测落后远端并提示 `git pull --rebase`，只需重试一次，不会产生内容冲突。
