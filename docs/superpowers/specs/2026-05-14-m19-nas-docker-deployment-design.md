# M19 NAS Docker 化部署设计

## 背景

M18 已确定 Windows 桌面端首版只产出 `exe`，并保持网页端可继续使用。M19 进入管理端部署收口：把管理端服务放到 NAS 的 Docker 环境中运行，让公共素材库、原素材入库、预处理、发布索引都围绕 NAS 上的持久化共享目录工作。

用户当前 NAS 已具备 Docker 能力，公共素材库根目录已确认使用：

```text
共享文件夹/MixLab/PublicLibrary
```

Docker 容器内统一映射为：

```text
/data/PublicLibrary
```

## 已确认决策

1. NAS 端公共素材库根目录固定为 `共享文件夹/MixLab/PublicLibrary`。
2. 原始老师视频正式进入系统时放在 `PublicLibrary/source-videos/`。
3. `current.json`、索引、封面、字幕、转写结果等系统产物不手动创建，由 MixLab 生成。
4. 部署方式采用 NAS 图形界面优先的 Docker Compose 项目。
5. Docker 配置建议放在 `共享文件夹/docker/mixlab/`。
6. M19 首版包含管理端网页、管理端 API、预处理 worker、发布 ready worker。
7. 镜像由 GitHub Actions 构建并推送到 GHCR。
8. GHCR 镜像使用私有镜像。
9. NAS 预处理并发默认设为 `1`。
10. M19 不要求配置远程访问、DDNS 或外网入口。

## 产品目标

1. 管理端可以通过 NAS 局域网地址访问，例如 `http://NAS-IP:8080`。
2. 管理端 API 与网页同源访问，用户不需要单独记住 API 端口。
3. NAS 上的公共素材库目录是唯一真实数据源。
4. 原素材放入 `source-videos` 后，系统可以扫描、预处理、生成封面、发布索引。
5. Docker 重启、NAS 重启后，已生成的数据和索引不丢失。
6. Docker 配置和部署说明适合 NAS 图形界面操作。
7. 现有网页端开发模式、剪辑端网页、Windows 桌面端设计不被 Docker 化破坏。

## 非目标

M19 不做以下事情：

1. 不把 `cutter-api` 迁移到 NAS。
2. 不把 Windows 剪辑端本地剪切逻辑改成远程剪切。
3. 不实现外网远程访问、DDNS、HTTPS 证书和公网鉴权。
4. 不自动登录 NAS 或远程配置 NAS。
5. 不要求 NAS 本地编译源码。
6. 不把 DashScope API Key 写入镜像或仓库。
7. 不重构管理端业务流程。

## NAS 目录结构

建议 NAS 上维护两个根目录：

```text
共享文件夹/MixLab/PublicLibrary/
  source-videos/
  .mixlab-library/

共享文件夹/docker/mixlab/
  docker-compose.yml
  .env
```

`source-videos` 由用户放入原始视频。`.mixlab-library` 由系统创建并维护，包含视频 manifest、转写产物、封面、索引包和当前索引指针。

系统生成的当前索引指针实际路径为：

```text
PublicLibrary/.mixlab-library/indexes/source-transcript-index/current.json
```

用户不需要手动创建这个文件。空的手工 `current.json` 可能导致解析错误。

## 部署架构

M19 使用一个 Compose 项目，包含三个运行服务：

```text
admin-web
  -> Nginx 静态托管 admin-web dist
  -> 反向代理 /api/admin/* 到 admin-api:3889

admin-api
  -> Node 管理端 API
  -> 读写 /data/PublicLibrary

admin-worker
  -> 顺序循环执行 preprocess-library 和 publish-ready
  -> 读写 /data/PublicLibrary
```

服务关系：

```text
Browser
  -> http://NAS-IP:8080
  -> admin-web
  -> /api/admin/*
  -> admin-api:3889

admin-worker
  -> /data/PublicLibrary/source-videos
  -> /data/PublicLibrary/.mixlab-library
```

`admin-api` 和 `admin-worker` 使用同一个运行时镜像，避免维护两套 Node 镜像。`admin-web` 使用独立 Nginx 镜像，负责静态页面和反向代理。

## 镜像命名

GHCR 私有镜像建议命名为：

```text
ghcr.io/alin155/mixlab-admin-runtime:latest
ghcr.io/alin155/mixlab-admin-web:latest
```

GitHub Actions 同时推送不可变提交标签：

```text
ghcr.io/alin155/mixlab-admin-runtime:<git-sha>
ghcr.io/alin155/mixlab-admin-web:<git-sha>
```

