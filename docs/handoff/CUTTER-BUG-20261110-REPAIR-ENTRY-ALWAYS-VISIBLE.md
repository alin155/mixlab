# Cutter 0.18.31 P1：正常使用也显示修复入口浮层

- 发现时间：2026-11-10
- 版本：0.18.31
- 现象：工作台已正常加载后，右下角仍一直显示“无法加载？启动修复工具”浮层，遮挡/干扰正常使用。
- 已处置：Mac 已把 NAS 发布根回滚到 0.18.30，暂停 0.18.31 新用户升级。

## 根因

0.18.31 的 CutterApp：

- 计算了 repairEntry，但渲染时无条件插入：

  ```tsx
  {repairEntry}
  ```

- repairEntry 本身是 `isDesktopMode ? <RepairToolEntry .../> : null`；
- 没有根据“是否加载失败/是否正常 data 已加载”隐藏；
- 正常返回 workbench 的路径也渲染了它。

自动启动条件 `repairAutoEligible` 是正确的，但显示条件缺失。

## 修复要求

新增明确可见性：

```ts
const repairEntryVisible = isDesktopMode &&
  !loginGateVisible &&
  (desktopStage !== "ready" || !data);
```

并在所有渲染路径使用：

```tsx
{repairEntryVisible ? repairEntry : null}
```

要求：

1. 正常 data 已加载且 stage=ready：**任何页面都不显示浮层**；
2. 加载中（stage=ready, data=null）：显示；
3. 引擎启动中/Doctor 失败/首次初始化：显示；
4. 登录门禁：不显示；
5. 45 秒自动启动逻辑只在实际可见时生效；
6. data 加载成功后立即隐藏，并清除倒计时；
7. 修复入口隐藏后不能继续自动启动。

## 测试

- 正常 workbench 渲染：无 `cutter-repair-entry`；
- 加载中：有入口；
- 引擎启动中/Doctor 失败：有入口；
- 自动倒计时仅在可见时触发；
- data 从 null -> 有数据后入口消失、定时器清理；
- 0.18.31→0.18.32 真机正常使用 5 分钟无浮层；卡住时仍能出现。

## 发布

- 从 `release/0.18.31 @ 777160f9` 建 0.18.32；
- 先给 Mac 复核，再发布；
- 发布根恢复 0.18.30 状态，0.18.31 用户可更新到 0.18.32；
- 修复 0.18.31 的 UI 回归，不改修复工具逻辑。
