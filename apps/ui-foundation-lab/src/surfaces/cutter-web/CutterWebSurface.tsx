import { routeTo } from "../../app/routing";
import { currentProject, cutTasks, projects, selectedSource, sources, type CutTaskFixture, type SourceFixture, type Tone } from "../../domain/fixtures";
import { AppShell, Button, DataTable, EmptyState, FieldList, FloatingCutAction, InspectorPanel, MediaCard, MetricGrid, PageHeader, SearchBox, StatusBadge, Tabs, TranscriptPanel, WorkbenchCard } from "../../foundation/components";

const navItems = [
  { key: "project-home", label: "首页", icon: "⌂", href: routeTo("cutter-web", "project-home") },
  { key: "material-locator", label: "素材搜索", icon: "⌕", href: routeTo("cutter-web", "material-locator") },
  { key: "cut-tasks", label: "剪切任务", icon: "≋", href: routeTo("cutter-web", "cut-tasks") },
  { key: "local-library", label: "本地素材", icon: "□", href: routeTo("cutter-web", "local-library") },
  { key: "public-library", label: "公共素材库", icon: "▣", href: routeTo("cutter-web", "public-library") },
  { key: "cache-management", label: "缓存管理", icon: "☰", href: routeTo("cutter-web", "cache-management") },
  { key: "settings", label: "设置", icon: "⚙", href: routeTo("cutter-web", "settings") }
];

const stats = [
  { label: "当前项目", value: currentProject.name, tone: "accent" as Tone },
  { label: "素材库", value: "公共 7950 / 本地 117", tone: "success" as Tone },
  { label: "本机服务", value: "正常", tone: "success" as Tone }
];

export function CutterWebSurface({ page }: { page: string }) {
  return (
    <AppShell title="MixLab Cutter" subtitle="项目化素材剪切" navItems={navItems} activeKey={page} stats={stats} user={{ name: "Allen", meta: "缓存 27.6GB" }}>
      <div className="mf-surface">
        {renderCutterPage(page)}
      </div>
    </AppShell>
  );
}

function renderCutterPage(page: string) {
  if (page === "material-locator") return <MaterialLocatorPage />;
  if (page === "cut-tasks") return <CutTasksPage />;
  if (page === "local-library") return <LibraryPage local />;
  if (page === "public-library") return <LibraryPage />;
  if (page === "source-detail") return <SourceDetailPage />;
  if (page === "cache-management") return <CachePage />;
  if (page === "settings") return <SettingsPage />;
  return <ProjectHomePage />;
}

function ProjectHomePage() {
  return (
    <>
      <PageHeader
        eyebrow="Cutter / Project Home"
        title="选择项目，然后开始搜索素材"
        description="项目会归档搜索结果、剪切任务和本地素材。"
        actions={
          <>
            <SearchBox placeholder="如「6月4日-2」或搜索关键词" compact />
            <Button tone="secondary">新建项目</Button>
          </>
        }
      />
      <div className="mf-surface-scroll mf-project-layout">
        <WorkbenchCard>
          <div className="mf-section-title">
            <h2>最近项目</h2>
          </div>
          <div className="mf-project-grid">
            {projects.map((project, index) => (
              <MediaCard
                key={project.id}
                title={project.name}
                meta={`已剪 ${project.cuts} · 搜索 ${project.searches}`}
                image={project.cover}
                selected={index === 0}
                actions={index === 0 ? <ProjectActions /> : undefined}
              />
            ))}
          </div>
        </WorkbenchCard>
        <ProjectInspector />
      </div>
    </>
  );
}

function ProjectActions() {
  return (
    <div className="mf-project-cover-actions">
      <Button tone="primary">进入项目</Button>
      <Button tone="secondary">打开文件目录</Button>
    </div>
  );
}

function ProjectInspector() {
  return (
    <InspectorPanel title="项目详情" meta={currentProject.name} actions={<Button tone="ghost">⋯</Button>}>
      <MediaCard title={currentProject.name} meta="王牧笛 · 中国沈阳" image={currentProject.cover} />
      <FieldList
        rows={[
          { label: "项目名", value: currentProject.name },
          { label: "创建时间", value: currentProject.date },
          { label: "已剪片段", value: `${currentProject.cuts} 个` },
          { label: "素材规模", value: "本地 117 · 公共 7950" }
        ]}
      />
      <div className="mf-stack">
        <Button tone="primary">进入项目</Button>
        <Button tone="secondary">打开文件目录</Button>
        <Button tone="secondary">重命名</Button>
        <Button tone="danger">删除项目</Button>
      </div>
    </InspectorPanel>
  );
}

