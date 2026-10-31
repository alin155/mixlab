# MixLab Cutter 0.18.24 发布记录

- 发布日期：2026-10-31（UTC-7）
- 版本：0.18.24
- 构建提交：eb63850（hotfix/0.18.24）
- 安装包：MixLab Cutter_0.18.24_x64-setup-eb63850.exe
- 大小：58998143 bytes
- sha256：ab55d1cc7a7d26f9e73d6e29b842677ecb136b001296edfb8649364baa2313de

## 发布位置

- NAS：\\\\192.168.1.27\\MixLab\\安装包\\MixLab Cutter\\0.18.24\\
- Mac SMB：smb://192.168.1.27/MixLab/安装包/MixLab Cutter/0.18.24/
- Mac 共享：\\\\192.168.1.21\\“华启航”的公共文件夹\\MixLabWindowsBuilds\\
- 0.18.11~0.18.23 保留回滚。

## 主要内容

1. 删除页面标题后修复头部布局占位，8 页顶部空白收敛；
2. 素材搜索右栏恢复单栏连续预览，取消三 tabs；
3. 本地素材/剪切任务“加载更多”按当前项目/筛选计数，修复 104/107、2/112；
4. 设置页默认剪切模式选中态对比度修复；
5. 侧栏素材库只显示公共素材：12,869 条 / 约 28.1 TB，容量来自 catalog file_size；
6. 8 页全控件视觉审查：低对比度 0、截断 0、小控件 0、横向滚动 0；
7. 公共库切换 v012759：lecturer/file_size 已回填，陶矜 10,964 / 王牧笛 1,478 / 陈永亮 427。

## 数据侧

- v012759 current release；file_size 总和 28,139.6 GB；
- 管理端 index-first 发布 bug 已在共享包修复（dev/admin a3a2865），避免后续 release 再次清零 lecturer/file_size；
- Cutter 最小版本 0.18.0。

## 真实验收

- 0.18.23→0.18.24 升级 PASS；设置页 v0.18.24；
- 8 页 1536/1440：top_gap≤16、无横向滚动、控件审查通过；
- 老师计数 10964/1478/427，空值 0；
- quick copy CL20261031-0007：copy，verification passed。

## 已知问题

- 未做代码签名；
- 管理端 MIXLAB_ADMIN_RELEASE_MIN_CLIENT_VERSION 仍需固定为 0.18.0；
- A+B 项目作用域未实施。

## 回滚

重新安装 0.18.23 或 0.18.22 即可，用户数据保留。
