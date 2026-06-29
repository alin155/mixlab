# MixLab 环境登记表

更新时间：2026-06-21 / 2026-06-22 / 2026-06-28 / 2026-06-29 UTC

本文件记录 MixLab 管理端、剪辑端、Windows 桌面端、Windows Test Runner、共享文件夹、NAS 公共素材库和本机缓存的约定环境。后续开发、测试、打包、调试前必须先确认这里的环境视角，避免把不同机器上的 `127.0.0.1`、不同端口、不同素材根目录混在一起。

本文件不是密钥文件，不记录真实密码、令牌、ASR Key、Windows 登录密码或 NAS 私密账号。

## 最高优先级原则

1. `127.0.0.1` 永远只代表当前机器。
   - Mac 上访问 `http://127.0.0.1:5176` 是 Mac 本机管理端 Web。
   - Mac 上访问 `http://127.0.0.1:3889` 是 Mac 本机管理端 API。
   - Windows 上访问 `http://127.0.0.1:3799/health` 是 Windows 本机 Windows Test Runner。
   - Codex 在 Mac 上要控制 Windows Test Runner 时，不能使用 Mac 的 `127.0.0.1:3799`，必须使用 Windows 的局域网 IP，例如 `http://<Windows-LAN-IP>:3799`。
2. 旧共享文件夹 agent/watchdog 已废弃。
   - 不再修复 `windows-shared-test-agent.ps1`。
   - 不再修复 `windows-shared-agent-watchdog.ps1`。
   - 不再把旧 agent/watchdog 作为测试自动化恢复路径。
   - 当前正式方向是长期运行的 Windows Test Runner。
3. 共享文件夹只负责交换安装包、Runner、报告、截图和日志。
   - 不再通过共享 JSON 轮询控制 Windows 测试流程。
   - Windows 侧 Runner 启动后，由 Codex 通过 HTTP API 调用。
4. 管理端和剪辑端必须使用真实公共素材库时，先确认两端指向同一个公共素材库根目录。
5. 环境不确定时，必须标注“需要确认”，不能编造。

## 当前已确认状态

