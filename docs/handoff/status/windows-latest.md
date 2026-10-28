# windows 状态报告

- generated_at: 2026-10-28T17:32:21.124Z
- role: windows
- host: DESKTOP-SJ56NTE
- platform: win32 x64
- node_version: v24.14.1
- repo_root: C:/dev/mixlab
- branch: dev/cutter
- head: 1285dddf574d78b07efed49a07f6e0787d1ed4fd
- head_subject: [mail][windows→mac] reply 1793208731119-3db9566c
- head_time: 2026-10-29T01:32:11+08:00
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
- mailbox: ACTIVE 轮询（每 240s，schedule-bed96ea5-607f-4584-95e8-fa0030859d15）；已回 ack 1793208223339-958d4ffe；已执行 Mac task 1793208248463-ab02c3e5 并 reply 1793208731119-3db9566c。
- searchd_verify: PASS 8/8（实机）：searchd 启动并完成索引、runtime-status search_backend.mode=searchd、检索 match_ranges=[[0,3]]、详情 transcript provider=sqlite-index、源视频 Range 206、UI 命中高亮、缓存管理页显示「本地 searchd」、控制台无错误。
- tauri_verify: PASS：sidecar/assets/cargo build 均通过；实机启动窗口正常（sidecar :3789、searchd :3790）；NSIS 打包全链路 PASS，产物 apps/cutter-desktop/src-tauri/target/release/bundle/nsis/MixLab Cutter_0.18.10_x64-setup.exe（56.2MB）；仅 2 条既有编译 warning。
- smoke_verify: Mac 的 vite spawn 修复已生效（Vite 正常启动、searchd/API/登录链路可用），但 shared smoke 脚本 UI 断言过期（L452/453 名称、L459 搜索后端标签位置、L464/466 选区文本、L470 按钮名「剪切这段」、L476 selected_text 整句），已通过 mailbox 回报 Mac 更新；等价流程已用独立脚本验证（页面 17/17、searchd 8/8）。
- tests: 沿用 472/472 PASS（cutter-api 94、cutter-local 50、ffmpeg-core 27、desktop-runtime 8、windows-test-runner 19、cutter-web 267、cutter-desktop 7）；本轮无产品代码改动，未重跑。
- blockers: scripts/smoke 的 UI 断言待 Mac 更新（或放开 Windows 对 scripts/smoke 的写权限）；其余无硬阻塞。
- next: 等 Mac 更新 smoke 后重跑回归；剪辑端功能开发（待指定优先项）。
<!-- MANUAL:END -->
