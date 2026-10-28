# Windows 剪辑端开发环境配置（MixLab）

> 适用：Windows 10/11 + DeepSeek Harness。只改剪辑端目录，共享包从 Mac 单向同步。

## 1. 一次性安装

PowerShell（管理员）：

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
# 可选：FFmpeg（项目自带 ffmpeg-static，装系统版更稳）
winget install --id Gyan.FFmpeg -e
```

重开终端验证：

```powershell
git --version
node -v      # 要求 >= 22.5，推荐 24 LTS
npm -v
ffmpeg -version   # 可选
```

## 2. Git 配置（必做）

```powershell
git config --global core.autocrlf false
git config --global core.longpaths true
git config --global pull.rebase true
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

## 3. 克隆与分支

```powershell
mkdir C:\dev
cd C:\dev
git clone https://github.com/alin155/mixlab.git mixlab
cd mixlab
git switch dev/cutter
git log --oneline -1     # 期望 40793c1
```

## 4. 同步 Mac 的共享内容（首次必须）

```powershell
git fetch origin dev/admin
git checkout origin/dev/admin -- AGENTS.md scripts/dev docs/handoff packages/contracts packages/library-format packages/service-clients
git status --short
git add -A
git commit -m "chore(windows): sync shared tooling/rules from dev/admin"
git push origin dev/cutter
```

以后 Mac 更新共享包后：

```powershell
node scripts/dev/shared-sync.mjs          # 只检查
node scripts/dev/shared-sync.mjs --apply  # 执行同步（禁止手改共享包）
```

## 5. 安装依赖

```powershell
npm install
```

失败时保存日志：`npm install *> C:\dev\logs\npm-install.log`，检查网络/代理/Node 版本。

## 6. 自检（Windows 首次允许失败，逐项修复）

```powershell
npm run typecheck
node --test --import tsx packages/cutter-api/src/index.test.ts
node --test --import tsx packages/cutter-local/src/index.test.ts
node --test --import tsx packages/ffmpeg-core/src/index.test.ts
```

如果 `npm test` 报 0 个测试（Windows 通配符问题）：

```powershell
$files = git ls-files "packages/*/src/*.test.ts" "apps/*/src/*.test.ts" "scripts/acceptance/*.test.ts"
node --test --import tsx $files
```

## 7. 启动剪辑端开发

```powershell
npm run server:cutter-api      # 终端 1
npm run dev:cutter-web         # 终端 2
```

桌面端（需要 Rust + VS Build Tools + WebView2）：

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools -e   # 勾选“使用 C++ 的桌面开发”
winget install --id Rustlang.Rustup -e
npm run dev -w apps/cutter-desktop
```

FFmpeg 如找不到，设置：

```powershell
$env:MIXLAB_FFMPEG_PATH="C:\path\to\ffmpeg.exe"
$env:MIXLAB_FFPROBE_PATH="C:\path\to\ffprobe.exe"
```

## 8. 已知 Windows 首次失败类别（预期）

- POSIX 权限断言（chmod 0640/0750 等）在 NTFS 上不生效；
- 路径分隔符/大小写；
- ffmpeg/ffprobe 二进制路径；
- Tauri 桌面构建（Rust/WebView2/侧车二进制）；
- `node:sqlite` 可用性（Node >= 22.5）。
逐项记录、修复并跑相关测试，不要直接跳过。

## 9. 报告与信箱

每次阶段进展：

```powershell
node scripts/dev/sync-report.mjs --role windows
git add -A
git commit -m "chore(windows): status <日期时间> — <摘要>"
git push origin dev/cutter
```

Mac 侧读取：`node scripts/dev/read-peer-status.mjs --peer windows`。
把 `docs/handoff/status/windows-latest.md` 中 SYNC-RESULT 块发用户，可转达 Mac 侧。
