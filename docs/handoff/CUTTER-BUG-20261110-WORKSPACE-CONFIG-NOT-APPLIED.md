# Cutter 0.18.28 P1：修改本地素材库地址后，导出仍使用旧目录

- 发现时间：2026-11-10
- 来源：用户反馈（剪辑师修改本地素材库地址到 D 盘，实际仍导出到默认 C 盘）
- 版本：0.18.28
- 优先级：P1（可能导致产出写到错误磁盘 / 用户误以为已切换）

## 1. 现象

剪辑师在设置页修改“本地素材库地址”：

```text
C:\...（默认）
  -> D:\...
```

保存后继续剪切/导出，实际输出仍在旧目录（C 盘）。

## 2. 代码路径

### 2.1 设置页只写配置，不重启引擎

`apps/cutter-web/src/app/CutterApp.tsx`：

```ts
const handleConfigureLocalWorkspace = async () => {
  ...
  const savedConfig = await writeDesktopConfig(nextConfig);
  setDesktopConfig(savedConfig);
  setWorkspaceConfigNotice("已保存本地素材库地址，重启 MixLab Cutter 后生效。");
};
```

这里只做了：

1. 写 `cutter-desktop-config.json`；
2. 更新前端 state；
3. 显示一行“重启后生效”。

没有：

- 重启本机 sidecar / Cutter API；
- 检查当前引擎实际使用的 workspace root；
- 阻止用户在旧引擎上继续剪切；
- 给用户一个“立即应用”的按钮。

### 2.2 引擎启动时才会读新配置

`apps/cutter-desktop/src-tauri/src/main.rs` 的 `desktop_start_engine` 会读取配置、比较旧 API 是否匹配；但设置页保存后没有调用它。

所以用户不重启应用时：

```text
配置 = D:\
运行中的 sidecar workspace = C:\
剪切输出 = C:\
```

这与反馈现象一致。

### 2.3 实际上引擎有真实 workspace 路径，但设置页没展示

Cutter API runtime status 已提供：

```ts
workspace_root_path: input.workspace_root ?? ""
```

设置页目前只显示配置里的 `local_workspace_root`，没有显示引擎实际路径，也没有对比。

## 3. 修复要求

目标：**用户改地址后，要么立即生效，要么明确阻止继续导出到旧目录；不能静默使用旧路径。**

### 3.1 保存后立即检查实际引擎路径

保存配置后：

- 调用 runtime status / health 读取 `workspace_root_path`；
- 与 `desktopConfig.local_workspace_root` 比较；
- 不一致时，进入“待应用”状态。

### 3.2 待应用状态

必须：

- 设置页显示：
  - 配置目录
  - 引擎当前目录
  - 状态：“新地址尚未应用到本机引擎”
- 明确提示：继续剪切会导出到旧目录；
- 在应用前禁止/警告新剪切与导出，不能静默 C 盘；
- 提供主操作：**立即应用（重启本机引擎）**。

### 3.3 立即应用

点击后：

1. 如果当前有 running/pending 剪切任务，先提示/等待，避免中断；
2. 调用现有的 `desktop_start_engine`（会检测旧 sidecar 配置不一致并重启）；
3. 等待新引擎 health 200；
4. 重新读取 runtime status，确认 `workspace_root_path` 已变为新地址；
5. 刷新工作台数据；
6. 成功后清除待应用状态。

### 3.4 启动时也检查

应用启动后如果配置目录与引擎实际目录不一致：

- 显示同一“待应用”状态；
- 不允许继续导出到旧目录；
- 给“立即应用”按钮。

### 3.5 文案

不要把“重启 MixLab Cutter 后生效”作为唯一方案。
优先一键应用；至少要让用户看到旧引擎路径和新配置路径，并阻止误导出。

## 4. 测试

1. 模拟当前引擎 workspace=C:\\，配置改为 D:\\；
2. 保存后 UI 显示待应用，不能无提示导出；
3. 点击立即应用后，sidecar 重启，runtime status 返回 D:\\；
4. 新建剪切任务的输出路径在 D:\\ 下；
5. 有 running 任务时点击应用，有确认/等待，不静默中断；
6. 启动时配置与实际不一致，能显示待应用；
7. 现有设置/剪切测试全部通过。

Windows 真机验收：

- 设置页从 C 盘改到 D 盘；
- 未应用前尝试导出，不能写到 C 盘；
- 点击立即应用后，引擎 workspace 变为 D 盘，导出到 D 盘；
- 重启应用后仍保持 D 盘，不回到默认 C 盘。

## 5. 交付

- 修 `apps/cutter-web/src/app/CutterApp.tsx` 和相关设置 UI；
- 必要时补 Tauri 命令/封装（复用 desktop_start_engine，不新增任意命令）；
- 补测试与真机证据；
- 回复 Mac，说明修复版本和是否进入 0.18.29。
