# MixLab Cutter 0.18.23 发布记录

- 发布日期：2026-10-30（UTC-7）
- 版本：0.18.23
- 构建提交：4b101e0（hotfix/0.18.23）
- 安装包：MixLab Cutter_0.18.23_x64-setup-4b101e0.exe
- 大小：59006137 bytes
- sha256：6fde43664e62726e25cbdeb51893aea5d4161f0c498d6c67d977f0be146635f6

## 发布位置

- NAS：\\\\192.168.1.27\\MixLab\\安装包\\MixLab Cutter\\0.18.23\\
- Mac SMB：smb://192.168.1.27/MixLab/安装包/MixLab Cutter/0.18.23/
- Mac 共享：\\\\192.168.1.21\\“华启航”的公共文件夹\\MixLabWindowsBuilds\\
- 0.18.11~0.18.22 保留回滚。

## 主要内容

1. copy 起点前无关键帧时，允许使用起点后 1000ms 内首关键帧保持 copy；
2. 超过 1000ms 仍降 precise，并记录明确原因；
3. 短片段终点早于首关键帧时保护性降 precise，避免空片；
4. 保留 0.18.22 的老师筛选、8 页去标题、Inspector tabs、全部项目等全部改动。

## 真实验收

- 0.18.22→0.18.23 升级 PASS；设置页 v0.18.23；
- 重点 copy：040A3647（首关键帧 66ms、起点 0）**cut_mode_used=copy**，verification passed；
- 短片段保护：终点早于首关键帧 → precise，verification passed；
- 普通 copy：20260507_C0481 0~5000ms → copy，verification passed；
- 0.18.22 功能回归通过。

## 已知问题

- 未做代码签名；
- A+B 项目作用域、老师数据治理未实施。

## 回滚

重新安装 0.18.22 或 0.18.21 即可，用户数据保留。
