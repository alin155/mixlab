# windows 状态报告

- generated_at: 2026-10-28T17:19:34.199Z
- role: windows
- host: DESKTOP-SJ56NTE
- platform: win32 x64
- node_version: v24.14.1
- repo_root: C:/dev/mixlab
- branch: dev/cutter
- head: fe8f8802f97303fa16d97e5e8dd337db1ccd781f
- head_subject: chore(windows): status 2026-10-29 — guards fixed; status mailbox unblocked
- head_time: 2026-10-29T01:06:38+08:00
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

- guards: 已激活并生效（pre-commit/pre-push 实测拦截越界提交）；push 触发 CI sync-guard 已恢复 success，windows-status-notify 自动更新 Issue #6。
- toolchain: Rust/cargo/rustc 1.99.1（rustup stable, x86_64-pc-windows-msvc）、VS Build Tools 2022 17.14.42 + MSVC 14.44.35207（C++ 桌面工作负载）、WebView2 Runtime 156.0.4314.50、Playwright chromium 已安装。
- searchd_verify: PASS 8/8（实机）：searchd 启动并完成索引、runtime-status search_backend.mode=searchd、检索 match_ranges=[[0,3]]、详情 transcript provider=sqlite-index、源视频 Range 206、UI 命中高亮、缓存管理页显示「本地 searchd」、控制台无错误；证据 C:\dev\mixlab-verify-searchd\searchd-verify-result.json + screenshots 2 张。
- tauri_verify: PASS（实机）：桌面资产与 sidecar 构建成功（ffmpeg/ffprobe、mixlab-searchd sidecar、pkg 打包 cutter-api sidecar）；cargo build 成功（mixlab-cutter-desktop.exe 12.4MB）；启动窗口 MixLab Cutter，cutter-api sidecar ready :3789、searchd ready :3790、desktop-host 事件链完整；仅有 2 条既有 dead-code/unused-assignment 警告。
- tests: 沿用上一轮 472/472 PASS（cutter-api 94、cutter-local 50、ffmpeg-core 27、desktop-runtime 8、windows-test-runner 19、cutter-web 267、cutter-desktop 7）；本轮无产品代码改动，未重跑。
- known_issue: scripts/smoke/cutter-api-web.ts 在 Windows 上 spawn node_modules/.bin/vite（sh shim）失败，searchd/API 部分已用独立脚本验证；建议 Mac 侧修复该脚本或允许 Windows 修改 scripts/smoke（本轮未改越界文件）。
- blockers: 无硬阻塞；Tauri NSIS 打包（tauri build --bundles nsis）与完整桌面验收未跑。
- next: 剪辑端功能开发（请指定优先项）；补 Tauri NSIS 打包验证；smoke 脚本修复后纳入回归。
<!-- MANUAL:END -->
