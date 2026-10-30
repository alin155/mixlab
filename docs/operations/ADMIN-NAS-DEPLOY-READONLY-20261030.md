# Admin NAS 部署只读检查（2026-10-30）

> 模式：只读。未启动/停止容器，未推送/拉取镜像，未写 NAS 文件，未修改 .env/数据库。
> 执行：Mac，2026-10-30 07:50 UTC 前后。
> 目的：为独立 Admin 会话/维护窗口准备部署与回滚清单。

## 1. 结论

当前**不能进入维护窗口**：NAS 管理端 HTTP/Docker/SSH 入口从 Mac 不可达，无法核实容器、当前镜像、环境变量、数据库与回滚点。

同时，现有 Admin Docker 发布证据已过期：最新已接受 candidate 是 5a50922（2026-06-29），而当前 main 的 Admin 代码比它多 **27 个提交**（含 e6ca8a4 之后的修复）；直接部署旧 candidate 会漏掉当前修复。

## 2. 只读观测结果

| 项目 | 当前观测 | 判断 |
|---|---|---|
| SMB 挂载 | //Hqh@192.168.1.27/MixLab 可访问 | 正常 |
| NAS 容量 | 43 TiB 总，38 TiB 已用，5.2 TiB 可用，88% | 比旧记录 98% 改善；仍需 NAS 侧 block/inode proof |
| NAS 22 (SSH) | closed/unreachable | 无法进 shell |
| NAS 2375 (Docker TCP) | closed/unreachable | 无法直连 Docker API |
| NAS 8080 (admin-web 默认) | closed/unreachable | 管理端 Web 不可达 |
| NAS 9999 (UGOS 桌面) | closed/unreachable | 无法用桌面/UGOS 只读通道 |
| NAS 18080 (旧 admin 入口) | closed/unreachable | 旧入口也不可达 |
| 18080 /api/admin/library/status | HTTP 000（连接失败） | 无法核实 library/ready/index |
| 18080 /api/admin/dashboard/metrics | HTTP 000 | 无法核实 dashboard/磁盘 |
| SMB handoff | /Volumes/MixLab/安装包/mixlab-admin-docker-handoff/ 存在旧 kit | 可传输，但候选已过期 |
| SMB 镜像传输 | /Volumes/MixLab/docker-image-transfer/ 有 5a50922 的 runtime 镜像 tar | 可用于离线部署参考，但候选过旧 |

说明：端口 closed 是 Mac 侧观测，可能是 NAS Docker 项目停止、端口未暴露、网络/防火墙变化；需在 NAS 侧确认，不能仅凭此断言服务永久故障。

## 3. 代码/发布状态

- 当前 main 的 Admin 相关路径相对最新已接受 candidate 5a50922 多 27 个提交；
- e6ca8a4 是旧部署线记录（2026-08-13），e6ca8a4 之后 main 仍有 Admin 修复；
- 最新 release inputs 记录：
  - target_image_tag = 5a50922bc82f1b6728f247ed33e5885ab8cf6bef
  - current/rollback_image_tag = 9c015b9105e97954240020781f79daae3f954bde
  - release_inputs_ready=true，但 push_execution_allowed=false、docker_deploy_allowed=false；
- 最新 readiness summary 为 ready-for-release-decision（14/14 gates），但明确“仍需单独 release decision”，不代表允许上传/部署；
- 旧 handoff kit 的 candidate 是 4cb5b（更旧），不能用于本次。

## 4. 为什么不能直接开维护窗口

1. 无法读取 NAS 当前 Compose 项目、.env、镜像 tag、容器健康、DB 状态；
2. 无法确认当前可回滚镜像是否还在；
3. 无法做数据库/配置备份；
4. 没有 NAS 侧磁盘 block/inode proof，只有 SMB 容量；
5. 当前 candidate 不包含 main 最新 Admin 修复，部署它等于回退代码。

## 5. 建议顺序

### 阶段 A：恢复/确认 NAS 访问（只读）

- 在 NAS 侧确认 Docker 服务/Compose 项目状态；
- 恢复 18080/8080 或 SSH 22 / Docker 2375 中至少一条受控只读通道；
- 读取并脱敏记录：docker ps、image inspect、compose config、.env 白名单字段、磁盘 block/inode；
- 记录当前镜像 tag 作为 rollback 候选；
- 产出 returned evidence（脱敏）。

### 阶段 B：刷新 candidate

- 从当前 main 构建新的 Admin Docker candidate；
- 重新跑 local Docker smoke、candidate contract、worker env、Cutter compatibility；
- 生成新的 release inputs / readiness summary；
- 明确 target/current/rollback 三个 tag。

### 阶段 C：备份与维护窗口

- 备份数据库/配置/当前 .env（到 NAS 本地或独立位置，不提交密钥）；
- 保留当前镜像（回滚 tag）；
- 在维护窗口内只改 MIXLAB_IMAGE_TAG，执行 compose pull/up；
- 跑 DB 迁移与 Admin smoke（登录、用户、素材库、统计、预处理）；
- 观察 10~15 分钟，异常立即回滚旧 tag。

### 阶段 D：验收

- Admin Web 登录/用户列表/素材库/预处理/统计；
- Cutter 读取 release/index 不回归；
- 记录新 candidate/tag、备份位置、回滚验证、验收证据。

## 6. 独立会话交接提示

新会话第一句建议：

> 已有一份只读检查报告：docs/operations/ADMIN-NAS-DEPLOY-READONLY-20261030.md。请先复述当前阻塞：NAS Admin 端口不可达且 candidate 过期；只做只读，不要部署，等我确认访问/维护窗口。

## 7. 未执行

- 未启停容器、未拉取/推送镜像、未写 NAS、未改 .env、未做数据库迁移、未启动预处理。
