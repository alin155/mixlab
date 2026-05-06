import { InspectorPanel, SourceTable } from "@mixlab/ui-foundation";
import { formatDuration } from "../../api.ts";
import type { CutListItem } from "../../state/cut-list.ts";

function cutModeLabel(mode: CutListItem["cut_mode"]): string {
  if (mode === "copy") {
    return "极速剪切";
  }

  if (mode === "precise") {
    return "精准剪切";
  }

  return "智能剪切";
}

export function CutListPage({
  items,
  onMove,
  onRemove,
  onClear,
  onSubmit
}: {
  items: readonly CutListItem[];
  onMove?: (cutListItemId: string, direction: "up" | "down") => void;
  onRemove?: (cutListItemId: string) => void;
  onClear?: () => void;
  onSubmit?: () => void;
}) {
  const rows = items.map((item) => [
    item.order,
    item.source_title,
    `${formatDuration(item.begin_ms)} - ${formatDuration(item.end_ms)}`,
    item.selected_text,
    cutModeLabel(item.cut_mode),
    <span className="cutter-row-actions">
      <button type="button" onClick={() => onMove?.(item.cut_list_item_id, "up")}>
        上移
      </button>
      <button type="button" onClick={() => onMove?.(item.cut_list_item_id, "down")}>
        下移
      </button>
      <button type="button" onClick={() => onRemove?.(item.cut_list_item_id)}>
        删除
      </button>
    </span>
  ]);

  return (
    <section className="cutter-page cutter-cut-list" data-page="cut-list">
      <div className="cutter-page-main">
        <header className="cutter-page-header">
          <div>
            <p className="cutter-eyebrow">本地待处理</p>
            <h1>待剪清单</h1>
            <p>连续文案片段在这里以一个任务保存，可排序后提交剪切队列。</p>
          </div>
          <div className="cutter-button-group">
            <button className="cutter-secondary-button" type="button" onClick={onClear}>
              清空
            </button>
            <button className="cutter-primary-button" type="button" onClick={onSubmit}>
              提交剪切队列
            </button>
          </div>
        </header>

        <SourceTable columns={["顺序", "来源", "时间段", "选中文案", "模式", "操作"]} rows={rows} />
      </div>

      <InspectorPanel title="提交设置">
        <div className="cutter-inspector-stack">
          <strong>{items.length} 个待剪片段</strong>
          <span>默认模式为极速剪切，可在每条任务上覆盖。</span>
          <span>提交后进入本地剪切队列，不阻塞搜索和继续选段。</span>
        </div>
      </InspectorPanel>
    </section>
  );
}
