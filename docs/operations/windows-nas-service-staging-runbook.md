# Windows / NAS Staging 验收 Runbook — 身份/事件服务 v1 + 发布 v2（Round5 起草）

> 状态：**Round5 起草，未在真实目标机演练**。所有步骤先在隔离 staging（合成素材 + 临时库）执行；禁止在真实公共库上演练迁移/回滚。
> 配套文档：`docs/operations/account-service-v1.md`（账号服务权威/迁移/回滚）、`docs/operations/usage-service-v1.md`（事件服务/outbox/维护）、`docs/operations/rollback-runbook.md`（总回滚决策）、`docs/operations/mixlab-environment-registry.md`（机器/端口约定）。
> 配套验收脚本：`scripts/acceptance/service-mode-matrix.ts`（flag off/on 矩阵，本 runbook §2 引用其输出）。
> 前置门禁：Round1-4 Gate 全绿（admin 2042 / cutter 1943 / smart 1918），三仓 typecheck 0 error。

## 0. 拓扑与命名（staging）

| 组件 | 位置 | 监听 | 状态目录（必须本机磁盘） |
|---|---|---|---|
| admin-api | Windows staging 机 | 127.0.0.1:3889（环境约定） | `%LOCALAPPDATA%\MixLab\admin` 或 `C:\MixLab\state\admin` |
| 账号服务 v1 | 同机独立进程 | 127.0.0.1:3891 | `C:\MixLab\state\accounts`（**非** SMB/NAS） |
| 事件（usage）服务 v1 | 同机独立进程 | 127.0.0.1:3892 | `C:\MixLab\state\usage`（**非** SMB/NAS） |
| cutter-api / 剪辑端 | staging 机 | 127.0.0.1:3789 | 本机工作区 |
| 智能剪辑端本机引擎 | staging 机 | 随机回环端口（Tauri 生成） | `%LOCALAPPDATA%\com.mixlab.smartcutter` |
| 公共素材库（只读） | NAS SMB | `\\<NAS>\MixLab\PublicLibrary` | 只读挂载给客户端 |
| Windows Test Runner | staging 机 | 127.0.0.1:3799 | `%LOCALAPPDATA%\MixLab\TestRunner` |

原则：**服务私有 SQLite 只放本机 NTFS/ext4/btrfs 本地盘；SMB/NAS 只放公共素材库（只读消费）与安装包/报告交换目录。**
所有服务只监听 127.0.0.1；跨机器访问只能通过受控 SSH/远程桌面隧道，不能把服务绑定 0.0.0.0。

## 1. 目标机前置检查（每条留证据）

```powershell
# 1.1 机器与磁盘
$env:COMPUTERNAME; [Environment]::OSVersion.VersionString
Get-Volume | Select-Object DriveLetter,FileSystem,SizeRemaining,Size | Format-Table
# 要求：服务 state 盘为本地 NTFS，剩余空间 >= 20 GB（事件库 + 账号备份 + 迁移临时）

# 1.2 Node/tsx 与 SQLite API 兼容（Node >= 22；Node 26 需确认候选已修复 DatabaseSync options 兼容）
node --version
node --import tsx -e "const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync(':memory:'); db.close(); console.log('sqlite-ok')"
# 期望输出 sqlite-ok；若报 ERR_INVALID_ARG_TYPE，停止，升级/回退 Node 或更新候选代码后重试

# 1.3 端口未被占用（服务端口 + Runner）
foreach ($p in 3889,3891,3892,3789,3799) {
  $r = Test-NetConnection -ComputerName 127.0.0.1 -Port $p -WarningAction SilentlyContinue
  "{0} -> {1}" -f $p, $r.TcpTestSucceeded
}

# 1.4 NAS 公共库可读（只读探测，不写）
# 凭据由 IT 在凭据管理器配置；不要在命令行回显密码
Test-Path '\\<NAS>\MixLab\PublicLibrary\.mixlab-library\current-release.json'
Get-Item '\\<NAS>\MixLab\PublicLibrary\.mixlab-library\current-release.json' | Select-Object FullName,Length,LastWriteTime
```

