# 本机 Admin Web 预处理功能排查报告

日期：2026-06-25
范围：Mac 本机 Admin Web/API 预处理相关功能，只读排查
入口：

- Admin Web: `http://127.0.0.1:5176`
- Admin API: `http://127.0.0.1:3889`
- PublicLibrary: `/Volumes/MixLab/PublicLibrary`

## 结论

本机 Web 端预处理主页面可以加载，核心队列、索引发布、任务详情和恢复提示都能展示；但当前真实数据状态不适合直接启动预处理流水线。

主要阻塞点有四个：

1. 有 1 个旧任务 `V001440 / C0018` 从 `2026-06-01T13:42:27.045Z` 起卡在 ASR 阶段，页面识别为“待恢复”，Supervisor 当前未运行。
2. Dashboard 指标接口 `/api/admin/dashboard/metrics` 当前返回 500，因为 `/Volumes/MixLab/PublicLibrary/.mixlab-library/usage-events/events.ndjson` 第 9084 行不是完整 JSON。
3. 本机设置里的默认素材来源仍是容器路径 `/data/PublicLibrary/source-videos`，在 Mac 本机 path-check 中失败；真实路径 `/Volumes/MixLab/PublicLibrary/source-videos` 存在。
4. NAS 卷使用率为 98%，页面负荷建议显示“磁盘空间不足，建议暂停流水线并清理空间”。

## 环境确认

当前监听端口：

- `127.0.0.1:5176` Admin Web
- `127.0.0.1:3889` Admin API
- `127.0.0.1:5177` Cutter Web
- `127.0.0.1:3789` Cutter API
- `127.0.0.1:3790` Searchd

SMB 挂载：

- `//Hqh@192.168.1.27/MixLab` 挂载到 `/Volumes/MixLab`
- `/Volumes/MixLab/PublicLibrary` 可访问
- 容量：29Ti 总量，28Ti 已用，623Gi 可用，容量使用率 98%

## 数据状态

`library.json` 当前总账：

- total videos: `11394`
- ready: `10471`
- processing: `1`
- queued: `903`
- unprocessed: `0`
- failed: `0`
- index-required: `19`

当前索引：

- current index: `v010471`
- validation: `pass`
- indexed ready videos: `10471`
- recent versions returned: `8`

Supervisor：

- state: `idle`
- state label: `未运行`
- worker id: `admin-worker-14838`
- last error: empty
- stop requested: `false`

## 卡住任务

任务：

- source video: `V001440`
- title: `C0018`
- relative path: `陈永亮/其他团队拍摄/2025.11.28(第三次拍摄）/C0018.MP4`
- manifest status: `processing`
- job status: `processing`
- worker id in job record: `admin-worker-30`
- attempt: `2`
- claimed at: `2026-06-01T13:42:27.045Z`
- current stage: `asr`
- stage updated at: `2026-06-01T13:43:36.815Z`
- physical log: missing; UI shows derived snapshot from source-video and preprocess-job records

UI correctly shows:

- “1 个处理中任务需要恢复”
- “预处理服务未运行，但仍有视频停留在处理中。建议先恢复到队列，再启动预处理。”
- controls: “启动预处理” and “恢复卡住任务”

No recovery/start/publish action was clicked during this audit.

## API Health

Representative read-only API timings:

| Endpoint | Result | Time |
| --- | ---: | ---: |
| `/health` | 200 | 49ms |
| `/api/admin/auth/status` | 200 | 22ms |
| `/api/admin/library/status` | 200 | 53ms |
| `/api/admin/settings/config` | 200 | 1ms |
| `/api/admin/settings/runtime` | 200 | 278ms |
| `/api/admin/preprocess/supervisor/status` | 200 | 1ms |
| `/api/admin/preprocess/jobs?limit=20` cold | 200 | 508ms |
| `/api/admin/preprocess/jobs?limit=20` cached | 200 | 327ms |
| `/api/admin/index/versions` | 200 | 885ms |
| `/api/admin/doctor/report` | 200 | 5622ms |
| `/api/admin/dashboard/metrics` | 500 | 128ms |

Slow path observations:

- `/api/admin/source-videos?status=processing&limit=2`: 200, about 11s
- `/api/admin/source-videos?status=index-required&limit=2`: 200, about 18.6s
- `/api/admin/source-videos?status=queued&limit=2`: 200, about 362ms after cache

