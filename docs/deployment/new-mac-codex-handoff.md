# 新 Mac Codex 接力操作手册

## 目标

在一台新的 macOS 设备上安装 Codex，并继续 MixLab V3 项目开发。迁移的核心不是复制聊天记录，而是确保新设备具备：

- 最新 Git 代码。
- 最新 `.codex-context` 接力上下文。
- Node/npm、FFmpeg、Docker 等开发环境。
- NAS 公共素材库挂载路径。
- 本机私密配置。

## 1. 新 Mac 安装基础工具

```bash
xcode-select --install
```

建议安装：

- Git
- Node.js 22 LTS 或更高兼容版本
- npm
- FFmpeg
- Docker Desktop，只有需要本机跑 Docker 时才必须
- GitHub CLI，建议安装，方便登录 GitHub

可选 Homebrew 安装方式：

```bash
brew install node ffmpeg gh
```

## 2. 获取项目代码

```bash
cd ~/Documents
git clone https://github.com/alin155/mixlab.git
cd mixlab
npm ci
```

## 3. 挂载 NAS 公共素材库

如果新 Mac 和 NAS 在同一局域网，在 Finder 里选择“前往服务器”，输入：

```text
smb://192.168.1.27/MixLab
```

挂载成功后，确认路径存在：

```bash
ls /Volumes/MixLab/PublicLibrary
ls /Volumes/MixLab/PublicLibrary/.mixlab-library
```

如果新 Mac 上挂载路径不是 `/Volumes/MixLab/PublicLibrary`，启动服务时用环境变量指定真实路径。

## 4. 创建本地工作区

```bash
mkdir -p "$HOME/Movies/MixLabLocal"
```

## 5. 启动本地 Cutter API

```bash
MIXLAB_CUTTER_LIBRARY_ROOT="/Volumes/MixLab/PublicLibrary" \
MIXLAB_CUTTER_WORKSPACE_ROOT="$HOME/Movies/MixLabLocal" \
MIXLAB_CUTTER_API_HOST="127.0.0.1" \
MIXLAB_CUTTER_API_PORT="3789" \
npm run server:cutter-api
```

## 6. 启动剪辑端 Web

新开一个终端：

```bash
cd ~/Documents/mixlab/apps/cutter-web
VITE_MIXLAB_CUTTER_API_BASE_URL="http://127.0.0.1:3789" \
../../node_modules/.bin/vite --host 127.0.0.1 --port 5173 --strictPort
```

浏览器打开：

```text
http://127.0.0.1:5173
```

## 7. 启动管理端 Web，本机调试可选

```bash
cd ~/Documents/mixlab
npm run dev:admin-web -- --host 127.0.0.1 --port 5174 --strictPort
```

浏览器打开：

```text
http://127.0.0.1:5174
```

如果管理端主要跑在 NAS Docker 上，新 Mac 不一定需要启动本机管理端。

## 8. Codex 接力提示词

在新 Mac 的 Codex 中打开项目目录 `~/Documents/mixlab`，然后发送：

```markdown
使用 $context-safe 接力。

如果无法识别 $context-safe，请先阅读：
- .codex-context/PROJECT.md
- .codex-context/TASK.md
- .codex-context/HANDOFF.md
- .codex-context/CHECKPOINT.md
- docs/deployment/new-mac-codex-handoff.md
- docs/deployment/m19-nas-docker.md
- docs/deployment/migration-secrets-template.md

然后检查：
- 当前项目路径
- 当前 Git 分支
- git status --short
- package.json scripts
- 当前 M18/M19 状态

先不要改代码。
请先用中文汇总：
1. 当前项目目标
2. 已完成阶段
3. 当前架构
4. 本地 Web、Windows 桌面端、NAS Docker 的关系
5. 当前待解决问题
6. 下一步推荐开发计划

如果文档和代码冲突，以代码为准。
如果文档和测试结果冲突，以测试结果为准。
```

## 9. 接力后优先验证

```bash
npm test
npm run typecheck
```

如果只验证最近的剪辑端和搜索索引改动，可先运行：

```bash
node --test --import tsx packages/library-fs/src/cutter-source-library.test.ts packages/search-sqlite/src/index.test.ts packages/cutter-api/src/index.test.ts
node --test --import tsx apps/cutter-web/src/api.test.ts apps/cutter-web/src/cutter-app.test.ts
```

## 10. 当前架构提醒

- NAS Docker 负责管理端、预处理、索引发布。
- Windows 剪辑端负责本机剪切和本地工作区。
- macOS Web 调试用于快速验证剪辑端逻辑，原则上先在 Web 端验证，再同步到 Windows 打包。
- 新 Mac 不需要复制旧 Mac 的 Codex 聊天记录，只要 Git 和 `.codex-context` 是最新的即可。