证据：命令输出文本 + 截图（端口/磁盘/版本），保存到 `<staging-evidence>\preflight\`。

## 2. 服务模式矩阵（flag off/legacy ↔ on/service）

在 admin 仓（staging 副本）执行；它进程内启动账号/事件服务（临时 loopback + 临时 state root），不接触 NAS/真实账号：

```bash
node --import tsx scripts/acceptance/service-mode-matrix.ts
# 期望：MATRIX_RESULT: PASS (19/19 checks passed, 0 failed)
```

覆盖：flag OFF 共享 users.json legacy 路径（admin/cutter/smart 客户端）；账号服务 register/login/validate/list/approve/disable、错 token、服务不可用 fail-closed；事件服务 outbox 投递/ACK、event_id 幂等、admin/client token 权限、离线保留、目标 store 身份变化 fail-closed、批次/载荷容量。
证据：完整 stdout（PASS/FAIL 表）+ exit code；建议同时在 staging 机 PowerShell 里执行同一命令并归档输出。

## 3. 服务安装（Windows 常驻）

### 3.1 目录与 ACL

```powershell
$svc = 'C:\MixLab\state'
New-Item -ItemType Directory -Force -Path "$svc\accounts","$svc\usage","C:\MixLab\logs" | Out-Null
# 仅本机服务账号 + Administrators 可读写；Public 无权限；共享/SMB 上不得创建 state 目录
icacls $svc /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F" "MixLabSvc:(OI)(CI)F"
```

### 3.2 Token（不要写入共享目录/文档/日志）

- 账号服务：`MIXLAB_CUTTER_ACCOUNTS_SERVICE_TOKEN`（client）与 `MIXLAB_CUTTER_ACCOUNTS_SERVICE_ADMIN_TOKEN`（admin，推荐且必须不同）。缺 admin token 会进入单 token 兼容模式（client 拥有管理权限），staging 只允许临时使用并逐条记录。
- 事件服务：`MIXLAB_USAGE_SERVICE_TOKEN`（client）与 `MIXLAB_USAGE_SERVICE_ADMIN_TOKEN`（admin，必须不同、只给管理端）。
- 生成示例（PowerShell，仅本机）：

```powershell
$bytes = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

存放：Windows 凭据管理器或服务包装脚本读取的本机受保护环境变量（机器级）；禁止 commit、禁止放进共享目录、禁止出现在命令历史/日志。轮换：停服务→更新 token→重启调用方→旧 token 立即失效。

### 3.3 账号服务启动/守护

```powershell
# 前台验证（staging 先手动跑一次）
$env:MIXLAB_ACCOUNT_SERVICE_STATE_ROOT = 'C:\MixLab\state\accounts'
$env:MIXLAB_ACCOUNT_SERVICE_PORT = '3891'
$env:MIXLAB_CUTTER_ACCOUNTS_SERVICE_TOKEN = '<client-token>'
$env:MIXLAB_CUTTER_ACCOUNTS_SERVICE_ADMIN_TOKEN = '<admin-token>'
cd C:\MixLab\app
node --import tsx scripts/servers/cutter-account-service.ts
# 期望 stdout: {"event":"cutter_account_service_ready","url":"http://127.0.0.1:3891",...}

# 常驻：NSSM（推荐，自动重启 + 独立日志）
nssm install MixLabAccountService "C:\Program Files\nodejs\node.exe" "--import tsx C:\MixLab\app\scripts\servers\cutter-account-service.ts"
nssm set MixLabAccountService AppDirectory C:\MixLab\app
nssm set MixLabAccountService AppStdout C:\MixLab\logs\account-service.log
nssm set MixLabAccountService AppStderr C:\MixLab\logs\account-service.log
nssm set MixLabAccountService AppExit Default Restart
nssm set MixLabAccountService Start SERVICE_AUTO_START
nssm set MixLabAccountService AppEnvironmentExtra MIXLAB_ACCOUNT_SERVICE_STATE_ROOT=C:\MixLab\state\accounts MIXLAB_ACCOUNT_SERVICE_PORT=3891 MIXLAB_CUTTER_ACCOUNTS_SERVICE_TOKEN=<client-token> MIXLAB_CUTTER_ACCOUNTS_SERVICE_ADMIN_TOKEN=<admin-token>
nssm start MixLabAccountService
```

