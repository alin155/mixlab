# 使用事件服务 v1（Round4/5 生产化，默认关闭）

管理端统计事件从「剪辑端直接写共享库 NDJSON/SQLite」迁移到独立的**本机回环服务**：
剪辑端/桌面端先写本机 outbox（SQLite），再批量投递到统计服务；统计服务独占私有 SQLite，
按 event_id 幂等去重并提供按用户/时间聚合的指标。**默认关闭**：未配置 `MIXLAB_USAGE_SERVICE_URL`
时，管理端报表仍走旧的共享库 NDJSON 路径，行为与之前一致。

## 1. 启动统计服务（独立进程，非 admin-api 内路由）

```bash
# 状态目录必须是本机私有绝对路径，禁止放在公共素材库/NAS 共享根下
export MIXLAB_USAGE_SERVICE_STATE_ROOT=/var/lib/mixlab/usage-service
export MIXLAB_USAGE_SERVICE_PORT=3892            # 默认 3892，仅监听 127.0.0.1
export MIXLAB_USAGE_SERVICE_TOKEN='<client-token>'      # 必需：剪辑端/outbox 投递
export MIXLAB_USAGE_SERVICE_ADMIN_TOKEN='<admin-token>' # 可选：管理端读指标/维护（缺省复用 client token）
# 保留期与容量（Round5）：默认 180 天 / 50 万条；0 = 不限制
export MIXLAB_USAGE_SERVICE_RETENTION_DAYS=180
export MIXLAB_USAGE_SERVICE_MAX_EVENTS=500000
npx tsx scripts/servers/usage-service.ts
```

安全约束：只接受回环地址（127.0.0.1/::1）+ 回环 Host，拒绝带 Origin 的请求；Bearer token 鉴权；
`/health` 公开但仅返回 service/store_id/contract_version，不含任何绝对路径。

