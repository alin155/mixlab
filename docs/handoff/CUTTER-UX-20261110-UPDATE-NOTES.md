# Cutter 更新说明可读性修复（0.18.30 候选）

- 发现时间：2026-11-10
- 现象：0.18.29 更新提示中，发布说明被压成一整段，Markdown 标题/列表/代码符号原样显示，版本号与大小挤在一起，排版差。
- 优先级：P2（不影响功能，但影响升级体验）

## 1. 当前实现

`apps/cutter-web/src/features/settings/SoftwareUpdateCard.tsx`：

```tsx
<strong>发现新版本 v{update.latest_version}</strong>
<span>大小 {formatUpdateSize(update.size_bytes)}</span>
{update.notes ? <p>{update.notes}</p> : null}
```

问题：

- `notes` 中的 Markdown 不解析，标题、列表、代码符号原样显示；
- `<p>` 默认不保留换行，所有内容挤成一段；
- 版本号与大小没有间距/层次；
- 长说明把“立即更新/稍后”按钮挤到很远或不明显。

## 2. 修复要求

### 2.1 说明内容

- 不要求解析任意 Markdown；把说明按**纯文本行**渲染：
  - 空行分段；
  - `- `、`* `、`1. ` 等列表行转成列表或带项目符号；
  - 去除 `#`、`**`、反引号等 Markdown 标记；
  - 不在界面显示原始标记。
- 增加标题：“更新说明”；
- 限制初始高度（例如 180px），超出可滚动或“展开全部/收起”；
- 按钮固定在可见区域，不被长说明挤走。

### 2.2 版本信息

- “发现新版本”与“大小”分成两行或两个 chip，增加间距；
- 显示版本号用粗体，大小用次要文本；
- 保持现有“稍后 / 立即更新”动作。

### 2.3 文案规范

- `update.json` 的 `release_notes` 改为**短纯文本**，不使用 Markdown 标题/代码块；
- 建议 3~6 行，最多 8 行；
- 详细 Markdown 继续保留在 `docs/handoff/RELEASE-*.md`，不直接塞进弹窗。

## 3. 测试

1. 长 notes（>8 行）能分段、限制高度、可展开/收起；
2. 短纯文本 notes 显示正常；
3. 版本号/大小不再挤在一起；
4. 下载/安装按钮始终可见；
5. 不影响现有检查更新/下载/安装流程和 153 个 cutter-app 测试。

## 4. 流程调整

以后发布时：

- `update.json.release_notes` 用 `docs/handoff/RELEASE-x.y.z-NOTES.txt`（短纯文本）；
- 详细 Markdown 只进 `docs/handoff/RELEASE-x.y.z.md`；
- 发布前在 Windows 真机检查更新弹窗截图。

## 5. 交付

- 修改 `SoftwareUpdateCard.tsx` + 相关 CSS；
- 补渲染测试/截图；
- 回复 Mac：commit、测试结果、0.18.30 候选包或说明是否随下个版本发布。