- 2026-06-16，用户确认 Windows 本机打开 `http://127.0.0.1:3799/health` 已正常显示启动。
- Mac 当前局域网 IP 观察值：`192.168.1.21`，接口：`en1`。
- Windows 当前局域网 IP 观察值：`192.168.1.20`。
- 2026-06-16，Mac 侧曾通过 `curl --noproxy '*' http://192.168.1.20:3799/health` 验证 Windows Test Runner 可访问，返回 `ok: true`。随后旧 Runner `0.1.1` 因共享报告写入 `EBADF` 崩溃，已发布修复版 `0.1.2`。`0.1.5` 支持 `.lnk` 快捷方式启动和 API 超时时自动采集桌面端日志，`0.1.6` 修复 source-library `data.videos` 验收误判，`0.1.7` 新增备用端口 `launch_runner` 并锁定包版本与运行时版本一致，`0.1.8` 新增非破坏性 Windows 应用验收套件：`app_runtime_smoke`、`real_data_smoke`、`cache_smoke`、`windows_acceptance`。
- 2026-06-17，用户确认 Windows Test Runner 已启动 `0.1.8`；Mac 侧通过 `curl --noproxy '*' http://192.168.1.20:3799/version` 验证 `runner_version: 0.1.8`。
- 2026-06-17，Mac 侧通过 `curl --noproxy '*' http://192.168.1.20:3799/health` 验证当前 Windows Test Runner 为 `0.1.10`。
- 2026-06-17，Windows Test Runner `windows_acceptance-20260617T011228Z-c52dfc21` 通过。报告路径：`\\192.168.1.21\“华启航”的公共文件夹\MixLabWindowsBuilds\reports\windows_acceptance-20260617T011228Z-c52dfc21\report.json`。关键结果：`auth_mode=local_trusted`，公共素材库首屏 `/cutter/source-library?limit=20` 为 `5-8ms`、`20 / 7950`，完整文案详情 `16ms`、`27408` 字、`783` 段，缓存可观测总量 `1776807388` bytes，release cache `1109828367` bytes，source video cache `666539381` bytes。剩余性能观察：`searchd` 仍处于预热降级状态，搜索 `第一场` 走 `sqlite-index`，耗时约 `1864ms`。
- 2026-06-17，Mac 真实 release cache 验证新增 Cutter API 后台搜索索引预热：临时 API 使用 `/Volumes/MixLab/PublicLibrary` 与 `/Users/huaqihang/Movies/MixLabLocal/cache`，`/cutter/runtime-status` 约 `932ms` 返回并完成 `第一场` 预热，随后 `/cutter/source-search?query=第一场&limit=10` 约 `371ms`、top `V000790`。独立 index 压测中 `第一场` 冷搜约 `1699ms`，预热后约 `340ms`，搜索排序保持不变。
- 2026-06-17，Windows Test Runner `0.1.9` 通过备用本机端口 `3801` 安装并验收剪辑端安装包 `b440fc3`。报告路径：`\\192.168.1.21\“华启航”的公共文件夹\MixLabWindowsBuilds\reports\install_latest_and_smoke-20260617T034725Z-4d3584b7\report.json`。关键结果：安装包先复制到 Windows 本机临时目录，SHA-256 `528cf61698c8cbb86a096386abd1be022b024fc745c314e1f33ad59b16b65e8b` 校验一致，静默安装退出码 `0`，安装耗时 `7146ms`，安装后 `windows_acceptance` 通过，`auth_mode=local_trusted`，公共素材库首屏 `20 / 7950`，完整文案 `27408` 字 / `783` 段，缓存可观测总量 `2172998260` bytes。观察：Mac 侧无法直接访问 `192.168.1.20:3801`，但 Windows 本机 `127.0.0.1:3801` 可用；后续仍应以 `3799` 作为正式长期 Runner 入口。
- 2026-06-17，Windows Test Runner 共享目录已发布 `0.1.10`，修复 `install_latest_and_smoke` 中 `Unblock-File` 本机安装包路径参数问题。共享记录：`0.1.10 90325fb 27664604593 ac06b4bc90e51e96902d1ffb308a8ffcae744ff21af0e1fe8caf5f6670996d74`。
- 2026-06-17，剪辑端 Windows 包 `970bd5f` 已通过 `install_latest_and_smoke-20260617T232240Z-50d96b1c` 安装验收，安装退出码 `0`，安装耗时 `6926ms`。该包把公共原素材剪切链路改为“剪切前优先准备本机 source video cache，缓存失败才降级读取原素材”，以避免 FFmpeg 直接压 NAS 原视频；首次剪某条未缓存视频时会增加一次源视频复制成本。
- 2026-06-17，剪辑端 Windows 包 `9b885f8` 已通过 `install_latest_and_smoke-20260617T235248Z-ebafe2bf` 安装验收，安装退出码 `0`，安装耗时 `6871ms`。安装后立即验收时 searchd 仍在预热，搜索 `第一场` 约 `916ms` 且走 `sqlite-index`；延迟验收 `windows_acceptance-20260617T235415Z-07fca8f3` 通过，公共素材首屏 `9ms`、搜索 `第一场` `10ms` 且走 `searchd`、完整文案详情 `6ms`、剪切任务列表 `2ms`，source video cache 当前约 `27.6GB / 3` 条源视频。该包新增长剪切运行期间每秒刷新队列，并将 `resolve_source` 阶段显示为“准备源素材”，避免首次缓存源视频时页面看起来像卡死。
- 2026-06-18，剪辑端 Windows 包 `11794ce` 已通过 `install_latest_and_smoke-20260618T003257Z-236509f3` 安装验收，安装退出码 `0`，安装耗时 `6987ms`，安装包 SHA-256 `b3031d7b5bc60dae16e12aac3ef777a6537f963e74bb6e3383897b6847da0640`。该包把“剪切前等待完整 source video cache”改为“最多短等待 1500ms，缓存未就绪则本次降级读取原素材，同时后台继续预热缓存”，避免首次剪未缓存大视频时被整条 NAS 视频复制阻塞。安装后即时验收公共素材首屏 `9ms`、完整文案详情 `10ms`、剪切任务列表 `3ms`、缓存可观测总量约 `27.6GB`；即时搜索仍可能处于 searchd 预热窗口。延迟验收 `windows_acceptance-20260618T003509Z-21940a6a` 通过，公共素材首屏 `10ms`、搜索 `第一场` `15ms` 且走 `searchd`、完整文案详情 `6ms`、剪切任务列表 `8ms`。
- 2026-06-18，剪辑端 Windows 包 `521e977` 已通过 `install_latest_and_smoke-20260618T022050Z-c27f0dee` 安装验收，安装退出码 `0`，安装耗时 `6909ms`，安装包 SHA-256 `0a5641251e526af16dfa064192e97bcd82ebf07a94c454029d76c74bd6bbf990`。该包修复首次剪未缓存公共原素材时的自我 I/O 竞争：打开详情不再立即全量搬运源视频，冷剪不会在 FFmpeg 剪切前/剪切中启动整条源视频缓存复制，剪切成功后再后台预热 source video cache；已存在本机源视频缓存时仍优先本机剪切。对照真实剪切报告：修复前 `real_cut_smoke-20260618T013114Z-349782be` 的 `run-next` 为 `29945ms`、`cut_media` 为 `27718ms`；修复后 `real_cut_smoke-20260618T023159Z-f15e410b` 的 `run-next` 为 `1265ms`、`cut_media` 为 `1069ms`。
- 2026-06-18，剪辑端 Windows 包 `521e977` 补充完成综合性能验收。`windows_acceptance-20260618T024258Z-e94142c0` 通过：公共素材首屏 `8ms`，真实数据首屏 `4ms`，搜索 `第一场` `12ms`，完整文案详情 `6ms`，剪切任务列表 `2ms`，缓存可观测总量 `28,670,929,262` bytes，其中 source video cache `27,559,860,594` bytes / `3` 条。补充 probe 显示 `runtime-status` 为 `84ms / 9ms / 8ms`。重复真实剪切 `real_cut_smoke-20260618T024837Z-3e57a5bd` 通过：`run-next 475ms`，`resolve_source 2ms`，`cut_media 258ms`。验收报告：`docs/acceptance/m18-4-windows-cutter-performance.md`。
- 2026-06-18，剪辑端 Windows 包 `afc3bd3` 已通过最终性能验收，安装包 SHA-256 `da77a3173e5e5e23b913a6d6894535923002afcabfd84c24b97731e18772a464`。该包在 `521e977` 的源视频缓存 I/O 竞争修复基础上，把 `runtime-status` 的 source-video sample preflight 完全后台化：首个状态请求不再等待 SMB/FFprobe 样本检查，而是返回 `checking` 并异步刷新。`install_latest_and_smoke-20260618T040158Z-9fadf567` 通过：安装退出码 `0`，安装耗时 `6909ms`，首个 `runtime-status` `571ms`，source preflight timing `0ms`，公共素材首屏 `3ms`。延迟验收 `windows_acceptance-20260618T040332Z-561db02f` 通过：runtime `67ms`，公共素材 `8ms`，搜索 `第一场` `13ms` 且走 `searchd`，完整文案详情 `36ms`，剪切任务列表 `3ms`。真实剪切 `real_cut_smoke-20260618T040514Z-5ea69e8c` 通过：`run-next 1282ms`，`resolve_source 2ms`，`preflight_source 33ms`，`cut_media 1059ms`。当前 shared latest 已更新为 `afc3bd3`。
- 2026-06-18，剪辑端 Windows 包 `c8b910f` 已完成共享目录交付并通过注册/登录模式安装验收。安装包 SHA-256 `ef58213b62de859c0bec891f78a08b7cbea55de5902a13139ac32356ac092f35`，GitHub Actions run `27759746635`。`install_latest_and_smoke-20260618T133201Z-59f3f677` 通过：安装退出码 `0`，安装耗时 `6995ms`，`auth_mode=reviewed`，`local_trusted=false`，公共素材首屏 `20 / 7950`、`34ms`。安装后即时验收处于冷启动窗口：搜索 `第一场` `827ms`、走 `sqlite-index`，完整文案详情 `1941ms`。延迟验收 `windows_acceptance-20260618T133409Z-bf9bb147` 通过：runtime `96ms`，公共素材首屏 `38ms`，搜索 `第一场` `55ms` 且走 `searchd`，完整文案详情 `39ms`，剪切任务列表 `24ms`，缓存可观测总量 `28,673,740,332` bytes，其中 source video cache `27,559,860,594` bytes / `3` 条。当前 shared latest 已更新为 `c8b910f`。
- 2026-06-18，用户已将 Windows Test Runner 主入口 `3799` 启动为 `0.1.13`，Mac 侧通过 `curl --noproxy '*' http://192.168.1.20:3799/health` 与 `/version` 验证 `runner_version=0.1.13`。主入口注册/登录模式验收 `windows_acceptance-20260618T135736Z-54057e18` 通过：`auth_mode=reviewed`，`local_trusted=false`，runtime `1191ms`，公共素材首屏 `45ms`，搜索 `第一场` `39ms` 且走 `searchd`，完整文案详情 `22ms`，剪切任务列表 `19ms`，缓存可观测总量 `28,673,740,332` bytes。真实剪切 `real_cut_smoke-20260618T140015Z-7e2ec390` 通过：`run-next 1381ms`，`resolve_source 2ms`，`preflight_source 40ms`，`cut_media 1137ms`，输出 `export-clips/E000009/001-Windows验收剪切-20260618140015-C0629.mp4`。报告内未发现 session token 泄漏。
- 2026-06-18，UI Foundation Shell 迁移包 `7b1e0cf` 已完成共享目录交付并通过 Windows 安装验收。安装包 SHA-256 `69be90e9ab8d87119697d1be3425137c42d5f402c5183acca6ddd97acd3f8cf4`，GitHub Actions run `27786632391`。`install_latest_and_smoke-20260618T204224Z-d71043e2` 通过：安装退出码 `0`，安装耗时 `6950ms`，`auth_mode=reviewed`，`local_trusted=false`，公共素材首屏 `20 / 7950`、`161ms`。安装后即时验收处于 searchd 冷启动窗口：搜索 `第一场` `1930ms`。稳定态验收 `windows_acceptance-20260618T204405Z-39423b3c` 通过：runtime `166ms`，公共素材首屏 `49ms`，搜索 `第一场` `51ms`，完整文案详情 `31ms`，剪切任务列表 `22ms`，缓存可观测总量 `28,673,740,332` bytes。当前 shared latest 已更新为 `7b1e0cf`。
- 2026-06-18，UI Foundation 低风险页迁移包 `10aa479` 已完成共享目录交付并通过 Windows 安装验收。安装包 SHA-256 `4f59030e5bfdb06984b4f2eed2123df3ce0a21fdb77dde35de0715fde8c2fa9a`，GitHub Actions run `27791103017`。`install_latest_and_smoke-20260618T220257Z-6ffbebb7` 通过：安装退出码 `0`，安装耗时 `6960ms`，`auth_mode=reviewed`，`local_trusted=false`，公共素材首屏 `20 / 7950`、`28ms`。安装后即时验收处于 searchd 冷启动窗口：搜索 `第一场` `860ms` 且走 `sqlite-index`，完整文案详情 `1679ms`。稳定态验收 `windows_acceptance-20260618T220518Z-885837c2` 通过：runtime `153ms`，公共素材首屏 `33ms`，搜索 `第一场` `50ms` 且走 `searchd`，完整文案详情 `20ms`，剪切任务列表 `23ms`，缓存可观测总量 `28,673,740,332` bytes。当前 shared latest 已更新为 `10aa479`。
- 2026-06-18，UI Foundation 剪切任务页迁移包 `3cf28bb` 已完成共享目录交付并通过 Windows 安装验收。安装包 SHA-256 `dc3e1a2cd8fef0f0208095db9436cc392f2c9e4ca35df5577ac335f05af56e79`，GitHub Actions run `27793165132`。`install_latest_and_smoke-20260618T224828Z-e96cf5e9` 通过：安装退出码 `0`，安装耗时 `6859ms`，`auth_mode=reviewed`，`local_trusted=false`，公共素材首屏 `20 / 7950`、`43ms`。安装后即时验收处于 searchd 冷启动窗口：搜索 `第一场` `808ms` 且走 `sqlite-index`，完整文案详情 `2037ms`。稳定态验收 `windows_acceptance-20260618T225023Z-5c8b298c` 通过：runtime `136ms`，公共素材首屏 `32ms`，搜索 `第一场` `55ms` 且走 `searchd`，完整文案详情 `32ms`，剪切任务列表 `25ms`，缓存可观测总量 `28,673,740,332` bytes，其中 source video cache `27,559,860,594` bytes / `3` 条。当前 shared latest 已更新为 `3cf28bb`。
- 2026-06-18，UI Foundation 素材搜索页迁移包 `b8890e3` 已完成共享目录交付并通过 Windows 安装验收。安装包 SHA-256 `a1b009c8399b9c8fc670821f327903072a533d934b389a1cbc7719f13a786003`，GitHub Actions run `27796580795`。该包包含 `cdc31dd` 的素材搜索 UI Foundation 迁移，并修复 Windows 冷启动时后台 release cache 同步期间 `/cutter/source-library` 可能退回 NAS SMB 慢读的问题：已有本机 release cache 时先用本机缓存响应，同时后台继续同步。`install_latest_and_smoke-20260619T001008Z-b2ecb85c` 通过：安装退出码 `0`，安装耗时 `6935ms`，`auth_mode=reviewed`，`local_trusted=false`，公共素材首屏 `20 / 7950`、`50ms`，搜索冷启动窗口 `811ms` 且走 `sqlite-index`。稳定态验收 `windows_acceptance-20260619T001310Z-b2aa6a21` 通过：runtime `176ms`，公共素材首屏 `62ms`，搜索 `第一场` `48ms` 且走 `searchd`，完整文案详情 `47ms`，剪切任务列表 `23ms`，缓存可观测总量 `28,673,740,332` bytes，其中 release cache `1,109,861,341` bytes、source video cache `27,559,860,594` bytes / `3` 条。当前 shared latest 已更新为 `b8890e3`。
- 2026-06-21，UI Foundation Cutter 最终清理包 `fee7184` 已完成共享目录交付并通过 Windows 安装与真实剪切验收。安装包 SHA-256 `fa6917108943c039ab8146f7aa6fb5caf966a356cb2db27a0476b55ff7e3b0fc`，GitHub Actions run `27915627515`。该包修复剪辑端左下角侧边栏“素材库”本地/公共数量反转问题，移除了按路由切换数量顺序的逻辑。验收前发现管理端/当前索引已到 `v010471`、`10471` 条 ready 视频，但 Cutter release catalog 仍停在 `v007950`、`7950` 条；已发布 Cutter release `v010471` 并让 Windows 本机 release cache 同步。`install_latest_and_smoke-20260621T200636Z-0db14ade` 通过：安装退出码 `0`，安装耗时 `6905ms`，`auth_mode=reviewed`，`local_trusted=false`，runtime `available_video_count=10471`，公共素材首屏 `20 / 10471`、`27ms`。真实剪切 `real_cut_smoke-20260621T200740Z-504436ad` 通过：`run-next 1020ms`，`resolve_source 1ms`，`preflight_source 3ms`，`cut_media 828ms`，输出 `export-clips/E000012/001-Windows验收剪切-20260621200740-C0728.mp4`。
- 2026-06-22 UTC，UI Foundation Cutter 最终验收包 `e58b0c0` 已完成共享目录交付并通过 Windows 安装、稳定态、真实剪切和桌面截图验收。安装包 SHA-256 `616ef8e82580c422d0088fbeae1fcdbbc2335de397f9fe67d23396b7d29bea03`，GitHub Actions run `27926100937`。该包在 `fee7184` 的 UI Foundation / 侧边栏数量修复基础上，加固剪切任务列表读取，避免旧版或损坏的本地 job 文件导致剪切任务或搜索页面加载失败。`install_latest_and_smoke-20260622T033101Z-e47cfbf7` 通过：安装退出码 `0`，安装耗时 `7135ms`，`auth_mode=reviewed`，`local_trusted=false`，runtime `available_video_count=10471`，公共素材首屏 `20 / 10471`。稳定态 `windows_acceptance-20260622T033351Z-a641ee2c` 通过：runtime `276ms`，公共素材首屏 `53ms`，搜索 `第一场` `51ms` 且走 `searchd`，完整文案详情 `31ms`，剪切任务列表 `158ms`。真实剪切 `real_cut_smoke-20260622T033449Z-ab051386` 通过：`run-next 1169ms`，`resolve_source 1ms`，`preflight_source 2ms`，`cut_media 984ms`，输出 `export-clips/E000013/001-Windows验收剪切-20260622033449-C0728.mp4`。桌面截图 `desktop_ui_screenshot_smoke-20260622T043112Z-cdbf15ef` 通过并人工复查 8 张截图，无 Windows 弹窗遮挡，无浏览器级滚动条，侧边栏显示 `本地 13 / 公共 10471`。当前 shared latest 已更新为 `e58b0c0`。
- 2026-06-22 UTC，剪辑端 Windows 包 `4cfa671` 已完成共享目录交付并通过 Windows 安装、稳定态和真实剪切验收。安装包 SHA-256 `ddd5df4af7e542513ad5aaabc5cf4e071f8dbe2a37c13badb5aafb45c7207e3a`，GitHub Actions run `27947836426`。该包修复搜索/剪切后可能出现全屏“加载失败”的稳定性问题：Cutter API 源媒体流错误不再触发进程崩溃，桌面端 searchd readiness 在 reviewed 认证下可正确识别，前端队列/详情等可恢复刷新失败改为局部提示而不是整页错误。`install_latest_and_smoke-20260622T114426Z-2eecf96a` 通过：安装退出码 `0`，安装耗时 `7133ms`，`auth_mode=reviewed`，`local_trusted=false`，runtime `284ms`，公共素材首屏 `20 / 10471`、`47ms`。稳定态 `windows_acceptance-20260622T113915Z-3aa5b97c` 通过：runtime `213ms`，公共素材首屏 `65ms`，搜索 `第一场` `74ms` 且走 `searchd`，完整文案详情 `34ms`、`10940` 字 / `367` 段，缓存可观测总量 `41,190,616,226` bytes。真实剪切 `real_cut_smoke-20260622T114525Z-d82f8837` 通过：`run-next 1361ms`，`resolve_source 2ms`，`preflight_source 3ms`，`cut_media 1131ms`，输出 `export-clips/E000016/001-Windows验收剪切-20260622114525-C0728.mp4`。当前 shared latest 已更新为 `4cfa671`。
- 2026-06-22 UTC，剪辑端 Windows 包 `d899706` 已完成共享目录交付并通过 Windows 安装和稳定态验收。安装包 SHA-256 `66d534ce86b93124b4cc387b56dcd04f69b2614b853b8c5cdabc062400b8603a`，GitHub Actions run `27961434253`。该包在 `d137b6a` 前端 rerun 防护基础上新增服务端自动 drain 剪切队列：桌面端和本机 Cutter API 在提交/重试剪切任务后会自动消费 pending 队列，避免前端连续剪切、刷新或错过 `/run-next` 触发时任务长期停留在排队等待。`install_latest_and_smoke-20260622T150236Z-dc5858a0` 通过：安装退出码 `0`，安装耗时 `7210ms`，`auth_mode=reviewed`，`local_trusted=false`，runtime `34ms`，公共素材首屏 `20 / 10471`、`15ms`。安装后服务端自动处理历史 pending：初始 `pending=1, running=1, done=20`，随后稳定态 `windows_acceptance-20260622T150439Z-982fde32` 通过并显示 `pending=0, running=0, done=22`。继续触发旧 Runner `real_cut_smoke-20260622T150610Z-b54a8a93` 时，Runner 因仍假设“提交后由 Runner 手动 run-next”而误报 `status unknown`；后续稳定态 `windows_acceptance-20260622T150750Z-4bda19b4` 通过，显示新建 smoke 剪切任务实际已完成：`pending=0, running=0, done=23`。当前 shared latest 已更新为 `d899706`。
- 2026-06-16，发现旧版 `start-windows-test-runner.cmd` 使用 `pushd` 进入 UNC 共享目录，Windows 会自动映射临时盘符；多次启动/中断时可能残留一串 `N:` 到 `Z:` 之类的共享映射。启动脚本已改为直接使用 `%~dp0` 绝对路径，不再 `pushd`/`popd`，以后不应再新增这类映射。
- 2026-06-16，排查 Windows 桌面端首启页阻塞时发现端口冲突风险：Windows Test Runner 使用 `3799`，桌面端 searchd 必须使用 `3790`，不能让测试 Runner 和产品内部搜索服务共用同一个端口。
- Mac 当前观察到的监听端口：
  - `127.0.0.1:3889`：管理端 API。
  - `127.0.0.1:5176`：管理端 Web。
