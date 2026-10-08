# Windows 候选安装验收器

此目录保存本轮验收的确切脚本及报告，仅用于 `acecfd4` 候选包。共享交付目录为 `/Users/huaqihang/Public/MixLabWindowsBuilds/unified-cutter/candidate-acecfd4`；不更新正式下载指针。

构建：从仓库根目录执行 `./node_modules/.bin/pkg docs/acceptance/unified-cutter/windows-probe-kit/launcher.cjs --targets node20-win-x64 --no-bytecode --public --public-packages '*' --output <候选交付目录>/UnifiedNativeStartupProbe.exe`，并把两个 PowerShell 脚本放在同一目录。目录内需包含本轮 `installer.json` 和匹配安装包。

通过 Windows Runner `POST /runs` 的 `launch_app_probe`，指定该 EXE 的 UNC `app_path`、`force_launch=true`、`skip_api_probe=true`。验收安装包先经 SHA-256 校验，再复制到本机临时目录，仅安装到候选目录；引擎退出测试使用独立状态和随机端口。测试过程中不读取或写入生产公共库，不调用第三方服务，不终止旧剪辑端。

最终结果以 `native-startup.json` 为准。`runner-launch.json` 仅记录验收器启动；`launcher-result.json` 记录测试脚本进程，二者都不能替代产品检查结果。`native-diagnostic.json` 是安装前的测试通道诊断，空的解析错误列表和不存在的候选目录证明第一次脚本启动未执行安装。
