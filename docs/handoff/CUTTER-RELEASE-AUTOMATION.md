# Cutter 发布自动化（安装包 + update.json）

## 标准顺序

1. Windows 构建最终安装包并给出 sha256/大小；
2. Mac 或发布脚本执行：

```bash
node scripts/dev/publish-cutter-release.mjs \
  --version 0.18.28 \
  --installer-path "/path/MixLab Cutter_0.18.28_x64-setup-<commit>.exe" \
  --notes-file docs/handoff/RELEASE-0.18.28.md \
  --dist-root "/Volumes/MixLab/安装包/MixLab Cutter" \
  --commit <commit>
```

3. 脚本会：
- 把安装包复制到版本目录 `<dist-root>/<version>/`；
- 在分发根目录复制一份同名安装包（Phase 1 updater 从 update.json 同目录按 basename 解析）；
- 写版本目录 `SHA256SUMS.txt`；
- 写根目录 `update.json`（字段 `installer`、sha256、size_bytes、release_notes）；
- **不修改 LATEST**。
4. Windows 做升级/更新闭环验收；
5. Mac 复核 sha、update.json、安装包；
6. 人工更新 `LATEST.txt` / `LATEST-CUTTER.txt`；
7. 归档证据、发布记录。

## 约束

- 安装包必须和 update.json 同目录（根目录副本）；
- update.json 不允许 BOM（脚本写无 BOM UTF-8）；
- 更新清单字段使用 `installer`，不是 `installer_path`；
- 未通过 Mac 复核前不要提升 LATEST。

## 相关脚本

- `scripts/dev/publish-cutter-release.mjs`：安装包落盘 + SHA256SUMS + update.json；
- `scripts/dev/write-cutter-update-manifest.mjs`：只写 update.json（已有安装包时使用）。
