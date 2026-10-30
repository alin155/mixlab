import { useRef } from "react";
import { projectDisplayTitle, type CutterProject } from "../../state/cutter-projects.ts";
import type { CutterRoute } from "../../app/navigation.ts";
import { routeTitle } from "../../app/navigation.ts";

export interface CutterTopbarProps {
  route: CutterRoute;
  project?: CutterProject;
  projects: readonly CutterProject[];
  engineReady: boolean;
  onOpenProject?: (projectId: string) => void;
}

/**
 * Cutter workbench top bar (UI Phase 0).
 *
 * The scope label is intentionally explicit ("切换项目") so it reads as a
 * project switcher rather than an implicit global filter. Phase 0 only offers
 * recent projects; the global "all projects" scope is a Phase 1 concern.
 */
export function CutterTopbar({ route, project, projects, engineReady, onOpenProject }: CutterTopbarProps) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const projectTitle = project ? projectDisplayTitle(project) : "未选择项目";
  const recentProjects = projects.slice(0, 8);

  function closeMenu() {
    menuRef.current?.removeAttribute("open");
  }

  return (
    <header className="cutter-topbar" data-cutter-topbar="phase0">
      <nav className="cutter-topbar-breadcrumb" aria-label="当前位置">
        <span>工作台</span>
        <span className="cutter-topbar-breadcrumb-sep" aria-hidden="true">/</span>
        <strong>{routeTitle(route)}</strong>
      </nav>
      <details className="cutter-project-switch" ref={menuRef}>
        <summary className="cutter-project-switch-trigger" aria-label="切换项目">
          <span className="cutter-project-switch-kicker">切换项目</span>
          <strong className="cutter-project-switch-name">{projectTitle}</strong>
          <span className="cutter-project-switch-caret" aria-hidden="true">▾</span>
        </summary>
        <div className="cutter-project-switch-menu" role="menu">
          <div className="cutter-project-switch-heading">最近项目</div>
          {recentProjects.length > 0 ? (
            recentProjects.map((item) => {
              const active = item.project_id === project?.project_id;
              return (
                <button
                  aria-current={active ? "true" : undefined}
                  className={`cutter-project-switch-item${active ? " is-active" : ""}`}
                  key={item.project_id}
                  onClick={() => {
                    closeMenu();
                    onOpenProject?.(item.project_id);
                  }}
                  role="menuitem"
                  type="button"
                >
                  <span className="cutter-project-switch-item-main">
                    <strong>{projectDisplayTitle(item)}</strong>
                    <small>{item.source_title?.trim() || `${item.clip_count} 个已剪片段`}</small>
                  </span>
                  {active ? <span className="cutter-project-switch-current">当前</span> : null}
                </button>
              );
            })
          ) : (
            <p className="cutter-project-switch-empty">还没有项目，先在首页新建一个项目。</p>
          )}
          <div className="cutter-project-switch-footer">
            <a href="#/project-home" onClick={closeMenu}>回到项目首页</a>
          </div>
        </div>
      </details>
      <span className="cutter-topbar-spacer" />
      <span className={`cutter-topbar-service${engineReady ? " is-ready" : ""}`}>
        <span className="cutter-topbar-service-dot" aria-hidden="true" />
        {engineReady ? "本机服务正常" : "本机服务未就绪"}
      </span>
    </header>
  );
}
