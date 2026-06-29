# Admin Docker MVP v0.1 Plan

更新时间：2026-06-29

## 决策结论

当前开发路线从完整 `Admin Architecture v1` 大重构，临时收敛为：

```text
Admin Docker MVP v0.1
= 新版 Docker 管理端可用
+ 管理端登录
+ 剪辑师管理
+ 受控预处理素材管理
+ Cutter 日常使用不受影响
```

这不是放弃 `Admin Architecture v1`，而是把它改成可上线、可验证、可逐步演进的路线。MVP v0.1 先验证核心架构和 Docker 运行闭环；通过后再逐步解锁发布、扫描、恢复、索引修复和深度页面重构。

## 用户确认的产品目标

用户已明确选择：

- 优先目标：尽快有一个新版 Docker 管理端可用。
- 可接受首版偏极简。
- 首版必须有：管理端登录、剪辑师管理、预处理素材管理、预处理可正常使用。
- 必须保证：剪辑端正常、ready 素材不被误伤。
- 除以上核心能力外，其他功能可以隐藏，必要时后续删除。
- 首版 Docker 不要求完整后台，只需要核心管理能力可用。
- 最担心风险：误伤已预处理数据、影响剪辑端。
- 长期方向：先验证核心架构，再继续中长期架构重构。

## 总目标

在不改变 Cutter release/index/search 协议、不重跑已 ready 素材、不迁移 NAS 目录结构的前提下，交付一个可在 NAS Docker 上运行的新版极简管理端。

MVP v0.1 必须做到：

1. 管理端可登录、会话稳定、用户存储可写。
2. 剪辑师管理可用，包括查看、审批、停用、重置密码。
3. 管理端可查看并管理预处理素材状态。
4. 预处理可运行，但必须处于受控预处理模式。
5. 预处理不能让 `ready` 素材重新入队、降级、下线或重新处理。
6. 首版不自动发布到 Cutter，避免影响当前 `v010471` release/index。
7. Cutter 日常使用不受影响，公共素材首屏、搜索、详情、剪切继续可用。

## 非目标

MVP v0.1 不做：

- 不做完整 Admin 页面重设计。
- 不开放全量 scan apply。
- 不自动发布到 Cutter。
- 不开放 index repair。
- 不开放 command snapshot restore。
- 不迁移 NAS 目录结构。
- 不改变 Cutter 读取协议。
- 不重跑或重建 `10471+` 已 ready 素材。
- 不做大面积物理删除代码。
- 不把 `admin.sqlite` 当作资产事实来源；它只是管理端查询优化。
- 不把当前旧 NAS `18080` 入口当作新版 Docker 通过证据。

## 当前环境基线

| 项目 | 当前事实 | MVP 约束 |
| --- | --- | --- |
| Mac 管理端 Web | `http://127.0.0.1:5176` | 本机开发验证入口。 |
| Mac 管理端 API | `http://127.0.0.1:3889` | 本机 API 验证入口。 |
| NAS 桌面入口 | `http://192.168.1.27:9999/desktop/#/` | 已可通过浏览器只读打开 Docker 面板；只作为观测入口，不等于发布授权。 |
| NAS 当前可见入口 | `http://192.168.1.27:18080` | 当前为旧管理端观测入口，不等于新版通过。 |
| NAS Compose 默认入口 | `8080` | 当前从 Mac 侧观测连接失败，后续 staging 需明确端口。 |
| NAS access preflight | SSH/DSM/Docker TCP/`8080` 关闭；`18080`/`9999` 打开；当前 Mac 侧 `/Volumes/MixLab` 未挂载，SMB handoff archive 不可见，但 UGOS browserless Docker evidence path 仍可用；最新证据 `docs/acceptance/artifacts/admin-docker-nas-access-preflight-20260629T014929Z.json` 为 `ready-for-nas-collection`，`nas_collection_directly_available=true`。 | 当前已能从 Mac 通过 UGOS 只读 API 自动收集 NAS Docker release inputs；这仍不等于 staging 或发布批准。若要走 SMB handoff/手工包路径，需先恢复 `/Volumes/MixLab` 挂载。 |
| NAS UGOS API preflight | `http://192.168.1.27:9999/desktop/` 可读，UGOS desktop `1.15.0.77682` / build `4/23/2026`；脚本支持内存态 username/password 登录并兼容 NAS 返回的 RSA key 格式。最新证据 `docs/acceptance/artifacts/admin-docker-nas-ugos-api-preflight-20260628T225530Z.json` 为 `browserless-collection-ready`，Docker app uid 和 `ContainerListV2` 可读；通用 `verify/is_login` 与 overview 返回 `1114` 不再作为 returned-evidence 采集阻断。 | UGOS API 可作为 browserless Docker 只读证据通道。密码、Cookie、token 只允许内存/环境变量传入，artifact 不记录真实值；这仍不批准 push/deploy/启停容器。 |
| NAS release inputs | Mac 侧已通过 UGOS browserless 只读采集生成 sanitized returned evidence：`docs/acceptance/artifacts/admin-docker-nas-ugos-returned-evidence-20260628T225531Z/admin-docker-release-inputs`。该证据显示当前旧栈仍为 `latest` 镜像、worker flags 为 `1/1`、缺少 `MIXLAB_ADMIN_DOCKER_MVP_MODE` 与 `MIXLAB_PREPROCESS_LIBRARY_ROOT`、磁盘 `98%` 但可用空间约 `681GB`；分层磁盘 proof `docs/acceptance/artifacts/admin-docker-nas-disk-proof-20260629T015141Z.json` 已接受 no-worker staging 余量，同时 `preprocess_space_accepted=false` 继续阻断预处理。最新 intake `docs/acceptance/artifacts/admin-docker-nas-release-inputs-intake-20260629T015153Z.json` 已使 `release_inputs_ready=true`，但仍因 `admin-worker-proof-accepted` blocked；最新 readiness `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260629T015249Z.json` 为 `7/13` gate 通过、`docker_upload_allowed=false`。 | UGOS returned evidence 只用于只读诊断和本地门禁输入，不等于正式发布批准；legacy latest rollback exception 只能用于 release-input 生成，不能绕过 worker proof、Cutter staged proof、显式 push approval 和最终 release review。磁盘 proof 只清理 no-worker staging 余量，不开放预处理。Staging runbook 会校验手填 current/target/rollback tag 必须与 release-inputs 报告一致。 |
| Mac Docker capability | 未发现 `docker`、`docker compose`、Colima、Podman | 本机不能完成 local Docker smoke；需要 Docker-capable machine 或 GitHub/staging 证据替代。 |
| Windows Test Runner | `http://192.168.1.20:3799` 可达，runner `0.1.32` | 只能证明 Windows Runner 在线；没有 staged candidate 前不能作为 Docker MVP Cutter 兼容通过证据。 |
| Docker 公共素材库路径 | `/data/PublicLibrary` | Docker 内唯一正式库路径。 |
| Mac 公共素材库路径 | `/Volumes/MixLab/PublicLibrary` | Mac 本机验证路径，不能和 Docker 路径混淆。 |
| 生产 ready 基线 | `10471` | MVP 前后不得减少。 |
| 当前索引 | `v010471` | MVP v0.1 前后不得改变。 |
| 总视频观测 | `11394` | 用于上线前后只读对账。 |
| 磁盘风险 | 曾观测约 `98%`、可用约 `681GB`；no-worker staging disk proof 已 accepted，preprocess space 仍 blocked | 预处理必须继续受磁盘门禁约束；首个 workers 关闭的 staging 可用绝对余量证明，不等于允许预处理。 |

