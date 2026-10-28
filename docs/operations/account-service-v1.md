# 账号服务 v1 生产切换 Runbook（Round5）

状态：flag-on 生产化候选；默认关闭。仓库 /Users/huaqihang/Documents/mixlab（未 commit）。

## 0. 权威与拓扑

- 旧权威：公共库 .mixlab-library/cutter-users/users.json（所有旧客户端直接读写）。
- 新权威：独立回环账号服务进程（scripts/servers/cutter-account-service.ts），私有 state root：MIXLAB_ACCOUNT_SERVICE_STATE_ROOT（默认 ~/.mixlab-service/accounts）。
- 切换开关：MIXLAB_CUTTER_ACCOUNTS_SERVICE_URL（未设置=旧路径；设置=服务路径）。服务地址必须 http://127.0.0.1 或 localhost。
- 服务进程与 admin-api 分离；读路径 provider 由 createAdminCutterUserListService() 提供，已接入 admin-api/index.ts（见 §6）。

## 1. 环境变量

| env | 必填 | 说明 |
|---|---|---|
| MIXLAB_ACCOUNT_SERVICE_STATE_ROOT | 是（生产） | 私有绝对路径；不得位于公共库内；默认 ~/.mixlab-service/accounts |
| MIXLAB_ACCOUNT_SERVICE_PORT | 否 | 默认 3891，仅 127.0.0.1 |
| MIXLAB_CUTTER_ACCOUNTS_SERVICE_TOKEN | 是 | client token：cutter 设备 register/login/validate/refresh/logout/change_password 等 |
| MIXLAB_CUTTER_ACCOUNTS_SERVICE_ADMIN_TOKEN | 推荐 | admin token：list/approve/disable/reset_password/entitlements；缺省时进入单 token 兼容模式（client=admin superset，打印 deprecation 日志） |
| MIXLAB_CUTTER_ACCOUNTS_SERVICE_URL | 切换时 | 客户端/管理端服务地址；未设置保持旧 users.json 路径 |

兼容别名：MIXLAB_ACCOUNT_SERVICE_TOKEN / MIXLAB_ACCOUNT_SERVICE_ADMIN_TOKEN。两个 token 必须不同；相同时服务拒绝启动。

## 2. 停写者清单（切换前逐项确认）

1. 所有已安装剪辑端（Windows/Mac）进程与后台队列：确认版本、机器和退出状态；旧版本不会读取新锁/新服务，必须停写。
2. 所有 admin-api / admin worker / docker worker loop 进程。
3. 本机自动化脚本、cutter-api、智能剪辑端、测试 runner 等可能调用账号写接口的进程。
4. 记录每台机器、客户端版本、直接读写者、权限；对无法确认的机器保守暂停。
5. 保持停写直到切换完成或明确放弃；迁移/回滚 CLI 的 --legacy-writers-stopped 是操作者声明，不是远程检测。

## 3. 迁移步骤（dry-run -> apply -> 切换）

1. 生成迁移计划（只读，不写盘、不取锁）：
   node --import tsx scripts/operations/cutter-account-migration.ts dry-run <LEGACY_LIBRARY_ROOT> <PRIVATE_STATE_ROOT>
   检查 users/sessions/digest/blockers/state_ready；blockers 非空先处理。
2. 确认旧库 digest 作为回滚基线（记录 dry-run 输出 source_digest；旧库内容从此不得变化）。
3. 应用迁移（备份原文件到 <state>/backups/original-<digest12>/）：
   node --import tsx scripts/operations/cutter-account-migration.ts apply <LEGACY_LIBRARY_ROOT> <PRIVATE_STATE_ROOT> --legacy-writers-stopped
   幂等：同 digest 重跑返回 already_applied；legacy 变化或目标已有不同数据会拒绝。
4. 启动服务：
   MIXLAB_ACCOUNT_SERVICE_STATE_ROOT=<PRIVATE_STATE_ROOT> \
   MIXLAB_CUTTER_ACCOUNTS_SERVICE_TOKEN=<CLIENT_TOKEN> \
   MIXLAB_CUTTER_ACCOUNTS_SERVICE_ADMIN_TOKEN=<ADMIN_TOKEN> \
   node --import tsx scripts/servers/cutter-account-service.ts
   确认 ready JSON 的 url，并确认 service-owned.json/account-import.json 存在。
