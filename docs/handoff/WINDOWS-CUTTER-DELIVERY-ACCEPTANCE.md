# Windows 剪辑端交付验收报告（C/A/B/D 阶段）

> 范围：Windows（dev/cutter）剪辑端「安装/交付 → 队列 UX → 搜索体验 → 缓存治理」四个阶段的验收记录。
> 证据来源：Windows DSH 自动回报（Git Mailbox）+ Mac 侧独立复核（代码抽查/smoke 本地复跑/文件 hash）。
> 生成时间：2026-10-29（北京时间）｜分支：dev/cutter @ f5b3021 系列提交（未合并 main）。

## 1. 结论

**C、A、B、D 四个阶段验收通过**；剪辑端全量测试 545/545 PASS、typecheck PASS、smoke status=passed；NSIS 安装包已重建并记录 sha256。D5（治理审计）与 A2 真 pause/resume/delete 契约明确留待后续批次。

## 2. 阶段验收摘要

| 阶段 | 交付 | 关键证据 |
|---|---|---|
| C 安装/交付 | 干净环境安装→首启→配置→登录→检索/剪切/导出→退出→卸载→重装/升级→恢复；修复 sidecar 退出回收、卸载残留（HKCU/cache） | 545/545 测试；NSIS 安装/卸载/升级实测；`C:\dev\mixlab-verify-nsis`（evidence.log/api-evidence.json/uninstall-reinstall-residue.json/截图） |
| A 队列 UX | A1：素材检索浮动栏「加入待剪清单」+ 任务页「待剪清单/剪切任务」标签切换（拖拽排序、上移下移、localStorage 顺序、按 order 入队）；A2：批量取消（可重试）/隐藏（可恢复）与准确文案 | Playwright A1/A2 11/11；`C:\dev\mixlab-verify-a1a2`（截图 + JSON） |
| B 搜索体验 | B1 失败重试/加载分层；B2 命中定位/上下一个/跨段选择/无滚动跳动（11/11）；B3 修复「继续加载中」误用 + 无限分页（终止态/去重，2000 命中 40 页 5/5）；B4 真实 searchd kill 后回退 sqlite-index（5/5） | `C:\dev\mixlab-verify-b`（b1b2-ui-verify.json、b3-large-pagination-evidence.json、b4-real-degradation.json、截图） |
| D 缓存治理 | D1 前端二次确认/保护项；D1b 磁盘缓存 inventory/clean（±5% 实测、token/expected/并发/越界）；D2 本地素材 integrity/clean + **fail-safe**（引用索引损坏→degraded/409/UI 禁用）+ 磁盘告警；D3 工作区残留三类识别/白名单清理/启动提示；D4 release cache pins/evict + **跨进程文件锁**（evict 与 sync 互斥） | `C:\dev\mixlab-verify-d`（D1b 服务级 20/20、D2/D3/D4 UI 各 6/6、d34-ui-verify.json、截图）；`d2-failsafe-tests.log`、`release-lock-tests.log` |

## 3. 测试与产物

- typecheck PASS
- 剪辑端全量 **545/545 PASS**（cutter-api 133、cutter-local 50、ffmpeg-core 27、desktop-runtime 8、windows-test-runner 19、cutter-web 301、cutter-desktop 7）
- smoke：`node --import tsx scripts/smoke/cutter-api-web.ts` → `status=passed`
- NSIS 最终安装包：`MixLab Cutter_0.18.10_x64-setup.exe`（56.2MB）
  sha256：`0EC5E323EA23FB8C98CDDEAEFA1CCA44879E9877A0730E4504CE13DB1F46A28B`

## 4. 独立复核（Mac 侧）

- 代码抽查：D2 fail-safe 错误码/服务端拒绝/HTTP 测试/UI 警告四处存在；D4 锁文件与 release_cache_busy 用例存在。
- Mac 本地 smoke（随 Mac 侧 scripts/smoke 修复）曾复跑 `status=passed`；Windows 实机 smoke 亦 passed。
- 共享包 hash：contracts/library-format/service-clients/protocol 与 dev/admin 一致（Windows 状态报告 shared_vs_admin=SAME）。

## 5. 残余风险与后续

1. **D5 治理操作记录/审计**：deferred（可选，下一批轻量实现）。
2. **A2 真 pause/resume/delete**：当前语义为「取消可重试/本机隐藏可恢复」；真接口需契约变更（`POST /cutter/cut-jobs/{id}/pause|resume`、DELETE 等），下一批由 Mac 审批契约后实现。
3. **B 补充验证**：真实 2000+ 素材 searchd 索引压测、UI 降级截图（演示用）未做；当前为大分页纯函数/服务级证据。
4. **D4 锁边界**：只覆盖经 cutter-api 的路径；外部工具/旧 sidecar 若直接写同一 cache_root 且不遵守锁仍可能并发（单进程部署下实际不可触发）。
5. **安装包**：未做代码签名；升级/回滚策略需在发布流程中补充。
6. 分支状态：改动在 `dev/cutter`（未合并 main）；主分支收敛需按 Phase B/C 发布列车流程执行。

## 6. 复现命令（Windows）

```powershell
git fetch origin
git switch dev/cutter
git pull --rebase origin dev/cutter
npm install
npm run typecheck
$files = git ls-files "packages/*/src/*.test.ts" "apps/*/src/*.test.ts" "scripts/acceptance/*.test.ts"
node --test --import tsx $files
node --import tsx scripts/smoke/cutter-api-web.ts
npm run package:cutter-desktop:windows
```
