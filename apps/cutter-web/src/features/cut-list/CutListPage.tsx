import { useState, type DragEvent } from "react";
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

/**
 * Resolve the table row a drag event points at. Row identity stays in the DOM
 * row order (the table renders rows in the same order as the sorted list), so
 * drag & drop does not need per-row data attributes on shared foundation rows.
 */
function dropTargetIndexFromEvent(event: DragEvent<HTMLDivElement>): number | undefined {
  const target = event.target;
  if (!(target instanceof Element)) {
    return undefined;
  }

  const row = target.closest("tr");
  const body = row?.parentElement;
  if (!row || !body || body.tagName !== "TBODY") {
    return undefined;
  }

  const index = Array.from(body.children).indexOf(row);
  return index >= 0 ? index : undefined;
}

export function CutListPage({
  items,
  onMove,
  onReorder,
  onRemove,
  onClear,
  onSubmit
}: {
  items: readonly CutListItem[];
  onMove?: (cutListItemId: string, direction: "up" | "down") => void;
  onReorder?: (cutListItemId: string, targetIndex: number) => void;
  onRemove?: (cutListItemId: string) => void;
  onClear?: () => void;
  onSubmit?: () => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  // Keep render order and drag indexes tied to the persisted order field.
  const sortedItems = [...items].sort((left, right) => left.order - right.order);

  function clearDragState() {
    setDraggingId(null);
    setDropIndex(null);
  }

  const columns: Array<TableColumn<CutListItem>> = [
    {
      id: "order",
      header: "顺序",
      width: 72,
      render: (item, index) => (
        <span className="cutter-cut-list-order-cell ml-toolbar-list">
          <span
            className="cutter-cut-list-drag-handle"
            draggable
            title="拖拽调整顺序"
            aria-label={`拖拽调整顺序：${item.source_title} 第 ${index + 1} 项`}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", item.cut_list_item_id);
              setDraggingId(item.cut_list_item_id);
            }}
            onDragEnd={clearDragState}
          >
            ⠿
          </span>
          <span className="cutter-cut-list-order-value">{index + 1}</span>
        </span>
      )
    },
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
      render: (item, index) => (
        <span className="cutter-row-actions ml-toolbar-list">
          <Button
            type="button"
            disabled={index === 0}
            onClick={() => onMove?.(item.cut_list_item_id, "up")}
            size="sm"
            variant="ghost"
          >
            上移
          </Button>
          <Button
            type="button"
            disabled={index === sortedItems.length - 1}
            onClick={() => onMove?.(item.cut_list_item_id, "down")}
            size="sm"
            variant="ghost"
          >
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

        <div
          className={`cutter-cut-list-sort${draggingId ? " is-dragging" : ""}${dropIndex !== null ? " is-drop-target" : ""}`}
          data-dragging={draggingId ?? undefined}
          data-drop-index={dropIndex ?? undefined}
          onDragOver={(event) => {
            if (!draggingId) {
              return;
            }

            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            const index = dropTargetIndexFromEvent(event);
            if (index !== undefined) {
              setDropIndex(index);
            }
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setDropIndex(null);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            const index = dropTargetIndexFromEvent(event);
            if (draggingId && index !== undefined) {
              onReorder?.(draggingId, index);
            }
            clearDragState();
          }}
        >
          <Table
            columns={columns}
            rows={sortedItems}
            getRowKey={(item) => item.cut_list_item_id}
            stickyHeader
          />
        </div>
      </div>

      <InspectorPanel title="提交设置" className="ml-inspector--workbench ml-workbench-inspector">
        <div className="ml-detail-stack">
          <strong>{sortedItems.length} 个待剪片段</strong>
          <span>默认模式为极速剪切，可在每条任务上覆盖。</span>
          <span>拖拽行或使用上移/下移调整顺序，提交后按此顺序进入剪切队列。</span>
        </div>
      </InspectorPanel>
    </section>
  );
}