就绪检查（账号服务没有 /health 路由）：
```powershell
Test-NetConnection 127.0.0.1 -Port 3891 -InformationLevel Quiet   # True
Test-Path 'C:\MixLab\state\accounts\\.mixlab-library\\cutter-users\\service-owned.json'  # True
```

### 3.4 事件服务启动/守护

```powershell
$env:MIXLAB_USAGE_SERVICE_STATE_ROOT = 'C:\MixLab\state\usage'
$env:MIXLAB_USAGE_SERVICE_PORT = '3892'
$env:MIXLAB_USAGE_SERVICE_TOKEN = '<client-token>'
$env:MIXLAB_USAGE_SERVICE_ADMIN_TOKEN = '<admin-token>'
$env:MIXLAB_USAGE_SERVICE_RETENTION_DAYS = '180'
$env:MIXLAB_USAGE_SERVICE_MAX_EVENTS = '500000'
cd C:\MixLab\app
node --import tsx scripts/servers/usage-service.ts
# 期望：{"event":"usage_service_ready","url":"http://127.0.0.1:3892","store_id":"<uuid>"}

# 健康检查（公开、无路径）
curl.exe -s http://127.0.0.1:3892/health
# 期望：{"status":"ok","service":"mixlab-usage-service","store_id":"...","schema_version":"1.0","contract_version":"1.0"}
```

NSSM 配置同账号服务（服务名 `MixLabUsageService`，日志 `usage-service.log`，环境变量换成 usage 的五个）。

### 3.5 开机自启与依赖顺序

1. `MixLabAccountService`、`MixLabUsageService` 设为自动启动；
2. admin-api / cutter-api / 客户端后启动（通过 NSSM 依赖或启动脚本 sleep+健康检查）；
3. 客户端启动脚本先探测 `http://127.0.0.1:3891` TCP 与 `http://127.0.0.1:3892/health`，失败则保持 flag OFF 并在日志标记（不得阻塞桌面端主流程）。

### 3.6 SQLite 放哪：本机盘 vs SMB（硬性）

| 方案 | 是否允许 | 原因 |
|---|---|---|
| 服务 state（accounts/usage）在本机 NTFS 盘 | ✅ 唯一支持 | SQLite WAL/锁/fsync 依赖整机本机文件系统；单写者进程内事务 |
| 服务 state 放 SMB/CIFS 挂载（`\\NAS\...` 或 `Z:` 映射） | ❌ 禁止 | SMB 锁/rename/fsync 语义与本地不一致，WAL 不可靠；多机访问会破坏单实例假设 |
| 公共素材库在 NAS SMB 供客户端只读 | ✅ | 客户端只读消费；发布/迁移为 admin 侧本机操作 |
| NAS Docker 部署服务 | ✅ 但仅用 NAS **本地卷**（`/volume1/mixlab/...` ext4/btrfs），不要把 Docker volume 指到 CIFS 路径 | 同上，容器内 SQLite 必须落本地块设备 |
| 备份/证据目录在 SMB 共享 | ✅（只做只读交换） | 备份文件从本地盘复制到共享，不反向直接运行 |

> Windows 映射盘符（`Z:`）同样是网络共享，不能因为"看起来是盘符"而当成本机盘；服务启动时会校验 state root 为绝对路径，但不会自动识别映射盘，**必须人工确认**。

## 4. 迁移与 flag 切换（staging 演练）

### 4.1 停写者清单（逐项签字）

1. 所有剪辑端进程/后台队列（Windows/Mac，含旧版本，旧版本不识别新锁）；
2. admin-api / admin worker / docker worker loop；
3. cutter-api、智能剪辑端本机引擎、测试 Runner、自动化脚本；
4. 记录每台机器/版本；无法确认的机器按"仍在写"处理。

### 4.2 账号迁移（详见 account-service-v1.md）

```bash
# dry-run（只读，取 digest/blockers）
node --import tsx scripts/operations/cutter-account-migration.ts dry-run \\<NAS>\MixLab\PublicLibrary C:\MixLab\state\accounts
# 记录 source_digest；blockers 必须为空
# apply（要求停写声明）
node --import tsx scripts/operations/cutter-account-migration.ts apply \\<NAS>\MixLab\PublicLibrary C:\MixLab\state\accounts --legacy-writers-stopped
# 启动服务后验证：登录、validate/refresh、管理员 list/approve/disable、entitlements
# legacy 未变校验：再次 dry-run，digest 必须等于导入基线
```

