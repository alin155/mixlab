# windows 状态报告

- generated_at: 2026-10-29T08:00:55.616Z
- role: windows
- host: DESKTOP-SJ56NTE
- platform: win32 x64
- node_version: v24.14.1
- repo_root: C:/dev/mixlab
- branch: dev/cutter
- head: 390477610701d90a079a4fe057228458c5b4fad8
- head_subject: [mail][windows→mac] reply 1793260843094-7d0d13f8
- head_time: 2026-10-29T16:00:43+08:00
- dirty_tracked: 0
- dirty_untracked: 0
- peer_branch: dev/admin
- shared_vs_admin: SAME

## 共享包指纹（当前工作区）

| 目录 | 文件数 | sha256 |
|---|---|---|
| packages/contracts | 8 | 7e949275029f9fb395bf626914d1805c55b8a656adc8f522bd887e9680648070 |
| packages/library-format | 12 | f59c6e121a7f8de2298a7ff5b09d8390c0bdf0362de0620f52e608d4d9a7b50f |
| packages/service-clients | 5 | 4b83ad045d42a619b608282105476ffbe3237493efa5ea9776e3f4eb5c76661e |
| packages/protocol | 16 | dbef6befe999a19fcb6e4812edf4b6c29fbec971c53af8059f824bb11523eca4 |

<!-- MANUAL:BEGIN -->
## 人工补充（自检/阻塞/下一步）

