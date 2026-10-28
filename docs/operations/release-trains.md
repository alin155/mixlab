# MixLab Release Trains（Phase 3 发布工程准备）

> 状态：Round5 起草（2026-10-26/27）。本文是发布列车与版本策略说明，不执行发布；实际发布需另立任务并满足本文件门禁。
> 适用仓库：mixlab（管理端 + 契约/库格式）、mixlab-cutter（剪辑端交付线）、mixlab-smart-cutter（智能剪辑候选线）。
> 机器可读配置：scripts/release/versions.json；清单生成器：scripts/release/release-manifest.mjs；错误与能力契约：packages/contracts/src。

## 1. 三个仓库与当前基线

| 仓库 | 当前分支 | 基线 commit | 角色 | 本工作区状态 |
|---|---|---|---|---|
| mixlab | codex/windows-first-run-autostart-20260615104835 | e6ca8a4 | 管理端（admin-web/admin-api/worker）+ contracts/library-format 权威源 | dirty（约 1400 项：未提交修复 + 验收产物） |
| mixlab-cutter | codex/cutter-windows-package-20260703 | f4c1dc7 | 剪辑端 Web/Windows 桌面交付线 | dirty（约 60 项，含验收截图等） |
| mixlab-smart-cutter | codex/smart-cutter-20261007 | f525c0e | 智能剪辑候选线（smart Web/桌面） | dirty（约 30 项） |

dirty 是当前事实，不是可发布状态：发布清单会显式标注 dirty_repos/changed_file_count，列车流程要求发布前把 dirty 收敛为提交或导出为可审计补丁。

## 2. 版本表（基线，2026-10-26）

| 产品 | 包 | 当前版本 | 版本来源 | 列车 | 承诺 |
|---|---|---|---|---|---|
| admin-web | @mixlab/admin-web | 0.1.0 | apps/admin-web/package.json | weekly | UI 兼容 v1 契约 |
| admin-api | @mixlab/admin-api | 0.1.0 | packages/admin-api/package.json | weekly | API/错误/健康契约 |
| admin-worker | 脚本 | n/a | scripts/workers | weekly | 与 admin-api 同镜像发布 |
| cutter-web | @mixlab/cutter-web | 0.1.0 | apps/cutter-web/package.json | biweekly | 读发布指针兼容 |
| cutter-desktop | @mixlab/cutter-desktop | 0.18.10 | apps/cutter-desktop/package.json | biweekly | Windows 安装包可回滚 |
| smart-cutter-web | @mixlab/smart-cutter-web | 0.1.0 | apps/smart-cutter-web/package.json | monthly | 候选线，flag 默认关 |
| smart-cutter-desktop | @mixlab/smart-cutter-desktop | 0.1.0 | apps/smart-cutter-desktop/package.json | monthly | 候选线，flag 默认关 |
| contracts | @mixlab/contracts | 1.0.0 | packages/contracts/package.json + CONTRACT_VERSION | monthly（随需） | 只允许加法演进 |
| library-format | @mixlab/library-format | 0.1.0 | packages/library-format/package.json | monthly（随需） | 只允许加法演进 |
| service-clients | @mixlab/service-clients | 1.0.0 | packages/service-clients/package.json | monthly | 身份/事件服务客户端 v1；默认关闭，需 git 跟踪后才可发布 |

版本校验：node scripts/release/release-manifest.mjs --check。包版本或 CONTRACT_VERSION 与 scripts/release/versions.json 不一致会报 ERROR（有意 bump 版本时同步更新 versions.json 并走评审）。

## 3. 发布列车

| 列车 | 节奏 | 合并/冻结窗口 | 覆盖 | 发布前置 |
|---|---|---|---|---|
| weekly | 每周 | 周一 10:00 至周三 18:00（America/Los_Angeles）合并；周四冻结；周五发布候选 | admin-web/admin-api/worker | 三仓 typecheck+全量测试绿；release:check PASS；admin 截图/冒烟（隔离环境） |
| biweekly | 每两周 | 与 weekly 同窗；第二周周四产出 Windows 安装包 | cutter-web/cutter-desktop | Windows 空闲机安装/卸载/升级/回滚验收证据；安装包 SHA 与清单一致 |
| monthly | 每月最后一个完整周 | 契约/库格式与 smart 端同批评审 | smart 端 + contracts/library-format + service-clients | 契约加法审查通过；capabilities/契约测试绿；flag 默认关验证 |

发布列车默认关闭所有新能力：release_v2、accounts_service/usage_service（service 模式）、事件批量上报、smart beta、service-clients 相关路径必须由 feature flag/env 显式开启，旧路径保持可用。开启 flag 需要单独的 flag-on 评审与回滚演练记录。

## 4. Changesets 状态与版本策略