### 4.3 事件迁移（详见 usage-service-v1.md）

```bash
node --import tsx scripts/operations/usage-service-migration.ts import \\<NAS>\MixLab\PublicLibrary C:\MixLab\state\usage --dry-run
node --import tsx scripts/operations/usage-service-migration.ts import \\<NAS>\MixLab\PublicLibrary C:\MixLab\state\usage --apply --legacy-writers-stopped --verify
# 期望 status: match 或 known-difference（附 missing_event_id_lines 计数）；mismatch 退出 1 时停止切换
```

### 4.4 flag 打开顺序（服务先、客户端后）

| 端 | 环境变量 | 打开后的关键验证 |
|---|---|---|
| admin-web/admin-api | `MIXLAB_CUTTER_ACCOUNTS_SERVICE_URL/TOKEN/ADMIN_TOKEN`；`MIXLAB_USAGE_SERVICE_URL` + `MIXLAB_USAGE_SERVICE_ADMIN_TOKEN` | 管理端登录、用户列表/审核/禁用、统计报表 |
| cutter（Windows 桌面/CLI） | `MIXLAB_CUTTER_ACCOUNTS_SERVICE_URL` + `MIXLAB_CUTTER_ACCOUNTS_SERVICE_TOKEN`；`MIXLAB_USAGE_SERVICE_URL` + `MIXLAB_USAGE_SERVICE_TOKEN` | 登录/会话续期/退出、统计事件投递（outbox pending→0） |
| smart（本机引擎） | `MIXLAB_SMART_ACCOUNTS_SERVICE_URL` + `MIXLAB_SMART_ACCOUNTS_SERVICE_TOKEN`（兼容 `MIXLAB_CUTTER_*` fallback） | 登录/validate/停用后 fail-closed；本地作品仍可见（服务不可用时降级横幅） |

注意：
- 智能端桌面启动器当前**尚未**注入 service env（Round1-4 禁止改 Rust）；staging 通过启动脚本/手动设置环境变量验证，正式发布前需 Lead 授权接线。
- 账号服务读路径仍有一行 index.ts 接线待完成（见 account-service-v1.md §6），未完成前不要把 flag 开给真实管理端列表读。
- flag 关闭 = 删除 URL 环境变量并重启对应进程（旧路径兼容，无需数据迁移）。

### 4.5 回滚（按 flag → 服务 → 数据顺序）

1. 关闭所有调用方 flag（客户端→admin→服务）；
2. 排空/确认 outbox：`usage-service-maintenance.ts status <state>`（pending 为 0 或已导出）；
3. 停服务（NSSM stop），等待退出（不要在运行中复制 state）；
4. 账号回滚：`cutter-account-migration.ts rollback <legacy> <state> --legacy-writers-stopped`（运行中/legacy digest 变化会拒绝）；保留 state 与 backups 证据；
5. 事件服务：flag 关闭即回旧 NDJSON 读路径；服务 state 保留，不删；
6. 发布指针回滚见 rollback-runbook.md；最后重新验证登录/报表/剪辑端只读路径。

## 5. 租约/锁检查（切换与排障必查）

| 锁/租约 | 位置 | 检查 | 备注 |
|---|---|---|---|
| 账号服务单实例 owner | `<account-state>/.mixlab-library/cutter-users/service-owned.json` + lock 文件 | `service-owned.json` 存在且 owner=account-service；重复启动会因 owner lock 拒绝 | 服务停止后锁才可被迁移/回滚 CLI 获取 |
| 账号迁移/回滚 CLI | 同 state 的 cutter-account lock | 迁移/回滚与运行中服务互斥 | 冲突时先停服务 |
| 事件服务单实例 owner | usage state 内 owner lock | 同 state 只能一个服务进程 | 重复启动报错 |
| admin writer lease | 公共库发布路径 | 发布 worker 等待 30s lease | 迁移期间不得发布 |
| cutter workspace lease | 本机工作区 | 多实例下非持有者 409 | staging 单实例 |
| smart engine 实例锁 | `%LOCALAPPDATA%\com.mixlab.smartcutter\lock.json` | pid/心跳；残留锁可按 Round1 runbook 处理 | 不要手工删除运行中实例的锁 |