## 当前已完成远端候选证据

2026-06-28 已完成当前 Docker runtime candidate 的 GitHub Docker-capable dry-run 证据收口，但仍不代表 NAS 已发布，也不代表可以上传镜像。历史候选 `b062bc387c1fdb2a391320c1c36233b782cb000a`、`97f2d513a4a27315929b4d964320d4170b4b4631`、`f9aa9bc7dea187dc3029c90389d5c3c08938dd58`、`25fe2264de7b391a56e770a8acb6bf40ebec3863`、`b945418df2a447fd39bb9c88f781322594fc11c0` 只保留为旧证据；release tooling guard 归档后，当前 Docker runtime candidate 已刷新为 `4cb5b18262e49894d4272b0fc940be6c1d2102b4`。

- workflow tag hardening：`.github/workflows/docker-admin.yml` 已改为只给 `mixlab-admin-runtime` 与 `mixlab-admin-web` 推送 immutable `${{ github.sha }}` tag，不再推送 mutable `latest`；`audit:delivery-readiness` 与目标证据测试会拒绝重新引入 runtime/web `:latest`。
- compose tag hardening：`deploy/nas/mixlab/docker-compose.yml` 已去掉 `MIXLAB_IMAGE_TAG:-latest` fallback，改为要求显式 `MIXLAB_IMAGE_TAG` immutable candidate SHA；`.env.example` 中 `MIXLAB_IMAGE_TAG` 保持空值，复制到 NAS 后必须手动填入已验收候选 tag。最新静态 dry-run `docs/acceptance/artifacts/admin-docker-release-gate-dry-run-20260628T223510Z.json` 通过 compose static contract，但仍 `docker_upload_allowed=false`。
- previous b945 candidate tag：`admin-docker-candidate-b945418df2a447fd39bb9c88f781322594fc11c0`，远端 tag 指向 `b945418df2a447fd39bb9c88f781322594fc11c0`。
- branch dry-run：GitHub Actions run `28334995373`，ref `codex/windows-first-run-autostart-20260615104835`，`push_images=false`，workflow success，`Log in to GHCR` skipped，未推送镜像。
- tag dry-run：GitHub Actions run `28338518625`，ref `admin-docker-candidate-b945418df2a447fd39bb9c88f781322594fc11c0`，`push_images=false`，workflow success；typecheck、searchd tests、delivery readiness、evidence kit、Docker MVP smoke、runtime/web image build、staging/readiness reports 全部通过；`Log in to GHCR` skipped，未推送 GHCR 镜像。
- previous b945 tag dry-run 证据：`docs/acceptance/artifacts/admin-docker-github-run-artifact-20260628T224810Z.json`，对应 artifact readiness `docs/acceptance/artifacts/admin-docker-github-artifact-readiness-20260628T224810Z.json` 为 `candidate-ready`，image tag/build SHA 均为 `b945418df2a447fd39bb9c88f781322594fc11c0`，`docker_deploy_allowed=false`。
- previous b945 candidate-ref proof：`docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260628T224835Z.json`，`candidate_ref_proof_accepted=true`，`docker_deploy_allowed=false`。
- current candidate tag：`admin-docker-candidate-4cb5b18262e49894d4272b0fc940be6c1d2102b4`，远端 tag 指向 `4cb5b18262e49894d4272b0fc940be6c1d2102b4`。
- current tag dry-run：GitHub Actions run `28339129475`，ref `admin-docker-candidate-4cb5b18262e49894d4272b0fc940be6c1d2102b4`，`push_images=false`，workflow success；typecheck、searchd tests、delivery readiness、evidence kit、Docker MVP smoke、runtime/web image build、staging/readiness reports 全部通过；`Log in to GHCR` skipped，未推送 GHCR 镜像。
- current tag dry-run 证据：`docs/acceptance/artifacts/admin-docker-github-run-artifact-20260628T231156Z.json`，对应 artifact readiness `docs/acceptance/artifacts/admin-docker-github-artifact-readiness-20260628T231156Z.json` 为 `candidate-ready`，image tag/build SHA 均为 `4cb5b18262e49894d4272b0fc940be6c1d2102b4`，`docker_deploy_allowed=false`。
- current candidate-ref proof：`docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260628T231223Z.json`，`candidate_ref_proof_accepted=true`，`docker_deploy_allowed=false`。
- current pre-staging handoff：`docs/acceptance/artifacts/admin-docker-prestaging-handoff-20260628T231236Z.json`，`ready_to_request_release_inputs=true`，但 `staging_execution_ready=false`；staging execution 前置阻断为 `nas-disk-risk-carried-forward`、`explicit-push-approval-required`、`current-and-rollback-tags-required`。
- current release-manager exception review：`docs/acceptance/artifacts/admin-docker-legacy-rollback-exception-review-20260629T014448Z.json`，`exception_review_accepted=true`，确认当前旧 NAS `latest` 只能作为一次性 current/rollback release-input 输入；该 artifact 明确 `release_execution_allowed=false`、`docker_deploy_allowed=false`，不能替代 push/deploy/release approval。
- current release inputs：`docs/acceptance/artifacts/admin-docker-release-inputs-20260629T014456Z.json`，`ready-for-release-decision`，`release_inputs_ready=true`，`push_execution_allowed=false`，`docker_deploy_allowed=false`；已读取 `docs/acceptance/artifacts/admin-docker-legacy-rollback-plan-20260629T011940Z.json` 与 release-manager review artifact，生成 `current_image_tag=latest`、`rollback_image_tag=latest`、`target_image_tag=4cb5b18262e49894d4272b0fc940be6c1d2102b4`，当前 release-input 阻断清零，但 push 仍被 `explicit-release-approval-required` 阻断。
- current NAS release-inputs handoff：`docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-20260628T231411Z.json`，`handoff_package_ready=true`，bundle 指向 `4cb5b18262e49894d4272b0fc940be6c1d2102b4`；本地 `validate-returned-evidence.sh` 会在 returned evidence precheck 和 intake 后自动刷新 release readiness summary，但不允许 push/deploy。
- current NAS handoff portable kit：`docs/acceptance/artifacts/admin-docker-nas-handoff-kit-20260628T231415Z.json`，`kit_ready=true`，便携目录为 `dist/acceptance/admin-docker-nas-handoff-kit`，单文件包为 `dist/acceptance/admin-docker-nas-handoff-kit.tar.gz`，sha256 `a668803edb2e609546ac116826ff61076ffd75fea57a1b1b5b0526b0ac0b4841`；包含 `KIT-SELF-CHECK.sh` 与 `KIT-FILES.sha256`。
- current NAS handoff transfer：`docs/acceptance/artifacts/admin-docker-nas-handoff-transfer-20260628T231418Z.json`，已将 `admin-docker-nas-handoff-kit.tar.gz` 复制到 `/Volumes/MixLab/安装包/mixlab-admin-docker-handoff/`，目标文件 sha256 同为 `a668803edb2e609546ac116826ff61076ffd75fea57a1b1b5b0526b0ac0b4841`；本步骤只写 NAS `安装包` 交付目录，不接触 Docker runtime、不写 `PublicLibrary`、不启停容器、不运行预处理。
- current Cutter staged proof plan：`docs/acceptance/artifacts/admin-cutter-staged-proof-plan-20260628T231319Z.json` 为 plan-only，已为候选 `4cb5b18262e49894d4272b0fc940be6c1d2102b4` 生成 Windows Runner `windows_acceptance`、`real_cut_smoke` 和可选 `desktop_ui_screenshot_smoke` 的请求/轮询/验证命令模板；它不接触 Windows Runner、NAS、Docker、Admin API 或 Cutter API，不记录 auth 值，也不批准 Docker upload。
- current NAS disk proof：`docs/acceptance/artifacts/admin-docker-nas-disk-proof-20260629T015141Z.json`，`proof_accepted=true`、`staging_space_accepted=true`、`preprocess_space_accepted=false`；该 proof 只清理 no-worker Docker staging 余量，不允许预处理或 Docker deploy。
- current NAS release-input intake：`docs/acceptance/artifacts/admin-docker-nas-release-inputs-intake-20260629T015153Z.json`，`release_inputs_ready=true`，`push_execution_allowed=false`，`docker_deploy_allowed=false`，但 `intake_complete=false`；剩余 intake 阻断只剩 `admin-worker-proof-accepted`。
- current staging runbook：`docs/acceptance/artifacts/admin-docker-staging-runbook-20260629T021109Z.json`，`23` 个 gate、`19` 个通过、`4` 个阻塞，`staging_execution_ready=false`，`staging_review_ready=false`，`docker_deploy_allowed=false`；staging execution 层当前只剩 `image-push-explicitly-approved`，但完整 staging 仍被 parity、admin-worker 与 Cutter staged-candidate proof 阻断。
- current release readiness summary：`docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260629T021117Z.json`，`release_review_ready=false`，`image_push_allowed=false`，`docker_deploy_allowed=false`；最新汇总为 `14` 个 gate、`8` 个通过、`6` 个阻塞，legacy latest rollback exception 已 accepted、release inputs 已 ready、no-worker staging disk proof 已 accepted、push-decision package 已纳入总门禁；`automation_boundary` 明确本地只读/证据工作可继续，但 NAS runtime 变更、image push、Docker deploy 均不允许。
- current push decision package：`docs/acceptance/artifacts/admin-docker-push-decision-package-20260629T020021Z.json`，`push_decision_package_ready=true`，`push_execution_allowed=false`，`docker_deploy_allowed=false`；staging execution 当前只剩 `image-push-explicitly-approved`，并已准备精确 `push_images=true` workflow 命令供外部发布负责人审阅。该 package 只作为发布决策输入，不批准 NAS `.env` 编辑、容器 pull/restart、Docker deploy、worker 启用或预处理。
- 2026-06-29 GET-only live/parity/runbook/readiness refresh：基于只读探测 `docs/acceptance/artifacts/admin-docker-release-live-readonly-20260629T021039Z.json` 重新生成 `docs/acceptance/artifacts/admin-docker-version-parity-plan-20260629T021049Z.json`、`docs/acceptance/artifacts/admin-docker-staging-runbook-20260629T021109Z.json`、`docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260629T021117Z.json`。该轮确认 NAS `18080` 仍是旧 Admin API 合约：`/api/admin/auth/status`、`/api/admin/release-gates`、`/api/admin/data-loading/plan` 返回 `404`，`/api/admin/dashboard/metrics` 在 `10s` 超时；同时素材基线保持 `11394` total、`10471` ready、current index `v010471`、Docker library root `/data/PublicLibrary`，`library/status` 报告磁盘可用约 `16.6TB`。本轮未登录、未启停容器、未推送/拉取镜像、未写 NAS runtime、未写 `PublicLibrary`、未启动预处理。
- 2026-06-29 live-readonly refresh：`docs/acceptance/artifacts/admin-docker-release-live-readonly-20260629T011306Z.json` 使用 GET-only 重新探测 `http://192.168.1.27:18080`；Admin Web root 可达，`library/status` 约 `964ms` 返回，素材基线保持 `11394` total、`10471` ready、current index `v010471`、Docker library root `/data/PublicLibrary`。同时 `/api/admin/auth/status`、`/api/admin/release-gates`、`/api/admin/data-loading/plan` 仍为 `404`，`dashboard/metrics` 在 `10s` 超时，说明当前 NAS 仍是旧 Admin API 合约且慢 dashboard 仍存在；本轮只读探测未登录、未启停容器、未写 NAS runtime、未写 `PublicLibrary`、未启动预处理。
- 2026-06-29 parity/runbook/readiness refresh：基于上述 live-readonly 生成 `docs/acceptance/artifacts/admin-docker-version-parity-plan-20260629T011312Z.json`、`docs/acceptance/artifacts/admin-docker-staging-runbook-20260629T011326Z.json`、`docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260629T011326Z.json`。最新汇总仍为 `13` 个 gate、`6` 个通过、`7` 个阻塞；当前 Docker runtime candidate 仍固定为已 smoke 的 `4cb5b18262e49894d4272b0fc940be6c1d2102b4`，后续证据/文档提交不自动扩大为新的 runtime candidate，避免证据刷新导致候选 SHA 无限追逐。
- 2026-06-29 legacy rollback plan：新增 `plan:admin-docker-legacy-rollback`，生成 `docs/acceptance/artifacts/admin-docker-legacy-rollback-plan-20260629T011940Z.json`。该计划确认当前旧 NAS 栈是一致的 `latest` 部署、候选 `4cb5b18262e49894d4272b0fc940be6c1d2102b4` 已 GitHub smoke、workflow 不再 push `latest`、compose 不再默认 `latest`，所以“一次性 legacy latest rollback exception”已可进入发布审评；但 `release_execution_allowed=false`、`docker_deploy_allowed=false`，且仍要求显式接受该例外、disk/worker/Cutter/release inputs/staging gates 继续通过后才允许任何 push 或 staging。
- 2026-06-29 release-input/readiness legacy gate integration：新增 `review:admin-docker-legacy-rollback-exception`，由 release-manager 角色生成可审计 exception review artifact；`validate:admin-docker-release-inputs` 与 `intake:admin-docker-nas-release-inputs` 已支持 `MIXLAB_ADMIN_DOCKER_LEGACY_ROLLBACK_EXCEPTION_REVIEW_REPORT`，优先用 accepted review artifact 接受一次性 `latest` current/rollback 输入，旧 `MIXLAB_DOCKER_LEGACY_ROLLBACK_EXCEPTION_APPROVAL` 仅保留为显式 fallback。该机制只清理 release-input blocker，不改变 `push_execution_allowed=false`、`docker_deploy_allowed=false`。
- NAS desktop authenticated readonly follow-up：通过 NAS 桌面 Docker UI 只读确认项目 `mixlab-server` 运行中，`admin-web`、`admin-api`、`admin-worker` 三个容器均运行且仍使用 mutable `latest`；`admin-web` 暴露 `18080 -> 80/TCP`，`admin-api` 与 `admin-worker` 都读写挂载 `/data/PublicLibrary`，worker 环境显示 `MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=1`、`MIXLAB_ENABLE_READY_PUBLISH_WORKER=1`，且未显示 `MIXLAB_PREPROCESS_LIBRARY_ROOT`；证据 `docs/acceptance/artifacts/admin-docker-nas-desktop-readonly-ugos-20260628T205936Z.json`。本轮未启停容器、未推送/拉取镜像、未写 NAS runtime、未写 `PublicLibrary`、未启动预处理。
- live readonly refresh：`docs/acceptance/artifacts/admin-docker-release-live-readonly-20260628T210026Z.json`，GET-only 探测 NAS `http://192.168.1.27:18080`；Admin Web root 可达，但 `/api/admin/auth/status`、`/api/admin/release-gates`、`/api/admin/data-loading/plan` 仍缺失，说明 NAS 仍是旧 Admin API 合约；素材统计保持 ready `10471`、current index `v010471`、total `11394`，queued `904`、index-required `19`，磁盘仍约 `98% blocked`。
- returned evidence/intake refresh：`docs/acceptance/artifacts/admin-docker-nas-desktop-returned-evidence-20260628T210033Z/admin-docker-release-inputs` 为桌面只读证据转换包，precheck 因 worker inspect 缺少 `/data/PublicLibrary` preprocess root 证据阻断；`docs/acceptance/artifacts/admin-docker-nas-release-inputs-intake-20260628T210052Z.json` 仍为 `blocked`，阻断项包括 returned evidence precheck、NAS image proof、admin-worker proof、NAS disk proof、release inputs 与 staging runbook。
- NAS access preflight refresh：`docs/acceptance/artifacts/admin-docker-nas-access-preflight-20260628T220827Z.json`，确认 NAS 共享已可见 portable kit，但 `nas_collection_directly_available=false`；阻塞项仍为 SSH 不可用、compose project 未在 SMB 可见、returned evidence 未返回。
- staging runbook：`docs/acceptance/artifacts/admin-docker-staging-runbook-20260628T204026Z.json`，`staging_execution_ready=false`，`staging_review_ready=false`，`docker_deploy_allowed=false`；仍缺 current/target/rollback tag、显式 push approval、release inputs、NAS disk proof、parity、admin-worker 与 Cutter staged-candidate proof。
- release readiness summary：`docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T224950Z.json`，`release_review_ready=false`，`docker_upload_allowed=false`；最新汇总仍为 `13` 个 gate、`6` 个通过、`7` 个阻塞，阻塞项为 live readonly、parity、worker proof、Cutter proof、NAS returned evidence intake、release inputs、staging runbook；`automation_boundary` 明确本地只读/证据工作可继续，但 NAS runtime 变更、image push、Docker deploy 均不允许。
- latest read-only refresh：`docs/acceptance/artifacts/admin-docker-release-live-readonly-20260628T211731Z.json` 继续证明 `18080` 仍是旧 Admin API 合约，`auth/status`、`release-gates`、`data-loading/plan` 返回 `404`；`library/status` 仍为 `/data/PublicLibrary`、`11394` total、`10471` ready、current index `v010471`。同轮 `docs/acceptance/artifacts/admin-docker-nas-access-preflight-20260628T211711Z.json` 显示 handoff archive 可见，但 SSH/Compose project/returned evidence 仍不可用；`docs/acceptance/artifacts/admin-docker-nas-ugos-api-preflight-20260628T211711Z.json` 显示 UGOS API 仍不能替代正式 NAS collector。
- Cutter staged proof plan：`docs/acceptance/artifacts/admin-cutter-staged-proof-plan-20260628T224949Z.json` 为 plan-only，已为候选 `b945418df2a447fd39bb9c88f781322594fc11c0` 生成 Windows Runner `windows_acceptance`、`real_cut_smoke` 和可选 `desktop_ui_screenshot_smoke` 的请求/轮询/验证命令模板；它不接触 Windows Runner、NAS、Docker、Admin API 或 Cutter API，不记录 auth 值，也不批准 Docker upload。
- release readiness refresh：`docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T214012Z.json` 已吸收最新 live readonly、NAS access 和 Cutter staged proof plan；`release_review_ready=false`、`docker_upload_allowed=false`，仍为 `13` 个 gate、`5` 个通过、`8` 个阻塞。observations 明确 `cutter_staged_plan_ready=true`、candidate `25fe2264de7b391a56e770a8acb6bf40ebec3863`，但最终 `cutter-proof-accepted` 仍阻塞发布，避免把 plan-only 证据误当作 staged proof 通过。
- UGOS browserless Docker read correction：`scripts/acceptance/admin-docker-nas-ugos-api-preflight.ts` 已从旧 `ContainerList` 修正为 Docker 子应用真实只读 `ContainerListV2` + `ObtainOverviewInfo` 探测；最新 `docs/acceptance/artifacts/admin-docker-nas-ugos-api-preflight-20260628T213908Z.json` 为 `browserless-collection-ready`，证明 Mac 侧可用内存态 UGOS 登录读取 NAS Docker 容器列表和概览。该证据不记录密码、Cookie 或 token，也不触发容器启停、镜像推拉、runtime 写入、`PublicLibrary` 写入或预处理。
- UGOS browserless returned evidence：新增 `scripts/acceptance/admin-docker-nas-ugos-returned-evidence.ts` 与 `collect:admin-docker-nas-ugos-returned-evidence`，通过 UGOS Docker 只读接口和 Admin live-readonly 指标生成 sanitized returned evidence；最新证据 `docs/acceptance/artifacts/admin-docker-nas-ugos-returned-evidence-20260628T215113Z.json`、返回目录 `docs/acceptance/artifacts/admin-docker-nas-ugos-returned-evidence-20260628T215113Z/admin-docker-release-inputs`。当前 NAS 旧栈被自动证明为 `latest`、worker flags `1/1`、缺少 MVP mode/preprocess root、磁盘 `98%`；precheck `worker-inspect-roots` 阻断，intake `docs/acceptance/artifacts/admin-docker-nas-release-inputs-intake-20260628T215137Z.json` 和 readiness `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T215141Z.json` 均保持 blocked、`docker_upload_allowed=false`。
- returned-evidence gate split：`admin-docker-nas-returned-evidence-precheck` 现在只验证 returned evidence 的文件完整性、allowlist、JSON/env 形状和敏感字段，不再提前替代 `admin-worker-env-proof` 判断 root/flags 语义。同一 UGOS returned evidence 已重新 intake：`docs/acceptance/artifacts/admin-docker-nas-release-inputs-intake-20260628T215549Z.json`，`returned_precheck_passed=true`，并生成 `admin-docker-nas-image-proof-20260628T215549Z.json`、`admin-worker-env-proof-20260628T215549Z.json`、`admin-docker-nas-disk-proof-20260628T215549Z.json`。最新 readiness `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T215554Z.json` 为 `6/13` gate 通过，仍 `release_review_ready=false`、`docker_upload_allowed=false`；当前真实阻断为 image latest、worker flags/roots、disk 98%、Cutter staged proof、显式 push approval 和 staging/release inputs。
- staging tag-source consistency gate：`admin-docker-staging-runbook` 现在在读取 release-inputs 报告时，要求手填 `MIXLAB_DOCKER_CURRENT_IMAGE_TAG`、`MIXLAB_DOCKER_TARGET_IMAGE_TAG`、`MIXLAB_DOCKER_ROLLBACK_IMAGE_TAG` 必须分别匹配 release-inputs 中的 current/target/rollback tag。最新重跑 artifact：`docs/acceptance/artifacts/admin-docker-staging-runbook-20260628T220358Z.json`、`docs/acceptance/artifacts/admin-docker-nas-release-inputs-intake-20260628T220358Z.json`、`docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T220403Z.json`；总门禁仍为 `6/13` 通过，`release_review_ready=false`、`docker_upload_allowed=false`。这不是批准 staging，而是防止后续人工 env 输入与已验收 release-inputs 证据漂移。
- handoff kit refresh after staging gate update：已重新生成并传输 NAS handoff kit，确保交付给 NAS 的 `validate-returned-evidence.sh`、operator checklist 和 bundle manifest 与最新 staging tag-source consistency gate 对齐。新证据：`docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-20260628T220801Z.json`、`docs/acceptance/artifacts/admin-docker-nas-handoff-kit-20260628T220806Z.json`、`docs/acceptance/artifacts/admin-docker-nas-handoff-transfer-20260628T220819Z.json`；NAS 共享目标 `/Volumes/MixLab/安装包/mixlab-admin-docker-handoff/admin-docker-nas-handoff-kit.tar.gz` sha256 为 `6e73f0867694a5578baf6fb895d33e8edabe993e10f1fa44e982a4d459891fca`。最新 access preflight `docs/acceptance/artifacts/admin-docker-nas-access-preflight-20260628T220827Z.json` 仍只证明 handoff archive 可见，直接采集仍 blocked；最新 readiness `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T220835Z.json` 仍为 `6/13` 通过、`release_review_ready=false`、`docker_upload_allowed=false`。
- UGOS password-auth browserless collection：`scripts/acceptance/admin-docker-nas-ugos-auth.ts` 现在可用内存态账号密码登录 UGOS，兼容 NAS 返回的 `BEGIN RSA PUBLIC KEY` 外壳，并只输出脱敏登录状态。最新 UGOS preflight `docs/acceptance/artifacts/admin-docker-nas-ugos-api-preflight-20260628T222127Z.json` 为 `browserless-collection-ready`；UGOS returned evidence `docs/acceptance/artifacts/admin-docker-nas-ugos-returned-evidence-20260628T221951Z.json` 已生成 sanitized `admin-docker-release-inputs/`；NAS access preflight `docs/acceptance/artifacts/admin-docker-nas-access-preflight-20260628T222345Z.json` 已转为 `ready-for-nas-collection`、`nas_collection_directly_available=true`。最新 readiness `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T222445Z.json` 仍为 `6/13` 通过、`release_review_ready=false`、`docker_upload_allowed=false`，真实阻断仍是当前 NAS 旧栈 `latest`、worker flags/roots、磁盘 `98%`、live/parity/Cutter staged proof 和显式 release decision。
- UGOS credentialed readonly refresh：使用内存态 NAS 登录信息重新采集只读证据，UGOS preflight `docs/acceptance/artifacts/admin-docker-nas-ugos-api-preflight-20260628T223914Z.json` 为 `browserless-collection-ready`；UGOS returned evidence `docs/acceptance/artifacts/admin-docker-nas-ugos-returned-evidence-20260628T223915Z.json` 已生成 sanitized `admin-docker-release-inputs/`；intake `docs/acceptance/artifacts/admin-docker-nas-release-inputs-intake-20260628T223922Z.json` 仍被 `nas-image-proof-accepted`、`admin-worker-proof-accepted`、`nas-disk-proof-accepted` 阻断；readiness `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T223922Z.json` 仍 `6/13` gate 通过、`release_review_ready=false`、`docker_upload_allowed=false`。本轮未启停容器、未推送/拉取镜像、未写 NAS runtime、未写 `PublicLibrary`、未启动预处理。
- UGOS credentialed readonly refresh after NAS credential handoff：使用内存态 NAS 登录信息再次采集只读证据，UGOS preflight `docs/acceptance/artifacts/admin-docker-nas-ugos-api-preflight-20260628T225530Z.json` 为 `browserless-collection-ready`；UGOS returned evidence `docs/acceptance/artifacts/admin-docker-nas-ugos-returned-evidence-20260628T225531Z.json` 已生成 sanitized `admin-docker-release-inputs/`；intake `docs/acceptance/artifacts/admin-docker-nas-release-inputs-intake-20260628T225559Z.json` 预检通过但仍被 `nas-image-proof-accepted`、`admin-worker-proof-accepted`、`nas-disk-proof-accepted` 阻断；live-readonly `docs/acceptance/artifacts/admin-docker-release-live-readonly-20260628T225611Z.json` 继续证明 `18080` 是旧 Admin API 合约，`auth/status`、`release-gates`、`data-loading/plan` 返回 `404`，素材基线仍为 `11394` total、`10471` ready、current index `v010471`；readiness `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T225612Z.json` 仍 `6/13` gate 通过、`release_review_ready=false`、`docker_upload_allowed=false`。本轮未启停容器、未推送/拉取镜像、未写 NAS runtime、未写 `PublicLibrary`、未启动预处理。
- Release tooling guard refresh：`intake:admin-docker-nas-release-inputs` 在未显式传 `MIXLAB_ADMIN_DOCKER_NAS_RETURNED_DIR` 时，会自动选择最新 sanitized returned evidence bundle；`admin-docker-version-parity-plan` 与 `admin-docker-release-readiness-summary` 会优先选择显式配置且 `safe_to_probe=true` 的 live-readonly artifact，避免后续无目标 dry-run 覆盖真实 NAS 只读证据。该更新只影响本地 release/acceptance tooling，不批准 push/deploy，不接触 NAS runtime。