- Windows IP 可能因 DHCP 变化而改变。Codex 远程调用 Runner 前，应重新验证 `http://<Windows-LAN-IP>:3799/health`。
- Mac 当前 shell 可能设置了 `http_proxy=http://127.0.0.1:1087`。访问局域网 Runner 时必须绕过代理，例如使用 `curl --noproxy '*'`。
- 2026-06-28 UTC，Mac 侧 GET-only 观察 NAS 管理端候选入口：`http://192.168.1.27:8080/` 仍连接失败；`http://192.168.1.27:18080/` 返回 nginx `HTTP 200`，并通过 `/api/admin/library/status` 读到 NAS Docker 路径 `/data/PublicLibrary`、`11394` 总视频、`10471` ready、当前索引 `v010471`。同一只读探测显示 NAS 当前部署仍是旧管理端 API：`/api/admin/auth/status`、`/api/admin/release-gates`、`/api/admin/data-loading/plan` 返回 `404`，`/api/admin/dashboard/metrics` 耗时约 `5629ms`，磁盘约 `98%` 且 `status=blocked`。证据：`docs/acceptance/artifacts/admin-docker-release-live-readonly-20260628T030414Z.json`。
- 2026-06-28 UTC 后续只读复核：`8080` 仍不可达，证据 `docs/acceptance/artifacts/admin-docker-release-live-readonly-20260628T092306Z.json`；`18080` 仍为旧管理端 API，`/api/admin/auth/status`、`/api/admin/release-gates`、`/api/admin/data-loading/plan` 返回 `404`，ready 仍为 `10471`、current index 仍为 `v010471`、磁盘仍 `98% blocked`，证据 `docs/acceptance/artifacts/admin-docker-release-live-readonly-20260628T092311Z.json`。同轮 NAS access preflight 显示 SSH/DSM/Docker TCP/8080 关闭，`18080` 与 `9999` 打开，SMB `/Volumes/MixLab` 已挂载但只看到 `#recycle`、`PublicLibrary`、`安装包`，未发现 compose/.env 或 `admin-docker-release-inputs/` 返回证据；证据：`docs/acceptance/artifacts/admin-docker-nas-access-preflight-20260628T092213Z.json`。
- 2026-06-28 UTC NAS desktop 只读观察：通过 `http://192.168.1.27:9999/desktop/#/` 打开 Docker 面板，设备标题 `DXP8800PRO-DB07`，Docker 显示服务运行正常，项目 `1/1`、容器 `3/3`。`mixlab-server-admin-web-1` 使用 `ghcr.io/alin155/mixlab-admin-web:latest`，端口 `18080 -> 80/TCP`；`mixlab-server-admin-api-1` 使用 `ghcr.io/alin155/mixlab-admin-runtime:latest`，读写挂载 `共享文件夹/MixLab/PublicLibrary -> /data/PublicLibrary`，环境包含 `MIXLAB_ADMIN_API_HOST=0.0.0.0`、`MIXLAB_ADMIN_API_PORT=3889`、`MIXLAB_ADMIN_LIBRARY_ROOT=/data/PublicLibrary`；`mixlab-server-admin-worker-1` 使用同一 runtime latest 镜像，读写挂载同一公共库，环境显示 `MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=1` 与 `MIXLAB_ENABLE_READY_PUBLISH_WORKER=1`。本轮未启动/停止容器、未推送/拉取镜像、未写 NAS 文件、未启动预处理。证据：`docs/acceptance/artifacts/admin-docker-nas-desktop-readonly-20260628T185410Z.json`。
- 2026-06-28 UTC 最新只读复核：NAS access preflight 仍显示 SSH 不可用，SMB 已可见 handoff archive `/Volumes/MixLab/安装包/mixlab-admin-docker-handoff/admin-docker-nas-handoff-kit.tar.gz`，sha256 `8cd7cb8c8971687210f30c921a029fe85cf6bb272f144984938fc35ff6351666`，但仍未发现 compose/.env 或 `admin-docker-release-inputs/` 返回证据，证据 `docs/acceptance/artifacts/admin-docker-nas-access-preflight-20260628T191949Z.json`。UGOS API 只读预检显示 `http://192.168.1.27:9999/desktop/` 可读，desktop `1.15.0.77682` / build `4/23/2026`，但当前无 authenticated session，`docker_app_uid` 与 `docker_container_list` 仍不可作为 browserless Docker 证据通道，证据 `docs/acceptance/artifacts/admin-docker-nas-ugos-api-preflight-20260628T191949Z.json`。GET-only live readonly 显示 `http://192.168.1.27:18080/` 仍可达，`/api/admin/library/status` 返回 `/data/PublicLibrary`、`11394` 总视频、`10471` ready、`904` queued、`19` index-required、当前索引 `v010471`；`/api/admin/auth/status`、`/api/admin/release-gates`、`/api/admin/data-loading/plan` 仍返回 `404`，`/api/admin/dashboard/metrics` 约 `5423.4ms`，磁盘仍 `98% blocked`。证据：`docs/acceptance/artifacts/admin-docker-release-live-readonly-20260628T190333Z.json`；汇总：`docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T191953Z.json`，`release_review_ready=false`，`docker_upload_allowed=false`。Handoff transfer 证据：`docs/acceptance/artifacts/admin-docker-nas-handoff-transfer-20260628T190813Z.json`，本步骤只写 NAS `安装包` 交付目录，不接触 Docker runtime、不写 `PublicLibrary`。
- 2026-06-28 UTC 桌面只读证据转换复核：`docs/acceptance/artifacts/admin-docker-nas-desktop-returned-evidence-20260628T200756Z/admin-docker-release-inputs` 仅把 NAS Docker Desktop 只读观察和 live-readonly 结果转换成本地 validators 可读的 returned evidence 形状，不等于正式 NAS collector 返回包。验证结果保持阻断：precheck 因 worker 预处理根路径证据不完整阻断；admin-worker proof 因当前旧栈 `MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=1`、`MIXLAB_ENABLE_READY_PUBLISH_WORKER=1`、缺少 MVP mode/预处理根路径阻断；disk proof 因 `98%` 使用率高于 `92%` block 阈值阻断；image proof 因当前镜像仍为 `latest` 阻断；最新 readiness summary `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T200830Z.json` 仍为 `release_review_ready=false`、`docker_upload_allowed=false`。本轮未启停容器、未推送/拉取镜像、未写 NAS runtime、未写 `PublicLibrary`、未启动预处理。
- 2026-06-28 UTC pre-staging 门禁分层复核：`docs/acceptance/artifacts/admin-docker-prestaging-handoff-20260628T201253Z.json` 显示 release inputs 仍可请求，staging execution 前置阻断已收敛为 `nas-disk-risk-carried-forward`、`explicit-push-approval-required`、`current-and-rollback-tags-required`；staged live-readonly、admin-worker env proof、Cutter compatibility proof 被保留为 staging 后/final review 证据，不再作为 staging 前循环阻断。最新 staging runbook `docs/acceptance/artifacts/admin-docker-staging-runbook-20260628T201307Z.json` 和 readiness summary `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T201313Z.json` 仍为 blocked，且 `docker_upload_allowed=false`。
- 2026-06-28 UTC NAS desktop authenticated readonly follow-up：通过 NAS 桌面打开 Docker 应用，Docker 服务运行正常，项目 `1/1`、容器 `3/3`，`mixlab-server-admin-worker-1`、`mixlab-server-admin-api-1`、`mixlab-server-admin-web-1` 均运行中且仍使用 `latest`。Mac 侧 SSH `22` 与 Docker TCP `2375` 均拒绝连接，`18080` 可访问；只读 API 复核显示 `/api/admin/library/status` 约 `1.1s` 返回 `11394` 总视频、`10471` ready、`904` queued、`19` index-required、当前索引 `v010471`、磁盘可用约 `635GB`；`/api/admin/preprocess/jobs` 约 `1.4s` 返回 `904` queued、`0` active、`0` failed；`/api/admin/cutter-users` 约 `0.02s` 返回 `16` 用户，并确认旧版接口仍会把 `password_hash` 字段返回给前端，后续 MVP 必须过滤该字段。本轮未启停容器、未推送/拉取镜像、未写 NAS runtime、未写 `PublicLibrary`、未启动预处理。
- 2026-06-28 UTC Admin Docker workflow tag hardening：`.github/workflows/docker-admin.yml` 已改为只推送 `ghcr.io/alin155/mixlab-admin-runtime:${{ github.sha }}` 与 `ghcr.io/alin155/mixlab-admin-web:${{ github.sha }}`，不再推送 mutable `latest`；`audit:delivery-readiness` 和目标证据测试会拒绝重新引入 `latest` tag。
- 2026-06-28 UTC Admin Docker candidate refresh：workflow tag hardening 后，当前候选已刷新为 `25fe2264de7b391a56e770a8acb6bf40ebec3863`，tag `admin-docker-candidate-25fe2264de7b391a56e770a8acb6bf40ebec3863`，GitHub dry-run `28335143445` 使用 `push_images=false` 且未推送 GHCR 镜像。candidate-ref proof `docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260628T203900Z.json` 已接受；NAS release-inputs handoff `docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-20260628T204343Z.json` 为 `ready-for-nas-collection`；portable kit `docs/acceptance/artifacts/admin-docker-nas-handoff-kit-20260628T204403Z.json` 已生成并传输到 `/Volumes/MixLab/安装包/mixlab-admin-docker-handoff/admin-docker-nas-handoff-kit.tar.gz`，sha256 `6a3474ca67b3a4d8c09210ff3a7e8441053faead3b5a8577dce345e75058f132`。最新 readiness summary `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T204410Z.json` 仍为 `release_review_ready=false`、`docker_upload_allowed=false`；NAS runtime、PublicLibrary、容器、预处理均未被更改。
- 2026-06-28 UTC UGOS authenticated readonly follow-up：使用临时已登录 NAS 桌面会话的 query token 只读复核 UGOS API，`session/current-user/Docker app uid/share/sysinfo` 可读，但静态 `/ugreen/v1/docker/container/ContainerList` 仍返回 `9405`；Docker UI 的容器列表实际通过加密 view API 加载，所以当前 browserless UGOS API 不能单独替代桌面/collector 证据。证据：`docs/acceptance/artifacts/admin-docker-nas-ugos-api-preflight-20260628T205400Z.json`，artifact 不记录 token。桌面 DOM 只读证据 `docs/acceptance/artifacts/admin-docker-nas-desktop-readonly-ugos-20260628T205936Z.json` 确认 `mixlab-server-admin-worker-1`、`mixlab-server-admin-api-1`、`mixlab-server-admin-web-1` 均运行且仍使用 `latest`；worker 环境显示 `MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=1`、`MIXLAB_ENABLE_READY_PUBLISH_WORKER=1`，未显示 `MIXLAB_PREPROCESS_LIBRARY_ROOT`。GET-only live readonly `docs/acceptance/artifacts/admin-docker-release-live-readonly-20260628T210026Z.json` 仍显示 `18080` 是旧 Admin API 合约，`auth/status`、`release-gates`、`data-loading/plan` 返回 `404`，ready `10471`、current index `v010471`、磁盘约 `98% blocked`。桌面只读 returned evidence 包 `docs/acceptance/artifacts/admin-docker-nas-desktop-returned-evidence-20260628T210033Z/admin-docker-release-inputs` 与 intake `docs/acceptance/artifacts/admin-docker-nas-release-inputs-intake-20260628T210052Z.json` 均保持 blocked；最新 readiness summary `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T210825Z.json` 仍为 `release_review_ready=false`、`docker_upload_allowed=false`，并用 `automation_boundary` 明确 NAS runtime 变更、image push、Docker deploy 均不允许。NAS runtime、PublicLibrary、容器、预处理均未被更改。
- 2026-06-28 UTC staged Cutter proof plan 与 NAS 只读复核：`docs/acceptance/artifacts/admin-cutter-staged-proof-plan-20260628T211413Z.json` 仅生成 Windows Runner `windows_acceptance`、`real_cut_smoke`、可选 `desktop_ui_screenshot_smoke` 的 staged-candidate 执行模板，并把最终验证收口到 `validate:admin-cutter-compatibility-proof`；该计划不接触 Windows Runner、NAS、Docker、Admin API 或 Cutter API，不记录 auth 值，也不批准 Docker upload。同轮 NAS access preflight `docs/acceptance/artifacts/admin-docker-nas-access-preflight-20260628T211711Z.json` 仍显示 SSH/Compose project/returned evidence 不可用，但 handoff archive 在 SMB 可见；UGOS API preflight `docs/acceptance/artifacts/admin-docker-nas-ugos-api-preflight-20260628T211711Z.json` 仍不能读取 Docker container list；GET-only live readonly `docs/acceptance/artifacts/admin-docker-release-live-readonly-20260628T211731Z.json` 继续显示 `18080` 是旧 Admin API 合约，`auth/status`、`release-gates`、`data-loading/plan` 返回 `404`，`library/status` 保持 `/data/PublicLibrary`、`11394` total、`10471` ready、current index `v010471`。NAS runtime、PublicLibrary、容器、预处理均未被更改。
- 2026-06-28 UTC release readiness refresh：`docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T212539Z.json` 已读取最新 staged Cutter plan 和 `2117xxZ` NAS 只读证据；`release_review_ready=false`、`docker_upload_allowed=false`，`13` 个 gate 中 `5` 个通过、`8` 个阻塞。该 summary 明确 `cutter_staged_plan_ready=true`，但 `cutter-proof-accepted` 仍阻塞，说明计划已准备好而真实 staged-candidate Windows Runner proof 尚未执行。当前安全边界保持：NAS runtime 变更、image push、Docker deploy 均不允许。
- 2026-06-28 UTC UGOS browserless Docker read correction：通过一次内存态 UGOS 登录确认无需人工点击 NAS 桌面即可读取 Docker 子应用真实只读接口；旧 `/ugreen/v1/docker/container/ContainerList` 仍返回 `9405`，但 Docker UI 实际使用的 `/ugreen/v1/docker/container/ContainerListV2` 带 `{pageNum,pageSize}` POST 可读，`/ugreen/v1/docker/view/ObtainOverviewInfo` 也可读。`admin-docker-nas-ugos-api-preflight` 已改为使用真实 V2/overview 只读探测，最新证据 `docs/acceptance/artifacts/admin-docker-nas-ugos-api-preflight-20260628T213908Z.json` 为 `browserless-collection-ready`，artifact 不记录密码、Cookie 或 token；随后 readiness summary `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T214012Z.json` 仍保持 `release_review_ready=false`、`docker_upload_allowed=false`，说明只读收集路径改善不等于批准 Docker 上传/部署。本轮未启停容器、未推送/拉取镜像、未写 NAS runtime、未写 `PublicLibrary`、未启动预处理。
- 2026-06-28 UTC UGOS browserless returned evidence：新增 `collect:admin-docker-nas-ugos-returned-evidence`，使用内存态 UGOS 登录 token 只读读取 Docker `ContainerListV2`/`GetContainerById`，并用 Admin live-readonly `library/status`、`dashboard/metrics` 生成本地 sanitized returned evidence；证据 `docs/acceptance/artifacts/admin-docker-nas-ugos-returned-evidence-20260628T215113Z.json` 与目录 `docs/acceptance/artifacts/admin-docker-nas-ugos-returned-evidence-20260628T215113Z/admin-docker-release-inputs`。该证据不记录密码、Cookie 或 token，不输出完整 env/inspect，仅输出 allowlisted worker env；当前观测仍为 `latest` 镜像、worker `MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=1`、`MIXLAB_ENABLE_READY_PUBLISH_WORKER=1`、缺少 `MIXLAB_ADMIN_DOCKER_MVP_MODE` 与 `MIXLAB_PREPROCESS_LIBRARY_ROOT`，磁盘 `98%`。precheck `worker-inspect-roots` 阻断，intake `docs/acceptance/artifacts/admin-docker-nas-release-inputs-intake-20260628T215137Z.json` 仍 blocked；最新 readiness summary `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T215141Z.json` 仍 `release_review_ready=false`、`docker_upload_allowed=false`。本轮未启停容器、未推送/拉取镜像、未写 NAS runtime、未写 `PublicLibrary`、未启动预处理。
- 2026-06-28 UTC returned-evidence gate split：`admin-docker-nas-returned-evidence-precheck` 已收敛为格式/脱敏预检，不再把 worker root/flags 这类运行态语义判断提前当作 precheck 失败；同一 UGOS returned evidence 重新 intake 后，`returned_precheck_passed=true`，并生成 NAS image proof、admin-worker proof、NAS disk proof、release inputs、staging runbook。最新 intake `docs/acceptance/artifacts/admin-docker-nas-release-inputs-intake-20260628T215549Z.json` 仍 blocked，但阻断项已准确变为 `nas-image-proof-accepted`、`admin-worker-proof-accepted`、`nas-disk-proof-accepted`；最新 readiness `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T215554Z.json` 为 `6/13` gate 通过，`release_review_ready=false`、`docker_upload_allowed=false`。本轮仅本地重跑 validators 和写 artifact，未启停容器、未推送/拉取镜像、未写 NAS runtime、未写 `PublicLibrary`、未启动预处理。
- 2026-06-28 UTC staging tag-source consistency gate：`admin-docker-staging-runbook` 现在会在 release-inputs 报告存在时，校验手填 current/target/rollback image tag 与 release-inputs 报告中的 current/target/rollback 完全一致，避免 staging env 人工输入漂移。基于同一 UGOS returned evidence 重跑后，最新 intake `docs/acceptance/artifacts/admin-docker-nas-release-inputs-intake-20260628T220358Z.json` 仍 blocked，最新 readiness `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T220403Z.json` 仍 `6/13` gate 通过、`release_review_ready=false`、`docker_upload_allowed=false`；staging runbook blockers 明确包含 `current-tag-matches-release-inputs`、`target-tag-matches-release-inputs`、`rollback-tag-matches-release-inputs`，直到 accepted release-inputs 和显式 image tags 可对齐。本轮仅本地 validators/artifact/docs，未启停容器、未推送/拉取镜像、未写 NAS runtime、未写 `PublicLibrary`、未启动预处理。
- 2026-06-28 UTC NAS handoff kit refresh：在 staging tag-source consistency gate 后重新生成并传输 NAS handoff kit。最新 handoff `docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-20260628T220801Z.json` 为 `ready-for-nas-collection`，portable kit `docs/acceptance/artifacts/admin-docker-nas-handoff-kit-20260628T220806Z.json` 为 `ready-for-transfer`，transfer `docs/acceptance/artifacts/admin-docker-nas-handoff-transfer-20260628T220819Z.json` 为 `transferred`；NAS 共享目标 `/Volumes/MixLab/安装包/mixlab-admin-docker-handoff/admin-docker-nas-handoff-kit.tar.gz` sha256 `6e73f0867694a5578baf6fb895d33e8edabe993e10f1fa44e982a4d459891fca`。最新 NAS access preflight `docs/acceptance/artifacts/admin-docker-nas-access-preflight-20260628T220827Z.json` 仍 blocked：SSH、SMB 可见 compose project、returned evidence 仍不可用；最新 readiness `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T220835Z.json` 仍 `6/13` gate 通过、`release_review_ready=false`、`docker_upload_allowed=false`。本轮只写 NAS `安装包` handoff 交付目录和本地 artifact/docs，未启停容器、未推送/拉取镜像、未写 NAS runtime、未写 `PublicLibrary`、未启动预处理。
- 2026-06-28 UTC UGOS browserless returned evidence 自动化：`admin-docker-nas-ugos-auth` 新增内存态 username/password 登录，只记录脱敏布尔状态和 code/message，不记录密码、Cookie 或 token。最新 UGOS preflight `docs/acceptance/artifacts/admin-docker-nas-ugos-api-preflight-20260628T222127Z.json` 为 `browserless-collection-ready`；UGOS returned evidence `docs/acceptance/artifacts/admin-docker-nas-ugos-returned-evidence-20260628T221951Z.json` 与目录 `docs/acceptance/artifacts/admin-docker-nas-ugos-returned-evidence-20260628T221951Z/admin-docker-release-inputs` 已生成；intake `docs/acceptance/artifacts/admin-docker-nas-release-inputs-intake-20260628T222014Z.json` 仍 blocked，阻断为 `nas-image-proof-accepted`、`admin-worker-proof-accepted`、`nas-disk-proof-accepted`；NAS access preflight `docs/acceptance/artifacts/admin-docker-nas-access-preflight-20260628T222345Z.json` 已转为 `ready-for-nas-collection`、`nas_collection_directly_available=true`；readiness `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T222445Z.json` 仍 `6/13` gate 通过、`release_review_ready=false`、`docker_upload_allowed=false`。本轮仅使用 UGOS/Docker 只读 API 与 Admin GET-only 指标收集证据，未启停容器、未推送/拉取镜像、未写 NAS runtime、未写 `PublicLibrary`、未启动预处理。
- 2026-06-28 UTC Admin Docker compose tag hardening：`deploy/nas/mixlab/docker-compose.yml` 去掉 `MIXLAB_IMAGE_TAG:-latest` fallback，改为要求显式 immutable candidate SHA；`deploy/nas/mixlab/.env.example` 的 `MIXLAB_IMAGE_TAG` 保持空值，复制到 NAS 后必须填入已验收候选 tag，避免新版 staging 默默继续使用 mutable `latest`。静态 validator 与 delivery readiness 已同步拒绝 `latest` fallback；新 dry-run `docs/acceptance/artifacts/admin-docker-release-gate-dry-run-20260628T223510Z.json` compose static 通过但仍 blocked，最新 readiness `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T223515Z.json` 仍 `6/13` gate 通过、`release_review_ready=false`、`docker_upload_allowed=false`。本轮只改本地部署模板、validator、文档和 artifact，未启停容器、未推送/拉取镜像、未写 NAS runtime、未写 `PublicLibrary`、未启动预处理。
- 2026-06-28 UTC UGOS credentialed readonly refresh：使用内存态 NAS 登录信息重新采集只读证据，UGOS preflight `docs/acceptance/artifacts/admin-docker-nas-ugos-api-preflight-20260628T223914Z.json` 为 `browserless-collection-ready`；UGOS returned evidence `docs/acceptance/artifacts/admin-docker-nas-ugos-returned-evidence-20260628T223915Z.json` 已生成 sanitized `admin-docker-release-inputs/`；intake `docs/acceptance/artifacts/admin-docker-nas-release-inputs-intake-20260628T223922Z.json` 仍 blocked，阻断为 `nas-image-proof-accepted`、`admin-worker-proof-accepted`、`nas-disk-proof-accepted`；最新 readiness `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T223922Z.json` 仍 `6/13` gate 通过、`release_review_ready=false`、`docker_upload_allowed=false`。本轮仅使用 UGOS/Docker 只读 API 与 Admin GET-only 指标收集证据，artifact 不记录密码、Cookie 或 token；未启停容器、未推送/拉取镜像、未写 NAS runtime、未写 `PublicLibrary`、未启动预处理。
- 2026-06-28 UTC Admin Docker previous b945 candidate refresh：上一轮候选 `b945418df2a447fd39bb9c88f781322594fc11c0`，tag `admin-docker-candidate-b945418df2a447fd39bb9c88f781322594fc11c0`；GitHub dry-run `28338518625` 使用 `push_images=false` 成功，`Log in to GHCR` skipped，runtime/web image build、Docker MVP smoke、typecheck、searchd、acceptance evidence 和 delivery readiness 均通过，未推送 GHCR 镜像。已归档 run artifact `docs/acceptance/artifacts/admin-docker-github-run-artifact-20260628T224810Z.json`、candidate-ref proof `docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260628T224835Z.json`、live-readonly `docs/acceptance/artifacts/admin-docker-release-live-readonly-20260628T224842Z.json`、Cutter staged proof plan `docs/acceptance/artifacts/admin-cutter-staged-proof-plan-20260628T224949Z.json`、readiness `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T224950Z.json`；NAS handoff kit 已生成并传输到 `/Volumes/MixLab/安装包/mixlab-admin-docker-handoff/admin-docker-nas-handoff-kit.tar.gz`，sha256 `bd135af00c499a933a06a4ede5bf4ef6b8fbe605ebd04b906b0b86d4e01334a6`。该候选保留为历史证据；本轮未启停容器、未推送/拉取镜像、未写 NAS runtime、未写 `PublicLibrary`、未启动预处理。
- 2026-06-28 UTC NAS credential handoff readonly refresh：使用内存态 NAS 登录信息再次采集 UGOS/Docker 只读证据，UGOS preflight `docs/acceptance/artifacts/admin-docker-nas-ugos-api-preflight-20260628T225530Z.json` 为 `browserless-collection-ready`；UGOS returned evidence `docs/acceptance/artifacts/admin-docker-nas-ugos-returned-evidence-20260628T225531Z.json` 与目录 `docs/acceptance/artifacts/admin-docker-nas-ugos-returned-evidence-20260628T225531Z/admin-docker-release-inputs` 已生成；intake `docs/acceptance/artifacts/admin-docker-nas-release-inputs-intake-20260628T225559Z.json` 预检通过但仍被 `nas-image-proof-accepted`、`admin-worker-proof-accepted`、`nas-disk-proof-accepted` 阻断；live-readonly `docs/acceptance/artifacts/admin-docker-release-live-readonly-20260628T225611Z.json` 继续证明 NAS `18080` 是旧 Admin API 合约，素材基线 `11394` total、`10471` ready、current index `v010471`、磁盘 `98%`；readiness `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T225612Z.json` 仍 `6/13` gate 通过、`release_review_ready=false`、`docker_upload_allowed=false`。本轮仅使用 UGOS/Docker 只读 API 与 Admin GET-only 指标收集证据，artifact 不记录密码、Cookie 或 token；未启停容器、未推送/拉取镜像、未写 NAS runtime、未写 `PublicLibrary`、未启动预处理。
- 2026-06-28 UTC Admin Docker current candidate refresh：当前候选已刷新为 `4cb5b18262e49894d4272b0fc940be6c1d2102b4`，tag `admin-docker-candidate-4cb5b18262e49894d4272b0fc940be6c1d2102b4`；GitHub dry-run `28339129475` 使用 `push_images=false` 成功，`Log in to GHCR` skipped，runtime/web image build、Docker MVP smoke、typecheck、searchd、acceptance evidence 和 delivery readiness 均通过，未推送 GHCR 镜像。已归档 run artifact `docs/acceptance/artifacts/admin-docker-github-run-artifact-20260628T231156Z.json`、candidate-ref proof `docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260628T231223Z.json`、pre-staging handoff `docs/acceptance/artifacts/admin-docker-prestaging-handoff-20260628T231236Z.json`、release inputs `docs/acceptance/artifacts/admin-docker-release-inputs-20260628T231249Z.json`、Cutter staged proof plan `docs/acceptance/artifacts/admin-cutter-staged-proof-plan-20260628T231319Z.json`、readiness `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T231426Z.json`；最新 NAS handoff kit 已重新生成并传输到 `/Volumes/MixLab/安装包/mixlab-admin-docker-handoff/admin-docker-nas-handoff-kit.tar.gz`，sha256 `a668803edb2e609546ac116826ff61076ffd75fea57a1b1b5b0526b0ac0b4841`。最新 readiness 仍 `6/13` gate 通过、`release_review_ready=false`、`docker_upload_allowed=false`；本轮未启停容器、未推送/拉取镜像、未写 NAS runtime、未写 `PublicLibrary`、未启动预处理。
- 2026-06-29 UTC Admin Docker staging runbook evidence selection refresh：`admin-docker-staging-runbook` 现在把本地 local-smoke 和 GitHub candidate artifact 都作为可接受的 smoked image 来源，避免旧 local-smoke artifact 覆盖当前 GitHub dry-run 候选。最新 staging runbook `docs/acceptance/artifacts/admin-docker-staging-runbook-20260629T010621Z.json` 已显式设置 target tag `4cb5b18262e49894d4272b0fc940be6c1d2102b4`，`target_tag_matches_github_candidate=true`，但 `staging_execution_ready=false`、`staging_review_ready=false`、`docker_deploy_allowed=false`。最新 readiness `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260629T010629Z.json` 仍为 `6/13` gate 通过、`release_review_ready=false`、`docker_upload_allowed=false`；剩余阻断是 NAS 旧栈/live parity、磁盘、worker proof、Cutter staged proof、release inputs/current-rollback tags 和显式 release approval。本轮只改本地 acceptance tooling、artifact 和文档，未启停容器、未推送/拉取镜像、未写 NAS runtime、未写 `PublicLibrary`、未启动预处理。
- 2026-06-29 UTC NAS live-readonly refresh：GET-only 探测 `http://192.168.1.27:18080` 生成 `docs/acceptance/artifacts/admin-docker-release-live-readonly-20260629T011306Z.json`；Admin Web root 可达，`/api/admin/library/status` 返回 `/data/PublicLibrary`、`11394` total、`10471` ready、current index `v010471`，但 `/api/admin/auth/status`、`/api/admin/release-gates`、`/api/admin/data-loading/plan` 仍为 `404`，`/api/admin/dashboard/metrics` 在 `10s` 超时。后续 parity/runbook/readiness artifacts 为 `admin-docker-version-parity-plan-20260629T011312Z.json`、`admin-docker-staging-runbook-20260629T011326Z.json`、`admin-docker-release-readiness-summary-20260629T011326Z.json`；最新 readiness 仍 `6/13` gate 通过、`release_review_ready=false`、`docker_upload_allowed=false`。当前 runtime candidate 仍是已 GitHub dry-run smoke 的 `4cb5b18262e49894d4272b0fc940be6c1d2102b4`；后续证据/文档提交不自动成为新 Docker runtime candidate。未启停容器、未推送/拉取镜像、未写 NAS runtime、未写 `PublicLibrary`、未启动预处理。
- 2026-06-29 UTC legacy latest rollback plan：新增 `plan:admin-docker-legacy-rollback` 并生成 `docs/acceptance/artifacts/admin-docker-legacy-rollback-plan-20260629T011940Z.json`。该只读计划确认当前 NAS 旧栈是一致的 `latest` 部署，候选 `4cb5b18262e49894d4272b0fc940be6c1d2102b4` 已 GitHub candidate-ready，workflow 只 push SHA tag、不 push `latest`，compose 不默认 `latest`；因此一次性 legacy `latest` rollback exception 可进入发布审评，但仍 `release_execution_allowed=false`、`docker_deploy_allowed=false`，且不能替代显式 release approval、disk proof、worker proof、Cutter staged proof、release inputs 和 staging runbook。
- 2026-06-29 UTC release-input/readiness legacy gate integration：`admin-docker-release-inputs`、NAS release-input intake 与 release readiness summary 已接入 `admin-docker-legacy-rollback-plan-20260629T011940Z.json`。最新 release inputs `docs/acceptance/artifacts/admin-docker-release-inputs-20260629T013145Z.json` 记录 legacy latest rollback exception `ready=true`、`accepted=false`，默认仍 blocked；最新 readiness `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260629T013413Z.json` 仍为 `6/13` gate 通过、`release_review_ready=false`、`docker_upload_allowed=false`，并要求 release-manager 角色审评后才可把 `latest` 作为一次性 current/rollback 输入。本轮未启停容器、未推送/拉取镜像、未写 NAS runtime、未写 `PublicLibrary`、未启动预处理。
- 需要确认：当前正式 NAS 公共素材库根目录。代码和文档里存在多个候选路径，实际测试必须以当前启动环境变量和 Doctor 结果为准。

