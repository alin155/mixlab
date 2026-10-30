# MixLab Cutter 0.18.17 发布记录

- 发布日期：2026-10-30（UTC+8）
- 版本：0.18.17
- 构建提交：a97f0c3（hotfix/0.18.17，基于 main 4594991，含首页 v3 + 左侧栏残留提示最终版）
- 安装包：MixLab Cutter_0.18.17_x64-setup-a97f0c3.exe
- 大小：58997340 bytes
- sha256：f1122879784eca54cf427aa60b56e609b7dc8097f578b93dd58a76acc828356f

## 发布位置

- NAS：\\\\192.168.1.27\\MixLab\\安装包\\MixLab Cutter\\0.18.17\\
- Mac SMB：smb://192.168.1.27/MixLab/安装包/MixLab Cutter/0.18.17/
- Mac 共享：\\\\192.168.1.21\\“华启航”的公共文件夹\\MixLabWindowsBuilds\\
- 0.18.13~0.18.16 保留回滚。

## 主要内容

1. 首页 v3 极简工作台：命令栏 + 最近项目 4 卡 + 最近剪切表格，删除 Hero/快速开始；
2. 项目卡操作收进 ⋯ 菜单；
3. 左侧栏“临时残留 N”入口 + 右侧小清理面板：去清理/关闭/稍后，localStorage 记忆，不占主内容布局；
4. 保留现有项目切换、搜索、剪切、目录打开等业务功能。

## 真实验收

- 0.18.16→0.18.17 覆盖升级 PASS；DisplayVersion/FileVersion=0.18.17；设置页 v0.18.17；
- 首页 1536/1440 无横向滚动，主内容 clientHeight=scrollHeight，标题不位移；
- 左侧栏入口 + 右侧面板 rect x=242/宽 260；关闭/稍后/刷新验证通过；
- 快速 copy：C0481 copy，cut_media 5038ms，verification passed；
- 证据：C:\\dev\\mixlab-verify-01817-final、C:\\dev\\home-v3-01817-final-verify、01817-final-evidence.zip。

## 已知限制 / 后续

- 素材搜索/剪切任务/本地素材/公共素材库/素材详情/缓存/设置的全页面极简重做尚未实施；已确认方向，按 Batch A/B/C 推进。
- 全站 A+B 项目作用域、极速溢出模式仍未实施。
- 未做代码签名。

## 回滚

重新安装 0.18.16 或 0.18.15 即可，用户数据保留。