这批证据只清除了“当前远端 Docker 候选构建/候选 smoke/tag-ref 固定”和“NAS 返回证据采集包准备好”层面的门禁。当前总门禁视图显示 NAS 手工采集路径已准备好，但 NAS returned evidence intake、NAS staging、NAS current/rollback image proof、NAS disk proof、admin-worker 外部 proof、Cutter staged-candidate compatibility proof、显式 push approval 和最终发布决策仍未完成。

## MVP 功能边界

### 必须保留并可用

| 功能 | 范围 | 验收 |
| --- | --- | --- |
| 管理端登录 | bootstrap/register/login/logout/status | Docker 内用户存储可写，登录不慢、不报存储写入错误。 |
| 剪辑师管理 | 列表、审批、停用、重置密码 | 写入 cutter user store，Cutter 登录准入符合预期。 |
| 预处理素材管理 | 查看 queued/processing/failed/index-required；查看任务日志；小批量 queue/retry/recover；start/stop supervisor | 仅非 ready 素材可进入预处理写操作，所有命令有门禁和审计。 |
| 素材状态查看 | 素材列表、筛选、详情、封面读取 | 不触发隐藏全库扫描，列表有分页或 read model 支持。 |
| 系统健康/门禁 | health、release gates、disk/path/asr/ffmpeg/preprocess safety | blocked 原因可见，禁止危险操作。 |

