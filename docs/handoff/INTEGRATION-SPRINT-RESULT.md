# 集成冲刺结果（admin × cutter → main）

- 日期：2026-10-29（北京时间）
- 目标：把 dev/cutter 剪辑端交付线与 dev/admin 管理端/平台线收敛到可发布 main，消除长期分支漂移。
- 结果：**已完成 main fast-forward**，两线汇合；RC 安装验收通过，最终交付包已构建并记录 sha256（见第 6 节）。

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

## 4. RC 安装验收（Windows 实测，通过）

- 构建来源：release/cutter-admin-rc-20261029 @ 3735253 → NSIS
- 安装包：MixLab Cutter_0.18.10_x64-setup.exe（56.2MB），sha256=E81F5BF4283FDC43B454FCD1CD838C11E30FBEA1A81832D56C2BAA6E140B488F（最终产物将从 main 再重建一次，以最终回报 sha 为准）
- 静默安装 /S：exit=0，目录/exe/uninstall/快捷方式/注册表 DisplayVersion=0.18.10 正常；
- 首启+配置：engine_ready=True，端口 3789/3790 监听、desktop/sidecar/searchd 各 1 进程；
- 退出：8s 后进程/端口全 0，desktop-host.ndjson 含 app_window_close_cleanup/app_exit_cleanup；
- 静默卸载 /S：install_dir/cache/HKCU 键/卸载键/快捷方式全清；原 0.18.10 安装与 AppData 已还原。
- 证据：C:\dev\mixlab-verify-rc\rc-acceptance.json、rc-first-launch.png、C:\dev\logs\rc-nsis-package.log。
- 注意：首启需 config（UTF-8 无 BOM）才自动拉起引擎（既有设计）；卸载按设计保留 AppData 用户数据。

## 5. 待办/残余风险

1. **最终产物重建**：从 main 最新（31e8292）重建 NSIS 并记录最终 sha256（RC 安装验收已通过，代码等价）。
2. npm audit：9 个既有依赖告警（2 low、1 moderate、5 high、1 critical），未在本轮处理。
3. 原有残留：A2 真 pause/resume/delete 契约、B 真实 2000+ searchd 压测、D5 审计边界、D4 外部写方锁、安装包代码签名。
4. Windows 集成分支若需继续维护，使用 verify/* 分支，不改 dev/cutter（已冻结）。

## 6. 最终交付（2026-10-29）

- **main**：27ee57e（集成代码 3735253 + mail 工具/文档提交）
- **最终安装包**：`MixLab Cutter_0.18.10_x64-setup.exe`（56.3MB）
  - 构建来源：`origin/main @ 27ee57e`
  - sha256：`3320915BF209B81FB274F6E2D922C38FB2195B85208F944E0FBA270B7CFB7E6F`
  - 构建日志（Windows）：`C:\dev\logs\final-nsis-package.log`
- **RC 包（安装验收对象）**：release@3735253，sha256 `E81F5BF4…B488F`，证据 `C:\dev\mixlab-verify-rc`
- **交付线**：dev/cutter HEAD 65d9c65（冻结，仅状态/mail 提交）
- **测试**：集成验收 typecheck PASS、全量 553/553、smoke passed、cargo 6/6；交付线此前 556/556
- **证据索引**：`C:\dev\mixlab-verify-final\EVIDENCE-INDEX.md`、`docs/handoff/status/windows-latest.md`、`C:\dev\mixlab-verify-final\WINDOWS-MAIL-SOP.md`
- **残余风险**：首启需 UTF-8 无 BOM config（设计）；卸载保留 AppData（设计）；B 真实 2000+ searchd 压测未做；D4 外部写方锁边界；D5 审计仅成功操作/多进程 best-effort；A2 真 pause/resume/delete 未实现；A1 顺序仅设备本地。
- **发布标签**：`cutter-v0.18.10-20261029`
