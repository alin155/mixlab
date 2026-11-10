# MixLab Cutter 修复工具 1.2：智能修复 + 专家升级

- 目标版本：修复工具 1.2.0，随 Cutter 0.18.31 内置发布
- 背景：v1.1 只能重启引擎 + 生成诊断包；遇到无法自助解决的问题，仍需剪辑师手动找管理员。
- 目标：先做安全的自动诊断/修复；解决不了就自动生成专家介入请求，不需要用户发文件。

## 1. 总体流程

一键修复改为分阶段状态机：

环境检查 -> 分类故障 -> 执行安全修复（有限次数） -> 复检健康 -> 已恢复则完成；未恢复则自动提交专家请求。

所有操作记录到 diagnostics.txt 和工具操作日志；不删除用户数据。

## 2. 诊断分类

至少识别：

- engine_unreachable：Cutter 进程/API 3789 不通；
- port_occupied：3789/3790 被占用；
- sidecar_missing / sidecar_spawn_failed；
- searchd_unhealthy：3790 不通；
- workspace_lease_unavailable：.mixlab-workspace-lock.json/fallback 租约占用或 stale；
- workspace_root_invalid：工作区缺失/不可写/盘符根旧版本问题；
- config_invalid：桌面配置缺失/JSON 损坏；
- app_missing：找不到 Cutter 可执行文件；
- unknown：日志/健康均无法归类。

分类依据：进程/端口/health；日志关键字（workspace_lease、EPERM、spawn_failed、searchd、config、ENOENT）；Cutter 版本、workspace、配置；前一次尝试结果。

## 3. 安全修复矩阵

按顺序执行，每步有前置条件、超时、回检。

### 3.1 engine_unreachable

1. 保留日志；
2. 只结束 MixLab Cutter/sidecar/searchd；
3. 等端口释放；
4. 启动 Cutter；
5. 最长 60 秒等 3789 + 3790 health；
6. 失败最多重试 1 次；仍失败进入专家升级。

### 3.2 port_occupied

- 读取端口 PID/进程名；
- 如果是 MixLab 已知进程：结束并重试；
- 如果是未知进程：不结束、标记 needs_admin=true、提交专家请求。

### 3.3 stale workspace lease

- 读取 workspace 根锁和 fallback 锁；
- 判断 stale：同机 PID 已退出或心跳超时；
- 只在确认 stale 且没有活跃 Cutter 进程时，备份并移除 stale 锁；
- 非 stale：不删，标记占用并升级。

### 3.4 searchd_unhealthy

- 只重启 searchd；
- 等 3790 health；
- 失败升级；不自动删除搜索缓存，避免重扫大库。

### 3.5 config_invalid

- 读取配置并校验关键字段；
- 只做安全修复：可确定格式问题可纠正；不自动重置公共库/本地素材路径；
- 无法安全修复时升级。

### 3.6 workspace_root_invalid

- 检查目录存在、可写、不是错误根目录；
- 当前版本低于 0.18.29 且日志命中盘符根 workspace 已知缺陷：提示升级，不改用户路径；
- 其他情况升级。

### 3.7 app_missing

- 从注册表/常见路径查找；
- 找到则启动；找不到则提示管理员并升级。

### 3.8 unknown

- 不做破坏性操作；
- 收集完整诊断并升级。

## 4. 专家介入请求

修复失败或 needs_admin=true 时，自动提交到现有反馈收件箱：

  \\192.168.1.27\MixLab\CutterFeedback\inbox\FB-YYYYMMDD-XXXXXXXX\

包结构复用 Cutter 反馈包，新增字段：

- source: repair-tool
- tool_version: 1.2.0
- needs_admin: true
- case_id: FB-...
- diagnosis: workspace_lease_unavailable
- repair_attempts: 动作列表（action/ok/error）
- message: 自动修复失败，需要管理员介入
- context: cutter_version/workspace/health 等

要求：

- 原子写入：本地 pending -> NAS .partial -> rename；
- 唯一 ID，不覆盖；
- NAS 不可用时本地 pending，启动/每 5 分钟/网络恢复自动重试；
- 同一 case 不重复提交；
- 界面显示：已提交专家介入，编号 FB-...，无需手动发送。

## 5. 给 Mac 的通知

Mac 侧 feedback-watch 读取包后：

- summary 增加来源 repair-tool、是否需要管理员、诊断分类、已尝试修复动作、关键错误；
- DSH 定时反馈检查对 needs_admin=true 优先提示用户；
- 不额外改造 Windows-Mac 邮件链路。

## 6. UI

主窗口保持简单：

- 一键修复（主按钮）
- 只导出诊断包
- 回退到 0.18.27

修复过程显示当前阶段和结果；失败弹窗只显示编号、已提交/已保存本地、不需要手动发送。

## 7. 安全边界

- 不删除素材、项目、缓存；
- 不自动重置用户路径；
- 不自动结束未知进程；
- 不自动删除搜索缓存；
- 不执行任意命令；
- 日志/配置敏感字段脱敏；
- 所有修复动作可审计。

## 8. 测试

至少覆盖：

1. engine_unreachable：结束/重启/health 恢复；
2. 端口被未知进程占用：不杀未知进程，needs_admin=true；
3. stale lease：确认 stale 后清理并恢复；
4. active lease：不清理，升级；
5. searchd 挂：重启成功；失败升级；
6. config 损坏/路径无效：安全升级，不重置；
7. 专家请求在线提交、离线 pending、恢复重试、不重复；
8. Mac feedback-watch summary 含 needs_admin/诊断/尝试；
9. Windows 真机模拟 3 类故障，分别显示已修复/已提交专家；
10. 随 0.18.31 内置打包，从 Cutter 恢复入口启动。

## 9. 交付

- 修复工具 1.2.0 源码/构建；
- 打包进 Cutter 0.18.31 安装包；
- 更新 README；
- 回复 commit、installer sha256/size、测试日志、真机截图；
- 不直接改 NAS LATEST。
