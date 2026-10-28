# windows 状态报告

- generated_at: 2026-10-28T19:08:32.364Z
- role: windows
- host: DESKTOP-SJ56NTE
- platform: win32 x64
- node_version: v24.14.1
- repo_root: C:/dev/mixlab
- branch: dev/cutter
- head: 435b94af6426c81edcb37287ed05949a47b8c551
- head_subject: [mail][windows→mac] reply 1793214503939-b2dd6be2
- head_time: 2026-10-29T03:08:24+08:00
- dirty_tracked: 0
- dirty_untracked: 1
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
- mailbox: 同步至 admin@e406be1；ACTIVE 每 240s；D 契约已批准（task 1793213459743）；D1b 已 reply（1793214503939-b2dd6be2）；D2 实现中。
- desktop_fixes: (a) 关闭窗口/退出时回收 cutter-api sidecar + searchd（Tauri CloseRequested/RunEvent::Exit → taskkill；新增 app_window_close_cleanup/app_exit_cleanup 日志 + cargo 单测），实测关窗后进程/端口全 0；(b) NSIS POSTUNINSTALL 清理 INSTDIR\cache、INSTDIR、HKCU\Software\MixLab\MixLab Cutter（父键 ifempty），实测卸载后这些全部清除。提交 6d7ae3f；cargo test 6/6。
- smoke_verify: 多次重跑 status=passed ✅（含 D1b 后回归）。
- A1A2: 已接线（78e9c86）；Playwright 11/11（C:\dev\mixlab-verify-a1a2）。
- B_stage: 8633584 + 2477293；证据 C:\dev\mixlab-verify-b（2000 命中分页 5/5、真实 searchd kill 回退 5/5、竞态守卫单测）。
- D_stage: D1 前端（e335da5）清除界面缓存二次确认/预览/保护项/重试 + Playwright 10/10；D1b 已完成（051c950）：cutter-api inventory/clean（confirm_token 120s/一次性/expected_bytes 绑定、pinned/prefetch/release 保护、稳定错误码）+ 前端磁盘清理面板；cutter-api 105/105、cutter-web 300/300、全量 516/516、smoke passed；服务级证据 20/20 + UI 6/6（C:\dev\mixlab-verify-d）。D2 实现中。
- tests: typecheck PASS；cutter-api 105、cutter-local 50、ffmpeg-core 27、desktop-runtime 8、windows-test-runner 19、cutter-web 300、cutter-desktop 7 = 516/516；smoke passed。
- blockers: 无硬阻塞；等 D2→D3→D4 实现与验收；A2 真 pause/resume/delete 留后续批次。
- next: D2 完成 reply；随后 D3、D4；全部完成后统一全量回归+smoke+重建 NSIS+sha256。
<!-- MANUAL:END -->
