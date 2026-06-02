# MixLab 迁移敏感配置模板

> 这个文件只能作为模板提交到 Git。不要把真实密码、密钥、Token 写进本文件。
> 新设备上建议复制为 `.codex-context/PRIVATE-SECRETS.md` 或保存到密码管理器中。

## GitHub

- GitHub 用户名：`<your-github-username>`
- 仓库地址：`https://github.com/alin155/mixlab.git`
- GitHub Token：`<不要写入仓库>`
- 推荐用途：
  - `git clone` 公共仓库通常不需要 Token。
  - `git push` 需要新设备执行 `gh auth login` 或配置 GitHub 凭据。

## NAS

- NAS 局域网管理地址：`http://<NAS_IP>:9999/desktop/#/`
- NAS 管理员账号：`<nas-admin-username>`
- NAS 管理员密码：`<不要写入仓库>`
- NAS Docker 管理端访问入口：`http://<NAS_IP>:18080`
- NAS SMB 共享目录：
  - macOS Finder：`smb://<NAS_IP>/MixLab`
  - Windows 文件资源管理器：`\\<NAS_IP>\MixLab`
- 公共素材库目录：
  - NAS 共享目录：`MixLab/PublicLibrary`
  - macOS 挂载后常见路径：`/Volumes/MixLab/PublicLibrary`
  - Docker 容器内路径：`/data/PublicLibrary`

## 阿里云百炼 / DashScope

- API Key 名称：`DASHSCOPE_API_KEY`
- API Key 值：`<不要写入仓库>`
- 用途：管理端预处理阶段的语音识别。
- 配置位置：
  - NAS Docker Compose `.env`
  - 或管理端设置页中的百炼密钥配置入口，具体以当前版本 UI 为准。

## 剪辑端本机配置

### macOS Web 调试

```bash
MIXLAB_CUTTER_LIBRARY_ROOT="/Volumes/MixLab/PublicLibrary"
MIXLAB_CUTTER_WORKSPACE_ROOT="$HOME/Movies/MixLabLocal"
MIXLAB_CUTTER_API_HOST="127.0.0.1"
MIXLAB_CUTTER_API_PORT="3789"
```

### Windows 桌面端

- 公共素材库：`\\<NAS_IP>\MixLab`
- 本地工作区：建议选择本机用户目录下的 `MixLabLocal` 或桌面测试目录。
- Doctor 通过条件：
  - 公共素材库目录可读。
  - `source-videos`、`.mixlab-library`、`current.json` 可访问。
  - 本地工作区可写。
  - FFmpeg 可用。

## 安全规则

- 不把真实密码、API Key、Token 提交到 Git。
- 不把 `.codex-context/PRIVATE-SECRETS.md` 提交到 Git。
- 如果临时把真实密钥发给 Codex 协助排查，用完后应考虑轮换密钥。
- public 仓库里只能保存模板、路径约定、配置说明，不能保存真实凭据。