NAS 首次部署使用 `latest`，需要回滚时可改用某个提交标签。

## 端口与访问

外部只暴露一个端口：

```text
8080 -> admin-web:80
```

`admin-api` 只在 Compose 内部网络开放：

```text
admin-api:3889
```

这样用户访问入口统一为：

```text
http://NAS-IP:8080
```

M19 不开放公网访问。若后续需要外网访问，应在单独阶段处理 HTTPS、登录态、访问控制和上传安全。

## 环境变量

NAS `.env` 文件保存部署参数，不能提交到 Git。

核心变量：

```text
PUBLIC_LIBRARY_HOST_PATH=<NAS 上 MixLab/PublicLibrary 的真实宿主机路径>
MIXLAB_ADMIN_LIBRARY_ROOT=/data/PublicLibrary
MIXLAB_PREPROCESS_LIBRARY_ROOT=/data/PublicLibrary
MIXLAB_ADMIN_API_HOST=0.0.0.0
MIXLAB_ADMIN_API_PORT=3889
MIXLAB_PREPROCESS_WORKER_LIMIT=1
MIXLAB_PREPROCESS_FILE_IDENTITY_MODE=stat
MIXLAB_PREPROCESS_AUDIO_MODE=mp3_16k_mono_64k
MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=1
MIXLAB_ENABLE_READY_PUBLISH_WORKER=1
MIXLAB_WORKER_POLL_INTERVAL_SECONDS=60
DASHSCOPE_API_KEY=<由用户在 NAS 环境变量中填写>
```

`PUBLIC_LIBRARY_HOST_PATH` 用于 Compose 绑定宿主机目录。NAS 图形界面如果支持卷选择器，优先通过卷选择器选择 `共享文件夹/MixLab/PublicLibrary`；如果必须填写路径，则使用 NAS 显示或复制出的真实 Linux 路径。

`DASHSCOPE_API_KEY` 只存在于 NAS 环境变量或 `.env` 中，不写入镜像、Compose 示例和仓库提交。

## Worker 策略

M19 不把预处理和发布 ready 做成两个并行重任务容器，而是使用一个 `admin-worker` 顺序循环：

1. 扫描 `source-videos`。
2. 执行一次 `worker:preprocess-library`。
3. 执行一次 `worker:publish-ready`。
4. 休眠 `MIXLAB_WORKER_POLL_INTERVAL_SECONDS`。
5. 重复执行。

这样可以避免 NAS 上同时跑音频抽取、ASR、封面生成和索引发布，降低 8GB 内存机器的资源峰值。

如果缺少 `DASHSCOPE_API_KEY`，`admin-web` 和 `admin-api` 仍应启动；`admin-worker` 应输出清晰错误或跳过预处理，不应导致整个 Compose 项目不可访问。

## GHCR 私有镜像拉取

NAS 拉取私有 GHCR 镜像需要一次性配置 GitHub 凭据。部署文档需要说明：

1. 在 GitHub 创建只读 Packages 权限的 token。
2. 在 NAS Container Manager 或 Docker 登录 `ghcr.io`。
3. 用户名使用 GitHub 账号 `alin155`。
4. 密码使用生成的 token。
5. Compose 更新时由 NAS 拉取最新镜像。

GitHub token 不写入仓库，不通过截图公开，不放进 Dockerfile。

## Windows 剪辑端边界

M19 不修改 Windows 剪辑端运行方式。Windows 剪辑端首版仍按 M18 设计独立运行。

后续 Windows 端读取 NAS 公共素材库有两条路线：

1. 通过 SMB 把 `共享文件夹/MixLab/PublicLibrary` 映射为 Windows 网络盘，再让本地 cutter 运行时读取该路径。
2. 后续阶段实现远程公共素材 API，让 Windows 剪辑端通过 HTTP 读取 NAS 管理端发布的 ready 素材。

M19 只保证 NAS 管理端和公共素材库部署稳定，不把这两条路线提前混入本阶段。

## 网页端兼容边界

Docker 化必须保持现有开发模式不变：

1. `npm run dev:admin-web` 不依赖 Docker。
2. `npm run server:admin-api` 不依赖 Docker。
3. `npm run dev:cutter-web` 不依赖 Docker。
4. 未设置 `VITE_MIXLAB_ADMIN_API_BASE_URL` 时，管理端网页仍可使用 fixture 模式。
5. Docker 构建管理端网页时使用相对 API base，例如 `.`，让 `/api/admin/*` 走同源反向代理。

