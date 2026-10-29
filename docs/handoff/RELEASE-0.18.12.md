# MixLab Cutter 0.18.12 热修发布记录

- 发布日期：2026-10-29（UTC+8）
- 版本：**0.18.12**
- 构建提交：`97d92ec`（hotfix/0.18.12-readygate；产品代码与最终 hotfix b41ff84 一致，b41ff84 仅测试断言对齐）
- 安装包：`MixLab Cutter_0.18.12_x64-setup-97d92ec.exe`
- 大小：58,998,092 bytes
- sha256：`17947bee7fc17973625d06752567c8e7b1a8b5d9c98424789da1f99b46a2cc16`

## 发布位置

- NAS：`\\192.168.1.27\MixLab\安装包\MixLab Cutter\0.18.12\`
- Mac SMB：`smb://192.168.1.27/MixLab/安装包/MixLab Cutter/0.18.12/`
- Mac 共享：`\\192.168.1.21\“华启航”的公共文件夹\MixLabWindowsBuilds\`
- LATEST 指针已更新到 0.18.12；0.18.11 包保留用于回滚。

## 修复内容

1. **searchd 持久缓存构建（Windows os error 5）**：rename 重试 → 目录复制 → 直接构建三级兜底；启动清理 stale `.building-*`；不再反复回退内存索引。
2. **cutter-api 搜索超时/重试**：searchd 首屏超时 1500ms → 默认 10s、首屏预算 18s、warming/超时重试 8 次递增退避；预算耗尽才回退 SQLite；回退信息附加原因/尝试次数。
3. **搜索 UX**：总超时 12s→30s；显示“搜索索引预热中（首次可能较慢）”；回退提示保留。
4. **桌面 ready 门控**：`ensure_searchd_started` 严格轮询 `/health` 直到 `data.ready===true`（预热期 200 不再视为就绪），超时 120s，日志记录 warming 进度；就绪后才启动 sidecar/engine。
5. 新增 Rust/JS 测试；Mac 全量 2231/2231 PASS；Windows cargo 8/8。

## 验收证据（Windows 实测）

- 真实 NAS 大库（12,869 源视频 / 1,313,455 段），删除 tantivy 缓存模拟全新首启：
  - 启动页等待 searchd 预热 25.6s → ready，进入工作台 28.4s（含 NAS SMB 冷握手）；
  - 首搜 `search_mode=searchd`、8ms、**无回退**；翻页 searchd 17ms；连续切换 10 个素材正常；
  - `tantivy/v012758` 生成、`.building-*` =0、无 `mixlab_searchd_persistent_cache_failed`；
  - 0.18.11→0.18.12 升级 PASS（DisplayVersion/exe=0.18.12、config 保留、退出回收）；
  - 证据：`C:\dev\mixlab-verify-01812\e2e-0.18.12-readygate.json`、截图、`C:\dev\logs\e2e-01812-readygate.log`。

## 已知问题 / 后续

- **NAS SMB 冷握手 40-60s**（首次读 60.9s、之后 0ms）：目前 ready 门控避免其导致搜索回退；0.18.13 计划给 bootstrap NAS 请求加超时/可取消 + UI 进度。
- 冷缓存 E2E 后首次 close 观察到 1 个 sidecar 残留（清理后正常关闭均全回收），记为观察项。
- 未做代码签名；首启需 UTF-8 无 BOM config；卸载保留 AppData（设计）。

## 回滚

重新安装 0.18.11 安装包即可（保留在 NAS/Mac 共享），用户数据保留。
