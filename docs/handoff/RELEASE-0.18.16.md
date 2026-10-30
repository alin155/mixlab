# MixLab Cutter 0.18.16 发布记录

- 发布日期：2026-10-30（UTC+8）
- 版本：0.18.16
- 构建提交：fed812b（hotfix/0.18.16，基于 main bcbd5f2，合并 UI Phase 0 7bb5eb1）
- 安装包：MixLab Cutter_0.18.16_x64-setup-fed812b.exe
- 大小：59002206 bytes
- sha256：2a2c4091bb8949ec5906f11c542dd69bb97f61ceb90c3e04bcf71bb6afcd3272

## 发布位置

- NAS：\\\\192.168.1.27\\MixLab\\安装包\\MixLab Cutter\\0.18.16\\
- Mac SMB：smb://192.168.1.27/MixLab/安装包/MixLab Cutter/0.18.16/
- Mac 共享：\\\\192.168.1.21\\“华启航”的公共文件夹\\MixLabWindowsBuilds\\
- 0.18.13/0.18.14/0.18.15 保留回滚。

## 主要内容

1. UI Phase 0：统一 AppShell（顶栏/侧栏/页面标题区）、首页重排、顶部提示条裁切修复、顶栏项目切换器、侧栏用户名/封面加载修复；
2. 设置页版本显示 v0.18.16；Cargo/tauri/package 版本一致；
3. 功能与 0.18.15 相同：真实关键帧 copy、队列 ETA、任务目录。

## 真实验收

- 0.18.15→0.18.16 覆盖升级 PASS；DisplayVersion/FileVersion=0.18.16；配置 SHA256 保留；
- UI 1536×1024/1440×900：topbar/sidebar 各 1、无横向滚动；提示条完整；项目切换器可用；项目封面 4/4 加载；Allen 用户名不截断；
- copy 回归 2/2 通过（本次 cut_media 约 23~26s，本机负载/NAS 状态差异，裁决为 copy 且校验通过，非解码路径回归）；
- 证据：C:\\dev\\mixlab-verify-01816\\、Mac 共享 01816-evidence.zip。

## 已知限制 / 后续

- 素材搜索/剪切任务/本地素材内容重排、悬浮剪切定位修复留 Phase 1；
- 0.18.16 的 UI 为第一阶段外壳/首页，不是最终视觉；
- 未做代码签名；Windows 完整 npm test 的环境类失败与 main 基线同类。

## 回滚

重新安装 0.18.15 或 0.18.14 即可，用户数据保留。
