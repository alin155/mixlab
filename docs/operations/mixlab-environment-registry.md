# MixLab 环境登记表

更新时间：2026-06-16

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
- 2026-06-17，剪辑端 Windows 包 `4737a5a` 已通过 `install_latest_and_smoke-20260617T225212Z-830c67eb` 安装验收，安装退出码 `0`，安装耗时 `6915ms`。安装后立即验收时 searchd 仍在预热，搜索 `第一场` 约 `811ms`；延迟验收 `windows_acceptance-20260617T225407Z-ea788abb` 通过，公共素材首屏 `9ms`、搜索 `第一场` `14ms`、完整文案详情 `5ms`、剪切任务列表 `7ms`，`searchd` 健康且 `searchd_cache_size_bytes=646312829`。
- 2026-06-16，发现旧版 `start-windows-test-runner.cmd` 使用 `pushd` 进入 UNC 共享目录，Windows 会自动映射临时盘符；多次启动/中断时可能残留一串 `N:` 到 `Z:` 之类的共享映射。启动脚本已改为直接使用 `%~dp0` 绝对路径，不再 `pushd`/`popd`，以后不应再新增这类映射。
- 2026-06-16，排查 Windows 桌面端首启页阻塞时发现端口冲突风险：Windows Test Runner 使用 `3799`，桌面端 searchd 必须使用 `3790`，不能让测试 Runner 和产品内部搜索服务共用同一个端口。
- Mac 当前观察到的监听端口：
  - `127.0.0.1:3889`：管理端 API。
  - `127.0.0.1:5176`：管理端 Web。
- Windows IP 可能因 DHCP 变化而改变。Codex 远程调用 Runner 前，应重新验证 `http://<Windows-LAN-IP>:3799/health`。
- Mac 当前 shell 可能设置了 `http_proxy=http://127.0.0.1:1087`。访问局域网 Runner 时必须绕过代理，例如使用 `curl --noproxy '*'`。
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

2026-06-17 当前最新已验收共享安装包：

```text
file: /Users/huaqihang/Public/MixLabWindowsBuilds/MixLab Cutter_0.18.10_x64-setup-4737a5a.exe
version: 0.18.10
commit: 4737a5a
github_run_id: 27724207991
sha256: 2bbd7541deaced8c751e7f5a201f22943f87625b2f251d9d4c97aa9cf7ec373b
included_fix: searchd cache uses LocalAppData, persistent Tantivy cache survives Windows rename, nested searchd cache size is counted recursively
install_smoke_report: /Users/huaqihang/Public/MixLabWindowsBuilds/reports/install_latest_and_smoke-20260617T225212Z-830c67eb/report.json
delayed_windows_acceptance_report: /Users/huaqihang/Public/MixLabWindowsBuilds/reports/windows_acceptance-20260617T225407Z-ea788abb/report.json
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

Windows 日志默认目录：

```text
%APPDATA%\MixLab Cutter\logs
```

## Windows Test Runner 环境

| 项目 | 值 |
| --- | --- |
| 包 | `packages/windows-test-runner` / `@mixlab/windows-test-runner` |
| 当前共享版本 | `0.1.10` |
| 当前实机运行版本 | `0.1.10` on `3799`，2026-06-17 通过 `curl --noproxy '*' http://192.168.1.20:3799/health` 验证 |
| 发布记录 | `/Users/huaqihang/Public/MixLabWindowsBuilds/runner/LATEST.txt` |
| 共享目录 Runner | `/Users/huaqihang/Public/MixLabWindowsBuilds/runner/MixLabWindowsTestRunner.exe` |
| Windows 本地 Runner | `%LOCALAPPDATA%\MixLab\TestRunner\MixLabWindowsTestRunner.exe` |
| 启动脚本 | `/Users/huaqihang/Public/MixLabWindowsBuilds/start-windows-test-runner.cmd` |
| 默认 host | `0.0.0.0` |
| 默认 port | `3799` |
| Windows 本机健康检查 | `http://127.0.0.1:3799/health` |
| Mac 远程健康检查 | `http://192.168.1.20:3799/health` |
| 共享 bootstrap 日志 | `/Users/huaqihang/Public/MixLabWindowsBuilds/logs/runner/bootstrap-<port>.log`，默认 `bootstrap-3799.log` |

2026-06-17 当前共享发布记录：

```text
0.1.10 90325fb 27664604593 ac06b4bc90e51e96902d1ffb308a8ffcae744ff21af0e1fe8caf5f6670996d74
```

`0.1.2` 修复内容：共享目录报告/timeline 写入失败时，Runner 不再崩溃；终态报告可从内存通过 HTTP 返回。

`0.1.3` 修复内容：新增 `launch_app_probe` 套件。Runner 可以定位并启动已安装的 `MixLab Cutter.exe`，等待 Windows 本机 `http://127.0.0.1:3789/health` 就绪，再运行剪辑端 API 探测。报告会记录候选安装路径、是否启动应用、进程 ID、API 等待耗时和探测结果。

`0.1.4` 修复内容：增强 `launch_app_probe` 的安装路径发现能力。Runner 会扫描 `%LOCALAPPDATA%`、`%LOCALAPPDATA%\Programs`、`Program Files` 等常见父目录，并匹配 `MixLab Cutter.exe` / `mixlab-cutter*.exe`，避免只依赖固定安装路径。

`0.1.5` 修复内容：`launch_app_probe` 支持从桌面或开始菜单 `.lnk` 快捷方式启动 `MixLab Cutter`；当 `127.0.0.1:3789/health` 超时时，报告会带回 `%APPDATA%\MixLab Cutter\logs` 下的 `desktop-host.ndjson`、sidecar stdout/stderr 和 searchd stdout/stderr 尾部内容，减少人工截图式调试。

`0.1.6` 修复内容：启动脚本不再使用 `pushd` 映射 UNC 共享目录，避免产生一串残留盘符；`probe_api` 正确识别真实 API 的 `schema_version/data/videos` 和 `available_video_count`，不再把公共素材库 `20 / 7950` 误判为空。

`0.1.7` 修复内容：新增 `launch_runner` run suite。当前 Runner 可以从共享目录启动新版 Runner 到备用端口，例如 `3800`，并验证新版 Runner 的 `/version`；同时新增版本同步测试，避免 `package.json` 版本与运行时 `/version` 不一致。启动脚本支持可选端口参数，例如 `start-windows-test-runner.cmd 3800`。

`0.1.8` 修复内容：新增非破坏性 Windows 应用验收 suites：`app_runtime_smoke`、`real_data_smoke`、`cache_smoke`、`windows_acceptance`。这些 suites 通过 Windows 本机 sidecar API 验证真实数据、搜索、完整文案、剪切任务可读和缓存分类可观测；`windows_acceptance` 不创建剪切任务、不写本地工作区。

`0.1.9` 修复内容：新增 `install_latest_and_smoke` suite。Runner 会从共享目录选择最新 `MixLab Cutter` 安装包，复制到 Windows 本机临时目录，校验 SHA-256，关闭旧桌面端/sidecar/searchd 进程，静默安装，然后执行 `windows_acceptance`。

`0.1.10` 修复内容：修正 `install_latest_and_smoke` 的 `Unblock-File` 调用方式，确保本机临时安装包路径带空格时仍能安全解除 Windows 下载标记。

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