## 仓库与共享目录

| 项目 | 当前约定 |
| --- | --- |
| 主仓库 | `/Users/huaqihang/Documents/mixlab` |
| 当前工作分支 | 以 `git status -sb` 实时输出为准 |
| Mac 共享交付目录 | `/Users/huaqihang/Public/MixLabWindowsBuilds` |
| Windows 映射盘示例 | `P:\MixLabWindowsBuilds`；如果从 UNC 直接启动旧脚本，Windows 可能残留临时映射盘，后续脚本不应依赖具体盘符 |
| Windows 共享 UNC 示例 | `\\192.168.1.21\“华启航”的公共文件夹\MixLabWindowsBuilds` |
| Windows Runner 启动脚本 | `/Users/huaqihang/Public/MixLabWindowsBuilds/start-windows-test-runner.cmd` |
| Windows Runner 可执行文件 | `/Users/huaqihang/Public/MixLabWindowsBuilds/runner/MixLabWindowsTestRunner.exe` |

注意：

- Windows CMD 不支持把 UNC 路径直接作为当前目录。Runner 启动脚本不能再使用 `pushd` 自动映射盘符，应直接基于 `%~dp0` 读写共享目录绝对路径。
- 共享目录名在 Windows 上可能显示为中文公共文件夹路径，也可能被映射为盘符。脚本和测试报告必须记录最终解析到的 `share_root`。