- 当前工作区**未安装 changesets**（node_modules/.bin/changeset 不存在），本轮不执行 npm install；已提交 .changeset/config.json 作为配置与约定，安装后可直接使用。
- 安装后的标准流程（需在发布任务中执行并评审）：npx changeset（写变更说明）→ npx changeset version（按 semver bump 包版本并更新内部依赖）→ 人工核对 versions.json 与锁文件 → 提交后生成发布清单。
- 私有包策略：privatePackages.version=true，tag=false；不发布到公共 npm。
- bump 规则：
    * contracts：只允许 minor/patch 的加法演进；删除字段、改变语义、改变错误码含义必须 major 并单独评审。
    * library-format：同 contracts，加法优先；清单/文件布局变更需给旧客户端兼容期。
    * admin/cutter/smart 应用：功能向后兼容走 minor/patch；破坏兼容或需要用户手动迁移走 major。
    * service-clients：新包按 semver 演进（当前 1.0.0），只暴露 v1 契约接口；flag 默认关闭。

## 5. 发布清单生成流程

    node scripts/release/release-manifest.mjs --dry-run          # 打印 JSON + markdown，不写文件
    node scripts/release/release-manifest.mjs --check            # 版本/契约/列车校验，PASS/FAIL
    node scripts/release/release-manifest.mjs --out-dir dist/release
    node scripts/release/release-notes.mjs --since "14 days ago" --dry-run

- 清单字段：product/version/commit(branch+head)/dirty/contracts(CONTRACT_VERSION+source hash)/library-format/source hash/artifact(sha256+file count+mtime+tracked sample)/rollback_target(<commit>+<artifact_sha256>；dirty 工作区附 " (dirty)")/warnings/errors。repo 级 rollback_target 的 digest 由该 repo 所有 product artifact sha256 再 hash 得到，product 级使用自身 artifact_sha256。
- 三仓根目录默认值可在 scripts/release/lib.mjs 查看；通过 --repo-mixlab/--repo-cutter/--repo-smart-cutter 或环境变量 MIXLAB_REPO/MIXLAB_CUTTER_REPO/MIXLAB_SMART_REPO 覆盖，不把本机绝对路径写入发布产物。
- 产物存储：清单 JSON/Markdown 作为 CI/发布任务 artifact 保存（建议按 release-train/日期命名），**不提交进 git**；dirty 工作区生成的清单必须显式标注，不能当作正式发布证据。
- 工具限制：仅调用 read-only git（rev-parse/status/log/describe/tag/show/diff/ls-files/hash-object/merge-base），从不执行 publish/tag/commit/push。

## 6. 发布门禁与证据

1. 三仓 typecheck 0 error；三仓全量测试通过（以 Lead gate 记录为准）。
2. node scripts/release/release-manifest.mjs --check RESULT: PASS（dirty 只算 WARN，但正式发布要求 dirty 收敛）。
3. 构建产物由记录 commit 重新构建，artifact hash 与清单一致；desktop 安装包需 Windows 空闲机验收记录。
4. contracts/library-format 加法审查记录；客户端最低版本 min_client_version 与清单一致。
5. 回滚目标（上一版本 manifest + 安装包/镜像/指针备份）已在发布前确认存在，见 docs/operations/rollback-runbook.md。
6. 新能力 feature flag 默认关闭 + 回滚演练记录。

## 7. 回滚触发条件（摘要）

详见 scripts/release/versions.json 的 rollback_triggers 与 rollback-runbook.md：

| ID | 级别 | 触发 | 动作 |
|---|---|---|---|
| RB-01 | P0 | 数据丢失/错误覆盖已完成素材/公共库被非预期删除 | 停止列车，按 runbook 回滚服务与静态资源，保留现场 |
| RB-02 | P0 | 发布指针异常或剪辑端读错公共库版本 | 回滚指针到上一已验证版本，禁止手工编辑指针 |
| RB-03 | P1 | Windows 安装失败/崩溃率超阈值（>=5% 或同批多机复现） | 撤回安装包，回滚上一版并通知恢复工作区备份 |
| RB-04 | P1 | 契约/库格式非加法变更或兼容错误率上升 | 停止列车，回滚契约包与客户端，单独评审 |
| RB-05 | P1 | 身份/事件 service 模式错误率上升或登录/事件不可用 | flag 关闭新路径，切回 legacy 共享文件模式（先确认旧写入者与 outbox） |

## 8. Phase 3 入口条件与遗留项

- 入口条件：三仓 gate 绿；发布清单工具与回滚 runbook 演练过一次；contracts/library-format 已提交（当前 packages/contracts/src 与 packages/library-format/src 在工作区为 untracked，需先纳入版本控制）；desktop 产物构建链可复现。
- 遗留项：service-clients 包已出现于工作区但为 untracked（并行 Round5 工作流产出），发布前必须先纳入版本控制；身份/事件 service 模式迁移执行器与 outbox 排空工具未在本轮范围；changesets 依赖未安装；发布列车窗口需与团队排班确认。



## 9. 每产品独立发布列车、冻结与热修流程（Round6 补充）

