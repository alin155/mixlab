# Current Task

## Task Goal

完成当前 Mac 到新 Mac 的 Codex 开发接力准备，并保持 MixLab V3 当前 M19/M18 状态可被新设备准确继承。

当前技术焦点：

- 本地 Web 连接 NAS 真实预处理公共素材库。
- 避免大素材量加载时剪辑端误显示演示数据。
- 优化 NAS SQLite 索引读取和搜索性能。
- 保持 Windows 桌面端、Web 调试端、NAS Docker 管理端架构边界清晰。

## Non-goals

- 不把真实密钥、NAS 密码、阿里云百炼 Key、GitHub Token 写入仓库。
- 不迁移 Codex 聊天记录本身。
- 不修改 NAS 公共素材库原视频。
- 不在迁移准备阶段重新设计注册/审核、自动更新等后续产品功能。

## Allowed Change Scope

- `.codex-context/`
- `docs/deployment/`
- `apps/cutter-web/`
- `packages/cutter-api/`
- `packages/library-fs/`
- 与上述改动相关的测试文件。

## Disallowed Change Scope

- 用户 NAS 原视频和已生成素材。
- 真实私密凭据。
- 与迁移、M19 架构优化无关的全局业务模块。

## Done When

- 新 Mac 接力文档已提交。
- 敏感配置模板已提交，真实凭据不入库。
- `.codex-context` 更新到当前 M19/M18 状态。
- 当前源码改动已验证、提交并推送到 GitHub。
- 用户拿到另一台 Mac 的接力操作步骤。

## Validation

优先运行最近改动相关测试：

```bash
node --test --import tsx packages/library-fs/src/cutter-source-library.test.ts packages/search-sqlite/src/index.test.ts packages/cutter-api/src/index.test.ts
node --test --import tsx apps/cutter-web/src/api.test.ts apps/cutter-web/src/cutter-app.test.ts
```

必要时运行：

```bash
npm run typecheck
npm test
```

## Current Plan

1. 补充 `docs/deployment/migration-secrets-template.md`。
2. 补充 `docs/deployment/new-mac-codex-handoff.md`。
3. 更新 `.codex-context/PROJECT.md`、`TASK.md`、`HANDOFF.md`、`CHECKPOINT.md`。
4. 确认未跟踪临时目录不会被误提交。
5. 运行相关测试。
6. 提交并推送迁移准备版本。
7. 向用户给出新 Mac 接力步骤。

## Progress

- M18 Windows 剪辑端已经形成可安装 exe 路线，修复过黑窗口、桌面图标、sidecar 启动、日志目录等问题。
- M19 NAS Docker 管理端已经能在 NAS 上运行，管理端可读取和预处理公共素材库。
- 当前本地 Web 已能连接 NAS 真实预处理公共素材库。
- 最近架构优化已让剪辑端启动阶段不再强制加载完整公共素材库，搜索改为优先走 SQLite 索引并使用本地缓存。