- guards: 已激活并生效（pre-commit/pre-push 实测拦截越界提交）；CI sync-guard 持续 success，windows-status-notify 自动更新 Issue #6。
- toolchain: Rust/cargo/rustc 1.99.1、VS Build Tools 2022 17.14.42 + MSVC 14.44.35207、WebView2 156.0.4314.50、Playwright chromium 已安装。
- mailbox: dev/admin 同步最新（mail 角色守卫+push 核验）；ACTIVE 每 240s；0.18.12 热修任务链已 reply：1793258981717-3d831d7f、1793259747909-7005d9aa、1793260843094-7d0d13f8；pending 全空。
- desktop_fixes: (a) 关闭窗口/退出时回收 cutter-api sidecar + searchd（Tauri CloseRequested/RunEvent::Exit → taskkill；新增 app_window_close_cleanup/app_exit_cleanup 日志 + cargo 单测），实测关窗后进程/端口全 0；(b) NSIS POSTUNINSTALL 清理 INSTDIR\cache、INSTDIR、HKCU\Software\MixLab\MixLab Cutter（父键 ifempty），实测卸载后这些全部清除。提交 6d7ae3f；cargo test 6/6。
- smoke_verify: 多次重跑 status=passed ✅（含 D1b 后回归）。
- A1A2: 已接线（78e9c86）；Playwright 11/11（C:\dev\mixlab-verify-a1a2）。
- B_stage: 8633584 + 2477293；证据 C:\dev\mixlab-verify-b（2000 命中分页 5/5、真实 searchd kill 回退 5/5、竞态守卫单测）。
- D_stage: 全部收口。D1（e335da5）、D1b（051c950）、D2（5f49665）、D3（5f49665）、D4（41b73a0/1d8c162）验收见各自 reply；D2 fail-safe（b0e4641）引用索引损坏→degraded/warning、clean+DELETE 409 且不删、UI 警告+禁用；D4 跨进程锁（1d8c162）evict 与内部 release sync 共用 cache_root 文件锁（writeFile wx + 10min stale），拿不到锁 409 release_cache_busy；残余风险：外部/旧 sidecar 写 release cache 不遵守该锁（当前单进程部署不可触发，需外部工具接入同一锁）。D5（治理操作审计）已完成（089162e）：workspace/.mixlab-library/ops/governance-audit.jsonl append-only 最近 50 条轮转，5 类治理操作成功响应带 audit_error，GET /cutter/governance/audit?limit=50，前端缓存管理页治理记录面板；UI 6/6。证据 C:\dev\mixlab-verify-d、C:\dev\logs\d2-failsafe-tests.log、release-lock-tests.log、governance-audit-tests.log。
- tests: typecheck PASS；cutter-api 144、cutter-local 50、ffmpeg-core 27、desktop-runtime 8、windows-test-runner 19、cutter-web 301、cutter-desktop 7 = 556/556；smoke status=passed。
- rc_acceptance: RC 安装包（release@3735253 构建）MixLab Cutter_0.18.10_x64-setup.exe，56.2MB，sha256=E81F5BF4283FDC43B454FCD1CD838C11E30FBEA1A81832D56C2BAA6E140B488F；干净安装 exit0（注册版本 0.18.10、快捷方式/文件齐全）→首启引擎 ready（3789/3790 监听、3 进程）→关窗后 desktop/sidecar/searchd=0、端口 0（cleanup 日志已记录）→静默卸载 exit0，安装目录/cache/HKCU 键/快捷方式残留全部 false；证据 C:\dev\mixlab-verify-rc\rc-acceptance.json + rc-first-launch.png；测试后旧 0.18.10 环境已还原。最终包（main@27ee57e 重建）：56.3MB，sha256=3320915BF209B81FB274F6E2D922C38FB2195B85208F944E0FBA270B7CFB7E6F（代码=RC+mail/文档，未重复完整安装验收）；构建日志 C:\dev\logs\final-nsis-package.log。
- integration_stage: integ/cutter-admin@f957b98 验证通过（553/553、smoke passed、cargo 6/6，已回执）；main 已推进（fetch 到 31e8292）；RC 分支 release/cutter-admin-rc-20261029@3735253。证据索引 C:\dev\mixlab-verify-final\EVIDENCE-INDEX.md；同步实践：Mail 发送前必须 dev/cutter 分支（SOP：C:\dev\mixlab-verify-final\WINDOWS-MAIL-SOP.md）。
- final_delivery: 最终交付摘要已 reply（1793251841116-691f09c9，含最终 commit main@27ee57e、安装包 sha256、集成 553/553 与 RC 验收结论、残余风险）；EVIDENCE-INDEX 已追加最终交付章节；文档/状态已更新。
- release_0_18_11: 从 main@5e26771（临时分支 build-0.18.11，未改 dev/cutter）构建 0.18.11 成功：56.2MB，sha256=c6555617aa4f774b86d515d1b9427a255575898889ab111610330603e5c90a0a；已发布 NAS \\192.168.1.27\MixLab\安装包\MixLab Cutter\0.18.11\ 与 Mac 共享 \\192.168.1.21\“华启航”的公共文件夹\MixLabWindowsBuilds\（exe+SHA256SUMS，含版本化 sums；两端 sha256 校验一致）。升级验收 0.18.10→0.18.11 全通过：注册/exe FileVersion/Tauri runtime 均 0.18.11、config 哈希不变、引擎 ready、退出 sidecar/searchd 回收、cleanup 日志；设置页需登录未截图，已用 runtime 探针+文件版本为证。证据 C:\dev\mixlab-verify-release-01811。reply 1793253368046-38287cfe。
- search_hotfix_0_18_12: 根因=searchd Windows 持久缓存 os error 5（每次重建索引/预热）+ sidecar 1.5s 硬超时回退 SQLite + 桌面端把 /health 200 当 ready 提前拉起 sidecar。修复：Mac searchd 1842b05；Windows 97d92ec（cutter-api 首屏 10s 超时/18s 预算/8 次重试+fallback 原因；web 30s 超时+预热提示；desktop 严格等待 data.ready 120s+warming 日志+启动页提示；cargo 8/8）。
- release_0_18_12: 从 hotfix/0.18.12-readygate@97d92ec 构建 MixLab Cutter_0.18.12_x64-setup-97d92ec.exe（56.3MB，sha256=17947BEE7FC17973625D06752567C8E7B1A8B5D9C98424789DA1F99B46A2CC16）；已发布 NAS \\192.168.1.27\MixLab\安装包\MixLab Cutter\0.18.12\ 与 Mac 共享 \\192.168.1.21\“华启航”的公共文件夹\MixLabWindowsBuilds\（sha 两端核对一致）。真实 NAS 冷缓存 E2E PASS：等待 searchd 预热 25.6s、进工作台 28.4s、首搜 search_mode=searchd 8ms 无回退、翻页 searchd、连续切换 10 素材响应、详情正常；缓存 tantivy/v012758 生成、.building=0、无新增 persistent_cache_failed；0.18.12 安装/config 保留/退出回收（偶发一次 sidecar 残留，热缓存复测全回收）。证据 C:\dev\mixlab-verify-01812；reply 1793260843094-7d0d13f8；0.18.11 保留回滚。
- next: 等 Mac 合并 97d92ec 进 hotfix/0.18.12、核对 NAS sha 并更新 LATEST/release notes；0.18.13 候选=bootstrap NAS 请求超时/取消+UI 进度；dev/cutter 冻结仅 bugfix；轮询 240s。
<!-- MANUAL:END -->