## 端口总表

| 端口 | 所属机器 | 服务 | 说明 |
| --- | --- | --- | --- |
| 5176 | Mac | 管理端 Web | 本机调试约定入口：`http://127.0.0.1:5176/#/dashboard`。Vite 脚本默认没有固定端口，实际以启动日志为准。 |
| 5177 | Mac | 剪辑端 Web | 本机调试约定入口：`http://127.0.0.1:5177/#/project-home`。Vite 脚本默认没有固定端口，实际以启动日志为准。 |
| 3889 | Mac 或 NAS 容器内部 | 管理端 API | 本机调试默认 `http://127.0.0.1:3889`。 |
| 3789 | Mac 或 Windows | 剪辑端 API / Desktop sidecar | Web 调试和 Windows 桌面端都使用这个 API 端口，但 `127.0.0.1` 视角不同。 |
| 3790 | Mac 或 Windows | searchd | 剪辑端搜索服务。 |
| 3799 | Windows | Windows Test Runner | Windows 本机健康检查：`http://127.0.0.1:3799/health`。Mac 当前远程调用地址：`http://192.168.1.20:3799`，如 DHCP 变化需重验。 |
| 18080 | NAS | 管理端 Web 当前只读观测入口 | 2026-06-28 UTC 从 Mac 侧 `curl --noproxy '*' -I http://192.168.1.27:18080/` 返回 `HTTP 200`；当前为旧管理端 API，不能作为新版 Docker 发布通过证据。 |
| 8080 | NAS | 管理端 Web Compose 默认端口 | `deploy/nas/mixlab/.env.example` 默认 `MIXLAB_ADMIN_WEB_PORT=8080`，但 2026-06-28 UTC 从 Mac 侧连接 `192.168.1.27:8080` 失败；实际端口以 NAS `.env` 和只读探测为准。 |
| 8898 | Mac | 管理端静态视觉参考 | 只作为设计参考页，不是正式产品运行时。 |
| 5173 | Tauri dev | Cutter Web devUrl | `apps/cutter-desktop/src-tauri/tauri.conf.json` 的开发模式地址。 |

