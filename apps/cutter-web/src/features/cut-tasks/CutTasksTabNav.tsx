import type { CutTasksTab } from "./cut-tasks-tab.ts";

export function CutTasksTabNav({
  activeTab,
  cutListCount,
  onSelectTab
}: {
  activeTab: CutTasksTab;
  cutListCount: number;
  onSelectTab?: (tab: CutTasksTab) => void;
}) {
  const showingCutList = activeTab === "cut-list";

  return (
    <div className="cutter-cut-tasks-secondary-entry">
      <button
        type="button"
        className="cutter-cut-tasks-secondary-button"
        onClick={() => onSelectTab?.(showingCutList ? "queue" : "cut-list")}
      >
        {showingCutList ? "返回剪切任务" : `待剪清单（${cutListCount}）`}
      </button>
    </div>
  );
}
