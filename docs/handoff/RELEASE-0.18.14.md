# MixLab Cutter 0.18.14 热修发布记录

- 发布日期：2026-10-29（UTC+8）
- 版本：0.18.14
- 构建提交：6569ecb（hotfix/0.18.14，基于 main 269d996 + keyframe/队列/任务目录修复）
- 安装包：MixLab Cutter_0.18.14_x64-setup-6569ecb.exe
- 大小：59005370 bytes
- sha256：64c5652fd85f996d7f2637256c5a99321294c615ca18b8f003a504e41606e312

## 发布位置

- NAS：\\\\192.168.1.27\\MixLab\\安装包\\MixLab Cutter\\0.18.14\\
- Mac SMB：smb://192.168.1.27/MixLab/安装包/MixLab Cutter/0.18.14/
- Mac 共享：\\\\192.168.1.21\\“华启航”的公共文件夹\\MixLabWindowsBuilds\\
- 0.18.13 保留回滚。

## 修复内容

1. 真实关键帧解析修复：Windows ffprobe 输出兼容 best_effort_timestamp_time / pkt_pts_time / pts_time；不再因空解析把全部 copy 误降 precise；探针超时 5s→15s。
2. 极速剪切恢复：真实 NAS 6 案例全部 copy，cut_media 2.6~6.3s；修复前同类任务 60~139s。
3. 队列位置/ETA：任务列表显示第 N 位/前面 M 个/预计等待；当前项目与全部项目口径分离。
4. 任务精确目录：任务详情“打开任务目录”调用 explorer /select 精确文件，新增 additive API + desktop command。
5. 版本测试对齐/worker 测试稳定化：Mac 全量 2238/2238 PASS。

## 真实验收（Windows 安装版）

- 构建源 hotfix/0.18.14 @ 6569ecb，sha256 已核对。
- 0.18.13→0.18.14 覆盖升级 PASS（版本/FileVersion=0.18.14、config 保留、退出回收 0）。
- 6/6 copy：V000786 5.6s、V012265 6.2s、V006996 3.2s、V001164 2.6s、V010270 5.7s、V010589 3.2s（cut_media）。
- 溢出 185~841ms；全部 verification.passed=true。
- 队列 ETA 实测；任务目录 host 日志 open_file_location_requested+spawned。
- 证据：C:\\dev\\mixlab-verify-01814\\01814-clean-copy-e2e.json、upgrade-01814.json、C:\\dev\\logs\\01814-clean-e2e.log。

## 已知限制 / 后续

- 极速溢出模式（默认 fast + 一键改精剪）尚未实现；当前 copy 只走 500ms 阈值内。
- 旧版 Windows UI 仍有顶部提示条裁切、悬浮剪切按钮定位错误等；UI 重排进行中，不阻塞本版。
- 125%/150% 真机 DPI 基线待补；当前只有 100% 真实 + CSS 视口模拟。
- 未做代码签名；首启需 UTF-8 无 BOM config；卸载保留 AppData。
- Windows 完整 npm test 的 scripts/acceptance/* 环境类失败与 main 基线同类。

## 回滚

重新安装 0.18.13 安装包即可，用户数据保留。