5. 在受控客户端/管理端设置 MIXLAB_CUTTER_ACCOUNTS_SERVICE_URL 与对应 token，验证：登录、会话 validate/refresh、管理员 list/approve/disable/reset、entitlements 读取。
6. 验证旧库未被改写：重新计算 legacy no（见 §4），与 apply 前 source_digest 一致；旧 users.json 字节不变。

## 4. legacy 未变校验

- 迁移前记录 dry-run 的 source_digest（users.json + entitlements.json 的 sha256 组合）。
- 切换后再次 dry-run，确认 source_digest 与 imported_source_digest 一致且 already_applied=true。
- 若 legacy digest 变化：说明仍有旧写入者或有人工修改，立即停止切换，按冲突处理，不得覆盖。

## 5. 回滚步骤

1. 停止账号服务进程（SIGTERM 等待退出）；停止所有使用服务开关的 admin/cutter 进程；确认旧写入者仍停写。
2. 取服务/旧库锁并核对 legacy digest 等于导入基线后恢复备份原文件：
   node --import tsx scripts/operations/cutter-account-migration.ts rollback <LEGACY_LIBRARY_ROOT> <PRIVATE_STATE_ROOT> --legacy-writers-stopped
   成功输出 restored_files 与 rolled_back=true；重复执行幂等（already_rolled_back）。
3. 服务在运行、legacy 已变化、备份缺失/不一致时 CLI 会拒绝（account_rollback_conflict / 不会覆盖新数据）。
4. 回滚后撤销客户端 MIXLAB_CUTTER_ACCOUNTS_SERVICE_URL（恢复旧路径），复测登录/管理；保留 state root 与 backups 作为证据，不删除。
5. 回滚会丢弃迁移后在服务中新增的注册/改密/禁用状态（只在 state 私有库中）；如需保留，先用 export-rollback 流程导出候选并人工核对（当前 CLI 提供 rollback 原文件恢复，生产需评审是否补充导出）。

## 6. 读路径接线（已完成）

admin-api index.ts 仍把 legacy listCutterUsers 注入 system read route（packages/admin-api/src/index.ts 约 735 行）：
  list_cutter_users_service: listCutterUsers
改为：
  list_cutter_users_service: createAdminCutterUserListService()
import 增加：import { createAdminCutterUserListService } from "./admin-cutter-user-commands.ts";
admin-api/index.ts 已接线为 `list_cutter_users_service: createAdminCutterUserListService(env)`（2026-10-27 Round5 Lead 收口）：flag off 仍读旧 users.json，flag on 读服务权威，服务不可用 fail-closed；entitlements 读路径尚无 admin 路由，provider 已提供 readCutterAccountEntitlementsForAdmin。

## 7. 证据与测试

- node --test --import tsx <5 个账号测试文件> => 34/34 pass（含 split-token 角色、legacy 单 token 兼容+deprecation、读路径 flag 双路径、服务不可用 fail-closed、迁移->flag on->登录->禁用->回滚 E2E）。
- 服务端点：register/login/validate/refresh/logout/change_password/create_login_application/ensure_session_for_device + list/approve/disable/reset_password/list_with_tiers/get_entitlements/set_entitlements。
- 未启动常驻真实服务（测试用进程内临时 loopback + 临时目录）；未访问 NAS/真实账号。

## 8. 风险

- 单 token 兼容模式安全边界较弱（client token 可执行管理操作），仅用于过渡；生产应配置 admin token。
- 读路径已接线；真实管理端开 flag 前仍需完成目标机验证与停写者切换（见 runbook）。
- Windows/NAS/多机、TLS、服务守护/自动重启、审计留存未验收；账号服务仍为 loopback 候选。
- 回滚只恢复 apply 时备份的原文件，不合并服务期间新数据；需保留 state 供人工导出核对。