function MaterialLocatorPage() {
  return (
    <>
      <PageHeader
        title="素材搜索"
        actions={<SearchBox placeholder="搜索文案关键词或粘贴爆款文案" value="第一场公开课" />}
      />
      <div className="mf-surface-scroll mf-material-grid">
        <WorkbenchCard className="mf-material-column" padded={false}>
          <div className="mf-section-title">
            <h2>候选素材</h2>
            <span className="mf-subtle-text">已载入 17 条 · 命中 22 处</span>
          </div>
          <div className="mf-candidate-list">
            {sources.concat(sources).map((source, index) => (
              <MediaCard
                key={`${source.id}-${index}`}
                title={source.id}
                meta={`${source.words.toLocaleString()} 字　${source.duration} · 命中 ${source.hits}`}
                image={source.cover}
                selected={index === 0}
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
          <TranscriptPanel lines={selectedSource.transcript} selectedRange={[1, 2]} />
          <FloatingCutAction label="剪切这段" duration="已选 30 秒" />
        </WorkbenchCard>
        <div className="mf-stack">
          <InspectorPanel title="视频预览" meta={`${selectedSource.id} · ${selectedSource.duration}`}>
            <div className="mf-video-preview" style={{ backgroundImage: selectedSource.cover }} />
          </InspectorPanel>
          <InspectorPanel title="选区信息" meta="已选 30 秒">
            <p className="mf-selected-copy">2026 年我跟陶老师我们的第一场公开课，我们一起携手走过了这么多地方。</p>
          </InspectorPanel>
          <RecentTasksPanel />
        </div>
      </div>
    </>
  );
}

function CutTasksPage() {
  return (
    <>
      <PageHeader
        title="剪切任务"
        description={`${cutTasks.length} 个任务 · ${currentProject.name}`}
        actions={<Button tone="secondary">打开文件目录</Button>}
      />
      <div className="mf-surface-scroll mf-cutter-grid">
        <div className="mf-cutter-main">
          <Tabs
            activeKey="all"
            items={[
              { key: "all", label: "全部", count: cutTasks.length, href: routeTo("cutter-web", "cut-tasks") },
              { key: "waiting", label: "等待中", count: 1, href: routeTo("cutter-web", "cut-tasks") },
              { key: "cutting", label: "剪切中", count: 1, href: routeTo("cutter-web", "cut-tasks") },
              { key: "failed", label: "失败", count: 1, href: routeTo("cutter-web", "cut-tasks") },
              { key: "done", label: "已完成", count: 2, href: routeTo("cutter-web", "cut-tasks") }
            ]}
          />
          <WorkbenchCard>
            <div className="mf-section-title">
              <h2>本机剪切流水线</h2>
              <StatusBadge tone="success">空闲</StatusBadge>
            </div>
            <TaskTable />
          </WorkbenchCard>
        </div>
        <TaskInspector />
      </div>
    </>
  );
}

function TaskTable() {
  return (
    <DataTable<CutTaskFixture>
      rows={cutTasks}
      getKey={(row) => row.id}
      selectedKey="CJ-003"
      columns={[
        { key: "status", title: "状态", width: "14%", render: (row) => <StatusBadge tone={taskTone(row.status)}>{row.status}</StatusBadge> },
        { key: "source", title: "来源", width: "18%", render: (row) => <strong>{row.source}</strong> },
        { key: "range", title: "时间段", width: "18%", render: (row) => row.range },
        { key: "text", title: "选中文案", width: "30%", render: (row) => <span className="mf-one-line">{row.text}</span> },
        { key: "issue", title: "问题", width: "14%", render: (row) => <span className={`mf-issue-${taskTone(row.status)}`}>{row.issue}</span> },
        { key: "action", title: "操作", width: "6%", align: "center", render: (row) => row.status === "失败" ? <Button tone="danger">重试</Button> : <StatusBadge tone="success">✓</StatusBadge> }
      ]}
    />
  );
}

function TaskInspector() {
  const task = cutTasks[2];
  return (
    <InspectorPanel title="任务详情" meta={task.id}>
      <StatusBadge tone="danger">失败</StatusBadge>
      <FieldList
        rows={[
          { label: "来源素材", value: task.source },
          { label: "时间范围", value: task.range },
          { label: "剪切模式", value: task.mode },
          { label: "输出路径", value: "尚未生成" },
          { label: "错误摘要", value: task.issue }
        ]}
      />
      <Button tone="primary">重新剪切</Button>
    </InspectorPanel>
  );
}

function LibraryPage({ local = false }: { local?: boolean }) {
  const title = local ? "本地素材" : "公共素材库";
  const visible = local ? sources.slice(0, 3) : sources.concat(sources).slice(0, 6);
  return (
    <>
      <PageHeader
        eyebrow={local ? "Local Library" : "Public Library"}
        title={title}
        description={local ? "查看本机剪切生成的本地素材。" : "浏览管理端发布到剪辑端的原素材。"}
        actions={<Tabs activeKey="all" items={[{ key: "all", label: "全部", href: "#" }, { key: "landscape", label: "横版", href: "#" }, { key: "portrait", label: "竖版", href: "#" }]} />}
      />
      <div className="mf-surface-scroll mf-library-grid">
        <WorkbenchCard>
          <div className="mf-media-gallery">
            {visible.map((source, index) => (
              <MediaCard
                key={`${source.id}-${index}`}
                title={source.title}
                meta={`${source.duration} · ${source.resolution} · ${source.codec}`}
                image={source.cover}
                selected={index === 0}
                actions={<a href={routeTo("cutter-web", "source-detail")}>查看详情</a>}
              />
            ))}
          </div>
        </WorkbenchCard>
        <SourceInspector />
      </div>
    </>
  );
}

function SourceDetailPage() {
  return (
    <>
      <PageHeader title={selectedSource.title} description={`${selectedSource.id} · ${selectedSource.duration} · ${selectedSource.words.toLocaleString()} 字`} />
      <div className="mf-surface-scroll mf-library-grid">
        <WorkbenchCard className="mf-transcript-card">
          <TranscriptPanel lines={selectedSource.transcript} selectedRange={[1, 2]} />
        </WorkbenchCard>
        <SourceInspector />
      </div>
    </>
  );
}

function CachePage() {
  return (
    <>
      <PageHeader title="缓存管理" description="查看本机索引、缩略图、源视频缓存和剪切临时区。" actions={<Button tone="secondary">清理缓存</Button>} />
      <div className="mf-surface-scroll mf-stack">
        <MetricGrid
          metrics={[
            { label: "发布缓存", value: "1.2GB" },
            { label: "搜索索引", value: "420MB" },
            { label: "缩略图", value: "3.4GB" },
            { label: "源视频缓存", value: "27.6GB", tone: "processing" }
          ]}
        />
        <WorkbenchCard>
          <DataTable
            rows={[
              { type: "源视频", size: "27.6GB", count: "3 条", state: "可剪切" },
              { type: "缩略图", size: "3.4GB", count: "7950 条", state: "可浏览" },
              { type: "剪切临时区", size: "180MB", count: "2 项", state: "可清理" }
            ]}
            getKey={(row) => row.type}
            columns={[
              { key: "type", title: "类型", width: "30%", render: (row) => <strong>{row.type}</strong> },
              { key: "size", title: "大小", width: "24%", render: (row) => row.size },
              { key: "count", title: "数量", width: "24%", render: (row) => row.count },
              { key: "state", title: "状态", width: "22%", render: (row) => <StatusBadge tone="success">{row.state}</StatusBadge> }
            ]}
          />
        </WorkbenchCard>
      </div>
    </>
  );
}

function SettingsPage() {
  return (
    <>
      <PageHeader title="设置" description="管理本地工作区、默认剪切方式和显示密度。" />
      <div className="mf-surface-scroll mf-library-grid">
        <div className="mf-stack">
          <WorkbenchCard>
            <div className="mf-section-title"><h2>服务状态</h2><StatusBadge tone="success">可用</StatusBadge></div>
            <FieldList
              rows={[
                { label: "公共素材库", value: "\\\\192.168.1.27\\MixLab\\PublicLibrary" },
                { label: "本地工作区", value: "C:\\Users\\ASUS\\Videos\\MixLabLocal" },
                { label: "默认剪切", value: "极速剪切" },
                { label: "显示模式", value: "浅色" }
              ]}
            />
          </WorkbenchCard>
        </div>
        <InspectorPanel title="环境检查" meta="Windows">
          <FieldList
            rows={[
              { label: "公共素材库", value: <StatusBadge tone="success">可读取</StatusBadge> },
              { label: "本地工作区", value: <StatusBadge tone="success">可写入</StatusBadge> },
              { label: "剪切工具", value: <StatusBadge tone="success">可用</StatusBadge> }
            ]}
          />
        </InspectorPanel>
      </div>
    </>
  );
}

function RecentTasksPanel() {
  return (
    <InspectorPanel title="最近剪切任务" actions={<a href={routeTo("cutter-web", "cut-tasks")}>查看全部任务</a>}>
      <DataTable<CutTaskFixture>
        rows={cutTasks.slice(0, 5)}
        getKey={(row) => row.id}
        columns={[
          { key: "status", title: "状态", width: "24%", render: (row) => <StatusBadge tone={taskTone(row.status)}>{row.status}</StatusBadge> },
          { key: "source", title: "来源视频", width: "56%", render: (row) => row.source },
          { key: "duration", title: "时长", width: "20%", render: (row) => row.duration }
        ]}
      />
    </InspectorPanel>
  );
}

function SourceInspector() {
  return (
    <InspectorPanel title="原素材详情" meta={selectedSource.id}>
      <MediaCard title={selectedSource.title} meta={`${selectedSource.duration} · ${selectedSource.resolution}`} image={selectedSource.cover} />
      <FieldList
        rows={[
          { label: "状态", value: <StatusBadge tone={sourceTone(selectedSource.status)}>{selectedSource.status}</StatusBadge> },
          { label: "方向", value: selectedSource.orientation },
          { label: "文案", value: `${selectedSource.words.toLocaleString()} 字` },
          { label: "命中", value: `${selectedSource.hits} 处` }
        ]}
      />
    </InspectorPanel>
  );
}

function taskTone(status: CutTaskFixture["status"]): Tone {
  if (status === "已完成") return "success";
  if (status === "剪切中") return "processing";
  if (status === "失败") return "danger";
  return "warning";
}

function sourceTone(status: SourceFixture["status"]): Tone {
  if (status === "已发布") return "success";
  if (status === "处理中") return "processing";
  if (status === "失败") return "danger";
  return "warning";
}
