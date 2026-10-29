# MixLab Cutter 0.18.13 热修发布记录

- 发布日期：2026-10-29（UTC+8）
- 版本：**0.18.13**
- 构建提交：`4ef5bca`（hotfix/0.18.13，含 usage worker 隔离/预取统计/缓存/背压修复）
- 安装包：`MixLab Cutter_0.18.13_x64-setup-4ef5bca.exe`
- 大小：58,992,945 bytes
- sha256：`7e1076b973c61ed8c88e55c399f4a4cd728505a1d32c4b20788413ae0268c748`

## 发布位置

- NAS：`\\192.168.1.27\MixLab\安装包\MixLab Cutter\0.18.13\`
- Mac SMB：`smb://192.168.1.27/MixLab/安装包/MixLab Cutter/0.18.13/`
- Mac 共享：`\\192.168.1.21\“华启航”的公共文件夹\MixLabWindowsBuilds\`
- 0.18.12 保留回滚；旧候选 8451d00/571a1f2 已移入 `_stale-candidates`。

## 修复内容

1. **usage analytics 移出 sidecar 事件循环**：独立 worker 进程，主进程只入有界队列（1000）不 await；worker 崩溃指数退避；关闭 best-effort flush ≤2s；明确为“允许丢失的异步统计”。
2. **预取统计口径**：detail 预取 `?prefetch=1` 不记 view；缓存点击走 `POST /cutter/source-videos/:id/view`；同用户+素材 30s 去重。
3. **worker 背压修复**：stdin.write 返回 false 时数据已接收，改为成功即出队，避免 drain 后重复发送。
4. **detail 缓存**：服务端 TTL 300s + LRU 200 + release 版本 key；客户端 library key。
5. **切换 UX**：点击立即 loading、旧内容不冒充新选中、loading 期间拦截旧素材操作、前 N 候选预取、客户端 LRU。
6. **可观测性**：detail per-stage 慢日志；/health 与 runtime-status 暴露 usage worker queued/sent/dropped/failed/spawn_failures/worker_alive。

## 真实验收（Windows 安装版）

- 构建源 `origin/hotfix/0.18.13 @ 4ef5bca`，sha256 已核对。
- 0.18.12→0.18.13 覆盖升级 PASS（版本/FileVersion=0.18.13、config 保留、退出回收 0）。
- 真实 NAS 大库 20 次切换：p50=105ms、p95=110ms、max=118ms；12s revisit=93ms；/health 最大 15ms。
- 预取 view=0；缓存点击 view=1；30s 重复查看 0；worker sent=11、dropped=0、新增 usage event_id 无重复。
- >500 段素材：V010462 3109 段 PASS；V000786 485 段回归 PASS。
- 证据：`C:\dev\mixlab-verify-01813\accept-4ef5bca.json`、`release-0.18.13-4ef5bca.json`、`C:\dev\logs\01813-accept-4ef5bca2.log`。

## 已知限制 / 后续

- usage 为 best-effort：强制 kill 时未发送队列可能丢失；正常负载 dropped=0。
- 客户端 detail 缓存目前绑定 library_id、无 TTL；服务端 release-aware；客户端缓存长期一致性列入 0.18.13.1 评估。
- Windows 完整 npm test 中 scripts/acceptance/* 存在环境类失败（main 基线同类），非本分支引入。
- 未做代码签名；首启需 UTF-8 无 BOM config；卸载保留 AppData（设计）。

## 回滚

重新安装 0.18.12 安装包即可，用户数据保留。
