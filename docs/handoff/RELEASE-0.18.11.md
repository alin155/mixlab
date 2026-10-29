# MixLab Cutter 0.18.11 发布记录

- 发布日期：2026-10-29（UTC+8）
- 版本：**0.18.11**
- 构建提交：`5e26771233e37ad629cfd7e735da2fa8a2611910`（main）
- 安装包：`MixLab Cutter_0.18.11_x64-setup-5e26771.exe`
- 大小：58,966,667 bytes（约 56.2 MB）
- sha256：`c6555617aa4f774b86d515d1b9427a255575898889ab111610330603e5c90a0a`

## 发布位置

- NAS：`\\192.168.1.27\MixLab\安装包\MixLab Cutter\0.18.11\`
- Mac SMB：`smb://192.168.1.27/MixLab/安装包/MixLab Cutter/0.18.11/`
- Mac 共享（备用）：`\\192.168.1.21\“华启航”的公共文件夹\MixLabWindowsBuilds\`
- 目录内包含：安装包、`SHA256SUMS.txt`、`SHA256SUMS-0.18.11-5e26771.txt`、`release-notes.md`
- 分发指针已更新：`LATEST-CUTTER.txt` / `LATEST.txt`（NAS 与 Mac 共享根目录）

## 升级验收（Windows 实测）

- 从已安装 0.18.10 覆盖升级到 0.18.11：静默安装 exit=0；
- 注册表 `DisplayVersion=0.18.11`、exe `FileVersion=0.18.11`、Tauri runtime version=0.18.11（CDP 探针）；
- 配置保留：`cutter-desktop-config.json` 升级前后 SHA256 完全一致；
- 引擎就绪：3789/3790 监听，desktop/sidecar/searchd 各 1；
- 退出回收：关窗后进程/端口全 0，`app_window_close_cleanup`/`app_exit_cleanup` 日志存在；
- 证据：`C:\dev\mixlab-verify-release-01811\upgrade-acceptance.json`、`upgrade-login-0.18.11.png`、`C:\dev\logs\v01811-nsis-package.log`。

## 包含的更新

- 管理端/剪辑端汇合到 main；
- A1 待剪清单入口 + 拖拽排序；A2 批量取消（可重试）/隐藏（可恢复）语义；
- B 搜索体验修复（失败重试、加载分层、分页终止、searchd 降级提示、竞态防护）；
- D 缓存/本地素材/工作区残留/Release 缓存治理 + D5 治理审计；
- copy 模式 A/V 时长差容差修复；安装/卸载与 sidecar 回收增强。

## 安装 / 回滚

- 安装：完全退出旧版 → 双击安装包覆盖 → 设置页确认 `v0.18.11`（本次截图因测试机无账号登录，以运行期版本探针+文件版本+注册表为证）；
- 校验：`Get-FileHash ... -Algorithm SHA256` / `shasum -a 256 ...`；
- 回滚：重新安装上一版 0.18.10 即可，用户数据保留；
- 注意：未做代码签名（SmartScreen 可能提示）；首启需 UTF-8 无 BOM config；卸载保留 AppData（设计）。