### 必须隐藏或默认禁用

| 功能 | MVP v0.1 决策 | 原因 |
| --- | --- | --- |
| scan apply | 隐藏/禁用 | 会写 library/source manifests。 |
| 自动 ready publish worker | 禁用 | 会改变 Cutter 可见 release/index。 |
| 发布到 Cutter | 禁用 | v0.1 不改变 `v010471`。 |
| index repair | 禁用 | 会写 index/release 和 manifest。 |
| command snapshot restore | 隐藏 | L5 高风险恢复操作。 |
| source folder 增删改 | 禁用 | 会改变后续扫描范围。 |
| 初始化生产素材库 | 禁用，除非协议缺失且单独维护 | 生产库已有协议树。 |
| ready 行 queue/retry/recover | 后端强阻断 | 防止 ready 重新预处理或下线。 |
| metadata/cover 编辑 | 默认禁用 | 非核心需求，v0.1 暂不开放。 |

## 受控预处理模式

MVP v0.1 的预处理不是“完全开放预处理”，而是 `Controlled Preprocess Mode`。

### 允许

- 查看预处理队列和处理历史。
- 查看单个任务日志。
- 对非 ready 素材执行 queue、retry、recover。
- 启动和停止预处理 supervisor。
- 让 worker 处理非 ready 素材。
- 处理完成后进入 `index-required`。