## 管理端环境

### 管理端 Web

| 项目 | 值 |
| --- | --- |
| 包 | `apps/admin-web` / `@mixlab/admin-web` |
| 启动脚本 | `npm run dev:admin-web` |
| 构建脚本 | `npm run build:admin-web` |
| 本机调试入口 | `http://127.0.0.1:5176/#/dashboard` |
| API 环境变量 | `VITE_MIXLAB_ADMIN_API_BASE_URL` |

`apps/admin-web/package.json` 当前脚本为 `vite --host 127.0.0.1`，没有写死端口。开发时若需要固定 5176，应在命令中显式传 `--port 5176 --strictPort`。

### 管理端 API

| 项目 | 值 |
| --- | --- |
| 启动脚本 | `npm run server:admin-api` |
| 默认 host | `MIXLAB_ADMIN_API_HOST=127.0.0.1` |
| 默认 port | `MIXLAB_ADMIN_API_PORT=3889` |
| 本机 API | `http://127.0.0.1:3889` |
| 公共素材库根目录 | `MIXLAB_ADMIN_LIBRARY_ROOT` |
| fallback | `MIXLAB_PREPROCESS_LIBRARY_ROOT`，再 fallback 到 `MIXLAB_CUTTER_LIBRARY_ROOT` |

管理端不能长期使用 `/tmp` 作为正式公共素材库根目录。正式运行必须使用持久目录，例如 NAS 挂载目录或本机持久公共素材库目录。