The status-filtered source video list is still a large-library slow path.

## Doctor And Runtime

Doctor returned 200 and all checks passed:

- Public Library Root
- Source Videos
- `.mixlab-library` Writable
- Preprocess Logs Writable
- Library Counts
- Source Video Manifests
- Current Index
- Preprocess Logs
- FFmpeg
- FFprobe
- ASR Config
- Local Clips

Runtime config:

- FFmpeg available: yes
- FFprobe available: yes
- ASR provider: DashScope
- ASR key configured: yes
- ASR model: `paraformer-v2`
- audio mode: `mp3_16k_mono_64k`
- concurrent jobs: `1`
- auto scan: disabled
- auto queue: disabled
- auto publish index: enabled

## Configuration Issue

Path checks show:

- Public library root `/Volumes/MixLab/PublicLibrary`: pass
- `.mixlab-library`: pass
- `library.json`: pass
- source folder `/data/PublicLibrary/source-videos`: fail

Actual Mac path `/Volumes/MixLab/PublicLibrary/source-videos` exists.

This means the current local Admin runtime can read existing protocol data, but Mac-side scan/source-folder management is carrying a container path and can fail or confuse operators.

## Dashboard Metrics Issue

`/api/admin/dashboard/metrics` fails with:

```text
internal_error: 使用事件存储文件格式错误：第 9084 行不是有效 JSON
```

File:

```text
/Volumes/MixLab/PublicLibrary/.mixlab-library/usage-events/events.ndjson
```

Observed state:

- total lines: `9087`
- line 9084 is a JSON fragment, not a complete NDJSON event
- adjacent lines parse correctly

Impact:

- Dashboard route still opens.
- Preprocess status cards still show from library/preprocess APIs.
- Usage metrics degrade to zero or “未统计”.
- Console/network shows 500 from `dashboard/metrics`.

## Browser Verification

Playwright checked:

- `http://127.0.0.1:5176/#/preprocess-jobs`
- `http://127.0.0.1:5176/#/index-publish`
- `http://127.0.0.1:5176/#/dashboard`

Preprocess page:

- Loads successfully after auth.
- Shows service state `未运行`.
- Shows current task `待恢复 V001440`.
- Shows queued count `903`.
- Shows recent completed `16`.
- Shows index publish panel with `v010471`, `19` pending publish, and system check pass.
- Task detail button opens the derived task snapshot.

Network on preprocess page:

- `auth/status`: 200
- `preprocess/jobs?limit=20`: 200
- `index/versions`: 200
- `library/status`: 200
- `settings/config`: 200
- `preprocess/supervisor/status`: 200
- `dashboard/metrics`: 500

Dashboard:

- Opens successfully.
- Shows primary recovery warning.
- Usage and material aggregate metrics fall back to zero/未统计 because metrics endpoint fails.

## Automated Verification

Commands passed:

```bash
node --test --import tsx packages/admin-api/src/index.test.ts apps/admin-web/src/admin-app.test.ts apps/admin-web/src/api.test.ts packages/library-fs/src/usage-events.test.ts packages/library-fs/src/cutter-users.test.ts packages/library-fs/src/admin-users.test.ts
npm run typecheck
npm run build:admin-web
```

Result:

- 138 tests passed.
- TypeScript typecheck passed.
- Admin Web production build passed.

## Recommended Next Steps

1. Do not directly start preprocessing yet. First use the visible “恢复卡住任务” flow or an equivalent controlled backend action to move `V001440` out of stale `processing`.
2. Repair or quarantine the single malformed usage-events NDJSON line so Dashboard metrics stop returning 500. Longer term, Dashboard metrics should tolerate one malformed usage line instead of failing the whole route.
3. Change local Admin source folder config from `/data/PublicLibrary/source-videos` to `/Volumes/MixLab/PublicLibrary/source-videos` for Mac local runtime, while preserving container path support for NAS Docker deployments.
4. Clean NAS space or lower the disk-pressure threshold before resuming long preprocessing; current usage is 98%.
5. Optimize status-filtered source-video list queries for large libraries. `processing` and `index-required` filters are currently 11s to 18.6s for tiny limits.
