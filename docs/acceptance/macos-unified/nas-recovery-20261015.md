# NAS 检索阻塞与账号连接恢复验收

日期：2026-10-15；Mac 候选源代码 `93eb03d`，应用标识和本机工作区保持不变。

## 现场与原因

- 用户检索“房地产”后长时间显示读取中，随后显示未登录，相同账号密码无法再次登录。
- 当时 `/Volumes/MixLab` 未挂载，读取账号文件返回 ENOENT，原生日志记录 `ENOTCONN`、`EBADF`；NAS `18080` 管理 API 仍可访问。恢复 SMB 后曾再次出现服务端断开与自动重连。
- 20 条检索结果实际已经返回，界面还在等待首条素材完整文案。原请求统一等待 90 秒，超时被显示成本机引擎离线。
- 原生主线程采样停在 SQLite `Exec → COMMIT → unixDelete → unlink`，且当时 `/health` 也超过 5 秒未返回。基础剪辑默认统计记录器会同步更新 NAS 上的 `usage-metrics.sqlite`，使用 DELETE journal；异步函数不能避免其中的同步 SQLite 阻塞主线程。采样见 [main-thread-stack.txt](./nas-recovery-20261015/main-thread-stack.txt)。
- 原认证状态代码吞掉账号读取异常并返回未登录；账号库路径消失时，登录底层还可能把它视为空账号库。这些行为使连接故障表现为账号失效。

## 修改范围

- 账号库读取失败或超过 10 秒返回 `503 library_unavailable`，保留原本机登录凭证。重连后重新验证真实会话；真实禁用、重置密码和 Pro 降级仍立即生效，不提供离线放行。
- 同一会话复用未完成的账号检查，避免轮询不断创建阻塞的文件读取；前端状态轮询也不再重叠。
- 登录前检查已发布公共库；NAS 断开显示连接错误，真实错误密码仍返回 401。
- 文案检索/详情 GET 请求最多等待 20 秒，账号/状态请求最多 15 秒。响应体读取也受超时约束；超时保留已有检索结果，释放读取按钮。
- 统一客户端继续追加原有使用事件，但不在本机引擎同步更新 NAS SQLite 统计汇总。管理端按事件文件签名判断汇总过期，仍可重建完整统计。原管理端默认行为不变。

## 已验证

- 智能端 20/20 测试通过：[smart-tests.txt](./nas-recovery-20261015/smart-tests.txt)。包含真实 HTTP 认证、公共库消失后 503、原会话重连恢复、FIFO 阻塞读取超时、真实禁用与密码错误等。
- 统计模块 16/16 通过：[usage-tests.txt](./nas-recovery-20261015/usage-tests.txt)。验证客户端继续保留事件、不创建或改写 SQLite 汇总、管理端识别汇总过期。
- TypeScript 类型检查通过：[typecheck.txt](./nas-recovery-20261015/typecheck.txt)。Mac 应用重建及 `codesign --verify --deep --strict` 通过。
- 停止旧候选后恢复 SMB，真实账号库读取约 170ms。修复版启动后恢复同一 Pro 会话，读取 12,805 条发布素材。
- 在原生应用实际检索“房地产”：20 条匹配、首条完整文案与视频预览均显示，读取按钮恢复可用。随后在原生设置退出并使用原账号、原密码重新登录成功。
- 真实素材界面截图仅保存在本机 `/Users/huaqihang/Documents/Codex/captures/mixlab-real-estate-search-fixed-20261015.png`，不把完整私有文案上传到仓库。

## 交付与边界

当前应用路径：`/Users/huaqihang/Documents/Codex/deliveries/mixlab-macos/0.2.0/MixLab Unified Cutter Candidate.app`。原 `97b58c3` 应用保留在同目录 `rollback-97b58c3`；原 zip 保留。新包和校验信息为同目录 `artifact-nas-recovery-93eb03d.json`。

本次没有重置用户密码、修改账号级别、重建 NAS 素材、部署管理端或迁移 Windows。此次现场验证覆盖 NAS 连接、账号与检索/文案读取，不代表所有剪切与智能成片功能已完成真实素材验收；NAS 服务端关闭 SMB 连接的触发条件仍需独立观察，客户端修复不等于保证网络永不断开。