## 剪辑端环境

### 剪辑端 Web

| 项目 | 值 |
| --- | --- |
| 包 | `apps/cutter-web` / `@mixlab/cutter-web` |
| 启动脚本 | `npm run dev:cutter-web` |
| 构建脚本 | `npm run build:cutter-web` |
| 本机调试入口 | `http://127.0.0.1:5177/#/project-home` |
| API 环境变量 | `VITE_MIXLAB_CUTTER_API_BASE_URL` |

`apps/cutter-web/package.json` 当前脚本为 `vite --host 127.0.0.1`，没有写死端口。开发时若需要固定 5177，应在命令中显式传 `--port 5177 --strictPort`。

### 剪辑端 API / Desktop Sidecar

| 项目 | 值 |
| --- | --- |
| 启动脚本 | `npm run server:cutter-api` |
| 默认 host | `MIXLAB_CUTTER_API_HOST=127.0.0.1` |
| 默认 port | `MIXLAB_CUTTER_API_PORT=3789` |
| 本机 API | `http://127.0.0.1:3789` |
| 公共素材库根目录 | `MIXLAB_CUTTER_LIBRARY_ROOT` |
| 本地工作区根目录 | `MIXLAB_CUTTER_WORKSPACE_ROOT` |
| Searchd API | `MIXLAB_SEARCHD_BASE_URL=http://127.0.0.1:3790` |
| 正式认证模式 | `MIXLAB_CUTTER_AUTH_MODE=reviewed`，剪辑师必须注册账号，管理员审核后才能登录 |
| 测试免登录模式 | 仅在明确需要自动化/本机快速调试时显式使用 `MIXLAB_CUTTER_AUTH_MODE=local_trusted`，不得作为正式默认值 |

Mac 本机调试默认本地工作区为：

```text
/Users/huaqihang/Movies/MixLabLocal
```

Windows 桌面端默认本地工作区为：

```text
%USERPROFILE%\Videos\MixLabLocal
```

### Searchd

| 项目 | 值 |
| --- | --- |
| 启动脚本 | `npm run server:searchd` |
| 构建脚本 | `npm run build:searchd` |
| 默认 API | `http://127.0.0.1:3790` |
| 发布索引根目录 | `MIXLAB_SEARCHD_RELEASE_ROOT` |

Searchd 的 `127.0.0.1` 同样是机器本地视角。Windows 桌面端里的 searchd 是 Windows 本机进程，不是 Mac 上的 searchd。

## Windows 桌面端环境

| 项目 | 值 |
| --- | --- |
| Tauri 产品名 | `MixLab Cutter` |
| 当前 Tauri 版本 | `0.18.10` |
| 配置文件 | `apps/cutter-desktop/src-tauri/tauri.conf.json` |
| 前端产物 | `apps/cutter-web/dist` |
| 默认窗口 | `1440x900`，最小 `1180x720` |
| Windows 包脚本 | `npm run package:cutter-desktop:windows` |
| 安装包交付目录 | `/Users/huaqihang/Public/MixLabWindowsBuilds` |

2026-06-24 UTC 当前最新已验收共享安装包：

```text
file: /Users/huaqihang/Public/MixLabWindowsBuilds/MixLab Cutter_0.18.10_x64-setup-3f30c9c.exe
version: 0.18.10
commit: 3f30c9cfe9b5995a1eeea902d01abda96bd59e32
github_run_id: 28108476782
sha256: 04e263a3cac6a443b8a655de30ce65d82b76e06807af8858e74281b079bdd0db
included_fix: Cutter material search and public library support exact source-videos first-level folder filters such as 王牧笛, 陈永亮, 陶矜, 陶矜2 across release catalog, SQLite/searchd, Cutter API, web UI, and Windows release cache sync; old indexes remain compatible by deriving the folder from relative_path.
install_smoke_summary: /Users/huaqihang/Public/MixLabWindowsBuilds/reports/install_latest_and_smoke-20260624T152418Z-579f2411/summary.md
archived_install_smoke_summary: /Users/huaqihang/Documents/mixlab/docs/acceptance/artifacts/install_latest_and_smoke-20260624T152418Z-579f2411/summary.md
desktop_ui_screenshot_summary: /Users/huaqihang/Public/MixLabWindowsBuilds/reports/desktop_ui_screenshot_smoke-20260624T152634Z-e0f0e8b8/summary.md
archived_desktop_ui_screenshot_summary: /Users/huaqihang/Documents/mixlab/docs/acceptance/artifacts/desktop_ui_screenshot_smoke-20260624T152634Z-e0f0e8b8/summary.md
m19_runtime_foundation_report: /Users/huaqihang/Public/MixLabWindowsBuilds/reports/m19_runtime_foundation-20260623T035006Z-8dad91a6/report.json
local_web_m19_report: /Users/huaqihang/Documents/mixlab/docs/acceptance/artifacts/m19-runtime-foundation-local-web-current.json
```

桌面端内置资源：

- `cutter-api-sidecar-x86_64-pc-windows-msvc.exe`
- `mixlab-searchd-x86_64-pc-windows-msvc.exe`
- `ffmpeg.exe`
- `ffprobe.exe`
- `resources/default-desktop-config.json`

当前默认桌面端配置：

```json
{
  "api_host": "127.0.0.1",
  "api_port": 3789,
  "public_library_root": "",
  "local_workspace_root": "%USERPROFILE%\\Videos\\MixLabLocal",
  "log_root": "%APPDATA%\\MixLab Cutter\\logs"
}
```

桌面端 sidecar 的正式默认认证模式是 `reviewed`。如果没有显式传入 `MIXLAB_CUTTER_AUTH_MODE=local_trusted`，Windows 剪辑端启动后也必须走剪辑师账号注册、管理员审核、账号密码登录流程。

Windows 日志默认目录：

```text
%APPDATA%\MixLab Cutter\logs
```

## Windows Test Runner 环境

| 项目 | 值 |
| --- | --- |
| 包 | `packages/windows-test-runner` / `@mixlab/windows-test-runner` |
| 当前共享版本 | `0.1.33` |
| 当前实机运行版本 | 主入口 `0.1.32` on `3799`；2026-06-23 M19 验收通过主入口 `launch_runner` 启动备用 Runner `0.1.33` on Windows local port `49334`。 |
| 发布记录 | `/Users/huaqihang/Public/MixLabWindowsBuilds/runner/LATEST.txt` |
| 共享目录 Runner | `/Users/huaqihang/Public/MixLabWindowsBuilds/runner/MixLabWindowsTestRunner.exe` |
| Windows 本地 Runner | `%LOCALAPPDATA%\MixLab\TestRunner\MixLabWindowsTestRunner.exe` |
| 启动脚本 | `/Users/huaqihang/Public/MixLabWindowsBuilds/start-windows-test-runner.cmd` |
| 默认 host | `0.0.0.0` |
| 默认 port | `3799` |
| Windows 本机健康检查 | `http://127.0.0.1:3799/health` |
| Mac 远程健康检查 | `http://192.168.1.20:3799/health` |
| 共享 bootstrap 日志 | `/Users/huaqihang/Public/MixLabWindowsBuilds/logs/runner/bootstrap-<port>.log`，默认 `bootstrap-3799.log` |

2026-06-23 UTC 当前共享发布记录：

```text
0.1.33 a0dcd74 27985347100 4e0ae93c37bc662e2536b01da60bcd15a40a3aeb8d5862fc1171392cbcdfa82b
```

`0.1.2` 修复内容：共享目录报告/timeline 写入失败时，Runner 不再崩溃；终态报告可从内存通过 HTTP 返回。

`0.1.3` 修复内容：新增 `launch_app_probe` 套件。Runner 可以定位并启动已安装的 `MixLab Cutter.exe`，等待 Windows 本机 `http://127.0.0.1:3789/health` 就绪，再运行剪辑端 API 探测。报告会记录候选安装路径、是否启动应用、进程 ID、API 等待耗时和探测结果。

`0.1.4` 修复内容：增强 `launch_app_probe` 的安装路径发现能力。Runner 会扫描 `%LOCALAPPDATA%`、`%LOCALAPPDATA%\Programs`、`Program Files` 等常见父目录，并匹配 `MixLab Cutter.exe` / `mixlab-cutter*.exe`，避免只依赖固定安装路径。

`0.1.5` 修复内容：`launch_app_probe` 支持从桌面或开始菜单 `.lnk` 快捷方式启动 `MixLab Cutter`；当 `127.0.0.1:3789/health` 超时时，报告会带回 `%APPDATA%\MixLab Cutter\logs` 下的 `desktop-host.ndjson`、sidecar stdout/stderr 和 searchd stdout/stderr 尾部内容，减少人工截图式调试。

`0.1.6` 修复内容：启动脚本不再使用 `pushd` 映射 UNC 共享目录，避免产生一串残留盘符；`probe_api` 正确识别真实 API 的 `schema_version/data/videos` 和 `available_video_count`，不再把公共素材库 `20 / 7950` 误判为空。

`0.1.7` 修复内容：新增 `launch_runner` run suite。当前 Runner 可以从共享目录启动新版 Runner 到备用端口，例如 `3800`，并验证新版 Runner 的 `/version`；同时新增版本同步测试，避免 `package.json` 版本与运行时 `/version` 不一致。启动脚本支持可选端口参数，例如 `start-windows-test-runner.cmd 3800`。

