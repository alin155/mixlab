# Release 缓存同步状态与错误诊断（0.18.34 Phase 1）

> 适用范围：剪辑端 release cache 同步（`packages/library-fs/src/cutter-release-cache.ts`）与 Cutter API/缓存管理页诊断字段。本次改动只增强诊断与重试，不改变发布指针/发布流程/版本号。

## 1. 持久化 sync-state.json

- 路径：`<cache_root>/.mixlab-library/sync-state.json`（原子写：tmp+rename，权限 0640，目录 0750）。
- 写入时机：同步开始（syncing）、复制制品（copying）、校验制品（verifying）、成功（ready）、失败（failed）。进程崩溃/重启后仍可读取最近一次状态。
- 字段：

| 字段 | 说明 |
|---|---|
| schema_version | 固定 "1.0" |
| updated_at | 状态写入时间（ISO） |
| target_release_version | 公共库 current-release 指针指向的目标版本 |
| active_release_version | 本机缓存仍生效的版本（失败时保留旧 active，不切换） |
| phase | syncing / copying / verifying / ready / failed |
| sync_status | ready / syncing / failed |
| copied | 本次是否真正复制了制品 |
| last_error | 失败时：{code, message（真实异常 message）, phase（失败阶段）, at}；成功时不存在 |
| verification | 校验摘要：{manifest_schema_version, verified_files, failed_files, fallback_reason?} |

## 2. 复制重试

- `copyReleaseFiles` 最多 3 次尝试，失败退避 500ms / 1500ms；每次失败清理临时目录（`<release>.tmp-<pid>-<time>-<attempt>`），成功后 rename 到目标目录。
- 3 次仍失败抛错（code `CUTTER_RELEASE_COPY_FAILED`，message 含“已重试 3 次”和最后一次真实异常），由同步流程写入 failed sync-state；旧 active/指针不动。
- 已知边界：复制失败不会在当次内切换指针或淘汰旧版本；下次同步/重启后重试。

## 3. API / UI 诊断字段

- `GET /cutter/runtime-status` 的 `release_cache` 新增可选字段：
  - `target_release_version`（目标版本）、`active_release_version`（实际生效版本，已有字段）、
  - `phase`（同步阶段）、`last_error {code,message,phase,at}`；
  - `sync_status` 在同步抛错/校验失败时为 `failed`（即使本机暂无可用旧缓存，也不再显示 unavailable）；
  - `message` 在失败时追加“最后错误/最近同步失败：<message>”。
- 缓存管理页显示：当前 Release、目标 Release、同步阶段、最后错误（code + message/时间）。旧服务端无这些字段时页面降级为原展示。

## 4. 运维排查

1. 缓存管理页/接口确认 `phase=failed` 与 `last_error.message`（例如 EACCES/EIO/ENOSPC/制品不完整）。
2. 检查 `<cache_root>/.mixlab-library/sync-state.json` 的 target/active 与 verification。
3. 修复磁盘/权限/网络后等待下一次同步或重启剪辑端；旧 active 在修复前保持可用。
4. 若复制持续失败，对比公共库 releases 目录完整性与 AC 权限；不要手工删 cache 的 current-release.json（回滚工具见 release-trains.md）。