### 禁止

- 对 ready 素材执行 queue、retry、recover。
- 对 ready 素材重新处理。
- 自动把 `index-required` 发布到 Cutter。
- 自动改变当前 release/index。
- 在磁盘 blocked、ASR/FFmpeg/path 缺失、writer lease 被占用、supervisor 状态不安全时启动。

### 强制门禁

每个预处理写操作都必须通过：

- path profile 检查；
- Docker `/data/PublicLibrary` 路径检查；
- disk safety；
- ASR/FFmpeg readiness；
- writer lease；
- ready immutable guard；
- supervisor state guard；
- command audit；
- before/after ready count check；
- no Cutter release/index mutation check。

## 阶段计划

### Phase 0: MVP 基线与计划冻结

目标：

- 把本文件作为当前开发执行合同。
- 用只读方式确认 NAS/Mac/Docker/Cutter 边界。
- 明确首批代码改动文件和验收矩阵。

不做：

- 不改生产代码。
- 不写 NAS 数据。
- 不启动 worker。
- 不上传 Docker。

验收：

- 本文件存在并通过 markdown/diff 检查。
- 记录当前 ready/index/total/disk/API mismatch。
- 明确 Phase 1 具体改动范围。

### Phase 1: MVP 表面收敛与安全 Gate

目标：

