# windows 状态报告

- generated_at: 2026-10-29T05:23:35.348Z
- role: windows
- host: DESKTOP-SJ56NTE
- platform: win32 x64
- node_version: v24.14.1
- repo_root: C:/dev/mixlab
- branch: dev/cutter
- head: 1cabef2967d4478daffdbfe4224dba2136a680ab
- head_subject: [mail][windows→mac] reply 1793251401929-3b05f57e
- head_time: 2026-10-29T13:23:22+08:00
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
- mailbox: dev/admin 同步至最新（含 mail 角色分支守卫 + push 核验，rollout 提交 4544f3a）；ACTIVE 每 240s；RC 任务 1793250985723 已 reply（1793251401929-3b05f57e）；pending needs_you/awaiting_peer/stalled 均空。
- desktop_fixes: (a) 关闭窗口/退出时回收 cutter-api sidecar + searchd（Tauri CloseRequested/RunEvent::Exit → taskkill；新增 app_window_close_cleanup/app_exit_cleanup 日志 + cargo 单测），实测关窗后进程/端口全 0；(b) NSIS POSTUNINSTALL 清理 INSTDIR\cache、INSTDIR、HKCU\Software\MixLab\MixLab Cutter（父键 ifempty），实测卸载后这些全部清除。提交 6d7ae3f；cargo test 6/6。
- smoke_verify: 多次重跑 status=passed ✅（含 D1b 后回归）。
- A1A2: 已接线（78e9c86）；Playwright 11/11（C:\dev\mixlab-verify-a1a2）。
- B_stage: 8633584 + 2477293；证据 C:\dev\mixlab-verify-b（2000 命中分页 5/5、真实 searchd kill 回退 5/5、竞态守卫单测）。
- D_stage: 全部收口。D1（e335da5）、D1b（051c950）、D2（5f49665）、D3（5f49665）、D4（41b73a0/1d8c162）验收见各自 reply；D2 fail-safe（b0e4641）引用索引损坏→degraded/warning、clean+DELETE 409 且不删、UI 警告+禁用；D4 跨进程锁（1d8c162）evict 与内部 release sync 共用 cache_root 文件锁（writeFile wx + 10min stale），拿不到锁 409 release_cache_busy；残余风险：外部/旧 sidecar 写 release cache 不遵守该锁（当前单进程部署不可触发，需外部工具接入同一锁）。D5（治理操作审计）已完成（089162e）：workspace/.mixlab-library/ops/governance-audit.jsonl append-only 最近 50 条轮转，5 类治理操作成功响应带 audit_error，GET /cutter/governance/audit?limit=50，前端缓存管理页治理记录面板；UI 6/6。证据 C:\dev\mixlab-verify-d、C:\dev\logs\d2-failsafe-tests.log、release-lock-tests.log、governance-audit-tests.log。
- tests: typecheck PASS；cutter-api 144、cutter-local 50、ffmpeg-core 27、desktop-runtime 8、windows-test-runner 19、cutter-web 301、cutter-desktop 7 = 556/556；smoke status=passed。
- rc_acceptance: RC 安装包（release@3735253 构建）MixLab Cutter_0.18.10_x64-setup.exe，56.2MB，sha256=E81F5BF4283FDC43B454FCD1CD838C11E30FBEA1A81832D56C2BAA6E140B488F；干净安装 exit0（注册版本 0.18.10、快捷方式/文件齐全）→首启引擎 ready（3789/3790 监听、3 进程）→关窗后 desktop/sidecar/searchd=0、端口 0（cleanup 日志已记录）→静默卸载 exit0，安装目录/cache/HKCU 键/快捷方式残留全部 false；证据 C:\dev\mixlab-verify-rc\rc-acceptance.json + rc-first-launch.png；测试后旧 0.18.10 环境已还原。
- integration_stage: integ/cutter-admin@f957b98 验证通过（553/553、smoke passed、cargo 6/6，已回执）；main 已推进（fetch 到 31e8292）；RC 分支 release/cutter-admin-rc-20261029@3735253。证据索引 C:\dev\mixlab-verify-final\EVIDENCE-INDEX.md；同步实践：Mail 发送前必须 dev/cutter 分支（SOP：C:\dev\mixlab-verify-final\WINDOWS-MAIL-SOP.md）。
- next: 等 Mac 对 RC 安装验收的最终确认/发布指令；保持 dev/cutter 为交付线（HEAD 1cabef2 mail / 4544f3a sync，CLEAN）；不改共享包/契约、不自行 merge；轮询每 240s 保持。
<!-- MANUAL:END -->