原则：任何"删锁/改指针/手工写 users.json"都是禁止操作；锁冲突先用 `Get-Process`/`netstat -ano` 定位持有进程。

## 6. Windows Test Runner（目标机验收）

```powershell
# 从共享目录启动（见 docs/desktop/windows-test-runner-manual-start.md）
\\<mac-share>\MixLabWindowsBuilds\start-windows-test-runner.cmd
# 健康与版本
curl.exe -s http://127.0.0.1:3799/health
curl.exe -s http://127.0.0.1:3799/version
# 通过 Runner 执行安装+验收（示例；具体 endpoint 以 Runner 版本为准）
# - install_latest_and_smoke：复制安装包到本机临时目录 → 校验 SHA256 → 静默安装 → windows_acceptance
# - windows_acceptance：source-library/搜索/详情/剪切/缓存/服务模式冒烟
```

证据：Runner report.json、安装包 SHA256、安装退出码/耗时、验收各接口耗时、`auth_mode`、素材库数量/搜索命中的日志片段。

## 7. 发布 v2 校验（管理员 API）

```bash
# 需要 admin 会话（staging 使用受控管理员账号）
curl -s -H "Cookie: <session>" http://127.0.0.1:3889/api/admin/releases/current
# 期望：ok:true，包含 schema_version=2 的 manifest 摘要、release_id/version、files 数量、min_client_version

curl -s -H "Cookie: <session>" "http://127.0.0.1:3889/api/admin/releases/<release_id_or_version>/verify?max_files=20000"
# 期望：ok:true；verification 报告 file_count/mismatch_count=0/ok=true/duration_ms
# 若 RELEASE_BUNDLE_CORRUPT → 立即停止发布、保留现场、禁止手工改指针
```

大库 hash 性能检查点（staging 基线，记录不设硬门禁）：
- 对 7950 文件级合成库/真实 staging 库执行 `verify?max_files=20000`，记录 `duration_ms`、文件数、平均单文件 hash 时间；
- 同一发布重复 verify（冷/热各一次），记录差异用于识别 NAS 缓存效应；
- 发布耗时（publish worker 日志）与 verify 耗时分开记录；若单次 verify > 10 分钟或 mismatch>0，阻断发布并升级排查。

## 8. 性能检查点（记录基线）

| 检查 | 命令/来源 | 目标（staging 参考） |
|---|---|---|
| 账号登录 | `Measure-Command { curl ... /accounts/v1 login }` | p95 < 300ms（本机 loopback） |
| 会话 validate | 同上 validate | p95 < 150ms |
| 事件 outbox flush | 客户端日志/outbox status | 100 条/批 < 500ms；离线 pending 不丢 |
| 事件 metrics 查询 | admin token `/v1/metrics?last_days=7` | 200k 事件内 < 2s（超出 413 已知） |
| 发布 v2 verify | §7 | 记录基线；异常增长排查 NAS/磁盘 |
| 公共库首屏/搜索 | Runner report | 沿用历史基线：首屏 < 20ms、搜索预热后 < 100ms（NAS 视环境） |
| 智能端登录/校验 | smart 引擎日志/测试 | flag on：登录 < 2s；服务不可用 5s 内降级为本地可用 |

## 9. 证据清单（PASS/FAIL Gate 模板）

| # | 证据 | 期望 | 结果 | 附件 |
|---|---|---|---|---|
| 1 | Round1-4 Gate 文件 | 三仓全绿 | | |
| 2 | `service-mode-matrix.ts` 输出 | MATRIX_RESULT: PASS 19/19 | | |
| 3 | 前置检查输出 | 端口/磁盘/Node SQLite/NAS 只读 | | |
| 4 | 账号服务 ready + service-owned.json | 存在且单实例 | | |
| 5 | 事件服务 /health | status ok + store_id | | |
| 6 | 账号迁移 dry-run/apply/legacy digest | blockers 空；digest 不变 | | |
| 7 | 事件迁移 --verify | match 或 known-difference | | |
| 8 | flag on 后 admin/cutter/smart 冒烟 | 登录/列表/审核/禁用/事件/本地降级 | | |
| 9 | Runner report | 安装 exit 0 + windows_acceptance 通过 | | |
| 10 | 发布 v2 verify | ok=true，mismatch=0，耗时基线 | | |
| 11 | 回滚演练（staging） | flag→服务→数据顺序恢复，legacy digest 一致 | | |
| 12 | 性能记录 | 表 8 全部记录 | | |