- 管理端 UI 只暴露 MVP 核心功能。
- 高风险按钮隐藏或禁用。
- 后端增加统一 Docker MVP safety gate，防止 UI 漏出时误写。

预计改动模块：

- `apps/admin-web/src/app/navigation.ts`
- `apps/admin-web/src/app/AdminApp.tsx`
- `apps/admin-web/src/features/admin-ui-contract.ts`
- `apps/admin-web/src/features/dashboard/DashboardPage.tsx`
- `apps/admin-web/src/features/source-videos/SourceVideosPage.tsx`
- `apps/admin-web/src/features/preprocess-jobs/PreprocessJobsPage.tsx`
- `apps/admin-web/src/features/cutter-users/CutterUsersPage.tsx`
- `apps/admin-web/src/features/settings/SettingsPage.tsx`
- `apps/admin-web/src/features/index-publish/IndexPublishPage.tsx`
- `packages/admin-api/src/admin-command-guard.ts`
- `packages/admin-api/src/admin-route-adapter.ts`
- `packages/admin-api/src/admin-preprocess-command-routes.ts`
- `packages/admin-api/src/admin-source-video-command-routes.ts`
- `packages/admin-api/src/admin-library-command-routes.ts`
- `packages/admin-api/src/admin-index-command-routes.ts`
- `packages/admin-api/src/admin-settings-command-routes.ts`
- `packages/admin-api/src/admin-command-restore-routes.ts`
- `packages/admin-api/src/admin-write-route-audit.ts`

