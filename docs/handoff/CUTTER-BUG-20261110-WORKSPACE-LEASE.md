# Cutter 0.18.28 P1：workspace 租约在盘符根目录失败，导致剪切队列永久 pending

- 发现时间：2026-11-10
- 反馈编号：FB-20261110-59547996
- 用户：肖锦森
- 版本：0.18.28 / build 79fa35c
- 现象：无法剪辑，一直显示等待中；剪切任务 CJ20261110-0010 一直 pending
- 优先级：P1（影响实际剪辑产出）

## 1. 证据

反馈包 logs/cutter-api.log：

```text
{"event":"workspace_lease_acquire_failed","message":"EPERM: operation not permitted, mkdir 'F:\\'"}
{"event":"cut_queue_drain_skipped","reason":"submit","cause":"workspace_lease_unavailable"}
{"event":"cut_queue_drain_skipped","reason":"retry","cause":"workspace_lease_unavailable"}
```

反馈 context 中：

```text
CJ20261110-0010 status=pending output_path=""
CJ20261110-0011 status=cancelled
CJ20261110-0009 status=cancelled
CJ20261110-0008 status=done
```

结论：本机 API/searchd/NAS 均可用，但 **workspace 租约获取失败**，导致 cut queue drain 被跳过，任务永远不被执行。

## 2. 根因

发布提交 79fa35c 中：

```ts
// packages/cutter-local/src/cut-queue.ts
// acquireWorkspaceLease()
await mkdir(workspaceRoot, { recursive: true });
```

当本地工作区被用户选为盘符根目录（例如 `F:\\`）时，Node 在 Windows 上对已存在的盘符根执行 `mkdir(..., { recursive: true })` 会返回：

```text
EPERM: operation not permitted, mkdir 'F:\\'
```

后续：

1. `acquireWorkspaceLease` 抛错；
2. `workspaceLease` 未赋值；
3. `workspaceExecutionAllowed()` 返回 false；
4. `drainCutQueueBestEffort` 打 `cut_queue_drain_skipped`；
5. 所有 pending 剪切任务不执行，界面一直等待。

现有测试都用临时子目录，`mkdir` 正常，没有覆盖“工作区是盘符根目录 / 根目录不可 mkdir”的情况。

## 3. 修复要求

### 3.1 不要对已存在的工作区重复 mkdir

`acquireWorkspaceLease` 中先判断工作区是否存在：

- 存在且是目录：跳过 mkdir；
- 不存在：mkdir；
- 存在但不是目录：明确报错。

不要用“直接 mkdir 然后吞错”的方式，因为会掩盖真实权限问题。

### 3.2 租约写不进去时的降级路径

即使跳过 mkdir，盘符根也可能不允许写 `.mixlab-workspace-lock.json`。

如果租约写入 workspace 根目录失败（EPERM/EACCES/EROFS），应使用本机固定的 fallback 租约路径，例如：

```text
%LOCALAPPDATA%\MixLab Cutter\workspace-leases\<workspace hash>.json
```

要求：

- 同一 workspace 的多个进程必须解析到同一个 fallback 路径；
- 仍然使用 `wx` 原子创建；
- 读取/释放/心跳/stale 回收都要支持 fallback；
- 旧版 workspace 根目录锁文件仍兼容读取，避免升级瞬间双执行。

### 3.3 失败要可见

如果租约最终不可用，不只是 console 打日志；应通过 API/状态让前端显示明确错误，例如：

> 本机工作区无法建立独占锁，剪切队列已暂停；请把本地工作区改为可写子目录或升级版本。

不能继续静默 pending。

## 4. 测试要求

至少新增：

1. 已存在 workspace 目录时，不调用 mkdir（或 mkdir 抛 EPERM 仍能成功获取租约）；
2. 模拟 workspace 根目录 lease 写入 EPERM 时，fallback 到本地租约路径成功；
3. fallback 路径下，两个实例仍互斥；stale 锁可回收；
4. 获取租约后启动 drain，pending 任务能执行完成；
5. 旧 workspace 根锁文件兼容读取；
6. 现有租约/队列测试全部通过。

Windows 真机验收：

- 将本地工作区设置为盘符根目录（或等价不可 mkdir 路径）；
- 放一个 pending 剪切任务；
- 修复后启动 Cutter，任务能被 drain 完成/失败，不能长期 pending；
- 反馈日志中不应再出现 `workspace_lease_acquire_failed`。

## 5. 交付

- 修 `packages/cutter-local/src/cut-queue.ts`（必要时 `packages/cutter-api/src/index.ts` 错误可见性）；
- 补测试；
- 产出修复 commit、测试结果、真机复现证据；
- 回复 Mac，说明是否已具备 0.18.29 发布条件；
- 在修复发布前，不能把“重启 Cutter / 修复工具”当作该问题的解决方案。

## 6. 给用户的临时说明

这不是剪辑师操作错误，也不是简单的引擎卡死；是 **Cutter 对“本地工作区=盘符根目录”处理不当** 的代码缺陷。修复工具重启不能根治，需要代码修复后升级。