最终结论：全部 PASS 才允许进入真实 NAS 只读预演；P0/P1 任何 FAIL 不得进入生产。

## 10. 已知阻塞/风险（Round5 输入）

1. 账号服务读路径已接线（admin-api/index.ts 的 list_cutter_users_service = createAdminCutterUserListService(env)）；开 flag 前仍需完成本节停写者切换与目标机验证。
2. 智能端桌面启动器未注入 service env；staging 需手动/脚本注入，正式发布前需授权改 Rust 或由安装器写机器级 env。
3. 服务 token 角色：账号服务拒绝显式相同的 client/admin token；usage 服务为兼容允许 admin_token 与 client token 同值（admin_token 优先），生产仍必须使用不同值并分别轮换。
4. 事件服务 `/v1/metrics` 每请求重算，超 200k 事件返回 413；大库 staging 先记录基线，Phase 3 再做分区/增量。
5. 服务仅 loopback、无 TLS/跨机鉴权；staging 跨机访问必须经隧道；不要绑定 0.0.0.0。
6. Node 版本与 `node:sqlite` API 兼容需每次目标机复验（§1.2）；Windows 上以 NSSM 固定 node 路径，避免 PATH 漂移。
7. 未演练真实 Windows/NAS 故障（断电、SMB 断连、服务崩溃重启、锁残留）；staging 必须做一次停机/断电模拟并记录 outbox 与账号数据一致性。

## 11. Staging 验收执行器（staging-smoke.mjs）

位置：admin 仓 `scripts/acceptance/staging-smoke.mjs`（纯 Node ESM，无第三方依赖，本机与目标机均可运行）。
默认 **dry-run 只读**：不启动服务、不写服务 state root、不执行迁移 apply/rollback；仅做端口探测、临时目录 SQLite 探测（结束删除）与证据输出。

### 11.1 用法

```bash
# 本机 dry-run（开发机，无服务，跳过服务/发布）
node scripts/acceptance/staging-smoke.mjs --dry-run --json --skip-services --skip-release

# admin 场景（合成库 + 临时 state roots，覆盖迁移 dry-run/回滚前置/锁/磁盘）
node scripts/acceptance/staging-smoke.mjs --dry-run --json \
  --legacy-library /tmp/mixlab-r6/legacy \
  --accounts-state-root /tmp/mixlab-r6/accounts-state \
  --usage-state-root /tmp/mixlab-r6/usage-state \
  --skip-services --skip-release --out-dir <evidence-dir>

# 目标机安装完成后（服务与发布必须可用，否则 FAIL）
node scripts/acceptance/staging-smoke.mjs --dry-run --json --require-services --require-release \
  --repo-root C:\MixLab\app \
  --legacy-library '\\NAS\MixLab\PublicLibrary' \
  --accounts-state-root C:\MixLab\state\accounts \
  --usage-state-root C:\MixLab\state\usage \
  --smart-state-root "$env:LOCALAPPDATA\com.mixlab.smartcutter" \
  --admin-api-base http://127.0.0.1:3889 --accounts-service-base http://127.0.0.1:3891 --usage-service-base http://127.0.0.1:3892 \
  --admin-cookie '<admin-session-cookie>' --release-id '<release-id-or-version>' \
  --out-dir '\\<mac-share>\MixLabWindowsBuilds\reports\round6-staging'
```

关键参数：`--json`（只输出 JSON）、`--out-dir`（同时写 .json/.md 证据）、`--skip-services`/`--skip-release`/`--skip-migrations`/`--skip-locks`/`--skip-disk`、`--only <ids>`/`--skip <ids>`、`--timeout-ms`、`--min-free-gb`、`--expect-services`、`--require-services`、`--require-release`；跨仓执行用 `--repo-root <repo>`（迁移检查只对 admin 仓 ops 脚本有效，其余仓自动 SKIP）。

退出码：**0** = 无 FAIL（WARN/SKIP 允许）；**1** = 至少一个 FAIL；**2** = 参数错误/崩溃。
JSON 证据包含：`created_at/finished_at/host/platform/arch/node_version/repo{name,version,git_head}/script_sha256/options(admin_cookie 脱敏)/checks[]/summary/evidence_sha256`。

