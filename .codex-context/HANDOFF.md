# Handoff

## Task Goal

继续推进 MixLab V3 的 M19 后架构收束与新 Mac Codex 接力。当前目标是让新设备能从 GitHub clone 后，准确继承当前代码、上下文、部署方式和待开发问题。

## Non-goals

- 不迁移真实密钥、NAS 密码、阿里云百炼 Key、GitHub Token 到 Git。
- 不迁移旧 Codex 聊天记录本体。
- 不修改 NAS 原视频或公共素材库媒体产物。
- 不把 Windows 桌面端问题直接跳到打包阶段；优先在本地 Web/API 验证。

## Completed

- M18 Windows 剪辑端：
  - 已建立 exe 打包路径。
  - 修复过黑窗口、桌面图标、sidecar 资源查找、安装覆盖锁、日志目录等问题。
  - 当前原则：Web 端先验证业务逻辑，再打包 Windows 桌面端。
- M19 NAS Docker：
  - 已形成 NAS Docker 管理端部署方案。
  - 管理端可在 NAS 上运行，访问入口曾使用 `http://192.168.1.27:18080`。
  - NAS 公共素材库目录约定为 `MixLab/PublicLibrary`。
  - 管理端预处理后发布 `.mixlab-library/indexes/source-transcript-index/current.json`。
- 本地 Web 连接 NAS 真实库：
  - Cutter API 可通过 `MIXLAB_CUTTER_LIBRARY_ROOT=/Volumes/MixLab/PublicLibrary` 连接 NAS 挂载目录。
  - 本地 Web 可进入真实 Cutter API 模式。
  - 当前用户应显示 Allen，不应显示演示剪辑师。
- 最近架构优化：
  - 启动页、素材定位页、剪切任务页不再启动时拉完整公共素材库。
  - `/cutter/runtime-status` 直接读取索引摘要。
  - `listCutterSourceLibrary()` 优先使用 ready index manifest。
  - `searchCutterSourceLibrary()` 优先查询 SQLite，再 hydrate 命中素材。
  - SQLite 索引从 NAS 复制到本机临时缓存后查询。
  - 本机索引缓存自动清理，只保留当前版本和最近 2 个旧版本。

## Current Modified Files Before Migration Commit

- `.gitignore`
- `.codex-context/PROJECT.md`
- `.codex-context/TASK.md`
- `.codex-context/HANDOFF.md`
- `.codex-context/CHECKPOINT.md`
- `docs/deployment/migration-secrets-template.md`
- `docs/deployment/new-mac-codex-handoff.md`
- `apps/cutter-web/src/api.test.ts`
- `apps/cutter-web/src/app/CutterApp.tsx`
- `apps/cutter-web/src/fixture-client.ts`
- `packages/cutter-api/src/index.ts`
- `packages/library-fs/src/cutter-source-library.ts`

## Important Local Paths

- Repo: `/Users/allen/Documents/mixlab`
- NAS public library mount on current Mac: `/Volumes/MixLab/PublicLibrary`
- Local cutter workspace: `/Users/allen/Movies/MixLabLocal`
- Cutter API: `http://127.0.0.1:3789`
- Cutter Web: `http://127.0.0.1:5173`
- Admin Web local dev: `http://127.0.0.1:5174`

## Useful Commands

Start local Cutter API connected to NAS:

```bash
MIXLAB_CUTTER_LIBRARY_ROOT="/Volumes/MixLab/PublicLibrary" \
MIXLAB_CUTTER_WORKSPACE_ROOT="$HOME/Movies/MixLabLocal" \
MIXLAB_CUTTER_API_HOST="127.0.0.1" \
MIXLAB_CUTTER_API_PORT="3789" \
npm run server:cutter-api
```

Start cutter-web:

```bash
cd apps/cutter-web
VITE_MIXLAB_CUTTER_API_BASE_URL="http://127.0.0.1:3789" \
../../node_modules/.bin/vite --host 127.0.0.1 --port 5173 --strictPort
```

Run targeted verification:

```bash
node --test --import tsx packages/library-fs/src/cutter-source-library.test.ts packages/search-sqlite/src/index.test.ts packages/cutter-api/src/index.test.ts
node --test --import tsx apps/cutter-web/src/api.test.ts apps/cutter-web/src/cutter-app.test.ts
```

## Current Problems / Open Items

- 公共素材库完整图库页首次进入仍可能较慢，因为完整卡片列表仍要 hydrate 大量素材 manifest。
- 下一步建议做轻量素材卡片索引或分页加载。
- Windows 桌面端更新机制尚未正式落地；当前还是重新下载安装包。
- 剪辑师注册/审核新模式还处于产品讨论阶段。
- 长文案搜索已做过策略优化，但仍应在真实 NAS 索引上持续验证。

## New Mac Resume Prompt

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

## Risks and Warnings

- 不要提交真实凭据。
- 不要删除或重建 NAS `.mixlab-library`，除非用户明确要求。
- 不要用 `git reset --hard` 或 `git checkout --` 清理未确认改动。
- 如果新 Mac 挂载路径不是 `/Volumes/MixLab/PublicLibrary`，用环境变量覆盖，不要硬编码。
- 如果 Web 端显示演示数据，先检查 API 地址、登录会话、NAS 挂载和 `current.json`，不要先打包 Windows。
