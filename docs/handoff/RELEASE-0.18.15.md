# MixLab Cutter 0.18.15 热修发布记录

- 发布日期：2026-10-30（UTC+8）
- 版本：0.18.15
- 构建提交：892dfb7（hotfix/0.18.15，基于 main 288e7a2）
- 安装包：MixLab Cutter_0.18.15_x64-setup-892dfb7.exe
- 大小：58989526 bytes
- sha256：c7085cabc3a05682746e35bede4e5521e47e5ff12dc31e72ea53fba769047c3c

## 发布位置

- NAS：\\\\192.168.1.27\\MixLab\\安装包\\MixLab Cutter\\0.18.15\\
- Mac SMB：smb://192.168.1.27/MixLab/安装包/MixLab Cutter/0.18.15/
- Mac 共享：\\\\192.168.1.21\\“华启航”的公共文件夹\\MixLabWindowsBuilds\\
- 0.18.13/0.18.14 保留回滚。

## 修复内容

1. 同步 Cargo.toml / Cargo.lock 的 package version 到 0.18.15；
2. 修复 0.18.14 设置页仍显示 v0.18.13 的版本元数据不一致；
3. 新增“Cargo 版本 = app 版本”一致性测试，防止再次漏改；
4. 无功能/API 变化。

## 真实验收（Windows 安装版）

- 0.18.14→0.18.15 覆盖升级 PASS；
- 注册表 DisplayVersion / exe FileVersion = 0.18.15；
- 设置页应用版本显示 v0.18.15，构建版本 892dfb70610f；
- 配置文件未被升级改写；
- 快速 copy 回归 2/2 通过（5.1s / 6.5s）。
- 证据：C:\\dev\\mixlab-verify-01815\\。

## 已知限制 / 后续

- 本版不包含 UI Phase 0；UI 重排在独立分支 ui/phase0-shell-home 审查中。
- Windows UI 顶部提示条/悬浮剪切等旧问题在 UI Phase 0/1 处理。
- 首次启动偶发 NAS 用户存储瞬时不可读（重启恢复），后续单独评估重试/错误提示。
- 未做代码签名。

## 回滚

重新安装 0.18.14 或 0.18.13 即可，用户数据保留。