### 9.1 独立发版条件

每个产品可独立发版，但必须满足下表条件；不满足则只能随列车等待或走热修审批。

| 产品 | 独立发版前置 | 共享依赖门禁 | 证据 |
|---|---|---|---|
| admin（admin-web + admin-api） | admin 仓 typecheck+全量测试绿；admin-web 构建产物由记录 commit 重建；灰度/冒烟通过 | contracts/library-format source hash 与上一发布清单一致或仅加法演进 | release-manifest.json（dirty 收敛）、构建 artifact sha256、登录/首页/发布/设置冒烟记录 |
| cutter（web + Windows desktop） | cutter 仓测试绿；Windows 空闲机安装/升级/回滚验收；安装包 SHA 归档 | library-format hash 与当前公共库兼容；发布指针可解析 | 安装包 SHA、四路径验收记录、发布指针校验、旧客户端可读性 |
| smart（web + desktop） | smart 仓测试绿；候选线隔离环境验证；新能力 flag 默认关 | contracts hash 与 admin/cutter 三仓一致；library-format 兼容 | flag 默认关证据、隔离环境回归、contract hash 对比 |
| contracts | additive-only 审查；三仓 typecheck/tests 使用新契约绿；CONTRACT_VERSION 与 versions.json 一致 | 只有加法变更；major 需 --allow-breaking 与单独评审 | 契约 diff、三仓 tests 日志、release:check PASS |
| library-format | additive-only 审查；多客户端兼容（旧版本可读新数据/新版本可读旧数据）；hash 门禁 | 三仓 packages/library-format/src source hash 一致 | 兼容性测试、source hash、迁移/回退说明 |
| service-clients | 客户端契约测试绿；flag 默认关闭；错误码映射与 contracts 对齐 | contracts hash 一致；服务模式（legacy/service）可回退 | 客户端测试、flag 状态、模式回退演练记录 |

**共享包 hash 门禁**：发布前对 mixlab / cutter / smart 三仓分别计算 packages/contracts/src 与 packages/library-format/src 的内容 hash（release-manifest 已输出 contracts.source_hash / library_format.source_hash）；三仓 hash 不一致时禁止独立发布依赖方产品，先同步共享包或记录兼容例外。当前 cutter/smart 为分叉交付线，独立发版前必须显式核对 hash 与版本。

### 9.2 冻结窗口

- weekly（admin 系）：周三 18:00 后冻结；周四只接受 P0/P1 热修；周五发布候选。
- biweekly（cutter）：安装包构建完成后产物冻结（SHA 锁定）；发布前 24 小时停止合并非热修变更；Windows 验收机需空闲。
- monthly（smart + 共享包）：每月最后一个完整周冻结；契约/库格式在该窗口内只允许加法修复。
- 冻结期内的热修必须走 9.3 热修路径并记录绕行原因；冻结合并需发布负责人 + 技术负责人双签。

### 9.3 热修路径（hotfix）

1. 从上一已验证发布 tag/commit 切出 hotfix 分支（禁止在 dirty 工作区直接发布）；只包含最小修复，不带无关重构。
2. 单产品热修只 bump 该产品版本（npm run release:bump -- --product <product> --bump patch --write）；共享包热修需同时评估三仓消费者，contracts/library-format 仅允许加法。
3. 必跑：产品 typecheck+测试、release:check、release:manifest（dirty 必须收敛或明确记录补丁）、changelog-entry 草稿。
4. 评审：P0 可事后补审但需 24h 内记录；P1 需双人 review；涉及契约/库格式/权限/迁移的热修需对应负责人签字。
5. 发布后：更新 rollback runbook 记录、补发布说明与根因分析；热修不得跳过回滚目标登记。

### 9.4 版本 bump 与 changelog 工具（无外部依赖）

    npm run release:bump -- --product admin --bump patch --dry-run     # 默认 dry-run，打印 before -> after
    npm run release:bump -- --product contracts --bump minor --write   # 写回 package.json
    npm run release:bump -- --product all --bump patch --dry-run
    npm run release:changelog -- --product all --since "7 days ago" --out dist/release/changelog.md
    node scripts/release/version-bump.mjs --list-products
    node --test scripts/release/versioning.test.mjs

约束：纯 Node 实现，不调用 npm/git 写、不安装依赖；contracts/library-format 的 major bump 必须显式 --allow-breaking 并附独立评审记录。--write 后必须同步 scripts/release/versions.json 的 expected 版本，再跑 release:check 与 release:manifest。

### 9.5 回滚触发与发布证据

回滚触发沿用第 7 节 RB-01..RB-05 与 rollback-runbook.md。每次独立发版必须归档：release-manifest.json/md（非 dirty 或注明补丁）、changelog 草稿/正式说明、版本 bump diff、构建/安装包 SHA、三仓 gate 日志、回滚目标（上一版 manifest + 安装包/镜像/指针备份）、审批记录。证据随发布列车归档，不提交进 git。

