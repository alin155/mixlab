# M19 Runtime Foundation v1 验收报告

更新时间：2026-06-23 UTC

## 目标

本批次目标是让剪辑端运行时从“页面、搜索、缓存、剪切队列互相牵制”收敛为可验证的稳定架构：页面读取轻量分页，搜索首屏快速可操作，候选素材切换不触发全局重载，剪切任务由唯一队列顺序执行，剪切期间页面/API 仍可响应。

本报告的硬指标来自用户确认的 M19 目标，必须同时覆盖本机 Web 剪辑端和 Windows 桌面剪辑端。

## 代码与安装包

- Commit：`feacafc835851052a34ec8cae896516433049132`
- Commit short：`feacafc`
- 变更摘要：当 NAS/公共原始路径不可用，或 searchd detail 的 `file_size` 为未知/0 时，剪辑端可使用本机 source video cache；缩略图在原路径不可用时可使用本机 thumbnail cache；避免因为原始路径缺失导致剪切或封面读取失败。
- GitHub Windows workflow run：`27990697040`
- Windows installer：`/Users/huaqihang/Public/MixLabWindowsBuilds/MixLab Cutter_0.18.10_x64-setup-feacafc.exe`
- SHA-256：`f08c03815a845f0894274eee5cecb2c941f834f0842d23c30a84f68534c2c6bf`

## 本机 Web 验收

报告：`docs/acceptance/artifacts/m19-runtime-foundation-local-web-current.json`

- 状态：`passed`
- API：`http://127.0.0.1:4789`
- Web：`http://127.0.0.1:5877`
- 公共素材规模：`10471`
- 公共素材首屏：`20 / 10471`，`8ms`
- 搜索首屏：`91ms`，返回 `10` 组，`next_cursor=searchd:10`
- 缓存后返回旧内容：首页 `13ms`、本地素材 `10ms`、公共素材 `12ms`
- 可见刷新：首页 `2ms`、本地素材 `4ms`、公共素材 `2ms`
- 快速切换 30 次 tab：`max=55ms`，`p95=42ms`，source-library 请求 limit 全部为 `20`
- 快速候选切换：点击 `5` 个候选，文案 ready
- 连续剪切：提交 `5` 条任务，`submit=6ms`，全部 `done`，`poll=2017ms`
- 剪切期间响应：source-library `1ms`、search `23ms`、cut-jobs `2ms`

## Windows 桌面验收

安装验收报告：`/Users/huaqihang/Public/MixLabWindowsBuilds/reports/install_latest_and_smoke-20260623T033132Z-8d03581d/report.json`

- 状态：`passed`
- Runner 主入口：`0.1.32` on `192.168.1.20:3799`
- 安装包 SHA 校验：一致
- 安装退出码：`0`
- 安装耗时：`7053ms`
- 认证模式：`reviewed`，`local_trusted=false`
- 公共素材库：`10471` 条

M19 验收报告：`/Users/huaqihang/Public/MixLabWindowsBuilds/reports/m19_runtime_foundation-20260623T035006Z-8dad91a6/report.json`

仓库归档：`docs/acceptance/artifacts/m19-runtime-foundation-windows-feacafc.json`

- 状态：`passed`
- M19 Runner：`0.1.33`，通过主 Runner `launch_runner-20260623T035003Z-1be4e50c` 启动到备用端口 `49334`
- runtime：`280ms`，公共素材 `10471`，release cache ready，search backend `searchd`
- 公共素材首屏：`20 / 10471`，`4ms`
- 公共素材默认请求：`20 / 10471`，`4ms`，证明不会后台自动拉完整库
- 缓存后返回：首页/任务 `3ms`，本地素材 `8ms`，公共素材 `2ms`
- 快速切换 30 次：`max=23ms`，`p95=16ms`，无全屏加载失败、无卡死
- 搜索首屏：`24ms`，返回 `10` 组，`next_cursor=searchd:10`
- 快速候选切换：`5 / 5` 完成，完整文案详情分别 `14ms / 20ms / 28ms / 19ms / 26ms`
- 连续剪切：提交 `5` 条任务，`submit=23ms`，`CJ20260623-0001` 到 `CJ20260623-0005` 全部 `done`，`poll=4074ms`
- 剪切期间响应：source-library `3ms`、search `12ms`、cut-jobs `5ms`

桌面截图验收报告：`/Users/huaqihang/Public/MixLabWindowsBuilds/reports/desktop_ui_screenshot_smoke-20260623T043408Z-a4ea294d/report.json`

- 状态：`passed`
- 页面截图：`8 / 8` 通过
- 覆盖页面：project-home、material-locator、cut-tasks、local-library、public-library、source-detail、cache-management、settings
- 结论：Windows 桌面端关键页面没有全屏加载失败或启动弹窗遮挡。

## 硬指标逐项结论

| 硬指标 | 本机 Web | Windows 桌面 | 结论 |
| --- | --- | --- | --- |
| 首页、本地素材库、公共素材库缓存后 200ms 内显示旧内容，1s 内刷新 | 10-13ms 显示，2-4ms 刷新 | 2-8ms API 读取 | 通过 |
| 快速连续切换 30 次 tab，无全屏加载失败、无页面卡死 | max 55ms / p95 42ms | max 23ms / p95 16ms | 通过 |
| 公共素材 1 万级数据首屏只加载第一页，不后台自动拉完整库 | limit 全部为 20 | 默认/显式请求均 20 / 10471 | 通过 |
| 搜索关键词首屏 1 秒内可操作，后续分页手动加载 | 91ms，next_cursor 存在 | 24ms，next_cursor 存在 | 通过 |
| 快速点击不同候选素材，文案、视频、选区状态不卡住或错乱 | 5 个候选文案 ready | 5 / 5 完整详情 14-28ms | 通过 |
| 连续提交 5-10 条不同视频剪切，全部进入队列，按顺序执行，UI 不报 Internal server error | 5 条全部 done | 5 条全部 done | 通过 |
| 剪切执行期间仍可切换页面、搜索、查看任务 | 1ms / 23ms / 2ms | 3ms / 12ms / 5ms | 通过 |
| Windows 端和本机 Web 端通过同一套验收脚本与日志报告 | `scripts/smoke/m19-runtime-foundation.ts` | Runner `m19_runtime_foundation` | 通过 |

## 观察与后续

- 主 Windows Runner `3799` 仍是 `0.1.32`，不内置 M19 suite；本次通过共享 Runner `0.1.33` 的 startup-run 机制完成 M19。后续可以把主 Runner 升级到 `0.1.33`，减少备用端口步骤。
- Windows 安装验收第一次未带 reviewed auth credentials，失败原因是测试请求缺认证参数，不是产品运行时失败；第二次带正式认证参数后通过。
- 当前验收证明运行时硬指标达标。后续如果继续优化，应优先进入 UI polish 或正式发布边界评估，而不是继续围绕卡慢主链路打补丁。
