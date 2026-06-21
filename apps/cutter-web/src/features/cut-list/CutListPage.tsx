import { Button, InspectorPanel, Table, type TableColumn } from "@mixlab/ui-foundation";
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
  const columns: Array<TableColumn<CutListItem>> = [
    { id: "order", header: "顺序", accessor: "order", width: 72 },
    { id: "source", header: "来源", accessor: "source_title" },
    {
      id: "time",
      header: "时间段",
      render: (item) => `${formatDuration(item.begin_ms)} - ${formatDuration(item.end_ms)}`
    },
    { id: "text", header: "选中文案", accessor: "selected_text", className: "ml-truncate-line" },
    { id: "mode", header: "模式", render: (item) => cutModeLabel(item.cut_mode), width: 112 },
    {
      id: "actions",
      header: "操作",
      width: 180,
      render: (item) => (
        <span className="cutter-row-actions ml-toolbar-list">
          <Button type="button" onClick={() => onMove?.(item.cut_list_item_id, "up")} size="sm" variant="ghost">
            上移
          </Button>
          <Button type="button" onClick={() => onMove?.(item.cut_list_item_id, "down")} size="sm" variant="ghost">
            下移
          </Button>
          <Button type="button" onClick={() => onRemove?.(item.cut_list_item_id)} size="sm" variant="danger">
            删除
          </Button>
        </span>
      )
    }
  ];

  return (
    <section className="cutter-page cutter-cut-list ml-workbench-page ml-workbench-page--fluid" data-page="cut-list">
      <div className="cutter-page-main ml-workbench-main ml-workbench-main--rows-list">
        <header className="cutter-page-header ml-workbench-header">
          <div>
            <p className="cutter-eyebrow ml-page-kicker">本地待处理</p>
            <h1 className="ml-page-title">待剪清单</h1>
            <p className="ml-page-description">连续文案片段在这里以一个任务保存，可排序后提交剪切队列。</p>
          </div>
          <div className="cutter-button-group ml-control-cluster">
            <Button type="button" onClick={onClear} variant="secondary">
              清空
            </Button>
            <Button type="button" onClick={onSubmit} variant="primary">
              提交剪切队列
            </Button>
          </div>
        </header>

        <Table
          columns={columns}
          rows={items}
          getRowKey={(item) => item.cut_list_item_id}
          stickyHeader
        />
      </div>

      <InspectorPanel title="提交设置" className="ml-inspector--workbench ml-workbench-inspector">
        <div className="ml-detail-stack">
          <strong>{items.length} 个待剪片段</strong>
          <span>默认模式为极速剪切，可在每条任务上覆盖。</span>
          <span>提交后进入本地剪切队列，不阻塞搜索和继续选段。</span>
        </div>
      </InspectorPanel>
    </section>
  );
}
