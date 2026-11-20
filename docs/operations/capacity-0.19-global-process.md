# 0.19 跨进程全局容量 smoke（2026-11-20T09:28:48.968Z）

- 环境：{"platform":"darwin","arch":"arm64","node":"v26.0.0","clients":50,"global_slots":4,"hold_ms":300}（50 个独立 Node 进程争抢同一共享目录 slot，等价 50 剪辑师客户端）
- 全局容量：active 峰值 **4/4**，等待峰值 42，结束 active 0，残留 slot/queue 文件 0/0
- worker：50/50 成功，失败 0
- 资源：wall 5279ms，CPU user 230ms / sys 210ms
- 跨进程 smoke：**PASS**
- 发布门禁：**BLOCKED** —— 0.19 发布门禁未通过：需 Windows 构建机 + 真实 NAS 10 分钟 50 客户端压测报告并签字；0.18.34 不发布

> 真实门禁：Windows 构建机 + 真实 NAS 公共库共享目录、50 客户端、10 分钟搜索 + 50 剪切，搜索 p95<150ms、全局 active 峰值≤配置 slot、无租约泄漏、searchd 不重启循环，并由测试负责人签字。