验收：

- MVP 导航只显示核心入口或危险入口只读化。
- 所有 L4/L5 操作在 MVP mode 下返回明确 blocked。
- ready 行预处理写操作返回 `409 preprocess_transition_blocked` 或等价错误。
- Admin Web 单元测试通过。
- Admin API command/gate 测试通过。

### Phase 2: 登录与剪辑师管理闭环

目标：

- Docker 内 admin user store 和 cutter user store 可稳定写入。
- 剪辑师管理进入 MVP 可用范围。

预计改动模块：

- `packages/library-fs/src/admin-users.ts`
- `packages/library-fs/src/cutter-users.ts`
- `packages/admin-api/src/admin-auth-routes.ts`
- `packages/admin-api/src/admin-cutter-user-command-routes.ts`
- `packages/admin-api/src/admin-cutter-user-commands.ts`
- `apps/admin-web/src/features/cutter-users/CutterUsersPage.tsx`
- `deploy/nas/mixlab/docker-compose.yml`

验收：

- `auth/bootstrap`、`auth/register`、`auth/login`、`auth/status`、`auth/logout` 通过。
- `cutter-users` 列表、审批、停用、重置密码通过。
- 明文密码、session token 不进入日志、审计或报告。
- 普通 session validation 不重写用户文件。

当前进展：

- `admin-users` 与 `cutter-users` store 已具备读重试、JSON 尾部填充容错、按 store path 串行写入、SMB `rename` 最终失败后的 direct-write fallback。
- 管理端 session validation 支持默认只读校验，只有显式 touch 时才更新 `last_seen_at`。
- 剪辑师注册、审批、停用、重置密码、session 失效和设备申请逻辑已在本地 focused tests 覆盖。
- 密码哈希、明文密码、session token 不进入 command audit 的关键路径已有测试覆盖。

当前本地验证：

- `node --test --import tsx packages/library-fs/src/admin-users.test.ts packages/library-fs/src/cutter-users.test.ts packages/admin-api/src/admin-auth-routes.test.ts packages/admin-api/src/admin-auth-commands.test.ts packages/admin-api/src/admin-auth-route-deps.test.ts packages/admin-api/src/admin-cutter-user-command-routes.test.ts packages/admin-api/src/admin-cutter-user-command-route-deps.test.ts packages/admin-api/src/admin-cutter-user-commands.test.ts`：`47` 项通过。

### Phase 3: 受控预处理模式闭环

目标：

- 预处理可在 Docker 管理端里使用。
- 仅非 ready 素材进入预处理。
- 预处理前后 Cutter 当前可见素材不变。

预计改动模块：

- `packages/admin-api/src/admin-preprocess-pipeline.ts`
- `packages/admin-api/src/admin-preprocess-command-routes.ts`
- `packages/admin-api/src/admin-transition-commands.ts`
- `packages/admin-api/src/admin-worker-lifecycle-commands.ts`
- `packages/admin-api/src/admin-worker-write-path-audit.ts`
- `packages/library-fs/src/preprocess-safety.ts`
- `packages/preprocess-core/src/library-worker.ts`
- `scripts/workers/preprocess-library-worker.ts`
- `scripts/docker/admin-worker-loop.ts`
- `deploy/nas/mixlab/docker-compose.yml`
- `apps/admin-web/src/features/preprocess-jobs/PreprocessJobsPage.tsx`

验收：

- disk blocked 时 start preprocess 被阻断。
- path/asr/ffmpeg 缺失时 start preprocess 被阻断。
- ready 素材无法 queue/retry/recover。
- queued/failed 非 ready 素材可小批量进入预处理。
- worker 默认关闭，只有受控启动路径能启用。
- 预处理完成后进入 `index-required`，不自动进入 Cutter release。
- ready count 和 current index 不变。

当前进展：

- `Controlled Preprocess Mode` 已存在：Docker MVP mode 会关闭 auto-scan 和 auto-publish-index，但保留 queue/retry/recover 与 worker queued 消费能力。
- `preprocess-safety` 已阻断磁盘不足、公共库不可用和现存 `processing` 任务；也支持用 processing snapshot 避免为了门禁扫描全部 manifest。
- Docker compose 与 `.env.example` 默认 `MIXLAB_ADMIN_DOCKER_MVP_MODE=v0.1`、`MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=0`、`MIXLAB_ENABLE_READY_PUBLISH_WORKER=0`。
- `runtime-config` 中 `publish-ready` worker 在 Docker MVP mode 下会强制 disabled，即使 env flag 误设为 `1` 也不会运行。

当前本地验证：

- `node --test --import tsx packages/admin-api/src/admin-preprocess-pipeline.test.ts packages/admin-api/src/admin-preprocess-command-route-deps.test.ts packages/admin-api/src/admin-preprocess-command-routes.test.ts packages/library-fs/src/preprocess-safety.test.ts packages/runtime-config/src/docker-worker.test.ts packages/preprocess-core/src/library-worker.test.ts`：`37` 项通过。

### Phase 4: Docker Staging 候选

目标：

- 新版 admin-web/admin-api/admin-worker 可作为 staging 候选运行。
- 新旧入口不混淆。
- Docker 内路径、版本、健康检查可验证。

预计改动模块：

- `deploy/nas/mixlab/docker-compose.yml`
- `deploy/nas/mixlab/.env.example`
- `docker/admin-runtime.Dockerfile`
- `docker/admin-web.Dockerfile`
- `.github/workflows/docker-admin.yml`
- `scripts/acceptance/admin-docker-candidate-contract-proof.ts`
- `scripts/acceptance/admin-docker-candidate-ref-proof.ts`
- `scripts/acceptance/admin-docker-release-readiness-summary.ts`
- `scripts/acceptance/admin-worker-env-proof.ts`

验收：

- `/health` 通过。
- `/api/admin/auth/status` 不是旧 API 404。
- `/api/admin/data-loading/plan` 可用。
- `/api/admin/release-gates` 可用。
- Docker 内 `MIXLAB_ADMIN_LIBRARY_ROOT=/data/PublicLibrary`。
- `MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=0` 默认。
- `MIXLAB_ENABLE_READY_PUBLISH_WORKER=0` 默认。
- 候选 release ref 固定到已 smoke 的 commit，tag-ref `push_images=false` dry-run 通过。

