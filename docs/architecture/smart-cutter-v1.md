# 智能剪辑端 v1 实施与验收

2026-10-07。依据已接受的 v0.3 原型：管理端、剪辑端、智能剪辑端并存；Windows Tauri + React + 本机引擎，原声优先。实现位置是独立 worktree，基线 e6ca8a4，原 checkout 的三处改动不改写。

## 边界

- 新包 smart-cutter，新应用 smart-cutter-web / smart-cutter-desktop。现有业务端无行为变更，不部署 NAS、不替换稳定版。
- 开发本机 API 3792、UI 5178；桌面宿主分配空闲本机端口并传递临时连接令牌。仅绑定 loopback。独立配置、SQLite 状态、缓存、任务与输出目录。
- 公共发布快照只读，复制到智能端本机缓存。项目保存快照及真实来源时间，不能编造片段或用目标字幕冒充实际原声。
- 凭据由本机后端保存；设置 GET 只返回配置状态，Key 不进入 localStorage、URL、日志、成片或诊断包。Windows 使用当前用户 DPAPI 保护。
- 手动输入和手动热点导入属于手动；规则触发属于自动。人工处理不改写原始来源。
- 未配置账号/Key/素材库显示空或未配置状态。正式路径没有原型假数据。

## 实施门槛

- [x] 数据与设置：持久化、凭据脱敏、工作区保护、平台配置。
- [x] 素材：已发布快照、本机查询、真实候选、缺句/近似审核、版本隔离。
- [x] 媒体：本机剪切/合并、原声字幕、主体构图与手动覆盖、真实 MP4 校验。
- [x] TikHub：账号解析、作品采集、游标与去重、热度快照、下载及口播转写。接口已按官方契约实现；真实账号联调待用户在设置填写 Key。
- [x] 自动：规则周期、预算、去重、人工审核或达标执行、离线/异常可见。去重和增长证据门槛已通过受控接口测试。
- [x] UI：还原双模式工作台和来源标识，所有主要操作连接实际后端。
- [ ] 桌面：独立宿主、sidecar、资源、安装标识与退出恢复。
- [ ] 验证：边界/幂等/凭据测试、真实 FFmpeg 媒体测试、浏览器体验、Windows 构建/运行证据。

## 运行与测试

`npm ci` 后执行 `npm run prepare:smart-cutter-runtime`，再运行 `npm run server:smart-cutter` 和 `npm run dev:smart-cutter-web`。正式桌面要求管理端已审核账号。开发验证可以显式设置 `MIXLAB_SMART_AUTH_MODE=local_trusted`，只应指向隔离验收目录。

Windows 构建机需 Node 24、Python 3.12、Rust/MSVC。`npm run package:smart-cutter:windows` 准备独立 Node、FFmpeg、嵌入式 Python、中文检索模型、人物检测模型、中文字体，并生成独立 NSIS 安装包及 SHA256 清单。手动 CI 工作流为 `.github/workflows/smart-cutter-windows.yml`，不会自动部署 NAS 或替换旧 Cutter。

本轮本机已通过 13 项测试、TypeScript 检查、三个 Web 构建及 Tauri 宿主编译。测试覆盖真实 FFmpeg 成片、原声字幕、发布库不写入、凭据加密、请求配额、素材候选保护、自动与手动来源、规则幂等、增长证据、实际 BGE/YuNet 模型、构图挂起与继续、暂停后重启及检查点复用、ASR 任务复用及结果未知时停止重提。测试音频是合成音调，不能据此声称真实口播质量或 ASR 准确率已验收。

首期实现本机采集与本机剪辑；应用关闭后不会继续采集。团队常开采集节点与跨电脑统一去重需要根据使用方式确定，不在本轮部署到生产环境。

## 已核实外部接口

官方文档 https://docs.tikhub.io/ ，OpenAPI https://api.tikhub.io/openapi.json 。抖音首选 `/api/v1/douyin/app/v3/fetch_user_post_videos`，Bearer 凭据、sec_user_id、max_cursor、count<=20、sort_type、channel。详情 `/api/v1/douyin/app/v3/fetch_one_video`。账号解析按官方 sec_user_id/主页接口，不把昵称当 ID。

TikHub 作品标题是描述字段，不能当作视频口播文案。提取实际声音复用 DashScope ASR，独立配置其 Key；下载、转写、重试有检查点，避免重复付费。真实第三方联调需用户在设置填写凭据，本轮不得使用演示 Key 调用真实收费接口。

模型来自 OpenCV YuNet 和中文 BGE 官方/公开模型仓库，分析产物留在本机派生区。检测歧义、关键缺句或未确认近似内容进入待审核。构图无法安全判断时不自动输出错误的竖屏成片。

自动规则的每日上限统计候选处理尝试（包含失败），在下载和转写之前持久化扣减；手动重试不改写作品的原始来源。抖音详情同时支持官方单对象与数组返回结构，返回作品 ID 不一致时不下载。
