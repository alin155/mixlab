# Checkpoint

## Last Updated

2026-06-02

## Current State

MixLab V3 已进入 M19 后的架构收束阶段。当前重点不是新增大功能，而是确保三端关系稳定：

- NAS Docker 管理端：公共素材库预处理、索引发布、素材管理。
- Windows 剪辑端：连接 NAS 公共素材库，完成本机剪切和本地素材复用。
- macOS 本地 Web：作为快速验证剪辑端逻辑和 NAS 真实库接入的开发入口。

最近完成的关键架构优化：

- 剪辑端启动时不再默认拉取完整公共素材库，避免素材量大时长时间显示演示数据。
- `/cutter/runtime-status` 改为读取索引摘要，不扫描全部 source manifests。
- 文案搜索优先查询 SQLite 索引，再 hydrate 命中的素材。
- NAS SQLite 索引会缓存到本机临时目录，避免直接通过 SMB 打开 SQLite 导致慢或锁异常。
- 本地 SQLite 缓存会自动保留当前版本和最近 2 个旧版本，避免无限增长。

## Saved Commit

最近保存点以当前 GitHub `main` 为准。新接力前应先执行：

```bash
git pull
git log --oneline -5
```

## Verification

最近已验证：

```bash
node --test --import tsx packages/library-fs/src/cutter-source-library.test.ts packages/search-sqlite/src/index.test.ts packages/cutter-api/src/index.test.ts
node --test --import tsx apps/cutter-web/src/api.test.ts apps/cutter-web/src/cutter-app.test.ts
```

预期：

- API / 搜索相关测试通过。
- cutter-web 相关测试通过。
- 本地剪辑端 Web 可进入真实 Cutter API 模式。
- 当前用户应显示为 Allen，不应显示演示剪辑师。

## Product Focus

- 管理端：NAS Docker 部署、预处理、索引发布、健康诊断。
- 剪辑端：素材定位、搜索命中、视频预览、本地剪切、本地素材复用。
- Windows 桌面端：安装包、sidecar、本机引擎、自动更新后续规划。
- 迁移接力：新 Mac clone 后能准确继承当前上下文。

## Suggested Next Step

新 Mac 接力后优先做：

1. 验证 NAS 公共素材库挂载路径。
2. 启动本地 Cutter API 和 cutter-web。
3. 确认真实模式、Allen 用户、公共素材数量正常。
4. 在 Web 端复现并优化搜索/加载问题。
5. 只有 Web 端验证稳定后，再同步到 Windows 桌面端打包。
