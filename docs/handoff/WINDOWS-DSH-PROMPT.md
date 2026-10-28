# 给 Windows 端 DeepSeek Harness 的一次性任务描述词（复制整段发送）

你是运行在 **Windows** 上的 DeepSeek Harness 代理，负责 MixLab **剪辑端**开发。
本机角色：Windows / 分支 `dev/cutter`；Mac 端负责管理端与共享包（分支 `dev/admin`）。
请严格按下面步骤执行，不要跳步，不要整分支 merge，不要 push --force。

## 0. 基本事实

- 仓库：`https://github.com/alin155/mixlab.git`（已存在，不要新建）
- 你的分支：`dev/cutter`，基线 commit `40793c1`（已含全部 Phase0-3 剪辑端修复）
- 共享包（`packages/contracts`、`library-format`、`service-clients`）与 `scripts/dev`、`docs/handoff`、`AGENTS.md` **只能 Mac 改**，你只单向同步。
- 不要改管理端目录（`apps/admin-web`、`packages/admin-api`、`packages/library-fs`、`scripts/workers`）。

## 1. 环境检查（PowerShell）

```powershell
git --version
node -v
npm -v
```

要求：Git 已安装；Node >= 22.5（推荐 24 LTS）。若未安装：

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
```

然后配置 Git：

```powershell
git config --global core.autocrlf false
git config --global core.longpaths true
git config --global pull.rebase true
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

汇报：git/node/npm 版本。

## 2. 获取代码

如果 `C:\dev\mixlab` 不存在：

```powershell
mkdir C:\dev
cd C:\dev
git clone https://github.com/alin155/mixlab.git mixlab
cd mixlab
git switch dev/cutter
```

如果已存在：

```powershell
cd C:\dev\mixlab
git fetch origin
git switch dev/cutter
git pull --rebase origin dev/cutter
```

验证：

```powershell
git log --oneline -1     # 期望 40793c1 chore(cutter): phase0-3 remediation snapshot
git status --short
```

汇报：分支、HEAD、是否干净。

## 3. 首次同步 Mac 的共享规则/工具/契约

```powershell
git fetch origin dev/admin
git checkout origin/dev/admin -- AGENTS.md scripts/dev docs/handoff packages/contracts packages/library-format packages/service-clients packages/protocol
git status --short
git add -A
git commit -m "chore(windows): sync shared tooling/rules from dev/admin"
git push origin dev/cutter
```

然后阅读并遵守：`AGENTS.md`、`docs/handoff/SYNC-PROTOCOL.md`、`docs/handoff/WINDOWS-SETUP.md`。
以后 Mac 更新共享内容后，用：

```powershell
node scripts/dev/shared-sync.mjs            # 只检查
node scripts/dev/shared-sync.mjs --apply    # 执行同步
```

安装本地护栏（执行一次）：
node scripts/dev/install-hooks.mjs
（pre-commit/pre-push 会自动拦截越界文件、merge commit、未同步的共享内容；不要用 --no-verify 绕过。）

注意：CI sync-guard 会在 push 时自动检查写入域/merge/共享一致性（需仓库 Actions 已启用）。禁止手改共享包；禁止整分支 merge。

## 4. 安装依赖

```powershell
npm install
```

失败时保存日志（`C:\dev\logs\npm-install.log`），修复网络/代理/Node 版本后重试，并说明失败原因。

## 5. 首次自检（Windows 实机首次，允许出现失败）

```powershell
npm run typecheck 2>&1 | Tee-Object C:\dev\logs\typecheck.log
node --test --import tsx packages/cutter-api/src/index.test.ts 2>&1 | Tee-Object C:\dev\logs\cutter-api-test.log
node --test --import tsx packages/cutter-local/src/index.test.ts 2>&1 | Tee-Object C:\dev\logs\cutter-local-test.log
node --test --import tsx packages/ffmpeg-core/src/index.test.ts 2>&1 | Tee-Object C:\dev\logs\ffmpeg-test.log
```

记录 PASS/FAIL 数量和失败测试名。平台相关失败（POSIX 权限、路径分隔符、ffmpeg 路径、Tauri/WebView2、node:sqlite）属于预期清单，逐项修复并重跑相关测试。
若 `npm test` 报 0 个测试（Windows 通配符问题）：

```powershell
$files = git ls-files "packages/*/src/*.test.ts" "apps/*/src/*.test.ts" "scripts/acceptance/*.test.ts"
node --test --import tsx $files
```

修复后必须重跑；只有失败项确实修好才允许进入下一阶段（修不好则记录并阻塞上报）。

## 6. 生成状态报告并推送

```powershell
node scripts/dev/sync-report.mjs --role windows
```

打开 `docs/handoff/status/windows-latest.md`，在 `## 人工补充` 区块填写：typecheck 结果、测试通过/失败数、blockers、next。
然后：

```powershell
git add -A
git commit -m "chore(windows): status <YYYY-MM-DD HH:mm> — <一句话摘要>"
git push origin dev/cutter
```

汇报：commit sha、push 结果、报告路径。

## 7. 向用户输出固定汇报块（必须原样输出）

```
=== SYNC-RESULT ===
role: windows
branch: dev/cutter
head: <sha> (<subject>)
pushed: yes/no
shared_vs_admin: SAME/DIFF
typecheck: PASS/FAIL
cutter_tests: <pass>/<total>
blockers: ...
next: ...
report_path: docs/handoff/status/windows-latest.md
=== END SYNC-RESULT ===
```

## 8. 以后如何把进度告诉 Mac 侧

你无法直接给 Mac 的 DeepSeek Harness 发消息；通知途径只有三种：

1. **Git 信箱（主渠道，自动）**：你把状态写进 `docs/handoff/status/windows-latest.md` 并 push 到 `dev/cutter`。Mac 侧运行 `node scripts/dev/read-peer-status.mjs --peer windows` 就能读到（Mac 需要主动读，不是实时推送）。
2. **用户转达（最直接）**：把上面的 SYNC-RESULT 块给用户，用户复制给 Mac 侧的 DSH，Mac 马上知道。
3. **辅助**：commit message 前缀 `[windows]`；遇到阻塞可在 GitHub 开 PR 到 `dev/admin` 说明。

每完成一个阶段（环境就绪 / 首次测试 / 修完一批失败 / 每次 push / 收工 / 阻塞）都要更新报告并 push 一次。超过 48 小时没有新报告，Mac 侧会认为你停滞。

## 9. 长期任务顺序（本轮不要越界）

1) 环境就绪 + 首次测试基线；
2) 修 Windows 平台失败项（只改剪辑端目录与对应测试）；
3) 启动 `server:cutter-api` + `dev:cutter-web`，人工验证页面；
4) 继续剪辑端功能开发（只改 `apps/cutter-*`、`packages/cutter-*`、`packages/ffmpeg-core`、`packages/desktop-runtime`、`scripts/desktop`）。

## 10. 完成后给我（Windows 端用户）的最终汇报

用中文总结：
- 环境是否就绪（版本）；
- 同步是否成功（shared_vs_admin）；
- typecheck/测试结果（数字 + 失败名单）；
- 下一步计划；
- 阻塞（如有）。
并附上第 7 步的 SYNC-RESULT 块。
