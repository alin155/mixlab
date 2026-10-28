# 状态报告格式（脚本自动生成，不要改字段名）

`scripts/dev/sync-report.mjs` 生成 Markdown，必须包含：

```markdown
# <role> 状态报告

- generated_at: ISO 时间
- role: mac | windows
- host: 主机名
- branch: dev/admin | dev/cutter
- head: 完整 commit
- head_subject: 提交标题
- dirty_tracked / dirty_untracked: 数字
- node_version / platform / arch
- shared_packages: 每个共享包目录的 sha256
- shared_vs_admin: SAME | DIFF | unknown
- peer_branch: 对方分支
- notes: 人工补充（可选）

## 自检结果（人工补充）

- typecheck: PASS/FAIL（日志路径）
- tests: 通过数/失败数（日志路径）
- blockers: ...
- next: ...
```

人工汇报给用户的固定块（Windows 每次结束时输出）：

```
=== SYNC-RESULT ===
role: windows
branch: dev/cutter
head: <sha> (<subject>)
pushed: yes/no
shared_vs_admin: SAME/DIFF
typecheck: PASS/FAIL
cutter_tests: <pass>/<total>
blockers: ...
next: ...
report_path: docs/handoff/status/windows-latest.md
=== END SYNC-RESULT ===
```
