# CI 流水线与共享包门禁（Round6 模板）

状态：模板（默认只读检查，不发布/不部署）。启用前请按本文件完成仓库变量/密钥与 lockfile 刷新。

## 1. 组成

| 文件 | 位置 | 作用 |
|---|---|---|
| `scripts/ci/shared-packages-gate.mjs` | 三仓相同 | 校验三仓 `packages/{contracts,library-format,service-clients}` 逐文件 sha256 一致 + `package.json` 一致；支持 `--json`/`--summary`/`--summary-out`；不一致列出差异并 exit 1 |
| `scripts/ci/product-pipeline.mjs` | 三仓相同 | 单产品独立链路：typecheck → 共享包门禁 → contracts 6 项 → 单产品全量 `npm test` → 可选 release manifest 校验；结构化 summary（`--summary-out`），失败 exit 1；支持 `--dry-run` |
| `scripts/ci/check-release-manifest.mjs` | 三仓相同 | 只读校验 release manifest v2（使用目标仓 `packages/contracts`）；可选步骤 |
| `.github/workflows/shared-packages-gate.yml` | 各仓 | 三仓 checkout + hash 门禁 |
| `.github/workflows/{admin,cutter,smart}-pipeline.yml` | 对应产品仓 | 单产品独立流水线 |

## 2. 本机运行（使用已有 node_modules，不安装）

```bash
export MIXLAB_ADMIN_ROOT=/path/to/mixlab
export MIXLAB_CUTTER_ROOT=/path/to/mixlab-cutter
export MIXLAB_SMART_ROOT=/path/to/mixlab-smart-cutter

# 共享包 hash 门禁
node scripts/ci/shared-packages-gate.mjs --summary

# 单产品流水线（dry-run 先看计划；结构化 summary 可被 CI artifact 收集）
node scripts/ci/product-pipeline.mjs --product admin --dry-run
node scripts/ci/product-pipeline.mjs --product admin --summary-out ci-summary-admin.json
node scripts/ci/product-pipeline.mjs --product smart --summary-out ci-summary-smart.json

# 可选：校验一份已导出的 release manifest v2（只读）
node --import tsx scripts/ci/check-release-manifest.mjs --repo . --manifest ./release-manifest-v2.json
```

等价 npm scripts（根 `package.json`，仅新增 `ci:*`）：
`npm run ci:gate` / `npm run ci:admin` / `npm run ci:cutter` / `npm run ci:smart`。

## 3. GitHub Actions 启用步骤

1. **放置模板**：`shared-packages-gate.yml` 放入三仓 `.github/workflows/`；`admin-pipeline.yml`/`cutter-pipeline.yml`/`smart-pipeline.yml` 放入对应产品仓。admin 仓内的三份 product 模板同样可作为复制源（文件头注明 TEMPLATE）。
2. **仓库变量（vars，非 secret）**：
   - `MIXLAB_ADMIN_REPOSITORY`（如 `org/mixlab`）
   - `MIXLAB_CUTTER_REPOSITORY`（如 `org/mixlab-cutter`）
   - `MIXLAB_SMART_REPOSITORY`（如 `org/mixlab-smart-cutter`）
3. **仓库密钥（secrets，仅列出，不在文档中出现值）**：
   - `SHARED_REPOS_READ_TOKEN`：只读访问另外两个私有仓的 PAT（`contents: read`）。
   - 可选（仅当需要把 release bundle 作为 artifact 拉取做 manifest 校验时）：`RELEASE_ARTIFACT_TOKEN`（只读 artifact/包权限）。
4. **lockfile 前置**：仓库新增 workspace 包（contracts/library-format/service-clients）后，需执行一次 `npm install --package-lock-only` 刷新 `package-lock.json`，否则 `npm ci` 会因 lock 不匹配失败。刷新前模板使用 `npm ci ... || npm install ...` 兜底（会安装依赖但不会提交 lockfile）。
5. **触发方式**：仅 `workflow_dispatch` 与 `pull_request`；模板不包含 publish/deploy/release 步骤。fork PR 默认拿不到 secrets，建议只在受信分支/内部 PR 启用为 required check。
6. **required checks 建议**：`shared-packages-gate` 全仓 required；`admin/cutter/smart-pipeline` 分别在对应仓 required。分支保护中不要启用任何自动发布 workflow。

## 4. 结构化 summary 约定

`product-pipeline.mjs --summary-out <file>` 输出（JSON）：
```json
{
  "pipeline": "product-pipeline",
  "product": "admin",
  "repo": "/abs/path",
  "ok": true,
  "started_at": "ISO",
  "finished_at": "ISO",
  "steps": [
    { "name": "typecheck", "status": "passed", "exit_code": 0, "duration_ms": 1234 },
    { "name": "shared_packages_gate", "status": "passed", "detail": "packages=contracts:PASS,library-format:PASS,service-clients:PASS" },
    { "name": "contracts_6_invariants", "status": "passed", "detail": "tests=6 pass=6 fail=0" },
    { "name": "product_tests", "status": "passed", "detail": "tests=N pass=N fail=0" },
    { "name": "release_manifest_check", "status": "skipped", "detail": "未提供 --release-manifest" }
  ]
}
```
步骤状态：`passed|failed|skipped|planned`；失败步骤附带 `log_tail`。CI 可直接以 `ok`/`steps[].status` 做门禁与告警。

## 5. 回滚 / 禁用

- 直接删除或禁用对应 workflow 文件即可回到纯人工门禁；脚本本身无副作用（只读、只写 summary 文件）。
- 共享包门禁失败优先按输出差异清单修复（三仓复制 package 内容），不要放宽门禁。
- 本模板不涉及数据/发布回滚：不修改 NAS/发布指针/制品。
