# 集成冲刺结果（admin × cutter → main）

- 日期：2026-10-29（北京时间）
- 目标：把 dev/cutter 剪辑端交付线与 dev/admin 管理端/平台线收敛到可发布 main，消除长期分支漂移。
- 结果：**已完成 main fast-forward**，两线汇合；RC 待 Windows 安装验收。

## 1. 分支与提交

| 项目 | 值 |
|---|---|
| 集成前 main | 996858c |
| 集成分支 | integ/cutter-admin（1f49313 merge + f957b98 reconcile） |
| RC 分支 | release/cutter-admin-rc-20261029（2da89b8，后 2 个 mail-only 提交） |
| RC 标签 | cutter-integ-rc-20261029 |
| **main 当前** | **3735253**（fast-forward，含 RC 全部内容） |
| 回滚方式 | 不 force-push；可在 main 上 revert 相关提交回到 996858c 行为 |

## 2. 集成处理

- 合入 10 处冲突：CODEOWNERS、状态文件、release-trains、cutter-api、library-fs（cutter-release、cutter-account-client、usage-outbox、usage-service-client）、windows-test-runner。
- 关键兼容修复：
  1. 账号客户端：管理端 API（mode/listCutterUsersWithTiers/getCutterAccountEntitlements/refreshCutterSession）+ createCutterAccountsLegacy 保留 account_service_* 旧错误码；cutter 路径继续用契约码 AGENT_UNAVAILABLE。
  2. listCutterReleaseCatalog 补 folder_query 过滤（从 cutter 版本移植）。
  3. cutter-local copy 模式 A/V 时长差容差 = max(500ms, outputToleranceMs)，修复 Mac 上 copy 剪切 557ms 差超固定阈值导致 smoke 失败。
  4. usage-service-client 复用 service-clients 类型；admin usage 测试适配 cutter outbox API。
- 构建钩子：允许 integ/ 分支提交（集成专用），交付分支禁 merge 规则保持不变。

## 3. 验证证据

| 侧 | 内容 | 结果 |
|---|---|---|
| Mac | typecheck | PASS |
| Mac | 全量测试 | **2230/2230 PASS** |
| Mac | smoke | status=passed |
| Windows | typecheck | PASS |
| Windows | 剪辑端全量（集成分支） | **553/553 PASS**（windows-test-runner 26、cutter-web 291 等） |
| Windows | smoke | status=passed |
| Windows | cargo test（桌面） | 6/6 PASS |

## 4. 待办/残余风险

1. **Windows RC 安装包验收**：从 main/RC 构建 NSIS、安装→首启→卸载残留检查（Windows 侧进行中/待回报）。
2. npm audit：9 个既有依赖告警（2 low、1 moderate、5 high、1 critical），未在本轮处理。
3. 原有残留：A2 真 pause/resume/delete 契约、B 真实 2000+ searchd 压测、D5 审计边界、D4 外部写方锁、安装包代码签名。
4. Windows 集成分支若需继续维护，使用 verify/* 分支，不改 dev/cutter（已冻结）。
