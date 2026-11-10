# MixLab Cutter 应用修复工具（Windows）任务书

- 状态：待 Windows 端实现
- 发起：Mac / 2026-11-09
- 背景版本：Cutter 0.18.28
- 性质：独立 Windows 小应用，不并入 Cutter 主程序，不随 Cutter 版本发布

## 1. 为什么做

0.18.28 升级后，有剪辑师反馈重启后一直停在：

> 正在读取剪辑师工作台数据

初步判断是本机引擎 / Cutter API / searchd 启动或响应卡住。原排查要求剪辑师看日志、执行 PowerShell、检查端口、手动回退，对剪辑师太复杂。

目标：**剪辑师只需双击一个应用、点一次“一键修复”**，其余由工具自动完成，并在失败时自动生成诊断包。

## 2. 产品形态

- 独立 Windows 桌面小工具，名称为：**MixLab Cutter 修复工具**
- 首选单文件可执行程序（.exe），无需安装、无需管理员权限、无控制台窗口；
- 如果使用 PowerShell 实现，必须用隐藏控制台的方式启动 WinForms 界面，剪辑师不应看到命令行；
- 主窗口固定尺寸，中文界面，最多三个按钮：
  - 主按钮：**一键修复**
  - 次按钮：**只导出诊断包**
  - 次按钮：**回退到 0.18.27**（需二次确认）
- 普通用户默认只看到“一键修复”；诊断/回退属于备用路径；
- 界面不使用技术词，尽量用“本机引擎”“启动服务”“诊断包”等可理解表述。

## 3. 一键修复流程

按以下顺序执行，每一步在界面上显示当前状态：

1. **定位 Cutter**
   - 正在运行的进程路径；
   - 注册表卸载项（HKCU/HKLM）中 DisplayName 为 MixLab Cutter 的 InstallLocation；
   - 常见路径：
     - `%LOCALAPPDATA%\Programs\MixLab Cutter\MixLab Cutter.exe`
     - `%ProgramFiles%\MixLab Cutter\MixLab Cutter.exe`
   - 找不到时提示“未找到 MixLab Cutter”，并生成诊断包；
2. **先保存日志**
   - 复制 `%APPDATA%\MixLab Cutter\logs` 到临时诊断目录；
   - 复制 `%APPDATA%\MixLab Cutter\cutter-desktop-config.json`（如存在）；
3. **结束残留进程**
   - 结束以下进程（含子进程树）：
     - `MixLab Cutter.exe`
     - `cutter-api-sidecar-x86_64-pc-windows-msvc.exe`
     - `mixlab-searchd-x86_64-pc-windows-msvc.exe`
   - 等待 3 秒；
   - 如果 3789/3790 仍被其他进程占用：
     - 记录占用 PID/进程名；
     - 只结束明确属于 MixLab 的进程；
     - 遇到未知进程不要强杀，在界面提示“端口被其他程序占用”并生成诊断；
4. **重启 Cutter**
   - 使用定位到的 Cutter 可执行文件启动；
   - 不传额外参数；
5. **等待恢复**
   - 最长等待 90 秒；
   - 每 2 秒检查一次：
     - Cutter 主进程存在；
     - `http://127.0.0.1:3789/health` 返回 200；
     - `http://127.0.0.1:3790/health` 返回 200；
   - 全部通过后，等待 5 秒再判定成功；
6. **结果**
   - 成功：显示“修复完成，请回到 MixLab Cutter 查看工作台是否已加载”，并提供“打开 Cutter”按钮（可选）；
   - 失败：显示“自动修复未完成”，自动生成诊断包；提示“诊断包已放到桌面/已上传到 NAS，请直接发给管理员”。

## 4. 诊断包

自动生成 zip，文件名：

```text
MixLab-Cutter-Diagnostics-<COMPUTERNAME>-<yyyyMMdd-HHmmss>.zip
```

保存位置：

1. 桌面；
2. 同时尝试复制到 NAS：
   ```text
   \\192.168.1.27\MixLab\CutterDiagnostics\<COMPUTERNAME>\
   ```
3. 如果 NAS 不可写，界面显示桌面路径，不阻塞修复流程。

zip 内容至少包含：

- `diagnostics.txt`：时间、电脑名、用户、Windows 版本、Cutter 路径/版本、进程/端口快照、health 结果、NAS/磁盘状态；
- `logs/`：Cutter 日志目录（存在多少收集多少）；
- `cutter-desktop-config.json`（如存在）；
- 可选：修复工具自己的操作日志。

禁止收集：

- 用户素材文件、项目内容、转写文本；
- 浏览器 cookie、密码、token；
- 配置中如含敏感值必须脱敏（例如 `session_token`、`password`、`token`）。

## 5. 回退到 0.18.27

- 二次确认后才执行；
- 先关闭 Cutter/残留进程；
- 安装包来源：
  ```text
  \\192.168.1.27\MixLab\安装包\MixLab Cutter\0.18.27\
  ```
- 打开对应安装包，由剪辑师完成安装（不要静默卸载/静默降级）；
- 回退完成后仍建议“导出诊断包”并上传。

## 6. 验收标准

必须在 Windows 真机用 0.18.28 验收，至少覆盖：

1. 正常打开 Cutter 时，“一键修复”不会破坏现有数据，最终状态正常；
2. 人为停止 sidecar/searchd 或制造端口占用，工具能清理并恢复；
3. 人为让 Cutter 启动失败，工具在 90 秒内结束等待、生成诊断包、界面不崩溃；
4. 诊断包可解压，包含日志和 diagnostics.txt，无敏感信息；
5. NAS 可写时自动上传成功；不可写时本地保存且界面有明确提示；
6. 不需要管理员权限；
7. 双击后无需命令行，剪辑师只看到窗口并点一次；
8. 截图：主界面、修复中、成功、失败/诊断包位置。

## 7. 交付物

- Windows 端在 `apps/cutter-desktop/repair-tool/` 下提交源码/构建脚本；
- 构建出的便携版目录/zip 放到 NAS：
  ```text
  \\192.168.1.27\MixLab\工具\MixLab Cutter 修复工具\
  ```
- 同目录放 `README.txt`：双击启动、失败时诊断包位置；
- 回复 Mac：产物文件名、sha256、大小、测试机、验收结果、截图路径。

## 8. 边界与纪律

- 不修改 Cutter 0.18.28 代码，不发布新 Cutter 版本；
- 不删除用户本地素材、项目或缓存；
- 不在工具里写死管理员密码/token；
- 不把诊断包上传到公网；
- 工具仅面向 Windows，Mac 端不实现；
- 先做“一键修复 + 诊断包”，回退按钮可第二阶段，但任务回复中必须说明是否已实现。