Docker 文件只能作为新增部署入口，不能破坏本地开发和桌面端打包。

## 首次部署流程

NAS 图形界面优先流程：

1. 在 NAS 文件管理中建立 `共享文件夹/MixLab/PublicLibrary/source-videos`。
2. 在 NAS 文件管理中建立 `共享文件夹/docker/mixlab`。
3. 把 `docker-compose.yml` 和 `.env` 放入 `共享文件夹/docker/mixlab`。
4. 在 NAS Container Manager 中登录 GHCR 私有镜像。
5. 导入或创建 Compose 项目。
6. 绑定 `共享文件夹/MixLab/PublicLibrary` 到容器 `/data/PublicLibrary`。
7. 设置 `DASHSCOPE_API_KEY`。
8. 启动 Compose 项目。
9. 浏览器访问 `http://NAS-IP:8080`。
10. 管理端 Doctor 检查公共素材库、FFmpeg、索引状态。

命令行部署作为备用，不作为用户首选路径。

## 更新流程

1. 代码合并到 GitHub 主分支。
2. GitHub Actions 构建并推送新镜像。
3. NAS Container Manager 拉取最新镜像。
4. 重启 Compose 项目。
5. 管理端 Doctor 检查状态。

数据目录不随容器删除。更新容器不会删除 `PublicLibrary`。

## 回滚策略

如果更新后异常：

1. 停止 Compose 项目。
2. 把镜像 tag 从 `latest` 改回上一个可用的 `<git-sha>`。
3. 重新拉取并启动。
4. 保留 `PublicLibrary` 数据目录，不删除素材和 `.mixlab-library`。

如果 worker 导致异常，可以只停止 `admin-worker`，保留 `admin-web` 和 `admin-api` 供管理端查看状态。

## 权限与安全

1. Docker 容器需要对 `PublicLibrary` 有读写权限。
2. `source-videos` 需要允许新增、读取和移动文件。
3. `.mixlab-library` 需要允许系统创建目录和写入 JSON、SQLite、图片、字幕文件。
4. GHCR token 只用于拉取私有镜像。
5. DashScope Key 只通过 NAS 环境变量注入。
6. M19 不把服务暴露到公网。

## 验收标准

M19 通过以下验收：

1. GitHub Actions 能构建 `admin-runtime` 和 `admin-web` 镜像。
2. 镜像能推送到 GHCR 私有仓库。
3. NAS Compose 能拉取镜像并启动。
4. `http://NAS-IP:8080` 能打开管理端。
5. 管理端 API 能读取 `/data/PublicLibrary`。
6. Doctor 显示公共素材库路径可读写。
7. 放入 `source-videos` 的视频能被扫描。
8. worker 并发为 `1`。
9. 成功处理的视频生成封面、转写、字幕和索引。
10. `PublicLibrary/.mixlab-library/indexes/source-transcript-index/current.json` 由系统生成。
11. 重启容器后，管理端仍能读取已发布素材。
12. 本地开发脚本和剪辑端网页不受影响。

## 实现范围

实现阶段需要新增：

1. `Dockerfile.admin-runtime`。
2. `Dockerfile.admin-web`。
3. `nginx` 配置。
4. worker 循环启动脚本。
5. `docker-compose.yml` 示例。
6. `.env.example`。
7. GitHub Actions 镜像构建工作流。
8. NAS 图形界面部署文档。
9. 基础构建验证命令。

实现阶段不修改业务流程，除非为 Docker 启动入口补充必要的生产运行脚本。

## 风险

1. NAS 的真实 Linux 路径可能不是用户界面显示的共享路径。部署文档需要说明使用 NAS 的容器卷选择器，或让用户在 NAS UI 中复制真实路径。
2. 私有 GHCR 登录配置可能是用户首次操作，需要文档写得足够具体。
3. DashScope Key 缺失时，worker 无法完成真实预处理，但管理端应保持可访问。
4. 8GB NAS 不适合高并发预处理，默认并发必须保持 `1`。
5. 现有 worker 是命令式脚本，实现阶段需要补一个轻量循环入口，避免 Compose 服务执行一次后退出。

## 结论

M19 采用“NAS 图形界面优先 + Compose + GHCR 私有镜像”的部署方案。公共素材库根目录固定挂载到 `/data/PublicLibrary`，管理端网页和 API 由 Docker 承载，预处理与发布 ready 由单个顺序 worker 服务执行。该方案让 NAS 成为管理端与公共素材库中心，同时保持 Windows 剪辑端和现有网页开发模式不被破坏。
