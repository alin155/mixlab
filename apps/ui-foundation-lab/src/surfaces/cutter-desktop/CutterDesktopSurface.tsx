import { routeTo } from "../../app/routing";
import { currentProject, cutTasks, projects, selectedSource, sources, type CutTaskFixture, type Tone } from "../../domain/fixtures";
import { AppShell, Button, DataTable, FieldList, FloatingCutAction, InspectorPanel, MediaCard, PageHeader, SearchBox, StatusBadge, TranscriptPanel, WorkbenchCard } from "../../foundation/components";

const navItems = [
  { key: "first-run", label: "首启检查", icon: "①", href: routeTo("cutter-desktop", "first-run") },
  { key: "project-home", label: "首页", icon: "⌂", href: routeTo("cutter-desktop", "project-home") },
  { key: "material-locator", label: "素材搜索", icon: "⌕", href: routeTo("cutter-desktop", "material-locator") },
  { key: "cut-tasks", label: "剪切任务", icon: "≋", href: routeTo("cutter-desktop", "cut-tasks") }
];

const stats = [
  { label: "当前项目", value: currentProject.name, tone: "accent" as Tone },
  { label: "缓存", value: "27.6GB", tone: "processing" as Tone },
  { label: "本机服务", value: "正常", tone: "success" as Tone }
];

export function CutterDesktopSurface({ page }: { page: string }) {
  return (
    <AppShell title="MixLab Cutter" subtitle="Windows 桌面版" navItems={navItems} activeKey={page} stats={stats} user={{ name: "Allen", meta: "Windows" }} variant="desktop">
      <div className="mf-desktop-workspace">
        <div className="mf-surface">
          {renderPage(page)}
        </div>
      </div>
    </AppShell>
  );
}

function renderPage(page: string) {
  if (page === "first-run") return <FirstRunPage />;
  if (page === "material-locator") return <DesktopMaterialPage />;
  if (page === "cut-tasks") return <DesktopTasksPage />;
  return <DesktopProjectPage />;
}

function FirstRunPage() {
  return (
    <>
      <PageHeader
        eyebrow="Windows EXE"
        title="Windows 桌面版首启"
        description="首次运行需要确认素材库、工作区、诊断和本机引擎。"
        actions={<Button tone="primary">运行 Doctor</Button>}
      />
      <div className="mf-surface-scroll mf-stack">
        <div className="mf-first-run-grid">
          {[
            ["1", "选择公共素材库", "\\\\192.168.1.27\\MixLab\\PublicLibrary"],
            ["2", "确认本地工作区", "C:\\Users\\ASUS\\Videos\\MixLabLocal"],
            ["3", "运行 Doctor", "检查路径、权限和 ready 素材"],
            ["4", "启动本机引擎", "固定监听 127.0.0.1:3789"]
          ].map(([index, title, value]) => (
            <WorkbenchCard className="mf-first-run-step" key={index}>
              <b>{index}</b>
              <strong>{title}</strong>
              <span className="mf-muted-text">{value}</span>
              <Button tone="secondary">{title}</Button>
            </WorkbenchCard>
          ))}
        </div>
        <WorkbenchCard>
          <div className="mf-section-title">
            <h2>诊断信息</h2>
            <StatusBadge tone="success">ready</StatusBadge>
          </div>
          <FieldList
            rows={[
              { label: "应用版本", value: "0.18.10" },
              { label: "API 地址", value: "http://127.0.0.1:3789" },
              { label: "日志目录", value: "AppData\\Roaming\\MixLab Cutter\\logs" },
              { label: "FFmpeg", value: "随安装包内置" }
            ]}
          />
        </WorkbenchCard>
      </div>
    </>
  );
}

