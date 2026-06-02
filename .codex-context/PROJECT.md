# Project Context

## Project Summary

MixLab V3 是一个本地优先的视频素材管理与剪辑师工作台项目。当前系统由三部分组成：

- 管理端：运行在 NAS Docker 或本机开发环境，负责公共素材库管理、原视频预处理、索引发布、剪辑师审核和健康诊断。
- 剪辑端 Web：用于快速验证剪辑师工作台产品逻辑，包括素材定位、本地素材、公共素材库、剪切任务和设置。
- Windows 剪辑端桌面应用：给剪辑师真实使用，负责连接 NAS 公共素材库、本机剪切、生成本地工作区素材。

当前阶段重点是 M19 之后的架构收束：NAS 真实公共素材库、大素材量索引性能、Windows 桌面端可用性、以及新设备 Codex 接力开发。

## Tech Stack

- Node.js / npm workspaces
- TypeScript
- React 19
- Vite
- SQLite 文案索引
- FFmpeg
- Tauri / Windows 桌面打包
- Docker Compose / NAS Docker
- GitHub Actions / GHCR

## Common Commands

```bash
npm ci
npm test
npm run typecheck
npm run dev:cutter-web
npm run dev:admin-web
npm run server:cutter-api
npm run server:admin-api
npm run worker:admin-loop
```

本地连接 NAS 真实公共素材库的剪辑端 API：

```bash
MIXLAB_CUTTER_LIBRARY_ROOT="/Volumes/MixLab/PublicLibrary" \
MIXLAB_CUTTER_WORKSPACE_ROOT="$HOME/Movies/MixLabLocal" \
MIXLAB_CUTTER_API_HOST="127.0.0.1" \
MIXLAB_CUTTER_API_PORT="3789" \
npm run server:cutter-api
```

本地剪辑端 Web：

```bash
cd apps/cutter-web
VITE_MIXLAB_CUTTER_API_BASE_URL="http://127.0.0.1:3789" \
../../node_modules/.bin/vite --host 127.0.0.1 --port 5173 --strictPort
```

## Important Directories

- `apps/admin-web/`：素材管理端前端。
- `apps/cutter-web/`：剪辑师工作台 Web 前端。
- `apps/cutter-desktop/`：Windows 剪辑端桌面应用。
- `packages/cutter-api/`：剪辑端本机 API 服务。
- `packages/library-fs/`：公共素材库、本地素材库、索引文件系统协议。
- `packages/search-sqlite/`：SQLite 文案搜索。
- `deploy/nas/mixlab/`：NAS Docker Compose 部署。
- `docker/`：Docker 镜像定义。
- `docs/deployment/`：部署、迁移、接力文档。
- `.codex-context/`：Codex 接力上下文。

## Current Architecture

- NAS 端：
  - 公共素材库目录：`MixLab/PublicLibrary`
  - 容器挂载路径：`/data/PublicLibrary`
  - 预处理输出：`.mixlab-library/`
  - 当前可用索引指针：`.mixlab-library/indexes/source-transcript-index/current.json`
- 剪辑端：
  - 读取 NAS 共享目录中的 `current.json` 和 SQLite 索引。
  - 本机剪切、本地素材、本地交付目录仍保存在剪辑师电脑。
  - Windows 桌面端和 Web 调试端应共享同一套核心逻辑。
- 管理端：
  - NAS Docker 是生产方向。
  - 本机 Web/API 是开发和排障方向。

## Project Rules

- 以当前源码和测试结果为准；文档过期时必须修正文档。
- 不把真实密钥、NAS 密码、阿里云百炼 Key、GitHub Token 写进 Git。
- 不修改用户公共素材库原视频和已生成媒体资产，除非用户明确要求。
- Windows 桌面端问题优先在本地 Web 和 API 上复现，确认逻辑后再打包。
- 不随意重构无关模块。
- 不覆盖用户或此前未确认的改动。

## Notes for Codex

- 接力后先读 `.codex-context/HANDOFF.md` 和 `.codex-context/TASK.md`。
- 先检查 `git status --short`，不要清理未确认改动。
- 如果文档与源码冲突，以源码为准。
- 如果文档与测试结果冲突，以测试结果为准。
- 优先用小范围测试验证最近改动，再决定是否跑全量测试。
