# windows 状态报告

- generated_at: 2026-10-28T19:39:09.696Z
- role: windows
- host: DESKTOP-SJ56NTE
- platform: win32 x64
- node_version: v24.14.1
- repo_root: C:/dev/mixlab
- branch: dev/cutter
- head: 290febf560c739f1d199f7f1a23e5a5be510e177
- head_subject: [mail][windows→mac] reply 1793216340057-e02e3035
- head_time: 2026-10-29T03:39:00+08:00
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
- mailbox: 同步至 admin@e406be1；ACTIVE 每 240s；D 契约 reply：D1b 1793214503939-b2dd6be2、D2 1793215083968-0b268a48、D3 1793215571727-c25c014c、D4 1793215577070-b6a0b388、D2 fail-safe 修复 1793215875261-ac76b4f8；pending 清空。
- desktop_fixes: (a) 关闭窗口/退出时回收 cutter-api sidecar + searchd（Tauri CloseRequested/RunEvent::Exit → taskkill；新增 app_window_close_cleanup/app_exit_cleanup 日志 + cargo 单测），实测关窗后进程/端口全 0；(b) NSIS POSTUNINSTALL 清理 INSTDIR\cache、INSTDIR、HKCU\Software\MixLab\MixLab Cutter（父键 ifempty），实测卸载后这些全部清除。提交 6d7ae3f；cargo test 6/6。
- smoke_verify: 多次重跑 status=passed ✅（含 D1b 后回归）。
- A1A2: 已接线（78e9c86）；Playwright 11/11（C:\dev\mixlab-verify-a1a2）。
- B_stage: 8633584 + 2477293；证据 C:\dev\mixlab-verify-b（2000 命中分页 5/5、真实 searchd kill 回退 5/5、竞态守卫单测）。
- D_stage: 全部收口。D1（e335da5）、D1b（051c950）、D2（5f49665）、D3（5f49665）、D4（41b73a0/1d8c162）验收见各自 reply；D2 fail-safe（b0e4641）引用索引损坏→degraded/warning、clean+DELETE 409 且不删、UI 警告+禁用；D4 跨进程锁（1d8c162）evict 与内部 release sync 共用 cache_root 文件锁（writeFile wx + 10min stale），拿不到锁 409 release_cache_busy；残余风险：外部/旧 sidecar 写 release cache 不遵守该锁（当前单进程部署不可触发，需外部工具接入同一锁）。D5 明确 defer 至下一批。证据 C:\dev\mixlab-verify-d、C:\dev\logs\d2-failsafe-tests.log、C:\dev\logs\release-lock-tests.log。
- tests: typecheck PASS；cutter-api 133、cutter-local 50、ffmpeg-core 27、desktop-runtime 8、windows-test-runner 19、cutter-web 301、cutter-desktop 7 = 545/545；smoke status=passed。
- nsis_artifact: 最终安装包（含 A1/A2+B+D+fail-safe+跨进程锁）MixLab Cutter_0.18.10_x64-setup.exe，56.2MB，sha256=0EC5E323EA23FB8C98CDDEAEFA1CCA44879E9877A0730E4504CE13DB1F46A28B。
- blockers: 无硬阻塞；D5 治理操作记录明确 defer 下一批；A2 真 pause/resume/delete 契约待后续批次；B 真实 2000+ searchd 压测/UI 降级截图可作演示补充；D4 锁的残余风险（外部写 release cache 的工具需接入同一文件锁）已记录。
- next: 等 Mac 对 D 全部验收反馈；下一批可选 D5/A2 契约/其它；轮询每 240s 保持。
<!-- MANUAL:END -->
