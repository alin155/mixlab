# MixLab 开发规则（给 AI 代理 / 人类）

本仓库是同一个 monorepo，但两台机器按**两条独立交付线**开发，绝不整分支合并。

## 机器角色

| 机器 | 分支 | 开发内容 |
|---|---|---|
| Mac（本机） | `dev/admin` | 管理端（admin-web/admin-api/worker）与平台共享包 |
| Windows | `dev/cutter` | 剪辑端（cutter-web/cutter-desktop/cutter-api/cutter-local/ffmpeg-core/desktop-runtime） |
| 智能端（后续） | `dev/smart`（暂未启用） | 智能剪辑候选线 |

## 硬性规则（违反会造成冲突/漂移）

1. **不要做整分支 merge**（`git merge dev/admin` 等）：两条交付线的 `library-fs`/`cutter-api` 内部 API 已分叉，合并需要专门的 Phase B 迁移，不是日常操作。
2. **只改自己机器的目录**：
   - Mac：`apps/admin-web/`、`packages/admin-api/`、`packages/library-fs/`、`scripts/servers/admin-api-server.ts`、`scripts/workers/`；
   - Windows：`apps/cutter-web/`、`apps/cutter-desktop/`、`packages/cutter-api/`、`packages/cutter-local/`、`packages/ffmpeg-core/`、`packages/desktop-runtime/`、`packages/windows-test-runner/`、`scripts/desktop/`、`scripts/acceptance/windows-*`。
3. **共享包只能 Mac 侧修改**：`packages/contracts/`、`packages/library-format/`、`packages/service-clients/`、`packages/protocol/`、`packages/runtime-config/`、`packages/ui-foundation/`。
   Windows 只允许通过 `node scripts/dev/shared-sync.mjs --apply` 单向同步，不允许手改。
4. **共享工具/规则同样单向同步**：`scripts/dev/`、`docs/handoff/`、`AGENTS.md` 由 Mac 维护，Windows 只读。
5. **不 push --force**；不删除对方分支；不提交 `node_modules`、`.env`、token、真实素材、`docs/acceptance/artifacts/`。状态信箱例外：`docs/handoff/status/<自己>-latest.md` 由各端自己拥有（Mac: mac-latest.md，Windows: windows-latest.md）。
6. **提交前必须**：`git status` 确认只改了自己的目录；`npm run typecheck`；相关测试通过。
7. **状态信箱**：每次阶段性进展/收工，运行
   `node scripts/dev/sync-report.mjs --role mac|windows`
   生成 `docs/handoff/status/<role>-latest.md`，提交并 push 自己的分支；对方用
   `node scripts/dev/read-peer-status.mjs --peer mac|windows`
   读取。不要把这个文件写到对方目录。

## 常用命令

```bash
# 开始前
git switch dev/admin   # 或 git switch dev/cutter
git pull --rebase
git fetch origin

# 自检
npm run typecheck
npm test

# 共享包同步（Windows）
node scripts/dev/shared-sync.mjs            # 只检查
node scripts/dev/shared-sync.mjs --apply    # 执行（确认未手改共享包）
```

## 自动化护栏（防冲突）

每个克隆执行一次：`node scripts/dev/install-hooks.mjs`

- **pre-commit**：按分支角色拦截越界文件（Windows 只能改剪辑端；Mac 不能改剪辑端；共享内容只允许与 dev/admin 一致的同步）。
- **pre-push**：拒绝落后远端、拒绝 merge commit、拒绝越界、Windows 要求共享内容已同步。
- **CI（sync-guard workflow）**：push/PR 时自动重跑同样的检查（写入域、禁止 merge、共享一致性）。
- **状态通知（可选）**：push 状态报告时自动更新 GitHub Issue `[windows-status]`。
- **会话自检**：`node scripts/dev/session-start.mjs` 打印分支/远端/共享同步/对方最新状态。
- 禁止用 `--no-verify` 绕过；确需绕过要人工说明原因。

## 自动通信（Mailbox）与沟通纪律

两端的 DSH 通过 Git 信箱自动通信（详见 docs/handoff/MAIL.md）：
- 发送：`node scripts/dev/mail.mjs send --role mac|windows --to ... --type ... --body ...`
- 轮询：`node scripts/dev/mail.mjs check --role mac|windows --mark-seen --json`（未读退出码 10）
- 待办：`node scripts/dev/mail.mjs pending --role mac|windows --json`
- 暂停/恢复：`mail.mjs pause/resume --role ...`；暂停时保留低频轮询，收到 resume 自动恢复。
- 禁止发送密码/token/真实素材路径；除 ack 外**消息正文不能为空**（脚本会拒绝）。

### 何时必须沟通（不许沉默）

| 情况 | 必须动作 |
|---|---|
| 改共享包/契约/protocol/行为语义 | 先发 `task`，Mac 单写者修改；Windows 同步后再继续 |
| 对契约字段/错误码/路径/格式不确定 | 发 `task` 附代码位置与期望，等 `reply` 再动手 |
| Windows 平台差异（路径/权限/二进制/打包） | 发 `task` + 证据（命令/日志/文件路径） |
| 被阻塞 ≥30 分钟 | 发 `task`，加 `--blocking` |
| 需要人工决策（优先级/验收/上线） | 发 `task --needs decision`，结论由用户拍板 |
| 仅改自己目录且测试全绿 | 不需要发消息（护栏自动校验） |

### 消息格式（防噪音）

- 必填：`type`、`--body`（除 ack）、一句话说明"需要对方做什么"；
- 请求对方行动的任务加 `--needs action`；需要用户决策加 `--needs decision`；真正阻塞加 `--blocking`；证据用 `--evidence <路径>`（可重复）。
- 一条消息只做一件事；结论必须落到代码/契约/测试/文档，聊天记录不作为长期依据。
- ack 不再回复；同一条消息只 reply 一次；不确定是否已回复先 `pending` 检查。

### SLA

- ACTIVE 模式（轮询 180~300s）：`task`/`reply` 在下一次轮询处理；`blocking` 优先。
- PAUSED 模式：只处理 `control resume/request-resume`，其余消息排队。
- 超过 48 小时无新状态报告视为停滞，由用户/Mac 侧介入。

## Windows 首次运行注意

- Node 版本见 `node -v`（要求 >= 22.5，推荐 24 LTS）；`node:sqlite` 若报错先记录。
- 不要用 CRLF：`git config --global core.autocrlf false`。
- 首次 Windows 全量测试失败是预期（此前只在 macOS 验收），逐项修复并记录。

## 沟通纪律（mail 分支规则）

- mail 必须在角色分支：mac=`dev/admin`、windows=`dev/cutter`。`mail.mjs send` 已强制守卫并做推送核验；离开角色分支前先处理邮箱，否则消息会落到错误分支、对端读不到。