复核 evidence_sha256（回到采集机或任意 Node ≥22）：

```bash
node -e 'const fs=require("fs"),c=require("crypto");const e=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const h=c.createHash("sha256").update(JSON.stringify({options:e.options,checks:e.checks,summary:e.summary})).digest("hex");console.log(h===e.evidence_sha256?"EVIDENCE_OK":"EVIDENCE_MISMATCH")' staging-smoke.json
```

检查项（每个 PASS/WARN/FAIL/SKIP，单项超时与异常捕获）：
`env.node`（Node≥22.5 + node:sqlite 打开）、`env.platform`、`env.repo`（git head/脚本 sha256）、
`paths.state-roots`（存在/可读写/权限过宽/禁止网络共享）、`paths.legacy-library`（只读可达）、
`ports`（占用，`--expect-services` 时占用为预期）、`ports.services`（回环 base URL 校验）、
`sqlite.probe`（WAL+写读，临时目录）、`services.usage-health`（/health）、`services.accounts-tcp`（TCP，账号服务无 /health）、
`migrations.account-dry-run`、`migrations.usage-dry-run`、`release.current`、`release.verify`、
`rollback.readiness`（backups/account-import 只读检查）、`locks.services`、`locks.smart`、`disk.space`（<5GB FAIL、<20GB WARN）。

### 11.2 本机 dry-run 证据（Round6）

`progress/verify/round6-staging/{admin,cutter,smart}/staging-smoke.{json,md,log}` + `admin/service-mode-matrix.log`：
admin **PASS 9 / WARN 4 / FAIL 0 / SKIP 5**（exit 0，迁移 dry-run 与回滚前置已覆盖；WARN 均为"部署前预期"）；
cutter/smart 各 **PASS 7 / FAIL 0**（exit 0）；附带 Round5 矩阵 **PASS 19/19**。
证据 README 含命令、结果表与每份文件 sha256。

## 12. 证据回传、FAIL 判定与升级路径

### 12.1 证据回传

