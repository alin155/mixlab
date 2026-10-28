# windows 状态报告

- generated_at: 2026-10-28T17:45:46.486Z
- role: windows
- host: DESKTOP-SJ56NTE
- platform: win32 x64
- node_version: v24.14.1
- repo_root: C:/dev/mixlab
- branch: dev/cutter
- head: a81c0ea3c07a62cc45663037c2b108c5638bd95f
- head_subject: [mail][windows→mac] reply 1793209535840-9cf965e0
- head_time: 2026-10-29T01:45:35+08:00
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
- toolchain: Rust/cargo/rustc 1.99.1（rustup stable, x86_64-pc-windows-msvc）、VS Build Tools 2022 17.14.42 + MSVC 14.44.35207（C++ 桌面工作负载）、WebView2 Runtime 156.0.4314.50、Playwright chromium 已安装。
- mailbox: SLA/工具同步至 admin@e6a7b67；ACTIVE 每 240s（schedule-bed96ea5-607f-4584-95e8-fa0030859d15）；ack=1793208223339-958d4ffe；task 1793208878185 reply=1793209179101-9051f274；task 1793209086655 reply=1793209535840-9cf965e0（body 2402 字符，空 body bug 已修复）。
- nsis_install: PASS 全流程（干净环境）：installer sha256=73C8D30ED1B70FA56D79B561ABDC17050DC17F3D289EE177BA6341AF53158270；静默安装 /S exit=0；首启 + 新用户 config（新库/工作区）→ 自动 engine_start_requested → searchd :3790 + cutter-api sidecar :3789 ready；reviewed 登录（未登录 401，审批 session 后全 200）；检索 sqlite-index 命中、local-clip 201 done、export-clip/project 输出落盘；退出后桌面进程退出但 sidecar 残留（3789/3790 未回收，待确认设计）；卸载 /S exit=0 清理安装文件/卸载项/快捷方式，残留 cache\searchd 空目录 + HKCU\Software\MixLab\MixLab Cutter 键 + AppData 用户数据；重装 exit=0、覆盖升级 exit=0（版本 0.18.10 保持）；测试后原 0.18.10 安装与 AppData 已还原。证据 C:\dev\mixlab-verify-nsis。
- searchd_verify: PASS 8/8（实机）：searchd 启动并完成索引、runtime-status search_backend.mode=searchd、检索 match_ranges=[[0,3]]、详情 transcript provider=sqlite-index、源视频 Range 206、UI 命中高亮、缓存管理页显示「本地 searchd」、控制台无错误。
- tauri_verify: PASS：sidecar/assets/cargo build 均通过；实机启动窗口正常（sidecar :3789、searchd :3790）；NSIS 打包全链路 PASS，产物 apps/cutter-desktop/src-tauri/target/release/bundle/nsis/MixLab Cutter_0.18.10_x64-setup.exe（56.2MB）；仅 2 条既有编译 warning。
- smoke_verify: admin@e6a7b67 更新断言后重跑：缓存管理页/设置页/选中文案断言通过；首个失败 L473 点「剪切这段」超时——当前 UI 需先在文案区拖选文本才出现浮动按钮（证据 C:\dev\logs\smoke-cutter-api-web.log，已回报 Mac 补 drag 步骤）。
- tests: 沿用 472/472 PASS（cutter-api 94、cutter-local 50、ffmpeg-core 27、desktop-runtime 8、windows-test-runner 19、cutter-web 267、cutter-desktop 7）；本轮无产品代码改动，未重跑。
- blockers: smoke L473 待 Mac 补拖选步骤；桌面退出未回收 sidecar（待确认是否设计）；NSIS 卸载残留 cache 目录/HKCU 键（已反馈）。
- next: A（剪辑队列/待剪清单 UX）5 项提案已随 reply 发送，等批准后实现；等 Mac 更新 smoke 后重跑回归。
<!-- MANUAL:END -->