function DesktopProjectPage() {
  return (
    <>
      <PageHeader
        eyebrow="Cutter / Project Home"
        title="选择项目，然后开始搜索素材"
        description="桌面端保持固定工作台，不做整页浏览器滚动。"
        actions={<SearchBox placeholder="如「6月4日-2」或搜索关键词" compact />}
      />
      <div className="mf-surface-scroll mf-project-layout">
        <WorkbenchCard>
          <div className="mf-project-grid">
            {projects.map((project, index) => (
              <MediaCard
                key={project.id}
                title={project.name}
                meta={`已剪 ${project.cuts} · 搜索 ${project.searches}`}
                image={project.cover}
                selected={index === 0}
                actions={index === 0 ? <Button tone="primary">进入项目</Button> : undefined}
              />
            ))}
          </div>
        </WorkbenchCard>
        <InspectorPanel title="项目详情" meta={currentProject.name}>
          <MediaCard title={currentProject.name} meta="王牧笛 · 中国沈阳" image={currentProject.cover} />
          <FieldList
            rows={[
              { label: "项目名", value: currentProject.name },
              { label: "已剪片段", value: `${currentProject.cuts} 个` },
              { label: "素材规模", value: "本地 117 · 公共 7950" }
            ]}
          />
          <Button tone="primary">进入项目</Button>
        </InspectorPanel>
      </div>
    </>
  );
}

function DesktopMaterialPage() {
  return (
    <>
      <PageHeader title="素材搜索" actions={<SearchBox placeholder="搜索文案关键词或粘贴爆款文案" value="第一场" />} />
      <div className="mf-surface-scroll mf-material-grid">
        <WorkbenchCard className="mf-material-column" padded={false}>
          <div className="mf-section-title">
            <h2>候选素材</h2>
            <span className="mf-subtle-text">命中 149 处</span>
          </div>
          <div className="mf-candidate-list">
            {sources.concat(sources).map((source, index) => (
              <MediaCard
                key={`${source.id}-${index}`}
                title={source.id}
                meta={`${source.words.toLocaleString()} 字　${source.duration} · 命中 ${source.hits}`}
                image={source.cover}
                selected={index === 1}
                compact
              />
            ))}
          </div>
        </WorkbenchCard>
        <WorkbenchCard className="mf-transcript-card" padded={false}>
          <div className="mf-section-title">
            <h2>视频文案</h2>
            <div>
              <Button tone="ghost">上一个</Button>
              <Button tone="ghost">下一个</Button>
            </div>
          </div>
          <TranscriptPanel lines={sources[1].transcript} selectedRange={[1, 3]} />
          <FloatingCutAction label="剪切这段" duration="已选 48 秒" />
        </WorkbenchCard>
        <div className="mf-stack">
          <InspectorPanel title="视频预览" meta="C0482 · 30:32">
            <div className="mf-video-preview" style={{ backgroundImage: sources[1].cover }} />
          </InspectorPanel>
          <InspectorPanel title="选区信息" meta="已选 48 秒">
            <p className="mf-selected-copy">我明年我明年第一场公开课是哪个城市啊？这个片段适合用于快速剪切。</p>
          </InspectorPanel>
        </div>
      </div>
    </>
  );
}

function DesktopTasksPage() {
  return (
    <>
      <PageHeader title="剪切任务" description={`${cutTasks.length} 个任务 · ${currentProject.name}`} actions={<Button tone="secondary">打开文件目录</Button>} />
      <div className="mf-surface-scroll mf-cutter-grid">
        <WorkbenchCard className="mf-cutter-main">
          <DataTable<CutTaskFixture>
            rows={cutTasks}
            getKey={(row) => row.id}
            selectedKey="CJ-004"
            columns={[
              { key: "status", title: "状态", width: "14%", render: (row) => <StatusBadge tone={taskTone(row.status)}>{row.status}</StatusBadge> },
              { key: "source", title: "来源", width: "18%", render: (row) => <strong>{row.source}</strong> },
              { key: "range", title: "时间段", width: "20%", render: (row) => row.range },
              { key: "text", title: "选中文案", width: "34%", render: (row) => <span className="mf-one-line">{row.text}</span> },
              { key: "issue", title: "问题", width: "14%", render: (row) => row.issue }
            ]}
          />
        </WorkbenchCard>
        <InspectorPanel title="任务详情" meta="CJ-004">
          <StatusBadge tone="processing">剪切中</StatusBadge>
          <FieldList
            rows={[
              { label: "来源素材", value: "C0510" },
              { label: "时间范围", value: "02:21 - 11:48" },
              { label: "剪切模式", value: "极速剪切" },
              { label: "问题", value: "准备源素材" }
            ]}
          />
        </InspectorPanel>
      </div>
    </>
  );
}

function taskTone(status: CutTaskFixture["status"]): Tone {
  if (status === "已完成") return "success";
  if (status === "剪切中") return "processing";
  if (status === "失败") return "danger";
  return "warning";
}
