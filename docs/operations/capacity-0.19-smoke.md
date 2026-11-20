# 0.19 并发容量压测（本地 smoke：2026-11-20T09:22:39.737Z）

- 环境：{"platform":"darwin","arch":"arm64","node":"v26.0.0","clients":50,"slots":2,"cut_jobs":50,"cut_duration_ms":80,"search_duration_ms":2000}
- 搜索：5208 次，p50 18ms / p95 25ms / p99 44ms，错误 0（目标 p95<150ms）
- 剪切：50/50 完成，失败 0；观测最大并发 slot 2/2，最大排队 50，结束 active_slots 0（无泄漏=true）
- 资源：wall 5232ms，CPU user 5193ms / sys 2317ms，RSS 97->414MB
- 本地 smoke：**PASS**
- 发布门禁：**BLOCKED** —— 0.19 发布门禁未通过：需 Windows 构建机 + 真实 NAS 10 分钟 50 客户端压测报告并签字；0.18.34 不发布

> 真实门禁命令：node --import tsx scripts/load/cutter-capacity-load.ts --clients=50 --search-ms=600000 --cut-jobs=50 --report=<报告路径>（Windows + 真实 NAS，需 0 错误、搜索 p95<150ms、无租约泄漏、searchd 不进入重启循环）。
