import { routeTo } from "../app/routing";
import { Button, PageHeader, WorkbenchCard } from "../foundation/components";

const groups = [
  {
    title: "管理端",
    description: "仪表盘、素材管理、预处理、账号和设置。",
    links: [
      ["仪表盘", routeTo("admin", "dashboard")],
      ["原视频", routeTo("admin", "source-videos")],
      ["设置", routeTo("admin", "settings")]
    ]
  },
  {
    title: "Web 剪辑端",
    description: "首页、素材搜索、剪切任务、素材库和缓存管理。",
    links: [
      ["首页", routeTo("cutter-web", "project-home")],
      ["素材搜索", routeTo("cutter-web", "material-locator")],
      ["剪切任务", routeTo("cutter-web", "cut-tasks")]
    ]
  },
  {
    title: "桌面剪辑端",
    description: "Windows 固定工作台、首启和核心剪辑流程。",
    links: [
      ["首启", routeTo("cutter-desktop", "first-run")],
      ["桌面首页", routeTo("cutter-desktop", "project-home")],
      ["桌面搜索", routeTo("cutter-desktop", "material-locator")]
    ]
  }
];

export function ComparisonHome() {
  return (
    <div className="mf-lab-home">
      <WorkbenchCard className="mf-lab-home-card">
        <PageHeader
          eyebrow="MixLab UI Foundation"
          title="三端 UI 对比入口"
          description="用统一组件层呈现三端页面，保留当前主要布局和工作流。"
        />
        <div className="mf-lab-home-grid">
          {groups.map((group) => (
            <article className="mf-lab-route-card" key={group.title}>
              <h2>{group.title}</h2>
              <p>{group.description}</p>
              <div>
                {group.links.map(([label, href]) => (
                  <a key={href} href={href}>
                    <Button tone="secondary">{label}</Button>
                  </a>
                ))}
              </div>
            </article>
          ))}
        </div>
      </WorkbenchCard>
    </div>
  );
}