### Phase 5: Cutter 不受影响验收

目标：

- 新 Docker MVP 启动和受控预处理不会影响 Cutter 日常使用。

验收：

- Docker MVP 前后 ready count 均为 `10471`。
- Docker MVP 前后 current index 均为 `v010471`。
- Cutter 公共素材首屏可用。
- Cutter 搜索可用。
- Cutter 详情可用。
- Cutter 真实剪切 smoke 可用。
- Cutter 登录/剪辑师准入符合预期。

当前进展：

- 已新增 `plan:admin-cutter-staged-proof`，生成 staged-candidate Cutter proof 的计划产物，不直接运行 Windows Runner，也不触碰 NAS/Docker/Cutter runtime。
- 当前 plan artifact `docs/acceptance/artifacts/admin-cutter-staged-proof-plan-20260628T224949Z.json` 已准备好候选 `b945418df2a447fd39bb9c88f781322594fc11c0` 的 `windows_acceptance`、`real_cut_smoke`、可选 `desktop_ui_screenshot_smoke` 命令模板，并把最终验证收口到 `npm run validate:admin-cutter-compatibility-proof`。
- `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T212539Z.json` 已把该 staged plan 记入 sources/observations；这只清理“证明步骤是否准备好”的追踪缺口，不清理最终 `cutter-proof-accepted` 门禁。
- 该计划只证明 Phase 5 的执行步骤已收束；真正的 Phase 5 通过仍需要 staged Admin Docker candidate 实际运行后生成 Windows Runner 报告，并验证 ready `10471` 与 current index `v010471` 未漂移。

### Phase 6: MVP 后中长期架构继续

MVP v0.1 通过后再进入：

- v0.2：受控发布 canary。
- v0.3：scan-preview/scan-apply 完整化。
- v0.4：read model 全面化和慢列表深度优化。
- v0.5：页面信息架构精修。
- v0.6：冗余代码删除和旧路由清理。
- v1.0：正式替换旧 NAS 管理端入口。

## 第一批实施目标

第一批只做 Phase 1 的最小可验证切片：

1. 新增 MVP mode contract。
2. 前端隐藏或禁用非 MVP 高风险入口。
3. 后端对 L4/L5 命令加 MVP blocked gate。
4. 保留登录、剪辑师、预处理只读和受控预处理入口。
5. 补充测试，证明 UI 漏出也不能越过后端 gate。

第一批不做 Docker 上传，不跑真实 NAS 写操作，不启动真实 worker。

### 第一批当前进展

2026-06-28 当前 Phase 1 已完成一个后端安全门禁切片：

- `admin-route-adapter` 新增统一 Docker MVP command blocked route envelope，把 `admin_mvp_command_blocked` 映射为稳定 `409`。
- `library/init`、`library/scan-apply`、`index/repair`、`settings` source folder mutation、`source-videos` metadata/publish/transition、command snapshot restore 均已接入该映射。
- `preprocess` supervisor start/stop 与 bulk queue/retry/recover routes 已接入同一映射；保留受控预处理入口，但确保底层 MVP gate 被触发时不会被包装成 `400 invalid_request`。
- 被 MVP gate 阻断时不会清理 source-video page cache，不会把阻断误报为成功写入。
- 已补充对应 route-level 单元测试，覆盖 UI 漏出或旧入口误触发时后端仍返回明确 blocked。
- Admin Web MVP 导航、隐藏 route fallback 和 control disposition 已有 contract test 覆盖；MVP mode 下只显示总览、素材库、预处理、剪辑师、系统检查。
- 本切片仍不是完整 MVP：Docker staging、真实 NAS returned evidence、admin-worker 默认关闭 proof、Cutter staged-candidate compatibility proof 仍需继续完成。
- 2026-06-28 追加修正：pre-staging handoff 已将 post-staging proofs 从 staging execution blockers 中拆出，避免“没 staging 无法拿 proof、没 proof 又不许 staging”的循环阻断；这些 proof 仍然阻断 Docker deploy/final review。

当前本地验证：

- `node --test --import tsx packages/admin-api/src/admin-library-command-routes.test.ts packages/admin-api/src/admin-index-command-routes.test.ts packages/admin-api/src/admin-settings-command-routes.test.ts packages/admin-api/src/admin-source-video-command-routes.test.ts packages/admin-api/src/admin-command-restore-routes.test.ts packages/admin-api/src/admin-preprocess-command-routes.test.ts apps/admin-web/src/features/admin-ui-contract.test.ts`：`53` 项通过。
- `npm run typecheck`：通过。
- 已对本轮 NAS 密码特征做本地残留检查：无输出，确认本轮报告和仓库文件未写入 NAS 密码。具体凭据搜索模式不写入文档。
- 曾误跑 `npm test -- --runInBand ...`，项目 test script 忽略参数后执行全量测试，其中两个既有 `packages/cutter-api/src/index.test.ts` 用例失败；该失败不属于本轮 admin route gate 改动，后续应单独回到 Cutter 测试夹具/期望值排查。

## 通过标准

MVP v0.1 只有在以下全部满足时才算完成：

- 管理端登录可用。
- 剪辑师管理可用。
- 预处理可在受控模式下处理非 ready 素材。
- ready 素材不被误改。
- current index 不变。
- Cutter smoke 通过。
- Docker health/version/path/gate 通过。
- 高风险命令默认禁用或隐藏。
- worker 默认不自动写生产库。
- 回滚路径明确。

## 回滚策略

- Docker staging 不替换旧入口前，回滚为停止 staging 容器。
- 若替换旧入口，必须保留旧镜像 tag、旧 compose/env、旧端口记录。
- 任何涉及用户存储、usage-events、index、admin-read-model 的上线前必须有只读备份清单。
- MVP v0.1 不修改 Cutter release/index，因此 Cutter 回滚应不需要发布索引回退。

## 专业角色审评

Project Architect 结论：

- 通过。该计划没有缩小长期 `Admin Architecture v1`，而是把当前目标收敛成可上线、可验证的核心架构 MVP。
- 风险控制正确：预处理被保留，但放入受控模式；发布、扫描、恢复、索引修复被推迟。

Delivery Lead 结论：

- 通过但有约束。第一批只能做 MVP surface/gate，不允许 NAS 写入、Docker 上传、worker 启动、Cutter 协议变更。
- 每个后续阶段必须保留 before/after ready count、current index、Cutter smoke 证据。