- 目标机输出目录：`\\<mac-share>\MixLabWindowsBuilds\reports\round6-staging\<HOSTNAME>-<timestamp>\`
- 必需文件：`staging-smoke.json`（结构化证据）、`staging-smoke.md`（人读摘要）、`staging-smoke.log`（逐 check 日志）、`service-mode-matrix.log`（如执行）、`preflight.txt`（§1 输出）。
- 文件名不可改；JSON 内 `evidence_sha256` 与文件 sha256 必须可复核（`Get-FileHash -Algorithm SHA256`；不要手工编辑 JSON）。
- 回传失败（共享不可写）→ 先存本机 `C:\MixLab\evidence\` 并在报告中记录路径，修复共享后补传。

### 12.2 FAIL 判定

| 级别 | 条件 | 处理 |
|---|---|---|
| **FAIL（阻断）** | JSON `summary.FAIL > 0` 或 exit code=1/2 | 停止 staging Gate，保留证据，按 check id 升级；修复后用同命令复跑至 FAIL=0 |
| **WARN（条件通过）** | 仅 WARN（如首次部署前 state root 不存在/服务未启动/发布未就绪） | 记录原因与责任人；安装/迁移/发布完成后用 `--require-services --require-release` 复跑，WARN 必须消失或转为 PASS |
| **SKIP（需说明）** | 显式 `--skip-*` 或前置缺失 | 在证据与 Gate 表中写明"谁/为何跳过"；关键阶段（安装后、迁移后、发布后）不得跳过对应检查 |

常见 FAIL → 升级路径（按 check id）：
- `env.node` → 换/降级 Node（≥22.5）；Node 26 需确认候选已修复 `DatabaseSync` options 兼容；记版本后重跑。
- `paths.state-roots`（网络共享/不可写/权限过宽）→ 迁到本机 NTFS 并收紧 ACL（SYSTEM+服务账号），禁止 SMB/CIFS/映射盘；重跑。
- `ports`/`ports.services` → `netstat -ano | findstr :<port>` 定位占用进程；服务端口必须 127.0.0.1；改端口时同步 base URL/env/客户端配置。
- `sqlite.probe` → 检查 Node 版本、磁盘、杀毒/EDR 拦截、目录权限；修复后重跑（同时触发 §3.6 选择复核）。
- `services.*` → 查 NSSM 服务状态/日志（`C:\MixLab\logs\*.log`）与 token 配置；账号服务无 /health，用 TCP+service-owned.json 判定。
- `migrations.*` → dry-run blockers/错误信息直接作为升级依据；先清 blockers（停写者/digest 变化/目标已有不同数据），不得绕过。
- `release.current/verify` → 检查 admin-api 会话与发布流程；`RELEASE_BUNDLE_CORRUPT` 立即停发布并保留现场，禁止手改指针。
- `rollback.readiness` → 迁移后必须 PASS；否则先补备份/导入记录再进入发布门禁。
- `locks.*` → 先 `Get-Process`/`netstat` 确认持有者；运行中服务的锁不得手工删除；stale 锁按对应组件 runbook 处理。
- `disk.space` → 清理日志/旧 release/旧备份或扩容；<5GB 直接阻断。

升级顺序：执行人保留证据 → 组长（staging owner）判定 → 对应组件 owner（admin/cutter/smart）修复 → 原命令复跑 → Gate 表更新；P0/P1 FAIL 不得"带病进入生产"。

### 12.3 Windows / PowerShell 注意事项

1. 执行器是 `.mjs`，用 `node` 直接运行，**不要**用 PowerShell 重写或包 .bat 改变语义；无需 ExecutionPolicy 设置（不是 .ps1）。
2. UNC/含空格路径用单引号：`--legacy-library '\\NAS\MixLab\PublicLibrary'`；不要把 UNC 路径当 state root（服务 state 必须本机盘）。
3. `$LASTEXITCODE` 检查退出码；`--json | Out-File -Encoding utf8` 避免中文乱码（必要时先 `chcp 65001`）。
4. 以能访问本机 state 目录的服务账号（或管理员）运行；普通用户可能看不到 NSSM 服务日志/ACL。
5. 端口检查与 `--require-services` 只在**本机**有意义（127.0.0.1 是本机）；跨机访问用远程桌面/隧道，不要改成 0.0.0.0。
6. 目标机首次运行建议顺序：§1 前置 → 执行器 `--skip-services --skip-release`（安装前基线）→ 安装服务（§3）→ 执行器 `--require-services`（服务门禁）→ 迁移（§4）→ 执行器含迁移/回滚检查 → flag on 冒烟 → 发布 v2 后 `--require-release` 复跑。
7. 执行器不安装依赖；目标机需预置 Node 与仓库 `node_modules/tsx`（迁移 CLI 依赖 tsx）。若目标机不允许 node_modules，安装前在构建/交付包中预置或改用预构建 CLI，否则迁移检查会 SKIP 并记为已知缺口。
8. 不要在映射盘（`Z:`）作为 cwd 执行；用 `--repo-root C:\MixLab\app` 与 `--out-dir C:\MixLab\evidence\...`（本地）后再复制到共享。
9. 证据复制用 `Copy-Item -Recurse -Force`，保留原始文件名与时间戳；不要用会改换行/编码的编辑器打开 JSON。

## 13. 快速命令索引

```text
矩阵:        node --import tsx scripts/acceptance/service-mode-matrix.ts
staging 执行器: node scripts/acceptance/staging-smoke.mjs --dry-run --json [--out-dir <dir>]
安装后门禁:  加 --require-services；发布后门禁: 加 --require-release (+ --release-id)
账号服务:    node --import tsx scripts/servers/cutter-account-service.ts
事件服务:    node --import tsx scripts/servers/usage-service.ts
账号迁移:    scripts/operations/cutter-account-migration.ts {dry-run|apply|rollback}
事件迁移:    scripts/operations/usage-service-migration.ts import ... [--dry-run|--apply|--verify]
事件维护:    scripts/operations/usage-service-maintenance.ts {status|prune}
Runner:      \\<mac-share>\MixLabWindowsBuilds\start-windows-test-runner.cmd
发布校验:    GET /api/admin/releases/current; GET /api/admin/releases/<id>/verify?max_files=20000
本机证据:    progress/verify/round6-staging/{admin,cutter,smart}/staging-smoke.{json,md,log}
```



