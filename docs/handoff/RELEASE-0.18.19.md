# MixLab Cutter 0.18.19 发布记录

- 发布日期：2026-10-30（UTC+8）
- 版本：0.18.19
- 构建提交：4cf5aab（hotfix/0.18.19，项目封面本地化）
- 安装包：MixLab Cutter_0.18.19_x64-setup-4cf5aab.exe
- 大小：58994379 bytes
- sha256：d9b020911af882a9e540858e9d6f63d3213e0950179b0b75d32f5be73de57f6b

## 发布位置

- NAS：\\\\192.168.1.27\\MixLab\\安装包\\MixLab Cutter\\0.18.19\\
- Mac SMB：smb://192.168.1.27/MixLab/安装包/MixLab Cutter/0.18.19/
- Mac 共享：\\\\192.168.1.21\\“华启航”的公共文件夹\\MixLabWindowsBuilds\\
- 0.18.13~0.18.18 保留回滚。

## 主要内容

1. 新增 GET /cutter/projects/<id>/cover 本地项目封面端点；
2. 项目封面优先从本地 workspace/projects/<id>/cover.jpg 返回；
3. 项目状态新增 cover_local_url；新建项目首剪写入本地封面；
4. 旧项目懒迁移；封面独立于普通缩略图 LRU；Cache-Control 1 天；
5. 修复首页最近项目封面需要从 NAS 源素材缓存加载的慢问题。

## 真实验收

- 0.18.18→0.18.19 升级 PASS；设置页 v0.18.19；
- 首页冷/热 1536/1440 封面均走本地端点；拦截全部源素材封面请求后仍显示；
- 新建项目首剪封面落盘 42307B，状态写入本地 URL；
- 快速 copy：C0481 copy，cut_media 5041ms，verification passed；
- 证据：C:\\dev\\mixlab-verify-01819、01819-evidence.zip。

## 已知限制

- 旧项目首次迁移仍可能触发一次本地封面生成；
- Batch B/C（本地素材/公共素材库/素材详情/缓存/设置）未实施；
- 未做代码签名。

## 回滚

重新安装 0.18.18 或 0.18.17 即可，用户数据保留。