## 2. 端点

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/health` | 无（仅回环） | `{status:"ok",service,store_id,schema_version,contract_version}` |
| POST | `/v1/events` | client token | `{schema_version:"1.0",events:EventEnvelopeV1[]}`，1~100 条/1MiB；event_id 幂等，重复返回 `duplicate_count`，同 id 内容冲突 409 |
| GET | `/v1/metrics` | admin token | 支持 `from`/`to`（ISO 时间、先后校验）、`user_id` 过滤与加法参数 `last_days`（1-3650，不能与 from/to 同用）；返回 `metrics`（按用户聚合）+ `by_day`（按日聚合）；超过 200k 事件查询返回 413 `QUERY_TOO_LARGE` |
| POST | `/v1/maintenance` | admin token | `{mode:"dry-run"\|"apply", retention_days?, max_events?, compact?}`；按天/容量清理并返回计数（包括 `deleted_by_retention/deleted_by_capacity/total_before/total_after`），`compact` 触发 WAL checkpoint |

说明：Round4 新增的 `/usage/v1/*` 旧候选兼容前缀仍然可用（服务内部归一化到 `/v1/*`）。

事件契约：`packages/contracts/src/event-envelope.ts` 的 `EventEnvelopeV1`（服务端先校验契约，
再映射为内部投影事件；payload 中 username 缺省用 user_id）。

## 3. 迁移 CLI（从旧 NDJSON 导入，源文件只读）

```bash
# 先 dry-run（不创建状态目录、不写库）
npx tsx scripts/operations/usage-service-migration.ts import \
  /data/PublicLibrary /var/lib/mixlab/usage-service --dry-run

# 确认旧写入者已停止后 apply
npx tsx scripts/operations/usage-service-migration.ts import \
  /data/PublicLibrary /var/lib/mixlab/usage-service \
  --apply --legacy-writers-stopped
```

- 只读取 `<library>/.mixlab-library/usage-events/events.ndjson`，绝不修改/移动源文件；apply 前后校验文件 sha256 未变。
- 无 event_id 的旧行生成稳定的 `legacy-<sha256 前 32 位>` id；坏行跳过并在报告 `malformed_samples` 中列出（最多 20 条）。
- 同一源文件重复 apply 幂等：`already_imported=true`、`imported_event_count=0`、`duplicate_event_count=有效行数`；
  源文件在迁移后变化会以 `SOURCE_CHANGED` 拒绝，避免分叉。

## 3.1 保留期/容量与维护命令（Round5）

- 生效时机：服务**启动时**按保留期/容量清理一次；ingest 后按容量超限或每 500 次追加触发清理；也可通过 `POST /v1/maintenance` 或维护 CLI 手动执行。所有清理在单实例锁/服务内部事务下执行，并写入 SQLite metadata 的 `last_maintenance`（含删除计数）。
- 语义：`MIXLAB_USAGE_SERVICE_RETENTION_DAYS=0` 或 `MIXLAB_USAGE_SERVICE_MAX_EVENTS=0` 表示该项不限制；容量清理保留最新事件（按 `occurred_at` 过滤、按写入顺序淘汰最旧）。
- 维护 CLI（服务停止时使用；`status` 为只读，可在服务运行时使用）：

```bash
# 只读状态（含最近一次清理计数）
npx tsx scripts/operations/usage-service-maintenance.ts status /var/lib/mixlab/usage-service

# 预览/应用保留期+容量清理（默认 dry-run，--apply 才写入）
npx tsx scripts/operations/usage-service-maintenance.ts prune /var/lib/mixlab/usage-service \
  --retention-days 180 --max-events 500000 --dry-run
npx tsx scripts/operations/usage-service-maintenance.ts prune /var/lib/mixlab/usage-service \
  --retention-days 180 --max-events 500000 --apply --compact
```

## 3.2 迁移后校验（--verify）

```bash
# 迁移后立即比较服务聚合与 NDJSON 重算
npx tsx scripts/operations/usage-service-migration.ts import \
  /data/PublicLibrary /var/lib/mixlab/usage-service \
  --apply --legacy-writers-stopped --verify

# 仅校验既有服务状态（只读，可在服务运行时执行）
npx tsx scripts/operations/usage-service-migration.ts import \
  /data/PublicLibrary /var/lib/mixlab/usage-service --verify
```

- 报告比较 16 个聚合计数（搜索/剪辑/活跃用户等），输出 `status: match | known-difference | mismatch`。
- **已知差异**：旧 NDJSON 中缺少 `event_id` 的行在旧读路径被记为坏行，迁移会补稳定 id 并计入服务；此类行存在时报告 `known-difference`（附 `missing_event_id_lines/malformed_lines` 计数）且 CLI 退出 0；无已知差异但计数不一致才返回 `mismatch`（退出 1）。

## 4. 打开管理端 service 模式（feature flag）

```bash
export MIXLAB_USAGE_SERVICE_URL=http://127.0.0.1:3892
export MIXLAB_USAGE_SERVICE_ADMIN_TOKEN='<admin-token>'
```

- 未设置 URL：admin 报表走旧 NDJSON/`usage-metrics.sqlite` 汇总路径（默认，兼容）。
- 设置 URL：`readAdminUsageMetricsWithRuntime` 读服务 `/v1/metrics`，结果 `metrics_source="usage-service"`，
  不再读写旧 NDJSON；旧文件保留只读兼容。服务不可用时报表请求失败（不会静默混用旧数据）。
- 回滚：删除 `MIXLAB_USAGE_SERVICE_URL` 并重启 admin-api 即回旧路径；统计服务可继续运行供剪辑端投递。

## 5. 验证

```bash
node --test --import tsx packages/library-fs/src/usage-service-store.test.ts
node --test --import tsx packages/library-fs/src/usage-service-migration.test.ts
node --test --import tsx packages/admin-api/src/usage-service.test.ts
node --test --import tsx packages/admin-api/src/admin-usage-metrics-query.test.ts
node --test --import tsx packages/admin-api/src/usage-service-cli.test.ts
npx tsc -p tsconfig.json --noEmit
```

注意：`/v1/metrics` 当前每次按过滤条件重算聚合（单次上限 200k 事件，超出返回 413 `QUERY_TOO_LARGE`）；
大库长期运行建议后续增加时间分区索引或增量投影（Phase 3）。
