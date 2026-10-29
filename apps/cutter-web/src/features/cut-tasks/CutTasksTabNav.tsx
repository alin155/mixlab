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
  const tabs: Array<{ key: CutTasksTab; label: string }> = [
    { key: "queue", label: "剪切任务" },
    { key: "cut-list", label: `待剪清单（${cutListCount}）` }
  ];

  return (
    <nav className="cutter-cut-tasks-tabs ml-toolbar-list" role="tablist" aria-label="剪切任务视图">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.key}
          className={`cutter-cut-tasks-tab${activeTab === tab.key ? " is-active" : ""}`}
          onClick={() => onSelectTab?.(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}