# windows 状态报告

- generated_at: 2026-10-28T15:50:05.115Z
- role: windows
- host: DESKTOP-SJ56NTE
- platform: win32 x64
- node_version: v24.14.1
- repo_root: C:/dev/mixlab
- branch: dev/cutter
- head: 598a737d58e4c725f9f2a5aa0200f727094e37fd
- head_subject: fix(windows-test-runner): isolate launch probe env and write startup pointer atomically
- head_time: 2026-10-28T23:50:04+08:00
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

- typecheck: PASS（C:\dev\logs\typecheck.log，tsc --noEmit exit 0；同步 protocol@2eac47e 后复跑仍 PASS）
- page_verify: PASS 17/17（真实 server:cutter-api + dev:cutter-web + Chrome 实机流程：设置页 → 检索“现金流” → 拖选 → 剪切这段 → 完成提示 → 本地素材/剪切任务页 → 断开 API 错误提示）；证据 C:\dev\mixlab-verify\page-verify-result.json 与 screenshots 目录 10 张；本机未装 Rust/cargo、无 searchd，搜索走 sqlite-index 回退。
- tests: 472/472 PASS（cutter-api 94、cutter-local 50、ffmpeg-core 27、desktop-runtime 8、windows-test-runner 19、cutter-web 267、cutter-desktop 7；日志 C:\dev\logs\*.log）。本轮修复 3 个 windows-test-runner Windows 实机失败：本机已安装 MixLab Cutter 快捷方式使 launch_app_probe 静态候选误命中（测试隔离环境变量）；启动指针 JSON 非原子写导致并发读半截 JSON（改为临时文件+rename 原子写）。
- blockers: 无。未覆盖：searchd（需 Rust/cargo）与桌面 Tauri 构建（需 Rust + WebView2）的 Windows 实机验收，待环境补齐后补做。
- next: 阶段 4 剪辑端功能开发；补齐 searchd/桌面端 Windows 实机验证；保持 shared-sync 单向同步与状态信箱节奏。
<!-- MANUAL:END -->
