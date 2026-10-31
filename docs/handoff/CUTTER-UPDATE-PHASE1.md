# Cutter 更新功能 Phase 1 实施规格

- 版本：0.18.27
- 目标：设置页“检查更新”→ NAS 更新清单 → 下载安装包 → SHA256 校验 → 用户确认安装 → 应用退出并启动安装程序。
- 不做：HTTP 更新服务、Tauri 官方 updater、自动静默安装、灰度。

## 1. 更新清单

NAS 路径（默认）：
`\\\\192.168.1.27\\MixLab\\安装包\\MixLab Cutter\\update.json`

格式：

```json
{
  "schema_version": "1.0",
  "version": "0.18.27",
  "min_supported_version": "0.18.20",
  "installer": "MixLab Cutter_0.18.27_x64-setup-<commit>.exe",
  "sha256": "<sha256>",
  "size_bytes": 59000000,
  "release_notes": "本次更新内容……",
  "published_at": "2026-11-01T00:00:00Z"
}
```

安装包与 update.json 同目录。

## 2. 桌面端命令

在 Tauri Rust 侧新增：

1. `desktop_check_update() -> UpdateCheckResult`
   - 读取 update.json；失败返回明确错误（离线/文件不存在/格式错误）。
   - 比较当前 `CARGO_PKG_VERSION` 与 version。
   - 返回 `{ available, current_version, latest_version, notes, size_bytes }`。

2. `desktop_download_update(manifest: UpdateManifest) -> DownloadResult`
   - 校验 installer 文件名仅 basename，防止路径穿越。
   - 复制到 `%LOCALAPPDATA%\\MixLab Cutter\\updates\\`。
   - 计算 SHA256，与 manifest.sha256 比较。
   - 返回本地安装包路径。

3. `desktop_install_update(installer_path: String)`
   - 再次校验路径位于 updates 目录、文件存在。
   - 生成一个短生命周期 cmd/ps1 helper：等待当前进程退出后启动安装程序。
   - 应用立即退出。
   - Phase 1 允许安装程序交互式完成，不强制静默。

## 3. UI

设置页新增“软件更新”区块：

- 当前版本：v0.18.27
- [检查更新]
- 发现新版本：v0.18.28，大小，更新说明
- [稍后] [立即更新]
- 下载中：显示进度/状态
- 校验失败：明确错误，不运行安装包
- 无更新：提示已是最新

禁止在页面顶部/顶栏再加按钮；只放设置页。

## 4. 安全与容错

- 只接受同目录 basename；
- SHA256 不匹配绝不运行；
- 下载中断删除临时文件；
- 无网络/UNC 不可读给出可操作错误；
- 用户取消不退出；
- 更新期间不并发下载；
- 安装器路径不存在时提示重新检查更新。

## 5. 验收

必须覆盖：

1. 无更新（manifest 同版本或更低）→ 提示已是最新；
2. 有更新 → 显示版本/大小/说明；
3. 取消 → 不下载不退出；
4. 下载成功 + hash 正确 → 出现安装确认；
5. hash 错误 → 拒绝安装；
6. UNC 不存在 → 明确错误；
7. 真实升级：0.18.26 → 0.18.27，安装后版本/设置页正确；
8. UI 截图：设置页、更新可用、下载中、确认安装、hash 错误；
9. typecheck + 全量测试。

## 6. 发布配套

- 发布脚本生成 update.json 并放 NAS + Mac 共享；
- 保留上一版安装包，支持回滚；
- LATEST 仍在人工验收后更新。