`0.1.8` 修复内容：新增非破坏性 Windows 应用验收 suites：`app_runtime_smoke`、`real_data_smoke`、`cache_smoke`、`windows_acceptance`。这些 suites 通过 Windows 本机 sidecar API 验证真实数据、搜索、完整文案、剪切任务可读和缓存分类可观测；`windows_acceptance` 不创建剪切任务、不写本地工作区。

`0.1.9` 修复内容：新增 `install_latest_and_smoke` suite。Runner 会从共享目录选择最新 `MixLab Cutter` 安装包，复制到 Windows 本机临时目录，校验 SHA-256，关闭旧桌面端/sidecar/searchd 进程，静默安装，然后执行 `windows_acceptance`。

`0.1.23` 修复内容：新增并强化 `desktop_ui_screenshot_smoke`，可通过备用本机端口采集 Windows 桌面端核心页面截图。该版本可生成 8 张页面截图，但曾被 Windows Security / Firewall dialog for `Node.js JavaScript Runtime` 覆盖；此限制已由 `0.1.31` 处理。

`0.1.29` 修复内容：`windows_acceptance`、`install_latest_and_smoke` 等正式验收 suite 支持 `options.auth_credentials`，可用剪辑师用户名/密码登录获取 reviewed 模式 session headers，报告不记录密码或 session token。

`0.1.31` 修复内容：`desktop_ui_screenshot_smoke` 会识别并非破坏性关闭 Windows Security / Firewall prompt，截图前后增加稳定等待，避免弹窗遮挡页面截图。`desktop_ui_screenshot_smoke-20260622T043112Z-cdbf15ef` 已通过并产出 8 张干净桌面端截图。

`0.1.32` 修复内容：新增 `desktop_incident_diagnostics` suite，并把 `launch_app_probe` 的 incident 采集能力抽出复用。用于 Windows 桌面端出现全屏加载失败、sidecar/searchd 异常或日志需要回传时，自动收集桌面端日志、sidecar/searchd 输出尾部、运行时状态和最近报告线索。共享目录已发布 `0.1.32`，主入口 `3799` 截至 2026-06-22 已验证为 `0.1.32`。

`0.1.33` 修复内容：新增 `m19_runtime_foundation` 验收 suite，并支持 startup-run 指针报告，用于在高端口 Runner 受防火墙限制时仍能通过共享目录读取 M19 硬指标结果。`m19_runtime_foundation-20260623T035006Z-8dad91a6` 已通过，覆盖 30 次快速切换、1 万级公共素材分页、搜索首屏、候选快速切换、连续 5 条剪切队列和剪切期间响应。

`0.1.10` 修复内容：修正 `install_latest_and_smoke` 的 `Unblock-File` 调用方式，确保本机临时安装包路径带空格时仍能安全解除 Windows 下载标记。

`0.1.13` 修复内容：Windows acceptance 支持正式 `reviewed` 注册/登录模式。验收请求可以通过 `options.auth_headers` 或 `install_latest_and_smoke.acceptance_options.auth_headers` 传入 `X-MixLab-Device-Id` 与 `X-MixLab-Session-Token`，用于访问受保护的 runtime/source-library/search/detail/cut-jobs/cache 接口；磁盘报告不记录 session token。

Runner 启动后会把报告写入：

```text
P:\MixLabWindowsBuilds\reports
```

如果 Codex 要从 Mac 调用 Runner，必须先确认 Windows 局域网 IP。当前观察到的地址：

```text
http://192.168.1.20:3799/health
```

不能在 Mac 上用 `http://127.0.0.1:3799/health` 判断 Windows Runner 是否在线。Mac 当前环境可能带有 HTTP 代理，访问局域网 Runner 时应绕过代理：

```sh
curl --noproxy '*' http://192.168.1.20:3799/health
```

## 公共素材库与 NAS

当前代码和部署文档中出现过以下公共素材库路径，实际测试时必须以当前启动环境变量和 Doctor 输出为准：

| 环境 | 路径示例 | 状态 |
| --- | --- | --- |
| Mac 挂载 NAS | `/Volumes/MixLab/PublicLibrary` | 常用候选路径 |
| Mac 挂载 NAS | `/Volumes/PublicLibrary` | 兼容候选路径 |
| NAS Docker 容器 | `/data/PublicLibrary` | 容器内路径 |
| NAS 主机 | `/volume1/MixLab/PublicLibrary` | Compose 默认示例 |
| Windows UNC | `\\NAS\MixLab\PublicLibrary` | 部署文档示例 |
| Windows UNC | `\\192.168.1.27\MixLab\PublicLibrary` | 需要按实际 NAS IP 确认 |

需要确认：当前用户正式测试用的公共素材库根目录、NAS IP、Windows 可访问的 UNC 路径。

公共素材库内的关键结构：

```text
PublicLibrary/
  source-videos/
  .mixlab-library/
    indexes/
      source-transcript-index/
        current.json
```

管理端可以管理公共素材库，剪辑端不应该写公共素材库。剪辑端输出、缓存和临时文件都应进入本地工作区或本地缓存目录。

## 缓存与本地数据

| 缓存类型 | 作用 | 默认位置 |
| --- | --- | --- |
| Release Cache | 保存发布后的公共素材库索引快照，让剪辑端启动和搜索不直接扫 NAS | Windows：`%LOCALAPPDATA%\MixLab Cutter\cache`；Mac 调试：本地工作区 cache |
| Search Index | 本地搜索索引，包含视频、分段、关键词定位等搜索所需结构 | release/cache 内部 |
| Thumbnails | 视频封面和缩略图，避免每次从原视频读取 | release/cache 内部 |
| Source Video Cache | 被选中或将要剪切的视频源文件本地副本，用于降低 NAS 读取压力 | 本地缓存根目录，需 LRU 控制容量 |
| Transcript Cache | 选中素材后的完整文案缓存 | release/cache 或工作区缓存 |
| Cut Temp | 剪切中间文件、临时输出、失败重试临时文件 | 本地工作区临时目录，需 LRU 清理 |
| Local Clips | 最终剪切产出 | 本地工作区项目目录 |

注意：

- 左下角 UI 的“缓存 4 KB”可能只是前端/本地状态显示，不一定代表真实文件缓存大小。调试缓存问题时必须读取缓存管理 API 或 Runner 报告。
- 原视频缓存策略必须有容量上限和 LRU 清理，不能无限缓存 NAS 原视频。

## 本机 Web 调试启动建议

如果需要固定端口，建议显式启动：

```sh
cd /Users/huaqihang/Documents/mixlab

MIXLAB_ADMIN_LIBRARY_ROOT="/Volumes/MixLab/PublicLibrary" \
MIXLAB_ADMIN_API_HOST="127.0.0.1" \
MIXLAB_ADMIN_API_PORT="3889" \
npm run server:admin-api
```

```sh
cd /Users/huaqihang/Documents/mixlab

VITE_MIXLAB_ADMIN_API_BASE_URL="http://127.0.0.1:3889" \
npm run dev:admin-web -- --host 127.0.0.1 --port 5176 --strictPort
```

```sh
cd /Users/huaqihang/Documents/mixlab

MIXLAB_CUTTER_LIBRARY_ROOT="/Volumes/MixLab/PublicLibrary" \
MIXLAB_CUTTER_WORKSPACE_ROOT="$HOME/Movies/MixLabLocal" \
MIXLAB_CUTTER_API_HOST="127.0.0.1" \
MIXLAB_CUTTER_API_PORT="3789" \
MIXLAB_SEARCHD_BASE_URL="http://127.0.0.1:3790" \
npm run server:cutter-api
```

```sh
cd /Users/huaqihang/Documents/mixlab

VITE_MIXLAB_CUTTER_API_BASE_URL="http://127.0.0.1:3789" \
npm run dev:cutter-web -- --host 127.0.0.1 --port 5177 --strictPort
```

路径 `/Volumes/MixLab/PublicLibrary` 是示例。实际运行前必须确认该路径存在并包含 `.mixlab-library`。

## 环境检查清单

每次涉及启动、测试、打包、Windows 自动化、NAS 数据或性能问题时，先完成这 10 项：

1. 当前命令运行在哪台机器：Mac、Windows、NAS、容器内、还是浏览器页面。
2. 当前浏览器打开的是哪个 URL。
3. `127.0.0.1` 指向哪台机器。
4. 当前 API base URL 是哪个。
5. 当前公共素材库根目录是什么。
6. 当前本地工作区根目录是什么。
7. 当前缓存根目录是什么。
8. 当前包版本、commit、Runner 版本是什么。
9. 相关端口是否真的在监听。
10. 数据是否来自真实 NAS/公共素材库，而不是 fixture、fallback 或静态参考页。

## 常见误区

- 把 Mac 的 `127.0.0.1` 当成 Windows 的 `127.0.0.1`。
- 把 Windows 本机 `http://127.0.0.1:3799/health` 正常，误解为 Mac 已能远程调用 Runner。
- Mac shell 带代理时直接 `curl http://192.168.1.20:3799/health`，请求可能被代理拦截；局域网 Runner 调试用 `--noproxy '*'`。
- Vite 自动换端口，但测试仍按旧端口打开。
- 管理端和剪辑端指向不同公共素材库根目录。
- Searchd 端口、release root 和 Cutter API 读取的 release root 不一致。
- Windows CMD 用 UNC 路径作为当前目录导致脚本从 `C:\Windows` 启动。
- `8898` 静态参考页面被误认为正式管理端。
- Windows 桌面日志在 `%APPDATA%`，共享目录日志只保存 Runner/交付相关日志。
- 旧 agent/watchdog 文件残留导致继续调旧链路。
- 看到 UI “加载中”就先改前端，但真实原因可能是 API、searchd、缓存、NAS 路径或 Windows 权限。

## 更新规则

1. 任何端口、路径、Runner、共享目录、缓存根目录、包版本、NAS 挂载方式发生变化，都必须同步更新本文件。
2. 不确定的信息写“需要确认”，不要猜。
3. 调试报告必须包含机器视角、URL、端口、路径和版本。
4. 不能把密钥、密码、token、完整私密转写文本写进本文件。
5. 如果本文件和代码冲突，以代码为准，并立即修正文档。
6. 如果本文件和真实测试结果冲突，以真实测试结果为准，并立即修正文档。
